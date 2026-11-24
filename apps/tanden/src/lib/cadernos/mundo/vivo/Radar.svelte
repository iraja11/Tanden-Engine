<script lang="ts">
  // Radar (teia) de 3 a 8 eixos, valores de 0 a 1. Uma segunda série opcional
  // aparece tracejada por baixo, para comparar (o arquétipo, por exemplo).
  let { eixos, cor = 'var(--ember)', outra, corOutra = 'var(--muted)', size = 200, rotulo }: {
    eixos: Array<{ eixo: string; v: number }>;
    cor?: string;
    outra?: number[];
    corOutra?: string;
    size?: number;
    rotulo?: string;
  } = $props();

  const R = 70;
  const n = $derived(eixos.length);
  const ponto = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [100 + Math.cos(a) * R * v, 100 + Math.sin(a) * R * v] as const;
  };
  const caminho = (vs: number[]) => vs.map((v, i) => ponto(i, Math.max(0.04, Math.min(1, v))).map((x) => x.toFixed(1)).join(',')).join(' ');
  const ancora = (i: number) => {
    const [x] = ponto(i, 1);
    return x < 96 ? 'end' : x > 104 ? 'start' : 'middle';
  };
</script>

<svg class="radar" viewBox="-40 -14 280 228" width={size * 1.4} height={size * 1.14} role="img" aria-label={rotulo ?? eixos.map((e) => `${e.eixo} ${Math.round(e.v * 100)}%`).join(', ')}>
  {#each [0.25, 0.5, 0.75, 1] as r (r)}
    <polygon points={caminho(eixos.map(() => r))} fill="none" stroke="var(--line)" stroke-width={r === 1 ? 1.2 : 0.7} />
  {/each}
  {#each eixos as _, i (i)}
    {@const [x, y] = ponto(i, 1)}
    <line x1="100" y1="100" x2={x} y2={y} stroke="var(--line)" stroke-width=".7" />
  {/each}
  {#if outra}<polygon points={caminho(outra)} fill="none" stroke={corOutra} stroke-width="1.4" stroke-dasharray="4 3" />{/if}
  <polygon class="area" points={caminho(eixos.map((e) => e.v))} fill={cor} fill-opacity=".22" stroke={cor} stroke-width="2" stroke-linejoin="round" />
  {#each eixos as e, i (e.eixo)}
    {@const [x, y] = ponto(i, Math.max(0.04, Math.min(1, e.v)))}
    {@const [lx, ly] = ponto(i, 1.2)}
    <circle cx={x} cy={y} r="3" fill={cor} />
    <text x={lx} y={ly + 3} text-anchor={ancora(i)} class="eixo">{e.eixo}</text>
  {/each}
</svg>

<style>
  .radar { display: block; max-width: 100%; height: auto; overflow: visible; }
  .eixo { font: 600 10px var(--f-display); fill: var(--muted); letter-spacing: .02em; }
  .area { transition: all .5s var(--ease); }
</style>
