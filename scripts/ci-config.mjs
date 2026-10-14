// Gera apps/tanden/src-tauri/tauri.ci.conf.json para o build do GitHub Actions:
// versão desta execução, endereço de atualização no próprio repositório e,
// se existir o secret TAURI_UPDATER_PUBKEY, a chave pública do atualizador.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'apps/tanden/src-tauri';
const conf = JSON.parse(readFileSync(`${dir}/tauri.release.conf.json`, 'utf8'));
const { VERSION, RUN_NUMBER, GITHUB_REPOSITORY, TAURI_UPDATER_PUBKEY } = process.env;

conf.version = VERSION;
// sempre crescente, para o Android aceitar instalar por cima
conf.bundle = { ...conf.bundle, android: { versionCode: Number(RUN_NUMBER) } };
conf.plugins = {
  updater: {
    endpoints: [`https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/latest.json`],
    ...(TAURI_UPDATER_PUBKEY ? { pubkey: TAURI_UPDATER_PUBKEY.trim() } : {}),
  },
};
writeFileSync(`${dir}/tauri.ci.conf.json`, JSON.stringify(conf, null, 2));
console.log(JSON.stringify(conf, null, 2));
