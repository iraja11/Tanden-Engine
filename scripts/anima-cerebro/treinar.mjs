#!/usr/bin/env node
/*
 * Treino do classificador de intenções da Ânima.
 *
 *   node scripts/anima-cerebro/treinar.mjs treinar [--dim 32] [--por 300] [--epocas 10] [--corte 20000]
 *       treina na CPU (uns 15 s), avalia e grava packages/core/src/anima/cerebro/modelo.dat.ts
 *
 *   node scripts/anima-cerebro/treinar.mjs exportar <pasta> [--por 2000]
 *       grava o corpus já em índices (treino.jsonl, val.jsonl, meta.json) para treinar na GPU
 *       com scripts/anima-cerebro/treinar.py (camada oculta, mais dados, mais épocas)
 *
 *   node scripts/anima-cerebro/treinar.mjs empacotar <pasta> [--corte 20000]
 *       lê os pesos que o treinar.py gravou (meta.json + *.f32), corta, quantiza,
 *       avalia e grava o modelo.dat.ts
 *
 *   node scripts/anima-cerebro/treinar.mjs avaliar
 *       mede o modelo atual nas frases de packages/core/test/fixtures/anima-intencoes.txt
 *
 * Roda o TypeScript do núcleo direto (scripts/ts-loader.mjs), sem build.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await import(pathToFileURL(join(ROOT, 'scripts/ts-loader.mjs')).href);
const SRC = join(ROOT, 'packages/core/src/anima/cerebro');
const DAT = join(SRC, 'modelo.dat.ts');
const FRASES = join(ROOT, 'packages/core/test/fixtures/anima-intencoes.txt');

const C = await import(pathToFileURL(join(SRC, 'corpus.ts')).href);
const K = await import(pathToFileURL(join(SRC, 'classificador.ts')).href);
const M = await import(pathToFileURL(join(SRC, 'modelo.ts')).href);
const T = await import(pathToFileURL(join(SRC, 'texto.ts')).href);

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const BUCKETS = 1 << 18;
const rotulos = [...C.ROTULOS];

function reais() {
  return readFileSync(FRASES, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [rotulo, texto] = l.split('\t');
    return { rotulo, texto };
  });
}

function relatorio(m) {
  const te = M.amostrar(C.gerarCorpus(40, 3), rotulos, BUCKETS);
  const av = K.avaliar(m, te);
  const lx = M.lexicoBase();
  const r = reais();
  const erros = [];
  let ok = 0;
  for (const { rotulo, texto } of r) {
    const p = K.prever(m, T.normalizar(texto, lx));
    if (p.rotulo === rotulo) ok++;
    else erros.push(`  ${rotulo} → ${p.rotulo} (${p.p.toFixed(2)})  "${texto}"`);
  }
  console.log(`sintético: ${(av.acerto * 100).toFixed(1)}% de ${av.n} · frases reais: ${ok}/${r.length} (${((ok / r.length) * 100).toFixed(1)}%) · T=${m.T}`);
  console.log(`calibração: ${av.faixas.filter((f) => f.n).map((f) => `[${f.de.toFixed(1)}–${f.ate.toFixed(1)}] ${(f.acerto * 100).toFixed(0)}% de ${f.n}`).join('  ')}`);
  if (erros.length) console.log(`erros nas frases reais:\n${erros.join('\n')}`);
}

function gravar(m) {
  const s = K.serializar(m);
  const chunks = s.match(/.{1,160}/g) ?? [];
  writeFileSync(DAT, `/* Modelo de intenções da Ânima (gerado por scripts/anima-cerebro/treinar.mjs; não edite à mão). */
// prettier-ignore
export const MODELO_DAT: string = [
${chunks.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
].join('');
`);
  console.log(`gravado ${DAT} (${(s.length / 1024).toFixed(0)} KB, ${m.linhas.idx.length} linhas, ${m.rotulos.length} intenções)`);
}

if (cmd === 'treinar') {
  const t0 = Date.now();
  const tr = M.amostrar(C.gerarCorpus(opt('por', 300), 1), rotulos, BUCKETS);
  const va = M.amostrar(C.gerarCorpus(40, 2), rotulos, BUCKETS);
  console.log(`${tr.length} exemplos de treino, ${rotulos.length} intenções`);
  const m = K.treinar(tr, rotulos, {
    dim: opt('dim', 32), buckets: BUCKETS, epocas: opt('epocas', 10), lr: 0.5, corte: opt('corte', 20000), retreino: 3, pq: true, sub: 4, semente: opt('semente', 1),
    aoProgresso: (msg) => process.stdout.write(`\r  ${msg}          `),
  });
  m.T = K.calibrar(m, va);
  console.log(`\ntreinado em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  relatorio(m);
  gravar(m);
} else if (cmd === 'exportar') {
  const dir = args[1];
  if (!dir) throw new Error('diga a pasta: exportar <pasta>');
  mkdirSync(dir, { recursive: true });
  const linha = (a) => JSON.stringify({ f: [...a.ids], y: a.y });
  const tr = M.amostrar(C.gerarCorpus(opt('por', 2000), 1), rotulos, BUCKETS);
  const va = M.amostrar(C.gerarCorpus(60, 2), rotulos, BUCKETS);
  const lx = M.lexicoBase();
  const reaisA = reais().map((r) => ({ ids: K.indices(T.normalizar(r.texto, lx), BUCKETS), y: rotulos.indexOf(r.rotulo) }));
  writeFileSync(join(dir, 'treino.jsonl'), tr.map(linha).join('\n'));
  writeFileSync(join(dir, 'val.jsonl'), va.map(linha).join('\n'));
  writeFileSync(join(dir, 'reais.jsonl'), reaisA.map(linha).join('\n'));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ rotulos, buckets: BUCKETS }, null, 2));
  console.log(`exportado em ${dir}: ${tr.length} de treino, ${va.length} de validação, ${reaisA.length} frases reais`);
} else if (cmd === 'empacotar') {
  const dir = args[1];
  if (!dir || !existsSync(join(dir, 'pesos.json'))) throw new Error('diga a pasta com pesos.json (gerada pelo treinar.py)');
  const meta = JSON.parse(readFileSync(join(dir, 'pesos.json'), 'utf8'));
  const f32 = (nome) => {
    const b = readFileSync(join(dir, nome));
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  const E = f32('E.f32');
  const dim = meta.dim;
  // linhas que o corpus usa, ordenadas pela norma; o corte vale aqui também
  const usadas = new Set();
  for (const a of M.amostrar(C.gerarCorpus(300, 1), rotulos, BUCKETS)) for (const i of a.ids) usadas.add(i);
  let idx = [...usadas].map((i) => {
    let s = 0;
    for (let k = 0; k < dim; k++) s += E[i * dim + k] ** 2;
    return [i, s];
  }).sort((a, b) => b[1] - a[1]).slice(0, opt('corte', 20000)).map(([i]) => i).sort((a, b) => a - b);
  const vet = new Float32Array(idx.length * dim);
  idx.forEach((i, r) => vet.set(E.subarray(i * dim, (i + 1) * dim), r * dim));
  const dense = { tipo: 'densa', idx: Uint32Array.from(idx), vet };
  let s = 7;
  const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const m = {
    v: 1, rotulos: meta.rotulos, buckets: meta.buckets, dim, oculta: meta.oculta, T: meta.T ?? 1,
    linhas: K.quantizar(dense, dim, 4, rand), W1: meta.oculta ? f32('W1.f32') : null, b1: meta.oculta ? f32('b1.f32') : null, W: f32('W.f32'), b: f32('b.f32'),
  };
  m.T = K.calibrar(m, M.amostrar(C.gerarCorpus(40, 2), rotulos, BUCKETS));
  relatorio(m);
  gravar(m);
} else if (cmd === 'avaliar') {
  const m = M.modeloPadrao();
  if (!m) throw new Error('não há modelo treinado ainda: rode "treinar"');
  relatorio(m);
} else {
  console.error('uso: node scripts/anima-cerebro/treinar.mjs treinar|exportar <pasta>|empacotar <pasta>|avaliar');
  process.exit(1);
}
