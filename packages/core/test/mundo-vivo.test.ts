import { describe, expect, it } from 'vitest';
import {
  CALENDARIO_PADRAO, CARTAS, JornadaStore, NAIPES, RELIQUIAS,
  ameacaDe, arcoDe, arvorePoderes, bausDoAutor, censo, colecaoDe, conjuncoes, converter, deAbsoluto, demografia, diaAbsoluto, diaDaSemana, elencoQuimica,
  equilibrio, estadoReliquias, faseDaLua, forjarPoder, formatarDataCal, formatarPreco, fundirRegistros, gradeDoMes, gravarPrecos, lerCalendario, lerDataCal, lerPoder, lerPreco,
  lerRegistro, marcosDoMes, medirAutor, medirMundo, mercado, moedaBase, moedasDoMundo, nomeDaFase, numeroCurto, numeroDe, perfilPsique, perigoPorLugar, pesoDoCusto, portadores,
  precoLocal, precosDoMundo, quimica, recordes, registroVazio, reviewWorld, rolarEncontro, seededRng, sinaisDoMundo, sortearCarta, tabelaEncontros, worldIndex,
  type Entity, type RegistroAparelho, type World,
} from '../src';
import { MemoryStorage } from '../src/storage';

const ficha = (nome: string, tipo: string, props = '', corpo = '') => ({
  path: `Mundos/Aerth/${tipo}/${nome}.md`,
  text: `---\ntipo: ${tipo}\nmundo: Aerth\n${props}---\n# ${nome}\n\n${corpo}\n`,
});
type Nota = { path: string; text: string };
const mundoDe = (notas: Nota[], props = ''): { w: World; ler: (p: string) => string } => {
  const todas = [{ path: 'Mundos/Aerth/Aerth.md', text: `---\ntipo: mundo\n${props}---\n# Aerth\n` }, ...notas];
  const textos = new Map(todas.map((n) => [n.path, n.text]));
  return { w: worldIndex(todas)[0]!, ler: (p) => textos.get(p) ?? '' };
};
const ent = (w: World, nome: string): Entity => w.entities.find((e) => e.name === nome)!;

// ------------------------------------------------------------------ poderes

describe('poderes', () => {
  const custoso = ficha('Toque de Cinza', 'poder', 'nível: 6\ncusto: um ano de vida a cada uso\nfraqueza: ferro frio\nefeito colateral: as mãos ficam cinzentas\nalcance: toque\nduração: instantâneo\n',
    '## Efeito\n\nTransforma em cinza qualquer coisa viva que a mão tocar, desde que menor que um cavalo.\n\n## Limites\n\nNão funciona sob a luz do sol. Não atravessa luvas. Só uma vez por dia, e o alvo precisa estar parado. Quem sabe o nome verdadeiro de quem usa fica imune. Exige silêncio absoluto para começar.\n');
  const gratis = ficha('Olhar Divino', 'poder', 'nível: 9\nalcance: ilimitado\nduração: permanente\n');

  it('mede o equilíbrio: poder sem custo e sem limite é quebrado; com preço, equilibrado', () => {
    const { w, ler } = mundoDe([custoso, gratis]);
    const a = equilibrio(lerPoder(ent(w, 'Toque de Cinza'), ler(ent(w, 'Toque de Cinza').path)));
    const b = equilibrio(lerPoder(ent(w, 'Olhar Divino'), ler(ent(w, 'Olhar Divino').path)));
    expect(a.veredito).toBe('equilibrado');
    expect(b.veredito).toBe('quebrado');
    expect(b.dicas.some((d) => /custo/.test(d))).toBe(true);
    expect(b.dicas.some((d) => /deus/.test(d))).toBe(true);
  });

  it('pesa o custo pelo que se perde', () => {
    expect(pesoDoCusto('')).toBe(0);
    expect(pesoDoCusto('nenhum')).toBe(0);
    expect(pesoDoCusto('sangue')).toBeGreaterThan(pesoDoCusto('cansaço'));
    expect(pesoDoCusto('uma lembrança, para sempre')).toBe(30);
  });

  it('acha ciclos de pré-requisitos e os portadores', () => {
    const { w, ler } = mundoDe([
      ficha('A', 'poder', 'requer: "[[B]]"\n'), ficha('B', 'poder', 'requer: "[[A]]"\n'), ficha('C', 'poder', 'requer: "[[A]]"\nquem tem: "[[Kael]]"\n'),
      ficha('Kael', 'personagem'), ficha('Mira', 'personagem', 'poderes: "[[C]]"\n'),
    ]);
    const arv = arvorePoderes(w, ler);
    expect(arv.ciclos.sort()).toEqual([ent(w, 'A').path, ent(w, 'B').path].sort());
    expect(arv.ligacoes).toHaveLength(3);
    expect(portadores(w, ent(w, 'C').path).map((e) => e.name).sort()).toEqual(['Kael', 'Mira']);
  });

  it('forja poderes repetíveis e completos', () => {
    const a = forjarPoder(seededRng(7));
    const b = forjarPoder(seededRng(7));
    expect(a).toEqual(b);
    expect(a.nome).not.toContain('{x}');
    expect(a.efeito).not.toContain('{x}');
    expect(a.props.custo).toBeTruthy();
    expect(Number(a.props['nível'])).toBeGreaterThanOrEqual(1);
    expect(forjarPoder(seededRng(3), { categoria: 'cura' }).props.categoria).toBe('cura');
  });
});

// ------------------------------------------------------------------ economia

describe('economia', () => {
  it('lê números do jeito que se escreve', () => {
    expect(numeroDe('12.000')).toBe(12000);
    expect(numeroDe('1,5 mil')).toBe(1500);
    expect(numeroDe('3k')).toBe(3000);
    expect(numeroDe('2 milhões')).toBe(2e6);
    expect(numeroDe('1.5')).toBe(1.5);
    expect(numeroDe('nada')).toBeNull();
  });

  const moedas = [
    ficha('Coroa', 'moeda', 'valor: 100\nsímbolo: cr\nemissor: "[[Ordem do Sol]]"\n'),
    ficha('Prata', 'moeda', 'valor: 10\nsímbolo: pr\n'),
    ficha('Cobre', 'moeda', 'valor: 1\nsímbolo: co\n'),
  ];

  it('converte e escreve preços nas moedas do mundo', () => {
    const { w } = mundoDe([...moedas, ficha('Ordem do Sol', 'faccao')]);
    const ms = moedasDoMundo(w);
    expect(ms.map((m) => m.nome)).toEqual(['Coroa', 'Prata', 'Cobre']);
    expect(moedaBase(ms)!.nome).toBe('Cobre');
    expect(converter(3, ms[0]!, ms[1]!)).toBe(30);
    expect(formatarPreco(250, ms)).toBe('2 cr e 5 pr');
    expect(formatarPreco(0.5, ms)).toBe('0,5 co');
    expect(lerPreco('1 coroa e 4 pratas', ms)).toBe(140);
    expect(lerPreco('3 pr', ms)).toBe(30);
    expect(ms[0]!.emissor?.name).toBe('Ordem do Sol');
  });

  it('usa a cesta padrão até a nota do mundo ter a tabela, e grava a tabela', () => {
    const { w } = mundoDe(moedas);
    const ms = moedasDoMundo(w);
    expect(precosDoMundo('', ms).every((p) => p.padrao)).toBe(true);
    const texto = gravarPrecos('# Aerth\n', [{ item: 'Pão', preco: 2 }, { item: 'Espada', preco: 450 }], ms);
    expect(texto).toContain('## Preços');
    const lidos = precosDoMundo(texto, ms);
    expect(lidos.map((p) => [p.item, p.preco, p.padrao])).toEqual([['Pão', 2, false], ['Espada', 450, false]]);
  });

  it('monta o mercado: escassez, monopólio, rotas pela distância e riqueza', () => {
    const { w } = mundoDe([
      ficha('Sal', 'recurso', 'valor: 5\n'),
      ficha('Ordem do Sol', 'faccao', 'território: "[[Salinas]], [[Costa]]"\n'),
      ficha('Liga', 'faccao'),
      ficha('Salinas', 'lugar', 'recursos: "[[Sal]], madeira"\n'),
      ficha('Costa', 'lugar', 'recursos: "[[Sal]]"\n'),
      ficha('Montanha', 'lugar', 'precisa: "[[Sal]], ferro"\ncontrole: "[[Liga]]"\n'),
      ficha('Vale', 'lugar', 'precisa: "[[Sal]]"\n'),
    ]);
    const pos = new Map([[ent(w, 'Salinas').path, { x: 0, y: 0 }], [ent(w, 'Costa').path, { x: 100, y: 0 }], [ent(w, 'Montanha').path, { x: 90, y: 0 }]]);
    const m = mercado(w, pos);
    const sal = m.recursos.find((r) => r.nome === 'Sal')!;
    expect(sal.produtores.map((e) => e.name).sort()).toEqual(['Costa', 'Salinas']);
    expect(sal.consumidores.map((e) => e.name).sort()).toEqual(['Montanha', 'Vale']);
    expect(sal.monopolio?.name).toBe('Ordem do Sol');
    const rota = m.rotas.find((r) => r.recurso === 'Sal' && r.para.name === 'Montanha')!;
    expect(rota.de.name).toBe('Costa');
    expect(rota.distancia).toBe(10);
    expect(m.semFicha.sort()).toEqual(['Ferro', 'Madeira']);
    expect(m.riqueza[0]!.faccao.name).toBe('Ordem do Sol');
    expect(m.riqueza[0]!.monopolios).toEqual(['Sal']);
    expect(precoLocal(sal, ent(w, 'Salinas'))).toBe(3.5);
    expect(precoLocal(sal, ent(w, 'Montanha'), m.rotas, 100)!).toBeGreaterThan(5);
    const ferro = m.recursos.find((r) => r.nome === 'Ferro')!;
    expect(ferro.tendencia).toBe('alta');
  });
});

// ------------------------------------------------------------------ calendário

describe('calendário', () => {
  const cal = ficha('Calendário Solar', 'calendario', 'meses: Brumal:30, Geada:20, Degelo\ndias por mês: 25\nsemana: Sol, Lua, Ferro, Água, Vento\nluas: Selene:10, Ira:5:2\nera: D.R.\nestações: Inverno:Brumal, Primavera:3\n',
    '## Festas\n\n- 12 de Brumal: Noite das Lanternas\n- Geada 3 — Dia do Gelo\n- 40/2: Festa impossível\n- 5 de Abril: Mês inexistente\n');

  it('lê meses, semana, luas, estações, festas e avisa os furos', () => {
    const { w, ler } = mundoDe([cal]);
    const c = lerCalendario(ent(w, 'Calendário Solar'), ler(ent(w, 'Calendário Solar').path));
    expect(c.meses).toEqual([{ nome: 'Brumal', dias: 30 }, { nome: 'Geada', dias: 20 }, { nome: 'Degelo', dias: 25 }]);
    expect(c.diasNoAno).toBe(75);
    expect(c.semana).toHaveLength(5);
    expect(c.luas).toEqual([{ nome: 'Selene', ciclo: 10, fase: 0 }, { nome: 'Ira', ciclo: 5, fase: 2 }]);
    expect(c.estacoes.map((s) => [s.nome, s.mes])).toEqual([['Inverno', 0], ['Primavera', 2]]);
    expect(c.festas.map((f) => [f.nome, f.mes, f.dia])).toEqual([['Noite das Lanternas', 0, 12], ['Dia do Gelo', 1, 3]]);
    expect(c.avisos).toHaveLength(2);
    expect(c.era).toBe('D.R.');
  });

  it('faz a conta do dia absoluto nos dois sentidos, e alinha a grade pela semana', () => {
    const { w, ler } = mundoDe([cal]);
    const c = lerCalendario(ent(w, 'Calendário Solar'), ler(ent(w, 'Calendário Solar').path));
    for (const [a, m, d] of [[0, 0, 1], [342, 1, 20], [-5, 2, 3]] as const) expect(deAbsoluto(c, diaAbsoluto(c, a, m, d))).toEqual({ ano: a, mes: m, dia: d });
    const g = gradeDoMes(c, 1, 1);
    expect(g.every((linha) => linha.length === 5)).toBe(true);
    const primeiro = g.flat().find((x) => x)!;
    expect(g[0]!.indexOf(primeiro)).toBe(diaDaSemana(c, diaAbsoluto(c, 1, 1, 1)));
    expect(g.flat().filter(Boolean)).toHaveLength(20);
  });

  it('fases da lua e noites de luas cheias juntas', () => {
    const lua = { nome: 'L', ciclo: 10, fase: 0 };
    expect(faseDaLua(lua, 5)).toBe(0.5);
    expect(nomeDaFase(0.5).nome).toBe('Cheia');
    expect(nomeDaFase(0).icone).toBe('🌑');
    const { w, ler } = mundoDe([cal]);
    const c = lerCalendario(ent(w, 'Calendário Solar'), ler(ent(w, 'Calendário Solar').path));
    const conj = conjuncoes(c, 0);
    expect(conj.length).toBeGreaterThan(0);
    for (const d of conj) {
      const n = diaAbsoluto(c, d.ano, d.mes, d.dia);
      for (const l of c.luas) expect(Math.abs(faseDaLua(l, n) - 0.5)).toBeLessThanOrEqual(0.5 / l.ciclo);
    }
    expect(conjuncoes(CALENDARIO_PADRAO, 0)).toEqual([]);
  });

  it('lê datas escritas no calendário e acha marcos do mês com aniversários', () => {
    const { w, ler } = mundoDe([cal, ficha('Batalha do Gelo', 'evento', 'data: 3 de Geada de 300\n'), ficha('Kael', 'personagem', 'nascimento: 3/2/342\n')]);
    const c = lerCalendario(ent(w, 'Calendário Solar'), ler(ent(w, 'Calendário Solar').path));
    expect(lerDataCal('12 de Brumal de 342 D.R.', c)).toEqual({ ano: 342, mes: 0, dia: 12 });
    expect(lerDataCal('Degelo de 10', c)).toEqual({ ano: 10, mes: 2, dia: null });
    expect(lerDataCal('50 a.C.', c)).toEqual({ ano: -50, mes: null, dia: null });
    expect(formatarDataCal({ ano: 342, mes: 0, dia: 12 }, c)).toBe('12 de Brumal de 342 D.R.');
    const marcos = marcosDoMes(w, c, 342, 1);
    expect(marcos.map((m) => [m.nome, m.tipo, m.anos])).toEqual([['Dia do Gelo', 'festa', undefined], ['Kael', 'nascimento', undefined], ['Batalha do Gelo', 'evento', 42]]);
  });
});

// ------------------------------------------------------------------ psique

describe('psique', () => {
  it('traços viram perfil, arquétipo e contradições', () => {
    const { w } = mundoDe([ficha('Kael', 'personagem', 'traços: corajoso, honesto, leal, covarde no aperto, sonhador de estrelas\n')]);
    const p = perfilPsique(ent(w, 'Kael'));
    expect(p.tracos.map((t) => t.id)).toEqual(['corajoso', 'honesto', 'leal', 'covarde']);
    expect(p.soltos).toEqual(['sonhador de estrelas']);
    expect(p.contradicoes.map(([a, b]) => [a.id, b.id])).toEqual([['corajoso', 'covarde']]);
    expect(p.big5.every((x) => x >= 0 && x <= 100)).toBe(true);
    expect(p.arquetipo.nome).toBeTruthy();
    expect(p.arquetipo).not.toBe(p.segundo);
  });

  it('química: laços escritos e traços que se atraem ou se repelem', () => {
    const { w } = mundoDe([
      ficha('Ana', 'personagem', 'traços: honesta\ninimigos: "[[Bento]]"\n'), ficha('Bento', 'personagem', 'traços: mentiroso\n'),
      ficha('Clara', 'personagem', 'traços: honesta\namigos: "[[Ana]]"\n'),
    ]);
    const ruim = quimica(ent(w, 'Ana'), ent(w, 'Bento'), w);
    const boa = quimica(ent(w, 'Ana'), ent(w, 'Clara'), w);
    expect(ruim.pontos).toBeLessThan(-30);
    expect(ruim.rotulo === 'Atrito' || ruim.rotulo === 'Ódio').toBe(true);
    expect(boa.pontos).toBeGreaterThan(20);
    expect(boa.razoes.length).toBeGreaterThan(0);
    const el = elencoQuimica(w);
    expect(el.pessoas).toHaveLength(3);
    expect(el.pior!.q.pontos).toBe(ruim.pontos);
    expect(el.matriz[0]![1]).toBe(el.matriz[1]![0]);
  });

  it('o arco junta quer, precisa, mentira, ferida e medo numa frase', () => {
    const { w } = mundoDe([ficha('Mira', 'personagem', 'quer: vingar o pai\nprecisa: perdoar a si mesma\nmentira: que a culpa foi dela\nferida: o incêndio de 330\n')]);
    const a = arcoDe(ent(w, 'Mira'));
    expect(a.preenchidos).toBe(4);
    expect(a.faltam.map((f) => f.campo)).toEqual(['medo']);
    expect(a.frase).toBe('Mira quer vingar o pai, mas precisa de perdoar a si mesma. Acredita que a culpa foi dela, desde o incêndio de 330.');
  });
});

// ------------------------------------------------------------------ bestiário

describe('bestiário', () => {
  const notas = [
    ficha('Reino', 'lugar', 'população: 50 mil\n'), ficha('Mata Funda', 'lugar', 'parte de: "[[Reino]]"\npopulação: 800\n'),
    ficha('Vila Musgo', 'lugar', 'parte de: "[[Mata Funda]]"\npopulação: 600\n'),
    ficha('Lobo Cinzento', 'criatura', 'nd: 1/2\nhabitat: "[[Reino]]"\nfrequência: comum\n'),
    ficha('Dragão Rubro', 'criatura', 'nd: 17\nhabitat: "[[Mata Funda]]"\nfrequência: raro\n'),
    ficha('Sombra', 'criatura', 'perigo: mortal\n'),
  ];

  it('lê a ameaça pelo nd ou por extenso', () => {
    const { w } = mundoDe(notas);
    expect(ameacaDe(ent(w, 'Lobo Cinzento'))).toBe(0.5);
    expect(ameacaDe(ent(w, 'Dragão Rubro'))).toBe(17);
    expect(ameacaDe(ent(w, 'Sombra'))).toBe(13);
  });

  it('tabela d100 contínua, herdando o habitat pelos lugares maiores', () => {
    const { w } = mundoDe(notas);
    const t = tabelaEncontros(w, ent(w, 'Vila Musgo'));
    expect(t.linhas.filter((l) => l.criatura).map((l) => l.criatura!.name)).toEqual(['Lobo Cinzento', 'Dragão Rubro']);
    expect(t.linhas[0]!.de).toBe(1);
    expect(t.linhas[t.linhas.length - 1]!.ate).toBe(100);
    for (let i = 1; i < t.linhas.length; i++) expect(t.linhas[i]!.de).toBe(t.linhas[i - 1]!.ate + 1);
    expect(tabelaEncontros(w, ent(w, 'Reino')).linhas.filter((l) => l.criatura)).toHaveLength(1);
    const a = rolarEncontro(t, seededRng(5));
    expect(rolarEncontro(t, seededRng(5))).toEqual(a);
    expect(a.texto.length).toBeGreaterThan(10);
  });

  it('ranqueia os lugares pelo perigo e o arauto avisa a vila ao lado do dragão', () => {
    const { w, ler } = mundoDe(notas);
    const p = perigoPorLugar(w);
    expect(p[0]!.maior!.criatura.name).toBe('Dragão Rubro');
    const s = sinaisDoMundo(w, ler);
    expect(s.some((x) => x.tom === 'presagio' && x.titulo.includes('Dragão Rubro'))).toBe(true);
    expect(s.some((x) => x.id.startsWith('semhabitat'))).toBe(true);
  });
});

// ------------------------------------------------------------------ almanaque

describe('almanaque', () => {
  it('soma o censo pela hierarquia, sem contar duas vezes', () => {
    const { w } = mundoDe([
      ficha('Reino', 'lugar', 'população: 1.000\n'), ficha('Capital', 'lugar', 'parte de: "[[Reino]]"\npopulação: 3 mil\n'),
      ficha('Porto', 'lugar', 'parte de: "[[Reino]]"\npopulação: 500\n'), ficha('Ilha', 'lugar', 'população: 200\n'),
    ]);
    const c = censo(w);
    expect(c.total).toBe(3700);
    expect(c.raizes[0]!.lugar.name).toBe('Reino');
    expect(c.raizes[0]!.total).toBe(3500);
    expect(c.contados).toBe(4);
    expect(numeroCurto(12400)).toBe('12,4 mil');
    expect(numeroCurto(3_200_000)).toBe('3,2 mi');
  });

  it('demografia e recordes', () => {
    const { w } = mundoDe([
      ficha('Elfos', 'especie'), ficha('Ana', 'personagem', 'espécie: "[[Elfos]]"\nnascimento: 100\nsexo: feminino\n'),
      ficha('Bento', 'personagem', 'espécie: "[[Elfos]]"\nnascimento: 300\nmorte: 340\n'), ficha('Caio', 'personagem', 'espécie: humano\n'),
    ], 'ano: 350\n');
    const d = demografia(w);
    expect(d.pessoas).toBe(3);
    expect(d.mortas).toBe(1);
    expect(d.especies[0]).toMatchObject({ nome: 'Elfos', n: 2 });
    expect(d.especies.some((f) => f.nome === 'humano')).toBe(true);
    expect(d.sexos.find((s) => s.nome === 'Mulheres')?.n).toBe(1);
    const r = recordes(w);
    expect(r.find((x) => x.id === 'velho')).toMatchObject({ valor: '250 anos' });
  });
});

// ------------------------------------------------------------------ lógica (revisão)

describe('lógica entre sistemas', () => {
  it('acha contradições que cruzam lugares, espécies, poderes, profecias e itens', () => {
    const { w } = mundoDe([
      ficha('Forte', 'lugar', 'fundação: 250\n'), ficha('Cerco', 'evento', 'data: 200\nlocal: "[[Forte]]"\n'),
      ficha('Efêmeros', 'especie', 'expectativa de vida: 20\nmaioridade: 30\n'),
      ficha('Laço', 'poder', 'nível: 8\nrequer: "[[Laço]]"\n'),
      ficha('Visão', 'profecia', 'data: 300\ncumprida em: 120\n'),
      ficha('Ferreiro', 'personagem', 'nascimento: 400\n'), ficha('Martelo', 'item', 'criação: 380\ncriador: "[[Ferreiro]]"\n'),
      ficha('Norte', 'lugar', 'parte de: "[[Sul]]"\n'), ficha('Sul', 'lugar', 'parte de: "[[Norte]]"\n'),
    ]);
    const msgs = reviewWorld(w).map((i) => `${i.level}: ${i.message}`);
    const tem = (re: RegExp) => expect(msgs.some((m) => re.test(m)), String(re)).toBe(true);
    tem(/^erro: Cerco \(200\) acontece em Forte, que só foi fundada em 250/);
    tem(/^erro: Efêmeros chega à maioridade/);
    tem(/^erro: Laço exige a si mesmo/);
    tem(/^aviso: Laço não tem custo/);
    tem(/^erro: Visão se cumpre/);
    tem(/^erro: Martelo é feito \(380\) antes de Ferreiro nascer/);
    tem(/^erro: .*dentro de si mesmo/);
  });
});

// ------------------------------------------------------------------ arauto

describe('arauto', () => {
  it('sinais com id estável, ordenados pelo peso', () => {
    const notas = [
      ficha('Sal', 'recurso', 'valor: 5\n'), ficha('Ordem', 'faccao', 'território: "[[Salinas]]"\n'),
      ficha('Salinas', 'lugar', 'recursos: "[[Sal]]"\n'), ficha('Vale', 'lugar', 'precisa: "[[Sal]]"\n'), ficha('Monte', 'lugar'),
      ficha('Olhar Divino', 'poder', 'nível: 9\nalcance: ilimitado\nduração: permanente\n'),
    ];
    const { w, ler } = mundoDe(notas);
    const a = sinaisDoMundo(w, ler);
    const b = sinaisDoMundo(mundoDe(notas).w, ler);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a.some((s) => s.tom === 'mercado' && s.id.startsWith('monopolio:'))).toBe(true);
    expect(a.some((s) => s.id.startsWith('quebrado:'))).toBe(true);
    expect(a.some((s) => s.id === 'semmoeda')).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i - 1]!.peso).toBeGreaterThanOrEqual(a[i]!.peso);
  });
});

// ------------------------------------------------------------------ tesouro

describe('tesouro', () => {
  it('96 cartas, 16 por naipe, com a distribuição de raridade', () => {
    expect(CARTAS).toHaveLength(96);
    for (const n of NAIPES) {
      const l = CARTAS.filter((c) => c.naipe === n.id);
      expect(l, n.id).toHaveLength(16);
      expect(l.filter((c) => c.raridade === 'lendaria'), n.id).toHaveLength(1);
      expect(l.filter((c) => c.raridade === 'epica'), n.id).toHaveLength(1);
    }
    expect(new Set(CARTAS.map((c) => c.id)).size).toBe(96);
    expect(CARTAS.every((c) => c.nome && c.texto.length > 15)).toBe(true);
  });

  it('a carta de um baú é a mesma em qualquer aparelho, e prefere o que falta na coleção', () => {
    const a = sortearCarta('m:2026-11-24:Aerth');
    expect(sortearCarta('m:2026-11-24:Aerth')).toEqual(a);
    const tem = new Set(CARTAS.filter((c) => c.raridade === a.raridade && c.id !== a.id).map((c) => c.id));
    expect(tem.has(sortearCarta('m:2026-11-24:Aerth', tem).id)).toBe(false);
    // com sorte, raras aparecem mais
    const conta = (sorte: number) => Array.from({ length: 400 }, (_, i) => sortearCarta(`b${i}`, new Set(), sorte)).filter((c) => ['rara', 'epica', 'lendaria'].includes(c.raridade)).length;
    expect(conta(2)).toBeGreaterThan(conta(0));
  });

  it('baús saem das missões completas, da sequência e dos níveis', () => {
    const r: RegistroAparelho = registroVazio();
    r.missoes['2026-11-20'] = { Aerth: { em: 1, lista: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never, feitas: ['a', 'b', 'c'] } };
    r.missoes['2026-11-21'] = { Aerth: { em: 1, lista: [{ id: 'a' }, { id: 'b' }] as never, feitas: ['a'] } };
    for (let i = 1; i <= 8; i++) r.metas[`2026-11-${String(i).padStart(2, '0')}`] = true;
    const baus = bausDoAutor(r, [{ mundo: 'Aerth', nivel: 11 }], '2026-11-08');
    expect(baus.map((b) => b.id).sort()).toEqual(['m:2026-11-20:Aerth', 'n:Aerth:10', 'n:Aerth:5', 's:7']);
    r.baus['s:7'] = { em: 5, carta: 'rosto-1' };
    const depois = bausDoAutor(r, [{ mundo: 'Aerth', nivel: 11 }], '2026-11-08');
    expect(depois[depois.length - 1]!.aberto?.carta).toBe('rosto-1');
    expect(colecaoDe(r).get('rosto-1')).toEqual({ em: 5, vezes: 1 });
  });

  it('o registro funde baús, leituras do arauto e vitrine entre aparelhos', async () => {
    const a = registroVazio();
    const b = registroVazio();
    a.baus.x = { em: 10, carta: 'veu-1' };
    b.baus.x = { em: 5, carta: 'veu-2' };
    a.lidos.Aerth = { s1: 3 };
    b.lidos.Aerth = { s1: 9, s2: 4 };
    a.vitrine.Aerth = { adorno: 'cometa', em: 1 };
    b.vitrine.Aerth = { adorno: 'aurora', em: 2 };
    const f = fundirRegistros([a, b]);
    expect(f.baus.x!.carta).toBe('veu-2');
    expect(f.lidos.Aerth).toEqual({ s1: 3, s2: 4 });
    expect(f.vitrine.Aerth!.adorno).toBe('aurora');
    expect(fundirRegistros([b, a])).toEqual(f);
    // arquivos antigos (sem os campos novos) ou estragados continuam lendo
    expect(lerRegistro('{"v":1,"dias":{}}').baus).toEqual({});
    expect(lerRegistro('{"baus":{"y":{"carta":3}},"lidos":"x"}').baus).toEqual({});

    const st = new JornadaStore(new MemoryStorage(), 'pc');
    expect(st.abrirBau('m:1', 'chao-2', 100, 'Aerth')).toBe(true);
    expect(st.abrirBau('m:1', 'chao-3', 200)).toBe(false);
    st.lerSinais('Aerth', ['s1', 's1'], 50);
    st.definirVitrine('Aerth', { moldura: 'ouro' }, 60);
    await st.sync();
    const outro = new JornadaStore(st.storage, 'cel');
    await outro.sync();
    expect(outro.registro.baus['m:1']!.carta).toBe('chao-2');
    expect(outro.registro.lidos.Aerth).toEqual({ s1: 50 });
    expect(outro.registro.vitrine.Aerth!.moldura).toBe('ouro');
  });

  it('relíquias abrem pelas métricas', () => {
    const e = estadoReliquias({ nivel: 12, seqMelhor: 7, mundos: 1 });
    const ok = new Set(e.filter((x) => x.ok).map((x) => x.r.id));
    for (const id of ['lua-prata', 'cometa', 'aurora', 'bronze', 'prata', 'aprendiz']) expect(ok.has(id), id).toBe(true);
    expect(ok.has('ouro')).toBe(false);
    expect(new Set(RELIQUIAS.map((r) => r.id)).size).toBe(RELIQUIAS.length);
    expect(e.find((x) => x.r.id === 'ouro')!.progresso).toBeCloseTo(0.6);
  });
});

// ------------------------------------------------------------------ conquistas dos sistemas

describe('métricas dos sistemas', () => {
  it('mede rotas, poderes, festas, psiques e população; o autor soma baús e coleção', () => {
    const { w, ler } = mundoDe([
      ficha('Sal', 'recurso', 'valor: 5\n'), ficha('Salinas', 'lugar', 'recursos: "[[Sal]]"\npopulação: 2 mil\n'), ficha('Vale', 'lugar', 'precisa: "[[Sal]]"\n'),
      ficha('Toque', 'poder', 'nível: 4\ncusto: sangue\nfraqueza: prata\n', '## Limites\n\nSó à noite, só uma vez, só em quem dorme, e nunca em crianças ou em quem usa prata.\n'),
      ficha('Cal', 'calendario', 'meses: A, B\nluas: Selene:10, Ira:5:2\n', '## Festas\n\n- 2 de A: Festa\n'),
      ficha('Kael', 'personagem', 'traços: corajoso, honesto, leal\nquer: a coroa\nprecisa: paz\nmentira: que é fraco\nferida: a guerra\nmedo: o mar\n'),
    ]);
    const m = medirMundo(w, ler);
    expect(m['v.rotas']).toBe(1);
    expect(m['v.equilibrados']).toBe(1);
    expect(m['v.festas']).toBe(1);
    expect(m['v.psiques']).toBe(1);
    expect(m['s.arco']).toBe(1);
    expect(m['v.populacao']).toBe(2000);
    expect(m['s.conjuncao']).toBe(1);
    const r = registroVazio();
    r.baus.a = { em: 1, carta: CARTAS.find((c) => c.raridade === 'lendaria')!.id };
    r.baus.b = { em: 2, carta: 'rosto-1' };
    const ma = medirAutor([w], ler, r, '2026-11-24');
    expect(ma['v.baus']).toBe(2);
    expect(ma['v.colecao']).toBe(2);
    expect(ma['s.cartalendaria']).toBe(1);
    expect(ma['v.reliquias']).toBeGreaterThanOrEqual(1);
  });
});
