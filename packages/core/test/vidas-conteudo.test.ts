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
