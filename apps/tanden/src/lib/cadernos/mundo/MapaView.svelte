<script lang="ts">
  import {
    ACIDENTES, CLIMAS, ESTRUTURA_TAMANHO, NATUREZAS, TAMANHOS, asText, naturezaInfo, tamanhoMapa, NAME_STYLES, RECURSOS, biomeAtPercent, biomeShares, entityFolder, entityTemplate, estruturaDe, geografiaTexto,
    mapDistance, mapInfo, mapSymbols, nearWater, nomearAcidentes, nomearRegioes, placeOwners, povoarMapa, readMarkers, roadPath, rotasDoMundo, setProp,
    setProps, setSection, sondar, suggestSpots, territoryGrid, travelTimes, typeInfo, writeMarkers,
    type AcidenteId, type BiomaInfo, type CamadaMapa, type Entity, type EstiloMapa, type Estrutura, type MapMarker, type PovoadoMapa, type Regiao,
    type Sondagem, type Terrain, type World,
  } from '@tanden/core';
  import { files } from '../../files/files.svelte';
  import { theme } from '../../theme.svelte';
  import { cadernos } from '../cadernos.svelte';
  import { factionColor, typeColor, typeGlyph } from '../tipos';
  import AcidenteIcone from './AcidenteIcone.svelte';
  import EstruturaIcone from './EstruturaIcone.svelte';
  import MapaSimbolos from './MapaSimbolos.svelte';
  import { BIOME_LABEL, carregarTerreno, pintar, porNoCanvas } from './terrain-paint';

  // Mapas do mundo: imagem própria ou terreno gerado pela semente, com
  // marcadores que apontam para as fichas. Os marcadores ficam na tabela
  // "## Marcadores" da nota do mapa (X e Y em %), legível no Obsidian.
  let { world, byPath, focus = null, onopen, oncreate, onnewmap }: {
    world: World;
    byPath: Map<string, Entity>;
    /** abrir já num mapa (e num marcador), vindo da ficha */
    focus?: { map: string; target?: string } | null;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string) => void;
    onnewmap: () => void;
  } = $props();

  type Mode = 'mover' | 'marcar' | 'regua' | 'explorar';
  const maps = $derived(world.entities.filter((e) => e.type === 'mapa'));
  let mapPath = $state<string | null>(null);
  const map = $derived(maps.find((m) => m.path === mapPath) ?? maps[0] ?? null);
  const text = $derived.by(() => { void cadernos.rev; return map ? cadernos.read(map.path) : ''; });
  const info = $derived(mapInfo(text));
  const markers = $derived(readMarkers(text));

  let mode = $state<Mode>('mover');
  let sel = $state<number | null>(null);
  let pending = $state<{ x: number; y: number } | null>(null);
  let pendingName = $state('');
  let ruler = $state<Array<{ x: number; y: number }>>([]);
  let drag = $state<{ i: number; x: number; y: number; moved: boolean } | null>(null);

  $effect(() => {
    const f = focus;
    if (!f) return;
    mapPath = f.map;
    const t = f.target?.toLowerCase();
    const i = t ? readMarkers(cadernos.read(f.map)).findIndex((m) => (m.target ?? m.label).toLowerCase() === t) : -1;
    sel = i >= 0 ? i : null;
  });

  // ---- atlas: os mapas agrupados pelo plano (ou mundo) a que pertencem
  const NAT_COR: Record<string, string> = { material: '#7aa36a', infernal: '#d9542a', feerico: '#3fae8a', umbral: '#8a8c94', astral: '#8f7fd8', subterraneo: '#8a6f55' };
  const atlasGroups = $derived.by(() => {
    void cadernos.rev;
    const g = new Map<string, Entity[]>();
    for (const m of maps) {
      const i = mapInfo(cadernos.read(m.path));
      const k = i.plano ?? '';
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g.entries()].sort((a, b) => (a[0] === '' ? -1 : b[0] === '' ? 1 : a[0].localeCompare(b[0], 'pt-BR'))).map(([plano, list]) => {
      const pe = plano ? world.entities.find((e) => e.type === 'plano' && fold(e.name) === fold(plano)) : undefined;
      const nk = pe ? Object.keys(pe.props).find((x) => fold(x) === 'natureza') : undefined;
      const first = list[0] ? mapInfo(cadernos.read(list[0].path)).natureza : null;
      return { plano, maps: list, nat: naturezaInfo(pe && nk ? asText(pe.props[nk]) : first) };
    });
  });
  const planos = $derived(world.entities.filter((e) => e.type === 'plano'));

  // ---- fichas por nome (os marcadores guardam o [[nome]])
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const byName = $derived.by(() => {
    const m = new Map<string, Entity>();
    for (const e of world.entities) for (const n of [e.name, ...e.aliases]) m.set(fold(n), e);
    return m;
  });
  const entityOf = (mk: MapMarker) => (mk.target ? byName.get(fold(mk.target.split('/').pop()!)) ?? null : null);
  const placed = $derived(new Set(markers.map((m) => fold(m.target ?? m.label))));
  const unplaced = $derived(world.entities.filter((e) => e.type !== 'mapa' && !placed.has(fold(e.name))));
  const unplacedPlaces = $derived(unplaced.filter((e) => e.type === 'lugar'));

  // ---- fundo: imagem ou terreno
  let canvas = $state<HTMLCanvasElement>();
  let imgUrl = $state<string | null>(null);
  let aspect = $state(1.5);
  // só a semente (e mar/rios) importa: mover um marcador muda a nota, mas não refaz o terreno
  const seed = $derived(info.image ? null : info.seed);
  const seaOpt = $derived(info.sea);
  const riverOpt = $derived(info.rivers);
  const platesOpt = $derived(info.plates);
  const climaOpt = $derived(info.clima);
  const calorOpt = $derived(info.calor);
  // tamanho (escala e grade) e natureza do plano: a do mapa, ou a do plano a que ele pertence
  const tamId = $derived(info.tamanho.id);
  const planoEnt = $derived(info.plano ? world.entities.find((e) => e.type === 'plano' && fold(e.name) === fold(info.plano!)) ?? null : null);
  const natOpt = $derived.by(() => {
    if (info.natureza) return naturezaInfo(info.natureza).id;
    const k = planoEnt ? Object.keys(planoEnt.props).find((x) => fold(x) === 'natureza') : undefined;
    return planoEnt && k ? naturezaInfo(asText(planoEnt.props[k])).id : 'material';
  });
  const grade = () => { const t = tamanhoMapa(tamId); return { w: t.w, h: t.h }; };
  const terrOpts = () => ({
    ...(tamId !== 'continente' ? { escala: tamanhoMapa(tamId).escala } : {}), ...(natOpt !== 'material' ? { natureza: natOpt } : {}),
    ...(seaOpt !== null ? { sea: seaOpt } : {}), ...(riverOpt !== null ? { rivers: riverOpt } : {}),
    ...(platesOpt ? { plates: true } : {}), ...(climaOpt ? { clima: climaOpt } : {}), ...(calorOpt !== null ? { calor: calorOpt } : {}),
  });
  // estilo da pintura: o da nota, ou pergaminho nos mapas com placas e relevo nos antigos
  const estilo = $derived<EstiloMapa>(info.estilo ?? (info.plates ? 'pergaminho' : 'relevo'));
  let camada = $state<CamadaMapa>('nenhuma');
  const paintOpts = () => ({ estilo, camada });
  let terrain = $state.raw<Terrain | null>(null);
  let painting = $state(false);
  $effect(() => {
    const s = seed;
    void seaOpt;
    void riverOpt;
    void platesOpt;
    void climaOpt;
    void calorOpt;
    void tamId;
    void natOpt;
    terrain = null;
    if (s === null) return;
    let alive = true;
    const o = terrOpts();
    void carregarTerreno(s, o, grade()).then((t) => {
      if (!alive) return;
      terrain = t;
      aspect = t.w / t.h;
    });
    return () => { alive = false; };
  });
  $effect(() => {
    const s = seed;
    void seaOpt;
    void riverOpt;
    void platesOpt;
    void climaOpt;
    void calorOpt;
    void tamId;
    void natOpt;
    void estilo;
    void camada;
    detail = null;
    if (s === null) return;
    let alive = true;
    painting = true;
    // fundo em 2× a grade; a parte visível é redesenhada nítida quando aproxima
    const g = grade();
    // fundo em ~2× a grade (menos nos mapas enormes); a parte visível é redesenhada nítida quando aproxima
    const f = Math.min(2, 2000 / g.w);
    const bw = Math.round(g.w * f);
    const bh = Math.round(g.h * f);
    void pintar(s, terrOpts(), bw, bh, undefined, paintOpts(), g).then((px) => {
      if (!alive) return;
      if (canvas) porNoCanvas(canvas, px, bw, bh);
      painting = false;
    });
    return () => { alive = false; };
  });

  // ---- detalhe: perto, a área visível é pintada de novo na resolução da tela
  let detailCanvas = $state<HTMLCanvasElement>();
  let detail = $state<Regiao | null>(null);
  let vw = $state(0);
  let vh = $state(0);
  let detailTok = 0;
  $effect(() => {
    const z = zoom;
    const X = tx;
    const Y = ty;
    const s = seed;
    const w = vw;
    const h = vh;
    void seaOpt;
    void riverOpt;
    void platesOpt;
    void climaOpt;
    void calorOpt;
    void tamId;
    void natOpt;
    void estilo;
    void camada;
    if (s === null || z < 1.4 || !w) {
      detailTok++;
      detail = null;
      return;
    }
    const timer = setTimeout(() => {
      const W = w * z;
      const H = (w / aspect) * z;
      const c = (n: number) => Math.min(100, Math.max(0, n));
      // um pouco de folga em volta, para arrastar sem ver a borda
      const padX = (w / W) * 15;
      const padY = (h / H) * 15;
      const r = { x0: c((-X / W) * 100 - padX), y0: c((-Y / H) * 100 - padY), x1: c(((-X + w) / W) * 100 + padX), y1: c(((-Y + h) / H) * 100 + padY) };
      if (r.x1 - r.x0 < 0.2 || r.y1 - r.y0 < 0.2) return;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      let outW = ((r.x1 - r.x0) / 100) * W * dpr;
      let outH = ((r.y1 - r.y0) / 100) * H * dpr;
      const k = Math.min(1, Math.sqrt(2_600_000 / (outW * outH)));
      outW = Math.max(1, Math.round(outW * k));
      outH = Math.max(1, Math.round(outH * k));
      const tok = ++detailTok;
      void pintar(s, terrOpts(), outW, outH, r, paintOpts(), grade()).then((px) => {
        if (tok !== detailTok || !detailCanvas) return;
        porNoCanvas(detailCanvas, px, outW, outH);
        detail = r;
      });
    }, 180);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    const target = info.image;
    imgUrl = null;
    if (!target) return;
    let alive = true;
    void files.imageUrl(target).then((u) => { if (alive) imgUrl = u; });
    return () => { alive = false; };
  });

  // ---- zoom e arrasto
  let viewport = $state<HTMLDivElement>();
  let stage = $state<HTMLDivElement>();
  let zoom = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let pan: { x: number; y: number; tx: number; ty: number } | null = null;

  function clampPan() {
    if (!viewport) return;
    const w = viewport.clientWidth;
    const h = w / aspect;
    tx = Math.min(0, Math.max(w - w * zoom, tx));
    ty = Math.min(0, Math.max(Math.min(0, viewport.clientHeight - h * zoom), ty));
  }
  function zoomAt(factor: number, cx?: number, cy?: number) {
    if (!viewport) return;
    const r = viewport.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left;
    const py = (cy ?? r.top + r.height / 2) - r.top;
    const next = Math.min(6, Math.max(1, zoom * factor));
    tx = px - (px - tx) * (next / zoom);
    ty = py - (py - ty) * (next / zoom);
    zoom = next;
    clampPan();
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  }
  function resetView() { zoom = 1; tx = 0; ty = 0; }
  let lastMap: string | null = null;
  $effect(() => {
    const p = map?.path ?? null;
    if (p === lastMap) return;
    lastMap = p;
    resetView();
    ruler = [];
    pending = null;
    if (focus?.map !== p) sel = null;
  });

  function pct(e: PointerEvent | MouseEvent) {
    const r = stage!.getBoundingClientRect();
    return { x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)) };
  }

  function stageDown(e: PointerEvent) {
    if (e.button !== 0 || !stage) return;
    if (mode === 'explorar') {
      const p = pct(e);
      probe = p;
      sonda = terrain ? sondar(terrain, p.x, p.y) : null;
      sel = null;
      featSel = null;
      return;
    }
    if (mode === 'marcar') {
      pending = pct(e);
      pendingName = '';
      return;
    }
    if (mode === 'regua') {
      const p = pct(e);
      ruler = ruler.length >= 2 ? [p] : [...ruler, p];
      return;
    }
    sel = null;
    pan = { x: e.clientX, y: e.clientY, tx, ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function stageMove(e: PointerEvent) {
    if (drag) {
      const p = pct(e);
      drag = { ...drag, x: p.x, y: p.y, moved: drag.moved || Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 0.4 };
      return;
    }
    if (!pan) return;
    tx = pan.tx + e.clientX - pan.x;
    ty = pan.ty + e.clientY - pan.y;
    clampPan();
  }
  function stageUp() {
    pan = null;
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      sel = d.i;
      return;
    }
    save(markers.map((m, i) => (i === d.i ? { ...m, x: d.x, y: d.y } : m)));
    sel = d.i;
  }
  function markerDown(e: PointerEvent, i: number) {
    e.stopPropagation();
    if (mode === 'regua') {
      const m = markers[i]!;
      ruler = ruler.length >= 2 ? [{ x: m.x, y: m.y }] : [...ruler, { x: m.x, y: m.y }];
      return;
    }
    const m = markers[i]!;
    drag = { i, x: m.x, y: m.y, moved: false };
    stage?.setPointerCapture(e.pointerId);
  }

  // ---- gravar
  function save(list: MapMarker[]) {
    if (map) cadernos.update(map.path, (t) => writeMarkers(t, list));
  }
  function addMarker(name: string) {
    const n = name.trim();
    if (!pending || !n) return;
    const e = byName.get(fold(n));
    const label = e ? `[[${e.name}]]` : n.startsWith('[[') ? n : `[[${n}]]`;
    save([...markers, { label, target: label.replace(/^\[\[|\]\]$/g, ''), x: pending.x, y: pending.y }]);
    sel = markers.length;
    pending = null;
    mode = 'mover';
  }
  function removeMarker(i: number) {
    save(markers.filter((_, j) => j !== i));
    sel = null;
  }
  function scatter() {
    if (!terrain || !unplacedPlaces.length) return;
    const spots = suggestSpots(terrain, unplacedPlaces.length, markers, info.seed ?? 1);
    save([...markers, ...spots.map((s, i) => ({ label: `[[${unplacedPlaces[i]!.name}]]`, target: unplacedPlaces[i]!.name, x: s.x, y: s.y }))]);
    cadernos.say(`${spots.length} ${spots.length === 1 ? 'lugar posto' : 'lugares postos'} no mapa. Arraste para ajustar.`);
  }
  function reseed() {
    if (!map) return;
    cadernos.update(map.path, (t) => setProp(setProp(t, 'semente', String(Math.floor(Math.random() * 99999) + 1)), 'imagem', null));
  }
  function pickImage() {
    if (!map) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || !map) return;
      const p = await files.attachFile(f);
      cadernos.update(map.path, (t) => setProp(t, 'imagem', `[[${p}]]`));
    };
    input.click();
  }
  function setScale(k: 'escala' | 'unidade', v: string) {
    if (map && v.trim()) cadernos.update(map.path, (t) => setProp(t, k, v.trim()));
  }

  // ---- territórios: quem controla cada lugar, pintado como regiões
  let realm = $state<'nenhum' | 'atual' | 'simulado'>('nenhum');
  const sim = $derived(cadernos.lastSim.get(world.name) ?? null);
  const factionList = $derived(world.entities.filter((e) => e.type === 'faccao'));
  const owners = $derived.by(() => {
    if (realm === 'simulado' && sim) {
      const m = new Map<string, string>();
      for (const a of sim.actors) if (a.alive) for (const t of a.territory) m.set(t, a.path);
      return m;
    }
    return realm === 'atual' ? placeOwners(world) : new Map<string, string>();
  });
  let overlay = $state<HTMLCanvasElement>();
  const realmLegend = $derived(factionList.filter((f) => [...owners.values()].includes(f.path)));
  $effect(() => {
    const cv = overlay;
    if (!cv || realm === 'nenhum') return;
    const idx = new Map(factionList.map((f, i) => [f.path, i]));
    const sites: Array<{ x: number; y: number; owner: number }> = [];
    markers.forEach((mk, i) => {
      const e = entityOf(mk);
      if (!e) return;
      const p = pos(i, mk);
      const own = e.type === 'faccao' ? e.path : owners.get(e.path);
      if (own !== undefined && idx.has(own)) sites.push({ x: p.x, y: p.y, owner: idx.get(own)! });
    });
    const t = terrain;
    const w = t ? t.w : 240;
    const h = t ? t.h : Math.round(240 / aspect);
    const grid = territoryGrid(w, h, sites, { land: t ? (x, y) => t.height[y * t.w + x]! >= t.sea : undefined, reach: 18, aspect });
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(w, h);
    const names = factionList.map((f) => f.name);
    const rgb = factionList.map((f) => { const c = factionColor(f.name, names); return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const; });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = grid[y * w + x]!;
        if (o < 0) continue;
        const edge = [grid[y * w + x + 1], grid[y * w + x - 1], grid[(y + 1) * w + x], grid[(y - 1) * w + x]].some((n) => n !== undefined && n !== o);
        const i = (y * w + x) * 4;
        const [r, g, b] = rgb[o]!;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
        img.data[i + 3] = edge ? 230 : 80;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // ---- estradas: as `rotas` entre lugares, contornando água e montanha
  const rotas = $derived(rotasDoMundo(world.entities));
  const posByPath = $derived.by(() => {
    const m = new Map<string, { x: number; y: number }>();
    markers.forEach((mk, i) => {
      const e = entityOf(mk);
      if (e) m.set(e.path, pos(i, mk));
    });
    return m;
  });
  const roadCache = new Map<string, Array<{ x: number; y: number }>>();
  const estradas = $derived.by(() => {
    const t = terrain;
    return rotas.flatMap(([a, b]) => {
      const pa = posByPath.get(a);
      const pb = posByPath.get(b);
      if (!pa || !pb) return [];
      if (!t || drag) return [[pa, pb]];
      const key = `${t.seed}|${pa.x},${pa.y}|${pb.x},${pb.y}`;
      let r = roadCache.get(key);
      if (!r) {
        r = roadPath(t, pa, pb);
        roadCache.set(key, r);
      }
      return [r];
    });
  });
  const svgPts = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${(p.x * aspect).toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  // largura mínima de 1 px na tela, qualquer que seja o zoom
  const unitPx = $derived(Math.max(0.01, (vw / aspect / 100) * zoom));
  const minW = (px: number) => px / unitPx;

  // ---- estruturas: o ícone de cada lugar (cidade, castelo, porto...) pela ficha, pelo nome e pela água ao lado
  const donos = $derived(placeOwners(world));
  const ESTRUTURAS: Array<[Estrutura, string]> = [
    ['capital', 'capital'], ['cidade', 'cidade'], ['vila', 'vila'], ['aldeia', 'aldeia'], ['castelo', 'castelo'], ['forte', 'forte'], ['porto', 'porto'],
    ['templo', 'templo'], ['torre', 'torre'], ['ruina', 'ruínas'], ['mina', 'mina'], ['caverna', 'caverna'], ['acampamento', 'acampamento'],
    ['floresta', 'floresta'], ['montanha', 'montanha'], ['regiao', 'região (só o nome)'],
  ];
  const KINDS = new Set<string>(ESTRUTURAS.map(([k]) => k));
  function estruturaDoMarcador(mk: MapMarker, e: Entity | null): Estrutura | null {
    // marcador sem ficha, mas com "Tipo" na tabela (povoados sugeridos)
    if (!e) return mk.kind && KINDS.has(mk.kind) ? (mk.kind as Estrutura) : null;
    if (e.type !== 'lugar') return null;
    const explicito = Object.keys(e.props).some((k) => /^(estrutura|categoria|tipo de lugar|porte|subtipo)$/i.test(k));
    if (!explicito && mk.kind && KINDS.has(mk.kind)) return mk.kind as Estrutura;
    return estruturaDe(e, { agua: terrain ? nearWater(terrain, mk.x, mk.y) : null });
  }
  function corDono(e: Entity | null): string {
    const d = e ? donos.get(e.path) : undefined;
    const f = d ? byPath.get(d) : undefined;
    return f ? factionColor(f.name, factionList.map((x) => x.name)) : '#b5402f';
  }
  function setEstrutura(path: string, v: string) {
    cadernos.update(path, (t) => setProp(t, 'estrutura', v || null));
  }
  function setTerreno(k: 'mar' | 'rios', v: string) {
    if (map) cadernos.update(map.path, (t) => setProp(t, k, v || null));
  }

  // ---- medida
  const dist = $derived(ruler.length === 2 ? mapDistance(ruler[0]!, ruler[1]!, info.scale, aspect) : null);
  const trips = $derived(dist === null ? null : travelTimes(dist, info.unit));
  const fmtN = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
  const fmtDays = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${fmtN(d)} ${d < 1.5 ? 'dia' : 'dias'}`);

  const selMarker = $derived(sel !== null ? markers[sel] ?? null : null);
  const selEntity = $derived(selMarker ? entityOf(selMarker) : null);
  const pos = (i: number, m: MapMarker) => (drag?.i === i ? { x: drag.x, y: drag.y } : m);

  // ---- atlas: símbolos, nomes, acidentes, recursos, explorar
  let showSimbolos = $state<boolean | null>(null);
  let showNomes = $state(true);
  let showAcidentes = $state(true);
  let showRecursos = $state(false);
  let showPainel = $state(false);
  const simOn = $derived(showSimbolos ?? estilo !== 'relevo');
  const atlas = $derived(terrain?.atlas ?? null);
  const simbolos = $derived(terrain && simOn && camada === 'nenhuma' ? mapSymbols(terrain) : []);
  const nomesOff = $derived(/^(n[aã]o|nenhum|sem)$/i.test(info.nomes ?? ''));
  const regionNames = $derived(atlas && terrain && !nomesOff ? nomearRegioes(atlas.regions, info.nomes, terrain.seed, atlas.natureza.id) : []);
  const featNames = $derived(atlas && terrain ? nomearAcidentes(atlas.features, info.nomes, terrain.seed) : []);
  const shares = $derived(terrain ? biomeShares(terrain) : []);
  let featSel = $state<number | null>(null);
  let probe = $state<{ x: number; y: number } | null>(null);
  let sonda = $state<Sondagem | null>(null);
  let biomaAberto = $state<BiomaInfo | null>(null);
  // o tamanho do texto acompanha o zoom só em parte (perto, não vira um letreiro)
  const fontK = $derived(1 / Math.pow(zoom, 0.65));
  function labelSize(kind: string, area: number): number {
    if (kind === 'continente') return 3.6 + Math.min(1.6, area * 4);
    if (kind === 'mar') return 2.4 + Math.min(1, area * 3);
    if (kind === 'cordilheira') return 1.7 + Math.min(0.8, area * 14);
    if (kind === 'ilha' || kind === 'lago') return 1.3;
    return 1.45 + Math.min(0.7, area * 8);
  }
  const ESTILOS: Array<[EstiloMapa, string]> = [['pergaminho', 'Pergaminho'], ['atlas', 'Atlas'], ['relevo', 'Relevo']];
  const CAMADAS: Array<[CamadaMapa, string]> = [['nenhuma', 'Paisagem'], ['biomas', 'Biomas'], ['altitude', 'Altitude'], ['temperatura', 'Temperatura'], ['chuva', 'Chuva'], ['placas', 'Placas tectônicas'], ['rochas', 'Rochas']];
  const LEGENDA: Partial<Record<CamadaMapa, { de: string; ate: string; cores: string }>> = {
    altitude: { de: '0 m', ate: '4.400 m', cores: 'linear-gradient(90deg, rgb(92,140,84), rgb(204,196,128), rgb(184,146,96), rgb(150,112,86), rgb(250,250,252))' },
    temperatura: { de: '−25 °C', ate: '34 °C', cores: 'linear-gradient(90deg, rgb(70,60,160), rgb(90,130,210), rgb(200,226,246), rgb(180,214,140), rgb(250,220,110), rgb(236,120,60), rgb(170,30,40))' },
    chuva: { de: 'seco', ate: '3.400 mm/ano', cores: 'linear-gradient(90deg, rgb(176,120,70), rgb(222,196,130), rgb(180,200,110), rgb(90,160,90), rgb(50,130,140), rgb(40,70,160))' },
    placas: { de: 'vermelho: choque', ate: 'azul: separação', cores: 'linear-gradient(90deg, rgb(200,50,40), rgb(230,220,210), rgb(40,80,200))' },
  };
  function setMapa(k: string, v: string | null) {
    if (map) cadernos.update(map.path, (t) => setProp(t, k, v || null));
  }
  function setEstilo(e: EstiloMapa) {
    setMapa('estilo', e);
    if (showSimbolos !== null) showSimbolos = null;
  }
  const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');

  /** Cria a ficha de um lugar e põe (ou religa) o marcador nele. */
  function criarLugar(nome: string, x: number, y: number, props: Record<string, string>, secao?: [string, string], marcador?: number) {
    let t0 = (n: string) => setProps(entityTemplate(n, world.name, 'lugar'), props);
    if (secao) {
      const base = t0;
      t0 = (n: string) => setSection(base(n), secao[0], secao[1]);
    }
    const path = cadernos.create(entityFolder(world, 'lugar'), nome, t0);
    const final = path.split('/').pop()!.replace(/\.md$/, '');
    const lista = readMarkers(cadernos.read(map!.path));
    const novo = { label: `[[${final}]]`, target: final, x, y };
    save(marcador !== undefined ? lista.map((m, i) => (i === marcador ? { ...m, ...novo, kind: undefined } : m)) : [...lista, novo]);
    cadernos.say(`Ficha de ${final} criada.`);
    return path;
  }
  function featParaFicha(i: number) {
    const f = atlas?.features[i];
    if (!f) return;
    const info = ACIDENTES[f.kind];
    const nome = featNames[i] ?? info.label;
    const b = terrain ? sondar(terrain, f.x, f.y) : null;
    const desc = `${info.desc}${b ? ` Fica em ${b.bioma.label.toLowerCase()}, a ${fmtInt(b.altitude)} m.` : ''}`;
    onopen(criarLugar(nome, f.x, f.y, { estrutura: f.kind === 'caverna' ? 'caverna' : 'montanha', acidente: info.label.toLowerCase() }, ['Descrição', desc]));
    featSel = null;
  }
  function regiaoParaFicha(i: number) {
    const r = atlas?.regions[i];
    const nome = regionNames[i];
    if (!r || !nome) return;
    onopen(criarLugar(nome, r.x, r.y, { estrutura: 'regiao' }));
  }
  function escreverGeografia() {
    if (!map || !terrain) return;
    const nomes = new Map<string, string>();
    regionNames.forEach((n, i) => nomes.set(`r${i}`, n));
    featNames.forEach((n, i) => nomes.set(`f${i}`, n));
    cadernos.update(map.path, (t) => setSection(t, 'Geografia', geografiaTexto(terrain!, nomes)));
    cadernos.say('Geografia escrita na nota do mapa (seção "Geografia").');
  }

  // ---- povoar: sugere cidades, portos, minas e fortes onde o terreno pede
  let sugestoes = $state<PovoadoMapa[]>([]);
  let povoarN = $state(10);
  function sugerirPovos() {
    if (!terrain) return;
    sugestoes = povoarMapa(terrain, povoarN, markers, { seed: Math.floor(Math.random() * 1e6), nomes: info.nomes });
  }
  function aceitarPovos() {
    save([...markers, ...sugestoes.map((p) => ({ label: `[[${p.nome}]]`, target: p.nome, x: p.x, y: p.y, kind: p.kind }))]);
    cadernos.say(`${sugestoes.length} lugares postos no mapa. Toque num deles para criar a ficha.`);
    sugestoes = [];
  }
</script>

<div class="mapas">
  <div class="bar">
    <div class="maps">
      {#each atlasGroups as g (g.plano)}
        {#if atlasGroups.length > 1}<span class="plano" title={g.nat.desc} style:--n={NAT_COR[g.nat.id]}>{g.plano === '' ? world.name : g.plano}<small>{g.nat.label}</small></span>{/if}
        {#each g.maps as m (m.path)}<button class:on={m === map} onclick={() => (mapPath = m.path)}>⌖ {m.name}</button>{/each}
      {/each}
      <button class="ghost" onclick={onnewmap}>+ Mapa</button>
    </div>
    {#if map}
      <div class="modes" role="radiogroup" aria-label="Ferramenta">
        <button class:on={mode === 'mover'} onclick={() => (mode = 'mover')} title="Arrastar o mapa e os marcadores">✥ Mover</button>
        <button class:on={mode === 'marcar'} onclick={() => { mode = 'marcar'; ruler = []; }} title="Clique no mapa para pôr um marcador">📍 Marcar</button>
        <button class:on={mode === 'regua'} onclick={() => { mode = 'regua'; ruler = []; pending = null; }} title="Clique em dois pontos para medir">📏 Medir</button>
        {#if atlas}<button class:on={mode === 'explorar'} onclick={() => { mode = 'explorar'; pending = null; ruler = []; }} title="Clique em qualquer ponto: bioma, clima, rocha, riquezas">🔍 Explorar</button>{/if}
      </div>
    {/if}
  </div>

  {#if !map}
    <div class="empty">
      <div class="globe" aria-hidden="true">🗺</div>
      <p>Nenhum mapa ainda. Crie um: sem imagem, o Tanden gera um continente pela semente; com uma imagem sua, é só marcar os lugares.</p>
      <button class="primary" onclick={onnewmap}>Criar mapa</button>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    {#if atlas}
      <div class="layers">
        <div class="t-seg" role="radiogroup" aria-label="Estilo do mapa">
          {#each ESTILOS as [id, label] (id)}<button role="radio" aria-checked={estilo === id} class:on={estilo === id} onclick={() => setEstilo(id)}>{label}</button>{/each}
        </div>
        <select class="t-select" bind:value={camada} aria-label="Camada">
          {#each CAMADAS as [id, label] (id)}{#if id !== 'placas' || terrain?.plates}<option value={id}>{label}</option>{/if}{/each}
        </select>
        <span class="toggles">
          <button class="t-chip" class:on={simOn} onclick={() => (showSimbolos = !simOn)} title="Montanhas, árvores e dunas desenhadas">⛰ Símbolos</button>
          <button class="t-chip" class:on={showNomes && !nomesOff} onclick={() => (showNomes = !showNomes)} disabled={nomesOff} title="Nomes de serras, mares, desertos e ilhas">Aa Nomes</button>
          <button class="t-chip" class:on={showAcidentes} onclick={() => (showAcidentes = !showAcidentes)} title="Vulcões, cachoeiras, cavernas, oásis...">🌋 Acidentes</button>
          <button class="t-chip" class:on={showRecursos} onclick={() => (showRecursos = !showRecursos)} title="Minérios, madeira, especiarias, pesca...">⛏ Riquezas</button>
        </span>
      </div>
    {/if}
    <div class="viewport mode-{mode} est-{estilo}" bind:this={viewport} bind:clientWidth={vw} bind:clientHeight={vh} onwheel={wheel} style:aspect-ratio={aspect}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="stage" bind:this={stage} style:aspect-ratio={aspect} style:transform="translate({tx}px, {ty}px) scale({zoom})" style:--z={zoom}
        onpointerdown={stageDown} onpointermove={stageMove} onpointerup={stageUp} onpointercancel={stageUp}>
        {#if info.image}
          {#if imgUrl}<img src={imgUrl} alt={map.name} draggable="false" onload={(e) => { const i = e.currentTarget as HTMLImageElement; if (i.naturalHeight) aspect = i.naturalWidth / i.naturalHeight; }} />{/if}
        {:else if seed !== null}
          <canvas bind:this={canvas} class="terrain" class:anim={theme.motion !== 'parado' && !painting} class:wait={painting}></canvas>
          <canvas bind:this={detailCanvas} class="detail" style:display={detail ? 'block' : 'none'}
            style:left="{detail?.x0 ?? 0}%" style:top="{detail?.y0 ?? 0}%" style:width="{detail ? detail.x1 - detail.x0 : 0}%" style:height="{detail ? detail.y1 - detail.y0 : 0}%"></canvas>
        {/if}
        {#if realm !== 'nenhum'}<canvas class="realm" bind:this={overlay}></canvas>{/if}
        <svg class="over" viewBox="0 0 {100 * aspect} 100" preserveAspectRatio="none" aria-hidden="true">
          {#if terrain}
            {#each terrain.rivers as r, i (i)}<polyline class="river" points={svgPts(r.pts)} stroke-width={Math.max(r.w, minW(r.w < 0.08 ? 0.7 : 1.1))} />{/each}
          {/if}
          {#if simbolos.length}<MapaSimbolos list={simbolos} {aspect} />{/if}
          {#if atlas && showNomes && !nomesOff}
            {#each atlas.regions as r, i (i)}
              {#if regionNames[i]}
                <text class="rname k-{r.kind}" x={(r.x < 22 ? Math.max(1.5, r.x - 6) : r.x > 78 ? Math.min(98.5, r.x + 6) : r.x) * aspect} y={r.y} font-size={labelSize(r.kind, r.area) * fontK} transform="rotate({r.angle} {r.x * aspect} {r.y})"
                  text-anchor={r.x < 22 ? 'start' : r.x > 78 ? 'end' : 'middle'} dominant-baseline="middle">{regionNames[i]}</text>
              {/if}
            {/each}
          {/if}
          {#each estradas as r, i (i)}
            <polyline class="road-under" points={svgPts(r)} stroke-width={minW(3.2)} />
            <polyline class="road" points={svgPts(r)} stroke-width={minW(1.6)} stroke-dasharray="{minW(5)} {minW(3)}" />
          {/each}
          {#if ruler.length === 2}<line class="rule" x1={ruler[0]!.x * aspect} y1={ruler[0]!.y} x2={ruler[1]!.x * aspect} y2={ruler[1]!.y} />{/if}
        </svg>
        {#each ruler as p, i (i)}<i class="rdot" style:left="{p.x}%" style:top="{p.y}%"></i>{/each}
        {#if dist !== null}
          <span class="rlabel" style:left="{(ruler[0]!.x + ruler[1]!.x) / 2}%" style:top="{(ruler[0]!.y + ruler[1]!.y) / 2}%">{fmtN(dist)} {info.unit}</span>
        {/if}

        {#if atlas && showRecursos}
          {#each atlas.resources as r, i (i)}
            <span class="res" style:left="{r.x}%" style:top="{r.y}%" title="{RECURSOS[r.kind].label}: {RECURSOS[r.kind].desc}">{RECURSOS[r.kind].glyph}</span>
          {/each}
        {/if}
        {#if atlas && showAcidentes}
          {#each atlas.features as f, i (i)}
            <button class="feat" class:on={featSel === i} style:left="{f.x}%" style:top="{f.y}%" title="{featNames[i]} ({ACIDENTES[f.kind].label})"
              onpointerdown={(ev) => { ev.stopPropagation(); featSel = i; sel = null; sonda = null; }}>
              <AcidenteIcone kind={f.kind} size={18} />
            </button>
          {/each}
        {/if}
        {#each sugestoes as p, i (i)}
          <span class="pin est sug" style:left="{p.x}%" style:top="{p.y}%" style:--s="{Math.round(22 * ESTRUTURA_TAMANHO[p.kind])}px" style:--c="#b5402f" title="{p.nome}: {p.motivo}">
            <span class="icon"><EstruturaIcone kind={p.kind} size={Math.round(22 * ESTRUTURA_TAMANHO[p.kind])} /></span>
            <span class="name">{p.nome}</span>
          </span>
        {/each}
        {#if probe && mode === 'explorar'}<i class="probe" style:left="{probe.x}%" style:top="{probe.y}%"></i>{/if}

        {#each markers as m, i (i)}
          {@const e = entityOf(m)}
          {@const p = pos(i, m)}
          {@const k = estruturaDoMarcador(m, e)}
          {#if k === 'regiao'}
            <button class="pin regiao" class:on={sel === i} style:left="{p.x}%" style:top="{p.y}%" onpointerdown={(ev) => markerDown(ev, i)} title={e?.name}>
              {e?.name}
            </button>
          {:else if k}
            {@const s = Math.round(24 * ESTRUTURA_TAMANHO[k])}
            <button class="pin est" class:on={sel === i} class:capital={k === 'capital'} style:left="{p.x}%" style:top="{p.y}%" style:--s="{s}px" style:--c={corDono(e)}
              onpointerdown={(ev) => markerDown(ev, i)} title={`${e?.name ?? m.label.replace(/^\[\[|\]\]$/g, '')} (${k}${e ? '' : ', sem ficha'})`}>
              <span class="icon" class:fantasma={!e}><EstruturaIcone kind={k} size={s} /></span>
              <span class="name">{e?.name ?? m.label.replace(/^\[\[|\]\]$/g, '')}</span>
            </button>
          {:else}
            <button class="pin" class:on={sel === i} class:ghost={!e} style:left="{p.x}%" style:top="{p.y}%" style:--c={e ? typeColor(e.type) : 'var(--silver)'}
              onpointerdown={(ev) => markerDown(ev, i)} title={e ? `${e.name} (${typeInfo(e.type).label})` : m.label}>
              <span class="dot">{e ? typeGlyph(e.type) : '•'}</span>
              <span class="name">{e?.name ?? m.label.replace(/^\[\[|\]\]$/g, '')}</span>
            </button>
          {/if}
        {/each}

        {#if pending}
          <form class="addpop" style:left="{pending.x}%" style:top="{pending.y}%" onpointerdown={(e) => e.stopPropagation()}
            onsubmit={(e) => { e.preventDefault(); addMarker(pendingName); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={pendingName} list="mapa-fichas" placeholder="Lugar ou ficha" autofocus onkeydown={(e) => { if (e.key === 'Escape') pending = null; }} />
            <datalist id="mapa-fichas">{#each unplaced as u (u.path)}<option value={u.name}>{typeInfo(u.type).label}</option>{/each}</datalist>
            <button class="primary sm" disabled={!pendingName.trim()}>OK</button>
          </form>
        {/if}
      </div>

      <svg class="rose" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 24 20 20 38 16 20Z" /><path d="M2 20 20 16 38 20 20 24Z" class="h" /><text x="20" y="9" text-anchor="middle">N</text></svg>
      <div class="zoom">
        <button onclick={() => zoomAt(1.4)} title="Aproximar">+</button>
        <button onclick={() => zoomAt(1 / 1.4)} title="Afastar">−</button>
        <button onclick={resetView} title="Mapa inteiro">⤢</button>
      </div>

      {#if realm !== 'nenhum' && realmLegend.length}
        <div class="realms">{#each realmLegend as f (f.path)}<button style:--c={factionColor(f.name, factionList.map((x) => x.name))} onclick={() => onopen(f.path)}><i></i>{f.name}</button>{/each}</div>
      {/if}
      {#if mode === 'marcar' && !pending}<p class="hint">Clique onde fica o lugar.</p>{/if}
      {#if mode === 'explorar' && !sonda}<p class="hint">Clique em qualquer ponto do mapa.</p>{/if}
      {#if camada !== 'nenhuma' && LEGENDA[camada]}
        {@const l = LEGENDA[camada]!}
        <div class="scale"><i style:background={l.cores}></i><span>{l.de}</span><span>{l.ate}</span></div>
      {/if}
      {#if sonda && mode === 'explorar'}
        <div class="peek sonda" style:--c={rgb(sonda.bioma.cor)}>
          <span class="kind">{sonda.bioma.label}</span>
          <span class="sum">{sonda.bioma.desc}</span>
          <div class="facts">
            <span><b>{sonda.altitude >= 0 ? `${fmtInt(sonda.altitude)} m` : `${fmtInt(-sonda.altitude)} m de fundo`}</b>altitude</span>
            <span><b>{sonda.temperatura.toLocaleString('pt-BR')} °C</b>média do ano</span>
            <span><b>{fmtInt(sonda.chuva)} mm</b>chuva por ano</span>
            <span><b>{Math.abs(sonda.latitude)}° {sonda.latitude >= 0 ? 'N' : 'S'}</b>latitude</span>
          </div>
          {#if !sonda.bioma.agua}<span class="sum"><b>Rocha:</b> {sonda.rocha.label}. {sonda.rocha.desc}</span>{/if}
          {#if sonda.placa}<span class="sum"><b>Placa:</b> {sonda.placa.oceanic ? 'oceânica' : 'continental'}{sonda.placa.borda === 'convergente' ? ', perto de onde as placas se chocam (terremotos, serras, vulcões)' : sonda.placa.borda === 'divergente' ? ', perto de onde as placas se afastam (riftes, fendas)' : ''}.</span>{/if}
          {#if sonda.bioma.fauna.length}<span class="sum"><b>Vida:</b> {[...sonda.bioma.flora, ...sonda.bioma.fauna].join(', ')}.</span>{/if}
          {#if sonda.bioma.perigos.length}<span class="sum"><b>Perigos:</b> {sonda.bioma.perigos.join(', ')}.</span>{/if}
          {#if sonda.recursos.length}<span class="sum"><b>Por perto:</b> {sonda.recursos.map((r) => RECURSOS[r.kind].label.toLowerCase()).join(', ')}.</span>{/if}
          <div class="pacts">
            {#if !sonda.bioma.agua}<button class="primary sm" onclick={() => { pending = probe; pendingName = ''; mode = 'marcar'; sonda = null; }}>Marcar um lugar aqui</button>{/if}
            <button class="ghost sm" onclick={() => { sonda = null; probe = null; }}>Fechar</button>
          </div>
        </div>
      {/if}
      {#if featSel !== null && atlas?.features[featSel]}
        {@const f = atlas.features[featSel]!}
        <div class="peek" style:--c="#c87a3a">
          <span class="kind">{ACIDENTES[f.kind].label}</span>
          <b>{featNames[featSel]}</b>
          <span class="sum">{ACIDENTES[f.kind].desc}</span>
          {#if terrain}{@const b = sondar(terrain, f.x, f.y)}{#if b}<span class="sum">Em {b.bioma.label.toLowerCase()}, a {fmtInt(b.altitude)} m, {b.temperatura.toLocaleString('pt-BR')} °C.</span>{/if}{/if}
          <div class="pacts">
            <button class="primary sm" onclick={() => featParaFicha(featSel!)}>Virar ficha de lugar</button>
            <button class="ghost sm" onclick={() => (featSel = null)}>Fechar</button>
          </div>
        </div>
      {/if}
      {#if mode === 'regua' && ruler.length < 2}<p class="hint">{ruler.length ? 'Agora o destino.' : 'Clique na origem (ou num marcador).'}</p>{/if}

      {#if dist !== null}
        <div class="trip">
          <b>{fmtN(dist)} {info.unit}</b>
          {#if trips}{#each trips as t (t.how)}<span>{t.how}: {fmtDays(t.days)}</span>{/each}{/if}
          <button class="x" onclick={() => (ruler = [])} aria-label="Limpar medida">✕</button>
        </div>
      {/if}

      {#if selMarker}
        <div class="peek" style:--c={selEntity ? typeColor(selEntity.type) : 'var(--silver)'}>
          {#if selEntity}
            <span class="kind">{typeInfo(selEntity.type).label}</span>
            <b>{selEntity.name}</b>
            {#if selEntity.summary}<span class="sum">{selEntity.summary}</span>{/if}
          {:else}
            <span class="kind">Sem ficha</span>
            <b>{selMarker.label.replace(/^\[\[|\]\]$/g, '')}</b>
          {/if}
          {#if terrain}
            {@const agua = nearWater(terrain, selMarker.x, selMarker.y)}
            {@const sd = sondar(terrain, selMarker.x, selMarker.y)}
            <span class="sum">Terreno: {sd ? `${sd.bioma.label.toLowerCase()}, ${fmtInt(Math.max(0, sd.altitude))} m, ${sd.temperatura.toLocaleString('pt-BR')} °C` : BIOME_LABEL[biomeAtPercent(terrain, selMarker.x, selMarker.y)]}{agua ? ` · à beira de ${agua === 'mar' ? 'mar' : agua === 'lago' ? 'um lago' : 'um rio'}` : ''}</span>
          {/if}
          {#if selEntity?.type === 'lugar'}
            {@const atual = estruturaDoMarcador(selMarker, selEntity)}
            <label class="sum est-sel">Estrutura
              <select value={typeof selEntity.props['estrutura'] === 'string' ? atual : ''} onchange={(ev) => setEstrutura(selEntity!.path, (ev.currentTarget as HTMLSelectElement).value)}>
                <option value="">automática ({atual})</option>
                {#each ESTRUTURAS as [v, l] (v)}<option value={v}>{l}</option>{/each}
              </select>
            </label>
          {/if}
          <div class="pacts">
            {#if selEntity}<button class="primary sm" onclick={() => onopen(selEntity!.path)}>Abrir ficha</button>
            {:else if selMarker.target}<button class="primary sm" onclick={() => onopen(criarLugar(selMarker!.target!, selMarker!.x, selMarker!.y, selMarker!.kind ? { estrutura: selMarker!.kind } : {}, undefined, sel!))}>Criar ficha</button>{/if}
            <button class="ghost sm" onclick={() => { mode = 'regua'; ruler = [{ x: selMarker!.x, y: selMarker!.y }]; }}>Medir daqui</button>
            <button class="ghost sm danger" onclick={() => removeMarker(sel!)}>Tirar do mapa</button>
          </div>
        </div>
      {/if}
    </div>

    <div class="foot">
      <label>Largura <input value={String(info.scale)} onchange={(e) => setScale('escala', (e.currentTarget as HTMLInputElement).value)} inputmode="decimal" /></label>
      <label>Unidade <input value={info.unit} onchange={(e) => setScale('unidade', (e.currentTarget as HTMLInputElement).value)} /></label>
      <label>Territórios
        <select bind:value={realm}>
          <option value="nenhum">não mostrar</option>
          <option value="atual">de hoje</option>
          {#if sim}<option value="simulado">depois da simulação ({sim.end})</option>{/if}
        </select>
      </label>
      <span class="sp"></span>
      {#if terrain && unplacedPlaces.length}<button class="ghost sm" onclick={scatter} title="Põe os lugares sem marcador em pontos de terra firme">✨ Espalhar {unplacedPlaces.length} {unplacedPlaces.length === 1 ? 'lugar' : 'lugares'}</button>{/if}
      {#if !info.image}
        <label>Mar
          <select value={seaOpt === null ? '' : String(Math.round(seaOpt * 100))} onchange={(e) => setTerreno('mar', (e.currentTarget as HTMLSelectElement).value ? `${(e.currentTarget as HTMLSelectElement).value}%` : '')}>
            <option value="">padrão</option>
            {#each [30, 40, 50, 55, 60, 70, 80] as n (n)}<option value={String(n)}>{n}%</option>{/each}
          </select>
        </label>
        <label>Rios
          <select value={riverOpt === null ? '' : String(riverOpt)} onchange={(e) => setTerreno('rios', (e.currentTarget as HTMLSelectElement).value)}>
            <option value="">padrão</option>
            <option value="0">nenhum</option><option value="0.5">poucos</option><option value="1">normal</option><option value="2">muitos</option><option value="3">rede densa</option>
          </select>
        </label>
        <button class="ghost sm" onclick={reseed} title="Gera outro continente (os marcadores ficam onde estão)">🎲 Outro terreno</button>
        <button class="ghost sm" class:on={showPainel} onclick={() => (showPainel = !showPainel)} title="Clima, tectônica, calor e nomes">⚙ Mundo físico</button>
      {/if}
      <button class="ghost sm" onclick={pickImage}>{info.image ? 'Trocar imagem' : 'Usar minha imagem'}</button>
      {#if info.image}<button class="ghost sm" onclick={reseed}>Usar terreno gerado</button>{/if}
      <button class="ghost sm" onclick={() => onopen(map!.path)}>Nota do mapa</button>
    </div>

    {#if showPainel && !info.image}
      <div class="fisico t-card">
        <label>Tamanho
          <select class="t-select" value={tamId} onchange={(e) => setMapa('tamanho', (e.currentTarget as HTMLSelectElement).value === 'continente' ? null : (e.currentTarget as HTMLSelectElement).value)}>
            {#each TAMANHOS as t (t.id)}<option value={t.id} title={t.desc}>{t.label}</option>{/each}
          </select>
        </label>
        <label>Plano
          <select class="t-select" value={info.plano ?? ''} onchange={(e) => setMapa('plano', (e.currentTarget as HTMLSelectElement).value ? `[[${(e.currentTarget as HTMLSelectElement).value}]]` : null)}>
            <option value="">{world.name} (mundo principal)</option>
            {#each planos as p (p.path)}<option value={p.name}>{p.name}</option>{/each}
            {#if info.plano && !planos.some((p) => fold(p.name) === fold(info.plano!))}<option value={info.plano}>{info.plano}</option>{/if}
          </select>
        </label>
        <label>Natureza
          <select class="t-select" value={info.natureza ? naturezaInfo(info.natureza).id : ''} onchange={(e) => setMapa('natureza', (e.currentTarget as HTMLSelectElement).value || null)}>
            <option value="">{planoEnt ? `a do plano (${naturezaInfo(natOpt).label.toLowerCase()})` : 'material (mundo comum)'}</option>
            {#each NATUREZAS as n (n.id)}<option value={n.id} title={n.desc}>{n.label}</option>{/each}
          </select>
        </label>
        <label>Clima
          <select class="t-select" value={atlas?.clima.id ?? 'temperado'} onchange={(e) => setMapa('clima', (e.currentTarget as HTMLSelectElement).value)}>
            {#each CLIMAS as c (c.id)}<option value={c.id}>{c.label} ({Math.abs(c.top)}°{c.top >= 0 ? 'N' : 'S'} a {Math.abs(c.bottom)}°{c.bottom >= 0 ? 'N' : 'S'})</option>{/each}
          </select>
        </label>
        <label>Calor
          <select class="t-select" value={String(calorOpt ?? 0)} onchange={(e) => setMapa('calor', (e.currentTarget as HTMLSelectElement).value === '0' ? null : (e.currentTarget as HTMLSelectElement).value)}>
            {#each [-15, -10, -5, 0, 5, 10, 15] as n (n)}<option value={String(n)}>{n > 0 ? `+${n}` : n} °C{n === 0 ? ' (normal)' : n < -9 ? ' (era do gelo)' : n > 9 ? ' (estufa)' : ''}</option>{/each}
          </select>
        </label>
        <label>Relevo
          <select class="t-select" value={platesOpt ? 'placas' : 'ruido'} onchange={(e) => setMapa('tectônica', (e.currentTarget as HTMLSelectElement).value === 'placas' ? 'sim' : null)}>
            <option value="placas">por placas tectônicas</option><option value="ruido">clássico (mapas antigos)</option>
          </select>
        </label>
        <label>Nomes
          <select class="t-select" value={info.nomes ?? ''} onchange={(e) => setMapa('nomes', (e.currentTarget as HTMLSelectElement).value)}>
            <option value="">pela semente</option>
            {#each NAME_STYLES as st (st.id)}<option value={st.id}>{st.label}</option>{/each}
            <option value="não">sem nomes</option>
          </select>
        </label>
        <p class="dim small">Mudar o relevo ou o tamanho troca o terreno (os marcadores ficam onde estão, em %). {tamanhoMapa(tamId).desc} {naturezaInfo(natOpt).desc}</p>
      </div>
    {/if}

    {#if atlas}
      <div class="atlas">
        <section class="t-card">
          <h3 class="t-eyebrow">Paisagens</h3>
          <ul class="shares">
            {#each shares.slice(0, 9) as sh (sh.bioma.id)}
              <li><button class:on={biomaAberto?.id === sh.bioma.id} onclick={() => (biomaAberto = biomaAberto?.id === sh.bioma.id ? null : sh.bioma)}>
                <i style:background={rgb(sh.bioma.cor)}></i><span>{sh.bioma.label}</span><span class="bar"><em style:width="{Math.round(sh.share * 100)}%"></em></span><small>{Math.round(sh.share * 100)}%</small>
              </button></li>
            {/each}
          </ul>
          {#if biomaAberto}
            <div class="bioma">
              <p>{biomaAberto.desc}</p>
              {#if biomaAberto.flora.length}<p><b>Plantas:</b> {biomaAberto.flora.join(', ')}</p>{/if}
              {#if biomaAberto.fauna.length}<p><b>Bichos:</b> {biomaAberto.fauna.join(', ')}</p>{/if}
              {#if biomaAberto.perigos.length}<p><b>Perigos:</b> {biomaAberto.perigos.join(', ')}</p>{/if}
            </div>
          {/if}
        </section>
        <section class="t-card">
          <h3 class="t-eyebrow">Acidentes e regiões</h3>
          <ul class="feats">
            {#each atlas.features as f, i (i)}
              <li><button onclick={() => { featSel = i; showAcidentes = true; }}><AcidenteIcone kind={f.kind} size={16} /><span>{featNames[i]}</span><small>{ACIDENTES[f.kind].label}</small></button></li>
            {/each}
            {#each atlas.regions as r, i (i)}
              {#if regionNames[i] && r.kind !== 'mar'}
                <li><button onclick={() => regiaoParaFicha(i)} title="Criar ficha de lugar para esta região"><span class="rk">{r.kind === 'continente' ? '◼' : r.kind === 'ilha' ? '◆' : r.kind === 'cordilheira' ? '▲' : '◇'}</span><span>{regionNames[i]}</span><small>+ ficha</small></button></li>
              {/if}
            {/each}
          </ul>
        </section>
        <section class="t-card">
          <h3 class="t-eyebrow">Riquezas</h3>
          <ul class="feats">
            {#each [...new Set(atlas.resources.map((r) => r.kind))] as k (k)}
              <li title={RECURSOS[k].desc}><span class="rk">{RECURSOS[k].glyph}</span><span>{RECURSOS[k].label}</span><small>{atlas.resources.filter((r) => r.kind === k).length}×</small></li>
            {/each}
          </ul>
          <button class="ghost sm" onclick={() => (showRecursos = !showRecursos)}>{showRecursos ? 'Esconder no mapa' : 'Mostrar no mapa'}</button>
        </section>
        <section class="t-card">
          <h3 class="t-eyebrow">Povoar</h3>
          <p class="dim small">Sugere onde um povo construiria: rios, lagos e litoral, terra boa, minério, passagens das serras. Nada vira ficha até você pedir.</p>
          <div class="pacts">
            <label class="dim small">Quantos <select class="t-select" bind:value={povoarN}>{#each [6, 10, 16, 24] as n (n)}<option value={n}>{n}</option>{/each}</select></label>
            <button class="ghost sm" onclick={sugerirPovos}>🏘 {sugestoes.length ? 'Outra sugestão' : 'Sugerir povoados'}</button>
            {#if sugestoes.length}
              <button class="primary sm" onclick={aceitarPovos}>Pôr {sugestoes.length} no mapa</button>
              <button class="ghost sm" onclick={() => (sugestoes = [])}>Descartar</button>
            {/if}
          </div>
          <h3 class="t-eyebrow">Para escrever</h3>
          <button class="ghost sm" onclick={escreverGeografia} title="Clima, paisagens, acidentes e riquezas, na seção Geografia da nota do mapa">✎ Escrever a geografia na nota</button>
        </section>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mapas { display: flex; flex-direction: column; gap: 10px; padding-bottom: 20px; }
  .bar { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
  .maps, .modes { display: flex; gap: 4px; flex-wrap: wrap; }
  .maps button, .modes button { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 12px; font-size: 12.5px; color: var(--muted); }
  .maps button.on, .modes button.on { color: var(--ink); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 12%, var(--surface)); }
  .maps button.ghost { border-style: dashed; }
  .plano { display: inline-flex; align-items: baseline; gap: 5px; margin-left: 6px; padding-left: 8px; border-left: 3px solid var(--n); font: 600 12px var(--f-display); color: var(--ink); }
  .plano:first-child { margin-left: 0; }
  .plano small { font: 10.5px var(--f-body); color: var(--muted); }
  .empty { text-align: center; max-width: 460px; margin: 6vh auto; color: var(--muted); }
  .globe { font-size: 52px; animation: bob 3s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(-6px) rotate(-4deg); } }

  .viewport { position: relative; width: 100%; max-height: 74vh; min-height: 260px; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: #1b3550; touch-action: none; }
  .mode-mover .stage { cursor: grab; }
  .mode-mover .stage:active { cursor: grabbing; }
  .mode-marcar .stage, .mode-regua .stage { cursor: crosshair; }
  .stage { position: absolute; left: 0; top: 0; width: 100%; transform-origin: 0 0; user-select: none; }
  .stage img, .terrain { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: fill; }
  .terrain { image-rendering: auto; transition: opacity .3s; }
  .terrain.wait { opacity: .35; filter: blur(4px); }
  .detail { position: absolute; display: block; pointer-events: none; image-rendering: auto; }
  .terrain.anim { animation: reveal .9s ease-out; }
  @keyframes reveal { from { opacity: 0; filter: blur(8px) saturate(.4); transform: scale(1.03); } }
  .realm { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; image-rendering: auto; mix-blend-mode: normal; animation: reveal .6s ease-out; }
  .realms { position: absolute; right: 52px; top: 10px; display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
  .realms button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 2px 9px; font: 600 11.5px var(--f-display);
    background: #000a; color: #fff; }
  .realms i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); box-shadow: 0 0 6px var(--c); }
  .foot select { background: var(--surface); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 3px 6px; font: inherit; font-size: 12px; }
  .over { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .river { fill: none; stroke: #5f9cc6; stroke-linejoin: round; stroke-linecap: round; opacity: .95; }
  .road-under { fill: none; stroke: #f3e6c4; stroke-linejoin: round; stroke-linecap: round; opacity: .55; }
  .road { fill: none; stroke: #5b3f26; stroke-linejoin: round; stroke-linecap: round; opacity: .9; }
  .rule { stroke: #fff; stroke-width: 2; stroke-dasharray: 6 5; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 2px #000); animation: march 1s linear infinite; }
  @keyframes march { to { stroke-dashoffset: -11; } }
  .rdot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px #000a; transform: scale(calc(1 / var(--z))); }
  .rlabel { position: absolute; transform: translate(-50%, -140%) scale(calc(1 / var(--z))); background: #000b; color: #fff; font: 600 12px var(--f-mono); padding: 2px 7px; border-radius: 6px; white-space: nowrap; pointer-events: none; }

  .pin { position: absolute; display: flex; align-items: center; gap: 4px; border: 0; background: none; padding: 0; transform: translate(-11px, -50%) scale(calc(1 / var(--z)));
    transform-origin: 11px 50%; color: #fff; touch-action: none; }
  .pin .dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; line-height: 1;
    background: color-mix(in srgb, var(--c) 85%, #000); border: 2px solid #fff; box-shadow: 0 2px 6px #0008; }
  .pin .name { font: 600 12px var(--f-display); letter-spacing: .02em; text-shadow: 0 1px 2px #000, 0 0 6px #000; white-space: nowrap; }
  .pin.est { flex-direction: column; gap: 1px; transform: translate(-50%, calc(var(--s) * -0.5)) scale(calc(1 / var(--z))); transform-origin: 50% calc(var(--s) * 0.5); }
  .pin.est .icon { display: block; border-radius: 50%; transition: filter .15s; }
  .pin.est .name { font-size: 11.5px; }
  .pin.est.capital .name { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
  .pin.est:hover .icon, .pin.est.on .icon { filter: drop-shadow(0 0 5px var(--c)) drop-shadow(0 0 2px #fff); }
  .pin.regiao { transform: translate(-50%, -50%) scale(calc(1 / var(--z))); transform-origin: 50% 50%; font: italic 600 15px var(--f-display); letter-spacing: .32em;
    text-transform: uppercase; color: #fff8e6; text-shadow: 0 1px 3px #000, 0 0 10px #000a; white-space: nowrap; opacity: .9; }
  .pin.regiao.on { color: var(--ember-soft); }
  .est-sel { display: flex; align-items: center; gap: 6px; }
  .est-sel select { background: var(--surface); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 2px 6px; font: inherit; font-size: 12px; }
  .pin.ghost .dot { background: #0006; border-style: dashed; }
  .pin:hover .dot, .pin.on .dot { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 45%, transparent), 0 0 18px var(--c); }
  .pin.on .dot::after { content: ''; position: absolute; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--c); animation: ping 1.4s ease-out infinite; }
  @keyframes ping { to { transform: scale(2.4); opacity: 0; } }

  .addpop { position: absolute; display: flex; gap: 4px; transform: translate(-50%, 14px) scale(calc(1 / var(--z))); transform-origin: 50% 0; z-index: 3;
    background: var(--surface); border: 1px solid var(--ember); border-radius: 10px; padding: 5px; box-shadow: 0 10px 30px -10px #000; }
  .addpop input { width: min(170px, 50vw); background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 4px 8px; font: 13px var(--f-body); }

  .rose { position: absolute; right: 12px; bottom: 12px; width: 46px; height: 46px; opacity: .8; pointer-events: none; }
  .rose path { fill: #f3e9d2; stroke: #000a; stroke-width: .6; }
  .rose path.h { fill: #c9b88f; }
  .rose text { font: 700 6px var(--f-display); fill: #000; }
  .zoom { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .zoom button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 90%, transparent); color: var(--muted); padding: 0; font: 600 14px/1 var(--f-mono); }
  .zoom button:hover { color: var(--ember); border-color: var(--ember); }
  .hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); margin: 0; background: #000b; color: #fff; padding: 4px 12px; border-radius: 999px; font-size: 12.5px; pointer-events: none; }
  .trip { position: absolute; left: 10px; top: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; max-width: calc(100% - 70px);
    background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; font-size: 12.5px; backdrop-filter: blur(6px); }
  .trip b { font: 600 14px var(--f-mono); color: var(--ember-soft); }
  .x { border: 0; background: none; color: var(--muted); padding: 0 2px; }
  .peek { position: absolute; left: 12px; bottom: 12px; width: min(300px, calc(100% - 80px)); display: grid; gap: 4px; padding: 12px 14px;
    background: color-mix(in srgb, var(--surface) 94%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line)); border-radius: 14px; backdrop-filter: blur(6px);
    animation: up .2s ease-out; }
  @keyframes up { from { opacity: 0; transform: translateY(8px); } }
  .peek b { font: 600 16px var(--f-display); }
  .kind { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
  .sum { color: var(--muted); font-size: 12.5px; }
  .pacts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }

  .foot { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
  .foot label { display: inline-flex; align-items: center; gap: 6px; }
  .foot input { width: 80px; background: var(--surface); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 3px 7px; font: 12.5px var(--f-mono); }
  .sp { flex: 1; }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary.sm, .ghost.sm { padding: 4px 10px; font-size: 12.5px; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 6px 12px; background: var(--surface-2); color: var(--ink); }
  .ghost:hover { border-color: var(--ember); }
  .ghost.danger:hover { border-color: var(--crit); color: var(--crit); }
  @media (prefers-reduced-motion: reduce) { .globe, .rule, .pin.on .dot::after, .terrain.anim { animation: none; } }

  .layers { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
  .layers .t-select { width: auto; }
  .toggles { display: flex; flex-wrap: wrap; gap: 4px; }
  .viewport.est-pergaminho { background: #cfd0bd; --sym-fill: #f1e6c9; --sym-shade: #b49c74; --sym-snow: #fbf8ef; --sym-ink: #4a3422; --sym-trunk: #5a4029; --sym-leaf: #e8dcb8; --sym-leafsh: #b9a57c; --sym-leafink: #4a3422; }
  .viewport.est-atlas { --sym-fill: #e2dac5; --sym-shade: #9a8a70; --sym-snow: #ffffff; --sym-ink: #3d3126; --sym-trunk: #5a4029; --sym-leaf: #6f9a58; --sym-leafsh: #46703c; --sym-leafink: #2f4a26; }
  .viewport.est-relevo { --sym-fill: #d8d0bf; --sym-shade: #8a7d6a; --sym-snow: #ffffff; --sym-ink: #2f2820; --sym-trunk: #4a3424; --sym-leaf: #5f8a4c; --sym-leafsh: #3c6233; --sym-leafink: #22361c; }
  .rname { fill: #3a2717; font-family: var(--f-display); font-style: italic; font-weight: 600; letter-spacing: .18em; paint-order: stroke; stroke: #f4ead2cc; stroke-width: .35; text-transform: uppercase; }
  .est-relevo .rname, .est-atlas .rname { fill: #fff8e6; stroke: #0009; }
  .rname.k-mar, .rname.k-lago { fill: #2c4a66; stroke: #e9eef0aa; letter-spacing: .35em; }
  .est-relevo .rname.k-mar, .est-atlas .rname.k-mar { fill: #d8ecf8; stroke: #0007; }
  .rname.k-continente { letter-spacing: .5em; font-weight: 700; opacity: .75; }
  .feat { position: absolute; border: 0; background: none; padding: 0; transform: translate(-50%, -60%) scale(calc(1 / var(--z))); transform-origin: 50% 60%; z-index: 1; }
  .feat.on, .feat:hover { filter: drop-shadow(0 0 4px #ffb46a); }
  .res { position: absolute; transform: translate(-50%, -50%) scale(calc(1 / var(--z))); font-size: 12px; line-height: 1; padding: 2px 3px; border-radius: 6px;
    background: #fff8e8e6; color: #3a2717; border: 1px solid #3a271766; pointer-events: auto; cursor: help; }
  .pin.sug { opacity: .75; pointer-events: none; animation: up .3s ease-out; }
  .pin.sug .icon { outline: 2px dashed #fff8; outline-offset: 2px; border-radius: 50%; }
  .icon.fantasma { opacity: .78; }
  .probe { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 2px #000a; transform: scale(calc(1 / var(--z))); pointer-events: none; }
  .scale { position: absolute; left: 12px; top: 12px; display: grid; grid-template-columns: auto auto; gap: 2px 10px; padding: 6px 9px; border-radius: 9px;
    background: color-mix(in srgb, var(--surface) 90%, transparent); border: 1px solid var(--line); font-size: 11px; color: var(--muted); }
  .scale i { grid-column: 1 / -1; display: block; width: 160px; max-width: 40vw; height: 8px; border-radius: 4px; }
  .scale span:last-child { text-align: right; }
  .sonda .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; margin: 4px 0; }
  .sonda .facts span { display: grid; font-size: 11px; color: var(--muted); }
  .sonda .facts b { font: 600 14px var(--f-mono); color: var(--ink); }
  .peek.sonda { max-height: calc(100% - 24px); overflow: auto; }
  .ghost.on { border-color: var(--ember); color: var(--ember-soft); }
  .fisico { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px 12px; padding: 12px; font-size: 12.5px; color: var(--muted); }
  .fisico label { display: grid; gap: 4px; }
  .fisico p { grid-column: 1 / -1; margin: 0; }
  .atlas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 10px; }
  .atlas section { padding: 12px 14px; display: grid; gap: 8px; align-content: start; }
  .atlas ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 260px; overflow: auto; }
  .shares button, .feats button, .feats li { width: 100%; display: grid; grid-template-columns: 14px minmax(0, 1fr) 70px 34px; align-items: center; gap: 8px; border: 0; background: none;
    padding: 4px 4px; border-radius: 7px; color: var(--ink); font-size: 12.5px; text-align: left; }
  .feats button, .feats li { grid-template-columns: 18px minmax(0, 1fr) auto; }
  .shares button:hover, .feats button:hover, .shares button.on { background: var(--surface-2); }
  .shares i { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #0003; }
  .shares .bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .shares .bar em { display: block; height: 100%; background: var(--ember); opacity: .7; }
  .shares small, .feats small { color: var(--muted); font: 11px var(--f-mono); text-align: right; }
  .feats span:nth-child(2), .shares span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rk { text-align: center; color: var(--muted); }
  .bioma { font-size: 12.5px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 6px; }
  .bioma p { margin: 3px 0; }
  .bioma b { color: var(--ink); font-weight: 600; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
</style>
