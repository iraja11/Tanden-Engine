import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { theme } from './lib/theme.svelte';
import { android, isTauri } from './lib/storage-tauri';

// No celular a janela é edge-to-edge: marca o <html> para o CSS reservar a barra
// de status mesmo quando o WebView não informa as áreas seguras sozinho.
if (isTauri() && android) document.documentElement.classList.add('is-android');

// o tema entra antes da primeira pintura, para não piscar o padrão
theme.apply();
mount(App, { target: document.getElementById('app')! });
