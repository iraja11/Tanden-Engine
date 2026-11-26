#!/usr/bin/env python3
"""
Treino do classificador da Ânima na GPU (PyTorch).

O Node gera o corpus já transformado em índices de características (o hash, a
normalização e o corretor ficam todos do lado do TypeScript, então não existe
diferença entre o que o modelo vê aqui e no app):

    node scripts/anima-cerebro/treinar.mjs exportar /tmp/anima --por 3000
    python3 scripts/anima-cerebro/treinar.py /tmp/anima --dim 64 --oculta 128 --epocas 30
    node scripts/anima-cerebro/treinar.mjs empacotar /tmp/anima

Arquitetura: EmbeddingBag (média) → [Linear + ReLU + Dropout] → Linear.
Sem a camada oculta (--oculta 0) é exatamente o fastText que o Node treina.
Grava pesos.json + E.f32, W.f32, b.f32 (e W1.f32, b1.f32) na mesma pasta.

Dica para ir além: aumentar --por no exportar, --dim 64/96 e --oculta 128/256;
o empacotar corta as linhas menos importantes e quantiza tudo para caber no app.
"""
import argparse
import json
import math
import os
import random

import torch
import torch.nn as nn


def ler(caminho):
    xs, ys = [], []
    with open(caminho) as f:
        for linha in f:
            if linha.strip():
                d = json.loads(linha)
                xs.append(d["f"])
                ys.append(d["y"])
    return xs, ys


def lote(xs, ys, idx, dev):
    feats, offs = [], []
    for i in idx:
        offs.append(len(feats))
        feats.extend(xs[i])
    return (
        torch.tensor(feats, dtype=torch.long, device=dev),
        torch.tensor(offs, dtype=torch.long, device=dev),
        torch.tensor([ys[i] for i in idx], dtype=torch.long, device=dev),
    )


class Anima(nn.Module):
    def __init__(self, buckets, dim, oculta, classes, dropout):
        super().__init__()
        # "mean" como no TypeScript: divide pela quantidade de características do texto
        self.emb = nn.EmbeddingBag(buckets, dim, mode="mean", sparse=True)
        nn.init.uniform_(self.emb.weight, -1.0 / dim, 1.0 / dim)
        self.oculta = oculta
        if oculta:
            self.fc1 = nn.Linear(dim, oculta)
            self.drop = nn.Dropout(dropout)
            self.out = nn.Linear(oculta, classes)
        else:
            self.out = nn.Linear(dim, classes)
            nn.init.zeros_(self.out.weight)
            nn.init.zeros_(self.out.bias)

    def forward(self, feats, offs):
        h = self.emb(feats, offs)
        if self.oculta:
            h = self.drop(torch.relu(self.fc1(h)))
        return self.out(h)


def acerto(modelo, xs, ys, dev, bs=2048):
    modelo.eval()
    ok = 0
    with torch.no_grad():
        for i in range(0, len(xs), bs):
            idx = list(range(i, min(i + bs, len(xs))))
            f, o, y = lote(xs, ys, idx, dev)
            ok += (modelo(f, o).argmax(1) == y).sum().item()
    modelo.train()
    return ok / max(1, len(xs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pasta")
    ap.add_argument("--dim", type=int, default=64)
    ap.add_argument("--oculta", type=int, default=128)
    ap.add_argument("--epocas", type=int, default=25)
    ap.add_argument("--lote", type=int, default=256)
    ap.add_argument("--lr", type=float, default=0.3, help="taxa do embedding (SGD esparso)")
    ap.add_argument("--lr-denso", type=float, default=2e-3, help="taxa das camadas densas (Adam)")
    ap.add_argument("--dropout", type=float, default=0.2)
    ap.add_argument("--semente", type=int, default=1)
    a = ap.parse_args()

    random.seed(a.semente)
    torch.manual_seed(a.semente)
    dev = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    meta = json.load(open(os.path.join(a.pasta, "meta.json")))
    xs, ys = ler(os.path.join(a.pasta, "treino.jsonl"))
    vx, vy = ler(os.path.join(a.pasta, "val.jsonl"))
    rx, ry = ler(os.path.join(a.pasta, "reais.jsonl")) if os.path.exists(os.path.join(a.pasta, "reais.jsonl")) else ([], [])
    C = len(meta["rotulos"])
    print(f"{len(xs)} exemplos, {C} intenções, dispositivo: {dev}")

    m = Anima(meta["buckets"], a.dim, a.oculta, C, a.dropout).to(dev)
    opt_emb = torch.optim.SGD(m.emb.parameters(), lr=a.lr)
    densos = [p for n, p in m.named_parameters() if not n.startswith("emb.")]
    opt_den = torch.optim.Adam(densos, lr=a.lr_denso)
    perda = nn.CrossEntropyLoss(label_smoothing=0.05)
    passos = a.epocas * math.ceil(len(xs) / a.lote)
    passo = 0
    melhor, melhor_estado = -1.0, None
    for ep in range(a.epocas):
        ordem = list(range(len(xs)))
        random.shuffle(ordem)
        for i in range(0, len(ordem), a.lote):
            frac = 1 - passo / passos
            for g in opt_emb.param_groups:
                g["lr"] = a.lr * frac
            f, o, y = lote(xs, ys, ordem[i:i + a.lote], dev)
            opt_emb.zero_grad()
            opt_den.zero_grad()
            l = perda(m(f, o), y)
            l.backward()
            opt_emb.step()
            opt_den.step()
            passo += 1
        va = acerto(m, vx, vy, dev)
        re = acerto(m, rx, ry, dev) if rx else float("nan")
        print(f"época {ep + 1}/{a.epocas}: perda {l.item():.4f} · validação {va * 100:.2f}% · frases reais {re * 100:.1f}%")
        nota = va + (re if rx else 0)
        if nota > melhor:
            melhor = nota
            melhor_estado = {k: v.detach().clone() for k, v in m.state_dict().items()}

    m.load_state_dict(melhor_estado)
    m.eval()

    def grava(nome, t):
        t.detach().float().cpu().contiguous().numpy().tofile(os.path.join(a.pasta, nome))

    grava("E.f32", m.emb.weight)
    if a.oculta:
        # PyTorch guarda Linear como [saída, entrada], igual ao W1[j * dim + k] do TypeScript
        grava("W1.f32", m.fc1.weight)
        grava("b1.f32", m.fc1.bias)
    grava("W.f32", m.out.weight)
    grava("b.f32", m.out.bias)
    json.dump({"rotulos": meta["rotulos"], "buckets": meta["buckets"], "dim": a.dim, "oculta": a.oculta, "T": 1.0},
              open(os.path.join(a.pasta, "pesos.json"), "w"), indent=2)
    print(f"pesos gravados em {a.pasta}. Agora: node scripts/anima-cerebro/treinar.mjs empacotar {a.pasta}")


if __name__ == "__main__":
    main()
