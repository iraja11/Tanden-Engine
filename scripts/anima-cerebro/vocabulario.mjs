#!/usr/bin/env node
/*
 * O vocabulário do corretor da Ânima: palavras reais do português que ele não
 * deve "consertar" (sem isso, "tô pregado" virava "estou pesado" e "fossa"
 * virava "fosse", porque o corretor só conhecia as palavras da gramática e das
 * falas).
 *
 *   node scripts/anima-cerebro/vocabulario.mjs <pt_br_50k.txt> [<por_sentences.tsv>] [--min 3]
 *
 * Fontes (baixadas uma vez, fora do git):
 *   - FrequencyWords (MIT, Hermit Dave), português brasileiro das legendas do OpenSubtitles:
 *     https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt
 *   - Tatoeba (CC BY 2.0 FR), frases em português, opcional:
 *     https://downloads.tatoeba.org/exports/per_language/por/por_sentences.tsv.bz2
 *
 * Grava packages/core/src/anima/cerebro/vocabulario.dat.ts só com as palavras
 * de 4+ letras (o corretor nunca mexe nas menores) que o léxico base ainda não
 * tem, já dobradas (sem acento, minúsculas), em ordem e com prefixo comum
 * comprimido. Depois de mudar o vocabulário, treine a rede e o modelo de novo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await import(pathToFileURL(join(ROOT, 'scripts/ts-loader.mjs')).href);
const SRC = join(ROOT, 'packages/core/src/anima/cerebro');
const OUT = join(SRC, 'vocabulario.dat.ts');
// o léxico base sem o vocabulário (senão ele se filtraria sozinho)
writeFileSync(OUT, "/* gerado por scripts/anima-cerebro/vocabulario.mjs */\nexport const VOCABULARIO_DAT: string = '';\n");
const M = await import(pathToFileURL(join(SRC, 'modelo.ts')).href);

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const [freqArq, tatoebaArq] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!freqArq) throw new Error('uso: vocabulario.mjs <pt_br_50k.txt> [<por_sentences.tsv>] [--min 3]');

const dobrar = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lx = M.lexicoBase();
const novas = new Set();
const ok = (w) => /^[a-z]{4,24}$/.test(w) && !lx.tem(w);
for (const l of readFileSync(freqArq, 'utf8').split('\n')) {
  const [w, n] = l.trim().split(/\s+/);
  if (w && Number(n) >= opt('min-freq', 3)) {
    const d = dobrar(w);
    if (ok(d)) novas.add(d);
  }
}
const dasLegendas = novas.size;
if (tatoebaArq) {
  const cont = new Map();
  for (const l of readFileSync(tatoebaArq, 'utf8').split('\n')) {
    for (const w of dobrar(l.split('\t')[2] ?? '').match(/[a-z]+/g) ?? []) cont.set(w, (cont.get(w) ?? 0) + 1);
  }
  for (const [w, n] of cont) if (n >= opt('min', 3) && ok(w)) novas.add(w);
}
// prefixo comum com a anterior: "abacate abacaxi" → "abacate 5xi" (um dígito base 36 + o resto)
const lista = [...novas].sort();
let prev = '';
const partes = lista.map((w) => {
  let k = 0;
  while (k < Math.min(35, prev.length, w.length) && prev[k] === w[k]) k++;
  prev = w;
  return k.toString(36) + w.slice(k);
});
const s = partes.join(' ');
const chunks = s.match(/.{1,160}/g) ?? [];
writeFileSync(OUT, `/*
 * Palavras reais do português que o corretor não deve "consertar" (gerado por
 * scripts/anima-cerebro/vocabulario.mjs; não edite à mão).
 * Fontes: FrequencyWords (MIT, Hermit Dave; legendas do OpenSubtitles) e Tatoeba (CC BY 2.0 FR).
 */
// prettier-ignore
export const VOCABULARIO_DAT: string = [
${chunks.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
].join('');
`);
console.log(`vocabulário: ${lista.length} palavras novas (${dasLegendas} das legendas, ${lista.length - dasLegendas} só do Tatoeba), ${(s.length / 1024).toFixed(0)} KB · léxico base tinha ${lx.tamanho}`);
