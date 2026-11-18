#!/usr/bin/env node
/*
 * Empacota o plugin "Ficha em PDF" num único HTML (é assim que o Tanden
 * instala plugins): o TypeScript de apps/tanden/src/plugins/ficha-pdf/ (que
 * usa as regras de 5e do núcleo) vira um script embutido, junto com o CSS e
 * a fonte Manrope em base64 (a janela do plugin não lê arquivos do app).
 *
 *   node scripts/plugin-ficha-pdf.mjs                 # gera apps/tanden/src/plugins/ficha-pdf.html
 *   node scripts/plugin-ficha-pdf.mjs ~/Tanden        # e instala no cofre (Plugins/ficha-pdf.html)
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps/tanden');
const src = join(app, 'src/plugins/ficha-pdf');
const out = join(app, 'src/plugins/ficha-pdf.html');

const require = createRequire(join(app, 'package.json'));
const { build } = await import(require.resolve('vite'));

const result = await build({
  root: app,
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2022',
    minify: true,
    lib: { entry: join(src, 'main.ts'), formats: ['iife'], name: 'FichaPdf', fileName: () => 'ficha.js' },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
const js = outputs.find((o) => o.type === 'chunk')?.code;
if (!js) throw new Error('o build não gerou o script');

const fontDir = join(dirname(require.resolve('@fontsource/manrope/package.json')), 'files');
const fonts = [400, 500, 600, 700, 800].map((w) => {
  const b64 = readFileSync(join(fontDir, `manrope-latin-${w}-normal.woff2`)).toString('base64');
  return `@font-face{font-family:"Manrope";font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}).join('\n');

const css = readFileSync(join(src, 'ficha.css'), 'utf8');
const html = readFileSync(join(src, 'shell.html'), 'utf8')
  .replace('/*FONTS*/', () => fonts)
  .replace('/*CSS*/', () => css)
  .replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));

writeFileSync(out, html);
console.log(`ficha-pdf.html: ${(html.length / 1024).toFixed(0)} KB → ${out}`);

const vault = process.argv[2];
if (vault) {
  const dest = join(resolve(vault), 'Plugins/ficha-pdf.html');
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(out, dest);
  console.log(`instalado em ${dest}`);
}
