import { seededRng, type Rng } from '../../rpg/dice';
import { hash53 } from '../../hash';
import { asList, asText, type PropValue } from '../frontmatter';
import { markovNames, NAME_STYLES, styledName } from '../gerador';
import { sameTitle } from '../markdown';
import { parseWorldDate, type Entity, type World } from '../mundo';
import { fold } from '../regras/parse';
import { ESSENCIAIS, NOMES_F, NOMES_M, SOBRENOMES, especieId, etniaDoTexto, nomeProf, nomeTraco, profDoTexto, tracoDoTexto, type Catalogo, type Especie, type Etnia } from './catalogo';
import { ajustarAparencia, alturaDe, cabeloDe, genomaAleatorio, genomaTexto, herdar, lerGenoma, olhosDe, tracosDosGenes } from './genetica';
import type { Vidas } from './motor';
import { anoDe, BIG5_NAMES, HABILIDADES, type Big5, type Habilidade, type Laco, type Pessoa, type Sexo, type Vinculo } from './tipos';

/*
 * O elenco da simulação: pessoas lidas das fichas do mundo, figurantes
 * gerados (em famílias, com vizinhos que já se conhecem) e o caminho de volta,
 * da simulação para as fichas.
 *
 * O que a ficha não diz (sexo, temperamento, genes...) é sorteado com uma
 * semente tirada do caminho da nota: a mesma ficha vira sempre a mesma pessoa.
 */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const rngDe = (chave: string): Rng => seededRng(hash53(chave) % 4294967295);
const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

function campo(e: Entity, ...keys: string[]): PropValue | undefined {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key !== undefined) return e.props[key];
  }
  return undefined;
}
const texto = (e: Entity, ...keys: string[]) => asText(campo(e, ...keys)).trim();

/** Alvo de uma ligação da ficha (caminho), por nome do campo. */
function alvos(e: Entity, re: RegExp): string[] {
  return e.relations.filter((r) => r.to && re.test(r.label.trim())).map((r) => r.to!);
}

function sexoDe(v: string): Sexo | null {
  const k = fold(v);
  if (/^(f|fem|feminino|mulher|femea|menina)/.test(k)) return 'f';
  if (/^(m|masc|masculino|homem|macho|menino)/.test(k)) return 'm';
  return null;
}

function orientacaoDe(v: string, rng: Rng): Pessoa['orientacao'] {
  const k = fold(v);
  if (/hetero/.test(k)) return 'hetero';
  if (/homo|gay|lesb/.test(k)) return 'homo';
  if (/^bi|pan/.test(k)) return 'bi';
  if (/assex|ace/.test(k)) return 'ace';
  const r = rng();
  return r < 0.86 ? 'hetero' : r < 0.95 ? 'bi' : r < 0.99 ? 'homo' : 'ace';
}

/** "abertura 62 · conscienciosidade 40 · ..." */
export function big5Texto(b: Big5): string {
  return BIG5_NAMES.map((n, i) => `${n} ${Math.round(b[i]!)}`).join(' · ');
}
export function habTexto(h: Record<Habilidade, number>): string {
  return HABILIDADES.map((x) => `${x.nome} ${Math.round(h[x.id] * 10) / 10}`.replace('.', ',')).join(' · ');
}

function lerNumeros(texto: string, nomes: readonly string[]): Array<number | null> {
  const s = fold(texto);
  return nomes.map((n) => {
    const m = new RegExp(`${fold(n)}\\s*:?\\s*(\\d+(?:[.,]\\d+)?)`).exec(s);
    return m ? Number(m[1]!.replace(',', '.')) : null;
  });
}

function tracosConsistentes(cat: Catalogo, ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const t = cat.tracos.get(id);
    if (out.includes(id) || (t?.oposto && out.includes(t.oposto))) continue;
    out.push(id);
  }
  return out;
}

function big5DeTracos(cat: Catalogo, tracos: string[], rng: Rng): Big5 {
  const b = [0, 0, 0, 0, 0].map(() => 35 + rng() * 30) as Big5;
  for (const id of tracos) {
    const d = cat.tracos.get(id)?.big5;
    if (d) for (let i = 0; i < 5; i++) b[i] = clamp(b[i]! + d[i]!, 0, 100);
  }
  return b;
}

function personalidadeAleatoria(cat: Catalogo, rng: Rng, n: number): string[] {
  const pool = [...cat.tracos.values()].filter((t) => t.cat === 'personalidade' && !t.regra?.emerge && !t.nasce && !t.filtro).map((t) => t.id);
  const ids: string[] = [];
  for (let i = 0; i < n * 3 && ids.length < n; i++) ids.push(pick(rng, pool));
  return tracosConsistentes(cat, ids).slice(0, n);
}

// ------------------------------------------------------------------ nomes

export interface Nomeador {
  /** "iberico", "mundo" (aprende com os nomes do mundo) ou um estilo do gerador (elfico, nordico...) */
  estilo: string;
  /** nomes que já existem (para o estilo "mundo") */
  amostras: string[];
}

const femininizar = (n: string) => (/[aeiouyã]$/i.test(n) ? n.replace(/o$/i, 'a') : `${n}a`);

export function nomeProprio(rng: Rng, sexo: Sexo, nom: Nomeador): string {
  if (nom.estilo === 'mundo') {
    const l = markovNames(nom.amostras, 1, rng);
    if (l.length) return sexo === 'f' && rng() < 0.5 ? femininizar(l[0]!) : l[0]!;
  }
  const st = NAME_STYLES.find((x) => x.id === nom.estilo);
  if (st) {
    const n = styledName(st, rng);
    return sexo === 'f' && rng() < 0.6 ? femininizar(n) : n;
  }
  return pick(rng, sexo === 'f' ? NOMES_F : NOMES_M);
}

/** Nome de um bebê: às vezes o de um avô ou do pai/mãe (vira "II" se ainda vive alguém com ele). */
export function nomeDeBebe(s: Vidas, sexo: Sexo, mae: Pessoa, pai: Pessoa | null): string {
  const primeiro = (p: Pessoa | null | undefined) => (p ? (p.casa && p.nome.endsWith(` ${p.casa}`) ? p.nome.slice(0, -p.casa.length - 1) : p.nome.split(' ')[0]!).replace(/\s+[IVX]+$/, '') : null);
  const casa = (pai?.casa ?? mae.casa) || null;
  const familia = [mae, pai, ...[...mae.pais, ...(pai?.pais ?? [])].map((x) => (x ? s.pessoa(x) : undefined))].filter((x): x is Pessoa => !!x && x.sexo === sexo);
  let nome: string | null = null;
  if (familia.length && s.chance(0.25)) nome = primeiro(s.pick(familia));
  if (!nome) {
    const amostras = s.todas().filter((x) => x.sexo === sexo).map((x) => primeiro(x)!).filter(Boolean);
    const iber = amostras.filter((x) => (sexo === 'f' ? NOMES_F : NOMES_M).includes(x)).length >= amostras.length / 2;
    nome = nomeProprio(s.r, sexo, { estilo: iber || amostras.length < 6 ? 'iberico' : 'mundo', amostras });
  }
  return casa ? `${nome} ${casa}` : nome;
}

// ------------------------------------------------------------------ da ficha para a pessoa

export interface OpcoesElenco {
  /** mês inicial */
  inicio: number;
  /** lugar padrão de quem não diz onde mora */
  lugar: string;
}

/** Uma ficha de personagem vira pessoa da simulação (ou null, se morreu antes ou nasce depois do começo). */
export function pessoaDaFicha(e: Entity, w: World, cat: Catalogo, op: OpcoesElenco): Pessoa | null {
  const rng = rngDe(e.path);
  const ano = anoDe(op.inicio);
  const nascTxt = texto(e, 'nascimento', 'nascido em', 'nasceu');
  const nascAno = nascTxt ? parseWorldDate(nascTxt) : null;
  const idadeTxt = Number(texto(e, 'idade').replace(',', '.'));
  const morteTxt = texto(e, 'morte', 'falecimento', 'morreu');
  const morteAno = morteTxt ? parseWorldDate(morteTxt) : null;
  const status = fold(texto(e, 'status'));
  if (/morto|morta|falecid/.test(status) && (morteAno === null || morteAno <= ano)) return null;
  if (morteAno !== null && morteAno <= ano) return null;
  if (nascAno !== null && nascAno > ano + 0.99) return null;
  const nasc = nascAno !== null
    ? Math.floor(nascAno) * 12 + Math.round((nascAno - Math.floor(nascAno)) * 12)
    : Number.isFinite(idadeTxt) && idadeTxt > 0 ? op.inicio - Math.round(idadeTxt * 12) - Math.floor(rng() * 12) : op.inicio - (20 + Math.floor(rng() * 25)) * 12 - Math.floor(rng() * 12);

  const sexoTxt = texto(e, 'sexo', 'gênero', 'genero');
  const sexo = sexoDe(sexoTxt) ?? (rng() < 0.5 ? 'f' : 'm');
  const genero = /n[aã]o.?bin|neutr|enby/i.test(sexoTxt) ? 'n' : sexo;

  // espécie e expectativa de vida
  // um [[link]] para a ficha da espécie, ou só o nome ("espécie: Elfo", declarada nas regras)
  const esp = alvos(e, /^(espécie|especie|raça|raca)$/i)[0] ?? (texto(e, 'espécie', 'especie', 'raça', 'raca').replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim() || null);
  const espEnt = esp ? w.entities.find((x) => x.path === esp) : undefined;
  const vida = Number((espEnt ? texto(espEnt, 'expectativa de vida', 'longevidade', 'vida') : '').replace(/[^\d.]/g, '')) || 70;

  // traços: campos de traços, virtude e defeito
  const brutos = ['traços', 'tracos', 'traço', 'personalidade', 'virtude', 'virtudes', 'defeito', 'defeitos', 'temperamento']
    .flatMap((k) => asList(campo(e, k)).flatMap((x) => x.split(/[,;·]/)));
  const tracos = tracosConsistentes(cat, brutos.map((x) => tracoDoTexto(cat, x)).filter((x): x is string => !!x));
  const genomaTxt = texto(e, 'genoma', 'genes');
  let genes = genomaTxt ? lerGenoma(genomaTxt, genomaAleatorio(rng)) : genomaAleatorio(rng);
  genes = ajustarAparencia(genes, texto(e, 'olhos'), texto(e, 'cabelo', 'cabelos'), rng);
  for (const t of tracosDosGenes(genes)) if (!tracos.includes(t)) tracos.push(t);
  if (tracos.filter((x) => cat.tracos.get(x)?.cat === 'personalidade').length < 2 && anoDe(op.inicio) - anoDe(nasc) >= 16) {
    for (const t of personalidadeAleatoria(cat, rng, 3)) if (!tracos.includes(t) && !tracos.includes(cat.tracos.get(t)?.oposto ?? '')) tracos.push(t);
  }
  const persTxt = texto(e, 'personalidade');
  const b5 = big5DeTracos(cat, tracos, rng);
  if (persTxt) lerNumeros(persTxt, BIG5_NAMES).forEach((n, i) => { if (n !== null) b5[i] = clamp(n, 0, 100); });

  const gostos = ['gostos', 'gosta de', 'hobbies', 'interesses', 'paixões'].flatMap((k) => asList(campo(e, k)).flatMap((x) => x.split(/[,;·]/))).map((x) => x.trim().toLowerCase()).filter(Boolean);
  while (gostos.length < 2) {
    const g = pick(rng, cat.gostos);
    if (!gostos.includes(g)) gostos.push(g);
  }
  const profTxt = texto(e, 'profissão', 'profissao', 'ocupação', 'ocupacao', 'ofício', 'oficio', 'trabalho');
  const prof = profTxt ? profDoTexto(cat, profTxt) ?? profTxt : null;

  const hab = { combate: rng() * 5, labia: rng() * 5, intriga: rng() * 5, oficio: rng() * 5, saber: rng() * 5 } as Record<Habilidade, number>;
  const pr = prof ? cat.profs.get(prof) : undefined;
  if (pr && pr.hab in hab) hab[pr.hab as Habilidade] += 6 + rng() * 5;
  const habTxt = texto(e, 'habilidades');
  if (habTxt) lerNumeros(habTxt, HABILIDADES.map((h) => h.nome)).forEach((n, i) => { if (n !== null) hab[HABILIDADES[i]!.id] = clamp(n, 0, 20); });
  // números de jogo (5e) dão uma pista: for → combate, int → saber, car → lábia
  const n5 = (k: string) => Number(texto(e, k));
  if (!habTxt && n5('for') > 0) hab.combate = clamp((n5('for') - 8) * 1.2 + hab.combate / 2, 0, 20);
  if (!habTxt && n5('int') > 0) hab.saber = clamp((n5('int') - 8) * 1.2 + hab.saber / 2, 0, 20);
  if (!habTxt && n5('car') > 0) hab.labia = clamp((n5('car') - 8) * 1.2 + hab.labia / 2, 0, 20);

  const local = alvos(e, /^(local|mora em|residência|residencia|cidade|lar|onde mora|vive em|casa|origem)$/i).find((x) => w.entities.find((y) => y.path === x)?.type === 'lugar')
    ?? (texto(e, 'mora em', 'residência', 'cidade', 'local') || op.lugar);
  const dinheiroTxt = Number(texto(e, 'dinheiro', 'ouro', 'moedas').replace(',', '.'));
  // povo e lealdade: um [[link]] para a ficha (cultura, facção) ou só o nome
  const etniaTxt = alvos(e, /^(etnia|povo|cultura|origem étnica|raça cultural)$/i).find((x) => ['cultura', 'etnia', 'povo'].includes(w.entities.find((y) => y.path === x)?.type ?? ''))
    ?? texto(e, 'etnia', 'povo', 'cultura');
  const etnia = etniaTxt ? etniaDoTexto(cat, etniaTxt) ?? fold(etniaTxt.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.split('/').pop()!.replace(/\.md$/i, '')).trim() : null;
  const faccao = alvos(e, /^(afiliação|afiliacao|facção|faccao|ordem|membro de|lealdade|reino|casa real)$/i).find((x) => w.entities.find((y) => y.path === x)?.type === 'faccao')
    ?? (texto(e, 'facção', 'faccao', 'lealdade', 'reino') || undefined);
  const casaTxt = texto(e, 'casa', 'sobrenome', 'família', 'familia', 'dinastia').replace(/^\[\[|\]\]$/g, '');

  return {
    id: e.path, nome: e.name, nota: e.path, sexo, genero, orientacao: orientacaoDe(texto(e, 'orientação', 'orientacao', 'sexualidade'), rng),
    nasc, morte: null, causa: null, destino: morteAno !== null ? Math.floor(morteAno) * 12 + 6 : null,
    local, viagem: null, especie: esp, vida, casa: casaTxt || null, pais: [alvos(e, /^(mãe|mae)$/i)[0] ?? null, alvos(e, /^(pai)$/i)[0] ?? null], paiOficial: null,
    conjuge: alvos(e, /^(cônjuge|conjuge|esposa|esposo|marido|mulher|consorte)$/i)[0] ?? null,
    prof, genes, big5: b5, tracos, gostos: [...new Set(gostos)].slice(0, 6), hab, saude: Number(texto(e, 'saúde', 'saude')) || 75 + rng() * 25,
    humor: rng() * 30, estresse: 10 + rng() * 25, dinheiro: Number.isFinite(dinheiroTxt) && dinheiroTxt > 0 ? dinheiroTxt : (pr?.renda ?? 3) * (3 + rng() * 8),
    gravidez: null, resguardo: 0, meta: null, xp: anoDe(op.inicio) - anoDe(nasc) >= 16 ? { adulto: 1 } : {}, conduzido: false, protegido: false, estados: {}, campos: {},
    ...(etnia ? { etnia } : {}), ...(faccao ? { faccao } : {}),
  };
}

/** Laços que as fichas já dizem (amigos, inimigos, amantes, namoro...). */
export function lacosDasFichas(es: Entity[], ids: Set<string>): Laco[] {
  const out: Laco[] = [];
  const tipos: Array<[RegExp, Vinculo, Partial<Laco>]> = [
    [/^(amigos?|amigas?|aliados?|aliadas?)$/i, 'amigos', { afeto: 45, intimidade: 50, confianca: 25 }],
    [/^(inimigos?|inimigas?|nêmesis|nemesis)$/i, 'inimigos', { afeto: -70, confianca: -40 }],
    [/^(rivais|rival)$/i, 'rivais', { afeto: -35 }],
    [/^(amantes?|caso)$/i, 'amantes', { afeto: 35, atracao: 35, intimidade: 50 }],
    [/^(namorad[oa]|par|namorados?)$/i, 'namoro', { afeto: 40, atracao: 25, intimidade: 45 }],
    [/^(noiv[oa])$/i, 'noivado', { afeto: 45, atracao: 25, intimidade: 50 }],
  ];
  const conjuge = /^(cônjuge|conjuge|esposa|esposo|marido|mulher|consorte)$/i;
  for (const e of es) {
    for (const r of e.relations) {
      if (!r.to || !ids.has(r.to) || r.to === e.path) continue;
      if (conjuge.test(r.label.trim())) {
        // casados nas fichas começam com alguma história juntos
        out.push({ a: e.path, b: r.to, afeto: 30, intimidade: 55, confianca: 20 }, { a: r.to, b: e.path, afeto: 30, intimidade: 55, confianca: 20 });
        continue;
      }
      const t = tipos.find(([re]) => re.test(r.label.trim()));
      if (t) out.push({ a: e.path, b: r.to, v: t[1], ...t[2] });
    }
  }
  return out;
}

// ------------------------------------------------------------------ figurantes

export interface OpcoesGerar {
  id: string;
  inicio: number;
  lugar: string;
  nomes: Nomeador;
  sexo?: Sexo;
  /** anos */
  idade?: number;
  casa?: string | null;
  especie?: string | null;
  vida?: number;
  /** usados: para não repetir nome */
  usados?: Set<string>;
}

export function gerarPessoa(rng: Rng, cat: Catalogo, op: OpcoesGerar, genes = genomaAleatorio(rng), pais: [Pessoa | null, Pessoa | null] = [null, null]): Pessoa {
  const sexo = op.sexo ?? (rng() < 0.5 ? 'f' : 'm');
  const idade = op.idade ?? Math.floor(18 + Math.pow(rng(), 1.3) * 42);
  const casa = op.casa === undefined ? pick(rng, SOBRENOMES) : op.casa;
  let nome = '';
  for (let i = 0; i < 20; i++) {
    nome = `${nomeProprio(rng, sexo, op.nomes)}${casa ? ` ${casa}` : ''}`;
    if (!op.usados?.has(fold(nome))) break;
  }
  op.usados?.add(fold(nome));
  const adulto = idade >= 16;
  let tracos = tracosDosGenes(genes);
  for (const p of pais) for (const t of p?.tracos ?? []) if (cat.tracos.get(t)?.herda && rng() < cat.tracos.get(t)!.herda!) tracos.push(t);
  tracos = tracosConsistentes(cat, [...tracos, ...(adulto ? personalidadeAleatoria(cat, rng, 2 + Math.floor(rng() * 3)) : [])]);
  if (adulto && idade > 35 && rng() < 0.12) tracos.push(pick(rng, ['veterano', 'cicatriz', 'amargurado', 'sabio'].filter((x) => x !== 'sabio' || idade > 55)));
  const b5 = big5DeTracos(cat, tracos, rng);
  if (pais[0] || pais[1]) {
    for (let i = 0; i < 5; i++) {
      const pm = ((pais[0]?.big5[i] ?? 50) + (pais[1]?.big5[i] ?? 50)) / 2;
      b5[i] = clamp(b5[i]! * 0.6 + pm * 0.4, 0, 100);
    }
  }
  const gostos: string[] = [];
  const ng = idade < 6 ? 0 : 2 + Math.floor(rng() * 3);
  while (gostos.length < ng) {
    const g = pick(rng, cat.gostos);
    if (!gostos.includes(g)) gostos.push(g);
  }
  const anos = Math.min(idade, 40);
  const hab = Object.fromEntries(HABILIDADES.map((h) => [h.id, clamp(rng() * (2 + anos / 6), 0, 20)])) as Record<Habilidade, number>;
  return {
    id: op.id, nome, nota: null, sexo, genero: sexo, orientacao: orientacaoDe('', rng), nasc: op.inicio - idade * 12 - Math.floor(rng() * 12), morte: null, causa: null, destino: null,
    local: op.lugar, viagem: null, especie: op.especie ?? null, vida: op.vida ?? 70, casa, pais: [pais[0]?.id ?? null, pais[1]?.id ?? null], paiOficial: null, conjuge: null,
    prof: null, genes, big5: b5, tracos, gostos, hab, saude: clamp(100 - Math.max(0, idade - 40) * 0.8 - rng() * 15, 30, 100),
    humor: rng() * 30, estresse: 5 + rng() * 30, dinheiro: 0, gravidez: null, resguardo: 0, meta: null, xp: adulto ? { adulto: 1 } : {},
    conduzido: false, protegido: false, estados: {}, campos: {},
  };
}

function escolherProf(rng: Rng, cat: Catalogo, p: Pessoa, faltam: string[]): string | null {
  const ess = faltam.filter((id) => cat.profs.has(id));
  if (ess.length && rng() < 0.75) {
    const melhor = ess.map((id) => ({ id, w: (cat.profs.get(id)!.apto?.(p) ?? 1) + rng() })).sort((a, b) => b.w - a.w)[0]!;
    return melhor.id;
  }
  const opcoes = [...cat.profs.values()].filter((x) => !x.heranca).map((x) => ({ id: x.id, w: Math.max(0, x.apto?.(p) ?? 1) }));
  let r = rng() * opcoes.reduce((s, o) => s + o.w, 0);
  for (const o of opcoes) if ((r -= o.w) <= 0) return o.id;
  return 'camponês';
}

export interface OpcoesPovoar {
  quantos: number;
  inicio: number;
  lugar: string;
  semente: number;
  nomes: Nomeador;
  /** quem já está no elenco (as fichas): os figurantes passam a conhecê-los */
  existentes: Pessoa[];
  /** primeiro id livre (x1, x2...) */
  primeiro?: number;
}

/**
 * Gera uma vila: casais (com filhos), viúvos com crianças e solteiros, com as
 * profissões que uma vila precisa e vizinhos que já se conhecem (alguns
 * amigos, alguns rivais, uma paixão aqui e ali).
 */
export function povoar(cat: Catalogo, op: OpcoesPovoar): { pessoas: Pessoa[]; lacos: Laco[] } {
  const rng = seededRng((op.semente * 7919 + 17) >>> 0 || 1);
  const pessoas: Pessoa[] = [];
  const lacos: Laco[] = [];
  let n = op.primeiro ?? 1;
  const usados = new Set([...op.existentes.map((p) => fold(p.nome))]);
  const ger = (o: Partial<OpcoesGerar>, genes?: ReturnType<typeof genomaAleatorio>, pais?: [Pessoa | null, Pessoa | null]) =>
    gerarPessoa(rng, cat, { id: `x${n++}`, inicio: op.inicio, lugar: op.lugar, nomes: op.nomes, usados, ...o }, genes, pais);
  const temProf = new Set(op.existentes.filter((p) => p.local === op.lugar).map((p) => p.prof));
  const faltam = () => ESSENCIAIS.filter((x) => !temProf.has(x) && !pessoas.some((p) => p.prof === x));
  const darProf = (p: Pessoa) => {
    if (anoDe(op.inicio) - anoDe(p.nasc) < 16) return;
    p.prof = escolherProf(rng, cat, p, faltam());
    const pr = p.prof ? cat.profs.get(p.prof) : undefined;
    if (pr && pr.hab in p.hab) p.hab[pr.hab as Habilidade] = clamp(p.hab[pr.hab as Habilidade] + 5 + rng() * 6, 0, 20);
    p.dinheiro = Math.round((pr?.renda ?? 3) * (3 + rng() * 10));
  };

  while (pessoas.length < op.quantos) {
    const resta = op.quantos - pessoas.length;
    const r = rng();
    if (r < 0.38 && resta >= 2) {
      // casal (às vezes do mesmo sexo)
      const mesmo = rng() < 0.06;
      const casa = pick(rng, SOBRENOMES);
      const idadeA = 20 + Math.floor(rng() * 30);
      const a = ger({ sexo: 'f', idade: idadeA, casa: mesmo ? pick(rng, SOBRENOMES) : casa });
      const b = ger({ sexo: mesmo ? 'f' : 'm', idade: clamp(idadeA + Math.floor(rng() * 9) - 3, 18, 80), casa });
      a.orientacao = mesmo ? 'homo' : rng() < 0.92 ? 'hetero' : 'bi';
      b.orientacao = mesmo ? 'homo' : rng() < 0.92 ? 'hetero' : 'bi';
      a.conjuge = b.id;
      b.conjuge = a.id;
      darProf(a);
      darProf(b);
      pessoas.push(a, b);
      lacos.push({ a: a.id, b: b.id, afeto: 15 + rng() * 45, intimidade: 60, atracao: rng() * 20 - 5 }, { a: b.id, b: a.id, afeto: 15 + rng() * 45, intimidade: 60, atracao: rng() * 20 - 5 });
      if (!mesmo) {
        const filhos = Math.min(resta - 2, Math.floor(rng() * 4));
        const maxIdade = Math.min(idadeA, b.nasc ? anoDe(op.inicio) - anoDe(b.nasc) : idadeA) - 17;
        for (let i = 0; i < filhos && maxIdade > 0; i++) {
          const g = herdar(a.genes, b.genes, rng);
          const f = ger({ idade: Math.floor(rng() * maxIdade), casa }, g, [a, b]);
          darProf(f);
          pessoas.push(f);
        }
      }
    } else if (r < 0.5 && resta >= 2) {
      // viúvo(a) com filho(s)
      const p = ger({ idade: 28 + Math.floor(rng() * 25) });
      darProf(p);
      pessoas.push(p);
      p.estados['enlutado'] = op.inicio + Math.floor(rng() * 12);
      const filhos = Math.min(resta - 1, 1 + Math.floor(rng() * 2));
      for (let i = 0; i < filhos; i++) {
        const g = herdar(p.genes, genomaAleatorio(rng), rng);
        const f = ger({ idade: Math.floor(rng() * Math.max(1, anoDe(op.inicio) - anoDe(p.nasc) - 17)), casa: p.casa }, g, p.sexo === 'f' ? [p, null] : [null, p]);
        darProf(f);
        pessoas.push(f);
      }
    } else {
      const p = ger({});
      darProf(p);
      pessoas.push(p);
    }
  }
  pessoas.splice(op.quantos);
  const ids = new Set(pessoas.map((p) => p.id));
  for (const p of pessoas) {
    if (p.conjuge && !ids.has(p.conjuge)) p.conjuge = null;
    p.pais = p.pais.map((x) => (x && ids.has(x) ? x : null)) as [string | null, string | null];
  }
  distribuirEspecies(cat, pessoas, op);
  distribuirEtnias(cat, pessoas, op);

  // vizinhança: todo mundo conhece alguém (as relações entre as suas fichas ficam como você escreveu)
  const todos = [...op.existentes.filter((p) => p.local === op.lugar || !p.local), ...pessoas];
  const suas = new Set(op.existentes.map((p) => p.id));
  const feitos = new Set<string>();
  const fera = (p: Pessoa) => !!(p.especie && cat.especies.get(especieId(p.especie))?.criatura);
  for (const p of pessoas.length ? todos : []) {
    if (fera(p)) continue;
    const k = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const o = pick(rng, todos);
      const par = p.id < o.id ? `${p.id}|${o.id}` : `${o.id}|${p.id}`;
      if (o.id === p.id || fera(o) || feitos.has(par) || (suas.has(p.id) && suas.has(o.id)) || o.conjuge === p.id || o.pais.includes(p.id) || p.pais.includes(o.id)) continue;
      feitos.add(par);
      const r = rng();
      if (r < 0.15) {
        lacos.push({ a: p.id, b: o.id, v: 'amigos', afeto: 45 + rng() * 20, intimidade: 50, confianca: 20 }, { a: o.id, b: p.id, afeto: 45 + rng() * 20, intimidade: 50, confianca: 20 });
      } else if (r < 0.25) {
        lacos.push({ a: p.id, b: o.id, v: 'rivais', afeto: -40 - rng() * 20, intimidade: 25 }, { a: o.id, b: p.id, afeto: -40 - rng() * 20, intimidade: 25 });
      } else if (r < 0.35) {
        lacos.push({ a: p.id, b: o.id, afeto: 10 + rng() * 15, intimidade: 25, atracao: 25 + rng() * 20 });
      } else {
        lacos.push({ a: p.id, b: o.id, afeto: rng() * 40 - 12, intimidade: 10 + rng() * 30 }, { a: o.id, b: p.id, afeto: rng() * 40 - 12, intimidade: 10 + rng() * 30 });
      }
    }
  }
  return { pessoas, lacos };
}

const APELIDOS = ['Cinzento', 'Velho', 'Manco', 'Negro', 'Branco', 'Pardo', 'Ruivo', 'Silencioso', 'Faminto', 'Grande', 'Caolho', 'Malhado'];

/**
 * Espécies com `frequência` entram nos figurantes: cada família (casal, filhos)
 * sorteia uma espécie junta, e as idades passam para a escala dela (um elfo
 * "de 30" na escala humana tem uns 300). Criaturas entram soltas, sem
 * profissão nem família. Sorte própria: sem espécies, nada muda.
 */
function distribuirEspecies(cat: Catalogo, pessoas: Pessoa[], op: OpcoesPovoar): void {
  const gente = [...cat.especies.values()].filter((e) => e.frequencia > 0 && !e.criatura);
  const feras = [...cat.especies.values()].filter((e) => e.frequencia > 0 && e.criatura);
  if (!gente.length && !feras.length) return;
  const rs = seededRng((op.semente * 104729 + 3) >>> 0 || 1);
  // famílias: casamento e filiação ligam as pessoas
  const raiz = new Map<string, string>(pessoas.map((p) => [p.id, p.id]));
  const achar = (x: string): string => {
    let r = x;
    while (raiz.get(r) !== r) r = raiz.get(r)!;
    raiz.set(x, r);
    return r;
  };
  const unir = (a: string | null, b: string) => {
    if (a && raiz.has(a)) raiz.set(achar(a), achar(b));
  };
  for (const p of pessoas) {
    unir(p.conjuge, p.id);
    for (const x of p.pais) unir(x, p.id);
  }
  const grupos = new Map<string, Pessoa[]>();
  for (const p of pessoas) grupos.set(achar(p.id), [...(grupos.get(achar(p.id)) ?? []), p]);
  const sortear = (l: Especie[], r: number) => {
    for (const e of l) if ((r -= e.frequencia) < 0) return e;
    return null;
  };
  for (const g of grupos.values()) {
    // quem vive sozinho pode ser uma criatura; o resto (ou ninguém) sorteia entre as espécies de gente
    const e = (g.length === 1 ? sortear(feras, rs()) : null) ?? sortear(gente, rs());
    if (!e) continue;
    for (const p of g) {
      p.especie = e.nome;
      p.vida = e.vida ?? p.vida;
      // idade: da escala humana para a da espécie
      const bio = (op.inicio - p.nasc) / 12;
      const V = Math.max(e.maioridade ? e.maioridade + 1 : 20, e.vida ?? 70);
      const M = e.maioridade;
      const real = M ? (bio < 18 ? (bio * M) / 18 : M + ((bio - 18) * (V - M)) / 52) : (bio * V) / 70;
      p.nasc = op.inicio - Math.round(real * 12);
      if (e.criatura) {
        p.prof = null;
        p.casa = null;
        p.dinheiro = 0;
        p.nome = `${e.nome} ${APELIDOS[Math.floor(rs() * APELIDOS.length)]}`;
        p.gostos = [];
      }
    }
  }
}

/**
 * Povos com `frequência` entram nos figurantes: cada família sorteia um povo
 * (da espécie dela), com a aparência, os nomes, os sobrenomes, os traços e
 * os gostos daquele povo. Sorte própria: sem povos, nada muda.
 */
function distribuirEtnias(cat: Catalogo, pessoas: Pessoa[], op: OpcoesPovoar): void {
  const povos = [...cat.etnias.values()].filter((e) => e.frequencia > 0);
  if (!povos.length) return;
  const rs = seededRng((op.semente * 15485863 + 11) >>> 0 || 1);
  const raiz = new Map<string, string>(pessoas.map((p) => [p.id, p.id]));
  const achar = (x: string): string => {
    let r = x;
    while (raiz.get(r) !== r) r = raiz.get(r)!;
    raiz.set(x, r);
    return r;
  };
  for (const p of pessoas) for (const x of [p.conjuge, ...p.pais]) if (x && raiz.has(x)) raiz.set(achar(x), achar(p.id));
  const grupos = new Map<string, Pessoa[]>();
  for (const p of pessoas) grupos.set(achar(p.id), [...(grupos.get(achar(p.id)) ?? []), p]);
  const fera = (p: Pessoa) => !!(p.especie && cat.especies.get(especieId(p.especie))?.criatura);
  const corOlhos: Record<string, string> = { azul: 'A', azuis: 'A', verde: 'V', verdes: 'V', castanho: 'C', castanhos: 'C', escuro: 'C', negro: 'C' };
  const corCabelo: Record<string, string> = { loiro: 'L', loira: 'L', ruivo: 'R', ruiva: 'R', escuro: 'E', castanho: 'E', negro: 'E', preto: 'E' };
  const sortear = (e: Etnia, mapa: Record<string, string>, tabela: Record<string, number>): string | null => {
    let r = rs();
    for (const [cor, c] of Object.entries(tabela)) if ((r -= c) < 0) return mapa[cor] ?? null;
    return null;
  };
  for (const g of grupos.values()) {
    const esp = especieId(g[0]!.especie) || 'humano';
    if (fera(g[0]!)) continue;
    const cabe = povos.filter((e) => !e.especie || e.especie === esp);
    const total = cabe.reduce((s, e) => s + e.frequencia, 0);
    if (!total) continue;
    let r = rs() * Math.max(1, total);
    const e = cabe.find((x) => (r -= x.frequencia) < 0);
    if (!e) continue;
    const sobrenome = e.sobrenomes.length ? e.sobrenomes[Math.floor(rs() * e.sobrenomes.length)]! : null;
    for (const p of g) {
      p.etnia = e.id;
      // aparência do povo: um alelo puxado para a cor mais comum
      const o = sortear(e, corOlhos, e.olhos);
      if (o) p.genes.olhos = [o, rs() < 0.6 ? o : p.genes.olhos[1]];
      const c = sortear(e, corCabelo, e.cabelo);
      if (c) p.genes.cabelo = [c, rs() < 0.6 ? c : p.genes.cabelo[1]];
      // nomes e sobrenome do povo
      const pool = p.sexo === 'f' ? e.nomesF : e.nomesM;
      if (pool.length || sobrenome) {
        const primeiro = pool.length ? pool[Math.floor(rs() * pool.length)]! : p.nome.split(' ')[0]!;
        const casa = sobrenome ?? p.casa;
        p.nome = `${primeiro}${casa ? ` ${casa}` : ''}`;
        p.casa = casa;
      }
      for (const t of e.gostos) if (!p.gostos.includes(t) && rs() < 0.4) p.gostos.push(t);
    }
  }
  // nomes repetidos ganham um número romano no motor; aqui só evitamos o óbvio
  const vistos = new Map<string, number>();
  for (const p of pessoas) {
    const k = fold(p.nome);
    const n = vistos.get(k) ?? 0;
    vistos.set(k, n + 1);
    if (n) p.nome = `${p.nome} ${['II', 'III', 'IV', 'V', 'VI'][n - 1] ?? n + 1}`;
  }
}

// ------------------------------------------------------------------ da simulação para as fichas

export interface FichaDaVida {
  id: string;
  nome: string;
  /** ficha que já existe (ou null: criar) */
  path: string | null;
  props: Record<string, PropValue | null>;
  /** linhas para a seção "## Registro" */
  registro: string[];
}

/** O que gravar em cada ficha: estado de agora, família, laços, genes e a vida contada. */
export function fichasDaSimulacao(s: Vidas, opts: { so?: Set<string> } = {}): FichaDaVida[] {
  const out: FichaDaVida[] = [];
  const link = (id: string | null | undefined) => {
    const p = id ? s.pessoa(id) : undefined;
    return p ? `[[${p.nome}]]` : null;
  };
  const links = (ps: Pessoa[]) => ps.map((p) => `[[${p.nome}]]`);
  const lugar = (k: string) => (s.world.entities.some((e) => e.path === k) ? `[[${s.lugarNome(k)}]]` : s.lugarNome(k));
  for (const p of s.todas()) {
    if (opts.so && !opts.so.has(p.id)) continue;
    const ap = s.aparencia(p);
    const morta = p.morte !== null;
    const paiOf = p.paiOficial ?? p.pais[1];
    const props: Record<string, PropValue | null> = {
      ...(p.nota ? {} : { tipo: 'personagem', mundo: s.world.name }),
      sexo: p.sexo === 'f' ? 'feminino' : 'masculino',
      nascimento: String(anoDe(p.nasc)),
      morte: morta ? String(anoDe(p.morte!)) : null,
      status: morta ? s.g(p, 'morto', 'morta') : s.g(p, 'vivo', 'viva'),
      'causa da morte': morta ? p.causa : null,
      local: lugar(p.local),
      'profissão': p.prof ? nomeProf(s.cat, p.prof, p.genero) : null,
      'traços': p.tracos.map((t) => nomeTraco(s.cat, t, p.genero)),
      gostos: p.gostos,
      casa: p.casa,
      etnia: s.etniaNome(p),
      'facção': s.guerras.faccaoDe(p) ? `[[${s.guerras.faccaoDe(p)!.nome}]]` : null,
      'orientação': { hetero: 'hétero', homo: 'homo', bi: 'bi', ace: 'assexual' }[p.orientacao],
      'mãe': link(p.pais[0]),
      pai: link(paiOf),
      'pai biológico': p.paiOficial && p.pais[1] ? link(p.pais[1]) : null,
      'cônjuge': morta ? null : link(p.conjuge),
      filhos: links(s.filhosOficiais(p.id)).length ? links(s.filhosOficiais(p.id)) : null,
      amigos: s.comVinculo(p.id, 'amigos').length ? links(s.comVinculo(p.id, 'amigos')) : null,
      rivais: s.comVinculo(p.id, 'rivais').length ? links(s.comVinculo(p.id, 'rivais')) : null,
      inimigos: s.comVinculo(p.id, 'inimigos').length ? links(s.comVinculo(p.id, 'inimigos')) : null,
      amantes: s.amantes(p).length ? links(s.amantes(p)) : null,
      olhos: olhosDe(p.genes),
      cabelo: cabeloDe(p.genes),
      altura: `${alturaDe(p.genes, p.sexo)} cm`,
      personalidade: big5Texto(p.big5),
      habilidades: habTexto(p.hab),
      genoma: genomaTexto(p.genes),
      dinheiro: String(Math.round(p.dinheiro)),
    };
    for (const k of Object.keys(props)) if (props[k] === null && !p.nota) delete props[k];
    const registro = s.eventos.filter((e) => e.quem.includes(p.id) && e.peso >= 2).map((e) => `${s.data(e.t)}: ${e.texto}`);
    out.push({ id: p.id, nome: p.nome, path: p.nota, props, registro });
  }
  return out;
}

