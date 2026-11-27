#!/usr/bin/env python3
"""
Treino da rede neural da Ânima (packages/core/src/anima/cerebro/rede.ts) na GPU.

    node scripts/anima-cerebro/rede.mjs exportar /tmp/anima-rede --por 2500
    scripts/anima-cerebro/.venv/bin/python scripts/anima-cerebro/rede.py /tmp/anima-rede
    node scripts/anima-cerebro/rede.mjs empacotar /tmp/anima-rede

Arquitetura (a mesma do TypeScript, operação por operação):
    token = média das linhas de embedding das suas características (hash)
    + posição aprendida → N camadas pré-LN (atenção multi-cabeça, FFN com GELU tanh)
    → LN final → [token global ; média dos outros tokens] → linear

Depois do treino:
    1. corte: só as K linhas de maior norma ficam; mais uma época com elas
    2. quantização por produto (k-médias na GPU, 4 números → 1 byte); a
       rede reaprende uma época por cima das linhas quantizadas
    3. int8 com escala por linha nas matrizes
    4. temperatura calibrada na validação
Grava rede.bin (o formato está descrito em rede.ts) e paridade.json (logits de
algumas frases, para o empacotar conferir que o TypeScript dá o mesmo).

Destilação (--professor): um modelo de frases multilíngue pré-treinado (só no
treino; nada dele vai para o app) diz o "significado" de cada frase, e a rede
aprende a pôr no mesmo lugar frases que querem dizer a mesma coisa. Com frases
naturais sem rótulo (rede.mjs exportar --extra, ex.: o Tatoeba em português),
ela aprende o sentido de palavras que a gramática nunca usou ("tô pregado" perto
de "tô cansado"). A cabeça que imita o professor vai junto para o app (int8): é
o "significado" de uma frase, usado pela memória por significado (vetorDaRede).

Paráfrases (para.bin, de parafrasear.mjs, geradas por um modelo de linguagem
local): entram no treino as que o professor põe perto do centro da própria
intenção (--margem-para, --limiar-para), repetidas --rep-para vezes; as
descartadas ficam em <pasta>/para-descartadas.txt para conferir.

Sem GPU também roda (mais devagar): usa CUDA se houver.
"""
import argparse
import json
import math
import os
import struct
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ------------------------------------------------------------------ dados

class Dados:
    def __init__(self, caminho):
        b = open(caminho, "rb").read()
        n = struct.unpack_from("<I", b, 0)[0]
        o = 4
        self.y = np.frombuffer(b, dtype="<u2", count=n, offset=o).astype(np.int64)
        o += 2 * n
        self.ntok = np.frombuffer(b, dtype=np.uint8, count=n, offset=o).astype(np.int64)
        o += n
        tot = int(self.ntok.sum())
        self.nfeat = np.frombuffer(b, dtype=np.uint8, count=tot, offset=o).astype(np.int64)
        o += tot
        o = (o + 3) & ~3
        self.ids = np.frombuffer(b, dtype="<u4", count=int(self.nfeat.sum()), offset=o).astype(np.int64)
        self.n = n
        self.tok_ini = np.concatenate([[0], np.cumsum(self.ntok)[:-1]])
        self.feat_ini = np.concatenate([[0], np.cumsum(self.nfeat)[:-1]])


def juntar(a, b, idx_b):
    """um Dados com todos os exemplos de `a` e os exemplos `idx_b` de `b` (na ordem dada; repetir vale)."""
    out = Dados.__new__(Dados)
    idx_b = np.asarray(idx_b, dtype=np.int64)
    ntok_b = b.ntok[idx_b]
    toks_b = faixas(b.tok_ini[idx_b], ntok_b)
    nfeat_b = b.nfeat[toks_b]
    ids_b = b.ids[faixas(b.feat_ini[toks_b], nfeat_b)]
    out.y = np.concatenate([a.y, b.y[idx_b]])
    out.ntok = np.concatenate([a.ntok, ntok_b])
    out.nfeat = np.concatenate([a.nfeat, nfeat_b])
    out.ids = np.concatenate([a.ids, ids_b])
    out.n = a.n + len(idx_b)
    out.tok_ini = np.concatenate([[0], np.cumsum(out.ntok)[:-1]])
    out.feat_ini = np.concatenate([[0], np.cumsum(out.nfeat)[:-1]])
    return out


def faixas(inis, lens):
    """concatena arange(ini, ini+len) de cada par."""
    if len(lens) == 0:
        return np.zeros(0, dtype=np.int64)
    tot = int(lens.sum())
    desl = np.repeat(inis - np.concatenate([[0], np.cumsum(lens)[:-1]]), lens)
    return desl + np.arange(tot)


def lote(d, idx, L, dev, gota=0.0, rng=None):
    """monta (ids, offsets das bolsas, amostra de cada token, posição de cada token, ntok, y)."""
    ntok = d.ntok[idx]
    toks = faixas(d.tok_ini[idx], ntok)
    amostra = np.repeat(np.arange(len(idx)), ntok)
    pos = np.arange(len(toks)) - np.repeat(np.concatenate([[0], np.cumsum(ntok)[:-1]]), ntok)
    if gota > 0:
        # tira tokens ao acaso (nunca o global) para a rede não depender de uma palavra só
        fica = (pos == 0) | (rng.random(len(toks)) >= gota)
        toks, amostra = toks[fica], amostra[fica]
        ntok = np.bincount(amostra, minlength=len(idx))
        pos = np.arange(len(toks)) - np.repeat(np.concatenate([[0], np.cumsum(ntok)[:-1]]), ntok)
    nf = d.nfeat[toks]
    feats = d.ids[faixas(d.feat_ini[toks], nf)]
    offs = np.concatenate([[0], np.cumsum(nf)[:-1]])
    t = lambda a: torch.from_numpy(np.ascontiguousarray(a)).to(dev)
    return t(feats), t(offs), t(amostra), t(pos), t(ntok), t(d.y[idx])


# ------------------------------------------------------------------ modelo

class Camada(nn.Module):
    def __init__(self, d, H, ffn, gota):
        super().__init__()
        self.H = H
        self.ln1 = nn.LayerNorm(d)
        self.qkv = nn.Linear(d, 3 * d)
        self.o = nn.Linear(d, d)
        self.ln2 = nn.LayerNorm(d)
        self.f1 = nn.Linear(d, ffn)
        self.f2 = nn.Linear(ffn, d)
        self.gota = nn.Dropout(gota)

    def forward(self, x, mask):
        B, L, d = x.shape
        H, dh = self.H, d // self.H
        q, k, v = self.qkv(self.ln1(x)).view(B, L, 3, H, dh).permute(2, 0, 3, 1, 4)
        s = (q @ k.transpose(-1, -2)) / math.sqrt(dh)
        s = s.masked_fill(~mask[:, None, None, :], float("-inf"))
        a = self.gota(torch.softmax(s, dim=-1)) @ v
        x = x + self.gota(self.o(a.transpose(1, 2).reshape(B, L, d)))
        x = x + self.gota(self.f2(F.gelu(self.f1(self.ln2(x)), approximate="tanh")))
        return x


class Rede(nn.Module):
    def __init__(self, buckets, d, L, H, ffn, camadas, classes, gota):
        super().__init__()
        self.d, self.L = d, L
        self.emb = nn.EmbeddingBag(buckets, d, mode="mean")
        nn.init.normal_(self.emb.weight, std=0.1)
        self.pos = nn.Parameter(torch.randn(L, d) * 0.02)
        self.camadas = nn.ModuleList([Camada(d, H, ffn, gota) for _ in range(camadas)])
        self.lnf = nn.LayerNorm(d)
        self.cls = nn.Linear(2 * d, classes)
        self.gota_emb = nn.Dropout(gota)
        self.proj = None

    def forward(self, feats, offs, amostra, pos, ntok, com_pool=False):
        B = int(ntok.shape[0])
        tv = self.emb(feats, offs)
        x = torch.zeros(B, self.L, self.d, device=tv.device, dtype=tv.dtype)
        x[amostra, pos] = tv
        mask = torch.arange(self.L, device=tv.device)[None, :] < ntok[:, None]
        x = self.gota_emb(x + self.pos[None]) * mask[..., None]
        for c in self.camadas:
            x = c(x, mask)
        h = self.lnf(x)
        g = h[:, 0]
        resto = mask.clone()
        resto[:, 0] = False
        n = resto.sum(1, keepdim=True).clamp(min=1)
        media = (h * resto[..., None]).sum(1) / n
        pool = torch.cat([g, media], dim=1)
        z = self.cls(pool)
        return (z, pool) if com_pool else z


# ------------------------------------------------------------------ treino

def avaliar(rede, d, L, dev, bs=2048):
    rede.eval()
    zs = []
    with torch.no_grad():
        for i in range(0, d.n, bs):
            idx = np.arange(i, min(d.n, i + bs))
            f, o, a, p, nt, y = lote(d, idx, L, dev)
            zs.append(rede(f, o, a, p, nt).float())
    rede.train()
    z = torch.cat(zs)
    y = torch.from_numpy(d.y).to(dev)
    return (z.argmax(1) == y).float().mean().item(), z, y


def epocas(rede, tr, va, re, args, dev, n_ep, lr, so=None, rotulo="treino"):
    params = [p for n, p in rede.named_parameters() if p.requires_grad and (so is None or so(n))]
    decai = [p for p in params if p.ndim >= 2 and p is not rede.emb.weight and p is not rede.pos]
    resto = [p for p in params if not (p.ndim >= 2 and p is not rede.emb.weight and p is not rede.pos)]
    opt = torch.optim.AdamW([{"params": decai, "weight_decay": 0.01}, {"params": resto, "weight_decay": 0.0}], lr=lr, betas=(0.9, 0.98))
    passos = n_ep * math.ceil(tr.n / args.lote)
    aquece = min(500, passos // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, aquece)) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / passos))))
    rng = np.random.default_rng(args.semente)
    prof = getattr(args, "prof", None)
    for ep in range(n_ep):
        t0 = time.time()
        ordem = rng.permutation(tr.n)
        tot = 0.0
        for i in range(0, tr.n, args.lote):
            idx = ordem[i : i + args.lote]
            f, o, a, p, nt, y = lote(tr, idx, args.L, dev, args.gota_token, rng)
            with torch.autocast(device_type=dev.type, dtype=torch.bfloat16, enabled=dev.type == "cuda"):
                z, pool = rede(f, o, a, p, nt, com_pool=True)
            perda = F.cross_entropy(z.float(), y, label_smoothing=0.05)
            if prof is not None:
                # o significado: a frase rotulada e uma frase natural sem rótulo
                alvo = prof["treino"][torch.from_numpy(idx).to(dev)]
                perda = perda + args.peso_prof * (1 - F.cosine_similarity(rede.proj(pool.float()), alvo, dim=1)).mean()
                ex = prof["extra"]
                if ex is not None:
                    ie = rng.integers(0, prof["dados"].n, size=args.lote // 2)
                    fe, oe, ae, pe, nte, _ = lote(prof["dados"], ie, args.L, dev, args.gota_token, rng)
                    with torch.autocast(device_type=dev.type, dtype=torch.bfloat16, enabled=dev.type == "cuda"):
                        ze, pe_ = rede(fe, oe, ae, pe, nte, com_pool=True)
                    ie_t = torch.from_numpy(ie).to(dev)
                    perda = perda + args.peso_prof * (1 - F.cosine_similarity(rede.proj(pe_.float()), ex[ie_t], dim=1)).mean()
                    if prof["py"] is not None:
                        yp = prof["py"][ie_t]
                        m = yp >= 0
                        if m.any():
                            perda = perda + args.peso_pseudo * F.cross_entropy(ze.float()[m], yp[m], label_smoothing=0.1)
            opt.zero_grad(set_to_none=True)
            perda.backward()
            if getattr(rede, "_mascara", None) is not None and rede.emb.weight.grad is not None:
                rede.emb.weight.grad.mul_(rede._mascara)
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            sched.step()
            tot += perda.item() * len(idx)
        av, _, _ = avaliar(rede, va, args.L, dev)
        ar, _, _ = avaliar(rede, re, args.L, dev)
        print(f"  {rotulo} {ep + 1}/{n_ep}: perda {tot / tr.n:.4f} · validação {av * 100:.2f}% · reais {ar * 100:.1f}% · {time.time() - t0:.0f} s", flush=True)


def professor(args, dev, extra):
    """os vetores de significado do professor para cada frase (em cache na pasta)."""
    nome = args.professor.replace("/", "_")
    def vetores(arq):
        cache = os.path.join(args.pasta, f"prof_{nome}_{arq}.npy")
        if os.path.exists(cache):
            return np.load(cache)
        from sentence_transformers import SentenceTransformer
        m = SentenceTransformer(args.professor, device=str(dev))
        if dev.type == "cuda":
            m = m.half()
        textos = open(os.path.join(args.pasta, f"{arq}.txt"), encoding="utf-8").read().split("\n")
        t0 = time.time()
        v = m.encode(textos, batch_size=512, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False).astype(np.float16)
        print(f"professor: {len(textos)} frases de {arq} em {time.time() - t0:.0f} s", flush=True)
        np.save(cache, v)
        return v
    t = torch.from_numpy(vetores("treino").astype(np.float32)).to(dev)
    e = torch.from_numpy(vetores("extra").astype(np.float32)).to(dev) if extra is not None else None
    # o centro de cada intenção no espaço do professor (só a gramática, que é limpa)
    tr_y = torch.from_numpy(args.tr_y).to(dev)
    C = int(tr_y.max().item()) + 1
    P = F.normalize(torch.zeros(C, t.shape[1], device=dev).index_add_(0, tr_y, t), dim=1)
    # paráfrases do modelo de linguagem (parafrasear.mjs): fica só a que cai perto do centro da PRÓPRIA
    # intenção (a primeira, ou quase empatada com a primeira e acima do limiar); o resto é rótulo errado
    pv, pk = None, None
    if args.para is not None:
        pv = torch.from_numpy(vetores("para").astype(np.float32)).to(dev)
        py_ = torch.from_numpy(args.para.y).to(dev)
        sims = pv @ P.T
        propria = sims.gather(1, py_[:, None]).squeeze(1)
        melhor = sims.max(1).values
        ok = (propria >= melhor - args.margem_para) & (propria >= args.limiar_para)
        pk = ok.nonzero().squeeze(1).cpu().numpy()
        rot = args.rotulos
        tx = open(os.path.join(args.pasta, "para.txt"), encoding="utf-8").read().split("\n")
        fora = (~ok).nonzero().squeeze(1).cpu().numpy()
        with open(os.path.join(args.pasta, "para-descartadas.txt"), "w", encoding="utf-8") as f:
            for i in fora[:3000]:
                f.write(f"{rot[int(args.para.y[i])]}\t→ {rot[int(sims[i].argmax())]}\t{tx[i]}\n")
        print(f"paráfrases: {len(pk)} de {args.para.n} passaram no filtro do professor (margem {args.margem_para}, limiar {args.limiar_para})", flush=True)
        # as aprovadas, para o modelo antigo aprender das mesmas (treinar.mjs --parafrases <pasta>/para-aprovadas.tsv)
        with open(os.path.join(args.pasta, "para-aprovadas.tsv"), "w", encoding="utf-8") as f:
            for i in pk:
                f.write(f"{rot[int(args.para.y[i])]}\t{tx[i]}\n")
    py = None
    if e is not None and args.pseudo > 0:
        # pseudo-rótulos: o centro de cada intenção no espaço do professor; frase natural perto
        # demais de um centro (e longe do segundo) vira exemplo daquela intenção
        py = torch.full((e.shape[0],), -1, dtype=torch.long, device=dev)
        for i in range(0, e.shape[0], 8192):
            sims = e[i : i + 8192] @ P.T
            v, k = sims.topk(2, dim=1)
            ok = (v[:, 0] >= args.pseudo) & (v[:, 0] - v[:, 1] >= args.margem)
            py[i : i + 8192] = torch.where(ok, k[:, 0], torch.full_like(k[:, 0], -1))
        aceitas = (py >= 0).nonzero().squeeze(1).cpu().numpy()
        textos = open(os.path.join(args.pasta, "extra.txt"), encoding="utf-8").read().split("\n")
        cont = np.bincount(py[py >= 0].cpu().numpy(), minlength=C)
        rot = args.rotulos
        print(f"pseudo-rótulos: {len(aceitas)} de {e.shape[0]} frases (limiar {args.pseudo}, margem {args.margem}); mais comuns: "
              + ", ".join(f"{rot[i]} {cont[i]}" for i in np.argsort(-cont)[:8]), flush=True)
        rng = np.random.default_rng(0)
        with open(os.path.join(args.pasta, "pseudo.txt"), "w", encoding="utf-8") as f:
            for i in rng.permutation(aceitas)[:3000]:
                f.write(f"{rot[int(py[i])]}\t{textos[i]}\n")
    return {"treino": t, "extra": e, "dados": extra, "py": py, "para": (pv, pk)}


def kmedias(X, K=256, it=20, semente=0):
    g = torch.Generator(device=X.device).manual_seed(semente)
    n = X.shape[0]
    K = min(K, n)
    C = X[torch.randperm(n, generator=g, device=X.device)[:K]].clone()
    for _ in range(it):
        a = torch.cdist(X, C).argmin(1)
        soma = torch.zeros_like(C).index_add_(0, a, X)
        cont = torch.bincount(a, minlength=K).float()
        vazio = cont == 0
        C = torch.where(vazio[:, None], X[torch.randint(0, n, (K,), generator=g, device=X.device)], soma / cont.clamp(min=1)[:, None])
    a = torch.cdist(X, C).argmin(1)
    if K < 256:
        C = torch.cat([C, torch.zeros(256 - K, C.shape[1], device=C.device)])
    return C, a


def int8(W):
    W = W.detach().float()
    esc = (W.abs().amax(1) / 127).clamp(min=1e-12)
    q = torch.round(W / esc[:, None]).clamp(-127, 127).to(torch.int8)
    return q, esc


def varint(idx):
    out = bytearray()
    prev = 0
    for v in idx:
        dlt = int(v) - prev
        prev = int(v)
        while True:
            b = dlt & 0x7F
            dlt >>= 7
            out.append(b | (0x80 if dlt else 0))
            if not dlt:
                break
    return bytes(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("--d", type=int, default=128)
    ap.add_argument("--cabecas", type=int, default=4)
    ap.add_argument("--ffn", type=int, default=256)
    ap.add_argument("--camadas", type=int, default=3)
    ap.add_argument("--epocas", type=int, default=8)
    ap.add_argument("--lote", type=int, default=512)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--gota", type=float, default=0.1)
    ap.add_argument("--gota-token", dest="gota_token", type=float, default=0.08)
    ap.add_argument("--corte", type=int, default=60000)
    ap.add_argument("--sub", type=int, default=4)
    ap.add_argument("--semente", type=int, default=1)
    ap.add_argument("--professor", default=None, help="ex.: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    ap.add_argument("--peso-prof", dest="peso_prof", type=float, default=1.0)
    ap.add_argument("--pseudo", type=float, default=0.0, help="limiar de semelhança para pseudo-rótulo (0 = desligado; ex.: 0.75)")
    ap.add_argument("--margem", type=float, default=0.08)
    ap.add_argument("--peso-pseudo", dest="peso_pseudo", type=float, default=0.5)
    ap.add_argument("--rep-para", dest="rep_para", type=int, default=4, help="quantas vezes cada paráfrase aprovada entra no treino")
    ap.add_argument("--margem-para", dest="margem_para", type=float, default=0.04)
    ap.add_argument("--limiar-para", dest="limiar_para", type=float, default=0.45)
    ap.add_argument("--sem-cabeca", dest="sem_cabeca", action="store_true", help="não grava a cabeça de significado (o app perde a memória por significado)")
    args = ap.parse_args()
    torch.manual_seed(args.semente)
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    meta = json.load(open(os.path.join(args.pasta, "meta.json")))
    args.L = meta["L"]
    tr = Dados(os.path.join(args.pasta, "treino.bin"))
    va = Dados(os.path.join(args.pasta, "val.bin"))
    re = Dados(os.path.join(args.pasta, "reais.bin"))
    C = len(meta["rotulos"])
    print(f"{tr.n} exemplos, {C} intenções, d={args.d}, {args.camadas} camadas × {args.cabecas} cabeças, ffn {args.ffn}, em {dev}", flush=True)
    rede = Rede(meta["buckets"], args.d, args.L, args.cabecas, args.ffn, args.camadas, C, args.gota).to(dev)
    rede._mascara = None
    args.prof = None
    extra = Dados(os.path.join(args.pasta, "extra.bin")) if os.path.exists(os.path.join(args.pasta, "extra.bin")) else None
    args.para = Dados(os.path.join(args.pasta, "para.bin")) if os.path.exists(os.path.join(args.pasta, "para.bin")) else None
    if args.professor:
        args.tr_y, args.rotulos = tr.y, meta["rotulos"]
        args.prof = professor(args, dev, extra)
        rede.proj = nn.Linear(2 * args.d, args.prof["treino"].shape[1]).to(dev)
        pv, pk = args.prof["para"]
        if pk is not None and len(pk):
            rep = np.tile(pk, args.rep_para)
            tr = juntar(tr, args.para, rep)
            args.prof["treino"] = torch.cat([args.prof["treino"], pv[torch.from_numpy(rep).to(dev)]])
            print(f"treino: {tr.n} exemplos com as paráfrases (×{args.rep_para})", flush=True)
    elif args.para is not None:
        tr = juntar(tr, args.para, np.tile(np.arange(args.para.n), args.rep_para))
        print(f"treino: {tr.n} exemplos com as paráfrases sem filtro (sem professor)", flush=True)

    # 1. treino
    epocas(rede, tr, va, re, args, dev, args.epocas, args.lr)

    # 2. corte das linhas
    W = rede.emb.weight.data
    usadas = np.bincount(tr.ids, minlength=meta["buckets"]) > 0
    if args.prof is not None and extra is not None:
        usadas |= np.bincount(extra.ids, minlength=meta["buckets"]) > 0
    norma = W.norm(dim=1).cpu().numpy()
    norma[~usadas] = -1
    ficam = np.sort(np.argsort(-norma)[: min(args.corte, int(usadas.sum()))])
    mascara = torch.zeros(meta["buckets"], 1, device=dev)
    mascara[torch.from_numpy(ficam).to(dev)] = 1
    W.mul_(mascara)
    rede._mascara = mascara
    print(f"corte: {len(ficam)} de {int(usadas.sum())} linhas usadas", flush=True)
    epocas(rede, tr, va, re, args, dev, 1, args.lr / 4, rotulo="depois do corte")

    # 3. quantização por produto das linhas que ficaram
    nsub = args.d // args.sub
    X = W[torch.from_numpy(ficam).to(dev)].float()
    cods = torch.zeros(len(ficam), nsub, dtype=torch.uint8, device=dev)
    cens = torch.zeros(nsub, 256, args.sub, device=dev)
    rec = torch.zeros_like(X)
    for s in range(nsub):
        parte = X[:, s * args.sub : (s + 1) * args.sub].contiguous()
        Cs, a = kmedias(parte, semente=s)
        cens[s] = Cs
        cods[:, s] = a.to(torch.uint8)
        rec[:, s * args.sub : (s + 1) * args.sub] = Cs[a]
    erro = ((rec - X).norm() / X.norm()).item()
    W.zero_()
    W[torch.from_numpy(ficam).to(dev)] = rec.to(W.dtype)
    rede.emb.weight.requires_grad_(False)
    print(f"quantização por produto: erro relativo {erro:.3f}", flush=True)
    epocas(rede, tr, va, re, args, dev, 1, args.lr / 8, so=lambda n: not n.startswith("emb."), rotulo="sobre as linhas quantizadas")

    # 4. int8 nas matrizes (a rede passa a usar exatamente o que vai para o app)
    mats = {}
    with torch.no_grad():
        for i, c in enumerate(rede.camadas):
            for nome, lin in (("Wqkv", c.qkv), ("Wo", c.o), ("W1", c.f1), ("W2", c.f2)):
                q, esc = int8(lin.weight)
                mats[f"c{i}.{nome}"] = (q, esc)
                lin.weight.copy_((q.float() * esc[:, None]).to(lin.weight.dtype))
        q, esc = int8(rede.cls.weight)
        mats["Wc"] = (q, esc)
        rede.cls.weight.copy_((q.float() * esc[:, None]).to(rede.cls.weight.dtype))
        if rede.proj is not None and not args.sem_cabeca:
            q, esc = int8(rede.proj.weight)
            mats["proj"] = (q, esc)
            rede.proj.weight.copy_((q.float() * esc[:, None]).to(rede.proj.weight.dtype))

    # 5. temperatura
    acc, z, y = avaliar(rede, va, args.L, dev)
    melhor, T = 1e9, 1.0
    for t in np.arange(0.4, 4.01, 0.05):
        nll = F.cross_entropy(z / float(t), y).item()
        if nll < melhor:
            melhor, T = nll, float(t)
    T = round(T, 2)
    ar, _, _ = avaliar(rede, re, args.L, dev)
    print(f"final: validação {acc * 100:.2f}% · reais {ar * 100:.1f}% · T={T}", flush=True)

    # 6. grava
    blocos, partes = [], []

    def f32(nome, t):
        a = t.detach().float().cpu().numpy().astype("<f4").ravel()
        blocos.append({"nome": nome, "tipo": "f32", "n": int(a.size), "bytes": int(a.nbytes)})
        partes.append(a.tobytes())

    def i8q(nome):
        q, esc = mats[nome]
        e = esc.cpu().numpy().astype("<f4")
        b = e.tobytes() + q.cpu().numpy().astype(np.int8).tobytes()
        blocos.append({"nome": nome, "tipo": "i8q", "n": int(q.numel()), "linhas": int(q.shape[0]), "bytes": len(b)})
        partes.append(b)

    vb = varint(ficam)
    blocos.append({"nome": "emb.idx", "tipo": "idx", "n": int(len(ficam)), "bytes": len(vb)})
    partes.append(vb)
    cb = cods.cpu().numpy().astype(np.uint8).tobytes()
    blocos.append({"nome": "emb.codigos", "tipo": "u8", "n": len(cb), "bytes": len(cb)})
    partes.append(cb)
    f32("emb.centroides", cens)
    f32("pos", rede.pos)
    for i, c in enumerate(rede.camadas):
        p = f"c{i}."
        f32(p + "ln1g", c.ln1.weight); f32(p + "ln1b", c.ln1.bias)
        i8q(p + "Wqkv"); f32(p + "bqkv", c.qkv.bias)
        i8q(p + "Wo"); f32(p + "bo", c.o.bias)
        f32(p + "ln2g", c.ln2.weight); f32(p + "ln2b", c.ln2.bias)
        i8q(p + "W1"); f32(p + "b1", c.f1.bias)
        i8q(p + "W2"); f32(p + "b2", c.f2.bias)
    f32("lnfg", rede.lnf.weight); f32("lnfb", rede.lnf.bias)
    i8q("Wc"); f32("bc", rede.cls.bias)
    if "proj" in mats:
        # a cabeça de significado: o app usa para a memória por significado (vetorDaRede)
        i8q("proj"); f32("bproj", rede.proj.bias)

    cab = json.dumps({"rotulos": meta["rotulos"], "buckets": meta["buckets"], "d": args.d, "L": args.L, "cabecas": args.cabecas, "ffn": args.ffn,
                      "camadas": args.camadas, "T": T, "sub": args.sub, "blocos": blocos}, ensure_ascii=False).encode("utf-8")
    out = bytearray(b"ANR1" + struct.pack("<I", len(cab)) + cab)
    for parte in partes:
        out += b"\0" * ((-len(out)) % 4)
        out += parte
    open(os.path.join(args.pasta, "rede.bin"), "wb").write(out)
    # paridade: logits (sem temperatura) das primeiras frases da validação
    par = [{"i": i, "z": [round(float(v), 5) for v in z[i].tolist()]} for i in range(0, min(va.n, 40 * 60), 60)]
    json.dump(par, open(os.path.join(args.pasta, "paridade.json"), "w"))
    print(f"gravado {os.path.join(args.pasta, 'rede.bin')} ({len(out) / 1024:.0f} KB)", flush=True)


if __name__ == "__main__":
    main()
