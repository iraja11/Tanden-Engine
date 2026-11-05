import { seededRng, type Rng } from '../rpg/dice';
import { asText } from './frontmatter';
import { sameTitle } from './markdown';
import { tensionsOf } from './conflitos';
import { timeline, type Entity, type World } from './mundo';
import type { PropValue } from './frontmatter';
import type { RollTable } from '../rpg/tables';
import { Ent, Rules, type Program, type RuleIssue } from './regras';

/*
 * Simulação de facções: "e se o mundo andasse sozinho por 50 anos?"
 *
 * Cada facção começa com poder, riqueza e estabilidade (dos campos `poder`,
 * `riqueza`, `estabilidade`, de 1 a 10, ou estimados pelas ligações) e com
 * território (lugares cujo `governante`/`controle` aponta para ela, ou que ela
 * lista em `sede`/`território`). Inimizades e alianças vêm das ligações e dos
 * conflitos (`tensionsOf`).
 *
 * A cada ano cada facção age: cresce, ataca um inimigo, procura aliado, ou
 * afunda em crise. O acaso traz pragas, descobertas e heróis. Tudo sai como
 * crônica em português, com [[links]], pronta para virar nota ou evento.
 * A mesma semente dá a mesma história.
 */

export type SimKind = 'guerra' | 'batalha' | 'conquista' | 'alianca' | 'traicao' | 'paz' | 'crise' | 'sucessao' | 'prosperidade' | 'praga' | 'descoberta' | 'heroi' | 'queda' | 'regra';

export interface SimEvent {
  year: number;
  kind: SimKind;
  /** frase da crônica, com [[links]] */
  text: string;
  /** caminhos das fichas envolvidas */
  actors: string[];
  /** caminho do lugar, quando houver */
  place?: string;
  /** importância 1 a 3 (para filtrar a crônica) */
  weight: number;
}

export interface SimActor {
  path: string;
  name: string;
  power: number;
  wealth: number;
  stability: number;
  territory: string[];
  alive: boolean;
}

export interface SimOptions {
  seed: number;
  /** quantos anos simular */
  years?: number;
  /** 0 = mundo calmo, 1 = caos */
  chaos?: number;
  /** ano inicial; padrão: logo depois da última data do mundo */
  start?: number;
  /** regras do mundo (```regras): eventos, interações, campos que mudam */
  rules?: Program;
  /** bancos de texto (tabelas de rolagem do cofre) para `tabela("...")` */
  tables?: RollTable[];
  /** posição das fichas no mapa, para `distância(a, b)` */
  positions?: Map<string, { x: number; y: number }>;
}

export interface SimResult {
  start: number;
  end: number;
  seed: number;
  events: SimEvent[];
  /** poder de cada facção ao longo do tempo (para o gráfico) */
  history: Array<{ year: number; power: Record<string, number> }>;
  actors: SimActor[];
  /** por que não deu para simular, se for o caso */
  problem?: string;
  /** erros das regras durante a simulação */
  ruleIssues?: RuleIssue[];
  /** campos que as regras mudaram (para mostrar e, se quiser, aplicar nas fichas) */
  changes?: Array<{ path: string; props: Record<string, PropValue | null> }>;
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

/** Embaralha sem depender do sort do motor JS (WebKit e V8 ordenam diferente). */
function shuffle<T>(rng: Rng, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}
const L = (name: string) => `[[${name}]]`;

function field(e: Entity, ...keys: string[]): string {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) return asText(e.props[key]).trim();
  }
  return '';
}

function score(e: Entity, key: string, fallback: number): number {
  const n = Number(field(e, key).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(10, n) * 10 : fallback;
}

const OWN_PLACE = /^(governante|controle|dono|senhor|soberano|domínio|dominio)$/i;
const HOLDS = /^(sede|território|territorio|domínios|dominios|terras|capital)$/i;
const MEMBER = /^(afiliação|afiliacao|facção|faccao|ordem|membro de|lealdade)$/i;
const LEADER = /^(líder|lider|chefe|governante|mestre|rei|rainha)$/i;

/**
 * Quem controla cada lugar: `governante`/`controle` no lugar, ou
 * `sede`/`território` na facção. Cada lugar tem no máximo um dono.
 */
export function placeOwners(w: World): Map<string, string> {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const owner = new Map<string, string>();
  for (const e of w.entities) {
    if (e.type !== 'lugar') continue;
    const r = e.relations.find((x) => OWN_PLACE.test(x.label.trim()) && x.to && byPath.get(x.to)?.type === 'faccao');
    if (r) owner.set(e.path, r.to!);
  }
  for (const f of w.entities) {
    if (f.type !== 'faccao') continue;
    for (const r of f.relations) if (HOLDS.test(r.label.trim()) && r.to && byPath.get(r.to)?.type === 'lugar' && !owner.has(r.to)) owner.set(r.to, f.path);
  }
  return owner;
}

export function simulateWorld(w: World, opts: SimOptions): SimResult {
  const rng = seededRng(opts.seed);
  const chaos = Math.min(1, Math.max(0, opts.chaos ?? 0.5));
  const years = Math.max(1, Math.min(500, Math.round(opts.years ?? 50)));
  const dates = timeline(w);
  const last = dates.length ? Math.max(...dates.map((d) => d.end ?? d.at)) : 0;
  const start = opts.start ?? Math.floor(last) + 1;
  const empty = (problem: string): SimResult => ({ start, end: start, seed: opts.seed, events: [], history: [], actors: [], problem });

  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const factions = w.entities.filter((e) => e.type === 'faccao');
  const rules = opts.rules && (opts.rules.handlers.length || opts.rules.interactions.length) ? opts.rules : null;
  if (factions.length < 2 && !rules) return empty('A simulação precisa de pelo menos duas facções no mundo (ou de regras com "quando" e "interação").');

  const owner = placeOwners(w);
  const places = w.entities.filter((e) => e.type === 'lugar');
  const placeName = (p: string) => byPath.get(p)?.name ?? p;

  // ---- gente de cada facção (para as frases)
  const members = new Map<string, string[]>();
  const leader = new Map<string, string>();
  for (const e of w.entities) {
    if (e.type !== 'personagem' || /morto|morta|falecid/i.test(field(e, 'status'))) continue;
    for (const r of e.relations) {
      if (r.to && byPath.get(r.to)?.type === 'faccao' && MEMBER.test(r.label.trim())) members.set(r.to, [...(members.get(r.to) ?? []), e.name]);
    }
  }
  for (const f of factions) {
    const r = f.relations.find((x) => LEADER.test(x.label.trim()) && x.to && byPath.get(x.to)?.type === 'personagem');
    if (r) leader.set(f.path, byPath.get(r.to!)!.name);
  }

  // ---- estado inicial
  const actors: SimActor[] = factions.map((f) => {
    const territory = [...owner].filter(([, o]) => o === f.path).map(([p]) => p);
    const links = f.relations.filter((r) => r.to).length;
    return {
      path: f.path, name: f.name, territory, alive: true,
      power: score(f, 'poder', 30 + Math.min(25, links * 4) + territory.length * 6),
      wealth: score(f, 'riqueza', 40 + territory.length * 5),
      stability: score(f, 'estabilidade', 60),
    };
  });
  const A = new Map(actors.map((a) => [a.path, a]));

  // ---- posturas: -1 (guerra) .. +1 (aliança)
  const rel = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const relOf = (a: string, b: string) => rel.get(key(a, b)) ?? 0;
  // quando cada guerra começou: ninguém cansa de uma guerra de um ano
  const warSince = new Map<string, number>();
  let now = start;
  const setRel = (a: string, b: string, v: number) => {
    const k = key(a, b);
    const old = rel.get(k) ?? 0;
    const next = Math.max(-1, Math.min(1, v));
    if (old > -0.2 && next <= -0.2) warSince.set(k, now);
    rel.set(k, next);
  };
  const tired = (a: string, b: string) => now - (warSince.get(key(a, b)) ?? -Infinity) >= 3;
  const tensions = tensionsOf(w);
  const grudges = new Set(tensions.filter((t) => t.stance === 'hostil').map((t) => key(t.a, t.b)));
  for (const t of tensions) {
    if (!A.has(t.a) || !A.has(t.b)) continue;
    const v = Math.min(1, 0.3 + t.weight * 0.15);
    setRel(t.a, t.b, relOf(t.a, t.b) + (t.stance === 'hostil' ? -v : v));
  }
  // ninguém em guerra com ninguém: o acaso cria uma rivalidade (senão não há história)
  if (actors.length >= 2 && ![...rel.values()].some((v) => v < -0.2)) {
    const a = pick(rng, actors);
    const b = pick(rng, actors.filter((x) => x !== a));
    setRel(a.path, b.path, -0.4);
  }

  const events: SimEvent[] = [];
  const history: SimResult['history'] = [];
  const snap = (year: number) => history.push({ year, power: Object.fromEntries(actors.map((a) => [a.path, a.alive ? Math.round(a.power) : 0])) });
  let rt: Rules | null = null;
  const say = (year: number, kind: SimKind, text: string, actorsIn: string[], weight: number, place?: string) => {
    events.push({ year, kind, text, actors: actorsIn, weight, ...(place ? { place } : {}) });
    // cada acontecimento da simulação também é um evento para as regras: quando batalha(a, b):
    if (rt && kind !== 'regra') rt.emit(kind, [...actorsIn.map((p) => new Ent(p)), ...(place ? [new Ent(place)] : [])]);
  };
  if (rules) {
    const VIRTUAL: Record<string, 'power' | 'wealth' | 'stability'> = { poder: 'power', riqueza: 'wealth', estabilidade: 'stability' };
    rt = new Rules(rules, w, {
      rng, year: start, tables: opts.tables, positions: opts.positions, budget: 400_000,
      chronicle: (text, who) => say(now, 'regra', text, [...new Set(who)], 2),
      stance: (kind, a, b) => {
        if (!A.has(a) || !A.has(b)) return;
        setRel(a, b, kind === 'guerra' ? -0.8 : kind === 'alianca' ? 0.8 : 0);
        const [x, y] = [A.get(a)!.name, A.get(b)!.name];
        say(now, kind, kind === 'guerra' ? `${L(x)} declara guerra a ${L(y)}.` : kind === 'alianca' ? `${L(x)} e ${L(y)} se aliam.` : `${L(x)} e ${L(y)} fazem as pazes.`, [a, b], 3);
      },
      // poder, riqueza e estabilidade das facções moram na simulação (escala 1 a 10 das fichas)
      virtual: {
        get: (path, f) => (VIRTUAL[f] && A.get(path) ? Math.round(A.get(path)![VIRTUAL[f]] / 10 * 10) / 10 : undefined),
        set: (path, f, v) => {
          const a = A.get(path);
          if (!VIRTUAL[f] || !a || typeof v !== 'number') return false;
          a[VIRTUAL[f]] = Math.max(0, Math.min(VIRTUAL[f] === 'power' ? 400 : 100, v * 10));
          return true;
        },
      },
    });
  }
  const someone = (f: SimActor) => {
    const l = members.get(f.path);
    return l?.length ? L(pick(rng, l)) : null;
  };

  snap(start);
  rt?.emit('inicio');
  for (let i = 1; i <= years; i++) {
    const year = start + i;
    now = year;
    const alive = actors.filter((a) => a.alive);
    if (alive.length < 2 && !rt) break;
    // ordem aleatória a cada ano: ninguém tem a vantagem fixa de agir primeiro
    const order = shuffle(rng, [...alive]);

    for (const a of order) {
      if (!a.alive) continue;
      const wars = alive.filter((b) => b !== a && b.alive && relOf(a.path, b.path) < -0.2);
      // economia: território rende, guerra custa
      a.wealth = Math.max(0, Math.min(100, a.wealth + a.territory.length * 1.2 + a.stability * 0.03 - wars.length * 2.5 + (rng() - 0.5) * 4));
      a.stability = Math.max(0, Math.min(100, a.stability + (a.wealth > 30 ? 1 : -1.5) - wars.length * 0.8 + (rng() - 0.5) * 3 * (1 + chaos)));

      // quem está por baixo junta forças (resistência, exílio, recrutas)
      if (a.power < 25) a.power += 1.5 + rng() * 2;

      // ação do ano
      const options: Array<{ w: number; run: () => void }> = [];
      for (const b of wars) {
        const ratio = a.power / Math.max(1, b.power);
        options.push({ w: (-relOf(a.path, b.path)) * Math.min(2, ratio) * (0.25 + chaos * 0.6), run: () => battle(a, b, year) });
      }
      options.push({ w: a.wealth > 35 ? 0.9 : 0.3, run: () => grow(a, year) });
      const lonely = alive.filter((b) => b !== a && Math.abs(relOf(a.path, b.path)) < 0.25);
      if (wars.length && lonely.length) options.push({ w: 0.25, run: () => seekAlly(a, lonely, wars, year) });
      const weary = wars.filter((b) => tired(a.path, b.path));
      if (weary.length) options.push({ w: 0.08 + Math.max(0, 40 - a.wealth) / 200, run: () => sue(a, pick(rng, weary), year) });
      const total = options.reduce((s, o) => s + o.w, 0);
      let r = rng() * total;
      for (const o of options) {
        r -= o.w;
        if (r <= 0) {
          o.run();
          break;
        }
      }

      // crise interna
      if (a.alive && a.stability < 25 && rng() < 0.25 + chaos * 0.2) {
        const l = leader.get(a.path);
        if (l && rng() < 0.5) {
          leader.delete(a.path);
          say(year, 'sucessao', `${L(l)} é deposto. ${L(a.name)} mergulha numa disputa pela sucessão.`, [a.path], 3);
        } else {
          const who = someone(a);
          say(year, 'crise', pick(rng, [
            `Revoltas internas abalam ${L(a.name)}${who ? `; ${who} acusa os chefes de traição` : ''}.`,
            `${L(a.name)} se divide em duas alas que não se falam${who ? `; ${who} lidera os descontentes` : ''}.`,
            `Fome e impostos levam o povo de ${L(a.name)} às ruas.`,
            `Um escândalo de corrupção derruba metade dos conselheiros de ${L(a.name)}.`,
          ]), [a.path], 2);
        }
        a.power *= 0.85;
        a.stability = Math.min(100, a.stability + 20);
        if (a.territory.length > 1 && rng() < 0.4) {
          const lost = a.territory.splice(Math.floor(rng() * a.territory.length), 1)[0]!;
          say(year, 'crise', `${L(placeName(lost))} se declara livre de ${L(a.name)}.`, [a.path], 2, lost);
        }
      }
      if (a.alive && a.wealth > 80 && rng() < 0.15) {
        say(year, 'prosperidade', `Anos de fartura: ${L(a.name)} enriquece e ergue obras que serão lembradas.`, [a.path], 1);
        a.power += 5;
        a.wealth -= 15;
      }
    }

    // traição: aliados com motivo antigo de rancor
    for (const x of alive) {
      for (const y of alive) {
        if (!x.alive || !y.alive || x.path >= y.path || relOf(x.path, y.path) < 0.4) continue;
        const grudge = grudges.has(key(x.path, y.path));
        if (rng() < (grudge ? 0.05 : 0.01) * (0.5 + chaos)) {
          const [traitor, victim] = rng() < 0.5 ? [x, y] : [y, x];
          setRel(x.path, y.path, -0.8);
          say(year, 'traicao', `${L(traitor.name)} rompe a aliança e ataca ${L(victim.name)} pelas costas.`, [traitor.path, victim.path], 3);
          battle(traitor, victim, year, 1.25);
        }
      }
    }

    // acaso
    if (alive.some((a) => a.alive) && rng() < 0.05 + chaos * 0.12) {
      const roll = rng();
      const place = places.length ? pick(rng, places) : null;
      const hit = pick(rng, alive.filter((a) => a.alive));
      if (!hit) break;
      if (roll < 0.22) {
        const near = alive.filter((a) => (place && a.territory.includes(place.path)) || rng() < 0.4);
        for (const a of near) a.power *= 0.8;
        say(year, 'praga', `Uma peste ${place ? `começa em ${L(place.name)} e ` : ''}se espalha${near.length ? `, enfraquecendo ${near.map((a) => L(a.name)).join(', ')}` : ''}.`, near.map((a) => a.path), 2, place?.path);
      } else if (roll < 0.36) {
        hit.wealth = Math.max(0, hit.wealth - 20);
        say(year, 'praga', `${pick(rng, ['Um terremoto', 'Uma enchente', 'Uma seca de três anos', 'Um inverno sem fim'])} castiga as terras de ${L(hit.name)}${place ? `, de ${L(place.name)} em diante` : ''}.`, [hit.path], 2, place?.path);
      } else if (roll < 0.5) {
        const other = pick(rng, alive.filter((a) => a.alive && a !== hit));
        if (other && relOf(hit.path, other.path) > -0.5) {
          setRel(hit.path, other.path, relOf(hit.path, other.path) + 0.45);
          const bride = someone(hit);
          say(year, 'alianca', `Um casamento une famílias de ${L(hit.name)} e ${L(other.name)}${bride ? `; ${bride} está entre os noivos` : ''}.`, [hit.path, other.path], 2);
        }
      } else if (roll < 0.72) {
        hit.wealth = Math.min(100, hit.wealth + 25);
        say(year, 'descoberta', `${L(hit.name)} encontra ${pick(rng, ['uma mina de prata', 'uma rota comercial nova', 'ruínas cheias de saber antigo', 'um artefato esquecido', 'terras férteis além das montanhas'])}${place ? ` perto de ${L(place.name)}` : ''}.`, [hit.path], 1, place?.path);
      } else {
        const who = someone(hit);
        hit.power += 10;
        hit.stability = Math.min(100, hit.stability + 10);
        say(year, 'heroi', `${who ?? 'Uma figura até então desconhecida'} se destaca em ${L(hit.name)} e inspira uma geração.`, [hit.path], 2);
      }
    }

    // ambição: quem está forte e sem inimigos começa a cobiçar o vizinho
    for (const x of alive) {
      if (!x.alive || alive.some((y) => y !== x && y.alive && relOf(x.path, y.path) < -0.2)) continue;
      const rivals = alive.filter((y) => y !== x && y.alive && relOf(x.path, y.path) < 0.3);
      if (!rivals.length || rng() > 0.04 + chaos * 0.08) continue;
      const y = pick(rng, rivals);
      setRel(x.path, y.path, relOf(x.path, y.path) - 0.3);
      if (relOf(x.path, y.path) < -0.2) {
        const place = y.territory.length ? placeName(pick(rng, y.territory)) : null;
        say(year, 'guerra', pick(rng, [
          `${L(x.name)} acusa ${L(y.name)} de ${pick(rng, ['espionagem', 'roubar caravanas', 'abrigar traidores', 'violar um tratado antigo'])}. A guerra é declarada.`,
          `Uma disputa de fronteira${place ? ` em ${L(place)}` : ''} põe ${L(x.name)} e ${L(y.name)} em guerra.`,
        ]), [x.path, y.path], 3);
      }
    }

    // cansaço da guerra: inimigos esgotados fazem as pazes
    for (const x of alive) {
      for (const y of alive) {
        if (!x.alive || !y.alive || x.path >= y.path || relOf(x.path, y.path) > -0.2) continue;
        if (tired(x.path, y.path) && x.wealth < 25 && y.wealth < 35 && rng() < 0.2) {
          setRel(x.path, y.path, 0);
          say(year, 'paz', `Exaustos, ${L(x.name)} e ${L(y.name)} assinam uma trégua.`, [x.path, y.path], 2);
        }
      }
    }
    // as regras do ano (quando ano:) e as interações entre fichas
    rt?.tick(year);
    snap(year);
  }

  function battle(a: SimActor, b: SimActor, year: number, bonus = 1): void {
    if (!a.alive || !b.alive) return;
    const help = (x: SimActor) => actors.filter((c) => c.alive && c !== a && c !== b && relOf(c.path, x.path) > 0.4).reduce((s, c) => s + c.power * 0.25, 0);
    const atk = (a.power + help(a)) * (0.7 + rng() * 0.6) * bonus;
    const def = (b.power + help(b)) * (0.7 + rng() * 0.6) * 1.1;
    const [win, lose] = atk > def ? [a, b] : [b, a];
    const margin = Math.abs(atk - def) / Math.max(atk, def);
    lose.power *= 0.82 - margin * 0.15;
    win.power *= 0.93;
    win.stability = Math.min(100, win.stability + 4);
    lose.stability -= 6;
    setRel(a.path, b.path, relOf(a.path, b.path) - 0.1);
    const hero = someone(win);
    const site = lose.territory.length ? pick(rng, lose.territory) : null;
    if (site && margin > 0.15) {
      lose.territory.splice(lose.territory.indexOf(site), 1);
      win.territory.push(site);
      say(year, 'conquista', `${L(win.name)} toma ${L(placeName(site))} de ${L(lose.name)}${hero ? `, com ${hero} à frente` : ''}.`, [win.path, lose.path], 3, site);
    } else {
      const where = site ? ` em ${L(placeName(site))}` : '';
      const text = win === a
        ? pick(rng, [`${L(a.name)} ataca ${L(b.name)}${where} e vence${margin < 0.1 ? ' por pouco' : ''}.`, `${L(a.name)} derrota ${L(b.name)}${where}${hero ? `; ${hero} vira lenda naquele dia` : ''}.`])
        : pick(rng, [`${L(a.name)} ataca ${L(b.name)}${where}, mas é repelido${margin < 0.1 ? ' por pouco' : ''}.`, `O ataque de ${L(a.name)}${where} termina em desastre diante de ${L(b.name)}.`]);
      say(year, 'batalha', text, [a.path, b.path], margin > 0.3 ? 2 : 1, site ?? undefined);
    }
    if (lose.power < 6 && !lose.territory.length && rng() < 0.5) {
      lose.alive = false;
      say(year, 'queda', `${L(lose.name)} deixa de existir. Os últimos membros se dispersam ou juram lealdade a ${L(win.name)}.`, [lose.path, win.path], 3);
    }
  }

  function grow(a: SimActor, year: number): void {
    const spend = Math.min(a.wealth, 10 + rng() * 10);
    a.wealth -= spend;
    a.power += spend * 0.6;
    const free = places.filter((p) => !actors.some((x) => x.territory.includes(p.path)));
    if (free.length && rng() < 0.12) {
      const p = pick(rng, free);
      a.territory.push(p.path);
      say(year, 'conquista', `${L(a.name)} estende sua influência sobre ${L(p.name)}.`, [a.path], 2, p.path);
    }
  }

  function seekAlly(a: SimActor, lonely: SimActor[], wars: SimActor[], year: number): void {
    const b = pick(rng, lonely);
    const common = wars.some((e) => relOf(b.path, e.path) < 0);
    if (rng() < (common ? 0.7 : 0.35)) {
      setRel(a.path, b.path, 0.7);
      say(year, 'alianca', `${L(a.name)} e ${L(b.name)} selam uma aliança${common ? ' contra um inimigo comum' : ''}.`, [a.path, b.path], 2);
    }
  }

  function sue(a: SimActor, b: SimActor, year: number): void {
    if (rng() < 0.5) {
      setRel(a.path, b.path, relOf(a.path, b.path) + 0.5);
      say(year, 'paz', `${L(a.name)} propõe paz a ${L(b.name)}, que aceita${rng() < 0.5 ? ' a contragosto' : ''}.`, [a.path, b.path], 2);
    }
  }

  // primeira guerra declarada: marca na crônica
  const firstWar = events.find((e) => e.kind === 'batalha' || e.kind === 'conquista' || e.kind === 'traicao' || e.kind === 'guerra');
  if (firstWar && (firstWar.kind === 'batalha' || firstWar.kind === 'conquista')) {
    const [a, b] = firstWar.actors.map((p) => A.get(p)?.name ?? p);
    if (a && b) events.splice(events.indexOf(firstWar), 0, { year: firstWar.year, kind: 'guerra', text: `Começa a guerra entre ${L(a)} e ${L(b)}.`, actors: firstWar.actors, weight: 3 });
  }

  return {
    start, end: history[history.length - 1]!.year, seed: opts.seed, events, history, actors,
    ...(rt ? { ruleIssues: rt.issues, changes: rt.changes() } : {}),
  };
}

/** A crônica como Markdown (para salvar como nota). */
export function chronicleMarkdown(w: World, r: SimResult, minWeight = 1): string {
  const lines = [`---`, `semente: ${r.seed}`, `de: ${r.start}`, `até: ${r.end}`, `tags: [simulação]`, `---`, `# Crônica simulada de ${w.name} (${r.start}–${r.end})`, '',
    '> [!nota] Simulação', `> Gerada pelo Tanden com a semente ${r.seed}. Não é cânone até você decidir que é.`, ''];
  let year: number | null = null;
  for (const e of r.events) {
    if (e.weight < minWeight) continue;
    if (e.year !== year) {
      year = e.year;
      lines.push('', `## ${year}`, '');
    }
    lines.push(`- ${e.text}`);
  }
  lines.push('', '## Como terminou', '');
  for (const a of [...r.actors].sort((x, y) => y.power - x.power)) {
    lines.push(`- ${L(a.name)}: ${a.alive ? `poder ${Math.round(a.power)}, ${a.territory.length} ${a.territory.length === 1 ? 'território' : 'territórios'}` : 'caiu'}`);
  }
  return `${lines.join('\n')}\n`;
}
