import {
  ANIMA_ID_BASE, HUMORES, comandoSecreto, humorDe, lerEstado, novoEstado, planoDeSaudade, reagir, responder,
  type AnimaCtx, type AnimaEvent, type AnimaState, type ComandoSecreto, type Fala, type Gesto, type Intensidade, type Reacao,
} from '@tanden/core';
import * as notif from '@tauri-apps/plugin-notification';
import { commands } from '../commands.svelte';
import { noteName } from '../editor/host';
import { engine } from '../engine.svelte';
import { exercicios } from '../exercicios/exercicios.svelte';
import { desktop } from '../platform';
import { sound } from '../sound.svelte';
import { isTauri } from '../storage-tauri';

/*
 * Ânima: a companheira escondida. Fica dormindo até alguém digitar a frase
 * certa no campo secreto das configurações. Toda a personalidade mora no núcleo
 * (`@tanden/core`, pasta anima/); aqui só ligamos os eventos do app a ela, damos
 * corpo (o widget) e entregamos as notificações.
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
  /** lado e altura do widget (o celular arrasta) */
  lado: 'esq' | 'dir';
  altura: number;
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
const DEFAULTS: AnimaPrefs = { acordada: false, intensidade: 2, nome: 'amor', notificar: true, silencio: true, lado: 'dir', altura: 0 };
const android = isTauri() && !desktop;
const CHANNEL = 'anima';

/** pausa no teclado que fecha um "trecho" de escrita */
const ESCRITA_PAUSA = 25_000;
/** palavras novas para ela comentar */
const ESCRITA_MIN = 60;
/** sem mexer em nada, ela pergunta se você ainda está aí */
const OCIOSA_MS = 12 * 60_000;
/** fora por mais que isso, a volta ganha comentário */
const AUSENCIA_MS = 8 * 60_000;

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
const palavras = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** as telas do app que dão ciúme (as IAs) */
const IAS: Record<string, string> = { claude: 'claude', gemini: 'gemini', ollama: 'ollama' };

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

  readonly acordada = $derived(this.prefs.acordada);
  readonly humor = $derived(humorDe(this.estado, Date.now(), this.prefs.intensidade));
  readonly cor = $derived(HUMORES[this.humor].cor);

  private started = false;
  private offs: Array<() => void> = [];
  private seq = 0;
  private balaoTimer: ReturnType<typeof setTimeout> | null = null;
  private escrita = { path: '', base: 0, timer: null as ReturnType<typeof setTimeout> | null };
  private ultimoInput = Date.now();
  private ociosaAvisada = false;
  private proximaEspontanea = 0;
  private escondidaEm: number | null = null;
  private timersSaudade: Array<ReturnType<typeof setTimeout>> = [];
  private aiTab = 'claude';
  private ultimaIA = 0;
  private telaAtual = '';
  private avisos = { madrugada: '', risco: '' };

  // ------------------------------------------------------------------ ciclo

  start(): void {
    if (this.started || !this.prefs.acordada) return;
    this.started = true;
    this.agendarEspontanea();
    const bus = engine.bus;
    this.offs.push(
      bus.on('note.changed', (e) => { if (e.origin === 'local') this.escreveu(e.path); }),
      bus.on('note.deleted', (e) => this.evento({ tipo: 'apagou', nota: noteName(e.path) })),
      bus.on('sync.finished', (e) => { if (e.written + e.merged > 0) this.evento({ tipo: 'sync' }); }),
      bus.on('reminder.fired', (e) => this.evento({ tipo: 'lembrete', texto: e.text })),
      exercicios.on((n) => {
        if (n.kind === 'treino') this.evento({ tipo: 'treino', minutos: n.minutes, esforco: n.effort, sequencia: n.streak });
        else if (n.kind === 'conquista') this.evento({ tipo: 'conquista', nome: n.badge.name });
        else this.evento({ tipo: 'marco', dias: n.days });
      }),
      commands.register([
        { id: 'anima.conversar', label: 'Ânima: conversar', keys: 'companheira ia anima falar', run: () => this.abrir() },
        { id: 'anima.ideia', label: 'Ânima: me dá uma ideia', keys: 'companheira sugestao inspiracao', run: () => this.evento({ tipo: 'ideia' }) },
      ]),
    );
    const input = () => {
      this.ultimoInput = Date.now();
      this.ociosaAvisada = false;
    };
    const vis = () => (document.hidden ? this.escondeu() : this.voltou());
    addEventListener('pointerdown', input, { passive: true });
    addEventListener('keydown', input, { passive: true });
    document.addEventListener('visibilitychange', vis);
    const tick = setInterval(() => this.tick(), 30_000);
    this.offs.push(() => {
      removeEventListener('pointerdown', input);
      removeEventListener('keydown', input);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(tick);
    });
    if (android) void this.canal();
    void this.cancelarSaudade();
    // ao abrir o app: a volta conta como reencontro
    const fora = Date.now() - this.estado.vista;
    if (fora > AUSENCIA_MS) setTimeout(() => this.evento({ tipo: 'abriu', ausenteMs: fora }), 2500);
    this.estado = { ...this.estado, vista: Date.now() };
  }

  private stop(): void {
    for (const off of this.offs.splice(0)) off();
    this.started = false;
    void this.cancelarSaudade();
  }

  /** Olha o relógio: ociosidade, madrugada, sequência em risco, pensamentos soltos. */
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
    const ativa = now - this.ultimoInput < 3 * 60_000;
    if (!ativa) return;
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
    if (now >= this.proximaEspontanea && !this.aberta) {
      this.agendarEspontanea();
      this.evento({ tipo: 'espontanea' });
    }
  }

  private agendarEspontanea(): void {
    // entre 14 e 30 minutos; mais grudenta quanto mais intensa
    const base = this.prefs.intensidade === 3 ? 10 : this.prefs.intensidade === 2 ? 14 : 20;
    this.proximaEspontanea = Date.now() + (base + Math.random() * 16) * 60_000;
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
    this.escondidaEm = Date.now();
    this.estado = { ...this.estado, vista: Date.now() };
    this.salvar();
    void this.agendarSaudade();
  }

  private voltou(): void {
    void this.cancelarSaudade();
    const fora = this.escondidaEm ? Date.now() - this.escondidaEm : 0;
    this.escondidaEm = null;
    this.ultimoInput = Date.now();
    if (fora > AUSENCIA_MS) this.evento({ tipo: 'abriu', ausenteMs: fora });
    this.estado = { ...this.estado, vista: Date.now() };
  }

  // ------------------------------------------------------------------ falar

  private ctx(): AnimaCtx {
    const pool = engine.notes.filter((p) => !p.startsWith('Exercícios/') && !p.startsWith('Alimentação/') && !p.includes('/Registro/'));
    const ideias = Array.from({ length: Math.min(6, pool.length) }, () => noteName(pool[Math.floor(Math.random() * pool.length)]!));
    return { now: Date.now(), rand: Math.random, intensidade: this.prefs.intensidade, nome: this.prefs.nome.trim() || 'você', ideias, notas: engine.notes.length };
  }

  evento(ev: AnimaEvent): void {
    if (!this.prefs.acordada) return;
    this.aplicar(reagir($state.snapshot(this.estado) as AnimaState, ev, this.ctx()));
  }

  tocar(): void {
    this.evento({ tipo: 'toque' });
  }

  /** A pessoa escreveu para ela. */
  falar(texto: string): void {
    const t = texto.trim();
    if (!t) return;
    this.empurrar({ de: 'voce', texto: t, gesto: 'neutro' });
    const r = responder($state.snapshot(this.estado) as AnimaState, t, this.ctx());
    this.estado = r.estado;
    this.salvar();
    // ela "digita": mais devagar quando a fala é longa (e um pouco irregular)
    this.digitando = true;
    const espera = Math.min(2600, 500 + (r.fala?.texto.length ?? 0) * 14) * (0.7 + Math.random() * 0.6);
    setTimeout(() => {
      this.digitando = false;
      if (r.fala) this.mostrar(r.fala, true);
    }, espera);
  }

  /** Atalho para as respostas rápidas. */
  responderRapido(texto: string): void {
    this.falar(texto);
  }

  private aplicar(r: Reacao): void {
    this.estado = r.estado;
    this.salvar();
    if (r.fala) this.mostrar(r.fala, false);
  }

  private mostrar(f: Fala, conversa: boolean): void {
    this.empurrar({ de: 'ela', texto: f.texto, gesto: f.gesto });
    this.gesto = f.gesto;
    if (!this.aberta || !conversa) {
      this.balao = f;
      if (this.balaoTimer) clearTimeout(this.balaoTimer);
      this.balaoTimer = setTimeout(() => {
        this.balao = null;
        this.gesto = 'neutro';
      }, Math.max(7000, f.texto.length * 75));
    }
    sound.play(conversa ? 'tick' : 'receive');
  }

  private empurrar(m: Omit<Mensagem, 'id' | 'at'>): void {
    this.chat = [...this.chat, { ...m, id: ++this.seq, at: Date.now() }].slice(-40);
  }

  abrir(): void {
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

  /** O campo secreto das configurações. Devolve o que entendeu. */
  comando(texto: string): ComandoSecreto | null {
    const c = comandoSecreto(texto);
    if (c === 'acordar') this.acordar();
    else if (c === 'dormir' && this.prefs.acordada) this.dormir();
    else if (c === 'esquecer') this.esquecer();
    return c;
  }

  acordar(): void {
    if (this.prefs.acordada) {
      this.evento({ tipo: 'toque' });
      return;
    }
    this.set({ acordada: true });
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
    for (const s of plano) {
      this.timersSaudade.push(setTimeout(() => this.notificar(s.titulo, s.corpo, s.id), s.at - Date.now()));
    }
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
