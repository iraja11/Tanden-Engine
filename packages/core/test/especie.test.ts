import { describe, expect, it } from 'vitest';
import {
  SPECIES_FIELDS, SPECIES_LOOK_KEYS, SPECIES_PLANS, SPECIES_TEMPLATES, rollSpecies, seededRng, speciesBlurb, speciesDrawing, speciesFigure, speciesNotes,
  speciesPlan, speciesTemplatePatch, speciesWeightGuess, type SpeciesPlan,
} from '../src/index';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const plans = Object.keys(SPECIES_PLANS) as SpeciesPlan[];
const planLabels = SPECIES_FIELDS.find((f) => f.key === 'corpo')!.options!;

describe('catálogo de espécies', () => {
  it('toda opção de corpo vira um plano que o desenho conhece', () => {
    expect(planLabels.map((l) => speciesPlan(l)).sort()).toEqual([...plans].sort());
  });

  it('não repete opção dentro de um campo', () => {
    for (const f of SPECIES_FIELDS) {
      if (f.options) expect(new Set(f.options).size, f.key).toBe(f.options.length);
    }
  });

  it('continua lendo as fichas antigas', () => {
    expect(speciesPlan('bípede')).toBe('bipede');
    expect(speciesPlan('alado')).toBe('alado');
    expect(speciesPlan('coisa estranha')).toBe('bipede');
    const f = speciesFigure({ corpo: 'quadrúpede', 'traços físicos': 'chifres, asas, cauda, orelhas longas, olhos extras' });
    expect(f.chifre).toBe('touro');
    expect(f.asa).toBe('membrana');
    expect(f.orelha).toBe('longas');
    expect(f.olhos).toBe(4);
  });
});

describe('desenho das espécies', () => {
  const valid = (props: Record<string, string>) => {
    const d = speciesDrawing(speciesFigure(props));
    const shapes = d.camadas.flat();
    expect(shapes.length).toBeGreaterThan(0);
    expect(/NaN|undefined|Infinity/.test(shapes.map((s) => s.d).join(' ')), props['corpo']).toBe(false);
    expect(Number.isFinite(d.box.w) && d.box.w > 0 && d.box.h > 0).toBe(true);
    return d;
  };

  it('desenha todos os planos de corpo', () => {
    for (const corpo of planLabels) valid({ corpo });
  });

  it('desenha toda opção de cada campo visual em todos os corpos', () => {
    const visual = SPECIES_FIELDS.filter((f) => f.desenha && f.options && f.key !== 'corpo');
    for (const corpo of planLabels) {
      for (const f of visual) for (const o of f.options!) valid({ corpo, [f.key]: o });
    }
  }, 60_000);

  it('asas, chifres e cabeças extras mudam o desenho', () => {
    const count = (p: Record<string, string>) => valid(p).camadas.flat().length;
    const base = count({ corpo: 'quadrúpede', asas: 'sem asas' });
    expect(count({ corpo: 'quadrúpede', asas: 'de penas' })).toBeGreaterThan(base);
    expect(count({ corpo: 'quadrúpede', asas: 'sem asas', chifres: 'galhada' })).toBeGreaterThan(base);
    expect(count({ corpo: 'quadrúpede', asas: 'sem asas', cabeças: 'três' })).toBeGreaterThan(base);
  });

  it('corpos compridos medem o comprimento', () => {
    const f = speciesFigure({ corpo: 'cetáceo', altura: '20' });
    expect(f.eixo).toBe('comprimento');
    expect(f.medida).toBe(20);
    expect(f.altura).toBeLessThan(20);
  });
});

describe('moldes', () => {
  const byKey = new Map(SPECIES_FIELDS.map((f) => [f.key, f]));

  it('só usam campos e opções que existem', () => {
    for (const t of SPECIES_TEMPLATES) {
      for (const [k, v] of Object.entries(t.props)) {
        const f = byKey.get(k);
        expect(f, `${t.id}: campo ${k}`).toBeDefined();
        if (!f!.options || k === 'habitat') continue;
        for (const part of f!.multi ? v.split(',').map((x) => x.trim()) : [v]) {
          expect(f!.options.map(fold), `${t.id}: ${k} = ${part}`).toContain(fold(part));
        }
      }
    }
  });

  it('têm ids únicos e cobrem todo plano de corpo', () => {
    expect(new Set(SPECIES_TEMPLATES.map((t) => t.id)).size).toBe(SPECIES_TEMPLATES.length);
    const used = new Set(SPECIES_TEMPLATES.map((t) => speciesPlan(t.props['corpo']!)));
    expect(plans.filter((p) => !used.has(p))).toEqual([]);
  });

  it('o molde limpa a aparência anterior e preserva o resto', () => {
    const lobo = SPECIES_TEMPLATES.find((t) => t.id === 'lobo')!;
    const patch = speciesTemplatePatch(lobo);
    expect(patch['asas']).toBe('');
    expect(patch['corpo']).toBe('quadrúpede');
    for (const k of SPECIES_LOOK_KEYS) expect(k in patch).toBe(true);
    expect('habitat' in patch).toBe(false);
  });
});

describe('sorteio', () => {
  it('modo realista nunca traz opção fantástica', () => {
    const fantasy = new Map(SPECIES_FIELDS.map((f) => [f.key, new Set((f.sections ?? []).filter((s) => s.tipo === 'fantasia').flatMap((s) => s.options))]));
    for (let seed = 1; seed <= 150; seed++) {
      const r = rollSpecies(seededRng(seed), {}, { realista: true, sapiente: seed % 2 === 0 });
      for (const [k, v] of Object.entries(r)) {
        for (const part of v.split(',').map((x) => x.trim())) expect(fantasy.get(k)?.has(part) ?? false, `${seed} ${k}=${part}`).toBe(false);
      }
    }
  });

  it('todo sorteio vira um desenho válido', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const d = speciesDrawing(speciesFigure(rollSpecies(seededRng(seed), {}, { sapiente: seed % 3 === 0 })));
      expect(d.camadas.flat().every((s) => !/NaN/.test(s.d))).toBe(true);
    }
  });

  it('respeita o que já foi escolhido', () => {
    const r = rollSpecies(seededRng(4), { corpo: 'dragão', asas: 'de penas' });
    expect(r['corpo']).toBeUndefined();
    expect(r['asas']).toBeUndefined();
    expect(r['cabeça']).toBe('dracônica');
  });

  it('estima o peso pelo cubo do tamanho', () => {
    expect(speciesWeightGuess('bipede', 1.75)).toBeGreaterThan(50);
    expect(speciesWeightGuess('bipede', 1.75)).toBeLessThan(90);
    expect(speciesWeightGuess('bipede', 3.5)).toBeGreaterThan(speciesWeightGuess('bipede', 1.75) * 6);
  });
});

describe('notas de biologia', () => {
  const avisos = (p: Record<string, string>) => speciesNotes(p).filter((n) => n.tipo === 'aviso').map((n) => n.texto).join(' ');

  it('aponta o que não fecha', () => {
    expect(avisos({ corpo: 'dragão', altura: '8', peso: '12000', asas: 'de membrana' })).toMatch(/voar/);
    expect(avisos({ corpo: 'bípede', altura: '9', peso: '30' })).toMatch(/Leve demais/);
    expect(avisos({ corpo: 'hexápode', revestimento: 'quitina', altura: '4', peso: '1000' })).toMatch(/Artrópodes/);
    expect(avisos({ corpo: 'bípede', 'expectativa de vida': '30', maioridade: '40' })).toMatch(/maioridade/);
  });

  it('a magia explica o voo', () => {
    expect(avisos({ corpo: 'dragão', altura: '8', peso: '12000', asas: 'de membrana', metabolismo: 'movido a magia' })).not.toMatch(/voar/);
  });

  it('não reclama de um humano comum', () => {
    expect(speciesNotes({ corpo: 'bípede', altura: '1,75', peso: '70', dieta: 'onívoro', 'expectativa de vida': '80', maioridade: '18' })).toEqual([]);
  });

  it('sugere ideias para povos', () => {
    expect(speciesNotes({ corpo: 'bípede', inteligência: 'sapiente', 'expectativa de vida': '800' }).some((n) => n.tipo === 'ideia')).toBe(true);
  });
});

describe('texto de biologia', () => {
  it('descreve os campos novos', () => {
    const t = speciesBlurb('Vaelis', { corpo: 'naga', porte: 'esguio', altura: '2,2', revestimento: 'escamas', cor: 'verde e dourado', chifres: 'galhada', cauda: 'sem cauda' });
    expect(t).toMatch(/Vaelis são esguios nagas de cerca de 2,2 m/);
    expect(t).toContain('chifres galhada');
    expect(t).not.toContain('sem cauda');
  });
});
