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
};

export function typeColor(type: string): string {
  let base = COLORS[type];
  if (!base) {
    // tipos criados pela pessoa: uma cor estável pelo nome
    let h = 0;
    for (const c of type) h = (h * 31 + c.charCodeAt(0)) % 360;
    base = `hsl(${h} 45% 70%)`;
  }
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
  if (/evento|batalha|guerra/.test(l)) return 'evento';
  if (/item|arma|artefato|poder/.test(l)) return 'item';
  if (/magia|conceito|idioma|religi/.test(l)) return 'conceito';
  return 'personagem';
}
