<script lang="ts">
  import { NAME_STYLES, asText, catalogo, parseWorldDate, timeline, worldYear, type World } from '@tanden/core';
  import { cadernos } from '../../cadernos.svelte';
  import { typeColor } from '../../tipos';
  import { vidas } from './vidas.svelte';

  // Começar uma simulação de vidas: onde, quando, com quem.
  let { world, oncancel }: { world: World; oncancel?: () => void } = $props();

  const lugares = $derived(world.entities.filter((e) => e.type === 'lugar'));
  const agora = $derived(worldYear(world));
  const fonteAno = $derived.by(() => {
    if (world.props && asText(world.props['ano'] ?? world.props['ano atual'] ?? world.props['hoje'])) return 'o campo "ano" da nota do mundo';
    return timeline(world).length ? 'a última data da linha do tempo' : 'nenhuma data (comece onde quiser)';
  });

  let nome = $state('');
  let lugar = $state('');
  $effect.pre(() => { if (!lugar && lugares.length) lugar = lugares[0]!.path; });
  let lugarLivre = $state('');
  let ano = $state<number | null>(null);
  let mes = $state(1);
  let figurantes = $state(10);
  let estilo = $state('iberico');
  let semente = $state(Math.floor(Math.random() * 9999) + 1);
  let marcadas = $state<Set<string> | null>(null);

  const anoFinal = $derived(ano ?? agora);
  const lugarKey = $derived(lugar === '__livre' ? lugarLivre.trim() : lugar || lugares[0]?.path || lugarLivre.trim() || 'Vila');
  const lugarNome = $derived(lugares.find((l) => l.path === lugarKey)?.name ?? lugarKey);

  // personagens vivas no ano escolhido (as mortas antes ou que nascem depois ficam de fora)
  const personagens = $derived.by(() => {
    const out: Array<{ path: string; name: string; idade: number | null; aqui: boolean; ok: boolean; motivo: string }> = [];
    for (const e of world.entities) {
      if (e.type !== 'personagem') continue;
      const nasc = parseWorldDate(asText(e.props['nascimento'] ?? ''));
      const morte = parseWorldDate(asText(e.props['morte'] ?? ''));
      const morta = /morto|morta|falecid/i.test(asText(e.props['status'] ?? '')) && (morte === null || morte <= anoFinal);
      const ok = !morta && !(morte !== null && morte <= anoFinal) && !(nasc !== null && nasc > anoFinal);
      const aqui = e.relations.some((r) => r.to === lugarKey);
      out.push({ path: e.path, name: e.name, idade: nasc !== null ? Math.floor(anoFinal - nasc) : null, aqui, ok, motivo: ok ? '' : nasc !== null && nasc > anoFinal ? 'ainda não nasceu' : 'já morreu' });
    }
    return out.sort((a, b) => Number(b.aqui) - Number(a.aqui) || a.name.localeCompare(b.name, 'pt-BR'));
  });
  const escolhidas = $derived(marcadas ?? new Set(personagens.filter((p) => p.ok && (p.aqui || personagens.filter((x) => x.aqui).length === 0)).map((p) => p.path)));
  function toggle(path: string) {
    const s = new Set(escolhidas);
    if (s.has(path)) s.delete(path);
    else s.add(path);
    marcadas = s;
  }
  const total = $derived([...escolhidas].filter((p) => personagens.find((x) => x.path === p)?.ok).length + figurantes);
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nTracos = $derived.by(() => { void cadernos.rev; return catalogo(cadernos.program(world), world.entities).tracos.size; });

  function comecar() {
    vidas.criar(world, {
      nome: nome.trim() || `Vida em ${lugarNome}`, lugar: lugarKey, ano: anoFinal, mes, fichas: [...escolhidas].filter((p) => personagens.find((x) => x.path === p)?.ok),
      figurantes, estilo, semente,
    });
  }
</script>

<div class="nova">
  <header>
    <h3>Nova simulação de vidas</h3>
    <p class="dim">Gente de verdade, mês a mês: cada pessoa tem genes, temperamento, {nTracos} traços possíveis, gostos, profissão e uma opinião sobre cada outra. Elas conversam, se apaixonam, traem, brigam, têm filhos, envelhecem. Você assiste, empurra e decide.</p>
  </header>

  <div class="grid">
    <label>Nome<input bind:value={nome} placeholder={`Vida em ${lugarNome}`} /></label>
    <label>Onde
      {#if lugares.length}
        <select bind:value={lugar}>
          {#each lugares as l (l.path)}<option value={l.path}>{l.name}</option>{/each}
          <option value="__livre">outro lugar (só o nome)…</option>
        </select>
      {/if}
      {#if !lugares.length || lugar === '__livre'}<input bind:value={lugarLivre} placeholder="Vila de Pedravale" />{/if}
    </label>
    <div class="quando">
      <span class="lbl">Começa em</span>
      <div class="row">
        <select bind:value={mes} aria-label="Mês">{#each MESES as m, i (m)}<option value={i + 1}>{m}</option>{/each}</select>
        <input type="number" value={anoFinal} oninput={(e) => { const n = Number((e.currentTarget as HTMLInputElement).value); ano = Number.isFinite(n) ? n : null; }} aria-label="Ano" />
        {#if ano !== null && ano !== agora}<button class="mini" onclick={() => (ano = null)} title="Voltar ao 'agora' do mundo">↺ {agora}</button>{/if}
      </div>
      <small class="dim">O "agora" de {world.name} é <b>{agora}</b>, tirado d{fonteAno.startsWith('o ') ? '' : 'e '}{fonteAno}. Cada passo da simulação é um mês.</small>
    </div>
  </div>

  <section>
    <h4>Quem vive lá <small>{escolhidas.size} {escolhidas.size === 1 ? 'ficha' : 'fichas'}</small></h4>
    {#if personagens.length}
      <div class="tools">
        <button class="mini" onclick={() => (marcadas = new Set(personagens.filter((p) => p.ok).map((p) => p.path)))}>todas</button>
        <button class="mini" onclick={() => (marcadas = new Set(personagens.filter((p) => p.ok && p.aqui).map((p) => p.path)))}>as de {lugarNome}</button>
        <button class="mini" onclick={() => (marcadas = new Set())}>nenhuma</button>
      </div>
      <div class="cast">
        {#each personagens as p (p.path)}
          <button class="who" class:on={escolhidas.has(p.path) && p.ok} disabled={!p.ok} onclick={() => toggle(p.path)} style:--c={typeColor('personagem')} title={p.motivo}>
            <span class="ck">{escolhidas.has(p.path) && p.ok ? '✓' : ''}</span>{p.name}
            <small>{p.ok ? (p.idade !== null ? `${p.idade} anos` : 'idade sorteada') : p.motivo}{p.aqui ? ' · daqui' : ''}</small>
          </button>
        {/each}
      </div>
      <p class="dim small">O que a ficha não diz (sexo, temperamento, genes) é sorteado de um jeito fixo: a mesma ficha vira sempre a mesma pessoa. Escreva <code>sexo</code>, <code>traços</code>, <code>profissão</code>, <code>olhos</code>, <code>cônjuge</code>, <code>amigos</code>, <code>inimigos</code>, <code>amante</code> para mandar no que importa.</p>
    {:else}
      <p class="dim small">O mundo ainda não tem personagens. Sem problema: os figurantes bastam para começar.</p>
    {/if}
  </section>

  <section class="extras">
    <label>Figurantes <span class="val">{figurantes}</span><input type="range" min="0" max="60" bind:value={figurantes} /></label>
    <label>Nomes
      <select bind:value={estilo}>
        <option value="iberico">ibérico medieval</option>
        <option value="mundo">no estilo do mundo (aprende com os nomes)</option>
        {#each NAME_STYLES as s (s.id)}<option value={s.id}>{s.label.toLowerCase()}</option>{/each}
      </select>
    </label>
    <label>Semente <span class="row"><input type="number" bind:value={semente} /><button class="mini" onclick={() => (semente = Math.floor(Math.random() * 9999) + 1)} title="Sortear">🎲</button></span></label>
  </section>
  <p class="dim small">Os figurantes chegam em famílias (casais, filhos, viúvos), com as profissões que uma vila precisa (taberneiro, curandeira, guarda, sacerdote...) e vizinhos que já se conhecem.</p>

  <footer>
    {#if oncancel}<button class="ghost" onclick={oncancel}>Cancelar</button>{/if}
    <button class="primary" onclick={comecar} disabled={!total || vidas.ocupado}>▶ Começar com {total} {total === 1 ? 'pessoa' : 'pessoas'}</button>
  </footer>
</div>

<style>
  .nova { border: 1px solid var(--line); border-radius: 14px; background: radial-gradient(circle at 100% 0, color-mix(in srgb, var(--ember) 8%, var(--surface)), var(--surface) 55%); padding: 14px 16px; display: grid; gap: 14px; }
  h3 { margin: 0 0 4px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h4 { margin: 0 0 6px; font: 600 13px var(--f-display); }
  h4 small { color: var(--muted); font: 11px var(--f-mono); margin-left: 6px; }
  header p { margin: 0; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 12px; align-items: start; }
  label, .quando { display: grid; gap: 5px; font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .lbl { display: block; }
  .quando small { text-transform: none; letter-spacing: 0; font: 12px var(--f-body, inherit); }
  input:not([type='range']), select { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 6px 9px; font: 13px var(--f-body, inherit); text-transform: none; letter-spacing: 0; min-width: 0; }
  input[type='number'] { width: 100px; font-family: var(--f-mono); }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .tools { display: flex; gap: 6px; margin-bottom: 6px; }
  .cast { display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto; }
  .who { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 999px; padding: 4px 10px 4px 6px; font-size: 13px; }
  .who small { color: var(--muted); font: 11px var(--f-mono); }
  .who .ck { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; font-size: 10px; }
  .who.on { border-color: color-mix(in srgb, var(--c) 70%, var(--line)); background: color-mix(in srgb, var(--c) 14%, var(--surface-2)); }
  .who.on .ck { background: var(--c); color: var(--on-ember, #111); border-color: transparent; }
  .who:disabled { opacity: .45; }
  .extras { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 12px; }
  .val { color: var(--ember-soft); font: 12px var(--f-mono); text-transform: none; letter-spacing: 0; margin-left: 6px; }
  input[type='range'] { accent-color: var(--ember); }
  footer { display: flex; justify-content: flex-end; gap: 8px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  code { font: 11.5px var(--f-mono); color: var(--ember-soft); }
  .mini { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 7px; padding: 3px 8px; font-size: 12px; }
  .mini:hover { border-color: var(--ember); }
  .primary { border: 0; border-radius: 9px; padding: 8px 16px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 7px 12px; background: var(--surface-2); color: var(--ink); }
</style>
