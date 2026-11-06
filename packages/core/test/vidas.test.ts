import { describe, expect, it } from 'vitest';
import {
  RECEITAS, Vidas, abrirSim, catalogo, compileRules, consanguinidade, fichasDaSimulacao, genomaAleatorio, genomaTexto, herdar, lacosDasFichas, lerGenoma,
  mecanicaRegras, mesDe, olhosDe, pessoaDaFicha, povoar, readSim, regrasHash, saveDe, seededRng, simNoteText, worldIndex, type Pessoa, type World,
} from '../src/index';

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;
const W = 'Mundos/Aerth';
const LUGAR = `${W}/Lugares/Pedravale.md`;
const INICIO = mesDe(312);

function mundo(extra: Array<{ path: string; text: string }> = [], regras = ''): World {
  const notes = [
    { path: `${W}/Aerth.md`, text: note('tipo: mundo\nano: 312') },
    { path: LUGAR, text: note('tipo: lugar\nmundo: Aerth') },
    { path: `${W}/Lugares/Porto Sal.md`, text: note('tipo: lugar\nmundo: Aerth\nrotas: "[[Pedravale]]"') },
    { path: `${W}/Personagens/Kael.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: masculino\nnascimento: 288\ntraços: [ciumento, irascível, corajoso]\nlocal: "[[Pedravale]]"\ncônjuge: "[[Mira]]"\nprofissão: ferreiro\nolhos: azuis') },
    { path: `${W}/Personagens/Mira.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: feminino\nnascimento: 290\ntraços: [luxuriosa, sociável, mentirosa]\nlocal: "[[Pedravale]]"\ncasa: Vale') },
    { path: `${W}/Personagens/Tobias.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: masculino\nnascimento: 289\ntraços: [romântico, traiçoeiro, luxurioso]\nlocal: "[[Pedravale]]"\nprofissão: bardo\norientação: hétero') },
    { path: `${W}/Personagens/Velho Rei.md`, text: note('tipo: personagem\nmundo: Aerth\nnascimento: 240\nmorte: 300') },
    ...extra,
    ...(regras ? [{ path: `${W}/Regras/Regras.md`, text: `# Regras\n\n\`\`\`regras\n${regras}\n\`\`\`\n` }] : []),
  ];
  return worldIndex(notes).find((x) => x.name === 'Aerth')!;
}

function elenco(w: World, extras = 0, semente = 7) {
  const cat = catalogo(null);
  const fichas = w.entities.filter((e) => e.type === 'personagem').map((e) => pessoaDaFicha(e, w, cat, { inicio: INICIO, lugar: LUGAR })).filter((p): p is Pessoa => !!p);
  const pov = povoar(cat, { quantos: extras, inicio: INICIO, lugar: LUGAR, semente, nomes: { estilo: 'iberico', amostras: [] }, existentes: fichas });
  return { pessoas: [...fichas, ...pov.pessoas], lacos: [...lacosDasFichas(w.entities, new Set(fichas.map((p) => p.id))), ...pov.lacos] };
}

const sim = (w: World, el: ReturnType<typeof elenco>, semente = 42) =>
  new Vidas(w, { nome: 'Teste', semente, inicio: INICIO, lugar: LUGAR }, el, { rules: compileRules(w.scripts ?? []) });

describe('genética', () => {
  it('olhos seguem Mendel: castanho esconde azul', () => {
    const rng = seededRng(1);
    const base = genomaAleatorio(rng);
    const mae = { ...base, olhos: ['C', 'A'] as [string, string] };
    const pai = { ...base, olhos: ['C', 'A'] as [string, string] };
    const filhos = Array.from({ length: 400 }, () => olhosDe(herdar(mae, pai, rng)));
    const azuis = filhos.filter((x) => x === 'azuis').length / filhos.length;
    expect(olhosDe(mae)).toBe('castanhos');
    expect(azuis).toBeGreaterThan(0.15);
    expect(azuis).toBeLessThan(0.35);
    const azul = { ...base, olhos: ['A', 'A'] as [string, string] };
    expect(Array.from({ length: 100 }, () => olhosDe(herdar(azul, azul, rng))).filter((x) => x !== 'azuis').length).toBeLessThan(5);
  });

  it('consanguinidade: irmãos 1/4, primos 1/16', () => {
    const pais: Record<string, [string | null, string | null]> = {
      a: ['m', 'p'], b: ['m', 'p'], c: ['a', 'x'], d: ['b', 'y'], m: [null, null], p: [null, null], x: [null, null], y: [null, null],
    };
    expect(consanguinidade('a', 'b', (id) => pais[id])).toBeCloseTo(0.25);
    expect(consanguinidade('c', 'd', (id) => pais[id])).toBeCloseTo(0.0625);
    expect(consanguinidade('a', 'x', (id) => pais[id])).toBe(0);
  });

  it('o genoma vira texto e volta', () => {
    const g = genomaAleatorio(seededRng(5));
    const back = lerGenoma(genomaTexto(g), genomaAleatorio(seededRng(9)));
    expect(back.olhos).toEqual(g.olhos);
    expect(back.cabelo).toEqual(g.cabelo);
    expect(back.altura[0]).toBeCloseTo(Math.round(g.altura[0] * 100) / 100, 2);
    expect(back.sangue).toEqual(g.sangue);
  });
});

describe('elenco', () => {
  it('lê a ficha: sexo, traços no feminino, profissão, lugar, aparência; mortos ficam de fora', () => {
    const w = mundo();
    const cat = catalogo(null);
    const ps = w.entities.filter((e) => e.type === 'personagem').map((e) => pessoaDaFicha(e, w, cat, { inicio: INICIO, lugar: LUGAR }));
    const mira = ps.find((p) => p?.nome === 'Mira')!;
    const kael = ps.find((p) => p?.nome === 'Kael')!;
    expect(ps.find((p) => p?.nome === 'Velho Rei')).toBeUndefined();
    expect(mira.sexo).toBe('f');
    expect(mira.tracos).toEqual(expect.arrayContaining(['luxurioso', 'sociavel', 'mentiroso']));
    expect(mira.casa).toBe('Vale');
    expect(kael.prof).toBe('ferreiro');
    expect(kael.local).toBe(LUGAR);
    expect(olhosDe(kael.genes)).toBe('azuis');
    expect(kael.conjuge).toBe(`${W}/Personagens/Mira.md`);
    // a mesma ficha vira sempre a mesma pessoa
    const outra = pessoaDaFicha(w.entities.find((e) => e.name === 'Mira')!, w, cat, { inicio: INICIO, lugar: LUGAR })!;
    expect(outra.genes).toEqual(mira.genes);
  });

  it('povoa uma vila: famílias, profissões essenciais e nomes únicos', () => {
    const w = mundo();
    const el = elenco(w, 10);
    const fig = el.pessoas.filter((p) => !p.nota);
    expect(fig).toHaveLength(10);
    expect(new Set(el.pessoas.map((p) => p.nome)).size).toBe(el.pessoas.length);
    for (const p of fig) if (p.conjuge) expect(el.pessoas.find((x) => x.id === p.conjuge)?.conjuge).toBe(p.id);
    const profs = new Set(fig.map((p) => p.prof));
    expect(['taberneiro', 'curandeiro', 'guarda', 'sacerdote'].filter((x) => profs.has(x)).length).toBeGreaterThanOrEqual(2);
    expect(el.lacos.length).toBeGreaterThan(10);
  });
});

describe('simulação de vidas', () => {
  it('3 personagens + 10 figurantes vivem 20 anos: nascem, casam, brigam, morrem', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 10));
    const r = s.avancar(12 * 20);
    expect(r.meses).toBe(240);
    expect(s.t).toBe(INICIO + 240);
    const tipos = new Set(s.eventos.map((e) => e.tipo));
    expect(tipos.has('nascimento')).toBe(true);
    expect(s.eventos.filter((e) => e.cat === 'romance').length).toBeGreaterThan(3);
    expect(s.eventos.filter((e) => e.cat === 'conflito').length).toBeGreaterThan(0);
    expect(s.historia).toHaveLength(20);
    // os bebês herdam genes dos pais
    const bebe = s.todas().find((p) => p.nasc >= INICIO && p.pais[0] && p.pais[1])!;
    const mae = s.pessoa(bebe.pais[0]!)!;
    const pai = s.pessoa(bebe.pais[1]!)!;
    expect(bebe.genes.olhos.some((x) => mae.genes.olhos.includes(x))).toBe(true);
    expect(bebe.genes.olhos.some((x) => pai.genes.olhos.includes(x))).toBe(true);
  });

  it('é determinística: mesma semente, mesma história', () => {
    const w = mundo();
    const a = sim(w, elenco(w, 8));
    const b = sim(w, elenco(w, 8));
    a.avancar(120);
    b.avancar(120);
    expect(a.eventos.map((e) => e.texto)).toEqual(b.eventos.map((e) => e.texto));
  });

  it('adultério com atrito: o caso é segredo, a descoberta azeda o casamento', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 0));
    const kael = `${W}/Personagens/Kael.md`;
    const mira = `${W}/Personagens/Mira.md`;
    const tobias = `${W}/Personagens/Tobias.md`;
    expect(s.pessoa(mira)!.conjuge).toBe(kael);
    s.comando({ c: 'agir', a: tobias, b: mira, i: 'seduzir', garantir: true });
    expect(s.temVinc(tobias, mira, 'amantes')).toBe(true);
    const caso = s.segredos.find((x) => x.tipo === 'caso')!;
    expect(caso.sabem).not.toContain(kael);
    expect(s.eventos.some((e) => e.tipo === 'caso' && e.segredo)).toBe(true);
    const antes = s.opiniao(kael, mira);
    s.descobrir(s.pessoa(kael)!, s.pessoa(mira)!, s.pessoa(tobias)!, 'flagrando os dois');
    expect(s.opiniao(kael, mira)).toBeLessThan(antes - 30);
    expect(s.opiniao(kael, tobias)).toBeLessThan(-20);
    expect(s.eventos.some((e) => e.tipo === 'descoberta' && e.peso === 3)).toBe(true);
    expect(s.pessoa(mira)!.estados['vigiado']).toBeGreaterThan(s.t);
  });

  it('o caso acaba descoberto sozinho, com drama alto', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 0), 3);
    const [kael, mira, tobias] = ['Kael', 'Mira', 'Tobias'].map((n) => `${W}/Personagens/${n}.md`) as [string, string, string];
    s.comando({ c: 'ajuste', k: 'drama', v: 5 });
    s.comando({ c: 'proteger', p: mira, on: true });
    s.comando({ c: 'proteger', p: kael, on: true });
    s.comando({ c: 'agir', a: tobias, b: mira, i: 'seduzir', garantir: true });
    s.avancar(60, (e) => e.tipo === 'descoberta');
    expect(s.segredos.find((x) => x.tipo === 'caso')!.sabem).toContain(kael);
  });

  it('gravidez dura nove meses e o bebê nasce com a casa da família', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 0), 11);
    const [kael, mira] = ['Kael', 'Mira'].map((n) => `${W}/Personagens/${n}.md`) as [string, string];
    s.comando({ c: 'proteger', p: mira, on: true });
    const M = s.pessoa(mira)!;
    for (let i = 0; i < 200 && !M.gravidez; i++) s.conceber(M, s.pessoa(kael)!, 5);
    expect(M.gravidez).not.toBeNull();
    const n = s.todas().length;
    s.avancar(10);
    expect(s.todas().length).toBeGreaterThan(n);
    const bebe = s.todas().find((p) => p.pais[0] === mira)!;
    expect(bebe.pais[1]).toBe(kael);
    expect(s.eventos.some((e) => e.tipo === 'nascimento')).toBe(true);
  });

  it('quem você conduz decide: o pedido vira uma escolha e a história espera', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 0));
    const [kael, mira, tobias] = ['Kael', 'Mira', 'Tobias'].map((n) => `${W}/Personagens/${n}.md`) as [string, string, string];
    s.comando({ c: 'matar', p: kael, causa: 'de febre' });
    s.comando({ c: 'conduzir', p: mira, on: true });
    s.comando({ c: 'agir', a: tobias, b: mira, i: 'cortejar' });
    expect(s.decisoes).toHaveLength(1);
    const r = s.avancar(12);
    expect(r.parou).toBe('decisao');
    expect(r.meses).toBe(0);
    s.comando({ c: 'decidir', id: s.decisoes[0]!.id, opcao: 'aceitar' });
    expect(s.temVinc(tobias, mira, 'namoro')).toBe(true);
    expect(s.avancar(3).meses).toBe(3);
  });

  it('sussurrar paixão faz alguém se apaixonar', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 0));
    const [kael, mira, tobias] = ['Kael', 'Mira', 'Tobias'].map((n) => `${W}/Personagens/${n}.md`) as [string, string, string];
    void kael;
    const antes = s.atracao(mira, tobias);
    s.comando({ c: 'sussurrar', a: mira, b: tobias, tipo: 'paixao' });
    expect(s.atracao(mira, tobias)).toBeGreaterThan(antes + 20);
    expect(s.pessoa(mira)!.meta?.alvo).toBe(tobias);
    expect(s.eventos.at(-1)!.cat).toBe('voce');
  });

  it('romance só entre adultos e nunca entre família próxima', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 12, 5));
    s.avancar(12 * 25);
    for (const [k, set] of s.vinc) {
      if (!set.has('namoro') && !set.has('amantes') && !set.has('noivado')) continue;
      const [a, b] = k.split('|') as [string, string];
      expect(s.proximos(a, b)).toBe(false);
    }
    for (const p of s.todas()) {
      if (!p.conjuge) continue;
      const c = s.pessoa(p.conjuge)!;
      expect(s.proximos(p.id, c.id)).toBe(false);
    }
    for (const e of s.eventos.filter((x) => x.tipo === 'namoro' || x.tipo === 'caso' || x.tipo === 'casamento')) {
      for (const id of e.quem) {
        const p = s.pessoa(id)!;
        expect(Math.floor((e.t - p.nasc) / 12)).toBeGreaterThanOrEqual(18);
      }
    }
  });
});

describe('regras na simulação de vidas', () => {
  const REGRAS = `
traço "Sonâmbulo" "Sonâmbula":
  descrição "Anda dormindo."
  herdável 50%
  peso conversar -50%
  surge onde isto.idade > 10
  chance 100%

profissão "Alquimista":
  renda 12
  habilidade saber
  requer isto.saber pelo menos 30

gosto "Falcoaria"

quando casamento(a, b):
  crônica "{a} e {b} dançam a noite inteira."
  relação(a, b).afeto += 30

interação "Serenata" entre a em personagem, b em personagem onde atração(a, b) > 0:
  chance = 100%
  b.encantado = sim
  crônica "{a} canta para {b}."
`;

  it('traço, profissão e gosto declarados entram no catálogo; eventos e interações rodam', () => {
    const w = mundo([], REGRAS);
    const prog = compileRules(w.scripts ?? []);
    expect(prog.issues).toEqual([]);
    const cat = catalogo(prog);
    expect(cat.tracos.get('sonambulo')?.f).toBe('Sonâmbula');
    expect(cat.tracos.get('sonambulo')?.peso?.['conversar']).toBeCloseTo(0.5);
    expect(cat.profs.get('alquimista')?.renda).toBe(12);
    expect(cat.gostos).toContain('Falcoaria');

    const s = new Vidas(w, { nome: 'R', semente: 1, inicio: INICIO, lugar: LUGAR }, elenco(w, 4), { rules: prog });
    const [kael, mira] = ['Kael', 'Mira'].map((n) => `${W}/Personagens/${n}.md`) as [string, string];
    s.comando({ c: 'agir', a: kael, b: mira, i: 'casar' });
    // já casados: separa e casa de novo para disparar o evento
    s.terminar(s.pessoa(kael)!, s.pessoa(mira)!);
    const antes = s.visao(kael, mira).afeto;
    s.casar(s.pessoa(kael)!, s.pessoa(mira)!);
    expect(s.eventos.some((e) => e.cat === 'regra' && e.texto.includes('dançam a noite inteira'))).toBe(true);
    expect(s.visao(kael, mira).afeto).toBeGreaterThan(antes + 20);
    s.avancar(13);
    expect(s.issues).toEqual([]);
    expect(s.eventos.some((e) => e.texto.includes('canta para'))).toBe(true);
    expect(s.vivos().some((p) => p.campos['encantado'] === true)).toBe(true);
    // surge sozinho no aniversário de quem passou dos 10
    expect(s.vivos().some((p) => p.tracos.includes('sonambulo'))).toBe(true);
  });
});

describe('salvar e reabrir', () => {
  it('a nota guarda elenco e intervenções; reabrir refaz a mesma história', () => {
    const w = mundo();
    const el = elenco(w, 6);
    const s = sim(w, el);
    s.avancar(18);
    s.comando({ c: 'sussurrar', a: `${W}/Personagens/Tobias.md`, b: `${W}/Personagens/Mira.md`, tipo: 'paixao' });
    s.comando({ c: 'evento', tipo: 'festa', lugar: LUGAR, meses: 2 });
    s.avancar(30);
    const sv = saveDe(s, { elenco: el.pessoas, lacos: el.lacos, regras: regrasHash(w) });
    const texto = simNoteText(sv, w);
    expect(texto).toMatch(/^---\ntipo: simulação/);
    expect(texto).toContain('meses simulados: 48');
    const lido = readSim('Mundos/Aerth/Simulações/Teste.md', texto)!;
    expect(lido.registro).toHaveLength(2);
    const { sim: de, avisos } = abrirSim(lido, w, { rules: compileRules(w.scripts ?? []) });
    expect(avisos).toEqual([]);
    expect(de.t).toBe(s.t);
    expect(de.eventos.map((e) => e.texto)).toEqual(s.eventos.map((e) => e.texto));
    // e continua igual daqui para frente
    s.avancar(24);
    de.avancar(24);
    expect(de.eventos.map((e) => e.texto)).toEqual(s.eventos.map((e) => e.texto));
  });

  it('simulações não viram fichas: ficam em world.sims', () => {
    const w = mundo([{ path: `${W}/Simulações/Vila.md`, text: note('tipo: simulação\nmundo: Aerth') }]);
    expect(w.entities.some((e) => e.path.includes('Simulações'))).toBe(false);
    expect(w.sims).toEqual([`${W}/Simulações/Vila.md`]);
  });

  it('gravar nas fichas: família, genes e vida contada', () => {
    const w = mundo();
    const s = sim(w, elenco(w, 6));
    s.avancar(12 * 15);
    const fichas = fichasDaSimulacao(s);
    const kael = fichas.find((f) => f.nome === 'Kael')!;
    expect(kael.path).toBe(`${W}/Personagens/Kael.md`);
    expect(kael.props['genoma']).toMatch(/olhos A\/A/);
    expect(kael.props['personalidade']).toMatch(/abertura \d+/);
    const nova = fichas.find((f) => !f.path && s.pessoa(f.id)!.nasc >= INICIO);
    if (nova) {
      expect(nova.props['tipo']).toBe('personagem');
      expect(String(nova.props['mãe'] ?? nova.props['pai'])).toMatch(/^\[\[/);
    }
    // relida, a ficha gravada vira a mesma pessoa (genes e temperamento)
    const cat = catalogo(null);
    const props = Object.entries(kael.props).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v)}`).join('\n');
    const w2 = worldIndex([{ path: `${W}/Aerth.md`, text: note('tipo: mundo') }, { path: `${W}/Personagens/Kael.md`, text: note(`tipo: personagem\nmundo: Aerth\n${props}`) }]).find((x) => x.name === 'Aerth')!;
    const relido = pessoaDaFicha(w2.entities[0]!, w2, cat, { inicio: s.t, lugar: LUGAR })!;
    const orig = s.pessoa(`${W}/Personagens/Kael.md`)!;
    if (orig.morte === null) {
      expect(relido.genes.olhos).toEqual(orig.genes.olhos);
      expect(Math.round(relido.big5[0])).toBe(Math.round(orig.big5[0]));
    }
  });
});

describe('construtor de mecânicas', () => {
  it('o que o construtor escreve compila', () => {
    const codes = [
      mecanicaRegras({
        tipo: 'par', nome: 'Duelo de poesia', chance: 15, atracao: 'opinião(a, b)', cronica: '{a} desafia {b} num duelo de versos.',
        condicoes: [{ k: 'gosto', quem: 'a', gosto: 'poesia' }, { k: 'opiniao', de: 'a', op: '<', valor: 0 }, { k: 'traco', quem: 'b', traco: 'covarde', nao: true }, { k: 'vinculo', vinc: 'casados', nao: true }],
        efeitos: [{ k: 'relacao', de: 'b', eixo: 'respeito', delta: 10, mutuo: true }, { k: 'humor', quem: 'a', delta: 5 }, { k: 'disparar', evento: 'poesia' }],
      }),
      mecanicaRegras({
        tipo: 'solo', nome: 'Insônia', chance: 5, cronica: '{a} passa a noite em claro.',
        condicoes: [{ k: 'campo', quem: 'a', campo: 'estresse', op: '>', valor: '60' }], efeitos: [{ k: 'saude', quem: 'a', delta: -5 }, { k: 'ganhar', quem: 'a', traco: 'melancolico' }],
      }),
      mecanicaRegras({
        tipo: 'reacao', nome: 'Luto', evento: 'morte', chance: 100, cronica: 'A vila acende velas por {a}.', condicoes: [], efeitos: [],
      }),
      mecanicaRegras({
        tipo: 'reacao', nome: 'Festa da colheita', evento: 'ano', chance: 50, cronica: '{a} dança na festa da colheita.', condicoes: [{ k: 'adulto', quem: 'a' }], efeitos: [{ k: 'humor', quem: 'a', delta: 10 }],
      }),
    ];
    for (const c of codes) expect(compileRules([{ path: 'x.md', code: c }]).issues).toEqual([]);
    expect(codes[0]).toContain('interação "Duelo de poesia" entre a em personagem, b em personagem onde');
  });

  it('todas as receitas compilam', () => {
    for (const r of RECEITAS) expect({ nome: r.nome, issues: compileRules([{ path: 'x.md', code: r.codigo }]).issues }).toEqual({ nome: r.nome, issues: [] });
  });

  it('as receitas rodam na simulação sem erro', () => {
    const w = mundo([], RECEITAS.map((r) => r.codigo).join('\n'));
    const s = sim(w, elenco(w, 10));
    s.avancar(12 * 12);
    expect(s.issues).toEqual([]);
  }, 20000);
});
