import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// O Tauri carrega o servidor de dev nesta porta fixa.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', sourcemap: !!process.env.TAURI_ENV_DEBUG },
});
