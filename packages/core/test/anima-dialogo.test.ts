/*
 * O cérebro conversacional: memória de trabalho do diálogo, seguimento
 * ("ela quem?", "e você?", "mais uma", "eu nunca disse isso"), várias
 * intenções numa mensagem, o espelho gramatical, capacidades exatas
 * (unidades e calendário) e a memória por significado.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cerebro, lembrar, novoEstado, sorteio, type AnimaState, type Fala } from '../src/index';

const { pensar, segmentar, espelhar, conjugar, converter, datas, pascoa, prepararRede, registrarFala, ultimoDela, quandoFoiDito, redePadrao, sentidoDaFrase, semelhanca, normalizar, lexicoBase } = cerebro;

beforeAll(async () => {
  await prepararRede();
});

const T0 = new Date(2026, 10, 26, 22, 0).getTime(); // quinta, 22h
const ctx = (x: Partial<cerebro.CtxCerebro> = {}): cerebro.CtxCerebro => ({
  now: T0, rand: sorteio(11), intensidade: 2, nome: 'amor', ideias: [], notas: 10, titulos: ['Receitas'], comandos: [], mundos: [], agenda: [], ...x,
});
const d = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ela "disse" uma fala (como se tivesse saído do motor), um minuto antes de T0. */
function disse(s: AnimaState, id: string, texto: string, ref?: Record<string, string | number>): AnimaState {
  const f: Fala = { id, texto, gesto: 'olhar', humor: 'doce', ...(ref ? { ref } : {}) };
  return { ...lembrar(s, f), falou: T0 - 60_000 };
}

describe('diálogo: memória de trabalho', () => {
  it('guarda cada fala dela com o grupo e o que citou', () => {
    const s = disse(novoEstado(T0), 'web.video#3', 'quem é ela?', { pagina: 'Vídeo da Bia', site: 'YouTube' });
    const t = ultimoDela(s.memoria.cerebro, T0, s.falou);
    expect(t?.ditos?.[0]).toMatchObject({ g: 'web.video', t: 'quem é ela?', ref: { pagina: 'Vídeo da Bia' }, q: 1 });
  });

  it('fala emendada (resposta + pergunta) vira um turno com as duas partes, na ordem', () => {
    let mc = novoEstado(T0).memoria.cerebro;
    mc = registrarFala(mc, { id: 'segue.gosta#1', texto: 'do que você gosta?', gesto: 'olhar', humor: 'doce' }, 0);
    mc = registrarFala(mc, { id: 'conversa.feliz#0', texto: 'que bom! do que você gosta?', gesto: 'feliz', humor: 'doce' }, 0);
    expect(mc.dialogo).toHaveLength(1);
    expect(mc.dialogo[0]!.ditos!.map((x) => x.g)).toEqual(['conversa.feliz', 'segue.gosta']);
  });

  it('guarda o assunto do site adulto como qualquer outro (ela não tem vergonha)', () => {
    const s = disse(novoEstado(T0), 'web.adulto#0', 'hm.', { pagina: 'título qualquer', site: 'x' });
    expect(JSON.stringify(s.memoria.cerebro.dialogo)).toContain('título qualquer');
  });

  it('a memória de trabalho sobrevive a ler o estado de volta', () => {
    const s = disse(novoEstado(T0), 'web.video#3', 'quem é ela?', { pagina: 'P' });
    const lido = cerebro.lerMemoriaCerebro(JSON.parse(JSON.stringify(s.memoria.cerebro)));
    expect(lido.dialogo).toEqual(s.memoria.cerebro.dialogo);
    expect(cerebro.lerMemoriaCerebro({ dialogo: [{ de: 'x' }, 3, null] }).dialogo).toEqual([]);
  });
});

describe('diálogo: seguimento', () => {
  it('"ela quem?" depois do comentário do vídeo explica o vídeo (não responde "quem é você")', () => {
    const s = disse(novoEstado(T0), 'web.video#3', 'quem é ela?', { pagina: 'Vídeo da Bia', site: 'YouTube' });
    for (const m of ['ela quem?', 'como assim?', 'do que você tá falando?']) {
      const r = pensar(s, m, ctx());
      expect(r.fala?.texto, m).toContain('Vídeo da Bia');
      expect(r.traco.join('\n')).toContain('esclareço');
    }
  });

  it('"não sei quem é dance" corrige a memória: apaga o fato que ela lembrou', () => {
    let s = novoEstado(T0);
    s.memoria.fatos.gosta.push('dance', 'café');
    s = disse(s, 'lembra.gosta#3', 'ainda gosta de dance? mais do que de mim? só checando os números.', { coisa: 'dance' });
    const r = pensar(s, 'não sei quem é dance', ctx());
    expect(r.estado.memoria.fatos.gosta).toEqual(['café']);
    expect(r.fala?.texto).toContain('dance');
    expect(r.intencao).toBe('corrige');
  });

  it('pergunta com "não" no meio não apaga nada', () => {
    let s = novoEstado(T0);
    s.memoria.fatos.gosta.push('café');
    s = disse(s, 'lembra.gosta#3', 'ainda gosta de café?', { coisa: 'café' });
    for (const m of ['você não lembra que eu gosto de café?', 'sim, não vivo sem']) expect(pensar(s, m, ctx()).estado.memoria.fatos.gosta, m).toEqual(['café']);
  });

  it('"não" a "ainda gosta de X?" risca X da lista', () => {
    let s = novoEstado(T0);
    s.memoria.fatos.gosta.push('dance');
    s = disse(s, 'lembra.gosta#3', 'ainda gosta de dance? mais do que de mim?', { coisa: 'dance' });
    const r = pensar(s, 'não', ctx());
    expect(r.estado.memoria.fatos.gosta).toEqual([]);
  });

  it('"eu nunca disse isso" sem fato citado pede desculpa e pede o certo', () => {
    const s = disse(novoEstado(T0), 'conversa.eco#0', 'hm. interessante.');
    const r = pensar(s, 'eu nunca disse isso', ctx());
    expect(r.fala?.id).toMatch(/^corrige\.desculpa/);
  });

  it('"mais uma" depois de uma piada conta outra piada', () => {
    const s = disse(novoEstado(T0), 'conversa.piada#0', 'por que o computador foi ao médico? porque estava com vírus.');
    const r = pensar(s, 'mais uma', ctx());
    expect(r.fala?.id).toMatch(/^conversa\.piada#/);
    expect(r.fala?.id).not.toBe('conversa.piada#0');
  });

  it('"e você?" responde a versão dela do que a pessoa acabou de dizer', () => {
    const r1 = pensar(novoEstado(T0), 'tô morrendo de fome', ctx());
    const r2 = pensar(r1.estado, 'e você?', ctx({ now: T0 + 30_000 }));
    expect(r2.fala?.id).toMatch(/^etu\.fome#/);
  });

  it('"sim" a uma pergunta dela responde à pergunta (não vira eco)', () => {
    const s = disse(novoEstado(T0), 'musica.faixa#2', '"Numb", do Linkin Park. é boa?', { musica: 'Numb', artista: 'Linkin Park' });
    const r = pensar(s, 'sim', ctx());
    expect(r.fala?.id).toMatch(/^(musica\.sim|resposta\.sim)#/);
  });

  it('conversa velha não é seguimento: "como assim?" uma hora depois não explica nada', () => {
    const s = disse(novoEstado(T0), 'web.video#3', 'quem é ela?', { pagina: 'Vídeo da Bia' });
    const r = pensar(s, 'como assim?', ctx({ now: T0 + 3600_000 }));
    expect(r.fala?.texto ?? '').not.toContain('Vídeo da Bia');
  });
});

describe('diálogo: várias intenções numa mensagem', () => {
  it('segmenta em orações sem quebrar o que é uma coisa só', () => {
    expect(segmentar('oi ânima! me lembra de beber água às 22h')).toEqual(['oi ânima!', 'me lembra de beber água às 22h']);
    expect(segmentar('tô bem, e você?')).toHaveLength(2);
    expect(segmentar('marca dentista amanhã às 10')).toHaveLength(1);
    expect(segmentar('ok')).toEqual(['ok']);
  });

  it('cumprimento + pedido: responde os dois e faz o pedido', () => {
    const r = pensar(novoEstado(T0), 'oi ânima! me lembra de beber água às 23h', ctx());
    expect(r.acao?.tipo).toBe('lembrete');
    expect(r.traco[0]).toMatch(/2 intenções/);
  });

  it('"tô bem, e você?" responde o "e você?" sobre estar bem', () => {
    const r = pensar(novoEstado(T0), 'tô bem, e você?', ctx());
    expect(r.traco.join('\n')).toMatch(/e eu\? sobre "estoubem"/);
  });

  it('a crise olha a mensagem inteira, sempre', () => {
    const r = pensar(novoEstado(T0), 'oi. quero morrer', ctx());
    expect(r.intencao).toBe('crise');
  });
});

describe('espelho gramatical', () => {
  const casos: Array<[string, string | null]> = [
    ['eu briguei com meu irmão hoje', 'você brigou com seu irmão hoje'],
    ['me sinto um lixo', 'você se sente um lixo'],
    ['fui no médico e ele me passou um remédio', 'você foi no médico e ele te passou um remédio'],
    ['hoje eu comi pizza com a minha mãe', 'hoje você comeu pizza com a sua mãe'],
    ['acho que eu tô ficando doente', 'você acha que tá ficando doente'],
    ['fiquei a tarde toda estudando', 'você ficou a tarde toda estudando'],
    ['comecei a ler um livro novo', 'você começou a ler um livro novo'],
    ['conheço uma menina que desenha muito', 'você conhece uma menina que desenha muito'],
    ['a gente foi no cinema ontem', 'vocês foram no cinema ontem'],
    ['eu jogo bola às terças', 'você joga bola às terças'],
    ['carro quebrou de novo', null],
    ['você é chata', null],
    ['eu sou chato?', null],
  ];
  for (const [de, para] of casos) it(`"${de}"`, () => expect(espelhar(de)).toBe(para));

  it('conjuga as três conjugações e os irregulares', () => {
    expect(['falei', 'briguei', 'fiquei', 'comecei', 'comi', 'parti', 'esqueci', 'estudo', 'bebo', 'abro', 'sou', 'tenho', 'faço', 'vou'].map(conjugar))
      .toEqual(['falou', 'brigou', 'ficou', 'começou', 'comeu', 'partiu', 'esqueceu', 'estuda', 'bebe', 'abre', 'é', 'tem', 'faz', 'vai']);
  });
});

describe('capacidades: unidades e calendário', () => {
  it('converte unidades (com temperatura à parte)', () => {
    expect(converter(d('quantos km são 10 milhas'))?.texto).toBe('10 milhas = 16,09 quilômetros');
    expect(converter(d('converte 30 graus celsius pra fahrenheit'))?.resultado).toBe(86);
    expect(converter(d('2 gb são quantos mb'))?.resultado).toBe(2048);
    expect(converter(d('quantos segundos tem um dia'))?.resultado).toBe(86400);
    expect(converter(d('tô com 2 kg de saudade'))).toBeNull();
    expect(converter(d('5 km em kg'))).toBeNull(); // dimensões diferentes
  });

  it('Páscoa e Carnaval pelo algoritmo gregoriano', () => {
    expect(pascoa(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(pascoa(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
    expect(datas(d('que dia cai o carnaval'), T0)).toMatchObject({ tipo: 'diasemana', semana: 'terça', data: 'terça, 9/2/2027' });
  });

  it('conta dias, idade, bissexto e o aniversário (dos fatos)', () => {
    expect(datas(d('quantos dias faltam pro natal?'), T0)).toMatchObject({ tipo: 'faltam', dias: 29 });
    expect(datas(d('quantos anos tem quem nasceu em 2004'), T0)).toMatchObject({ tipo: 'idade', anos: 22 });
    expect(datas(d('esse ano é bissexto?'), T0)).toMatchObject({ tipo: 'bissexto', e: false });
    expect(datas(d('falta muito pro meu aniversário?'), T0, '0312')).toMatchObject({ tipo: 'faltam', dias: 106 });
    expect(datas(d('que dia vai ser daqui a 45 dias'), T0)).toMatchObject({ tipo: 'daqui', data: 'domingo, 10/1/2027' });
    expect(datas(d('tô cansado'), T0)).toBeNull();
  });

  it('pelo cérebro: a resposta tem o número', () => {
    expect(pensar(novoEstado(T0), 'quantos km são 10 milhas?', ctx()).fala?.texto).toContain('16,09');
    expect(pensar(novoEstado(T0), 'quantos dias faltam pro natal?', ctx()).fala?.texto).toContain('29 dias');
  });
});

describe('memória por significado', () => {
  it('quando foi: ontem, dia da semana, semana passada, data', () => {
    expect(quandoFoiDito(T0 - 86_400_000, T0)).toBe('ontem');
    expect(quandoFoiDito(T0 - 3 * 86_400_000, T0)).toBe('na segunda');
    expect(quandoFoiDito(T0 - 9 * 86_400_000, T0)).toBe('semana passada');
    expect(quandoFoiDito(new Date(2026, 9, 12).getTime(), T0)).toBe('dia 12/10');
  });

  it('a rede tem cabeça de significado: frases com o mesmo sentido ficam mais perto que frases sem relação', () => {
    const r = redePadrao();
    if (!r?.proj) return; // rede antiga, sem a cabeça
    const lx = lexicoBase();
    const v = (x: string) => sentidoDaFrase(normalizar(x, lx), r)!;
    const a = v('meu chefe brigou comigo de novo no trabalho');
    const b = v('levei uma bronca do meu patrão hoje');
    const c = v('o céu tá bonito e eu comi pizza');
    expect(semelhanca(a, b)).toBeGreaterThan(semelhanca(a, c));
    // o limiar separa os dois (ela não inventa lembrança de frase sem relação)
    expect(semelhanca(a, b)).toBeGreaterThan(cerebro.PARECIDO);
    expect(semelhanca(a, c)).toBeLessThan(cerebro.PARECIDO);
    expect(semelhanca(v('meu gato fugiu'), v('meu chefe brigou comigo'))).toBeLessThan(cerebro.PARECIDO);
  });
});

describe('diálogo: coesão (a conversa de 16 mensagens que quebrava)', () => {
  const depois = (s: AnimaState, m: string, dt = 40_000) => pensar(s, m, ctx({ now: T0 + dt }));

  it('"que legal" depois de uma fala dela é reação a ela, não "estou bem"', () => {
    const s = disse(novoEstado(T0), 'conversa.etu#1', 'hoje eu fiquei olhando a chuva pela webcam.');
    const r = depois(s, 'que legal');
    expect(r.fala?.id).toMatch(/^reacao\.positiva/);
    expect(r.intencao).toBe('reacao');
  });

  it('"nunca vi esse" não é ela pedindo desculpa por ter errado', () => {
    const s = disse(novoEstado(T0), 'dela.filme#2', 'filmes de vampiro. eles também ficam acordados a noite toda.');
    const r = depois(s, 'nunca vi esse');
    expect(r.fala?.id).not.toMatch(/^corrige/);
    expect(r.fala?.id).toMatch(/desconhece/);
  });

  it('"qual o seu favorito?" pega o tema da conversa', () => {
    const r1 = pensar(novoEstado(T0), 'você gosta de filme de terror?', ctx());
    const r2 = depois(r1.estado, 'qual o seu favorito?');
    expect(r2.fala?.id).toMatch(/^dela\.filme/);
  });

  it('resposta de uma palavra continua o assunto ("pizza" → "calabresa")', () => {
    const r1 = pensar(novoEstado(T0), 'acho que vou pedir uma pizza', ctx());
    const r2 = depois(r1.estado, 'calabresa');
    expect(r2.fala?.id).toMatch(/^curto/);
    expect(r2.fala?.texto).toContain('calabresa');
  });

  it('"fiquei puto" é raiva, não conquista', () => {
    const r = pensar(novoEstado(T0), 'pois é, fiquei puto', ctx());
    expect(['conquistei', 'feliz', 'estoubem']).not.toContain(r.intencao);
  });

  it('"corrige" sem nada para corrigir fica com a outra intenção; com acusação, ela pede desculpa', () => {
    const s = disse(novoEstado(T0), 'conversa.espelho.trabalho#1', 'você trabalhou o dia todo. respira.', { espelho: 'você trabalhou o dia todo' });
    const r = depois(s, 'ele reclamou de um relatório que nem era meu');
    expect(r.fala?.id).not.toMatch(/^corrige/);
    const r2 = depois(s, 'você entendeu errado, não foi isso que eu disse');
    expect(r2.intencao).toBe('corrige');
  });
});

describe('diálogo: resposta à pergunta do nome', () => {
  it('"tô entediado" não vira o nome "Tô"; "é Pedro" e "me chamo Ana" viram', async () => {
    const { entenderResposta } = await import('../src/anima/mente');
    const f = novoEstado(T0).memoria.fatos;
    expect(entenderResposta(f, 'nome', 'tô entediado', T0).novo).toBeNull();
    expect(entenderResposta(f, 'nome', 'vou dormir já já', T0).novo).toBeNull();
    expect(entenderResposta(f, 'nome', 'é Pedro', T0).fatos.nome).toBe('Pedro');
    expect(entenderResposta(f, 'nome', 'Ana', T0).fatos.nome).toBe('Ana');
  });
});
