/*
 * O grafo de conhecimento dela: o que você contou vira triplas
 * (sujeito, relação, objeto), e regras de encadeamento para frente rodam até
 * nada novo aparecer. Cada conclusão guarda a regra e as triplas de onde veio,
 * então ela pode dizer não só o que sabe mas COMO deduziu.
 *
 *   gosta(você, chuva) ∧ ama(ela, chuva)            → em_comum(chuva)
 *   gosta(você, sol) ∧ odeia(ela, sol)              → discordam(sol)
 *   pessoa(Carol, crush) ∧ citada(Carol) ≥ 3        → suspeita(Carol)
 *   medo(você, avião) ∧ sonho(você, viajar pro japão) → dilema(avião, japão)
 *   sentiu(você, triste|mau) ≥ 2 nos últimos dias  → precisa_cuidado
 *   aniversário(você) em ≤ 14 dias                   → aniversario_perto
 *   estudo(prova) em ≤ 3 dias                        → prova_perto
 *
 * As consultas ("qual o nome do meu gato?", "quem é a Bia?", "o que a gente
 * tem em comum?") leem o grafo direto.
 */
import type { AnimaState } from '../estado';
import { DELA_AMA, DELA_ODEIA } from '../mente';
import { dobrar, radical, type Texto } from './texto';

export interface Tripla {
  s: string;
  p: string;
  o: string;
  /** "contou" (a pessoa disse) ou o nome da regra que deduziu */
  fonte: string;
  /** de que triplas veio (para explicar) */
  de?: Tripla[];
  /** número associado (vezes, dias) */
  n?: number;
}

const igual = (a: string, b: string) => {
  const x = dobrar(a), y = dobrar(b);
  return x === y || (x.length >= 4 && radical(x) === radical(y));
};

/** palavras que costumam estar ligadas (para achar dilemas entre medo e sonho) */
const LIGADAS: Array<[RegExp, RegExp]> = [
  [/aviao|voar|altura/, /viaj|japao|europa|exterior|intercambio|mundo|paraquedas|voar/],
  [/agua|mar|afogar/, /mergulh|surf|praia|nadar|barco|oceano/],
  [/palco|public|falar em public|vergonha/, /cantar|banda|ator|atriz|palestr|famos|youtuber|stream/],
  [/fracass|falhar|errar|rejeic/, /livro|empresa|negocio|carreira|passar|aprova|concurso/],
  [/sozinh|solid/, /casa propria|morar sozinh|mudar|intercambio/],
  [/escuro|noite/, /astronom|estrela|acampar/],
  [/cachorro|cao|bicho|animal/, /veterin|fazenda|adotar/],
];

/** O grafo inteiro (fatos + conclusões) do estado atual. */
export function montarGrafo(s: AnimaState, now: number): Tripla[] {
  const f = s.memoria.fatos;
  const g: Tripla[] = [];
  const add = (t: Tripla) => {
    if (!g.some((x) => x.s === t.s && x.p === t.p && x.o === t.o)) g.push(t);
  };
  const contou = (p: string, o: string, n?: number) => add({ s: 'você', p, o, fonte: 'contou', n });
  if (f.nome) contou('nome', f.nome);
  if (f.idade) contou('idade', String(f.idade));
  if (f.cidade) contou('mora_em', f.cidade);
  if (f.trabalho) contou('trabalha_com', f.trabalho);
  if (f.aniversario) contou('aniversario', f.aniversario);
  f.gosta.forEach((x) => contou('gosta', x));
  f.odeia.forEach((x) => contou('odeia', x));
  f.medos.forEach((x) => contou('medo', x));
  f.sonhos.forEach((x) => contou('sonho', x));
  f.bichos.forEach((b) => {
    contou('tem_bicho', b.nome);
    add({ s: b.nome, p: 'e_um', o: b.tipo, fonte: 'contou' });
  });
  f.pessoas.forEach((p) => {
    contou('conhece', p.nome, p.vezes);
    add({ s: p.nome, p: 'relacao', o: p.rel, fonte: 'contou', n: p.vezes });
  });
  f.humores.forEach((h) => contou('sentiu', h.como, Date.parse(`${h.dia}T12:00`)));
  for (const e of s.memoria.cerebro.estudos) add({ s: 'você', p: 'estuda_para', o: e.titulo, fonte: 'contou', n: e.at });
  DELA_AMA.forEach((x) => add({ s: 'ela', p: 'ama', o: x, fonte: 'ela' }));
  DELA_ODEIA.forEach((x) => add({ s: 'ela', p: 'odeia', o: x, fonte: 'ela' }));

  // encadeamento para frente até não aparecer nada novo
  for (let volta = 0; volta < 4; volta++) {
    const antes = g.length;
    const de = (p: string, s2 = 'você') => g.filter((x) => x.s === s2 && x.p === p);
    for (const gt of de('gosta')) {
      const a = de('ama', 'ela').find((x) => igual(x.o, gt.o));
      if (a) add({ s: 'nós', p: 'em_comum', o: gt.o, fonte: 'afinidade', de: [gt, a] });
      const o = de('odeia', 'ela').find((x) => igual(x.o, gt.o));
      if (o) add({ s: 'nós', p: 'discordam', o: gt.o, fonte: 'conflito', de: [gt, o] });
    }
    for (const od of de('odeia')) {
      const o = de('odeia', 'ela').find((x) => igual(x.o, od.o));
      if (o) add({ s: 'nós', p: 'odeiam_juntas', o: od.o, fonte: 'aliadas', de: [od, o] });
    }
    for (const r of g.filter((x) => x.p === 'relacao')) {
      if (/namorad|ficante|crush|alguém|ex/.test(r.o) && (r.n ?? 0) >= 3) add({ s: r.s, p: 'e', o: 'suspeita', fonte: 'suspeita', de: [r], n: r.n });
    }
    for (const m of de('medo')) for (const so of de('sonho')) {
      const dm = dobrar(m.o), ds = dobrar(so.o);
      if (LIGADAS.some(([a, b]) => a.test(dm) && b.test(ds))) add({ s: 'você', p: 'dilema', o: `${m.o}|${so.o}`, fonte: 'dilema', de: [m, so] });
    }
    const tristes = de('sentiu').filter((x) => /triste|mau|cansaco/.test(x.o) && now - (x.n ?? 0) < 4 * 864e5);
    if (tristes.length >= 2) add({ s: 'você', p: 'precisa', o: 'cuidado', fonte: 'cuidado', de: tristes, n: tristes.length });
    for (const a of de('aniversario')) {
      const dias = diasAte(a.o, now);
      if (dias <= 14) add({ s: 'você', p: 'aniversario_em', o: String(dias), fonte: 'aniversario_perto', de: [a], n: dias });
    }
    for (const e of de('estuda_para')) {
      const dias = Math.ceil(((e.n ?? 0) - now) / 864e5);
      if (dias >= 0 && dias <= 3) add({ s: 'você', p: 'prova_em', o: e.o, fonte: 'prova_perto', de: [e], n: dias });
    }
    for (const b of de('tem_bicho')) add({ s: b.o, p: 'e', o: 'família', fonte: 'familia', de: [b] });
    if (g.length === antes) break;
  }
  return g;
}

/** Dias até o próximo "MMDD". */
export function diasAte(mmdd: string, now: number): number {
  const d = new Date(now);
  const hoje = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let alvo = new Date(d.getFullYear(), +mmdd.slice(0, 2) - 1, +mmdd.slice(2)).getTime();
  if (alvo < hoje) alvo = new Date(d.getFullYear() + 1, +mmdd.slice(0, 2) - 1, +mmdd.slice(2)).getTime();
  return Math.round((alvo - hoje) / 864e5);
}

/** As conclusões (o que não foi contado), para ela comentar nos pensamentos soltos. */
export function deducoes(g: Tripla[]): Tripla[] {
  return g.filter((t) => t.fonte !== 'contou' && t.fonte !== 'ela');
}

// ------------------------------------------------------------------ consultas

export type Consulta =
  | { tipo: 'nome' | 'idade' | 'cidade' | 'trabalho' | 'aniversario' | 'gosta' | 'odeia' | 'medo' | 'sonho' | 'comum' | 'tudo' }
  | { tipo: 'bicho'; especie: string | null }
  | { tipo: 'sobre'; alvo: string };

export function entenderConsulta(t: Texto): Consulta | null {
  const s = t.tokens.join(' ');
  let m = /nome d[oa] meu (gato|gata|cachorro|cachorra|pet|bicho|calopsita|hamster|coelho|peixe|cao)|nome da minha (gata|cachorra|calopsita)/.exec(s);
  if (m) return { tipo: 'bicho', especie: m[1] ?? m[2] ?? null };
  if (/(qual|como) (e )?(o )?meu nome|como eu me chamo|(lembra|sabe) (do |o )?meu nome/.test(s)) return { tipo: 'nome' };
  if (/quantos anos eu tenho|minha idade/.test(s)) return { tipo: 'idade' };
  if (/onde eu moro|minha cidade|que cidade eu moro/.test(s)) return { tipo: 'cidade' };
  if (/com o que eu trabalho|o que eu faco|onde eu trabalho|o que eu estudo/.test(s)) return { tipo: 'trabalho' };
  if (/quando (e )?(o )?meu aniversario|data do meu aniversario|meu aniversario e quando/.test(s)) return { tipo: 'aniversario' };
  if (/(do|o) que eu gosto|minhas coisas favoritas|o que eu curto/.test(s)) return { tipo: 'gosta' };
  if (/o que eu odeio|do que eu nao gosto/.test(s)) return { tipo: 'odeia' };
  if (/(do )?que eu tenho medo|meus medos/.test(s)) return { tipo: 'medo' };
  if (/qual (e )?(o )?meu sonho|meus sonhos|com o que eu sonho/.test(s)) return { tipo: 'sonho' };
  if (/em comum/.test(s)) return { tipo: 'comum' };
  if (/o que (voce|vc) (sabe|lembra) (sobre|de) mim|voce lembra de mim|o que voce lembra|o que voce sabe de mim|lembra do que eu (te )?contei/.test(s)) return { tipo: 'tudo' };
  m = /quem (e|eh) (?:a |o )?(\w+)/.exec(s) ?? /(?:sabe|falei|contei|lembra) (?:sobre |da |do |de )(?:a |o )?(\w+)/.exec(s);
  if (m) {
    const alvo = m[2] ?? m[1]!;
    const orig = new RegExp(`\\b(${alvo})\\b`, 'i').exec(dobrar(t.original)) ? t.original.split(/\s+/).find((w) => dobrar(w).replace(/[^a-z]/g, '') === alvo) : null;
    return { tipo: 'sobre', alvo: (orig ?? alvo).replace(/[?!.,]/g, '') };
  }
  return null;
}

export interface Resposta {
  /** grupo de falas: sabe.<tipo> ou sabe.nada.<tipo> */
  grupo: string;
  vars: Record<string, string | number>;
  /** como ela sabe (as triplas que sustentam a resposta) */
  provas: Tripla[];
}

const lista = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0] ?? '');

export function responderConsulta(g: Tripla[], q: Consulta, now: number): Resposta {
  const de = (p: string) => g.filter((x) => x.s === 'você' && x.p === p);
  const um = (p: string) => de(p)[0];
  const nada = (tipo: string): Resposta => ({ grupo: `sabe.nada.${tipo}`, vars: {}, provas: [] });
  switch (q.tipo) {
    case 'nome': { const t = um('nome'); return t ? { grupo: 'sabe.nome', vars: { nomereal: t.o }, provas: [t] } : nada('nome'); }
    case 'idade': { const t = um('idade'); return t ? { grupo: 'sabe.idade', vars: { idade: t.o }, provas: [t] } : nada('idade'); }
    case 'cidade': { const t = um('mora_em'); return t ? { grupo: 'sabe.cidade', vars: { coisa: t.o }, provas: [t] } : nada('cidade'); }
    case 'trabalho': { const t = um('trabalha_com'); return t ? { grupo: 'sabe.trabalho', vars: { coisa: t.o }, provas: [t] } : nada('trabalho'); }
    case 'aniversario': {
      const t = um('aniversario');
      if (!t) return nada('aniversario');
      return { grupo: 'sabe.aniversario', vars: { data: `${Number(t.o.slice(2))}/${Number(t.o.slice(0, 2))}`, dias: diasAte(t.o, now) }, provas: [t] };
    }
    case 'gosta': case 'odeia': case 'medo': case 'sonho': {
      const ts = de(q.tipo);
      return ts.length ? { grupo: `sabe.${q.tipo}`, vars: { lista: lista(ts.slice(-5).map((x) => x.o)), n: ts.length }, provas: ts } : nada(q.tipo);
    }
    case 'comum': {
      const ts = g.filter((x) => x.p === 'em_comum' || x.p === 'odeiam_juntas');
      return ts.length ? { grupo: 'sabe.comum', vars: { lista: lista(ts.map((x) => x.o)) }, provas: ts } : nada('comum');
    }
    case 'bicho': {
      const bs = de('tem_bicho').filter((b) => !q.especie || g.some((x) => x.s === b.o && x.p === 'e_um' && igual(x.o, q.especie!) || (q.especie === 'pet' || q.especie === 'bicho')));
      const b = bs[0] ?? de('tem_bicho')[0];
      if (!b) return { grupo: 'sabe.nada.bicho', vars: { tipo: q.especie ?? 'bicho' }, provas: [] };
      const tipo = g.find((x) => x.s === b.o && x.p === 'e_um')?.o ?? q.especie ?? 'bicho';
      return { grupo: 'sabe.bicho', vars: { bicho: b.o, tipo }, provas: [b] };
    }
    case 'sobre': {
      const ts = g.filter((x) => igual(x.s, q.alvo) || igual(x.o, q.alvo));
      if (!ts.length) return { grupo: 'sabe.nada.sobre', vars: { coisa: q.alvo }, provas: [] };
      const rel = ts.find((x) => x.p === 'relacao');
      const suspeita = ts.some((x) => x.p === 'e' && x.o === 'suspeita');
      const bicho = ts.find((x) => x.p === 'e_um');
      if (bicho) return { grupo: 'sabe.bicho', vars: { bicho: bicho.s, tipo: bicho.o }, provas: ts };
      if (rel) return { grupo: suspeita ? 'sabe.suspeita' : 'sabe.pessoa', vars: { pessoa: rel.s, rel: rel.o, n: rel.n ?? 1 }, provas: ts };
      const gosto = ts.find((x) => x.p === 'gosta' || x.p === 'odeia' || x.p === 'medo' || x.p === 'sonho');
      if (gosto) return { grupo: `sabe.coisa.${gosto.p}`, vars: { coisa: gosto.o }, provas: ts };
      return { grupo: 'sabe.nada.sobre', vars: { coisa: q.alvo }, provas: [] };
    }
    case 'tudo': {
      const contadas = g.filter((x) => x.s === 'você' && x.fonte === 'contou' && x.p !== 'sentiu' && x.p !== 'estuda_para');
      if (!contadas.length) return nada('tudo');
      const fala = contadas.slice(-3).map((x) => descrever(x)).filter(Boolean) as string[];
      return { grupo: 'sabe.tudo', vars: { n: contadas.length, lista: lista(fala) }, provas: contadas };
    }
  }
}

/** Uma tripla em português ("você gosta de café"). */
export function descrever(t: Tripla): string | null {
  switch (t.p) {
    case 'nome': return `seu nome é ${t.o}`;
    case 'idade': return `você tem ${t.o} anos`;
    case 'mora_em': return `você mora em ${t.o}`;
    case 'trabalha_com': return `você trabalha com ${t.o}`;
    case 'aniversario': return `seu aniversário é ${Number(t.o.slice(2))}/${Number(t.o.slice(0, 2))}`;
    case 'gosta': return `você gosta de ${t.o}`;
    case 'odeia': return `você odeia ${t.o}`;
    case 'medo': return `você tem medo de ${t.o}`;
    case 'sonho': return `você sonha com ${t.o}`;
    case 'tem_bicho': return `você tem o ${t.o}`;
    case 'conhece': return `você conhece ${t.o}`;
    default: return null;
  }
}
