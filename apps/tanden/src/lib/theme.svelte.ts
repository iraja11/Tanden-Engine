// Aparência do Tanden: base (fundo e tinta), cor de destaque, brilho e movimento.
// Tudo vira variável CSS no <html>, então cada módulo segue o tema sem saber dele.
// Fica salvo por aparelho: o celular pode ter um tema e o PC outro.

export type Motion = 'completo' | 'reduzido' | 'parado';

/** nomes das variáveis que o tema define (os plugins recebem os valores atuais) */
export const THEME_VARS: string[] = [];

export type Base = {
  id: string;
  label: string;
  dark: boolean;
  void: string; surface: string; surface2: string; line: string;
  ink: string; muted: string; silver: string;
};

export const BASES: Base[] = [
  { id: 'carvao', label: 'Carvão', dark: true, void: '#0c0c0e', surface: '#151518', surface2: '#1c1c20', line: '#2b2a31', ink: '#ecebf0', muted: '#8c8a96', silver: '#c8c7cf' },
  { id: 'abissal', label: 'Abissal', dark: true, void: '#090b11', surface: '#10131b', surface2: '#161a24', line: '#252b3a', ink: '#e6e9f2', muted: '#8189a0', silver: '#c3c9d8' },
  { id: 'grafite', label: 'Grafite', dark: true, void: '#141416', surface: '#1b1b1f', surface2: '#232328', line: '#34333b', ink: '#eeedf2', muted: '#97949f', silver: '#cfced6' },
  { id: 'papel', label: 'Papel', dark: false, void: '#f4f1ea', surface: '#fbf9f4', surface2: '#ece8de', line: '#d9d3c5', ink: '#1d1b18', muted: '#706a5e', silver: '#4a463f' },
  { id: 'gelo', label: 'Gelo', dark: false, void: '#eef1f5', surface: '#f8fafc', surface2: '#e3e8ef', line: '#cfd6e0', ink: '#141821', muted: '#5f6878', silver: '#3c4452' },
];

export type Preset = { id: string; label: string; base: string; accent: string };

/** Temas prontos. Escolher um e depois mexer em qualquer peça vira "Personalizado". */
export const PRESETS: Preset[] = [
  { id: 'nucleo', label: 'Núcleo', base: 'carvao', accent: '#ff8a3d' },
  { id: 'seth', label: 'Seth', base: 'abissal', accent: '#ff7a1f' },
  { id: 'satsui', label: 'Satsui', base: 'carvao', accent: '#ff4f5e' },
  { id: 'hadou', label: 'Hadou', base: 'abissal', accent: '#4cc9f0' },
  { id: 'jade', label: 'Jade', base: 'grafite', accent: '#3ddc97' },
  { id: 'papel', label: 'Papel', base: 'papel', accent: '#e0650f' },
  { id: 'gelo', label: 'Gelo', base: 'gelo', accent: '#2f6fed' },
];

/** Letra do texto (os títulos de seção continuam na fonte do tanden). */
export const FONTS = [
  { id: 'manrope', label: 'Manrope', css: '"Manrope", "Segoe UI", system-ui, sans-serif' },
  { id: 'sistema', label: 'Sistema', css: 'system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif' },
  { id: 'serifa', label: 'Serifada', css: '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", serif' },
  { id: 'mono', label: 'Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  { id: 'chakra', label: 'Chakra', css: '"Chakra Petch", "Segoe UI", system-ui, sans-serif' },
] as const;
export type Font = (typeof FONTS)[number]['id'];
export const ZOOM = { min: 0.75, max: 1.5, step: 0.05 };

type Saved = { base: string; accent: string; motion: Motion; glow: boolean; font: Font; zoom: number };

const KEY = 'tanden.theme';
const DEFAULTS: Saved = { base: 'carvao', accent: '#ff8a3d', motion: 'completo', glow: true, font: 'manrope', zoom: 1 };
const clampZoom = (z: number) => Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, z)) * 100) / 100;

function load(): Saved {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = { ...DEFAULTS, motion: reduced ? 'reduzido' : DEFAULTS.motion } as Saved;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<Saved>;
    return {
      base: BASES.some((b) => b.id === s.base) ? s.base! : base.base,
      accent: /^#[0-9a-f]{6}$/i.test(s.accent ?? '') ? s.accent! : base.accent,
      motion: s.motion === 'completo' || s.motion === 'reduzido' || s.motion === 'parado' ? s.motion : base.motion,
      glow: typeof s.glow === 'boolean' ? s.glow : base.glow,
      font: FONTS.some((f) => f.id === s.font) ? s.font! : base.font,
      zoom: typeof s.zoom === 'number' && Number.isFinite(s.zoom) ? clampZoom(s.zoom) : base.zoom,
    };
  } catch {
    return base;
  }
}

// ── cor ──────────────────────────────────────────────────────────
type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return hex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as RGB);
};
const alpha = (c: string, a: number) => {
  const [r, g, b] = rgb(c);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
/** luminância relativa (WCAG) */
function lum(c: string): number {
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * No tema claro, um laranja vivo some no papel. Escurece o destaque até ele
 * ter contraste de leitura com o fundo, mantendo o tom.
 */
function readableAccent(accent: string, base: Base): string {
  let c = accent;
  for (let i = 0; i < 12 && contrast(c, base.surface) < 3.2; i++) c = mix(c, base.dark ? '#ffffff' : '#000000', 0.12);
  return c;
}

class Theme {
  base = $state(DEFAULTS.base);
  accent = $state(DEFAULTS.accent);
  motion = $state<Motion>(DEFAULTS.motion);
  glow = $state(DEFAULTS.glow);
  font = $state<Font>(DEFAULTS.font);
  /** tamanho da interface inteira (1 = 100%) */
  zoom = $state(DEFAULTS.zoom);
  /** sobe a cada troca; o terminal e o editor releem as cores */
  rev = $state(0);

  constructor() {
    const s = load();
    this.base = s.base;
    this.accent = s.accent;
    this.motion = s.motion;
    this.glow = s.glow;
    this.font = s.font;
    this.zoom = s.zoom;
  }

  get dark(): boolean {
    return this.current.dark;
  }
  get current(): Base {
    return BASES.find((b) => b.id === this.base) ?? BASES[0]!;
  }
  get preset(): string {
    return PRESETS.find((p) => p.base === this.base && p.accent.toLowerCase() === this.accent.toLowerCase())?.id ?? 'custom';
  }

  /** milissegundos de uma transição, já levando o nível de movimento em conta */
  ms(full: number): number {
    return this.motion === 'completo' ? full : this.motion === 'reduzido' ? Math.min(full, 140) : 0;
  }
  get moving(): boolean {
    return this.motion !== 'parado';
  }

  apply(): void {
    const b = this.current;
    const ember = readableAccent(this.accent, b);
    const soft = b.dark ? mix(ember, '#ffffff', 0.45) : mix(ember, '#000000', 0.25);
    const vars: Record<string, string> = {
      '--void': b.void, '--surface': b.surface, '--surface-2': b.surface2, '--line': b.line,
      '--ink': b.ink, '--muted': b.muted, '--silver': b.silver,
      '--ember': ember, '--ember-soft': soft,
      '--ember-glow': this.glow ? alpha(ember, b.dark ? 0.35 : 0.22) : 'transparent',
      '--on-ember': contrast(ember, '#160b03') >= contrast(ember, '#ffffff') ? '#160b03' : '#ffffff',
      '--ok': b.dark ? '#7fd1a8' : '#1f8a5b',
      '--crit': b.dark ? '#ff6b6b' : '#c9302c',
      '--shadow': b.dark ? 'rgba(0, 0, 0, .75)' : 'rgba(40, 32, 20, .18)',
      '--scrim': b.dark ? 'rgba(6, 6, 8, .6)' : 'rgba(40, 36, 30, .25)',
      '--yin': '#0b0b0d', '--yang': '#ecebf0',
      '--dur': `${this.ms(220)}ms`, '--dur-slow': `${this.ms(420)}ms`,
      '--ease': 'cubic-bezier(.2, .8, .2, 1)', '--spring': 'cubic-bezier(.34, 1.4, .64, 1)',
      '--f-body': (FONTS.find((f) => f.id === this.font) ?? FONTS[0]).css,
    };
    const root = document.documentElement;
    // numa folha própria (e não no style do <html>), para os snippets CSS poderem trocar qualquer variável
    let sheet = document.getElementById('tanden-theme') as HTMLStyleElement | null;
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.id = 'tanden-theme';
      const firstSnippet = document.head.querySelector('style[data-snippet]');
      document.head.insertBefore(sheet, firstSnippet);
    }
    sheet.textContent = `:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
    for (const k of Object.keys(vars)) root.style.removeProperty(k);
    THEME_VARS.splice(0, THEME_VARS.length, ...Object.keys(vars));
    // quem desenha em canvas (grafo) observa o style do <html> para reler as cores
    root.style.setProperty('--theme-rev', String(this.rev + 1));
    root.style.colorScheme = b.dark ? 'dark' : 'light';
    root.dataset.motion = this.motion;
    root.dataset.theme = b.dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.void);
    this.applyZoom();
    this.rev++;
  }

  private appliedZoom = 1;
  /** No app, o zoom é o da própria janela (as contas de mouse continuam certas); na web, CSS. */
  private applyZoom(): void {
    if (this.zoom === this.appliedZoom) return;
    this.appliedZoom = this.zoom;
    const z = this.zoom;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(z))
        .catch(() => {
          (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
        });
    } else (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = z === 1 ? '' : String(z);
  }

  zoomBy(delta: number): void {
    this.set({ zoom: delta === 0 ? 1 : clampZoom(this.zoom + delta) });
  }

  private save(): void {
    const s: Saved = { base: this.base, accent: this.accent, motion: this.motion, glow: this.glow, font: this.font, zoom: this.zoom };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  }

  /**
   * Troca as peças do tema. Com `from` (ponto do clique), a nova cor se espalha
   * a partir dali num círculo; sem suporte a View Transitions, as cores mudam suave.
   */
  set(patch: Partial<Saved>, from?: { x: number; y: number }): void {
    const run = () => {
      Object.assign(this, patch);
      this.apply();
      this.save();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const colors = 'base' in patch || 'accent' in patch;
    if (colors && from && doc.startViewTransition && this.motion === 'completo') {
      const t = doc.startViewTransition(run);
      const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
      void t.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`] },
          { duration: 520, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      }).catch(() => {});
      return;
    }
    if (colors && this.motion !== 'parado') {
      const root = document.documentElement;
      root.classList.add('theme-shift');
      setTimeout(() => root.classList.remove('theme-shift'), this.ms(420) + 40);
    }
    run();
  }

  usePreset(id: string, from?: { x: number; y: number }): void {
    const p = PRESETS.find((x) => x.id === id);
    if (p) this.set({ base: p.base, accent: p.accent }, from);
  }

  reset(): void {
    this.set({ ...DEFAULTS });
  }

  /** Gimmick: o próximo tema pronto da lista. */
  nextPreset(): void {
    const i = PRESETS.findIndex((p) => p.id === this.preset);
    this.usePreset(PRESETS[(i + 1) % PRESETS.length]!.id, { x: innerWidth / 2, y: innerHeight / 2 });
  }

  /** Troca entre claro e escuro mantendo o destaque. */
  toggleDark(): void {
    const target = BASES.find((b) => b.dark !== this.dark)!;
    this.set({ base: this.dark ? (BASES.find((b) => b.id === 'papel') ?? target).id : 'carvao' }, { x: innerWidth - 40, y: 40 });
  }
}

export const theme = new Theme();
