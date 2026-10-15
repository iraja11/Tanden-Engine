import { describe, expect, it } from 'vitest';
import {
  addFlashcardTag, appendCard, cardMarkdown, deckStats, flashcardDeck, forecast, formatSched, intervalLabel, nextSched,
  parseFlashcards, parseSched, studyQueue, writeSched, type Flashcard,
} from '../src/index';

const DAY = '2026-10-15';

const NOTE = `---
tags: [estudo, flashcards/idiomas/inglês]
---
# Vocabulário

Apple::Maçã
- Dog:::Cachorro <!--SR:!2026-10-14,3,250!2026-10-20,6,270-->

## Frases

Como se diz "bom dia"?
?
Good morning
(formal)

A capital da França é ==Paris== e a da Itália é ==Roma==.
<!--SR:!2026-10-10,4,230-->

\`\`\`js
const a = b::c;
?
\`\`\`

Texto comum sem cartão.
`;

describe('leitura dos cartões', () => {
  it('só lê notas com a tag e tira o baralho dela', () => {
    expect(parseFlashcards('a.md', 'Apple::Maçã')).toEqual([]);
    expect(flashcardDeck('Pasta/Biologia.md', '#flashcards\n\nCélula::unidade')).toBe('Biologia');
    expect(flashcardDeck('x.md', NOTE)).toBe('idiomas/inglês');
    expect(flashcardDeck('x.md', 'fala de flashcards sem tag')).toBeNull();
  });

  it('reconhece linha, invertido, várias linhas e lacunas', () => {
    const cards = parseFlashcards('Inglês.md', NOTE);
    expect(cards.map((c) => c.kind)).toEqual(['linha', 'linha', 'multilinha', 'lacuna']);
    const [apple, dog, multi, cloze] = cards as [Flashcard, Flashcard, Flashcard, Flashcard];
    expect(apple.sides).toEqual([{ front: 'Apple', back: 'Maçã', sched: null }]);
    expect(apple.context).toEqual(['Vocabulário']);
    expect(dog.sides.map((s) => [s.front, s.back])).toEqual([['Dog', 'Cachorro'], ['Cachorro', 'Dog']]);
    expect(dog.sides[0]!.sched).toEqual({ due: '2026-10-14', interval: 3, ease: 250 });
    expect(dog.sides[1]!.sched).toEqual({ due: '2026-10-20', interval: 6, ease: 270 });
    expect(multi.sides[0]!.front).toBe('Como se diz "bom dia"?');
    expect(multi.sides[0]!.back).toBe('Good morning\n(formal)');
    expect(multi.context).toEqual(['Vocabulário', 'Frases']);
    expect(cloze.sides).toHaveLength(2);
    expect(cloze.sides[0]!.front).toBe('A capital da França é ==[…]== e a da Itália é Roma.');
    expect(cloze.sides[0]!.back).toBe('A capital da França é ==Paris== e a da Itália é Roma.');
    expect(cloze.sides[1]!.front).toBe('A capital da França é Paris e a da Itália é ==[…]==.');
    expect(cloze.sides[0]!.sched?.interval).toBe(4);
    expect(cloze.sides[1]!.sched).toBeNull();
  });

  it('ignora código, :: vazio e o próprio topo', () => {
    const t = '---\ntags: flashcards\nlink:: x\n---\n`a::b` no código\n::sem frente\nsem verso::\n';
    expect(parseFlashcards('x.md', t)).toEqual([]);
  });

  it('cartão de uma linha com o agendamento na linha de baixo (padrão do plugin)', () => {
    const t = '#flashcards\n\nQ::A\n<!--SR:!2026-10-01,2,250-->\n';
    const [c] = parseFlashcards('x.md', t);
    expect(c!.sides[0]!.sched?.due).toBe('2026-10-01');
    expect(c!.schedInline).toBe(false);
  });

  it('data fictícia do plugin conta como novo', () => {
    expect(parseSched('<!--SR:!2000-01-01,1,250!2026-01-02,5,240-->')).toEqual([null, { due: '2026-01-02', interval: 5, ease: 240 }]);
    expect(formatSched([null, { due: '2026-01-02', interval: 5, ease: 240 }, null])).toBe('<!--SR:!2000-01-01,1,250!2026-01-02,5,240-->');
    expect(formatSched([null, null])).toBe('');
  });
});

describe('gravar o agendamento', () => {
  const s = { due: '2026-10-18', interval: 3, ease: 250 };

  it('cartão de uma linha ganha o comentário no fim da linha', () => {
    const t = '#flashcards\n\nApple::Maçã\nOutro::Ok\n';
    const [apple] = parseFlashcards('x.md', t);
    const out = writeSched(t, 'x.md', apple!, 0, s)!;
    expect(out).toBe('#flashcards\n\nApple::Maçã <!--SR:!2026-10-18,3,250-->\nOutro::Ok\n');
    const again = parseFlashcards('x.md', out);
    expect(again[0]!.sides[0]!.sched).toEqual(s);
    expect(again[1]!.sides[0]!.sched).toBeNull();
  });

  it('várias linhas e lacunas ganham uma linha própria, e trocar só mexe no comentário', () => {
    const t = '#flashcards\n\nPergunta\n?\nResposta\n\nfim\n';
    const [c] = parseFlashcards('x.md', t);
    const out = writeSched(t, 'x.md', c!, 0, s)!;
    expect(out).toBe('#flashcards\n\nPergunta\n?\nResposta\n<!--SR:!2026-10-18,3,250-->\n\nfim\n');
    const [c2] = parseFlashcards('x.md', out);
    const out2 = writeSched(out, 'x.md', c2!, 0, { due: '2026-10-25', interval: 7, ease: 250 })!;
    expect(out2).toContain('Resposta\n<!--SR:!2026-10-25,7,250-->\n\nfim');
    // voltar a novo (desfazer) tira o comentário
    const [c3] = parseFlashcards('x.md', out2);
    expect(writeSched(out2, 'x.md', c3!, 0, null)).toBe(t);
  });

  it('segundo lado de um invertido novo usa a data fictícia no primeiro', () => {
    const t = '#flashcards\n\nDog:::Cachorro\n';
    const [c] = parseFlashcards('x.md', t);
    expect(writeSched(t, 'x.md', c!, 1, s)).toBe('#flashcards\n\nDog:::Cachorro <!--SR:!2000-01-01,1,250!2026-10-18,3,250-->\n');
  });

  it('acha o cartão mesmo se a nota mudou em volta, e recusa se o cartão mudou', () => {
    const t = '#flashcards\n\nApple::Maçã\n';
    const [c] = parseFlashcards('x.md', t);
    const moved = '#flashcards\n\nNovo::Cartão\n\nApple::Maçã\n';
    expect(writeSched(moved, 'x.md', c!, 0, s)).toBe('#flashcards\n\nNovo::Cartão\n\nApple::Maçã <!--SR:!2026-10-18,3,250-->\n');
    expect(writeSched('#flashcards\n\nApple::Maçã verde\n', 'x.md', c!, 0, s)).toBeNull();
  });

  it('o comentário fica escondido do que aparece no cartão', () => {
    const t = '#flashcards\n\nApple::Maçã <!--SR:!2026-10-18,3,250-->\n';
    const [c] = parseFlashcards('x.md', t);
    expect(c!.sides[0]!.back).toBe('Maçã');
    expect(c!.source).toBe('Apple::Maçã');
  });
});

describe('agendamento', () => {
  it('cartão novo', () => {
    expect(nextSched(null, 0, DAY)).toEqual({ due: '2026-10-16', interval: 1, ease: 250 });
    expect(nextSched(null, 2, DAY)).toEqual({ due: '2026-10-17', interval: 2, ease: 250 });
    expect(nextSched(null, 3, DAY)).toEqual({ due: '2026-10-19', interval: 4, ease: 265 });
  });

  it('revisão em dia', () => {
    const prev = { due: DAY, interval: 10, ease: 250 };
    expect(nextSched(prev, 0, DAY)).toEqual({ due: '2026-10-16', interval: 1, ease: 230 });
    expect(nextSched(prev, 1, DAY)).toEqual({ due: '2026-10-27', interval: 12, ease: 235 });
    expect(nextSched(prev, 2, DAY)).toEqual({ due: '2026-11-09', interval: 25, ease: 250 });
    expect(nextSched(prev, 3, DAY).interval).toBe(33);
  });

  it('atraso conta a favor, facilidade tem piso e intervalo sempre cresce', () => {
    const late = nextSched({ due: '2026-10-05', interval: 10, ease: 250 }, 2, DAY);
    expect(late.interval).toBe(38);
    expect(nextSched({ due: DAY, interval: 1, ease: 130 }, 0, DAY).ease).toBe(130);
    const ordered = [1, 2, 3].map((g) => nextSched({ due: DAY, interval: 1, ease: 130 }, g as 1 | 2 | 3, DAY).interval);
    expect(ordered[0]).toBeLessThan(ordered[1]!);
    expect(ordered[1]).toBeLessThan(ordered[2]!);
  });

  it('rótulos de intervalo', () => {
    expect(['1d', '13d', '3 sem', '4 m', '1,5 a']).toEqual([1, 13, 21, 120, 548].map(intervalLabel));
  });
});

describe('sessão e números', () => {
  const t = (deck: string, body: string) => `#flashcards/${deck}\n\n${body}\n`;
  const cards = [
    ...parseFlashcards('a.md', t('idiomas/inglês', 'A::1 <!--SR:!2026-10-10,3,250-->\nB::2 <!--SR:!2026-10-14,3,250-->\nC::3 <!--SR:!2026-11-01,30,250-->\nD::4\nE::5')),
    ...parseFlashcards('b.md', t('idiomas/espanhol', 'F:::6 <!--SR:!2026-10-12,3,250!2026-10-13,3,250-->\nG:::7')),
    ...parseFlashcards('c.md', t('física', 'H::8')),
  ];

  it('vencidos primeiro (mais atrasado antes), um lado por grupo, depois novos até o limite', () => {
    const q = studyQueue(cards, DAY, { newLimit: 2 });
    expect(q.map((i) => `${i.card.sides[i.side]!.front}`)).toEqual(['A', 'F', 'B', 'D', 'E']);
    const idiomas = studyQueue(cards, DAY, { deck: 'idiomas' });
    expect(idiomas.map((i) => i.card.sides[i.side]!.front)).toEqual(['A', 'F', 'B', 'D', 'E', 'G']);
    expect(studyQueue(cards, DAY, { deck: 'Física' }).map((i) => i.card.path)).toEqual(['c.md']);
  });

  it('o outro lado de um cartão respondido hoje fica para amanhã', () => {
    const t = '#flashcards\n\nG:::7 <!--SR:!2026-10-17,2,250-->\nH:::8 <!--SR:!2000-01-01,1,250!2026-10-10,3,250-->\n';
    const c = parseFlashcards('d.md', t);
    // G foi respondido hoje (17 - 2 = 15); H, há dias: o lado novo de H pode entrar
    expect(studyQueue(c, DAY).map((i) => `${i.card.sides[i.side]!.front}${i.side}`)).toEqual(['81']);
    expect(studyQueue(c, '2026-10-16').map((i) => `${i.card.sides[i.side]!.front}${i.side}`)).toEqual(['81', '71']);
  });

  it('números por baralho e previsão', () => {
    const s = deckStats(cards, DAY);
    expect(s.map((d) => [d.deck, d.total, d.fresh, d.due, d.mature])).toEqual([
      ['física', 1, 1, 0, 0],
      ['idiomas/espanhol', 4, 2, 2, 0],
      ['idiomas/inglês', 5, 2, 2, 1],
    ]);
    expect(forecast(cards, DAY, 3)).toEqual([4, 0, 0]);
    expect(forecast(cards, '2026-10-30', 3)).toEqual([4, 0, 1]);
  });
});

describe('criar cartões', () => {
  it('põe a tag sem duplicar', () => {
    expect(addFlashcardTag('# Nota\n')).toContain('flashcards');
    const once = addFlashcardTag('---\ntags: [estudo]\n---\n# Nota\n');
    expect(flashcardDeck('Nota.md', once)).toBe('Nota');
    expect(addFlashcardTag(once)).toBe(once);
    expect(addFlashcardTag('#flashcards\nx')).toBe('#flashcards\nx');
    expect(flashcardDeck('x.md', addFlashcardTag('# x\n', 'Bio celular'))).toBe('Bio-celular');
  });

  it('escolhe o formato e acrescenta no fim', () => {
    expect(cardMarkdown('Q', 'A')).toBe('Q::A');
    expect(cardMarkdown('Q', 'A', true)).toBe('Q:::A');
    expect(cardMarkdown('Q', 'linha 1\nlinha 2')).toBe('Q\n?\nlinha 1\nlinha 2');
    expect(appendCard('#flashcards\n\nX::Y\n', 'Q::A')).toBe('#flashcards\n\nX::Y\n\nQ::A\n');
    const added = appendCard(addFlashcardTag(''), cardMarkdown('Q', 'a\nb', true));
    expect(parseFlashcards('n.md', added)[0]!.sides).toHaveLength(2);
  });
});
