<script lang="ts">
  import { CAMPOS_PESSOA, CAMPOS_RELACAO, ESTADOS_VIDA, type Catalogo, type Consequencia, type Quem } from '@tanden/core';

  // Lista de efeitos ("acontece..."): mudar valores da pessoa ou da relação,
  // traços, romance, briga, morte, memória, evento ou código livre.
  let { efeitos = $bindable(), quemOps, cat, dupla }: {
    efeitos: Consequencia[];
    quemOps: Array<[Quem, string]>;
    cat: Catalogo;
    dupla: boolean;
  } = $props();

  const KINDS: Array<[string, string, boolean]> = [
    ['campo', 'muda um valor da pessoa', false],
    ['relcampo', 'muda a relação com o outro', true],
    ['ganhar', 'ganha um traço', false],
    ['perder', 'perde um traço', false],
    ['namorar', 'começam a namorar', true],
    ['casar', 'se casam', true],
    ['caso', 'começam um caso', true],
    ['terminar', 'terminam', true],
    ['engravidar', 'tentam ter um filho', true],
    ['lutar', 'lutam', true],
    ['ferir', 'fica ferido', false],
    ['matar', 'morre', false],
    ['lembrar', 'guarda uma memória do outro', true],
    ['vincular', 'ganham um vínculo', true],
    ['desvincular', 'perdem um vínculo', true],
    ['estado', 'fica num estado por um tempo (sapo, preso...)', false],
    ['disparar', 'dispara um evento', false],
    ['livre', 'código livre', false],
  ];
  const tracos = $derived([...cat.tracos.values()].sort((a, b) => a.m.localeCompare(b.m, 'pt-BR')));
  const atributos = $derived([...cat.atributos.values()]);
  const conhecidos = $derived(new Set([...CAMPOS_PESSOA.map((c) => c.id), ...atributos.map((a) => a.id)]));
  const relMuda = CAMPOS_RELACAO.filter((c) => c.muda);
  const conhecidosRel = new Set(relMuda.map((c) => c.id));

  function novo(k: string): Consequencia | null {
    switch (k) {
      case 'campo': return { k, quem: 'a', campo: atributos[0]?.id ?? 'humor', op: '+=', valor: '10' };
      case 'relcampo': return { k, de: 'b', campo: 'afeto', op: '+=', valor: '10' };
      case 'ganhar': case 'perder': return { k, quem: 'a', traco: tracos[0]?.id ?? 'corajoso' };
      case 'namorar': case 'casar': case 'caso': case 'terminar': case 'engravidar': return { k };
      case 'lutar': return { k, modo: 'briga' };
      case 'ferir': case 'matar': return { k, quem: dupla ? 'b' : 'a', texto: '' };
      case 'lembrar': return { k, de: 'b', texto: 'nunca vou esquecer', valor: -10 };
      case 'disparar': return { k, evento: 'meu_evento' };
      case 'vincular': case 'desvincular': return { k, vinculo: vinculos[0] ?? 'amigos' };
      case 'estado': return { k, quem: 'a', estado: 'amaldicoado', meses: 6 };
      case 'livre': return { k, codigo: 'a.humor += 1' };
    }
    return null;
  }
  const rotulo = (e: Consequencia) => KINDS.find(([k]) => k === e.k)?.[1] ?? e.k;
  const vinculos = $derived([...[...cat.vinculos.values()].map((v) => v.nome), 'amigos', 'rivais', 'inimigos', 'namoro']);
</script>

<div class="efs">
  {#if !efeitos.length}<p class="vazio">nada (só a crônica)</p>{/if}
  {#each efeitos as e, i (i)}
    <div class="item">
      {#if 'quem' in e}<select bind:value={e.quem} aria-label="quem">{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
      {#if 'de' in e}<select bind:value={e.de} aria-label="de quem">{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
      <span class="k">{rotulo(e)}</span>
      {#if e.k === 'campo'}
        <select value={conhecidos.has(e.campo) ? e.campo : '__outro'} onchange={(ev) => { const v = (ev.currentTarget as HTMLSelectElement).value; (e as { campo: string }).campo = v === '__outro' ? '' : v; }} aria-label="campo">
          {#if atributos.length}<optgroup label="atributos do mundo">{#each atributos as a (a.id)}<option value={a.id}>{a.nome}</option>{/each}</optgroup>{/if}
          {#each ['estado', 'habilidade', 'personalidade'] as g (g)}
            <optgroup label={g}>{#each CAMPOS_PESSOA.filter((x) => x.grupo === g && x.id !== 'idade') as x (x.id)}<option value={x.id}>{x.nome}</option>{/each}</optgroup>
          {/each}
          <option value="__outro">✎ outro campo…</option>
        </select>
        {#if !conhecidos.has(e.campo)}<input bind:value={e.campo} placeholder="rancor, honra..." />{/if}
        <select bind:value={e.op} aria-label="como"><option value="+=">soma</option><option value="-=">tira</option><option value="=">vira</option></select>
        <input class="num" bind:value={e.valor} aria-label="valor" />
      {:else if e.k === 'relcampo'}
        <select value={conhecidosRel.has(e.campo) ? e.campo : '__outro'} onchange={(ev) => { const v = (ev.currentTarget as HTMLSelectElement).value; (e as { campo: string }).campo = v === '__outro' ? '' : v; }} aria-label="campo da relação">
          {#each relMuda as x (x.id)}<option value={x.id}>{x.nome}</option>{/each}
          <option value="__outro">✎ outro (dívida, juramento...)</option>
        </select>
        {#if !conhecidosRel.has(e.campo)}<input bind:value={e.campo} placeholder="dívida" />{/if}
        <select bind:value={e.op} aria-label="como"><option value="+=">soma</option><option value="-=">tira</option><option value="=">vira</option></select>
        <input class="num" bind:value={e.valor} aria-label="valor" />
      {:else if e.k === 'relacao'}
        <select bind:value={e.eixo}><option value="afeto">afeto</option><option value="atracao">atração</option><option value="confianca">confiança</option><option value="respeito">respeito</option><option value="intimidade">intimidade</option></select>
        <input type="number" bind:value={e.delta} />
      {:else if e.k === 'humor' || e.k === 'estresse' || e.k === 'dinheiro' || e.k === 'saude'}<input type="number" bind:value={e.delta} />
      {:else if e.k === 'ganhar' || e.k === 'perder'}<select bind:value={e.traco}>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}</select>
      {:else if e.k === 'lutar'}<select bind:value={e.modo}><option value="briga">briga</option><option value="duelo">duelo</option><option value="emboscada">emboscada</option></select>
      {:else if e.k === 'ferir' || e.k === 'matar'}<input bind:value={e.texto} placeholder={e.k === 'matar' ? 'como morre' : 'marca (cicatriz, manco...)'} />
      {:else if e.k === 'lembrar'}<input bind:value={e.texto} placeholder="o que lembra" /><input type="number" bind:value={e.valor} title="pontos de opinião" />
      {:else if e.k === 'disparar'}<input bind:value={e.evento} placeholder="nome do evento" />
      {:else if e.k === 'vincular' || e.k === 'desvincular'}<select bind:value={e.vinculo}>{#each vinculos as v (v)}<option value={v}>{v}</option>{/each}</select>
      {:else if e.k === 'estado'}
        <input bind:value={e.estado} list="cons-estados" placeholder="sapo, preso, amaldicoado..." />
        <datalist id="cons-estados">{#each Object.entries(ESTADOS_VIDA) as [k, v] (k)}<option value={k}>{v.icone} {v.nome}</option>{/each}</datalist>
        <span class="k">por</span><input type="number" min="1" bind:value={e.meses} /><span class="k">meses</span>
      {:else if e.k === 'livre'}<textarea bind:value={e.codigo} rows="2"></textarea>{/if}
      <button class="x" onclick={() => efeitos.splice(i, 1)} aria-label="Tirar efeito">×</button>
    </div>
  {/each}
  <select class="addsel" value="" onchange={(ev) => { const e = novo((ev.currentTarget as HTMLSelectElement).value); if (e) efeitos.push(e); (ev.currentTarget as HTMLSelectElement).value = ''; }}>
    <option value="">+ efeito</option>
    {#each KINDS.filter(([, , d]) => dupla || !d) as [k, l] (k)}<option value={k}>{l}</option>{/each}
  </select>
</div>

<style>
  .efs { display: grid; gap: 5px; }
  .vazio { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }
  .item { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; padding: 4px 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
  .k { font-size: 12.5px; color: var(--ink); }
  .x { border: 0; background: none; color: var(--muted); margin-left: auto; font-size: 15px; }
  .x:hover { color: var(--crit); }
  .addsel { justify-self: start; border-style: dashed !important; color: var(--muted) !important; }
  select, input, textarea { background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 4px 7px; font-size: 12.5px; min-width: 0; }
  input[type='number'], .num { width: 70px; font-family: var(--f-mono); }
  textarea { flex: 1; min-width: 200px; font-family: var(--f-mono); }
</style>
