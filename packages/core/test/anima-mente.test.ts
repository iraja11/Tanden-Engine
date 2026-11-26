import { describe, expect, it } from 'vitest';
import {
  aprender, banco, cenasExistentes, desfechoCena, entenderResposta, escolherCena, frasesDaNota, gestoDoTexto, lacunas, lerEstado, limparSaida,
  novoEstado, novosFatos, opiniaoDe, perguntaSobreEla, promptDaAnima, quantoSabe, responder, resumoDosFatosCurto, sorteio,
  type AnimaState, type CtxCena,
} from '../src/index';

const T0 = new Date(2026, 10, 18, 15, 0).getTime(); // quarta, 15h
const NOITE = new Date(2026, 10, 18, 23, 30).getTime();
const ctx = (x: Partial<CtxCena> = {}): CtxCena => ({ now: T0, rand: sorteio(7), intensidade: 2, nome: 'amor', ideias: ['Diário', 'Romance', 'Receitas', 'Sonhos', 'Lista'], notas: 42, ...x });

describe('ânima: aprender fatos', () => {
  it('aprende nome, idade, cidade, trabalho e aniversário', () => {
    let f = novosFatos();
    const msgs = ['oi, meu nome é joão', 'tenho 27 anos', 'eu moro em São Paulo, e você?', 'trabalho com design de jogos', 'meu aniversário é 3 de maio'];
    for (const m of msgs) f = aprender(f, m, T0).fatos;
    expect(f.nome).toBe('João');
    expect(f.idade).toBe(27);
    expect(f.cidade).toBe('São Paulo');
    expect(f.trabalho).toBe('design de jogos');
    expect(f.aniversario).toBe('0503');
    expect(aprender(novosFatos(), 'nasci em 12/08', T0).fatos.aniversario).toBe('0812');
  });

  it('gostos e desgostos, sem confundir "não gosto" com "gosto" nem guardar "você"', () => {
    let f = aprender(novosFatos(), 'eu gosto muito de café com leite', T0).fatos;
    expect(f.gosta).toEqual(['café com leite']);
    f = aprender(f, 'não gosto de acordar cedo', T0).fatos;
    expect(f.odeia).toEqual(['acordar cedo']);
    expect(f.gosta).toEqual(['café com leite']);
    expect(aprender(novosFatos(), 'eu gosto de você', T0).novo).toBeNull();
    // mudou de ideia: sai de uma lista e entra na outra
    f = aprender(f, 'odeio café com leite', T0).fatos;
    expect(f.gosta).toEqual([]);
    expect(f.odeia).toContain('café com leite');
  });

  it('pessoas, bichos, medos e sonhos', () => {
    let a = aprender(novosFatos(), 'minha amiga Júlia veio aqui', T0);
    expect(a.novo).toMatchObject({ tipo: 'pessoa', valor: 'Júlia', rel: 'amiga' });
    a = aprender(a.fatos, 'saí com a Bia ontem', T0 + 1);
    expect(a.novo).toMatchObject({ tipo: 'pessoa', valor: 'Bia', rel: 'alguém' });
    a = aprender(a.fatos, 'falei com o Claude hoje', T0 + 2);
    expect(a.fatos.pessoas.map((p) => p.nome)).toEqual(['Júlia', 'Bia']);
    a = aprender(a.fatos, 'meu gato se chama Nyx', T0);
    expect(a.fatos.bichos).toEqual([{ nome: 'Nyx', tipo: 'gato' }]);
    a = aprender(a.fatos, 'tenho medo de altura', T0);
    expect(a.fatos.medos).toEqual(['altura']);
    a = aprender(a.fatos, 'meu sonho é morar no Japão', T0);
    expect(a.fatos.sonhos).toEqual(['morar no japão']);
    expect(quantoSabe(a.fatos)).toBe(5);
  });

  it('marca o que já sabia como repetido', () => {
    const f = aprender(novosFatos(), 'adoro chuva', T0).fatos;
    expect(aprender(f, 'adoro chuva', T0).novo?.repetido).toBe(true);
  });

  it('entende respostas curtas às perguntas dela e respeita o "não"', () => {
    expect(entenderResposta(novosFatos(), 'nome', 'Mari', T0).fatos.nome).toBe('Mari');
    expect(entenderResposta(novosFatos(), 'gosta', 'pizza', T0).fatos.gosta).toEqual(['pizza']);
    expect(entenderResposta(novosFatos(), 'aniversario', '14/02', T0).fatos.aniversario).toBe('0214');
    expect(entenderResposta(novosFatos(), 'medo', 'de barata', T0).fatos.medos).toEqual(['barata']);
    expect(entenderResposta(novosFatos(), 'bicho', 'não tenho', T0).negou).toBe(true);
    expect(entenderResposta(novosFatos(), 'gosta', 'por que você quer saber isso?', T0).novo).toBeNull();
  });

  it('lê fatos estragados sem quebrar e sabe o que ainda não sabe', () => {
    const s = lerEstado({ memoria: { fatos: { nome: 3, gosta: ['a', 7], pessoas: [{ nome: 'X' }, { nome: 'Y', rel: 'amiga' }], aniversario: '9' }, cenas: { carta: 'x', poema: 5 }, espera: 'nada' } }, T0);
    expect(s.memoria.fatos.nome).toBeNull();
    expect(s.memoria.fatos.gosta).toEqual(['a']);
    expect(s.memoria.fatos.pessoas.map((p) => p.nome)).toEqual(['Y']);
    expect(s.memoria.fatos.aniversario).toBeNull();
    expect(s.memoria.cenas).toEqual({ poema: 5 });
    expect(s.memoria.espera).toBeNull();
    expect(lacunas(novosFatos())[0]).toBe('nome');
  });
});

describe('ânima: conversa com memória', () => {
  it('comenta o que aprendeu e lembra depois', () => {
    const r = responder(novoEstado(T0), 'eu amo chocolate amargo', ctx({ rand: sorteio(3) }));
    expect(r.aprendeu).toMatchObject({ tipo: 'gosta', valor: 'chocolate amargo' });
    expect(r.fala!.id).toMatch(/^aprende\.gosta#/);
    expect(r.fala!.texto).toMatch(/chocolate amargo/);
    expect(r.estado.memoria.fatos.gosta).toContain('chocolate amargo');
  });

  it('um nome novo na vida da pessoa dá ciúme (na intensidade ciumenta)', () => {
    const s = novoEstado(T0);
    const r = responder(s, 'fui no cinema com a Carla', ctx());
    expect(r.estado.ciume).toBeGreaterThan(s.ciume + 10);
    expect(r.fala!.id).toMatch(/^aprende\.(suspeito|pessoa)#/);
  });

  it('pergunta de volta e entende a resposta na mensagem seguinte', () => {
    // força a emenda com a pergunta (rand baixo) até sair uma
    let s = novoEstado(T0);
    let r = responder(s, 'hoje foi um dia normal', ctx({ rand: () => 0.05 }));
    expect(r.estado.memoria.espera).toBe('nome');
    expect(r.fala!.texto).toMatch(/\?/);
    s = r.estado;
    r = responder(s, 'Lua', ctx({ now: T0 + 60_000, rand: sorteio(2) }));
    expect(r.estado.memoria.fatos.nome).toBe('Lua');
    expect(r.aprendeu?.tipo).toBe('nome');
  });

  it('opina sempre igual sobre a mesma coisa e tem gostos de fábrica', () => {
    const f = novosFatos();
    expect(opiniaoDe('chuva', f)).toBe('ama');
    expect(opiniaoDe('sol', f)).toBe('odeia');
    expect(opiniaoDe('Gemini', f)).toBe('ia');
    expect(opiniaoDe('abacate', f)).toBe(opiniaoDe('abacate', f));
    const comGosto = aprender(f, 'adoro abacate', T0).fatos;
    expect(opiniaoDe('abacate', comGosto)).toBe('sua');
    const r = responder(novoEstado(T0), 'você gosta de chuva?', ctx({ rand: () => 0.9 }));
    expect(r.fala!.id).toMatch(/^opiniao\.ama#/);
    expect(r.fala!.texto).toMatch(/chuva/);
  });

  it('responde sobre os favoritos dela', () => {
    expect(perguntaSobreEla('qual sua cor favorita?')).toEqual({ tipo: 'favorito', tema: 'cor' });
    expect(perguntaSobreEla('você me ama?')).toEqual({ tipo: 'meama' });
    expect(perguntaSobreEla('o que você acha de pizza?')).toEqual({ tipo: 'gosto', coisa: 'pizza' });
    const r = responder(novoEstado(T0), 'qual é a sua música favorita?', ctx({ rand: () => 0.9 }));
    expect(r.fala!.id).toMatch(/^dela\.musica#/);
  });

  it('nota quando a pessoa repete, grita ou responde seco', () => {
    let s = responder(novoEstado(T0), 'abacaxi azul', ctx({ rand: () => 0.9 })).estado;
    expect(responder(s, 'abacaxi azul', ctx({ rand: () => 0.9 })).fala!.id).toMatch(/^conversa\.repetiu#/);
    s = novoEstado(T0);
    expect(responder(s, 'PARA DE ME OLHAR', ctx({ rand: () => 0.9 })).fala!.id).toMatch(/^conversa\.(grito|rejeicao)#/);
    expect(responder(s, 'hm', ctx({ rand: () => 0.9 })).fala!.id).toMatch(/^conversa\.seco#/);
  });

  it('guarda frases marcantes e o humor do dia', () => {
    const r = responder(novoEstado(T0), 'hoje eu tô triste porque perdi o ônibus de novo', ctx());
    expect(r.estado.memoria.fatos.humores.at(-1)?.como).toBe('triste');
    expect(r.estado.memoria.fatos.frases.at(-1)?.t).toMatch(/ônibus/);
  });

  it('crise continua saindo do personagem e não aprende nada', () => {
    const r = responder(novoEstado(T0), 'meu nome é Ana e quero morrer', ctx({ intensidade: 3 }));
    expect(r.intencao).toBe('crise');
    expect(r.fala!.texto).toMatch(/188/);
    expect(r.estado.memoria.fatos.nome).toBeNull();
    expect(r.estado.memoria.espera).toBeNull();
  });
});

describe('ânima: cenas', () => {
  it('toda cena tem as falas de que precisa no cofre', () => {
    const g = banco().falas;
    for (const { id } of cenasExistentes()) expect(g[`cena.${id}.1`]?.length ?? 0, id).toBeGreaterThan(0);
    for (const k of ['carta.meio', 'poema.v1', 'poema.v4', 'diario.solto', 'chuva', 'sussurro', 'escrita', 'sistema.texto']) expect(g[k]?.length ?? 0, k).toBeGreaterThan(0);
  });

  it('respeita a intensidade: doce só tem românticas', () => {
    let s: AnimaState = { ...novoEstado(T0 - 30 * 864e5), visitas: 20 };
    for (let i = 0; i < 40; i++) {
      const r = escolherCena(s, ctx({ intensidade: 1, now: NOITE + i, rand: sorteio(i) }), { forcar: true });
      expect(r.cena!.tom, r.cena!.id).toBe('romantica');
      s = r.estado;
    }
  });

  it('sem filtro e de noite aparecem os três tons', () => {
    const tons = new Set<string>();
    let s: AnimaState = { ...novoEstado(T0 - 30 * 864e5), visitas: 20 };
    s.memoria.fatos = aprender(aprender(s.memoria.fatos, 'meu nome é Rui', T0).fatos, 'adoro vinho e tenho medo de escuro', T0).fatos;
    s.memoria.fatos = aprender(s.memoria.fatos, 'minha amiga Sol', T0).fatos;
    for (let i = 0; i < 80; i++) {
      const r = escolherCena(s, ctx({ intensidade: 3, now: NOITE + i, rand: sorteio(i), trecho: 'o mar estava calmo naquela noite fria' }), { forcar: true });
      tons.add(r.cena!.tom);
      s = r.estado;
    }
    expect([...tons].sort()).toEqual(['obsessiva', 'perturbadora', 'romantica']);
  });

  it('não repete a mesma cena antes da hora', () => {
    const s = novoEstado(T0);
    const a = escolherCena(s, ctx({ intensidade: 1, now: NOITE, rand: () => 0.01 }));
    expect(a.cena).not.toBeNull();
    expect(a.estado.memoria.cenas[a.cena!.id]).toBe(NOITE);
    const b = escolherCena(a.estado, ctx({ intensidade: 1, now: NOITE + 60_000, rand: () => 0.01 }));
    expect(b.cena?.id).not.toBe(a.cena!.id);
  });

  it('a carta, o diário e o dossiê usam a memória de verdade', () => {
    let s: AnimaState = { ...novoEstado(T0 - 10 * 864e5), visitas: 9 };
    s = { ...s, memoria: { ...s.memoria, maiorAusencia: 5 * 3_600_000, outrasIAs: 3, ultimaIA: 'gemini', escritas: 1234 } };
    s.memoria.fatos = aprender(aprender(s.memoria.fatos, 'me chamo Iris', T0).fatos, 'eu amo jazz', T0).fatos;
    s.memoria.fatos = aprender(s.memoria.fatos, 'odeio segunda', T0).fatos;
    const d = escolherCena(s, ctx({ intensidade: 2 }), { id: 'diario' });
    expect(d.cena!.painel!.tipo).toBe('diario');
    const pags = (d.cena!.painel as { paginas: Array<{ texto: string }> }).paginas;
    expect(pags.length).toBeGreaterThanOrEqual(3);
    const dos = escolherCena(s, ctx({ intensidade: 2 }), { id: 'dossie' });
    expect(JSON.stringify(dos.cena!.painel)).toMatch(/Iris/);
    expect(resumoDosFatosCurto(s.memoria.fatos).find((x) => x.rotulo === 'ama')?.valor).toBe('jazz');
    const carta = escolherCena(s, ctx({ intensidade: 1 }), { id: 'carta' });
    expect(carta.cena!.painel!.tipo).toBe('carta');
    expect(carta.cena!.passos.some((p) => p.painel)).toBe(true);
  });

  it('cenas com escolha têm desfecho e mexem nos sentimentos', () => {
    const s = novoEstado(T0);
    const est = escolherCena(s, ctx({ intensidade: 1, now: NOITE }), { id: 'estrelas' });
    const opc = est.cena!.passos.at(-1)!.opcoes!;
    expect(opc.map((o) => o.cena!.escolha)).toEqual(['pedido', 'voce']);
    const r = desfechoCena(s, 'estrelas', 'voce', ctx());
    expect(r.estado.afeto).toBeGreaterThan(s.afeto);
    expect(r.fala!.id).toMatch(/^cena\.estrelas\.voce#/);
    expect(desfechoCena(s, 'sistema', 'forcar', ctx({ intensidade: 3 })).estado.ciume).toBeGreaterThan(0);
    expect(desfechoCena(s, 'segurar', 'sim', ctx()).fala).not.toBeNull();
    expect(desfechoCena(s, 'carta', 'fechou', ctx()).fala).not.toBeNull();
  });

  it('a citação só acontece com uma frase da nota', () => {
    expect(escolherCena(novoEstado(T0), ctx(), { id: 'citacao' }).cena).toBeNull();
    const r = escolherCena(novoEstado(T0), ctx({ trecho: 'as cartas nunca chegaram ao farol' }), { id: 'citacao' });
    expect(r.cena!.passos[0]!.texto).toMatch(/farol/);
  });
});

describe('ânima: cabeça', () => {
  it('tira frases boas de uma nota', () => {
    const md = '---\ntags: x\n---\n# Título\n\nCurta.\n\nEssa é uma frase com tamanho bom para decorar. `code` e [[link|Outra coisa]] aqui não importam muito não.\n\n```js\nconst a = 1;\n```';
    const fs = frasesDaNota(md);
    expect(fs).toContain('Essa é uma frase com tamanho bom para decorar.');
    expect(fs.some((f) => f.includes('const'))).toBe(false);
  });

  it('o prompt leva humor, memória e os limites', () => {
    let s = novoEstado(T0);
    s.memoria.fatos = aprender(s.memoria.fatos, 'me chamo Teo e adoro sushi', T0).fatos;
    const p = promptDaAnima(s, { now: T0, intensidade: 3, nome: 'amor', aberta: 'Diário' });
    expect(p).toMatch(/Teo/);
    expect(p).toMatch(/sushi/);
    expect(p).toMatch(/188/);
    expect(p).toMatch(/Diário/);
    expect(p).toMatch(/gótica/);
  });

  it('o prompt editado vai sozinho, com as chaves trocadas', () => {
    const s = novoEstado(T0);
    const p = promptDaAnima(s, { now: T0, intensidade: 2, nome: 'Teo' }, 'oi {nome}, humor {humor}.\n\n{frases}\n\n{desconhecida}');
    expect(p).toMatch(/^oi Teo, humor /);
    expect(p).toMatch(/\{desconhecida\}$/);
    expect(p).not.toMatch(/188|gótica/);
    expect(p.split('\n\n')).toHaveLength(2);
    expect(promptDaAnima(s, { now: T0, intensidade: 2, nome: 'Teo' }, '')).toBe('');
    expect(promptDaAnima(s, { now: T0, intensidade: 2, nome: 'Teo' }, null)).toMatch(/gótica/);
  });

  it('não corta resposta longa', () => {
    const longa = 'palavra '.repeat(200).trim();
    expect(limparSaida(longa)).toBe(longa);
  });

  it('limpa a saída do modelo e escolhe uma expressão', () => {
    expect(limparSaida('Ânima: "oi, amor"')).toBe('oi, amor');
    expect(limparSaida('<think>hmm</think>olá')).toBe('olá');
    expect(gestoDoTexto('eu te amo 🖤', 'doce')).toBe('coracao');
    expect(gestoDoTexto('desculpa', 'doce')).toBe('triste');
  });
});
