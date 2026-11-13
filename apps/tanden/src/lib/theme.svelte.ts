// Aparência do Tanden em duas camadas:
//  - cores (fundo, tinta, destaque), que viram variáveis CSS no <html>;
//  - estilo (Tanden, Aero, Terminal, Papel) e as peças de forma (cantos, bordas,
//    sombras, textura, papel de parede, vidro), que viram atributos data-* no
//    <html> e são desenhadas em skins.css.
// Cada módulo segue o tema sem saber dele. Fica salvo por aparelho: o celular
// pode ter um tema e o PC outro.

export type Motion = 'completo' | 'reduzido' | 'parado';
export type Corners = 'redondos' | 'retos' | 'mao';
export type Borders = 'finas' | 'grossas';
export type Shadows = 'suaves' | 'nenhuma' | 'solidas';
export type Texture = 'nenhuma' | 'crt' | 'grao' | 'pauta' | 'quadriculado';
export type Wall = 'liso' | 'aurora' | 'imagem';

/** nomes das variáveis que o tema define (os plugins recebem os valores atuais) */
export const THEME_VARS: string[] = [];

export type Colors = { void: string; surface: string; surface2: string; line: string; ink: string; muted: string; silver: string };
export type ColorKey = keyof Colors;
export type Base = Colors & { id: string; label: string; dark: boolean };

export const BASES: Base[] = [
  { id: 'carvao', label: 'Carvão', dark: true, void: '#0c0c0e', surface: '#151518', surface2: '#1c1c20', line: '#2b2a31', ink: '#ecebf0', muted: '#8c8a96', silver: '#c8c7cf' },
  { id: 'abissal', label: 'Abissal', dark: true, void: '#090b11', surface: '#10131b', surface2: '#161a24', line: '#252b3a', ink: '#e6e9f2', muted: '#8189a0', silver: '#c3c9d8' },
  { id: 'grafite', label: 'Grafite', dark: true, void: '#141416', surface: '#1b1b1f', surface2: '#232328', line: '#34333b', ink: '#eeedf2', muted: '#97949f', silver: '#cfced6' },
  { id: 'fosforo', label: 'Fósforo', dark: true, void: '#020803', surface: '#041007', surface2: '#08190d', line: '#14522a', ink: '#6dff8f', muted: '#2f9c51', silver: '#a6ffbb' },
  { id: 'ambar', label: 'Âmbar', dark: true, void: '#0a0600', surface: '#120b01', surface2: '#1c1203', line: '#5a3a06', ink: '#ffb733', muted: '#a86f12', silver: '#ffd27a' },
  { id: 'papel', label: 'Areia', dark: false, void: '#f4f1ea', surface: '#fbf9f4', surface2: '#ece8de', line: '#d9d3c5', ink: '#1d1b18', muted: '#706a5e', silver: '#4a463f' },
  { id: 'gelo', label: 'Gelo', dark: false, void: '#eef1f5', surface: '#f8fafc', surface2: '#e3e8ef', line: '#cfd6e0', ink: '#141821', muted: '#5f6878', silver: '#3c4452' },
  { id: 'vista', label: 'Vista', dark: false, void: '#e6eef7', surface: '#ffffff', surface2: '#eef4fb', line: '#b5c7dc', ink: '#1b1b1b', muted: '#5a6878', silver: '#1e3287' },
  { id: 'folha', label: 'Folha', dark: false, void: '#e9e2d0', surface: '#fffdf7', surface2: '#f4efe2', line: '#3b352c', ink: '#23201a', muted: '#6b6253', silver: '#3a3428' },
];

/** id da base montada à mão (cores em `custom`) */
export const FREE = 'livre';
export const COLOR_KEYS: { id: ColorKey; label: string }[] = [
  { id: 'void', label: 'Fundo' },
  { id: 'surface', label: 'Painel' },
  { id: 'surface2', label: 'Botão' },
  { id: 'line', label: 'Linha' },
  { id: 'ink', label: 'Texto' },
  { id: 'silver', label: 'Texto 2' },
  { id: 'muted', label: 'Apagado' },
];

export type Preset = { id: string; label: string; base: string; accent: string };

/** Paletas prontas (só cor). Escolher uma e depois mexer em qualquer peça vira "Personalizado". */
export const PRESETS: Preset[] = [
  { id: 'nucleo', label: 'Núcleo', base: 'carvao', accent: '#ff8a3d' },
  { id: 'seth', label: 'Seth', base: 'abissal', accent: '#ff7a1f' },
  { id: 'satsui', label: 'Satsui', base: 'carvao', accent: '#ff4f5e' },
  { id: 'hadou', label: 'Hadou', base: 'abissal', accent: '#4cc9f0' },
  { id: 'jade', label: 'Jade', base: 'grafite', accent: '#3ddc97' },
  { id: 'fosforo', label: 'Fósforo', base: 'fosforo', accent: '#33ff77' },
  { id: 'ambar', label: 'Âmbar', base: 'ambar', accent: '#ffb000' },
  { id: 'areia', label: 'Areia', base: 'papel', accent: '#e0650f' },
  { id: 'gelo', label: 'Gelo', base: 'gelo', accent: '#2f6fed' },
  { id: 'vista', label: 'Vista', base: 'vista', accent: '#3399ff' },
  { id: 'caneta', label: 'Caneta', base: 'folha', accent: '#2546b0' },
];

/** Letras. Servem tanto para o texto quanto para os títulos. */
export const FONTS = [
  { id: 'manrope', label: 'Manrope', css: '"Manrope", "Segoe UI", system-ui, sans-serif' },
  { id: 'sistema', label: 'Sistema', css: 'system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif' },
  { id: 'segoe', label: 'Segoe', css: '"Segoe UI", "Open Sans", Tahoma, Verdana, sans-serif' },
  { id: 'serifa', label: 'Serifada', css: '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Serif", serif' },
  { id: 'mono', label: 'Mono', css: '"JetBrains Mono", ui-monospace, monospace' },
  { id: 'chakra', label: 'Chakra', css: '"Chakra Petch", "Segoe UI", system-ui, sans-serif' },
  { id: 'vt', label: 'VT323', css: '"VT323", "JetBrains Mono", ui-monospace, monospace' },
  { id: 'maquina', label: 'Máquina', css: '"Courier Prime", "Courier New", ui-monospace, monospace' },
  { id: 'mao', label: 'À mão', css: '"Caveat", "Segoe Print", "Comic Sans MS", cursive' },
] as const;
export type Font = (typeof FONTS)[number]['id'];
/** letras de olho pequeno: com elas a interface iguala a altura das minúsculas */
const SMALL_EYE: Font[] = ['vt', 'mao', 'maquina'];
export const ZOOM = { min: 0.75, max: 1.5, step: 0.05 };

export const CORNERS: { id: Corners; label: string; hint: string }[] = [
  { id: 'redondos', label: 'Redondos', hint: 'cantos macios, como o Tanden nasceu' },
  { id: 'retos', label: 'Retos', hint: 'tudo em ângulo reto, sem exceção' },
  { id: 'mao', label: 'À mão', hint: 'contornos tortos, de caneta' },
];
export const BORDERS: { id: Borders; label: string }[] = [
  { id: 'finas', label: 'Finas' },
  { id: 'grossas', label: 'Grossas' },
];
export const SHADOWS: { id: Shadows; label: string; hint: string }[] = [
  { id: 'suaves', label: 'Suaves', hint: 'sombras esfumadas' },
  { id: 'nenhuma', label: 'Nenhuma', hint: 'tudo chapado' },
  { id: 'solidas', label: 'Sólidas', hint: 'sombra dura deslocada, de recorte' },
];
export const TEXTURES: { id: Texture; label: string }[] = [
  { id: 'nenhuma', label: 'Nenhuma' },
  { id: 'crt', label: 'Tubo CRT' },
  { id: 'grao', label: 'Grão' },
  { id: 'pauta', label: 'Pauta' },
  { id: 'quadriculado', label: 'Quadriculado' },
];
export const WALLS: { id: Wall; label: string }[] = [
  { id: 'liso', label: 'Liso' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'imagem', label: 'Imagem' },
];

/** O que um estilo decide de uma vez (depois cada peça pode ser trocada). */
type Look = {
  base: string; accent: string; font: Font; display: Font; glow: boolean;
  corners: Corners; borders: Borders; shadows: Shadows; texture: Texture; wall: Wall; glass: boolean;
  /** quanto o fundo cobre o papel de parede (0 = imagem pura) */
  veil: number;
};
export type Skin = { id: string; label: string; hint: string; look: Look };

/** Estilos: mudam a cara inteira do app, não só a cor. */
export const SKINS: Skin[] = [
  { id: 'tanden', label: 'Tanden', hint: 'o original: escuro, macio, com brilho',
    look: { base: 'carvao', accent: '#ff8a3d', font: 'manrope', display: 'chakra', glow: true, corners: 'redondos', borders: 'finas', shadows: 'suaves', texture: 'nenhuma', wall: 'liso', glass: false, veil: 0.6 } },
  { id: 'aero', label: 'Aero', hint: 'PC dos anos 2000: vidro, brilho e botões envernizados',
    look: { base: 'vista', accent: '#3399ff', font: 'segoe', display: 'segoe', glow: true, corners: 'redondos', borders: 'finas', shadows: 'suaves', texture: 'nenhuma', wall: 'aurora', glass: true, veil: 0 } },
  { id: 'terminal', label: 'Terminal', hint: 'fósforo verde, linhas de tubo e nada redondo',
    look: { base: 'fosforo', accent: '#33ff77', font: 'vt', display: 'vt', glow: true, corners: 'retos', borders: 'finas', shadows: 'nenhuma', texture: 'crt', wall: 'liso', glass: false, veil: 0.7 } },
  { id: 'papel', label: 'Papel', hint: 'caderno: tinta, grão de papel e traço à mão',
    look: { base: 'folha', accent: '#2546b0', font: 'serifa', display: 'mao', glow: false, corners: 'mao', borders: 'grossas', shadows: 'solidas', texture: 'grao', wall: 'liso', glass: false, veil: 0.5 } },
];
export const VEIL = { min: 0, max: 0.9 };

type Saved = Look & {
  skin: string; motion: Motion; zoom: number;
  /** cores da base "livre" */
  custom: Colors | null;
};

const KEY = 'tanden.theme';
const WALL_KEY = 'tanden.wallpaper';
const DEFAULTS: Saved = { skin: 'tanden', ...SKINS[0]!.look, motion: 'completo', zoom: 1, custom: null };
const clampZoom = (z: number) => Math.round(Math.min(ZOOM.max, Math.max(ZOOM.min, z)) * 100) / 100;
const clampVeil = (v: number) => Math.round(Math.min(VEIL.max, Math.max(VEIL.min, v)) * 100) / 100;
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], fb: T): T => (list.some((x) => x.id === v) ? (v as T) : fb);

function readColors(v: unknown): Colors | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out = {} as Colors;
  for (const { id } of COLOR_KEYS) {
    if (!isHex(o[id])) return null;
    out[id] = o[id];
  }
  return out;
}

function load(): Saved {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d = { ...DEFAULTS, motion: reduced ? 'reduzido' : DEFAULTS.motion } as Saved;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Record<string, unknown>;
    const custom = readColors(s.custom);
    // quem salvou antes dos estilos: a letra dos títulos era sempre a Chakra
    return {
      skin: oneOf(s.skin, SKINS, d.skin),
      base: (s.base === FREE && custom) || BASES.some((b) => b.id === s.base) ? (s.base as string) : d.base,
      accent: isHex(s.accent) ? s.accent : d.accent,
      motion: s.motion === 'completo' || s.motion === 'reduzido' || s.motion === 'parado' ? s.motion : d.motion,
      glow: typeof s.glow === 'boolean' ? s.glow : d.glow,
      font: oneOf(s.font, FONTS, d.font),
      display: oneOf(s.display, FONTS, d.display),
      zoom: typeof s.zoom === 'number' && Number.isFinite(s.zoom) ? clampZoom(s.zoom) : d.zoom,
      corners: oneOf(s.corners, CORNERS, d.corners),
      borders: oneOf(s.borders, BORDERS, d.borders),
      shadows: oneOf(s.shadows, SHADOWS, d.shadows),
      texture: oneOf(s.texture, TEXTURES, d.texture),
      wall: oneOf(s.wall, WALLS, d.wall),
      glass: typeof s.glass === 'boolean' ? s.glass : d.glass,
      veil: typeof s.veil === 'number' && Number.isFinite(s.veil) ? clampVeil(s.veil) : d.veil,
      custom,
    };
  } catch {
    return d;
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

/** Reduz a imagem escolhida para caber no armazenamento do aparelho. */
async function shrink(file: Blob, max = 1920): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.82);
}

class Theme {
  skin = $state(DEFAULTS.skin);
  base = $state(DEFAULTS.base);
  accent = $state(DEFAULTS.accent);
  motion = $state<Motion>(DEFAULTS.motion);
  glow = $state(DEFAULTS.glow);
  font = $state<Font>(DEFAULTS.font);
  /** letra dos títulos, rótulos e números grandes */
  display = $state<Font>(DEFAULTS.display);
  /** tamanho da interface inteira (1 = 100%) */
  zoom = $state(DEFAULTS.zoom);
  corners = $state<Corners>(DEFAULTS.corners);
  borders = $state<Borders>(DEFAULTS.borders);
  shadows = $state<Shadows>(DEFAULTS.shadows);
  texture = $state<Texture>(DEFAULTS.texture);
  wall = $state<Wall>(DEFAULTS.wall);
  glass = $state(DEFAULTS.glass);
  veil = $state(DEFAULTS.veil);
  custom = $state<Colors | null>(DEFAULTS.custom);
  /** papel de parede próprio (data URL), guardado à parte por ser grande */
  wallImage = $state<string | null>(null);
  /** sobe a cada troca; o terminal e o editor releem as cores */
  rev = $state(0);

  constructor() {
    Object.assign(this, load());
    try { this.wallImage = localStorage.getItem(WALL_KEY); } catch { /* sem armazenamento */ }
  }

  get dark(): boolean {
    return this.current.dark;
  }
  get current(): Base {
    if (this.base === FREE && this.custom) return { id: FREE, label: 'Livre', dark: lum(this.custom.void) < 0.3, ...this.custom };
    return BASES.find((b) => b.id === this.base) ?? BASES[0]!;
  }
  get preset(): string {
    return PRESETS.find((p) => p.base === this.base && p.accent.toLowerCase() === this.accent.toLowerCase())?.id ?? 'custom';
  }
  get currentSkin(): Skin {
    return SKINS.find((s) => s.id === this.skin) ?? SKINS[0]!;
  }
  /** alguma peça foi trocada depois de escolher o estilo */
  get tweaked(): boolean {
    const l = this.currentSkin.look;
    return (Object.keys(l) as (keyof Look)[]).some((k) => String(this[k]).toLowerCase() !== String(l[k]).toLowerCase());
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
    const fontCss = (id: Font) => (FONTS.find((f) => f.id === id) ?? FONTS[0]).css;
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
      '--f-body': fontCss(this.font),
      '--f-display': fontCss(this.display),
      '--wall-veil': String(this.veil),
    };
    // o terminal de fósforo brilha na própria tinta; desligar o brilho apaga
    if (this.glow) vars['--phosphor'] = alpha(b.ink, 0.45);
    else vars['--phosphor'] = 'transparent';
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
    this.applyWall(sheet);
    // quem desenha em canvas (grafo) observa o style do <html> para reler as cores
    root.style.setProperty('--theme-rev', String(this.rev + 1));
    root.style.colorScheme = b.dark ? 'dark' : 'light';
    const ds = root.dataset;
    ds.motion = this.motion;
    ds.theme = b.dark ? 'dark' : 'light';
    ds.skin = this.skin;
    ds.corners = this.corners;
    ds.borders = this.borders;
    ds.shadows = this.shadows;
    ds.texture = this.texture;
    ds.wall = this.wall === 'imagem' && !this.wallImage ? 'liso' : this.wall;
    ds.glass = this.glass ? 'on' : 'off';
    ds.glow = this.glow ? 'on' : 'off';
    if (SMALL_EYE.includes(this.font) || SMALL_EYE.includes(this.display)) ds.fit = this.font;
    else delete ds.fit;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', b.void);
    this.applyZoom();
    this.rev++;
  }

  private shownWall: string | null = null;
  /** a imagem fica numa folha à parte: é grande e quase nunca muda */
  private applyWall(after: HTMLStyleElement): void {
    if (this.shownWall === this.wallImage) return;
    this.shownWall = this.wallImage;
    let el = document.getElementById('tanden-wall') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'tanden-wall';
      after.after(el);
    }
    el.textContent = this.wallImage ? `:root { --wall-img: url("${this.wallImage}"); }` : '';
  }

  /** Escolhe uma imagem como papel de parede. Devolve falso se não coube no aparelho. */
  async setWallpaper(file: Blob): Promise<boolean> {
    const url = await shrink(file);
    this.wallImage = url;
    let kept = true;
    try { localStorage.setItem(WALL_KEY, url); } catch { kept = false; /* vale só nesta sessão */ }
    this.set({ wall: 'imagem' });
    return kept;
  }

  clearWallpaper(): void {
    this.wallImage = null;
    try { localStorage.removeItem(WALL_KEY); } catch { /* nada a apagar */ }
    this.set({ wall: this.wall === 'imagem' ? 'liso' : this.wall });
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
    const s: Saved = {
      skin: this.skin, base: this.base, accent: this.accent, motion: this.motion, glow: this.glow, font: this.font,
      display: this.display, zoom: this.zoom, corners: this.corners, borders: this.borders, shadows: this.shadows,
      texture: this.texture, wall: this.wall, glass: this.glass, veil: this.veil, custom: this.custom,
    };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  }

  /**
   * Troca as peças do tema. Com `from` (ponto do clique), a nova cor se espalha
   * a partir dali num círculo; sem suporte a View Transitions, as cores mudam suave.
   */
  set(patch: Partial<Saved>, from?: { x: number; y: number }): void {
    if (patch.veil !== undefined) patch.veil = clampVeil(patch.veil);
    const run = () => {
      Object.assign(this, patch);
      this.apply();
      this.save();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const visual = 'base' in patch || 'accent' in patch || 'skin' in patch || 'custom' in patch;
    if (visual && from && doc.startViewTransition && this.motion === 'completo') {
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
    if (visual && this.motion !== 'parado') {
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

  /** Veste um estilo inteiro: cores, letras, forma, textura e fundo. */
  useSkin(id: string, from?: { x: number; y: number }): void {
    const s = SKINS.find((x) => x.id === id);
    if (s) this.set({ skin: s.id, ...s.look }, from);
  }

  /** Desfaz as trocas feitas por cima do estilo atual. */
  resetSkin(): void {
    this.useSkin(this.skin);
  }

  /** Muda uma cor da base; a base vira "Livre" com as cores de agora como ponto de partida. */
  setColor(key: ColorKey, value: string): void {
    if (!isHex(value)) return;
    const { id: _id, label: _l, dark: _d, ...now } = this.current;
    this.set({ base: FREE, custom: { ...now, [key]: value } });
  }

  reset(): void {
    this.clearWallpaper();
    this.set({ ...DEFAULTS });
  }

  /** Gimmick: o próximo tema pronto da lista. */
  nextPreset(): void {
    const i = PRESETS.findIndex((p) => p.id === this.preset);
    this.usePreset(PRESETS[(i + 1) % PRESETS.length]!.id, { x: innerWidth / 2, y: innerHeight / 2 });
  }

  /** O próximo estilo da lista (Tanden → Aero → Terminal → Papel). */
  nextSkin(): void {
    const i = SKINS.findIndex((s) => s.id === this.skin);
    this.useSkin(SKINS[(i + 1) % SKINS.length]!.id, { x: innerWidth / 2, y: innerHeight / 2 });
  }

  /** Troca entre claro e escuro mantendo o destaque; volta à base do estilo quando ela serve. */
  toggleDark(): void {
    const own = BASES.find((b) => b.id === this.currentSkin.look.base);
    const target = this.dark ? (own && !own.dark ? own.id : 'papel') : own?.dark ? own.id : 'carvao';
    this.set({ base: target }, { x: innerWidth - 40, y: 40 });
  }
}

export const theme = new Theme();
