<script lang="ts">
  import { CAMPOS_PESSOA, CAMPOS_RELACAO, type Catalogo, type Condicao, type Op, type Quem } from '@tanden/core';

  // Lista de condições ("só quando..."): valores da pessoa ou da relação
  // (com operador), traço, espécie, vínculo, chance... Cada linha é uma
  // condição; todas precisam valer.
  let { conds = $bindable(), quemOps, cat, dupla, vazio = 'sempre' }: {
    conds: Condicao[];
    quemOps: Array<[Quem, string]>;
    cat: Catalogo;
    /** há uma segunda pessoa (b)? */
    dupla: boolean;
    vazio?: string;
  } = $props();

  const OPS: Array<[Op, string]> = [['>', 'maior que'], ['>=', 'pelo menos'], ['<', 'menor que'], ['<=', 'no máximo'], ['=', 'igual a'], ['!=', 'diferente de']];
  const KINDS: Array<[string, string, boolean]> = [
    ['pessoa', 'um valor da pessoa (força, humor, sanidade...)', false],
    ['relacao', 'um valor da relação (ódio, afeto, dívida...)', true],
    ['traco', 'tem (ou não) um traço', false],
    ['especie', 'é de uma espécie', false],
    ['vinculo', 'vínculo entre os dois', true],
    ['comprometido', 'está comprometido', false],
    ['adulto', 'é adulto', false],
    ['gravida', 'está grávida', false],
    ['profissao', 'tem a profissão', false],
    ['gosto', 'gosta de', false],
    ['chance', 'sorte (chance)', false],
    ['livre', 'expressão livre', false],
  ];
  const tracos = $derived([...cat.tracos.values()].sort((a, b) => a.m.localeCompare(b.m, 'pt-BR')));
  const atributos = $derived([...cat.atributos.values()]);
  const especies = $derived([...cat.especies.values()]);
  const conhecidos = $derived(new Set([...CAMPOS_PESSOA.map((c) => c.id), ...atributos.map((a) => a.id)]));
  const conhecidosRel = new Set(CAMPOS_RELACAO.map((c) => c.id));

  function nova(k: string): Condicao | null {
    switch (k) {
      case 'pessoa': return { k: 'valor', alvo: 'pessoa', quem: 'a', campo: atributos[0]?.id ?? 'humor', op: '>', valor: '50' };
      case 'relacao': return { k: 'valor', alvo: 'relacao', quem: 'a', campo: 'odio', op: '>', valor: '50' };
      case 'traco': return { k: 'traco', quem: 'a', traco: tracos[0]?.id ?? 'corajoso' };
      case 'especie': return { k: 'especie', quem: 'a', especie: especies[0]?.nome ?? 'Humano' };
      case 'vinculo': return { k: 'vinculo', vinc: 'amigos' };
      case 'comprometido': case 'gravida': case 'adulto': return { k, quem: 'a' };
      case 'profissao': return { k: 'profissao', quem: 'a', prof: [...cat.profs.values()][0]?.m ?? 'ferreiro' };
      case 'gosto': return { k: 'gosto', quem: 'a', gosto: cat.gostos[0] ?? 'música' };
      case 'chance': return { k: 'chance', pct: 50 };
      case 'livre': return { k: 'livre', expr: 'a.dinheiro > 10' };
    }
    return null;
  }
  const rotulo = (c: Condicao) =>
    c.k === 'valor' ? (c.alvo === 'relacao' ? 'sente pelo outro:' : '') : (KINDS.find(([k]) => k === c.k)?.[1] ?? c.k);
</script>

<div class="conds">
  {#if !conds.length}<p class="vazio">{vazio}</p>{/if}
  {#each conds as c, i (i)}
    <div class="item">
      {#if 'quem' in c}
        <select bind:value={c.quem} aria-label="quem">{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>
      {/if}
      {#if 'nao' in c || c.k === 'traco' || c.k === 'vinculo' || c.k === 'comprometido' || c.k === 'gravida' || c.k === 'adulto' || c.k === 'profissao' || c.k === 'especie'}
        <select value={c.nao ? 'nao' : 'sim'} onchange={(e) => { (c as { nao?: boolean }).nao = (e.currentTarget as HTMLSelectElement).value === 'nao'; }} aria-label="sim ou não">
          <option value="sim">—</option><option value="nao">não</option>
        </select>
      {/if}
      <span class="k">{rotulo(c)}</span>
      {#if c.k === 'valor' && c.alvo === 'pessoa'}
        <select value={conhecidos.has(c.campo) ? c.campo : '__outro'} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; (c as { campo: string }).campo = v === '__outro' ? '' : v; }} aria-label="campo">
          {#if atributos.length}<optgroup label="atributos do mundo">{#each atributos as a (a.id)}<option value={a.id}>{a.nome}</option>{/each}</optgroup>{/if}
          {#each ['estado', 'corpo', 'habilidade', 'personalidade'] as g (g)}
            <optgroup label={g}>{#each CAMPOS_PESSOA.filter((x) => x.grupo === g) as x (x.id)}<option value={x.id}>{x.nome}</option>{/each}</optgroup>
          {/each}
          <option value="__outro">✎ outro campo…</option>
        </select>
        {#if !conhecidos.has(c.campo)}<input bind:value={c.campo} placeholder="nome do campo (rancor, honra...)" />{/if}
        <select bind:value={c.op} aria-label="comparação">{#each OPS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>
        <input class="num" bind:value={c.valor} aria-label="valor" />
      {:else if c.k === 'valor'}
        <select value={conhecidosRel.has(c.campo) ? c.campo : '__outro'} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; (c as { campo: string }).campo = v === '__outro' ? '' : v; }} aria-label="campo da relação">
          {#each CAMPOS_RELACAO as x (x.id)}<option value={x.id}>{x.nome}</option>{/each}
          <option value="__outro">✎ outro (dívida, juramento...)</option>
        </select>
        {#if !conhecidosRel.has(c.campo)}<input bind:value={c.campo} placeholder="nome do campo" />{/if}
        <select bind:value={c.op} aria-label="comparação">{#each OPS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>
        <input class="num" bind:value={c.valor} aria-label="valor" />
      {:else if c.k === 'opiniao' || c.k === 'atracao' || c.k === 'confianca' || c.k === 'intimidade' || c.k === 'idade'}
        <select bind:value={c.op}>{#each OPS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select><input type="number" bind:value={c.valor} />
      {:else if c.k === 'traco'}<select bind:value={c.traco}>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}</select>
      {:else if c.k === 'especie'}
        <input bind:value={c.especie} list="cons-especies" placeholder="Elfo" />
        <datalist id="cons-especies">{#each especies as e (e.id)}<option value={e.nome}></option>{/each}<option value="humano"></option></datalist>
      {:else if c.k === 'vinculo'}<select bind:value={c.vinc}>{#each ['casados', 'namoro', 'amantes', 'amigos', 'rivais', 'inimigos', 'parentes'] as v (v)}<option value={v}>{v}</option>{/each}</select>
      {:else if c.k === 'profissao'}<select bind:value={c.prof}>{#each [...cat.profs.values()] as p (p.id)}<option value={p.m}>{p.m}</option>{/each}</select>
      {:else if c.k === 'gosto'}<select bind:value={c.gosto}>{#each cat.gostos as g (g)}<option value={g}>{g}</option>{/each}</select>
      {:else if c.k === 'chance'}<input type="number" min="1" max="100" bind:value={c.pct} /> <span class="k">%</span>
      {:else if c.k === 'campo'}<input bind:value={c.campo} placeholder="campo" /><select bind:value={c.op}>{#each OPS as [v, l] (v)}<option value={v}>{l}</option>{/each}</select><input bind:value={c.valor} />
      {:else if c.k === 'livre'}<input class="grow" bind:value={c.expr} />{/if}
      <button class="x" onclick={() => conds.splice(i, 1)} aria-label="Tirar condição">×</button>
    </div>
  {/each}
  <select class="addsel" value="" onchange={(e) => { const c = nova((e.currentTarget as HTMLSelectElement).value); if (c) conds.push(c); (e.currentTarget as HTMLSelectElement).value = ''; }}>
    <option value="">+ condição</option>
    {#each KINDS.filter(([, , d]) => dupla || !d) as [k, l] (k)}<option value={k}>{l}</option>{/each}
  </select>
</div>

<style>
  .conds { display: grid; gap: 5px; }
  .vazio { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }
  .item { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; padding: 4px 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
  .k { font-size: 12.5px; color: var(--ink); }
  .x { border: 0; background: none; color: var(--muted); margin-left: auto; font-size: 15px; }
  .x:hover { color: var(--crit); }
  .addsel { justify-self: start; border-style: dashed !important; color: var(--muted) !important; }
  select, input { background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 4px 7px; font-size: 12.5px; min-width: 0; }
  input[type='number'], .num { width: 70px; font-family: var(--f-mono); }
  .grow { flex: 1; min-width: 200px; font-family: var(--f-mono); }
</style>
