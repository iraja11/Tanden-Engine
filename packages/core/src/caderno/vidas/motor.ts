import { seededRng, type Rng } from '../../rpg/dice';
import type { RollTable } from '../../rpg/tables';
import { hash53 } from '../../hash';
import { asText } from '../frontmatter';
import type { Entity, World } from '../mundo';
import { fold, type Program, type RuleFilter, type RuleIssue } from '../regras/parse';
import { Ent, Rules, type Val } from '../regras/run';
import { catalogo, especieId, etniaDoTexto, nomeProf, nomeTraco, ATIVIDADE, type Catalogo, type Especie, type Etnia, type Item, type Profissao } from './catalogo';
import { ACONTECIMENTOS, ESTADOS_VIDA, acasoDoMes, type Acontecimento } from './acontecimentos';
import { Guerras } from './guerras';
import { atributos, alturaDe, cabeloDe, consanguinidade, herdar, olhosDe, tracosDosGenes } from './genetica';
import { INTERACOES, type Interacao } from './interacoes';
import { lutar, type Modo } from './combate';
import { nomeDeBebe } from './elenco';
import {
  AJUSTES_PADRAO, anoDe, dataTexto, idadeDe, mesDoAno, MESES, type Ajustes, type Big5, type CampoValor, type Categoria, type Comando, type Decisao,
  type Efeito, type Habilidade, type Laco, type Memoria, type Meta, type Pessoa, type Registro, type Segredo, type TomVida, type VidaEvento, type Vinculo, type Visao,
} from './tipos';

/*
 * O motor da simulação de vidas. Anda de mês em mês:
 *
 *  1. vida: viagens, gravidez e parto, doença, velhice, maioridade, dinheiro,
 *     humor e estresse, traços que surgem com a experiência;
 *  2. encontros: cada pessoa tem algumas "vezes" no mês; em cada uma escolhe
 *     com quem (quem está no mesmo lugar, puxado por intimidade, vínculo e
 *     atração) e o que fazer (conversar, flertar, seduzir, brigar...), com
 *     peso pelos traços, pela relação e pelo humor;
 *  3. consequências: casamentos marcados, casos descobertos, fofoca que
 *     espalha, amizades e rivalidades que se formam;
 *  4. regras do mundo (```regras): `quando mês`, `quando ano`, interações e
 *     reações a eventos como `quando traição(traidor, vítima, amante):`.
 *
 * É determinístico: mesma semente, mesmo elenco e mesmas intervenções dão a
 * mesma história. É isso que deixa a nota da simulação guardar só o elenco
 * inicial e o que você fez, e refazer o resto ao abrir.
 */

export interface VidasConfig {
  nome: string;
  semente: number;
  /** mês inicial (ano × 12 + mês − 1) */
  inicio: number;
  /** lugar principal (caminho da ficha ou nome) */
  lugar: string;
}

export interface VidasOpcoes {
  rules?: Program | null;
  tables?: RollTable[];
  positions?: Map<string, { x: number; y: number }>;
  /** intervenções a repetir (replay) */
  registro?: Registro[];
}

export interface Relacao {
  id: string;
  opiniao: number;
  afeto: number;
  atracao: number;
  confianca: number;
  respeito: number;
  intimidade: number;
  vinculos: string[];
  parentesco: string | null;
  mem: Memoria[];
}

export interface Passo {
  meses: number;
  parou: 'decisao' | 'evento' | 'fim' | null;
  novos: VidaEvento[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const VAZIA: Visao = Object.freeze({ afeto: 0, atracao: 0, confianca: 0, respeito: 0, intimidade: 0, mem: Object.freeze([]) as unknown as Memoria[], visto: -Infinity }) as Visao;
const NENHUM: Set<Vinculo> = new Set();
const parKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const GUERRA = '§guerra';
const VIZ = ['afeto', 'atracao', 'confianca', 'respeito', 'intimidade'] as const;
type Eixo = (typeof VIZ)[number];

/** Versão do motor: muda quando a mesma semente passa a dar outra história. */
export const MOTOR_VERSAO = 2;

export class Vidas {
  readonly cat: Catalogo;
  readonly pessoas = new Map<string, Pessoa>();
  readonly visoes = new Map<string, Visao>();
  readonly vinc = new Map<string, Set<Vinculo>>();
  readonly desde = new Map<string, number>();
  readonly casamentos = new Map<string, number>();
  segredos: Segredo[] = [];
  eventos: VidaEvento[] = [];
  decisoes: Decisao[] = [];
  efeitos: Efeito[] = [];
  ajustes: Ajustes = { ...AJUSTES_PADRAO };
  historia: Array<{ ano: number; vivos: number; nasc: number; mortes: number; casam: number }> = [];
  /** intervenções já feitas (vão para a nota) */
  readonly registro: Registro[] = [];
  /** intervenções ainda por repetir (replay) */
  private pendentes: Registro[];
  t: number;
  readonly r: Rng;
  readonly lugares = new Map<string, string>();
  readonly meses: string[];
  issues: RuleIssue[] = [];
  private seq = 0;
  private seqSeg = 0;
  private seqDec = 0;
  private rt: Rules | null = null;
  private mudouGente = true;
  private tocados = new Set<string>();
  private presentes = new Map<string, string[]>();
  private onde = new Map<string, string | null>();
  private contagem = { nasc: 0, mortes: 0, casam: 0 };
  private rotas = new Map<string, string[]>();
  private porNome = new Map<string, string>();
  /** índices: vínculos de cada pessoa, filhos de cada pessoa, caches do mês */
  private chaves = new Map<string, Set<string>>();
  private filhosDe = new Map<string, string[]>();
  private kinCache = new Map<string, string | null>();
  private opCache = new Map<string, number>();
  private compatCache = new Map<string, number>();
  private parCache = new Map<string, string | null>();
  private quimCache = new Map<string, number>();
  private romCache = new Map<string, boolean>();
  /** quem sabe algum segredo dos outros (para a fofoca), refeito todo mês */
  private sabedores = new Set<string>();
  private atribCache = new Map<string, ReturnType<typeof atributos>>();
  /** itens únicos sem dono: id → lugar onde estão largados */
  readonly perdidos = new Map<string, string>();
  readonly destruidos = new Set<string>();
  /** quem teve cada item, e como passou de mão */
  readonly historiaItens = new Map<string, Array<{ t: number; dono: string | null; como: string; lugar?: string }>>();
  /** traços que vieram de itens (pessoa → traço → quantos itens dão) */
  private tracosDeItem = new Map<string, Map<string, number>>();
  /** eventos do mundo declarados nas regras, em andamento */
  eventosAtivos: Array<{ id: string; nome: string; lugar: string | null; desde: number; ate: number }> = [];
  /** campos livres das relações (`relação(a, b).dívida += 10`), de `a>b` */
  private relCampos = new Map<string, Record<string, CampoValor>>();
  private readonly entPorCaminho: Map<string, Entity>;
  private readonly semente: number;
  /** sorte própria do acaso (acontecimentos com tom): não mexe na sorte do resto */
  private readonly sorte: Rng;
  /** facções, posturas e as guerras em andamento */
  readonly guerras: Guerras;
  /** vínculos com papéis (mentor/aprendiz): `id|par` → quem tem o primeiro papel */
  readonly papeis = new Map<string, string>();
  /** quem perdeu a profissão por não passar no filtro dela */
  private semProf = new Set<string>();
  /** tom do acontecimento que está acontecendo agora (marca a crônica) */
  private tomAtual: TomVida | null = null;

  constructor(readonly world: World, readonly cfg: VidasConfig, elenco: { pessoas: Pessoa[]; lacos?: Laco[] }, readonly opts: VidasOpcoes = {}) {
    this.cat = catalogo(opts.rules ?? null, world.entities);
    this.r = seededRng(cfg.semente);
    this.sorte = seededRng(((cfg.semente * 1103515245 + 12345) ^ 0x2545f491) >>> 0 || 3);
    this.semente = cfg.semente;
    this.t = cfg.inicio;
    this.pendentes = [...(opts.registro ?? [])];
    this.entPorCaminho = new Map(world.entities.map((e) => [e.path, e]));
    const mesesMundo = world.props ? (Array.isArray(world.props['meses']) ? world.props['meses'] : null) : null;
    this.meses = mesesMundo && mesesMundo.length === 12 ? mesesMundo.map(String) : MESES;
    for (const e of world.entities) if (e.type === 'lugar') this.lugares.set(e.path, e.name);
    if (!this.lugares.has(cfg.lugar)) this.lugares.set(cfg.lugar, this.entPorCaminho.get(cfg.lugar)?.name ?? cfg.lugar);
    this.montarRotas();
    for (const p of elenco.pessoas) this.entra(structuredClone(p));
    for (const p of this.pessoas.values()) {
      this.seq = Math.max(this.seq, Number(/^x(\d+)$/.exec(p.id)?.[1] ?? 0));
      // casamento com alguém de fora do elenco não conta; de um lado só, vale para os dois
      const c = p.conjuge ? this.pessoas.get(p.conjuge) : undefined;
      if (!c) p.conjuge = null;
      else if (!c.conjuge) c.conjuge = p.id;
    }
    for (const l of elenco.lacos ?? []) {
      if (!this.pessoas.has(l.a) || !this.pessoas.has(l.b) || l.a === l.b) continue;
      const v = this.vm(l.a, l.b);
      for (const k of VIZ) if (l[k]) v[k] = clamp(v[k] + l[k]!, k === 'intimidade' ? 0 : -100, 100);
      if (l.v === 'amantes') {
        if (!this.temVinc(l.a, l.b, 'amantes')) {
          this.liga(l.a, l.b, 'amantes');
          this.segredo('caso', [l.a, l.b], [l.a, l.b]);
        }
      } else if (l.v === 'noivado') {
        this.liga(l.a, l.b, 'noivado');
        this.casamentos.set(parKey(l.a, l.b), this.t + 6);
      } else if (l.v) this.liga(l.a, l.b, l.v);
    }
    this.guerras = new Guerras(this, cfg.semente);
    this.iniciarItens();
    this.ligarRegras();
    this.mapearPresenca();
    for (const id of this.semProf) {
      const p = this.pessoas.get(id);
      if (p && this.adulto(p)) p.prof = this.escolherProf(p);
    }
    this.semProf.clear();
    this.rt?.emit('inicio');
    this.coletarIssues();
  }

  // ================================================================ leitura (a tela usa; nada aqui gasta sorte nem muda estado)

  pessoa(id: string): Pessoa | undefined {
    return this.pessoas.get(id);
  }
  vivos(): Pessoa[] {
    return [...this.pessoas.values()].filter((p) => p.morte === null);
  }
  todas(): Pessoa[] {
    return [...this.pessoas.values()];
  }
  idade(p: Pessoa): number {
    return idadeDe(p, this.t);
  }
  /** Espécie da pessoa (declarada nas regras ou numa ficha), se houver. */
  esp(p: Pessoa): Especie | undefined {
    return this.cat.especies.get(this.eid(p));
  }
  /** Povo da pessoa (do catálogo), se houver. */
  etnia(p: Pessoa): Etnia | undefined {
    return p.etnia ? this.cat.etnias.get(p.etnia) : undefined;
  }
  etniaNome(p: Pessoa): string | null {
    return this.etnia(p)?.nome ?? p.etnia ?? null;
  }
  /** A pessoa passa no filtro (espécie, etnia, sexo, idade, facção)? Filtro vazio = sim. */
  passa(p: Pessoa, f: RuleFilter | null | undefined): boolean {
    if (!f) return true;
    if (f.species.length && !f.species.includes(this.eid(p)) && !f.species.includes(fold(this.especieNome(p)))) return false;
    if (f.ethnicities.length && (!p.etnia || !f.ethnicities.some((e) => e === p.etnia || fold(this.etniaNome(p) ?? '') === e))) return false;
    if (f.sex && p.sexo !== f.sex) return false;
    if (f.minAge !== null || f.maxAge !== null) {
      const i = this.idade(p);
      if (f.minAge !== null && i < f.minAge) return false;
      if (f.maxAge !== null && i > f.maxAge) return false;
    }
    if (f.factions.length) {
      const fc = this.guerras?.faccaoDe(p);
      if (!fc || !f.factions.some((x) => x === fold(fc.nome) || x === fc.id)) return false;
    }
    return true;
  }
  /** Estados que tiram a pessoa de cena (sapo, presa, sumida no reino das fadas). */
  bloqueado(p: Pessoa): boolean {
    for (const k in p.estados) if (ESTADOS_VIDA[k]?.bloqueia) return true;
    return false;
  }
  /** Está num acampamento de guerra (ou na guerra das antigas, `§guerra`)? */
  naGuerra(p: Pessoa): boolean {
    return !!p.viagem && p.viagem.para.startsWith('§');
  }

  /** Id da espécie; quem não tem espécie escrita é "humano". */
  eid(p: Pessoa): string {
    const c = this.eidCache.get(p);
    if (c !== undefined && c[0] === p.especie) return c[1];
    const id = especieId(p.especie) || 'humano';
    this.eidCache.set(p, [p.especie, id]);
    return id;
  }
  private eidCache = new WeakMap<Pessoa, [string | null, string]>();
  /** Nome da espécie para mostrar ("humano" quando não há). */
  especieNome(p: Pessoa): string {
    return this.esp(p)?.nome ?? (p.especie ? p.especie.split('/').pop()!.replace(/\.md$/i, '') : 'humano');
  }
  /** idade "biológica" na escala humana (um elfo de 200 anos pode ser jovem; um lobo de 3 já é adulto) */
  idadeBio(p: Pessoa): number {
    const i = this.idade(p);
    const e = this.esp(p);
    const V = Math.max(e?.maioridade ? (e.maioridade + 1) : 20, e?.vida ?? p.vida);
    const M = e?.maioridade;
    if (M && M > 0) return i < M ? (i * 18) / M : 18 + ((i - M) * 52) / Math.max(1, V - M);
    return (i * 70) / V;
  }
  adulto(p: Pessoa): boolean {
    return this.idadeBio(p) >= 18 && (!!this.esp(p)?.maioridade || this.idade(p) >= 18);
  }
  /** Criatura (fera, monstro, animal): não conversa nem trabalha. */
  criatura(p: Pessoa): boolean {
    return !!this.esp(p)?.criatura;
  }
  /** As duas espécies podem ter filhos juntas? (mesma espécie, ou um `cruza com`) */
  cruzam(a: Pessoa, b: Pessoa): boolean {
    const ea = this.eid(a);
    const eb = this.eid(b);
    if (ea === eb) return true;
    const A = this.cat.especies.get(ea);
    const B = this.cat.especies.get(eb);
    if (A?.cruza.some((c) => c.com === eb) || B?.cruza.some((c) => c.com === ea)) return true;
    if (A?.criatura || B?.criatura) return false;
    // sem espécie escrita de um dos lados: vale (como sempre foi)
    return !a.especie || !b.especie;
  }
  /** Um dos dois é criatura de outra espécie: só briga, nada de conversa. */
  alheios(a: Pessoa, b: Pessoa): boolean {
    return (this.criatura(a) || this.criatura(b)) && this.eid(a) !== this.eid(b);
  }
  crianca(p: Pessoa): boolean {
    return this.idadeBio(p) < 16;
  }
  atrib(p: Pessoa): ReturnType<typeof atributos> {
    let a = this.atribCache.get(p.id);
    if (!a) {
      // a curva de idade usa a idade biológica (uma espécie com maioridade própria envelhece no ritmo dela)
      a = atributos({ ...p, vida: 70 }, this.idadeBio(p));
      const m0 = this.esp(p)?.mods;
      const me = this.etnia(p)?.mods;
      const extra = ['forca', 'agilidade', 'intelecto', 'inteligencia', 'beleza', 'fertilidade'].some((k) => this.bonus(p, k));
      const m = m0 || me || extra ? { ...(m0 ?? {}) } : null;
      if (m && me) for (const k in me) m[k] = (m[k] ?? 0) + me[k]!;
      if (m) for (const k of ['forca', 'agilidade', 'intelecto', 'beleza', 'fertilidade']) m[k] = (m[k] ?? 0) + this.bonus(p, k) + (k === 'intelecto' ? this.bonus(p, 'inteligencia') : 0);
      if (m) {
        const k = (n?: number) => (n ?? 0) / 100;
        a = {
          forca: clamp(a.forca + k(m['forca']), 0, 1), agilidade: clamp(a.agilidade + k(m['agilidade']), 0, 1), intelecto: clamp(a.intelecto + k(m['intelecto'] ?? m['inteligencia']), 0, 1),
          beleza: clamp(a.beleza + k(m['beleza']), 0, 1), fertilidade: clamp(a.fertilidade + k(m['fertilidade']), 0, 1),
        };
      }
      this.atribCache.set(p.id, a);
    }
    return a;
  }
  tem(p: Pessoa, traco: string): boolean {
    return p.tracos.includes(traco);
  }
  vivo(id: string | null | undefined): Pessoa | null {
    const p = id ? this.pessoas.get(id) : undefined;
    return p && p.morte === null ? p : null;
  }
  /** Data no calendário do mundo. */
  data(t = this.t): string {
    return dataTexto(t, this.meses);
  }
  lugarNome(key: string | null): string {
    if (!key) return '—';
    if (key === GUERRA) return 'a guerra';
    if (key.startsWith('§front:')) return this.guerras?.nomeFront(key) ?? 'o front';
    return this.lugares.get(key) ?? this.entPorCaminho.get(key)?.name ?? key;
  }
  /** Onde a pessoa está agora (null = na estrada). */
  ondeEsta(p: Pessoa): string | null {
    const v = p.viagem;
    if (!v) return p.local;
    return this.t >= v.chega ? v.para : null;
  }
  g(p: Pessoa, m: string, f: string): string {
    return p.genero === 'f' ? f : m;
  }
  L(id: string): string {
    return `[[${this.pessoas.get(id)?.nome ?? id}]]`;
  }
  nomeTraco(p: Pessoa, id: string): string {
    return nomeTraco(this.cat, id, p.genero);
  }
  nomeProf(p: Pessoa): string {
    return nomeProf(this.cat, p.prof, p.genero);
  }
  prof(p: Pessoa): Profissao | undefined {
    return p.prof ? this.cat.profs.get(p.prof) : undefined;
  }
  aparencia(p: Pessoa): { olhos: string; cabelo: string; altura: number } {
    const alt = this.esp(p)?.altura;
    const adulta = alturaDe(p.genes, p.sexo) * (alt ? alt / 170 : 1) + (this.etnia(p)?.altura ?? 0);
    const i = this.idadeBio(p);
    return { olhos: olhosDe(p.genes), cabelo: cabeloDe(p.genes), altura: Math.round(i >= 18 ? adulta : 50 + (adulta - 50) * Math.min(1, i / 18)) };
  }

  /** Como `a` vê `b`, sem criar nada. */
  visao(a: string, b: string): Visao {
    return this.visoes.get(`${a}>${b}`) ?? VAZIA;
  }

  vinculos(a: string, b: string): ReadonlySet<Vinculo> {
    return this.vinc.get(parKey(a, b)) ?? NENHUM;
  }
  temVinc(a: string, b: string, v: Vinculo): boolean {
    return this.vinc.get(parKey(a, b))?.has(v) ?? false;
  }

  /** Mãe, pai, filho, irmão, avô, neto, tio, sobrinho, primo... ou null. */
  parentesco(a: string, b: string): string | null {
    if (a === b) return null;
    const ck = `${a}>${b}`;
    const c = this.kinCache.get(ck);
    if (c !== undefined) return c;
    const k = this.calcParentesco(a, b);
    this.kinCache.set(ck, k);
    return k;
  }

  private calcParentesco(a: string, b: string): string | null {
    const A = this.pessoas.get(a);
    const B = this.pessoas.get(b);
    if (!A || !B) return null;
    const pa = A.pais.filter(Boolean) as string[];
    const pb = B.pais.filter(Boolean) as string[];
    const gb = (m: string, f: string) => this.g(B, m, f);
    if (pa.includes(b)) return gb('pai', 'mãe');
    if (pb.includes(a)) return gb('filho', 'filha');
    const comuns = pa.filter((x) => pb.includes(x)).length;
    if (comuns === 2 || (comuns === 1 && pa.length === 1 && pb.length === 1)) return gb('irmão', 'irmã');
    if (comuns === 1) return gb('meio-irmão', 'meia-irmã');
    const avosA = pa.flatMap((x) => (this.pessoas.get(x)?.pais ?? []).filter(Boolean) as string[]);
    const avosB = pb.flatMap((x) => (this.pessoas.get(x)?.pais ?? []).filter(Boolean) as string[]);
    if (avosA.includes(b)) return gb('avô', 'avó');
    if (avosB.includes(a)) return gb('neto', 'neta');
    const irmaos = (id: string) => this.irmaos(id).map((x) => x.id);
    if (pa.some((x) => irmaos(x).includes(b))) return gb('tio', 'tia');
    if (pb.some((x) => irmaos(x).includes(a))) return gb('sobrinho', 'sobrinha');
    if (avosA.some((x) => avosB.includes(x))) return gb('primo', 'prima');
    if (A.conjuge === b) return gb('marido', 'esposa');
    return null;
  }

  /** Família próxima (não namoram entre si). */
  proximos(a: string, b: string): boolean {
    const k = this.parentesco(a, b);
    return !!k && !/^(primo|prima|marido|esposa)$/.test(k);
  }

  private kinBonus(a: string, b: string): { afeto: number; intim: number } {
    const k = this.parentesco(a, b);
    if (!k) return { afeto: 0, intim: 0 };
    if (/^(pai|mãe|filho|filha|irmão|irmã)$/.test(k)) return { afeto: 25, intim: 40 };
    if (/^(marido|esposa)$/.test(k)) return { afeto: 10, intim: 30 };
    return { afeto: 10, intim: 12 };
  }

  /** Afinidade de temperamento e gostos de `a` por `b` (−30 a +30). */
  compat(a: string, b: string): number {
    const ck = `${a}>${b}`;
    const c = this.compatCache.get(ck);
    if (c !== undefined) return c;
    const A = this.pessoas.get(a);
    const B = this.pessoas.get(b);
    if (!A || !B) return 0;
    let s = 0;
    for (const ta of A.tracos) {
      const tr = this.cat.tracos.get(ta);
      if (!tr) continue;
      if (tr.cat === 'personalidade' && B.tracos.includes(ta)) s += 3;
      if (tr.oposto && B.tracos.includes(tr.oposto)) s -= 6;
      const af = tr.afinidade;
      if (af) for (const o in af) if (B.tracos.includes(o || ta)) s += af[o]!;
    }
    for (const tb of B.tracos) s += this.cat.tracos.get(tb)?.visto ?? 0;
    let comuns = 0;
    for (const g of A.gostos) if (B.gostos.includes(g)) comuns++;
    s += Math.min(12, comuns * 4);
    s += 6 - (Math.abs(A.big5[0] - B.big5[0]) + Math.abs(A.big5[3] - B.big5[3])) / 16;
    s += this.atrib(B).beleza * 5;
    // povo: quem gosta dos seus, quem desconfia dos outros
    const ea = this.etnia(A);
    if (ea && B.etnia) s += ea.afinidade[B.etnia === A.etnia ? '' : B.etnia] ?? (B.etnia !== A.etnia ? ea.afinidade['*'] ?? 0 : 0);
    const r = clamp(s, -30, 30);
    this.compatCache.set(ck, r);
    return r;
  }

  /** Esquece o que foi calculado sobre a pessoa (traços, gostos ou temperamento mudaram). */
  private mudouPessoa(): void {
    this.compatCache.clear();
    this.quimCache.clear();
    this.opCache.clear();
  }

  private memoria(v: Visao): number {
    let s = 0;
    for (const m of v.mem) s += m.v * Math.pow(0.5, Math.max(0, this.t - m.t) / m.m);
    return s;
  }

  /** Opinião de `a` sobre `b`, de −100 a 100. */
  opiniao(a: string, b: string): number {
    const ck = `o${a}>${b}`;
    const c = this.opCache.get(ck);
    if (c !== undefined) return c;
    const v = this.visao(a, b);
    const kin = this.kinBonus(a, b);
    let laco = 0;
    if (this.cat.vinculos.size) for (const x of this.vinculos(a, b)) laco += this.cat.vinculos.get(x)?.opiniao ?? 0;
    const o = Math.round(clamp(v.afeto + v.confianca * 0.3 + v.respeito * 0.2 + this.memoria(v) + this.compat(a, b) + kin.afeto + laco, -100, 100));
    this.opCache.set(ck, o);
    return o;
  }

  intimidade(a: string, b: string): number {
    return clamp(this.visao(a, b).intimidade + this.kinBonus(a, b).intim, 0, 100);
  }

  /** `a` se interessa por alguém do sexo de `b`? */
  atraido(a: string, b: string): boolean {
    const A = this.pessoas.get(a);
    const B = this.pessoas.get(b);
    if (!A || !B) return false;
    switch (A.orientacao) {
      case 'hetero': return A.sexo !== B.sexo;
      case 'homo': return A.sexo === B.sexo;
      case 'bi': return true;
      case 'ace': return false;
    }
  }

  /** Romance só entre adultos vivos, de espécies compatíveis, que não são família próxima. */
  podeRomance(a: string, b: string): boolean {
    const ck = a < b ? `${a}|${b}` : `${b}|${a}`;
    const c = this.romCache.get(ck);
    if (c !== undefined) return c;
    const r = this.calcRomance(a, b);
    this.romCache.set(ck, r);
    return r;
  }

  private calcRomance(a: string, b: string): boolean {
    const A = this.vivo(a);
    const B = this.vivo(b);
    if (!A || !B || a === b || !this.adulto(A) || !this.adulto(B)) return false;
    if (!this.cruzam(A, B)) return false;
    return !this.proximos(a, b);
  }

  private quimica(a: string, b: string): number {
    const ck = `${a}>${b}`;
    const c = this.quimCache.get(ck);
    if (c !== undefined) return c;
    const q = this.calcQuimica(a, b);
    this.quimCache.set(ck, q);
    return q;
  }

  private calcQuimica(a: string, b: string): number {
    const A = this.pessoas.get(a)!;
    const B = this.pessoas.get(b)!;
    const h = (hash53(a < b ? `${a}|${b}` : `${b}|${a}`, this.semente) % 1000) / 1000;
    const gap = Math.abs(this.idadeBio(A) - this.idadeBio(B));
    const comuns = A.gostos.filter((x) => B.gostos.includes(x)).length;
    return clamp(8 + h * 34 + this.atrib(B).beleza * 30 + comuns * 4 - Math.max(0, gap - 8) * 1.8 + (B.tracos.includes('belo') ? 8 : 0), 0, 100);
  }

  /** Atração de `a` por `b`, 0 a 100 (0 se não pode haver romance). */
  atracao(a: string, b: string): number {
    return !this.atraido(a, b) || !this.podeRomance(a, b) ? 0 : Math.round(clamp(this.quimica(a, b) + this.visao(a, b).atracao, 0, 100));
  }

  private casouOuSeparou(a: string, b: string): void {
    this.kinCache.delete(`${a}>${b}`);
    this.kinCache.delete(`${b}>${a}`);
    this.parCache.delete(a);
    this.parCache.delete(b);
    this.esquece(a, b);
  }

  private esquece(a: string, b: string): void {
    this.opCache.delete(`o${a}>${b}`);
    this.opCache.delete(`o${b}>${a}`);
  }

  conjuge(p: Pessoa): Pessoa | null {
    return this.vivo(p.conjuge);
  }
  /** Par oficial: cônjuge, noivo(a) ou namorado(a). */
  parceiro(p: Pessoa): Pessoa | null {
    const ck = this.parCache.get(p.id);
    if (ck !== undefined) return ck ? this.vivo(ck) : null;
    const r = this.calcParceiro(p);
    this.parCache.set(p.id, r?.id ?? null);
    return r;
  }

  private calcParceiro(p: Pessoa): Pessoa | null {
    const c = this.conjuge(p);
    if (c) return c;
    for (const k of this.chaves.get(p.id) ?? []) {
      const set = this.vinc.get(k);
      if (!set || (!set.has('noivado') && !set.has('namoro') && !(this.cat.vinculos.size && [...set].some((v) => this.cat.vinculos.get(v)?.romantico)))) continue;
      const [x, y] = k.split('|') as [string, string];
      const o = this.vivo(x === p.id ? y : x);
      if (o) return o;
    }
    return null;
  }
  comprometido(p: Pessoa): boolean {
    return !!this.parceiro(p);
  }
  amantes(p: Pessoa): Pessoa[] {
    return this.comVinculo(p.id, 'amantes');
  }
  comVinculo(id: string, v: Vinculo): Pessoa[] {
    const out: Pessoa[] = [];
    for (const k of this.chaves.get(id) ?? []) {
      if (!this.vinc.get(k)?.has(v)) continue;
      const [x, y] = k.split('|') as [string, string];
      const o = this.vivo(x === id ? y : x);
      if (o) out.push(o);
    }
    return out;
  }
  /** Ids de quem tem algum vínculo com a pessoa. */
  ligados(id: string): string[] {
    return [...(this.chaves.get(id) ?? [])].map((k) => {
      const [x, y] = k.split('|') as [string, string];
      return x === id ? y : x;
    });
  }
  private filhosIdx(id: string): Pessoa[] {
    return (this.filhosDe.get(id) ?? []).map((x) => this.pessoas.get(x)!).filter(Boolean);
  }
  filhos(id: string): Pessoa[] {
    return this.filhosIdx(id).filter((x) => x.pais.includes(id));
  }
  /** Filhos que a pessoa acha que tem (pai oficial incluído). */
  filhosOficiais(id: string): Pessoa[] {
    return this.filhosIdx(id).filter((x) => x.pais[0] === id || (x.paiOficial ?? x.pais[1]) === id);
  }
  irmaos(id: string): Pessoa[] {
    const p = this.pessoas.get(id);
    if (!p) return [];
    const out = new Map<string, Pessoa>();
    for (const pp of p.pais) if (pp) for (const x of this.filhos(pp)) if (x.id !== id) out.set(x.id, x);
    return [...out.values()];
  }

  /** As relações de uma pessoa, das mais fortes para as mais fracas. */
  relacoes(id: string, limite = 40): Relacao[] {
    const ids = new Set<string>();
    for (const k of this.visoes.keys()) {
      const [a, b] = k.split('>') as [string, string];
      if (a === id) ids.add(b);
      else if (b === id) ids.add(a);
    }
    for (const k of this.vinc.keys()) {
      const [a, b] = k.split('|') as [string, string];
      if (a === id) ids.add(b);
      else if (b === id) ids.add(a);
    }
    const p = this.pessoas.get(id);
    for (const x of [...(p?.pais ?? []), p?.conjuge ?? null, ...this.filhos(id).map((f) => f.id), ...this.irmaos(id).map((f) => f.id)]) if (x) ids.add(x);
    const out: Relacao[] = [];
    for (const b of ids) {
      if (!this.pessoas.has(b) || b === id) continue;
      const v = this.visao(id, b);
      out.push({
        id: b, opiniao: this.opiniao(id, b), afeto: Math.round(v.afeto), atracao: this.atracao(id, b), confianca: Math.round(v.confianca),
        respeito: Math.round(v.respeito), intimidade: Math.round(this.intimidade(id, b)), vinculos: [...this.vinculos(id, b)], parentesco: this.parentesco(id, b),
        mem: v.mem.filter((m) => Math.abs(m.v * Math.pow(0.5, (this.t - m.t) / m.m)) >= 1),
      });
    }
    const forca = (r: Relacao) => Math.abs(r.opiniao) + r.vinculos.length * 40 + (r.parentesco ? 25 : 0) + r.atracao / 3 + (this.vivo(r.id) ? 0 : -60);
    return out.sort((x, y) => forca(y) - forca(x)).slice(0, limite);
  }

  /** A pessoa sabe algum segredo dos outros? (para a fofoca; atualizado todo mês) */
  sabeAlgo(id: string): boolean {
    return this.sabedores.has(id);
  }

  /** Segredos em que a pessoa está, ou que ela sabe. */
  segredosDe(id: string): Segredo[] {
    return this.segredos.filter((s) => s.sobre.includes(id) || s.sabem.includes(id));
  }

  /** Interações que dá para mandar `a` fazer com `b` (null = sozinho). */
  interacoesPara(a: string, b: string | null): Array<{ id: string; nome: string; cat: Categoria; pode: boolean }> {
    const A = this.vivo(a);
    const B = b ? this.vivo(b) : null;
    if (!A || (b && !B)) return [];
    const out = INTERACOES.filter((i) => i.alvo === !!B).map((i) => ({ id: i.id, nome: i.nome, cat: i.cat, pode: i.pode(this, A, B) }));
    if (B && this.podeRomance(a, b!)) out.push({ id: 'casar', nome: 'Casar agora', cat: 'romance', pode: !A.conjuge && !B.conjuge });
    return out;
  }

  // ================================================================ mudança (só o motor e as intervenções)

  vm(a: string, b: string): Visao {
    const k = `${a}>${b}`;
    let v = this.visoes.get(k);
    if (!v) this.visoes.set(k, (v = { afeto: 0, atracao: 0, confianca: 0, respeito: 0, intimidade: 0, mem: [], visto: this.t }));
    return v;
  }

  mexe(a: string, b: string, d: Partial<Record<Eixo, number>>): void {
    const v = this.vm(a, b);
    for (const k of VIZ) {
      const x = d[k];
      if (x) v[k] = clamp(v[k] + x, k === 'intimidade' ? 0 : -100, 100);
    }
    v.visto = this.t;
    this.tocados.add(parKey(a, b));
    this.esquece(a, b);
  }

  lembra(a: string, b: string, o: string, v: number, meia = 36): void {
    const vis = this.vm(a, b);
    vis.mem.push({ o, v, t: this.t, m: meia });
    if (vis.mem.length > 12) vis.mem.splice(0, vis.mem.length - 12);
    this.tocados.add(parKey(a, b));
    this.esquece(a, b);
  }

  liga(a: string, b: string, v: Vinculo): void {
    const k = parKey(a, b);
    let s = this.vinc.get(k);
    if (!s) {
      this.vinc.set(k, (s = new Set()));
      for (const x of [a, b]) {
        let c = this.chaves.get(x);
        if (!c) this.chaves.set(x, (c = new Set()));
        c.add(k);
      }
    }
    if (!s.has(v)) {
      s.add(v);
      this.desde.set(`${k}|${v}`, this.t);
    }
    this.esquece(a, b);
    this.parCache.delete(a);
    this.parCache.delete(b);
  }
  desliga(a: string, b: string, v: Vinculo): void {
    const k = parKey(a, b);
    this.vinc.get(k)?.delete(v);
    this.desde.delete(`${k}|${v}`);
    if (this.vinc.get(k)?.size === 0) {
      this.vinc.delete(k);
      this.chaves.get(a)?.delete(k);
      this.chaves.get(b)?.delete(k);
    }
    this.esquece(a, b);
    this.parCache.delete(a);
    this.parCache.delete(b);
  }
  /** Há quantos meses existe o vínculo. */
  ha(a: string, b: string, v: Vinculo): number {
    const d = this.desde.get(`${parKey(a, b)}|${v}`);
    return d === undefined ? 0 : this.t - d;
  }

  chance(p: number): boolean {
    return this.r() < p;
  }
  entre(lo: number, hi: number): number {
    return lo + this.r() * (hi - lo);
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.r() * list.length)]!;
  }

  humor(p: Pessoa, d: number): void {
    p.humor = clamp(p.humor + d, -100, 100);
  }
  estresse(p: Pessoa, d: number): void {
    p.estresse = clamp(p.estresse + d, 0, 100);
  }
  sobe(p: Pessoa, h: Habilidade | string, d: number): void {
    const k = h as Habilidade;
    if (!(k in p.hab)) return;
    const mult = p.tracos.includes('genial') ? 1.8 : p.tracos.includes('lento') ? 0.5 : 1;
    p.hab[k] = clamp(p.hab[k] + d * mult, 0, 20);
  }
  xp(p: Pessoa, k: string, d = 1): void {
    p.xp[k] = (p.xp[k] ?? 0) + d;
  }

  ganhaTraco(p: Pessoa, id: string, contar = true): boolean {
    if (p.tracos.includes(id)) return false;
    this.atribCache.delete(p.id);
    const t = this.cat.tracos.get(id);
    if (t?.oposto) p.tracos = p.tracos.filter((x) => x !== t.oposto);
    p.tracos.push(id);
    this.mudouPessoa();
    if (contar && t && !t.oculto && t.cat !== 'marca') {
      this.say('vida', 'traço', `${this.L(p.id)} ${t.cat === 'reputacao' ? 'passa a ser vist' + this.g(p, 'o', 'a') + ' como' : 'fica'} ${this.nomeTraco(p, id)}.`, [p.id], 1);
    }
    this.emitir('traco', [p.id], [this.nomeTraco(p, id)]);
    return true;
  }
  perdeTraco(p: Pessoa, id: string): void {
    p.tracos = p.tracos.filter((x) => x !== id);
    this.atribCache.delete(p.id);
    this.mudouPessoa();
  }

  say(cat: Categoria, tipo: string, texto: string, quem: string[], peso: number, segredo = false): void {
    this.eventos.push({ t: this.t, cat, tipo, texto, quem: [...new Set(quem)], peso, ...(segredo ? { segredo: true } : {}), ...(this.tomAtual ? { tom: this.tomAtual } : {}) });
    // a crônica guarda até 25 mil linhas; as miúdas mais antigas saem primeiro
    if (this.eventos.length > 25000) {
      const i = this.eventos.findIndex((e) => e.peso === 1);
      this.eventos.splice(i >= 0 ? i : 0, 1);
    }
  }

  /** Dispara um evento para as regras do mundo (`quando casamento(a, b):`). */
  emitir(nome: string, ids: string[], extra: Val[] = []): void {
    if (ids.length >= 2) this.guerras?.aoEvento(nome, ids);
    if (!this.rt) return;
    this.rt.emit(nome, [...ids.map((x) => new Ent(x)), ...extra]);
  }

  dar(de: Pessoa, para: Pessoa, x: number): number {
    const v = Math.max(0, Math.min(de.dinheiro, x));
    de.dinheiro -= v;
    para.dinheiro += v;
    return v;
  }

  segredo(tipo: Segredo['tipo'], sobre: string[], sabem: string[]): Segredo {
    const s: Segredo = { id: ++this.seqSeg, tipo, sobre, sabem: [...new Set(sabem)], t: this.t, publico: false };
    this.segredos.push(s);
    return s;
  }

  decide(d: Omit<Decisao, 'id' | 't'>): void {
    this.decisoes.push({ ...d, id: ++this.seqDec, t: this.t });
  }

  // ---------------------------------------------------------------- grandes acontecimentos

  casar(a: Pessoa, b: Pessoa): void {
    if (a.conjuge || b.conjuge || !this.podeRomance(a.id, b.id)) return;
    for (const v of ['namoro', 'noivado', 'ex'] as Vinculo[]) this.desliga(a.id, b.id, v);
    this.casamentos.delete(parKey(a.id, b.id));
    a.conjuge = b.id;
    b.conjuge = a.id;
    this.casouOuSeparou(a.id, b.id);
    this.contagem.casam++;
    // quem tem menos prestígio muda para a casa do outro
    if (a.local !== b.local) {
      const [vai, fica] = (this.prof(a)?.status ?? 1) <= (this.prof(b)?.status ?? 1) ? [a, b] : [b, a];
      vai.local = fica.local;
    }
    const convidados = (this.presentes.get(a.local) ?? []).filter((x) => x !== a.id && x !== b.id && (this.opiniao(x, a.id) > 20 || this.opiniao(x, b.id) > 20));
    for (const c of convidados) {
      this.mexe(c, a.id, { afeto: 3 });
      this.mexe(c, b.id, { afeto: 3 });
    }
    this.humor(a, 25);
    this.humor(b, 25);
    this.lembra(a.id, b.id, 'nosso casamento', 15, 120);
    this.lembra(b.id, a.id, 'nosso casamento', 15, 120);
    const padre = (this.presentes.get(a.local) ?? []).map((x) => this.pessoas.get(x)!).find((x) => x.prof === 'sacerdote');
    this.say('romance', 'casamento', `${this.L(a.id)} e ${this.L(b.id)} se casam${padre ? `, abençoados por ${this.L(padre.id)}` : ''}${convidados.length > 2 ? ` diante de ${convidados.length} convidados` : ''}.`, [a.id, b.id], 3);
    this.emitir('casamento', [a.id, b.id]);
  }

  terminar(a: Pessoa, b: Pessoa, por: Pessoa = a): void {
    const casados = a.conjuge === b.id;
    const amantes = this.temVinc(a.id, b.id, 'amantes');
    for (const v of ['namoro', 'noivado', 'amantes'] as Vinculo[]) this.desliga(a.id, b.id, v);
    this.casamentos.delete(parKey(a.id, b.id));
    if (casados) {
      a.conjuge = null;
      b.conjuge = null;
      this.casouOuSeparou(a.id, b.id);
    }
    this.liga(a.id, b.id, 'ex');
    const outro = por === a ? b : a;
    const dor = outro.tracos.includes('romantico') ? 1.5 : outro.tracos.includes('desapegado') ? 0.4 : 1;
    this.humor(outro, -18 * dor);
    this.estresse(outro, 10 * dor);
    this.lembra(outro.id, por.id, casados ? 'pediu o divórcio' : 'me largou', -15 * dor, 36);
    this.say('romance', casados ? 'divorcio' : 'termino',
      casados ? `${this.L(por.id)} se divorcia de ${this.L(outro.id)}.` : amantes ? `🤫 ${this.L(por.id)} põe fim ao caso com ${this.L(outro.id)}.` : `${this.L(por.id)} termina com ${this.L(outro.id)}.`,
      [a.id, b.id], casados ? 3 : 2, amantes);
    this.emitir(casados ? 'divorcio' : 'termino', [por.id, outro.id]);
  }

  comecarCaso(a: Pessoa, b: Pessoa): void {
    if (this.temVinc(a.id, b.id, 'amantes')) return;
    this.liga(a.id, b.id, 'amantes');
    this.segredo('caso', [a.id, b.id], [a.id, b.id]);
    this.humor(a, 10);
    this.humor(b, 10);
    for (const x of [a, b]) {
      this.xp(x, 'amantes');
      if (this.comprometido(x) && (x.tracos.includes('honesto') || x.tracos.includes('leal'))) this.estresse(x, 14);
    }
    const quem = [a, b].filter((x) => this.comprometido(x)).map((x) => `${this.L(x.id)} trai ${this.L(this.parceiro(x)!.id)}`);
    this.say('romance', 'caso', `🤫 ${this.L(a.id)} e ${this.L(b.id)} começam um caso às escondidas${quem.length ? ` (${quem.join('; ')})` : ''}.`, [a.id, b.id], 2, true);
    this.emitir('caso', [a.id, b.id]);
  }

  /** `vitima` descobre o caso de `traidor` com `amante`. O atrito vem daqui. */
  descobrir(vitima: Pessoa, traidor: Pessoa, amante: Pessoa, como = ''): void {
    const s = this.segredos.find((x) => x.tipo === 'caso' && x.sobre.includes(traidor.id) && x.sobre.includes(amante.id));
    if (s && !s.sabem.includes(vitima.id)) s.sabem.push(vitima.id);
    const dor = vitima.tracos.includes('ciumento') ? 1.5 : vitima.tracos.includes('desapegado') ? 0.5 : 1;
    this.lembra(vitima.id, traidor.id, 'me traiu', -55 * dor, 120);
    this.lembra(vitima.id, amante.id, 'dormiu com meu par', -45 * dor, 120);
    this.mexe(vitima.id, traidor.id, { confianca: -50, afeto: -15 });
    this.estresse(vitima, 30 * dor);
    this.humor(vitima, -30 * dor);
    this.xp(vitima, 'traido');
    this.say('romance', 'descoberta', `${this.L(vitima.id)} descobre o caso de ${this.L(traidor.id)} com ${this.L(amante.id)}${como ? `, ${como}` : ''}.`, [vitima.id, traidor.id, amante.id], 3);
    // quem foi pego passa a ser vigiado: trair de novo fica mais difícil (e mais arriscado)
    traidor.estados['vigiado'] = this.t + 18;
    this.emitir('descoberta', [vitima.id, traidor.id, amante.id]);
    this.emitir('traicao', [traidor.id, vitima.id, amante.id]);
    if (vitima.conduzido) {
      this.decide({
        pessoa: vitima.id, tipo: 'descoberta', de: traidor.id, outro: amante.id,
        texto: `${vitima.nome} descobriu o caso de ${traidor.nome} com ${amante.nome}. O que ${this.g(vitima, 'ele', 'ela')} faz?`,
        opcoes: [{ id: 'perdoar', rotulo: 'Perdoar' }, { id: 'confrontar', rotulo: 'Confrontar aos gritos' }, { id: 'terminar', rotulo: vitima.conjuge === traidor.id ? 'Pedir o divórcio' : 'Terminar' },
          { id: 'vingar', rotulo: `Ir atrás de ${amante.nome}` }, { id: 'auto', rotulo: 'Deixar o destino decidir' }],
      });
      return;
    }
    this.reagirTraicao(vitima, traidor, amante, null);
  }

  /** Reação a uma traição descoberta (escolhida por quem joga ou pelos traços). */
  reagirTraicao(v: Pessoa, t: Pessoa, a: Pessoa, escolha: string | null): void {
    const w = {
      perdoar: 0.4 + (v.tracos.includes('clemente') ? 1.5 : 0) + (v.tracos.includes('ingenuo') ? 0.6 : 0) + Math.max(0, this.opiniao(v.id, t.id) + 30) / 40,
      confrontar: 0.8 + (v.tracos.includes('irascivel') ? 1.2 : 0) + (v.tracos.includes('ciumento') ? 1 : 0),
      terminar: 0.6 + (v.tracos.includes('orgulhoso') ? 1 : 0) + (v.tracos.includes('devoto') ? -0.4 : 0.3) + (v.tracos.includes('tradicional') ? -0.3 : 0),
      vingar: 0.1 + (v.tracos.includes('vingativo') ? 1.4 : 0) + (v.tracos.includes('cruel') ? 0.8 : 0) + (v.tracos.includes('orgulhoso') && v.tracos.includes('corajoso') ? 0.8 : 0)
        - (v.tracos.includes('covarde') ? 0.8 : 0) - (v.tracos.includes('gentil') ? 0.6 : 0),
    };
    let op = escolha && escolha !== 'auto' ? escolha : '';
    if (!op) {
      const total = Object.values(w).reduce((s, x) => s + Math.max(0, x), 0);
      let r = this.r() * total;
      for (const [k, x] of Object.entries(w)) if ((r -= Math.max(0, x)) <= 0) { op = k; break; }
      op ||= 'confrontar';
    }
    const casados = v.conjuge === t.id;
    switch (op) {
      case 'perdoar':
        this.lembra(v.id, t.id, 'perdoei a traição', 25, 60);
        this.lembra(t.id, v.id, 'me perdoou', 20, 60);
        if (this.temVinc(t.id, a.id, 'amantes')) this.terminar(t, a, t);
        this.say('romance', 'perdao', `${this.L(v.id)} perdoa ${this.L(t.id)}, mas não esquece.`, [v.id, t.id], 2);
        break;
      case 'confrontar':
        this.mexe(t.id, v.id, { afeto: -8 });
        this.say('conflito', 'confronto', `${this.L(v.id)} confronta ${this.L(t.id)} aos gritos; a vizinhança inteira escuta.`, [v.id, t.id], 2);
        this.espalhar(t, a, v.local, 3);
        if (this.chance(0.5)) {
          this.lembra(v.id, t.id, 'aceitei de volta', 10, 36);
          if (this.temVinc(t.id, a.id, 'amantes') && this.chance(0.6)) this.terminar(t, a, t);
        } else this.terminar(v, t, v);
        if (this.chance(0.35 * this.ajustes.violencia) && this.vivo(a.id) && this.ondeEsta(a) === this.ondeEsta(v)) this.briga(v, a, 'briga');
        break;
      case 'terminar':
        this.terminar(v, t, v);
        break;
      case 'vingar':
        v.meta = { tipo: 'vinganca', alvo: a.id, desde: this.t };
        this.say('conflito', 'vinganca', `${this.L(v.id)} jura vingança contra ${this.L(a.id)}.`, [v.id, a.id], 2);
        if (casados && this.chance(0.5)) this.terminar(v, t, v);
        if (this.ondeEsta(a) === this.ondeEsta(v)) this.briga(v, a, v.tracos.includes('cruel') && this.chance(0.4) ? 'emboscada' : 'duelo');
        break;
    }
  }

  /** O caso cai na boca do povo. */
  espalhar(t: Pessoa, a: Pessoa, lugar: string, quantos: number): void {
    const s = this.segredos.find((x) => x.tipo === 'caso' && x.sobre.includes(t.id) && x.sobre.includes(a.id));
    if (!s) return;
    const aqui = (this.presentes.get(lugar) ?? []).filter((x) => !s.sabem.includes(x));
    for (let i = 0; i < quantos && aqui.length; i++) s.sabem.push(aqui.splice(Math.floor(this.r() * aqui.length), 1)[0]!);
    this.publicar(s);
  }

  /** Com gente demais sabendo, o segredo vira escândalo: a vila inteira fica sabendo. */
  publicar(s: Segredo): void {
    const fora = s.sabem.filter((x) => !s.sobre.includes(x)).length;
    if (s.publico || fora < 4) return;
    s.publico = true;
    const onde = new Set(s.sobre.map((x) => this.pessoas.get(x)?.local).filter(Boolean));
    for (const p of this.vivos()) if (onde.has(p.local) && !s.sabem.includes(p.id)) s.sabem.push(p.id);
    if (s.tipo === 'caso') {
      for (const id of s.sobre) {
        const p = this.vivo(id);
        if (p && this.comprometido(p)) this.ganhaTraco(p, 'infame', false);
      }
      this.say('social', 'escandalo', `Escândalo: a vila inteira já sabe do caso de ${s.sobre.map((x) => this.L(x)).join(' e ')}.`, s.sobre, 2);
    } else if (s.tipo === 'assassinato') {
      const [assassino, vitima] = s.sobre as [string, string];
      const p = this.vivo(assassino);
      if (p) this.ganhaTraco(p, 'infame', false);
      this.say('conflito', 'escandalo', `Todos agora sabem: foi ${this.L(assassino)} quem matou ${this.L(vitima)}.`, s.sobre, 3);
    }
  }

  briga(a: Pessoa, b: Pessoa, modo: Modo): void {
    lutar(this, a, b, modo);
  }

  ferir(p: Pessoa, grave: boolean): string | null {
    this.estresse(p, 10);
    p.saude = clamp(p.saude - (grave ? 35 : 12), 0, 100);
    if (!grave && !this.chance(0.25)) return null;
    const marcas = ['cicatriz', 'cicatriz', 'manco', 'caolho', 'mutilado'].filter((m) => !p.tracos.includes(m));
    const m = grave ? this.pick(marcas.length ? marcas : ['cicatriz']) : 'cicatriz';
    if (p.tracos.includes(m)) return null;
    p.tracos.push(m);
    return m;
  }

  morrer(p: Pessoa, causa: string): void {
    if (p.morte !== null) return;
    p.morte = this.t;
    p.causa = causa;
    p.viagem = null;
    p.gravidez = null;
    this.mudouGente = true;
    this.contagem.mortes++;
    const idade = this.idade(p);
    this.say('morte', 'morte', idade < 1 ? `${this.L(p.id)} morre ${causa}.` : `${this.L(p.id)} morre ${causa} aos ${idade} ${idade === 1 ? 'ano' : 'anos'}.`, [p.id], 3);
    // luto e herança
    const herdeiros: Pessoa[] = [];
    const c = this.vivo(p.conjuge);
    if (c) {
      c.conjuge = null;
      p.conjuge = null;
      this.casouOuSeparou(p.id, c.id);
      c.estados['enlutado'] = this.t + 18;
      this.humor(c, -40);
      this.estresse(c, 30);
      this.xp(c, 'perdas');
      herdeiros.push(c);
      this.say('familia', 'viuvez', `${this.L(c.id)} fica ${this.g(c, 'viúvo', 'viúva')}.`, [c.id, p.id], 2);
    }
    for (const f of this.filhosOficiais(p.id).filter((x) => x.morte === null)) {
      f.estados['enlutado'] = this.t + 12;
      this.humor(f, -30);
      this.estresse(f, 20);
      this.xp(f, 'perdas');
      herdeiros.push(f);
    }
    for (const x of [...p.pais, ...this.comVinculo(p.id, 'amantes').map((y) => y.id), ...this.comVinculo(p.id, 'amigos').map((y) => y.id)]) {
      const q = this.vivo(x);
      if (!q || herdeiros.includes(q)) continue;
      this.humor(q, -20);
      if (this.opiniao(q.id, p.id) > 40) q.estados['enlutado'] = this.t + 6;
    }
    if (herdeiros.length && p.dinheiro > 0) {
      const parte = p.dinheiro / herdeiros.length;
      for (const h of herdeiros) h.dinheiro += parte;
      p.dinheiro = 0;
    }
    this.herdarItens(p, herdeiros);
    for (const o of this.ligados(p.id)) for (const v of ['namoro', 'noivado', 'amantes'] as Vinculo[]) this.desliga(p.id, o, v);
    this.romCache.clear();
    this.parCache.clear();
    // órfãos: quem gosta mais deles cuida
    for (const f of this.filhosOficiais(p.id).filter((x) => x.morte === null && this.crianca(x))) {
      if (f.pais.some((x) => this.vivo(x))) continue;
      const tutores = this.vivos().filter((x) => x.id !== f.id && this.adulto(x) && (this.parentesco(f.id, x.id) || this.intimidade(f.id, x.id) > 40));
      const t = tutores.sort((x, y) => this.opiniao(y.id, f.id) - this.opiniao(x.id, f.id))[0];
      if (t) {
        f.local = t.local;
        this.mexe(t.id, f.id, { afeto: 20, intimidade: 30 });
        this.mexe(f.id, t.id, { afeto: 15, intimidade: 30 });
        this.say('familia', 'tutela', `${this.L(f.id)}, órf${this.g(f, 'ão', 'ã')}, passa a viver com ${this.L(t.id)}.`, [f.id, t.id], 2);
      }
    }
    this.emitir('morte', [p.id], [causa]);
  }

  /** Tenta engravidar `a` e `b` (precisa de uma mulher e um homem férteis). */
  conceber(a: Pessoa, b: Pessoa, mult = 1): boolean {
    const mae = a.sexo === 'f' ? a : b.sexo === 'f' ? b : null;
    const pai = a.sexo === 'm' ? a : b.sexo === 'm' ? b : null;
    if (!mae || !pai || mae === pai || mae.gravidez || this.t < mae.resguardo || !this.podeRomance(mae.id, pai.id)) return false;
    const fm = this.fertil(mae);
    const fp = this.fertil(pai);
    if (!this.chance(0.13 * fm * fp * this.ajustes.fertilidade * mult)) return false;
    const gemeos = this.chance(0.02 + ((mae.genes.gemeos[0] + mae.genes.gemeos[1]) / 2) * 0.04);
    mae.gravidez = { pai: pai.id, desde: this.t, gemeos };
    const oficial = this.conjuge(mae);
    const bastardo = !!oficial && oficial.id !== pai.id;
    this.say('familia', 'gravidez', `${this.L(mae.id)} está grávida${bastardo ? `. 🤫 O pai é ${this.L(pai.id)}, não ${this.L(oficial.id)}` : pai.id === mae.conjuge ? '' : ` de ${this.L(pai.id)}`}.`, [mae.id, pai.id], 2, bastardo);
    this.emitir('gravidez', [mae.id, pai.id]);
    return true;
  }

  fertil(p: Pessoa): number {
    if (p.tracos.includes('esteril') || !this.adulto(p) || p.morte !== null) return 0;
    const i = this.idadeBio(p);
    const base = this.atrib(p).fertilidade * (this.esp(p)?.fertilidade ?? 1);
    if (p.sexo === 'f') return base * (i < 18 ? 0 : i <= 32 ? 1 : i >= 47 ? 0 : 1 - (i - 32) / 15);
    return base * (i < 18 ? 0 : i <= 45 ? 1 : Math.max(0.15, 1 - (i - 45) / 40));
  }

  private nascer(mae: Pessoa): void {
    const g = mae.gravidez!;
    mae.gravidez = null;
    mae.resguardo = this.t + 3;
    const pai = this.pessoas.get(g.pai) ?? null;
    const oficial = this.conjuge(mae) ?? (pai && this.vivo(pai.id) ? pai : null);
    const f = pai ? consanguinidade(mae.id, pai.id, (id) => this.pessoas.get(id)?.pais) : 0;
    const local = this.ondeEsta(mae) ?? mae.local;
    const bebes: Pessoa[] = [];
    for (let i = 0; i < (g.gemeos ? 2 : 1); i++) {
      if (this.chance(0.025 * this.ajustes.mortalidade * (mae.tracos.includes('sangue fraco') ? 2 : 1))) {
        this.say('familia', 'natimorto', `O bebê de ${this.L(mae.id)} nasce sem vida.`, [mae.id, ...(pai ? [pai.id] : [])], 2);
        this.humor(mae, -40);
        this.xp(mae, 'perdas');
        continue;
      }
      const genes = pai ? herdar(mae.genes, pai.genes, this.r, f) : mae.genes;
      const sexo = this.chance(0.5) ? 'f' : 'm';
      const mix = (k: number) => clamp(0.45 * ((mae.big5[k] ?? 50) + (pai?.big5[k] ?? 50)) / 2 + 0.55 * (25 + this.r() * 50), 0, 100);
      const big5 = [0, 1, 2, 3, 4].map(mix) as Big5;
      const tracos = tracosDosGenes(genes, f);
      for (const pp of [mae, pai]) {
        for (const tid of pp?.tracos ?? []) {
          const tr = this.cat.tracos.get(tid);
          if (!tr?.herda || tracos.includes(tid) || (tr.oposto && tracos.includes(tr.oposto))) continue;
          if (this.chance(tr.herda)) tracos.push(tid);
        }
      }
      if (g.gemeos) tracos.push('gemeo');
      const casa = (oficial?.casa ?? pai?.casa ?? mae.casa) || null;
      // povo: o dos dois, ou de um deles (sorte fixa)
      const ep = (oficial ?? pai)?.etnia ?? null;
      const etnia = !ep || !mae.etnia || ep === mae.etnia ? mae.etnia ?? ep : this.unif(mae, `filho:${this.t}:${i}`) < 0.5 ? mae.etnia : ep;
      const eb = etnia ? this.cat.etnias.get(etnia) : undefined;
      const pool = eb ? (sexo === 'f' ? eb.nomesF : eb.nomesM) : [];
      const nome = this.nomeUnico(pool.length && this.unif(mae, `nome:${this.t}:${i}`) < 0.7
        ? `${pool[Math.floor(this.unif(mae, `nomei:${this.t}:${i}`) * pool.length)]}${casa ? ` ${casa}` : ''}`
        : nomeDeBebe(this, sexo, mae, oficial));
      const especie = this.especieDoFilho(mae, pai);
      const eFilho = especie ? this.cat.especies.get(especieId(especie)) : undefined;
      const b: Pessoa = {
        id: `x${++this.seq}`, nome, nota: null, sexo, genero: sexo, orientacao: this.orientacaoAleatoria(), nasc: this.t, morte: null, causa: null, destino: null,
        local, viagem: null, especie, vida: eFilho?.vida ?? mae.vida, casa, pais: [mae.id, pai?.id ?? null], paiOficial: oficial && pai && oficial.id !== pai.id ? oficial.id : null,
        conjuge: null, prof: null, genes, big5, tracos, gostos: [], hab: { combate: 0, labia: 0, intriga: 0, oficio: 0, saber: 0 }, saude: 90, humor: 20, estresse: 0,
        dinheiro: 0, gravidez: null, resguardo: 0, meta: null, xp: {}, conduzido: false, protegido: false, estados: {}, campos: {},
        etnia, faccao: (oficial ?? pai)?.faccao ?? mae.faccao ?? null,
      };
      this.herdarAtributos(b, mae, pai);
      this.entra(b);
      bebes.push(b);
      this.contagem.nasc++;
    }
    if (!bebes.length) return;
    const nomes = bebes.map((b) => this.L(b.id)).join(' e ');
    const filho = bebes.length > 1 ? 'gêmeos' : this.g(bebes[0]!, 'filho', 'filha');
    this.say('familia', 'nascimento', `Nasce${bebes.length > 1 ? 'm' : ''} ${nomes}, ${filho} de ${this.L(mae.id)}${oficial ? ` e ${this.L(oficial.id)}` : ''}.`, [...bebes.map((b) => b.id), mae.id, ...(oficial ? [oficial.id] : [])], 3);
    if (pai && oficial && pai.id !== oficial.id) {
      for (const b of bebes) this.segredo('paternidade', [b.id, pai.id, mae.id], [mae.id, ...(this.temVinc(mae.id, pai.id, 'amantes') ? [pai.id] : [])]);
      this.say('familia', 'bastardo', `🤫 O pai de verdade é ${this.L(pai.id)}.`, [pai.id, mae.id, ...bebes.map((b) => b.id)], 2, true);
    }
    this.humor(mae, 25);
    if (oficial) this.humor(oficial, 20);
    for (const b of bebes) this.emitir('nascimento', [b.id, mae.id, ...(pai ? [pai.id] : [])]);
    // parto: o risco que ninguém controla
    const curandeira = (this.presentes.get(local) ?? []).some((x) => this.pessoas.get(x)?.prof === 'curandeiro');
    const idade = this.idadeBio(mae);
    const risco = 0.012 * this.ajustes.mortalidade * (mae.tracos.includes('fragil') ? 2 : 1) * (mae.tracos.includes('robusto') ? 0.5 : 1)
      * (mae.tracos.includes('sangue fraco') ? 2.5 : 1) * (curandeira ? 0.4 : 1) * (idade > 38 ? 1.8 : 1) * (bebes.length > 1 ? 1.6 : 1);
    if (!mae.protegido && this.chance(risco)) this.morrer(mae, 'no parto');
  }

  /** Espécie de quem nasce: a híbrida do `cruza com ... gera`, ou a da mãe. */
  private especieDoFilho(mae: Pessoa, pai: Pessoa | null): string | null {
    if (!pai) return mae.especie;
    const em = this.eid(mae);
    const ep = this.eid(pai);
    if (em === ep) return mae.especie;
    const cruz = this.cat.especies.get(em)?.cruza.find((c) => c.com === ep) ?? this.cat.especies.get(ep)?.cruza.find((c) => c.com === em);
    return cruz?.gera ?? mae.especie;
  }

  /** Uniforme fixo por pessoa e chave (0 a 1). */
  private unif(p: Pessoa, chave: string): number {
    return seededRng(hash53(`${p.id}|${chave}`, this.semente) % 2147483647 || 1)();
  }

  /** A pessoa tem este atributo? (atributos `só para` certas espécies) */
  temAtributo(p: Pessoa, id: string): boolean {
    const a = this.cat.atributos.get(id);
    return !!a && (!a.so.length || a.so.includes(this.eid(p))) && this.passa(p, a.filtro.ethnicities.length || a.filtro.sex || a.filtro.factions.length || a.filtro.minAge !== null || a.filtro.maxAge !== null ? { ...a.filtro, species: [] } : null);
  }

  /** Sorteio fixo por pessoa e atributo (não gasta a sorte da simulação: acrescentar um atributo não muda o resto da história). */
  private sorteioDe(p: Pessoa, chave: string): number {
    const r = seededRng(hash53(`${p.id}|${chave}`, this.semente) % 2147483647 || 1);
    // normal padrão (Box-Muller)
    return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  }

  /** Valor inicial de um atributo: média (mais o ajuste da espécie) e um desvio. */
  private atributoInicial(p: Pessoa, id: string): number {
    const a = this.cat.atributos.get(id)!;
    const mod = (this.esp(p)?.mods[id] ?? 0) + (this.etnia(p)?.mods[id] ?? 0);
    return clamp(Math.round((a.media + mod + this.sorteioDe(p, id) * a.desvio) * 10) / 10, a.min, a.max);
  }

  private herdarAtributos(b: Pessoa, mae: Pessoa, pai: Pessoa | null): void {
    for (const a of this.cat.atributos.values()) {
      if (!this.temAtributo(b, a.id)) continue;
      const proprio = this.atributoInicial(b, a.id);
      const vm = mae.campos[a.id];
      const vp = pai?.campos[a.id];
      const pais = [vm, vp].filter((x): x is number => typeof x === 'number');
      if (!a.herda || !pais.length) {
        b.campos[a.id] = proprio;
        continue;
      }
      const media = pais.reduce((s, x) => s + x, 0) / pais.length;
      b.campos[a.id] = clamp(Math.round((media * a.herda + proprio * (1 - a.herda)) * 10) / 10, a.min, a.max);
    }
  }

  private orientacaoAleatoria(): Pessoa['orientacao'] {
    const r = this.r();
    return r < 0.86 ? 'hetero' : r < 0.95 ? 'bi' : r < 0.99 ? 'homo' : 'ace';
  }

  nomeUnico(base: string): string {
    if (!this.porNome.has(fold(base))) return base;
    const romanos = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    for (const r of romanos) if (!this.porNome.has(fold(`${base} ${r}`))) return `${base} ${r}`;
    let n = 11;
    while (this.porNome.has(fold(`${base} ${n}`))) n++;
    return `${base} ${n}`;
  }

  private entra(p: Pessoa): void {
    // espécie: expectativa de vida e traços de nascença; atributos que faltam ganham valor
    const e = this.esp(p);
    if (e?.vida && p.vida === 70) p.vida = e.vida;
    for (const t of e?.tracos ?? []) if (!p.tracos.includes(t)) p.tracos.push(t);
    // traços que a espécie pode ter: sorteio fixo por pessoa
    for (const [t, c] of Object.entries(e?.talvez ?? {})) if (!p.tracos.includes(t) && this.unif(p, `talvez:${t}`) < c) p.tracos.push(t);
    // povo: traços de todos e traços possíveis (o nome do povo pode vir escrito na ficha)
    if (p.etnia && !this.cat.etnias.has(p.etnia)) p.etnia = etniaDoTexto(this.cat, p.etnia) ?? p.etnia;
    const et = this.etnia(p);
    for (const t of et?.tracos ?? []) if (!p.tracos.includes(t)) p.tracos.push(t);
    for (const [t, c] of Object.entries(et?.talvez ?? {})) if (!p.tracos.includes(t) && this.unif(p, `etnia:${t}`) < c) p.tracos.push(t);
    // traços com "nasce com": sorteio fixo por pessoa, só para quem passa no filtro
    for (const tr of this.cat.tracos.values()) {
      if (!tr.nasce || p.tracos.includes(tr.id) || (tr.oposto && p.tracos.includes(tr.oposto))) continue;
      if (this.passa(p, tr.filtro ? { ...tr.filtro, minAge: null, maxAge: null } : null) && this.unif(p, `nasce:${tr.id}`) < tr.nasce) p.tracos.push(tr.id);
    }
    for (const a of this.cat.atributos.values()) {
      if (!this.temAtributo(p, a.id)) continue;
      if (typeof p.campos[a.id] !== 'number') p.campos[a.id] = this.atributoInicial(p, a.id);
    }
    if (e?.criatura) p.prof = null;
    // profissão que a pessoa não pode ter (filtro "para"): procura outra quando o elenco estiver pronto
    const pf = p.prof ? this.cat.profs.get(p.prof) : undefined;
    if (pf?.filtro && !this.passa(p, pf.filtro)) {
      p.prof = null;
      this.semProf.add(p.id);
    }
    this.pessoas.set(p.id, p);
    this.porNome.set(fold(p.nome), p.id);
    for (const pp of new Set([...p.pais, p.paiOficial])) {
      if (!pp) continue;
      const l = this.filhosDe.get(pp) ?? [];
      if (!l.includes(p.id)) l.push(p.id);
      this.filhosDe.set(pp, l);
    }
    if (!this.lugares.has(p.local)) this.lugares.set(p.local, this.entPorCaminho.get(p.local)?.name ?? p.local);
    this.mudouGente = true;
  }

  /** Acha uma pessoa pelo nome (para os [[links]] da crônica). */
  porNomeDe(nome: string): Pessoa | undefined {
    const id = this.porNome.get(fold(nome.trim()));
    return id ? this.pessoas.get(id) : undefined;
  }

  // ================================================================ o mês

  /** Anda `n` meses. Para antes se surgir uma decisão, ou se `parar` disser sim a um acontecimento. */
  avancar(n: number, parar?: (e: VidaEvento) => boolean): Passo {
    const antes = this.eventos.length;
    let meses = 0;
    let parou: Passo['parou'] = null;
    for (let i = 0; i < n; i++) {
      this.aplicarPendentes();
      if (this.decisoes.length) {
        parou = 'decisao';
        break;
      }
      if (!this.vivos().length) {
        parou = 'fim';
        break;
      }
      const ini = this.eventos.length;
      this.mes();
      meses++;
      if (parar && this.eventos.slice(ini).some(parar)) {
        parou = 'evento';
        break;
      }
    }
    this.aplicarPendentes();
    if (!parou && this.decisoes.length) parou = 'decisao';
    return { meses, parou, novos: this.eventos.slice(antes) };
  }

  /** Repete as intervenções gravadas para este mês (replay). */
  aplicarPendentes(): void {
    while (this.pendentes.length && this.pendentes[0]!.t <= this.t) {
      const r = this.pendentes.shift()!;
      this.executar(r.cmd);
      this.registro.push(r);
    }
  }

  /** Tramas (interações em etapas) em andamento; com `id`, só as de quem tem esse id. */
  tramas(id?: string): Array<{ nome: string; etapa: string; passo: number; passos: number; quem: string[]; meses: number }> {
    if (!this.rt) return [];
    return this.rt.activeSchemes()
      .filter((r) => !id || r.who.includes(id))
      .map((r) => ({ nome: r.name, etapa: r.stage, passo: r.step, passos: r.steps, quem: r.who, meses: r.age }));
  }

  /** Quantas intervenções ainda faltam repetir. */
  get faltam(): number {
    return this.pendentes.length;
  }

  private mes(): void {
    const t = this.t;
    const novoAno = mesDoAno(t) === 1;
    this.tocados.clear();
    this.atribCache.clear();
    // o que muda devagar (beleza com a idade, memórias que apagam) é recalculado uma vez por ano
    if (novoAno) {
      this.romCache.clear();
      this.compatCache.clear();
      this.quimCache.clear();
      this.opCache.clear();
    }
    this.sabedores.clear();
    for (const sg of this.segredos) for (const x of sg.sabem) if (!sg.sobre.includes(x)) this.sabedores.add(x);
    this.mapearPresenca();
    const vivos = this.vivos();
    if (novoAno) {
      for (const a of this.cat.atributos.values()) {
        if (!a.porAno) continue;
        for (const p of vivos) if (this.temAtributo(p, a.id)) p.campos[a.id] = clamp(Math.round(((Number(p.campos[a.id]) || 0) + a.porAno) * 10) / 10, a.min, a.max);
      }
    }
    for (const p of vivos) this.vida(p);
    this.mapearPresenca();
    this.efeitosDoMundo();
    this.guerras.mes();
    this.mapearPresenca();
    this.itensDoMes();
    this.eventosDoMundo();
    // encontros
    const ordem = this.embaralhar(this.vivos());
    for (const p of ordem) if (p.morte === null) this.agir(p);
    // o acaso: fadas, vexames, escândalos, incêndios (pelo tom do mundo)
    acasoDoMes(this, this.sorte);
    this.consequencias();
    this.vinculosDoMes();
    // regras do mundo
    if (this.rt) {
      if (this.mudouGente) this.ligarRegras();
      this.rt.month(anoDe(t), novoAno);
      for (const p of this.vivos()) {
        for (const id of [...(p.itens ?? [])]) {
          const it = this.cat.itens.get(id);
          if (it?.regra?.monthly.length && p.morte === null) this.rt.runBody(it.regra.monthly, { dono: new Ent(p.id), item: it.nome, isto: new Ent(p.id) }, it.regra.src);
        }
      }
      this.coletarIssues();
    }
    if (mesDoAno(t) === 12) {
      this.historia.push({ ano: anoDe(t), vivos: this.vivos().length, ...this.contagem });
      this.contagem = { nasc: 0, mortes: 0, casam: 0 };
      this.podar();
    }
    this.t++;
    // quem está onde no começo do mês seguinte (a tela e as intervenções usam)
    this.mapearPresenca();
  }

  private embaralhar<T>(l: T[]): T[] {
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [l[i], l[j]] = [l[j]!, l[i]!];
    }
    return l;
  }

  private mapearPresenca(): void {
    this.presentes.clear();
    this.onde.clear();
    for (const p of this.pessoas.values()) {
      if (p.morte !== null) continue;
      const o = this.ondeEsta(p);
      this.onde.set(p.id, o);
      if (o === null) continue;
      const l = this.presentes.get(o) ?? [];
      l.push(p.id);
      this.presentes.set(o, l);
    }
  }

  /** Quem está no mesmo lugar que a pessoa, agora. */
  aoRedor(p: Pessoa): string[] {
    const o = this.onde.get(p.id) ?? this.ondeEsta(p);
    return o === null ? [] : (this.presentes.get(o) ?? []).filter((x) => x !== p.id);
  }

  private efeito(tipo: Efeito['tipo'], lugar: string | null): boolean {
    return this.efeitos.some((e) => e.tipo === tipo && e.ate >= this.t && (e.lugar === null || e.lugar === lugar));
  }

  // ---------------------------------------------------------------- vida de cada um

  private vida(p: Pessoa): void {
    const t = this.t;
    // viagem
    const v = p.viagem;
    if (v) {
      const front = v.para.startsWith('§');
      if (t === v.chega && !front) this.say('vida', 'chegada', `${this.L(p.id)} chega a [[${this.lugarNome(v.para)}]].`, [p.id], 1);
      if (v.para === p.local && t >= v.chega) {
        p.viagem = null;
      } else if (t >= v.chega + 2 && !front && !this.efeito('guerra', p.local)) {
        // volta para casa
        const dur = this.duracao(v.para, p.local);
        p.viagem = { para: p.local, chega: t + dur, motivo: 'volta' };
      } else if (t < v.chega && !front) {
        this.estrada(p);
        if (p.morte !== null) return;
      }
    }
    if (p.destino !== null && t >= p.destino) {
      this.morrer(p, 'como estava escrito');
      return;
    }
    for (const [k, ate] of Object.entries(p.estados)) {
      if (t <= ate) continue;
      delete p.estados[k];
      const fim = ESTADOS_VIDA[k]?.fim;
      if (fim) this.say('acaso', 'fim', fim.replace(/\{a\}/g, this.L(p.id)).replace(/\{o\/a\}/g, this.g(p, 'o', 'a')), [p.id], 2);
    }

    // gravidez
    if (p.gravidez && t - p.gravidez.desde >= (this.esp(p)?.gestacao ?? 9)) {
      this.nascer(p);
      if (p.morte !== null) return;
    }

    const idade = this.idadeBio(p);
    const curandeiro = (this.presentes.get(p.local) ?? []).some((x) => x !== p.id && this.pessoas.get(x)?.prof === 'curandeiro');
    // doença
    const doente = 'doente' in p.estados;
    if (doente) {
      if (this.chance(curandeiro ? 0.35 : 0.18)) {
        delete p.estados['doente'];
        if (p.saude < 30) this.say('vida', 'cura', `${this.L(p.id)} se recupera da doença.`, [p.id], 1);
      } else p.saude = clamp(p.saude - this.entre(2, 7), 0, 100);
    } else {
      const pc = (0.002 + Math.max(0, idade - 45) * 0.0002 + (this.efeito('peste', p.local) ? 0.09 : 0) + (p.saude < 40 ? 0.004 : 0))
        * (p.tracos.includes('fragil') ? 2 : 1) * (p.tracos.includes('robusto') ? 0.4 : 1) * (p.tracos.includes('alcoolatra') ? 1.5 : 1);
      if (this.chance(pc)) {
        p.estados['doente'] = t + 24;
        p.saude = clamp(p.saude - this.entre(10, 35), 0, 100);
        this.say('vida', 'doenca', `${this.L(p.id)} adoece${this.efeito('peste', p.local) ? ' com a peste' : ''}.`, [p.id], 1);
        this.emitir('doenca', [p.id]);
      } else {
        const teto = 100 - Math.max(0, idade - 50) * 1.2;
        p.saude = clamp(p.saude + 1.5, 0, teto);
      }
    }
    if (p.saude <= 0 && !p.protegido) {
      this.morrer(p, doente ? 'de doença' : 'de fraqueza');
      return;
    }
    // velhice e mortalidade infantil (Gompertz)
    const longe = 0.85 + ((p.genes.longevidade[0] + p.genes.longevidade[1]) / 2) * 0.3 + (p.tracos.includes('longevo') ? 0.12 : 0);
    const ia = idade / longe;
    let anual = ia < 5 ? 0.02 : 0.00025 * Math.exp(0.088 * ia);
    anual *= (p.saude < 40 ? 2.5 : 1) * (p.tracos.includes('fragil') ? 1.5 : 1) * (p.tracos.includes('robusto') ? 0.7 : 1)
      * (p.tracos.includes('consanguineo') ? 1.4 : 1) * (p.tracos.includes('sangue fraco') ? 1.5 : 1) * (curandeiro ? 0.75 : 1)
      * (p.dinheiro > 60 ? 0.8 : p.dinheiro < 3 ? 1.3 : 1) * this.ajustes.mortalidade;
    if (!p.protegido && this.chance(1 - Math.pow(1 - Math.min(0.95, anual), 1 / 12))) {
      this.morrer(p, ia < 5 ? (this.idade(p) < 1 ? 'com poucos meses de vida' : `ainda pequen${this.g(p, 'o', 'a')}`) : ia > 60 ? 'de velhice' : this.pick(['de uma febre repentina', 'de um mal súbito', 'de uma infecção']));
      return;
    }

    // acidente de trabalho
    const pr = this.prof(p);
    if (pr && this.adulto(p) && pr.risco && this.chance(pr.risco)) {
      if (!p.protegido && this.chance(0.18)) {
        this.morrer(p, `num acidente de trabalho (${this.nomeProf(p)})`);
        return;
      }
      const m = this.ferir(p, this.chance(0.3));
      this.say('vida', 'acidente', `${this.L(p.id)} se machuca trabalhando${m ? ` e fica com ${m === 'cicatriz' ? 'uma cicatriz' : this.nomeTraco(p, m)}` : ''}.`, [p.id], 1);
    }

    // vida a dois: casais que moram juntos têm filhos sem precisar "sortear" a noite
    if (p.sexo === 'f' && !p.gravidez && t >= p.resguardo) {
      const c = this.conjuge(p);
      if (c && c.sexo === 'm' && this.ondeEsta(c) === this.ondeEsta(p) && p.orientacao !== 'ace' && this.opiniao(p.id, c.id) > -30) {
        const desejo = 0.55 * (p.tracos.includes('luxurioso') || c.tracos.includes('luxurioso') ? 1.3 : 1) * (p.tracos.includes('casto') ? 0.7 : 1);
        if (this.chance(desejo)) {
          const filhos = this.filhosOficiais(p.id).filter((f) => f.morte === null);
          const pequenos = filhos.filter((f) => this.idade(f) < 2).length;
          const querem = p.meta?.tipo === 'familia' || c.meta?.tipo === 'familia';
          this.conceber(p, c, (filhos.length >= 6 ? 0.15 : filhos.length >= 4 ? 0.4 : 1) * (pequenos ? 0.5 : 1) * (querem ? 1.4 : 1));
        }
      }
    }

    // aniversário: maioridade, traços que surgem, metas
    const aniversario = mesDoAno(p.nasc) === mesDoAno(t) && t !== p.nasc;
    if (aniversario) this.anoNovoDe(p);

    // dinheiro
    const fome = this.efeito('fome', p.local);
    const farto = this.efeito('fartura', p.local);
    if (pr && this.adulto(p) && !this.naGuerra(p) && !this.bloqueado(p)) {
      p.dinheiro += pr.renda * (0.6 + (p.hab[pr.hab as Habilidade] ?? 5) / 25) * (fome ? 0.4 : farto ? 1.5 : 1) * (p.tracos.includes('preguicoso') ? 0.7 : 1);
      this.sobe(p, pr.hab, 0.02);
    }
    if (this.adulto(p)) {
      const filhos = this.filhosOficiais(p.id).filter((x) => x.morte === null && this.crianca(x)).length;
      p.dinheiro = Math.max(0, p.dinheiro - 2 - filhos * 0.5);
      // casal divide quando um aperta
      const c = this.conjuge(p);
      if (c && p.dinheiro < 3 && c.dinheiro > 20) this.dar(c, p, 5);
    }
    if (fome) {
      this.estresse(p, 3);
      p.saude = clamp(p.saude - 1, 0, 100);
    }

    // humor e estresse
    let base = 0;
    for (const id of p.tracos) base += this.cat.tracos.get(id)?.humor ?? 0;
    const c = this.conjuge(p);
    if (c) base += this.opiniao(p.id, c.id) / 6;
    if (p.dinheiro < 3 && this.adulto(p)) {
      base -= 10;
      this.estresse(p, 2);
    } else if (p.dinheiro > 40) base += 5;
    if (p.estados['enlutado']) base -= 25;
    if (doente) base -= 15;
    if (farto) base += 6;
    base -= p.estresse / 5;
    p.humor = clamp(p.humor * 0.9 + base * 0.1, -100, 100);
    let carga = 0;
    for (const id of p.tracos) carga += this.cat.tracos.get(id)?.estresse ?? 0;
    // culpa: quem trai e é honesto ou leal
    if (this.amantes(p).length && this.comprometido(p) && (p.tracos.includes('honesto') || p.tracos.includes('leal'))) carga += 3;
    p.estresse = clamp(p.estresse * 0.95 + carga * 0.1 + (p.big5[4] - 50) / 100, 0, 100);
    if (p.estresse > 85 && this.chance(0.12)) this.desabar(p);
  }

  private anoNovoDe(p: Pessoa): void {
    const bio = this.idadeBio(p);
    // virou adulto: quem pode namorar quem muda
    if (bio >= 18 && bio < 19 || this.idade(p) === 18) this.romCache.clear();
    if (bio >= 16 && !p.xp['adulto']) this.maioridade(p);
    else if (bio >= 6 && p.gostos.length < 2 && this.chance(0.5)) {
      const novo = this.pick(this.cat.gostos);
      if (!p.gostos.includes(novo)) p.gostos.push(novo);
    }
    // a experiência vira traço
    const x = (k: string) => p.xp[k] ?? 0;
    if (x('vitorias') >= 3 && this.chance(0.35)) this.ganhaTraco(p, 'brigao');
    if (x('lutas') >= 4 && this.chance(0.4)) this.ganhaTraco(p, 'veterano');
    if (x('traido') >= 1 && !p.tracos.includes('desconfiado') && this.chance(0.35)) this.ganhaTraco(p, 'desconfiado');
    if (x('perdas') >= 2 && this.chance(0.2)) this.ganhaTraco(p, this.chance(0.5) ? 'amargurado' : 'melancolico');
    if (x('bebedeiras') >= 20 && this.chance(0.3)) this.ganhaTraco(p, 'alcoolatra');
    if (bio >= 55 && (p.hab.saber >= 11 || x('ensinou') >= 8) && this.chance(0.35)) this.ganhaTraco(p, 'sabio');
    if (x('amantes') >= 3 && this.chance(0.4)) this.ganhaTraco(p, 'devasso');
    // traços das regras que surgem sozinhos (`surge onde ...`)
    if (this.rt) {
      for (const tr of this.cat.tracos.values()) {
        const r = tr.regra;
        if (!r?.emerge || p.tracos.includes(tr.id) || !this.passa(p, tr.filtro)) continue;
        if (this.rt.check(r.emerge, p.id, 'personagem', r.src) && this.chance(r.emergeChance)) this.ganhaTraco(p, tr.id);
      }
    }
    // atributos que só existem numa faixa de idade aparecem quando ela chega
    for (const a of this.cat.atributos.values()) if (typeof p.campos[a.id] !== 'number' && this.temAtributo(p, a.id)) p.campos[a.id] = this.atributoInicial(p, a.id);
    // o temperamento muda devagar com a vida
    p.big5[4] = clamp(p.big5[4] + (p.estresse - 40) / 40, 0, 100);
    if (bio > 50) p.big5[0] = clamp(p.big5[0] - 0.3, 0, 100);
    // metas
    if (this.adulto(p) && (!p.meta || this.metaCumprida(p) || this.t - p.meta.desde > 120)) {
      const antiga = p.meta;
      p.meta = this.novaMeta(p);
      if (antiga && this.metaCumprida({ ...p, meta: antiga })) this.humor(p, 15);
    }
  }

  private maioridade(p: Pessoa): void {
    p.xp['adulto'] = 1;
    if (this.criatura(p)) {
      this.emitir('maioridade', [p.id]);
      return;
    }
    // personalidade se firma: os extremos do temperamento viram traços
    const pers = p.tracos.filter((x) => this.cat.tracos.get(x)?.cat === 'personalidade').length;
    if (pers < 3) {
      const [ab, co, ex, am, ne] = p.big5;
      const cand: string[] = [];
      if (ex > 68) cand.push('sociavel');
      if (ex < 32) cand.push('timido');
      if (am > 70) cand.push('gentil');
      if (am < 26) cand.push(this.chance(0.4) ? 'cruel' : 'irascivel');
      if (co > 70) cand.push('trabalhador');
      if (co < 30) cand.push('preguicoso');
      if (ne > 70) cand.push(this.chance(0.5) ? 'irascivel' : 'melancolico');
      if (ne < 30) cand.push('calmo');
      if (ab > 70) cand.push('curioso');
      if (ab < 30) cand.push('tradicional');
      const pool = [...this.cat.tracos.values()].filter((t) => t.cat === 'personalidade' && !t.nasce && (!t.filtro || this.passa(p, t.filtro))).map((t) => t.id);
      while (cand.length < 3 - pers) cand.push(this.pick(pool));
      for (const c of cand.slice(0, 3 - pers)) {
        const tr = this.cat.tracos.get(c);
        if (!p.tracos.includes(c) && !(tr?.oposto && p.tracos.includes(tr.oposto))) p.tracos.push(c);
      }
    }
    // profissão
    if (!p.prof) {
      const pais = p.pais.map((x) => (x ? this.pessoas.get(x) : undefined)).filter(Boolean) as Pessoa[];
      if (pais.some((x) => x.prof === 'nobre')) p.prof = 'nobre';
      else {
        const herdada = pais.map((x) => x.prof).filter((x): x is string => !!x && x !== 'nobre');
        if (herdada.length && this.chance(0.35)) p.prof = this.pick(herdada);
        else p.prof = this.escolherProf(p);
      }
      // o ofício começa com alguma prática
      const pr = this.prof(p);
      if (pr) this.sobe(p, pr.hab, 3 + this.r() * 3);
    }
    if (!p.meta) p.meta = this.novaMeta(p);
    this.say('vida', 'maioridade', `${this.L(p.id)} chega à idade adulta${p.prof ? ` e vira ${this.nomeProf(p)}` : ''}.`, [p.id], 2);
    this.emitir('maioridade', [p.id]);
  }

  escolherProf(p: Pessoa): string | null {
    const aqui = (this.presentes.get(p.local) ?? []).map((x) => this.pessoas.get(x)?.prof);
    const opcoes: Array<{ id: string; w: number }> = [];
    for (const pr of this.cat.profs.values()) {
      if (pr.heranca) continue;
      if (pr.regra?.requires && this.rt && !this.rt.check(pr.regra.requires, p.id, 'personagem', pr.regra.src)) continue;
      if (!this.passa(p, pr.filtro)) continue;
      const ja = aqui.filter((x) => x === pr.id).length;
      const w = (pr.apto?.(p) ?? 1) / (1 + ja * 0.7);
      if (w > 0) opcoes.push({ id: pr.id, w });
    }
    if (!opcoes.length) return null;
    let r = this.r() * opcoes.reduce((s, o) => s + o.w, 0);
    for (const o of opcoes) if ((r -= o.w) <= 0) return o.id;
    return opcoes[opcoes.length - 1]!.id;
  }

  private novaMeta(p: Pessoa): Meta {
    const w: Array<[Meta['tipo'], number]> = [
      ['amor', this.comprometido(p) || p.orientacao === 'ace' ? 0 : 2 + (p.tracos.includes('romantico') ? 2 : 0)],
      ['familia', p.conjuge && this.filhosOficiais(p.id).length < 3 ? 2 : 0.2],
      ['riqueza', 0.8 + (p.tracos.includes('ganancioso') ? 2 : 0) + (p.tracos.includes('ambicioso') ? 1 : 0)],
      ['fama', 0.3 + (p.tracos.includes('ambicioso') ? 1.5 : 0) + (p.tracos.includes('orgulhoso') ? 0.8 : 0)],
      ['saber', 0.2 + (p.tracos.includes('curioso') ? 1.5 : 0)],
      ['paz', 0.5 + (p.tracos.includes('calmo') ? 1 : 0) + (p.tracos.includes('acomodado') ? 1 : 0)],
    ];
    // paixão: alguém que não sai da cabeça
    const quem = this.aoRedor(p).map((x) => ({ x, a: this.atracao(p.id, x) })).sort((a, b) => b.a - a.a)[0];
    if (quem && quem.a > 65 && !this.comprometido(p)) w.push(['conquistar', 3]);
    let r = this.r() * w.reduce((s, [, x]) => s + x, 0);
    for (const [tipo, x] of w) {
      if ((r -= x) <= 0) return { tipo, desde: this.t, ...(tipo === 'conquistar' && quem ? { alvo: quem.x } : {}) };
    }
    return { tipo: 'paz', desde: this.t };
  }

  private metaCumprida(p: Pessoa): boolean {
    const m = p.meta;
    if (!m) return false;
    switch (m.tipo) {
      case 'amor': return this.comprometido(p);
      case 'familia': return this.filhosOficiais(p.id).length >= 2;
      case 'riqueza': return p.dinheiro >= 120;
      case 'conquistar': return !!m.alvo && (this.parceiro(p)?.id === m.alvo || this.temVinc(p.id, m.alvo, 'amantes') || !this.vivo(m.alvo));
      case 'vinganca': return !m.alvo || !this.vivo(m.alvo) || this.opiniao(p.id, m.alvo) > -10;
      case 'saber': return p.hab.saber >= 15;
      case 'fama': return p.tracos.includes('heroi') || (p.xp['vitorias'] ?? 0) >= 5;
      default: return false;
    }
  }

  private desabar(p: Pessoa): void {
    const opcoes: Array<[string, string]> = [
      ['alcoolatra', 'afoga as mágoas na bebida'], ['melancolico', 'se fecha num silêncio pesado'], ['irascivel', 'passa a explodir por qualquer coisa'],
      ['amargurado', 'fica amargo com o mundo'], ['devoto', 'encontra consolo na fé'], ['traumatizado', 'tem pesadelos todas as noites'],
    ];
    const ok = opcoes.filter(([t]) => !p.tracos.includes(t) && !(this.cat.tracos.get(t)?.oposto && p.tracos.includes(this.cat.tracos.get(t)!.oposto!)));
    p.estresse = clamp(p.estresse - 35, 0, 100);
    if (!ok.length) return;
    const [t, frase] = this.pick(ok);
    this.ganhaTraco(p, t, false);
    this.say('vida', 'crise', `${this.L(p.id)} não aguenta mais a pressão e ${frase}.`, [p.id], 2);
    this.emitir('crise', [p.id]);
  }

  private estrada(p: Pessoa): void {
    if (!this.chance(0.035)) return;
    if (this.chance(0.55)) {
      lutar(this, p, null, 'emboscada');
    } else {
      const ach = this.pick(['uma bolsa esquecida na beira da estrada', 'um velho que conta histórias do caminho', 'um mercador que vende mapas de lugares que não existem', 'uma caravana amiga']);
      if (ach.startsWith('uma bolsa')) p.dinheiro += 10;
      this.say('vida', 'estrada', `Na estrada, ${this.L(p.id)} encontra ${ach}.`, [p.id], 1);
    }
  }

  // ---------------------------------------------------------------- encontros

  private vezes(p: Pessoa): number {
    let n = 1 + (p.big5[2] > 60 ? 1 : 0) + (p.tracos.includes('sociavel') ? 1 : 0) - (p.tracos.includes('timido') && this.chance(0.5) ? 1 : 0);
    if (this.efeito('festa', p.local)) n += 2;
    if (p.prof === 'taberneiro') n += 1;
    n = Math.round(n * this.ajustes.social);
    return clamp(n, 1, 6);
  }

  private agir(p: Pessoa): void {
    // algo sozinho (trabalhar, treinar, beber, viajar...)
    if (this.bloqueado(p)) return;
    if (!this.naGuerra(p) && !this.criatura(p)) this.sozinho(p);
    if (p.morte !== null) return;
    const perto = this.aoRedor(p);
    if (!perto.length) return;
    const n = this.vezes(p);
    const lista = this.candidatos(p, perto);
    if (!lista.length) return;
    const total = lista.reduce((s, c) => s + c.w, 0);
    for (let i = 0; i < n && p.morte === null; i++) {
      let r = this.r() * total;
      let b = lista[lista.length - 1]!.b;
      for (const c of lista) if ((r -= c.w) <= 0) { b = c.b; break; }
      if (b.morte !== null || this.ondeEsta(b) !== this.onde.get(p.id)) continue;
      this.encontro(p, b);
    }
  }

  /** Com quem a pessoa pode cruzar neste mês, com o peso de cada um. */
  private candidatos(p: Pessoa, perto: string[]): Array<{ b: Pessoa; w: number }> {
    const cands = new Set<string>();
    const aqui = this.onde.get(p.id);
    const proximo = (x: string | null | undefined) => {
      if (x && x !== p.id && this.onde.get(x) === aqui) cands.add(x);
    };
    for (const x of this.ligados(p.id)) proximo(x);
    proximo(p.conjuge);
    for (const x of p.pais) proximo(x);
    for (const f of this.filhosDe.get(p.id) ?? []) proximo(f);
    if (p.meta?.alvo) proximo(p.meta.alvo);
    for (let k = 0; k < 5 && perto.length; k++) cands.add(perto[Math.floor(this.r() * perto.length)]!);
    const adulto = this.adulto(p);
    const lista: Array<{ b: Pessoa; w: number }> = [];
    for (const x of cands) {
      const b = this.vivo(x);
      if (!b || this.bloqueado(b)) continue;
      const vs = this.vinculos(p.id, x);
      let w = 0.6 + this.intimidade(p.id, x) / 25;
      if (p.conjuge === x) w += 3;
      if (vs.has('namoro') || vs.has('noivado')) w += 2.5;
      if (vs.has('amantes')) w += this.conjuge(p) && this.ondeEsta(this.conjuge(p)!) !== this.ondeEsta(p) ? 3 : 1.5;
      if (vs.has('amigos')) w += 1.5;
      if (vs.has('rivais') || vs.has('inimigos')) w += 0.5;
      const at = adulto && this.adulto(b) ? this.atracao(p.id, x) : 0;
      if (at > 50) w += at / 50;
      if (this.opiniao(p.id, x) < -40) w += 0.6;
      if ((this.crianca(p) && this.crianca(b)) || p.pais.includes(x) || b.pais.includes(p.id)) w += 1.5;
      if (this.crianca(b) && !this.crianca(p) && !this.parentesco(p.id, x)) w *= 0.3;
      if (p.meta?.alvo === x) w += 2;
      lista.push({ b, w });
    }
    return lista;
  }

  /** Peso final de uma interação: o da interação × traços × ajustes × meta × estados. */
  peso(i: Interacao, a: Pessoa, b: Pessoa | null): number {
    let w = i.peso(this, a, b);
    if (w <= 0) return 0;
    // criatura e gente de outra espécie: só conflito (caçar, atacar, se defender)
    if (b && this.alheios(a, b) && i.cat !== 'conflito') return 0;
    if (this.criatura(a) && (i.cat === 'social' || i.cat === 'trabalho') && i.id !== 'brincar' && i.id !== 'cuidar') return 0;
    for (const t of a.tracos) w *= this.cat.tracos.get(t)?.peso?.[i.id] ?? 1;
    if (i.cat === 'romance') w *= this.ajustes.romance;
    if (i.cat === 'conflito') w *= this.ajustes.violencia;
    if (i.id === 'seduzir' || i.id === 'fofocar') w *= Math.sqrt(this.ajustes.drama);
    if (a.estados['bebado'] === this.t && (i.id === 'brigar' || i.id === 'flertar' || i.id === 'seduzir' || i.id === 'insultar')) w *= 1.8;
    if (b && i.cat === 'conflito' && i.id !== 'insultar' && i.id !== 'discutir') {
      // briga dentro de casa e com criança é bem mais rara
      const par = a.conjuge === b.id || this.parceiro(a)?.id === b.id || this.temVinc(a.id, b.id, 'ex');
      if (par) w *= 0.3;
      if (this.proximos(a.id, b.id)) w *= this.crianca(a) || this.crianca(b) ? 0 : 0.25;
      else if (this.crianca(a) !== this.crianca(b)) w *= 0.15;
    }
    if (b && (i.id === 'seduzir' || i.id === 'cortejar') && this.temVinc(a.id, b.id, 'ex')) w *= this.ha(a.id, b.id, 'ex') < 24 ? 0.15 : 0.5;
    if (b && this.cat.vinculos.size) for (const v of this.vinculos(a.id, b.id)) w *= this.cat.vinculos.get(v)?.peso[i.id] ?? 1;
    if (i.id === 'seduzir' && a.estados['vigiado']) w *= 0.3;
    if (i.cat === 'conflito' && i.id !== 'insultar' && i.id !== 'discutir' && a.estados['brigou']) w *= 0.2;
    if (this.efeito('festa', a.local) && (i.id === 'flertar' || i.id === 'conversar' || i.id === 'atividade')) w *= 2;
    if (this.efeito('fome', a.local) && i.id === 'roubar') w *= 3;
    if (b && i.id === 'roubar') {
      const v = this.valorItens(b);
      if (v) w *= 1 + Math.min(4, v / 150) * (a.tracos.includes('ganancioso') ? 2 : 1);
    }
    for (const ev of this.eventosAtivos) {
      if (ev.lugar !== null && ev.lugar !== a.local) continue;
      const m = this.cat.eventos.get(ev.id)?.weights[i.id];
      if (m !== undefined) w *= m;
    }
    const m = a.meta;
    if (m && b) {
      if (m.alvo === b.id && m.tipo === 'vinganca' && i.cat === 'conflito') w *= 3;
      if (m.alvo === b.id && m.tipo === 'conquistar' && (i.id === 'flertar' || i.id === 'cortejar' || i.id === 'seduzir' || i.id === 'presentear')) w *= 2.5;
      if (m.tipo === 'amor' && (i.id === 'flertar' || i.id === 'cortejar')) w *= 1.8;
      if (m.tipo === 'familia' && i.id === 'intimidade') w *= 1.6;
      if (m.tipo === 'paz' && i.cat === 'conflito') w *= 0.5;
    }
    if (m?.tipo === 'riqueza' && i.id === 'trabalhar') w *= 1.6;
    if (m?.tipo === 'saber' && i.id === 'estudar') w *= 2;
    // quem joga decide o romance e as brigas de quem conduz
    if (a.conduzido && (i.cat === 'romance' || i.cat === 'conflito') && i.id !== 'intimidade') w = 0;
    return w;
  }

  private encontro(a: Pessoa, b: Pessoa): void {
    const ops: Array<{ i: Interacao; w: number }> = [];
    let total = 1.2; // às vezes nada acontece
    for (const i of INTERACOES) {
      if (!i.alvo || !i.pode(this, a, b)) continue;
      const w = this.peso(i, a, b);
      if (w > 0) {
        ops.push({ i, w });
        total += w;
      }
    }
    let r = this.r() * total;
    for (const o of ops) {
      if ((r -= o.w) <= 0) {
        o.i.fazer(this, a, b, false);
        this.vm(a.id, b.id).visto = this.t;
        return;
      }
    }
  }

  private sozinho(p: Pessoa): void {
    const ops: Array<{ i: Interacao; w: number }> = [];
    let total = 1.5;
    for (const i of INTERACOES) {
      if (i.alvo || !i.pode(this, p, null)) continue;
      const w = this.peso(i, p, null);
      if (w > 0) {
        ops.push({ i, w });
        total += w;
      }
    }
    let r = this.r() * total;
    for (const o of ops) if ((r -= o.w) <= 0) return o.i.fazer(this, p, null, false);
  }

  /** Duração de uma viagem, em meses (pelo mapa e pelas rotas, se houver). */
  duracao(de: string, para: string): number {
    if (de === para) return 0;
    const pos = this.opts.positions;
    const d = (x: string, y: string) => {
      const a = pos?.get(x);
      const b = pos?.get(y);
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 15;
    };
    if (this.rotas.size && this.rotas.has(de)) {
      // menor caminho pelas rotas (Dijkstra simples)
      const dist = new Map<string, number>([[de, 0]]);
      const feito = new Set<string>();
      for (;;) {
        let cur: string | null = null;
        for (const [k, v] of dist) if (!feito.has(k) && (cur === null || v < dist.get(cur)!)) cur = k;
        if (cur === null || cur === para) break;
        feito.add(cur);
        for (const n of this.rotas.get(cur) ?? []) {
          const nd = dist.get(cur)! + d(cur, n);
          if (nd < (dist.get(n) ?? Infinity)) dist.set(n, nd);
        }
      }
      const tot = dist.get(para);
      if (tot !== undefined) return clamp(Math.ceil(tot / 12), 1, 12);
    }
    return clamp(Math.ceil(d(de, para) / 12), 1, 8);
  }

  /** Lugares para onde dá para ir a partir daqui. */
  destinos(de: string): string[] {
    const todos = [...this.lugares.keys()].filter((x) => x !== de && !x.startsWith('§'));
    if (!this.rotas.size || !this.rotas.has(de)) return todos;
    const ok = new Set<string>();
    const fila = [de];
    while (fila.length) {
      const x = fila.shift()!;
      for (const n of this.rotas.get(x) ?? []) if (!ok.has(n) && n !== de) { ok.add(n); fila.push(n); }
    }
    return todos.filter((x) => ok.has(x));
  }

  viajar(p: Pessoa, para: string, motivo: string): void {
    const de = this.ondeEsta(p) ?? p.local;
    const dur = this.duracao(de, para);
    p.viagem = { para, chega: this.t + dur, motivo };
    this.say('vida', 'viagem', `${this.L(p.id)} parte para [[${this.lugarNome(para)}]] (${motivo}; ${dur} ${dur === 1 ? 'mês' : 'meses'} de estrada).`, [p.id], 1);
    this.emitir('viagem', [p.id], [this.lugarNome(para)]);
  }

  private montarRotas(): void {
    const RE = /^(rotas?|estradas?|caminhos?|ligado a|liga a|vizinhos?|fronteira)$/i;
    for (const e of this.world.entities) {
      if (e.type !== 'lugar') continue;
      for (const r of e.relations) {
        if (!r.to || !RE.test(r.label.trim()) || this.entPorCaminho.get(r.to)?.type !== 'lugar') continue;
        this.rotas.set(e.path, [...new Set([...(this.rotas.get(e.path) ?? []), r.to])]);
        this.rotas.set(r.to, [...new Set([...(this.rotas.get(r.to) ?? []), e.path])]);
      }
    }
  }

  // ---------------------------------------------------------------- consequências do mês

  private consequencias(): void {
    // casamentos marcados
    for (const [k, quando] of [...this.casamentos]) {
      if (this.t < quando) continue;
      const [x, y] = k.split('|') as [string, string];
      const a = this.vivo(x);
      const b = this.vivo(y);
      this.casamentos.delete(k);
      if (a && b && this.temVinc(x, y, 'noivado')) this.casar(a, b);
    }
    // casos: quem está sendo traído pode descobrir
    for (const s of this.segredos) {
      if (s.tipo !== 'caso') continue;
      const [x, y] = s.sobre as [string, string];
      if (!this.temVinc(x, y, 'amantes')) continue;
      for (const [trai, outro] of [[x, y], [y, x]] as Array<[string, string]>) {
        const T = this.vivo(trai);
        const A = this.vivo(outro);
        if (!T || !A) continue;
        const v = this.parceiro(T);
        if (!v || v.id === outro || s.sabem.includes(v.id)) continue;
        const juntos = this.ondeEsta(v) === this.ondeEsta(T) ? 1.4 : 0.5;
        const p = (0.01 + this.ha(x, y, 'amantes') * 0.0015) * this.ajustes.drama * juntos * (v.tracos.includes('desconfiado') ? 2 : 1)
          * (v.tracos.includes('ingenuo') ? 0.4 : 1) * (1 + v.hab.intriga / 15) * (T.tracos.includes('mentiroso') ? 0.6 : 1) * (T.estados['vigiado'] ? 2 : 1);
        if (this.chance(p)) {
          this.descobrir(v, T, A, this.pick(['ao achar uma carta escondida', 'ao seguir os passos de ' + T.nome + ' numa noite', 'por um bilhete esquecido', 'pelo cheiro de outro perfume', 'flagrando os dois']));
          break;
        }
      }
    }
    // a cara do filho entrega o pai (genética)
    if (mesDoAno(this.t) === 6) {
      for (const s of this.segredos) {
        if (s.tipo !== 'paternidade') continue;
        const [filho, pai, mae] = s.sobre as [string, string, string];
        const F = this.pessoas.get(filho);
        const O = F?.paiOficial ? this.vivo(F.paiOficial) : null;
        const M = this.pessoas.get(mae);
        if (!F || !O || !M || s.sabem.includes(O.id) || this.idadeBio(F) < 3) continue;
        const impossivel = (k: 'olhos' | 'cabelo') => !(
          (M.genes[k].includes(F.genes[k][0]) && O.genes[k].includes(F.genes[k][1])) || (M.genes[k].includes(F.genes[k][1]) && O.genes[k].includes(F.genes[k][0])));
        const pista = impossivel('olhos') ? `os olhos ${olhosDe(F.genes)}` : impossivel('cabelo') ? `o cabelo ${cabeloDe(F.genes)}` : null;
        const p = (pista ? 0.25 : 0.02) * (O.tracos.includes('desconfiado') ? 2 : 1) * this.ajustes.drama;
        if (!this.chance(p)) continue;
        s.sabem.push(O.id);
        this.lembra(O.id, mae, 'me enganou sobre o filho', -50, 120);
        this.mexe(O.id, filho, { afeto: O.tracos.includes('gentil') ? -2 : -20 });
        const P = this.pessoas.get(pai);
        if (P) this.lembra(O.id, pai, 'é o pai do meu filho', -40, 120);
        this.estresse(O, 30);
        this.say('familia', 'paternidade', `${this.L(O.id)} ${pista ? `olha para ${pista} de ${this.L(filho)} e entende tudo` : 'descobre a verdade'}: ${this.L(filho)} é filh${this.g(F, 'o', 'a')} de ${this.L(pai)}.`, [O.id, filho, pai, mae], 3);
        this.emitir('paternidade', [O.id, filho, pai]);
        if (M.conjuge === O.id && !O.conduzido && this.chance(O.tracos.includes('orgulhoso') || O.tracos.includes('ciumento') ? 0.6 : 0.3)) this.terminar(O, M, O);
      }
    }
    // amizades e rivalidades se firmam (só nos pares que se cruzaram no mês)
    for (const k of this.tocados) {
      const [x, y] = k.split('|') as [string, string];
      const a = this.vivo(x);
      const b = this.vivo(y);
      if (!a || !b) continue;
      const o1 = this.opiniao(x, y);
      const o2 = this.opiniao(y, x);
      const vs = this.vinculos(x, y);
      if (!vs.has('amigos') && o1 > 45 && o2 > 45 && this.intimidade(x, y) >= 35 && !this.crianca(a) === !this.crianca(b)) {
        this.liga(x, y, 'amigos');
        this.desliga(x, y, 'rivais');
        this.say('social', 'amizade', `${this.L(x)} e ${this.L(y)} viram amigos de verdade.`, [x, y], 1);
        this.emitir('amizade', [x, y]);
      } else if (vs.has('amigos') && (o1 < 5 || o2 < 5)) {
        this.desliga(x, y, 'amigos');
        this.say('social', 'fim-amizade', `A amizade de ${this.L(x)} e ${this.L(y)} esfria.`, [x, y], 1);
      }
      if (!vs.has('rivais') && !vs.has('inimigos') && o1 < -40 && o2 < -40) {
        this.liga(x, y, 'rivais');
        this.say('conflito', 'rivalidade', `${this.L(x)} e ${this.L(y)} já não se suportam.`, [x, y], 1);
        this.emitir('rivalidade', [x, y]);
      } else if (vs.has('rivais') && !vs.has('inimigos') && (o1 < -75 || o2 < -75)) {
        this.liga(x, y, 'inimigos');
        this.say('conflito', 'inimizade', `${this.L(x)} e ${this.L(y)} viram inimigos mortais.`, [x, y], 2);
        this.emitir('inimizade', [x, y]);
      } else if ((vs.has('rivais') || vs.has('inimigos')) && o1 > -10 && o2 > -10) {
        this.desliga(x, y, 'rivais');
        this.desliga(x, y, 'inimigos');
      }
    }
  }

  private efeitosDoMundo(): void {
    for (const e of this.efeitos) {
      if (e.tipo === 'guerra' && e.ate === this.t) {
        for (const p of this.vivos()) {
          if (p.viagem?.para !== GUERRA) continue;
          p.viagem = { para: p.local, chega: this.t + 1, motivo: 'volta da guerra' };
          if (this.chance(0.5)) this.ganhaTraco(p, 'veterano', false);
          this.say('mundo', 'volta', `${this.L(p.id)} volta da guerra.`, [p.id], 2);
        }
      }
    }
    for (const p of this.vivos()) {
      if (p.viagem?.para !== GUERRA) continue;
      this.xp(p, 'lutas', 0.2);
      if (!p.protegido && this.chance(0.022 * this.ajustes.mortalidade * (p.tracos.includes('veterano') ? 0.6 : 1))) this.morrer(p, 'na guerra');
      else if (this.chance(0.03)) {
        const m = this.ferir(p, true);
        if (m) this.say('mundo', 'ferido', `${this.L(p.id)} é ferid${this.g(p, 'o', 'a')} na guerra (${this.nomeTraco(p, m)}).`, [p.id], 2);
      }
    }
    this.efeitos = this.efeitos.filter((e) => e.ate >= this.t);
  }

  // ---------------------------------------------------------------- vínculos inventados pelo mundo

  /** Liga um vínculo (de fábrica ou do mundo). `primeiro` = quem tem o primeiro papel (mentor, senhor...). */
  vincular(a: Pessoa, b: Pessoa, id: string, primeiro: Pessoa = a, silencioso = false): boolean {
    if (a.id === b.id || this.temVinc(a.id, b.id, id)) return false;
    const d = this.cat.vinculos.get(id);
    if (!d) {
      this.liga(a.id, b.id, id);
      return true;
    }
    if (d.romantico && !this.podeRomance(a.id, b.id)) return false;
    if (d.exclusivo) {
      for (const x of [a, b]) for (const o of this.comVinculo(x.id, id)) if (o.id !== a.id && o.id !== b.id) this.desvincular(x, o, id, true);
    }
    this.liga(a.id, b.id, id);
    if (d.papeis) this.papeis.set(`${id}|${parKey(a.id, b.id)}`, primeiro.id);
    if (!silencioso) {
      const papel = d.papeis ? ` (${primeiro === a ? `${this.L(a.id)} ${d.papeis[0]}, ${this.L(b.id)} ${d.papeis[1]}` : `${this.L(b.id)} ${d.papeis[0]}, ${this.L(a.id)} ${d.papeis[1]}`})` : '';
      this.say(d.romantico ? 'romance' : 'social', 'vinculo', `${d.simbolo ? `${d.simbolo} ` : ''}${d.secreto ? '🤫 ' : ''}${this.L(a.id)} e ${this.L(b.id)}: ${d.nome.toLowerCase()}${papel}.`, [a.id, b.id], 2, d.secreto);
    }
    if (d.regra.onForm.length && this.rt) this.rt.runBody(d.regra.onForm, { a: new Ent(a.id), b: new Ent(b.id) }, d.regra.src);
    this.emitir(id.replace(/\s+/g, '_'), [a.id, b.id]);
    return true;
  }

  desvincular(a: Pessoa, b: Pessoa, id: string, silencioso = false): boolean {
    if (!this.temVinc(a.id, b.id, id)) return false;
    const d = this.cat.vinculos.get(id);
    this.desliga(a.id, b.id, id);
    this.papeis.delete(`${id}|${parKey(a.id, b.id)}`);
    if (d && !silencioso) this.say(d.romantico ? 'romance' : 'social', 'vinculo', `${this.L(a.id)} e ${this.L(b.id)} deixam de ser ${d.nome.toLowerCase()}.`, [a.id, b.id], 2, d.secreto);
    if (d?.regra.onBreak.length && this.rt) this.rt.runBody(d.regra.onBreak, { a: new Ent(a.id), b: new Ent(b.id) }, d.regra.src);
    return true;
  }

  /** Papel da pessoa num vínculo com papéis ("mentor", "aprendiz"), ou null. */
  papel(id: string, outro: string, v: string): string | null {
    const d = this.cat.vinculos.get(v);
    if (!d?.papeis || !this.temVinc(id, outro, v)) return null;
    return this.papeis.get(`${v}|${parKey(id, outro)}`) === id ? d.papeis[0] : d.papeis[1];
  }

  /** Vínculos do mundo: surgem entre quem se cruzou, mudam a relação todo mês e se desfazem quando a condição vale. */
  private vinculosDoMes(): void {
    if (!this.cat.vinculos.size) return;
    // efeitos de todo mês e rompimentos
    for (const [k, set] of [...this.vinc]) {
      for (const v of [...set]) {
        const d = this.cat.vinculos.get(v);
        if (!d) continue;
        const [x, y] = k.split('|') as [string, string];
        const A = this.vivo(x);
        const B = this.vivo(y);
        if (!A || !B) continue;
        for (const [eixo, n] of Object.entries(d.porMes)) {
          const e = (eixo === 'atracao' || eixo === 'confianca' || eixo === 'afeto' || eixo === 'respeito' || eixo === 'intimidade') ? eixo : null;
          if (e) {
            this.mexe(x, y, { [e]: n });
            this.mexe(y, x, { [e]: n });
          } else if (eixo === 'humor' || eixo === 'estresse') {
            for (const P of [A, B]) (eixo === 'humor' ? this.humor(P, n) : this.estresse(P, n));
          }
        }
        if (d.regra.breaks && this.rt && this.rt.test(d.regra.breaks, { a: new Ent(x), b: new Ent(y) }, d.regra.src)) this.desvincular(A, B, v);
      }
    }
    // surgem entre quem se cruzou no mês (chance por ano repartida)
    const surgem = [...this.cat.vinculos.values()].filter((d) => d.regra.emerge);
    if (!surgem.length || !this.rt) return;
    for (const k of this.tocados) {
      const [x, y] = k.split('|') as [string, string];
      const A = this.vivo(x);
      const B = this.vivo(y);
      if (!A || !B) continue;
      for (const d of surgem) {
        if (this.temVinc(x, y, d.id) || !this.passa(A, d.regra.filter) || !this.passa(B, d.regra.filter)) continue;
        const pm = 1 - Math.pow(1 - Math.min(1, d.regra.emergeChance), 1 / 12);
        if (this.sorte() >= pm) continue;
        // tenta dos dois lados (a condição pode ser assimétrica: mentor e aprendiz)
        if (this.rt.test(d.regra.emerge!, { a: new Ent(x), b: new Ent(y) }, d.regra.src)) this.vincular(A, B, d.id, A);
        else if (this.rt.test(d.regra.emerge!, { a: new Ent(y), b: new Ent(x) }, d.regra.src)) this.vincular(B, A, d.id, B);
      }
    }
  }

  // ---------------------------------------------------------------- acaso

  /** Faz um acontecimento (fadas, vexames, escândalos...) acontecer com `a` (e `b`). */
  acontecer(ac: Acontecimento, a: Pessoa, b: Pessoa | null): void {
    const antes = this.tomAtual;
    this.tomAtual = ac.tom;
    try {
      ac.fazer(this, a, b);
    } finally {
      this.tomAtual = antes;
    }
    this.emitir('acontecimento', [a.id, ...(b ? [b.id] : [])], [ac.nome]);
    this.emitir(ac.id, [a.id, ...(b ? [b.id] : [])]);
  }

  /** Acontecimentos que cabem em `a` (com `b`) agora (para o painel "Fazer acontecer"). */
  acontecimentosPara(a: string, b: string | null): Array<{ id: string; nome: string; tom: TomVida; pode: boolean }> {
    const A = this.vivo(a);
    const B = b ? this.vivo(b) : null;
    if (!A) return [];
    return ACONTECIMENTOS.filter((x) => x.alvo === !!B).map((x) => ({
      id: x.id, nome: x.nome, tom: x.tom,
      pode: (x.tom !== 'adulto' || (this.adulto(A) && (!B || this.adulto(B)))) && (!x.pode || x.pode(this, A, B)),
    }));
  }

  /** Festa, peste, fome, guerra local ou fartura num lugar (as guerras das facções usam para a fome). */
  efeitoMundo(tipo: Efeito['tipo'], lugar: string | null, meses: number, voce = false): void {
    if (voce) this.eventoDoMundo(tipo, lugar, meses);
    else {
      this.efeitos.push({ tipo, lugar, ate: this.t + Math.max(1, meses) - 1 });
      this.say('mundo', tipo, `${tipo === 'fome' ? '🌾 A fome da guerra chega a' : tipo === 'peste' ? '☠ Uma peste chega a' : '✦ Algo muda em'} ${lugar ? `[[${this.lugarNome(lugar)}]]` : 'todo o mundo'}.`, [], 2);
    }
  }

  private podar(): void {
    for (const [k, v] of this.visoes) {
      v.mem = v.mem.filter((m) => Math.abs(m.v * Math.pow(0.5, (this.t - m.t) / m.m)) >= 1);
      // quem não se vê há anos vai esquecendo
      if (this.t - v.visto > 24) v.intimidade = Math.max(0, v.intimidade - 4);
      const [a, b] = k.split('>') as [string, string];
      if (!this.vivo(a) && !this.vivo(b)) this.visoes.delete(k);
    }
  }

  // ================================================================ intervenções

  /** Uma intervenção de quem joga: vale agora e fica no registro. */
  comando(cmd: Comando): void {
    this.executar(cmd);
    this.registro.push({ t: this.t, cmd: structuredClone(cmd) });
  }

  private executar(cmd: Comando): void {
    this.executarCmd(cmd);
    this.mapearPresenca();
  }

  private executarCmd(cmd: Comando): void {
    const P = (id: string) => this.pessoas.get(id);
    switch (cmd.c) {
      case 'agir': {
        const a = this.vivo(cmd.a);
        const b = cmd.b ? this.vivo(cmd.b) : null;
        if (!a || (cmd.b && !b)) return;
        if (cmd.i === 'casar' && b) {
          this.say('voce', 'agir', `✋ Você une ${this.L(a.id)} e ${this.L(b.id)}.`, [a.id, b.id], 1);
          this.casar(a, b);
          return;
        }
        const i = INTERACOES.find((x) => x.id === cmd.i);
        if (!i || i.alvo !== !!b) return;
        this.say('voce', 'agir', `✋ Você faz ${this.L(a.id)} ${i.verbo}${b ? ` ${this.L(b.id)}` : ''}.`, [a.id, ...(b ? [b.id] : [])], 1);
        i.fazer(this, a, b, !!cmd.garantir);
        return;
      }
      case 'sussurrar': {
        const a = this.vivo(cmd.a);
        const b = this.vivo(cmd.b);
        if (!a || !b) return;
        const frases: Record<string, string> = {
          paixao: 'não consegue mais tirar {b} da cabeça', odio: 'passa a ver {b} com outros olhos, e não gosta do que vê', amizade: 'sente uma simpatia súbita por {b}',
          desconfianca: 'começa a desconfiar de {b}', respeito: 'passa a admirar {b}', inveja: 'morre de inveja de {b}',
        };
        switch (cmd.tipo) {
          case 'paixao':
            this.mexe(a.id, b.id, { atracao: 35, intimidade: 6 });
            this.lembra(a.id, b.id, 'não sai da minha cabeça', 12, 24);
            if (this.podeRomance(a.id, b.id) && this.atraido(a.id, b.id)) a.meta = { tipo: 'conquistar', alvo: b.id, desde: this.t };
            break;
          case 'odio': this.mexe(a.id, b.id, { afeto: -35 }); this.lembra(a.id, b.id, 'algo em mim detesta', -20, 36); break;
          case 'amizade': this.mexe(a.id, b.id, { afeto: 25, intimidade: 10 }); this.mexe(b.id, a.id, { afeto: 10, intimidade: 10 }); break;
          case 'desconfianca': this.mexe(a.id, b.id, { confianca: -40 }); break;
          case 'respeito': this.mexe(a.id, b.id, { respeito: 30 }); break;
          case 'inveja': this.mexe(a.id, b.id, { afeto: -15, respeito: 10 }); if (!a.meta || a.meta.tipo === 'paz') a.meta = { tipo: 'riqueza', desde: this.t }; break;
        }
        this.say('voce', 'sussurro', `✋ ${this.L(a.id)} ${frases[cmd.tipo]!.replace('{b}', this.L(b.id))}.`, [a.id, b.id], 1);
        return;
      }
      case 'traco': {
        const p = P(cmd.p);
        if (!p) return;
        if (cmd.add) this.ganhaTraco(p, cmd.add, false);
        if (cmd.del) this.perdeTraco(p, cmd.del);
        return;
      }
      case 'campo': {
        const p = P(cmd.p);
        if (p) this.setCampo(p, fold(cmd.campo).replace(/[_\s]+/g, ' ').trim(), cmd.valor as Val);
        return;
      }
      case 'relacao':
        this.vm(cmd.a, cmd.b)[cmd.campo] = clamp(cmd.valor, cmd.campo === 'intimidade' ? 0 : -100, 100);
        return;
      case 'meta': {
        const p = P(cmd.p);
        if (p) p.meta = cmd.tipo ? { tipo: cmd.tipo, desde: this.t, ...(cmd.alvo ? { alvo: cmd.alvo } : {}) } : null;
        return;
      }
      case 'conduzir': { const p = P(cmd.p); if (p) p.conduzido = cmd.on; return; }
      case 'proteger': { const p = P(cmd.p); if (p) p.protegido = cmd.on; return; }
      case 'evento':
        this.eventoDoMundo(cmd.tipo, cmd.lugar, cmd.meses ?? 1);
        return;
      case 'ajuste':
        this.ajustes[cmd.k] = clamp(cmd.v, 0, 5);
        return;
      case 'decidir': {
        const d = this.decisoes.find((x) => x.id === cmd.id);
        if (!d) return;
        this.decisoes = this.decisoes.filter((x) => x !== d);
        this.resolver(d, cmd.opcao);
        return;
      }
      case 'matar': {
        const p = this.vivo(cmd.p);
        if (p) this.morrer(p, cmd.causa || 'pelas mãos do destino');
        return;
      }
      case 'mudar': {
        const p = this.vivo(cmd.p);
        if (!p) return;
        if (!this.lugares.has(cmd.lugar)) this.lugares.set(cmd.lugar, this.entPorCaminho.get(cmd.lugar)?.name ?? cmd.lugar);
        p.local = cmd.lugar;
        this.viajar(p, cmd.lugar, 'mudança');
        return;
      }
      case 'adicionar': {
        if (this.pessoas.has(cmd.pessoa.id)) return;
        const p = structuredClone(cmd.pessoa);
        p.nome = this.nomeUnico(p.nome);
        this.seq = Math.max(this.seq, Number(/^x(\d+)$/.exec(p.id)?.[1] ?? 0));
        this.entra(p);
        this.say('voce', 'chega', `✋ ${this.L(p.id)} chega a [[${this.lugarNome(p.local)}]].`, [p.id], 1);
        return;
      }
      case 'vincular': {
        const p = P(cmd.p);
        if (p) p.nota = cmd.nota;
        return;
      }
      case 'mundo': {
        this.comecarEvento(cmd.id, cmd.lugar, true);
        return;
      }
      case 'vinculo': {
        const a = this.vivo(cmd.a);
        const b = this.vivo(cmd.b);
        if (!a || !b || a === b) return;
        if (cmd.v === 'casados') {
          if (cmd.on) this.casar(a, b);
          else if (a.conjuge === b.id) this.terminar(a, b, a);
          return;
        }
        if (cmd.on) {
          if (cmd.v === 'amantes') this.comecarCaso(a, b);
          else if (this.vincular(a, b, cmd.v, a, true)) {
            const d = this.cat.vinculos.get(cmd.v);
            this.say('voce', 'vinculo', `✋ ${this.L(a.id)} e ${this.L(b.id)}: ${d?.nome.toLowerCase() ?? cmd.v}.`, [a.id, b.id], 1);
          }
        } else if (cmd.v === 'amantes' || cmd.v === 'namoro' || cmd.v === 'noivado') {
          if (this.temVinc(a.id, b.id, cmd.v)) this.terminar(a, b, a);
        } else if (this.desvincular(a, b, cmd.v, true)) this.say('voce', 'vinculo', `✋ ${this.L(a.id)} e ${this.L(b.id)} deixam de ser ${this.cat.vinculos.get(cmd.v)?.nome.toLowerCase() ?? cmd.v}.`, [a.id, b.id], 1);
        return;
      }
      case 'faccao':
        this.guerras.criar(cmd.id, cmd.nome, cmd.lugares, cmd.lider ?? null);
        return;
      case 'guerra':
        this.guerras.declarar(cmd.a, cmd.b, cmd.motivo ?? null, true);
        return;
      case 'paz': {
        const g = this.guerras.guerras.find((x) => x.id === cmd.guerra);
        if (g) this.guerras.paz(g, true);
        return;
      }
      case 'postura':
        this.guerras.setPostura(cmd.a, cmd.b, cmd.v);
        return;
      case 'acontecer': {
        const a = this.vivo(cmd.a);
        const b = cmd.b ? this.vivo(cmd.b) : null;
        const ac = ACONTECIMENTOS.find((x) => x.id === cmd.id);
        if (!a || !ac || (ac.alvo && !b)) return;
        if (ac.tom === 'adulto' && (!this.adulto(a) || (b && !this.adulto(b)))) return;
        if (ac.pode && !ac.pode(this, a, ac.alvo ? b : null)) {
          this.say('voce', 'acontecer', `✋ Não dá para fazer acontecer ${ac.nome.toLowerCase()} com ${this.L(a.id)} agora.`, [a.id], 1);
          return;
        }
        this.say('voce', 'acontecer', `✋ Você faz acontecer: ${ac.nome.toLowerCase()} (${this.L(a.id)}${b ? `, ${this.L(b.id)}` : ''}).`, [a.id, ...(b ? [b.id] : [])], 1);
        this.acontecer(ac, a, ac.alvo ? b : null);
        return;
      }
      case 'item': {
        const p = this.vivo(cmd.p);
        const it = this.cat.itens.get(cmd.item);
        if (!p || !it) return;
        if (cmd.on) {
          const de = this.donoDe(it.id);
          if (this.ganharItem(p, it.id, 'voce')) this.say('voce', 'item', `${this.L(p.id)} recebe ${this.itemTxt(it)}${de && de !== p ? ` (que era de ${this.L(de.id)})` : ''}.`, [p.id, ...(de && de !== p ? [de.id] : [])], 2);
        } else if (p.itens?.includes(it.id)) {
          this.perderItem(p, it.id, 'voce');
          if (it.unico) this.perdidos.set(it.id, p.local);
          this.say('voce', 'item', `${this.L(p.id)} perde ${this.itemTxt(it)}${it.unico ? ` em [[${this.lugarNome(p.local)}]]` : ''}.`, [p.id], 2);
        }
        return;
      }
    }
  }

  // ================================================================ itens

  /** Coloca os itens do catálogo com quem diz a ficha (ou largados num lugar). */
  private iniciarItens(): void {
    for (const it of this.cat.itens.values()) {
      const d = it.dono ? this.acharPessoa(it.dono) : null;
      if (d && d.morte === null) {
        this.ganharItem(d, it.id, 'inicio', true);
        continue;
      }
      // único sem dono nem lugar: largado onde a simulação começa (alguém pode achar)
      if (it.unico && !it.dono) {
        const l = (it.lugar ? this.acharLugar(it.lugar) : null) ?? this.cfg.lugar;
        if (l) {
          this.perdidos.set(it.id, l);
          this.historiaItens.set(it.id, [{ t: this.t, dono: null, como: 'largado', lugar: l }]);
        }
      }
    }
  }

  private acharPessoa(s: string): Pessoa | null {
    const direto = this.pessoas.get(s) ?? [...this.pessoas.values()].find((p) => p.nota === s);
    if (direto) return direto;
    const id = this.porNome.get(fold(s.split('/').pop()!.replace(/\.md$/i, '').trim()));
    return id ? this.pessoas.get(id) ?? null : null;
  }

  private acharLugar(s: string): string | null {
    if (this.lugares.has(s)) return s;
    const k = fold(s.split('/').pop()!.replace(/\.md$/i, '').trim());
    return [...this.lugares].find(([, nome]) => fold(nome) === k)?.[0] ?? null;
  }

  /** Item pelo nome ou id ("Espada de Aurora", "espada de aurora"). */
  idItem(texto: string): string | null {
    const k = fold(texto).trim();
    if (this.cat.itens.has(k)) return k;
    return [...this.cat.itens.values()].find((i) => fold(i.nome) === k || fold(i.plural) === k)?.id ?? null;
  }

  itemTxt(it: Item): string {
    return it.nota ? `[[${it.nome}]]` : `*${it.nome}*`;
  }

  itensDe(p: Pessoa): Item[] {
    return (p.itens ?? []).map((id) => this.cat.itens.get(id)).filter((x): x is Item => !!x);
  }

  /** Quem tem o item agora (para únicos; nos comuns, o primeiro que achar). */
  donoDe(id: string): Pessoa | null {
    for (const p of this.pessoas.values()) if (p.morte === null && p.itens?.includes(id)) return p;
    return null;
  }

  valorItens(p: Pessoa): number {
    return this.itensDe(p).reduce((s, i) => s + i.valor * (i.cobicado ? 2 : 1), 0);
  }

  /** Soma dos ajustes de itens e traços num campo (força, combate, sanidade...). */
  bonus(p: Pessoa, campo: string): number {
    let b = 0;
    for (const id of p.itens ?? []) b += this.cat.itens.get(id)?.mods[campo] ?? 0;
    for (const t of p.tracos) b += this.cat.tracos.get(t)?.regra?.mods[campo] ?? 0;
    return b;
  }

  /** Habilidade com os ajustes de itens e traços. */
  habilidade(p: Pessoa, h: Habilidade): number {
    return clamp(p.hab[h] + this.bonus(p, h), 0, 30);
  }

  /** Dá um item (tirando de quem tinha, se for único). Não escreve na crônica: quem chama conta como foi. */
  ganharItem(p: Pessoa, id: string, como: string, silencioso = false): boolean {
    const it = this.cat.itens.get(id);
    if (!it || this.destruidos.has(id) || p.morte !== null) return false;
    if (it.unico) {
      const d = this.donoDe(id);
      if (d === p) return false;
      if (d) this.perderItem(d, id, como, silencioso);
      this.perdidos.delete(id);
    }
    (p.itens ??= []).push(id);
    const dados = this.tracosDeItem.get(p.id) ?? new Map<string, number>();
    for (const t of it.tracos) {
      if (dados.has(t)) dados.set(t, dados.get(t)! + 1);
      else if (!p.tracos.includes(t)) {
        p.tracos.push(t);
        dados.set(t, 1);
      }
    }
    this.tracosDeItem.set(p.id, dados);
    this.atribCache.delete(p.id);
    this.mudouPessoa();
    if (it.unico) this.historiaItens.set(id, [...(this.historiaItens.get(id) ?? []), { t: this.t, dono: p.id, como }]);
    if (!silencioso) {
      this.emitir('item_ganho', [p.id], [it.nome, como]);
      if (it.regra?.onGain.length && this.rt) this.rt.runBody(it.regra.onGain, { dono: new Ent(p.id), item: it.nome, como, isto: new Ent(p.id) }, it.regra.src);
    }
    return true;
  }

  perderItem(p: Pessoa, id: string, como: string, silencioso = false): void {
    const i = p.itens?.indexOf(id) ?? -1;
    if (i < 0) return;
    p.itens!.splice(i, 1);
    const it = this.cat.itens.get(id);
    const dados = this.tracosDeItem.get(p.id);
    for (const t of it?.tracos ?? []) {
      const n = dados?.get(t);
      if (n === undefined) continue;
      if (n > 1) dados!.set(t, n - 1);
      else {
        dados!.delete(t);
        p.tracos = p.tracos.filter((x) => x !== t);
      }
    }
    this.atribCache.delete(p.id);
    this.mudouPessoa();
    if (!silencioso && it && p.morte === null) {
      this.emitir('item_perdido', [p.id], [it.nome, como]);
      if (it.regra?.onLose.length && this.rt) this.rt.runBody(it.regra.onLose, { dono: new Ent(p.id), item: it.nome, como, isto: new Ent(p.id) }, it.regra.src);
    }
  }

  /** Itens de quem morreu: para o filho mais velho adulto, senão o cônjuge, senão outro herdeiro; sem ninguém, ficam onde a pessoa estava. */
  private herdarItens(p: Pessoa, herdeiros: Pessoa[]): void {
    if (!p.itens?.length) return;
    const filhos = herdeiros.filter((h) => p.pais && (h.pais.includes(p.id) || h.paiOficial === p.id) && this.adulto(h)).sort((a, b) => a.nasc - b.nasc);
    const herdeiro = filhos[0] ?? herdeiros.find((h) => this.adulto(h)) ?? herdeiros[0] ?? null;
    const lugar = this.ondeEsta(p) ?? p.local;
    for (const id of [...p.itens]) {
      const it = this.cat.itens.get(id);
      if (!it) continue;
      this.perderItem(p, id, 'morte', true);
      if (herdeiro) {
        this.ganharItem(herdeiro, id, 'heranca');
        if (it.unico || it.valor >= 50) this.say('familia', 'heranca', `${this.L(herdeiro.id)} herda ${this.itemTxt(it)} de ${this.L(p.id)}.`, [herdeiro.id, p.id], it.unico ? 3 : 2);
      } else if (it.unico) {
        this.perdidos.set(id, lugar);
        this.historiaItens.set(id, [...(this.historiaItens.get(id) ?? []), { t: this.t, dono: null, como: 'morte', lugar }]);
        this.say('mundo', 'item', `Com a morte de ${this.L(p.id)}, ${this.itemTxt(it)} fica esquecid${/a$/.test(fold(it.nome.split(' ')[0]!)) ? 'a' : 'o'} em [[${this.lugarNome(lugar)}]].`, [p.id], 2);
      }
    }
  }

  /** Depois de um roubo bem-sucedido: às vezes o ladrão leva o item mais valioso. */
  roubarItem(ladrao: Pessoa, vitima: Pessoa): boolean {
    const alvo = this.itensDe(vitima).sort((a, b) => b.valor * (b.cobicado ? 2 : 1) - a.valor * (a.cobicado ? 2 : 1))[0];
    if (!alvo || !this.chance(alvo.cobicado ? 0.7 : 0.4)) return false;
    if (!this.ganharItem(ladrao, alvo.id, 'roubo')) return false;
    if (!alvo.unico) this.perderItem(vitima, alvo.id, 'roubo');
    this.say('conflito', 'roubo', `🤫 ${this.L(ladrao.id)} rouba ${this.itemTxt(alvo)} de ${this.L(vitima.id)}.`, [ladrao.id, vitima.id], alvo.unico ? 3 : 2, true);
    this.lembra(vitima.id, ladrao.id, `levou ${alvo.nome}`, -10, 120);
    return true;
  }

  private itensDoMes(): void {
    for (const p of this.vivos()) {
      for (const it of this.itensDe(p)) {
        for (const [k, d] of Object.entries(it.porMes)) {
          if (k === 'humor') this.humor(p, d);
          else if (k === 'estresse') this.estresse(p, d);
          else if (k === 'saude') p.saude = clamp(p.saude + d, 0, 100);
          else if (k === 'dinheiro') p.dinheiro = Math.max(0, p.dinheiro + d);
          else if (this.temAtributo(p, k)) {
            const a = this.cat.atributos.get(k)!;
            p.campos[k] = clamp(Math.round(((Number(p.campos[k]) || 0) + d) * 10) / 10, a.min, a.max);
          } else p.campos[k] = (Number(p.campos[k]) || 0) + d;
        }
        if (p.saude <= 0 && p.morte === null && !p.protegido) this.morrer(p, `consumid${this.g(p, 'o', 'a')} por ${it.nome}`);
      }
    }
    // itens largados: quem passa pelo lugar pode achar
    for (const [id, lugar] of [...this.perdidos]) {
      const aqui = (this.presentes.get(lugar) ?? []).map((x) => this.pessoas.get(x)!).filter((x) => x && this.adulto(x) && !this.criatura(x));
      if (!aqui.length || !this.chance(0.012 * Math.min(4, aqui.length))) continue;
      const curiosos = aqui.filter((x) => x.tracos.includes('curioso') || x.tracos.includes('aventureiro'));
      const p = this.pick(curiosos.length ? curiosos : aqui);
      const it = this.cat.itens.get(id)!;
      if (this.ganharItem(p, id, 'achou')) this.say('vida', 'achado', `${this.L(p.id)} encontra ${this.itemTxt(it)} em [[${this.lugarNome(lugar)}]].`, [p.id], 3);
    }
  }

  /** Uma relíquia: quem tem, onde está, e por quem passou. */
  reliquias(): Array<{ item: Item; dono: Pessoa | null; lugar: string | null; destruido: boolean; historia: Array<{ t: number; dono: string | null; como: string; lugar?: string }> }> {
    return [...this.cat.itens.values()].filter((i) => i.unico).map((item) => ({
      item, dono: this.donoDe(item.id), lugar: this.perdidos.get(item.id) ?? null, destruido: this.destruidos.has(item.id), historia: this.historiaItens.get(item.id) ?? [],
    }));
  }

  // ================================================================ eventos do mundo (declarados)

  private eventosDoMundo(): void {
    if (!this.cat.eventos.size) return;
    // acabam
    for (const ev of [...this.eventosAtivos]) {
      if (ev.ate >= this.t) continue;
      this.eventosAtivos.splice(this.eventosAtivos.indexOf(ev), 1);
      const d = this.cat.eventos.get(ev.id);
      if (d?.onEnd.length && this.rt) this.rt.runBody(d.onEnd, { lugar: this.placeVal(ev.lugar) }, d.src);
      this.say('mundo', 'evento', `Acaba ${d?.name ?? ev.nome}${ev.lugar ? ` em [[${this.lugarNome(ev.lugar)}]]` : ''}.`, [], 1);
    }
    // começam sozinhos (chance por ano repartida nos meses)
    for (const d of this.cat.eventos.values()) {
      if (d.chance <= 0 || this.eventosAtivos.some((e) => e.id === d.id)) continue;
      const ch = Math.min(1, d.chance * (d.tone ? this.ajustes[d.tone as TomVida] ?? 1 : 1));
      const pm = ch >= 1 ? 1 : 1 - Math.pow(1 - ch, 1 / 12);
      if (!this.chance(pm)) continue;
      this.comecarEvento(d.id, null, false);
    }
    // todo mês: para cada pessoa no lugar
    for (const ev of this.eventosAtivos) {
      const d = this.cat.eventos.get(ev.id);
      if (!d?.monthly.length || !this.rt) continue;
      const gente = ev.lugar === null ? this.vivos().map((p) => p.id) : this.presentes.get(ev.lugar) ?? [];
      for (const id of gente) if (this.vivo(id) && this.passa(this.vivo(id)!, d.filter)) this.rt.runBody(d.monthly, { personagem: new Ent(id), isto: new Ent(id), lugar: this.placeVal(ev.lugar) }, d.src);
    }
  }

  /** Começa um evento declarado (num lugar sorteado entre os que têm gente, se não for global). */
  comecarEvento(id: string, lugar: string | null, voce: boolean): boolean {
    const d = this.cat.eventos.get(id) ?? [...this.cat.eventos.values()].find((e) => fold(e.name) === fold(id));
    if (!d) return false;
    let l: string | null = d.global ? null : lugar;
    if (!d.global && !l) {
      const comGente = [...this.presentes.keys()].filter((k) => !k.startsWith('§') && (!d.where || !this.rt || this.rt.test(d.where, { lugar: this.placeVal(k) }, d.src)));
      if (!comGente.length) return false;
      l = this.pick(comGente);
    } else if (!voce && d.where && this.rt && !this.rt.test(d.where, { lugar: this.placeVal(l) }, d.src)) return false;
    this.eventosAtivos.push({ id: d.id, nome: d.name, lugar: l, desde: this.t, ate: this.t + d.months - 1 });
    this.say(voce ? 'voce' : 'mundo', 'evento', `✦ ${d.name}${l ? ` em [[${this.lugarNome(l)}]]` : ''}${d.desc ? `: ${d.desc}` : '.'}`, [], 3);
    if (d.onStart.length && this.rt) this.rt.runBody(d.onStart, { lugar: this.placeVal(l) }, d.src);
    this.emitir(fold(d.name).replace(/\s+/g, '_'), [], l ? [this.placeVal(l)] : []);
    return true;
  }

  /** Um id novo para uma pessoa que você acrescenta no meio da história. */
  novoId(): string {
    return `x${this.seq + 1 + this.pendentes.filter((r) => r.cmd.c === 'adicionar').length}`;
  }

  private eventoDoMundo(tipo: Efeito['tipo'], lugar: string | null, meses: number): void {
    const ate = this.t + Math.max(1, meses) - 1;
    this.efeitos.push({ tipo, lugar, ate });
    const onde = lugar ? `[[${this.lugarNome(lugar)}]]` : 'todo o mundo';
    const textos: Record<Efeito['tipo'], string> = {
      festa: `✋ Uma grande festa toma conta de ${onde}.`, peste: `✋ Uma peste chega a ${onde}.`, fome: `✋ A fome castiga ${onde}.`,
      guerra: `✋ A guerra chama os que sabem lutar em ${onde}.`, fartura: `✋ Anos de fartura em ${onde}.`,
    };
    this.say('voce', tipo, textos[tipo], [], 2);
    if (tipo === 'guerra') {
      for (const p of this.vivos()) {
        if (lugar && p.local !== lugar) continue;
        if (!this.adulto(p) || this.idadeBio(p) > 50 || p.viagem) continue;
        const lutador = p.prof === 'soldado' || p.prof === 'guarda';
        if (lutador || ((p.tracos.includes('corajoso') || p.tracos.includes('brigao')) && this.chance(0.4)) || this.chance(0.08)) {
          p.viagem = { para: GUERRA, chega: this.t, motivo: 'guerra' };
          this.say('mundo', 'convocado', `${this.L(p.id)} vai para a guerra.`, [p.id], 2);
        }
      }
    }
    this.emitir(tipo, [], lugar ? [this.lugarNome(lugar)] : []);
  }

  private resolver(d: Decisao, opcao: string): void {
    const p = this.vivo(d.pessoa);
    const de = this.vivo(d.de);
    if (!p || !de) return;
    const auto = opcao === 'auto';
    const i = (id: string) => INTERACOES.find((x) => x.id === id)!;
    switch (d.tipo) {
      case 'pedido':
      case 'casamento':
      case 'seducao':
      case 'desafio': {
        const id = d.tipo === 'pedido' ? 'cortejar' : d.tipo === 'casamento' ? 'pedir_casamento' : d.tipo === 'seducao' ? 'seduzir' : 'duelar';
        // a resposta de quem joga vira o resultado; "auto" deixa a sorte e os traços decidirem
        const sim = opcao === 'aceitar' || opcao === 'ceder';
        i(id).fazer(this, de, p, false, auto ? null : sim);
        if (d.tipo === 'seducao' && opcao === 'contar') {
          const c = this.parceiro(de);
          if (c) {
            this.lembra(c.id, de.id, 'tentou me trair', -25, 60);
            this.mexe(c.id, de.id, { confianca: -25 });
            this.say('romance', 'denuncia', `${this.L(p.id)} conta a ${this.L(c.id)} que ${this.L(de.id)} tentou seduzi-l${this.g(p, 'o', 'a')}.`, [p.id, c.id, de.id], 2);
          }
        }
        return;
      }
      case 'descoberta': {
        const a = d.outro ? this.vivo(d.outro) : null;
        if (a) this.reagirTraicao(p, de, a, auto ? null : opcao);
        return;
      }
    }
  }

  // ================================================================ ponte com as regras

  private ligarRegras(): void {
    const prog = this.opts.rules;
    if (!prog || !(prog.handlers.length || prog.interactions.length || prog.schemes.length || prog.events.length || prog.traits.some((t) => t.emerge) || prog.professions.some((p) => p.requires)
      || prog.bonds.length
      || prog.items.some((i) => i.onGain.length || i.onLose.length || i.monthly.length))) {
      this.mudouGente = false;
      return;
    }
    const pessoas: Entity[] = this.vivos().map((p) => {
      const e = p.nota ? this.entPorCaminho.get(p.nota) : undefined;
      return { path: p.id, name: p.nome, world: this.world.name, type: 'personagem', props: e?.props ?? {}, aliases: [], summary: '', relations: e?.relations ?? [], words: 0, score: 0 };
    });
    const elenco = new Set(this.todas().flatMap((p) => [p.id, p.nota ?? '']));
    const resto = this.world.entities.filter((e) => e.type !== 'personagem' && !elenco.has(e.path));
    const mundo: World = { ...this.world, entities: [...pessoas, ...resto] };
    if (this.rt) {
      this.rt.refresh(mundo);
    } else {
      this.rt = new Rules(prog, mundo, {
        rng: this.r, year: anoDe(this.t), tables: this.opts.tables, positions: this.opts.positions, budget: 300_000, period: 1 / 12,
        chronicle: (text, who) => this.say('regra', 'regra', text, [...new Set(who)].filter((x) => this.pessoas.has(x)), 2),
        stance: (kind, a, b) => {
          const fa = this.guerras.achar(a);
          const fb = this.guerras.achar(b);
          if (!fa || !fb) return;
          if (kind === 'guerra') this.guerras.declarar(fa.id, fb.id, null, false);
          else if (kind === 'paz') { const g = this.guerras.guerraEntre(fa.id, fb.id); if (g) this.guerras.paz(g, false); }
          else this.guerras.setPostura(fa.id, fb.id, 70);
        },
        tone: (tom) => this.ajustes[tom as TomVida] ?? 1,
        label: (path) => this.rotulo(path),
        virtual: { get: (path, f) => this.getCampo(path, f), set: (path, f, v) => this.setCampoPath(path, f, v) },
        candidates: (a) => {
          const p = this.vivo(a);
          return p ? this.aoRedor(p).filter((x) => this.vivo(x)) : [];
        },
        fns: this.funcoes(),
      });
    }
    this.mudouGente = false;
  }

  private coletarIssues(): void {
    if (!this.rt) return;
    for (const i of this.rt.issues) if (!this.issues.some((x) => x.message === i.message && x.line === i.line && x.path === i.path)) this.issues.push(i);
    this.rt.issues.length = 0;
    if (this.issues.length > 50) this.issues.splice(0, this.issues.length - 50);
  }

  private rotulo(path: string): string | undefined {
    if (path.startsWith('rel:')) {
      const [a, b] = path.slice(4).split('>') as [string, string];
      return `${this.pessoas.get(a)?.nome ?? a} → ${this.pessoas.get(b)?.nome ?? b}`;
    }
    return this.pessoas.get(path)?.nome ?? (this.lugares.get(path) || undefined);
  }

  private entOf(id: string | null | undefined): Val {
    return id && this.pessoas.has(id) ? new Ent(id) : null;
  }

  private placeVal(key: string | null): Val {
    if (!key) return null;
    return this.entPorCaminho.has(key) ? new Ent(key) : this.lugarNome(key);
  }

  /** Campo de uma pessoa (ou de uma relação) para as regras. `undefined` = não é campo da simulação. */
  getCampo(path: string, f: string): Val | undefined {
    if (path.startsWith('rel:')) {
      const [a, b] = path.slice(4).split('>') as [string, string];
      const v = this.visao(a, b);
      switch (f) {
        case 'afeto': return Math.round(v.afeto);
        case 'atracao': return this.atracao(a, b);
        case 'confianca': return Math.round(v.confianca);
        case 'respeito': return Math.round(v.respeito);
        case 'intimidade': return Math.round(this.intimidade(a, b));
        case 'opiniao': return this.opiniao(a, b);
        case 'vinculos': case 'lacos': return [...this.vinculos(a, b)];
        case 'parentesco': return this.parentesco(a, b);
        case 'odio': return Math.max(0, -this.opiniao(a, b));
        case 'nome': return this.rotulo(path) ?? path;
        default: return this.relCampos.get(`${a}>${b}`)?.[f] ?? null;
      }
    }
    const p = this.pessoas.get(path);
    if (!p) return undefined;
    const A = () => this.atrib(p);
    const lista = (ps: Pessoa[]) => ps.map((x) => new Ent(x.id));
    switch (f) {
      case 'nome': return p.nome;
      case 'tipo': return 'personagem';
      case 'idade': return this.idade(p);
      case 'sexo': return p.sexo === 'f' ? 'feminino' : 'masculino';
      case 'genero': return p.genero === 'f' ? 'feminino' : p.genero === 'm' ? 'masculino' : 'neutro';
      case 'orientacao': return { hetero: 'hétero', homo: 'homo', bi: 'bi', ace: 'assexual' }[p.orientacao];
      case 'vivo': case 'viva': return p.morte === null;
      case 'morto': case 'morta': return p.morte !== null;
      case 'adulto': case 'adulta': return this.adulto(p);
      case 'crianca': return this.crianca(p);
      case 'local': case 'lugar': case 'cidade': return this.placeVal(this.ondeEsta(p) ?? p.local);
      case 'casa': case 'lar': return this.placeVal(p.local);
      case 'viajando': return !!p.viagem && this.ondeEsta(p) !== p.local;
      case 'profissao': return p.prof ? this.nomeProf(p) : null;
      case 'dinheiro': case 'ouro': case 'riqueza': return Math.round(p.dinheiro * 10) / 10;
      case 'saude': return Math.round(p.saude);
      case 'humor': case 'felicidade': return Math.round(p.humor);
      case 'estresse': return Math.round(p.estresse);
      case 'tracos': return [...p.tracos];
      case 'gostos': return [...p.gostos];
      case 'forca': return Math.round(A().forca * 100);
      case 'agilidade': return Math.round(A().agilidade * 100);
      case 'intelecto': case 'inteligencia': return Math.round(A().intelecto * 100);
      case 'beleza': return Math.round(A().beleza * 100);
      case 'fertilidade': return Math.round(this.fertil(p) * 100);
      case 'altura': return this.aparencia(p).altura;
      case 'olhos': return olhosDe(p.genes);
      case 'cabelo': return cabeloDe(p.genes);
      case 'combate': case 'labia': case 'intriga': case 'oficio': case 'saber': return Math.round(this.habilidade(p, f as Habilidade) * 10) / 10;
      case 'itens': return (p.itens ?? []).map((id) => this.cat.itens.get(id)?.nome ?? id);
      case 'abertura': return Math.round(p.big5[0]);
      case 'conscienciosidade': return Math.round(p.big5[1]);
      case 'extroversao': return Math.round(p.big5[2]);
      case 'amabilidade': return Math.round(p.big5[3]);
      case 'neuroticismo': return Math.round(p.big5[4]);
      case 'conjuge': case 'esposa': case 'marido': return this.entOf(p.conjuge);
      case 'parceiro': case 'parceira': case 'par': return this.entOf(this.parceiro(p)?.id);
      case 'mae': return this.entOf(p.pais[0]);
      case 'pai': return this.entOf(p.paiOficial ?? p.pais[1]);
      case 'pai biologico': case 'pai de verdade': return this.entOf(p.pais[1]);
      case 'pais': return [this.entOf(p.pais[0]), this.entOf(p.paiOficial ?? p.pais[1])].filter(Boolean);
      case 'filhos': return lista(this.filhosOficiais(p.id).filter((x) => x.morte === null));
      case 'irmaos': return lista(this.irmaos(p.id).filter((x) => x.morte === null));
      case 'amantes': return lista(this.amantes(p));
      case 'amigos': return lista(this.comVinculo(p.id, 'amigos'));
      case 'rivais': return lista(this.comVinculo(p.id, 'rivais'));
      case 'inimigos': return lista(this.comVinculo(p.id, 'inimigos'));
      case 'gravida': return !!p.gravidez;
      case 'familia': case 'sobrenome': return p.casa;
      case 'meta': return p.meta?.tipo ?? null;
      case 'alvo': return this.entOf(p.meta?.alvo);
      case 'conduzido': case 'conduzida': return p.conduzido;
      case 'protegido': case 'protegida': return p.protegido;
      case 'comprometido': case 'comprometida': return this.comprometido(p);
      case 'casado': case 'casada': return !!this.conjuge(p);
      case 'perto': case 'presentes': return this.aoRedor(p).map((x) => new Ent(x));
      case 'especie': case 'raca': return this.especieNome(p);
      case 'etnia': case 'povo': case 'cultura': return this.etniaNome(p);
      case 'faccao': case 'reino': case 'lealdade': {
        const fc = this.guerras.faccaoDe(p);
        return fc ? this.guerras.val(fc.id) : null;
      }
      case 'em guerra': case 'no front': return !!this.guerras.front(p);
      case 'lider': case 'lidera': return this.guerras.vivas().some((x) => x.lider === p.id);
      case 'vinculos': case 'lacos': return [...new Set(this.ligados(p.id).flatMap((x) => [...this.vinculos(p.id, x)]))];
      case 'estados': return Object.keys(p.estados);
      case 'criatura': return this.criatura(p);
      case 'tramas': return this.tramas(p.id).map((x) => x.nome);
    }
    // vínculo do mundo: `p.irmãos_de_sangue` = com quem tem
    if (this.cat.vinculos.has(f)) return lista(this.comVinculo(p.id, f));
    if (p.estados[f] !== undefined || ESTADOS_VIDA[f]) return p.estados[f] !== undefined && p.estados[f]! >= this.t;
    const atr = this.cat.atributos.get(f);
    if (atr && typeof p.campos[f] === 'number') return clamp(Math.round(((p.campos[f] as number) + this.bonus(p, f)) * 10) / 10, atr.min, atr.max);
    if (f in p.campos) {
      const v = p.campos[f]!;
      return Array.isArray(v) ? v.map((x) => (this.porNome.has(fold(x)) ? new Ent(this.porNome.get(fold(x))!) : x)) : v;
    }
    return undefined;
  }

  private setCampoPath(path: string, f: string, v: Val): boolean {
    if (path.startsWith('rel:')) {
      const [a, b] = path.slice(4).split('>') as [string, string];
      if (!(VIZ as readonly string[]).includes(f)) {
        if (['opiniao', 'odio', 'vinculos', 'lacos', 'parentesco', 'nome'].includes(f)) throw new Error(`"${f}" de uma relação não muda direto (mexa em afeto, confiança...)`);
        // campo livre da relação (dívida, juramento, rancor...)
        const k = `${a}>${b}`;
        const o = this.relCampos.get(k) ?? {};
        o[f] = v instanceof Ent ? this.rotulo(v.path) ?? v.path : Array.isArray(v) ? v.map((x) => (x instanceof Ent ? this.rotulo(x.path) ?? x.path : String(x))) : (v as CampoValor);
        this.relCampos.set(k, o);
        return true;
      }
      const n = typeof v === 'number' ? v : Number(v) || 0;
      const vis = this.vm(a, b);
      vis[f as Eixo] = f === 'atracao' ? clamp(n - this.quimica(a, b), -100, 100) : f === 'intimidade' ? clamp(n - this.kinBonus(a, b).intim, 0, 100) : clamp(n, -100, 100);
      this.tocados.add(parKey(a, b));
      return true;
    }
    const p = this.pessoas.get(path);
    if (!p) return false;
    this.setCampo(p, f, v);
    return true;
  }

  private setCampo(p: Pessoa, f: string, v: Val): void {
    const n = () => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : Number(String(v ?? '').replace(',', '.')) || 0);
    const nomeDe = (x: Val) => (x instanceof Ent ? this.pessoas.get(x.path)?.nome ?? this.rotulo(x.path) ?? x.path : String(x ?? ''));
    switch (f) {
      case 'dinheiro': case 'ouro': case 'riqueza': p.dinheiro = Math.max(0, n()); return;
      case 'saude': p.saude = clamp(n(), 0, 100); return;
      case 'humor': case 'felicidade': p.humor = clamp(n(), -100, 100); return;
      case 'estresse': p.estresse = clamp(n(), 0, 100); return;
      case 'combate': case 'labia': case 'intriga': case 'oficio': case 'saber': p.hab[f as Habilidade] = clamp(n(), 0, 20); return;
      case 'abertura': case 'conscienciosidade': case 'extroversao': case 'amabilidade': case 'neuroticismo':
        p.big5[['abertura', 'conscienciosidade', 'extroversao', 'amabilidade', 'neuroticismo'].indexOf(f)] = clamp(n(), 0, 100);
        this.mudouPessoa();
        return;
      case 'conduzido': case 'conduzida': p.conduzido = !!v; return;
      case 'protegido': case 'protegida': p.protegido = !!v; return;
      case 'tracos': {
        const novos = (Array.isArray(v) ? v : v === null ? [] : [v]).map((x) => this.idTraco(nomeDe(x)));
        for (const t of novos) if (!p.tracos.includes(t)) this.ganhaTraco(p, t, false);
        p.tracos = p.tracos.filter((t) => novos.includes(t));
        return;
      }
      case 'gostos': p.gostos = (Array.isArray(v) ? v : v === null ? [] : [v]).map(nomeDe); this.mudouPessoa(); return;
      case 'profissao': {
        const s = nomeDe(v);
        p.prof = s ? ([...this.cat.profs.values()].find((x) => fold(x.m) === fold(s) || fold(x.f) === fold(s) || x.id === s)?.id ?? s) : null;
        return;
      }
      case 'local': case 'lugar': case 'cidade': case 'casa': case 'lar': {
        const key = v instanceof Ent ? v.path : [...this.lugares].find(([, nome]) => fold(nome) === fold(String(v ?? '')))?.[0] ?? String(v ?? '');
        if (!key) return;
        if (!this.lugares.has(key)) this.lugares.set(key, this.rotulo(key) ?? key);
        p.local = key;
        p.viagem = null;
        this.mudouGente = true;
        return;
      }
      case 'familia': case 'sobrenome': p.casa = v === null ? null : nomeDe(v); return;
      case 'etnia': case 'povo': case 'cultura': {
        const s = nomeDe(v);
        p.etnia = s ? etniaDoTexto(this.cat, s) ?? fold(s) : null;
        this.atribCache.delete(p.id);
        this.mudouPessoa();
        return;
      }
      case 'faccao': case 'reino': case 'lealdade': {
        const fc = v === null ? null : this.guerras.achar(v instanceof Ent ? v.path : nomeDe(v));
        p.faccao = fc?.id ?? null;
        return;
      }
    }
    if (['idade', 'sexo', 'vivo', 'viva', 'morto', 'morta', 'conjuge', 'pai', 'mae', 'filhos', 'irmaos', 'amantes', 'amigos', 'rivais', 'inimigos', 'gravida', 'parceiro'].includes(f)) {
      throw new Error(`"${f}" não muda direto; use as funções (casar, ferir, matar...)`);
    }
    const at = this.cat.atributos.get(f);
    if (at) {
      p.campos[f] = clamp(n(), at.min, at.max);
      return;
    }
    p.campos[f] = v instanceof Ent ? nomeDe(v) : Array.isArray(v) ? v.map(nomeDe) : (v as CampoValor);
  }

  private idTraco(texto: string): string {
    const k = fold(texto).trim();
    for (const t of this.cat.tracos.values()) if (t.id === k || fold(t.m) === k || fold(t.f) === k) return t.id;
    return k;
  }

  private funcoes(): Record<string, (args: Val[], rt: Rules) => Val> {
    const pe = (v: Val | undefined): Pessoa | null => (v instanceof Ent ? this.vivo(v.path) : typeof v === 'string' ? this.vivo(this.porNome.get(fold(v))) : null);
    const exige = (v: Val | undefined, o: string): Pessoa => {
      const p = pe(v);
      if (!p) throw new Error(`${o} precisa de uma pessoa viva da simulação`);
      return p;
    };
    const texto = (v: Val | undefined) => (v === null || v === undefined ? '' : v instanceof Ent ? this.rotulo(v.path) ?? v.path : String(v));
    // leitura vale até para quem já morreu (a lembrança fica); mudança exige gente viva
    const qualquer = (v: Val | undefined): string | null => (v instanceof Ent && this.pessoas.has(v.path) ? v.path : typeof v === 'string' ? this.porNome.get(fold(v)) ?? null : null);
    return {
      relacao: ([a, b]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        if (!x || !y) throw new Error('relação precisa de duas pessoas da simulação');
        return new Ent(`rel:${x}>${y}`);
      },
      opiniao: ([a, b]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        return x && y ? this.opiniao(x, y) : 0;
      },
      atracao: ([a, b]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        return x && y ? this.atracao(x, y) : 0;
      },
      dar_item: ([a, i]) => {
        const p = exige(a, 'dar_item');
        const id = this.idItem(texto(i));
        if (!id) throw new Error(`não há item "${texto(i)}" (declare com item "..." ou crie uma ficha tipo: item)`);
        return this.ganharItem(p, id, 'regra');
      },
      tirar_item: ([a, i]) => {
        const p = exige(a, 'tirar_item');
        const id = this.idItem(texto(i));
        if (!id || !p.itens?.includes(id)) return false;
        this.perderItem(p, id, 'regra');
        if (this.cat.itens.get(id)!.unico) this.perdidos.set(id, this.ondeEsta(p) ?? p.local);
        return true;
      },
      destruir_item: ([i]) => {
        const id = this.idItem(texto(i));
        if (!id) return false;
        const d = this.donoDe(id);
        if (d) this.perderItem(d, id, 'destruido');
        this.perdidos.delete(id);
        if (this.cat.itens.get(id)!.unico) {
          this.destruidos.add(id);
          this.historiaItens.set(id, [...(this.historiaItens.get(id) ?? []), { t: this.t, dono: null, como: 'destruido' }]);
        }
        return true;
      },
      tem_item: ([a, i]) => {
        const p = pe(a);
        const id = this.idItem(texto(i));
        return !!p && !!id && !!p.itens?.includes(id);
      },
      dono: ([i]) => {
        const id = this.idItem(texto(i));
        return id ? this.entOf(this.donoDe(id)?.id) : null;
      },
      comecar_evento: ([n, l]) => {
        const key = l instanceof Ent ? l.path : l ? [...this.lugares].find(([, nome]) => fold(nome) === fold(texto(l)))?.[0] ?? null : null;
        return this.comecarEvento(texto(n), key, false);
      },
      evento_ativo: ([n, l]) => {
        const k = fold(texto(n));
        const key = l instanceof Ent ? l.path : l ? [...this.lugares].find(([, nome]) => fold(nome) === fold(texto(l)))?.[0] ?? null : null;
        return this.eventosAtivos.some((e) => (e.id === k || fold(e.nome) === k) && (!key || e.lugar === null || e.lugar === key));
      },
      odio: ([a, b]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        return x && y ? Math.max(0, -this.opiniao(x, y)) : 0;
      },
      especie: ([a]) => {
        const x = qualquer(a);
        return x ? this.especieNome(this.pessoas.get(x)!) : null;
      },
      casar: ([a, b]) => {
        const x = exige(a, 'casar');
        const y = exige(b, 'casar');
        this.casar(x, y);
        return x.conjuge === y.id;
      },
      namorar: ([a, b]) => {
        const x = exige(a, 'namorar');
        const y = exige(b, 'namorar');
        if (!this.podeRomance(x.id, y.id)) return false;
        this.liga(x.id, y.id, 'namoro');
        this.say('romance', 'namoro', `${this.L(x.id)} e ${this.L(y.id)} começam a namorar.`, [x.id, y.id], 2);
        return true;
      },
      noivar: ([a, b]) => {
        const x = exige(a, 'noivar');
        const y = exige(b, 'noivar');
        if (!this.podeRomance(x.id, y.id)) return false;
        this.desliga(x.id, y.id, 'namoro');
        this.liga(x.id, y.id, 'noivado');
        this.casamentos.set(parKey(x.id, y.id), this.t + 4);
        return true;
      },
      terminar: ([a, b]) => {
        const x = exige(a, 'terminar');
        const y = exige(b, 'terminar');
        this.terminar(x, y, x);
        return true;
      },
      divorciar: ([a, b]) => {
        const x = exige(a, 'divorciar');
        const y = exige(b, 'divorciar');
        if (x.conjuge !== y.id) return false;
        this.terminar(x, y, x);
        return true;
      },
      caso: ([a, b]) => {
        const x = exige(a, 'caso');
        const y = exige(b, 'caso');
        if (!this.podeRomance(x.id, y.id)) return false;
        this.comecarCaso(x, y);
        return true;
      },
      engravidar: ([a, b]) => this.conceber(exige(a, 'engravidar'), exige(b, 'engravidar'), 100),
      ferir: ([a, m]) => {
        const p = exige(a, 'ferir');
        const marca = texto(m);
        if (marca) {
          const id = this.idTraco(marca);
          if (!p.tracos.includes(id)) p.tracos.push(id);
          p.saude = clamp(p.saude - 25, 0, 100);
          return id;
        }
        return this.ferir(p, true);
      },
      matar: ([a, c]) => {
        const p = exige(a, 'matar');
        this.morrer(p, texto(c) || 'de repente');
        return true;
      },
      lutar: ([a, b, m]) => {
        const r = lutar(this, exige(a, 'lutar'), exige(b, 'lutar'), (['briga', 'duelo', 'emboscada'].includes(texto(m)) ? texto(m) : 'briga') as Modo);
        return r.venceu ? new Ent(r.venceu) : null;
      },
      lembrar: ([a, b, o, v, m]) => {
        const x = exige(a, 'lembrar');
        const y = exige(b, 'lembrar');
        this.lembra(x.id, y.id, texto(o) || 'algo aconteceu', typeof v === 'number' ? v : 10, typeof m === 'number' ? m : 36);
        return true;
      },
      mudar: ([a, l]) => {
        const p = exige(a, 'mudar');
        const key = l instanceof Ent ? l.path : [...this.lugares].find(([, nome]) => fold(nome) === fold(texto(l)))?.[0] ?? texto(l);
        if (!key) return false;
        if (!this.lugares.has(key)) this.lugares.set(key, this.rotulo(key) ?? key);
        p.local = key;
        this.viajar(p, key, 'mudança');
        return true;
      },
      viajar: ([a, l]) => {
        const p = exige(a, 'viajar');
        const key = l instanceof Ent ? l.path : [...this.lugares].find(([, nome]) => fold(nome) === fold(texto(l)))?.[0];
        if (!key) return false;
        this.viajar(p, key, 'viagem');
        return true;
      },
      parente: ([a, b]) => this.parentesco(exige(a, 'parente').id, exige(b, 'parente').id),
      parentes: ([a]) => {
        const p = exige(a, 'parentes');
        return this.vivos().filter((x) => this.parentesco(p.id, x.id) && !/marido|esposa/.test(this.parentesco(p.id, x.id)!)).map((x) => new Ent(x.id));
      },
      presentes: ([a]) => {
        const p = pe(a);
        if (p) return this.aoRedor(p).map((x) => new Ent(x));
        const key = a instanceof Ent ? a.path : [...this.lugares].find(([, nome]) => fold(nome) === fold(texto(a)))?.[0];
        return key ? (this.presentes.get(key) ?? []).map((x) => new Ent(x)) : [];
      },
      traco: ([a, t]) => {
        const p = pe(a);
        return !!p && p.tracos.includes(this.idTraco(texto(t)));
      },
      ganhar: ([a, t]) => this.ganhaTraco(exige(a, 'ganhar'), this.idTraco(texto(t))),
      perder: ([a, t]) => {
        this.perdeTraco(exige(a, 'perder'), this.idTraco(texto(t)));
        return true;
      },
      meta: ([a, tipo, alvo]) => {
        const p = exige(a, 'meta');
        const k = fold(texto(tipo)) as Meta['tipo'];
        p.meta = k ? { tipo: k, desde: this.t, ...(pe(alvo) ? { alvo: pe(alvo)!.id } : {}) } : null;
        return true;
      },
      idade: ([a]) => {
        const p = a instanceof Ent ? this.pessoas.get(a.path) : null;
        return p ? this.idade(p) : null;
      },
      segredo: ([a, b]) => {
        const p = exige(a, 'segredo');
        const outro = pe(b);
        return this.segredos.some((s) => s.sobre.includes(p.id) && (!outro || s.sabem.includes(outro.id)));
      },
      revelar: ([a]) => {
        const p = exige(a, 'revelar');
        for (const s of this.segredos.filter((x) => x.sobre.includes(p.id))) {
          for (const id of (this.presentes.get(p.local) ?? [])) if (!s.sabem.includes(id)) s.sabem.push(id);
          this.publicar(s);
        }
        return true;
      },
      vincular: ([a, b, v, quem]) => {
        const x = exige(a, 'vincular');
        const y = exige(b, 'vincular');
        const id = fold(texto(v)).trim();
        if (!id) throw new Error('vincular(a, b, "nome do vínculo")');
        return this.vincular(x, y, id, pe(quem) ?? x);
      },
      desvincular: ([a, b, v]) => this.desvincular(exige(a, 'desvincular'), exige(b, 'desvincular'), fold(texto(v)).trim()),
      vinculo: ([a, b, v]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        return !!x && !!y && this.temVinc(x, y, fold(texto(v)).trim());
      },
      vinculados: ([a, v]) => {
        const x = qualquer(a);
        return x ? this.comVinculo(x, fold(texto(v)).trim()).map((p) => new Ent(p.id)) : [];
      },
      papel: ([a, b, v]) => {
        const x = qualquer(a);
        const y = qualquer(b);
        return x && y ? this.papel(x, y, fold(texto(v)).trim()) : null;
      },
      etnia: ([a]) => {
        const x = qualquer(a);
        return x ? this.etniaNome(this.pessoas.get(x)!) : null;
      },
      faccao: ([a]) => {
        const x = qualquer(a);
        const fc = x ? this.guerras.faccaoDe(this.pessoas.get(x)!) : null;
        return fc ? this.guerras.val(fc.id) : null;
      },
      em_guerra: ([a, b]) => {
        const fa = this.guerras.achar(a instanceof Ent ? a.path : texto(a));
        const fb = b === undefined ? null : this.guerras.achar(b instanceof Ent ? b.path : texto(b));
        if (!fa) return false;
        return fb ? !!this.guerras.guerraEntre(fa.id, fb.id) : this.guerras.emGuerra(fa.id).length > 0;
      },
      declarar_guerra: ([a, b, m]) => {
        const fa = this.guerras.achar(a instanceof Ent ? a.path : texto(a));
        const fb = this.guerras.achar(b instanceof Ent ? b.path : texto(b));
        if (!fa || !fb) throw new Error('declarar_guerra precisa de duas facções');
        return !!this.guerras.declarar(fa.id, fb.id, m ? texto(m) : null, false);
      },
      fazer_paz: ([a, b]) => {
        const fa = this.guerras.achar(a instanceof Ent ? a.path : texto(a));
        const fb = this.guerras.achar(b instanceof Ent ? b.path : texto(b));
        const g = fa && fb ? this.guerras.guerraEntre(fa.id, fb.id) : null;
        if (g) this.guerras.paz(g, false);
        return !!g;
      },
      postura: ([a, b, v]) => {
        const fa = this.guerras.achar(a instanceof Ent ? a.path : texto(a));
        const fb = this.guerras.achar(b instanceof Ent ? b.path : texto(b));
        if (!fa || !fb) return 0;
        if (typeof v === 'number') this.guerras.setPostura(fa.id, fb.id, v);
        return Math.round(this.guerras.postura(fa.id, fb.id));
      },
      lider: ([f]) => {
        const fc = this.guerras.achar(f instanceof Ent ? f.path : texto(f));
        return fc ? this.entOf(fc.lider) : null;
      },
      acontecer: ([n, a, b]) => {
        const k = fold(texto(n));
        const ac = ACONTECIMENTOS.find((x) => x.id === k || fold(x.nome) === k);
        const x = exige(a, 'acontecer');
        const y = pe(b);
        if (!ac || (ac.alvo && !y) || (ac.tom === 'adulto' && (!this.adulto(x) || (y && !this.adulto(y))))) return false;
        if (ac.pode && !ac.pode(this, x, ac.alvo ? y : null)) return false;
        this.acontecer(ac, x, ac.alvo ? y : null);
        return true;
      },
      estado: ([a, e, m]) => {
        const p = exige(a, 'estado');
        const k = fold(texto(e)).trim();
        if (typeof m === 'number') {
          if (m <= 0) delete p.estados[k];
          else p.estados[k] = this.t + Math.round(m) - 1;
          return true;
        }
        return (p.estados[k] ?? -1) >= this.t;
      },
      atividade: ([a, b]) => {
        const x = exige(a, 'atividade');
        const y = exige(b, 'atividade');
        const g = x.gostos.find((k) => y.gostos.includes(k));
        return g ? `${ATIVIDADE[g] ?? `aproveitam ${g} juntos`}` : 'passam um tempo juntos';
      },
    };
  }
}
