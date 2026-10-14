import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Arquivos de apoio do pdf.js (mapas de caracteres, fontes padrão, decodificadores
 * wasm). Servidos em /pdfjs/ no dev e copiados para o build, sem morar no repositório.
 */
function pdfjsAssets(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  return {
    name: 'tanden-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]!).replace(/^\/+/, '');
        const [dir] = rel.split('/');
        if (!dir || !dirs.includes(dir) || rel.includes('..')) return next();
        try {
          const data = readFileSync(join(root, rel));
          res.setHeader('Content-Type', rel.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          res.end(data);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const dir of dirs) {
        for (const name of readdirSync(join(root, dir))) {
          const file = join(root, dir, name);
          if (!statSync(file).isFile()) continue;
          this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(file) });
        }
      }
    },
  };
}

// O Tauri carrega o servidor de dev nesta porta fixa.
export default defineConfig({
  plugins: [svelte(), pdfjsAssets()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', sourcemap: !!process.env.TAURI_ENV_DEBUG },
});
