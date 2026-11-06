import { describe, expect, it } from 'vitest';
import { estruturaDe, generateTerrain, nearWater, pintarTerreno, roadPath, rotasDoMundo } from '../src/index';

describe('terreno', () => {
  const t = generateTerrain(42, 240, 160);

  it('é determinístico e respeita a fração de mar', () => {
    const b = generateTerrain(42, 240, 160, { sea: 0.55 });
    expect(Array.from(b.height.slice(0, 50))).toEqual(Array.from(t.height.slice(0, 50)));
    let mar = 0;
    for (let i = 0; i < t.w * t.h; i++) if (t.height[i]! < t.sea) mar++;
    expect(mar / (t.w * t.h)).toBeGreaterThan(0.45);
    expect(mar / (t.w * t.h)).toBeLessThan(0.65);
  });

  it('rios correm morro abaixo e terminam no mar, num lago ou em outro rio', () => {
    expect(t.rivers.length).toBeGreaterThan(5);
    const cell = (p: { x: number; y: number }) => Math.min(t.h - 1, Math.floor((p.y / 100) * t.h)) * t.w + Math.min(t.w - 1, Math.floor((p.x / 100) * t.w));
    for (const r of t.rivers) {
      const fim = r.pts[r.pts.length - 1]!;
      const i = cell(fim);
      const x = i % t.w;
      const y = Math.floor(i / t.w);
      const agua = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => t.lake[(y + dy) * t.w + x + dx] || t.height[(y + dy) * t.w + x + dx]! < t.sea));
      const junta = t.rivers.some((o) => o !== r && o.pts.some((p) => Math.hypot(p.x - fim.x, p.y - fim.y) < 1.2));
      expect(agua || junta).toBe(true);
    }
  });

  it('sem rios quando pedido', () => {
    expect(generateTerrain(42, 120, 80, { rivers: 0 }).rivers).toEqual([]);
  });

  it('estrada evita a água', () => {
    const land: Array<{ x: number; y: number }> = [];
    for (let y = 10; y < 90 && land.length < 2; y += 3) for (let x = 10; x < 90 && land.length < 2; x += 3) {
      const i = Math.floor((y / 100) * t.h) * t.w + Math.floor((x / 100) * t.w);
      if (t.height[i]! > t.sea + 0.05 && !t.lake[i] && (!land.length || Math.hypot(land[0]!.x - x, land[0]!.y - y) > 20)) land.push({ x, y });
    }
    const r = roadPath(t, land[0]!, land[1]!);
    expect(r[0]).toEqual(land[0]);
    expect(r[r.length - 1]).toEqual(land[1]);
    const molhados = r.filter((p) => t.height[Math.floor((p.y / 100) * t.h) * t.w + Math.floor((p.x / 100) * t.w)]! < t.sea - 0.02).length;
    expect(molhados).toBe(0);
  });

  it('pinta em qualquer resolução', () => {
    const px = pintarTerreno(t, 60, 40);
    expect(px.length).toBe(60 * 40 * 4);
    const zoom = pintarTerreno(t, 30, 20, { x0: 40, y0: 40, x1: 50, y1: 50 });
    expect(zoom[3]).toBe(255);
  });

  it('nearWater acha o mar na costa', () => {
    expect(nearWater(t, 0.5, 0.5)).toBe('mar');
  });
});

describe('estruturas', () => {
  const e = (name: string, props: Record<string, string> = {}) => ({ name, props });
  it('pelo campo, pelo nome, pela população e pela água', () => {
    expect(estruturaDe(e('Áurea', { estrutura: 'capital' }))).toBe('capital');
    expect(estruturaDe(e('Castelo Negro'))).toBe('castelo');
    expect(estruturaDe(e('Ruínas de Ost'))).toBe('ruina');
    expect(estruturaDe(e('Templo do Sol'))).toBe('templo');
    expect(estruturaDe(e('Fim do Mundo', { população: '12.000' }))).toBe('cidade');
    expect(estruturaDe(e('Pedravale'), { agua: 'mar' })).toBe('porto');
    expect(estruturaDe(e('Pedravale'))).toBe('vila');
  });
  it('rotas entre lugares, cada par uma vez', () => {
    const ents = [
      { path: 'a', type: 'lugar', relations: [{ label: 'rotas', to: 'b' }] },
      { path: 'b', type: 'lugar', relations: [{ label: 'rotas', to: 'a' }, { label: 'estradas', to: 'c' }] },
      { path: 'c', type: 'lugar', relations: [{ label: 'aliados', to: 'a' }] },
    ];
    expect(rotasDoMundo(ents)).toEqual([['a', 'b'], ['b', 'c']]);
  });
});
