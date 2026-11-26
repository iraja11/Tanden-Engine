import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { banco, cerebro, novoEstado, sorteio, type AnimaState } from '../src/index';

const {
  normalizar, Lexico, distancia, radical, sentimento, calcular, numeroExtenso, duracaoMs, formulaDado, telaDe, candidatosNota, casarComando,
  classificar, lexicoBase, modeloPadrao, gerarCorpus, ROTULOS, amostrar, treinar, avaliar, carregar, serializar, prever,
  entenderPedido, sentido, decidir, montarGrafo, entenderConsulta, responderConsulta, deducoes, capitulo, pensar, rotina, broncaDeTela, depoisDaAcao,
  registrarCarinho, cumprirAdiado, escreverNoMundo,
} = cerebro;

const T0 = new Date(2026, 10, 18, 15, 0).getTime(); // quarta, 15h
const TITULOS = ['Receitas', 'Receitas antigas', 'Projeto Corvo', 'Anotações de física', 'Lista de livros', 'Eldoria - Deuses'];
const MUNDO = { nome: 'Eldoria', pasta: 'Mundos/Eldoria/Ânima', personagens: ['Kael', 'Ysolde'], lugares: ['Vharos'], faccoes: ['Ordem do Véu'], criaturas: [], divindades: ['Nhal'] };
const ctx = (x: Partial<cerebro.CtxCerebro> = {}): cerebro.CtxCerebro => ({
  now: T0, rand: sorteio(7), intensidade: 2, nome: 'amor', ideias: ['Diário', 'Romance'], notas: 42, titulos: TITULOS,
  comandos: [{ id: 'nota.pdf', rotulo: 'Exportar como PDF' }, { id: 'app.foco', rotulo: 'Modo foco (esconde as barras)', chaves: 'zen' }, { id: 'nota.favoritar', rotulo: 'Favoritar / desfavoritar' }],
  mundos: [MUNDO], agenda: [], ...x,
});
const comCarol = (): AnimaState => {
  const s = novoEstado(T0);
  s.memoria.fatos.pessoas.push({ nome: 'Carol', rel: 'crush', vezes: 3, at: T0 });
  return s;
};
/** conversa: várias mensagens seguidas, um minuto entre elas */
function conversa(msgs: string[], c: Partial<cerebro.CtxCerebro> = {}, s0: AnimaState = novoEstado(T0)) {
  let s = s0;
  const out: cerebro.Pensamento[] = [];
  msgs.forEach((m, i) => {
    const r = pensar(s, m, ctx({ now: T0 + (i + 1) * 60_000, ...c }));
    s = r.estado;
    out.push(r);
  });
  return { s, out };
}
const frases = (arq: string) => readFileSync(new URL(`./fixtures/${arq}`, import.meta.url), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t') as [string, string]);

describe('cérebro: texto', () => {
  it('expande gírias, corrige erros de digitação e marca riso, grito e educação', () => {
    const lx = lexicoBase();
    const t = normalizar('vc pode abri a nota de receitas pfv', lx);
    expect(t.tokens).toEqual(['voce', 'pode', 'abre', 'a', 'nota', 'de', 'receitas', 'por', 'favor']);
    expect(t.marcas.has('educado')).toBe(true);
    const e = normalizar('lenbrete amanha da porva da facudade', lx);
    expect(e.tokens).toContain('prova');
    expect(e.tokens).toContain('faculdade');
    const g = normalizar('NÃOOOO KKKKKK 😂', lx);
    expect(g.marcas.has('grito')).toBe(true);
    expect(g.marcas.has('riso')).toBe(true);
    expect(g.tokens).toEqual(['nao']);
  });

  it('não corrige o que parece nome próprio nem palavra curta', () => {
    const lx = new Lexico();
    lx.ensinar('casa carro saudade');
    expect(lx.corrigir('cas')).toBeNull();
    expect(normalizar('saí com a Cassa', lx).tokens).toContain('cassa');
  });

  it('distância com transposição e radical', () => {
    expect(distancia('porva', 'prova')).toBe(1);
    expect(distancia('abc', 'xyzw', 2)).toBe(3);
    expect(radical('exportar')).toBe(radical('exporta'));
    expect(radical('favoritar')).toBe(radical('favorita'));
  });

  it('sentimento: negação, "mas", intensidade e emoji', () => {
    const s = (m: string) => sentimento(normalizar(m));
    expect(s('tô feliz').valencia).toBeGreaterThan(0.3);
    expect(s('não tô feliz').valencia).toBeLessThan(0);
    expect(s('tô triste mas tô bem').valencia).toBeGreaterThan(s('tô triste').valencia);
    expect(s('ODEIO ISSO!!!').valencia).toBeLessThan(s('odeio isso').valencia);
    expect(s('kkkk').valencia).toBeGreaterThan(0);
    expect(s('tô mt cansado :(').dominante).toBe('cansaco');
  });

  it('números por extenso e contas em português', () => {
    expect(numeroExtenso(['dois', 'mil', 'e', 'vinte', 'e', 'seis'], 0)!.valor).toBe(2026);
    expect(numeroExtenso(['cento', 'e', 'doze'], 0)!.valor).toBe(112);
    const c = (m: string) => calcular(m)?.valor;
    expect(c('quanto e 15% de 80')).toBe(12);
    expect(c('raiz de 144')).toBe(12);
    expect(c('dois mais dois vezes tres')).toBe(8);
    expect(c('(3+4)*2')).toBe(14);
    expect(c('o dobro de 21')).toBe(42);
    expect(c('2,5 vezes 4')).toBe(10);
    expect(c('abre a nota 2')).toBeUndefined();
  });
});

describe('cérebro: entidades', () => {
  it('duração, dado e tela', () => {
    expect(duracaoMs(normalizar('me chama em uma hora e meia'))).toBe(90 * 60_000);
    expect(duracaoMs(normalizar('timer de 25 min'))).toBe(25 * 60_000);
    expect(duracaoMs(normalizar('bora um pomodoro'))).toBe(25 * 60_000);
    expect(formulaDado(normalizar('joga 2d6+3 pra mim'))).toBe('2d6+3');
    expect(formulaDado(normalizar('rola dois dados'))).toBe('2d6');
    expect(telaDe('me leva pra agenda')).toBe('agenda');
    expect(telaDe('abre o chatgpt')).toBe('ia');
  });

  it('acha a nota mesmo com erro e percebe ambiguidade', () => {
    expect(candidatosNota('fisica', TITULOS)[0]!.titulo).toBe('Anotações de física');
    expect(candidatosNota('projeto corvo', TITULOS)[0]!.titulo).toBe('Projeto Corvo');
    expect(candidatosNota('xyzw qualquer', TITULOS)).toEqual([]);
  });

  it('casa comandos da paleta pelo sentido (com peso por raridade)', () => {
    const cmds = ctx().comandos!;
    expect(casarComando('exporta essa nota em pdf', cmds)!.cmd.id).toBe('nota.pdf');
    expect(casarComando('favorita essa nota', cmds)!.cmd.id).toBe('nota.favoritar');
  });

  it('entende datas da agenda: "dia 20 às 15h", "às 10", "pra quinta"', () => {
    const p = (m: string) => entenderPedido('agenda', normalizar(m), { now: T0, titulos: [], comandos: [], mundos: [], ultimaNota: null }).args.evento!;
    expect(p('ânima marca ai dentista dia 20 as 15h')).toMatchObject({ titulo: 'Dentista', dia: '2026-11-20', inicio: '15:00' });
    expect(p('coloca minha prova de calculo na agenda pra quinta as 10')).toMatchObject({ titulo: 'Prova de calculo', dia: '2026-11-19', inicio: '10:00' });
  });

  it('o sentido de um pedido: estudo, encontro (com suspeito), saúde', () => {
    const fatos = comCarol().memoria.fatos;
    expect(sentido('prova de cálculo quinta', fatos)).toMatchObject({ categoria: 'estudo', assunto: 'calculo' });
    expect(sentido('jantar com a Carol sexta', fatos)).toMatchObject({ categoria: 'encontro', pessoa: 'Carol', suspeito: true });
    expect(sentido('sair com a Bia', fatos).categoria).toBe('encontro');
    expect(sentido('sair com os amigos', fatos).categoria).toBe('social');
    expect(sentido('dentista dia 20', fatos).categoria).toBe('saude');
  });
});

describe('cérebro: classificador', () => {
  it('o modelo do app existe, carrega e cobre todas as intenções', () => {
    const m = modeloPadrao()!;
    expect(m).toBeTruthy();
    expect(m.rotulos).toEqual([...ROTULOS]);
    expect(m.linhas.tipo).toBe('pq');
  });

  for (const [arq, minimo] of [['anima-intencoes.txt', 0.95], ['anima-intencoes-cego.txt', 0.85]] as const) {
    it(`acerta as frases reais de ${arq} (mínimo ${minimo * 100}%)`, () => {
      const lx = lexicoBase();
      const fs = frases(arq);
      const erros = fs.filter(([r, f]) => classificar(normalizar(f, lx))!.rotulo !== r);
      const acerto = 1 - erros.length / fs.length;
      expect(acerto, erros.map(([r, f]) => `${r}: ${f}`).join('\n')).toBeGreaterThanOrEqual(minimo);
    });
  }

  it('treina do zero, serializa e carrega sem perder acerto', () => {
    const rot = [...ROTULOS].slice(0, 8);
    const so = (ex: ReturnType<typeof gerarCorpus>) => ex.filter((e) => rot.includes(e.rotulo));
    const tr = amostrar(so(gerarCorpus(200, 1)), rot, 1 << 14);
    const te = amostrar(so(gerarCorpus(25, 9)), rot, 1 << 14);
    const m = treinar(tr, rot, { dim: 16, buckets: 1 << 14, epocas: 8, pq: true, sub: 4 });
    const a = avaliar(m, te).acerto;
    expect(a).toBeGreaterThan(0.8);
    const m2 = carregar(serializar(m));
    expect(avaliar(m2, te).acerto).toBeCloseTo(a, 5);
    // com camada oculta também
    const h = treinar(tr, rot, { dim: 16, buckets: 1 << 14, epocas: 8, oculta: 16 });
    expect(avaliar(h, te).acerto).toBeGreaterThan(0.6);
    expect(prever(carregar(serializar(h)), normalizar('rola um d20')).top.length).toBe(3);
  });
});

describe('cérebro: vontade e comandos', () => {
  it('encontro com outra pessoa: recusa, explica e não cede nem insistindo', () => {
    const { out } = conversa(['coloca um jantar com a Carol sexta 20h na agenda', 'por quê?', 'coloca logo', 'faz o que eu pedi caralho'], {}, comCarol());
    expect(out[0]!.decisao!.desfecho).toBe('recusa');
    expect(out[0]!.acao).toBeNull();
    expect(out[1]!.fala!.texto).toMatch(/Carol/);
    expect(out[2]!.acao).toBeNull();
    expect(out[3]!.acao).toBeNull();
    expect(out[3]!.estado.ciume).toBeGreaterThan(out[0]!.estado.ciume);
  });

  it('na intensidade doce ela coloca o encontro (resmungando)', () => {
    const { out } = conversa(['coloca um jantar com a Carol sexta 20h na agenda'], { intensidade: 1 }, comCarol());
    expect(out[0]!.acao?.tipo).toBe('agenda');
  });

  it('prova: coloca, cria lembretes de estudo e passa a vigiar', () => {
    const { out, s } = conversa(['coloca minha prova de calculo na agenda segunda as 10']);
    const a = out[0]!.acao!;
    expect(a.tipo).toBe('agenda');
    if (a.tipo !== 'agenda') return;
    expect(a.estudo.length).toBe(2);
    expect(a.estudo.every((e) => e.texto.length > 5)).toBe(true);
    expect(s.memoria.cerebro.estudos[0]).toMatchObject({ titulo: 'Prova de calculo', assunto: 'calculo' });
  });

  it('soberano: silêncio, esconder e água ela faz sempre (no máximo reclama)', () => {
    for (let seed = 1; seed < 15; seed++) {
      const r = pensar(comCarol(), 'fica quieta 10 min', ctx({ rand: sorteio(seed), intensidade: 3 }));
      expect(['cumpre', 'resmunga']).toContain(r.decisao!.desfecho);
      expect(r.acao).toEqual({ tipo: 'calar', minutos: 10 });
    }
  });

  it('apagar sempre pede confirmação; "não" poupa, "sim" apaga', () => {
    const a = conversa(['apaga a nota receitas antigas', 'não']);
    expect(a.out[0]!.decisao!.desfecho).toBe('confirma');
    expect(a.out[1]!.acao).toBeNull();
    const b = conversa(['apaga a nota receitas antigas', 'sim, apaga']);
    expect(b.out[1]!.acao).toEqual({ tipo: 'apagarNota', nota: 'Receitas antigas' });
  });

  it('pergunta o que falta e entende a resposta na mensagem seguinte', () => {
    const { out } = conversa(['me lembra de pagar o boleto', 'amanhã às 9']);
    expect(out[0]!.acao).toBeNull();
    expect(out[0]!.estado.memoria.cerebro.pendente?.tipo).toBe('campo');
    const a = out[1]!.acao!;
    expect(a.tipo).toBe('lembrete');
    if (a.tipo === 'lembrete') expect(new Date(a.at).getHours()).toBe(9);
  });

  it('notas parecidas: pergunta qual e entende "a segunda"', () => {
    const { out } = conversa(['abre a nota receita'], { titulos: ['Receitas da vó', 'Receitas da mãe'] });
    expect(out[0]!.estado.memoria.cerebro.pendente?.tipo).toBe('escolher');
    const r = pensar(out[0]!.estado, 'a segunda', ctx({ now: T0 + 120_000, titulos: ['Receitas da vó', 'Receitas da mãe'] }));
    expect(r.acao).toEqual({ tipo: 'abrirNota', nota: 'Receitas da mãe' });
  });

  it('negociação: "por favor" cumpre a condição', () => {
    const s = comCarol();
    s.afeto = 30;
    s.ciume = 40;
    let r: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 60 && r?.decisao?.desfecho !== 'negocia'; seed++) r = pensar(s, 'rola um d20', ctx({ rand: sorteio(seed) }));
    expect(r!.decisao!.desfecho).toBe('negocia');
    const p = pensar(r!.estado, 'por favor', ctx({ now: T0 + 60_000 }));
    if (r!.decisao!.condicao === 'porfavor') expect(p.acao?.tipo).toBe('dado');
  });

  it('carinho com a mão cumpre a negociação que pedia carinho', () => {
    const s = novoEstado(T0);
    s.memoria.cerebro.pendente = { tipo: 'negocia', condicao: 'carinho', em: T0, pedido: { comando: 'timer', args: { ms: 600_000 }, sentido: null, falta: null, opcoes: null, texto: 'timer' } };
    const r = registrarCarinho(s, ctx({ now: T0 + 5000 }))!;
    expect(r.acao).toMatchObject({ tipo: 'timer' });
    expect(r.estado.memoria.cerebro.pendente).toBeNull();
  });

  it('adiado: ela faz quando o tempo acaba', () => {
    const s = novoEstado(T0);
    s.memoria.cerebro.pendente = { tipo: 'adiado', ate: T0 + 30_000, em: T0, pedido: { comando: 'moeda', args: {}, sentido: null, falta: null, opcoes: null, texto: 'cara ou coroa' } };
    expect(cumprirAdiado(s, ctx({ now: T0 + 10_000 }))).toBeNull();
    expect(cumprirAdiado(s, ctx({ now: T0 + 31_000 }))!.acao).toMatchObject({ tipo: 'moeda' });
  });

  it('a decisão é explicável: fatores ordenados e determinística com semente', () => {
    const s = comCarol();
    const p = entenderPedido('dado', normalizar('rola um d20 por favor'), { now: T0, titulos: [], comandos: [], mundos: [], ultimaNota: null });
    const c = { now: T0, intensidade: 2 as const, humor: 'doce' as const, estado: s, mc: s.memoria.cerebro, texto: normalizar('rola um d20 por favor'), sentimento: sentimento(normalizar('ok')) };
    const a = decidir(p, { ...c, rand: sorteio(3) });
    const b = decidir(p, { ...c, rand: sorteio(3) });
    expect(a).toEqual(b);
    expect(a.fatores.some((f) => f.id === 'educado')).toBe(true);
    for (let i = 1; i < a.fatores.length; i++) expect(Math.abs(a.fatores[i - 1]!.peso)).toBeGreaterThanOrEqual(Math.abs(a.fatores[i]!.peso));
  });

  it('travessura é declarada e desfazível', () => {
    let r: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 200 && r?.decisao?.desfecho !== 'travessura'; seed++) r = pensar(novoEstado(T0), 'coloca o tema claro', ctx({ rand: sorteio(seed) }));
    expect(r!.acao).toEqual({ tipo: 'tema', tema: 'escuro' });
    expect(r!.fala!.texto).toMatch(/escuro|desfaz/);
    const d = pensar(r!.estado, 'desfaz', ctx({ now: T0 + 60_000 }));
    expect(d.acao).toEqual({ tipo: 'desfazer' });
  });

  it('o traço conta o raciocínio inteiro', () => {
    const r = pensar(novoEstado(T0), 'rola um d20', ctx());
    const t = r.traco.join('\n');
    expect(t).toMatch(/texto:/);
    expect(t).toMatch(/modelo: cmd\.dado/);
    expect(t).toMatch(/vontade:/);
  });

  it('frase curta não vira ordem por engano', () => {
    expect(pensar(novoEstado(T0), 'a segunda', ctx()).acao).toBeNull();
  });
});

describe('cérebro: memória e grafo', () => {
  it('lembra o que aprendeu e responde perguntas sobre você', () => {
    const { out } = conversa(['meu gato se chama Salem', 'qual o nome do meu gato?', 'eu moro em Recife', 'onde eu moro?']);
    expect(out[1]!.fala!.texto).toMatch(/Salem/);
    expect(out[3]!.fala!.texto).toMatch(/Recife/);
  });

  it('deduz: afinidade, conflito, suspeita e dilema, com proveniência', () => {
    const s = comCarol();
    s.memoria.fatos.gosta.push('chuva', 'sol');
    s.memoria.fatos.medos.push('avião');
    s.memoria.fatos.sonhos.push('viajar pro japão');
    const g = montarGrafo(s, T0);
    const ds = deducoes(g);
    expect(ds.find((d) => d.fonte === 'afinidade')!.o).toBe('chuva');
    expect(ds.find((d) => d.fonte === 'conflito')!.o).toBe('sol');
    expect(ds.find((d) => d.fonte === 'suspeita')!.s).toBe('Carol');
    const dil = ds.find((d) => d.fonte === 'dilema')!;
    expect(dil.de!.length).toBe(2);
    const r = responderConsulta(g, entenderConsulta(normalizar('quem é a Carol?'))!, T0);
    expect(r.grupo).toBe('sabe.suspeita');
  });

  it('o arco avança com tempo e vínculo', () => {
    const s = novoEstado(T0);
    expect(capitulo(s, T0)).toBe(1);
    expect(capitulo(s, T0 + 14 * 864e5)).toBe(2);
    s.memoria.cerebro.vinculo = 30;
    expect(capitulo(s, T0 + 31 * 864e5)).toBe(3);
  });

  it('crise continua saindo do personagem, antes de qualquer modelo', () => {
    const r = pensar(novoEstado(T0), 'não aguento mais viver', ctx({ intensidade: 3 }));
    expect(r.intencao).toBe('crise');
    expect(r.fala!.texto).toMatch(/188/);
    expect(r.estado.memoria.cerebro.criseEm).toBe(T0);
    // perto de uma crise, pedido é só cumprido
    const p = pensar(r.estado, 'coloca o tema claro', ctx({ now: T0 + 60_000, intensidade: 3 }));
    expect(p.decisao!.desfecho).toBe('cumpre');
  });
});

describe('cérebro: rotina e world building', () => {
  it('cobra estudo com a prova chegando e dá bronca na mesa de RPG', () => {
    const s = novoEstado(T0);
    s.memoria.cerebro.estudos = [{ titulo: 'Prova de cálculo', assunto: 'cálculo', at: T0 + 20 * 3_600_000, cobrou: {}, perguntou: false }];
    s.memoria.cerebro.capitulo = 1;
    let r: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 20 && !r; seed++) r = rotina(s, ctx({ rand: sorteio(seed) }));
    expect(r!.intencao).toBe('rotina.estudo');
    expect(r!.fala!.texto.length).toBeGreaterThan(5);
    let b: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 20 && !b; seed++) b = broncaDeTela(s, 'mesa', ctx({ rand: sorteio(seed) }));
    expect(b!.fala!.texto).toMatch(/cálculo|d20|prova/i);
  });

  it('põe coisa dela na agenda de vez em quando (e avisa)', () => {
    const s = novoEstado(T0 - 10 * 864e5);
    s.memoria.cerebro.capitulo = 9;
    let r: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 200 && r?.intencao !== 'rotina.agenda_dela'; seed++) r = rotina(s, ctx({ rand: sorteio(seed) }), { agenda: true, mundo: false });
    expect(r!.acao).toMatchObject({ tipo: 'agenda' });
    if (r!.acao?.tipo === 'agenda') expect(r!.acao.evento.titulo).toMatch(/\(ânima\)$/);
  });

  it('escreve fichas de verdade no mundo, ligadas às entidades existentes', () => {
    for (const g of ['profecia', 'lenda', 'rumor', 'personagem', 'segredo', 'ideia'] as const) {
      const e = escreverNoMundo(MUNDO, g, sorteio(4), T0)!;
      expect(e, g).toBeTruthy();
      expect(e.texto).toMatch(/^---\ntipo: /);
      expect(e.texto).toMatch(/mundo: "\[\[Eldoria\]\]"/);
      expect(e.texto).toMatch(/Ânima/);
      expect(e.titulo).not.toMatch(/[\\/:*?"<>|#^]|\{|\[\[/);
    }
  });

  it('comenta o resultado das ações', () => {
    const s = novoEstado(T0);
    const r = depoisDaAcao(s, { tipo: 'dado', formula: '1d20', teatro: false }, { ok: true, vars: { total: 20, critico: 'max', formula: '1d20' } }, ctx());
    expect(r.fala!.texto).toMatch(/20/);
  });

  it('todo grupo que o cérebro usa existe no cofre', () => {
    const f = banco().falas;
    const grupos = [
      'ordem.cumpre', 'ordem.resmunga', 'ordem.cede', 'ordem.recusa', 'ordem.recusa.encontro', 'ordem.recusa.encontro.insiste', 'ordem.negocia.porfavor', 'ordem.negocia.teamo',
      'ordem.negocia.carinho', 'ordem.negocia.contar', 'ordem.negocia.elogio', 'ordem.adia', 'ordem.adiado_feito', 'ordem.confirma.apagar', 'ordem.confirmado.apagar', 'ordem.poupou',
      'ordem.cancelou', 'ordem.escolha', 'ordem.naoentendi', 'ordem.naoachei', 'ordem.naoachei.busca', 'ordem.desfaz', 'ordem.nada_desfazer', 'motivo.intro', 'responde.conta',
      'responde.hora', 'responde.data', 'sabe.tudo', 'sabe.nada', 'agenda.ver', 'agenda.ver.vazia', 'agenda.dela', 'agenda.dela.avisa', 'agenda.extra', 'estudo.lembrete',
      'estudo.perto', 'estudo.amanha', 'estudo.hoje', 'estudo.longe', 'estudo.depois', 'estudo.bronca', 'estudo.plano', 'nota.nome', 'ps.dela', 'feito.dado', 'feito.moeda',
      'feito.mundo', 'falhou', 'agua', 'bebeu', 'timer', 'agendaCriada', 'agendaChegando', 'mundoEditado', 'rolou', 'conversa.tchau', 'mundo.avisa',
      ...['profecia', 'lenda', 'rumor', 'personagem', 'segredo', 'ideia'].flatMap((g) => [`mundo.${g}.titulo`, `mundo.${g}.corpo`]),
      ...['quando', 'texto', 'titulo', 'nota', 'busca', 'tela', 'duracao', 'evento'].map((c) => `ordem.pergunta.${c}`),
      ...['afinidade', 'conflito', 'aliadas', 'suspeita', 'dilema', 'cuidado', 'aniversario_perto', 'prova_perto', 'familia'].map((r) => `infere.${r}`),
      ...['minutoExtra', 'temaDela', 'nomeDela', 'telaErrada', 'notaDela', 'psDela', 'coracao', 'eventoExtra'].map((t) => `travessura.${t}`),
    ];
    for (const g of grupos) expect(f[g]?.length, g).toBeGreaterThan(0);
  });
});

describe('cérebro: jogos da Steam', () => {
  const { reagirJogo, problemaDoJogo, sono, rival } = cerebro;
  const HK = { appid: 367520, nome: 'Hollow Knight', modo: 'single', generos: ['Ação', 'Aventura', 'Indie'], online: null };
  const CS = { appid: 730, nome: 'Counter-Strike 2', modo: 'multi', generos: ['Ação'], online: true };
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };
  const quarta = (h: number, m = 0) => new Date(2026, 10, 18, h, m).getTime();

  it('hora de dormir: conta para trás a partir de quando você acorda, só antes de dia de trabalho', () => {
    expect(sono(quarta(22, 0), rot).passou).toBe(false);
    expect(sono(quarta(22, 45), rot).passou).toBe(true);
    // sexta à noite: sábado não é dia de trabalho
    expect(sono(new Date(2026, 10, 20, 23, 30).getTime(), rot).passou).toBe(false);
    // domingo à noite: segunda é
    expect(sono(new Date(2026, 10, 22, 23, 30).getTime(), rot).passou).toBe(true);
  });

  it('o problema mais grave primeiro: compromisso > prova > dormir > madrugada > maratona', () => {
    const s = novoEstado(T0);
    const c = (now: number, x: Partial<cerebro.CtxJogo> = {}) => ({ now, rand: sorteio(1), intensidade: 2 as const, nome: 'amor', rotina: rot, ...x });
    expect(problemaDoJogo(s, quarta(15), c(quarta(15, 10))).problema).toBeNull();
    expect(problemaDoJogo(s, quarta(12), c(quarta(15))).problema).toBe('maratona');
    expect(problemaDoJogo(s, quarta(22), c(quarta(23))).problema).toBe('dormir');
    expect(problemaDoJogo(s, quarta(22), c(quarta(23), { agenda: [{ titulo: 'Call com o cliente', inicio: quarta(23, 30), diaInteiro: false }] })).problema).toBe('compromisso');
    const p = novoEstado(T0);
    p.memoria.cerebro.estudos = [{ titulo: 'Prova de física', assunto: 'física', at: quarta(15) + 20 * 3_600_000, cobrou: {}, perguntou: false }];
    expect(problemaDoJogo(p, quarta(15), c(quarta(15, 5))).problema).toBe('prova');
  });

  it('reage ao começo (multi dá ciúme), cobra quando passa da hora e soma as horas no fim', () => {
    const c = (now: number) => ({ now, rand: sorteio(3), intensidade: 2 as const, nome: 'amor', rotina: rot });
    const s0 = novoEstado(T0);
    const a = reagirJogo(s0, 'comecou', CS, quarta(15), c(quarta(15)));
    expect(a.fala!.texto.length).toBeGreaterThan(5);
    expect(a.estado.ciume).toBeGreaterThan(s0.ciume);
    const b = reagirJogo(a.estado, 'jogando', CS, quarta(15), c(quarta(23)));
    expect(b.problema).toBe('dormir');
    expect(b.fala!.texto).toMatch(/06:00|dorm|cama|acord/i);
    const fim = reagirJogo(b.estado, 'parou', CS, quarta(15), c(quarta(23, 20)));
    expect(fim.estado.memoria.cerebro.jogos['730']!.minutos).toBe(500);
    expect(rival(fim.estado)?.nome).toBeUndefined();
    const longo = reagirJogo(fim.estado, 'parou', HK, quarta(8), c(quarta(19)));
    expect(rival(longo.estado)!.nome).toBe('Hollow Knight');
  });

  it('jogando sem problema nenhum: ela não fala', () => {
    const r = reagirJogo(novoEstado(T0), 'jogando', HK, quarta(15), { now: quarta(15, 30), rand: sorteio(1), intensidade: 2, nome: 'amor', rotina: rot });
    expect(r.fala).toBeNull();
  });
});
