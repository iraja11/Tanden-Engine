import { seededRng } from '../rpg/dice';
import { asList, asText } from './frontmatter';
import { getSection, linkTarget, parseTable, sameTitle, setSectionTable, type Table } from './markdown';
import type { Entity, World } from './mundo';

/*
 * Economia do mundo: moedas, preços, recursos, rotas e quem controla o quê.
 *
 * Nada aqui é guardado à parte. As moedas são fichas (`tipo: moeda`, com
 * `valor` em relação às outras), os recursos também (`tipo: recurso`, com
 * `valor` e `produzido em`), e os lugares dizem o que têm e o que falta:
 *
 *   recursos: "[[Sal]], madeira"
 *   precisa: "[[Ferro]]"
 *
 * Do cruzamento sai o mercado: escassez e preço local de cada recurso, as
 * rotas comerciais (de quem produz para quem precisa, a mais curta pelo mapa),
 * os monopólios e a riqueza de cada facção pelo território que controla.
 * A tabela de preços do dia a dia mora na nota do mundo, seção "Preços".
 */

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asText(e.props[key]).trim();
      if (v) return v;
    }
  }
  return '';
};
const plain = (s: string) => s.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a: string) => linkTarget(a)).trim();

/** "1.200", "1,5 mil", "3k", "12" → número. */
export function numeroDe(raw: string): number | null {
  const s = fold(raw).replace(/\s+/g, ' ');
  const m = /(-?\d[\d.]*(?:,\d+)?)\s*(mil|k|milhao|milhoes|mi|bilhao|bilhoes|bi)?\b/.exec(s);
  if (!m) return null;
  let txt = m[1]!;
  // "1.200" é milhar; "1.5" é decimal quando não há três dígitos depois do ponto
  if (/\.\d{3}(\D|$)/.test(txt)) txt = txt.replace(/\./g, '');
  const n = Number(txt.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === 'mil' || m[2] === 'k' ? 1e3 : m[2]?.startsWith('mi') ? 1e6 : m[2]?.startsWith('bi') ? 1e9 : 1;
  return n * mult;
}

// ------------------------------------------------------------------ moedas

export interface Moeda {
  e: Entity;
  nome: string;
  /** quanto vale em unidades da moeda base */
  valor: number;
  simbolo: string;
  material: string;
  emissor: Entity | null;
}

export function moedasDoMundo(w: World): Moeda[] {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const out = w.entities.filter((e) => e.type === 'moeda').map((e) => {
    const em = e.relations.find((r) => r.to && /^(emissor|cunhada por|banco|emitida por)$/.test(fold(r.label)));
    return {
      e, nome: e.name, valor: Math.max(0.0001, numeroDe(prop(e, 'valor', 'vale')) ?? 1), simbolo: plain(prop(e, 'símbolo', 'simbolo', 'sigla')),
      material: plain(prop(e, 'material')), emissor: em ? byPath.get(em.to!) ?? null : null,
    };
  });
  return out.sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** A moeda de referência: a que vale 1, ou a menor. */
export function moedaBase(ms: Moeda[]): Moeda | null {
  return ms.find((m) => m.valor === 1) ?? ms[ms.length - 1] ?? null;
}

export const converter = (n: number, de: Moeda, para: Moeda): number => (n * de.valor) / para.valor;

const arred = (n: number) => (n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);

/** Um preço em unidades da base, dito nas moedas do mundo: "2 coroas e 5 pratas". */
export function formatarPreco(n: number, ms: Moeda[]): string {
  if (!Number.isFinite(n)) return '—';
  if (!ms.length) return `${arred(n).toLocaleString('pt-BR')} ${n === 1 ? 'moeda' : 'moedas'}`;
  const ordem = [...ms].sort((a, b) => b.valor - a.valor);
  const partes: string[] = [];
  let resto = n;
  for (const m of ordem) {
    if (partes.length >= 2) break;
    const q = Math.floor(resto / m.valor + 1e-9);
    if (q >= 1) {
      partes.push(`${q.toLocaleString('pt-BR')} ${m.simbolo || m.nome.toLowerCase()}`);
      resto -= q * m.valor;
    }
  }
  if (!partes.length) {
    const menor = ordem[ordem.length - 1]!;
    return `${arred(n / menor.valor).toLocaleString('pt-BR')} ${menor.simbolo || menor.nome.toLowerCase()}`;
  }
  return partes.join(' e ');
}

// ------------------------------------------------------------------ preços do dia a dia

export const SECAO_PRECOS = 'Preços';

/** Cesta de referência, em unidades da moeda base (1 = um pão). */
export const CESTA_PADRAO: Array<[string, number]> = [
  ['Pão', 1], ['Caneca de cerveja', 2], ['Refeição quente', 4], ['Diária de um trabalhador', 8], ['Noite na estalagem', 10],
  ['Remédio comum', 25], ['Roupa nova', 40], ['Livro', 120], ['Espada', 300], ['Cavalo', 1500], ['Casa simples', 20000],
];

export interface Preco {
  item: string;
  /** em unidades da base */
  preco: number;
  /** veio da cesta padrão, não da nota */
  padrao: boolean;
}

/** Lê "3", "3 pratas", "1 coroa e 4 pratas" em unidades da base. */
export function lerPreco(raw: string, ms: Moeda[]): number | null {
  const s = fold(raw);
  if (!s) return null;
  let total = 0;
  let achou = false;
  for (const parte of s.split(/\s+e\s+|,|\+/)) {
    const n = numeroDe(parte);
    if (n === null) continue;
    const m = ms.find((x) => { const nome = fold(x.nome); const sim = fold(x.simbolo); return (sim && new RegExp(`\\b${sim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(parte)) || parte.includes(nome) || parte.includes(nome.replace(/s$/, '')); });
    total += n * (m?.valor ?? 1);
    achou = true;
  }
  return achou ? total : null;
}

export function precosDoMundo(textoMundo: string, ms: Moeda[]): Preco[] {
  const sec = getSection(textoMundo, SECAO_PRECOS);
  const t = sec === null ? null : parseTable(sec);
  if (!t || !t.rows.length) return CESTA_PADRAO.map(([item, preco]) => ({ item, preco, padrao: true }));
  const out: Preco[] = [];
  for (const r of t.rows) {
    const item = (r[0] ?? '').trim();
    const preco = lerPreco(r[1] ?? '', ms);
    if (item && preco !== null) out.push({ item, preco, padrao: false });
  }
  return out;
}

/** Grava a tabela de preços na nota do mundo (seção "Preços"). */
export function gravarPrecos(textoMundo: string, precos: Array<{ item: string; preco: number }>, ms: Moeda[]): string {
  const base = moedaBase(ms);
  const t: Table = { header: ['Item', 'Preço'], rows: precos.map((p) => [p.item, `${arred(p.preco)}${base ? ` ${base.simbolo || base.nome.toLowerCase()}` : ''}`]) };
  return setSectionTable(textoMundo, SECAO_PRECOS, t);
}

/** Quantos dias de trabalho cada item custa: a medida mais honesta de riqueza. */
export function diasDeTrabalho(precos: Preco[]): Map<string, number> {
  const diaria = precos.find((p) => /diaria|salario|jornada|dia de trabalho/.test(fold(p.item)))?.preco ?? 8;
  return new Map(precos.map((p) => [p.item, Math.round((p.preco / diaria) * 10) / 10]));
}

// ------------------------------------------------------------------ mercado

export interface Recurso {
  /** chave sem acento */
  id: string;
  nome: string;
  e: Entity | null;
  valor: number | null;
  categoria: string;
  produtores: Entity[];
  consumidores: Entity[];
  /** (consumidores + 1) ÷ (produtores + 1), de 0,25 a 4 */
  escassez: number;
  tendencia: Tendencia;
  controle: Array<{ faccao: Entity; parte: number }>;
  monopolio: Entity | null;
}

export type Tendencia = 'alta' | 'estavel' | 'baixa';
/** Rótulo de interface de cada tendência de preço. */
export const ROTULO_TENDENCIA: Record<Tendencia, string> = { alta: 'em alta', estavel: 'estável', baixa: 'em baixa' };

export interface Rota {
  recurso: string;
  de: Entity;
  para: Entity;
  /** distância no mapa, em unidades do mapa, quando os dois estão marcados */
  distancia: number | null;
  /** facção que controla a origem */
  controle: Entity | null;
}

export interface RiquezaFaccao {
  faccao: Entity;
  pontos: number;
  recursos: string[];
  monopolios: string[];
  moedas: string[];
}

export interface Mercado {
  recursos: Recurso[];
  rotas: Rota[];
  riqueza: RiquezaFaccao[];
  /** recursos citados nos lugares que ainda não têm ficha */
  semFicha: string[];
  /** lugares sem nada a oferecer nem a pedir */
  parados: Entity[];
}

const RE_PRODUZ = /^(recursos?|produz|produtos?|exporta|riquezas?|minas?|colheitas?)$/;
const RE_PRECISA = /^(precisa|importa|falta|faltam|necessidades?|carencias?)$/;
const RE_PRODUZIDO = /^(produzido em|produzida em|origem|produtores?|extraido em|minas em|colhido em)$/;
const RE_CONSUMIDO = /^(consumido em|consumida em|consumidores?|mercados?|vendido em)$/;

/** Itens de uma lista que mistura [[links]] e texto solto. */
function itens(v: string[]): string[] {
  const out: string[] = [];
  for (const x of v) for (const p of x.split(/,(?![^[]*\]\])/)) { const t = plain(p); if (t) out.push(t); }
  return out;
}

/** Facção que manda num lugar: `controle`/`governante` do lugar, o território de uma facção, ou o do lugar maior. */
export function donoDoLugar(w: World, lugar: Entity, byPath = new Map(w.entities.map((e) => [e.path, e]))): Entity | null {
  const territorio = new Map<string, Entity>();
  for (const f of w.entities) {
    if (f.type !== 'faccao') continue;
    for (const r of f.relations) if (r.to && /^(territorio|sede|terras|dominios?)$/.test(fold(r.label)) && !territorio.has(r.to)) territorio.set(r.to, f);
  }
  let atual: Entity | undefined = lugar;
  for (let i = 0; atual && i < 6; i++) {
    const c = atual.relations.find((r) => r.to && /^(controle|governante|dono|senhor|controlado por)$/.test(fold(r.label)) && byPath.get(r.to)?.type === 'faccao');
    if (c) return byPath.get(c.to!)!;
    const t = territorio.get(atual.path);
    if (t) return t;
    const pai: Entity['relations'][number] | undefined = atual.relations.find((r) => r.to && /^parte de$/.test(fold(r.label)));
    atual = pai ? byPath.get(pai.to!) : undefined;
  }
  return null;
}

export function mercado(w: World, posicoes?: Map<string, { x: number; y: number }>): Mercado {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const lugares = w.entities.filter((e) => e.type === 'lugar');
  const fichas = w.entities.filter((e) => e.type === 'recurso');
  const porNome = new Map<string, Entity>();
  for (const r of fichas) for (const n of [r.name, ...r.aliases]) porNome.set(fold(n), r);

  const recs = new Map<string, { nome: string; e: Entity | null; prod: Set<string>; cons: Set<string> }>();
  const pegar = (nome: string) => {
    const f = porNome.get(fold(nome));
    const id = f ? fold(f.name) : fold(nome);
    let r = recs.get(id);
    if (!r) recs.set(id, (r = { nome: f?.name ?? nome.charAt(0).toUpperCase() + nome.slice(1), e: f ?? null, prod: new Set(), cons: new Set() }));
    return r;
  };
  for (const f of fichas) {
    const r = pegar(f.name);
    for (const rel of f.relations) {
      if (!rel.to || byPath.get(rel.to)?.type !== 'lugar') continue;
      if (RE_PRODUZIDO.test(fold(rel.label))) r.prod.add(rel.to);
      if (RE_CONSUMIDO.test(fold(rel.label))) r.cons.add(rel.to);
    }
  }
  for (const l of lugares) {
    for (const [k, v] of Object.entries(l.props)) {
      const kk = fold(k);
      const lado = RE_PRODUZ.test(kk) ? 'prod' : RE_PRECISA.test(kk) ? 'cons' : null;
      if (!lado) continue;
      for (const nome of itens(asList(v))) pegar(nome)[lado].add(l.path);
    }
  }

  const ent = (ps: Set<string>) => [...ps].map((p) => byPath.get(p)).filter((x): x is Entity => !!x);
  const recursos: Recurso[] = [];
  const rotas: Rota[] = [];
  const dono = new Map<string, Entity | null>();
  const donoDe = (l: Entity) => { if (!dono.has(l.path)) dono.set(l.path, donoDoLugar(w, l, byPath)); return dono.get(l.path)!; };
  const dist = (a: Entity, b: Entity) => {
    const pa = posicoes?.get(a.path);
    const pb = posicoes?.get(b.path);
    return pa && pb ? Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y) * 10) / 10 : null;
  };

  for (const [id, r] of recs) {
    const produtores = ent(r.prod);
    const consumidores = ent(r.cons).filter((c) => !r.prod.has(c.path));
    const escassez = Math.max(0.25, Math.min(4, (consumidores.length + 1) / (produtores.length + 1)));
    const conta = new Map<string, { faccao: Entity; n: number }>();
    for (const p of produtores) { const f = donoDe(p); if (f) conta.set(f.path, { faccao: f, n: (conta.get(f.path)?.n ?? 0) + 1 }); }
    const controle = [...conta.values()].map((x) => ({ faccao: x.faccao, parte: x.n / produtores.length })).sort((a, b) => b.parte - a.parte);
    const unico = controle.length === 1 && controle[0]!.parte === 1 ? controle[0]!.faccao : null;
    const monopolio = unico && (produtores.length >= 2 || consumidores.length >= 1) ? unico : null;
    recursos.push({
      id, nome: r.nome, e: r.e, valor: r.e ? numeroDe(prop(r.e, 'valor', 'preço', 'preco')) : null, categoria: r.e ? plain(prop(r.e, 'categoria')) : '',
      produtores, consumidores, escassez: Math.round(escassez * 100) / 100, tendencia: escassez > 1.25 ? 'alta' : escassez < 0.8 ? 'baixa' : 'estavel', controle, monopolio,
    });
    for (const c of consumidores) {
      if (!produtores.length) continue;
      const perto = [...produtores].sort((a, b) => (dist(a, c) ?? 1e9) - (dist(b, c) ?? 1e9))[0]!;
      rotas.push({ recurso: r.nome, de: perto, para: c, distancia: dist(perto, c), controle: donoDe(perto) });
    }
  }
  recursos.sort((a, b) => b.escassez - a.escassez || a.nome.localeCompare(b.nome, 'pt-BR'));

  const riqueza = new Map<string, RiquezaFaccao>();
  const da = (f: Entity) => {
    let x = riqueza.get(f.path);
    if (!x) riqueza.set(f.path, (x = { faccao: f, pontos: (numeroDe(prop(f, 'riqueza')) ?? 0) * 10, recursos: [], monopolios: [], moedas: [] }));
    return x;
  };
  for (const f of w.entities) if (f.type === 'faccao') da(f);
  for (const r of recursos) {
    for (const c of r.controle) {
      const x = da(c.faccao);
      x.pontos += Math.round((r.valor ?? 10) * c.parte * r.produtores.length * Math.max(1, r.escassez));
      x.recursos.push(r.nome);
    }
    if (r.monopolio) { const x = da(r.monopolio); x.monopolios.push(r.nome); x.pontos += 40; }
  }
  for (const m of moedasDoMundo(w)) if (m.emissor && m.emissor.type === 'faccao') { const x = da(m.emissor); x.moedas.push(m.nome); x.pontos += 50; }

  const usados = new Set<string>();
  for (const r of recs.values()) { for (const p of r.prod) usados.add(p); for (const c of r.cons) usados.add(c); }
  return {
    recursos,
    rotas,
    riqueza: [...riqueza.values()].sort((a, b) => b.pontos - a.pontos),
    semFicha: recursos.filter((r) => !r.e).map((r) => r.nome),
    parados: lugares.filter((l) => !usados.has(l.path)),
  };
}

/** Preço de um recurso num lugar: barato onde nasce, caro onde falta e longe de quem produz. */
export function precoLocal(r: Recurso, lugar: Entity, rotas: Rota[] = [], escala = 1000): number | null {
  if (r.valor === null) return null;
  if (r.produtores.some((p) => p.path === lugar.path)) return arred(r.valor * 0.7);
  if (r.consumidores.some((c) => c.path === lugar.path)) {
    const rota = rotas.find((x) => x.recurso === r.nome && x.para.path === lugar.path);
    const longe = rota?.distancia ? Math.min(1.5, rota.distancia / Math.max(1, escala)) : 0.3;
    return arred(r.valor * (1 + 0.3 * r.escassez) * (1 + longe));
  }
  return arred(r.valor * Math.sqrt(r.escassez));
}

/** O pregão do dia: uma cotação que oscila com a escassez e um pouco de sorte (é só cenário, não grava nada). */
export function cotacaoDoDia(r: Recurso, dia: string): { preco: number | null; variacao: number } {
  let h = 2166136261;
  for (const c of `${dia}:${r.id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const ruido = (seededRng(h >>> 0)() - 0.5) * 6;
  const variacao = Math.round(((r.escassez - 1) * 4 + ruido) * 10) / 10;
  return { preco: r.valor === null ? null : arred(r.valor * (1 + variacao / 100)), variacao };
}

/** Recursos que uma ficha de lugar oferece e pede (para o cartão do lugar). */
export function trocasDoLugar(m: Mercado, lugar: Entity): { produz: Recurso[]; precisa: Recurso[] } {
  return {
    produz: m.recursos.filter((r) => r.produtores.some((p) => p.path === lugar.path)),
    precisa: m.recursos.filter((r) => r.consumidores.some((c) => c.path === lugar.path)),
  };
}
