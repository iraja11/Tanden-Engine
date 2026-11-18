import {
  ANIMA_ID_BASE, HUMORES, avisoDoSegredo, botoesDaConversa, comandoSecreto, humorDe, lerEstado, novoEstado, perguntaDoDia, planoDeSaudade,
  reagir, responder, responderPergunta,
  type AnimaCtx, type AnimaEvent, type AnimaState, type ComandoSecreto, type Fala, type Gesto, type Intensidade, type OpcaoFala, type Reacao,
} from '@tanden/core';
import * as notif from '@tauri-apps/plugin-notification';
import { untrack } from 'svelte';
import { commands } from '../commands.svelte';
import { notes } from '../editor/notes.svelte';
import { noteName } from '../editor/host';
import { engine } from '../engine.svelte';
import { exercicios } from '../exercicios/exercicios.svelte';
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
const DEFAULTS: AnimaPrefs = { acordada: false, intensidade: 2, nome: 'amor', notificar: true, silencio: true, lado: 'dir', altura: 0, escondida: false, passeia: true };
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
  prefs = $state<AnimaPrefs>({ ...DEFAULTS, ...(load<Partial<AnimaPrefs>>(PREFS_KEY) ?? {}) });
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
  private marcas: Marcas = { periodo: '', data: '', aniversario: '', pergunta: '', bateria: 0, ...(load<Partial<Marcas>>(MARKS_KEY) ?? {}) };

  // ------------------------------------------------------------------ ciclo

  start(): void {
    if (this.started || !this.prefs.acordada) return;
    this.started = true;
    this.inicioSessao = Date.now();
    this.agendarEspontanea();
    this.agendarPasseio();
    const bus = engine.bus;
    this.offs.push(
      bus.on('note.changed', (e) => { if (e.origin === 'local') this.escreveu(e.path); }),
      bus.on('note.created', (e) => this.evento({ tipo: 'criou', nota: noteName(e.path) })),
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
    void this.bateria();
    if (android) void this.canal();
    void this.cancelarSaudade();
    // ao abrir o app: reencontro, data especial, aniversário ou bom dia
    const fora = Date.now() - this.estado.vista;
    setTimeout(() => this.chegou(fora), 2500);
    this.estado = { ...this.estado, vista: Date.now() };
  }

  private stop(): void {
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
    const ativa = now - this.ultimoInput < 3 * 60_000;
    if (!ativa || this.aberta) return;
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
    return { now: Date.now(), rand: Math.random, intensidade: this.prefs.intensidade, nome: this.prefs.nome.trim() || 'você', ideias, notas: engine.notes.length };
  }

  evento(ev: AnimaEvent): void {
    if (!this.prefs.acordada || !this.started && ev.tipo !== 'despertar' && ev.tipo !== 'dormir') return;
    this.aplicar(reagir($state.snapshot(this.estado) as AnimaState, ev, this.ctx()));
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
    if (o.pergunta) {
      this.empurrar({ de: 'voce', texto: o.rotulo, gesto: 'neutro' });
      const r = responderPergunta($state.snapshot(this.estado) as AnimaState, o.pergunta.id, o.pergunta.n, this.ctx());
      this.digitar(r, false);
    } else if (o.resposta) this.falar(o.resposta, false);
  }

  /** A pessoa escreveu para ela (na conversa ou pelos botões do balão). */
  falar(texto: string, conversa = true): void {
    const t = texto.trim();
    if (!t) return;
    this.empurrar({ de: 'voce', texto: t, gesto: 'neutro' });
    this.digitar(responder($state.snapshot(this.estado) as AnimaState, t, this.ctx()), conversa);
  }

  /** Ela "digita" antes de responder: mais devagar quando a fala é longa (e um pouco irregular). */
  private digitar(r: Reacao, conversa: boolean): void {
    this.estado = r.estado;
    this.salvar();
    this.digitando = true;
    const espera = Math.min(2600, 500 + (r.fala?.texto.length ?? 0) * 14) * (0.7 + Math.random() * 0.6);
    setTimeout(() => {
      this.digitando = false;
      if (r.fala) this.mostrar(r.fala, conversa);
    }, espera);
  }

  private aplicar(r: Reacao): void {
    this.estado = r.estado;
    this.salvar();
    if (r.fala) this.mostrar(r.fala, false);
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
