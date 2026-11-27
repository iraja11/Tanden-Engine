#!/usr/bin/env node
/*
 * A rede neural da Ânima (packages/core/src/anima/cerebro/rede.ts).
 *
 *   node scripts/anima-cerebro/rede.mjs exportar <pasta> [--por 2500] [--L 32]
 *       gera o corpus (gramática + ruído), normaliza com o mesmo corretor do app e
 *       grava os tokens já em índices (treino.bin, val.bin, reais.bin, meta.json)
 *
 *   scripts/anima-cerebro/.venv/bin/python scripts/anima-cerebro/rede.py <pasta>
 *       treina na GPU e grava <pasta>/rede.bin
 *
 *   node scripts/anima-cerebro/rede.mjs empacotar <pasta>
 *       confere que o TypeScript dá o mesmo resultado que o PyTorch, avalia e
 *       grava packages/core/src/anima/cerebro/rede.dat.ts
 *
 *   node scripts/anima-cerebro/rede.mjs avaliar
 *       mede a rede atual (e o conjunto rede + modelo antigo) nas frases reais e no cego
 *
 * O Node faz a normalização, o corretor e o hash; o Python só vê índices, então
 * não existe diferença entre o que a rede aprende e o que o app vê.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await import(pathToFileURL(join(ROOT, 'scripts/ts-loader.mjs')).href);
const SRC = join(ROOT, 'packages/core/src/anima/cerebro');
const DAT = join(SRC, 'rede.dat.ts');
const FIX = join(ROOT, 'packages/core/test/fixtures');

const C = await import(pathToFileURL(join(SRC, 'corpus.ts')).href);
const R = await import(pathToFileURL(join(SRC, 'rede.ts')).href);
const M = await import(pathToFileURL(join(SRC, 'modelo.ts')).href);
const K = await import(pathToFileURL(join(SRC, 'classificador.ts')).href);
const T = await import(pathToFileURL(join(SRC, 'texto.ts')).href);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const BUCKETS = 1 << 18;
const rotulos = [...C.ROTULOS];

function frases(arq) {
  return readFileSync(join(FIX, arq), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [rotulo, texto] = l.split('\t');
    return { rotulo, texto };
  });
}

/** Grava exemplos como: u32 n · u16 y[n] · u8 ntok[n] · u8 nfeat[total tokens] · u32 ids[...] */
function gravarBin(arq, ex, L) {
  const lx = M.lexicoBase();
  const pos = new Map(rotulos.map((r, i) => [r, i]));
  const ys = [], ntok = [], nfeat = [], ids = [];
  for (const e of ex) {
    const toks = R.idsDaRede(T.normalizar(e.texto, lx), L, BUCKETS);
    ys.push(pos.get(e.rotulo) ?? 0);
    ntok.push(toks.length);
    for (const t of toks) {
      nfeat.push(Math.min(255, t.length));
      ids.push(...t.slice(0, 255));
    }
  }
  const n = ex.length;
  const buf = Buffer.alloc(4 + n * 2 + n + nfeat.length + 3 + ids.length * 4 + 8);
  let o = buf.writeUInt32LE(n, 0);
  for (const y of ys) o = buf.writeUInt16LE(y, o);
  for (const v of ntok) o = buf.writeUInt8(v, o);
  for (const v of nfeat) o = buf.writeUInt8(v, o);
  o = (o + 3) & ~3;
  for (const v of ids) o = buf.writeUInt32LE(v, o);
  writeFileSync(arq, buf.subarray(0, o));
  return { n, tokens: nfeat.length, ids: ids.length };
}

function medir(prever, lista) {
  let ok = 0;
  const erros = [];
  for (const { rotulo, texto } of lista) {
    const p = prever(texto);
    if (p.rotulo === rotulo) ok++;
    else erros.push(`  ${rotulo} → ${p.rotulo} (${p.p.toFixed(2)})  "${texto}"`);
  }
  return { ok, n: lista.length, erros };
}

/** Os conjuntos de avaliação: as frases reais e todos os cegos que existirem (cego, cego2, cego3...). */
const CONJUNTOS = [['reais', 'anima-intencoes.txt'], ['cego', 'anima-intencoes-cego.txt'],
  ...Array.from({ length: 18 }, (_, i) => [`cego${i + 2}`, `anima-intencoes-cego${i + 2}.txt`]).filter(([, a]) => existsSync(join(FIX, a)))];

function relatorio(rede, verErros = true) {
  const lx = M.lexicoBase();
  const antigo = M.modeloPadrao();
  const soRede = (txt) => R.preverComRede(rede, T.normalizar(txt, lx));
  const conjunto = (txt) => M.classificar(T.normalizar(txt, lx), antigo, rede);
  const val = C.gerarCorpus(30, 3);
  const pc = (x) => `${((x.ok / x.n) * 100).toFixed(1)}%`;
  for (const [nome, f] of [['rede', soRede], ['rede+antigo', conjunto]]) {
    const v = medir(f, val);
    const ms = CONJUNTOS.map(([n, a]) => [n, medir(f, frases(a))]);
    console.log(`${nome.padEnd(12)} sintético ${pc(v)} de ${v.n} · ${ms.map(([n, x]) => `${n} ${x.ok}/${x.n} (${pc(x)})`).join(' · ')}`);
    if (verErros && nome === 'rede+antigo') for (const [n, x] of ms) if (x.erros.length) console.log(`erros em ${n}:\n${x.erros.join('\n')}`);
  }
  if (antigo) {
    const f = (txt) => K.prever(antigo, T.normalizar(txt, lx));
    const ms = CONJUNTOS.map(([n, a]) => [n, medir(f, frases(a))]);
    console.log(`${'só antigo'.padEnd(12)} ${ms.map(([n, x]) => `${n} ${x.ok}/${x.n}`).join(' · ')}${antigo.rotulos.length !== rotulos.length ? ` (o antigo tem ${antigo.rotulos.length} intenções; treine de novo)` : ''}`);
  }
  // tempo de uma mensagem
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) soRede('ânima, coloca minha prova de cálculo na agenda pra quinta às 10 por favor');
  console.log(`inferência: ${((performance.now() - t0) / 50).toFixed(2)} ms por mensagem longa`);
}

if (cmd === 'exportar') {
  const dir = args[1];
  if (!dir) throw new Error('diga a pasta: exportar <pasta>');
  mkdirSync(dir, { recursive: true });
  const L = opt('L', 32);
  const t0 = Date.now();
  const trEx = C.gerarCorpus(opt('por', 2500), opt('semente', 1));
  const tr = gravarBin(join(dir, 'treino.bin'), trEx, L);
  // os textos, para o professor (rede.py --professor) calcular o significado de cada frase
  writeFileSync(join(dir, 'treino.txt'), trEx.map((e) => e.texto.replace(/\s+/g, ' ')).join('\n'));
  // frases naturais sem rótulo (ex.: o Tatoeba em português): só para a destilação
  const extraI = args.indexOf('--extra');
  if (extraI >= 0) {
    const max = opt('extra-max', 200000);
    const vistas = new Set();
    const linhas = readFileSync(args[extraI + 1], 'utf8').split('\n').map((l) => (l.split('\t')[2] ?? l).trim())
      .filter((x) => x && x.split(/\s+/).length <= 14 && !vistas.has(x) && vistas.add(x));
    let a = 12345;
    const rand = () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = linhas.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [linhas[i], linhas[j]] = [linhas[j], linhas[i]];
    }
    // metade como está, metade estragada como gente digita (minúscula, sem acento, gíria)
    const ex = linhas.slice(0, max).map((texto, i) => ({ texto: i % 2 ? C.ruido(texto, rand, 0.3) : texto, rotulo: rotulos[0] }));
    const ext = gravarBin(join(dir, 'extra.bin'), ex, L);
    writeFileSync(join(dir, 'extra.txt'), ex.map((e) => e.texto.replace(/\s+/g, ' ')).join('\n'));
    console.log(`${ext.n} frases sem rótulo para a destilação`);
  }
  // paráfrases do modelo de linguagem local (parafrasear.mjs): limpas e estragadas como gente digita; o rede.py filtra pelo professor
  const PARA = join(dirname(fileURLToPath(import.meta.url)), 'parafrases.tsv');
  if (existsSync(PARA) && !args.includes('--sem-parafrases')) {
    const conhecidas = new Set(rotulos);
    let a = 777;
    const rand = () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) / 4294967296);
    const base = readFileSync(PARA, 'utf8').split('\n').map((l) => l.split('\t')).filter(([r, t]) => r && t && conhecidas.has(r))
      // sem nenhuma palavra (":)", "kkk") não há intenção: só ensinaria que riso é "sim"
      .filter(([, t]) => T.normalizar(t, M.lexicoBase()).tokens.length > 0).map(([rotulo, texto]) => ({ rotulo, texto }));
    const ex = base.flatMap((e) => [e, { rotulo: e.rotulo, texto: C.ruido(e.texto, rand, 0.4) }]);
    const pa = gravarBin(join(dir, 'para.bin'), ex, L);
    writeFileSync(join(dir, 'para.txt'), ex.map((e) => e.texto.replace(/\s+/g, ' ')).join('\n'));
    console.log(`${pa.n} paráfrases (${base.length} × 2: limpa e com ruído)`);
  }
  const va = gravarBin(join(dir, 'val.bin'), C.gerarCorpus(60, 2), L);
  const re = gravarBin(join(dir, 'reais.bin'), frases('anima-intencoes.txt'), L);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ rotulos, buckets: BUCKETS, L }, null, 1));
  console.log(`exportado em ${dir} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${tr.n} de treino (${tr.tokens} tokens), ${va.n} de validação, ${re.n} frases reais, ${rotulos.length} intenções`);
} else if (cmd === 'empacotar') {
  const dir = args[1];
  if (!dir || !existsSync(join(dir, 'rede.bin'))) throw new Error('diga a pasta com rede.bin (gerada pelo rede.py)');
  const bin = readFileSync(join(dir, 'rede.bin'));
  const b64 = bin.toString('base64');
  const rede = R.carregarRede(b64);
  if (rede.rotulos.join() !== rotulos.join()) console.warn('⚠ as intenções da rede não batem com o corpus atual: exporte e treine de novo');
  // paridade: o PyTorch gravou os logits de algumas frases; o TypeScript tem de dar o mesmo
  const par = existsSync(join(dir, 'paridade.json')) ? JSON.parse(readFileSync(join(dir, 'paridade.json'), 'utf8')) : [];
  const lx = M.lexicoBase();
  let pior = 0;
  const val = C.gerarCorpus(60, 2);
  for (const { i, z } of par) {
    const texto = val[i].texto;
    const zt = R.logitsDaRede(rede, T.normalizar(texto, lx)).z;
    for (let i = 0; i < z.length; i++) pior = Math.max(pior, Math.abs(z[i] - zt[i]));
  }
  console.log(`paridade PyTorch × TypeScript: maior diferença nos logits ${pior.toExponential(2)} (${par.length} frases)`);
  if (pior > 0.05) throw new Error('a inferência em TypeScript não bate com o treino');
  const chunks = b64.match(/.{1,160}/g) ?? [];
  writeFileSync(DAT, `/* A rede neural da Ânima (gerada por scripts/anima-cerebro/rede.mjs; não edite à mão). */
// prettier-ignore
export const REDE_DAT: string = [
${chunks.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
].join('');
`);
  console.log(`gravado ${DAT} (${(b64.length / 1024).toFixed(0)} KB em base64; ${rede.emb.idx.length} linhas, d=${rede.d}, ${rede.camadas.length} camadas, ${rede.rotulos.length} intenções, T=${rede.T})`);
  M.usarRede(rede);
  relatorio(rede);
} else if (cmd === 'avaliar') {
  const rede = await M.prepararRede();
  if (!rede) throw new Error('não há rede treinada ainda');
  relatorio(rede, !args.includes('--quieto'));
} else {
  console.error('uso: node scripts/anima-cerebro/rede.mjs exportar <pasta>|empacotar <pasta>|avaliar');
  process.exit(1);
}
