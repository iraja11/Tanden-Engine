/*
 * Carregador mínimo para rodar o TypeScript do núcleo direto no Node 22+
 * (sem tsx nem build): o Node já tira os tipos; aqui só resolvemos os
 * imports sem extensão ("./estado" → "./estado.ts" ou "./pasta/index.ts").
 *
 *   node --import ./scripts/ts-loader.mjs script.mjs
 */
import { existsSync, statSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('.') || spec.startsWith('/')) && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.startsWith('file:')) {
    const base = new URL(spec, ctx.parentURL);
    const p = fileURLToPath(base);
    if (existsSync(`${p}.ts`)) return next(`${base.href}.ts`, ctx);
    if (existsSync(p) && statSync(p).isDirectory() && existsSync(`${p}/index.ts`)) return next(`${base.href}/index.ts`, ctx);
  }
  return next(spec, ctx);
}

if (!globalThis.__tsLoader) {
  globalThis.__tsLoader = true;
  register(import.meta.url);
}
