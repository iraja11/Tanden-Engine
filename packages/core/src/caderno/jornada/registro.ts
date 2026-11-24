import { fromBytes, toBytes, type Storage } from '../../storage';
import type { SyncOptions } from '../../vault';
import { ATIVIDADE_VAZIA, type AtividadeMundo } from './progresso';
import type { Missao } from './missoes';

/*
 * Registro de atividade: o que não deixa rastro nas notas (palavras escritas por
 * dia, sprints, missões, conquistas). As notas do usuário não ganham nada.
 *
 *   .tanden/jornada/<aparelho>.json
 *
 * Cada aparelho só escreve o próprio arquivo, e a leitura funde todos: contadores
 * somam, recordes ficam com o maior, conquistas com a data mais antiga. Assim dois
 * aparelhos escrevendo offline no mesmo dia nunca perdem nada.
 */

const DIR = '.tanden/jornada/';

/** Contadores de um dia num mundo. */
export type ContadoresDia = Record<string, number>;

export interface MissoesDia {
  /** quando a lista foi sorteada: vale a mais antiga entre os aparelhos */
  em: number;
  lista: Missao[];
  feitas: string[];
}

export interface RegistroAparelho {
  v: 1;
  /** dia → mundo → contador → valor */
  dias: Record<string, Record<string, ContadoresDia>>;
  /** dias em que a meta foi cumprida (mudar a meta depois não reescreve o passado) */
  metas: Record<string, true>;
  recordes: Record<string, number>;
  conquistas: Record<string, { em: number; mundo?: string }>;
  /** dia → mundo → missões */
  missoes: Record<string, Record<string, MissoesDia>>;
  ajustes: { meta: number; em: number };
  /** baús abertos: id → quando e a carta que saiu (vale o mais antigo) */
  baus: Record<string, { em: number; carta: string; mundo?: string }>;
  /** sinais do arauto já lidos: mundo → sinal → quando */
  lidos: Record<string, Record<string, number>>;
  /** relíquias escolhidas por mundo (vale a escolha mais recente) */
  vitrine: Record<string, Vitrine>;
}

export interface Vitrine { adorno?: string; moldura?: string; titulo?: string; em: number }

export const META_PADRAO = 100;

export const registroVazio = (): RegistroAparelho => ({
  v: 1, dias: {}, metas: {}, recordes: {}, conquistas: {}, missoes: {}, ajustes: { meta: META_PADRAO, em: 0 }, baus: {}, lidos: {}, vitrine: {},
});

const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Lê um arquivo de aparelho sem confiar nele: o que não presta vira vazio. */
export function lerRegistro(texto: string): RegistroAparelho {
  try {
    const o = JSON.parse(texto) as Partial<RegistroAparelho>;
    if (!o || typeof o !== 'object') return registroVazio();
    const base = registroVazio();
    return {
      v: 1,
      dias: o.dias && typeof o.dias === 'object' ? o.dias : base.dias,
      metas: o.metas && typeof o.metas === 'object' ? o.metas : base.metas,
      recordes: o.recordes && typeof o.recordes === 'object' ? o.recordes : base.recordes,
      conquistas: o.conquistas && typeof o.conquistas === 'object' ? o.conquistas : base.conquistas,
      missoes: o.missoes && typeof o.missoes === 'object' ? o.missoes : base.missoes,
      ajustes: o.ajustes && typeof o.ajustes.meta === 'number' ? o.ajustes : base.ajustes,
      baus: objeto(o.baus) ? Object.fromEntries(Object.entries(o.baus).filter(([, b]) => objeto(b) && typeof b.carta === 'string' && typeof b.em === 'number')) as RegistroAparelho['baus'] : base.baus,
      lidos: objeto(o.lidos) ? Object.fromEntries(Object.entries(o.lidos).filter(([, l]) => objeto(l))) as RegistroAparelho['lidos'] : base.lidos,
      vitrine: objeto(o.vitrine) ? Object.fromEntries(Object.entries(o.vitrine).filter(([, v]) => objeto(v) && typeof v.em === 'number')) as RegistroAparelho['vitrine'] : base.vitrine,
    };
  } catch {
    return registroVazio();
  }
}

/** Junta os registros de todos os aparelhos. Comutativo e idempotente por aparelho. */
export function fundirRegistros(lista: RegistroAparelho[]): RegistroAparelho {
  const out = registroVazio();
  for (const r of lista) {
    for (const [dia, mundos] of Object.entries(r.dias)) {
      const d = (out.dias[dia] ??= {});
      for (const [mundo, cont] of Object.entries(mundos)) {
        const m = (d[mundo] ??= {});
        for (const [k, v] of Object.entries(cont)) m[k] = (m[k] ?? 0) + (Number(v) || 0);
      }
    }
    Object.assign(out.metas, r.metas);
    for (const [k, v] of Object.entries(r.recordes)) out.recordes[k] = Math.max(out.recordes[k] ?? 0, Number(v) || 0);
    for (const [id, c] of Object.entries(r.conquistas)) {
      const cur = out.conquistas[id];
      if (!cur || c.em < cur.em) out.conquistas[id] = c;
    }
    for (const [dia, mundos] of Object.entries(r.missoes)) {
      const d = (out.missoes[dia] ??= {});
      for (const [mundo, m] of Object.entries(mundos)) {
        const cur = d[mundo];
        if (!cur) d[mundo] = { em: m.em, lista: m.lista, feitas: [...m.feitas] };
        else {
          const base = m.em < cur.em ? m : cur;
          d[mundo] = { em: base.em, lista: base.lista, feitas: [...new Set([...cur.feitas, ...m.feitas])] };
        }
      }
    }
    if (r.ajustes.em > out.ajustes.em) out.ajustes = { ...r.ajustes };
    for (const [id, b] of Object.entries(r.baus)) {
      const cur = out.baus[id];
      if (!cur || b.em < cur.em) out.baus[id] = { ...b };
    }
    for (const [mundo, l] of Object.entries(r.lidos)) {
      const d = (out.lidos[mundo] ??= {});
      for (const [id, em] of Object.entries(l)) d[id] = Math.min(d[id] ?? Infinity, Number(em) || 0);
    }
    for (const [mundo, v] of Object.entries(r.vitrine)) {
      const cur = out.vitrine[mundo];
      if (!cur || v.em > cur.em) out.vitrine[mundo] = { ...v };
    }
  }
  return out;
}

// ------------------------------------------------------------------ datas

const dois = (n: number) => String(n).padStart(2, '0');

/** Dia local em AAAA-MM-DD. */
export const diaLocal = (d: Date): string => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;

/** Soma dias a uma data AAAA-MM-DD (em UTC, para o horário de verão não atrapalhar). */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return `${t.getUTCFullYear()}-${dois(t.getUTCMonth() + 1)}-${dois(t.getUTCDate())}`;
}

// ------------------------------------------------------------------ sequência

export const MAX_ESCUDOS = 3;
export const DIAS_POR_ESCUDO = 7;

export interface Sequencia {
  atual: number;
  melhor: number;
  /** escudos guardados: cada um protege um dia perdido */
  escudos: number;
  hojeFeito: boolean;
  /** dias que um escudo salvou */
  protegidos: string[];
}

/** Dias que contam para a sequência: meta cumprida na hora ou soma de palavras que alcança a meta atual. */
export function diasCumpridos(r: RegistroAparelho): Set<string> {
  const out = new Set(Object.keys(r.metas));
  for (const [dia, mundos] of Object.entries(r.dias)) {
    const total = Object.values(mundos).reduce((s, c) => s + (c.palavras ?? 0), 0);
    if (total >= r.ajustes.meta) out.add(dia);
  }
  return out;
}

/**
 * Sequência clássica: perdeu um dia sem escudo, volta a zero. A cada sete dias
 * seguidos ganha um escudo (no máximo três). Recalculada do zero a cada leitura,
 * então aparelhos diferentes sempre concordam.
 */
export function calcularSequencia(cumpridos: Set<string>, hoje: string): Sequencia {
  const dias = [...cumpridos].filter((d) => d <= hoje).sort();
  const out: Sequencia = { atual: 0, melhor: 0, escudos: 0, hojeFeito: cumpridos.has(hoje), protegidos: [] };
  if (!dias.length) return out;
  for (let d = dias[0]!; d <= hoje; d = somarDias(d, 1)) {
    if (cumpridos.has(d)) {
      out.atual++;
      out.melhor = Math.max(out.melhor, out.atual);
      if (out.atual % DIAS_POR_ESCUDO === 0 && out.escudos < MAX_ESCUDOS) out.escudos++;
    } else if (d !== hoje) {
      // hoje ainda pode ser cumprido: só os dias passados quebram a sequência
      if (out.atual > 0 && out.escudos > 0) {
        out.escudos--;
        out.protegidos.push(d);
      } else out.atual = 0;
    }
  }
  return out;
}

// ------------------------------------------------------------------ contagem de palavras

/** Acima disto, numa mudança só, é colagem ou importação: não conta como escrita. */
export const LIMITE_COLAGEM = 150;

/**
 * Conta só palavras novas de verdade: guarda o maior tamanho já visto de cada
 * texto na sessão, então apagar e redigitar não rende nada, e colar um bloco grande
 * também não.
 */
export class ContadorEscrita {
  private maior = new Map<string, number>();

  /** Registra o tamanho atual do texto e devolve quantas palavras novas valem. */
  registrar(path: string, palavras: number): number {
    const antes = this.maior.get(path);
    if (antes === undefined) {
      this.maior.set(path, palavras);
      return 0;
    }
    if (palavras <= antes) return 0;
    this.maior.set(path, palavras);
    const novas = palavras - antes;
    return novas > LIMITE_COLAGEM ? 0 : novas;
  }

  /** Abre um texto sem contar o que já estava escrito nele. */
  abrir(path: string, palavras: number): void {
    this.maior.set(path, Math.max(this.maior.get(path) ?? 0, palavras));
  }
}

/** Marcas de quando se escreve, para as conquistas secretas. */
export function marcasDoMomento(d: Date): string[] {
  const h = d.getHours();
  const dia = d.getDate();
  const mes = d.getMonth() + 1;
  const sem = d.getDay();
  const out: string[] = [];
  if (h >= 3 && h < 5) out.push('madrugada');
  if (h >= 5 && h < 7) out.push('alvorada');
  if (h === 12) out.push('almoco');
  if (sem === 0 || sem === 6) out.push('fimdesemana');
  if (mes === 12 && dia === 25) out.push('natal');
  if ((mes === 12 && dia === 31) || (mes === 1 && dia === 1)) out.push('virada');
  if (mes === 2 && dia === 29) out.push('bissexto');
  if (sem === 5 && dia === 13) out.push('sexta13');
  if (mes === 10 && dia === 31) out.push('halloween');
  return out;
}

// ------------------------------------------------------------------ somas

/** Soma um contador em todos os dias e mundos (ou só em um mundo). */
export function somarContador(r: RegistroAparelho, chave: string, mundo?: string): number {
  let n = 0;
  for (const mundos of Object.values(r.dias)) {
    for (const [m, c] of Object.entries(mundos)) if (!mundo || m === mundo) n += c[chave] ?? 0;
  }
  return n;
}

/** Resume a atividade de um mundo para o cálculo da experiência. */
export function atividadeDoMundo(r: RegistroAparelho, mundo: string, pontosConquistas = 0): AtividadeMundo {
  let diasAtivos = 0;
  let missoes = 0;
  for (const mundos of Object.values(r.dias)) if ((mundos[mundo]?.palavras ?? 0) > 0) diasAtivos++;
  for (const mundos of Object.values(r.missoes)) missoes += mundos[mundo]?.feitas.length ?? 0;
  return {
    ...ATIVIDADE_VAZIA,
    sprints: somarContador(r, 'sprints', mundo),
    respostas: somarContador(r, 'respostas', mundo),
    oraculo: somarContador(r, 'oraculo', mundo),
    missoes, diasAtivos, conquistas: pontosConquistas,
  };
}

// ------------------------------------------------------------------ guarda

/** Registro deste aparelho, fundido com o que os outros gravaram. */
export class JornadaStore {
  private meu: RegistroAparelho = registroVazio();
  private outros: RegistroAparelho[] = [];
  private cache: RegistroAparelho | null = null;
  private sujo = false;
  private ouvintes = new Set<() => void>();

  constructor(readonly storage: Storage, readonly deviceId: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
  }

  private get arquivo(): string {
    return `${DIR}${this.deviceId}.json`;
  }

  onChange(fn: () => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private mudou(): void {
    this.sujo = true;
    this.cache = null;
    for (const fn of this.ouvintes) fn();
  }

  /** Visão fundida de todos os aparelhos. */
  get registro(): RegistroAparelho {
    return (this.cache ??= fundirRegistros([this.meu, ...this.outros]));
  }

  somar(dia: string, mundo: string, chave: string, n = 1): void {
    if (!n) return;
    const d = (this.meu.dias[dia] ??= {});
    const m = (d[mundo] ??= {});
    m[chave] = (m[chave] ?? 0) + n;
    this.mudou();
  }

  marcarMeta(dia: string): void {
    if (this.meu.metas[dia]) return;
    this.meu.metas[dia] = true;
    this.mudou();
  }

  recorde(chave: string, valor: number): boolean {
    if (valor <= (this.registro.recordes[chave] ?? 0)) return false;
    this.meu.recordes[chave] = valor;
    this.mudou();
    return true;
  }

  conquistar(id: string, em: number, mundo?: string): void {
    if (this.registro.conquistas[id]) return;
    this.meu.conquistas[id] = mundo ? { em, mundo } : { em };
    this.mudou();
  }

  definirMissoes(dia: string, mundo: string, lista: Missao[], em: number): void {
    if (this.registro.missoes[dia]?.[mundo]) return;
    (this.meu.missoes[dia] ??= {})[mundo] = { em, lista, feitas: [] };
    this.mudou();
  }

  concluirMissao(dia: string, mundo: string, id: string): void {
    const atual = this.registro.missoes[dia]?.[mundo];
    if (!atual || atual.feitas.includes(id)) return;
    const d = (this.meu.missoes[dia] ??= {});
    const meu = (d[mundo] ??= { em: atual.em, lista: atual.lista, feitas: [] });
    meu.feitas = [...meu.feitas, id];
    this.mudou();
  }

  definirMeta(meta: number, em: number): void {
    this.meu.ajustes = { meta: Math.max(1, Math.round(meta)), em };
    this.mudou();
  }

  /** Abre um baú: a carta já vem sorteada pela semente do baú (ver `sortearCarta`). */
  abrirBau(id: string, carta: string, em: number, mundo?: string): boolean {
    if (this.registro.baus[id]) return false;
    this.meu.baus[id] = mundo ? { em, carta, mundo } : { em, carta };
    this.mudou();
    return true;
  }

  /** Marca sinais do arauto como lidos. */
  lerSinais(mundo: string, ids: string[], em: number): void {
    const ja = this.registro.lidos[mundo] ?? {};
    const novos = ids.filter((id) => ja[id] === undefined);
    if (!novos.length) return;
    const d = (this.meu.lidos[mundo] ??= {});
    for (const id of novos) d[id] = em;
    this.mudou();
  }

  /** Escolhe as relíquias à mostra num mundo. */
  definirVitrine(mundo: string, v: Omit<Vitrine, 'em'>, em: number): void {
    this.meu.vitrine[mundo] = { ...(this.registro.vitrine[mundo] ?? {}), ...v, em };
    this.mudou();
  }

  /** Grava o que mudou aqui e relê o que os outros aparelhos deixaram. */
  async sync(_opts?: SyncOptions): Promise<{ written: number }> {
    const paths = await this.storage.list(DIR);
    const outros: RegistroAparelho[] = [];
    for (const p of paths) {
      if (!p.endsWith('.json')) continue;
      const bytes = await this.storage.read(p);
      if (!bytes) continue;
      if (p === this.arquivo) {
        // primeira leitura depois de abrir: recupera o que este aparelho já tinha
        if (!this.iniciado) this.meu = fundirRegistros([lerRegistro(fromBytes(bytes)), this.meu]);
      } else outros.push(lerRegistro(fromBytes(bytes)));
    }
    this.iniciado = true;
    const antes = JSON.stringify(this.outros);
    this.outros = outros;
    this.cache = null;
    let written = 0;
    if (this.sujo) {
      await this.storage.write(this.arquivo, toBytes(JSON.stringify(this.meu)));
      this.sujo = false;
      written = 1;
    }
    if (antes !== JSON.stringify(outros)) for (const fn of this.ouvintes) fn();
    return { written };
  }

  private iniciado = false;
}
