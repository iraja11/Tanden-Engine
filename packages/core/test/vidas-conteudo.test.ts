import { describe, expect, it } from 'vitest';
import { Vidas, catalogo, compileRules, mesDe, pessoaDaFicha, povoar, worldIndex, type Pessoa, type World } from '../src/index';

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;
const W = 'Mundos/Aerth';
const LUGAR = `${W}/Lugares/Pedravale.md`;
const INICIO = mesDe(312);

function mundo(regras: string, extra: Array<{ path: string; text: string }> = []): World {
  return worldIndex([
    { path: `${W}/Aerth.md`, text: note('tipo: mundo\nano: 312') },
    { path: LUGAR, text: note('tipo: lugar\nmundo: Aerth') },
    { path: `${W}/Personagens/Kael.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: masculino\nnascimento: 288\nlocal: "[[Pedravale]]"') },
    { path: `${W}/Personagens/Mira.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: feminino\nnascimento: 290\nlocal: "[[Pedravale]]"') },
    ...extra,
    { path: `${W}/Regras/Regras.md`, text: `# Regras\n\n\`\`\`regras\n${regras}\n\`\`\`\n` },
  ]).find((x) => x.name === 'Aerth')!;
}

function simular(w: World, extras = 0, semente = 5) {
  const prog = compileRules(w.scripts ?? []);
  expect(prog.issues).toEqual([]);
  const cat = catalogo(prog, w.entities);
  const fichas = w.entities.filter((e) => e.type === 'personagem').map((e) => pessoaDaFicha(e, w, cat, { inicio: INICIO, lugar: LUGAR })).filter((p): p is Pessoa => !!p);
  const pov = povoar(cat, { quantos: extras, inicio: INICIO, lugar: LUGAR, semente, nomes: { estilo: 'iberico', amostras: [] }, existentes: fichas });
  return new Vidas(w, { nome: 'T', semente, inicio: INICIO, lugar: LUGAR }, { pessoas: [...fichas, ...pov.pessoas], lacos: pov.lacos }, { rules: prog });
}

describe('atributos', () => {
  const regras = `atributo "Sanidade":
  faixa 0 a 100
  média 70
  desvio 10
  herdável 80%
  categoria mental
  por ano -2

atributo "Fé" 0 a 10

atributo "Vontade":
  herdável 90%`;

  it('todo mundo nasce com valor na faixa, e muda por ano', () => {
    const s = simular(mundo(regras), 20);
    for (const p of s.vivos()) {
      const v = s.getCampo(p.id, 'sanidade') as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      const f = s.getCampo(p.id, 'fe') as number;
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(10);
    }
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    const antes = kael.campos['sanidade'] as number;
    s.avancar(12);
    expect(kael.campos['sanidade']).toBeCloseTo(Math.max(0, antes - 2), 5);
  });

  it('filhos puxam aos pais (herdável)', () => {
    const s = simular(mundo(regras), 40, 9);
    s.avancar(12 * 25);
    const filhos = s.todas().filter((p) => p.nasc >= INICIO && p.pais[0] && p.pais[1]);
    expect(filhos.length).toBeGreaterThan(3);
    let erroPais = 0;
    let erroAleatorio = 0;
    for (const f of filhos) {
      const m = s.pessoa(f.pais[0]!)!.campos['vontade'] as number;
      const pai = s.pessoa(f.pais[1]!)!.campos['vontade'] as number;
      erroPais += Math.abs((f.campos['vontade'] as number) - (m + pai) / 2);
      erroAleatorio += Math.abs((f.campos['vontade'] as number) - 50);
    }
    expect(erroPais).toBeLessThan(erroAleatorio * 0.6);
  });

  it('regras mudam e leem o atributo, sempre dentro da faixa', () => {
    const s = simular(mundo(`${regras}

quando ano em personagem:
  personagem.fé += 50`));
    s.avancar(13);
    for (const p of s.vivos()) expect(p.campos['fe']).toBe(10);
  });
});

describe('espécies e criaturas', () => {
  const regras = `espécie "Elfo" "Elfos":
  vida 700
  maioridade 100
  fertilidade 40%
  altura 185
  intelecto +15
  traço "longevo"
  cruza com "Humano" gera "Meio-elfo"
  frequência 50%

espécie "Humano"

espécie "Meio-elfo":
  vida 180
  maioridade 20

criatura "Lobo" "Lobos":
  vida 12
  maioridade 2
  gestação 2
  frequência 30%`;

  it('lê a declaração', () => {
    const prog = compileRules([{ path: 'r', code: regras }]);
    expect(prog.issues).toEqual([]);
    const elfo = prog.species.find((x) => x.id === 'elfo')!;
    expect(elfo).toMatchObject({ life: 700, adult: 100, fertility: 0.4, height: 185, traits: ['longevo'], frequency: 0.5 });
    expect(elfo.mods).toEqual({ intelecto: 15 });
    expect(elfo.crosses).toEqual([{ with: 'humano', gives: 'Meio-elfo' }]);
    expect(prog.species.find((x) => x.id === 'lobo')!.creature).toBe(true);
  });

  it('elfo de 50 anos ainda é criança; lobo de 3 é adulto', () => {
    const w = mundo(regras, [
      { path: `${W}/Personagens/Lia.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: feminino\nnascimento: 262\nespécie: Elfo\nlocal: "[[Pedravale]]"') },
      { path: `${W}/Personagens/Garra.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: feminino\nnascimento: 309\nespécie: Lobo\nlocal: "[[Pedravale]]"') },
    ]);
    const s = simular(w);
    const lia = s.pessoa(`${W}/Personagens/Lia.md`)!;
    const garra = s.pessoa(`${W}/Personagens/Garra.md`)!;
    expect(s.idade(lia)).toBe(50);
    expect(s.adulto(lia)).toBe(false);
    expect(lia.tracos).toContain('longevo');
    expect(s.getCampo(lia.id, 'especie')).toBe('Elfo');
    expect(s.adulto(garra)).toBe(true);
    expect(s.criatura(garra)).toBe(true);
    // lobo e gente: nada de romance
    expect(s.podeRomance(garra.id, `${W}/Personagens/Kael.md`)).toBe(false);
  });

  it('figurantes: famílias de elfos com idades de elfo, lobos soltos', () => {
    const s = simular(mundo(regras), 40, 3);
    const elfos = s.vivos().filter((p) => p.especie === 'Elfo');
    const lobos = s.vivos().filter((p) => p.especie === 'Lobo');
    expect(elfos.length).toBeGreaterThan(3);
    expect(lobos.length).toBeGreaterThan(0);
    for (const e of elfos.filter((x) => s.adulto(x))) expect(s.idade(e)).toBeGreaterThanOrEqual(100);
    for (const l of lobos) {
      expect(l.prof).toBeNull();
      expect(l.conjuge).toBeNull();
      expect(l.nome.startsWith('Lobo ')).toBe(true);
    }
  });

  it('criatura não conversa com gente', () => {
    const s = simular(mundo(regras), 30, 4);
    s.avancar(24);
    const lobos = new Set(s.todas().filter((p) => p.especie === 'Lobo').map((p) => p.id));
    const sociais = s.eventos.filter((e) => e.cat === 'social' && e.quem.some((q) => lobos.has(q)) && e.quem.some((q) => !lobos.has(q)));
    expect(sociais).toEqual([]);
  });

  it('elfo com humano gera meio-elfo', () => {
    const w = mundo(regras, [
      { path: `${W}/Personagens/Lia.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: feminino\nnascimento: 150\nespécie: Elfo\nlocal: "[[Pedravale]]"\ncônjuge: "[[Kael]]"') },
    ]);
    const s = simular(w);
    const lia = s.pessoa(`${W}/Personagens/Lia.md`)!;
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    expect(s.podeRomance(lia.id, kael.id)).toBe(true);
    let nasceu: Pessoa | undefined;
    for (let i = 0; i < 40 && !nasceu; i++) {
      s.conceber(lia, kael, 50);
      s.avancar(10);
      nasceu = s.todas().find((p) => p.pais[0] === lia.id);
    }
    expect(nasceu?.especie).toBe('Meio-elfo');
    expect(nasceu?.vida).toBe(180);
  });

  it('espécie de ficha (tipo: espécie) vale também', () => {
    const w = mundo('', [
      { path: `${W}/Espécies/Anão.md`, text: note('tipo: especie\nmundo: Aerth\nexpectativa de vida: 300\nmaioridade: 40\naltura: 135') },
      { path: `${W}/Personagens/Brom.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: masculino\nnascimento: 282\nespécie: "[[Anão]]"\nlocal: "[[Pedravale]]"') },
    ]);
    const s = simular(w);
    const brom = s.pessoa(`${W}/Personagens/Brom.md`)!;
    expect(s.adulto(brom)).toBe(false);
    expect(s.aparencia(brom).altura).toBeLessThan(140);
  });
});

describe('tramas em etapas', () => {
  const regras = `trama "Sedução lenta" entre a em personagem, b em personagem onde a.adulto e b.adulto e a.sexo != b.sexo:
  chance = 100%
  etapa "Olhares":
    dura 2 meses
    relação(b, a).atração += 5
    crônica "{a} começa a rondar {b}."
  etapa "Convite":
    se a.nome = "Kael":
      falhar "{b} ri na cara de {a}."
    crônica "{b} aceita o convite de {a}."
  etapa "Noite":
    a.conquistas += 1
  ao concluir:
    crônica "{a} conquista {b}."
  ao falhar:
    a.humor -= 30`;

  it('lê etapas, duração e saídas', () => {
    const prog = compileRules([{ path: 'r', code: regras }]);
    expect(prog.issues).toEqual([]);
    const t = prog.schemes[0]!;
    expect(t.stages.map((x) => x.name)).toEqual(['Olhares', 'Convite', 'Noite']);
    expect(t.onDone.length).toBe(1);
    expect(t.onFail.length).toBe(1);
  });

  it('anda etapa por etapa, com espera, e termina bem ou mal', () => {
    const s = simular(mundo(regras));
    const mira = `${W}/Personagens/Mira.md`;
    const kael = `${W}/Personagens/Kael.md`;
    s.avancar(1);
    const textos = () => s.eventos.filter((e) => e.cat === 'regra').map((e) => e.texto);
    expect(textos().some((t) => t.includes('começa a rondar'))).toBe(true);
    expect(s.tramas(mira).length).toBeGreaterThan(0);
    expect(s.tramas(mira)[0]!.etapa).toBe('Convite');
    // a segunda etapa só vem depois de "dura 2 meses"
    expect(textos().some((t) => t.includes('aceita o convite') || t.includes('ri na cara'))).toBe(false);
    s.avancar(3);
    expect(textos().some((t) => t.includes('ri na cara de [[Kael]]'))).toBe(true);
    expect(s.pessoa(kael)!.humor).toBeLessThan(0);
    s.avancar(3);
    expect(textos().some((t) => t.includes('[[Mira]] conquista [[Kael]]'))).toBe(true);
    expect(s.pessoa(mira)!.campos['conquistas']).toBeGreaterThanOrEqual(1);
  });

  it('seguir fora de trama é erro', () => {
    const s = simular(mundo(`quando mês:\n  seguir`));
    s.avancar(1);
    expect(s.issues.some((i) => /só vale dentro de uma etapa de trama/.test(i.message))).toBe(true);
  });
});

describe('valores e relações', () => {
  it('ódio, campos livres de relação e condições por valor', () => {
    const s = simular(mundo(`quando início:
  relação(ficha("Kael"), ficha("Mira")).afeto = -80
  relação(ficha("Kael"), ficha("Mira")).dívida = 30

interação "Cobrança" entre a em personagem, b em personagem onde ódio(a, b) > 50 e relação(a, b).dívida > 0:
  chance = 100%
  relação(a, b).dívida -= 10
  crônica "{a} cobra {b}."`));
    const k = `${W}/Personagens/Kael.md`;
    const m = `${W}/Personagens/Mira.md`;
    expect(s.getCampo(`rel:${k}>${m}`, 'odio')).toBeGreaterThan(50);
    s.avancar(1);
    expect(s.getCampo(`rel:${k}>${m}`, 'divida')).toBe(20);
    expect(s.eventos.some((e) => e.texto.includes('[[Kael]] cobra [[Mira]]'))).toBe(true);
  });
});

describe('construtor', () => {
  it('cada formulário escreve regras que compilam', async () => {
    const { tracoRegras, atributoRegras, especieRegras, profissaoRegras, mecanicaRegras } = await import('../src/index');
    const codes = [
      tracoRegras({ nome: 'Sonâmbulo', feminino: 'Sonâmbula', desc: 'Anda dormindo.', categoria: 'congenito', oposto: '', herdavel: 25,
        pesos: [{ interacao: 'flertar', mult: 0.5 }, { interacao: 'estudar', mult: 2 }], afinidades: [{ traco: '', pontos: 10 }, { traco: 'devoto', pontos: -5 }],
        humor: -3, estresse: 4, surge: [{ k: 'valor', alvo: 'pessoa', quem: 'a', campo: 'estresse', op: '>=', valor: '70' }], chanceSurge: 20 }),
      atributoRegras({ nome: 'Força de vontade', min: 0, max: 20, media: 10, desvio: 3, herdavel: 40, categoria: 'mental', porAno: 0.5, desc: '' }),
      especieRegras({ nome: 'Orc', plural: 'Orcs', criatura: false, vida: 50, maioridade: 12, fertilidade: 150, gestacao: 7, altura: 190,
        ajustes: [{ campo: 'força', valor: 20 }, { campo: 'Força de vontade', valor: 3 }], tracos: ['irascivel'], cruzas: [{ com: 'Humano', gera: 'Meio-orc' }], frequencia: 20, desc: '' }),
      profissaoRegras({ nome: 'Caçador de recompensas', feminino: 'Caçadora de recompensas', renda: 9, habilidade: 'combate', status: 2, risco: 2, viaja: true,
        requer: [{ k: 'valor', alvo: 'pessoa', quem: 'a', campo: 'combate', op: '>=', valor: '5' }] }),
      mecanicaRegras({ tipo: 'trama', nome: 'Vendeta', chance: 100, condicoes: [{ k: 'valor', alvo: 'relacao', quem: 'a', campo: 'odio', op: '>', valor: '50' }], efeitos: [], cronica: '',
        etapas: [
          { nome: 'Juramento', dura: 2, efeitos: [{ k: 'relcampo', de: 'a', campo: 'vendeta', op: '=', valor: 'sim' }], cronica: '{a} jura vingança contra {b}.', condicoes: [], senao: 'falhar', cronicaSenao: '' },
          { nome: 'Emboscada', dura: 1, efeitos: [{ k: 'lutar', modo: 'emboscada' }], cronica: '', condicoes: [{ k: 'chance', pct: 50 }], senao: 'repetir', cronicaSenao: '{a} espera a hora certa.' },
        ],
        aoConcluir: { efeitos: [], cronica: 'A vendeta de {a} chega ao fim.' }, aoFalhar: { efeitos: [{ k: 'humor', quem: 'a', delta: -10 }], cronica: '' } }),
    ];
    const prog = compileRules(codes.map((code, i) => ({ path: `c${i}`, code })));
    expect(prog.issues).toEqual([]);
    expect(prog.species[0]!.mods).toEqual({ forca: 20, 'forca de vontade': 3 });
    expect(prog.schemes[0]!.stages.length).toBe(2);
    expect(prog.traits[0]!.weights).toEqual({ flertar: 0.5, estudar: 2 });
    // a trama montada roda numa simulação de verdade
    const s = simular(mundo(codes.join('\n') + `\nquando início:\n  relação(ficha("Kael"), ficha("Mira")).afeto = -90\n  relação(ficha("Mira"), ficha("Kael")).afeto = -90`), 6, 2);
    s.avancar(12);
    expect(s.eventos.some((e) => e.texto.includes('jura vingança'))).toBe(true);
  });
});

describe('texto com variação', () => {
  it('sorteia opções (com {a} dentro) e concorda o gênero', () => {
    const s = simular(mundo(`quando mês em personagem:
  crônica "{personagem} acorda {cansado|exausto|moído}, {personagem:sozinho/sozinha}. {{personagem} boceja|Ninguém repara}."`));
    s.avancar(6);
    const t = s.eventos.filter((e) => e.cat === 'regra').map((e) => e.texto);
    expect(t.some((x) => x.startsWith('[[Mira]]') && x.includes('sozinha'))).toBe(true);
    expect(t.some((x) => x.startsWith('[[Kael]]') && x.includes('sozinho.'))).toBe(true);
    expect(new Set(t.map((x) => /acorda (\w+)/.exec(x)?.[1])).size).toBeGreaterThan(1);
    expect(t.some((x) => x.includes('[[Kael]] boceja') || x.includes('[[Mira]] boceja'))).toBe(true);
    expect(t.every((x) => !x.includes('{'))).toBe(true);
  });
});

describe('itens', () => {
  const regras = `item "Espada de Aurora":
  único
  tipo arma
  raridade lendária
  valor 500
  descrição "Brilha quando há mentira por perto."
  combate +6
  sanidade +5
  traço "corajoso"
  dono "Kael"
  ao ganhar:
    crônica "A espada aceita {dono}."

item "Anel Negro":
  único
  cobiçado
  por mês sanidade -2
  em "Pedravale"

atributo "Sanidade":
  média 50
  desvio 0`;

  it('dono inicial, ajustes e traço enquanto possui; perder tira o traço', () => {
    const s = simular(mundo(regras));
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    expect(kael.itens).toEqual(['espada de aurora']);
    expect(kael.tracos).toContain('corajoso');
    expect(s.getCampo(kael.id, 'combate')).toBeCloseTo(kael.hab.combate + 6, 1);
    expect(s.getCampo(kael.id, 'sanidade')).toBe(55);
    expect(s.getCampo(kael.id, 'itens')).toEqual(['Espada de Aurora']);
    s.comando({ c: 'item', p: kael.id, item: 'espada de aurora', on: false });
    expect(kael.tracos).not.toContain('corajoso');
    expect(s.perdidos.get('espada de aurora')).toBe(LUGAR);
    // dar a outra pessoa roda "ao ganhar"
    const mira = s.pessoa(`${W}/Personagens/Mira.md`)!;
    s.comando({ c: 'item', p: mira.id, item: 'espada de aurora', on: true });
    expect(s.donoDe('espada de aurora')).toBe(mira);
    expect(s.eventos.some((e) => e.texto.includes('A espada aceita [[Mira]]'))).toBe(true);
  });

  it('herança na morte, item largado é achado, maldição por mês', () => {
    const s = simular(mundo(regras), 10, 3);
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    s.morrer(kael, 'de repente');
    const r = s.reliquias().find((x) => x.item.id === 'espada de aurora')!;
    // sem filhos adultos nem cônjuge: fica largada, ou foi herdada por alguém
    expect(r.dono === null ? r.lugar : r.dono.id).toBeTruthy();
    s.avancar(12 * 15);
    const anel = s.reliquias().find((x) => x.item.id === 'anel negro')!;
    expect(anel.historia.length).toBeGreaterThan(1);
    if (anel.dono) expect(anel.dono.campos['sanidade']).toBeLessThan(50);
  });

  it('ficha tipo: item vira item único com ajustes', () => {
    const w = mundo('', [{ path: `${W}/Itens/Coroa de Ferro.md`, text: note('tipo: item\nmundo: Aerth\ndono: "[[Mira]]"\nvalor: 900\najustes: "lábia +4, beleza +10"\nconcede: orgulhoso') }]);
    const s = simular(w);
    const mira = s.pessoa(`${W}/Personagens/Mira.md`)!;
    expect(mira.itens).toEqual(['coroa de ferro']);
    expect(mira.tracos).toContain('orgulhoso');
    expect(s.getCampo(mira.id, 'labia')).toBeCloseTo(mira.hab.labia + 4, 1);
    expect(s.reliquias()[0]!.item.nota).toBe(`${W}/Itens/Coroa de Ferro.md`);
  });

  it('funções das regras: dar_item, tem_item, dono', () => {
    const s = simular(mundo(`${regras}

quando início:
  dar_item(ficha("Mira"), "Anel Negro")
  se tem_item(ficha("Mira"), "Anel Negro") e dono("Espada de Aurora") = ficha("Kael"):
    crônica "ok {dono(\\"Anel Negro\\")}"`));
    expect(s.eventos.some((e) => e.texto === 'ok [[Mira]]')).toBe(true);
  });
});

describe('eventos do mundo e espécies variadas', () => {
  it('evento declarado começa, roda todo mês e acaba', () => {
    const s = simular(mundo(`evento "Lua de Sangue":
  dura 3 meses
  descrição "o céu fica vermelho"
  peso brigar * 3
  todo mês:
    personagem.medo += 1
  ao acabar:
    crônica "O céu volta ao normal."`));
    expect(s.comecarEvento('Lua de Sangue', null, true)).toBe(true);
    s.avancar(5);
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    expect(kael.campos['medo']).toBe(3);
    expect(s.eventosAtivos.length).toBe(0);
    expect(s.eventos.some((e) => e.texto.includes('O céu volta ao normal'))).toBe(true);
  });

  it('espécie com traços possíveis e atributo só dela', () => {
    const s = simular(mundo(`espécie "Tiefling":
  pode ter "irascivel" 100%, "belo" 0%
  frequência 100%

atributo "Chifres" 0 a 10:`.replace(' 0 a 10:', ' 0 a 10') + `

atributo "Envergadura":
  só para "Dragão"`), 12, 4);
    const tief = s.vivos().filter((p) => p.especie === 'Tiefling');
    expect(tief.length).toBeGreaterThan(5);
    for (const p of tief) {
      expect(p.tracos).toContain('irascivel');
      expect(p.tracos).not.toContain('belo');
      expect(p.campos['envergadura']).toBeUndefined();
      expect(typeof p.campos['chifres']).toBe('number');
    }
  });

  it('traço com ajuste muda força', () => {
    const s = simular(mundo(`traço "Gigante de sangue":
  ajuste força +30`));
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    const antes = s.atrib(kael).forca;
    s.comando({ c: 'traco', p: kael.id, add: 'gigante de sangue' });
    expect(s.atrib(kael).forca).toBeGreaterThan(antes);
  });
});

describe('construtor: item e evento', () => {
  it('escrevem regras que compilam e funcionam', async () => {
    const { itemRegras, eventoRegras, tracoRegras, especieRegras, atributoRegras } = await import('../src/index');
    const codes = [
      itemRegras({ nome: 'Cálice', unico: true, tipo: 'relíquia', raridade: 'rara', valor: 300, desc: 'Nunca esvazia.', ajustes: [{ campo: 'saber', valor: 3 }],
        porMes: [{ campo: 'humor', valor: 1 }], tracos: ['devoto'], dono: 'Mira', lugar: '', cobicado: true,
        aoGanhar: { efeitos: [{ k: 'campo', quem: 'a', campo: 'fe', op: '+=', valor: '5' }], cronica: '{dono} {bebe|prova} do cálice.' },
        aoPerder: { efeitos: [], cronica: '' }, todoMes: { efeitos: [], cronica: '', condicoes: [] } }),
      eventoRegras({ nome: 'Neblina', desc: 'ninguém enxerga nada', chance: 0, dura: 2, global: true, pesos: [{ interacao: 'roubar', mult: 3 }],
        aoComecar: 'A neblina desce.', aoAcabar: 'A neblina se vai.',
        todoMes: { efeitos: [{ k: 'campo', quem: 'a', campo: 'estresse', op: '+=', valor: '2' }], cronica: '', condicoes: [{ k: 'chance', pct: 50 }] } }),
      tracoRegras({ nome: 'Forte como touro', feminino: '', desc: '', categoria: 'congenito', oposto: '', herdavel: 0, pesos: [], afinidades: [], humor: 0, estresse: 0,
        ajustes: [{ campo: 'força', valor: 20 }], surge: [], chanceSurge: 20 }),
      especieRegras({ nome: 'Tiefling', plural: '', criatura: false, vida: 90, maioridade: 0, fertilidade: 100, gestacao: 9, altura: 0, ajustes: [], tracos: [],
        talvez: [{ traco: 'irascivel', pct: 40 }, { traco: 'belo', pct: 10 }], cruzas: [], frequencia: 0, desc: '' }),
      atributoRegras({ nome: 'Envergadura', min: 0, max: 30, media: 10, desvio: 2, herdavel: 50, categoria: 'físico', porAno: 0, desc: '', so: ['Dragão'] }),
    ];
    const prog = compileRules(codes.map((code, i) => ({ path: `c${i}`, code })));
    expect(prog.issues).toEqual([]);
    expect(prog.species[0]!.maybe).toEqual({ irascivel: 0.4, belo: 0.1 });
    expect(prog.attributes[0]!.only).toEqual(['dragao']);
    expect(prog.traits[0]!.mods).toEqual({ forca: 20 });
    const s = simular(mundo(codes.join('\n')));
    expect(s.pessoa(`${W}/Personagens/Mira.md`)!.itens).toEqual(['calice']);
    expect(s.comecarEvento('Neblina', null, true)).toBe(true);
    s.avancar(3);
    expect(s.eventos.some((e) => e.texto.includes('A neblina se vai.'))).toBe(true);
  });
});
