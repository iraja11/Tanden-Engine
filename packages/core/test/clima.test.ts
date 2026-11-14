import { describe, expect, it } from 'vitest';
import {
  BIOMAS, altitudeM, biomaPorClima, biomeShares, generateTerrain, geografiaTexto, makePlates, mapInfo, mapSymbols, nomearRegioes, pintarTerreno,
  NATUREZAS, naturezaInfo, povoarMapa, readMarkers, sondar, tamanhoMapa, writeMarkers,
} from '../src/index';

describe('placas tectônicas', () => {
  it('são determinísticas e têm continentes e oceanos', () => {
    const a = makePlates(7, 1.5);
    const b = makePlates(7, 1.5);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(9);
    expect(a.some((p) => p.oceanic)).toBe(true);
    expect(a.some((p) => !p.oceanic)).toBe(true);
  });

  it('o terreno com placas guarda a placa e o esforço de cada célula', () => {
    const t = generateTerrain(11, 180, 120, { plates: true });
    expect(t.plate?.length).toBe(t.w * t.h);
    expect(t.stress?.length).toBe(t.w * t.h);
    // há células de borda convergente (montanhas) e divergente (fendas)
    const s = Array.from(t.stress!);
    expect(Math.max(...s)).toBeGreaterThan(0.1);
    expect(Math.min(...s)).toBeLessThan(-0.05);
  });
});

describe('clima e biomas', () => {
  it('altitude em metros sobe com a altura e é zero no mar', () => {
    expect(altitudeM(0.3, 0.42)).toBeLessThanOrEqual(0);
    expect(altitudeM(0.9, 0.42)).toBeGreaterThan(altitudeM(0.6, 0.42));
  });

  it('classifica pelo calor e pela chuva', () => {
    expect(biomaPorClima(27, 2600, 200)).toBe('selva');
    expect(biomaPorClima(24, 120, 300)).toBe('deserto');
    expect(biomaPorClima(-14, 300, 100)).toBe('gelo');
    expect(biomaPorClima(-4, 400, 200)).toBe('tundra');
    expect(biomaPorClima(12, 900, 300)).toBe('floresta');
    expect(biomaPorClima(5, 300, 3200)).toBe('montanha');
  });

  const t = generateTerrain(777, 200, 130, { plates: true, clima: 'temperado' });

  it('o atlas tem temperatura, chuva, bioma e rocha por célula, e é determinístico', () => {
    const a = t.atlas!;
    expect(a.temp.length).toBe(t.w * t.h);
    expect(a.biome.length).toBe(t.w * t.h);
    const t2 = generateTerrain(777, 200, 130, { plates: true, clima: 'temperado' });
    expect(Array.from(t2.atlas!.biome.slice(0, 400))).toEqual(Array.from(a.biome.slice(0, 400)));
  });

  it('um continente temperado tem vários biomas, e nenhum toma tudo', () => {
    const land = biomeShares(t).filter((b) => !b.bioma.agua);
    expect(land.length).toBeGreaterThanOrEqual(5);
    const total = land.reduce((s, b) => s + b.share, 0);
    expect(land[0]!.share / total).toBeLessThan(0.6);
  });

  it('o clima muda os biomas: tropical tem selva, polar tem gelo', () => {
    const trop = biomeShares(generateTerrain(777, 160, 100, { plates: true, clima: 'tropical' }));
    const pol = biomeShares(generateTerrain(777, 160, 100, { plates: true, clima: 'polar' }));
    const has = (l: typeof trop, id: string) => l.some((b) => b.bioma.id === id && b.share > 0.005);
    expect(has(trop, 'selva') || has(trop, 'savana')).toBe(true);
    expect(has(pol, 'gelo') || has(pol, 'tundra')).toBe(true);
    expect(has(trop, 'gelo')).toBe(false);
  });

  it('sonda um ponto de terra com bioma, altitude, rocha e latitude', () => {
    let probe = null;
    for (let y = 10; y < 90 && !probe; y += 5) for (let x = 10; x < 90 && !probe; x += 5) {
      const s = sondar(t, x, y);
      if (s && !s.bioma.agua) probe = s;
    }
    expect(probe).not.toBeNull();
    expect(probe!.altitude).toBeGreaterThan(0);
    expect(probe!.rocha.id).toBeTruthy();
    expect(Math.abs(probe!.latitude)).toBeLessThan(90);
  });

  it('acidentes, recursos e regiões aparecem e ficam dentro do mapa', () => {
    const a = t.atlas!;
    expect(a.regions.length).toBeGreaterThan(2);
    expect(a.resources.length).toBeGreaterThan(3);
    for (const p of [...a.features, ...a.resources, ...a.regions]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
    const nomes = nomearRegioes(a.regions, 'nordico', 777);
    expect(nomes.length).toBe(a.regions.length);
    expect(new Set(nomes).size).toBeGreaterThan(nomes.length / 2);
  });

  it('símbolos do mapa só na terra e ordenados de cima para baixo', () => {
    const s = mapSymbols(t, 1);
    expect(s.length).toBeGreaterThan(20);
    for (let i = 1; i < s.length; i++) expect(s[i]!.y).toBeGreaterThanOrEqual(s[i - 1]!.y);
    expect(s.some((x) => x.k === 'monte')).toBe(true);
  });

  it('pinta os três estilos e as camadas', () => {
    for (const estilo of ['relevo', 'atlas', 'pergaminho'] as const) {
      const img = pintarTerreno(t, 60, 40, undefined, { estilo });
      expect(img.length).toBe(60 * 40 * 4);
    }
    const a = pintarTerreno(t, 60, 40, undefined, { estilo: 'atlas', camada: 'temperatura' });
    const b = pintarTerreno(t, 60, 40, undefined, { estilo: 'atlas', camada: 'nenhuma' });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('escreve a geografia em markdown', () => {
    const md = geografiaTexto(t);
    expect(md).toMatch(/^- /m);
    expect(md.toLowerCase()).toContain('clima');
  });

  it('todos os biomas têm cor, descrição e vida', () => {
    for (const b of BIOMAS) {
      expect(b.cor).toHaveLength(3);
      expect(b.desc.length).toBeGreaterThan(10);
    }
  });
});

describe('povoar o mapa', () => {
  const t = generateTerrain(321, 200, 130, { plates: true });
  const sug = povoarMapa(t, 10, [], { seed: 5, nomes: 'latino' });

  it('sugere povoados em terra, longe uns dos outros, com motivo', () => {
    expect(sug.length).toBeGreaterThanOrEqual(6);
    for (const p of sug) {
      const s = sondar(t, p.x, p.y);
      expect(s).not.toBeNull();
      expect(s!.bioma.agua ?? false).toBe(false);
      expect(p.motivo.length).toBeGreaterThan(3);
      expect(p.nome.length).toBeGreaterThan(2);
    }
    for (let i = 0; i < sug.length; i++) for (let j = i + 1; j < sug.length; j++) {
      expect(Math.hypot(sug[i]!.x - sug[j]!.x, sug[i]!.y - sug[j]!.y)).toBeGreaterThan(2);
    }
    expect(sug.some((p) => p.kind === 'capital')).toBe(true);
  });

  it('é determinístico pela semente', () => {
    expect(povoarMapa(t, 10, [], { seed: 5, nomes: 'latino' })).toEqual(sug);
  });
});

describe('marcadores com estrutura', () => {
  const base = `---\ntipo: mapa\nsemente: 5\ntectônica: sim\nclima: tropical\nestilo: atlas\n---\n# Mapa\n`;

  it('a coluna Tipo só aparece quando algum marcador tem estrutura, e volta igual', () => {
    const sem = writeMarkers(base, [{ label: 'Vale', target: null, x: 10, y: 20 }]);
    expect(sem).not.toContain('Tipo');
    const com = writeMarkers(base, [{ label: 'Vale', target: null, x: 10, y: 20 }, { label: 'Forte Norte', target: null, x: 30, y: 40, kind: 'forte' }]);
    expect(com).toContain('Tipo');
    const back = readMarkers(com);
    expect(back.find((m) => m.label === 'Forte Norte')?.kind).toBe('forte');
    expect(back.find((m) => m.label === 'Vale')?.kind ?? '').toBe('');
  });

  it('lê clima, tectônica e estilo das propriedades do mapa', () => {
    const info = mapInfo(base);
    expect(info.plates).toBe(true);
    expect(info.clima).toBe('tropical');
    expect(info.estilo).toBe('atlas');
  });
});

describe('planos e mapas grandes', () => {
  it('a natureza troca os biomas: infernal tem lava e cinza, e nenhum bioma comum de terra', () => {
    const t = generateTerrain(777, 160, 100, { plates: true, natureza: 'infernal' });
    const ids = new Set(Array.from(t.atlas!.biome).map((i) => BIOMAS[i]!.id));
    expect(ids.has('lava')).toBe(true);
    expect(ids.has('cinzas') || ids.has('brasa')).toBe(true);
    expect(ids.has('floresta') || ids.has('mar') || ids.has('pradaria')).toBe(false);
    expect(t.atlas!.natureza.id).toBe('infernal');
    // é mais quente que o mesmo mapa no mundo material
    const base = generateTerrain(777, 160, 100, { plates: true });
    const avg = (a: Float32Array) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(t.atlas!.temp)).toBeGreaterThan(avg(base.atlas!.temp) + 20);
  });

  it('todas as naturezas trocam por biomas que existem, e o nome acha a natureza', () => {
    for (const n of NATUREZAS) for (const to of Object.values(n.troca)) expect(BIOMAS.some((b) => b.id === to)).toBe(true);
    expect(naturezaInfo('Feérico').id).toBe('feerico');
    expect(naturezaInfo('inferno').id).toBe('infernal');
    expect(naturezaInfo('').id).toBe('material');
  });

  it('o mapa pinta o mar do plano com outra cor', () => {
    const inf = generateTerrain(5, 120, 80, { plates: true, natureza: 'infernal' });
    const mat = generateTerrain(5, 120, 80, { plates: true });
    const px = (t: typeof inf) => pintarTerreno(t, 4, 4, { x0: 0, y0: 0, x1: 3, y1: 3 });
    const a = px(inf);
    const b = px(mat);
    // canto do mapa é mar: vermelho na lava, azul no mar comum
    expect(a[0]!).toBeGreaterThan(a[2]!);
    expect(b[2]!).toBeGreaterThan(b[0]!);
  });

  it('mapas maiores mostram mais mundo: mais placas e terra perto das bordas', () => {
    expect(tamanhoMapa('mundo').escala).toBeGreaterThan(tamanhoMapa('continente').escala);
    expect(tamanhoMapa('hemisfério').id).toBe('enorme');
    const small = generateTerrain(9, 180, 100, { plates: true });
    const big = generateTerrain(9, 180, 100, { plates: true, escala: 2.6 });
    expect(big.plates!.length).toBeGreaterThan(small.plates!.length * 3);
    const edgeLand = (t: typeof big) => {
      let n = 0;
      for (let x = 0; x < t.w; x++) if (t.height[x + t.w * 3]! >= t.sea) n++;
      return n;
    };
    expect(edgeLand(big)).toBeGreaterThan(edgeLand(small));
  });

  it('lê tamanho, natureza e plano da nota do mapa', () => {
    const info = mapInfo('---\ntipo: mapa\ntamanho: mundo\nnatureza: astral\nplano: "[[Céu Partido]]"\n---\n');
    expect(info.tamanho.id).toBe('mundo');
    expect(info.natureza).toBe('astral');
    expect(info.plano).toBe('Céu Partido');
    expect(info.scale).toBe(40000);
  });
});
