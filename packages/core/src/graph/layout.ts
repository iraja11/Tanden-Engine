/*
 * Layout de forças para grafos grandes (milhares de nós), sem dependências.
 * Repulsão por Barnes-Hut (quadtree, O(n log n)), molas nas ligações,
 * gravidade para o centro e esfriamento como no d3-force: roda alguns
 * passos por quadro e para sozinho quando assenta.
 */

export interface LayoutParams {
  /** força com que os nós se afastam */
  repel: number;
  /** comprimento das ligações */
  linkDistance: number;
  /** quanto as ligações puxam (0..1) */
  linkStrength: number;
  /** puxão para o centro (segura ilhas soltas por perto) */
  gravity: number;
  /** precisão do Barnes-Hut: maior = mais rápido e menos exato */
  theta: number;
}

export const DEFAULT_LAYOUT: LayoutParams = { repel: 1, linkDistance: 70, linkStrength: 1, gravity: 1, theta: 0.9 };

export class ForceLayout {
  ids: string[] = [];
  index = new Map<string, number>();
  x = new Float64Array(0);
  y = new Float64Array(0);
  private vx = new Float64Array(0);
  private vy = new Float64Array(0);
  /** nó preso (arrastado): não se mexe */
  fixed = new Uint8Array(0);
  private src = new Uint32Array(0);
  private dst = new Uint32Array(0);
  private bias = new Float64Array(0);
  private lstr = new Float64Array(0);
  degree = new Uint32Array(0);
  alpha = 1;
  alphaMin = 0.002;
  alphaTarget = 0;
  private alphaDecay = 1 - Math.pow(0.002, 1 / 300);
  params: LayoutParams = { ...DEFAULT_LAYOUT };

  // quadtree em vetores (reaproveitados entre passos)
  private qcap = 0;
  private qChild = new Int32Array(0);
  private qBody = new Int32Array(0);
  private qMass = new Float64Array(0);
  private qX = new Float64Array(0);
  private qY = new Float64Array(0);
  private qSize = new Float64Array(0);
  private qCount = 0;

  get size(): number {
    return this.ids.length;
  }

  /**
   * Troca o grafo. Quem já existia fica onde estava; os novos nascem perto de
   * um vizinho que já tem lugar (ou numa espiral em volta do centro).
   */
  setGraph(ids: readonly string[], edges: readonly (readonly [string, string])[], seed?: ReadonlyMap<string, { x: number; y: number }>): void {
    const old = new Map<string, { x: number; y: number }>(seed ?? []);
    this.ids.forEach((id, i) => old.set(id, { x: this.x[i]!, y: this.y[i]! }));
    const oldFixed = new Set(this.ids.filter((_, i) => this.fixed[i]));
    const n = ids.length;
    this.ids = [...ids];
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.fixed = new Uint8Array(n);
    const pairs: [number, number][] = [];
    for (const [a, b] of edges) {
      const i = this.index.get(a);
      const j = this.index.get(b);
      if (i === undefined || j === undefined || i === j) continue;
      pairs.push([i, j]);
    }
    this.src = new Uint32Array(pairs.map((p) => p[0]));
    this.dst = new Uint32Array(pairs.map((p) => p[1]));
    this.degree = new Uint32Array(n);
    for (const [a, b] of pairs) {
      this.degree[a]!++;
      this.degree[b]!++;
    }
    // como no d3: ligações de nós muito ligados puxam menos
    this.bias = new Float64Array(pairs.length);
    this.lstr = new Float64Array(pairs.length);
    pairs.forEach(([a, b], k) => {
      this.bias[k] = this.degree[a]! / (this.degree[a]! + this.degree[b]!);
      this.lstr[k] = 1 / Math.min(this.degree[a]!, this.degree[b]!);
    });
    let fresh = 0;
    const placed = new Uint8Array(n);
    this.ids.forEach((id, i) => {
      const p = old.get(id);
      if (p) {
        this.x[i] = p.x;
        this.y[i] = p.y;
        placed[i] = 1;
        if (oldFixed.has(id)) this.fixed[i] = 1;
      } else fresh++;
    });
    // novos: perto de um vizinho com lugar
    for (let k = 0; k < pairs.length; k++) {
      for (const [a, b] of [[pairs[k]![0], pairs[k]![1]], [pairs[k]![1], pairs[k]![0]]] as const) {
        if (!placed[a] && placed[b]) {
          const ang = Math.random() * Math.PI * 2;
          this.x[a] = this.x[b]! + Math.cos(ang) * this.params.linkDistance * 0.5;
          this.y[a] = this.y[b]! + Math.sin(ang) * this.params.linkDistance * 0.5;
          placed[a] = 2;
        }
      }
    }
    // o resto: espiral de girassol (como o d3), estável entre aberturas
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue;
      const r = 10 * Math.sqrt(0.5 + s);
      const a = s * Math.PI * (3 - Math.sqrt(5));
      this.x[i] = r * Math.cos(a);
      this.y[i] = r * Math.sin(a);
      s++;
    }
    this.alpha = fresh === n ? 1 : fresh ? Math.max(this.alpha, 0.5) : Math.max(this.alpha, 0.15);
  }

  reheat(alpha = 0.6): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  get settled(): boolean {
    return this.alpha < this.alphaMin && this.alphaTarget === 0;
  }

  /** Um passo da simulação. */
  tick(): void {
    const n = this.size;
    if (!n) return;
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;
    const { x, y, vx, vy } = this;
    const P = this.params;

    // molas
    const dist = P.linkDistance;
    for (let k = 0; k < this.src.length; k++) {
      const a = this.src[k]!;
      const b = this.dst[k]!;
      let dx = x[b]! + vx[b]! - x[a]! - vx[a]!;
      let dy = y[b]! + vy[b]! - y[a]! - vy[a]!;
      if (dx === 0 && dy === 0) dx = 1e-3;
      let l = Math.sqrt(dx * dx + dy * dy);
      l = ((l - dist) / l) * alpha * this.lstr[k]! * P.linkStrength;
      dx *= l;
      dy *= l;
      const bb = this.bias[k]!;
      vx[b]! -= dx * bb;
      vy[b]! -= dy * bb;
      vx[a]! += dx * (1 - bb);
      vy[a]! += dy * (1 - bb);
    }

    // repulsão (Barnes-Hut)
    this.buildTree();
    const strength = -30 * P.repel;
    const theta2 = P.theta * P.theta;
    const stack = new Int32Array(64 * 4 + 64);
    for (let i = 0; i < n; i++) {
      let sp = 0;
      stack[sp++] = 0;
      const xi = x[i]!;
      const yi = y[i]!;
      let fx = 0;
      let fy = 0;
      while (sp) {
        const q = stack[--sp]!;
        const m = this.qMass[q]!;
        if (!m) continue;
        const dx = this.qX[q]! / m - xi;
        const dy = this.qY[q]! / m - yi;
        let l = dx * dx + dy * dy;
        const w = this.qSize[q]!;
        const leaf = this.qBody[q]! >= 0;
        if (leaf || (w * w) / theta2 < l) {
          if (leaf && this.qBody[q] === i) continue;
          if (l < 1) l = Math.sqrt(l) || 1;
          // força ∝ 1/d, só até ~ 2000 px
          if (l < 4e6) {
            const k = (strength * alpha * m) / l;
            fx += dx * k;
            fy += dy * k;
          }
          continue;
        }
        for (let c = 0; c < 4; c++) {
          const ch = this.qChild[q * 4 + c]!;
          if (ch >= 0 && sp < stack.length) stack[sp++] = ch;
        }
      }
      vx[i]! += fx;
      vy[i]! += fy;
    }

    // gravidade fraca para o centro (forceX/forceY)
    const g = 0.04 * P.gravity * alpha;
    for (let i = 0; i < n; i++) {
      vx[i]! -= x[i]! * g;
      vy[i]! -= y[i]! * g;
    }

    // integra
    const decay = 0.6;
    for (let i = 0; i < n; i++) {
      if (this.fixed[i]) {
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      vx[i]! *= decay;
      vy[i]! *= decay;
      x[i]! += vx[i]!;
      y[i]! += vy[i]!;
    }
  }

  /** Roda até assentar ou até `max` passos (para abrir já arrumado). */
  run(max = 300): void {
    for (let s = 0; s < max && !this.settled; s++) this.tick();
  }

  private ensureTree(cap: number): void {
    if (cap <= this.qcap) return;
    this.qcap = cap;
    this.qChild = new Int32Array(cap * 4);
    this.qBody = new Int32Array(cap);
    this.qMass = new Float64Array(cap);
    this.qX = new Float64Array(cap);
    this.qY = new Float64Array(cap);
    this.qSize = new Float64Array(cap);
  }

  private newQuad(size: number): number {
    if (this.qCount >= this.qcap) {
      // cresce preservando o que já foi feito
      const cap = this.qcap * 2;
      const ch = new Int32Array(cap * 4);
      ch.set(this.qChild);
      this.qChild = ch;
      const bd = new Int32Array(cap);
      bd.set(this.qBody);
      this.qBody = bd;
      const f = (a: Float64Array) => {
        const r = new Float64Array(cap);
        r.set(a);
        return r;
      };
      this.qMass = f(this.qMass);
      this.qX = f(this.qX);
      this.qY = f(this.qY);
      this.qSize = f(this.qSize);
      this.qcap *= 2;
    }
    const q = this.qCount++;
    this.qChild.fill(-1, q * 4, q * 4 + 4);
    this.qBody[q] = -1;
    this.qMass[q] = 0;
    this.qX[q] = 0;
    this.qY[q] = 0;
    this.qSize[q] = size;
    return q;
  }

  private buildTree(): void {
    const n = this.size;
    const { x, y } = this;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (x[i]! < x0) x0 = x[i]!;
      if (x[i]! > x1) x1 = x[i]!;
      if (y[i]! < y0) y0 = y[i]!;
      if (y[i]! > y1) y1 = y[i]!;
    }
    const size = Math.max(x1 - x0, y1 - y0, 1) * 1.0001;
    this.ensureTree(n * 3 + 8);
    this.qCount = 0;
    const root = this.newQuad(size);
    for (let i = 0; i < n; i++) {
      let q = root;
      let qx = x0;
      let qy = y0;
      let s = size;
      let depth = 0;
      for (;;) {
        this.qMass[q]! += 1;
        this.qX[q]! += x[i]!;
        this.qY[q]! += y[i]!;
        const body = this.qBody[q]!;
        const empty = this.qMass[q] === 1;
        if (empty) {
          this.qBody[q] = i;
          break;
        }
        if (body >= 0) {
          // folha ocupada: desce o morador antigo um nível (ou empilha se forem o mesmo ponto)
          if (depth > 40 || (x[body] === x[i] && y[body] === y[i])) {
            break; // pontos coincidentes ficam juntos no mesmo nó (massa somada)
          }
          this.qBody[q] = -1;
          const h = s / 2;
          const c = (x[body]! >= qx + h ? 1 : 0) + (y[body]! >= qy + h ? 2 : 0);
          const nq = this.newQuad(h);
          this.qChild[q * 4 + c] = nq;
          this.qMass[nq] = 1;
          this.qX[nq] = x[body]!;
          this.qY[nq] = y[body]!;
          this.qBody[nq] = body;
        }
        const h = s / 2;
        const right = x[i]! >= qx + h;
        const down = y[i]! >= qy + h;
        const c = (right ? 1 : 0) + (down ? 2 : 0);
        if (right) qx += h;
        if (down) qy += h;
        s = h;
        depth++;
        let child = this.qChild[q * 4 + c]!;
        if (child < 0) {
          child = this.newQuad(s);
          this.qChild[q * 4 + c] = child;
        }
        q = child;
      }
    }
  }
}
