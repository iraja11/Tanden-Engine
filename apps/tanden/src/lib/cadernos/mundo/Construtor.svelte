<script lang="ts">
  import {
    CAMPOS_PESSOA, EVENTOS_VIDA, INTERACOES, RECEITAS, atributoRegras, catalogo, compileRules, especieRegras, eventoRegras, itemRegras, mecanicaRegras, noteDir,
    profissaoRegras, tracoRegras,
    type AtributoForm, type Etapa, type EspecieForm, type EventoForm, type ItemForm, type Mecanica, type ProfissaoForm, type Quem, type TracoForm, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { cadernos } from '../cadernos.svelte';
  import Condicoes from './construtor/Condicoes.svelte';
  import Efeitos from './construtor/Efeitos.svelte';

  // Construtor do mundo: monta por partes tudo o que a simulação entende
  // (interações, tramas em etapas, traços, atributos, espécies e criaturas,
  // profissões) e escreve o bloco ```regras por você. O texto gerado é a
  // linguagem de sempre: dá para abrir a nota e ajustar à mão depois.
  let { world, onOpenNote }: { world: World; onOpenNote: (path: string) => void } = $props();

  const prog = $derived.by(() => { void cadernos.rev; return cadernos.program(world); });
  const cat = $derived(catalogo(prog, world.entities));
  const tracos = $derived([...cat.tracos.values()].sort((a, b) => a.m.localeCompare(b.m, 'pt-BR')));
  const atributos = $derived([...cat.atributos.values()]);
  const especies = $derived([...cat.especies.values()]);

  type Aba = 'interacao' | 'trama' | 'traco' | 'atributo' | 'especie' | 'item' | 'evento' | 'profissao';
  const ABAS: Array<[Aba, string, string]> = [
    ['interacao', '🤝 Interação', 'Algo entre duas pessoas, de uma só, ou uma reação a um acontecimento.'],
    ['trama', '🧩 Trama em etapas', 'Uma interação que dura meses: sedução, conspiração, vingança, aprendizado.'],
    ['traco', '✦ Traço', 'Uma característica de personalidade, de nascença, marca do corpo ou reputação.'],
    ['atributo', '📏 Atributo', 'Um número que toda pessoa tem: sanidade, fé, honra, envergadura das asas.'],
    ['especie', '🧬 Espécie / criatura', 'Elfos, anões, orcs, lobos, dragões: vida, corpo, traços possíveis, cruzamentos.'],
    ['item', '🗡 Item', 'Um objeto comum ou único (relíquia): dá bônus, traços, maldições; passa de mão em mão, é roubado, herdado, achado.'],
    ['evento', '🌒 Evento do mundo', 'Algo que acontece num lugar (ou no mundo todo) por alguns meses: eclipse, festival, praga, invasão.'],
    ['profissao', '⚒ Profissão', 'Um ofício com renda, habilidade, prestígio e risco.'],
  ];
  let aba = $state<Aba | null>(null);
  let verCodigo = $state<string | null>(null);

  // ---------------------------------------------------------------- formulários
  const novaEtapa = (n: number): Etapa => ({ nome: n === 1 ? 'Começo' : `Etapa ${n}`, dura: 1, efeitos: [], cronica: '', condicoes: [], senao: 'falhar', cronicaSenao: '' });
  const vazioM = (): Mecanica => ({ tipo: 'par', nome: '', chance: 15, atracao: '', condicoes: [], efeitos: [], cronica: '' });
  const vazioTrama = (): Mecanica => ({
    tipo: 'trama', nome: '', chance: 10, atracao: '', condicoes: [], efeitos: [], cronica: '', etapas: [novaEtapa(1), novaEtapa(2)],
    aoConcluir: { efeitos: [], cronica: '' }, aoFalhar: { efeitos: [], cronica: '' },
  });
  const vazioTraco = (): TracoForm => ({ nome: '', feminino: '', desc: '', categoria: 'personalidade', oposto: '', herdavel: 0, pesos: [], afinidades: [], humor: 0, estresse: 0, surge: [], chanceSurge: 20 });
  const vazioAtributo = (): AtributoForm => ({ nome: '', min: 0, max: 100, media: 50, desvio: 15, herdavel: 30, categoria: 'mental', porAno: 0, desc: '' });
  const vazioEspecie = (): EspecieForm => ({ nome: '', plural: '', criatura: false, vida: 70, maioridade: 0, fertilidade: 100, gestacao: 9, altura: 0, ajustes: [], tracos: [], cruzas: [], frequencia: 0, desc: '' });
  const vazioItem = (): ItemForm => ({
    nome: '', unico: true, tipo: 'relíquia', raridade: 'rara', valor: 100, desc: '', ajustes: [], porMes: [], tracos: [], dono: '', lugar: '', cobicado: false,
    aoGanhar: { efeitos: [], cronica: '' }, aoPerder: { efeitos: [], cronica: '' }, todoMes: { efeitos: [], cronica: '', condicoes: [] },
  });
  const vazioEvento = (): EventoForm => ({ nome: '', desc: '', chance: 10, dura: 2, global: false, pesos: [], aoComecar: '', aoAcabar: '', todoMes: { efeitos: [], cronica: '', condicoes: [] } });
  const vazioProf = (): ProfissaoForm => ({ nome: '', feminino: '', renda: 6, habilidade: 'oficio', status: 2, risco: 0, viaja: false, requer: [] });

  let m = $state(vazioM());
  let tr = $state(vazioTrama());
  let tc = $state(vazioTraco());
  let at = $state(vazioAtributo());
  let es = $state(vazioEspecie());
  let pf = $state(vazioProf());
  let it = $state(vazioItem());
  let ev = $state(vazioEvento());
  const DONO: Array<[Quem, string]> = [['a', 'quem tem o item']];
  const PESSOA_EV: Array<[Quem, string]> = [['a', 'cada pessoa lá']];
  const personagens = $derived(world.entities.filter((e) => e.type === 'personagem').map((e) => e.name));
  const lugaresNomes = $derived(world.entities.filter((e) => e.type === 'lugar').map((e) => e.name));
  const camposTodos = $derived([...atributos.map((a) => a.nome), ...CAMPOS_PESSOA.filter((c) => c.id !== 'idade' && c.id !== 'altura').map((c) => c.nome)]);

  const partes = $derived.by(() => {
    if (m.tipo === 'par') return { a: 'a (quem age)', b: 'b (o outro)' };
    if (m.tipo === 'solo') return { a: 'a pessoa', b: null };
    const ev = EVENTOS_VIDA.find((e) => e.id === m.evento);
    if (!ev || !ev.partes.length) return { a: 'cada pessoa', b: null };
    return { a: ev.partes[0]!, b: ev.partes[1] ?? null };
  });
  const quemOps = $derived<Array<[Quem, string]>>(partes.b ? [['a', partes.a], ['b', partes.b]] : [['a', partes.a]]);
  const quemTrama = $derived<Array<[Quem, string]>>(tr.solo ? [['a', 'a pessoa']] : [['a', 'a (quem trama)'], ['b', 'b (o alvo)']]);
  const SO_ELA: Array<[Quem, string]> = [['a', 'a pessoa']];

  const codigo = $derived.by(() => {
    switch (aba) {
      case 'interacao': return mecanicaRegras($state.snapshot(m) as Mecanica);
      case 'trama': return mecanicaRegras($state.snapshot(tr) as Mecanica);
      case 'traco': return tracoRegras($state.snapshot(tc) as TracoForm);
      case 'atributo': return atributoRegras($state.snapshot(at) as AtributoForm);
      case 'especie': return especieRegras($state.snapshot(es) as EspecieForm);
      case 'profissao': return profissaoRegras($state.snapshot(pf) as ProfissaoForm);
      case 'item': return itemRegras($state.snapshot(it) as ItemForm);
      case 'evento': return eventoRegras($state.snapshot(ev) as EventoForm);
      default: return '';
    }
  });
  const problemas = $derived(codigo ? compileRules([{ path: 'construtor', code: codigo }]).issues : []);
  const nome = $derived(
    aba === 'interacao' ? m.nome : aba === 'trama' ? tr.nome : aba === 'traco' ? tc.nome : aba === 'atributo' ? at.nome : aba === 'especie' ? es.nome : aba === 'profissao' ? pf.nome : aba === 'item' ? it.nome : aba === 'evento' ? ev.nome : '',
  );
  const pronto = $derived(!!nome.trim() && !problemas.length && !(aba === 'interacao' && m.tipo === 'reacao' && !m.evento));
  const folder = $derived(world.path ? noteDir(world.path) : `Mundos/${world.name}`);

  /** Acrescenta um bloco ```regras na nota de regras do mundo (ou cria uma). */
  function inserir(code: string, nomeTxt: string) {
    const alvo = (world.scripts ?? [])[0]?.path ?? `${folder}/Regras/Mecânicas.md`;
    if (!cadernos.exists(alvo)) {
      cadernos.create(`${folder}/Regras`, 'Mecânicas', () => `---\ntags: [regras]\n---\n# Mecânicas de ${world.name}\n\nFeitas no construtor da aba Regras. Dá para editar à mão.\n\n\`\`\`regras\n${code}\`\`\`\n`);
    } else {
      cadernos.update(alvo, (t) => `${t.replace(/\s*$/, '')}\n\n\`\`\`regras\n${code}\`\`\`\n`);
    }
    cadernos.say(`"${nomeTxt}" entrou nas regras de ${world.name}. Já vale na próxima simulação (e nas que você reabrir).`);
  }
  function salvar() {
    if (!pronto || !aba) return;
    inserir(codigo, nome.trim());
    if (aba === 'interacao') m = { ...vazioM(), tipo: m.tipo, ...(m.evento ? { evento: m.evento } : {}) };
    else if (aba === 'trama') tr = vazioTrama();
    else if (aba === 'traco') tc = vazioTraco();
    else if (aba === 'atributo') at = vazioAtributo();
    else if (aba === 'especie') es = vazioEspecie();
    else if (aba === 'item') it = vazioItem();
    else if (aba === 'evento') ev = vazioEvento();
    else pf = vazioProf();
  }
  function moverEtapa(i: number, d: number) {
    const l = tr.etapas!;
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j]!, l[i]!];
  }

  // o que o mundo já declarou (para saber o que existe sem abrir as notas)
  const resumo = $derived([
    ...prog.attributes.map((a) => ({ tipo: 'atributo', nome: a.name })),
    ...prog.species.map((s) => ({ tipo: s.creature ? 'criatura' : 'espécie', nome: s.name })),
    ...especies.filter((e) => e.nota).map((e) => ({ tipo: e.criatura ? 'criatura (ficha)' : 'espécie (ficha)', nome: e.nome })),
    ...prog.traits.map((t) => ({ tipo: 'traço', nome: t.m })),
    ...prog.professions.map((p) => ({ tipo: 'profissão', nome: p.m })),
    ...prog.schemes.map((s) => ({ tipo: 'trama', nome: s.name })),
    ...[...cat.itens.values()].map((i) => ({ tipo: i.unico ? 'item único' : 'item', nome: i.nome })),
    ...prog.events.map((e) => ({ tipo: 'evento', nome: e.name })),
    ...prog.interactions.map((s) => ({ tipo: 'interação', nome: s.name })),
  ]);
  const sd = $derived(Math.max(0, at.desvio));
  const camposAjuste = $derived([...atributos.map((a) => ({ id: a.nome, nome: a.nome })), ...CAMPOS_PESSOA.filter((c) => ['corpo'].includes(c.grupo) && c.id !== 'altura').map((c) => ({ id: c.nome, nome: c.nome }))]);
</script>

<section class="cons">
  <header>
    <div>
      <h3>Construtor do mundo</h3>
      <p class="dim">Crie o que a simulação entende, sem escrever código: interações, tramas que duram meses, traços, atributos com valores, espécies e criaturas, profissões. O Tanden escreve as regras (dá para ajustar à mão depois).</p>
    </div>
  </header>

  <nav class="abas" aria-label="O que criar">
    {#each ABAS as [id, label, dica] (id)}
      <button class:on={aba === id} title={dica} onclick={() => (aba = aba === id ? null : id)}>{label}</button>
    {/each}
  </nav>

  {#if resumo.length && !aba}
    <div class="resumo">
      <span class="dim small">No mundo:</span>
      {#each resumo as r, i (i)}<span class="chip"><i>{r.tipo}</i> {r.nome}</span>{/each}
    </div>
  {/if}

  {#if aba}
    <div class="form" in:rise>
      <p class="dim small">{ABAS.find(([id]) => id === aba)?.[2]}</p>

      {#if aba === 'interacao'}
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
          <label>{m.tipo === 'reacao' ? 'Chance' : 'Chance por ano'} <span class="val">{m.chance}%</span><input type="range" min="1" max="100" bind:value={m.chance} /></label>
        </div>
        {#if m.tipo === 'par'}
          <label class="grow">Quem escolhe quem (opcional) <input bind:value={m.atracao} placeholder="atração(a, b) — vazio: qualquer um ao redor" /></label>
        {/if}
        <div class="bloco"><h4>Só quando…</h4><Condicoes bind:conds={m.condicoes} {quemOps} {cat} dupla={!!partes.b} /></div>
        <div class="bloco"><h4>Acontece…</h4><Efeitos bind:efeitos={m.efeitos} {quemOps} {cat} dupla={!!partes.b} /></div>
        <label class="grow">Na crônica <input bind:value={m.cronica} placeholder={partes.b ? '{a} canta para {b} debaixo da janela.' : '{a} passa a noite em claro.'} /></label>

      {:else if aba === 'trama'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={tr.nome} placeholder="Conspiração, Sedução lenta, Vendeta..." /></label>
          <label>Quem
            <select value={tr.solo ? 'solo' : 'par'} onchange={(e) => (tr.solo = (e.currentTarget as HTMLSelectElement).value === 'solo')}>
              <option value="par">uma pessoa contra/com outra</option>
              <option value="solo">uma pessoa só</option>
            </select>
          </label>
          <label>Chance de começar por ano <span class="val">{tr.chance}%</span><input type="range" min="1" max="100" bind:value={tr.chance} /></label>
        </div>
        {#if !tr.solo}<label class="grow">Quem escolhe quem (opcional) <input bind:value={tr.atracao} placeholder="ódio(a, b) — quanto mais, mais provável" /></label>{/if}
        <div class="bloco"><h4>Começa quando…</h4><Condicoes bind:conds={tr.condicoes} quemOps={quemTrama} {cat} dupla={!tr.solo} /></div>

        <div class="etapas">
          {#each tr.etapas! as et, i (i)}
            <div class="etapa">
              <div class="et-head">
                <span class="n">{i + 1}</span>
                <input class="et-nome" bind:value={et.nome} aria-label="Nome da etapa" />
                <label class="inline">espera <input type="number" min="1" bind:value={et.dura} /> {et.dura === 1 ? 'mês' : 'meses'} até a próxima</label>
                <span class="sp"></span>
                <button class="mini" onclick={() => moverEtapa(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                <button class="mini" onclick={() => moverEtapa(i, 1)} disabled={i === tr.etapas!.length - 1} aria-label="Descer">↓</button>
                <button class="mini x" onclick={() => tr.etapas!.splice(i, 1)} disabled={tr.etapas!.length === 1} aria-label="Tirar etapa">×</button>
              </div>
              <div class="bloco"><h4>Só segue se…</h4><Condicoes bind:conds={et.condicoes} quemOps={quemTrama} {cat} dupla={!tr.solo} vazio="segue sempre" /></div>
              {#if et.condicoes.length}
                <div class="linha">
                  <label>Se não
                    <select bind:value={et.senao}>
                      <option value="falhar">a trama falha</option>
                      <option value="repetir">tenta de novo depois</option>
                      {#if i > 0}<option value="voltar">volta à etapa anterior</option>{/if}
                    </select>
                  </label>
                  <label class="grow">e a crônica diz <input bind:value={et.cronicaSenao} placeholder={'{b} desconfia de {a}.'} /></label>
                </div>
              {/if}
              <div class="bloco"><h4>Acontece…</h4><Efeitos bind:efeitos={et.efeitos} quemOps={quemTrama} {cat} dupla={!tr.solo} /></div>
              <label class="grow">Na crônica <input bind:value={et.cronica} placeholder={i === 0 ? '{a} começa a tramar contra {b}.' : '{a} dá o próximo passo.'} /></label>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => tr.etapas!.push(novaEtapa(tr.etapas!.length + 1))}>+ etapa</button>
        </div>

        <div class="fins">
          <div class="bloco"><h4>Se der certo (no fim)</h4><Efeitos bind:efeitos={tr.aoConcluir!.efeitos} quemOps={quemTrama} {cat} dupla={!tr.solo} />
            <input bind:value={tr.aoConcluir!.cronica} placeholder={'{a} consegue o que queria.'} /></div>
          <div class="bloco"><h4>Se falhar</h4><Efeitos bind:efeitos={tr.aoFalhar!.efeitos} quemOps={quemTrama} {cat} dupla={!tr.solo} />
            <input bind:value={tr.aoFalhar!.cronica} placeholder={'O plano de {a} vem abaixo.'} /></div>
        </div>

      {:else if aba === 'traco'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={tc.nome} placeholder="Sonâmbulo" /></label>
          <label class="grow">No feminino<input bind:value={tc.feminino} placeholder="Sonâmbula" /></label>
          <label>Tipo
            <select bind:value={tc.categoria}>
              <option value="personalidade">personalidade</option><option value="congenito">de nascença</option><option value="adquirido">adquirido na vida</option>
              <option value="marca">marca do corpo</option><option value="reputacao">reputação</option>
            </select>
          </label>
        </div>
        <label class="grow">Descrição<input bind:value={tc.desc} placeholder="Anda dormindo nas noites de lua." /></label>
        <div class="linha">
          <label>Oposto <input bind:value={tc.oposto} list="cons-tracos" placeholder="(nenhum)" /></label>
          <label>Passa de pai para filho <span class="val">{tc.herdavel}%</span><input type="range" min="0" max="100" bind:value={tc.herdavel} /></label>
          <label>Humor <input type="number" bind:value={tc.humor} /></label>
          <label>Estresse <input type="number" bind:value={tc.estresse} /></label>
        </div>
        <datalist id="cons-tracos">{#each tracos as t (t.id)}<option value={t.m}></option>{/each}</datalist>
        <div class="bloco">
          <h4>Muda a vontade de…</h4>
          {#each tc.pesos as p, i (i)}
            <div class="item">
              <select bind:value={p.interacao}>{#each INTERACOES as it (it.id)}<option value={it.id}>{it.nome.toLowerCase()}</option>{/each}</select>
              <select bind:value={p.mult}>
                <option value={0}>nunca</option><option value={0.3}>bem menos (−70%)</option><option value={0.6}>menos (−40%)</option>
                <option value={1.5}>mais (+50%)</option><option value={2}>o dobro</option><option value={3}>o triplo</option>
              </select>
              <button class="x" onclick={() => tc.pesos.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => tc.pesos.push({ interacao: 'flertar', mult: 2 })}>+ vontade</button>
        </div>
        <div class="bloco">
          <h4>O que pensa dos outros</h4>
          {#each tc.afinidades as a, i (i)}
            <div class="item">
              <span class="k">de quem é</span>
              <select bind:value={a.traco}><option value="">igual (tem este traço)</option>{#each tracos as t (t.id)}<option value={t.m}>{t.m}</option>{/each}</select>
              <input type="number" bind:value={a.pontos} title="pontos de opinião" /><span class="k">de opinião</span>
              <button class="x" onclick={() => tc.afinidades.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => tc.afinidades.push({ traco: '', pontos: 10 })}>+ opinião</button>
        </div>
        <div class="bloco">
          <h4>Muda o corpo e a mente</h4>
          {#each tc.ajustes ?? [] as a, i (i)}
            <div class="item">
              <input bind:value={a.campo} list="cons-campos" placeholder="força" /><input type="number" bind:value={a.valor} /><span class="k">pontos</span>
              <button class="x" onclick={() => tc.ajustes!.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => (tc.ajustes ??= []).push({ campo: 'força', valor: 10 })}>+ ajuste</button>
        </div>
        <div class="bloco">
          <h4>Surge sozinho quando… (opcional)</h4>
          <Condicoes bind:conds={tc.surge} quemOps={SO_ELA} {cat} dupla={false} vazio="só de nascença, por herança ou dado à mão" />
          {#if tc.surge.length}<label>Chance por ano <span class="val">{tc.chanceSurge}%</span><input type="range" min="1" max="100" bind:value={tc.chanceSurge} /></label>{/if}
        </div>

      {:else if aba === 'atributo'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={at.nome} placeholder="Sanidade, Fé, Honra, Envergadura..." /></label>
          <label>Tipo <input bind:value={at.categoria} list="cons-cats" /></label>
          <datalist id="cons-cats"><option value="físico"></option><option value="mental"></option><option value="social"></option><option value="espiritual"></option><option value="mágico"></option></datalist>
        </div>
        <label class="grow">Descrição<input bind:value={at.desc} placeholder="O quanto a pessoa ainda se agarra à realidade." /></label>
        <div class="linha">
          <label>De <input type="number" bind:value={at.min} /></label>
          <label>até <input type="number" bind:value={at.max} /></label>
          <label>Média ao nascer <input type="number" bind:value={at.media} /></label>
          <label>Variação <input type="number" min="0" bind:value={at.desvio} /></label>
          <label>Muda por ano <input type="number" step="0.5" bind:value={at.porAno} /></label>
        </div>
        <label>Vem dos pais <span class="val">{at.herdavel}%</span><input type="range" min="0" max="100" bind:value={at.herdavel} /></label>
        <label class="grow">Só estas espécies têm (separe por vírgula; vazio = todo mundo)
          <input value={(at.so ?? []).join(', ')} oninput={(e) => (at.so = (e.currentTarget as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Dragão, Wyvern" />
        </label>
        <p class="dim small">Uns 2 em cada 3 nascem entre {Math.max(at.min, at.media - sd)} e {Math.min(at.max, at.media + sd)}. Use nas condições ("sanidade menor que 20"), nos efeitos ("sanidade tira 10") e nas espécies ("Elfo: sanidade +10").</p>

      {:else if aba === 'especie'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={es.nome} placeholder={es.criatura ? 'Lobo' : 'Elfo'} /></label>
          <label class="grow">Plural<input bind:value={es.plural} placeholder={es.criatura ? 'Lobos' : 'Elfos'} /></label>
          <label class="chk"><input type="checkbox" bind:checked={es.criatura} /> criatura (não fala, não trabalha)</label>
        </div>
        <label class="grow">Descrição<input bind:value={es.desc} /></label>
        <div class="linha">
          <label>Vive (anos) <input type="number" min="1" bind:value={es.vida} /></label>
          <label>Adulto aos <input type="number" min="0" bind:value={es.maioridade} placeholder="auto" /></label>
          <label>Fertilidade % <input type="number" min="0" bind:value={es.fertilidade} /></label>
          <label>Gestação (meses) <input type="number" min="1" bind:value={es.gestacao} /></label>
          <label>Altura (cm) <input type="number" min="0" bind:value={es.altura} placeholder="humana" /></label>
        </div>
        <div class="bloco">
          <h4>Corpo e mente (comparado com humanos)</h4>
          {#each es.ajustes as a, i (i)}
            <div class="item">
              <input bind:value={a.campo} list="cons-ajustes" placeholder="força" />
              <input type="number" bind:value={a.valor} /><span class="k">pontos</span>
              <button class="x" onclick={() => es.ajustes.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <datalist id="cons-ajustes">{#each camposAjuste as c (c.id)}<option value={c.id}></option>{/each}</datalist>
          <button class="ghost sm add" onclick={() => es.ajustes.push({ campo: atributos[0]?.nome ?? 'força', valor: 10 })}>+ ajuste</button>
        </div>
        <div class="bloco">
          <h4>Traços de nascença</h4>
          <div class="chips">
            {#each es.tracos as t, i (t)}<span class="chip">{cat.tracos.get(t)?.m ?? t} <button class="x" onclick={() => es.tracos.splice(i, 1)} aria-label="Tirar">×</button></span>{/each}
            <select class="addsel" value="" onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v && !es.tracos.includes(v)) es.tracos.push(v); (e.currentTarget as HTMLSelectElement).value = ''; }}>
              <option value="">+ traço</option>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}
            </select>
          </div>
        </div>
        <div class="bloco">
          <h4>Pode nascer com… (cada um sorteia)</h4>
          {#each es.talvez ?? [] as t, i (i)}
            <div class="item">
              <select bind:value={t.traco}>{#each tracos as x (x.id)}<option value={x.id}>{x.m}</option>{/each}</select>
              <input type="number" min="0" max="100" bind:value={t.pct} /><span class="k">% de chance</span>
              <button class="x" onclick={() => es.talvez!.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => (es.talvez ??= []).push({ traco: tracos[0]?.id ?? 'corajoso', pct: 25 })}>+ traço possível</button>
        </div>
        <div class="bloco">
          <h4>Tem filhos com…</h4>
          {#each es.cruzas as c, i (i)}
            <div class="item">
              <input bind:value={c.com} list="cons-esp" placeholder="Humano" /><span class="k">e os filhos são</span>
              <input bind:value={c.gera} list="cons-esp" placeholder="(da espécie da mãe)" />
              <button class="x" onclick={() => es.cruzas.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <datalist id="cons-esp"><option value="Humano"></option>{#each especies as e (e.id)}<option value={e.nome}></option>{/each}</datalist>
          <button class="ghost sm add" onclick={() => es.cruzas.push({ com: 'Humano', gera: '' })}>+ cruzamento</button>
        </div>
        <label>Entre os figurantes gerados <span class="val">{es.frequencia}%</span><input type="range" min="0" max="100" bind:value={es.frequencia} /></label>

      {:else if aba === 'item'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={it.nome} placeholder="Espada de Aurora" /></label>
          <label>Tipo <input bind:value={it.tipo} list="cons-tipos-item" /></label>
          <datalist id="cons-tipos-item"><option value="arma"></option><option value="armadura"></option><option value="joia"></option><option value="livro"></option><option value="relíquia"></option><option value="poção"></option><option value="ferramenta"></option></datalist>
          <label>Raridade
            <select bind:value={it.raridade}><option value="comum">comum</option><option value="incomum">incomum</option><option value="rara">rara</option><option value="lendária">lendária</option></select>
          </label>
          <label>Valor <input type="number" min="0" bind:value={it.valor} /></label>
        </div>
        <div class="linha">
          <label class="chk"><input type="checkbox" bind:checked={it.unico} /> único no mundo</label>
          <label class="chk"><input type="checkbox" bind:checked={it.cobicado} /> cobiçado (atrai ladrões)</label>
        </div>
        <label class="grow">Descrição<input bind:value={it.desc} placeholder="Brilha quando há mentira por perto." /></label>
        <div class="linha">
          <label class="grow">Com quem começa <input bind:value={it.dono} list="cons-pers" placeholder="(ninguém)" /></label>
          {#if !it.dono.trim()}<label class="grow">ou largado em <input bind:value={it.lugar} list="cons-lugares" placeholder="(em lugar nenhum)" /></label>{/if}
        </div>
        <datalist id="cons-pers">{#each personagens as n (n)}<option value={n}></option>{/each}</datalist>
        <datalist id="cons-lugares">{#each lugaresNomes as n (n)}<option value={n}></option>{/each}</datalist>
        <div class="bloco">
          <h4>Enquanto alguém tem</h4>
          {#each it.ajustes as a, i (i)}
            <div class="item">
              <input bind:value={a.campo} list="cons-campos" placeholder="combate" /><input type="number" bind:value={a.valor} /><span class="k">pontos</span>
              <button class="x" onclick={() => it.ajustes.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          {#each it.porMes as a, i (i)}
            <div class="item">
              <span class="k">todo mês</span><input bind:value={a.campo} list="cons-campos" placeholder="humor" /><input type="number" step="0.5" bind:value={a.valor} />
              <button class="x" onclick={() => it.porMes.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <div class="chips">
            {#each it.tracos as t, i (t)}<span class="chip">dá {cat.tracos.get(t)?.m ?? t} <button class="x" onclick={() => it.tracos.splice(i, 1)} aria-label="Tirar">×</button></span>{/each}
          </div>
          <div class="linha">
            <button class="ghost sm add" onclick={() => it.ajustes.push({ campo: 'combate', valor: 3 })}>+ bônus</button>
            <button class="ghost sm add" onclick={() => it.porMes.push({ campo: 'humor', valor: -1 })}>+ efeito por mês</button>
            <select class="addsel" value="" onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v && !it.tracos.includes(v)) it.tracos.push(v); (e.currentTarget as HTMLSelectElement).value = ''; }}>
              <option value="">+ dá um traço</option>{#each tracos as t (t.id)}<option value={t.id}>{t.m}</option>{/each}
            </select>
          </div>
        </div>
        <div class="fins">
          <div class="bloco"><h4>Quando alguém ganha</h4><Efeitos bind:efeitos={it.aoGanhar.efeitos} quemOps={DONO} {cat} dupla={false} />
            <input bind:value={it.aoGanhar.cronica} placeholder={'{dono} sente o peso da lâmina.'} /></div>
          <div class="bloco"><h4>Quando perde</h4><Efeitos bind:efeitos={it.aoPerder.efeitos} quemOps={DONO} {cat} dupla={false} />
            <input bind:value={it.aoPerder.cronica} placeholder={'{dono} se sente nu sem ela.'} /></div>
          <div class="bloco"><h4>Todo mês</h4><Condicoes bind:conds={it.todoMes.condicoes} quemOps={DONO} {cat} dupla={false} />
            <Efeitos bind:efeitos={it.todoMes.efeitos} quemOps={DONO} {cat} dupla={false} />
            <input bind:value={it.todoMes.cronica} placeholder="(nada na crônica)" /></div>
        </div>

      {:else if aba === 'evento'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={ev.nome} placeholder="Lua de Sangue" /></label>
          <label>Chance por ano <span class="val">{ev.chance ? `${ev.chance}%` : 'só à mão'}</span><input type="range" min="0" max="100" bind:value={ev.chance} /></label>
          <label>Dura (meses) <input type="number" min="1" bind:value={ev.dura} /></label>
          <label class="chk"><input type="checkbox" bind:checked={ev.global} /> no mundo todo</label>
        </div>
        <label class="grow">Descrição<input bind:value={ev.desc} placeholder="o céu fica vermelho por dias" /></label>
        <div class="bloco">
          <h4>Enquanto dura, as pessoas…</h4>
          {#each ev.pesos as p, i (i)}
            <div class="item">
              <select bind:value={p.interacao}>{#each INTERACOES as x (x.id)}<option value={x.id}>{x.nome.toLowerCase()}</option>{/each}</select>
              <select bind:value={p.mult}>
                <option value={0}>nunca</option><option value={0.3}>bem menos</option><option value={0.6}>menos</option>
                <option value={1.5}>mais</option><option value={2}>o dobro</option><option value={3}>o triplo</option>
              </select>
              <button class="x" onclick={() => ev.pesos.splice(i, 1)} aria-label="Tirar">×</button>
            </div>
          {/each}
          <button class="ghost sm add" onclick={() => ev.pesos.push({ interacao: 'brigar', mult: 2 })}>+ vontade</button>
        </div>
        <div class="bloco"><h4>Todo mês, para cada pessoa lá</h4>
          <Condicoes bind:conds={ev.todoMes.condicoes} quemOps={PESSOA_EV} {cat} dupla={false} vazio="todo mundo" />
          <Efeitos bind:efeitos={ev.todoMes.efeitos} quemOps={PESSOA_EV} {cat} dupla={false} />
          <input bind:value={ev.todoMes.cronica} placeholder="(nada na crônica)" />
        </div>
        <div class="fins">
          <label>Ao começar, a crônica diz <input bind:value={ev.aoComecar} placeholder={'{Um silêncio|Um uivo} corta {lugar}.'} /></label>
          <label>Ao acabar <input bind:value={ev.aoAcabar} placeholder={'A lua volta a ser branca sobre {lugar}.'} /></label>
        </div>

      {:else if aba === 'profissao'}
        <div class="linha">
          <label class="grow">Nome<input bind:value={pf.nome} placeholder="Caçador de recompensas" /></label>
          <label class="grow">No feminino<input bind:value={pf.feminino} placeholder="Caçadora de recompensas" /></label>
        </div>
        <div class="linha">
          <label>Renda por mês <input type="number" bind:value={pf.renda} /></label>
          <label>Habilidade
            <select bind:value={pf.habilidade}><option value="combate">combate</option><option value="labia">lábia</option><option value="intriga">intriga</option><option value="oficio">ofício</option><option value="saber">saber</option></select>
          </label>
          <label>Prestígio (0 a 5) <input type="number" min="0" max="5" bind:value={pf.status} /></label>
          <label>Risco de acidente % ao mês <input type="number" min="0" step="0.5" bind:value={pf.risco} /></label>
          <label class="chk"><input type="checkbox" bind:checked={pf.viaja} /> vive na estrada</label>
        </div>
        <div class="bloco"><h4>Só para quem…</h4><Condicoes bind:conds={pf.requer} quemOps={SO_ELA} {cat} dupla={false} vazio="qualquer adulto" /></div>
      {/if}

      <datalist id="cons-campos">{#each camposTodos as c (c)}<option value={c}></option>{/each}</datalist>
      <p class="dica">💡 Nos textos: <code>{'{a}'}</code> vira o nome; <code>{'{rico|abastado|cheio da grana}'}</code> sorteia uma palavra; <code>{'{a:cansado/cansada}'}</code> concorda com o gênero.</p>
      <div class="prev">
        <h4>O que vai ser escrito</h4>
        <pre>{codigo}</pre>
        {#if problemas.length}<p class="err">⚠ {problemas[0]!.message}</p>{/if}
      </div>
      <div class="acts">
        <button class="ghost" onclick={() => (aba = null)}>Fechar</button>
        <button class="primary" disabled={!pronto} onclick={salvar}>Adicionar ao mundo</button>
      </div>
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
    {#if (world.scripts ?? []).length}<p class="dim small">Tudo entra em <button class="lk" onclick={() => onOpenNote((world.scripts ?? [])[0]!.path)}>{(world.scripts ?? [])[0]!.path.split('/').pop()?.replace(/\.md$/, '')}</button>.</p>{/if}
  </div>
</section>

<style>
  .cons { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; display: grid; gap: 12px; }
  header p { margin: 0; font-size: 12.5px; }
  h3, h4 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .abas { display: flex; flex-wrap: wrap; gap: 6px; }
  .abas button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 999px; padding: 6px 12px; font-size: 13px; color: var(--ink); }
  .abas button:hover { border-color: var(--ember); }
  .abas button.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 16%, var(--surface)); }
  .resumo { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .chip { display: inline-flex; gap: 4px; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; font-size: 12px; background: var(--surface-2); }
  .chip i { font-style: normal; color: var(--muted); font-size: 11px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .form { display: grid; gap: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
  .linha { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  label.inline { display: inline-flex; align-items: center; gap: 5px; }
  .grow { flex: 1; min-width: 160px; }
  .bloco { display: grid; gap: 5px; }
  .item { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; padding: 4px 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
  .k { font-size: 12.5px; color: var(--ink); }
  .x { border: 0; background: none; color: var(--muted); margin-left: auto; font-size: 15px; padding: 0 2px; }
  .x:hover { color: var(--crit); }
  .addsel { border-style: dashed !important; color: var(--muted) !important; }
  .add { justify-self: start; border-style: dashed; }
  select, input:not([type='range']):not([type='checkbox']) { background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 4px 7px; font-size: 12.5px; min-width: 0; }
  input[type='number'] { width: 76px; font-family: var(--f-mono); }
  input[type='range'] { accent-color: var(--ember); }
  .chk { display: inline-flex; gap: 6px; align-items: center; grid-auto-flow: column; color: var(--ink); }
  .val { color: var(--ember-soft); font: 11.5px var(--f-mono); }
  .etapas { display: grid; gap: 8px; }
  .etapa { display: grid; gap: 8px; border: 1px solid var(--line); border-left: 3px solid var(--ember); border-radius: 12px; padding: 10px; background: color-mix(in srgb, var(--surface-2) 60%, var(--surface)); }
  .et-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .n { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--ember); color: var(--on-ember); font: 700 12px var(--f-mono); }
  .et-nome { font-weight: 600; font-size: 13.5px !important; }
  .sp { flex: 1; }
  .mini { border: 1px solid var(--line); background: var(--surface); border-radius: 7px; width: 26px; height: 26px; padding: 0; color: var(--muted); }
  .mini:disabled { opacity: .35; }
  .mini.x { margin: 0; }
  .fins { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
  .fins input { width: 100%; }
  .dica { margin: 0; font-size: 12px; color: var(--muted); }
  .dica code { font: 11.5px var(--f-mono); color: var(--ember-soft); background: var(--void); padding: 1px 4px; border-radius: 4px; }
  .prev pre, .rc pre { margin: 0; background: var(--void); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; font: 12px/1.5 var(--f-mono); color: var(--ink); white-space: pre-wrap; overflow-x: auto; }
  .err { color: var(--crit); font-size: 12.5px; margin: 4px 0 0; }
  .acts { display: flex; justify-content: flex-end; gap: 8px; }
  .receitas .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
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
