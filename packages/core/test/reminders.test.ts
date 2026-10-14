import { describe, expect, it } from 'vitest';
import {
  MemoryStorage,
  Vault,
  appendReminder,
  completeIn,
  firedKey,
  formatAt,
  nextOccurrence,
  parseQuickReminder,
  parseReminders,
  plan,
  reminderLine,
  rescheduleIn,
} from '../src/index';

// quarta-feira, 14/10/2026, 20:40
const NOW = new Date(2026, 9, 14, 20, 40).getTime();
const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const quick = (s: string) => {
  const q = parseQuickReminder(s, NOW);
  return q && { text: q.text, at: formatAt(q.at), repeat: q.repeat };
};

describe('lembretes: leitura nas notas', () => {
  const note = [
    '# Coisas',
    '- [ ] Comprar pão (@2026-10-15 09:30)',
    '- [x] Pagar luz (@2026-10-10)',
    '- [ ] Relatório ⏫ 📅 2026-10-20',
    '  * [ ] Academia 🔁 every week on Monday, Thursday (@2026-10-15 07:30)',
    '- [ ] Tarefa sem data',
    'Texto com (@2026-10-15 10:00) fora de tarefa',
  ].join('\n');
  const rs = parseReminders('casa.md', note);

  it('acha só tarefas com data, nos formatos do Obsidian', () => {
    expect(rs.map((r) => r.text)).toEqual(['Comprar pão', 'Pagar luz', 'Relatório', 'Academia']);
    expect(rs[0]!.at).toBe(at(2026, 10, 15, 9, 30));
    expect(rs[1]!.done).toBe(true);
    expect(rs[1]!.at).toBe(at(2026, 10, 10, 9)); // sem hora: 09:00
    expect(rs[2]!.priority).toBe(3);
    expect(rs[3]!.repeat).toEqual({ every: 1, unit: 'week', weekdays: [1, 4] });
    expect(rs[3]!.line).toBe(4);
  });

  it('chave não muda ao adiar', () => {
    const later = rescheduleIn(note, rs[0]!, at(2026, 10, 15, 11));
    const again = parseReminders('casa.md', later);
    expect(again[0]!.key).toBe(rs[0]!.key);
    expect(again[0]!.at).toBe(at(2026, 10, 15, 11));
    expect(later.split('\n')[1]).toBe('- [ ] Comprar pão (@2026-10-15 11:00)');
  });

  it('adiar uma linha só com 📅 acrescenta (@...) e mantém a data do Tasks', () => {
    const later = rescheduleIn(note, rs[2]!, at(2026, 10, 21, 14));
    expect(later.split('\n')[3]).toBe('- [ ] Relatório ⏫ 📅 2026-10-20 (@2026-10-21 14:00)');
    expect(parseReminders('casa.md', later)[2]!.at).toBe(at(2026, 10, 21, 14));
  });

  it('concluir risca; repetido avança para a próxima ocorrência', () => {
    const done = completeIn(note, rs[0]!, NOW);
    expect(done.split('\n')[1]).toBe('- [x] Comprar pão (@2026-10-15 09:30)');
    const rep = completeIn(note, rs[3]!, NOW);
    // quinta 15/10 7:30 → segunda 19/10 7:30
    expect(rep.split('\n')[4]).toBe('  * [ ] Academia 🔁 every week on Monday, Thursday (@2026-10-19 07:30)');
  });

  it('recusa editar se a linha mudou', () => {
    const changed = note.replace('Comprar pão', 'Comprar pão francês');
    expect(() => completeIn(changed, rs[0]!)).toThrow(/mudou/);
  });

  it('acrescenta na nota de lembretes', () => {
    const line = reminderLine('Ligar pro dentista', at(2026, 10, 16, 14), { every: 1, unit: 'month' });
    expect(line).toBe('- [ ] Ligar pro dentista 🔁 every month (@2026-10-16 14:00)');
    expect(appendReminder('', line)).toBe(`# Lembretes\n\n${line}\n`);
    expect(appendReminder('# L\n- [ ] a (@2026-10-15)', line)).toBe(`# L\n- [ ] a (@2026-10-15)\n${line}\n`);
  });
});

describe('lembretes: repetição', () => {
  it('mensal no dia 31 respeita meses curtos', () => {
    expect(formatAt(nextOccurrence(at(2026, 1, 31), { every: 1, unit: 'month' }, at(2026, 1, 31)))).toBe('2026-02-28 09:00');
  });
  it('pula ocorrências perdidas até depois de agora', () => {
    expect(formatAt(nextOccurrence(at(2026, 10, 1, 8), { every: 1, unit: 'day' }, NOW))).toBe('2026-10-15 08:00');
  });
  it('dias úteis', () => {
    // sexta 16/10 → segunda 19/10
    const r = { every: 1, unit: 'week' as const, weekdays: [1, 2, 3, 4, 5] };
    expect(formatAt(nextOccurrence(at(2026, 10, 16, 7), r, at(2026, 10, 16, 7)))).toBe('2026-10-19 07:00');
  });
  it('a cada 2 semanas, às segundas', () => {
    const r = { every: 2, unit: 'week' as const, weekdays: [1] };
    expect(formatAt(nextOccurrence(at(2026, 10, 12, 7), r, at(2026, 10, 12, 7)))).toBe('2026-10-26 07:00');
  });
});

describe('lembretes: quando avisar', () => {
  const rs = parseReminders(
    'a.md',
    [
      '- [ ] Agora (@2026-10-14 20:40)',
      '- [ ] Perdido há pouco (@2026-10-14 18:00)',
      '- [ ] Muito antigo (@2026-10-01 18:00)',
      '- [ ] Futuro (@2026-10-14 22:00)',
      '- [x] Feito (@2026-10-14 20:00)',
    ].join('\n'),
  );

  it('avisa o que venceu (incluindo perdidos recentes) e diz quando acordar', () => {
    const p = plan(rs, NOW, new Set());
    expect(p.due.map((r) => r.text)).toEqual(['Perdido há pouco', 'Agora']);
    expect(p.nextAt).toBe(at(2026, 10, 14, 22));
  });

  it('não repete aviso já mostrado neste aparelho, mas avisa de novo se adiado', () => {
    const fired = new Set([firedKey(rs[0]!), firedKey(rs[1]!)]);
    expect(plan(rs, NOW, fired).due).toEqual([]);
    const snoozed = { ...rs[0]!, at: rs[0]!.at + 600_000 };
    expect(plan([snoozed], NOW + 600_000, fired).due).toHaveLength(1);
  });
});

describe('lembretes: sincronizam pelo cofre', () => {
  it('concluir no celular some do PC no próximo sync', async () => {
    const drive = new MemoryStorage();
    const pc = new Vault(drive, 'arch');
    const phone = new Vault(drive, 'redmi');
    pc.create('Lembretes.md', appendReminder('', reminderLine('Buscar encomenda', at(2026, 10, 15, 10))));
    await pc.sync();
    await phone.sync();
    const [r] = parseReminders('Lembretes.md', phone.read('Lembretes.md'));
    phone.write('Lembretes.md', completeIn(phone.read('Lembretes.md'), r!, NOW));
    // ao mesmo tempo, o PC acrescenta outro lembrete
    pc.write('Lembretes.md', appendReminder(pc.read('Lembretes.md'), reminderLine('Pagar boleto', at(2026, 10, 16))));
    await phone.sync();
    await pc.sync();
    await phone.sync();
    const fromPc = parseReminders('Lembretes.md', pc.read('Lembretes.md'));
    expect(fromPc.map((x) => [x.text, x.done])).toEqual([
      ['Buscar encomenda', true],
      ['Pagar boleto', false],
    ]);
    expect(phone.read('Lembretes.md')).toBe(pc.read('Lembretes.md'));
  });
});

describe('captura rápida em português', () => {
  it.each([
    ['amanhã 9h comprar pão', 'Comprar pão', '2026-10-15 09:00'],
    ['comprar pão amanhã às 9h30', 'Comprar pão', '2026-10-15 09:30'],
    ['em 20 min tirar o bolo', 'Tirar o bolo', '2026-10-14 21:00'],
    ['daqui a 2 horas ligar pra mãe', 'Ligar pra mãe', '2026-10-14 22:40'],
    ['em meia hora reunião', 'Reunião', '2026-10-14 21:10'],
    ['sexta 18:30 jogar SF5 com a galera', 'Jogar SF5 com a galera', '2026-10-16 18:30'],
    ['na quarta que vem dentista', 'Dentista', '2026-10-21 09:00'],
    ['15/11 aniversário da Ana', 'Aniversário da Ana', '2026-11-15 09:00'],
    ['01/02 renovar matrícula', 'Renovar matrícula', '2027-02-01 09:00'],
    ['dia 20 pagar cartão', 'Pagar cartão', '2026-10-20 09:00'],
    ['8h tomar remédio', 'Tomar remédio', '2026-10-15 08:00'],
    ['22h desligar o PC', 'Desligar o PC', '2026-10-14 22:00'],
    ['me lembre de regar as plantas amanhã de tarde', 'Regar as plantas', '2026-10-15 15:00'],
    ['amanhã 3 da tarde entrevista', 'Entrevista', '2026-10-15 15:00'],
    ['hoje meio-dia almoço', 'Almoço', '2026-10-14 12:00'], // já passou: a tela avisa,
    ['depois de amanhã 2026 prova', '2026 prova', '2026-10-16 09:00'],
  ])('%s', (input, text, when) => {
    expect(quick(input)).toMatchObject({ text, at: when });
  });

  it('repetições', () => {
    expect(quick('toda segunda 7h30 academia')).toEqual({
      text: 'Academia',
      at: '2026-10-19 07:30',
      repeat: { every: 1, unit: 'week', weekdays: [1] },
    });
    expect(quick('todo dia 8h remédio')).toMatchObject({ at: '2026-10-15 08:00', repeat: { every: 1, unit: 'day' } });
    expect(quick('todos os dias úteis 7h ponto')).toMatchObject({
      text: 'Ponto',
      at: '2026-10-15 07:00',
      repeat: { weekdays: [1, 2, 3, 4, 5] },
    });
    expect(quick('toda terça e quinta 19h inglês')).toMatchObject({
      text: 'Inglês',
      at: '2026-10-15 19:00',
      repeat: { weekdays: [2, 4] },
    });
    expect(quick('dia 5 todo mês pagar aluguel')).toMatchObject({ at: '2026-11-05 09:00', repeat: { unit: 'month' } });
  });

  it('sem data nem hora não é lembrete', () => {
    expect(parseQuickReminder('comprar pão', NOW)).toBeNull();
  });
});
