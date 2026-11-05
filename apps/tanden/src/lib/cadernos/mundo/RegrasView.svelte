<script lang="ts">
  import { noteDir, rulesExample, textBankExample, type Entity, type Rules, type World } from '@tanden/core';
  import { rise } from '../../motion';
  import { cadernos } from '../cadernos.svelte';
  import { typeColor, typeGlyph } from '../tipos';
  import Construtor from './Construtor.svelte';
  import LinkText from './LinkText.svelte';

  // Regras do mundo: o que está declarado nos blocos ```regras, os erros
  // (com nota e linha) e um console para testar expressões no mundo de verdade.
  let { world, byPath, onopen, onOpenNote }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    onOpenNote: (path: string) => void;
  } = $props();

  const prog = $derived(cadernos.program(world));
  const files = $derived([...new Set((world.scripts ?? []).map((s) => s.path))]);
  const folder = $derived(world.path ? noteDir(world.path) : `Mundos/${world.name}`);

  // um interpretador por mundo: o console lembra os "seja" entre linhas
  let rt: Rules | null = null;
  let rtWorld = '';
  let rtRev = -1;
  function runtime(): Rules {
    if (!rt || rtWorld !== world.name || rtRev !== cadernos.rev) {
      rt = cadernos.rules(world, {
        notify: (t) => log.push({ kind: 'aviso', text: t }),
        chronicle: (t) => log.push({ kind: 'cronica', text: t }),
      });
      rtWorld = world.name;
      rtRev = cadernos.rev;
    }
    return rt;
  }

  type Entry = { kind: 'in' | 'res' | 'erro' | 'aviso' | 'cronica'; text: string };
  let log = $state<Entry[]>([]);
  let input = $state('');
  let pending = $state(0);
  let past: string[] = [];
  let back = -1;

  function run() {
    const code = input.trim();
    if (!code) return;
    log.push({ kind: 'in', text: code });
    past = [code, ...past.filter((x) => x !== code)].slice(0, 50);
    back = -1;
    input = '';
    try {
      const r = runtime();
      const before = r.issues.length;
      const out = r.evalSource(code);
      for (const i of r.issues.slice(before)) log.push({ kind: 'erro', text: i.message });
      log.push({ kind: 'res', text: out });
      pending = r.changes().length;
    } catch (e) {
      log.push({ kind: 'erro', text: e instanceof Error ? e.message : String(e) });
    }
    if (log.length > 200) log = log.slice(-150);
  }
  function key(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'ArrowUp' && past.length) { e.preventDefault(); back = Math.min(past.length - 1, back + 1); input = past[back]!; }
    if (e.key === 'ArrowDown') { e.preventDefault(); back = Math.max(-1, back - 1); input = back < 0 ? '' : past[back]!; }
  }
  function commit() {
    if (!rt) return;
    cadernos.applyChanges(rt.changes());
    cadernos.say(`${pending} ${pending === 1 ? 'ficha atualizada' : 'fichas atualizadas'}.`);
    rt = null;
    pending = 0;
  }
  function discard() {
    rt = null;
    pending = 0;
    log.push({ kind: 'aviso', text: 'Mudanças do console descartadas.' });
  }

  function createExample() {
    const regras = cadernos.create(`${folder}/Regras`, 'Regras', () => rulesExample(world.name));
    if (!cadernos.exists(`${folder}/Regras/Textos.md`)) cadernos.create(`${folder}/Regras`, 'Textos', () => textBankExample());
    onOpenNote(regras);
  }

  const groupMembers = (name: string) => {
    try {
      return runtime().membersOf(name);
    } catch {
      return [];
    }
  };
  const resolve = (t: string) => world.entities.find((x) => x.name.toLowerCase() === t.toLowerCase()) ?? null;
  const EXAMPLES = ['contar(personagem)', '[p em personagem onde p.ambição > 5].nome', 'maior(facção, "poder").nome', 'quem("afiliação", ficha("Ordem do Sol")).nome', 'dado("2d6") + 3', 'tabela("Encontros")'];
</script>

<div class="regras">
  <section class="head">
    <div>
      <h3>Regras do mundo</h3>
      <p class="dim">Blocos <code>```regras</code> em qualquer nota do mundo criam tipos, grupos, campos calculados, botões nas fichas, eventos, interações entre personagens, traços, profissões e gostos. Elas rodam nas duas simulações (vidas e facções) e nos botões; nada muda nas notas sem você pedir.</p>
    </div>
    <div class="acts">
      <button class="primary" onclick={createExample}>{files.length ? '+ Nota de regras' : 'Começar com um exemplo'}</button>
    </div>
  </section>

  <Construtor {world} {onOpenNote} />

  {#if files.length}
    <div class="files">
      {#each files as f (f)}<button onclick={() => onOpenNote(f)}>📜 {f.split('/').pop()!.replace(/\.md$/, '')}</button>{/each}
    </div>
  {/if}

  {#if prog.issues.length}
    <section class="issues">
      <h3>Erros</h3>
      {#each prog.issues as i, k (k)}
        <button class="issue" onclick={() => onOpenNote(i.path)} in:rise={{ delay: k * 30 }}>
          <span class="where">{i.path.split('/').pop()!.replace(/\.md$/, '')}{i.line ? `:${i.line}` : ''}</span>
          <span>{i.message}</span>
        </button>
      {/each}
    </section>
  {/if}

  {#if files.length}
    <div class="grid">
      {#if prog.types.length}
        <section class="box">
          <h3>Tipos</h3>
          {#each prog.types as t (t.id)}
            <div class="row"><span class="g" style:--c={typeColor(t.id)}>{typeGlyph(t.id)}</span><b>{t.label}</b>
              <small>{[...t.fields, ...t.extras].join(', ') || 'sem campos'}</small></div>
          {/each}
        </section>
      {/if}
      {#if prog.groups.length}
        <section class="box">
          <h3>Grupos</h3>
          {#each prog.groups as g (g.name)}
            {@const m = groupMembers(g.name)}
            <div class="row col"><span><b>{g.label}</b> <small>{m.length} {m.length === 1 ? 'membro' : 'membros'}</small></span>
              <span class="chips">{#each m.slice(0, 12) as e (e.path)}<button class="chip" style:--c={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{/each}</span></div>
          {/each}
        </section>
      {/if}
      {#if prog.actions.length || prog.computed.length}
        <section class="box">
          <h3>Na ficha</h3>
          {#each prog.computed as c, k (k)}<div class="row"><span class="tag">calculado</span><b>{c.name}</b><small>em {c.type}</small></div>{/each}
          {#each prog.actions as a, k (k)}<div class="row"><span class="tag act">botão</span><b>{a.name}</b><small>em {a.type}</small></div>{/each}
        </section>
      {/if}
      {#if prog.handlers.length || prog.interactions.length}
        <section class="box">
          <h3>Na simulação</h3>
          {#each prog.interactions as it, k (k)}
            <div class="row"><span class="tag int">interação</span><b>{it.name}</b><small>{it.a.type}{it.b ? ` ↔ ${it.b.type}` : ''}</small></div>
          {/each}
          {#each prog.handlers as h, k (k)}
            <div class="row"><span class="tag ev">quando</span><b>{h.label}{h.paramsRaw.length ? `(${h.paramsRaw.join(', ')})` : ''}</b>{#if h.type}<small>em {h.type}</small>{/if}</div>
          {/each}
        </section>
      {/if}
    </div>
  {/if}

  <section class="console">
    <header>
      <h3>Console</h3>
      {#if pending}<span class="pend">{pending} {pending === 1 ? 'ficha mudou' : 'fichas mudaram'} <button class="ghost sm" onclick={commit}>Gravar nas fichas</button><button class="ghost sm" onclick={discard}>Descartar</button></span>{/if}
    </header>
    <div class="out">
      {#each log as l, k (k)}
        <div class="l {l.kind}">
          {#if l.kind === 'in'}<span class="pr">›</span>{l.text}
          {:else if l.kind === 'cronica'}<span class="pr">✦</span><LinkText text={l.text} color={(t) => { const x = resolve(t); return x ? typeColor(x.type) : null; }} onlink={(t) => { const x = resolve(t); if (x) onopen(x.path); }} />
          {:else}<span class="pr">{l.kind === 'erro' ? '⛔' : l.kind === 'aviso' ? 'ℹ' : '='}</span>{l.text}{/if}
        </div>
      {:else}
        <p class="dim">Teste qualquer coisa no seu mundo. Exemplos:</p>
        <div class="ex">{#each EXAMPLES as x (x)}<button onclick={() => { input = x; run(); }}><code>{x}</code></button>{/each}</div>
      {/each}
    </div>
    <input bind:value={input} onkeydown={key} placeholder={'expressão ou comando  (ex.: ficha("Kael").ambição += 1)'} spellcheck="false" aria-label="Console das regras" />
  </section>

  <details class="ref">
    <summary>Cola rápida da linguagem</summary>
    <pre>{`tipo navio "Navio" "Navios":       estrutura nova de ficha
  campo capitão / campo velas = 2   extra carga   seção "Viagens"   símbolo ⚓   cor #6fc3c9
grupo nobres = personagem onde título existe e riqueza > 7
calcular idade em personagem = ano - nascimento
ação "Coroar" em personagem onde título não existe:     botão na ficha
quando ano em facção onde poder < 3:                     todo ano da simulação
quando batalha(vencedor, perdedor):  conquista(v, p, lugar)  aliança  traição  paz  crise  queda  inicio
interação "Amizade" entre a em personagem, b em personagem onde a.cultura = b.cultura:
  atração = 10 - distância(a, b)      chance = 5%
interação "Visão" de p em personagem:                    acontecimento de um só

comandos:  x.campo = / += / -=    seja v = ...    se / senão se / senão    para cada p em grupo onde ...
           crônica "{p} faz algo"    avisar "..."    disparar evento(a, b)    convocar "Ação" em p
           liga a, "aliados", b    desliga ...    guerra a, b    aliança a, b    paz a, b    parar
condições: = != < > maior que · menor que · pelo menos · tem · não tem · existe · não existe · é facção · e · ou · não
funções:   chance(20%) dado("2d6") sortear(lista) entre(1, 10) tabela("Banco") contar() soma(l, "campo")
           média() maior(l, "campo") menor() quem("afiliação", x) ficha("Nome") distância(a, b) min max arred
listas:    [p em personagem onde p.fé > 5]   lista.nome   lista.tamanho`}</pre>
  </details>
</div>

<style>
  .regras { display: grid; gap: 14px; padding-bottom: 40px; }
  h3 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
  .head p { margin: 0; font-size: 12.5px; max-width: 640px; }
  .files { display: flex; flex-wrap: wrap; gap: 6px; }
  .files button { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 3px 11px; font-size: 12.5px; color: var(--ink); }
  .files button:hover { border-color: var(--ember); }
  .issues { display: grid; gap: 4px; }
  .issue { display: grid; grid-template-columns: auto 1fr; gap: 10px; text-align: left; border: 1px solid color-mix(in srgb, var(--crit) 45%, var(--line));
    background: color-mix(in srgb, var(--crit) 6%, var(--surface)); border-radius: 10px; padding: 7px 10px; font-size: 13px; color: var(--ink); }
  .where { font: 12px var(--f-mono); color: var(--crit); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
  .box { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 12px; display: grid; gap: 5px; align-content: start; }
  .row { display: flex; align-items: baseline; gap: 7px; font-size: 13px; flex-wrap: wrap; }
  .row.col { flex-direction: column; gap: 3px; }
  .row small { color: var(--muted); font-size: 11.5px; }
  .g { color: var(--c); }
  .tag { font: 600 9.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; border-radius: 6px; padding: 1px 6px; background: var(--surface-2); color: var(--muted); }
  .tag.act { color: var(--ember-soft); }
  .tag.int { color: #7fb6ff; }
  .tag.ev { color: var(--ok); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--ink); border-radius: 999px; padding: 0 8px; font-size: 12px; }
  .console { border: 1px solid var(--line); border-radius: 14px; background: var(--void); overflow: hidden; display: flex; flex-direction: column; }
  .console header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px 0; flex-wrap: wrap; }
  .pend { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--ember-soft); }
  .out { max-height: 300px; min-height: 120px; overflow-y: auto; padding: 6px 12px; font: 13px/1.55 var(--f-mono); }
  .l { display: flex; gap: 8px; word-break: break-word; }
  .pr { flex: none; width: 14px; color: var(--muted); }
  .l.in { color: var(--ember-soft); }
  .l.erro { color: var(--crit); }
  .l.aviso { color: var(--ok); }
  .l.cronica { font-family: var(--f-body); }
  .ex { display: flex; flex-wrap: wrap; gap: 5px; }
  .ex button { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 2px 8px; }
  .ex button:hover { border-color: var(--ember); }
  .console input { border: 0; border-top: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 10px 12px; font: 13px var(--f-mono); outline: none; }
  .console input:focus { background: color-mix(in srgb, var(--ember) 5%, var(--surface)); }
  .ref summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
  .ref pre { margin: 8px 0 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font: 12px/1.6 var(--f-mono); overflow-x: auto; color: var(--ink); }
  .dim { color: var(--muted); }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); color: var(--ink); }
  .ghost.sm { padding: 2px 9px; font-size: 12px; }
  .ghost:hover { border-color: var(--ember); }
</style>
