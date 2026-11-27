/*
 * A faculdade da Ânima: ler a grade, pôr as aulas na agenda, notas, faltas,
 * "que aula tenho hoje?" e as perguntas que ela faz sozinha.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { cerebro, novoEstado, sorteio, type AnimaState } from '../src/index';
import { aulasNaAgenda, fimDoSemestre, lerGrade, lerNota, lerPresenca, lerSeFaz } from '../src/anima/cerebro/faculdade';

const { pensar, rotina, prepararRede } = cerebro;

beforeAll(async () => {
  await prepararRede();
});

const T0 = new Date(2026, 10, 26, 15, 0).getTime(); // quinta, 15h
const ctx = (x: Partial<cerebro.CtxCerebro> = {}): cerebro.CtxCerebro => ({
  now: T0, rand: sorteio(3), intensidade: 2, nome: 'amor', ideias: [], notas: 10, titulos: [], comandos: [], mundos: [], agenda: [], ...x,
});
const GRADE = 'Cálculo 1: seg e qua 8h às 10h @ sala 12\nFísica 2: terça e quinta 10h-12h\nProgramação: sex 14h às 18h';

describe('faculdade: leitura', () => {
  it('lê a grade (nome com número, vários dias, faixa e local)', () => {
    const g = lerGrade(GRADE);
    expect(g.map((m) => m.nome)).toEqual(['Cálculo 1', 'Física 2', 'Programação']);
    expect(g[0]!.aulas).toEqual([{ dias: [1, 3], inicio: '08:00', fim: '10:00', local: 'sala 12' }]);
    expect(g[1]!.aulas[0]).toMatchObject({ dias: [2, 4], inicio: '10:00', fim: '12:00' });
    expect(lerGrade('oi tudo bem')).toEqual([]);
  });

  it('as aulas viram eventos semanais até o fim do semestre, a partir da próxima aula', () => {
    const [ev] = aulasNaAgenda(lerGrade('Cálculo: seg 8h-10h'), '2026-12-20', T0);
    expect(ev).toMatchObject({ title: 'Aula: Cálculo', date: '2026-11-30', start: '08:00', end: '10:00', repeat: { freq: 'weekly', weekdays: [1], until: '2026-12-20' } });
  });

  it('fim do semestre: "até 15/12", senão julho ou dezembro', () => {
    expect(fimDoSemestre('minha grade, até 15/12', T0)).toBe('2026-12-15');
    expect(fimDoSemestre('grade', T0)).toBe('2026-12-20');
    expect(fimDoSemestre('grade', new Date(2027, 2, 1).getTime())).toBe('2027-07-15');
  });

  it('notas, faltas e "faço faculdade"', () => {
    const g = lerGrade(GRADE);
    expect(lerNota(g, 'tirei 8,5 em cálculo')).toMatchObject({ v: 8.5, de: 10, materia: { nome: 'Cálculo 1' } });
    expect(lerNota(g, 'peguei 72/100 na prova de física')).toMatchObject({ v: 72, de: 100, materia: { nome: 'Física 2' } });
    expect(lerPresenca(g, 'faltei programação hoje')).toMatchObject({ falta: true, materia: { nome: 'Programação' } });
    expect(lerPresenca(g, 'fui em todas as aulas')).toMatchObject({ falta: false });
    expect(lerSeFaz('faço faculdade de direito')).toEqual({ faz: true, curso: 'direito' });
    expect(lerSeFaz('não faço faculdade')).toEqual({ faz: false, curso: null });
  });
});

describe('faculdade: na conversa', () => {
  const comGrade = (): AnimaState => pensar(novoEstado(T0), `minha grade:\n${GRADE}`, ctx()).estado;

  it('a grade vai para a memória e para a agenda (ação grade)', () => {
    const r = pensar(novoEstado(T0), `minha grade:\n${GRADE}`, ctx());
    expect(r.intencao).toBe('faculdade');
    expect(r.acao?.tipo).toBe('grade');
    expect(r.acao && r.acao.tipo === 'grade' ? r.acao.aulas : []).toHaveLength(3);
    expect(r.estado.memoria.cerebro.faculdade).toMatchObject({ faz: true, fim: '2026-12-20' });
    expect(r.fala?.id).toMatch(/^faculdade\.grade/);
  });

  it('"que aula tenho hoje?" e "e amanhã?"', () => {
    const r = pensar(comGrade(), 'que aula eu tenho hoje?', ctx({ now: T0 + 60_000 }));
    expect(r.fala?.texto).toContain('Física 2');
    const r2 = pensar(r.estado, 'e amanhã?', ctx({ now: T0 + 120_000 }));
    expect(r2.fala?.texto).toContain('Programação');
  });

  it('nota alta é elogiada, nota baixa é cuidada, e as duas ficam guardadas', () => {
    const r = pensar(comGrade(), 'tirei 9,5 em cálculo', ctx({ now: T0 + 60_000 }));
    expect(r.fala?.id).toMatch(/^faculdade\.nota\.alta/);
    const r2 = pensar(r.estado, 'tirei 4 na prova de física', ctx({ now: T0 + 120_000 }));
    expect(r2.fala?.id).toMatch(/^faculdade\.nota\.baixa/);
    const ms = r2.estado.memoria.cerebro.faculdade.materias;
    expect(ms.find((m) => m.nome === 'Cálculo 1')!.notas[0]).toMatchObject({ v: 9.5, de: 10 });
    expect(ms.find((m) => m.nome === 'Física 2')!.notas[0]).toMatchObject({ v: 4 });
  });

  it('falta conta por matéria', () => {
    let s = comGrade();
    for (let i = 0; i < 4; i++) s = pensar(s, 'faltei programação', ctx({ now: T0 + (i + 1) * 60_000 })).estado;
    expect(s.memoria.cerebro.faculdade.materias.find((m) => m.nome === 'Programação')!.faltas).toBe(4);
    expect(pensar(s, 'faltei no trabalho', ctx({ now: T0 + 9 * 60_000 })).intencao).not.toBe('faculdade');
  });
});

describe('faculdade: ela pergunta sozinha', () => {
  const primeira = (s: AnimaState, now = T0) => {
    let r: cerebro.Pensamento | null = null;
    for (let seed = 1; seed < 60 && r?.intencao !== 'rotina.faculdade'; seed++) r = rotina(s, ctx({ now, rand: sorteio(seed) }), { agenda: false, mundo: false });
    return r;
  };
  const base = () => {
    const s = novoEstado(T0 - 30 * 864e5);
    s.memoria.cerebro.capitulo = 9;
    return s;
  };

  it('pergunta se você faz faculdade; "sim" faz ela pedir a grade', () => {
    const r = primeira(base());
    expect(r?.fala?.id).toMatch(/^faculdade\.pergunta#/);
    const r2 = pensar(r!.estado, 'sim', ctx({ now: T0 + 60_000 }));
    expect(r2.estado.memoria.cerebro.faculdade.faz).toBe(true);
    expect(r2.fala?.id).toMatch(/^faculdade\.pede/);
  });

  it('com a grade, pergunta das notas e da presença de vez em quando', () => {
    const s = pensar(base(), `minha grade:\n${GRADE}`, ctx({ now: T0 - 20 * 864e5 })).estado;
    const r = primeira(s);
    expect(r?.fala?.id).toMatch(/^faculdade\.(notas|presenca)/);
  });

  it('semestre vencido: pede a grade nova', () => {
    const s = pensar(base(), `minha grade:\n${GRADE}`, ctx({ now: T0 - 20 * 864e5 })).estado;
    const r = primeira(s, new Date(2027, 1, 10, 15).getTime());
    expect(r?.fala?.id).toMatch(/^faculdade\.pede/);
  });
});
