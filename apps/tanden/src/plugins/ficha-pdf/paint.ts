/*
 * Desenha uma página da ficha num <canvas>, lendo o layout que o navegador
 * já fez (retângulos e estilos calculados). Não usa iframes nem bibliotecas:
 * a janela do plugin é um iframe sem "allow-same-origin", e o WebKitGTK do
 * app de desktop bloqueia o iframe-clone que bibliotecas como o html2canvas
 * criam.
 *
 * Cobre só o CSS que a folha usa: fundos (cor, imagem "cover", a grade de
 * linhas), bordas sólidas e tracejadas com cantos arredondados, losangos
 * girados (.dia), recorte de overflow e texto (por linha, com as mesmas
 * fontes da prévia, caixa alta e espaçamento entre letras).
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const px = (v: string) => parseFloat(v) || 0;

function radii(cs: CSSStyleDeclaration, b: Box): [number, number, number, number] {
  const max = Math.min(b.w, b.h) / 2;
  const r = (v: string) => Math.min(max, px(v.split(' ')[0] ?? '0'));
  return [r(cs.borderTopLeftRadius), r(cs.borderTopRightRadius), r(cs.borderBottomRightRadius), r(cs.borderBottomLeftRadius)];
}

function roundRect(ctx: CanvasRenderingContext2D, b: Box, [tl, tr, br, bl]: [number, number, number, number]) {
  ctx.beginPath();
  ctx.moveTo(b.x + tl, b.y);
  ctx.lineTo(b.x + b.w - tr, b.y);
  if (tr) ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + tr, tr);
  ctx.lineTo(b.x + b.w, b.y + b.h - br);
  if (br) ctx.arcTo(b.x + b.w, b.y + b.h, b.x + b.w - br, b.y + b.h, br);
  ctx.lineTo(b.x + bl, b.y + b.h);
  if (bl) ctx.arcTo(b.x, b.y + b.h, b.x, b.y + b.h - bl, bl);
  ctx.lineTo(b.x, b.y + tl);
  if (tl) ctx.arcTo(b.x, b.y, b.x + tl, b.y, tl);
  ctx.closePath();
}

const visible = (c: string) => !!c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);

const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: Math.max(0, b.w - 2 * d), h: Math.max(0, b.h - 2 * d) });

export class Painter {
  private ctx: CanvasRenderingContext2D;
  private origin = { x: 0, y: 0 };
  private images = new Map<string, HTMLImageElement>();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Carrega as imagens de fundo (retrato) antes de desenhar. */
  async preload(root: HTMLElement) {
    const urls = new Set<string>();
    for (const e of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(e).backgroundImage);
      if (m) urls.add(m[1]!);
    }
    await Promise.all([...urls].map((u) => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(u, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = u;
    })));
  }

  paint(page: HTMLElement, scale: number) {
    const r = page.getBoundingClientRect();
    this.origin = { x: r.left, y: r.top };
    this.canvas.width = Math.round(r.width * scale);
    this.canvas.height = Math.round(r.height * scale);
    const ctx = this.ctx;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.textBaseline = 'alphabetic';
    this.element(page);
  }

  private box(rect: DOMRect): Box {
    return { x: rect.left - this.origin.x, y: rect.top - this.origin.y, w: rect.width, h: rect.height };
  }

  private element(el: Element) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const ctx = this.ctx;

    if (el.classList.contains('dia')) {
      this.diamond(el as HTMLElement, cs);
      return;
    }

    if (cs.display === 'inline') {
      // marca-texto, código: fundo em cada pedaço de linha
      if (visible(cs.backgroundColor)) {
        ctx.fillStyle = cs.backgroundColor;
        for (const rect of el.getClientRects()) {
          roundRect(ctx, this.box(rect), [2, 2, 2, 2]);
          ctx.fill();
        }
      }
    } else {
      const b = this.box(el.getBoundingClientRect());
      if (b.w <= 0 || b.h <= 0) return;
      const rad = radii(cs, b);
      this.background(cs, b, rad);
      this.borders(cs, b, rad);
      if (cs.overflow !== 'visible' && el.childNodes.length) {
        ctx.save();
        roundRect(ctx, b, rad);
        ctx.clip();
        this.children(el, cs);
        ctx.restore();
        return;
      }
    }
    this.children(el, cs);
  }

  private children(el: Element, cs: CSSStyleDeclaration) {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) this.text(n as Text, cs);
      else if (n.nodeType === Node.ELEMENT_NODE) this.element(n as Element);
    }
  }

  private background(cs: CSSStyleDeclaration, b: Box, rad: [number, number, number, number]) {
    const ctx = this.ctx;
    if (visible(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      roundRect(ctx, b, rad);
      ctx.fill();
    }
    const bg = cs.backgroundImage;
    if (!bg || bg === 'none') return;
    ctx.save();
    roundRect(ctx, b, rad);
    ctx.clip();
    const url = /url\("?([^")]+)"?\)/.exec(bg)?.[1];
    const img = url ? this.images.get(url) : undefined;
    if (img) {
      // background-size: cover, centralizado
      const s = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
    } else if (bg.includes('gradient')) {
      // a grade de linhas (duas linear-gradient de 1px)
      const color = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(bg)?.[1] ?? '#eee8df';
      const step = px(cs.backgroundSize) || 14;
      const off = px(cs.backgroundPositionX ?? '0');
      ctx.fillStyle = color;
      for (let y = b.y + off; y < b.y + b.h; y += step) ctx.fillRect(b.x, y, b.w, 1);
      for (let x = b.x + off; x < b.x + b.w; x += step) ctx.fillRect(x, b.y, 1, b.h);
    }
    ctx.restore();
  }

  private borders(cs: CSSStyleDeclaration, b: Box, rad: [number, number, number, number]) {
    const ctx = this.ctx;
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) => ({
      side: s,
      w: cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === 'none' ? 0 : px(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)),
      color: cs.getPropertyValue(`border-${s.toLowerCase()}-color`),
      style: cs.getPropertyValue(`border-${s.toLowerCase()}-style`),
    }));
    const live = sides.filter((s) => s.w > 0 && visible(s.color));
    if (!live.length) return;
    const rounded = rad.some((r) => r > 0);
    const all = live.length === 4;
    if (all && rounded) {
      // contorno inteiro com a borda mais fina; lados mais grossos ou de outra cor viram uma faixa por dentro
      const base = live.reduce((a, s) => (s.w < a.w ? s : a));
      ctx.strokeStyle = base.color;
      ctx.lineWidth = base.w;
      ctx.setLineDash(base.style === 'dashed' ? [4, 3] : []);
      roundRect(ctx, inset(b, base.w / 2), rad.map((r) => Math.max(0, r - base.w / 2)) as [number, number, number, number]);
      ctx.stroke();
      ctx.setLineDash([]);
      const extra = live.filter((s) => s.w > base.w || s.color !== base.color);
      if (extra.length) {
        ctx.save();
        roundRect(ctx, b, rad);
        ctx.clip();
        for (const s of extra) {
          ctx.fillStyle = s.color;
          if (s.side === 'Top') ctx.fillRect(b.x, b.y, b.w, s.w);
          if (s.side === 'Bottom') ctx.fillRect(b.x, b.y + b.h - s.w, b.w, s.w);
          if (s.side === 'Left') ctx.fillRect(b.x, b.y, s.w, b.h);
          if (s.side === 'Right') ctx.fillRect(b.x + b.w - s.w, b.y, s.w, b.h);
        }
        ctx.restore();
      }
      return;
    }
    for (const s of live) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w;
      ctx.setLineDash(s.style === 'dashed' ? [3, 2.5] : s.style === 'dotted' ? [s.w, s.w] : []);
      ctx.beginPath();
      const h = s.w / 2;
      if (s.side === 'Top') { ctx.moveTo(b.x, b.y + h); ctx.lineTo(b.x + b.w, b.y + h); }
      if (s.side === 'Bottom') { ctx.moveTo(b.x, b.y + b.h - h); ctx.lineTo(b.x + b.w, b.y + b.h - h); }
      if (s.side === 'Left') { ctx.moveTo(b.x + h, b.y); ctx.lineTo(b.x + h, b.y + b.h); }
      if (s.side === 'Right') { ctx.moveTo(b.x + b.w - h, b.y); ctx.lineTo(b.x + b.w - h, b.y + b.h); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Losango: um quadrado girado 45° (o retângulo do layout é a caixa já girada). */
  private diamond(el: HTMLElement, cs: CSSStyleDeclaration) {
    const ctx = this.ctx;
    const b = this.box(el.getBoundingClientRect());
    const side = el.offsetWidth;
    const bw = px(cs.borderTopWidth);
    ctx.save();
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.rotate(Math.PI / 4);
    if (visible(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(-side / 2, -side / 2, side, side);
    }
    if (bw) {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = bw;
      ctx.strokeRect(-side / 2 + bw / 2, -side / 2 + bw / 2, side - bw, side - bw);
    }
    ctx.restore();
  }

  private text(node: Text, cs: CSSStyleDeclaration) {
    const data = node.data;
    if (!data.trim()) return;
    const ctx = this.ctx;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    const spacing = px(cs.letterSpacing);
    const upper = cs.textTransform === 'uppercase';
    const pre = /^pre/.test(cs.whiteSpace);

    // agrupa as palavras por linha (mesmo topo)
    const range = document.createRange();
    const lines: Array<{ start: number; end: number; rect: DOMRect }> = [];
    for (const m of data.matchAll(/\S+/g)) {
      const start = m.index;
      const end = start + m[0].length;
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = range.getClientRects();
      const rect = rects[0];
      if (!rect || !rect.width) continue;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.rect.top - rect.top) < 1 && rects.length === 1) last.end = end;
      else lines.push({ start, end, rect });
    }
    const m = ctx.measureText('Hg');
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    for (const line of lines) {
      let s = data.slice(line.start, line.end);
      if (!pre) s = s.replace(/\s+/g, ' ');
      if (upper) s = s.toLocaleUpperCase('pt-BR');
      const b = this.box(line.rect);
      const y = b.y + (b.h - (asc + desc)) / 2 + asc;
      if (!spacing) {
        ctx.fillText(s, b.x, y);
        continue;
      }
      let x = b.x;
      for (const ch of s) {
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width + spacing;
      }
    }
  }
}
