import { cubicOut, backOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { theme } from './theme.svelte';

// Transições do app. Curtas e com direção: o que entra vem de onde faz sentido
// (um painel sobe do botão que o abriu, uma tela nova chega de baixo).
// Todas respeitam o nível de movimento escolhido no tema.

/** Tela ou item entrando: sobe um pouco e ganha foco. */
export function rise(_node: Element, { delay = 0, y = 8, duration = 240 } = {}): TransitionConfig {
  const d = theme.ms(duration);
  if (!d) return { duration: 0 };
  const blur = theme.motion === 'completo' ? 3 : 0;
  return {
    delay: theme.motion === 'completo' ? delay : 0,
    duration: d,
    easing: cubicOut,
    css: (t, u) => `opacity:${t};transform:translateY(${u * y}px);${blur ? `filter:blur(${u * blur}px);` : ''}`,
  };
}

/** Painel ou menu abrindo a partir do botão: cresce com uma leve sobra. */
export function pop(_node: Element, { duration = 200, from = 0.94 } = {}): TransitionConfig {
  const d = theme.ms(duration);
  if (!d) return { duration: 0 };
  return {
    duration: d,
    easing: theme.motion === 'completo' ? backOut : cubicOut,
    css: (t, u) => `opacity:${Math.min(1, t * 1.6)};transform:scale(${from + (1 - from) * t}) translateY(${u * 4}px);`,
  };
}

/** Saída: só some, rápido, para não segurar a tela. */
export function vanish(_node: Element, { duration = 120 } = {}): TransitionConfig {
  const d = theme.ms(duration);
  return d ? { duration: d, css: (t) => `opacity:${t}` } : { duration: 0 };
}
