import { describe, expect, it } from 'vitest';
import {
  DB_TEMPLATES, NoteIndex, bumpGoal, collectHabits, createDatabase, habitRowText, isoWeek, lifeSnapshot, noteRecord, parseCapture,
  parseProps, setTaskDone, taskBucket, taskRowText, weeklyReview,
} from '../src/index';

const now = new Date(2026, 9, 15, 10, 0); // quinta, 15/10/2026

/** Cofre em memória com os bancos da galeria. */
function vault(extra: Record<string, string> = {}) {
  const files = new Map<string, string>();
  for (const id of ['tarefas', 'projetos', 'habitos', 'metas', 'diario']) {
    const tpl = DB_TEMPLATES.find((t) => t.id === id)!;
    const { note, files: rows } = createDatabase(tpl.name, 'Bancos', { ...tpl, samples: [] }, now);
    files.set(`Bancos/${tpl.name}.md`, note);
    for (const r of rows) files.set(r.path, r.text);
  }
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  const index = () => new NoteIndex([...files].map(([p, t]) => noteRecord(p, t)));
  const read = (p: string) => files.get(p) ?? '';
  return { files, index, read, snap: () => lifeSnapshot(index(), read, now) };
}

const base = {
  'Bancos/Projetos/Tanden.md': '---\nstatus: Ativo\nárea: Pessoal\nmeta: "[[Metas/Lançar o app]]"\n---\n# Tanden\n\n- [x] núcleo\n- [ ] tela Hoje\n',
  'Bancos/Projetos/Antigo.md': '---\nstatus: Concluído\nprogresso: 1\n---\n',
  'Bancos/Tarefas/Escrever testes.md': '---\nstatus: A fazer\nprioridade: Alta\nprazo: 2026-10-14\nprojeto: "[[Tanden]]"\n---\n',
  'Bancos/Tarefas/Revisar PR.md': '---\nstatus: Feito\nprazo: 2026-10-13\nprojeto: "[[Tanden]]"\nconcluída: 2026-10-13\n---\n',
  'Bancos/Tarefas/Planejar.md': '---\nstatus: Em andamento\nprazo: 2026-10-15T14:00\n---\n',
  'Bancos/Tarefas/Algum dia.md': '---\nstatus: A fazer\n---\n',
  'Bancos/Metas/Lançar o app.md': '---\nstatus: Ativa\n---\n',
  'Bancos/Metas/Ler 12 livros.md': '---\nstatus: Ativa\nalvo: 12\natual: 3\nunidade: livros\nprazo: 2026-12-31\n---\n',
  'Bancos/Hábitos/2026-10-13.md': '---\ndata: 2026-10-13\nexercício: true\nleitura: true\nágua: false\nestudo: false\n---\n',
  'Bancos/Hábitos/2026-10-14.md': '---\ndata: 2026-10-14\nexercício: true\nleitura: false\nágua: true\nestudo: false\n---\n',
  'Bancos/Hábitos/Quarta.md': '---\ndata: 2026-10-12\nexercício: true\n---\n',
  'Lembretes.md': '# Lembretes\n\n- [ ] Dentista (@2026-10-15 16:30)\n- [ ] Pagar conta 📅 2026-10-20\n- [x] Ligar pro banco (@2026-10-12 09:00) ✅ 2026-10-12\n- [ ] sem data\n',
};

describe('bancos de vida', () => {
  it('acha cada banco pelas propriedades', () => {
    const s = vault(base).snap();
    expect(Object.fromEntries(Object.entries(s.dbs).map(([k, v]) => [k, v!.folder]))).toEqual({
      tarefas: 'Bancos/Tarefas', projetos: 'Bancos/Projetos', habitos: 'Bancos/Hábitos', metas: 'Bancos/Metas', diario: 'Bancos/Diário',
    });
  });

  it('junta tarefas do banco e lembretes das notas, com prazo, hora e projeto', () => {
    const s = vault(base).snap();
    const by = Object.fromEntries(s.tasks.map((t) => [t.title, t]));
    expect(Object.keys(by).sort()).toEqual(['Algum dia', 'Dentista', 'Escrever testes', 'Ligar pro banco', 'Pagar conta', 'Planejar', 'Revisar PR']);
    expect(by['Escrever testes']).toMatchObject({ source: 'banco', due: '2026-10-14', priority: 3, project: 'Bancos/Projetos/Tanden.md', done: false });
    expect(by['Planejar']).toMatchObject({ due: '2026-10-15', time: '14:00', done: false });
    expect(by['Revisar PR']).toMatchObject({ done: true, doneOn: '2026-10-13' });
    expect(by['Dentista']).toMatchObject({ source: 'nota', due: '2026-10-15', time: '16:30', path: 'Lembretes.md' });
    expect(by['Pagar conta']!.time).toBeNull();
    expect(by['Ligar pro banco']).toMatchObject({ done: true, doneOn: '2026-10-12' });
    const day = s.day;
    expect(taskBucket(by['Escrever testes']!, day)).toBe('atrasadas');
    expect(taskBucket(by['Dentista']!, day)).toBe('hoje');
    expect(taskBucket(by['Pagar conta']!, day)).toBe('semana');
    expect(taskBucket(by['Algum dia']!, day)).toBe('sem data');
  });

  it('marca e desmarca no banco e na nota', () => {
    const v = vault(base);
    const s = v.snap();
    const t = s.tasks.find((x) => x.title === 'Escrever testes')!;
    const done = setTaskDone(v.read(t.path), t, true, s.dbs, now);
    expect(parseProps(done)).toMatchObject({ status: 'Feito', concluída: '2026-10-15' });
    const undone = setTaskDone(done, t, false, s.dbs, now);
    expect(parseProps(undone).status).toBe('A fazer');
    expect(parseProps(undone).concluída).toBeUndefined();

    const r = s.tasks.find((x) => x.title === 'Dentista')!;
    const marked = setTaskDone(v.read('Lembretes.md'), r, true, s.dbs, now);
    expect(marked).toContain('- [x] Dentista (@2026-10-15 16:30) ✅ 2026-10-15');
    v.files.set('Lembretes.md', marked);
    const r2 = v.snap().tasks.find((x) => x.title === 'Dentista')!;
    expect(r2.done).toBe(true);
    expect(setTaskDone(marked, r2, false, s.dbs, now)).toContain('- [ ] Dentista (@2026-10-15 16:30)\n');
  });

  it('projetos: progresso pelas tarefas ligadas e pelas caixas da nota', () => {
    const s = vault(base).snap();
    const p = s.projects.find((x) => x.name === 'Tanden')!;
    // 2 tarefas do banco (1 feita) + 2 caixas (1 feita)
    expect(p).toMatchObject({ tasksDone: 2, tasksTotal: 4, progress: 0.5, next: 'Escrever testes', overdue: 1, group: 'doing', goal: 'Bancos/Metas/Lançar o app.md' });
    expect(s.projects.find((x) => x.name === 'Antigo')).toMatchObject({ progress: 1, group: 'done' });
  });

  it('metas: alvo e atual, ou a média dos projetos ligados', () => {
    const s = vault(base).snap();
    expect(s.goals.find((g) => g.name === 'Ler 12 livros')).toMatchObject({ progress: 0.25, unit: 'livros', due: '2026-12-31' });
    expect(s.goals.find((g) => g.name === 'Lançar o app')).toMatchObject({ progress: 0.5, projects: ['Bancos/Projetos/Tanden.md'] });
    expect(parseProps(bumpGoal(base['Bancos/Metas/Ler 12 livros.md'], 1)).atual).toBe('4');
  });

  it('hábitos: semana, sequência e linha nova do dia', () => {
    const v = vault(base);
    const s = v.snap();
    const ex = s.habits.find((h) => h.key === 'exercício')!;
    expect(ex.days.map((d) => d.done)).toEqual([false, false, false, true, true, true, false]);
    // hoje ainda não: conta até ontem
    expect(ex.streak).toBe(3);
    expect(s.habits.find((h) => h.key === 'água')!.streak).toBe(1);
    expect(s.habitRows.get('2026-10-14')).toBe('Bancos/Hábitos/2026-10-14.md');
    const tpl = v.read('Modelos/Hábitos/Dia.md');
    const row = habitRowText(s.dbs.habitos!, '2026-10-15', tpl, now);
    expect(parseProps(row)).toMatchObject({ data: '2026-10-15', exercício: 'false', leitura: 'false', água: 'false', estudo: 'false' });
    expect(parseProps(row)['modelo-para']).toBeUndefined();
    v.files.set('Bancos/Hábitos/2026-10-15.md', row.replace('exercício: false', 'exercício: true'));
    expect(collectHabits(v.snap().dbs, v.index(), now).habits.find((h) => h.key === 'exercício')!.streak).toBe(4);
  });
});

describe('captura rápida', () => {
  it('lê data, hora e prioridade', () => {
    expect(parseCapture('amanhã revisar slides !', now)).toEqual({ title: 'Revisar slides', due: '2026-10-16', time: null, priority: 3, reminder: false });
    expect(parseCapture('sexta 18h30 jogar SF6', now)).toMatchObject({ title: 'Jogar SF6', due: '2026-10-16', time: '18:30', reminder: true });
    expect(parseCapture('comprar café', now)).toEqual({ title: 'Comprar café', due: null, time: null, priority: 0, reminder: false });
    expect(parseCapture('urgente !!', now)!.priority).toBe(4);
    expect(parseCapture('   ', now)).toBeNull();
  });

  it('vira linha do banco de tarefas', () => {
    const v = vault(base);
    const db = v.snap().dbs.tarefas!;
    const t = taskRowText(db, parseCapture('amanhã revisar slides !', now)!, null, now);
    expect(parseProps(t)).toMatchObject({ status: 'A fazer', prazo: '2026-10-16', prioridade: 'Alta', criado: '2026-10-15T10:00' });
  });
});

describe('revisão semanal', () => {
  it('semana ISO', () => {
    expect(isoWeek('2026-10-15')).toEqual({ year: 2026, week: 42, monday: '2026-10-12', sunday: '2026-10-18' });
    expect(isoWeek('2027-01-01')).toMatchObject({ year: 2026, week: 53 });
  });

  it('monta a nota com feitos, atrasos, hábitos, projetos e metas', () => {
    const r = weeklyReview(vault(base).snap());
    expect(r.path).toBe('Revisões/2026-W42.md');
    expect(parseProps(r.text)).toMatchObject({ tipo: 'revisão', semana: '2026-W42' });
    expect(r.text).toContain('# Revisão da semana 42 (12/10 a 18/10)');
    expect(r.text).toContain('## Feito (2)');
    expect(r.text).toContain('- [x] Revisar PR · 13/10 · [[Bancos/Projetos/Tanden|Tanden]]');
    expect(r.text).toContain('- [x] Ligar pro banco · 12/10 (em [[Lembretes|Lembretes]])');
    expect(r.text).toContain('## Atrasado (1)\n- [ ] Escrever testes');
    expect(r.text).toMatch(/\| Exercício \| ● ● ● ○ \| 3 \| 10% \|/);
    expect(r.text).toContain('- [[Bancos/Projetos/Tanden|Tanden]] · Ativo · 50% · próximo: Escrever testes · ⚠ 1 atrasada');
    expect(r.text).toContain('- [[Bancos/Metas/Ler 12 livros|Ler 12 livros]] · 25% (3/12 livros) · até 31/12');
    expect(r.text).not.toContain('Antigo');
  });
});
