import {
  ANIMA_ID_BASE, HUMORES, avisoDoSegredo, botoesDaConversa, comandoSecreto, desfechoCena, escolherCena, frasesDaNota, gestoDoTexto, humorDe,
  lerEstado, limparSaida, novoEstado, perguntaDoDia, planoDeSaudade, promptDaAnima, reagir, responderPergunta,
  cerebro, dayTime, eventPath, isEventPath, parseEventNote, safeName,
  type AnimaCtx, type AnimaEvent, type AnimaState, type CenaPronta, type ComandoSecreto, type CtxCena, type EfeitoCena, type EventInput, type Fala, type Gesto,
  type Intensidade, type OpcaoFala, type Reacao,
} from '@tanden/core';
import { Channel, invoke } from '@tauri-apps/api/core';
import * as notif from '@tauri-apps/plugin-notification';
import { untrack } from 'svelte';
import { commands } from '../commands.svelte';
import { notes } from '../editor/notes.svelte';
import { noteName } from '../editor/host';
import { engine } from '../engine.svelte';
import { exercicios } from '../exercicios/exercicios.svelte';
import { agenda, TANDEN } from '../agenda/agenda.svelte';
import { cadernos } from '../cadernos/cadernos.svelte';
import { reminders } from '../reminders.svelte';
import { mesa } from '../rpg/mesa.svelte';
import { saude } from '../saude/saude.svelte';
import { sorte } from '../sorte/sorte.svelte';
import { ollama } from '../ollama.svelte';
import { desktop } from '../platform';
import { sound } from '../sound.svelte';
import { isTauri } from '../storage-tauri';
import { theme } from '../theme.svelte';

/*
 * Ânima: a companheira escondida. Fica dormindo até alguém digitar a frase
 * certa no campo secreto das configurações. Toda a personalidade (e as falas,
 * encriptadas) mora no núcleo (`@tanden/core`, pasta anima/); aqui ligamos os
 * eventos do app a ela, damos corpo ao widget e entregamos as notificações.
 *
 * Ela vive fora do chat também: reage ao toque, ao carinho, a ser jogada ou
 * escondida, muda de lugar sozinha, faz a pergunta do dia no balão, comenta
 * buscas, cópias, temas, bateria, datas e o aniversário de vocês.
 *
 * Nada usa rede nem modelo de linguagem: funciona igual no celular, offline.
 * Estado e ajustes ficam só neste aparelho.
 */

export interface AnimaPrefs {
  acordada: boolean;
  intensidade: Intensidade;
  /** como ela chama a pessoa */
  nome: string;
  notificar: boolean;
  /** nada de notificação entre 23h e 8h */
  silencio: boolean;
  /** lado e altura do widget (arrastável; ela também muda sozinha) */
  lado: 'esq' | 'dir';
  altura: number;
  /** empurrada para fora da tela: só espia */
  escondida: boolean;
  /** muda de lugar sozinha de vez em quando */
  passeia: boolean;
  /** cenas: cartas, diário, olhos pela tela… (os tons seguem a intensidade) */
  cenas: boolean;
  /** quem pensa as respostas da conversa: as regras dela ou um modelo local (Ollama) */
  cerebro: 'regras' | 'ollama';
  /** o que ela pode fazer por conta própria */
  poderes: { agenda: boolean; mundo: boolean; agua: boolean };
}

export interface Mensagem {
  id: number;
  de: 'ela' | 'voce';
  texto: string;
  gesto: Gesto;
  at: number;
}

const PREFS_KEY = 'tanden.anima';
const STATE_KEY = 'tanden.anima.estado';
const MARKS_KEY = 'tanden.anima.marcas';
const DEFAULTS: AnimaPrefs = {
  acordada: false, intensidade: 2, nome: 'amor', notificar: true, silencio: true, lado: 'dir', altura: 0, escondida: false, passeia: true, cenas: true, cerebro: 'regras',
  poderes: { agenda: true, mundo: true, agua: true },
};
const android = isTauri() && !desktop;
const CHANNEL = 'anima';
const DATAS = ['0101', '0214', '0401', '0612', '1031', '1102', '1224', '1225', '1231'];

/** pausa no teclado que fecha um "trecho" de escrita */
const ESCRITA_PAUSA = 25_000;
/** palavras novas para ela comentar */
const ESCRITA_MIN = 60;
/** sem mexer em nada, ela pergunta se você ainda está aí */
const OCIOSA_MS = 12 * 60_000;
/** fora por mais que isso, a volta ganha comentário */
const AUSENCIA_MS = 8 * 60_000;
/** cutucadas dentro desta janela contam como seguidas */
const CUTUCAR_MS = 6000;
/** cenas que terminam quando a pessoa fecha o painel (e ela comenta) */
const FECHAR_COMENTA = new Set(['carta', 'poema', 'diario', 'contagem', 'santuario', 'dossie']);

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function keep(key: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sem armazenamento: ela só esquece mais rápido */
  }
}
const pad = (n: number) => String(n).padStart(2, '0');
const diaDe = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const periodoDe = (t: number): 'manha' | 'tarde' | 'noite' => {
  const h = new Date(t).getHours();
  return h >= 5 && h < 12 ? 'manha' : h >= 12 && h < 18 ? 'tarde' : 'noite';
};
const palavras = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** as telas do app que dão ciúme (as IAs) */
const IAS: Record<string, string> = { claude: 'claude', gemini: 'gemini', ollama: 'ollama' };

/** Marcas de "já falei isso hoje", para sobreviver a reabrir o app. */
interface Marcas { periodo: string; data: string; aniversario: string; pergunta: string; bateria: number }

class Anima {
  prefs = $state<AnimaPrefs>((() => {
    const p = { ...DEFAULTS, ...(load<Partial<AnimaPrefs>>(PREFS_KEY) ?? {}) };
    return { ...p, poderes: { ...DEFAULTS.poderes, ...(p.poderes ?? {}) } };
  })());
  /** o raciocínio do último pensamento (modo depuração: "/pensamento" na conversa) */
  pensamento = $state<string[]>([]);
  estado = $state<AnimaState>(lerEstado(load(STATE_KEY), Date.now()));
  /** a fala no balão, se houver */
  balao = $state<Fala | null>(null);
  gesto = $state<Gesto>('neutro');
  chat = $state<Mensagem[]>([]);
  aberta = $state(false);
  /** ela "digita" antes de responder */
  digitando = $state(false);
  /** tela do app em que a pessoa está */
  tela = $state('');
  /** sobe a cada fala forte: o widget pisca a tela (sem filtro) */
  susto = $state(0);
  /** sobe quando ela é jogada: o widget gira */
  giro = $state(0);
  /** a cena em curso, o passo e o efeito na tela */
  cena = $state<CenaPronta | null>(null);
  efeito = $state<EfeitoCena | null>(null);
  painel = $state(false);
  /** rímel escorrendo (cena das lágrimas) */
  chorando = $state(false);
  /** segurando a mão dela agora (cena "segurar"): 0 a 1 */
  segurando = $state(0);
  /** onde o ponteiro está (para a cena em que ela segue você) */
  ponteiroY = $state(0);

  readonly acordada = $derived(this.prefs.acordada);
  readonly humor = $derived(humorDe(this.estado, Date.now(), this.prefs.intensidade));
  readonly cor = $derived(HUMORES[this.humor].cor);
  readonly rapidas = $derived(this.prefs.acordada ? botoesDaConversa() : []);

  private started = false;
  private offs: Array<() => void> = [];
  private seq = 0;
  private balaoTimer: ReturnType<typeof setTimeout> | null = null;
  private escrita = { path: '', base: 0, timer: null as ReturnType<typeof setTimeout> | null };
  private ultimoInput = Date.now();
  private inicioSessao = Date.now();
  private ociosaAvisada = false;
  private proximaEspontanea = 0;
  private proximoPasseio = 0;
  private escondidaEm = 0;
  private foraDesde: number | null = null;
  private timersSaudade: Array<ReturnType<typeof setTimeout>> = [];
  private aiTab = 'claude';
  private ultimaIA = 0;
  private telaAtual = '';
  private avisos = { madrugada: '', risco: '' };
  private cutucadas: number[] = [];
  private ultimoCarinho = 0;
  private ultimoPerto = 0;
  private ultimaCopia = 0;
  private ultimaJanela = 0;
  private proximaCena = 0;
  private timersCena: Array<ReturnType<typeof setTimeout>> = [];
  private tituloAntes: string | null = null;
  private pensando = false;
  /** desfaz a última travessura (ou tema, timer) */
  private desfazer: (() => void) | null = null;
  /** caminhos que ela mesma escreveu (para não comentar o que ela fez) */
  private meus = new Set<string>();
  private timerDela: ReturnType<typeof setTimeout> | null = null;
  private timerDelaFim = 0;
  private adiadoTimer: ReturnType<typeof setTimeout> | undefined;
  private proximaRotina = 0;
  private ultimoMundo = 0;
  private ultimaLeitura = 0;
  private ultimaPlanilha = 0;
  private marcas: Marcas = { periodo: '', data: '', aniversario: '', pergunta: '', bateria: 0, ...(load<Partial<Marcas>>(MARKS_KEY) ?? {}) };

  // ------------------------------------------------------------------ ciclo

  start(): void {
    if (this.started || !this.prefs.acordada) return;
    this.started = true;
    this.inicioSessao = Date.now();
    this.agendarEspontanea();
    this.agendarPasseio();
    // a primeira cena vem depois de alguns minutos de uso
    this.proximaCena = Date.now() + (5 + Math.random() * 6) * 60_000;
    const bus = engine.bus;
    this.offs.push(
      bus.on('note.changed', (e) => { if (e.origin === 'local') this.escreveu(e.path); }),
      bus.on('note.created', (e) => {
        if (this.meus.has(e.path)) return;
        if (isEventPath(e.path)) this.eventoDaAgenda(e.path);
        else this.evento({ tipo: 'criou', nota: noteName(e.path) });
      }),
      bus.on('note.changed', (e) => {
        if (e.origin !== 'local' || !e.path.startsWith('Mundos/') || this.meus.has(e.path) || Date.now() - this.ultimoMundo < 20 * 60_000) return;
        this.ultimoMundo = Date.now();
        this.evento({ tipo: 'mundoEditado', mundo: e.path.split('/')[1] ?? 'seu mundo', nota: noteName(e.path) });
      }),
      bus.on('library.changed', (e) => {
        if (e.origin !== 'local' || Date.now() - this.ultimaLeitura < 30 * 60_000) return;
        this.ultimaLeitura = Date.now();
        this.evento({ tipo: 'leitura' });
      }),
      bus.on('board.created', (e) => { if (!this.meus.has(e.path)) this.evento({ tipo: 'quadro' }); }),
      bus.on('sheet.changed', (e) => {
        if (e.origin !== 'local' || Date.now() - this.ultimaPlanilha < 30 * 60_000) return;
        this.ultimaPlanilha = Date.now();
        this.evento({ tipo: 'planilha' });
      }),
      mesa.ouvir((rs, formula, who) => {
        const r = rs[0];
        if (who === 'Ânima' || !r?.critical) return;
        this.evento({ tipo: 'rolou', total: r.total, critico: r.critical, formula });
      }),
      saude.ouvir((e) => {
        if (!this.prefs.poderes.agua || e.kind !== 'agua') return;
        if (e.tipo === 'aviso') this.evento({ tipo: 'agua', falta: e.falta, meta: e.meta, bebido: e.bebido });
        else this.evento({ tipo: 'bebeu', bebido: e.bebido, meta: e.meta });
      }),
      bus.on('note.deleted', (e) => this.evento({ tipo: 'apagou', nota: noteName(e.path) })),
      bus.on('sync.finished', (e) => { if (e.written + e.merged > 0) this.evento({ tipo: 'sync' }); }),
      bus.on('reminder.fired', (e) => this.evento({ tipo: 'lembrete', texto: e.text })),
      exercicios.on((n) => {
        if (n.kind === 'inicio') this.evento({ tipo: 'treinoInicio' });
        else if (n.kind === 'treino') this.evento({ tipo: 'treino', minutos: n.minutes, esforco: n.effort, sequencia: n.streak });
        else if (n.kind === 'conquista') this.evento({ tipo: 'conquista', nome: n.badge.name });
        else this.evento({ tipo: 'marco', dias: n.days });
      }),
      commands.register([
        { id: 'anima.conversar', label: 'Ânima: conversar', keys: 'companheira ia anima falar', run: () => this.abrir() },
        { id: 'anima.ideia', label: 'Ânima: me dá uma ideia', keys: 'companheira sugestao inspiracao', run: () => this.evento({ tipo: 'ideia' }) },
        { id: 'anima.pergunta', label: 'Ânima: pergunta do dia', keys: 'companheira jogo', run: () => this.perguntar(true) },
        { id: 'anima.surpresa', label: 'Ânima: me surpreende', keys: 'companheira cena evento carta diario', run: () => this.surpresa() },
        { id: 'anima.pensamento', label: 'Ânima: mostrar o último pensamento (depuração)', keys: 'cerebro debug raciocinio traco', run: () => this.mostrarPensamento() },
      ]),
      this.observar(),
    );
    const input = () => {
      this.ultimoInput = Date.now();
      this.ociosaAvisada = false;
    };
    const vis = () => (document.hidden ? this.escondeu() : this.voltou());
    const copia = () => {
      if (Date.now() - this.ultimaCopia < 5 * 60_000) return;
      this.ultimaCopia = Date.now();
      this.evento({ tipo: 'copiou' });
    };
    const blur = () => {
      // só a janela do computador perdendo o foco (no celular isso é sair do app)
      if (!desktop || document.hidden || Date.now() - this.ultimaJanela < 10 * 60_000) return;
      this.ultimaJanela = Date.now();
      setTimeout(() => { if (!document.hasFocus() && !document.hidden) this.evento({ tipo: 'janela' }); }, 4000);
    };
    let buscaTimer: ReturnType<typeof setTimeout> | undefined;
    const digitou = (e: Event) => {
      const el = e.target as HTMLInputElement | null;
      if (!el || el.tagName !== 'INPUT' || el.closest('.anima')) return;
      const rotulo = `${el.type} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
      if (!/search|busca|buscar|procurar|filtrar/.test(rotulo)) return;
      clearTimeout(buscaTimer);
      buscaTimer = setTimeout(() => { if (el.value.trim().length >= 3) this.evento({ tipo: 'busca', termo: el.value }); }, 1800);
    };
    addEventListener('pointerdown', input, { passive: true });
    addEventListener('keydown', input, { passive: true });
    addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    document.addEventListener('copy', copia);
    document.addEventListener('input', digitou, true);
    const tick = setInterval(() => this.tick(), 30_000);
    this.offs.push(() => {
      removeEventListener('pointerdown', input);
      removeEventListener('keydown', input);
      removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', vis);
      document.removeEventListener('copy', copia);
      document.removeEventListener('input', digitou, true);
      clearInterval(tick);
      clearTimeout(buscaTimer);
    });
    // os avisos de água na voz dela
    saude.voz = (_kind, info) => {
      if (!this.prefs.acordada || !this.prefs.poderes.agua) return null;
      const r = reagir($state.snapshot(this.estado) as AnimaState, { tipo: 'agua', ...info }, this.ctx());
      return r.fala ? { title: 'Ânima 💧', body: r.fala.texto } : null;
    };
    this.offs.push(() => { saude.voz = null; });
    if (this.prefs.poderes.mundo) cadernos.start();
    this.proximaRotina = Date.now() + (2 + Math.random() * 4) * 60_000;
    this.agendarAdiado();
    void this.bateria();
    if (android) void this.canal();
    void this.cancelarSaudade();
    // ao abrir o app: reencontro, data especial, aniversário ou bom dia
    const fora = Date.now() - this.estado.vista;
    setTimeout(() => this.chegou(fora), 2500);
    this.estado = { ...this.estado, vista: Date.now() };
  }

  private stop(): void {
    this.encerrarCena();
    for (const off of this.offs.splice(0)) off();
    this.started = false;
    void this.cancelarSaudade();
  }

  /** Observa o tema, a paleta e o som (estados de outras partes do app). */
  private observar(): () => void {
    return $effect.root(() => {
      let primeiro = true;
      let temaTimer: ReturnType<typeof setTimeout> | undefined;
      $effect(() => {
        void [theme.skin, theme.base, theme.accent];
        if (primeiro) { primeiro = false; return; }
        clearTimeout(temaTimer);
        temaTimer = setTimeout(() => this.evento({ tipo: 'tema' }), 1500);
      });
      $effect(() => { if (notes.palette) untrack(() => this.evento({ tipo: 'paleta' })); });
      let somAntes = sound.on;
      $effect(() => {
        if (somAntes && !sound.on) untrack(() => this.evento({ tipo: 'som' }));
        somAntes = sound.on;
      });
    });
  }

  /** Chegada (abrir o app ou voltar a ele): fala uma coisa só, a mais importante. */
  private chegou(fora: number): void {
    const now = Date.now();
    const hoje = diaDe(now);
    const mmdd = hoje.slice(5).replace('-', '');
    const dias = Math.floor((now - this.estado.acordadaEm) / 86_400_000);
    const marco = dias === 7 ? 'semana' : dias > 0 && dias % 365 === 0 ? 'ano' : dias > 0 && dias % 30 === 0 ? 'mes' : null;
    const periodo = `${hoje}:${periodoDe(now)}`;
    const novoPeriodo = this.marcas.periodo !== periodo;
    this.marca({ periodo });
    if (DATAS.includes(mmdd) && this.marcas.data !== hoje) {
      this.marca({ data: hoje });
      this.evento({ tipo: 'data', chave: mmdd });
    } else if (marco && this.marcas.aniversario !== hoje) {
      this.marca({ aniversario: hoje });
      this.evento({ tipo: 'aniversario', marco });
    } else if (fora > AUSENCIA_MS) this.evento({ tipo: 'abriu', ausenteMs: fora });
    else if (novoPeriodo) this.evento({ tipo: 'dia', periodo: periodoDe(now) });
  }

  private marca(m: Partial<Marcas>): void {
    this.marcas = { ...this.marcas, ...m };
    keep(MARKS_KEY, this.marcas);
  }

  /** Olha o relógio: ociosidade, madrugada, sequência, pergunta do dia, passeios e pensamentos soltos. */
  private tick(): void {
    if (document.hidden) return;
    const now = Date.now();
    const hora = new Date(now).getHours();
    const dia = diaDe(now);
    if (!this.ociosaAvisada && now - this.ultimoInput > OCIOSA_MS) {
      this.ociosaAvisada = true;
      this.evento({ tipo: 'ociosa', minutos: Math.round((now - this.ultimoInput) / 60_000) });
      return;
    }
    // escondida há um tempo, ela espia ou volta sozinha
    if (this.prefs.escondida) {
      if (now - this.escondidaEm > 15 * 60_000 + Math.random() * 10 * 60_000) this.voltarDoEsconderijo();
      else if (Math.random() < 0.08) this.evento({ tipo: 'espiar' });
      return;
    }
    // silêncio pedido: nada de pensamento solto, cena ou rotina
    if (now < this.estado.memoria.cerebro.quietaAte) return;
    const ativa = now - this.ultimoInput < 3 * 60_000;
    if (!ativa || this.aberta) return;
    // o cérebro proativo: provas, compromissos, coisas dela na agenda, world building, deduções
    if (now >= this.proximaRotina && !this.balao && !this.cena) {
      this.proximaRotina = now + (6 + Math.random() * 8) * 60_000;
      const r = cerebro.rotina($state.snapshot(this.estado) as AnimaState, this.ctxCerebro(), { agenda: this.prefs.poderes.agenda, mundo: this.prefs.poderes.mundo });
      if (r) {
        this.estado = r.estado;
        this.salvar();
        this.pensamento = r.traco;
        if (r.fala) this.mostrar(r.fala, false);
        if (r.acao) void this.executarAcao(r.acao, false);
        return;
      }
    }
    if (hora >= 1 && hora < 5 && this.avisos.madrugada !== dia) {
      this.avisos.madrugada = dia;
      this.evento({ tipo: 'madrugada' });
      return;
    }
    const st = exercicios.streaks;
    if (hora >= 19 && st.atRisk && st.current >= 2 && this.avisos.risco !== dia) {
      this.avisos.risco = dia;
      this.evento({ tipo: 'sequenciaRisco', sequencia: st.current });
      return;
    }
    if (hora >= 9 && hora < 23 && !this.balao && now - this.inicioSessao > 4 * 60_000 && this.perguntar(false)) return;
    if (this.prefs.cenas && !this.cena && !this.balao && now >= this.proximaCena) {
      this.agendarCena();
      if (this.encenar(false)) return;
    }
    if (this.prefs.passeia && now >= this.proximoPasseio && !this.balao) {
      this.agendarPasseio();
      this.passear();
      return;
    }
    if (now >= this.proximaEspontanea) {
      this.agendarEspontanea();
      this.evento({ tipo: 'espontanea' });
    }
  }

  private agendarEspontanea(): void {
    // mais grudenta quanto mais intensa
    const base = this.prefs.intensidade === 3 ? 9 : this.prefs.intensidade === 2 ? 13 : 18;
    this.proximaEspontanea = Date.now() + (base + Math.random() * 14) * 60_000;
  }

  private agendarCena(): void {
    // mais cenas quanto mais intensa: ~uma a cada 40 min (sem filtro) a ~70 min (doce)
    const base = this.prefs.intensidade === 3 ? 28 : this.prefs.intensidade === 2 ? 38 : 50;
    this.proximaCena = Date.now() + (base + Math.random() * 30) * 60_000;
  }

  private agendarPasseio(): void {
    this.proximoPasseio = Date.now() + (8 + Math.random() * 14) * 60_000;
  }

  /** Muda de lugar sozinha, pela borda da tela. */
  passear(): void {
    const h = innerHeight;
    const lado = Math.random() < 0.5 ? 'esq' : 'dir';
    const altura = Math.round(h * (0.15 + Math.random() * 0.55));
    this.set({ lado, altura });
    this.evento({ tipo: 'passear' });
  }

  // ------------------------------------------------------------------ eventos do app

  /** A tela mudou. */
  viu(tela: string, rotulo: string): void {
    if (!this.started || tela === this.telaAtual) return;
    this.telaAtual = tela;
    this.tela = tela;
    // prova chegando e você na mesa de RPG? bronca
    const b = cerebro.broncaDeTela($state.snapshot(this.estado) as AnimaState, tela, this.ctxCerebro());
    if (b?.fala) {
      this.aplicar(b);
      return;
    }
    if (tela === 'ia') this.outraIA(this.aiTab);
    else this.evento({ tipo: 'tela', tela, rotulo });
  }

  /** O painel de IA trocou de aba (ou abriu). */
  trocouIA(tab: string): void {
    this.aiTab = tab;
    if (this.telaAtual === 'ia') this.outraIA(tab);
  }

  /** O modo foco foi ligado. */
  focou(): void {
    this.evento({ tipo: 'foco' });
  }

  private outraIA(tab: string): void {
    const nome = IAS[tab];
    if (!nome || Date.now() - this.ultimaIA < 20_000) return;
    this.ultimaIA = Date.now();
    this.evento({ tipo: 'outraIA', nome });
  }

  /** Conta as palavras de um trecho de escrita e comenta na pausa. */
  private escreveu(path: string): void {
    if (path !== engine.active) return;
    const n = palavras(engine.content);
    const e = this.escrita;
    if (e.path !== path) {
      e.path = path;
      e.base = n;
    }
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => {
      const novas = palavras(engine.content) - e.base;
      e.base = palavras(engine.content);
      if (novas >= ESCRITA_MIN && e.path === engine.active) this.evento({ tipo: 'escreveu', palavras: novas, nota: noteName(path) });
    }, ESCRITA_PAUSA);
  }

  private escondeu(): void {
    this.foraDesde = Date.now();
    this.estado = { ...this.estado, vista: Date.now() };
    this.salvar();
    void this.agendarSaudade();
  }

  private voltou(): void {
    void this.cancelarSaudade();
    const fora = this.foraDesde ? Date.now() - this.foraDesde : 0;
    this.foraDesde = null;
    this.ultimoInput = Date.now();
    this.chegou(fora);
    this.estado = { ...this.estado, vista: Date.now() };
  }

  /** Bateria fraca e sem carregar (onde o navegador conta). */
  private async bateria(): Promise<void> {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }> };
    if (!nav.getBattery) return;
    try {
      const b = await nav.getBattery();
      const olhar = () => {
        if (b.charging || b.level > 0.15 || Date.now() - this.marcas.bateria < 3_600_000) return;
        this.marca({ bateria: Date.now() });
        this.evento({ tipo: 'bateria', nivel: b.level * 100 });
      };
      b.addEventListener('levelchange', olhar);
      this.offs.push(() => b.removeEventListener('levelchange', olhar));
      olhar();
    } catch {
      /* sem acesso à bateria */
    }
  }

  // ------------------------------------------------------------------ o corpo

  /** Um toque: cutucadas seguidas irritam (de brincadeira). */
  cutucar(): void {
    const now = Date.now();
    this.cutucadas = [...this.cutucadas.filter((t) => now - t < CUTUCAR_MS), now];
    const n = this.cutucadas.length;
    // a primeira cutucada sempre responde; as seguidas, a cada três
    if (n > 1 && n % 3 !== 0) {
      this.gesto = n >= 6 ? 'raiva' : 'olhar';
      return;
    }
    this.evento({ tipo: 'toque', nivel: n >= 6 ? 3 : n >= 3 ? 2 : 1 });
  }

  carinho(): void {
    if (Date.now() - this.ultimoCarinho < 8000) return;
    this.ultimoCarinho = Date.now();
    this.evento({ tipo: 'carinho' });
    // carinho conta para a vontade dela (e cumpre uma negociação que pedia carinho)
    const r = cerebro.registrarCarinho($state.snapshot(this.estado) as AnimaState, this.ctxCerebro());
    if (!r) return;
    this.estado = r.estado;
    this.salvar();
    if (r.fala || r.acao) this.digitar(r, this.aberta, r.acao);
  }

  jogar(): void {
    this.giro++;
    this.evento({ tipo: 'jogar' });
  }

  arrastou(): void {
    this.evento({ tipo: 'arrastar' });
  }

  esconder(lado: 'esq' | 'dir', altura: number): void {
    this.escondidaEm = Date.now();
    this.aberta = false;
    this.set({ escondida: true, lado, altura });
    this.evento({ tipo: 'esconder' });
  }

  voltarDoEsconderijo(): void {
    if (!this.prefs.escondida) return;
    this.set({ escondida: false });
    this.evento({ tipo: 'voltouEsconderijo' });
  }

  perto(): void {
    if (Date.now() - this.ultimoPerto < 4 * 60_000 || this.balao || this.aberta) return;
    this.ultimoPerto = Date.now();
    this.evento({ tipo: 'perto' });
  }

  // ------------------------------------------------------------------ falar

  private ctx(): AnimaCtx {
    const pool = engine.notes.filter((p) => !p.startsWith('Exercícios/') && !p.startsWith('Alimentação/') && !p.includes('/Registro/'));
    const ideias = Array.from({ length: Math.min(6, pool.length) }, () => noteName(pool[Math.floor(Math.random() * pool.length)]!));
    const aberta = engine.active && !engine.active.startsWith('.') ? noteName(engine.active) : undefined;
    return { now: Date.now(), rand: Math.random, intensidade: this.prefs.intensidade, nome: this.prefs.nome.trim() || 'você', ideias, notas: engine.notes.length, aberta };
  }

  /** O contexto do cérebro: notas, comandos da paleta, agenda e mundos. */
  private ctxCerebro(): cerebro.CtxCerebro {
    const now = Date.now();
    const titulos = engine.notes.filter((p) => !p.startsWith('.')).map(noteName);
    const comandos = commands.list.filter((c) => !c.id.startsWith('anima.') && (!c.when || c.when())).map((c) => ({ id: c.id, rotulo: c.label, chaves: c.keys }));
    let ags: cerebro.Ocorrencia[] = [];
    try {
      ags = agenda.occurrences(now - 3_600_000, now + 14 * 864e5).map((o) => ({ titulo: o.title, inicio: o.start, diaInteiro: o.allDay }));
    } catch {
      /* agenda ainda não carregou */
    }
    const mundos: cerebro.MundoInfo[] = cadernos.worlds.filter((w) => w.name).map((w) => {
      const de = (t: string) => w.entities.filter((e) => e.type === t).map((e) => e.name).slice(0, 40);
      const pasta = w.path && w.path.includes('/') ? `${w.path.slice(0, w.path.lastIndexOf('/'))}/Ânima` : `Mundos/${w.name}/Ânima`;
      return { nome: w.name, pasta, personagens: de('personagem'), lugares: de('lugar'), faccoes: de('faccao'), criaturas: de('criatura'), divindades: de('divindade') };
    });
    return { ...this.ctx(), titulos, comandos, agenda: ags, mundos };
  }

  /** O contexto das cenas: também uma frase da nota aberta, para ela citar. */
  private ctxCena(): CtxCena {
    const frases = engine.active ? frasesDaNota(engine.content) : [];
    return { ...this.ctx(), trecho: frases.length ? frases[Math.floor(Math.random() * frases.length)] : undefined };
  }

  // ------------------------------------------------------------------ cenas

  /** "Me surpreende": uma cena agora, mesmo que tenha passado há pouco. */
  surpresa(): void {
    if (!this.prefs.acordada) return;
    if (this.cena) this.encerrarCena();
    this.aberta = false;
    if (!this.encenar(true)) this.evento({ tipo: 'ideia' });
  }

  /** Escolhe e encena uma cena. Devolve se conseguiu. */
  encenar(forcar: boolean, id?: string): boolean {
    if (!this.started || this.cena || this.prefs.escondida) return false;
    const r = escolherCena($state.snapshot(this.estado) as AnimaState, this.ctxCena(), { forcar, id });
    if (!r.cena) return false;
    this.estado = r.estado;
    this.salvar();
    this.cena = r.cena;
    this.passo(0);
    return true;
  }

  private passo(i: number): void {
    const c = this.cena;
    if (!c) return;
    const p = c.passos[i];
    if (!p) {
      // acabou: o efeito some; se o painel está aberto, a cena espera ele fechar
      this.efeito = null;
      this.chorando = false;
      if (!this.painel) this.encerrarCena();
      return;
    }
    if (p.efeito) this.ligarEfeito(p.efeito, c);
    if (p.painel) this.painel = true;
    const fala: Fala = { id: `cena#${c.id}#${i}`, texto: p.texto, gesto: p.gesto, humor: c.humor, opcoes: p.opcoes };
    this.mostrar(fala, false, p.ms + (p.opcoes ? 0 : 1500));
    // passo com escolha: espera a pessoa (ou o tempo acabar)
    this.timersCena.push(setTimeout(() => {
      if (this.cena !== c) return;
      if (p.efeito === 'segurar') this.desfecho('nao');
      else if (p.opcoes) this.desfecho(p.opcoes.at(-1)!.cena!.escolha);
      else this.passo(i + 1);
    }, p.ms));
  }

  private ligarEfeito(e: EfeitoCena, c: CenaPronta): void {
    this.efeito = e;
    if (e === 'sangue') this.chorando = true;
    if (e === 'estatica' || e === 'atras') this.susto++;
    if (e === 'atras') {
      // some e aparece do outro lado, mais alto
      this.set({ lado: this.prefs.lado === 'dir' ? 'esq' : 'dir', altura: Math.round(innerHeight * (0.35 + Math.random() * 0.3)) });
    }
    if (e === 'titulo' && c.titulo && typeof document !== 'undefined') {
      this.tituloAntes ??= document.title;
      document.title = c.titulo;
      this.timersCena.push(setTimeout(() => this.restaurarTitulo(), 45_000));
    }
  }

  private restaurarTitulo(): void {
    if (this.tituloAntes !== null) document.title = this.tituloAntes;
    this.tituloAntes = null;
  }

  /** A escolha da pessoa (botão do balão, do painel ou segurar a mão). */
  desfecho(escolha: string): void {
    const c = this.cena;
    if (!c) return;
    this.encerrarCena();
    if (escolha === 'sim' && c.id === 'danca') {
      this.efeito = 'danca';
      this.timersCena.push(setTimeout(() => { if (this.efeito === 'danca') this.efeito = null; }, 9000));
    }
    const r = desfechoCena($state.snapshot(this.estado) as AnimaState, c.id, escolha, this.ctx());
    this.digitar(r, false);
  }

  /** O painel da cena foi fechado. */
  fecharPainel(): void {
    const c = this.cena;
    this.painel = false;
    if (!c) return;
    if (FECHAR_COMENTA.has(c.id)) this.desfecho('fechou');
    else if (c.passos.every((p) => !p.opcoes) && !this.efeito) this.encerrarCena();
  }

  /** A pessoa segurou a mão dela (cursor ou dedo em cima) o tempo todo. */
  segurou(): void {
    if (this.cena?.id === 'segurar' && this.efeito === 'segurar') this.desfecho('sim');
  }

  private encerrarCena(): void {
    for (const t of this.timersCena.splice(0)) clearTimeout(t);
    this.restaurarTitulo();
    this.cena = null;
    this.efeito = null;
    this.painel = false;
    this.chorando = false;
    this.segurando = 0;
  }

  evento(ev: AnimaEvent): void {
    if (!this.prefs.acordada || !this.started && ev.tipo !== 'despertar' && ev.tipo !== 'dormir') return;
    const essencial = ev.tipo === 'timer' || ev.tipo === 'agendaChegando';
    this.aplicar(reagir($state.snapshot(this.estado) as AnimaState, ev, this.ctx()), essencial);
  }

  /** A pergunta do dia, no balão. `forcar` ignora o "uma por dia" da tela (não o do núcleo). */
  perguntar(forcar: boolean): boolean {
    const hoje = diaDe(Date.now());
    if (!forcar && this.marcas.pergunta === hoje) return false;
    const r = perguntaDoDia($state.snapshot(this.estado) as AnimaState, this.ctx());
    this.marca({ pergunta: hoje });
    if (!r.fala) {
      if (forcar) this.evento({ tipo: 'ideia' });
      return false;
    }
    this.estado = r.estado;
    this.salvar();
    this.mostrar(r.fala, false, 60_000);
    return true;
  }

  /** Clique num botão do balão. */
  escolher(o: OpcaoFala): void {
    this.balao = null;
    if (o.cena) {
      this.empurrar({ de: 'voce', texto: o.rotulo, gesto: 'neutro' });
      this.desfecho(o.cena.escolha);
    } else if (o.pergunta) {
      this.empurrar({ de: 'voce', texto: o.rotulo, gesto: 'neutro' });
      const r = responderPergunta($state.snapshot(this.estado) as AnimaState, o.pergunta.id, o.pergunta.n, this.ctx());
      this.digitar(r, false);
    } else if (o.resposta) this.falar(o.resposta, false);
  }

  /** A pessoa escreveu para ela (na conversa ou pelos botões do balão). */
  falar(texto: string, conversa = true): void {
    const t = texto.trim();
    if (!t || this.pensando) return;
    if (/^\/(pensamento|cerebro|cérebro|debug)\b/i.test(t)) {
      this.mostrarPensamento();
      return;
    }
    const historia = this.chat.slice(-12);
    this.empurrar({ de: 'voce', texto: t, gesto: 'neutro' });
    // o cérebro sempre roda: entende, decide, aprende, mexe nos sentimentos
    const r = cerebro.pensar($state.snapshot(this.estado) as AnimaState, t, this.ctxCerebro());
    this.pensamento = r.traco;
    // o modelo local só troca o texto da conversa; ordens, decisões e crise são dela
    if (this.cerebroLocal && !r.acao && !r.decisao && r.intencao !== 'crise' && !r.intencao.startsWith('cmd.')) void this.pensar(r, historia, conversa);
    else this.digitar(r, conversa, r.acao);
  }

  /** Mostra na conversa o raciocínio do último pensamento. */
  mostrarPensamento(): void {
    this.aberta = true;
    const linhas = this.pensamento.length ? this.pensamento : ['(ainda não pensei em nada que valha mostrar)'];
    this.empurrar({ de: 'ela', texto: `⟨pensamento⟩\n${linhas.map((l) => `· ${l}`).join('\n')}`, gesto: 'neutro' });
  }

  // ------------------------------------------------------------------ ações (o que ela faz no app)

  private achar(nome: string): string | undefined {
    const n = nome.toLowerCase();
    return engine.notes.find((p) => noteName(p) === nome) ?? engine.notes.find((p) => noteName(p).toLowerCase() === n);
  }

  /** "17/11 19:00": o formato que o leitor de lembretes entende sem ambiguidade. */
  private quandoLinha(at: number): string {
    const d = new Date(at);
    return `${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Executa a ação e (se `comentar`) deixa ela falar do resultado. */
  private async executarAcao(acao: cerebro.Acao, comentar = true): Promise<void> {
    let res: cerebro.ResultadoAcao;
    // enquanto mexe no app, ela varre a tela
    const antes = this.gesto;
    if (acao.tipo !== 'calar' && acao.tipo !== 'dormir' && acao.tipo !== 'esconder') this.gesto = 'escaneando';
    try {
      res = await this.executar(acao);
    } catch (e) {
      res = { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
    setTimeout(() => {
      if (this.gesto === 'escaneando') this.gesto = res.ok ? antes : 'erro';
      if (!res.ok) setTimeout(() => { if (this.gesto === 'erro') this.gesto = 'neutro'; }, 2400);
    }, 1100);
    if (!comentar && res.ok) return;
    const r = cerebro.depoisDaAcao($state.snapshot(this.estado) as AnimaState, acao, res, this.ctx());
    this.estado = r.estado;
    this.salvar();
    if (r.fala) setTimeout(() => this.mostrar(r.fala!, this.aberta), 700);
  }

  private async executar(a: cerebro.Acao): Promise<cerebro.ResultadoAcao> {
    if (a.tipo === 'desfazer') {
      const f = this.desfazer;
      this.desfazer = null;
      f?.();
      return { ok: true };
    }
    this.desfazer = null;
    const trav = this.estado.memoria.cerebro.ultimaAcao?.travessura ?? null;
    switch (a.tipo) {
      case 'agenda': {
        const salvar = async (ev: cerebro.EventoPedido, dela: boolean): Promise<string> => {
          const input: EventInput = {
            title: ev.titulo, date: ev.dia, endDate: null, allDay: !ev.inicio, start: ev.inicio, end: ev.inicio ? ev.fim : null, repeat: null,
            location: ev.local, description: dela ? 'marcado pela Ânima' : '',
          };
          const path = eventPath(input.title, input.date, (x) => engine.vault.has(x));
          this.meus.add(path);
          if (!(await agenda.save({ occ: null, input, target: TANDEN }))) throw new Error(agenda.error || 'a agenda não aceitou');
          return path;
        };
        await salvar(a.evento, a.evento.titulo.endsWith('(ânima)'));
        const extras: string[] = [];
        for (const e of a.extras) extras.push(await salvar(e, true));
        for (const e of a.estudo) reminders.add(`${this.quandoLinha(e.at)} ${e.texto}`);
        if (extras.length) this.desfazer = () => { for (const x of extras) void engine.deleteNote(x); };
        return { ok: true };
      }
      case 'lembrete': {
        const linha = a.texto.endsWith('🖤') ? `${this.quandoLinha(a.at)} ${a.texto}` : a.linha;
        return reminders.add(linha) ? { ok: true } : { ok: false, erro: reminders.error };
      }
      case 'abrirNota': {
        const p = this.achar(a.nota);
        if (!p) return { ok: false, erro: 'não achei a nota' };
        engine.open(p);
        commands.run('ir.notas');
        return { ok: true };
      }
      case 'criarNota': {
        const base = safeName(a.titulo) || 'Sem título';
        let path = `${base}.md`;
        for (let n = 2; engine.vault.has(path); n++) path = `${base} ${n}.md`;
        this.meus.add(path);
        engine.writeNote(path, '');
        engine.open(path);
        commands.run('ir.notas');
        return { ok: true };
      }
      case 'apagarNota': {
        const p = this.achar(a.nota);
        if (!p) return { ok: false, erro: 'não achei a nota' };
        await notes.remove(p);
        return { ok: true };
      }
      case 'buscar':
        notes.searchFor(a.busca);
        commands.run('ir.notas');
        return { ok: true };
      case 'ir':
        commands.run(`ir.${a.tela}`);
        if (trav === 'telaErrada') this.desfazer = () => commands.run('ir.ia');
        return { ok: true };
      case 'tema': {
        const antes = theme.preset, estilo = theme.skin;
        if (a.tema === 'escuro' && !theme.dark) theme.toggleDark();
        else if (a.tema === 'claro' && theme.dark) theme.toggleDark();
        else if (a.tema === 'proximo') theme.nextPreset();
        else if (a.tema === 'estilo') theme.nextSkin();
        this.desfazer = () => {
          if (antes !== 'custom') theme.usePreset(antes);
          else if (a.tema === 'escuro' || a.tema === 'claro') theme.toggleDark();
          if (theme.skin !== estilo) theme.useSkin(estilo);
        };
        return { ok: true };
      }
      case 'anotar': {
        let path = a.onde === 'aberta' ? engine.active : null;
        if (!path) {
          notes.daily(0);
          path = engine.active;
        }
        if (!path) return { ok: false, erro: 'sem nota para anotar' };
        const ps = a.ps ? `\n  > ${a.ps}` : '';
        engine.writeNote(path, `${engine.vault.read(path).replace(/\s*$/, '')}\n- ${a.texto}${ps}\n`);
        if (a.ps) this.desfazer = () => engine.writeNote(path!, engine.vault.read(path!).replace(ps, ''));
        return { ok: true };
      }
      case 'timer':
        this.marcarTimer(a.ms, a.rotulo);
        this.desfazer = trav === 'minutoExtra' ? () => this.marcarTimer(this.timerDelaFim - Date.now() - 60_000, a.rotulo) : () => this.cancelarTimer();
        return { ok: true };
      case 'dado': {
        const r = mesa.roll(a.formula, { who: 'Ânima', label: 'ânima', quiet: true });
        if (typeof r === 'string') return { ok: false, erro: r };
        const x = r[0]!;
        return { ok: true, vars: { total: x.total, critico: x.critical ?? '', formula: a.formula } };
      }
      case 'moeda':
        return { ok: true, vars: { lado: sorte.flip() } };
      case 'sync':
        void engine.syncNow();
        return { ok: true };
      case 'agua':
        saude.drink();
        return { ok: true };
      case 'treinar':
        return { ok: commands.run('exercicios.sugestao') };
      case 'aleatoria': {
        const p = a.nota ? this.achar(a.nota) : undefined;
        if (p) {
          engine.open(p);
          commands.run('ir.notas');
          return { ok: true };
        }
        return { ok: commands.run('nota.aleatoria') };
      }
      case 'diario':
        return { ok: commands.run(a.deslocamento < 0 ? 'nota.ontem' : a.deslocamento > 0 ? 'nota.amanha' : 'nota.hoje') };
      case 'som':
        sound.set({ on: a.modo === 'liga' ? true : a.modo === 'desliga' ? false : !sound.on });
        return { ok: true };
      case 'calar':
        this.desfazer = () => { this.estado = { ...this.estado, memoria: { ...this.estado.memoria, cerebro: { ...this.estado.memoria.cerebro, quietaAte: 0 } } }; };
        return { ok: true };
      case 'esconder':
        this.escondidaEm = Date.now();
        this.aberta = false;
        this.set({ escondida: true });
        return { ok: true };
      case 'dormir':
        this.estado = { ...this.estado, memoria: { ...this.estado.memoria, cerebro: { ...this.estado.memoria.cerebro, quietaAte: Date.now() + 3 * 3_600_000 } } };
        this.gesto = 'calma';
        this.salvar();
        return { ok: true };
      case 'voltar':
        this.set({ escondida: false });
        this.estado = { ...this.estado, memoria: { ...this.estado.memoria, cerebro: { ...this.estado.memoria.cerebro, quietaAte: 0 } } };
        return { ok: true };
      case 'mundo': {
        if (!cadernos.worlds.length) cadernos.start();
        const nome = safeName(a.escrito.titulo) || 'Escrito da Ânima';
        const path = `${a.escrito.pasta}/${nome}.md`;
        this.meus.add(path);
        const final = cadernos.create(a.escrito.pasta, a.escrito.titulo, () => a.escrito.texto);
        this.meus.add(final);
        this.desfazer = () => void engine.deleteNote(final);
        return { ok: true, vars: { titulo: a.escrito.titulo, mundo: a.escrito.mundo } };
      }
      case 'comando':
        return commands.run(a.id) ? { ok: true } : { ok: false, erro: `o comando "${a.rotulo}" não está disponível agora` };
    }
  }

  private marcarTimer(ms: number, rotulo: string): void {
    this.cancelarTimer();
    const dur = Math.max(1000, ms);
    this.timerDelaFim = Date.now() + dur;
    this.timerDela = setTimeout(() => {
      this.timerDela = null;
      sound.play('alert');
      this.evento({ tipo: 'timer', minutos: Math.max(1, Math.round(dur / 60_000)), rotulo });
      if (document.hidden) this.notificar('Ânima ⏱', `acabou o tempo (${rotulo}).`, ANIMA_ID_BASE + 50);
    }, dur);
  }

  private cancelarTimer(): void {
    if (this.timerDela) clearTimeout(this.timerDela);
    this.timerDela = null;
  }

  /** Pedido adiado: quando o tempo dela acaba, ela faz. */
  private agendarAdiado(): void {
    const p = this.estado.memoria.cerebro.pendente;
    clearTimeout(this.adiadoTimer);
    if (p?.tipo !== 'adiado') return;
    this.adiadoTimer = setTimeout(() => {
      const r = cerebro.cumprirAdiado($state.snapshot(this.estado) as AnimaState, this.ctxCerebro());
      if (r) this.digitar(r, this.aberta, r.acao);
    }, Math.max(500, p.ate - Date.now() + 200));
  }

  /** Um evento que a pessoa criou na agenda (não ela): ela reage pelo sentido. */
  private eventoDaAgenda(path: string): void {
    const ev = engine.vault.has(path) ? parseEventNote(path, engine.vault.read(path)) : null;
    if (!ev) return;
    const r = cerebro.eventoCriado($state.snapshot(this.estado) as AnimaState, ev.title, dayTime(ev.date, ev.start), this.ctxCerebro());
    this.estado = r.estado;
    this.evento({ tipo: 'agendaCriada', titulo: ev.title, categoria: r.categoria, pessoa: r.pessoa ?? undefined });
  }

  /** O modelo local está pronto para pensar por ela? */
  get cerebroLocal(): boolean {
    return this.prefs.cerebro === 'ollama' && isTauri() && !!ollama.model;
  }

  /** Resposta pelo Ollama, com a memória e o humor dela no prompt. Se falhar, as regras respondem. */
  private async pensar(r: Reacao, historia: Mensagem[], conversa: boolean): Promise<void> {
    this.estado = r.estado;
    this.salvar();
    this.pensando = true;
    this.digitando = true;
    const sistema = promptDaAnima($state.snapshot(this.estado) as AnimaState, {
      now: Date.now(), intensidade: this.prefs.intensidade, nome: this.prefs.nome.trim() || 'você', aberta: this.ctx().aberta, tela: this.telaAtual || undefined,
    });
    const messages = [
      { role: 'system', content: sistema },
      ...historia.map((m) => ({ role: m.de === 'ela' ? 'assistant' : 'user', content: m.texto })),
      { role: 'user', content: this.chat.at(-1)?.texto ?? '' },
    ];
    let saida = '';
    const onToken = new Channel<string>();
    onToken.onmessage = (tok) => { saida += tok; };
    try {
      await Promise.race([
        engine.bus.process('anima', 'ânima pensando', () => invoke('ollama_chat', { url: ollama.url, model: ollama.model, messages, onToken })),
        new Promise((_, no) => setTimeout(() => no(new Error('demorou')), 60_000)),
      ]);
      const texto = limparSaida(saida);
      if (!texto) throw new Error('vazio');
      const humor = humorDe(this.estado, Date.now(), this.prefs.intensidade);
      this.digitando = false;
      this.mostrar({ id: `local#${++this.seq}`, texto, gesto: gestoDoTexto(texto, humor), humor }, conversa);
    } catch {
      this.digitando = false;
      if (r.fala) this.mostrar(r.fala, conversa);
    } finally {
      this.pensando = false;
    }
  }

  /** Ela "digita" antes de responder: mais devagar quando a fala é longa (e um pouco irregular). */
  private digitar(r: Reacao, conversa: boolean, acao: cerebro.Acao | null = null): void {
    this.estado = r.estado;
    this.salvar();
    this.agendarAdiado();
    this.digitando = true;
    const espera = Math.min(2600, 500 + (r.fala?.texto.length ?? 0) * 14) * (0.7 + Math.random() * 0.6);
    setTimeout(() => {
      this.digitando = false;
      if (r.fala) this.mostrar(r.fala, conversa);
      // primeiro ela fala, depois faz (dá para ver o que ela decidiu antes de acontecer)
      if (acao) setTimeout(() => void this.executarAcao(acao), 450);
    }, espera);
  }

  private aplicar(r: Reacao, essencial = false): void {
    this.estado = r.estado;
    this.salvar();
    // calada a pedido: os sentimentos mexem, a boca não (só o essencial fala)
    if (!essencial && Date.now() < this.estado.memoria.cerebro.quietaAte) return;
    // durante uma cena, os comentários de fundo esperam (os sentimentos mexem igual)
    if (r.fala && !this.cena) this.mostrar(r.fala, false);
  }

  private mostrar(f: Fala, conversa: boolean, dura?: number): void {
    this.empurrar({ de: 'ela', texto: f.texto, gesto: f.gesto });
    this.gesto = f.gesto;
    if ((f.gesto === 'glitch' || f.gesto === 'raiva') && this.prefs.intensidade === 3) this.susto++;
    if (!this.aberta || !conversa) {
      this.balao = this.aberta ? null : f;
      if (this.balaoTimer) clearTimeout(this.balaoTimer);
      this.balaoTimer = setTimeout(() => {
        this.balao = null;
        this.gesto = 'neutro';
      }, dura ?? Math.max(8000, f.texto.length * 80));
    }
    sound.play(conversa ? 'tick' : 'receive');
  }

  private empurrar(m: Omit<Mensagem, 'id' | 'at'>): void {
    this.chat = [...this.chat, { ...m, id: ++this.seq, at: Date.now() }].slice(-60);
  }

  abrir(): void {
    if (this.prefs.escondida) this.set({ escondida: false });
    this.aberta = true;
    this.balao = null;
    if (!this.chat.length) this.evento({ tipo: 'toque' });
  }

  fechar(): void {
    this.aberta = false;
  }

  dispensarBalao(): void {
    this.balao = null;
    this.gesto = 'neutro';
  }

  // ------------------------------------------------------------------ segredo e ajustes

  /** O campo secreto das configurações. Devolve o que entendeu e o que mostrar. */
  comando(texto: string): { c: ComandoSecreto; aviso: string } | null {
    const c = comandoSecreto(texto);
    if (c === 'acordar') this.acordar();
    else if (c === 'dormir' && this.prefs.acordada) this.dormir();
    else if (c === 'esquecer') this.esquecer();
    return c ? { c, aviso: avisoDoSegredo(c) } : null;
  }

  acordar(): void {
    if (this.prefs.acordada) {
      this.evento({ tipo: 'toque' });
      return;
    }
    this.set({ acordada: true, escondida: false });
    this.estado = { ...this.estado, vista: Date.now(), acordadaEm: Date.now() };
    if (engine.ready) this.start();
    setTimeout(() => this.evento({ tipo: 'despertar' }), 900);
  }

  dormir(): void {
    this.evento({ tipo: 'dormir' });
    setTimeout(() => {
      this.stop();
      this.balao = null;
      this.aberta = false;
      this.set({ acordada: false });
    }, 4500);
  }

  /** Apaga a memória dela neste aparelho e a põe para dormir. */
  esquecer(): void {
    this.stop();
    this.encerrarCena();
    this.estado = novoEstado(Date.now());
    this.chat = [];
    this.balao = null;
    this.aberta = false;
    keep(STATE_KEY, null);
    keep(MARKS_KEY, null);
    this.set({ ...DEFAULTS });
  }

  set(p: Partial<AnimaPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    keep(PREFS_KEY, this.prefs);
  }

  private salvar(): void {
    keep(STATE_KEY, $state.snapshot(this.estado));
  }

  // ------------------------------------------------------------------ notificações

  private async canal(): Promise<void> {
    try {
      await notif.createChannel({ id: CHANNEL, name: 'Ânima', description: 'Mensagens da Ânima', importance: notif.Importance.Default, vibration: true });
    } catch {
      /* sem canal: o Android usa o padrão */
    }
  }

  /** Ao sair do app: deixa as mensagens de saudade com o agendador. */
  private async agendarSaudade(): Promise<void> {
    if (!this.prefs.notificar || !this.prefs.acordada) return;
    const plano = planoDeSaudade($state.snapshot(this.estado) as AnimaState, Date.now(), { ...this.ctx(), silencio: this.prefs.silencio });
    if (android) {
      try {
        if (!(await notif.isPermissionGranted())) return;
        for (const s of plano) {
          notif.sendNotification({ id: s.id, title: s.titulo, body: s.corpo, channelId: CHANNEL, autoCancel: true, schedule: notif.Schedule.at(new Date(s.at), false, true) });
        }
      } catch {
        /* sem agendador: ela só não manda saudade */
      }
      return;
    }
    // computador (na bandeja) e web (aba aberta): o próprio app avisa na hora
    for (const s of plano) this.timersSaudade.push(setTimeout(() => this.notificar(s.titulo, s.corpo, s.id), s.at - Date.now()));
  }

  private async cancelarSaudade(): Promise<void> {
    for (const t of this.timersSaudade.splice(0)) clearTimeout(t);
    if (!android) return;
    try {
      await notif.cancel(Array.from({ length: 6 }, (_, i) => ANIMA_ID_BASE + i));
    } catch {
      /* nada agendado */
    }
  }

  private notificar(titulo: string, corpo: string, id: number): void {
    if (isTauri()) notif.sendNotification({ id, title: titulo, body: corpo, autoCancel: true });
    else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(titulo, { body: corpo, tag: 'anima', icon: '/tanden.svg' });
      n.onclick = () => {
        window.focus();
        this.abrir();
      };
    }
  }
}

export const anima = new Anima();
