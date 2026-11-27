import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { banco, cerebro, novoEstado, sorteio, type AnimaState } from '../src/index';

const {
  normalizar, Lexico, distancia, radical, sentimento, calcular, numeroExtenso, duracaoMs, formulaDado, telaDe, candidatosNota, casarComando,
  classificar, lexicoBase, modeloPadrao, gerarCorpus, ROTULOS, amostrar, treinar, avaliar, carregar, serializar, prever,
  entenderPedido, sentido, decidir, montarGrafo, entenderConsulta, responderConsulta, deducoes, capitulo, pensar, rotina, broncaDeTela, depoisDaAcao,
  registrarCarinho, cumprirAdiado, escreverNoMundo, prepararRede, redePadrao, preverComRede,
} = cerebro;

// a rede neural carrega em segundo plano no app; aqui, antes de tudo (todo pensar usa a rede + o modelo antigo)
beforeAll(async () => {
  await prepararRede();
});

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

  it('não "conserta" palavra real que a gramática não usa (vocabulário)', () => {
    const lx = lexicoBase();
    const tok = (m: string) => normalizar(m, lx).tokens;
    expect(tok('tô pregado')).toContain('pregado');
    expect(tok('tomei um pé na bunda')).toContain('bunda');
    expect(tok('tô numa fossa danada')).toContain('fossa');
    expect(tok('enchi a cara')).toContain('enchi');
    // e continua corrigindo erro de digitação de verdade
    expect(tok('tô cansdo')).toContain('cansado');
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
    }, 30_000);
  }

  it('a rede neural existe, carrega e cobre todas as intenções', () => {
    const r = redePadrao()!;
    expect(r).toBeTruthy();
    expect(r.rotulos).toEqual([...ROTULOS]);
    expect(r.camadas.length).toBeGreaterThanOrEqual(1);
    expect(r.emb.idx.length).toBeGreaterThan(1000);
  });

  for (const [arq, minimo] of [['anima-intencoes.txt', 0.95], ['anima-intencoes-cego.txt', 0.88]] as const) {
    it(`a rede sozinha acerta as frases de ${arq} (mínimo ${minimo * 100}%)`, () => {
      const lx = lexicoBase();
      const fs = frases(arq);
      const erros = fs.filter(([r, f]) => preverComRede(redePadrao()!, normalizar(f, lx)).rotulo !== r);
      expect(1 - erros.length / fs.length, erros.map(([r, f]) => `${r}: ${f}`).join('\n')).toBeGreaterThanOrEqual(minimo);
    }, 30_000);
  }

  it('a rede vê a ordem das palavras (o que a bolsa de palavras não vê)', () => {
    const lx = lexicoBase();
    const r = redePadrao()!;
    expect(preverComRede(r, normalizar('tô bem', lx)).rotulo).toBe('estoubem');
    expect(preverComRede(r, normalizar('tá bem?', lx)).rotulo).toBe('comovai');
  });

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
    const h = treinar(tr, rot, { dim: 16, buckets: 1 << 14, epocas: 8, oculta: 64 });
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

describe('cérebro: assuntos de conversa (papo.*)', () => {
  const { PAPO, opcoesDaEscolha } = cerebro;

  it('todo assunto tem falas no cofre', () => {
    const f = banco().falas;
    for (const g of [...Object.keys(PAPO), 'papo.escolhe.sem', 'papo.tempojuntos.hoje']) expect(f[g]?.length, g).toBeGreaterThanOrEqual(g.split('.').length > 2 ? 2 : 6);
  });

  it('entende o assunto e responde com o grupo dele', () => {
    for (const [msg, g] of [['me abraça', 'papo.abraco'], ['tô com febre e dor de cabeça', 'papo.doente'], ['não consigo dormir', 'papo.insonia'], ['me indica um filme', 'papo.filme'],
      ['levei um fora', 'papo.terminei'], ['escreve um poema pra mim', 'papo.poema'], ['qual o sentido da vida?', 'papo.filosofia']] as const) {
      const r = pensar(novoEstado(T0), msg, ctx());
      expect(r.intencao, msg).toBe(g);
      expect(r.fala!.id.startsWith(g), `${msg} → ${r.fala!.id}`).toBe(true);
    }
  });

  it('escolhe entre duas opções, sempre a mesma para a mesma pergunta', () => {
    expect(opcoesDaEscolha('pizza ou hambúrguer?')).toEqual(['pizza', 'hambúrguer']);
    expect(opcoesDaEscolha('você prefere gato ou cachorro?')).toEqual(['gato', 'cachorro']);
    expect(opcoesDaEscolha('escolhe entre o azul ou o preto')).toEqual(['azul', 'preto']);
    expect(opcoesDaEscolha('me ajuda a escolher')).toBeNull();
    const a = pensar(novoEstado(T0), 'pizza ou hambúrguer?', ctx()).fala!.texto;
    const b = pensar(novoEstado(T0), 'hambúrguer ou pizza?', ctx({ rand: sorteio(99) })).fala!.texto;
    const escolha = (t: string) => (t.indexOf('pizza') >= 0 && (t.indexOf('hambúrguer') < 0 || t.indexOf('pizza') < t.indexOf('hambúrguer')) ? 'pizza' : 'hambúrguer');
    expect(escolha(a)).toBe(escolha(b));
  });

  it('conta os dias juntos', () => {
    const s = { ...novoEstado(T0 - 12 * 86_400_000) };
    const r = pensar(s, 'há quanto tempo a gente se conhece?', ctx());
    expect(r.fala!.texto).toMatch(/12/);
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

describe('cérebro: web e apps em foco', () => {
  const { lerJanela, reagirWeb, contarWeb } = cerebro;
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };

  it('lê site e página do título do navegador, e apps pela classe', () => {
    expect(lerJanela('(3) Lofi pra estudar - YouTube — Mozilla Firefox', 'firefox')).toMatchObject({ categoria: 'video', site: 'YouTube', pagina: 'Lofi pra estudar' });
    expect(lerJanela('Aula 3 - Cálculo II - Google Classroom - Google Chrome', 'Google-chrome')).toMatchObject({ categoria: 'estudo', site: 'Google Classroom' });
    expect(lerJanela('Gaules - Twitch — Zen Browser', 'zen')).toMatchObject({ categoria: 'live', site: 'Twitch', pagina: 'Gaules' });
    expect(lerJanela('Novo chat - Claude — Mozilla Firefox', 'firefox')!.categoria).toBe('ia');
    expect(lerJanela('Chill Mix - YouTube Music — Mozilla Firefox', 'firefox')!.categoria).toBe('musica');
    expect(lerJanela('Pornhub - Free Porn Videos — Mozilla Firefox', 'firefox')!.categoria).toBe('adulto');
    expect(lerJanela('#geral | servidor - Discord', 'discord')).toMatchObject({ categoria: 'rede', site: 'Discord', navegador: false });
    expect(lerJanela('cofre - Obsidian v1.8', 'obsidian')!.categoria).toBe('obsidian');
    expect(lerJanela('Tanden', 'tanden')).toBeNull();
    expect(lerJanela('~/projetos — fish', 'kitty')).toBeNull();
    expect(lerJanela('Um blog qualquer — Mozilla Firefox', 'firefox')).toBeNull();
  });

  it('reage no contexto: prova perto no YouTube vira bronca; outra IA dá ciúme', () => {
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    const s = novoEstado(T0);
    s.memoria.cerebro.estudos = [{ titulo: 'Prova de física', assunto: 'física', at: now + 20 * 3_600_000, cobrou: {}, perguntou: false }];
    const yt = lerJanela('Gameplay - YouTube — Mozilla Firefox', 'firefox')!;
    const a = reagirWeb(s, yt, { now, rand: sorteio(2), intensidade: 2, nome: 'amor', rotina: rot });
    expect(a.grupo).toBe('web.prova');
    expect(a.fala!.texto).toMatch(/física|Prova/);
    const ia = lerJanela('ChatGPT — Mozilla Firefox', 'firefox')!;
    const b = reagirWeb(novoEstado(T0), ia, { now, rand: sorteio(2), intensidade: 2, nome: 'amor', rotina: rot });
    expect(b.estado.ciume).toBeGreaterThan(10);
    expect(b.estado.memoria.ultimaIA).toBe('ChatGPT');
  });

  it('soma o tempo do dia por categoria e zera no dia seguinte', () => {
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    let s = contarWeb(novoEstado(T0), 'video', 30 * 60_000, now);
    s = contarWeb(s, 'video', 15 * 60_000, now + 60_000);
    expect(s.memoria.cerebro.web.minutos.video).toBe(45);
    s = contarWeb(s, 'video', 60_000, now + 864e5);
    expect(s.memoria.cerebro.web.minutos.video).toBe(1);
  });
});

describe('cérebro: música (Spotify)', () => {
  const { reagirMusica, contarFaixa, estiloDe, artistaFavorito } = cerebro;
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };
  const faixa = (x: Partial<cerebro.Faixa> = {}): cerebro.Faixa => ({ player: 'spotify', artista: 'LiSA', titulo: 'Catch the Moment', album: 'LiTTLE DEViL PARADE', id: 't1', tocando: true, ...x });

  it('estilo pelo artista e, sem ele, pelo título', () => {
    expect(estiloDe(faixa())).toBe('anime');
    expect(estiloDe(faixa({ artista: 'The Cure', titulo: 'Pictures of You' }))).toBe('dela');
    expect(estiloDe(faixa({ artista: 'Ninguém', titulo: 'Tears in the rain' }))).toBe('triste');
    expect(estiloDe(faixa({ artista: 'Ninguém', titulo: 'Qualquer', album: '' }))).toBeNull();
    expect(estiloDe(faixa({ artista: 'Arctic Monkeys', titulo: 'Do I Wanna Know?' }))).toBe('rock');
    expect(estiloDe(faixa({ artista: 'Tame Impala', titulo: 'The Less I Know The Better' }))).toBe('indie');
    expect(estiloDe(faixa({ artista: 'Caetano Veloso', titulo: 'Sozinho' }))).toBe('mpb');
  });

  it('conta a faixa do dia e o artista; a mesma música várias vezes vira bronca', () => {
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    let s = novoEstado(T0);
    for (let i = 0; i < 3; i++) s = contarFaixa(s, faixa(), now + i * 300_000);
    expect(s.memoria.cerebro.musica.faixas.t1).toBe(3);
    expect(s.memoria.cerebro.musica.artistas.LiSA).toBe(3);
    const r = reagirMusica(s, faixa(), { now, rand: sorteio(3), intensidade: 2, nome: 'amor', rotina: rot });
    expect(r.grupo).toBe('musica.repete');
    expect(r.fala!.texto).toMatch(/3/);
    // outro dia zera as faixas, não os artistas
    s = contarFaixa(s, faixa(), now + 864e5);
    expect(s.memoria.cerebro.musica.faixas.t1).toBe(1);
    expect(s.memoria.cerebro.musica.artistas.LiSA).toBe(4);
    expect(artistaFavorito(s)).toBeNull();
  });

  it('sempre tem o que dizer de uma faixa qualquer', () => {
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    const s = contarFaixa(novoEstado(T0), faixa({ artista: 'Banda X', titulo: 'Y', album: 'Z', id: 'x' }), now);
    const r = reagirMusica(s, faixa({ artista: 'Banda X', titulo: 'Y', album: 'Z', id: 'x' }), { now, rand: sorteio(5), intensidade: 1, nome: 'amor', rotina: rot });
    expect(r.fala).not.toBeNull();
  });
});

describe('cérebro: site adulto com discrição', () => {
  const { lerJanela, reagirWeb, saiuDoAdulto } = cerebro;
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };

  it('nunca guarda nem repete o título da página', () => {
    const p = lerJanela('Algum título qualquer - Pornhub — Mozilla Firefox', 'firefox')!;
    expect(p.categoria).toBe('adulto');
    expect(p.pagina).toBe('');
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    const r = reagirWeb(novoEstado(T0), p, { now, rand: sorteio(4), intensidade: 3, nome: 'amor', rotina: rot });
    expect(r.fala).not.toBeNull();
    expect(r.fala!.texto).not.toMatch(/título qualquer/);
  });

  it('ao sair da aba ela às vezes comenta, sem citar nada', () => {
    const now = new Date(2026, 10, 18, 15, 0).getTime();
    const r = saiuDoAdulto(novoEstado(T0), 6, { now, rand: () => 0.1, intensidade: 2, nome: 'amor', rotina: rot });
    expect(r.fala).not.toBeNull();
    expect(saiuDoAdulto(novoEstado(T0), 6, { now, rand: () => 0.9, intensidade: 2, nome: 'amor', rotina: rot }).fala).toBeNull();
  });
});

describe('cérebro: Minecraft', () => {
  const { entenderMine, responderMine, reagirMine, itemDoTermo, biomaDe } = cerebro;
  const now = new Date(2026, 10, 18, 15, 0).getTime();
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };
  const jogo: cerebro.EstadoMine = {
    jogador: 'Iraja', mundo: 'Novo Mundo', vida: 20, vidaMax: 20, fome: 20, dimensao: 'overworld', bioma: 'minecraft:dark_forest', hora: 6000, clima: 'limpo',
    y: 64, segurando: 'iron_pickaxe', hostis: 0, modoDela: 'seguir', bolso: 0,
  };
  const c = (x: Partial<cerebro.CtxMine> = {}): cerebro.CtxMine => ({ now, rand: sorteio(9), intensidade: 2, nome: 'amor', rotina: rot, jogo, ...x });

  it('entende ordens, receitas, dúvidas e ideias; o resto é conversa', () => {
    expect(entenderMine('anima, me segue')).toEqual({ tipo: 'acao', acao: 'seguir' });
    expect(entenderMine('fica aqui')).toEqual({ tipo: 'acao', acao: 'ficar' });
    expect(entenderMine('vem cá ânima')).toEqual({ tipo: 'acao', acao: 'vir' });
    expect(entenderMine('pega uma flor pra mim')).toEqual({ tipo: 'acao', acao: 'colher' });
    expect(entenderMine('me dá o que você pegou')).toEqual({ tipo: 'acao', acao: 'dar' });
    expect(entenderMine('pega os itens')).toEqual({ tipo: 'acao', acao: 'coletar' });
    expect(entenderMine('dança!')).toEqual({ tipo: 'acao', acao: 'dancar' });
    expect(entenderMine('como faz um pistão?')).toEqual({ tipo: 'receita', termo: 'pistao', item: 'piston' });
    expect(entenderMine('como craftar picareta de diamante')).toMatchObject({ item: 'diamond_pickaxe' });
    expect(entenderMine('como faz o portal do nether')).toEqual({ tipo: 'duvida', tema: 'portal' });
    expect(entenderMine('onde acho diamante?')).toEqual({ tipo: 'duvida', tema: 'diamante' });
    expect(entenderMine('to entediado, alguma ideia?')).toEqual({ tipo: 'ideia' });
    expect(entenderMine('como eu to?')).toEqual({ tipo: 'estado' });
    expect(entenderMine('me lembra de estudar amanhã às 10')).toBeNull();
    expect(entenderMine('hoje eu tive um dia horrível na faculdade, fica difícil estudar assim')).toBeNull();
  });

  it('caça a pedido: qual bicho, quantos e se é o que você mira', () => {
    const ovelha = cerebro.mobDoTermo('ovelha')!;
    expect(entenderMine('pode matar essa ovelha?')).toEqual({ tipo: 'cacar', mob: ovelha, n: 1, mirando: true });
    expect(entenderMine('anima, mata a ovelha')).toEqual({ tipo: 'cacar', mob: ovelha, n: 1, mirando: false });
    expect(entenderMine('mata 3 vacas pra mim')).toMatchObject({ tipo: 'cacar', mob: { ids: ['cow', 'mooshroom'] }, n: 3 });
    expect(entenderMine('mata duas galinhas')).toMatchObject({ mob: { nome: 'galinha' }, n: 2 });
    expect(entenderMine('caça umas galinhas')).toMatchObject({ mob: { nome: 'galinha' }, n: 3 });
    expect(entenderMine('mata todos os porcos')).toMatchObject({ mob: { nome: 'porco' }, n: cerebro.TODOS_CACA });
    expect(entenderMine('mata as vacas')).toMatchObject({ mob: { nome: 'vaca' }, n: cerebro.TODOS_CACA });
    expect(entenderMine('consegue matar aqueles aldeões?')).toMatchObject({ mob: { tipo: 'aldeao' }, mirando: true, n: cerebro.TODOS_CACA });
    expect(entenderMine('ataca aquele zumbi')).toMatchObject({ mob: { ids: expect.arrayContaining(['zombie']) }, mirando: true, n: 1 });
    expect(entenderMine('mata isso')).toEqual({ tipo: 'cacar', mob: null, n: 1, mirando: true });
    expect(entenderMine('mata esse bicho aí')).toEqual({ tipo: 'cacar', mob: null, n: 1, mirando: true });
    // o que não é caça continua como era
    expect(entenderMine('me protege')).toEqual({ tipo: 'acao', acao: 'proteger' });
    expect(entenderMine('mata os monstros')).toEqual({ tipo: 'acao', acao: 'proteger' });
    expect(entenderMine('pode atacar')).toEqual({ tipo: 'acao', acao: 'proteger' });
    expect(entenderMine('não mata a ovelha')).toEqual({ tipo: 'acao', acao: 'paz' });
    expect(entenderMine('vou matar o tempo jogando')).toBeNull();
  });

  it('caça: manda o mod atrás do bicho, recusa creeper e conta no fim', () => {
    const r = responderMine(novoEstado(T0), entenderMine('pode matar essa ovelha?')!, c());
    expect(r.envios).toEqual([{ t: 'cacar', mobs: ['sheep'], n: 1, mirando: true }]);
    expect(r.grupo).toMatch(/^mine\.cacar/);
    expect(r.fala!.texto).not.toMatch(/ninguém encosta em você/);
    const cr = responderMine(novoEstado(T0), entenderMine('mata o creeper')!, c());
    expect(cr.envios).toEqual([]);
    expect(cr.grupo).toBe('mine.cacar.creeper');
    // cada abate a pedido conta no placar, mas ela só fala no fim
    const m = reagirMine(novoEstado(T0), { tipo: 'matou', mob: 'sheep', caca: true }, c({ rand: () => 0.01 }));
    expect(m.fala).toBeNull();
    expect(m.estado.memoria.cerebro.minecraft.abates).toBe(1);
    expect(reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'sheep', n: 1, pedidos: 1 }, c()).grupo).toBe('mine.cacou.animal');
    expect(reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'cow', n: 3, pedidos: 3 }, c()).grupo).toBe('mine.cacou.varios');
    expect(reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'cow', n: 1, pedidos: 3 }, c()).grupo).toBe('mine.cacou.parcial');
    expect(reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'pig', n: 4, pedidos: cerebro.TODOS_CACA }, c()).grupo).toBe('mine.cacou.varios');
    const nada = reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'sheep', n: 0, pedidos: 1, motivo: 'nada' }, c());
    expect(nada.fala!.texto).toMatch(/nenhuma ovelha/);
    expect(reagirMine(novoEstado(T0), { tipo: 'cacou', mob: 'wolf', n: 0, pedidos: 1, motivo: 'seu' }, c()).grupo).toBe('mine.cacou.seu');
    expect(cerebro.alvoEmPalavras(cerebro.mobDoTermo('aldeao'), 3, false)).toBe('3 aldeões');
    expect(cerebro.alvoEmPalavras(cerebro.mobDoTermo('porco'), 1, true)).toBe('esse porco');
  });

  it('itens em português, com material, e em inglês', () => {
    expect(itemDoTermo('uma mesa de encantamento')).toBe('enchanting_table');
    expect(itemDoTermo('botas de ouro')).toBe('golden_boots');
    expect(itemDoTermo('capacete')).toBe('iron_helmet');
    expect(itemDoTermo('espada')).toBe('wooden_sword');
    expect(itemDoTermo('sticky piston')).toBe('sticky_piston');
    expect(itemDoTermo('coisa de outro mundo')).toBeNull();
    expect(biomaDe('minecraft:cherry_grove').tipo).toBe('cerejeira');
  });

  it('ordem vira ação no jogo; receita vai com a fala dentro', () => {
    const a = responderMine(novoEstado(T0), { tipo: 'acao', acao: 'seguir' }, c());
    expect(a.envios).toEqual([{ t: 'acao', acao: 'seguir' }]);
    expect(a.fala).not.toBeNull();
    const r = responderMine(novoEstado(T0), { tipo: 'receita', termo: 'pistao', item: 'piston' }, c());
    expect(r.noChat).toBe(false);
    expect(r.envios[0]).toMatchObject({ t: 'receita', item: 'piston' });
    expect((r.envios[0] as { texto: string }).texto).toMatch(/pistao/);
    // bolso vazio: nem manda a ação
    const d = responderMine(novoEstado(T0), { tipo: 'acao', acao: 'dar' }, c());
    expect(d.envios).toEqual([]);
    expect(d.grupo).toBe('mine.feito.deu.nada');
  });

  it('lembra das sessões, das mortes e dos presentes', () => {
    let s = reagirMine(novoEstado(T0), { tipo: 'entrou', mundo: 'Novo Mundo', jogador: 'Iraja' }, c()).estado;
    expect(s.memoria.cerebro.minecraft.sessoes).toBe(1);
    const m = reagirMine(s, { tipo: 'morreu', causa: 'death.attack.explosion.player' }, c());
    expect(m.grupo).toBe('mine.morreu.creeper');
    s = m.estado;
    const p = reagirMine(s, { tipo: 'presente', item: 'minecraft:poppy', n: 1 }, c());
    expect(p.grupo).toBe('mine.presente.flor');
    expect(p.estado.afeto).toBeGreaterThan(s.afeto);
    expect(p.estado.memoria.cerebro.minecraft).toMatchObject({ mortes: 1, presentes: 1 });
  });

  it('placa: pedida com texto, sem texto e por conta própria', () => {
    expect(entenderMine('ânima, escreve uma placa dizendo Casa da Ânima e do Iraja')).toEqual({ tipo: 'placa', texto: 'Casa da Ânima e do Iraja' });
    expect(entenderMine('faz uma placa')).toEqual({ tipo: 'placa', texto: '' });
    expect(cerebro.linhasDePlaca('Casa da Ânima e do Iraja')).toEqual(['Casa da Ânima e', 'do Iraja']);
    expect(cerebro.linhasDePlaca('aqui jaz / Iraja / morte nº 3 / ♥ ânima / sobra')).toEqual(['aqui jaz', 'Iraja', 'morte nº 3', '♥ ânima']);
    for (const l of cerebro.linhasDePlaca('umapalavragigantescademais e mais um monte de texto que não cabe')) expect(l.length).toBeLessThanOrEqual(15);
    const p = responderMine(novoEstado(T0), { tipo: 'placa', texto: 'Casa da Ânima' }, c());
    expect(p.envios).toEqual([{ t: 'placa', linhas: ['Casa da Ânima'], motivo: 'pedido' }]);
    const livre = responderMine(novoEstado(T0), { tipo: 'placa', texto: '' }, c());
    expect(livre.envios[0]).toMatchObject({ t: 'placa', motivo: 'pedido' });
    // morreu com sorte baixa: "aqui jaz" onde caiu
    const m = reagirMine(novoEstado(T0), { tipo: 'morreu', causa: 'death.fell.accident' }, c({ rand: () => 0.1 }));
    expect(m.envios[0]).toMatchObject({ t: 'placa', motivo: 'morte' });
    expect(reagirMine(novoEstado(T0), { tipo: 'morreu' }, c({ rand: () => 0.9 })).envios).toEqual([]);
    const casal = reagirMine(novoEstado(T0), { tipo: 'camaDupla' }, c({ rand: () => 0.1 }));
    expect(casal.grupo).toBe('mine.camaDupla');
    expect(casal.envios[0]).toMatchObject({ t: 'placa', motivo: 'casal' });
  });

  it('detesta gato e tem ciúme; cama do lado e conquistas', () => {
    expect(entenderMine('você gosta de gatos?')).toEqual({ tipo: 'gato' });
    const s0 = novoEstado(T0);
    const d = reagirMine(s0, { tipo: 'gato', acao: 'domou' }, c());
    expect(d.grupo).toBe('mine.gato.domou');
    expect(d.estado.ciume).toBeGreaterThan(s0.ciume);
    expect(reagirMine(s0, { tipo: 'dormiu', juntos: true }, c()).grupo).toBe('mine.dormiu.juntos');
    expect(reagirMine(s0, { tipo: 'dormiu' }, c()).grupo).toBe('mine.dormiu');
    const q = reagirMine(s0, { tipo: 'conquista', id: 'story/mine_diamond', titulo: 'Diamantes!' }, c());
    expect(q.grupo).toBe('mine.conquista.diamante');
    const g = reagirMine(s0, { tipo: 'conquista', id: 'adventure/hero_of_the_village', titulo: 'Herói da Vila', desafio: true }, c());
    expect(g.grupo).toBe('mine.conquista.desafio');
    expect(reagirMine(s0, { tipo: 'conquista', id: 'nether/x', titulo: 'Algo' }, c()).fala!.texto).toMatch(/Algo|conquista/i);
  });

  it('recursos: diz o que falta e dá ideia com o que sobra', () => {
    expect(entenderMine('do que eu preciso agora?')).toEqual({ tipo: 'recursos' });
    expect(entenderMine('o que falta pegar?')).toEqual({ tipo: 'recursos' });
    const pobre = { ...jogo, y: 20, recursos: { comida: 12, tocha: 2, ferro: 0 } };
    expect(cerebro.faltaDe(pobre)).toEqual({ falta: 'tocha', n: 2 });
    expect(cerebro.faltaDe({ ...jogo, recursos: { comida: 12, tocha: 2, ferro: 30, diamante: 5, obsidiana: 12 } })).toBeNull();
    const r = responderMine(novoEstado(T0), { tipo: 'recursos' }, c({ jogo: pobre }));
    expect(r.grupo).toBe('mine.recursos.tocha');
    expect(r.fala!.texto).toMatch(/2/);
    expect(responderMine(novoEstado(T0), { tipo: 'recursos' }, c()).grupo).toBe('mine.recursos.naosei');
    const rico = { ...jogo, recursos: { comida: 20, obsidiana: 14, diamante: 4, ferro: 30 } };
    expect(responderMine(novoEstado(T0), { tipo: 'ideia' }, c({ jogo: rico, rand: () => 0.1 })).grupo).toBe('mine.ideia.recurso.portal');
  });

  it('todo grupo do Minecraft e da música existe no cofre', () => {
    const f = banco().falas;
    const acoes = ['seguir', 'ficar', 'vir', 'passear', 'coletar', 'colher', 'dar', 'dancar', 'sentar', 'levantar', 'pular', 'olhar', 'sair', 'voltar', 'resmunga'];
    const temas = ['netherite', 'diamante', 'warden', 'wither', 'end', 'portal', 'encantar', 'mending', 'aldeao', 'creeper', 'elytra', 'pocao', 'slime', 'ferro', 'fazenda', 'comida', 'dormir', 'xp', 'perdido', 'noite'];
    const grupos = [
      ...acoes.map((a) => `mine.acao.${a}`), ...temas.map((t) => `mine.duvida.${t}`),
      'mine.entrou', 'mine.entrou.primeira', 'mine.saiu', 'mine.morreu', 'mine.noite', 'mine.dia', 'mine.vidaBaixa', 'mine.fome', 'mine.chuva', 'mine.tempestade',
      'mine.dimensao.nether', 'mine.dimensao.end', 'mine.dimensao.overworld', 'mine.bateu', 'mine.presente', 'mine.dormiu', 'mine.creeper', 'mine.achou',
      'mine.feito.coletou', 'mine.feito.coletou.nada', 'mine.feito.colheu', 'mine.feito.colheu.nada', 'mine.feito.deu', 'mine.feito.deu.nada',
      'mine.receita', 'mine.receita.naosei', 'mine.receita.semreceita', 'mine.duvida', 'mine.ideia', 'mine.espontanea',
      'mine.estado.bem', 'mine.estado.vida', 'mine.estado.fome', 'mine.estado.perigo',
      'mine.conquista', 'mine.conquista.desafio', ...['gatos', 'domou', 'diamante', 'nether', 'end', 'dragao', 'ferro', 'cama', 'mob', 'armadura', 'encantou', 'inicio'].map((x) => `mine.conquista.${x}`),
      'mine.gato.perto', 'mine.gato.carinho', 'mine.gato.domou', 'mine.gato.conversa', 'mine.camaDupla', 'mine.dormiu.juntos', 'mine.ferramenta', 'mine.inventarioCheio',
      ...['naosei', 'tudo', 'comida', 'tocha', 'ferro', 'diamante', 'obsidiana'].map((x) => `mine.recursos.${x}`),
      ...['portal', 'diamante', 'armadura', 'esmeralda'].map((x) => `mine.ideia.recurso.${x}`),
      ...['pedido', 'livre', 'morte', 'casal', 'recado'].map((x) => `mine.placa.${x}`),
      'musica.faixa', 'musica.repete', 'musica.madrugada', 'musica.favorito', 'musica.amor',
      ...['rock', 'indie', 'mpb'].map((x) => `musica.estilo.${x}`), ...['comovai', 'estoubem', 'comofoi', 'presenca', 'etu', 'humordela', 'concorda', 'espanto', 'risada', 'contamais', 'opiniaogeral', 'desabafo', 'capacidades', 'jogar', 'surpresa', 'perguntame'].map((x) => `conversa.${x}`),
      ...['', '.animal', '.hostil', '.aldeao', '.gato', '.qualquer', '.outro', '.creeper'].map((x) => `mine.cacar${x}`),
      ...['', '.varios', '.animal', '.hostil', '.parcial', '.nada', '.fugiu', '.seu'].map((x) => `mine.cacou${x}`),
      'musica.longa', 'musica.curta', 'musica.feat', 'musica.manha', 'musica.noite', 'web.adulto.saiu', 'web.adulto.denovo',
    ];
    for (const g of grupos) expect(f[g]?.length, g).toBeGreaterThan(0);
  });
});
