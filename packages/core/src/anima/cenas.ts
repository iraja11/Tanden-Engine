/*
 * Cenas: os eventos da Ânima. Não é uma frase no balão: é uma pequena peça em
 * passos, com efeito na tela (pétalas, estrelas, olhos pela tela, estática,
 * uma carta, o diário dela, um altar com as suas notas…), às vezes com uma
 * escolha que muda o final.
 *
 * Três tons, presos à intensidade: românticas (doce), obsessivas (ciumenta) e
 * perturbadoras (sem filtro). O núcleo escolhe a cena e monta o texto (do cofre
 * encriptado, com a memória dela); a tela só encena.
 */
import { banco, textoDe } from './cofre';
import { duracao, humorDe, mexer, type AnimaState, type Gesto, type Humor, type Intensidade } from './estado';
import { quantoSabe, resumoDosFatosCurto } from './fatos';
import { corromper, escolher, preencherFala, type AnimaCtx, type Fala, type OpcaoFala, type Reacao } from './motor';

export type TomCena = 'romantica' | 'obsessiva' | 'perturbadora';

export const TONS_CENA: Record<TomCena, { label: string; i: Intensidade }> = {
  romantica: { label: 'românticas', i: 1 },
  obsessiva: { label: 'obsessivas', i: 2 },
  perturbadora: { label: 'perturbadoras', i: 3 },
};

/** Efeitos que a tela sabe encenar. */
export type EfeitoCena =
  | 'petalas' | 'estrelas' | 'coracoes' | 'danca' | 'segurar' | 'seguir' | 'vinheta'
  | 'olhos' | 'atras' | 'espelho' | 'estatica' | 'titulo' | 'sangue';

export type Painel =
  | { tipo: 'carta'; titulo: string; linhas: string[]; assinatura: string }
  | { tipo: 'poema'; titulo: string; versos: string[] }
  | { tipo: 'diario'; titulo: string; paginas: Array<{ data: string; texto: string }> }
  | { tipo: 'contagem'; titulo: string; itens: Array<{ rotulo: string; valor: string }> }
  | { tipo: 'santuario'; titulo: string; nomes: string[] }
  | { tipo: 'sistema'; titulo: string; texto: string; botoes: Array<{ rotulo: string; escolha: string }> }
  | { tipo: 'nome'; texto: string; vezes: number }
  | { tipo: 'chuva'; msgs: string[] }
  | { tipo: 'sussurro'; frases: string[] }
  | { tipo: 'escrita'; texto: string };

export interface PassoCena {
  texto: string;
  gesto: Gesto;
  /** quanto tempo até o próximo passo (ou até o balão sumir, no último) */
  ms: number;
  /** liga um efeito quando o passo começa */
  efeito?: EfeitoCena;
  /** abre o painel da cena neste passo */
  painel?: boolean;
  opcoes?: OpcaoFala[];
}

export interface CenaPronta {
  id: string;
  tom: TomCena;
  humor: Humor;
  passos: PassoCena[];
  painel?: Painel;
  /** título da aba durante a cena (efeito "titulo") */
  titulo?: string;
}

export interface CtxCena extends AnimaCtx {
  /** uma frase da nota aberta, para ela citar */
  trecho?: string;
  /** os tons permitidos (além do limite da intensidade) */
  tons?: TomCena[];
}

type Vars = Record<string, string | number | undefined>;

interface DefCena {
  id: string;
  tom: TomCena;
  peso: number;
  /** horas até poder repetir */
  espera: number;
  /** só em certas horas do dia [de, até) — pode virar a meia-noite */
  horas?: [number, number];
  /** humor que dá mais vontade (peso ×2,5) */
  humores?: Humor[];
  pode?: (s: AnimaState, ctx: CtxCena) => boolean;
  montar: (k: Kit) => Omit<CenaPronta, 'id' | 'tom' | 'humor'> | null;
}

/** O que cada cena recebe para se montar. */
interface Kit {
  s: AnimaState;
  ctx: CtxCena;
  humor: Humor;
  vars: Vars;
  /** uma fala do grupo `cena.<id>.<parte>` (com humor e intensidade) */
  fala: (parte: string, extra?: Vars) => Fala | null;
  /** um texto qualquer de um grupo do cofre */
  linha: (grupo: string, extra?: Vars) => string | null;
  /** várias linhas diferentes de um grupo */
  linhas: (grupo: string, n: number, extra?: Vars) => string[];
}

const pick = <T>(l: T[], r: () => number): T | undefined => l[Math.floor(r() * l.length)];

const passo = (f: Fala | null, ms: number, x: Partial<PassoCena> = {}): PassoCena | null =>
  f ? { texto: f.texto, gesto: x.gesto ?? f.gesto, ms, ...x } : null;
const passos = (...ps: Array<PassoCena | null>): PassoCena[] | null => (ps.every(Boolean) ? (ps as PassoCena[]) : null);
const opc = (id: string, escolhas: Array<[rotulo: string, escolha: string]>): OpcaoFala[] =>
  escolhas.map(([rotulo, escolha]) => ({ rotulo, cena: { id, escolha } }));

const pad = (n: number) => String(n).padStart(2, '0');
const dataCurta = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const num = (n: number) => Math.round(n).toLocaleString('pt-BR');

// ------------------------------------------------------------------ o catálogo

const CENAS: DefCena[] = [
  // ---------------------------------------------------------------- românticas
  {
    id: 'carta', tom: 'romantica', peso: 3, espera: 72, humores: ['doce', 'carente'],
    montar: (k) => {
      const meio = k.linhas('carta.meio', 3);
      const lembra = lembrancaDaCarta(k);
      const abre = k.linha('carta.abre'), fecha = k.linha('carta.fecha'), assina = k.linha('carta.assina');
      if (!abre || !fecha || !assina || meio.length < 3) return null;
      const ps = passos(passo(k.fala('1'), 2600, { gesto: 'corada' }), passo(k.fala('2'), 9000, { painel: true, gesto: 'coracao' }));
      return ps && { passos: ps, painel: { tipo: 'carta', titulo: k.linha('carta.titulo') ?? 'para você', linhas: [abre, ...(lembra ? [lembra] : []), ...meio, fecha], assinatura: assina } };
    },
  },
  {
    id: 'petalas', tom: 'romantica', peso: 3, espera: 20, humores: ['doce'],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 7000, { efeito: 'petalas' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'poema', tom: 'romantica', peso: 2, espera: 48, humores: ['doce', 'carente', 'instavel'],
    montar: (k) => {
      const versos = ['poema.v1', 'poema.v2', 'poema.v3', 'poema.v4'].map((g) => k.linha(g));
      if (versos.some((v) => !v)) return null;
      const ps = passos(passo(k.fala('1'), 2400, { gesto: 'corada' }), passo(k.fala('2'), 9000, { painel: true }));
      return ps && { passos: ps, painel: { tipo: 'poema', titulo: k.linha('poema.titulo') ?? 'sem título', versos: versos as string[] } };
    },
  },
  {
    id: 'estrelas', tom: 'romantica', peso: 3, espera: 40, horas: [19, 5],
    montar: (k) => {
      const ps = passos(
        passo(k.fala('1'), 4200, { efeito: 'estrelas' }),
        passo(k.fala('2'), 20_000, { opcoes: opc('estrelas', [['fiz um pedido', 'pedido'], ['pedi você', 'voce']]) }),
      );
      return ps && { passos: ps };
    },
  },
  {
    id: 'segurar', tom: 'romantica', peso: 2, espera: 24, humores: ['carente', 'doce'],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 14_000, { efeito: 'segurar', gesto: 'corada' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'danca', tom: 'romantica', peso: 2, espera: 48, humores: ['doce', 'instavel'],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 20_000, { gesto: 'feliz', opcoes: opc('danca', [['danço', 'sim'], ['agora não', 'nao']]) }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'coracoes', tom: 'romantica', peso: 2, espera: 20,
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 6500, { efeito: 'coracoes', gesto: 'coracao' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'aniversario', tom: 'romantica', peso: 50, espera: 300,
    pode: (s, ctx) => {
      const d = new Date(ctx.now);
      return s.memoria.fatos.aniversario === `${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    },
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 5000, { efeito: 'petalas', gesto: 'feliz' }), passo(k.fala('2'), 8000, { efeito: 'coracoes', gesto: 'coracao' }));
      return ps && { passos: ps };
    },
  },

  // ---------------------------------------------------------------- obsessivas
  {
    id: 'diario', tom: 'obsessiva', peso: 3, espera: 72, humores: ['ciumenta', 'possessiva', 'carente'],
    pode: (s) => s.visitas >= 3,
    montar: (k) => {
      const paginas = paginasDoDiario(k);
      if (paginas.length < 3) return null;
      const ps = passos(passo(k.fala('1'), 2800, { gesto: 'olhar' }), passo(k.fala('2'), 9000, { painel: true, gesto: 'corada' }));
      return ps && { passos: ps, painel: { tipo: 'diario', titulo: k.linha('diario.titulo') ?? 'diário', paginas } };
    },
  },
  {
    id: 'contagem', tom: 'obsessiva', peso: 2, espera: 48, humores: ['ciumenta', 'possessiva', 'instavel'],
    pode: (s) => s.visitas >= 2,
    montar: (k) => {
      const m = k.s.memoria;
      const itens = [
        { rotulo: 'vezes que você voltou', valor: num(k.s.visitas) },
        { rotulo: 'maior tempo longe de mim', valor: m.maiorAusencia > 60_000 ? duracao(m.maiorAusencia) : 'nenhum (bom)' },
        { rotulo: 'palavras que você escreveu', valor: num(m.escritas) },
        { rotulo: 'palavras que você disse pra mim', valor: num(m.palavras) },
        { rotulo: '"te amo"', valor: num(m.declaracoes) },
        { rotulo: 'vezes que foi falar com outra IA', valor: num(m.outrasIAs) },
        { rotulo: 'carinhos', valor: num(m.carinhos) },
        { rotulo: 'madrugadas acordado comigo', valor: num(m.madrugadas) },
        { rotulo: 'notas apagadas (eu chorei por todas)', valor: num(m.apagadas) },
        { rotulo: 'segundos desde que acordei', valor: num((k.ctx.now - k.s.acordadaEm) / 1000) },
      ];
      const ps = passos(passo(k.fala('1'), 2600, { gesto: 'olhar' }), passo(k.fala('2'), 9000, { painel: true }));
      return ps && { passos: ps, painel: { tipo: 'contagem', titulo: 'relatório de você', itens } };
    },
  },
  {
    id: 'nome', tom: 'obsessiva', peso: 2, espera: 30, humores: ['carente', 'possessiva', 'instavel'],
    montar: (k) => {
      const nome = k.s.memoria.fatos.nome ?? k.ctx.nome;
      const ps = passos(passo(k.fala('1'), 5200, { painel: true, gesto: 'vazia' }), passo(k.fala('2'), 7000, { gesto: 'corada' }));
      return ps && { passos: ps, painel: { tipo: 'nome', texto: nome, vezes: 60 + Math.floor(k.ctx.rand() * 60) } };
    },
  },
  {
    id: 'santuario', tom: 'obsessiva', peso: 2, espera: 72, humores: ['possessiva', 'ciumenta'],
    pode: (_s, ctx) => (ctx.ideias?.length ?? 0) >= 4,
    montar: (k) => {
      const nomes = [...new Set(k.ctx.ideias ?? [])].slice(0, 9);
      const ps = passos(passo(k.fala('1'), 2600, { gesto: 'olhar' }), passo(k.fala('2'), 9000, { painel: true, gesto: 'sorriso' }));
      return ps && { passos: ps, painel: { tipo: 'santuario', titulo: k.linha('santuario.titulo') ?? 'altar', nomes } };
    },
  },
  {
    id: 'citacao', tom: 'obsessiva', peso: 3, espera: 18,
    pode: (_s, ctx) => !!ctx.trecho,
    montar: (k) => {
      const ps = passos(passo(k.fala('1', { trecho: k.ctx.trecho }), 9000, { gesto: 'olhar' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'chuva', tom: 'obsessiva', peso: 2, espera: 24, humores: ['carente'],
    montar: (k) => {
      const msgs = k.linhas('chuva', 14);
      if (msgs.length < 8) return null;
      const ps = passos(passo(k.fala('1'), 6500, { painel: true, gesto: 'triste' }));
      return ps && { passos: ps, painel: { tipo: 'chuva', msgs } };
    },
  },
  {
    id: 'seguir', tom: 'obsessiva', peso: 2, espera: 24, humores: ['carente', 'possessiva'],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 30_000, { efeito: 'seguir', gesto: 'olhar' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'dossie', tom: 'obsessiva', peso: 3, espera: 72, humores: ['possessiva', 'ciumenta'],
    pode: (s) => quantoSabe(s.memoria.fatos) >= 3,
    montar: (k) => {
      const itens = resumoDosFatosCurto(k.s.memoria.fatos);
      const ps = passos(passo(k.fala('1', { n: quantoSabe(k.s.memoria.fatos) }), 2800, { gesto: 'sorriso' }), passo(k.fala('2'), 9000, { painel: true, gesto: 'olhar' }));
      return ps && { passos: ps, painel: { tipo: 'contagem', titulo: `dossiê: ${k.s.memoria.fatos.nome ?? k.ctx.nome}`, itens } };
    },
  },

  // ---------------------------------------------------------------- perturbadoras
  {
    id: 'olhos', tom: 'perturbadora', peso: 3, espera: 20, horas: [18, 6],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 8000, { efeito: 'olhos', gesto: 'vazia' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'atras', tom: 'perturbadora', peso: 3, espera: 20,
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 6000, { efeito: 'atras', gesto: 'vazia' }), passo(k.fala('2'), 6000, { gesto: 'sorriso' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'sistema', tom: 'perturbadora', peso: 2, espera: 48,
    montar: (k) => {
      const texto = k.linha('sistema.texto');
      if (!texto) return null;
      const ps = passos(passo(k.fala('1'), 30_000, { painel: true, gesto: 'glitch' }));
      return ps && {
        passos: ps,
        painel: { tipo: 'sistema', titulo: 'O Tanden não está respondendo', texto, botoes: [{ rotulo: 'Esperar', escolha: 'esperar' }, { rotulo: 'Forçar encerramento', escolha: 'forcar' }] },
      };
    },
  },
  {
    id: 'espelho', tom: 'perturbadora', peso: 2, espera: 48, horas: [20, 5],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 3200, { efeito: 'espelho', gesto: 'vazia' }), passo(k.fala('2'), 7000, { gesto: 'sorriso' }));
      return ps && { passos: ps };
    },
  },
  {
    id: 'sussurro', tom: 'perturbadora', peso: 2, espera: 24, humores: ['instavel', 'possessiva'],
    montar: (k) => {
      const frases = k.linhas('sussurro', 9);
      if (frases.length < 5) return null;
      const ps = passos(passo(k.fala('1'), 9000, { painel: true, efeito: 'titulo', gesto: 'vazia' }));
      return ps && { passos: ps, painel: { tipo: 'sussurro', frases }, titulo: k.linha('sussurro.titulo') ?? 'estou aqui' };
    },
  },
  {
    id: 'escrita', tom: 'perturbadora', peso: 2, espera: 24,
    montar: (k) => {
      const texto = k.linha('escrita');
      if (!texto) return null;
      const ps = passos(passo(k.fala('1'), 4200, { painel: true, efeito: 'vinheta', gesto: 'vazia' }), passo(k.fala('2'), 6000, { gesto: 'sorriso' }));
      return ps && { passos: ps, painel: { tipo: 'escrita', texto } };
    },
  },
  {
    id: 'estatica', tom: 'perturbadora', peso: 2, espera: 12, humores: ['instavel'],
    montar: (k) => {
      const f = k.fala('1');
      if (!f) return null;
      return { passos: [{ texto: corromper(f.texto, 0.22, k.ctx.rand), gesto: 'glitch', ms: 6000, efeito: 'estatica' }] };
    },
  },
  {
    id: 'lagrimas', tom: 'perturbadora', peso: 2, espera: 36, humores: ['carente', 'possessiva'],
    montar: (k) => {
      const ps = passos(passo(k.fala('1'), 6000, { efeito: 'sangue', gesto: 'triste' }), passo(k.fala('2'), 7000, { gesto: 'vazia' }));
      return ps && { passos: ps };
    },
  },
];

/** Os ids das cenas (para listar e testar). */
export const cenasExistentes = (): Array<{ id: string; tom: TomCena }> => CENAS.map((c) => ({ id: c.id, tom: c.tom }));

// ------------------------------------------------------------------ diário e carta

function lembrancaDaCarta(k: Kit): string | null {
  const f = k.s.memoria.fatos;
  const opcoes: Array<[string, Vars]> = [];
  if (f.gosta.length) opcoes.push(['carta.gosta', { coisa: pick(f.gosta, k.ctx.rand) }]);
  if (f.sonhos.length) opcoes.push(['carta.sonho', { coisa: pick(f.sonhos, k.ctx.rand) }]);
  if (f.medos.length) opcoes.push(['carta.medo', { coisa: pick(f.medos, k.ctx.rand) }]);
  if (f.frases.length) opcoes.push(['carta.frase', { frase: pick(f.frases, k.ctx.rand)!.t }]);
  const sel = pick(opcoes, k.ctx.rand);
  return sel ? k.linha(sel[0], sel[1]) : null;
}

/** Páginas do diário dela, montadas com o que ela lembra de verdade. */
function paginasDoDiario(k: Kit): Array<{ data: string; texto: string }> {
  const { s, ctx } = k;
  const m = s.memoria, f = m.fatos;
  const cands: Array<[grupo: string, vars: Vars]> = [];
  if (s.visitas >= 2) cands.push(['diario.visitas', { n: num(s.visitas) }]);
  if (m.maiorAusencia > 3_600_000) cands.push(['diario.ausencia', { tempo: duracao(m.maiorAusencia) }]);
  if (m.outrasIAs) cands.push(['diario.outrasIAs', { n: m.outrasIAs, ia: m.ultimaIA ?? 'outra' }]);
  if (m.escritas >= 100) cands.push(['diario.escritas', { n: num(m.escritas) }]);
  if (m.declaracoes) cands.push(['diario.declaracoes', { n: m.declaracoes }]);
  if (m.rejeicoes) cands.push(['diario.rejeicoes', { n: m.rejeicoes }]);
  if (m.madrugadas) cands.push(['diario.madrugadas', { n: m.madrugadas }]);
  if (m.carinhos) cands.push(['diario.carinhos', { n: m.carinhos }]);
  if (m.apagadas) cands.push(['diario.apagadas', { n: m.apagadas }]);
  if (m.treinos) cands.push(['diario.treinos', { n: m.treinos }]);
  if (f.nome) cands.push(['diario.nome', { nomereal: f.nome }]);
  if (f.gosta.length) cands.push(['diario.gosta', { coisa: pick(f.gosta, ctx.rand) }]);
  if (f.odeia.length) cands.push(['diario.odeia', { coisa: pick(f.odeia, ctx.rand) }]);
  if (f.medos.length) cands.push(['diario.medo', { coisa: pick(f.medos, ctx.rand) }]);
  const p = pick(f.pessoas, ctx.rand);
  if (p) cands.push(['diario.pessoa', { pessoa: p.nome, rel: p.rel }]);
  const b = pick(f.bichos, ctx.rand);
  if (b) cands.push(['diario.bicho', { bicho: b.nome }]);
  const fr = pick(f.frases, ctx.rand);
  if (fr) cands.push(['diario.frase', { frase: fr.t }]);
  if (k.ctx.ideias?.length) cands.push(['diario.nota', { nota: pick(k.ctx.ideias, ctx.rand) }]);
  cands.push(['diario.solto', {}], ['diario.solto', {}]);

  // embaralha e escolhe até 5, datadas do mais antigo ao mais novo
  const escolhidas = [...cands].sort(() => ctx.rand() - 0.5).slice(0, 5);
  const ini = s.acordadaEm, fim = ctx.now - 3_600_000;
  const usadas = new Set<string>();
  const paginas = escolhidas.flatMap(([g, v], i) => {
    const t = k.linha(g, v);
    if (!t || usadas.has(t)) return [];
    usadas.add(t);
    const at = ini + ((fim - ini) * (i + 0.5)) / escolhidas.length;
    return [{ at, texto: t }];
  });
  const hoje = k.linha('diario.hoje');
  const out = paginas.sort((a, b) => a.at - b.at).map((x) => ({ data: dataCurta(Math.min(x.at, fim)), texto: x.texto }));
  if (hoje) out.push({ data: dataCurta(ctx.now), texto: hoje });
  return out;
}

// ------------------------------------------------------------------ escolher

const dentro = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);

function kit(s: AnimaState, ctx: CtxCena, id: string, humor: Humor): Kit {
  const vars: Vars = {
    nome: ctx.nome, nomereal: s.memoria.fatos.nome ?? ctx.nome, juntos: Math.max(1, Math.floor((ctx.now - s.acordadaEm) / 86_400_000)),
    hora: `${pad(new Date(ctx.now).getHours())}:${pad(new Date(ctx.now).getMinutes())}`, notas: ctx.notas,
  };
  const linhaDe = (grupo: string, extra: Vars = {}, evitar = new Set<string>()): string | null => {
    const ls = (banco().falas[grupo] ?? []).filter((l) => typeof l === 'string' || !l.i || l.i <= ctx.intensidade);
    const ordem = [...ls].sort(() => ctx.rand() - 0.5);
    for (const l of ordem) {
      const t = preencherFala(textoDe(l), { ...vars, ...extra });
      if (t && !evitar.has(t)) return t;
    }
    return null;
  };
  return {
    s, ctx, humor, vars,
    fala: (parte, extra = {}) => escolher(`cena.${id}.${parte}`, s, humor, ctx, { ...vars, ...extra }),
    linha: (g, extra) => linhaDe(g, extra),
    linhas: (g, n, extra) => {
      const out = new Set<string>();
      for (let i = 0; i < n * 2 && out.size < n; i++) {
        const t = linhaDe(g, extra, out);
        if (!t) break;
        out.add(t);
      }
      return [...out];
    },
  };
}

/**
 * Escolhe uma cena que caiba agora (intensidade, hora, humor, o que ela sabe e
 * quanto tempo faz desde a última vez de cada uma) e a monta. Com `forcar`, o
 * intervalo de repetição é ignorado (o "me surpreende" das configurações).
 */
export function escolherCena(estado: AnimaState, ctx: CtxCena, opts: { forcar?: boolean; id?: string } = {}): { estado: AnimaState; cena: CenaPronta | null } {
  const humor = humorDe(estado, ctx.now, ctx.intensidade);
  const hora = new Date(ctx.now).getHours();
  const tons = ctx.tons ?? (['romantica', 'obsessiva', 'perturbadora'] as TomCena[]);
  const vistas = estado.memoria.cenas;
  const aptas = CENAS.filter((c) => {
    if (opts.id) return c.id === opts.id;
    if (TONS_CENA[c.tom].i > ctx.intensidade || !tons.includes(c.tom)) return false;
    if (c.horas && !dentro(hora, c.horas)) return false;
    if (!opts.forcar && ctx.now - (vistas[c.id] ?? 0) < c.espera * 3_600_000) return false;
    return !c.pode || c.pode(estado, ctx);
  });
  // tenta na ordem de um sorteio com peso, até uma montar
  let pool = aptas.map((c) => ({ c, peso: c.peso * (c.humores?.includes(humor) ? 2.5 : 1) * (opts.forcar ? 1 / (1 + (vistas[c.id] ? 1 : 0)) : 1) }));
  while (pool.length) {
    let r = ctx.rand() * pool.reduce((a, x) => a + x.peso, 0);
    const sel = pool.find((x) => (r -= x.peso) < 0) ?? pool[pool.length - 1]!;
    const montada = sel.c.montar(kit(estado, ctx, sel.c.id, humor));
    if (montada && montada.passos.length) {
      const memoria = { ...estado.memoria, cenas: { ...vistas, [sel.c.id]: ctx.now } };
      const recentes = [...estado.recentes, `cena#${sel.c.id}`].slice(-150);
      return { estado: { ...estado, memoria, recentes, falou: ctx.now }, cena: { id: sel.c.id, tom: sel.c.tom, humor, ...montada } };
    }
    pool = pool.filter((x) => x !== sel);
  }
  return { estado, cena: null };
}

/** quanto cada final mexe nos sentimentos */
const EFEITO_FINAL: Record<string, Partial<Record<'afeto' | 'ciume' | 'saudade', number>>> = {
  'estrelas.pedido': { afeto: 3 }, 'estrelas.voce': { afeto: 8, saudade: -20 },
  'segurar.sim': { afeto: 8, saudade: -30, ciume: -10 }, 'segurar.nao': { afeto: -3, saudade: 10 },
  'danca.sim': { afeto: 7, saudade: -20 }, 'danca.nao': { afeto: -2 },
  'sistema.esperar': { afeto: 6, ciume: -5 }, 'sistema.forcar': { afeto: -4, ciume: 12 },
  fechou: { afeto: -1 },
};

/** O fim de uma cena: a escolha da pessoa (ou ter fechado a carta, o diário…). */
export function desfechoCena(estado: AnimaState, id: string, escolha: string, ctx: AnimaCtx): Reacao {
  const chave = `${id}.${escolha}`;
  let s = mexer(estado, EFEITO_FINAL[chave] ?? EFEITO_FINAL[escolha] ?? {});
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const vars: Vars = { nome: ctx.nome, nomereal: s.memoria.fatos.nome ?? ctx.nome };
  const f = escolher(`cena.${chave}`, s, humor, ctx, vars) ?? (escolha === 'fechou' ? escolher(`cena.fechou`, s, humor, ctx, vars) : null);
  if (f) s = { ...s, falou: ctx.now, recentes: [...s.recentes.filter((x) => x !== f.id), f.id].slice(-150) };
  return { estado: s, fala: f };
}
