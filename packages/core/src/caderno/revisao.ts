import { asList, asText } from './frontmatter';
import { sameTitle, wikiLinks } from './markdown';
import { conflictsOf, tensionsOf } from './conflitos';
import { parseWorldDate, typeInfo, type Entity, type World } from './mundo';

/*
 * Revisão do mundo: o que está contraditório, solto ou faltando.
 *
 *   erro   — contradição de datas (morreu antes de nascer, lutou depois de morto)
 *   aviso  — provável deslize (nomes repetidos, filho depois da morte do pai)
 *   ideia  — o que deixaria o mundo mais vivo (ficha sem ligação, links sem ficha)
 *
 * Nada aqui muda as notas; a tela mostra e oferece o atalho.
 */

export type IssueLevel = 'erro' | 'aviso' | 'ideia';

export interface Issue {
  level: IssueLevel;
  /** ficha onde está o problema */
  path: string;
  message: string;
  /** atalho: criar a ficha que falta */
  create?: { name: string; type: string };
}

const field = (e: Entity, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asText(e.props[key]).trim();
      if (v) return v;
    }
  }
  return '';
};

const date = (e: Entity, ...keys: string[]): { n: number; raw: string } | null => {
  const raw = field(e, ...keys);
  const n = raw ? parseWorldDate(raw) : null;
  return n === null ? null : { n, raw };
};

const BORN = ['nascimento', 'nasceu', 'fundação', 'fundacao', 'criação', 'início', 'inicio', 'data'];
const DIED = ['morte', 'morreu', 'queda', 'dissolução', 'fim'];
const PARENT = /^(pai|mãe|mae|genitor|genitora|pais|progenitor)$/i;

/** Tipo provável de uma ficha que ainda não existe, pelo campo que aponta para ela. */
function guessType(label: string): string {
  const l = label.toLowerCase();
  if (/local|lugar|origem|sede|parte de|regi|cidade|habitat|territ/.test(l)) return 'lugar';
  if (/afilia|fac|ordem|grupo|guild|organiza|lados/.test(l)) return 'faccao';
  if (/espécie|especie|raça|raca/.test(l)) return 'especie';
  if (/cultura|povo/.test(l)) return 'cultura';
  if (/item|arma|artefato/.test(l)) return 'item';
  if (/magia|conceito|idioma|religi/.test(l)) return 'conceito';
  return 'personagem';
}

export function reviewWorld(w: World): Issue[] {
  const out: Issue[] = [];
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const lived = (e: Entity) => ({ born: date(e, ...BORN), died: date(e, ...DIED) });

  for (const e of w.entities) {
    const { born, died } = lived(e);
    // nasceu depois de morrer
    if (born && died && died.n < born.n) {
      out.push({ level: 'erro', path: e.path, message: `${e.name}: ${typeInfo(e.type).label === 'Facção' ? 'acaba' : 'morre'} (${died.raw}) antes de começar (${born.raw}).` });
    }

    // idade além do que a espécie vive
    if (e.type === 'personagem' && born) {
      const sp = e.relations.find((r) => sameTitle(r.label, 'espécie') || sameTitle(r.label, 'especie') || sameTitle(r.label, 'raça'));
      const species = sp?.to ? byPath.get(sp.to) : undefined;
      const life = species ? Number(field(species, 'expectativa de vida', 'longevidade').replace(/[^\d.]/g, '')) : NaN;
      const end = died?.n ?? latestDate(w);
      if (Number.isFinite(life) && life > 0 && end !== null && end - born.n > life * 1.5) {
        out.push({ level: 'aviso', path: e.path, message: `${e.name} chega a ${Math.round(end - born.n)} anos, mas ${species!.name} vive cerca de ${life}. Magia, maldição ou erro de data?` });
      }
    }

    // filho nascido depois da morte do pai/mãe (com folga de um ano)
    if (born) {
      for (const r of e.relations) {
        if (!PARENT.test(r.label.trim()) || !r.to) continue;
        const p = byPath.get(r.to);
        const pd = p ? lived(p) : null;
        if (pd?.died && born.n > pd.died.n + 1) out.push({ level: 'aviso', path: e.path, message: `${e.name} nasce (${born.raw}) depois da morte de ${p!.name} (${pd.died.raw}).` });
        if (pd?.born && born.n < pd.born.n) out.push({ level: 'erro', path: e.path, message: `${e.name} nasce (${born.raw}) antes de ${p!.name} (${pd.born.raw}).` });
      }
    }

    // participantes vivos na data do evento
    if (e.type === 'evento' || e.type === 'conflito') {
      const when = date(e, 'data', 'início', 'inicio');
      if (when) {
        for (const r of e.relations) {
          if (!r.to || r.label === 'menciona') continue;
          const p = byPath.get(r.to);
          if (!p || p.type !== 'personagem') continue;
          const pl = lived(p);
          if (pl.died && when.n > pl.died.n) out.push({ level: 'erro', path: e.path, message: `${p.name} participa de ${e.name} (${when.raw}), mas já tinha morrido (${pl.died.raw}).` });
          else if (pl.born && when.n < pl.born.n) out.push({ level: 'erro', path: e.path, message: `${p.name} participa de ${e.name} (${when.raw}) antes de nascer (${pl.born.raw}).` });
        }
      }
    }

    // links para fichas que não existem: viram atalho de criação
    const missing = new Map<string, string>();
    for (const r of e.relations) if (!r.to && !/\.[a-z0-9]{2,5}$/i.test(r.target)) missing.set(r.target, r.label);
    for (const [target, label] of missing) {
      out.push({ level: 'ideia', path: e.path, message: `${e.name} cita [[${target}]], que ainda não tem ficha.`, create: { name: target, type: label === 'menciona' ? 'personagem' : guessType(label) } });
    }
  }

  // aliados que também estão em guerra: traição? (ideia, não erro)
  const ts = tensionsOf(w);
  for (const t of ts) {
    if (t.stance !== 'aliado') continue;
    const war = ts.find((x) => x.stance === 'hostil' && x.a === t.a && x.b === t.b);
    if (war) {
      const a = byPath.get(t.a)!;
      const b = byPath.get(t.b)!;
      out.push({ level: 'ideia', path: a.path, message: `${a.name} e ${b.name} são aliados e inimigos ao mesmo tempo (${[...t.sources, ...war.sources].join(', ')}). Traição em curso? Vale escrever.` });
    }
  }

  // conflito com um lado só
  for (const c of conflictsOf(w)) {
    if (c.sides.length < 2) out.push({ level: 'aviso', path: c.path, message: `${c.name} tem ${c.sides.length ? 'só um lado' : 'nenhum lado'}. Preencha "lados" com [[A]], [[B]].` });
  }

  // nomes ou apelidos repetidos confundem os [[links]]
  const names = new Map<string, Entity[]>();
  for (const e of w.entities) {
    for (const n of [e.name, ...e.aliases]) {
      const k = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const l = names.get(k) ?? [];
      if (!l.includes(e)) l.push(e);
      names.set(k, l);
    }
  }
  for (const [, l] of names) {
    if (l.length > 1) out.push({ level: 'aviso', path: l[1]!.path, message: `${l.map((e) => e.name).join(' e ')} usam o mesmo nome ou apelido; um [[link]] pode cair na ficha errada.` });
  }

  // fichas soltas e vazias
  const cited = new Set(w.relations.map((r) => r.to));
  for (const e of w.entities) {
    if (e.type === 'mapa') continue;
    if (!e.relations.some((r) => r.to) && !cited.has(e.path)) out.push({ level: 'ideia', path: e.path, message: `${e.name} não se liga a nada. Quem conhece, onde fica, a quem serve?` });
    else if (!e.summary && e.words < 5) out.push({ level: 'ideia', path: e.path, message: `${e.name} ainda não tem texto. Uma frase já ajuda nos cartões e no grafo.` });
  }

  const rank: Record<IssueLevel, number> = { erro: 0, aviso: 1, ideia: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

function latestDate(w: World): number | null {
  let max: number | null = null;
  for (const e of w.entities) {
    for (const [k, v] of Object.entries(e.props)) {
      if (!/data|fim|morte|nascimento|início|inicio|fundação/i.test(k)) continue;
      for (const x of asList(v)) {
        if (wikiLinks(x).length) continue;
        const n = parseWorldDate(x);
        if (n !== null && (max === null || n > max)) max = n;
      }
    }
  }
  return max;
}
