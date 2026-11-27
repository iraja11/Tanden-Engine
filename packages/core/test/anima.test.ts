import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANIMA_ID_BASE, GESTOS, abrirCofre, avisoDoSegredo, banco, botoesDaConversa, comandoSecreto, corromper, decair, duracao, escolher,
  humorDe, intencaoDe, isAnimaNotificationId, lembranca, lerEstado, novoEstado, palavraForte, perguntaDoDia, planoDeSaudade, preencherFala,
  reagir, responder, responderPergunta, sorteio, textoDe,
  type AnimaCtx, type AnimaState,
} from '../src/index';
import { FALAS_DAT } from '../src/anima/falas.dat';

// as frases secretas não aparecem em texto puro nem nos testes
const segredo = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');
const ACORDAR = segredo('RGVpeGEgZWxhIGVudHJhci4=');
const ACORDAR2 = segredo('YWNvcmRhLCDDgm5pbWE=');
const DORMIR = segredo('Ym9hIG5vaXRlLCBhbmltYQ==');
const ESQUECER = segredo('ZXNxdWVjZSB0dWRv');

const T0 = new Date(2026, 10, 18, 15, 0).getTime(); // quarta, 15h
const ctx = (x: Partial<AnimaCtx> = {}): AnimaCtx => ({ now: T0, rand: sorteio(7), intensidade: 2, nome: 'amor', ideias: ['Diário', 'Romance'], notas: 42, ...x });
const linhaDe = (id: string) => {
  const [g, k] = id.split('#');
  return banco().falas[g!]![Number(k)]!;
};

describe('ânima: cofre', () => {
  it('as falas só existem encriptadas no código', () => {
    const src = readFileSync(new URL('../src/anima/falas.dat.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/você|ciúme|saudade/);
    expect(FALAS_DAT).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(() => JSON.parse(abrirCofre(FALAS_DAT))).not.toThrow();
  });

  it('o cofre tem muitas falas, perguntas e fragmentos', () => {
    const b = banco();
    const n = Object.values(b.falas).reduce((a, l) => a + l.length, 0);
    expect(n).toBeGreaterThan(1000);
    expect(b.perguntas.length).toBeGreaterThan(20);
    expect(b.perguntas.every((p) => p.opcoes.length >= 2 && p.opcoes.every((o) => o.texto && o.reacao && o.lembra))).toBe(true);
    const f = b.falas;
    expect(f['frag.abre']!.length * f['frag.meio']!.length * f['frag.fecha']!.length).toBeGreaterThan(50_000);
  });

  it('toda linha usa variáveis conhecidas, expressões válidas e todo grupo serve à intensidade doce', () => {
    const known = new Set(['nome', 'tempo', 'segundos', 'ia', 'n', 'notas', 'tela', 'nota', 'minutos', 'esforco', 'sequencia', 'conquista', 'dias', 'escolha', 'outra', 'texto', 'hora', 'toques', 'palavras', 'palavra', 'semana', 'juntos', 'busca', 'bateria',
      'coisa', 'pessoa', 'rel', 'bicho', 'nomereal', 'frase', 'trecho', 'visitas', 'aberta',
      // cérebro
      'titulo', 'quando', 'opcoes', 'extra', 'formula', 'total', 'lado', 'mundo', 'erro', 'segundos', 'afeto', 'ciume', 'humor', 'expr', 'resultado', 'data',
      'idade', 'lista', 'tipo', 'periodo', 'assunto', 'horas', 'capitulo', 'coisa2', 'personagem', 'lugar', 'faccao', 'criatura', 'divindade', 'comando',
      'falta', 'meta', 'bebido', 'copos', 'campo', 'jogo', 'acorda', 'site', 'pagina',
      // música e Minecraft
      'artista', 'musica', 'album', 'vezes', 'faixas', 'jogador', 'vida', 'fome', 'bioma', 'y', 'item', 'mortes', 'sessoes', 'presentes', 'termo',
      'ela', 'voce', 'vitorias', 'derrotas', 'dist', 'minerio', 'rumo', 'mob', 'mobs', 'alvo', 'pegou', 'nenhum', 'pedidos',
      // diálogo e capacidades
      'dito', 'pergunta', 'espelho', 'conversao', 'ano', 'anos', 'mes', 'faltam', 'passados', 'semanas']);
    const gestos = new Set<string>(GESTOS);
    for (const [g, ls] of Object.entries(banco().falas)) {
      expect(ls.length, g).toBeGreaterThan(0);
      expect(ls.some((l) => typeof l === 'string' || !l.i || l.i === 1), g).toBe(true);
      for (const l of ls) {
        for (const [, k] of textoDe(l).matchAll(/\{(\w+)\}/g)) expect(known.has(k!), `${g}: {${k}}`).toBe(true);
        if (typeof l !== 'string' && l.g) expect(gestos.has(l.g), `${g}: ${l.g}`).toBe(true);
      }
    }
  });

  it('preenche variáveis e recusa as que faltam', () => {
    expect(preencherFala('oi {nome}', { nome: 'bem' })).toBe('oi bem');
    expect(preencherFala('oi {nome}', {})).toBeNull();
  });
});

describe('ânima: reações', () => {
  it('não repete enquanto houver outra opção', () => {
    let s = novoEstado(T0);
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = reagir(s, { tipo: 'toque' }, { ...ctx(), now: T0 + i * 1000, rand: sorteio(i) });
      s = r.estado;
      ids.push(r.fala!.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a intensidade doce nunca usa linhas mais fortes', () => {
    let s = novoEstado(T0);
    for (let i = 0; i < 120; i++) {
      const ev = [{ tipo: 'outraIA', nome: 'claude' }, { tipo: 'espontanea' }, { tipo: 'toque', nivel: 3 }, { tipo: 'carinho' }][i % 4] as never;
      const r = reagir(s, ev, ctx({ intensidade: 1, now: T0 + i * 200_000, rand: sorteio(i) }));
      s = r.estado;
      const id = r.fala!.id;
      if (!id.includes('#') || id.startsWith('frag') || id.startsWith('lembra')) continue;
      const l = linhaDe(id);
      expect(typeof l === 'string' || !l.i || l.i === 1, id).toBe(true);
    }
  });

  it('cutucar escala, carinho acalma o ciúme, jogar e esconder têm falas', () => {
    expect(reagir(novoEstado(T0), { tipo: 'toque', nivel: 2 }, ctx()).fala!.id).toMatch(/^cutucar\.2#/);
    expect(reagir(novoEstado(T0), { tipo: 'toque', nivel: 3 }, ctx()).fala!.id).toMatch(/^cutucar\.3#/);
    const brava = { ...novoEstado(T0), ciume: 50 };
    const r = reagir(brava, { tipo: 'carinho' }, ctx());
    expect(r.estado.ciume).toBeLessThan(50);
    expect(r.fala!.gesto).toBe('corada');
    expect(reagir(novoEstado(T0), { tipo: 'jogar' }, ctx()).fala!.gesto).toMatch(/tonta|raiva|glitch|feliz/);
    expect(reagir(novoEstado(T0), { tipo: 'esconder' }, ctx()).fala).not.toBeNull();
  });

  it('datas, dia e aniversários', () => {
    expect(reagir(novoEstado(T0), { tipo: 'data', chave: '1225' }, ctx()).fala!.id).toMatch(/^data\.1225#/);
    expect(reagir(novoEstado(T0), { tipo: 'dia', periodo: 'manha' }, ctx()).fala!.id).toMatch(/^dia\.manha#/);
    expect(reagir(novoEstado(T0), { tipo: 'aniversario', marco: 'mes' }, ctx({ now: T0 + 30 * 864e5 })).fala).not.toBeNull();
  });

  it('busca e bateria entram no texto', () => {
    const s = { ...novoEstado(T0), falou: 0 };
    const b = reagir(s, { tipo: 'busca', termo: 'xyzzy' }, ctx({ rand: () => 0 }));
    expect(b.fala!.texto).toMatch(/xyzzy/);
    expect(reagir(s, { tipo: 'bateria', nivel: 9 }, ctx()).fala!.texto).toMatch(/9%/);
  });

  it('falas do balão vêm com botões de resposta', () => {
    const r = reagir(novoEstado(T0), { tipo: 'toque' }, ctx());
    expect(r.fala!.opcoes!.length).toBeGreaterThan(0);
    expect(r.fala!.opcoes!.every((o) => o.rotulo && o.resposta)).toBe(true);
    expect(botoesDaConversa().length).toBe(3);
  });

  it('pensamentos soltos variam entre ideias, fragmentos e falas', () => {
    let s = novoEstado(T0);
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = reagir(s, { tipo: 'espontanea' }, ctx({ now: T0 + i * 1000, rand: sorteio(100 + i) }));
      s = r.estado;
      kinds.add(r.fala!.id.split('#')[0]!);
    }
    expect(kinds.has('frag.meio')).toBe(true);
    expect(kinds.has('ideia')).toBe(true);
    expect(kinds.has('espontanea')).toBe(true);
  });
});

describe('ânima: pergunta do dia', () => {
  it('pergunta uma vez por dia, guarda a resposta e lembra depois', () => {
    let s = novoEstado(T0);
    const p = perguntaDoDia(s, ctx());
    expect(p.fala!.opcoes!.length).toBeGreaterThanOrEqual(2);
    s = p.estado;
    expect(perguntaDoDia(s, ctx()).fala).toBeNull();
    const q = p.fala!.opcoes![0]!.pergunta!;
    const r = responderPergunta(s, q.id, q.n, ctx());
    expect(r.fala!.texto.length).toBeGreaterThan(3);
    s = r.estado;
    expect(s.memoria.respostas[q.id]!.n).toBe(0);
    expect(lembranca(s, ctx())).toBeNull(); // no mesmo dia, não
    const amanha = ctx({ now: T0 + 864e5 });
    const l = lembranca(s, amanha)!;
    expect(l.id).toBe(`lembra#${q.id}`);
    const outra = perguntaDoDia(s, amanha);
    expect(outra.fala!.id).not.toBe(p.fala!.id);
  });

  it('recomeça o ciclo quando acabam as perguntas', () => {
    let s = novoEstado(T0);
    const total = banco().perguntas.length;
    const vistas = new Set<string>();
    for (let d = 0; d <= total; d++) {
      const r = perguntaDoDia(s, ctx({ now: T0 + d * 864e5, rand: sorteio(d) }));
      s = r.estado;
      vistas.add(r.fala!.id);
    }
    expect(vistas.size).toBe(total);
  });
});

describe('ânima: sentimentos', () => {
  it('outra IA dá ciúme, que esfria com o tempo', () => {
    const r = reagir(novoEstado(T0), { tipo: 'outraIA', nome: 'gemini' }, ctx());
    expect(r.estado.ciume).toBeGreaterThan(20);
    expect(r.estado.memoria.ultimaIA).toBe('gemini');
    expect(decair(r.estado, T0 + 5 * 3_600_000).ciume).toBeLessThan(r.estado.ciume);
  });

  it('o humor segue os sentimentos e a hora', () => {
    const s = novoEstado(T0);
    expect(humorDe(s, T0, 2)).toBe('doce');
    expect(humorDe({ ...s, ciume: 70 }, T0, 2)).toBe('possessiva');
    expect(humorDe({ ...s, ciume: 70 }, T0, 1)).toBe('ciumenta');
    expect(humorDe({ ...s, saudade: 80 }, T0, 2)).toBe('carente');
    expect(humorDe(s, new Date(2026, 10, 18, 3).getTime(), 2)).toBe('instavel');
  });

  it('ausência longa vira saudade, fala do tempo e fica na memória', () => {
    const r = reagir(novoEstado(T0), { tipo: 'abriu', ausenteMs: 30 * 3_600_000 }, ctx());
    expect(r.fala!.id).toMatch(/^abriu\.longo/);
    expect(r.estado.saudade).toBeGreaterThan(30);
    expect(r.estado.memoria.maiorAusencia).toBe(30 * 3_600_000);
  });

  it('eventos de fundo nem sempre falam e respeitam a calma', () => {
    let s = { ...novoEstado(T0), falou: T0 };
    expect(reagir(s, { tipo: 'tela', tela: 'notas', rotulo: 'Notas' }, ctx({ rand: () => 0 })).fala).toBeNull();
    s = { ...s, falou: 0 };
    expect(reagir(s, { tipo: 'tela', tela: 'notas', rotulo: 'Notas' }, ctx({ rand: () => 0 })).fala!.id).toMatch(/^tela\.notas/);
    expect(reagir(s, { tipo: 'tela', tela: 'xyz', rotulo: 'Coisa' }, ctx({ rand: () => 0 })).fala!.id).toMatch(/^tela#/);
  });

  it('lê estado estragado sem quebrar', () => {
    const s = lerEstado({ afeto: 999, ciume: 'x', recentes: [1, 'a'], memoria: { toques: -3, respostas: { a: { n: 1, dia: 'x' }, b: 3 } } }, T0);
    expect(s.afeto).toBe(100);
    expect(s.ciume).toBe(0);
    expect(s.recentes).toEqual(['a']);
    expect(s.memoria.toques).toBe(0);
    expect(s.memoria.respostas).toEqual({ a: { n: 1, dia: 'x' } });
    expect(lerEstado(null, T0).afeto).toBe(60);
  });
});

describe('ânima: conversa', () => {
  it('entende as intenções', () => {
    const casos: Array<[string, string]> = [
      ['Te amo ❤', 'amor'], ['cala a boca', 'rejeicao'], ['vou perguntar pro Claude', 'provoca'], ['tô muito cansada', 'cansaco'],
      ['hoje tô triste', 'triste'], ['me dá uma ideia', 'ideia'], ['quem é você?', 'quem'], ['oi', 'saudacao'], ['bom dia!', 'bomdia'],
      ['você gosta de chuva?', 'pergunta'], ['não encontro meu arquivo', 'eco'], ['conta uma piada', 'piada'], ['você é real?', 'real'],
      ['passei na prova!!', 'conquistei'], ['vou te desinstalar', 'desinstalar'], ['me elogia', 'elogiame'], ['que tédio', 'tedio'],
      ['dia péssimo', 'mau'], ['senti saudade', 'saudade'], ['tô ouvindo uma música', 'musica'],
    ];
    for (const [msg, want] of casos) expect(intencaoDe(msg), msg).toBe(want);
  });

  it('toda intenção tem falas', () => {
    for (const msg of ['bom dia', 'conta uma piada', 'você é real?', 'passei!', 'vou te desinstalar', 'me elogia', 'que tédio', 'dia péssimo', 'senti saudade', 'tô ouvindo música']) {
      const r = responder(novoEstado(T0), msg, ctx());
      expect(r.fala!.id.startsWith('conversa.eco'), msg).toBe(false);
    }
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
    const s: AnimaState = novoEstado(T0);
    expect(responder(s, 'te amo', ctx()).estado.afeto).toBeGreaterThan(s.afeto);
    expect(responder(s, 'me deixa em paz', ctx()).estado.afeto).toBeLessThan(s.afeto);
  });

  it('ecoa a palavra mais forte', () => {
    expect(palavraForte('eu comprei um abacaxi hoje')).toBe('abacaxi');
    expect(responder(novoEstado(T0), 'eu comprei um abacaxi', ctx()).intencao).toBe('eco');
  });
});

describe('ânima: segredo, glitch e saudade', () => {
  it('reconhece o comando secreto, guardado só como hash', () => {
    expect(comandoSecreto(ACORDAR)).toBe('acordar');
    expect(comandoSecreto(ACORDAR2)).toBe('acordar');
    expect(comandoSecreto(DORMIR)).toBe('dormir');
    expect(comandoSecreto(ESQUECER)).toBe('esquecer');
    expect(comandoSecreto('anima')).toBeNull();
    expect(avisoDoSegredo('acordar', sorteio(1)).length).toBeGreaterThan(0);
    const src = readFileSync(new URL('../src/anima/motor.ts', import.meta.url), 'utf8');
    expect(src.includes(ACORDAR.toLowerCase().replace('.', ''))).toBe(false);
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
    expect(plan.every((p) => isAnimaNotificationId(p.id) && p.id >= ANIMA_ID_BASE && p.titulo)).toBe(true);
    for (const p of plan) {
      const h = new Date(p.at).getHours();
      expect(h >= 8 && h < 23).toBe(true);
    }
    expect(new Set(plan.map((p) => p.corpo)).size).toBe(4);
  });

  it('duração em português', () => {
    expect(duracao(30_000)).toBe('30 segundos');
    expect(duracao(130 * 60_000)).toBe('2 horas e 10 minutos');
    expect(duracao(5 * 86_400_000)).toBe('5 dias');
  });

  it('grupo inexistente não escolhe nada', () => {
    expect(escolher('nada', novoEstado(T0), 'doce', ctx(), {})).toBeNull();
  });
});
