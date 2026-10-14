// Sons de interface, sintetizados na hora (Web Audio): nada de arquivo de áudio,
// funciona offline e pesa zero. A regra é dar "feeling" sem irritar:
// volume baixo, variação mínima a cada toque para não enjoar, e limite de
// repetição por som, para um sync a cada 30 s nunca virar ruído.

export type SoundName =
  | 'tick' | 'open' | 'close' | 'create' | 'complete'
  | 'receive' | 'sync' | 'ai-start' | 'ai-done'
  | 'alert' | 'error' | 'boot';

export type Category = 'interface' | 'atividade' | 'avisos';
export type Pack = 'cristal' | 'taiko' | 'circuito';

export const PACKS: { id: Pack; label: string; hint: string }[] = [
  { id: 'cristal', label: 'Cristal', hint: 'sinos suaves e limpos' },
  { id: 'taiko', label: 'Taiko', hint: 'tambor e madeira, com peso' },
  { id: 'circuito', label: 'Circuito', hint: 'bipes de máquina, secos' },
];

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'interface', label: 'Interface', hint: 'navegar, abrir, criar, concluir' },
  { id: 'atividade', label: 'Atividade', hint: 'dados chegando de outro aparelho, IA pensando e respondendo' },
  { id: 'avisos', label: 'Avisos', hint: 'lembretes e erros' },
];

const CATEGORY: Record<SoundName, Category> = {
  tick: 'interface', open: 'interface', close: 'interface', create: 'interface', complete: 'interface', boot: 'interface',
  receive: 'atividade', sync: 'atividade', 'ai-start': 'atividade', 'ai-done': 'atividade',
  alert: 'avisos', error: 'avisos',
};

/** intervalo mínimo entre dois toques do mesmo som (ms) */
const GAP: Record<SoundName, number> = {
  tick: 45, open: 90, close: 90, create: 90, complete: 60, boot: 3000,
  receive: 2500, sync: 3000, 'ai-start': 1500, 'ai-done': 1500, alert: 900, error: 2500,
};

/**
 * Uma voz: oscilador (ou ruído) com envelope de ataque curto e queda exponencial.
 * f → to faz um glide de altura (tambor caindo, bipe subindo).
 */
type Voice = {
  f: number; to?: number; type?: OscillatorType | 'noise';
  at?: number; a?: number; d: number; g: number; q?: number;
};

const bell = (f: number, at: number, d: number, g: number): Voice[] => [
  { f, at, d, g, type: 'sine' },
  { f: f * 2.76, at, d: d * 0.45, g: g * 0.22, type: 'sine' },
];
const drum = (f: number, at: number, d: number, g: number): Voice[] => [
  { f, to: f * 0.5, at, d, g, type: 'sine', a: 0.002 },
  { f: f * 6, at, d: 0.03, g: g * 0.35, type: 'noise', q: 1.2 },
];
const wood = (f: number, at: number, g: number): Voice[] => [
  { f, at, d: 0.035, g, type: 'triangle', a: 0.001 },
  { f: f * 2.4, at, d: 0.02, g: g * 0.4, type: 'sine', a: 0.001 },
];
const blip = (f: number, at: number, d: number, g: number, to?: number): Voice[] => [
  { f, to, at, d, g, type: 'square', a: 0.002 },
];

const SOUNDS: Record<Pack, Record<SoundName, Voice[]>> = {
  cristal: {
    tick: [{ f: 1760, d: 0.05, g: 0.07, type: 'sine', a: 0.002 }],
    open: [{ f: 880, to: 1320, d: 0.14, g: 0.08, type: 'sine' }],
    close: [{ f: 1320, to: 880, d: 0.11, g: 0.06, type: 'sine' }],
    create: [...bell(784, 0, 0.18, 0.08), ...bell(1175, 0.07, 0.3, 0.09)],
    complete: [...bell(1046, 0, 0.5, 0.08), ...bell(1318, 0.045, 0.5, 0.07), ...bell(1568, 0.09, 0.7, 0.08)],
    receive: [...bell(659, 0, 0.3, 0.045), ...bell(988, 0.08, 0.4, 0.04)],
    sync: [...bell(523, 0, 0.6, 0.04), ...bell(784, 0.06, 0.7, 0.035)],
    'ai-start': [{ f: 440, to: 660, d: 0.22, g: 0.04, type: 'triangle', a: 0.03 }],
    'ai-done': [...bell(988, 0, 0.35, 0.05), ...bell(1318, 0.07, 0.45, 0.05)],
    alert: [...bell(1318, 0, 1.1, 0.13), ...bell(1318, 0.28, 1.2, 0.11)],
    error: [{ f: 233, d: 0.25, g: 0.08, type: 'triangle' }, { f: 220, d: 0.3, g: 0.08, type: 'triangle', at: 0.01 }],
    boot: [...drum(110, 0, 0.5, 0.22), ...bell(880, 0.16, 1.1, 0.07), ...bell(1318, 0.24, 1.3, 0.05)],
  },
  taiko: {
    tick: wood(1900, 0, 0.06),
    open: [...wood(1300, 0, 0.06), ...wood(1700, 0.04, 0.05)],
    close: [...wood(1700, 0, 0.05), ...wood(1300, 0.04, 0.05)],
    create: drum(190, 0, 0.14, 0.2),
    complete: [...drum(150, 0, 0.26, 0.26), ...wood(1500, 0.015, 0.05)],
    receive: drum(240, 0, 0.12, 0.1),
    sync: [...drum(200, 0, 0.18, 0.09), ...drum(160, 0.1, 0.22, 0.08)],
    'ai-start': wood(900, 0, 0.05),
    'ai-done': [...wood(1100, 0, 0.05), ...drum(220, 0.03, 0.15, 0.1)],
    alert: [...drum(170, 0, 0.3, 0.3), ...drum(170, 0.22, 0.3, 0.26), ...bell(1046, 0.3, 0.9, 0.06)],
    error: [...drum(90, 0, 0.3, 0.25), ...wood(500, 0.01, 0.05)],
    boot: [...drum(90, 0, 0.7, 0.4), ...drum(70, 0.2, 0.9, 0.32), ...wood(1600, 0.2, 0.04)],
  },
  circuito: {
    tick: blip(2400, 0, 0.025, 0.025),
    open: [...blip(1200, 0, 0.04, 0.03), ...blip(1800, 0.045, 0.05, 0.03)],
    close: [...blip(1800, 0, 0.04, 0.025), ...blip(1200, 0.045, 0.05, 0.025)],
    create: blip(900, 0, 0.12, 0.035, 1800),
    complete: [...blip(1046, 0, 0.06, 0.035), ...blip(1568, 0.06, 0.06, 0.035), ...blip(2093, 0.12, 0.12, 0.035)],
    receive: blip(700, 0, 0.08, 0.02, 1100),
    sync: [...blip(600, 0, 0.06, 0.02), ...blip(900, 0.07, 0.08, 0.02)],
    'ai-start': blip(300, 0, 0.2, 0.02, 900),
    'ai-done': blip(1400, 0, 0.12, 0.025, 900),
    alert: [...blip(1568, 0, 0.12, 0.05), ...blip(1568, 0.18, 0.12, 0.05), ...blip(2093, 0.36, 0.2, 0.05)],
    error: blip(180, 0, 0.25, 0.05, 120),
    boot: [...blip(110, 0, 0.35, 0.05, 220), ...blip(880, 0.3, 0.08, 0.03), ...blip(1760, 0.38, 0.14, 0.025)],
  },
};

type Saved = { on: boolean; volume: number; pack: Pack; cats: Record<Category, boolean> };
const KEY = 'tanden.sound';
const DEFAULTS: Saved = { on: true, volume: 0.5, pack: 'cristal', cats: { interface: true, atividade: true, avisos: true } };

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!s) return structuredClone(DEFAULTS);
    return {
      on: typeof s.on === 'boolean' ? s.on : DEFAULTS.on,
      volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULTS.volume,
      pack: PACKS.some((p) => p.id === s.pack) ? s.pack! : DEFAULTS.pack,
      cats: { ...DEFAULTS.cats, ...(s.cats ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

class Sound {
  on = $state(DEFAULTS.on);
  volume = $state(DEFAULTS.volume);
  pack = $state<Pack>(DEFAULTS.pack);
  cats = $state<Record<Category, boolean>>({ ...DEFAULTS.cats });

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private recent: number[] = [];

  constructor() {
    const s = load();
    this.on = s.on;
    this.volume = s.volume;
    this.pack = s.pack;
    this.cats = s.cats;
    // o navegador só libera áudio depois de um gesto; o primeiro toque destrava
    if (typeof addEventListener === 'function') {
      const unlock = () => { void this.context()?.resume(); };
      addEventListener('pointerdown', unlock, { capture: true, passive: true });
      addEventListener('keydown', unlock, { capture: true });
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx({ latencyHint: 'interactive' });
      // compressor + passa-baixa: nada estoura e nada fica estridente
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000;
      const master = ctx.createGain();
      master.gain.value = this.curve(this.volume);
      master.connect(comp).connect(lp).connect(ctx.destination);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = buf;
      return ctx;
    } catch {
      return null;
    }
  }

  /** volume percebido é logarítmico: o meio do controle soa como meio */
  private curve(v: number): number {
    return v * v * 1.6;
  }

  /** Toca um som, se a categoria estiver ligada e ele não tiver tocado agorinha. */
  play(name: SoundName, opts: { force?: boolean } = {}): void {
    if (!opts.force && (!this.on || !this.cats[CATEGORY[name]] || this.volume <= 0)) return;
    if (typeof document !== 'undefined' && document.hidden && name !== 'alert') return;
    const now = performance.now();
    if (!opts.force && now - (this.last.get(name) ?? -1e9) < GAP[name]) return;
    this.recent = this.recent.filter((t) => now - t < 1000);
    if (!opts.force && this.recent.length >= 8) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    if (ctx.state !== 'running') {
      // sem gesto ainda: não acumula sons para tocar todos de uma vez depois
      void ctx.resume();
      return;
    }
    this.last.set(name, now);
    this.recent.push(now);
    // variação mínima de altura e volume: o mesmo som nunca soa idêntico
    const cents = (Math.random() - 0.5) * 24;
    const gainVar = 0.9 + Math.random() * 0.15;
    const t0 = ctx.currentTime + 0.005;
    for (const v of SOUNDS[this.pack][name]) this.voice(ctx, v, t0, cents, gainVar);
  }

  private voice(ctx: AudioContext, v: Voice, t0: number, cents: number, gainVar: number): void {
    const start = t0 + (v.at ?? 0);
    const a = v.a ?? 0.006;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(v.g * gainVar, start + a);
    env.gain.exponentialRampToValueAtTime(0.0001, start + a + v.d);
    env.connect(this.master!);
    const end = start + a + v.d + 0.05;
    if (v.type === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = v.f;
      bp.Q.value = v.q ?? 1;
      src.connect(bp).connect(env);
      src.start(start);
      src.stop(end);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = v.type ?? 'sine';
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(v.f, start);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, start + a + v.d * 0.8);
    let out: AudioNode = osc;
    if (osc.type === 'square' || osc.type === 'sawtooth') {
      // ondas de borda dura passam por um filtro para soarem "de máquina", não de alarme
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.min(6000, v.f * 3);
      osc.connect(f);
      out = f;
    }
    out.connect(env);
    osc.start(start);
    osc.stop(end);
  }

  private save(): void {
    const s: Saved = { on: this.on, volume: this.volume, pack: this.pack, cats: { ...this.cats } };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* vale só nesta sessão */ }
  }

  set(patch: Partial<Saved>): void {
    Object.assign(this, patch);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.curve(this.volume), this.ctx.currentTime, 0.03);
    this.save();
  }

  setCategory(c: Category, on: boolean): void {
    this.cats = { ...this.cats, [c]: on };
    this.save();
  }
}

export const sound = new Sound();
