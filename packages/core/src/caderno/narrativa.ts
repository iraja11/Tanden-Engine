import type { Rng } from '../rpg/dice';
import { asList, asText, bodyOf } from './frontmatter';
import { noteDir } from './markdown';
import type { Entity, World } from './mundo';

/*
 * Escrita de histórias dentro do mundo.
 *
 * Uma história é uma ficha `tipo: história` (premissa, gênero, estrutura,
 * meta de palavras). As cenas são fichas `tipo: cena` com `história:
 * "[[Nome]]"`, uma `ordem`, a `batida` da estrutura em que caem e o texto da
 * cena no corpo da nota. Como as cenas apontam para personagens (`pov`,
 * `personagens`) e lugares (`local`), a escrita fica ligada ao mundo: dá para
 * ver quem aparece onde, que lugar nunca foi usado, e montar o manuscrito.
 */

export interface Beat {
  id: string;
  nome: string;
  /** posição típica na história, de 0 a 1 */
  pos: number;
  desc: string;
}

export interface BeatSheet {
  id: string;
  label: string;
  desc: string;
  beats: Beat[];
}

const b = (nome: string, pos: number, desc: string): Beat => ({ id: nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), nome, pos, desc });

export const BEAT_SHEETS: BeatSheet[] = [
  {
    id: 'tres-atos', label: 'Três atos', desc: 'Começo, meio e fim, com duas viradas. A estrutura mais usada, e a mais flexível.',
    beats: [
      b('Gancho', 0, 'A primeira cena: o mundo comum e uma pergunta que prende.'),
      b('Incidente', 0.1, 'Algo acontece e a vida do protagonista não pode continuar igual.'),
      b('Primeira virada', 0.25, 'O protagonista decide agir e entra no problema. Fim do primeiro ato.'),
      b('Complicações', 0.38, 'Tentativas, aliados, inimigos. Cada passo custa mais.'),
      b('Ponto médio', 0.5, 'Uma revelação ou vitória falsa muda o jogo: de reagir para agir.'),
      b('Crise', 0.75, 'Tudo dá errado. O protagonista perde o que mais importava.'),
      b('Clímax', 0.9, 'O confronto final, em que ele usa o que aprendeu.'),
      b('Resolução', 1, 'O novo normal: o que mudou, no mundo e nele.'),
    ],
  },
  {
    id: 'jornada', label: 'Jornada do herói', desc: 'A viagem em doze passos: sair do mundo comum, ser posto à prova e voltar mudado.',
    beats: [
      b('Mundo comum', 0, 'Quem o herói é antes da aventura.'),
      b('Chamado', 0.08, 'O convite, a ameaça ou a perda que o tira do lugar.'),
      b('Recusa', 0.14, 'O medo: por que ele não quer ir.'),
      b('Mentor', 0.2, 'Alguém dá conselho, treino ou um presente.'),
      b('Travessia', 0.25, 'O herói cruza o limiar para o mundo desconhecido.'),
      b('Provas, aliados e inimigos', 0.36, 'As regras do mundo novo e quem é quem.'),
      b('Aproximação', 0.46, 'A preparação para entrar no lugar mais perigoso.'),
      b('Provação', 0.55, 'O teste supremo: quase morrer, de verdade ou por dentro.'),
      b('Recompensa', 0.65, 'O que ele ganha por ter sobrevivido.'),
      b('Caminho de volta', 0.75, 'A fuga, a perseguição, o preço de voltar.'),
      b('Ressurreição', 0.88, 'O último teste, maior que todos, já transformado.'),
      b('Retorno com o elixir', 1, 'Ele volta para casa com algo que muda o mundo comum.'),
    ],
  },
  {
    id: 'salve-o-gato', label: 'Quinze batidas', desc: 'Roteiro em quinze batidas, bom para ritmo: cada uma tem um lugar quase certo.',
    beats: [
      b('Imagem de abertura', 0, 'Um retrato do antes.'),
      b('Tema declarado', 0.05, 'Alguém diz, sem saber, o que a história vai ensinar.'),
      b('Preparação', 0.08, 'O mundo, os defeitos e o que falta ao herói.'),
      b('Catalisador', 0.12, 'O acontecimento que muda tudo.'),
      b('Debate', 0.18, 'Ir ou não ir?'),
      b('Entrada no segundo ato', 0.25, 'A escolha: ele entra no mundo novo.'),
      b('História B', 0.3, 'Uma relação nova que carrega o tema.'),
      b('Diversão', 0.4, 'A promessa da premissa: o que o leitor veio ver.'),
      b('Ponto médio', 0.5, 'Vitória ou derrota falsa; o relógio começa a correr.'),
      b('Os inimigos apertam', 0.6, 'Pressão de fora e rachaduras por dentro.'),
      b('Tudo está perdido', 0.75, 'O pior momento, com cheiro de morte.'),
      b('Noite escura', 0.8, 'O luto, e a descoberta do que precisa mudar.'),
      b('Entrada no terceiro ato', 0.85, 'A solução nasce de juntar A e B.'),
      b('Final', 0.92, 'O plano, a virada e a vitória (ou a derrota com sentido).'),
      b('Imagem final', 1, 'O retrato do depois, espelho da abertura.'),
    ],
  },
  {
    id: 'sete-pontos', label: 'Sete pontos', desc: 'Comece pelo fim: a resolução decide o gancho, e as viradas ligam os dois.',
    beats: [
      b('Gancho', 0, 'O herói no estado oposto ao final.'),
      b('Virada 1', 0.2, 'O chamado que põe a história em movimento.'),
      b('Pressão 1', 0.35, 'Algo dá errado e força o herói a agir.'),
      b('Ponto médio', 0.5, 'Ele deixa de reagir e passa a agir.'),
      b('Pressão 2', 0.65, 'Mais um golpe; o plano cai.'),
      b('Virada 2', 0.8, 'A última peça: ele tem o que precisa para vencer.'),
      b('Resolução', 1, 'O clímax e o fim, o oposto do gancho.'),
    ],
  },
  {
    id: 'kishotenketsu', label: 'Quatro tempos', desc: 'Introdução, desenvolvimento, reviravolta e conclusão, sem precisar de conflito central.',
    beats: [
      b('Introdução', 0, 'Personagens e lugar.'),
      b('Desenvolvimento', 0.3, 'A vida segue e se aprofunda.'),
      b('Reviravolta', 0.65, 'Algo inesperado, às vezes sem relação aparente.'),
      b('Conclusão', 1, 'O sentido nasce de juntar tudo.'),
    ],
  },
  {
    id: 'misterio', label: 'Mistério', desc: 'Crime, investigação, pistas falsas e a revelação.',
    beats: [
      b('O crime', 0, 'Algo terrível aconteceu (ou vai acontecer).'),
      b('O investigador', 0.1, 'Quem vai atrás, e por quê.'),
      b('Pistas', 0.3, 'Suspeitos, álibis, a primeira pista verdadeira escondida entre falsas.'),
      b('Pista falsa', 0.5, 'Tudo aponta para alguém, e está errado.'),
      b('Segundo crime', 0.65, 'O culpado age de novo; a pressão aumenta.'),
      b('Revelação', 0.88, 'A pista que estava lá desde o começo.'),
      b('Desfecho', 1, 'Justiça, ou o preço de saber a verdade.'),
    ],
  },
];

export const beatSheet = (id: string | null | undefined): BeatSheet | null => {
  if (!id) return null;
  const k = id.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return BEAT_SHEETS.find((s) => s.id === k || s.label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() === k) ?? null;
};

export type SceneStatus = 'ideia' | 'rascunho' | 'revisão' | 'pronta';
export const SCENE_STATUS: SceneStatus[] = ['ideia', 'rascunho', 'revisão', 'pronta'];

export interface Scene {
  entity: Entity;
  path: string;
  name: string;
  order: number;
  beat: string | null;
  status: SceneStatus;
  words: number;
  pov: string | null;
  local: string | null;
  /** caminhos das fichas que aparecem (pov, personagens, citadas) */
  cast: string[];
  date: string;
  goal: string;
  conflict: string;
  outcome: string;
}

export interface Story {
  entity: Entity;
  path: string;
  name: string;
  sheet: BeatSheet | null;
  goal: number | null;
  scenes: Scene[];
  words: number;
  /** pasta onde as cenas novas nascem */
  folder: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Entity, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => fold(p) === fold(k));
    if (key) {
      const v = asText(e.props[key]).trim();
      if (v) return v;
    }
  }
  return '';
};

function statusOf(raw: string): SceneStatus {
  const k = fold(raw);
  if (/pront|final|feit|ok/.test(k)) return 'pronta';
  if (/revis/.test(k)) return 'revisão';
  if (/rascun|escrev|draft/.test(k)) return 'rascunho';
  return 'ideia';
}

/** Histórias do mundo, cada uma com as cenas em ordem. */
export function storyIndex(w: World): Story[] {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const stories = w.entities.filter((e) => e.type === 'historia');
  return stories.map((s) => {
    const scenes: Scene[] = [];
    for (const e of w.entities) {
      if (e.type !== 'cena') continue;
      const rel = e.relations.find((r) => /^hist[oó]ria$/i.test(r.label.trim()));
      if (rel?.to !== s.path) continue;
      const linkTo = (label: RegExp) => e.relations.find((r) => label.test(r.label.trim()) && r.to)?.to ?? null;
      const cast = new Set<string>();
      for (const r of e.relations) {
        if (!r.to || r.to === s.path) continue;
        const t = byPath.get(r.to)?.type;
        if (t === 'personagem' || t === 'criatura' || t === 'divindade') cast.add(r.to);
      }
      const order = Number(prop(e, 'ordem', 'order').replace(',', '.'));
      scenes.push({
        entity: e, path: e.path, name: e.name, order: Number.isFinite(order) && prop(e, 'ordem', 'order') ? order : 9999, beat: prop(e, 'batida', 'beat') || null,
        status: statusOf(prop(e, 'status')), words: e.words, pov: linkTo(/^pov$|^ponto de vista$/i), local: linkTo(/^local$|^lugar$/i), cast: [...cast],
        date: prop(e, 'data'), goal: prop(e, 'objetivo'), conflict: prop(e, 'conflito'), outcome: prop(e, 'desfecho'),
      });
    }
    scenes.sort((a, c) => a.order - c.order || a.name.localeCompare(c.name, 'pt-BR'));
    const goal = Number(prop(s, 'meta', 'meta de palavras').replace(/\D/g, ''));
    return {
      entity: s, path: s.path, name: s.name, sheet: beatSheet(prop(s, 'estrutura')), goal: goal > 0 ? goal : null, scenes,
      words: scenes.reduce((n, c) => n + c.words, 0), folder: `${noteDir(s.path)}/${s.name}`,
    };
  });
}

/** Batida mais provável para a cena na posição `i` de `n`, pela estrutura. */
export function suggestBeat(sheet: BeatSheet, i: number, n: number): Beat {
  const pos = n <= 1 ? 0 : i / (n - 1);
  return [...sheet.beats].sort((a, c) => Math.abs(a.pos - pos) - Math.abs(c.pos - pos))[0]!;
}

/** Cenas agrupadas pela batida (as sem batida ficam em "sem batida"). */
export function scenesByBeat(story: Story): Array<{ beat: Beat | null; scenes: Scene[] }> {
  const sheet = story.sheet;
  if (!sheet) return [{ beat: null, scenes: story.scenes }];
  const out = sheet.beats.map((bt) => ({ beat: bt as Beat | null, scenes: [] as Scene[] }));
  const loose: Scene[] = [];
  for (const sc of story.scenes) {
    const k = sc.beat ? fold(sc.beat) : '';
    const g = out.find((o) => o.beat && (o.beat.id === k || fold(o.beat.nome) === k));
    if (g) g.scenes.push(sc);
    else loose.push(sc);
  }
  if (loose.length) out.push({ beat: null, scenes: loose });
  return out;
}

export function sceneTemplate(name: string, world: string, story: string, order: number, extra: { beat?: string; pov?: string; local?: string } = {}): string {
  const q = (v: string) => (/[:#[\]]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v);
  return `---
tipo: cena
mundo: ${world}
história: "[[${story}]]"
ordem: ${order}
batida: ${extra.beat ? q(extra.beat) : ''}
pov: ${extra.pov ? `"[[${extra.pov}]]"` : ''}
local: ${extra.local ? `"[[${extra.local}]]"` : ''}
status: ideia
objetivo:
conflito:
desfecho:
---
# ${name}

`;
}

export function storyTemplate(name: string, world: string, opts: { estrutura?: string; genero?: string; meta?: number; premissa?: string } = {}): string {
  return `---
tipo: história
mundo: ${world}
gênero: ${opts.genero ?? ''}
estrutura: ${opts.estrutura ?? 'tres-atos'}
ponto de vista:
meta: ${opts.meta ?? 80000}
status: planejando
---
# ${name}

## Premissa

${opts.premissa ?? ''}

## Sinopse

## Temas

## Notas
`;
}

/** Quem aparece em cada cena: linhas = personagens, colunas = cenas (true se aparece). */
export function castGrid(story: Story, w: World): Array<{ entity: Entity; scenes: boolean[]; povs: number }> {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const all = new Map<string, { entity: Entity; scenes: boolean[]; povs: number }>();
  story.scenes.forEach((sc, i) => {
    for (const p of sc.cast) {
      const e = byPath.get(p);
      if (!e) continue;
      let row = all.get(p);
      if (!row) all.set(p, (row = { entity: e, scenes: new Array<boolean>(story.scenes.length).fill(false), povs: 0 }));
      row.scenes[i] = true;
      if (sc.pov === p) row.povs++;
    }
  });
  return [...all.values()].sort((a, c) => c.scenes.filter(Boolean).length - a.scenes.filter(Boolean).length);
}

/** O manuscrito: as cenas em ordem, com o título de cada uma, num markdown só. */
export function manuscript(story: Story, read: (path: string) => string): string {
  const parts = [`# ${story.name}`, ''];
  let chapter = '';
  for (const sc of story.scenes) {
    const ch = asText(sc.entity.props['capítulo'] ?? sc.entity.props['capitulo']).trim();
    if (ch && ch !== chapter) {
      chapter = ch;
      parts.push(`## ${/^\d+$/.test(ch) ? `Capítulo ${ch}` : ch}`, '');
    }
    parts.push(`### ${sc.name}`, '');
    const body = bodyOf(read(sc.path)).replace(/^#\s+.*\n?/, '').trim();
    parts.push(body || '_(cena ainda sem texto)_', '');
  }
  return parts.join('\n');
}

/** Lugares e personagens do mundo que nenhuma cena usou ainda (material esperando). */
export function unusedInStory(story: Story, w: World): { personagens: Entity[]; lugares: Entity[] } {
  const used = new Set<string>();
  for (const sc of story.scenes) {
    for (const r of sc.entity.relations) if (r.to) used.add(r.to);
  }
  return {
    personagens: w.entities.filter((e) => e.type === 'personagem' && !used.has(e.path)),
    lugares: w.entities.filter((e) => e.type === 'lugar' && !used.has(e.path)),
  };
}

// ------------------------------------------------------------------ ideias de cena

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

/**
 * Ideias de cena feitas com o que o mundo tem: personagens (e o que querem,
 * temem e escondem), lugares, conflitos, itens. Cada ideia já vem com os
 * [[links]] para virar cena com um clique.
 */
export function scenePrompts(w: World, rng: Rng, n = 6): Array<{ text: string; pov: string | null; local: string | null }> {
  const pers = w.entities.filter((e) => e.type === 'personagem');
  const places = w.entities.filter((e) => e.type === 'lugar');
  const items = w.entities.filter((e) => e.type === 'item');
  const confs = w.entities.filter((e) => e.type === 'conflito' || e.type === 'faccao');
  const v = (e: Entity, k: string) => prop(e, k);
  const L = (e: Entity) => `[[${e.name}]]`;
  const out: Array<{ text: string; pov: string | null; local: string | null }> = [];
  const gens: Array<() => { text: string; pov: string | null; local: string | null } | null> = [
    () => {
      const a = pers.find((p) => v(p, 'segredo') && rng() < 0.7) ?? (pers.length ? pick(rng, pers) : null);
      if (!a || pers.length < 2) return null;
      const b2 = pick(rng, pers.filter((p) => p !== a));
      const sec = v(a, 'segredo') || 'um segredo que pode destruí-lo';
      return { text: `${L(b2)} descobre que ${L(a)} esconde ${sec.toLowerCase()}.`, pov: b2.name, local: null };
    },
    () => {
      const a = pers.length ? pick(rng, pers) : null;
      if (!a) return null;
      const m = v(a, 'motivação') || v(a, 'motivacao') || 'o que mais quer';
      const p = places.length ? pick(rng, places) : null;
      return { text: `${L(a)} chega perto de conseguir ${m.toLowerCase()}${p ? ` em ${L(p)}` : ''}, mas o preço é alto demais.`, pov: a.name, local: p?.name ?? null };
    },
    () => {
      const a = pers.length ? pick(rng, pers) : null;
      if (!a) return null;
      const f = v(a, 'medo') || 'o que mais teme';
      return { text: `${L(a)} é obrigado a enfrentar ${f.toLowerCase()}, na frente de quem mais quer impressionar.`, pov: a.name, local: null };
    },
    () => {
      if (!places.length || pers.length < 2) return null;
      const p = pick(rng, places);
      const a = pick(rng, pers);
      const b2 = pick(rng, pers.filter((x) => x !== a));
      return { text: `Dois que não se suportam, ${L(a)} e ${L(b2)}, ficam presos juntos em ${L(p)} por uma noite.`, pov: a.name, local: p.name };
    },
    () => {
      if (!items.length || !pers.length) return null;
      const it = pick(rng, items);
      const a = pick(rng, pers);
      return { text: `${L(it)} some, e todos suspeitam de ${L(a)}.`, pov: a.name, local: null };
    },
    () => {
      if (!confs.length || !pers.length) return null;
      const c = pick(rng, confs);
      const a = pick(rng, pers);
      return { text: `${L(a)} precisa escolher um lado em ${L(c)}, e qualquer escolha trai alguém.`, pov: a.name, local: null };
    },
    () => {
      if (!places.length) return null;
      const p = pick(rng, places);
      const a = pers.length ? pick(rng, pers) : null;
      return { text: `Algo que não devia estar em ${L(p)} aparece ao amanhecer${a ? `, e ${L(a)} é o primeiro a ver` : ''}.`, pov: a?.name ?? null, local: p.name };
    },
    () => {
      if (pers.length < 2) return null;
      const a = pick(rng, pers);
      const b2 = pick(rng, pers.filter((x) => x !== a));
      return { text: `Uma conversa em que ${L(a)} diz uma coisa e quer dizer outra, e ${L(b2)} percebe.`, pov: b2.name, local: null };
    },
  ];
  for (let k = 0; k < n * 6 && out.length < n; k++) {
    const g = pick(rng, gens)();
    if (g && !out.some((o) => o.text === g.text)) out.push(g);
  }
  return out;
}

/** Contagem de palavras de um texto (para a meta). */
export const countWords = (text: string): number => (bodyOf(text).match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** Valor de propriedade em lista (para personagens de uma cena). */
export const sceneList = (e: Entity, k: string): string[] => {
  const key = Object.keys(e.props).find((p) => fold(p) === fold(k));
  return key ? asList(e.props[key]) : [];
};
