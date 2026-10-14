import { describe, expect, it } from 'vitest';
import {
  PROFILES, arrows, backlinks, bodyOf, entityTemplate, fighterTemplate, fightIndex, formatTable, frameNum, getSection,
  importFrames, mergeFrames, parseProps, parseTable, parseWorldDate, profileFor, punishers, readCombos, readFrames,
  renameProp, safety, setProp, setProps, setSection, timeline, tokenize, wikiLinks, withBody, worldIndex, writeCombos,
  writeFrames, type FrameRow,
} from '../src/index';

describe('propriedades (frontmatter)', () => {
  const note = `---
tipo: personagem
mundo: Aerth
# comentário que deve ficar
afiliação: "[[Ordem do Sol]]"
apelidos:
  - Lâmina
  - "O Último: rei"
tags: [heroi, "linha: 1"]
---
# Kael
`;
  it('lê texto, listas em bloco e listas [a, b]', () => {
    const p = parseProps(note);
    expect(p['tipo']).toBe('personagem');
    expect(p['afiliação']).toBe('[[Ordem do Sol]]');
    expect(p['apelidos']).toEqual(['Lâmina', 'O Último: rei']);
    expect(p['tags']).toEqual(['heroi', 'linha: 1']);
  });
  it('muda uma propriedade sem tocar nas outras linhas', () => {
    const out = setProp(note, 'mundo', 'Terra Média');
    expect(out).toContain('# comentário que deve ficar');
    expect(out).toContain('mundo: Terra Média');
    expect(out.split('\n').length).toBe(note.split('\n').length);
    expect(parseProps(out)['apelidos']).toEqual(['Lâmina', 'O Último: rei']);
  });
  it('troca lista por texto, apaga e acrescenta, com as aspas certas', () => {
    let out = setProps(note, { apelidos: null, local: '[[Vale]]', idade: '-50', nota: 'a: b' });
    const p = parseProps(out);
    expect(p['apelidos']).toBeUndefined();
    expect(p['local']).toBe('[[Vale]]');
    expect(p['idade']).toBe('-50');
    expect(p['nota']).toBe('a: b');
    expect(out).toContain('local: "[[Vale]]"');
    out = setProp(out, 'envolvidos', ['[[A]]', '[[B]]']);
    expect(parseProps(out)['envolvidos']).toEqual(['[[A]]', '[[B]]']);
    expect(bodyOf(out)).toBe('# Kael\n');
  });
  it('cria o topo numa nota que não tem, e o remove quando fica vazio', () => {
    const out = setProp('# Oi\n', 'tipo', 'lugar');
    expect(out).toBe('---\ntipo: lugar\n---\n# Oi\n');
    expect(setProp(out, 'tipo', null)).toBe('# Oi\n');
  });
  it('renomeia a chave mantendo a posição', () => {
    const out = renameProp(note, 'mundo', 'universo');
    expect(parseProps(out)['universo']).toBe('Aerth');
    expect(Object.keys(parseProps(out)).indexOf('universo')).toBe(1);
  });
  it('troca o corpo sem perder o topo', () => {
    expect(withBody(note, 'novo')).toBe(note.replace('# Kael\n', 'novo'));
  });
});

describe('seções e tabelas', () => {
  it('lê e escreve uma seção no lugar, e cria no fim quando falta', () => {
    const t = '# A\n\n## Combos\n\nvelho\n\n## Notas\n\nfica\n';
    expect(getSection(t, 'combos')!.trim()).toBe('velho');
    const out = setSection(t, 'Combos', 'novo');
    expect(out).toBe('# A\n\n## Combos\n\nnovo\n\n## Notas\n\nfica\n');
    expect(setSection('# A\n', 'Matchups', 'x')).toBe('# A\n\n## Matchups\n\nx\n');
  });
  it('não confunde título dentro de bloco de código', () => {
    const t = '## Notas\n\n```\n## Combos\n```\n\n## Combos\n\nreal\n';
    expect(getSection(t, 'Combos')!.trim()).toBe('real');
  });
  it('tabela com | escapado e código', () => {
    const t = parseTable('| A | B |\n|---|:-:|\n| x \\| y | `a|b` |\n')!;
    expect(t.rows[0]).toEqual(['x | y', '`a|b`']);
    expect(parseTable(formatTable({ header: ['A', 'B'], rows: [['x | y', 'z']] }))!.rows[0]).toEqual(['x | y', 'z']);
  });
  it('mantém colunas criadas à mão e o texto em volta da tabela', () => {
    const t = `## Combos\n\nFrase antes.\n\n| Combo | Minha coluna | Dano |\n| - | - | - |\n| 2LP | a | 100 |\n| 5HP | b | 200 |\n\nDepois.\n`;
    const rows = readCombos(t);
    expect(rows.map((r) => r.combo)).toEqual(['2LP', '5HP']);
    // apaga a primeira e edita a segunda: "b" continua com o 5HP
    const out = writeCombos(t, [{ ...rows[1]!, dano: '250' }]);
    const back = parseTable(getSection(out, 'Combos')!)!;
    expect(back.header).toEqual(['Combo', 'Minha coluna', 'Dano', 'Barra', 'Situação', 'Notas']);
    expect(back.rows).toEqual([['5HP', 'b', '250', '', '', '']]);
    expect(out).toContain('Frase antes.');
    expect(out).toContain('Depois.');
  });
});

describe('notação de luta', () => {
  const kinds = (s: string, p = PROFILES.sf) => tokenize(s, p).map((t) => {
    switch (t.k) {
      case 'dir': return `d${t.d}${t.hold ? 'H' : ''}`;
      case 'motion': return `m${t.d}`;
      case 'charge': return `c${t.d}`;
      case 'btn': return t.b.id;
      case 'sep': return t.s;
      case 'mod': return `(${t.t})`;
      case 'sys': return `<${t.t}>`;
      case 'rep': return `x${t.n}`;
      case 'txt': return `"${t.t}"`;
    }
  });

  it('numpad do Street Fighter', () => {
    expect(kinds('2MK xx 236HP')).toEqual(['d2', 'MK', 'xx', 'm236', 'HP']);
    expect(kinds('cr.MK > st.HP, j.HK')).toEqual(['d2', 'MK', '>', 'd5', 'HP', ',', '(pulo)', 'HK']);
    expect(kinds('[4]6PP xx VT1')).toEqual(['c4', 'd6', 'PP', 'xx', '<VT1>']);
    expect(kinds('qcf+LP')).toEqual(['m236', '+', 'LP']);
    expect(kinds('5LPx2')).toEqual(['d5', 'LP', 'x2']);
    expect(kinds('2MKxx236HP')).toEqual(['d2', 'MK', 'xx', 'm236', 'HP']);
    expect(kinds('360P')).toEqual(['m360', 'P']);
  });
  it('palavras soltas viram texto, sem roubar botões', () => {
    expect(kinds('5HP (Perto) dash')).toEqual(['d5', 'HP', '"("', '"Perto"', '")"', '<dash>']);
  });
  it('Guilty Gear: c. é perto, f. é longe, HS ganha de H', () => {
    expect(kinds('c.S > f.S > 2HS xx 236K RC', PROFILES.gg)).toEqual(['(perto)', 'S', '>', '(longe)', 'S', '>', 'd2', 'HS', 'xx', 'm236', 'K', '<RC>']);
  });
  it('Tekken: letras são direções, maiúscula segura, números são botões', () => {
    expect(kinds('d/f+1, 2', PROFILES.tekken)).toEqual(['d3', '+', '1', ',', '2']);
    expect(kinds('f,F+2 ws4', PROFILES.tekken)).toEqual(['d6', ',', 'd6H', '+', '2', '<WS>', '4']);
  });
  it('vira setas para texto puro', () => {
    expect(arrows('2MK xx 236HP')).toBe('↓MK ⟶ ↓↘→HP');
  });
  it('perfil pela nota do jogo e botões próprios', () => {
    expect(profileFor('Street Fighter 6').notation).toBe('sf');
    expect(profileFor('Tekken 8').notation).toBe('tekken');
    expect(profileFor('GGST').notation).toBe('gg');
    const p = profileFor('Meu jogo', { notação: 'livre', botões: ['A', 'B', 'C', 'D'] });
    expect(p.buttons.map((x) => x.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(kinds('236C', p)).toEqual(['m236', 'C']);
  });
});

describe('frame data', () => {
  it('lê números de frames', () => {
    expect(frameNum('+3')).toBe(3);
    expect(frameNum('−6')).toBe(-6);
    expect(frameNum('-2~+1', true)).toBe(-2);
    expect(frameNum('KD +30')).toBe(30);
    expect(frameNum('—')).toBeNull();
  });
  it('classifica o risco no bloqueio pelo jogo', () => {
    expect(safety('+2')).toBe('vantagem');
    expect(safety('-3')).toBe('seguro');
    expect(safety('-4')).toBe('punivel');
    expect(safety('-9', PROFILES.tekken)).toBe('seguro');
    expect(safety('-10', PROFILES.tekken)).toBe('punivel');
  });
  it('acha punições pelo startup', () => {
    const mine = [
      { golpe: 'Jab', startup: '3', dano: '30' },
      { golpe: 'Shoryu', startup: '3', dano: '150' },
      { golpe: 'Lento', startup: '9', dano: '200' },
    ] as FrameRow[];
    expect(punishers('-6', mine).map((r) => r.golpe)).toEqual(['Shoryu', 'Jab']);
    expect(punishers('+1', mine)).toEqual([]);
  });
  it('importa CSV em inglês e junta com o que existe', () => {
    const csv = 'Move,numCmd,Damage,Startup,Active,Recovery,On Block,On Hit,Extra\nStand LP,5LP,30,3,2,7,+2,+4,x\n"Tanden, Engine",236HP,"100",14,3,20,-6,KD,\n';
    const imp = importFrames(csv);
    expect(imp.ignored).toEqual(['Extra']);
    expect(imp.rows[1]!.golpe).toBe('Tanden, Engine');
    expect(imp.rows[1]!.bloqueio).toBe('-6');
    const note = writeFrames(fighterTemplate('Seth', 'SF5'), [{ golpe: 'Stand LP', comando: '5LP', dano: '', startup: '4', ativo: '', recuperacao: '', bloqueio: '', hit: '', notas: 'minha nota' }]);
    const merged = mergeFrames(readFrames(note), imp.rows);
    expect(merged.updated).toBe(1);
    expect(merged.added).toBe(1);
    expect(merged.rows[0]!.startup).toBe('3');
    expect(merged.rows[0]!.notas).toBe('minha nota');
  });
  it('TSV colado de uma tabela da web, com cabeçalho em português', () => {
    const imp = importFrames('Golpe\tStartup\tBloqueio\n5MK\t5\t-1\n');
    expect(imp.rows).toHaveLength(1);
    expect(imp.rows[0]!.golpe).toBe('5MK');
  });
});

describe('índice de jogos de luta', () => {
  it('agrupa personagens por jogo, pela propriedade ou pela pasta', () => {
    const seth = writeCombos(fighterTemplate('Seth', 'SF5'), [{ combo: '2LP > 2LP xx 214LP', dano: '', barra: '', situacao: '', notas: '' }]);
    const games = fightIndex([
      { path: 'Luta/SF5/SF5.md', text: '---\ntipo: jogo\nnotação: sf\n---\n' },
      { path: 'Luta/SF5/Seth.md', text: seth },
      { path: 'Luta/Tekken 8/Kazuya.md', text: '---\ntipo: lutador\n---\n' },
      { path: 'Outra.md', text: '# nada' },
    ]);
    expect(games.map((g) => g.name)).toEqual(['SF5', 'Tekken 8']);
    expect(games[0]!.path).toBe('Luta/SF5/SF5.md');
    expect(games[0]!.fighters[0]!.combos).toBe(1);
    expect(games[1]!.profile.notation).toBe('tekken');
  });
});

describe('world building', () => {
  const notes = [
    { path: 'Mundos/Aerth/Aerth.md', text: '---\ntipo: mundo\n---\n# Aerth\n' },
    { path: 'Mundos/Aerth/Personagens/Kael.md', text: '---\ntipo: personagem\nmundo: Aerth\nafiliação: "[[Ordem do Sol]]"\nnascimento: 312\nmorte: 380\n---\n# Kael\n\nNasceu no [[Vale Cinzento|vale]] e odeia a [[Ordem do Sol]].\n' },
    { path: 'Mundos/Aerth/Facções/Ordem do Sol.md', text: '---\ntipo: Facção\nmundo: "[[Aerth]]"\nfundação: 50 a.C.\naliases: [Ordem]\n---\nUma ordem antiga.\n' },
    { path: 'Mundos/Aerth/Eventos/Queda.md', text: '---\ntipo: evento\nmundo: Aerth\ndata: 12/03/340\nenvolvidos:\n  - "[[Kael]]"\n  - "[[Ordem]]"\n---\n' },
    { path: 'Mundos/Aerth/Lugares/Vale Cinzento.md', text: '---\ntipo: lugar\n---\n# Vale\n' },
  ];
  const [w] = worldIndex(notes);
  it('acha mundo e entidades (tipo normalizado, mundo por link ou pela pasta)', () => {
    expect(w!.name).toBe('Aerth');
    expect(w!.path).toBe('Mundos/Aerth/Aerth.md');
    expect(w!.entities.map((e) => `${e.name}:${e.type}`)).toEqual(['Kael:personagem', 'Ordem do Sol:faccao', 'Queda:evento', 'Vale Cinzento:lugar']);
    expect(w!.entities.find((e) => e.name === 'Ordem do Sol')!.summary).toBe('Uma ordem antiga.');
  });
  it('propriedades viram ligações com nome; links no texto viram "menciona", sem repetir', () => {
    const kael = w!.entities.find((e) => e.name === 'Kael')!;
    expect(kael.relations.map((r) => `${r.label}→${r.to}`)).toEqual([
      'afiliação→Mundos/Aerth/Facções/Ordem do Sol.md',
      'menciona→Mundos/Aerth/Lugares/Vale Cinzento.md',
    ]);
    // apelido resolve
    expect(backlinks(w!, 'Mundos/Aerth/Facções/Ordem do Sol.md').map((r) => r.label)).toEqual(['afiliação', 'envolvidos']);
  });
  it('linha do tempo com datas inventadas', () => {
    expect(parseWorldDate('342')).toBe(342);
    expect(parseWorldDate('50 a.C.')).toBe(-50);
    expect(parseWorldDate('Ano -7')).toBe(-7);
    expect(parseWorldDate('342-07')).toBeCloseTo(342.5);
    expect(parseWorldDate('era das cinzas')).toBeNull();
    const t = timeline(w!);
    expect(t.map((x) => x.name)).toEqual(['Ordem do Sol', 'Kael', 'Queda']);
    expect(t[1]!.end).toBe(380);
  });
  it('modelo de entidade já é reconhecido pelo índice', () => {
    const text = entityTemplate('Mira', 'Aerth', 'personagem');
    const [x] = worldIndex([{ path: 'Mundos/Aerth/Personagens/Mira.md', text }]);
    expect(x!.entities[0]!.type).toBe('personagem');
    expect(parseProps(text)['espécie']).toBe('');
  });
  it('wikiLinks ignora apelido e seção', () => {
    expect(wikiLinks('[[A|x]] [[B#y]] ![[C]] [[A]]')).toEqual(['A', 'B', 'C']);
  });
});
