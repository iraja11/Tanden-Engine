import { describe, expect, it } from 'vitest';
import { ACONTECIMENTOS, Vidas, anoDe, catalogo, compileRules, mesDe, pessoaDaFicha, povoar, worldIndex, type Pessoa, type World } from '../src/index';

// Profundidade do world building: povos (etnias), filtros de quem pode ter um
// traço ou atributo, vínculos inventados pelo mundo, guerras simultâneas entre
// facções e acontecimentos com tom (fantasia, cômico, adulto, sério).

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;
const W = 'Mundos/Aerth';
const LUGAR = `${W}/Lugares/Pedravale.md`;
const FORTE = `${W}/Lugares/Forte Cinza.md`;
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

function simular(w: World, extras = 0, semente = 5, lugar = LUGAR) {
  const prog = compileRules(w.scripts ?? []);
  expect(prog.issues).toEqual([]);
  const cat = catalogo(prog, w.entities);
  const fichas = w.entities.filter((e) => e.type === 'personagem').map((e) => pessoaDaFicha(e, w, cat, { inicio: INICIO, lugar })).filter((p): p is Pessoa => !!p);
  const pov = povoar(cat, { quantos: extras, inicio: INICIO, lugar, semente, nomes: { estilo: 'iberico', amostras: [] }, existentes: fichas });
  return new Vidas(w, { nome: 'T', semente, inicio: INICIO, lugar }, { pessoas: [...fichas, ...pov.pessoas], lacos: pov.lacos }, { rules: prog });
}

describe('linguagem: declarações novas', () => {
  it('etnia, vínculo, filtros e tom compilam com os campos certos', () => {
    const prog = compileRules([{ path: 'r', code: `etnia "Nórdico" "Nórdicos":
  descrição "Gente do gelo."
  olhos "azul" 70%
  cabelo "loiro" 60%
  altura +6
  força +5
  nomes "Bjorn", "Erik"
  nomes femininos "Astrid", "Sigrid"
  sobrenomes "Ragnarsson"
  gostos "o mar"
  frequência 50%
  afinidade "Sulista" -15
  afinidade +8

vínculo "Mentor e aprendiz":
  símbolo 🎓
  papéis "mentor", "aprendiz"
  exclusivo
  opinião +10
  peso brigar -80%
  por mês respeito +1
  surge onde a.idade > 40 e b.idade < 25
  chance 30%
  para espécie "Humano"

traço "Sangue de dragão" "Sangue de dragão":
  categoria congenito
  nasce com 20%
  para etnia "Nórdico" e sexo feminino

atributo "Fúria":
  faixa 0 a 10
  para idade 16 a 60

interação "Tropeço" de p em personagem:
  tom cômico
  chance = 10%
  crônica "{p} tropeça."

evento "Chuva de sapos":
  tom fantasia
  chance 5%
  para sexo masculino
  todo mês:
    personagem.humor -= 1` }]);
    expect(prog.issues).toEqual([]);
    const et = prog.ethnicities[0]!;
    expect(et.id).toBe('nordico');
    expect(et.eyes['azul']).toBeCloseTo(0.7);
    expect(et.namesF).toEqual(['Astrid', 'Sigrid']);
    expect(et.namesM).toEqual(['Bjorn', 'Erik']);
    expect(et.affinity['sulista']).toBe(-15);
    expect(et.affinity['']).toBe(8);
    expect(et.mods['forca']).toBe(5);
    const v = prog.bonds[0]!;
    expect(v.roles).toEqual(['mentor', 'aprendiz']);
    expect(v.exclusive).toBe(true);
    expect(v.weights['brigar']).toBeCloseTo(0.2);
    expect(v.perMonth['respeito']).toBe(1);
    expect(v.emergeChance).toBeCloseTo(0.3);
    expect(v.filter.species).toEqual(['humano']);
    const t = prog.traits[0]!;
    expect(t.birth).toBeCloseTo(0.2);
    expect(t.filter).toMatchObject({ ethnicities: ['nordico'], sex: 'f' });
    expect(prog.attributes[0]!.filter).toMatchObject({ minAge: 16, maxAge: 60 });
    expect(prog.interactions[0]!.tone).toBe('comico');
    expect(prog.events[0]!.tone).toBe('fantasia');
    expect(prog.events[0]!.filter.sex).toBe('m');
  });

  it('tom desconhecido e filtro errado dão erro com linha', () => {
    const prog = compileRules([{ path: 'r', code: 'traço "X":\n  para cor "azul"\n\ninteração "Y" de p em personagem:\n  tom trágico\n  chance = 1%' }]);
    expect(prog.issues.length).toBe(2);
    expect(prog.issues[0]!.line).toBe(2);
  });
});

const POVOS = `etnia "Nórdico" "Nórdicos":
  nomes "Bjorn", "Erik", "Ulf"
  nomes femininos "Astrid", "Sigrid", "Freya"
  sobrenomes "Ragnarsson"
  frequência 50%
  afinidade "Sulista" -25
  afinidade +10

etnia "Sulista" "Sulistas":
  nomes "Amir", "Tariq"
  nomes femininos "Leila", "Zara"
  sobrenomes "al-Rashid"
  frequência 50%
  afinidade "Nórdico" -25`;

describe('povos (etnias)', () => {
  it('figurantes chegam em famílias de um povo, com nomes do povo', () => {
    const s = simular(mundo(POVOS), 40);
    const fig = s.vivos().filter((p) => !p.nota);
    const nord = fig.filter((p) => p.etnia === 'nordico');
    const sul = fig.filter((p) => p.etnia === 'sulista');
    expect(nord.length).toBeGreaterThan(5);
    expect(sul.length).toBeGreaterThan(5);
    for (const p of nord) expect(p.nome).toMatch(/Ragnarsson/);
    // casais são do mesmo povo
    for (const p of fig) if (p.conjuge && s.pessoa(p.conjuge)) expect(s.pessoa(p.conjuge)!.etnia).toBe(p.etnia);
  });

  it('preconceito: gente de outro povo é vista pior que a do próprio', () => {
    const s = simular(mundo(POVOS), 40);
    const fig = s.vivos().filter((p) => !p.nota && s.adulto(p));
    let mesmo = 0, nm = 0, outro = 0, no = 0;
    for (const a of fig) for (const b of fig) {
      if (a === b) continue;
      if (a.etnia === b.etnia) { mesmo += s.compat(a.id, b.id); nm++; } else { outro += s.compat(a.id, b.id); no++; }
    }
    expect(mesmo / nm).toBeGreaterThan(outro / no + 15);
  });

  it('filhos herdam o povo dos pais e as regras leem p.etnia', () => {
    const s = simular(mundo(`${POVOS}

quando nascimento(bebê, mãe, pai):
  bebê.marca = etnia(bebê)`), 40, 9);
    s.avancar(12 * 15);
    const filhos = s.todas().filter((p) => p.nasc >= INICIO && p.pais[0] && p.pais[1]);
    expect(filhos.length).toBeGreaterThan(2);
    for (const f of filhos) {
      const pais = [s.pessoa(f.pais[0]!)!.etnia, s.pessoa(f.paiOficial ?? f.pais[1]!)!.etnia];
      if (pais[0] || pais[1]) expect(pais).toContain(f.etnia);
      expect(f.campos['marca']).toBe(s.etniaNome(f));
    }
  });

  it('a ficha diz o povo (texto ou link para uma ficha tipo: cultura)', () => {
    const w = mundo(POVOS, [
      { path: `${W}/Personagens/Ulf.md`, text: note('tipo: personagem\nmundo: Aerth\nsexo: masculino\nnascimento: 280\netnia: nórdica') },
    ]);
    const s = simular(w, 0);
    expect(s.pessoa(`${W}/Personagens/Ulf.md`)!.etnia).toBe('nordico');
  });
});

describe('filtros: quem pode ter', () => {
  it('traço com "nasce com 100%" só para mulheres de um povo', () => {
    const s = simular(mundo(`${POVOS}

traço "Vidente das runas" "Vidente das runas":
  nasce com 100%
  para etnia "Nórdico" e sexo feminino`), 50);
    let tem = 0;
    for (const p of s.vivos()) {
      const deve = p.etnia === 'nordico' && p.sexo === 'f';
      expect(p.tracos.includes('vidente das runas')).toBe(deve);
      if (deve) tem++;
    }
    expect(tem).toBeGreaterThan(3);
  });

  it('atributo só para uma faixa de idade aparece quando a idade chega', () => {
    const s = simular(mundo(`atributo "Fúria":
  faixa 0 a 10
  para idade 30 a 200`), 30);
    for (const p of s.vivos()) expect(typeof p.campos['furia'] === 'number').toBe(s.idade(p) >= 30);
  });

  it('profissão "para sexo" só vai para quem passa', () => {
    const s = simular(mundo(`profissão "Valquíria":
  renda 30
  habilidade combate
  para sexo feminino`), 40, 3);
    s.avancar(12 * 20);
    for (const p of s.todas()) if (p.prof === 'valquiria') expect(p.sexo).toBe('f');
  });
});

describe('vínculos inventados pelo mundo', () => {
  const REG = `vínculo "Irmãos de sangue":
  símbolo 🩸
  opinião +25
  por mês afeto +1
  surge onde opinião(a, b) > 20
  chance 100%

vínculo "Mentor e aprendiz":
  papéis "mentor", "aprendiz"
  exclusivo`;

  it('surgem sozinhos entre quem se cruza e pesam na opinião', () => {
    const s = simular(mundo(REG), 30);
    s.avancar(24);
    const pares = [...s.vinc].filter(([, set]) => set.has('irmaos de sangue'));
    expect(pares.length).toBeGreaterThan(0);
    const [k] = pares.find(([x]) => { const [p, q] = x.split('|') as [string, string]; return s.opiniao(p, q) < 75; }) ?? pares[0]!;
    const [a, b] = k.split('|') as [string, string];
    expect(s.getCampo(a, 'irmaos de sangue')).toBeTruthy();
    expect(s.eventos.some((e) => e.tipo === 'vinculo' && e.texto.includes('🩸'))).toBe(true);
    const com = s.opiniao(a, b);
    s.comando({ c: 'vinculo', a, b, v: 'irmaos de sangue', on: false });
    expect(s.opiniao(a, b)).toBeLessThan(com);
  });

  it('papéis e exclusividade: um aprendiz tem um mentor só', () => {
    const s = simular(mundo(REG), 10);
    const [a, b, c] = s.vivos().filter((p) => s.adulto(p));
    s.comando({ c: 'vinculo', a: a!.id, b: b!.id, v: 'mentor e aprendiz', on: true });
    expect(s.papel(a!.id, b!.id, 'mentor e aprendiz')).toBe('mentor');
    expect(s.papel(b!.id, a!.id, 'mentor e aprendiz')).toBe('aprendiz');
    s.comando({ c: 'vinculo', a: c!.id, b: b!.id, v: 'mentor e aprendiz', on: true });
    expect(s.temVinc(a!.id, b!.id, 'mentor e aprendiz')).toBe(false);
    expect(s.temVinc(c!.id, b!.id, 'mentor e aprendiz')).toBe(true);
  });
});

function mundoEmGuerra(extra = '') {
  return mundo(extra, [
    { path: FORTE, text: note('tipo: lugar\nmundo: Aerth\ngovernante: "[[Corvos]]"') },
    { path: `${W}/Lugares/Vau.md`, text: note('tipo: lugar\nmundo: Aerth\ngovernante: "[[Leões]]"') },
    { path: `${W}/Lugares/Ermo.md`, text: note('tipo: lugar\nmundo: Aerth\ngovernante: "[[Serpentes]]"') },
    { path: LUGAR, text: note('tipo: lugar\nmundo: Aerth\ngovernante: "[[Leões]]"') },
    { path: `${W}/Facções/Leões.md`, text: note('tipo: facção\nmundo: Aerth\npoder: 6\ninimigos: "[[Corvos]]"') },
    { path: `${W}/Facções/Corvos.md`, text: note('tipo: facção\nmundo: Aerth\npoder: 5') },
    { path: `${W}/Facções/Serpentes.md`, text: note('tipo: facção\nmundo: Aerth\npoder: 4') },
  ]);
}
const LEOES = `${W}/Facções/Leões.md`;
const CORVOS = `${W}/Facções/Corvos.md`;
const SERPENTES = `${W}/Facções/Serpentes.md`;

describe('guerras simultâneas', () => {
  it('gente é leal a quem governa onde mora, e cada facção tem líder', () => {
    const s = simular(mundoEmGuerra(), 30);
    for (const p of s.vivos()) expect(p.faccao).toBe(LEOES);
    expect(s.guerras.faccoes.get(LEOES)!.lider).toBeTruthy();
    expect(s.guerras.postura(LEOES, CORVOS)).toBeLessThan(-20);
  });

  it('duas guerras ao mesmo tempo: convocação, batalhas com gente de verdade, paz', () => {
    const s = simular(mundoEmGuerra(), 40, 11);
    s.comando({ c: 'guerra', a: LEOES, b: CORVOS, motivo: 'um queijo roubado' });
    s.comando({ c: 'guerra', a: SERPENTES, b: LEOES });
    expect(s.guerras.emAndamento().length).toBe(2);
    const noFront = s.vivos().filter((p) => s.guerras.front(p));
    expect(noFront.length).toBeGreaterThan(0);
    // quem está no front não está em casa
    for (const p of noFront) expect(s.ondeEsta(p)).not.toBe(LUGAR);
    s.avancar(24);
    const batalhas = s.eventos.filter((e) => e.tipo === 'batalha');
    expect(batalhas.length).toBeGreaterThan(2);
    expect(s.guerras.guerras.reduce((n, g) => n + g.batalhas, 0)).toBe(batalhas.length);
    for (const g of s.guerras.emAndamento()) s.comando({ c: 'paz', guerra: g.id });
    expect(s.guerras.emAndamento().length).toBe(0);
    s.avancar(4);
    expect(s.vivos().filter((p) => s.guerras.front(p)).length).toBe(0);
  });

  it('conquista muda o dono do lugar e o lado de parte de quem mora lá', () => {
    const s = simular(mundoEmGuerra(), 30, 4);
    const g = s.guerras.declarar(CORVOS, LEOES, 'teste', true)!;
    g.alvo = LUGAR;
    g.placar = 95;
    s.avancar(1);
    expect(s.guerras.dono(LUGAR)?.id).toBe(CORVOS);
    expect(s.eventos.some((e) => e.tipo === 'conquista')).toBe(true);
  });

  it('o assassinato de um líder por gente de outra facção derruba a postura', () => {
    const s = simular(mundoEmGuerra(), 10, 2);
    const lider = s.pessoa(s.guerras.faccoes.get(LEOES)!.lider!)!;
    const outro = s.vivos().find((p) => p !== lider)!;
    outro.faccao = SERPENTES;
    const antes = s.guerras.postura(LEOES, SERPENTES);
    s.emitir('assassinato', [outro.id, lider.id]);
    expect(s.guerras.postura(LEOES, SERPENTES)).toBeLessThan(antes - 30);
  });

  it('as regras declaram guerra e reagem às batalhas', () => {
    const s = simular(mundoEmGuerra(`quando batalha(vencedor, perdedor):
  para cada p em personagem:
    p.batalhas_ouvidas += 1

quando ano:
  se não em_guerra("Leões", "Serpentes"):
    declarar_guerra("Serpentes", "Leões", "um insulto")`), 20, 6);
    s.avancar(30);
    expect(s.eventos.some((e) => e.tipo === 'guerra' && e.texto.includes('insulto'))).toBe(true);
    expect(s.vivos().some((p) => Number(p.campos['batalhas ouvidas'] ?? 0) > 0)).toBe(true);
    expect(s.issues).toEqual([]);
  });

  it('sem facções no mundo, nada de guerra (e nada quebra)', () => {
    const s = simular(mundo(''), 20);
    s.avancar(24);
    expect(s.guerras.faccoes.size).toBe(0);
    expect(s.eventos.some((e) => e.cat === 'guerra')).toBe(false);
  });
});

describe('acontecimentos com tom', () => {
  it('acontecem, marcam o tom na crônica e respeitam o ajuste (0 = nunca)', () => {
    const s = simular(mundo(''), 40, 8);
    s.comando({ c: 'ajuste', k: 'adulto', v: 0 });
    s.comando({ c: 'ajuste', k: 'fantasia', v: 3 });
    s.avancar(12 * 6);
    const tons = s.eventos.filter((e) => e.tom);
    expect(tons.length).toBeGreaterThan(10);
    expect(tons.some((e) => e.tom === 'fantasia')).toBe(true);
    expect(tons.some((e) => e.tom === 'adulto')).toBe(false);
  });

  it('acontecimentos adultos nunca envolvem crianças', () => {
    const s = simular(mundo(''), 50, 13);
    for (const k of ['fantasia', 'comico', 'serio'] as const) s.comando({ c: 'ajuste', k, v: 0 });
    s.comando({ c: 'ajuste', k: 'adulto', v: 3 });
    s.avancar(12 * 8);
    const adultos = s.eventos.filter((e) => e.tom === 'adulto');
    expect(adultos.length).toBeGreaterThan(3);
    for (const e of adultos) {
      for (const id of e.quem) {
        const p = s.pessoa(id)!;
        expect(Math.floor((e.t - p.nasc) / 12)).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('você faz acontecer; estados como "sapo" tiram a pessoa de cena e acabam', () => {
    const s = simular(mundo(''), 10, 3);
    const kael = s.pessoa(`${W}/Personagens/Kael.md`)!;
    s.comando({ c: 'acontecer', id: 'sapo', a: kael.id, b: null });
    expect(kael.estados['sapo']).toBeGreaterThan(s.t);
    expect(s.bloqueado(kael)).toBe(true);
    s.avancar(12);
    expect(s.bloqueado(kael)).toBe(false);
    expect(s.eventos.some((e) => e.texto.includes('volta a ser gente'))).toBe(true);
  });

  it('todo acontecimento tem nome, tom e roda sem erro em qualquer pessoa', () => {
    const s = simular(mundo(''), 30, 21);
    s.avancar(12 * 3);
    const gente = s.vivos().filter((p) => s.adulto(p));
    for (const ac of ACONTECIMENTOS) {
      expect(ac.nome).toBeTruthy();
      const a = gente.find((p) => p.morte === null)!;
      const b = gente.find((p) => p !== a && p.morte === null) ?? null;
      expect(() => s.comando({ c: 'acontecer', id: ac.id, a: a.id, b: ac.alvo ? b?.id ?? null : null })).not.toThrow();
    }
  });

  it('a mesma semente dá a mesma história (com guerras e acaso)', () => {
    const a = simular(mundoEmGuerra(), 30, 17);
    const b = simular(mundoEmGuerra(), 30, 17);
    a.avancar(12 * 8);
    b.avancar(12 * 8);
    expect(a.eventos.map((e) => e.texto)).toEqual(b.eventos.map((e) => e.texto));
    expect(anoDe(a.t)).toBe(320);
  });
});

describe('construtor: receitas e formulários novos', () => {
  it('todas as receitas compilam sem erro', async () => {
    const { RECEITAS } = await import('../src/index');
    const prog = compileRules(RECEITAS.map((r, i) => ({ path: `r${i}`, code: r.codigo })));
    expect(prog.issues).toEqual([]);
    expect(prog.ethnicities.length).toBeGreaterThanOrEqual(2);
    expect(prog.bonds.length).toBeGreaterThanOrEqual(2);
  });

  it('etnia, vínculo, público e tom geram regras válidas', async () => {
    const { etniaRegras, vinculoRegras, tracoRegras, mecanicaRegras, eventoRegras, publicoVazio } = await import('../src/index');
    const codigo = [
      etniaRegras({ nome: 'Élfico', plural: 'Élficos', desc: 'Das florestas', especie: '', olhos: [{ cor: 'verde', pct: 60 }], cabelo: [], altura: 4, ajustes: [{ campo: 'beleza', valor: 5 }],
        nomesM: 'Aelar, Thranduil', nomesF: 'Lúthien', sobrenomes: '', tracos: [], talvez: [], gostos: 'música', frequencia: 20, afinidades: [{ etnia: '', pontos: 8 }] }),
      vinculoRegras({ nome: 'Escudeiro', desc: '', simbolo: '🛡', papelA: 'cavaleiro', papelB: 'escudeiro', secreto: false, exclusivo: true, romantico: false, opiniao: 5,
        pesos: [{ interacao: 'brigar', mult: 0.3 }], porMes: [{ eixo: 'respeito', valor: 1 }], surge: [{ k: 'idade', quem: 'a', op: '>', valor: 30 }, { k: 'mesma', o: 'faccao' }], chance: 20,
        acaba: [{ k: 'faixa', quem: 'b', de: 30, ate: 200 }], publico: { ...publicoVazio(), sexo: 'm' }, aoFormar: { efeitos: [{ k: 'estado', quem: 'b', estado: 'orgulhoso', meses: 2 }], cronica: '{b} serve {a}.' },
        aoAcabar: { efeitos: [], cronica: '' } }),
      tracoRegras({ nome: 'Ruivo de fogo', feminino: 'Ruiva de fogo', desc: '', categoria: 'congenito', oposto: '', herdavel: 10, pesos: [], afinidades: [], humor: 0, estresse: 0, surge: [], chanceSurge: 10,
        nasce: 15, publico: { ...publicoVazio(), etnias: ['Élfico'], idadeMin: 0, idadeMax: 0 } }),
      mecanicaRegras({ tipo: 'par', nome: 'Piada', chance: 20, condicoes: [{ k: 'sexo', quem: 'a', sexo: 'f' }, { k: 'etnia', quem: 'b', etnia: 'Élfico', nao: true }, { k: 'vinculo', vinc: 'Escudeiro' }],
        efeitos: [{ k: 'vincular', vinculo: 'Escudeiro' }], cronica: '{a} ri de {b}.', tom: 'cômico' }),
      eventoRegras({ nome: 'Feira', desc: '', chance: 10, dura: 1, global: false, pesos: [], aoComecar: '', aoAcabar: '', todoMes: { efeitos: [], cronica: '', condicoes: [] }, tom: 'sério',
        publico: { ...publicoVazio(), idadeMin: 18 } }),
    ].join('\n');
    const prog = compileRules([{ path: 'c', code: codigo }]);
    expect(prog.issues).toEqual([]);
    expect(prog.bonds[0]!.roles).toEqual(['cavaleiro', 'escudeiro']);
    expect(prog.traits[0]!.filter.ethnicities).toEqual(['elfico']);
    expect(prog.interactions[0]!.tone).toBe('comico');
    expect(prog.events[0]!.filter.minAge).toBe(18);
  });
});
