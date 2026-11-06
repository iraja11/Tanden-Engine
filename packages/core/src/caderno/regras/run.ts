import { rollOnce, type Rng } from '../../rpg/dice';
import { findTable, rollTable, type RollTable } from '../../rpg/tables';
import type { PropValue } from '../frontmatter';
import { linkTarget } from '../markdown';
import { normalizeType, type Entity, type World } from '../mundo';
import { fold, parseExprSource, parseLoose, parseTemplate, RuleError, type Expr, type FlowKind, type Program, type RuleIssue, type RuleScheme, type Src, type Stmt } from './parse';

/*
 * Interpretador das regras do mundo.
 *
 * Os valores são número, texto, sim/não, vazio, uma ficha (Ent) ou lista.
 * Ler `p.afiliação` devolve a ficha ligada (se existir), então dá para
 * encadear: `p.afiliação.líder.nome`. Mudar um campo não grava a nota na
 * hora: fica guardado aqui (`changes()`), e quem chamou decide (a ação da
 * ficha grava; a simulação só mostra e oferece aplicar).
 */

export class Ent {
  constructor(readonly path: string) {}
}

export type Val = number | string | boolean | null | Ent | Val[];

export interface RuleHost {
  rng: Rng;
  /** ano corrente (a variável `ano`) */
  year: number;
  /** texto da crônica, com [[links]], e as fichas citadas */
  chronicle?(text: string, actors: string[]): void;
  /** aviso para a pessoa (ações da ficha) */
  notify?(text: string): void;
  /** guerra, aliança e paz entre duas fichas (a simulação usa) */
  stance?(kind: 'guerra' | 'alianca' | 'paz', a: string, b: string): void;
  /**
   * Campos que moram em outro lugar: poder/riqueza/estabilidade das facções na
   * simulação, idade/humor/traços das pessoas na simulação de vidas, ou os
   * eixos de uma relação (`relação(a, b).afeto`). `field` chega normalizado
   * (sem acento, minúsculas, `_` vira espaço). `undefined` = não é comigo.
   */
  virtual?: { get(path: string, field: string): Val | undefined; set(path: string, field: string, v: Val): boolean };
  /** funções extras da linguagem (nome sem acento → implementação); a simulação de vidas põe `casar`, `relação`... */
  fns?: Record<string, (args: Val[], rt: Rules) => Val>;
  /** nome de fichas que não estão no mundo (ex.: `rel:a>b`) */
  label?(path: string): string | undefined;
  /**
   * Com quem `a` pode interagir nesta volta (ex.: quem está no mesmo lugar).
   * `null` = todos do tipo. Serve para mundos grandes não virarem n².
   */
  candidates?(a: string, type: string): string[] | null;
  /** fração do ano de cada volta das interações (1/12 = mensal); a `chance` continua sendo por ano */
  period?: number;
  /** multiplicador da chance de interações e tramas com `tom` (fantasia, comico, adulto, serio) */
  tone?(tone: string): number;
  /** posição das fichas no mapa (em %), para distância() */
  positions?: Map<string, { x: number; y: number }>;
  /** limite de passos por chamada (laços infinitos param aqui) */
  budget?: number;
  /** tabelas de rolagem do cofre: os bancos de texto de `tabela("Nome")` */
  tables?: RollTable[];
}

type Env = Map<string, Val>;

class Stop {}

/** Sinal de controle de uma etapa de trama (seguir, falhar, ir para...). */
class Flow {
  constructor(readonly kind: FlowKind, readonly arg: Val) {}
}

/** Uma trama em andamento: em que etapa está, quando roda de novo e as variáveis dela. */
export interface SchemeRun {
  id: number;
  scheme: RuleScheme;
  stage: number;
  /** volta (tick) em que a etapa atual roda */
  next: number;
  env: Env;
  since: number;
  /** quem está na trama (caminhos das fichas) */
  who: string[];
}

const norm = (s: string) => fold(s).replace(/[_\s]+/g, ' ').trim();
const NUM = /^-?\d+(?:[.,]\d+)?$/;

export class Rules {
  readonly issues: RuleIssue[] = [];
  private over = new Map<string, Map<string, { field: string; v: Val }>>();
  private byPath: Map<string, Entity>;
  private byName = new Map<string, Entity>();
  private globals: Env = new Map();
  private steps = 0;
  private depth = 0;
  private memberCache = new Map<string, Ent[]>();
  /** tramas em andamento */
  readonly schemes: SchemeRun[] = [];
  /** voltas de interação já dadas (o relógio das tramas) */
  private clock = 0;
  private schemeSeq = 0;

  constructor(readonly program: Program, public world: World, readonly host: RuleHost) {
    this.byPath = new Map();
    this.refresh(world);
    this.globals.set('mundo', world.name);
    for (const g of program.globals) {
      this.guard(g.src, () => this.globals.set(g.name, this.eval(g.value, new Map(), null)));
    }
  }

  /** Troca o mundo visto pelas regras (nasceu ou morreu gente na simulação de vidas). */
  refresh(world: World = this.world): void {
    this.world = world;
    this.byPath = new Map(world.entities.map((e) => [e.path, e]));
    this.byName.clear();
    for (const e of world.entities) for (const n of [e.name, ...e.aliases]) this.byName.set(norm(n), e);
    this.memberCache.clear();
  }

  /** O nome de uma ficha (ou de algo que o anfitrião conhece). */
  nameOf(path: string): string {
    return this.byPath.get(path)?.name ?? this.host.label?.(path) ?? path;
  }

  // ---------------------------------------------------------------- portas de entrada

  /** Dispara um evento: roda os `quando` dele. */
  emit(event: string, args: Val[] = []): void {
    const ev = fold(event);
    if (this.depth > 16) {
      this.issues.push({ path: '', line: 0, message: `eventos em cadeia demais (parei em "${event}")` });
      return;
    }
    this.depth++;
    try {
      for (const h of this.program.handlers) {
        if (h.event !== ev) continue;
        const run = (subject: Ent | null) => {
          const env: Env = new Map();
          h.params.forEach((p, i) => env.set(p, args[i] ?? null));
          if (subject && h.type) env.set(h.type, subject);
          if (subject) env.set('isto', subject);
          if (h.where && !this.truthy(this.guard(h.src, () => this.eval(h.where!, env, subject)))) return;
          this.guard(h.src, () => this.exec(h.body, env, subject));
        };
        if (!h.type) run(null);
        else if (!args.length) for (const m of this.members(h.type)) run(m);
        else for (const a of args.flat()) if (a instanceof Ent && this.isA(a, h.type)) run(a);
      }
    } finally {
      this.depth--;
    }
  }

  /** Um ano da simulação: o evento `ano` e as interações. */
  tick(year: number): void {
    this.host.year = year;
    this.memberCache.clear();
    this.emit('ano');
    this.memberCache.clear();
    this.interact();
  }

  /**
   * Um mês da simulação de vidas: `quando mês`, `quando ano` (em janeiro) e as
   * interações, com a chance anual repartida pelos meses (`period`).
   */
  month(year: number, newYear: boolean): void {
    this.host.year = year;
    this.memberCache.clear();
    if (newYear) this.emit('ano');
    this.emit('mes');
    this.memberCache.clear();
    this.interact();
  }

  /** Ações que aparecem como botão nesta ficha. */
  actionsFor(path: string): string[] {
    const e = this.byPath.get(path);
    if (!e) return [];
    const ent = new Ent(path);
    return this.program.actions
      .filter((a) => this.isA(ent, a.type) && (!a.where || this.truthy(this.guard(a.src, () => this.eval(a.where!, this.subjectEnv(a.type, ent), ent)))))
      .map((a) => a.name);
  }

  /** Roda a ação nesta ficha. */
  runAction(name: string, path: string): boolean {
    const ent = new Ent(path);
    const a = this.program.actions.find((x) => fold(x.name) === fold(name) && this.isA(ent, x.type));
    if (!a) return false;
    this.guard(a.src, () => this.exec(a.body, this.subjectEnv(a.type, ent), ent));
    return true;
  }

  /** Campos calculados desta ficha. */
  computedFor(path: string): Array<{ name: string; value: string }> {
    const ent = new Ent(path);
    return this.program.computed
      .filter((c) => this.isA(ent, c.type))
      .map((c) => ({ name: c.name, value: this.show(this.guard(c.src, () => this.eval(c.expr, this.subjectEnv(c.type, ent), ent))) }));
  }

  /** Avalia uma condição com `isto` (e o nome do tipo) apontando para a ficha. Erros viram falso (e entram em `issues`). */
  check(expr: Expr, path: string, type = 'personagem', src: Src = { path: '', line: 0 }): boolean {
    const ent = new Ent(path);
    return this.truthy(this.guard(src, () => this.eval(expr, this.subjectEnv(type, ent), ent)));
  }

  /** Console: avalia uma expressão (ou roda linhas) e devolve o resultado em texto. */
  evalSource(code: string, subjectPath: string | null = null): string {
    const subject = subjectPath ? new Ent(subjectPath) : null;
    const env: Env = new Map();
    if (subject) env.set('isto', subject);
    this.steps = 0;
    const { expr, body } = parseLoose(code);
    if (expr) return this.show(this.eval(expr, env, subject));
    this.exec(body, env, subject);
    return 'feito';
  }

  /** Membros de um tipo ou grupo (para a tela). */
  membersOf(typeOrGroup: string): Entity[] {
    return this.members(fold(typeOrGroup)).map((e) => this.byPath.get(e.path)!);
  }

  /** O que as regras mudaram, no formato das propriedades. */
  changes(): Array<{ path: string; props: Record<string, PropValue | null> }> {
    const out: Array<{ path: string; props: Record<string, PropValue | null> }> = [];
    for (const [path, m] of this.over) {
      const props: Record<string, PropValue | null> = {};
      for (const { field, v } of m.values()) props[field] = this.toProp(v);
      out.push({ path, props });
    }
    return out;
  }

  // ---------------------------------------------------------------- interações

  private interact(): void {
    this.clock++;
    this.advanceSchemes();
    for (const it of this.program.interactions) this.fire(it, (env) => this.exec(it.body, env, null));
    for (const sc of this.program.schemes) {
      // quem já puxa esta trama não começa outra igual
      const busy = new Set(this.schemes.filter((r) => r.scheme === sc).map((r) => r.who[0]!));
      this.fire(sc, (env, a) => this.startScheme(sc, env, a), busy);
    }
  }

  /**
   * Para cada `a` do tipo: escolhe um `b` (puxado pela atração), confere o
   * `onde` e sorteia a chance (anual, repartida pelas voltas). Se der, chama `run`.
   */
  private fire(
    it: { a: { v: string; type: string }; b: { v: string; type: string } | null; where: Expr | null; attraction: Expr | null; chance: Expr | null; src: Src; tone?: string },
    run: (env: Env, a: Ent) => void, skip?: Set<string>,
  ): void {
    const rng = this.host.rng;
    this.guard(it.src, () => {
      const as = this.shuffle(this.members(it.a.type));
      const bs = it.b ? this.members(it.b.type) : [];
      const bSet = it.b && this.host.candidates ? new Set(bs.map((x) => x.path)) : null;
      for (const a of as) {
        if (skip?.has(a.path)) continue;
        const env: Env = new Map([[it.a.v, a]]);
        let partner: Ent | null = null;
        if (it.b) {
          // cada um escolhe um parceiro, puxado pela atração (peso > 0)
          const cands: Array<{ b: Ent; w: number }> = [];
          const near = this.host.candidates?.(a.path, it.b.type);
          const pool = near && bSet ? near.filter((p) => bSet.has(p)).map((p) => new Ent(p)) : bs;
          for (const b of pool) {
            if (b.path === a.path) continue;
            const e2: Env = new Map([[it.a.v, a], [it.b.v, b]]);
            if (it.where && !this.truthy(this.eval(it.where, e2, null))) continue;
            const w = it.attraction ? this.num(this.eval(it.attraction, e2, null)) : 1;
            if (w > 0) cands.push({ b, w });
          }
          if (!cands.length) continue;
          let r = rng() * cands.reduce((s, c) => s + c.w, 0);
          partner = cands[cands.length - 1]!.b;
          for (const c of cands) if ((r -= c.w) <= 0) { partner = c.b; break; }
          env.set(it.b.v, partner);
        } else if (it.where && !this.truthy(this.eval(it.where, env, null))) continue;
        else if (it.attraction && this.num(this.eval(it.attraction, env, null)) <= 0) continue;
        let p = it.chance ? this.num(this.eval(it.chance, env, null)) : 0.1;
        if (p > 1) p /= 100;
        if (it.tone && this.host.tone) p = Math.min(1, p * Math.max(0, this.host.tone(it.tone)));
        // chance por ano; numa volta mensal, a parte do mês (12 meses a 1,4% ≈ 15% no ano)
        const per = this.host.period ?? 1;
        if (per < 1 && p > 0) p = p >= 1 ? 1 : 1 - Math.pow(1 - p, per);
        if (rng() >= p) continue;
        run(env, a);
      }
    });
  }

  // ---------------------------------------------------------------- tramas

  /** Voltas que valem `months` meses (no mínimo 1). */
  private ticksFor(months: number): number {
    const per = this.host.period ?? 1;
    return Math.max(1, Math.round(months / (12 * per)));
  }

  private startScheme(sc: RuleScheme, env: Env, a: Ent): void {
    const who = [a.path, ...(sc.b ? [(env.get(sc.b.v) as Ent).path] : [])];
    const run: SchemeRun = { id: ++this.schemeSeq, scheme: sc, stage: 0, next: this.clock, env, since: this.clock, who };
    this.schemes.push(run);
    this.runStage(run);
  }

  private advanceSchemes(): void {
    for (const r of [...this.schemes]) {
      if (!this.schemes.includes(r) || r.next > this.clock) continue;
      // alguém saiu de cena (morreu, sumiu): a trama acaba sem alarde
      if (r.who.some((p) => !this.byPath.has(p))) {
        this.endScheme(r);
        continue;
      }
      this.runStage(r);
    }
  }

  private endScheme(r: SchemeRun, body?: Stmt[]): void {
    const i = this.schemes.indexOf(r);
    if (i >= 0) this.schemes.splice(i, 1);
    if (body?.length) this.guard(r.scheme.src, () => this.exec(body, r.env, null));
  }

  private runStage(r: SchemeRun): void {
    const st = r.scheme.stages[r.stage]!;
    let flow: Flow | null = null;
    let erro = false;
    this.guard(st.src, () => {
      try {
        this.exec(st.body, r.env, null);
      } catch (e) {
        if (e instanceof Flow) flow = e;
        else {
          erro = true;
          throw e;
        }
      }
    });
    if (erro) return this.endScheme(r);
    const f = flow as Flow | null;
    const months = (m: Val | null | undefined) => {
      if (m === null || m === undefined) return st.months ? this.num(this.guard(st.src, () => this.eval(st.months!, r.env, null))) : 1;
      return this.num(m);
    };
    switch (f?.kind ?? 'seguir') {
      case 'falhar':
        return this.endScheme(r, r.scheme.onFail);
      case 'concluir':
        return this.endScheme(r, r.scheme.onDone);
      case 'repetir':
        r.next = this.clock + this.ticksFor(months(f?.arg));
        return;
      case 'ir': {
        const alvo = fold(this.show(f!.arg)).trim();
        const i = r.scheme.stages.findIndex((x) => fold(x.name).trim() === alvo);
        if (i < 0) {
          this.issues.push({ path: st.src.path, line: st.src.line, message: `a trama "${r.scheme.name}" não tem a etapa "${this.show(f!.arg)}"` });
          return this.endScheme(r);
        }
        r.stage = i;
        r.next = this.clock + this.ticksFor(months(null));
        return;
      }
      case 'esperar':
      case 'seguir': {
        if (r.stage + 1 >= r.scheme.stages.length) return this.endScheme(r, r.scheme.onDone);
        r.next = this.clock + this.ticksFor(months(f?.kind === 'esperar' ? f.arg : null));
        r.stage++;
        return;
      }
    }
  }

  /** Roda um bloco solto (itens, eventos do mundo) com as variáveis dadas. */
  runBody(body: Stmt[], vars: Record<string, Val>, src: Src): void {
    if (!body.length) return;
    this.guard(src, () => this.exec(body, new Map(Object.entries(vars)), null));
  }

  /** Confere uma condição solta com as variáveis dadas (erro = não). */
  test(expr: Expr, vars: Record<string, Val>, src: Src): boolean {
    return this.truthy(this.guard(src, () => this.eval(expr, new Map(Object.entries(vars)), null)));
  }

  /** Tramas em andamento (para a tela): nome, etapa, quem e há quantas voltas. */
  activeSchemes(): Array<{ id: number; name: string; stage: string; step: number; steps: number; who: string[]; age: number }> {
    return this.schemes.map((r) => ({
      id: r.id, name: r.scheme.name, stage: r.scheme.stages[r.stage]!.name, step: r.stage + 1, steps: r.scheme.stages.length, who: [...r.who], age: this.clock - r.since,
    }));
  }

  private shuffle<T>(list: T[]): T[] {
    const l = [...list];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(this.host.rng() * (i + 1));
      [l[i], l[j]] = [l[j]!, l[i]!];
    }
    return l;
  }

  // ---------------------------------------------------------------- tipos e grupos

  private subjectEnv(type: string, ent: Ent): Env {
    return new Map<string, Val>([[type, ent], ['isto', ent]]);
  }

  private members(typeOrGroup: string): Ent[] {
    const cached = this.memberCache.get(typeOrGroup);
    if (cached) return cached;
    const g = this.program.groups.find((x) => x.name === typeOrGroup);
    let out: Ent[];
    if (g) {
      this.memberCache.set(typeOrGroup, []); // grupo que cita a si mesmo não trava
      out = this.members(g.from).filter((m) => !g.where || this.truthy(this.guard(g.src, () => this.eval(g.where!, this.subjectEnv(g.from, m), m))));
    } else {
      const t = normalizeType(typeOrGroup);
      out = this.world.entities.filter((e) => fold(e.type) === t || fold(e.type) === typeOrGroup || typeOrGroup === 'ficha' || typeOrGroup === 'qualquer').map((e) => new Ent(e.path));
    }
    this.memberCache.set(typeOrGroup, out);
    return out;
  }

  private isKind(name: string): boolean {
    return this.program.groups.some((g) => g.name === name) || this.world.entities.some((e) => fold(e.type) === normalizeType(name)) ||
      this.program.types.some((t) => t.id === name);
  }

  private isA(ent: Ent, typeOrGroup: string): boolean {
    const e = this.byPath.get(ent.path);
    if (!e) return false;
    if (typeOrGroup === 'ficha' || typeOrGroup === 'qualquer') return true;
    if (fold(e.type) === normalizeType(typeOrGroup) || fold(e.type) === typeOrGroup) return true;
    if (this.program.groups.some((g) => g.name === typeOrGroup)) return this.members(typeOrGroup).some((m) => m.path === ent.path);
    return false;
  }

  // ---------------------------------------------------------------- campos

  private field(ent: Ent, name: string): Val {
    const k = norm(name);
    const v = this.host.virtual?.get(ent.path, k);
    if (v !== undefined) return v;
    const e = this.byPath.get(ent.path);
    if (!e) return null;
    if (k === 'nome') return e.name;
    if (k === 'tipo') return e.type;
    if (k === 'caminho') return e.path;
    const o = this.over.get(ent.path)?.get(k);
    if (o) return o.v;
    const key = Object.keys(e.props).find((p) => norm(p) === k);
    if (key === undefined) return null;
    const raw = e.props[key]!;
    const conv = (s: string): Val => {
      const t = s.trim();
      const m = /^\[\[([^\]]+)\]\]$/.exec(t);
      if (m) {
        const target = linkTarget(m[1]!);
        const r = e.relations.find((x) => x.target === target);
        const to = r?.to ?? this.byName.get(norm(target.split('/').pop()!))?.path;
        return to && this.byPath.has(to) ? new Ent(to) : target;
      }
      if (NUM.test(t)) return Number(t.replace(',', '.'));
      const f = fold(t);
      if (f === 'true' || f === 'verdadeiro' || f === 'sim') return true;
      if (f === 'false' || f === 'falso' || f === 'nao') return false;
      return t;
    };
    return Array.isArray(raw) ? raw.map(conv) : raw.trim() === '' ? null : conv(raw);
  }

  private setField(ent: Ent, name: string, v: Val): void {
    const k = norm(name);
    if (['nome', 'tipo', 'caminho'].includes(k)) throw new RuleError(`"${name}" não muda por regra`);
    if (this.host.virtual?.set(ent.path, k, v)) {
      this.memberCache.clear();
      return;
    }
    const e = this.byPath.get(ent.path);
    const shown = (e && Object.keys(e.props).find((p) => norm(p) === k)) ?? name.replace(/_/g, ' ');
    let m = this.over.get(ent.path);
    if (!m) this.over.set(ent.path, (m = new Map()));
    m.set(k, { field: shown, v });
    this.memberCache.clear();
  }

  private toProp(v: Val): PropValue | null {
    if (v === null) return null;
    if (v instanceof Ent) return `[[${this.nameOf(v.path)}]]`;
    if (Array.isArray(v)) return v.map((x) => (this.toProp(x) as string | null) ?? '').filter(Boolean) as string[];
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return v;
  }

  // ---------------------------------------------------------------- execução

  private guard<T>(src: Src, fn: () => T): T | null {
    this.steps = 0;
    try {
      return fn();
    } catch (e) {
      if (e instanceof Stop) return null;
      if (e instanceof Flow) {
        this.issues.push({ path: src.path, line: src.line, message: `"${e.kind}" só vale dentro de uma etapa de trama` });
        return null;
      }
      const s = e instanceof RuleError && e.src ? e.src : src;
      this.issues.push({ path: s.path, line: s.line, message: e instanceof RuleError ? e.message : String(e) });
      if (this.issues.length > 200) this.issues.splice(0, 100);
      return null;
    }
  }

  private tickStep(): void {
    if (++this.steps > (this.host.budget ?? 200_000)) throw new RuleError('passou do limite de passos (laço sem fim ou mundo grande demais)');
  }

  private exec(body: Stmt[], env: Env, subject: Ent | null): void {
    for (const s of body) {
      this.tickStep();
      try {
        this.stmt(s, env, subject);
      } catch (e) {
        if (e instanceof RuleError && !e.src) throw new RuleError(e.message, s.src);
        throw e;
      }
    }
  }

  private stmt(s: Stmt, env: Env, subject: Ent | null): void {
    switch (s.t) {
      case 'let':
        env.set(s.name, this.eval(s.value, env, subject));
        return;
      case 'set':
        return this.assign(s.target, s.op, this.eval(s.value, env, subject), env, subject);
      case 'if':
        for (const b of s.branches) {
          if (b.cond === null || this.truthy(this.eval(b.cond, env, subject))) {
            this.exec(b.body, env, subject);
            return;
          }
        }
        return;
      case 'for': {
        const list = this.listOf(s.from, env, subject);
        try {
          for (const item of list) {
            const inner = new Map(env);
            inner.set(s.v, item);
            if (s.where && !this.truthy(this.eval(s.where, inner, subject))) continue;
            this.exec(s.body, inner, subject);
            for (const k of env.keys()) env.set(k, inner.get(k) ?? null);
          }
        } catch (e) {
          if (!(e instanceof Stop)) throw e;
        }
        return;
      }
      case 'stop':
        throw new Stop();
      case 'say': {
        const v = s.value;
        const actors: string[] = [];
        const text = this.render(v, env, subject, s.kind === 'cronica', actors);
        if (s.kind === 'cronica') this.host.chronicle?.(text, actors);
        else this.host.notify?.(text);
        return;
      }
      case 'emit':
        return this.emit(s.name, s.args.map((a) => this.eval(a, env, subject)));
      case 'link': {
        const a = this.ent(this.eval(s.a, env, subject), 'liga');
        const label = String(this.show(this.eval(s.label, env, subject)));
        const b = this.eval(s.b, env, subject);
        const cur = this.field(a, label);
        const list: Val[] = cur === null ? [] : Array.isArray(cur) ? [...cur] : [cur];
        const has = (x: Val) => this.eq(x, b);
        if (s.on && !list.some(has)) list.push(b);
        const next = s.on ? list : list.filter((x) => !has(x));
        this.setField(a, label, next.length === 0 ? null : next.length === 1 ? next[0]! : next);
        return;
      }
      case 'stance': {
        const a = this.ent(this.eval(s.a, env, subject), s.kind);
        const b = this.ent(this.eval(s.b, env, subject), s.kind);
        this.host.stance?.(s.kind, a.path, b.path);
        return;
      }
      case 'convoke': {
        const name = this.show(this.eval(s.action, env, subject));
        const targets = this.eval(s.target, env, subject);
        for (const t of Array.isArray(targets) ? targets : [targets]) {
          if (!(t instanceof Ent)) continue;
          const a = this.program.actions.find((x) => fold(x.name) === fold(name) && this.isA(t, x.type));
          if (!a) throw new RuleError(`não há ação "${name}" para ${this.show(t)}`);
          this.depth++;
          try {
            if (this.depth > 16) throw new RuleError('ações convocadas em cadeia demais');
            this.exec(a.body, this.subjectEnv(a.type, t), t);
          } finally {
            this.depth--;
          }
        }
        return;
      }
      case 'expr':
        this.eval(s.e, env, subject);
        return;
      case 'flow': {
        // "falhar "{a} desiste."": a frase entra na crônica antes de encerrar
        if ((s.kind === 'falhar' || s.kind === 'concluir') && s.arg) {
          this.stmt({ src: s.src, t: 'say', kind: 'cronica', value: s.arg }, env, subject);
          throw new Flow(s.kind, null);
        }
        throw new Flow(s.kind, s.arg ? this.eval(s.arg, env, subject) : null);
      }
    }
  }

  private assign(target: Expr, op: string, value: Val, env: Env, subject: Ent | null): void {
    const apply = (cur: Val): Val => {
      switch (op) {
        case '+=': return this.add(cur, value);
        case '-=': return Array.isArray(cur) ? cur.filter((x) => !this.eq(x, value)) : this.num(cur) - this.num(value);
        case '*=': return this.num(cur) * this.num(value);
        case '/=': return this.num(value) === 0 ? 0 : this.num(cur) / this.num(value);
        default: return value;
      }
    };
    if (target.t === 'id') {
      if (env.has(target.name)) return void env.set(target.name, apply(env.get(target.name)!));
      if (subject) return this.setField(subject, target.raw, apply(this.field(subject, target.raw)));
      return void env.set(target.name, apply(null));
    }
    const tg = target as Extract<Expr, { t: 'get' } | { t: 'idx' }>;
    const obj = this.eval(tg.obj, env, subject);
    const name = tg.t === 'get' ? tg.name : this.show(this.eval(tg.index, env, subject));
    const each = Array.isArray(obj) ? obj : [obj];
    for (const o of each) {
      if (!(o instanceof Ent)) throw new RuleError(`só fichas têm campos (tentei mudar "${name}" de ${this.show(o)})`);
      this.setField(o, name, apply(this.field(o, name)));
    }
  }

  // ---------------------------------------------------------------- expressões

  private eval(e: Expr, env: Env, subject: Ent | null): Val {
    this.tickStep();
    switch (e.t) {
      case 'lit':
        return e.v;
      case 'tpl':
        return this.render(e, env, subject, false);
      case 'list':
        return e.items.map((x) => this.eval(x, env, subject));
      case 'id':
        return this.lookup(e.name, e.raw, env, subject);
      case 'query': {
        const out: Val[] = [];
        for (const item of this.listOf(e.from, env, subject)) {
          const inner = new Map(env);
          inner.set(e.v, item);
          if (!e.where || this.truthy(this.eval(e.where, inner, subject))) out.push(item);
        }
        return out;
      }
      case 'get': {
        const o = this.eval(e.obj, env, subject);
        return this.getOf(o, e.name);
      }
      case 'idx': {
        const o = this.eval(e.obj, env, subject);
        const i = this.eval(e.index, env, subject);
        if (typeof i === 'number' && Array.isArray(o)) return o[i < 0 ? o.length + i : i] ?? null;
        return this.getOf(o, this.show(i));
      }
      case 'un': {
        const a = this.eval(e.a, env, subject);
        return e.op === '-' ? -this.num(a) : !this.truthy(a);
      }
      case 'is': {
        const a = this.eval(e.a, env, subject);
        const yes = a instanceof Ent && this.isA(a, e.type);
        return e.neg ? !yes : yes;
      }
      case 'bin':
        return this.bin(e, env, subject);
      case 'call':
        return this.call(e, env, subject);
    }
  }

  private getOf(o: Val, name: string): Val {
    if (o === null) return null;
    if (o instanceof Ent) return this.field(o, name);
    if (Array.isArray(o)) {
      const k = norm(name);
      if (k === 'tamanho' || k === 'quantidade' || k === 'total') return o.length;
      // campo de uma lista: o campo de cada item, achatado
      return o.flatMap((x) => {
        const v = this.getOf(x, name);
        return v === null ? [] : Array.isArray(v) ? v : [v];
      });
    }
    if (typeof o === 'string' && norm(name) === 'tamanho') return o.length;
    return null;
  }

  private lookup(name: string, raw: string, env: Env, subject: Ent | null): Val {
    if (env.has(name)) return env.get(name)!;
    if (name === 'ano') return this.host.year;
    if (this.globals.has(name)) return this.globals.get(name)!;
    if (subject) {
      const v = this.field(subject, raw);
      if (v !== null) return v;
    }
    if (this.isKind(name)) return this.members(name);
    const byName = this.byName.get(norm(raw));
    if (byName) return new Ent(byName.path);
    return null;
  }

  private bin(e: Extract<Expr, { t: 'bin' }>, env: Env, subject: Ent | null): Val {
    if (e.op === 'e') return this.truthy(this.eval(e.a, env, subject)) && this.truthy(this.eval(e.b, env, subject));
    if (e.op === 'ou') {
      const a = this.eval(e.a, env, subject);
      return this.truthy(a) ? a : this.eval(e.b, env, subject);
    }
    const a = this.eval(e.a, env, subject);
    const b = this.eval(e.b, env, subject);
    switch (e.op) {
      case '==': return this.eq(a, b);
      case '!=': return !this.eq(a, b);
      case '<': return this.cmp(a, b) < 0;
      case '<=': return this.cmp(a, b) <= 0;
      case '>': return this.cmp(a, b) > 0;
      case '>=': return this.cmp(a, b) >= 0;
      case 'tem': return this.has(a, b);
      case '!tem': return !this.has(a, b);
      case '+': return this.add(a, b);
      case '-': return this.num(a) - this.num(b);
      case '*': return this.num(a) * this.num(b);
      case '/': return this.num(b) === 0 ? 0 : this.num(a) / this.num(b);
      case 'mod': return this.num(b) === 0 ? 0 : this.num(a) % this.num(b);
    }
    throw new RuleError(`operador desconhecido "${e.op}"`);
  }

  private call(e: Extract<Expr, { t: 'call' }>, env: Env, subject: Ent | null): Val {
    const args = () => e.args.map((x) => this.eval(x, env, subject));
    const rng = this.host.rng;
    const nums = () => args().flat().map((x) => this.num(x));
    switch (e.name) {
      case 'chance': {
        let p = this.num(args()[0] ?? 0);
        if (p > 1) p /= 100;
        return rng() < p;
      }
      case 'dado':
      case 'rolar':
        try {
          return rollOnce(this.show(args()[0] ?? '1d20'), { rng }).total;
        } catch (err) {
          throw new RuleError(`dado inválido: ${String((err as Error).message ?? err)}`);
        }
      case 'aleatorio':
      case 'sortear':
      case 'sorteio':
      case 'um': {
        const a = args();
        const list = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
        return list.length ? list[Math.floor(rng() * list.length)]! : null;
      }
      case 'entre': {
        const [lo, hi] = nums();
        return Math.floor((lo ?? 0) + rng() * ((hi ?? 0) - (lo ?? 0) + 1));
      }
      case 'min': case 'minimo': { const n = nums(); return n.length ? Math.min(...n) : null; }
      case 'max': case 'maximo': { const n = nums(); return n.length ? Math.max(...n) : null; }
      case 'limitar': { const [x, lo, hi] = nums(); return Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, x ?? 0)); }
      case 'arred':
      case 'arredondar': { const [x, c] = nums(); const f = 10 ** (c ?? 0); return Math.round((x ?? 0) * f) / f; }
      case 'abs': return Math.abs(nums()[0] ?? 0);
      case 'piso': return Math.floor(nums()[0] ?? 0);
      case 'teto': return Math.ceil(nums()[0] ?? 0);
      case 'contar':
      case 'tamanho':
      case 'quantos': {
        const a = args();
        return a.reduce<number>((s, x) => s + (Array.isArray(x) ? x.length : x === null ? 0 : 1), 0);
      }
      case 'soma':
      case 'media': {
        const [list = null, f] = args();
        const items = Array.isArray(list) ? list : [list];
        const vs = items.map((x) => this.num(f !== undefined ? this.getOf(x, this.show(f)) : x));
        const total = vs.reduce((s, x) => s + x, 0);
        return e.name === 'soma' ? total : vs.length ? total / vs.length : 0;
      }
      case 'maior':
      case 'menor': {
        // maior(lista, "campo") → a ficha com o maior valor no campo
        const [list = null, f] = args();
        const items = Array.isArray(list) ? list : [list];
        let best: Val = null;
        let bv = 0;
        for (const x of items) {
          const v = this.num(f !== undefined ? this.getOf(x, this.show(f)) : x);
          if (best === null || (e.name === 'maior' ? v > bv : v < bv)) { best = x; bv = v; }
        }
        return best;
      }
      case 'trama':
      case 'emtrama':
      case 'tramando': {
        // trama(p) / trama(p, "Sedução lenta"): p está numa trama em andamento?
        const [who = null, name] = args();
        const p = who instanceof Ent ? who.path : null;
        const n = name !== undefined && name !== null ? fold(this.show(name)).trim() : null;
        return !!p && this.schemes.some((r) => r.who.includes(p) && (!n || fold(r.scheme.name).trim() === n));
      }
      case '__escolha':
      case '__genero':
        return this.render(e, env, subject, false);
      case 'primeiro': { const l = args()[0]; return Array.isArray(l) ? l[0] ?? null : l ?? null; }
      case 'ultimo': { const l = args()[0]; return Array.isArray(l) ? l[l.length - 1] ?? null : l ?? null; }
      case 'todos':
      case 'todas': {
        const a = e.args[0];
        if (a?.t === 'id' && this.isKind(a.name)) return this.members(a.name);
        return this.members(fold(this.show(args()[0] ?? '')));
      }
      case 'quem': {
        // quem("afiliação", facção) → fichas que apontam para ela por esse campo
        const [label = null, target = null] = args();
        const t = target instanceof Ent ? target : null;
        if (!t) return [];
        const k = norm(this.show(label));
        return this.world.entities
          .filter((x) => {
            const v = this.field(new Ent(x.path), k);
            return (Array.isArray(v) ? v : [v]).some((y) => y instanceof Ent && y.path === t.path);
          })
          .map((x) => new Ent(x.path));
      }
      case 'ficha': {
        const n = this.show(args()[0] ?? '');
        const x = this.byName.get(norm(n));
        return x ? new Ent(x.path) : null;
      }
      case 'distancia': {
        const [a = null, b = null] = args();
        const pa = a instanceof Ent ? this.host.positions?.get(a.path) : undefined;
        const pb = b instanceof Ent ? this.host.positions?.get(b.path) : undefined;
        return pa && pb ? Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y) * 10) / 10 : null;
      }
      case 'tabela':
      case 'banco': {
        // texto sorteado de uma tabela ou lista das notas, com {a.nome} preenchido
        const ref = this.show(args()[0] ?? '');
        const t = findTable(this.host.tables ?? [], ref);
        if (!t) throw new RuleError(`não achei a tabela "${ref}" (um título com uma tabela ou lista embaixo, em qualquer nota)`);
        const roll = rollTable(t, { rng, tables: this.host.tables });
        return this.fill(roll.text, env, subject);
      }
      case 'existe': return args()[0] !== null;
      case 'nome': { const x = args()[0]; return x instanceof Ent ? this.nameOf(x.path) : this.show(x ?? null); }
      case 'texto': return this.show(args()[0] ?? null);
      case 'numero': return this.num(args()[0] ?? null);
      case 'lista': return args().flat();
    }
    const fn = this.host.fns?.[e.name];
    if (fn) return fn(args(), this);
    throw new RuleError(`não conheço a função "${e.raw}"`);
  }

  // ---------------------------------------------------------------- valores

  /** Preenche os {a.nome} de um texto com as variáveis da regra; o que não der, fica como está. */
  private fill(text: string, env: Env, subject: Ent | null): string {
    try {
      return this.render(parseTemplate(text, { path: 'tabela', line: 0 }, true), env, subject, true);
    } catch {
      return text;
    }
  }

  /** Texto de um modelo: valores, opções sorteadas (`{a|b}`) e formas por gênero (`{p:o/a}`). */
  private render(e: Expr, env: Env, subject: Ent | null, links: boolean, actors?: string[]): string {
    if (e.t === 'tpl') return e.parts.map((p) => (typeof p === 'string' ? p : this.render(p, env, subject, links, actors))).join('');
    if (e.t === 'call' && e.name === '__escolha') {
      const o = e.args[Math.floor(this.host.rng() * e.args.length)]!;
      return this.render(o, env, subject, links, actors);
    }
    if (e.t === 'call' && e.name === '__genero') {
      const forms = e.args.slice(1).map((x) => (x.t === 'lit' ? String(x.v) : ''));
      const g = this.genderOf(this.eval(e.args[0]!, env, subject));
      return (g === 'f' ? forms[1] : g === 'n' ? forms[2] ?? forms[0] : forms[0]) ?? forms[0] ?? '';
    }
    if (e.t === 'lit' && typeof e.v === 'string') return e.v;
    return this.show(this.eval(e, env, subject), links, actors);
  }

  /** Gênero de uma ficha para a gramática: f, m ou n (neutro). */
  private genderOf(v: Val): 'f' | 'm' | 'n' {
    if (Array.isArray(v)) return v.length && v.every((x) => this.genderOf(x) === 'f') ? 'f' : 'm';
    if (!(v instanceof Ent)) return 'm';
    for (const k of ['genero', 'sexo']) {
      const x = this.field(v, k);
      if (x === null || x === undefined || x === '') continue;
      const t = fold(String(x instanceof Ent ? this.nameOf(x.path) : x)).trim();
      if (/^(f|fem|mulher|femea|menina)/.test(t)) return 'f';
      if (/^(n|nao.?bin|neutr|enby)/.test(t)) return 'n';
      return 'm';
    }
    return 'm';
  }

  private listOf(e: Expr, env: Env, subject: Ent | null): Val[] {
    if (e.t === 'id' && !env.has(e.name) && this.isKind(e.name)) return this.members(e.name);
    const v = this.eval(e, env, subject);
    return Array.isArray(v) ? v : v === null ? [] : [v];
  }

  private ent(v: Val, what: string): Ent {
    if (v instanceof Ent) return v;
    if (typeof v === 'string') {
      const e = this.byName.get(norm(v));
      if (e) return new Ent(e.path);
    }
    throw new RuleError(`"${what}" precisa de uma ficha, e veio ${this.show(v)}`);
  }

  truthy(v: Val): boolean {
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== false && v !== 0 && v !== '';
  }

  private num(v: Val): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const m = /-?\d+(?:[.,]\d+)?/.exec(v);
      return m ? Number(m[0].replace(',', '.')) : 0;
    }
    if (Array.isArray(v)) return v.length;
    return 0;
  }

  private eq(a: Val, b: Val): boolean {
    if (a instanceof Ent || b instanceof Ent) {
      if (a instanceof Ent && b instanceof Ent) return a.path === b.path;
      const [x, s] = a instanceof Ent ? [a, b] : [b as Ent, a];
      return typeof s === 'string' && norm(this.nameOf(x.path)) === norm(s);
    }
    if (typeof a === 'string' && typeof b === 'string') return norm(a) === norm(b);
    if (typeof a === 'number' || typeof b === 'number') return a !== null && b !== null && this.num(a) === this.num(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => this.eq(x, b[i]!));
    return a === b;
  }

  private cmp(a: Val, b: Val): number {
    if (typeof a === 'string' && typeof b === 'string' && !NUM.test(a) && !NUM.test(b)) return a.localeCompare(b, 'pt-BR');
    return this.num(a) - this.num(b);
  }

  private has(a: Val, b: Val): boolean {
    if (Array.isArray(a)) return a.some((x) => this.eq(x, b));
    if (typeof a === 'string') return norm(a).includes(norm(this.show(b)));
    if (a instanceof Ent) return this.eq(a, b);
    return false;
  }

  private add(a: Val, b: Val): Val {
    if (Array.isArray(a)) return Array.isArray(b) ? [...a, ...b] : [...a, b];
    if (typeof a === 'string' && !NUM.test(a) || typeof b === 'string' && !NUM.test(b as string) || a instanceof Ent || b instanceof Ent) {
      return `${this.show(a)}${this.show(b)}`;
    }
    return this.num(a) + this.num(b);
  }

  /** Valor em texto. Na crônica, fichas viram [[links]] (e entram em `actors`). */
  show(v: Val | undefined, links = false, actors?: string[]): string {
    if (v === null || v === undefined) return '—';
    if (v instanceof Ent) {
      actors?.push(v.path);
      const n = this.nameOf(v.path);
      return links ? `[[${n}]]` : n;
    }
    if (Array.isArray(v)) return v.map((x) => this.show(x, links, actors)).join(', ');
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
    if (typeof v === 'boolean') return v ? 'sim' : 'não';
    return v;
  }
}
