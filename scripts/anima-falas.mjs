#!/usr/bin/env node
/*
 * As falas da Ânima ficam encriptadas no código (packages/core/src/anima/falas.dat.ts),
 * para não estragarem a surpresa de quem lê o repositório. Para editar:
 *
 *   node scripts/anima-falas.mjs abrir     → escreve packages/core/src/anima/falas.txt (fora do git)
 *   (edite o falas.txt)
 *   node scripts/anima-falas.mjs fechar    → encripta de volta no falas.dat.ts
 *   node scripts/anima-falas.mjs contar    → quantas falas há em cada grupo
 *
 * É ofuscação: a chave vai junto com o app (ela precisa ler as próprias falas).
 * Esconde do GitHub, do grep e de quem abre o código por curiosidade.
 *
 * Formato do falas.txt:
 *   ## grupo                     começa um grupo
 *   texto                        uma fala
 *   {i2 h:ciumenta,possessiva g:olhar} texto
 *                                i = intensidade mínima, h = humores, g = expressão
 *   ?? id: pergunta do dia       começa uma pergunta
 *   - opção >> reação >> lembrança (dita dias depois)
 *   // comentário
 *
 * O algoritmo é o mesmo de packages/core/src/anima/cofre.ts: mantenha os dois iguais.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAT = join(ROOT, 'packages/core/src/anima/falas.dat.ts');
const TXT = join(ROOT, 'packages/core/src/anima/falas.txt');
const KEY = 'tanden·ânima·yin·yang·⊘';

function fnv(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0xff;
  };
}
export function encrypt(json) {
  const bytes = new TextEncoder().encode(json);
  const k = stream(fnv(KEY));
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= k();
  return Buffer.from(bytes).toString('base64');
}
export function decrypt(b64) {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const k = stream(fnv(KEY));
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= k();
  return new TextDecoder().decode(bytes);
}

// ------------------------------------------------------------------ texto ⇄ dados

const OPT = /^\{((?:\s*(?:i[123]|h:[\w,]+|g:\w+))+)\s*\}\s*(.*)$/;

export function parse(txt) {
  const falas = {};
  const perguntas = [];
  let grupo = null;
  let perg = null;
  txt.split('\n').forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('## ')) {
      grupo = line.slice(3).trim();
      perg = null;
      falas[grupo] ??= [];
      return;
    }
    if (line.startsWith('?? ')) {
      const m = /^\?\?\s+([\w-]+):\s*(.+)$/.exec(line);
      if (!m) throw new Error(`linha ${n + 1}: pergunta sem id`);
      perg = { id: m[1], texto: m[2], opcoes: [] };
      perguntas.push(perg);
      grupo = null;
      return;
    }
    if (perg && line.startsWith('- ')) {
      const [texto, reacao, lembra] = line.slice(2).split('>>').map((x) => x.trim());
      if (!texto || !reacao || !lembra) throw new Error(`linha ${n + 1}: opção precisa de "texto >> reação >> lembrança"`);
      perg.opcoes.push({ texto, reacao, lembra });
      return;
    }
    if (!grupo) throw new Error(`linha ${n + 1}: fala fora de um grupo`);
    // a mesma fala duas vezes no grupo só pesaria em dobro no sorteio
    const m = OPT.exec(line);
    const texto = m ? m[2] : line;
    if (falas[grupo].some((l) => (typeof l === 'string' ? l : l.t) === texto)) return;
    if (!m) {
      falas[grupo].push(line);
      return;
    }
    const o = { t: m[2] };
    for (const part of m[1].split(/\s+/).filter(Boolean)) {
      if (/^i[123]$/.test(part)) o.i = Number(part[1]);
      else if (part.startsWith('h:')) o.h = part.slice(2).split(',');
      else if (part.startsWith('g:')) o.g = part.slice(2);
      else throw new Error(`linha ${n + 1}: opção desconhecida "${part}"`);
    }
    falas[grupo].push(o);
  });
  return { v: 1, falas, perguntas };
}

export function serialize(data) {
  const out = ['// Falas da Ânima. Depois de editar: node scripts/anima-falas.mjs fechar', ''];
  for (const [g, ls] of Object.entries(data.falas)) {
    out.push(`## ${g}`);
    for (const l of ls) {
      if (typeof l === 'string') out.push(l);
      else {
        const opts = [l.i ? `i${l.i}` : '', l.h ? `h:${l.h.join(',')}` : '', l.g ? `g:${l.g}` : ''].filter(Boolean).join(' ');
        out.push(opts ? `{${opts}} ${l.t}` : l.t);
      }
    }
    out.push('');
  }
  for (const p of data.perguntas ?? []) {
    out.push(`?? ${p.id}: ${p.texto}`);
    for (const o of p.opcoes) out.push(`- ${o.texto} >> ${o.reacao} >> ${o.lembra}`);
    out.push('');
  }
  return out.join('\n');
}

export function writeDat(data, path = DAT) {
  const b64 = encrypt(JSON.stringify(data));
  const chunks = b64.match(/.{1,120}/g) ?? [];
  writeFileSync(path, `/* Falas da Ânima, encriptadas. Para editar: node scripts/anima-falas.mjs abrir (veja o script). */
// prettier-ignore
export const FALAS_DAT = [
${chunks.map((c) => `  '${c}',`).join('\n')}
].join('');
`);
}

export function readDat(path = DAT) {
  const src = readFileSync(path, 'utf8');
  const b64 = [...src.matchAll(/'([A-Za-z0-9+/=]+)'/g)].map((m) => m[1]).join('');
  return JSON.parse(decrypt(b64));
}

// ------------------------------------------------------------------ linha de comando

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [cmd, file] = main ? process.argv.slice(2) : [];
if (cmd === 'abrir') {
  writeFileSync(file ?? TXT, serialize(readDat()));
  console.log(`falas abertas em ${file ?? TXT}`);
} else if (cmd === 'fechar') {
  const data = parse(readFileSync(file ?? TXT, 'utf8'));
  writeDat(data);
  const n = Object.values(data.falas).reduce((a, l) => a + l.length, 0);
  console.log(`${n} falas em ${Object.keys(data.falas).length} grupos e ${data.perguntas.length} perguntas encriptadas em ${DAT}`);
} else if (cmd === 'contar') {
  const data = readDat();
  for (const [g, l] of Object.entries(data.falas)) console.log(`${String(l.length).padStart(5)}  ${g}`);
  console.log(`${String(Object.values(data.falas).reduce((a, l) => a + l.length, 0)).padStart(5)}  total · ${data.perguntas.length} perguntas`);
} else if (cmd) {
  console.error('uso: node scripts/anima-falas.mjs abrir|fechar|contar [arquivo]');
  process.exit(1);
}
