import { describe, expect, it } from 'vitest';
import {
  CONQUISTAS, ContadorEscrita, GENEROS, GRUPOS, JornadaStore, LIMITE_COLAGEM, MAX_ESCUDOS, NIVEIS_DAS_ERAS, NIVEL_MAX,
  acharGenero, atividadeDoMundo, calcularSequencia, diaLocal, diasCumpridos, eraDe, estadoDoMundo, fundirRegistros, generoDoMundo, gerarMissoes,
  gravarResposta, jaRespondida, lerOraculo, lerRegistro, marcasDoMomento, medirAutor, medirMissao, medirMundo, nivelDe, novasConquistas, parseProps,
  perguntarOraculo, preencher, profundidade, profundidades, registroVazio, roteiroEntrevista, seededRng, somarDias, worldIndex, xpParaNivel,
  type Metricas, type RegistroAparelho,
} from '../src';
import { getSection } from '../src/caderno/markdown';
import { MemoryStorage } from '../src/storage';

const ficha = (nome: string, tipo: string, props = '', corpo = '') => ({
  path: `Mundos/Aerth/${tipo}/${nome}.md`,
  text: `---\ntipo: ${tipo}\nmundo: Aerth\n${props}---\n# ${nome}\n\n${corpo}\n`,
});
const mundoNota = (props = '') => ({ path: 'Mundos/Aerth/Aerth.md', text: `---\ntipo: mundo\n${props}---\n# Aerth\n` });
const mundo = (...notas: Array<{ path: string; text: string }>) => worldIndex([mundoNota(), ...notas])[0]!;
const palavras = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(' ');

describe('gêneros', () => {
  it('cobre os gêneros pedidos, todos completos', () => {
    for (const id of ['fantasia', 'alta-fantasia', 'romantasy', 'cozy', 'super-herois', 'horror-cosmico', 'weird', 'cyberpunk', 'scifi', 'espacial', 'pos-apocalipse', 'steampunk', 'historico', 'contemporaneo', 'livre']) {
      expect(GENEROS.some((g) => g.id === id), id).toBe(true);
    }
    for (const g of GENEROS) {
      expect(g.eras, g.id).toHaveLength(7);
      expect(g.ganchos.length, g.id).toBeGreaterThanOrEqual(6);
      expect(g.reviravoltas.length, g.id).toBeGreaterThanOrEqual(5);
      expect(g.complicacoes.length, g.id).toBeGreaterThanOrEqual(5);
      expect(g.detalhes.length, g.id).toBeGreaterThanOrEqual(5);
      expect(g.perguntas.length, g.id).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(GENEROS.map((g) => g.id)).size).toBe(GENEROS.length);
  });

  it('reconhece jeitos comuns de escrever o gênero', () => {
    expect(acharGenero('High Fantasy')?.id).toBe('alta-fantasia');
    expect(acharGenero('CYBERPUNK')?.id).toBe('cyberpunk');
    expect(acharGenero('Super-heróis')?.id).toBe('super-herois');
    expect(acharGenero('space opera')?.id).toBe('espacial');
    expect(acharGenero('xyz')).toBeNull();
  });

  it('lê o gênero da nota do mundo, e o padrão é Livre', () => {
    const w = worldIndex([mundoNota('gênero: Cyberpunk\n')])[0]!;
    expect(generoDoMundo(w).id).toBe('cyberpunk');
    expect(generoDoMundo(mundo()).id).toBe('livre');
  });
});

describe('níveis e eras', () => {
  it('a curva sobe sempre e os limites batem', () => {
    for (let n = 2; n <= NIVEL_MAX; n++) expect(xpParaNivel(n)).toBeGreaterThan(xpParaNivel(n - 1));
    expect(nivelDe(0).nivel).toBe(1);
    expect(nivelDe(xpParaNivel(10)).nivel).toBe(10);
    expect(nivelDe(xpParaNivel(10) - 1).nivel).toBe(9);
    expect(nivelDe(1e12).nivel).toBe(NIVEL_MAX);
    expect(nivelDe(1e12).fracao).toBe(1);
  });

  it('cada era começa no nível certo', () => {
    NIVEIS_DAS_ERAS.forEach((n, i) => {
      expect(eraDe(n)).toBe(i);
      if (n > 1) expect(eraDe(n - 1)).toBe(i - 1);
    });
  });

  it('apagar uma ficha tira os pontos dela', () => {
    const a = estadoDoMundo(mundo(ficha('Kael', 'personagem'), ficha('Ivo', 'personagem')));
    const b = estadoDoMundo(mundo(ficha('Kael', 'personagem')));
    expect(b.nivel.xp).toBeLessThan(a.nivel.xp);
  });
});

describe('raridade das fichas', () => {
  it('sobe com profundidade e aponta o caminho', () => {
    expect(profundidade({ score: 0, words: 0 }, 0).raridade).toBe('comum');
    expect(profundidade({ score: 1, words: 500, }, 8).raridade).toBe('lendaria');
    expect(profundidade({ score: 1, words: 500 }, 8).proxima).toBeNull();
    const p = profundidade({ score: 1, words: 500 }, 0);
    expect(p.raridade).toBe('epica');
    expect(p.dica).toContain('Ligue');
  });

  it('conta ligações de ida e de volta, sem repetir', () => {
    const w = mundo(ficha('Kael', 'personagem', 'afiliação: "[[Ordem]]"\n', 'Ver [[Ordem]].'), ficha('Ordem', 'faccao'));
    const p = profundidades(w);
    expect(p.get('Mundos/Aerth/faccao/Ordem.md')?.ligacoes).toBe(1);
    expect(p.get('Mundos/Aerth/personagem/Kael.md')?.ligacoes).toBe(1);
  });
});

describe('sequência clássica', () => {
  const dias = (inicio: string, n: number) => Array.from({ length: n }, (_, i) => somarDias(inicio, i));

  it('conta dias seguidos e hoje ainda não quebra', () => {
    const s = calcularSequencia(new Set(dias('2026-03-01', 3)), '2026-03-04');
    expect(s.atual).toBe(3);
    expect(s.hojeFeito).toBe(false);
  });

  it('perder um dia sem escudo volta a zero', () => {
    const s = calcularSequencia(new Set(['2026-03-01', '2026-03-02', '2026-03-04']), '2026-03-04');
    expect(s.atual).toBe(1);
    expect(s.melhor).toBe(2);
  });

  it('sete dias dão um escudo, que salva um dia perdido', () => {
    const feitos = new Set([...dias('2026-03-01', 7), '2026-03-09']);
    const s = calcularSequencia(feitos, '2026-03-09');
    expect(s.atual).toBe(8);
    expect(s.protegidos).toEqual(['2026-03-08']);
    expect(s.escudos).toBe(0);
  });

  it('guarda no máximo três escudos', () => {
    expect(calcularSequencia(new Set(dias('2026-01-01', 60)), '2026-03-01').escudos).toBe(MAX_ESCUDOS);
  });

  it('mudar a meta depois não reescreve dias já cumpridos', () => {
    const r = registroVazio();
    r.metas['2026-03-01'] = true;
    r.dias['2026-03-01'] = { Aerth: { palavras: 100 } };
    r.ajustes = { meta: 5000, em: 1 };
    expect(diasCumpridos(r).has('2026-03-01')).toBe(true);
  });

  it('atravessa viradas de mês e de ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('contagem de palavras', () => {
  it('não conta o que já estava escrito ao abrir', () => {
    const c = new ContadorEscrita();
    c.abrir('a', 1000);
    expect(c.registrar('a', 1010)).toBe(10);
  });

  it('apagar e redigitar não rende de novo', () => {
    const c = new ContadorEscrita();
    c.abrir('a', 100);
    expect(c.registrar('a', 120)).toBe(20);
    expect(c.registrar('a', 90)).toBe(0);
    expect(c.registrar('a', 120)).toBe(0);
    expect(c.registrar('a', 125)).toBe(5);
  });

  it('colagem grande não conta como escrita', () => {
    const c = new ContadorEscrita();
    c.abrir('a', 0);
    expect(c.registrar('a', LIMITE_COLAGEM + 1)).toBe(0);
    expect(c.registrar('a', LIMITE_COLAGEM + 6)).toBe(5);
  });

  it('marca os momentos das conquistas secretas', () => {
    expect(marcasDoMomento(new Date(2026, 2, 3, 3, 30))).toContain('madrugada');
    expect(marcasDoMomento(new Date(2026, 11, 25, 15))).toContain('natal');
    expect(marcasDoMomento(new Date(2028, 1, 29, 15))).toContain('bissexto');
    expect(marcasDoMomento(new Date(2026, 2, 13, 15))).toContain('sexta13');
  });
});

describe('registro entre aparelhos', () => {
  const de = (fn: (r: RegistroAparelho) => void) => { const r = registroVazio(); fn(r); return r; };

  it('soma contadores, guarda o maior recorde e a conquista mais antiga', () => {
    const a = de((r) => { r.dias['2026-03-01'] = { Aerth: { palavras: 50 } }; r.recordes.ppm = 30; r.conquistas.x = { em: 200 }; });
    const b = de((r) => { r.dias['2026-03-01'] = { Aerth: { palavras: 70 } }; r.recordes.ppm = 20; r.conquistas.x = { em: 100 }; });
    const f = fundirRegistros([a, b]);
    expect(f.dias['2026-03-01']!.Aerth!.palavras).toBe(120);
    expect(f.recordes.ppm).toBe(30);
    expect(f.conquistas.x!.em).toBe(100);
  });

  it('fundir é comutativo', () => {
    const a = de((r) => { r.dias.d = { M: { palavras: 1 } }; r.ajustes = { meta: 200, em: 5 }; });
    const b = de((r) => { r.dias.d = { M: { palavras: 2 } }; r.ajustes = { meta: 300, em: 9 }; });
    expect(fundirRegistros([a, b])).toEqual(fundirRegistros([b, a]));
    expect(fundirRegistros([a, b]).ajustes.meta).toBe(300);
  });

  it('dois aparelhos que escrevem no mesmo dia não perdem nada', async () => {
    const storage = new MemoryStorage();
    const pc = new JornadaStore(storage, 'pc');
    const cel = new JornadaStore(storage, 'cel');
    await pc.sync();
    await cel.sync();
    pc.somar('2026-03-01', 'Aerth', 'palavras', 60);
    cel.somar('2026-03-01', 'Aerth', 'palavras', 40);
    await pc.sync();
    await cel.sync();
    await pc.sync();
    expect(pc.registro.dias['2026-03-01']!.Aerth!.palavras).toBe(100);
    expect(cel.registro.dias['2026-03-01']!.Aerth!.palavras).toBe(100);
    expect([...storage.files.keys()].sort()).toEqual(['.tanden/jornada/cel.json', '.tanden/jornada/pc.json']);
  });

  it('ao reabrir, recupera o que o aparelho já tinha', async () => {
    const storage = new MemoryStorage();
    const a = new JornadaStore(storage, 'pc');
    await a.sync();
    a.somar('2026-03-01', 'Aerth', 'palavras', 60);
    await a.sync();
    const b = new JornadaStore(storage, 'pc');
    await b.sync();
    await b.sync();
    expect(b.registro.dias['2026-03-01']!.Aerth!.palavras).toBe(60);
  });

  it('arquivo corrompido vira registro vazio', () => {
    expect(lerRegistro('{ isto não é json').dias).toEqual({});
    expect(lerRegistro('null').dias).toEqual({});
  });
});

describe('missões do dia', () => {
  const w = mundo(ficha('Kael', 'personagem', '', palavras(5)), ficha('Porto', 'lugar'), ficha('Ordem', 'faccao'));

  it('são três, e sempre as mesmas para o mesmo dia', () => {
    const a = gerarMissoes(w, '2026-03-01', 100);
    expect(a).toHaveLength(3);
    expect(gerarMissoes(w, '2026-03-01', 100)).toEqual(a);
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
  });

  it('variam de um dia para o outro', () => {
    const ids = new Set(Array.from({ length: 30 }, (_, i) => gerarMissoes(w, somarDias('2026-03-01', i), 100).map((m) => m.tipo).join()));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('funcionam num mundo vazio', () => {
    expect(gerarMissoes(mundo(), '2026-03-01', 100)).toHaveLength(3);
  });

  it('são conferidas contra o mundo atual', () => {
    const base = mundo(ficha('Kael', 'personagem'));
    const m = { id: 'x', tipo: 'aprofundar' as const, texto: '', alvo: 80, base: base.entities[0]!.words, ref: 'Mundos/Aerth/personagem/Kael.md', xp: 10, acao: { tipo: 'sprint' as const } };
    expect(medirMissao(m, base, {})).toBe(0);
    const depois = mundo(ficha('Kael', 'personagem', '', palavras(200)));
    expect(medirMissao(m, depois, {})).toBe(80);
  });

  it('palavras do dia contam para a missão de escrita', () => {
    const m = { id: 'x', tipo: 'palavras' as const, texto: '', alvo: 100, base: 0, xp: 10, acao: { tipo: 'sprint' as const } };
    expect(medirMissao(m, w, { palavras: 60 })).toBe(60);
    expect(medirMissao(m, w, { palavras: 600 })).toBe(100);
  });
});

describe('oráculo', () => {
  const w = mundo(ficha('Kael', 'personagem'), ficha('Mira', 'personagem'), ficha('Porto Sal', 'lugar'), ficha('Ordem do Sol', 'faccao'), ficha('Selo', 'item'));
  const g = GENEROS.find((x) => x.id === 'cyberpunk')!;

  it('usa as fichas reais do mundo', () => {
    const t = preencher('{P} encontra {P2} em {L} com {I}, a mando de {F}.', w, g, seededRng(1));
    expect(t).toContain('[[Porto Sal]]');
    expect(t).toContain('[[Ordem do Sol]]');
    expect(t).toContain('[[Selo]]');
    expect(t).toContain('[[Kael]]');
    expect(t).toContain('[[Mira]]');
  });

  it('sem fichas, entra o genérico do gênero', () => {
    const t = preencher('{P} em {L}', mundo(), g, seededRng(1));
    expect(t).not.toContain('{');
    expect(t).not.toContain('[[');
  });

  it('nenhuma tabela deixa marcador sem trocar', () => {
    for (const genero of GENEROS) {
      for (let s = 0; s < 8; s++) {
        const l = lerOraculo(w, genero, seededRng(s));
        expect(`${l.gancho}${l.reviravolta}${l.complicacao}${l.detalhe}`, genero.id).not.toMatch(/[{}]/);
      }
    }
  });

  it('a chance pesa no resultado', () => {
    const sims = (c: 'improvavel' | 'provavel') => {
      const rng = seededRng(7);
      return Array.from({ length: 2000 }, () => perguntarOraculo(c, rng)).filter((r) => r.sim).length;
    };
    expect(sims('provavel')).toBeGreaterThan(sims('improvavel') + 800);
  });
});

describe('entrevista', () => {
  const g = GENEROS.find((x) => x.id === 'horror-cosmico')!;
  const nota = '---\ntipo: personagem\nmundo: Aerth\n---\n# Kael\n';

  it('monta um roteiro sem repetir perguntas', () => {
    const r = roteiroEntrevista({ type: 'personagem' }, g, nota, 3, 8);
    expect(r.length).toBeGreaterThanOrEqual(6);
    expect(new Set(r.map((p) => p.texto)).size).toBe(r.length);
  });

  it('funciona com um tipo sem perguntas próprias', () => {
    expect(roteiroEntrevista({ type: 'tipo-inventado' }, g, '# X\n', 1).length).toBeGreaterThan(0);
  });

  it('resposta curta preenche a propriedade', () => {
    const t = gravarResposta(nota, { texto: 'Do que você tem medo?', prop: 'medo' }, 'do mar');
    expect(parseProps(t).medo).toBe('do mar');
  });

  it('resposta sem propriedade vira seção e não apaga o resto', () => {
    const t = gravarResposta(`${nota}\nTexto antigo.\n`, { texto: 'Quem você deixou para trás?' }, 'Minha irmã.');
    expect(getSection(t, 'Quem você deixou para trás?')).toContain('Minha irmã.');
    expect(t).toContain('Texto antigo.');
  });

  it('não sobrescreve propriedade já preenchida', () => {
    const cheia = '---\ntipo: personagem\nmedo: altura\n---\n# Kael\n';
    const t = gravarResposta(cheia, { texto: 'Do que você tem medo?', prop: 'medo' }, 'do mar');
    expect(parseProps(t).medo).toBe('altura');
    expect(getSection(t, 'Do que você tem medo?')).toContain('do mar');
  });

  it('o que já foi respondido sai do roteiro', () => {
    const p = { texto: 'Do que você tem medo de verdade?', prop: 'medo' };
    const t = gravarResposta(nota, p, 'do mar');
    expect(jaRespondida(t, p)).toBe(true);
    expect(roteiroEntrevista({ type: 'personagem' }, g, t, 3, 50).some((x) => x.texto === p.texto)).toBe(false);
  });

  it('resposta vazia não mexe na nota', () => {
    expect(gravarResposta(nota, { texto: 'Pergunta?' }, '   ')).toBe(nota);
  });
});

describe('conquistas', () => {
  it('são muitas, com ids únicos e bem formadas', () => {
    expect(CONQUISTAS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length);
    const grupos = new Set(GRUPOS.map((g) => g.id));
    for (const c of CONQUISTAS) {
      expect(c.nome.trim(), c.id).not.toBe('');
      expect(c.desc.trim(), c.id).not.toBe('');
      expect(c.alvo, c.id).toBeGreaterThan(0);
      expect(grupos.has(c.grupo), c.id).toBe(true);
    }
  });

  it('todo grupo tem conquistas, e há secretas de sobra', () => {
    for (const g of GRUPOS) expect(CONQUISTAS.some((c) => c.grupo === g.id), g.id).toBe(true);
    expect(CONQUISTAS.filter((c) => c.secreta).length).toBeGreaterThanOrEqual(40);
  });

  it('toda métrica do catálogo é produzida por alguma medição', () => {
    // um mundo cheio de tudo não precisa acender tudo, mas cada métrica precisa ter origem conhecida
    const conhecidas = /^(n\.|lista\.|fam\.|gen3?\.|s\.|rec\.|marca\.)/;
    const diretas = new Set(['palavras', 'melhorDia', 'palavrasMundo', 'seqMelhor', 'diasAtivos', 'escudosUsados', 'sprints', 'duros', 'dobro', 'fichas', 'tiposUsados', 'incomuns', 'raras', 'epicas', 'lendarias',
      'ligacoes', 'maisLigada', 'conflitosAtivos', 'datas', 'spanAnos', 'marcadores', 'palavrasHistoria', 'cenasProntas', 'metasHistoria', 'estruturaCheia', 'oraculo', 'respostas', 'missoes', 'diasCheios', 'checks', 'listas',
      'elementos', 'familias', 'generos', 'mundos', 'nivel', 'era', 'total']);
    for (const c of CONQUISTAS) expect(conhecidas.test(c.metrica) || diretas.has(c.metrica), c.metrica).toBe(true);
  });

  it('desbloqueia ao alcançar o limite, e só uma vez', () => {
    const m: Metricas = { palavras: 1000 };
    const novas = novasConquistas(m, new Set());
    expect(novas.map((c) => c.id)).toEqual(expect.arrayContaining(['palavras-100', 'palavras-1000']));
    expect(novas.some((c) => c.id === 'palavras-5000')).toBe(false);
    expect(novasConquistas(m, new Set(novas.map((c) => c.id)))).toEqual([]);
  });

  it('conquistas de coleção contam as que acabaram de entrar', () => {
    const tem = new Set(CONQUISTAS.filter((c) => c.metrica !== 'total').slice(0, 4).map((c) => c.id));
    const alvo = CONQUISTAS.filter((c) => c.metrica !== 'total' && !tem.has(c.id))[0]!;
    const m: Metricas = { [alvo.metrica]: alvo.alvo };
    expect(novasConquistas(m, tem).some((c) => c.id === 'total-5')).toBe(true);
  });

  it('acha os segredos nas fichas', () => {
    const w = mundo(
      ficha('Avô', 'personagem', 'pai: "[[Neto]]"\n'), ficha('Neto', 'personagem', 'pai: "[[Avô]]"\n'),
      ficha("K'th'ar", 'personagem'), ficha('Otto', 'personagem'), ficha('Dragão Rubro', 'criatura'),
      ficha('Taverna do Corvo', 'lugar'), ficha('Anel de Prata', 'item'),
    );
    const m = medirMundo(w, () => '');
    for (const k of ['s.ouroboros', 's.apostrofo', 's.palindromo', 's.dragao', 's.taverna', 's.anel']) expect(m[k], k).toBe(1);
  });

  it('mede três gerações', () => {
    const w = mundo(ficha('A', 'personagem', 'pai: "[[B]]"\n'), ficha('B', 'personagem', 'mãe: "[[C]]"\n'), ficha('C', 'personagem'));
    expect(medirMundo(w, () => '')['s.dinastia']).toBe(1);
  });

  it('o autor fica com o melhor mundo e soma a atividade', () => {
    const r = registroVazio();
    r.dias['2026-03-01'] = { Aerth: { palavras: 300, sprints: 2, madrugada: 1 } };
    r.dias['2026-03-02'] = { Aerth: { palavras: 700 } };
    const m = medirAutor([mundo(ficha('Kael', 'personagem'))], () => '', r, '2026-03-02');
    expect(m.palavras).toBe(1000);
    expect(m.melhorDia).toBe(700);
    expect(m.sprints).toBe(2);
    expect(m.seqMelhor).toBe(2);
    expect(m['s.madrugada']).toBe(1);
    expect(m['n.personagem']).toBe(1);
  });

  it('um mundo vazio não quebra nenhuma medição', () => {
    expect(() => medirAutor([mundo()], () => '', registroVazio(), diaLocal(new Date()))).not.toThrow();
    expect(() => medirAutor([], () => '', registroVazio(), diaLocal(new Date()))).not.toThrow();
  });

  it('a atividade entra na experiência do mundo certo', () => {
    const r = registroVazio();
    r.dias['2026-03-01'] = { Aerth: { palavras: 300, sprints: 2 }, Outro: { palavras: 10 } };
    const a = atividadeDoMundo(r, 'Aerth');
    expect(a.sprints).toBe(2);
    expect(a.diasAtivos).toBe(1);
    expect(estadoDoMundo(mundo(), a).nivel.xp).toBeGreaterThan(estadoDoMundo(mundo()).nivel.xp);
  });
});
