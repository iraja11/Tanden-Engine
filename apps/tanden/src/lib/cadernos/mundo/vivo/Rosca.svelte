<script lang="ts">
  // Rosca com legenda. As cores vêm de uma paleta fixa e sóbria (categóricas),
  // ou da cor que cada fatia trouxer.
  let { fatias, titulo, size = 120, onclick }: {
    fatias: Array<{ nome: string; n: number; cor?: string; path?: string }>;
    titulo: string;
    size?: number;
    onclick?: (path: string) => void;
  } = $props();
  const PALETA = ['#ff8a3d', '#7fb6ff', '#7fd1a8', '#b59cff', '#e6c86e', '#ff6b6b', '#6fc3c9', '#d98fb0', '#a3c977', '#9aa3ad'];
  const MAX = 7;
  const lista = $derived.by(() => {
    const ord = [...fatias].filter((f) => f.n > 0);
    if (ord.length <= MAX) return ord;
    const resto = ord.slice(MAX - 1).reduce((s, f) => s + f.n, 0);
    return [...ord.slice(0, MAX - 1), { nome: 'Outros', n: resto }];
  });
  const total = $derived(lista.reduce((s, f) => s + f.n, 0));
  /** só "Não informado": nada para desenhar ainda */
  const conhecidos = $derived(lista.filter((f) => f.nome !== 'Não informado').length);
  const arcos = $derived.by(() => {
    let a = 0;
    return lista.map((f, i) => {
      const ini = a;
      a += (f.n / Math.max(1, total)) * 360;
      return { ...f, ini, fim: a, cor: f.cor ?? (f.nome === 'Não informado' || f.nome === 'Outros' ? 'var(--line)' : PALETA[i % PALETA.length]!) };
    });
  });
  const arco = (ini: number, fim: number) => {
    const r = 40;
    const p = (g: number) => [50 + r * Math.cos(((g - 90) * Math.PI) / 180), 50 + r * Math.sin(((g - 90) * Math.PI) / 180)];
    if (fim - ini >= 359.9) return `M50 10a40 40 0 1 1 -0.01 0`;
    const [x1, y1] = p(ini);
    const [x2, y2] = p(fim);
    return `M${x1!.toFixed(2)} ${y1!.toFixed(2)}A${r} ${r} 0 ${fim - ini > 180 ? 1 : 0} 1 ${x2!.toFixed(2)} ${y2!.toFixed(2)}`;
  };
</script>

<figure class="rosca">
  <figcaption>{titulo}</figcaption>
  {#if total && conhecidos}
    <div class="corpo">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${titulo}: ${lista.map((f) => `${f.nome} ${f.n}`).join(', ')}`}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface-2)" stroke-width="14" />
        {#each arcos as f (f.nome)}<path d={arco(f.ini, f.fim - (arcos.length > 1 ? 1.5 : 0))} fill="none" stroke={f.cor} stroke-width="14"><title>{f.nome}: {f.n}</title></path>{/each}
        <text x="50" y="49" text-anchor="middle" class="num">{total}</text>
        <text x="50" y="61" text-anchor="middle" class="lbl">total</text>
      </svg>
      <ul>
        {#each arcos as f (f.nome)}
          <li style:--c={f.cor}>
            {#if f.path && onclick}<button onclick={() => onclick!(f.path!)}><i></i><span>{f.nome}</span><b>{f.n}</b></button>
            {:else}<span class="l"><i></i><span>{f.nome}</span><b>{f.n}</b></span>{/if}
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <p class="vazio">{total ? `Ninguém com isto preenchido (${total} sem informação).` : 'Sem dados ainda.'}</p>
  {/if}
</figure>

<style>
  .rosca { margin: 0; display: grid; gap: 8px; min-width: 0; }
  figcaption { font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .corpo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  svg { flex: none; }
  .num { font: 700 17px var(--f-display); fill: var(--ink); }
  .lbl { font: 8px var(--f-mono); fill: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; flex: 1 1 120px; min-width: 0; font-size: 12.5px; }
  li button, li .l { width: 100%; display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 6px; border: 0; background: none; padding: 1px 0; color: var(--ink); text-align: left; font: inherit; }
  li button:hover span { text-decoration: underline; }
  li i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
  li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li b { font: 600 11.5px var(--f-mono); color: var(--muted); }
  .vazio { margin: 0; color: var(--muted); font-size: 12px; }
</style>
