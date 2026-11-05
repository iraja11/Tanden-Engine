import { typeInfo } from '@tanden/core';

// Cor de cada tipo de ficha do world building. Poucas cores, sóbrias,
// para o grafo e a linha do tempo se lerem de relance no tema escuro.
const COLORS: Record<string, string> = {
  personagem: '#ff8a3d',
  lugar: '#7fd1a8',
  faccao: '#ff6b6b',
  evento: '#ffc08a',
  item: '#c8c7cf',
  especie: '#b59cff',
  conceito: '#7fb6ff',
  criatura: '#d98fb0',
  conflito: '#ff4f6d',
  cultura: '#e6c86e',
  mapa: '#6fc3c9',
};

/** Símbolo de cada tipo, para cartas e marcadores do mapa. */
const GLYPHS: Record<string, string> = {
  personagem: '☺', lugar: '⌂', faccao: '⚑', evento: '✦', item: '◆', especie: '❦', conceito: '✺', criatura: '☠', conflito: '⚔', cultura: '♫', mapa: '⌖',
};
export const typeGlyph = (type: string): string => GLYPHS[type] ?? typeInfo(type).glyph ?? '●';

// cores das facções no mapa e no gráfico da simulação: estáveis pelo nome
const FACTION = ['#ff8a3d', '#7fb6ff', '#7fd1a8', '#ff6b6b', '#b59cff', '#ffc08a', '#6fc3c9', '#d98fb0', '#e6c86e', '#9fd36b'];
export function factionColor(name: string, all?: string[]): string {
  // com a lista de facções, cada uma pega uma cor diferente (até acabarem as cores)
  if (all) {
    const i = [...all].sort((a, b) => a.localeCompare(b, 'pt-BR')).indexOf(name);
    if (i >= 0) return FACTION[i % FACTION.length]!;
  }
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FACTION[h % FACTION.length]!;
}

/** Cor pura do tipo (sem ajuste ao tema): para impressão e imagens. */
export function typeBase(type: string): string {
  const base = COLORS[type] ?? typeInfo(type).color;
  if (base) return base;
  // tipos criados pela pessoa: uma cor estável pelo nome
  let h = 0;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 60%)`;
}

export function typeColor(type: string): string {
  const base = typeBase(type);
  // puxada para a cor do texto: clareia no tema escuro e escurece no claro,
  // para continuar legível nos dois
  return `color-mix(in srgb, ${base} 78%, var(--ink))`;
}

/** Tipo provável de uma nota nova pelo nome da propriedade que aponta para ela. */
export function guessTypeFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (/local|lugar|origem|sede|parte de|regi|cidade|habitat|reino|terra/.test(l)) return 'lugar';
  if (/afilia|fac|ordem|grupo|guild|clã|cla|líder de|organiza/.test(l)) return 'faccao';
  if (/espécie|especie|raça|raca/.test(l)) return 'especie';
  if (/cultura|povo|tradi/.test(l)) return 'cultura';
  if (/conflito|rivalidade/.test(l)) return 'conflito';
  if (/evento|batalha|guerra/.test(l)) return 'evento';
  if (/item|arma|artefato|poder/.test(l)) return 'item';
  if (/magia|conceito|idioma|religi/.test(l)) return 'conceito';
  return 'personagem';
}
