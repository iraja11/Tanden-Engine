import { asList, asText, bodyOf } from './frontmatter';
import { getSection, sameTitle } from './markdown';
import { parseWorldDate, worldYear, type Entity, type World } from './mundo';

/*
 * Calendário do mundo: meses com nomes próprios, semanas de qualquer tamanho,
 * luas com ciclos diferentes, estações e festas fixas.
 *
 *   tipo: calendario
 *   meses: Brumal:30, Geada:30, Degelo:31, ...
 *   semana: Solar, Lunar, Ferro, Água, Vento
 *   luas: Selene:28, Ira:9:3
 *   era: D.R.
 *
 * As festas ficam numa lista na seção "Festas" (`- 12 de Brumal: Noite das
 * Lanternas`). O dia absoluto de uma data é ano × dias do ano + dias antes do
 * mês + dia, então a semana e as fases das luas saem de conta, sem tabela.
 */

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string[] => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asList(e.props[key]).flatMap((x) => x.split(',')).map((x) => x.replace(/\[\[|\]\]/g, '').trim()).filter(Boolean);
      if (v.length) return v;
    }
  }
  return [];
};

export interface Mes { nome: string; dias: number }
export interface Lua { nome: string; ciclo: number; fase: number }
export interface Estacao { nome: string; mes: number }
export interface Festa { nome: string; mes: number; dia: number }

export interface Calendario {
  e: Entity | null;
  nome: string;
  meses: Mes[];
  semana: string[];
  luas: Lua[];
  era: string;
  estacoes: Estacao[];
  festas: Festa[];
  diasNoAno: number;
  /** avisos de leitura: festa num mês que não existe, dia além do fim do mês... */
  avisos: string[];
}

const MESES_PADRAO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_PADRAO = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const SEMANA_PADRAO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function montar(c: Omit<Calendario, 'diasNoAno'>): Calendario {
  return { ...c, diasNoAno: c.meses.reduce((s, m) => s + m.dias, 0) };
}

export const CALENDARIO_PADRAO: Calendario = montar({
  e: null, nome: 'Calendário comum', meses: MESES_PADRAO.map((nome, i) => ({ nome, dias: DIAS_PADRAO[i]! })), semana: SEMANA_PADRAO,
  luas: [{ nome: 'Lua', ciclo: 29.53, fase: 0 }], era: '',
  estacoes: [{ nome: 'Verão', mes: 0 }, { nome: 'Outono', mes: 2 }, { nome: 'Inverno', mes: 5 }, { nome: 'Primavera', mes: 8 }, { nome: 'Verão', mes: 11 }], festas: [], avisos: [],
});

/** "Brumal:30" ou "Brumal (30)" → nome e número. */
function nomeNumero(s: string): { nome: string; n: number | null; extra: number | null } {
  const m = /^(.*?)\s*(?:[:(]\s*(-?\d+(?:[.,]\d+)?)\s*\)?)?\s*(?::\s*(-?\d+(?:[.,]\d+)?))?$/.exec(s.trim());
  const num = (x?: string) => (x ? Number(x.replace(',', '.')) : null);
  return { nome: (m?.[1] ?? s).trim(), n: num(m?.[2]), extra: num(m?.[3]) };
}

function indiceMes(meses: Mes[], s: string): number {
  const f = fold(s);
  const n = Number(f);
  if (Number.isInteger(n) && n >= 1 && n <= meses.length) return n - 1;
  return meses.findIndex((m) => fold(m.nome) === f || (f.length >= 3 && fold(m.nome).startsWith(f)));
}

export function lerCalendario(e: Entity, texto: string): Calendario {
  const avisos: string[] = [];
  const brutos = prop(e, 'meses');
  const porMes = prop(e, 'dias por mês', 'dias por mes', 'dias');
  const padraoDias = Number(porMes.length === 1 ? porMes[0] : 30) || 30;
  const meses: Mes[] = (brutos.length ? brutos : MESES_PADRAO).map((s, i) => {
    const { nome, n } = nomeNumero(s);
    const lista = porMes.length > 1 ? Number(porMes[i]) : NaN;
    return { nome, dias: Math.max(1, Math.min(400, Math.round(n ?? (Number.isFinite(lista) ? lista : brutos.length ? padraoDias : DIAS_PADRAO[i] ?? 30)))) };
  });
  const semana = prop(e, 'semana', 'dias da semana');
  const luas = prop(e, 'luas', 'lua').map((s) => {
    const { nome, n, extra } = nomeNumero(s);
    return { nome, ciclo: Math.max(1, n ?? 29.53), fase: extra ?? 0 };
  });
  const estacoes: Estacao[] = [];
  for (const s of prop(e, 'estações', 'estacoes')) {
    const m = /^(.*?)\s*[:(]\s*(.+?)\s*\)?$/.exec(s);
    if (!m) continue;
    const i = indiceMes(meses, m[2]!);
    if (i >= 0) estacoes.push({ nome: m[1]!.trim(), mes: i });
    else avisos.push(`A estação "${m[1]}" começa em "${m[2]}", que não é um mês deste calendário.`);
  }
  estacoes.sort((a, b) => a.mes - b.mes);
  const festas: Festa[] = [];
  for (const linha of (getSection(bodyOf(texto), 'Festas') ?? '').split('\n')) {
    const l = linha.replace(/^\s*[-*+]\s*/, '').trim();
    if (!l) continue;
    const m = /^(\d{1,3})\s*(?:de\s+|\/\s*|\s+)([\p{L}\d][\p{L}\d\s'-]*?)\s*[:—–-]\s*(.+)$/u.exec(l) ?? /^([\p{L}][\p{L}\s'-]*?)\s+(\d{1,3})\s*[:—–-]\s*(.+)$/u.exec(l);
    if (!m) continue;
    const [dia, mes] = /^\d/.test(m[1]!) ? [Number(m[1]), m[2]!] : [Number(m[2]), m[1]!];
    const i = indiceMes(meses, mes);
    const nome = m[3]!.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').trim();
    if (i < 0) { avisos.push(`A festa "${nome}" cai em "${mes}", que não é um mês deste calendário.`); continue; }
    if (dia < 1 || dia > meses[i]!.dias) { avisos.push(`A festa "${nome}" cai no dia ${dia} de ${meses[i]!.nome}, que só tem ${meses[i]!.dias} dias.`); continue; }
    festas.push({ nome, mes: i, dia });
  }
  return montar({
    e, nome: e.name, meses, semana: semana.length ? semana : SEMANA_PADRAO, luas, era: asText(e.props['era'] ?? '').replace(/\[\[|\]\]/g, '').trim(),
    estacoes, festas: festas.sort((a, b) => a.mes - b.mes || a.dia - b.dia), avisos,
  });
}

/** O calendário em uso: o citado na nota do mundo (`calendário: [[X]]`) ou o primeiro que existir. */
export function calendarioDoMundo(w: World, ler: (path: string) => string): Calendario {
  const cals = w.entities.filter((e) => e.type === 'calendario');
  if (!cals.length) return CALENDARIO_PADRAO;
  const citado = asText(w.props?.['calendário'] ?? w.props?.['calendario'] ?? '').replace(/\[\[|\]\]/g, '').split('|')[0]!.trim();
  const e = cals.find((c) => citado && fold(c.name) === fold(citado)) ?? cals[0]!;
  return lerCalendario(e, ler(e.path));
}

// ------------------------------------------------------------------ contas

const mod = (a: number, b: number) => ((a % b) + b) % b;

export function inicioDoMes(cal: Calendario, mes: number): number {
  let n = 0;
  for (let i = 0; i < mes && i < cal.meses.length; i++) n += cal.meses[i]!.dias;
  return n;
}

/** Dia absoluto (o dia 1 do mês 1 do ano 0 é o zero). */
export const diaAbsoluto = (cal: Calendario, ano: number, mes: number, dia: number): number => ano * cal.diasNoAno + inicioDoMes(cal, mes) + (dia - 1);

export interface DataCal { ano: number; mes: number; dia: number }

export function deAbsoluto(cal: Calendario, n: number): DataCal {
  const ano = Math.floor(n / cal.diasNoAno);
  let r = n - ano * cal.diasNoAno;
  let mes = 0;
  while (mes < cal.meses.length - 1 && r >= cal.meses[mes]!.dias) { r -= cal.meses[mes]!.dias; mes++; }
  return { ano, mes, dia: r + 1 };
}

export const diaDaSemana = (cal: Calendario, n: number): number => mod(n, cal.semana.length);

/** Fase de 0 a 1: 0 é lua nova, 0,5 é cheia. */
export const faseDaLua = (lua: Lua, n: number): number => mod(n + lua.fase, lua.ciclo) / lua.ciclo;

const FASES = [
  [0.03, 'Nova', '🌑'], [0.22, 'Crescente', '🌒'], [0.28, 'Quarto crescente', '🌓'], [0.47, 'Gibosa crescente', '🌔'], [0.53, 'Cheia', '🌕'],
  [0.72, 'Gibosa minguante', '🌖'], [0.78, 'Quarto minguante', '🌗'], [0.97, 'Minguante', '🌘'], [1.01, 'Nova', '🌑'],
] as const;
export function nomeDaFase(f: number): { nome: string; icone: string } {
  for (const [lim, nome, icone] of FASES) if (f < lim) return { nome, icone };
  return { nome: 'Nova', icone: '🌑' };
}
/** A lua está cheia neste dia (a mais perto da metade do ciclo)? */
export const cheia = (lua: Lua, n: number): boolean => Math.abs(faseDaLua(lua, n) - 0.5) <= 0.5 / lua.ciclo;

export function estacaoDe(cal: Calendario, mes: number): string {
  if (!cal.estacoes.length) return '';
  let atual = cal.estacoes[cal.estacoes.length - 1]!.nome;
  for (const s of cal.estacoes) if (s.mes <= mes) atual = s.nome;
  return atual;
}

// ------------------------------------------------------------------ datas escritas

export interface DataLida { ano: number; mes: number | null; dia: number | null }

/** "12 de Brumal de 342", "12/3/342", "Brumal de 342", "342 D.R." ou "50 a.C." no calendário. */
export function lerDataCal(raw: string, cal: Calendario): DataLida | null {
  const s = raw.replace(/\[\[|\]\]/g, '').trim();
  if (!s) return null;
  const antes = /\b(a\.\s?c\.?|antes de)/i.test(s) ? -1 : 1;
  let m = /(\d{1,3})\s*\/\s*(\d{1,2})\s*\/\s*(-?\d+)/.exec(s);
  if (m) {
    const mes = Number(m[2]) - 1;
    if (mes >= 0 && mes < cal.meses.length) return { ano: Number(m[3]) * antes, mes, dia: Math.min(Number(m[1]), cal.meses[mes]!.dias) };
  }
  m = /(-?\d+)-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const mes = Number(m[2]) - 1;
    if (mes >= 0 && mes < cal.meses.length) return { ano: Number(m[1]) * antes, mes, dia: Math.min(Number(m[3]), cal.meses[mes]!.dias) };
  }
  const f = fold(s);
  // nome do mês por extenso (o mais comprido que couber, para "Alto Verão" vencer "Verão")
  const achado = cal.meses.map((x, i) => ({ i, n: fold(x.nome) })).filter((x) => x.n.length >= 3 && f.includes(x.n)).sort((a, b) => b.n.length - a.n.length)[0];
  if (achado) {
    const pos = f.indexOf(achado.n);
    const antesTxt = f.slice(0, pos);
    const depois = f.slice(pos + achado.n.length);
    const dia = /(\d{1,3})\D*$/.exec(antesTxt)?.[1];
    const ano = /(-?\d+)/.exec(depois)?.[1];
    if (ano !== undefined) return { ano: Number(ano) * antes, mes: achado.i, dia: dia ? Math.min(Number(dia), cal.meses[achado.i]!.dias) : null };
  }
  const n = parseWorldDate(s);
  return n === null ? null : { ano: Math.floor(n), mes: null, dia: null };
}

export function formatarDataCal(d: DataLida, cal: Calendario): string {
  const ano = `${d.ano}${cal.era ? ` ${cal.era}` : ''}`;
  if (d.mes === null) return ano;
  const mes = cal.meses[d.mes]?.nome ?? `mês ${d.mes + 1}`;
  return d.dia === null ? `${mes} de ${ano}` : `${d.dia} de ${mes} de ${ano}`;
}

// ------------------------------------------------------------------ o mês na tela

export interface DiaGrade { dia: number; abs: number; semana: number }

/** Semanas do mês, alinhadas pelo dia da semana (null = casa vazia). */
export function gradeDoMes(cal: Calendario, ano: number, mes: number): Array<Array<DiaGrade | null>> {
  const dias = cal.meses[mes]?.dias ?? 0;
  const w = cal.semana.length;
  const out: Array<Array<DiaGrade | null>> = [];
  let linha: Array<DiaGrade | null> = [];
  const ini = diaAbsoluto(cal, ano, mes, 1);
  for (let k = 0; k < diaDaSemana(cal, ini); k++) linha.push(null);
  for (let d = 1; d <= dias; d++) {
    const abs = ini + d - 1;
    linha.push({ dia: d, abs, semana: diaDaSemana(cal, abs) });
    if (linha.length === w) { out.push(linha); linha = []; }
  }
  if (linha.length) { while (linha.length < w) linha.push(null); out.push(linha); }
  return out;
}

export interface MarcoDoDia {
  dia: number;
  nome: string;
  tipo: 'festa' | 'evento' | 'nascimento' | 'morte' | 'fundacao';
  path?: string;
  /** aniversário de algo que aconteceu em outro ano: há quantos anos */
  anos?: number;
}

const CAMPOS: Array<[RegExp, MarcoDoDia['tipo']]> = [
  [/^(data|inicio|fim|quando)$/, 'evento'], [/^(nascimento|nasceu)$/, 'nascimento'], [/^(morte|morreu|queda)$/, 'morte'], [/^(fundacao|fundada em|criacao)$/, 'fundacao'],
];

/** Festas do mês e tudo do mundo com data neste mês (do ano ou aniversários de outros anos). */
export function marcosDoMes(w: World, cal: Calendario, ano: number, mes: number): MarcoDoDia[] {
  const out: MarcoDoDia[] = cal.festas.filter((f) => f.mes === mes).map((f) => ({ dia: f.dia, nome: f.nome, tipo: 'festa' }));
  for (const e of w.entities) {
    for (const [k, v] of Object.entries(e.props)) {
      const tipo = CAMPOS.find(([re]) => re.test(fold(k)))?.[1];
      if (!tipo) continue;
      const d = lerDataCal(asText(v), cal);
      if (!d || d.mes !== mes || d.dia === null || d.ano > ano) continue;
      out.push({ dia: d.dia, nome: e.name, tipo, path: e.path, ...(d.ano !== ano ? { anos: ano - d.ano } : {}) });
    }
  }
  return out.sort((a, b) => a.dia - b.dia || (a.anos ?? 0) - (b.anos ?? 0));
}

/** Dias do ano em que todas as luas (duas ou mais) ficam cheias juntas: noite de presságio. */
export function conjuncoes(cal: Calendario, ano: number): DataCal[] {
  if (cal.luas.length < 2) return [];
  const ini = diaAbsoluto(cal, ano, 0, 1);
  const out: DataCal[] = [];
  for (let n = ini; n < ini + cal.diasNoAno; n++) if (cal.luas.every((l) => cheia(l, n))) out.push(deAbsoluto(cal, n));
  return out;
}

/** O ano em que as histórias acontecem, para abrir a grade no lugar certo. */
export const anoDoCalendario = (w: World): number => worldYear(w);
