/*
 * A faculdade: a grade do semestre, as notas e a presença.
 *
 * Ela pergunta se você faz faculdade, pede a grade a cada semestre (seis
 * meses), põe as aulas na agenda como eventos semanais até o fim do semestre
 * e, de vez em quando, pergunta das notas e da presença. Elogia nota boa,
 * cobra (com carinho) nota baixa e falta.
 *
 *   "Cálculo 1: seg e qua 8h às 10h @ sala 12"   → uma matéria, duas aulas por semana
 *   "tirei 8,5 em cálculo"                        → nota 8,5/10 em Cálculo 1
 *   "faltei física hoje"                          → uma falta em Física
 *   "que aula eu tenho hoje?"                     → as aulas do dia
 *
 * Funções puras: quem fala é o cerebro.ts, quem pergunta é o rotina.ts, quem
 * grava os eventos na agenda é o app (ação `grade`).
 */
import type { EventInput } from '../../agenda/model';

export interface Aula {
  /** dias da semana (0 = domingo) */
  dias: number[];
  /** HH:mm */
  inicio: string;
  fim: string;
  local: string;
}

export interface Nota {
  v: number;
  /** a nota máxima (10, 100...) */
  de: number;
  em: number;
}

export interface Materia {
  nome: string;
  aulas: Aula[];
  notas: Nota[];
  faltas: number;
}

export interface Faculdade {
  /** faz faculdade? (null: ainda não sabe) */
  faz: boolean | null;
  curso: string | null;
  /** o semestre (AAAA-MM-DD) */
  inicio: string | null;
  fim: string | null;
  materias: Materia[];
  /** quando ela perguntou se você faz faculdade, pediu a grade, perguntou nota e presença */
  perguntouEm: number;
  pediuEm: number;
  notasEm: number;
  presencaEm: number;
}

export const novaFaculdade = (): Faculdade => ({ faz: null, curso: null, inicio: null, fim: null, materias: [], perguntouEm: 0, pediuEm: 0, notasEm: 0, presencaEm: 0 });

const dobra = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const hhmm = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
const dia = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function lerFaculdade(raw: unknown): Faculdade {
  const b = novaFaculdade();
  if (!obj(raw)) return b;
  const materias: Materia[] = Array.isArray(raw.materias)
    ? raw.materias.filter(obj).filter((m) => typeof m.nome === 'string').slice(0, 30).map((m) => ({
        nome: String(m.nome).slice(0, 60),
        aulas: Array.isArray(m.aulas)
          ? m.aulas.filter(obj).flatMap((a) => {
              const ini = hhmm(a.inicio), fim = hhmm(a.fim);
              const dias = Array.isArray(a.dias) ? a.dias.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6) : [];
              return ini && fim && dias.length ? [{ dias, inicio: ini, fim, local: typeof a.local === 'string' ? a.local : '' }] : [];
            })
          : [],
        notas: Array.isArray(m.notas) ? m.notas.filter(obj).filter((n) => typeof n.v === 'number').slice(-20).map((n) => ({ v: num(n.v, 0), de: num(n.de, 10), em: num(n.em, 0) })) : [],
        faltas: Math.max(0, num(m.faltas, 0)),
      }))
    : [];
  return {
    faz: raw.faz === true || raw.faz === false ? raw.faz : null,
    curso: typeof raw.curso === 'string' ? raw.curso : null,
    inicio: dia(raw.inicio), fim: dia(raw.fim), materias,
    perguntouEm: num(raw.perguntouEm, 0), pediuEm: num(raw.pediuEm, 0), notasEm: num(raw.notasEm, 0), presencaEm: num(raw.presencaEm, 0),
  };
}

// ------------------------------------------------------------------ datas

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** O fim do semestre: "até 15/12" na mensagem; senão julho (1º semestre) ou dezembro (2º). */
export function fimDoSemestre(texto: string, now: number): string {
  const d = new Date(now);
  const m = /\b(?:ate|termina(?:\s+em|\s+dia)?|acaba(?:\s+em|\s+dia)?|fim(?:\s+em)?)\s+(?:o\s+dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(dobra(texto));
  if (m) {
    const ano = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : d.getFullYear();
    let f = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && f.getTime() < now) f = new Date(ano + 1, Number(m[2]) - 1, Number(m[1]));
    return iso(f);
  }
  return d.getMonth() <= 5 ? `${d.getFullYear()}-07-15` : `${d.getFullYear()}-12-20`;
}

/** O semestre acabou (ou nunca foi informado)? */
export const semestreVencido = (f: Faculdade, now: number): boolean => !f.fim || f.fim < iso(new Date(now));

// ------------------------------------------------------------------ grade

const DIAS: Array<[RegExp, number]> = [
  [/^(dom|domingo|domingos)$/, 0], [/^(seg|segunda|segundas|2a|segunda-feira)$/, 1], [/^(ter|terca|tercas|3a|terca-feira)$/, 2], [/^(qua|quarta|quartas|4a|quarta-feira)$/, 3],
  [/^(qui|quinta|quintas|5a|quinta-feira)$/, 4], [/^(sex|sexta|sextas|6a|sexta-feira)$/, 5], [/^(sab|sabado|sabados)$/, 6],
];
const diaDe = (w: string): number | null => DIAS.find(([re]) => re.test(w))?.[1] ?? null;
const FAIXA = /\b(?:das?\s+)?(\d{1,2})(?:[:h](\d{2}))?h?\s*(?:-|–|as|às|a|ate|até)\s*(\d{1,2})(?:[:h](\d{2}))?h?\b/i;
const hora = (h: string, m?: string) => `${String(Math.min(23, Number(h))).padStart(2, '0')}:${m ?? '00'}`;
/** palavras que não são o nome da matéria */
const RUIDO = /^(e|de|da|do|das|dos|as|às|a|o|toda|todas|todo|todos|aula|aulas|na|no|em|feira|minha|meu|grade|materia|materias|disciplina|disciplinas|semestre|ate|até|termina|acaba|dia)$/i;

/**
 * Uma matéria por linha (ou separadas por ";"): nome, dias da semana e faixa de
 * horário; local depois de "@". Linhas sem dia ou sem horário são ignoradas.
 */
export function lerGrade(texto: string): Materia[] {
  const out: Materia[] = [];
  for (const bruta of texto.split(/\n|;/)) {
    let linha = bruta.trim().replace(/^[-•*\d.)\s]+(?=\p{L})/u, '');
    if (!linha) continue;
    let local = '';
    const at = /\s@\s*(.+)$/.exec(linha);
    if (at) {
      local = at[1]!.trim();
      linha = linha.slice(0, at.index);
    }
    // várias faixas na mesma linha: "seg 8h-10h e qua 10h-12h"
    const aulas: Aula[] = [];
    let resto = linha;
    let pendentes: number[] = [];
    const nome: string[] = [];
    const toks = linha.split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const w = dobra(toks[i]!).replace(/[,:.]+$/, '');
      const d = diaDe(w.replace(/-feira$/, ''));
      if (d !== null) {
        pendentes.push(d);
        continue;
      }
      const f = FAIXA.exec(toks.slice(i, i + 4).join(' '));
      if (f && f.index === 0 && /\d/.test(w)) {
        if (pendentes.length) aulas.push({ dias: [...new Set(pendentes)], inicio: hora(f[1]!, f[2]), fim: hora(f[3]!, f[4]), local });
        pendentes = [];
        // pula os tokens que a faixa comeu
        i += f[0].trim().split(/\s+/).length - 1;
        continue;
      }
      if (!RUIDO.test(w) && !/^\d+h$/.test(w)) nome.push(toks[i]!.replace(/[,:]+$/, ''));
    }
    resto = nome.join(' ').replace(/\s+/g, ' ').trim();
    if (!aulas.length || !resto) continue;
    const ja = out.find((m) => dobra(m.nome) === dobra(resto));
    if (ja) ja.aulas.push(...aulas);
    else out.push({ nome: resto.charAt(0).toUpperCase() + resto.slice(1), aulas, notas: [], faltas: 0 });
  }
  return out;
}

/** A grade vira eventos semanais na agenda, de hoje até o fim do semestre. */
export function aulasNaAgenda(ms: Materia[], fim: string, now: number): EventInput[] {
  const hoje = new Date(now);
  return ms.flatMap((m) => m.aulas.map((a) => {
    // o primeiro dia de aula a partir de hoje
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    for (let k = 0; k < 7 && !a.dias.includes(d.getDay()); k++) d.setDate(d.getDate() + 1);
    return {
      title: `Aula: ${m.nome}`, date: iso(d), endDate: null, allDay: false, start: a.inicio, end: a.fim,
      repeat: { freq: 'weekly' as const, interval: 1, weekdays: [...a.dias].sort(), until: fim, count: null },
      location: a.local, description: 'grade do semestre (Ânima)',
    };
  }));
}

/** Junta a grade nova com a de antes (mesma matéria: as aulas são trocadas, notas e faltas ficam). */
export function juntarGrade(antes: Materia[], novas: Materia[], semestreNovo: boolean): Materia[] {
  if (semestreNovo) return novas;
  const out = antes.map((m) => ({ ...m }));
  for (const n of novas) {
    const i = out.findIndex((m) => dobra(m.nome) === dobra(n.nome));
    if (i >= 0) out[i] = { ...out[i]!, aulas: n.aulas };
    else out.push(n);
  }
  return out;
}

// ------------------------------------------------------------------ notas e faltas

/** A matéria citada num texto (por palavra em comum, ignorando acento e número). */
export function acharMateria(ms: Materia[], texto: string): Materia | null {
  const t = ` ${dobra(texto).replace(/[^a-z0-9 ]+/g, ' ')} `;
  let melhor: Materia | null = null, nota = 0;
  for (const m of ms) {
    const ps = dobra(m.nome).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !/^(de|da|do|para|com)$/.test(p));
    const n = ps.filter((p) => t.includes(` ${p} `) || (p.length >= 5 && t.includes(` ${p.slice(0, 5)}`))).length / Math.max(1, ps.length);
    if (n > nota) [melhor, nota] = [m, n];
  }
  return nota >= 0.5 ? melhor : null;
}

const NOTA = /\b(?:tirei|peguei|fiquei com|consegui|minha nota (?:em|de|na|no) .{2,30}? (?:foi|e)|nota)\s+(?:um |uma )?(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*(?:\/|de|em)\s*(10|100|20|5)\b)?/;

/** "tirei 8,5 em cálculo" → { v: 8.5, de: 10, materia } */
export function lerNota(ms: Materia[], texto: string): { v: number; de: number; materia: Materia | null } | null {
  const t = dobra(texto);
  const m = NOTA.exec(t);
  if (!m) return null;
  const v = Number(m[1]!.replace(',', '.'));
  const de = m[2] ? Number(m[2]) : v > 10 ? 100 : 10;
  if (!(v >= 0 && v <= de)) return null;
  return { v, de, materia: acharMateria(ms, t.slice(m.index + m[0].length)) ?? acharMateria(ms, t) };
}

const FALTA = /\b(faltei|matei|nao fui (?:n[ao] |a |à )?(?:aula|faculdade)|perdi a aula|cabulei|gazeei)\b/;
const PRESENCA = /\b(fui em todas|nao faltei (?:nenhuma|nada)|presenca (?:cheia|completa|100)|fui (?:na|a) aula|assisti (?:a|à) aula)\b/;

/** "faltei física", "fui em todas as aulas" */
export function lerPresenca(ms: Materia[], texto: string): { falta: boolean; materia: Materia | null } | null {
  const t = dobra(texto);
  if (FALTA.test(t)) return { falta: true, materia: acharMateria(ms, t) };
  if (PRESENCA.test(t)) return { falta: false, materia: acharMateria(ms, t) };
  return null;
}

/** "faço faculdade de direito", "não faço faculdade" */
export function lerSeFaz(texto: string): { faz: boolean; curso: string | null } | null {
  const t = dobra(texto);
  if (/\b(nao|n|nunca) (faco|curso|estudo|to fazendo|tô fazendo|tenho) (faculdade|universidade|curso superior)|\b(tranquei|larguei|abandonei|terminei|me formei)( a)? (faculdade|curso)\b/.test(t)) return { faz: false, curso: null };
  const m = /\b(?:faco|curso|estudo|to fazendo|faco o curso de)\s+(?:faculdade\s+de\s+|faculdade\s+|curso\s+de\s+)?([a-z ]{3,30}?)\s+(?:na|no|em)\s+(?:faculdade|universidade|federal|usp|unicamp|uf\w+|puc\w*)\b|\b(?:faco|curso|to fazendo)\s+faculdade(?:\s+de\s+([a-z ]{3,30}))?/.exec(t);
  if (m) return { faz: true, curso: (m[1] ?? m[2] ?? '').trim() || null };
  if (/\b(faco|to na|tô na|estou na|entrei na) (faculdade|universidade|federal)\b/.test(t)) return { faz: true, curso: null };
  return null;
}

/** "que aula eu tenho hoje?", "qual minha grade?" */
export const perguntaAulas = (texto: string): 'hoje' | 'amanha' | 'grade' | null => {
  const t = dobra(texto);
  if (/\b(que|qual|quais|tenho) aulas?\b.*\bamanha\b|\baula(s)? (de |d )?amanha\b/.test(t)) return 'amanha';
  if (/\b(que|qual|quais|tenho) aulas?\b.*\bhoje\b|\baula(s)? (de |d )?hoje\b|\btenho aula hoje\b/.test(t)) return 'hoje';
  if (/\b(qual|como|mostra|me fala) (e |eh )?(a )?minha grade\b|\bminhas materias\b/.test(t)) return 'grade';
  return null;
};

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** As aulas de um dia da semana, em texto: "Cálculo 1 às 08:00, Física às 10:00". */
export function aulasDoDia(ms: Materia[], diaSemana: number): string {
  return ms
    .flatMap((m) => m.aulas.filter((a) => a.dias.includes(diaSemana)).map((a) => ({ m: m.nome, a })))
    .sort((x, y) => x.a.inicio.localeCompare(y.a.inicio))
    .map(({ m, a }) => `${m} às ${a.inicio}`)
    .join(', ');
}

/** A grade inteira, em texto curto. */
export const gradeEmTexto = (ms: Materia[]): string =>
  ms.map((m) => `${m.nome} (${m.aulas.map((a) => `${a.dias.map((d) => NOMES_DIA[d]).join('/')} ${a.inicio}`).join(', ')})`).join('; ');

/** O tom de uma nota: alta (≥ 80%), media (≥ 60%) ou baixa. */
export const faixaDaNota = (v: number, de: number): 'alta' | 'media' | 'baixa' => (v / de >= 0.8 ? 'alta' : v / de >= 0.6 ? 'media' : 'baixa');

/** A nota em texto: "8,5" ou "85/100". */
export const notaEmTexto = (v: number, de: number): string => `${String(v).replace('.', ',')}${de === 10 ? '' : `/${de}`}`;
