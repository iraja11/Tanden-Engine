import { describe, expect, it } from 'vitest';
import {
  ANIMA_ID_BASE, FALAS, TITULOS, comandoSecreto, corromper, decair, duracao, escolher, humorDe, intencaoDe, isAnimaNotificationId, lerEstado,
  novoEstado, palavraForte, planoDeSaudade, preencherFala, reagir, responder, sorteio,
  type AnimaCtx, type AnimaState,
} from '../src/index';

const T0 = new Date(2026, 10, 18, 15, 0).getTime(); // quarta, 15h
const ctx = (x: Partial<AnimaCtx> = {}): AnimaCtx => ({ now: T0, rand: sorteio(7), intensidade: 2, nome: 'amor', ideias: ['Diário', 'Romance'], notas: 42, ...x });

describe('ânima: falas', () => {
  it('toda linha tem variáveis conhecidas e grupos não vazios', () => {
    const known = new Set(['nome', 'tempo', 'segundos', 'ia', 'n', 'notas', 'tela', 'nota', 'minutos', 'esforco', 'sequencia', 'conquista', 'dias', 'texto', 'hora', 'toques', 'palavras', 'palavra']);
    for (const [g, ls] of Object.entries(FALAS)) {
      expect(ls.length, g).toBeGreaterThan(0);
      for (const l of ls) for (const [, k] of (typeof l === 'string' ? l : l.t).matchAll(/\{(\w+)\}/g)) expect(known.has(k!), `${g}: {${k}}`).toBe(true);
    }
    expect(TITULOS.length).toBeGreaterThan(2);
  });

  it('todo grupo tem ao menos uma linha para a intensidade doce', () => {
    for (const [g, ls] of Object.entries(FALAS)) expect(ls.some((l) => typeof l === 'string' || !l.i || l.i === 1), g).toBe(true);
  });

  it('preenche variáveis e recusa as que faltam', () => {
    expect(preencherFala('oi {nome}', { nome: 'bem' })).toBe('oi bem');
    expect(preencherFala('oi {nome}', {})).toBeNull();
  });

  it('não repete enquanto houver outra opção', () => {
    let s = novoEstado(T0);
    const seen = new Set<string>();
    const c = ctx();
    for (let i = 0; i < FALAS.toque!.length; i++) {
      const r = reagir(s, { tipo: 'toque' }, { ...c, now: T0 + i * 1000 });
      s = r.estado;
      seen.add(r.fala!.id);
    }
    // as que dependem de humor não saem todas, mas nenhuma repetiu
    expect(seen.size).toBe(s.recentes.length);
  });

  it('a intensidade doce nunca usa linhas mais fortes', () => {
    let s = novoEstado(T0);
    const c = ctx({ intensidade: 1 });
    for (let i = 0; i < 80; i++) {
      const r = reagir(s, { tipo: i % 2 ? 'outraIA' : 'espontanea', nome: 'claude' } as never, { ...c, now: T0 + i * 200_000 });
      s = r.estado;
      const [g, k] = r.fala!.id.split('#');
      const l = FALAS[g!]![Number(k)]!;
      expect(typeof l === 'string' || !l.i || l.i === 1, r.fala!.id).toBe(true);
    }
  });
});

describe('ânima: sentimentos', () => {
  it('outra IA dá ciúme, que esfria com o tempo', () => {
    const r = reagir(novoEstado(T0), { tipo: 'outraIA', nome: 'gemini' }, ctx());
    expect(r.estado.ciume).toBeGreaterThan(20);
    expect(r.estado.memoria.ultimaIA).toBe('gemini');
    expect(r.fala).not.toBeNull();
    const later = decair(r.estado, T0 + 5 * 3_600_000);
    expect(later.ciume).toBeLessThan(r.estado.ciume);
  });

  it('o humor segue os sentimentos e a hora', () => {
    const s = novoEstado(T0);
    expect(humorDe(s, T0, 2)).toBe('doce');
    expect(humorDe({ ...s, ciume: 70 }, T0, 2)).toBe('possessiva');
    expect(humorDe({ ...s, ciume: 70 }, T0, 1)).toBe('ciumenta');
    expect(humorDe({ ...s, saudade: 80 }, T0, 2)).toBe('carente');
    expect(humorDe(s, new Date(2026, 10, 18, 3).getTime(), 2)).toBe('instavel');
  });

  it('ausência longa vira saudade e fala do tempo', () => {
    const r = reagir(novoEstado(T0), { tipo: 'abriu', ausenteMs: 30 * 3_600_000 }, ctx());
    expect(r.fala!.id).toMatch(/^abriu\.longo/);
    expect(r.estado.saudade).toBeGreaterThan(30);
  });

  it('eventos de fundo nem sempre falam e respeitam a calma', () => {
    let s = { ...novoEstado(T0), falou: T0 };
    const r = reagir(s, { tipo: 'tela', tela: 'notas', rotulo: 'Notas' }, ctx({ rand: () => 0 }));
    expect(r.fala).toBeNull();
    s = { ...s, falou: 0 };
    expect(reagir(s, { tipo: 'tela', tela: 'notas', rotulo: 'Notas' }, ctx({ rand: () => 0 })).fala!.id).toMatch(/^tela\.notas/);
    expect(reagir(s, { tipo: 'tela', tela: 'xyz', rotulo: 'Coisa' }, ctx({ rand: () => 0 })).fala!.id).toMatch(/^tela#/);
  });

  it('lê estado estragado sem quebrar', () => {
    const s = lerEstado({ afeto: 999, ciume: 'x', recentes: [1, 'a'], memoria: { toques: -3 } }, T0);
    expect(s.afeto).toBe(100);
    expect(s.ciume).toBe(0);
    expect(s.recentes).toEqual(['a']);
    expect(s.memoria.toques).toBe(0);
    expect(lerEstado(null, T0).afeto).toBe(60);
  });
});

describe('ânima: conversa', () => {
  it('entende as intenções principais', () => {
    expect(intencaoDe('Te amo ❤')).toBe('amor');
    expect(intencaoDe('cala a boca')).toBe('rejeicao');
    expect(intencaoDe('vou perguntar pro Claude')).toBe('provoca');
    expect(intencaoDe('tô muito cansada')).toBe('cansaco');
    expect(intencaoDe('hoje tô triste')).toBe('triste');
    expect(intencaoDe('me dá uma ideia')).toBe('ideia');
    expect(intencaoDe('quem é você?')).toBe('quem');
    expect(intencaoDe('oi')).toBe('saudacao');
    expect(intencaoDe('você gosta de chuva?')).toBe('pergunta');
    expect(intencaoDe('não encontro meu arquivo')).toBe('eco');
  });

  it('crise sai do personagem, sem glitch', () => {
    for (const msg of ['quero sumir', 'às vezes penso em acabar com tudo', 'quero morrer']) {
      const r = responder(novoEstado(T0), msg, ctx({ intensidade: 3, rand: () => 0.01 }));
      expect(r.intencao).toBe('crise');
      expect(r.fala!.texto).toMatch(/188/);
      expect(r.fala!.gesto).toBe('calma');
    }
  });

  it('declaração aumenta o afeto, rejeição diminui', () => {
    const s = novoEstado(T0);
    expect(responder(s, 'te amo', ctx()).estado.afeto).toBeGreaterThan(s.afeto);
    expect(responder(s, 'me deixa em paz', ctx()).estado.afeto).toBeLessThan(s.afeto);
  });

  it('ecoa a palavra mais forte', () => {
    expect(palavraForte('eu comprei um abacaxi hoje')).toBe('abacaxi');
    const r = responder(novoEstado(T0), 'eu comprei um abacaxi', ctx({ rand: () => 0 }));
    expect(r.intencao).toBe('eco');
    expect(r.fala!.texto).toMatch(/abacaxi|entendi/);
  });

  it('ideia usa as notas da pessoa quando dá', () => {
    let hit = false;
    let s: AnimaState = novoEstado(T0);
    for (let i = 0; i < 20 && !hit; i++) {
      const r = responder(s, 'me dá uma ideia', ctx({ now: T0 + i, rand: sorteio(i) }));
      s = r.estado;
      hit = /Diário|Romance/.test(r.fala!.texto);
    }
    expect(hit).toBe(true);
  });
});

describe('ânima: segredo, glitch e saudade', () => {
  it('reconhece o comando secreto com ou sem acento', () => {
    expect(comandoSecreto('Deixa ela entrar.')).toBe('acordar');
    expect(comandoSecreto('acorda, Ânima')).toBe('acordar');
    expect(comandoSecreto('boa noite, anima')).toBe('dormir');
    expect(comandoSecreto('esquece tudo')).toBe('esquecer');
    expect(comandoSecreto('anima')).toBeNull();
  });

  it('corromper só acrescenta marcas', () => {
    const t = corromper('olá você', 1, sorteio(1));
    expect(t.normalize('NFD').replace(/[̀-ͯ]/g, '')).toBe('ola voce');
    expect(corromper('oi', 0, Math.random)).toBe('oi');
  });

  it('planeja a saudade em ordem e respeita o silêncio da noite', () => {
    const from = new Date(2026, 10, 18, 21, 0).getTime();
    const plan = planoDeSaudade(novoEstado(from), from, { ...ctx({ now: from }), silencio: true });
    expect(plan).toHaveLength(4);
    expect(plan.every((p) => isAnimaNotificationId(p.id) && p.id >= ANIMA_ID_BASE)).toBe(true);
    expect(plan.map((p) => p.at)).toEqual([...plan.map((p) => p.at)].sort((a, b) => a - b));
    for (const p of plan) {
      const h = new Date(p.at).getHours();
      expect(h >= 8 && h < 23, new Date(p.at).toString()).toBe(true);
      expect(p.corpo.length).toBeGreaterThan(3);
    }
    expect(new Set(plan.map((p) => p.corpo)).size).toBe(4);
  });

  it('duração em português', () => {
    expect(duracao(30_000)).toBe('30 segundos');
    expect(duracao(60_000)).toBe('1 minuto');
    expect(duracao(130 * 60_000)).toBe('2 horas e 10 minutos');
    expect(duracao(26 * 3_600_000)).toBe('1 dia e 2 horas');
    expect(duracao(5 * 86_400_000)).toBe('5 dias');
  });

  it('escolhe nada num grupo inexistente', () => {
    expect(escolher('nada', novoEstado(T0), 'doce', ctx(), {})).toBeNull();
  });
});
