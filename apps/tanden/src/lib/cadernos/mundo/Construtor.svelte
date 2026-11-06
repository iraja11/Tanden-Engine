<script lang="ts">
  import {
    EVENTOS_VIDA, RECEITAS, catalogo, compileRules, mecanicaRegras, noteDir, type Condicao, type Consequencia, type Mecanica, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { cadernos } from '../cadernos.svelte';

  // Construtor de mecânicas: monta uma regra por partes (quem, quando, com
  // que chance, o que acontece) e escreve o bloco ```regras por você. Do lado,
  // receitas prontas. O texto gerado é a linguagem de sempre: dá para ajustar
  // à mão na nota depois.
  let { world, onOpenNote }: { world: World; onOpenNote: (path: string) => void } = $props();

  const cat = $derived.by(() => { void cadernos.rev; return catalogo(cadernos.program(world)); });
  const tracos = $derived([...cat.tracos.values()].sort((a, b) => a.m.localeCompare(b.m, 'pt-BR')));
  const profs = $derived([...cat.profs.values()]);

  let m = $state<Mecanica>({ tipo: 'par', nome: '', chance: 15, atracao: '', condicoes: [], efeitos: [], cronica: '' });
  let aberta = $state(false);
  let verCodigo = $state<string | null>(null);

  const partes = $derived.by(() => {
    if (m.tipo === 'par') return { a: 'a (quem age)', b: 'b (o outro)' };
    if (m.tipo === 'solo') return { a: 'a pessoa', b: null };
    const ev = EVENTOS_VIDA.find((e) => e.id === m.evento);
    if (!ev || !ev.partes.length) return { a: 'cada pessoa', b: null };
    return { a: ev.partes[0]!, b: ev.partes[1] ?? null };
  });

  const COND: Array<[Condicao['k'], string]> = [
    ['traco', 'tem o traço'], ['opiniao', 'opinião sobre o outro'], ['atracao', 'atração pelo outro'], ['confianca', 'confiança no outro'], ['intimidade', 'intimidade com o outro'],
    ['idade', 'idade'], ['vinculo', 'vínculo entre os dois'], ['comprometido', 'está comprometido'], ['gravida', 'está grávida'], ['adulto', 'é adulto'],
    ['profissao', 'profissão'], ['gosto', 'gosta de'], ['campo', 'campo (qualquer)'], ['livre', 'expressão livre'],
  ];
  const EFE: Array<[Consequencia['k'], string]> = [
    ['relacao', 'mexe na relação'], ['humor', 'humor'], ['estresse', 'estresse'], ['dinheiro', 'dinheiro'], ['saude', 'saúde'], ['ganhar', 'ganha um traço'], ['perder', 'perde um traço'],
    ['namorar', 'começam a namorar'], ['casar', 'se casam'], ['caso', 'começam um caso'], ['terminar', 'terminam'], ['engravidar', 'tenta engravidar'],
    ['lutar', 'lutam'], ['ferir', 'fica ferido'], ['matar', 'morre'], ['lembrar', 'guarda uma memória'], ['campo', 'muda um campo'], ['disparar', 'dispara um evento'], ['livre', 'código livre'],
  ];
  const DUPLA = new Set(['opiniao', 'atracao', 'confianca', 'intimidade', 'vinculo', 'namorar', 'casar', 'caso', 'terminar', 'engravidar', 'lutar', 'relacao', 'lembrar']);

  function novaCond(k: Condicao['k']): Condicao {
    switch (k) {
      case 'traco': return { k, quem: 'a', traco: tracos[0]?.id ?? 'corajoso' };
      case 'opiniao': case 'atracao': case 'confianca': case 'intimidade': return { k, de: 'a', op: '>', valor: k === 'atracao' ? 50 : 20 };
      case 'idade': return { k, quem: 'a', op: '>', valor: 18 };
      case 'vinculo': return { k, vinc: 'amigos' };
      case 'comprometido': case 'gravida': case 'adulto': return { k, quem: 'a' };
      case 'profissao': return { k, quem: 'a', prof: profs[0]?.m ?? 'ferreiro' };
      case 'gosto': return { k, quem: 'a', gosto: cat.gostos[0] ?? 'música' };
      case 'campo': return { k, quem: 'a', campo: 'dinheiro', op: '>', valor: '10' };
      case 'livre': return { k, expr: 'chance(50%)' };
    }
  }
  function novoEfeito(k: Consequencia['k']): Consequencia {
    switch (k) {
      case 'relacao': return { k, de: 'b', eixo: 'afeto', delta: 10, mutuo: false };
      case 'humor': case 'estresse': case 'dinheiro': case 'saude': return { k, quem: 'a', delta: k === 'estresse' ? 10 : 5 };
      case 'ganhar': case 'perder': return { k, quem: 'a', traco: tracos[0]?.id ?? 'corajoso' };
      case 'namorar': case 'casar': case 'caso': case 'terminar': case 'engravidar': return { k };
      case 'lutar': return { k, modo: 'briga' };
      case 'ferir': case 'matar': return { k, quem: 'b', texto: '' };
      case 'lembrar': return { k, de: 'b', texto: 'nunca vou esquecer', valor: -10 };
      case 'campo': return { k, quem: 'a', campo: 'rancor', op: '+=', valor: '1' };
      case 'disparar': return { k, evento: 'meu_evento' };
      case 'livre': return { k, codigo: 'a.humor += 1' };
    }
  }

  const codigo = $derived(mecanicaRegras($state.snapshot(m) as Mecanica));
  const problemas = $derived(compileRules([{ path: 'construtor', code: codigo }]).issues);
  const folder = $derived(world.path ? noteDir(world.path) : `Mundos/${world.name}`);

  /** Acrescenta um bloco ```regras na nota de regras do mundo (ou cria uma). */
  function inserir(code: string, nome: string) {
    const alvo = (world.scripts ?? [])[0]?.path ?? `${folder}/Regras/Mecânicas.md`;
    if (!cadernos.exists(alvo)) {
      cadernos.create(`${folder}/Regras`, 'Mecânicas', () => `---\ntags: [regras]\n---\n# Mecânicas de ${world.name}\n\nFeitas no construtor da aba Regras. Dá para editar à mão.\n\n\`\`\`regras\n${code}\`\`\`\n`);
    } else {
      cadernos.update(alvo, (t) => `${t.replace(/\s*$/, '')}\n\n\`\`\`regras\n${code}\`\`\`\n`);
    }
    cadernos.say(`"${nome}" entrou nas regras de ${world.name}. Já vale na próxima simulação (e nas que você reabrir).`);
  }
  function salvar() {
    if (problemas.length || !m.nome.trim()) return;
    inserir(codigo, m.nome.trim());
    m = { tipo: m.tipo, nome: '', chance: 15, atracao: '', condicoes: [], efeitos: [], cronica: '', ...(m.evento ? { evento: m.evento } : {}) };
  }
  const quemOps = $derived(partes.b ? [['a', partes.a], ['b', partes.b]] : [['a', partes.a]]);
</script>

<section class="cons">
  <header>
    <div>
      <h3>Construtor de mecânicas</h3>
      <p class="dim">Monte uma regra por partes e o Tanden escreve o código. Vale para a simulação de vidas: interações entre duas pessoas, acontecimentos de uma pessoa, reações a eventos (casamento, traição descoberta, nascimento...).</p>
    </div>
    <button class="primary" onclick={() => (aberta = !aberta)}>{aberta ? 'Fechar' : '+ Nova mecânica'}</button>
  </header>

  {#if aberta}
    <div class="form" in:rise>
      <div class="linha">
        <label>Tipo
          <select bind:value={m.tipo}>
            <option value="par">entre duas pessoas</option>
            <option value="solo">de uma pessoa só</option>
            <option value="reacao">quando algo acontece</option>
          </select>
        </label>
        {#if m.tipo === 'reacao'}
          <label>Quando
            <select bind:value={m.evento}>
              <option value={undefined}>escolha…</option>
              {#each EVENTOS_VIDA as e (e.id)}<option value={e.id}>{e.nome}{e.partes.length ? ` (${e.partes.join(', ')})` : ''}</option>{/each}
            </select>
          </label>
        {/if}
        <label class="grow">Nome<input bind:value={m.nome} placeholder={m.tipo === 'par' ? 'Serenata' : m.tipo === 'solo' ? 'Insônia' : 'Luto da vila'} /></label>
        <label>Chance por ano <span class="val">{m.chance}%</span><input type="range" min="1" max="100" bind:value={m.chance} /></label>
      </div>
      {#if m.tipo === 'par'}
        <label class="grow">Quem escolhe quem (opcional) <input bind:value={m.atracao} placeholder="atração(a, b) — vazio: qualquer um ao redor" /></label>
      {/if}

      <div class="bloco">
        <h4>Só quando…</h4>
        {#each m.condicoes as c, i (i)}
          <div class="item">
            {#if 'quem' in c}<select bind:value={c.quem}>{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
            {#if 'de' in c}<select bind:value={c.de}>{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
            {#if 'nao' in c || c.k === 'traco' || c.k === 'vinculo' || c.k === 'comprometido' || c.k === 'gravida' || c.k === 'adulto' || c.k === 'profissao'}
              <select value={c.nao ? 'nao' : 'sim'} onchange={(e) => { (c as { nao?: boolean }).nao = (e.currentTarget as HTMLSelectElement).value === 'nao'; }}><option value="sim">—</option><option value="nao">não</option></select>
            {/if}
            <span class="k">{COND.find(([k]) => k === c.k)?.[1]}</span>
            {#if c.k === 'traco'}<select bind:value={c.traco}>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}</select>
            {:else if c.k === 'opiniao' || c.k === 'atracao' || c.k === 'confianca' || c.k === 'intimidade' || c.k === 'idade'}
              <select bind:value={c.op}><option value=">">maior que</option><option value="<">menor que</option></select><input type="number" bind:value={c.valor} />
            {:else if c.k === 'vinculo'}<select bind:value={c.vinc}>{#each ['casados', 'namoro', 'amantes', 'amigos', 'rivais', 'inimigos', 'parentes'] as v (v)}<option value={v}>{v}</option>{/each}</select>
            {:else if c.k === 'profissao'}<select bind:value={c.prof}>{#each profs as p (p.id)}<option value={p.m}>{p.m}</option>{/each}</select>
            {:else if c.k === 'gosto'}<select bind:value={c.gosto}>{#each cat.gostos as g (g)}<option value={g}>{g}</option>{/each}</select>
            {:else if c.k === 'campo'}<input bind:value={c.campo} placeholder="campo" /><select bind:value={c.op}><option value=">">&gt;</option><option value="<">&lt;</option><option value="=">=</option><option value="!=">≠</option></select><input bind:value={c.valor} placeholder="valor" />
            {:else if c.k === 'livre'}<input class="grow" bind:value={c.expr} />{/if}
            <button class="x" onclick={() => m.condicoes.splice(i, 1)} aria-label="Tirar">×</button>
          </div>
        {/each}
        <select class="addsel" value="" onchange={(e) => { const k = (e.currentTarget as HTMLSelectElement).value as Condicao['k']; if (k) m.condicoes.push(novaCond(k)); (e.currentTarget as HTMLSelectElement).value = ''; }}>
          <option value="">+ condição</option>
          {#each COND.filter(([k]) => partes.b || !DUPLA.has(k)) as [k, l] (k)}<option value={k}>{l}</option>{/each}
        </select>
      </div>

      <div class="bloco">
        <h4>Acontece…</h4>
        {#each m.efeitos as e, i (i)}
          <div class="item">
            {#if 'quem' in e}<select bind:value={e.quem}>{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
            {#if 'de' in e}<select bind:value={e.de}>{#each quemOps as [v, l] (v)}<option value={v}>{l}</option>{/each}</select>{/if}
            <span class="k">{EFE.find(([k]) => k === e.k)?.[1]}</span>
            {#if e.k === 'relacao'}
              <select bind:value={e.eixo}><option value="afeto">afeto</option><option value="atracao">atração</option><option value="confianca">confiança</option><option value="respeito">respeito</option><option value="intimidade">intimidade</option></select>
              <input type="number" bind:value={e.delta} /><label class="chk"><input type="checkbox" bind:checked={e.mutuo} /> dos dois lados</label>
            {:else if e.k === 'humor' || e.k === 'estresse' || e.k === 'dinheiro' || e.k === 'saude'}<input type="number" bind:value={e.delta} />
            {:else if e.k === 'ganhar' || e.k === 'perder'}<select bind:value={e.traco}>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}</select>
            {:else if e.k === 'lutar'}<select bind:value={e.modo}><option value="briga">briga</option><option value="duelo">duelo</option><option value="emboscada">emboscada</option></select>
            {:else if e.k === 'ferir' || e.k === 'matar'}<input bind:value={e.texto} placeholder={e.k === 'matar' ? 'como morre' : 'marca (cicatriz, manco...)'} />
            {:else if e.k === 'lembrar'}<input bind:value={e.texto} placeholder="o que lembra" /><input type="number" bind:value={e.valor} />
            {:else if e.k === 'campo'}<input bind:value={e.campo} placeholder="campo" /><select bind:value={e.op}><option value="=">=</option><option value="+=">+=</option><option value="-=">-=</option></select><input bind:value={e.valor} />
            {:else if e.k === 'disparar'}<input bind:value={e.evento} placeholder="nome do evento" />
            {:else if e.k === 'livre'}<textarea bind:value={e.codigo} rows="2"></textarea>{/if}
            <button class="x" onclick={() => m.efeitos.splice(i, 1)} aria-label="Tirar">×</button>
          </div>
        {/each}
        <select class="addsel" value="" onchange={(ev) => { const k = (ev.currentTarget as HTMLSelectElement).value as Consequencia['k']; if (k) m.efeitos.push(novoEfeito(k)); (ev.currentTarget as HTMLSelectElement).value = ''; }}>
          <option value="">+ efeito</option>
          {#each EFE.filter(([k]) => partes.b || !DUPLA.has(k)) as [k, l] (k)}<option value={k}>{l}</option>{/each}
        </select>
      </div>

      <label class="grow">Na crônica <input bind:value={m.cronica} placeholder={partes.b ? '{a} canta para {b} debaixo da janela.' : '{a} passa a noite em claro.'} /></label>

      <div class="prev">
        <h4>O que vai ser escrito</h4>
        <pre>{codigo}</pre>
        {#if problemas.length}<p class="err">⚠ {problemas[0]!.message}</p>{/if}
      </div>
      <div class="acts"><button class="primary" disabled={!!problemas.length || !m.nome.trim() || (m.tipo === 'reacao' && !m.evento)} onclick={salvar}>Adicionar às regras do mundo</button></div>
    </div>
  {/if}

  <div class="receitas">
    <h4>Receitas prontas</h4>
    <div class="grid">
      {#each RECEITAS as r (r.nome)}
        <div class="rc">
          <b>{r.nome}</b>
          <p>{r.desc}</p>
          <div class="ra">
            <button class="primary sm" onclick={() => inserir(r.codigo, r.nome)}>Usar</button>
            <button class="ghost sm" onclick={() => (verCodigo = verCodigo === r.nome ? null : r.nome)}>{verCodigo === r.nome ? 'esconder' : 'ver código'}</button>
          </div>
          {#if verCodigo === r.nome}<pre in:rise>{r.codigo}</pre>{/if}
        </div>
      {/each}
    </div>
    {#if (world.scripts ?? []).length}<p class="dim small">As mecânicas entram em <button class="lk" onclick={() => onOpenNote((world.scripts ?? [])[0]!.path)}>{(world.scripts ?? [])[0]!.path.split('/').pop()?.replace(/\.md$/, '')}</button>.</p>{/if}
  </div>
</section>

<style>
  .cons { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; display: grid; gap: 12px; }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  header p { margin: 0; font-size: 12.5px; }
  h3, h4 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .form { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
  .linha { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .grow { flex: 1; min-width: min(160px, 100%); }
  .bloco { display: grid; gap: 5px; }
  .item { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; padding: 4px 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
  .k { font-size: 12.5px; color: var(--ink); }
  .x { border: 0; background: none; color: var(--muted); margin-left: auto; font-size: 15px; }
  .x:hover { color: var(--crit); }
  .addsel { justify-self: start; border-style: dashed !important; color: var(--muted) !important; }
  select, input:not([type='range']):not([type='checkbox']), textarea { background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 4px 7px; font-size: 12.5px; min-width: 0; }
  input[type='number'] { width: 70px; font-family: var(--f-mono); }
  textarea { flex: 1; min-width: min(200px, 100%); font-family: var(--f-mono); }
  input[type='range'] { accent-color: var(--ember); }
  .chk { display: inline-flex; gap: 4px; align-items: center; grid-auto-flow: column; }
  .val { color: var(--ember-soft); font: 11.5px var(--f-mono); }
  .prev pre, .rc pre { margin: 0; background: var(--void); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; font: 12px/1.5 var(--f-mono); color: var(--ink); white-space: pre-wrap; overflow-x: auto; }
  .err { color: var(--crit); font-size: 12.5px; margin: 4px 0 0; }
  .acts { display: flex; justify-content: flex-end; }
  .receitas .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 8px; }
  .rc { border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; display: grid; gap: 4px; align-content: start; background: var(--surface-2); }
  .rc b { font: 600 13.5px var(--f-display); }
  .rc p { margin: 0; font-size: 12.5px; color: var(--muted); }
  .ra { display: flex; gap: 6px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .lk { border: 0; background: none; color: var(--ink); padding: 0; box-shadow: inset 0 -1px 0 var(--ember); }
  .primary { border: 0; border-radius: 9px; padding: 6px 13px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 5px 11px; background: var(--surface); color: var(--ink); }
  .sm { padding: 3px 10px; font-size: 12px; }
</style>
