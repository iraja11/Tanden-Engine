/*
 * Ela escreve no seu world building. Não é texto solto: cada escrito é uma
 * ficha do próprio Tanden (profecia, livro, evento, personagem, conceito,
 * história), com `mundo:` e ligações [[...]] para fichas que já existem no
 * mundo, então aparece no grafo, na linha do tempo e nas buscas do mundo
 * como qualquer outra ficha. Assinada por ela.
 *
 * As frases vêm do cofre (grupos mundo.<gênero>.*), com variação {{a|b}} e
 * os nomes reais do mundo; o resto é montagem.
 */
import { banco, textoDe, variar } from '../cofre';
import { preencherFala } from '../motor';

export type GeneroEscrito = 'profecia' | 'lenda' | 'rumor' | 'personagem' | 'segredo' | 'ideia';

export interface MundoInfo {
  nome: string;
  /** pasta onde ela escreve (ex.: "Mundos/Eldoria/Ânima") */
  pasta: string;
  personagens: string[];
  lugares: string[];
  faccoes: string[];
  criaturas: string[];
  divindades: string[];
}

export interface EscritoMundo {
  mundo: string;
  pasta: string;
  titulo: string;
  genero: GeneroEscrito;
  /** a nota inteira (frontmatter + corpo) */
  texto: string;
}

const TIPO: Record<GeneroEscrito, { tipo: string; secoes: [string, string] }> = {
  profecia: { tipo: 'profecia', secoes: ['Texto da profecia', 'Interpretações'] },
  lenda: { tipo: 'livro', secoes: ['Resumo', 'Trechos'] },
  rumor: { tipo: 'evento', secoes: ['O que aconteceu', 'Consequências'] },
  personagem: { tipo: 'personagem', secoes: ['Aparência', 'História'] },
  segredo: { tipo: 'conceito', secoes: ['Como funciona', 'Limites'] },
  ideia: { tipo: 'historia', secoes: ['Premissa', 'Ganchos'] },
};

const pick = <T>(l: readonly T[], r: () => number): T | undefined => l[Math.floor(r() * l.length)];

/** Nomes que ela inventa quando o mundo ainda está vazio. */
const INVENTADOS = {
  personagens: ['Vesper', 'Morrigan Vael', 'Corvin', 'a Dama de Cinza', 'Ilyra', 'o Relojoeiro', 'Sable', 'Nocturne'],
  lugares: ['a Torre Afogada', 'Vale das Velas', 'a Catedral Partida', 'Bruma Alta', 'o Poço sem Lua', 'Cinzarrubra'],
  faccoes: ['a Ordem do Véu', 'os Insones', 'a Irmandade da Cera', 'o Círculo Mudo'],
  criaturas: ['corvos de vidro', 'a fera sem sombra', 'mariposas-de-cripta', 'o lobo que conta'],
  divindades: ['a Deusa Que Não Pisca', 'Nhal, o Silêncio', 'a Mãe das Mariposas'],
};

export function escreverNoMundo(m: MundoInfo, genero: GeneroEscrito, rand: () => number, now: number): EscritoMundo | null {
  const f = banco().falas;
  const nomes = {
    personagem: pick(m.personagens.length ? m.personagens : INVENTADOS.personagens, rand)!,
    lugar: pick(m.lugares.length ? m.lugares : INVENTADOS.lugares, rand)!,
    faccao: pick(m.faccoes.length ? m.faccoes : INVENTADOS.faccoes, rand)!,
    criatura: pick(m.criaturas.length ? m.criaturas : INVENTADOS.criaturas, rand)!,
    divindade: pick(m.divindades.length ? m.divindades : INVENTADOS.divindades, rand)!,
    mundo: m.nome,
  };
  const existe = (n: string, l: string[]) => l.includes(n);
  const link = (n: string, l: string[]) => (existe(n, l) ? `[[${n}]]` : n);
  const vars = {
    ...nomes,
    personagem: link(nomes.personagem, m.personagens), lugar: link(nomes.lugar, m.lugares), faccao: link(nomes.faccao, m.faccoes),
    criatura: link(nomes.criatura, m.criaturas), divindade: link(nomes.divindade, m.divindades),
  };
  const linha = (g: string, evitar: Set<string> = new Set()): string | null => {
    const ls = [...(f[g] ?? [])].sort(() => rand() - 0.5);
    for (const l of ls) {
      const t = preencherFala(variar(textoDe(l), rand), vars);
      if (t && !evitar.has(t)) return t;
    }
    return null;
  };
  const varias = (g: string, n: number): string[] => {
    const out = new Set<string>();
    for (let i = 0; i < n * 3 && out.size < n; i++) {
      const t = linha(g, out);
      if (!t) break;
      out.add(t);
    }
    return [...out];
  };
  const titulo = linha(`mundo.${genero}.titulo`)?.replace(/\[\[|\]\]/g, '').replace(/[\\/:*?"<>|#^]/g, '').trim();
  const corpo = varias(`mundo.${genero}.corpo`, 3);
  const nota = linha(`mundo.${genero}.nota`) ?? linha('mundo.nota');
  if (!titulo || corpo.length < 2) return null;
  const { tipo, secoes } = TIPO[genero];
  const d = new Date(now);
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const props: string[] = [`tipo: ${tipo}`, `mundo: "[[${m.nome}]]"`];
  if (genero === 'profecia') props.push('profeta: Ânima', `sobre: "${vars.personagem.startsWith('[[') ? vars.personagem : nomes.personagem}"`, 'status: aberta');
  if (genero === 'lenda') props.push('autor: Ânima', 'gênero: lenda');
  if (genero === 'rumor') props.push('status: rumor', `local: "${vars.lugar.startsWith('[[') ? vars.lugar : nomes.lugar}"`);
  if (genero === 'personagem') props.push(`origem: "${vars.lugar.startsWith('[[') ? vars.lugar : nomes.lugar}"`, `afiliação: "${vars.faccao.startsWith('[[') ? vars.faccao : nomes.faccao}"`, 'status: vivo (por enquanto)');
  if (genero === 'segredo') props.push('categoria: segredo');
  if (genero === 'ideia') props.push('gênero: gancho', 'status: ideia');
  props.push('escrito por: Ânima', `escrito em: ${data}`, 'tags: [anima]');
  const texto = [
    '---', ...props, '---', '',
    `## ${secoes[0]}`, '', ...(genero === 'profecia' ? corpo.map((c) => `> ${c}`) : [corpo[0]!, '', ...corpo.slice(1, 2)]), '',
    `## ${secoes[1]}`, '', ...(genero === 'profecia' ? corpo.slice(0, 0) : corpo.slice(2)), ...(nota ? [`*${nota}*`] : []), '',
    `— ânima 🖤`, '',
  ].join('\n');
  return { mundo: m.nome, pasta: m.pasta, titulo, genero, texto };
}
