import { seededRng, type Rng } from '../../rpg/dice';
import { asText } from '../frontmatter';
import { tensionsOf } from '../conflitos';
import { sameTitle } from '../markdown';
import type { Entity } from '../mundo';
import { fold } from '../regras/parse';
import { Ent, type Val } from '../regras/run';
import { placeOwners } from '../simulacao';
import type { Vidas } from './motor';
import { mesDoAno, type Pessoa, type TomVida } from './tipos';

/*
 * Guerras dentro da simulação de vidas, ao mesmo tempo que o resto.
 *
 * As facções do mundo (fichas `tipo: facção`, ou criadas no meio da história)
 * têm poder, riqueza, estabilidade, território (lugares que governam) e um
 * líder de carne e osso. Cada pessoa é leal a uma facção (a da ficha, a do
 * lugar onde mora, a dos pais).
 *
 * Várias guerras correm juntas. Cada uma convoca gente de verdade para o
 * front (soldados e guardas primeiro, depois os corajosos), que vive meses no
 * acampamento (fazendo amigos e inimigos), luta batalhas com nome e lugar,
 * morre, volta ferida, vira heroína ou desertora. Os parentes de quem morre
 * lembram de quem matou. Placar alto vira cerco e conquista: o lugar muda de
 * dono e quem mora lá sente o saque. O cansaço traz a paz, com tributo para
 * quem venceu. Assassinato de líder, casamento entre casas e alianças mexem
 * nas posturas: a vida das pessoas e a guerra das facções se alimentam.
 *
 * Usa uma sorte própria: um mundo sem facções anda igual a antes.
 */

export interface Faccao {
  id: string;
  nome: string;
  nota: string | null;
  /** força militar abstrata (levas, mercenários), 0 a 150 */
  poder: number;
  riqueza: number;
  estabilidade: number;
  territorio: string[];
  capital: string | null;
  /** id da pessoa que lidera (se estiver na simulação) */
  lider: string | null;
  viva: boolean;
}

export interface Guerra {
  id: number;
  nome: string;
  atacantes: string[];
  defensores: string[];
  motivo: string;
  /** lugar disputado agora (cerco) */
  alvo: string | null;
  desde: number;
  /** −100 (defensores vencendo) a 100 (atacantes vencendo) */
  placar: number;
  batalhas: number;
  /** gente da simulação morta, por facção */
  baixas: Record<string, number>;
  cansaco: number;
  fim: number | null;
  resultado: string | null;
  conquistas: string[];
  /** batalhas com nome: mês, lugar, quem venceu, mortos */
  diario: Array<{ t: number; lugar: string | null; venceu: 'a' | 'd'; mortos: string[]; margem: number }>;
}

const LEADER = /^(líder|lider|chefe|governante|mestre|rei|rainha|soberano|soberana)$/i;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const parF = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Motivos de guerra, com tom (o mundo regula quanto de cada um aparece). */
const MOTIVOS: Array<{ tom: TomVida; t: string }> = [
  { tom: 'serio', t: 'uma disputa antiga pela fronteira' },
  { tom: 'serio', t: 'caravanas saqueadas na estrada' },
  { tom: 'serio', t: 'impostos que ninguém aceitou pagar' },
  { tom: 'serio', t: 'um tratado rasgado em público' },
  { tom: 'serio', t: 'o controle de um poço no meio do deserto' },
  { tom: 'serio', t: 'espiões enforcados na praça' },
  { tom: 'comico', t: 'o embaixador chamou o rei de careca num banquete' },
  { tom: 'comico', t: 'uma cabra premiada que ninguém admite ter roubado' },
  { tom: 'comico', t: 'a receita secreta de um queijo' },
  { tom: 'comico', t: 'um poema satírico que todo mundo decorou' },
  { tom: 'fantasia', t: 'uma profecia que diz que só um dos dois verá o próximo inverno' },
  { tom: 'fantasia', t: 'um ovo de dragão roubado do templo' },
  { tom: 'fantasia', t: 'uma espada lendária reclamada pelos dois tronos' },
  { tom: 'fantasia', t: 'uma maldição que, juram, veio do outro lado do rio' },
  { tom: 'adulto', t: 'a noiva de um príncipe fugiu com o general inimigo' },
  { tom: 'adulto', t: 'cartas de amor do rei para a rainha do vizinho' },
  { tom: 'adulto', t: 'um herdeiro bastardo que os dois lados querem coroar' },
];

export class Guerras {
  readonly faccoes = new Map<string, Faccao>();
  guerras: Guerra[] = [];
  /** −100 a 100, por par de facções */
  readonly posturas = new Map<string, number>();
  readonly aliancas = new Set<string>();
  /** par → mês até quando vale a trégua */
  readonly treguas = new Map<string, number>();
  private seq = 0;
  private readonly rng: Rng;
  private membrosCache: Map<string, Pessoa[]> | null = null;

  constructor(private readonly s: Vidas, semente: number) {
    this.rng = seededRng(((semente * 2654435761) ^ 0x9e3779b9) >>> 0 || 7);
    this.iniciar();
  }

  // ---------------------------------------------------------------- sorte própria
  private ch(p: number): boolean {
    return this.rng() < p;
  }
  private pk<T>(l: readonly T[]): T {
    return l[Math.floor(this.rng() * l.length)]!;
  }
  private en(lo: number, hi: number): number {
    return lo + this.rng() * (hi - lo);
  }

  // ---------------------------------------------------------------- leitura

  get ativa(): boolean {
    return this.faccoes.size > 0;
  }
  vivas(): Faccao[] {
    return [...this.faccoes.values()].filter((f) => f.viva);
  }
  emAndamento(): Guerra[] {
    return this.guerras.filter((g) => g.fim === null);
  }
  /** Facção (por id ou nome). */
  achar(x: string | null | undefined): Faccao | null {
    if (!x) return null;
    const f = this.faccoes.get(x);
    if (f) return f;
    const k = fold(x.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.split('/').pop()!.replace(/\.md$/i, '')).trim();
    for (const y of this.faccoes.values()) if (fold(y.nome) === k) return y;
    return null;
  }
  nome(id: string | null | undefined): string {
    return (id && this.faccoes.get(id)?.nome) || '—';
  }
  L(id: string): string {
    return `[[${this.nome(id)}]]`;
  }
  /** Valor para as regras: a ficha da facção, se houver, ou o nome. */
  val(id: string): Val {
    const f = this.faccoes.get(id);
    return f?.nota ? new Ent(f.nota) : f?.nome ?? id;
  }
  faccaoDe(p: Pessoa): Faccao | null {
    return p.faccao ? this.faccoes.get(p.faccao) ?? null : null;
  }
  dono(lugar: string | null): Faccao | null {
    if (!lugar) return null;
    for (const f of this.faccoes.values()) if (f.viva && f.territorio.includes(lugar)) return f;
    return null;
  }
  postura(a: string, b: string): number {
    return this.posturas.get(parF(a, b)) ?? 0;
  }
  aliados(a: string, b: string): boolean {
    return this.aliancas.has(parF(a, b));
  }
  guerraEntre(a: string, b: string): Guerra | null {
    return this.emAndamento().find((g) => (g.atacantes.includes(a) && g.defensores.includes(b)) || (g.atacantes.includes(b) && g.defensores.includes(a))) ?? null;
  }
  emGuerra(f: string): Guerra[] {
    return this.emAndamento().filter((g) => g.atacantes.includes(f) || g.defensores.includes(f));
  }
  membros(fid: string): Pessoa[] {
    if (!this.membrosCache) {
      this.membrosCache = new Map();
      for (const p of this.s.vivos()) {
        if (!p.faccao) continue;
        const l = this.membrosCache.get(p.faccao) ?? [];
        l.push(p);
        this.membrosCache.set(p.faccao, l);
      }
    }
    return this.membrosCache.get(fid) ?? [];
  }
  /** A pessoa está num acampamento de guerra? */
  front(p: Pessoa): Guerra | null {
    const k = p.viagem?.para;
    if (!k?.startsWith('§front:')) return null;
    const id = Number(k.split(':')[1]);
    return this.guerras.find((g) => g.id === id) ?? null;
  }
  /** "o acampamento da Coroa (Guerra do Queijo)" para os lugares `§front:...`. */
  nomeFront(key: string): string | null {
    if (!key.startsWith('§front:')) return null;
    const [, id, lado] = key.split(':');
    const g = this.guerras.find((x) => x.id === Number(id));
    if (!g) return 'o front';
    const f = lado === 'a' ? g.atacantes[0] : g.defensores[0];
    return `o acampamento de ${this.nome(f)} (${g.nome})`;
  }
  private camp(g: Guerra, lado: 'a' | 'd'): string {
    return `§front:${g.id}:${lado}`;
  }

  // ---------------------------------------------------------------- começo

  private iniciar(): void {
    const w = this.s.world;
    const fichas = w.entities.filter((e) => e.type === 'faccao');
    if (!fichas.length) {
      for (const p of this.s.todas()) if (p.faccao === undefined) p.faccao = null;
      return;
    }
    const donos = placeOwners(w);
    const campo = (e: Entity, ...ks: string[]) => {
      for (const k of ks) {
        const key = Object.keys(e.props).find((p) => sameTitle(p, k));
        if (key) return asText(e.props[key]).trim();
      }
      return '';
    };
    const nota = (e: Entity, k: string, def: number) => {
      const n = Number(campo(e, k).replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? clamp(n, 0, 10) * 10 : def;
    };
    for (const e of fichas) {
      const territorio = [...donos].filter(([, o]) => o === e.path).map(([l]) => l);
      const lider = e.relations.find((r) => LEADER.test(r.label.trim()) && r.to && this.s.pessoa(r.to))?.to ?? null;
      this.faccoes.set(e.path, {
        id: e.path, nome: e.name, nota: e.path, poder: nota(e, 'poder', 30 + territorio.length * 8), riqueza: nota(e, 'riqueza', 40 + territorio.length * 5),
        estabilidade: nota(e, 'estabilidade', 60), territorio, capital: territorio[0] ?? null, lider, viva: !/extint|dissolv|destru/i.test(campo(e, 'status')),
      });
    }
    // lealdade: a da ficha (pelo nome ou caminho), senão quem governa onde a pessoa mora
    for (const p of this.s.todas()) {
      if (p.faccao) {
        const f = this.achar(p.faccao);
        p.faccao = f?.id ?? null;
      } else if (p.faccao === undefined) p.faccao = this.dono(p.local)?.id ?? null;
    }
    for (const t of tensionsOf(w)) {
      if (!this.faccoes.has(t.a) || !this.faccoes.has(t.b)) continue;
      const v = clamp(30 + t.weight * 15, 30, 90);
      const k = parF(t.a, t.b);
      this.posturas.set(k, clamp((this.posturas.get(k) ?? 0) + (t.stance === 'hostil' ? -v : t.stance === 'aliado' ? v : 0), -100, 100));
      if ((this.posturas.get(k) ?? 0) >= 50) this.aliancas.add(k);
    }
    for (const f of this.faccoes.values()) if (!f.lider || this.s.pessoa(f.lider)?.faccao !== f.id) f.lider = this.escolherLider(f, null);
  }

  /** Cria uma facção no meio da história (com território e, se quiser, líder). */
  criar(id: string, nome: string, lugares: string[], lider: string | null): Faccao | null {
    if (this.faccoes.has(id) || !nome.trim()) return null;
    const f: Faccao = { id, nome: nome.trim(), nota: null, poder: 25 + lugares.length * 8, riqueza: 35, estabilidade: 55, territorio: [], capital: lugares[0] ?? null, lider: null, viva: true };
    this.faccoes.set(id, f);
    for (const l of lugares) {
      const velho = this.dono(l);
      if (velho) velho.territorio = velho.territorio.filter((x) => x !== l);
      f.territorio.push(l);
    }
    const lp = lider ? this.s.vivo(lider) : null;
    if (lp) lp.faccao = id;
    // quem mora nos lugares passa a ser leal à nova facção (os leais à antiga resistem)
    for (const p of this.s.vivos()) if (lugares.includes(p.local) && (!p.faccao || !p.tracos.includes('leal'))) p.faccao = id;
    this.membrosCache = null;
    f.lider = lp?.id ?? this.escolherLider(f, null);
    this.s.say('guerra', 'faccao', `⚑ Nasce ${this.L(id)}${f.territorio.length ? `, com ${f.territorio.map((l) => `[[${this.s.lugarNome(l)}]]`).join(', ')}` : ''}${f.lider ? `, liderada por ${this.s.L(f.lider)}` : ''}.`, f.lider ? [f.lider] : [], 3);
    return f;
  }

  setPostura(a: string, b: string, v: number): void {
    if (a === b) return;
    const k = parF(a, b);
    this.posturas.set(k, clamp(v, -100, 100));
    if (v < 30) this.aliancas.delete(k);
    if (v >= 60) this.aliancas.add(k);
  }
  private mexePostura(a: string | null | undefined, b: string | null | undefined, d: number): void {
    if (!a || !b || a === b || !this.faccoes.has(a) || !this.faccoes.has(b)) return;
    const k = parF(a, b);
    this.posturas.set(k, clamp((this.posturas.get(k) ?? 0) + d, -100, 100));
  }

  // ---------------------------------------------------------------- liderança

  private pontos(p: Pessoa): number {
    const st = this.s.prof(p)?.status ?? 1;
    return st * 4 + this.s.habilidade(p, 'labia') + this.s.habilidade(p, 'combate') * 0.7 + Math.min(40, this.s.idade(p)) / 4 + (p.tracos.includes('ambicioso') ? 3 : 0) + (p.tracos.includes('heroi') ? 6 : 0);
  }
  private escolherLider(f: Faccao, antigo: Pessoa | null): string | null {
    const adultos = (p: Pessoa) => p.morte === null && p.faccao === f.id && this.s.adulto(p) && !this.s.criatura(p);
    if (antigo) {
      const herdeiro = this.s.filhosOficiais(antigo.id).filter(adultos).sort((a, b) => a.nasc - b.nasc)[0];
      if (herdeiro) return herdeiro.id;
    }
    const cands = this.s.vivos().filter(adultos);
    if (!cands.length) return null;
    return cands.sort((a, b) => this.pontos(b) - this.pontos(a) || a.id.localeCompare(b.id))[0]!.id;
  }
  private liderancas(): void {
    for (const f of this.vivas()) {
      const l = f.lider ? this.s.pessoa(f.lider) : null;
      if (l && l.morte === null && l.faccao === f.id) continue;
      const novo = this.escolherLider(f, l ?? null);
      if (novo === f.lider) continue;
      f.lider = novo;
      if (!novo) continue;
      const herdeiro = l && this.s.filhosOficiais(l.id).some((x) => x.id === novo);
      f.estabilidade = clamp(f.estabilidade - (herdeiro ? 6 : 18), 0, 100);
      this.s.say('guerra', 'sucessao', l
        ? `👑 ${this.s.L(novo)} assume ${this.L(f.id)} ${herdeiro ? `no lugar de ${this.s.L(l.id)}, como manda o sangue` : `depois de ${this.s.L(l.id)}, e nem todos aceitam`}.`
        : `👑 ${this.s.L(novo)} passa a liderar ${this.L(f.id)}.`, [novo, ...(l ? [l.id] : [])], 3);
      this.s.emitir('sucessao', [novo], [this.val(f.id)]);
    }
  }
  /** Quanto o líder puxa para a guerra (ambicioso, cruel, irascível) ou para a paz (gentil, clemente, calmo). */
  agressividade(f: Faccao): number {
    const l = f.lider ? this.s.vivo(f.lider) : null;
    if (!l) return 1;
    const M: Record<string, number> = { ambicioso: 1.6, cruel: 1.4, irascivel: 1.3, orgulhoso: 1.2, vingativo: 1.3, brigao: 1.2, gentil: 0.55, clemente: 0.6, calmo: 0.75, covarde: 0.6, acomodado: 0.7 };
    return l.tracos.reduce((m, t) => m * (M[t] ?? 1), 1);
  }

  // ---------------------------------------------------------------- o mês

  mes(): void {
    if (!this.faccoes.size) return;
    this.membrosCache = null;
    if (mesDoAno(this.s.t) === 1) this.economia();
    this.liderancas();
    this.diplomacia();
    for (const g of this.emAndamento()) this.campanha(g);
    this.frenteDeCasa();
    this.membrosCache = null;
  }

  private economia(): void {
    for (const f of this.vivas()) {
      const guerras = this.emGuerra(f.id).length;
      const gente = this.membros(f.id).length;
      f.riqueza = clamp(f.riqueza + f.territorio.length * 2 + gente * 0.08 - guerras * 5 + this.en(-3, 3), 0, 100);
      f.poder = clamp(f.poder + 2 + f.riqueza / 25 - (f.poder > 30 + f.territorio.length * 12 ? 3 : 0), 0, 150);
      f.estabilidade = clamp(f.estabilidade + (f.riqueza > 30 ? 2 : -3) - guerras * 2 + this.en(-2, 2), 0, 100);
      // fome de guerra: cofres vazios em tempo de guerra
      if (guerras && f.riqueza < 12 && f.territorio.length && this.ch(0.5)) {
        const l = this.pk(f.territorio);
        this.s.efeitoMundo('fome', l, 4, false);
      }
      // revolta: estabilidade no chão
      if (f.estabilidade < 15 && this.ch(0.35)) {
        const l = f.lider ? this.s.vivo(f.lider) : null;
        f.estabilidade = 40;
        f.poder *= 0.85;
        this.s.say('guerra', 'revolta', `🔥 Revoltas sacodem ${this.L(f.id)}${l ? `; o povo grita contra ${this.s.L(l.id)}` : ''}.`, l ? [l.id] : [], 2);
        if (l && this.ch(0.3)) {
          l.faccao = null;
          this.s.say('guerra', 'deposto', `${this.s.L(l.id)} é deposto e foge de ${this.L(f.id)}.`, [l.id], 3);
          this.s.humor(l, -40);
          this.membrosCache = null;
        }
      }
    }
    // posturas andam devagar: rancor esfria, vizinho forte assusta
    for (const a of this.vivas()) {
      for (const b of this.vivas()) {
        if (a.id >= b.id) continue;
        const k = parF(a.id, b.id);
        let v = (this.posturas.get(k) ?? 0) * 0.96 + this.en(-5, 5);
        if (!this.guerraEntre(a.id, b.id)) {
          const ag = (this.agressividade(a) + this.agressividade(b)) / 2;
          if (ag > 1.2) v -= 4 * (ag - 1);
        }
        this.posturas.set(k, clamp(v, -100, 100));
      }
    }
  }

  private diplomacia(): void {
    const vivas = this.vivas();
    for (const a of vivas) {
      for (const b of vivas) {
        if (a === b || !a.viva || !b.viva) continue;
        const k = parF(a.id, b.id);
        const pos = this.posturas.get(k) ?? 0;
        if (a.id < b.id) {
          if (pos >= 60 && !this.aliancas.has(k) && !this.guerraEntre(a.id, b.id) && this.ch(0.04)) {
            this.aliancas.add(k);
            this.s.say('guerra', 'alianca', `🤝 ${this.L(a.id)} e ${this.L(b.id)} selam uma aliança.`, [], 2);
            this.s.emitir('alianca', [], [this.val(a.id), this.val(b.id)]);
          } else if (this.aliancas.has(k) && pos < 25) {
            this.aliancas.delete(k);
            this.s.say('guerra', 'alianca', `A aliança entre ${this.L(a.id)} e ${this.L(b.id)} se desfaz.`, [], 2);
          }
        }
        if (pos > -25 || this.guerraEntre(a.id, b.id) || (this.treguas.get(k) ?? -1) > this.s.t || this.aliancas.has(k)) continue;
        const p = 0.004 * (-pos / 50) * this.agressividade(a) * this.s.ajustes.guerra * (a.riqueza > 20 ? 1 : 0.5) * (a.poder >= b.poder * 0.6 ? 1 : 0.4);
        if (this.ch(p)) this.declarar(a.id, b.id, null, false);
      }
    }
  }

  /** Motivo sorteado pelo tom (cômico, fantasia, adulto, sério), pesado pelos ajustes do mundo. */
  private motivo(): string {
    const w = MOTIVOS.map((m) => this.s.ajustes[m.tom] ?? 1);
    let r = this.rng() * w.reduce((s, x) => s + x, 0);
    for (let i = 0; i < MOTIVOS.length; i++) if ((r -= w[i]!) <= 0) return MOTIVOS[i]!.t;
    return MOTIVOS[0]!.t;
  }

  private escolherAlvo(defensores: string[]): string | null {
    const lugares = defensores.flatMap((d) => this.faccoes.get(d)?.territorio ?? []);
    if (!lugares.length) return null;
    // lugares com gente da simulação primeiro (a guerra chega na porta de alguém)
    const comGente = lugares.filter((l) => this.s.vivos().some((p) => p.local === l));
    return this.pk(comGente.length && this.ch(0.75) ? comGente : lugares);
  }

  /** `a` declara guerra a `b`. Aliados de cada lado podem entrar. */
  declarar(a: string, b: string, motivo: string | null, voce: boolean): Guerra | null {
    const A = this.faccoes.get(a);
    const B = this.faccoes.get(b);
    if (!A || !B || a === b || !A.viva || !B.viva || this.guerraEntre(a, b)) return null;
    const mot = motivo?.trim() || this.motivo();
    const alvo = this.escolherAlvo([b]);
    const g: Guerra = {
      id: ++this.seq, nome: alvo ? `Guerra de ${this.s.lugarNome(alvo)}` : `Guerra de ${A.nome} e ${B.nome}`, atacantes: [a], defensores: [b], motivo: mot, alvo,
      desde: this.s.t, placar: 0, batalhas: 0, baixas: {}, cansaco: 0, fim: null, resultado: null, conquistas: [], diario: [],
    };
    if (this.guerras.some((x) => x.nome === g.nome)) g.nome = `${g.nome} (${this.s.data().split(' ')[1]})`;
    // aliados entram
    for (const c of this.vivas()) {
      if (c.id === a || c.id === b) continue;
      if (this.aliados(c.id, b) && !this.aliados(c.id, a) && this.ch(0.7)) g.defensores.push(c.id);
      else if (this.aliados(c.id, a) && !this.aliados(c.id, b) && this.ch(0.4)) g.atacantes.push(c.id);
    }
    this.guerras.push(g);
    this.setPostura(a, b, Math.min(this.postura(a, b), -60));
    this.aliancas.delete(parF(a, b));
    const extra = [...g.atacantes.slice(1).map((x) => `${this.L(x)} se junta ao ataque`), ...g.defensores.slice(1).map((x) => `${this.L(x)} corre em defesa de ${B.nome}`)];
    this.s.say(voce ? 'voce' : 'guerra', 'guerra', `⚔ ${voce ? '✋ ' : ''}${this.L(a)} declara guerra a ${this.L(b)} por causa de ${mot}${alvo ? `; o alvo é [[${this.s.lugarNome(alvo)}]]` : ''}.${extra.length ? ` ${extra.join('; ')}.` : ''}`,
      [A.lider, B.lider].filter((x): x is string => !!x), 3);
    for (const f of g.atacantes) this.convocar(g, 'a', f, 1);
    for (const f of g.defensores) this.convocar(g, 'd', f, 1);
    this.s.emitir('guerra', [], [this.val(a), this.val(b)]);
    return g;
  }

  /** Chama gente de uma facção para o acampamento. `ritmo` < 1 = reforços (só alguns). */
  private convocar(g: Guerra, lado: 'a' | 'd', fid: string, ritmo: number): void {
    const foram: Pessoa[] = [];
    for (const p of this.membros(fid)) {
      if (p.viagem || p.gravidez || this.s.criatura(p) || !this.s.adulto(p) || this.s.idadeBio(p) > 55 || p.estados['preso'] || p.estados['sumido']) continue;
      const lider = this.faccoes.get(fid)?.lider === p.id;
      const base = p.prof === 'soldado' || p.prof === 'guarda' ? 0.9
        : p.tracos.includes('covarde') ? 0.04
        : p.tracos.includes('corajoso') || p.tracos.includes('brigao') || p.tracos.includes('veterano') ? 0.45
        : lider ? 0.3 : 0.1;
      if (!this.ch(base * ritmo)) continue;
      p.viagem = { para: this.camp(g, lado), chega: this.s.t, motivo: `guerra: ${g.nome}` };
      foram.push(p);
    }
    if (!foram.length) return;
    const nomes = foram.slice(0, 5).map((p) => this.s.L(p.id)).join(', ');
    this.s.say('guerra', 'convocado', `${ritmo < 1 ? 'Reforços' : 'Convocados'} por ${this.L(fid)} para a ${g.nome}: ${nomes}${foram.length > 5 ? ` e mais ${foram.length - 5}` : ''}.`, foram.map((p) => p.id), 2);
    for (const p of foram) this.s.emitir('convocado', [p.id], [this.val(fid)]);
  }

  private soldados(g: Guerra, lado: 'a' | 'd'): Pessoa[] {
    const k = this.camp(g, lado);
    return this.s.vivos().filter((p) => p.viagem?.para === k);
  }
  private forca(p: Pessoa): number {
    return 1 + this.s.habilidade(p, 'combate') / 4 + (p.tracos.includes('veterano') ? 1 : 0) + (p.tracos.includes('gigante') ? 0.5 : 0) + (p.tracos.includes('heroi') ? 1 : 0)
      - (p.tracos.includes('mutilado') ? 1 : 0) - (p.saude < 40 ? 0.8 : 0);
  }

  private campanha(g: Guerra): void {
    g.cansaco += 1;
    const lados = { a: g.atacantes.filter((f) => this.faccoes.get(f)?.viva), d: g.defensores.filter((f) => this.faccoes.get(f)?.viva) };
    if (!lados.a.length || !lados.d.length) {
      this.paz(g, false, !lados.a.length ? 'quem atacou deixou de existir' : 'quem defendia deixou de existir');
      return;
    }
    // reforços a cada estação
    if ((this.s.t - g.desde) % 4 === 3) {
      for (const f of lados.a) this.convocar(g, 'a', f, 0.3);
      for (const f of lados.d) this.convocar(g, 'd', f, 0.3);
    }
    // deserção: covardes e quem tem família esperando
    for (const lado of ['a', 'd'] as const) {
      for (const p of this.soldados(g, lado)) {
        const pesa = (p.tracos.includes('covarde') ? 0.06 : 0.004) + (p.estresse > 80 ? 0.02 : 0);
        if (!this.ch(pesa)) continue;
        p.viagem = { para: p.local, chega: this.s.t + 1, motivo: 'deserção' };
        this.s.ganhaTraco(p, 'desertor', false);
        this.s.say('guerra', 'desercao', `${this.s.L(p.id)} deserta da ${g.nome} no meio da noite.`, [p.id], 2);
      }
    }
    const pressao = g.alvo && Math.abs(g.placar) > 30 ? 0.42 : 0.3;
    if (this.ch(pressao)) this.batalha(g, lados.a, lados.d);
    if (g.fim !== null) return;
    // cerco e conquista
    if (g.placar >= 60 && g.alvo && g.defensores.includes(this.dono(g.alvo)?.id ?? '')) {
      this.conquistar(g, g.alvo, g.atacantes[0]!);
      g.placar = 20;
      g.alvo = this.escolherAlvo(g.defensores);
    } else if (g.placar <= -60) {
      const contra = this.escolherAlvo(g.atacantes);
      if (contra && this.ch(0.5)) this.conquistar(g, contra, g.defensores[0]!);
      g.placar = -20;
    }
    if (g.fim !== null) return;
    // paz: cansaço, cofres vazios, líderes que preferem a paz
    const semAlvo = !g.alvo && g.placar > 50;
    const pobres = [...lados.a, ...lados.d].some((f) => (this.faccoes.get(f)?.riqueza ?? 50) < 15);
    const ag = (this.agressividade(this.faccoes.get(lados.a[0]!)!) + this.agressividade(this.faccoes.get(lados.d[0]!)!)) / 2;
    const pp = Math.max(0, g.cansaco - 24) / 280 * (pobres ? 1.6 : 1) / ag + (semAlvo ? 0.25 : 0);
    if (Math.abs(g.placar) >= 90 || this.ch(pp)) this.paz(g, false);
  }

  private batalha(g: Guerra, A: string[], D: string[]): void {
    const sa = this.soldados(g, 'a');
    const sd = this.soldados(g, 'd');
    const guerras = (f: string) => Math.max(1, this.emGuerra(f).length);
    const abstrato = (l: string[]) => l.reduce((s, f) => s + (this.faccoes.get(f)?.poder ?? 0) * 0.6 / guerras(f), 0);
    const gente = (l: Pessoa[]) => l.reduce((s, p) => s + this.forca(p) * 2, 0);
    const fa = (abstrato(A) + gente(sa)) * this.en(0.7, 1.3);
    const fd = (abstrato(D) + gente(sd)) * this.en(0.7, 1.3) * 1.12;
    if (fa + fd <= 0) return;
    const margem = (fa - fd) / Math.max(fa, fd, 1);
    const venceu: 'a' | 'd' = margem > 0 ? 'a' : 'd';
    const [ganha, perde] = venceu === 'a' ? [A, D] : [D, A];
    g.placar = clamp(g.placar + margem * 35, -100, 100);
    g.batalhas++;
    for (const f of perde) {
      const x = this.faccoes.get(f)!;
      x.poder = Math.max(0, x.poder - (2 + Math.abs(margem) * 9) / perde.length);
      x.estabilidade = clamp(x.estabilidade - 3, 0, 100);
    }
    for (const f of ganha) {
      const x = this.faccoes.get(f)!;
      x.poder = Math.max(0, x.poder - 1.2);
      x.estabilidade = clamp(x.estabilidade + 2, 0, 100);
    }
    // gente de verdade
    const mortos: Pessoa[] = [];
    const feridos: Pessoa[] = [];
    const lutar = (ps: Pessoa[], perdeu: boolean, inimigos: Pessoa[]) => {
      for (const p of ps) {
        this.s.xp(p, 'lutas');
        if (!perdeu) this.s.xp(p, 'vitorias', 0.5);
        const pm = (perdeu ? 0.07 : 0.03) * (1 + Math.abs(margem)) * this.s.ajustes.mortalidade * (p.tracos.includes('veterano') ? 0.6 : 1) * (p.tracos.includes('heroi') ? 0.6 : 1);
        if (!p.protegido && this.ch(pm)) {
          mortos.push(p);
          const quem = inimigos.length ? this.pk(inimigos) : null;
          this.s.morrer(p, `na batalha de ${g.alvo ? this.s.lugarNome(g.alvo) : 'campo aberto'}${quem ? `, pelas mãos de ${quem.nome}` : ''}`);
          g.baixas[p.faccao ?? '?'] = (g.baixas[p.faccao ?? '?'] ?? 0) + 1;
          if (quem) {
            this.s.xp(quem, 'mortes');
            // a família lembra de quem matou
            const fam = [...p.pais, p.conjuge, ...this.s.filhosOficiais(p.id).map((x) => x.id), ...this.s.irmaos(p.id).map((x) => x.id)];
            for (const x of fam) if (x && this.s.vivo(x) && x !== quem.id) this.s.lembra(x, quem.id, `matou ${p.nome} na guerra`, -50, 240);
          }
        } else if (this.ch(perdeu ? 0.1 : 0.05)) {
          const m = this.s.ferir(p, this.ch(0.35));
          if (m) feridos.push(p);
        }
      }
    };
    lutar(sa, venceu === 'd', sd);
    lutar(sd, venceu === 'a', sa);
    // camaradagem: quem lutou junto se aproxima
    for (const l of [sa, sd]) {
      const vivos = l.filter((p) => p.morte === null);
      for (let i = 0; i + 1 < vivos.length && i < 6; i++) {
        const x = vivos[i]!;
        const y = this.pk(vivos);
        if (x !== y) {
          this.s.mexe(x.id, y.id, { afeto: 4, intimidade: 5, respeito: 3 });
          this.s.mexe(y.id, x.id, { afeto: 4, intimidade: 5, respeito: 3 });
        }
      }
    }
    const lugar = g.alvo;
    const onde = lugar ? `[[${this.s.lugarNome(lugar)}]]` : 'campo aberto';
    const vNome = ganha.map((f) => this.L(f)).join(' e ');
    const pNome = perde.map((f) => this.L(f)).join(' e ');
    const forte = Math.abs(margem) > 0.3 ? this.pk(['esmaga', 'destroça', 'põe em fuga']) : Math.abs(margem) < 0.08 ? 'vence por pouco' : this.pk(['derrota', 'vence', 'repele']);
    const caem = mortos.length ? ` Caem ${mortos.slice(0, 4).map((p) => this.s.L(p.id)).join(', ')}${mortos.length > 4 ? ` e mais ${mortos.length - 4}` : ''}.` : '';
    this.s.say('guerra', 'batalha', `⚔ Batalha de ${onde}: ${vNome} ${forte}${forte === 'vence por pouco' ? ` ${pNome}` : ` ${pNome}`}.${caem}${feridos.length ? ` ${feridos.length} ${feridos.length === 1 ? 'volta ferido' : 'voltam feridos'}.` : ''}`,
      [...mortos, ...feridos].map((p) => p.id), mortos.length || Math.abs(margem) > 0.3 ? 3 : 2);
    g.diario.push({ t: this.s.t, lugar, venceu, mortos: mortos.map((p) => p.id), margem: Math.round(margem * 100) / 100 });
    if (g.diario.length > 60) g.diario.shift();
    this.s.emitir('batalha', [], [this.val(ganha[0]!), this.val(perde[0]!), ...(lugar ? [this.s.lugarNome(lugar)] : [])]);
    // heroína ou herói do dia
    if (Math.abs(margem) > 0.25) {
      const lado = (venceu === 'a' ? sa : sd).filter((p) => p.morte === null);
      const melhor = lado.sort((x, y) => this.forca(y) - this.forca(x))[0];
      if (melhor && this.ch(0.3) && !melhor.tracos.includes('heroi')) {
        this.s.ganhaTraco(melhor, 'heroi', false);
        this.s.say('guerra', 'heroi', `🏅 ${this.s.L(melhor.id)} vira lenda na batalha de ${onde}; cantam ${this.s.g(melhor, 'o nome dele', 'o nome dela')} nas tavernas.`, [melhor.id], 3);
      }
    }
  }

  private conquistar(g: Guerra, lugar: string, novo: string): void {
    const velho = this.dono(lugar);
    const N = this.faccoes.get(novo);
    if (!N) return;
    if (velho) velho.territorio = velho.territorio.filter((x) => x !== lugar);
    N.territorio.push(lugar);
    g.conquistas.push(lugar);
    const aqui = this.s.vivos().filter((p) => p.local === lugar);
    let saque = 0;
    const lider = N.lider ? this.s.vivo(N.lider) : null;
    for (const p of aqui) {
      p.dinheiro *= 0.6;
      this.s.estresse(p, 20);
      this.s.humor(p, -20);
      if (lider && p.faccao !== novo) this.s.lembra(p.id, lider.id, `tomou ${this.s.lugarNome(lugar)}`, -30, 120);
      if (this.s.adulto(p) && !p.protegido && this.ch(0.015 * this.s.ajustes.mortalidade * this.s.ajustes.violencia)) {
        this.s.morrer(p, `no saque de ${this.s.lugarNome(lugar)}`);
        saque++;
        continue;
      }
      // quem fica muda de lado (ou não)
      if (p.faccao === velho?.id) {
        const vira = p.tracos.includes('leal') ? 0.15 : p.tracos.includes('traicoeiro') ? 0.85 : 0.5;
        if (this.ch(vira)) p.faccao = novo;
      }
    }
    this.membrosCache = null;
    this.s.say('guerra', 'conquista', `🏴 ${this.L(novo)} toma [[${this.s.lugarNome(lugar)}]]${velho ? ` de ${this.L(velho.id)}` : ''}${aqui.length ? `; a cidade é saqueada${saque ? ` e ${saque} ${saque === 1 ? 'morre' : 'morrem'} no saque` : ''}` : ''}.`,
      [...(lider ? [lider.id] : []), ...aqui.slice(0, 6).map((p) => p.id)], 3);
    this.s.emitir('conquista', [], [this.val(novo), ...(velho ? [this.val(velho.id)] : []), this.s.lugarNome(lugar)]);
    if (velho && !velho.territorio.length && velho.poder < 20) this.cair(velho, N);
  }

  private cair(f: Faccao, por: Faccao): void {
    f.viva = false;
    for (const p of this.s.vivos()) if (p.faccao === f.id) p.faccao = this.ch(0.6) ? por.id : null;
    this.membrosCache = null;
    this.s.say('guerra', 'queda', `☠ ${this.L(f.id)} deixa de existir. Os últimos leais se dispersam ou juram lealdade a ${this.L(por.id)}.`, [], 3);
    this.s.emitir('queda', [], [this.val(f.id), this.val(por.id)]);
    for (const g of this.emGuerra(f.id)) {
      g.atacantes = g.atacantes.filter((x) => x !== f.id);
      g.defensores = g.defensores.filter((x) => x !== f.id);
    }
  }

  /** Fim da guerra: os termos saem do placar. */
  paz(g: Guerra, voce: boolean, porque = ''): void {
    if (g.fim !== null) return;
    g.fim = this.s.t;
    const [a, d] = [g.atacantes[0], g.defensores[0]];
    let termos: string;
    if (g.placar > 35 && a && d) {
      const A = this.faccoes.get(a)!;
      const D = this.faccoes.get(d)!;
      const trib = Math.min(20, D.riqueza);
      D.riqueza -= trib;
      A.riqueza = clamp(A.riqueza + trib, 0, 100);
      if (g.alvo && D.territorio.includes(g.alvo) && g.placar > 55) this.conquistar(g, g.alvo, a);
      termos = `${this.L(a)} vence e cobra tributo de ${this.L(d)}`;
      g.resultado = 'vitória dos atacantes';
    } else if (g.placar < -35 && a && d) {
      const A = this.faccoes.get(a)!;
      const D = this.faccoes.get(d)!;
      const trib = Math.min(20, A.riqueza);
      A.riqueza -= trib;
      D.riqueza = clamp(D.riqueza + trib, 0, 100);
      termos = `${this.L(d)} resiste e ${this.L(a)} paga pela ousadia`;
      g.resultado = 'vitória dos defensores';
    } else {
      termos = 'ninguém ganha nada além de túmulos';
      g.resultado = 'paz branca';
    }
    if (a && d) {
      this.setPostura(a, d, -12);
      this.treguas.set(parF(a, d), this.s.t + 60);
    }
    // os soldados voltam
    const pre = `§front:${g.id}:`;
    const voltam: Pessoa[] = [];
    for (const p of this.s.vivos()) {
      if (!p.viagem?.para.startsWith(pre)) continue;
      p.viagem = { para: p.local, chega: this.s.t + 1 + Math.floor(this.rng() * 2), motivo: 'volta da guerra' };
      if ((p.xp['lutas'] ?? 0) >= 1 && this.ch(0.4)) this.s.ganhaTraco(p, 'veterano', false);
      if ((p.xp['lutas'] ?? 0) >= 3 && this.ch(0.15)) this.s.ganhaTraco(p, 'traumatizado', false);
      voltam.push(p);
    }
    const mortos = Object.values(g.baixas).reduce((s, x) => s + x, 0);
    this.s.say(voce ? 'voce' : 'guerra', 'paz', `☮ ${voce ? '✋ ' : ''}Fim da ${g.nome}${porque ? ` (${porque})` : ''}: ${termos}. ${g.batalhas} ${g.batalhas === 1 ? 'batalha' : 'batalhas'}${mortos ? `, ${mortos} ${mortos === 1 ? 'morto' : 'mortos'} entre a nossa gente` : ''}${voltam.length ? `; ${voltam.length} ${voltam.length === 1 ? 'volta' : 'voltam'} para casa` : ''}.`,
      voltam.slice(0, 8).map((p) => p.id), 3);
    if (a && d) this.s.emitir('paz', [], [this.val(a), this.val(d)]);
  }

  /** Quem ficou em casa sente: cônjuges preocupados, cartas do front. */
  private frenteDeCasa(): void {
    for (const p of this.s.vivos()) {
      const g = this.front(p);
      if (!g) continue;
      const c = this.s.conjuge(p);
      if (c && !this.front(c)) {
        this.s.estresse(c, 1.5);
        if (this.ch(0.015)) {
          const carta = this.pk(this.s.ajustes.comico > 0.3 && this.ch(0.35) ? [
            'reclamando que a comida do acampamento é pior que a da sogra',
            'pedindo meias limpas e um queijo, nessa ordem',
            'jurando que já aprendeu a dormir em pé',
          ] : [
            'dizendo que sente falta de casa todos os dias',
            'contando que perdeu um amigo e não consegue dormir',
            'prometendo voltar antes do inverno',
            'com um desenho torto da paisagem do front',
          ]);
          this.s.mexe(c.id, p.id, { afeto: 5 });
          this.s.say('guerra', 'carta', `${this.s.L(c.id)} recebe uma carta de ${this.s.L(p.id)} ${carta}.`, [c.id, p.id], 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- a vida mexe na guerra

  /** Reage a acontecimentos das pessoas: assassinatos, casamentos, duelos entre gente de facções diferentes. */
  aoEvento(nome: string, ids: string[]): void {
    if (!this.faccoes.size) return;
    const P = (i: number) => (ids[i] ? this.s.pessoa(ids[i]!) : undefined);
    const fa = P(0)?.faccao;
    const fb = P(1)?.faccao;
    if (!fa || !fb || fa === fb) return;
    const lider = (x: Pessoa | undefined, f: string) => !!x && this.faccoes.get(f)?.lider === x.id;
    const daCasa = (x: Pessoa | undefined, f: string) => {
      const l = this.faccoes.get(f)?.lider;
      return !!x && !!l && (l === x.id || x.pais.includes(l) || this.s.pessoa(l)?.pais.includes(x.id) === true || this.s.pessoa(l)?.conjuge === x.id);
    };
    switch (nome) {
      case 'assassinato': {
        const vitimaLider = lider(P(1), fb);
        this.mexePostura(fa, fb, vitimaLider ? -45 : -8);
        if (vitimaLider) {
          this.s.say('guerra', 'casus', `O assassinato de ${this.s.L(ids[1]!)} por ${this.s.L(ids[0]!)}, de ${this.L(fa)}, incendeia ${this.L(fb)}.`, [ids[0]!, ids[1]!], 3);
          if (!this.guerraEntre(fa, fb) && this.ch(0.55 * this.s.ajustes.guerra)) this.declarar(fb, fa, `o assassinato de ${P(1)!.nome}`, false);
        }
        return;
      }
      case 'casamento': {
        const nobre = daCasa(P(0), fa) || daCasa(P(1), fb);
        this.mexePostura(fa, fb, nobre ? 22 : 4);
        if (nobre) this.s.say('guerra', 'diplomacia', `O casamento de ${this.s.L(ids[0]!)} e ${this.s.L(ids[1]!)} aproxima ${this.L(fa)} e ${this.L(fb)}.`, [ids[0]!, ids[1]!], 2);
        const g = this.guerraEntre(fa, fb);
        if (g && nobre && this.ch(0.4)) this.paz(g, false, 'selada por um casamento');
        return;
      }
      case 'duelo': case 'emboscada':
        this.mexePostura(fa, fb, lider(P(1), fb) || lider(P(0), fa) ? -15 : -2);
        return;
      case 'briga': case 'roubo':
        this.mexePostura(fa, fb, -1);
        return;
      case 'amizade':
        this.mexePostura(fa, fb, daCasa(P(0), fa) && daCasa(P(1), fb) ? 8 : 0.5);
        return;
    }
  }
}
