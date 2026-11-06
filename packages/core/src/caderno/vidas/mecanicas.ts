/*
 * Construtor de mecânicas: em vez de escrever regras do zero, a pessoa monta
 * uma mecânica por partes (quem, quando, com que chance, o que acontece) e o
 * Tanden escreve o bloco ```regras. O texto gerado é a mesma linguagem de
 * sempre: dá para abrir a nota e ajustar à mão depois.
 */

export type Quem = 'a' | 'b';

export type Op = '>' | '<' | '>=' | '<=' | '=' | '!=';

export type Condicao =
  /** qualquer valor: de uma pessoa (força, sanidade...) ou da relação de uma com a outra (afeto, ódio, dívida...) */
  | { k: 'valor'; alvo: 'pessoa' | 'relacao'; quem: Quem; campo: string; op: Op; valor: string }
  | { k: 'especie'; quem: Quem; especie: string; nao?: boolean }
  | { k: 'chance'; pct: number }
  | { k: 'traco'; quem: Quem; traco: string; nao?: boolean }
  | { k: 'opiniao' | 'atracao' | 'confianca' | 'intimidade'; de: Quem; op: Op; valor: number }
  | { k: 'idade'; quem: Quem; op: Op; valor: number }
  | { k: 'vinculo'; vinc: 'casados' | 'namoro' | 'amantes' | 'amigos' | 'rivais' | 'inimigos' | 'parentes'; nao?: boolean }
  | { k: 'comprometido' | 'gravida' | 'adulto'; quem: Quem; nao?: boolean }
  | { k: 'profissao'; quem: Quem; prof: string; nao?: boolean }
  | { k: 'gosto'; quem: Quem; gosto: string }
  | { k: 'campo'; quem: Quem; campo: string; op: Op; valor: string }
  | { k: 'livre'; expr: string };

export type Consequencia =
  | { k: 'relacao'; de: Quem; eixo: 'afeto' | 'atracao' | 'confianca' | 'respeito' | 'intimidade'; delta: number; mutuo?: boolean }
  | { k: 'humor' | 'estresse' | 'dinheiro' | 'saude'; quem: Quem; delta: number }
  | { k: 'ganhar' | 'perder'; quem: Quem; traco: string }
  | { k: 'casar' | 'namorar' | 'caso' | 'terminar' | 'engravidar' }
  | { k: 'lutar'; modo: 'briga' | 'duelo' | 'emboscada' }
  | { k: 'ferir' | 'matar'; quem: Quem; texto?: string }
  | { k: 'lembrar'; de: Quem; texto: string; valor: number }
  | { k: 'campo'; quem: Quem; campo: string; op: '=' | '+=' | '-='; valor: string }
  /** muda um valor da relação de uma pessoa com a outra (afeto, confiança... ou um campo livre como dívida) */
  | { k: 'relcampo'; de: Quem; campo: string; op: '=' | '+=' | '-='; valor: string }
  | { k: 'disparar'; evento: string }
  | { k: 'livre'; codigo: string };

/** Uma etapa de trama montada no construtor. */
export interface Etapa {
  nome: string;
  /** meses até a próxima etapa */
  dura: number;
  /** o que acontece quando a etapa chega */
  efeitos: Consequencia[];
  cronica: string;
  /** para seguir, precisa disto (vazio = segue sempre) */
  condicoes: Condicao[];
  /** se a condição não vale: falha a trama, tenta de novo depois, ou volta à etapa anterior */
  senao: 'falhar' | 'repetir' | 'voltar';
  cronicaSenao: string;
}

export interface Mecanica {
  /** interação entre duas pessoas, acontecimento de uma pessoa só, reação a um evento, ou trama em etapas */
  tipo: 'par' | 'solo' | 'reacao' | 'trama';
  /** trama: entre duas pessoas (padrão) ou de uma só */
  solo?: boolean;
  etapas?: Etapa[];
  aoConcluir?: { efeitos: Consequencia[]; cronica: string };
  aoFalhar?: { efeitos: Consequencia[]; cronica: string };
  nome: string;
  /** reação: nome do evento (casamento, nascimento, traicao...) e os nomes das partes */
  evento?: string;
  /** chance por ano (0 a 100) */
  chance: number;
  /** puxa a escolha do parceiro: expressão de atração (vazio = igual para todos) */
  atracao?: string;
  condicoes: Condicao[];
  efeitos: Consequencia[];
  /** frase da crônica; {a} e {b} viram os nomes */
  cronica: string;
}

/** Eventos da simulação de vidas que dá para usar em "quando". As partes vêm na ordem. */
export const EVENTOS_VIDA: Array<{ id: string; nome: string; partes: string[] }> = [
  { id: 'nascimento', nome: 'Nascimento', partes: ['bebê', 'mãe', 'pai'] },
  { id: 'morte', nome: 'Morte', partes: ['morto'] },
  { id: 'casamento', nome: 'Casamento', partes: ['a', 'b'] },
  { id: 'namoro', nome: 'Começo de namoro', partes: ['a', 'b'] },
  { id: 'noivado', nome: 'Noivado', partes: ['a', 'b'] },
  { id: 'divorcio', nome: 'Divórcio', partes: ['quem pediu', 'outro'] },
  { id: 'termino', nome: 'Fim de namoro', partes: ['quem terminou', 'outro'] },
  { id: 'caso', nome: 'Começo de um caso', partes: ['a', 'b'] },
  { id: 'descoberta', nome: 'Traição descoberta', partes: ['vítima', 'traidor', 'amante'] },
  { id: 'gravidez', nome: 'Gravidez', partes: ['mãe', 'pai'] },
  { id: 'paternidade', nome: 'Pai descobre que o filho não é dele', partes: ['pai oficial', 'filho', 'pai biológico'] },
  { id: 'briga', nome: 'Briga', partes: ['vencedor', 'perdedor'] },
  { id: 'duelo', nome: 'Duelo', partes: ['vencedor', 'perdedor'] },
  { id: 'emboscada', nome: 'Emboscada', partes: ['vencedor', 'perdedor'] },
  { id: 'assassinato', nome: 'Assassinato', partes: ['assassino', 'vítima'] },
  { id: 'atentado', nome: 'Tentativa de assassinato', partes: ['assassino', 'alvo'] },
  { id: 'roubo', nome: 'Roubo', partes: ['ladrão', 'vítima'] },
  { id: 'amizade', nome: 'Nova amizade', partes: ['a', 'b'] },
  { id: 'rivalidade', nome: 'Nova rivalidade', partes: ['a', 'b'] },
  { id: 'reconciliacao', nome: 'Reconciliação', partes: ['a', 'b'] },
  { id: 'maioridade', nome: 'Maioridade', partes: ['pessoa'] },
  { id: 'doenca', nome: 'Doença', partes: ['doente'] },
  { id: 'crise', nome: 'Crise de estresse', partes: ['pessoa'] },
  { id: 'viagem', nome: 'Partida em viagem', partes: ['viajante'] },
  { id: 'mes', nome: 'Todo mês', partes: [] },
  { id: 'ano', nome: 'Todo ano', partes: [] },
];

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const id = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
const valor = (v: string) => (/^-?\d+(?:[.,]\d+)?$/.test(v.trim()) ? v.trim().replace(',', '.') : /^(sim|não|nao|vazio|verdadeiro|falso)$/i.test(v.trim()) ? v.trim() : q(v));

/** Campos com número que dá para comparar ou mudar, para as listas do construtor. */
export const CAMPOS_PESSOA: Array<{ id: string; nome: string; grupo: string }> = [
  ...[['idade', 'idade'], ['saude', 'saúde'], ['humor', 'humor'], ['estresse', 'estresse'], ['dinheiro', 'dinheiro']].map(([id, nome]) => ({ id: id!, nome: nome!, grupo: 'estado' })),
  ...[['forca', 'força'], ['agilidade', 'agilidade'], ['intelecto', 'intelecto'], ['beleza', 'beleza'], ['fertilidade', 'fertilidade'], ['altura', 'altura (cm)']].map(([id, nome]) => ({ id: id!, nome: nome!, grupo: 'corpo' })),
  ...[['combate', 'combate'], ['labia', 'lábia'], ['intriga', 'intriga'], ['oficio', 'ofício'], ['saber', 'saber']].map(([id, nome]) => ({ id: id!, nome: nome!, grupo: 'habilidade' })),
  ...[['abertura', 'abertura'], ['conscienciosidade', 'conscienciosidade'], ['extroversao', 'extroversão'], ['amabilidade', 'amabilidade'], ['neuroticismo', 'neuroticismo']].map(([id, nome]) => ({ id: id!, nome: nome!, grupo: 'personalidade' })),
];
export const CAMPOS_RELACAO: Array<{ id: string; nome: string; muda: boolean }> = [
  { id: 'opiniao', nome: 'opinião (−100 a 100)', muda: false }, { id: 'odio', nome: 'ódio (0 a 100)', muda: false },
  { id: 'afeto', nome: 'afeto', muda: true }, { id: 'atracao', nome: 'atração', muda: true }, { id: 'confianca', nome: 'confiança', muda: true },
  { id: 'respeito', nome: 'respeito', muda: true }, { id: 'intimidade', nome: 'intimidade', muda: true },
];
const ACENTO: Record<string, string> = {
  saude: 'saúde', forca: 'força', labia: 'lábia', oficio: 'ofício', extroversao: 'extroversão', opiniao: 'opinião', odio: 'ódio', atracao: 'atração', confianca: 'confiança',
};
/** Nome do campo como se escreve (com acento quando é um dos de fábrica; os outros viram id com _). */
const campoTxt = (c: string) => ACENTO[c] ?? id(c);

function cond(c: Condicao, nomes: Record<Quem, string>): string {
  const n = (x: Quem) => nomes[x];
  const o = (x: Quem) => nomes[x === 'a' ? 'b' : 'a'];
  switch (c.k) {
    case 'valor':
      return c.alvo === 'relacao'
        ? `relação(${n(c.quem)}, ${o(c.quem)}).${campoTxt(c.campo)} ${c.op} ${valor(c.valor)}`
        : `${n(c.quem)}.${campoTxt(c.campo)} ${c.op} ${valor(c.valor)}`;
    case 'especie': return `${n(c.quem)}.espécie ${c.nao ? '!=' : '='} ${q(c.especie)}`;
    case 'chance': return `chance(${Math.max(0, Math.min(100, c.pct))}%)`;
    case 'traco': return `${c.nao ? 'não ' : ''}traço(${n(c.quem)}, ${q(c.traco)})`;
    case 'opiniao': return `opinião(${n(c.de)}, ${o(c.de)}) ${c.op} ${c.valor}`;
    case 'atracao': return `atração(${n(c.de)}, ${o(c.de)}) ${c.op} ${c.valor}`;
    case 'confianca': return `relação(${n(c.de)}, ${o(c.de)}).confiança ${c.op} ${c.valor}`;
    case 'intimidade': return `relação(${n(c.de)}, ${o(c.de)}).intimidade ${c.op} ${c.valor}`;
    case 'idade': return `${n(c.quem)}.idade ${c.op} ${c.valor}`;
    case 'vinculo':
      if (c.vinc === 'casados') return `${n('a')}.cônjuge ${c.nao ? '!=' : '='} ${n('b')}`;
      if (c.vinc === 'parentes') return `${c.nao ? 'não ' : ''}existe(parente(${n('a')}, ${n('b')}))`;
      return `${n('a')}.${c.vinc} ${c.nao ? 'não tem' : 'tem'} ${n('b')}`;
    case 'comprometido': return `${c.nao ? 'não ' : ''}${n(c.quem)}.comprometido`;
    case 'gravida': return `${c.nao ? 'não ' : ''}${n(c.quem)}.grávida`;
    case 'adulto': return `${c.nao ? 'não ' : ''}${n(c.quem)}.adulto`;
    case 'profissao': return `${n(c.quem)}.profissão ${c.nao ? '!=' : '='} ${q(c.prof)}`;
    case 'gosto': return `${n(c.quem)}.gostos tem ${q(c.gosto)}`;
    case 'campo': return `${n(c.quem)}.${id(c.campo)} ${c.op} ${valor(c.valor)}`;
    case 'livre': return `(${c.expr})`;
  }
}

function efeito(e: Consequencia, nomes: Record<Quem, string>, ind: string): string[] {
  const n = (x: Quem) => nomes[x];
  const o = (x: Quem) => nomes[x === 'a' ? 'b' : 'a'];
  const sinal = (d: number) => (d >= 0 ? `+= ${d}` : `-= ${-d}`);
  switch (e.k) {
    case 'relacao': {
      const l = [`${ind}relação(${n(e.de)}, ${o(e.de)}).${e.eixo === 'atracao' ? 'atração' : e.eixo === 'confianca' ? 'confiança' : e.eixo} ${sinal(e.delta)}`];
      if (e.mutuo) l.push(`${ind}relação(${o(e.de)}, ${n(e.de)}).${e.eixo === 'atracao' ? 'atração' : e.eixo === 'confianca' ? 'confiança' : e.eixo} ${sinal(e.delta)}`);
      return l;
    }
    case 'humor': case 'estresse': case 'dinheiro': case 'saude':
      return [`${ind}${n(e.quem)}.${e.k === 'saude' ? 'saúde' : e.k} ${sinal(e.delta)}`];
    case 'ganhar': case 'perder': return [`${ind}${e.k}(${n(e.quem)}, ${q(e.traco)})`];
    case 'casar': case 'namorar': case 'caso': case 'terminar': return [`${ind}${e.k}(${n('a')}, ${n('b')})`];
    case 'engravidar': return [`${ind}engravidar(${n('a')}, ${n('b')})`];
    case 'lutar': return [`${ind}lutar(${n('a')}, ${n('b')}, ${q(e.modo)})`];
    case 'ferir': return [`${ind}ferir(${n(e.quem)}${e.texto ? `, ${q(e.texto)}` : ''})`];
    case 'matar': return [`${ind}matar(${n(e.quem)}, ${q(e.texto || 'de repente')})`];
    case 'lembrar': return [`${ind}lembrar(${n(e.de)}, ${o(e.de)}, ${q(e.texto)}, ${e.valor})`];
    case 'campo': return [`${ind}${n(e.quem)}.${campoTxt(e.campo)} ${e.op} ${valor(e.valor)}`];
    case 'relcampo': return [`${ind}relação(${n(e.de)}, ${o(e.de)}).${campoTxt(e.campo)} ${e.op} ${valor(e.valor)}`];
    case 'disparar': return [`${ind}disparar ${id(e.evento)}(${n('a')}${nomes.b !== nomes.a ? `, ${n('b')}` : ''})`];
    case 'livre': return e.codigo.split('\n').filter((x) => x.trim()).map((x) => `${ind}${x.trim()}`);
  }
}

/** Escreve a mecânica na linguagem das regras. */
export function mecanicaRegras(m: Mecanica): string {
  const nome = m.nome.trim() || 'Mecânica sem nome';
  const ind = '  ';
  const linhas: string[] = [`# ${nome} (feita no construtor)`];
  let nomes: Record<Quem, string>;
  if (m.tipo === 'reacao') {
    const ev = EVENTOS_VIDA.find((e) => e.id === m.evento) ?? { id: id(m.evento ?? 'evento'), partes: ['a', 'b'] };
    const partes = ev.partes.map(id);
    nomes = { a: partes[0] ?? 'a', b: partes[1] ?? partes[0] ?? 'a' };
    const conds = m.condicoes.map((c) => cond(c, nomes));
    const header = ev.id === 'mes' || ev.id === 'ano' ? `quando ${ev.id} em personagem` : `quando ${ev.id}(${partes.join(', ')})`;
    if (ev.id === 'mes' || ev.id === 'ano') nomes = { a: 'personagem', b: 'personagem' };
    const conds2 = ev.id === 'mes' || ev.id === 'ano' ? m.condicoes.map((c) => cond(c, nomes)) : conds;
    linhas.push(`${header}${conds2.length ? ` onde ${conds2.join(' e ')}` : ''}:`);
    const corpo: string[] = [];
    const chance = Math.max(0, Math.min(100, m.chance));
    const dentro = chance < 100 ? `${ind}${ind}` : ind;
    if (chance < 100) corpo.push(`${ind}se chance(${chance}%):`);
    for (const e of m.efeitos) corpo.push(...efeito(e, nomes, dentro));
    if (m.cronica.trim()) corpo.push(`${dentro}crônica ${q(texto(m.cronica, nomes))}`);
    if (corpo.length === (chance < 100 ? 1 : 0)) corpo.push(`${dentro}${nomes.a}.humor += 0`);
    linhas.push(...corpo);
    return `${linhas.join('\n')}\n`;
  }
  if (m.tipo === 'trama') return tramaRegras(m);
  nomes = m.tipo === 'par' ? { a: 'a', b: 'b' } : { a: 'p', b: 'p' };
  const conds = m.condicoes.map((c) => cond(c, nomes));
  linhas.push(m.tipo === 'par'
    ? `interação ${q(nome)} entre a em personagem, b em personagem${conds.length ? ` onde ${conds.join(' e ')}` : ''}:`
    : `interação ${q(nome)} de p em personagem${conds.length ? ` onde ${conds.join(' e ')}` : ''}:`);
  if (m.atracao?.trim() && m.tipo === 'par') linhas.push(`${ind}atração = ${m.atracao.trim()}`);
  linhas.push(`${ind}chance = ${Math.max(0, Math.min(100, m.chance))}%`);
  for (const e of m.efeitos) linhas.push(...efeito(e, nomes, ind));
  if (m.cronica.trim()) linhas.push(`${ind}crônica ${q(texto(m.cronica, nomes))}`);
  if (linhas.length === 3 && !m.cronica.trim()) linhas.push(`${ind}${nomes.a}.humor += 0`);
  return `${linhas.join('\n')}\n`;
}

function tramaRegras(m: Mecanica): string {
  const nome = m.nome.trim() || 'Trama sem nome';
  const nomes: Record<Quem, string> = m.solo ? { a: 'p', b: 'p' } : { a: 'a', b: 'b' };
  const I = '  ';
  const conds = m.condicoes.map((c) => cond(c, nomes));
  const L: string[] = [`# ${nome} (feita no construtor)`];
  L.push(m.solo
    ? `trama ${q(nome)} de p em personagem${conds.length ? ` onde ${conds.join(' e ')}` : ''}:`
    : `trama ${q(nome)} entre a em personagem, b em personagem${conds.length ? ` onde ${conds.join(' e ')}` : ''}:`);
  if (m.atracao?.trim() && !m.solo) L.push(`${I}atração = ${m.atracao.trim()}`);
  L.push(`${I}chance = ${Math.max(0, Math.min(100, m.chance))}%`);
  const etapas = m.etapas?.length ? m.etapas : [{ nome: 'Começo', dura: 1, efeitos: [], cronica: '', condicoes: [], senao: 'falhar' as const, cronicaSenao: '' }];
  etapas.forEach((e, i) => {
    L.push(`${I}etapa ${q(e.nome.trim() || `Etapa ${i + 1}`)}:`);
    const II = I + I;
    if (e.dura && e.dura !== 1) L.push(`${II}dura ${Math.max(1, Math.round(e.dura))} meses`);
    const corpo: string[] = [];
    let dentro = II;
    if (e.condicoes.length) {
      const ok = e.condicoes.map((c) => cond(c, nomes)).join(' e ');
      corpo.push(`${II}se não (${ok}):`);
      const III = II + I;
      if (e.cronicaSenao.trim()) corpo.push(`${III}crônica ${q(texto(e.cronicaSenao, nomes))}`);
      if (e.senao === 'repetir') corpo.push(`${III}repetir`);
      else if (e.senao === 'voltar' && i > 0) corpo.push(`${III}ir para ${q(etapas[i - 1]!.nome.trim() || `Etapa ${i}`)}`);
      else corpo.push(`${III}falhar`);
      dentro = II;
    }
    for (const ef of e.efeitos) corpo.push(...efeito(ef, nomes, dentro));
    if (e.cronica.trim()) corpo.push(`${dentro}crônica ${q(texto(e.cronica, nomes))}`);
    if (!corpo.length) corpo.push(`${II}seguir`);
    L.push(...corpo);
  });
  for (const [k, fim] of [['concluir', m.aoConcluir], ['falhar', m.aoFalhar]] as const) {
    if (!fim || (!fim.efeitos.length && !fim.cronica.trim())) continue;
    L.push(`${I}ao ${k}:`);
    for (const ef of fim.efeitos) L.push(...efeito(ef, nomes, I + I));
    if (fim.cronica.trim()) L.push(`${I}${I}crônica ${q(texto(fim.cronica, nomes))}`);
  }
  return `${L.join('\n')}\n`;
}

// ------------------------------------------------------------------ catálogo: traços, atributos, espécies, profissões

export interface TracoForm {
  nome: string;
  feminino: string;
  desc: string;
  categoria: 'personalidade' | 'adquirido' | 'congenito' | 'marca' | 'reputacao';
  oposto: string;
  /** 0 a 100 */
  herdavel: number;
  /** muda a vontade de fazer uma interação: 1,5 = +50% */
  pesos: Array<{ interacao: string; mult: number }>;
  /** opinião sobre quem tem outro traço ("" = o mesmo) */
  afinidades: Array<{ traco: string; pontos: number }>;
  humor: number;
  estresse: number;
  /** ajustes enquanto tem o traço (força +10, sanidade -5...) */
  ajustes?: Array<{ campo: string; valor: number }>;
  /** surge sozinho quando isto vale (sobre a própria pessoa) */
  surge: Condicao[];
  /** chance por ano de surgir quando a condição vale (0 a 100) */
  chanceSurge: number;
}

export function tracoRegras(t: TracoForm): string {
  const L = [`traço ${q(t.nome.trim() || 'Traço')}${t.feminino.trim() && t.feminino.trim() !== t.nome.trim() ? ` ${q(t.feminino.trim())}` : ''}:`];
  if (t.desc.trim()) L.push(`  descrição ${q(t.desc.trim())}`);
  L.push(`  categoria ${t.categoria}`);
  if (t.oposto.trim()) L.push(`  oposto ${q(t.oposto.trim())}`);
  if (t.herdavel > 0) L.push(`  herdável ${Math.round(t.herdavel)}%`);
  for (const p of t.pesos) {
    if (!p.interacao) continue;
    const pct = Math.round((p.mult - 1) * 100);
    L.push(`  peso ${p.interacao} ${p.mult === 0 ? '* 0' : pct >= 0 ? `+${pct}%` : `-${-pct}%`}`);
  }
  for (const a of t.afinidades) L.push(`  afinidade ${a.traco.trim() ? `${q(a.traco.trim())} ` : ''}${a.pontos >= 0 ? '+' : ''}${a.pontos}`);
  if (t.humor) L.push(`  humor ${t.humor >= 0 ? '+' : ''}${t.humor}`);
  if (t.estresse) L.push(`  estresse ${t.estresse >= 0 ? '+' : ''}${t.estresse}`);
  for (const a of t.ajustes ?? []) if (a.campo.trim() && a.valor) L.push(`  ajuste ${campoTxt(fold(a.campo.trim()))} ${a.valor >= 0 ? '+' : ''}${a.valor}`);
  if (t.surge.length) {
    L.push(`  surge onde ${t.surge.map((c) => cond(c, { a: 'isto', b: 'isto' })).join(' e ')}`);
    L.push(`  chance ${Math.max(1, Math.min(100, Math.round(t.chanceSurge)))}%`);
  }
  return `${L.join('\n')}\n`;
}

export interface AtributoForm {
  nome: string;
  min: number;
  max: number;
  media: number;
  desvio: number;
  /** 0 a 100 */
  herdavel: number;
  categoria: string;
  porAno: number;
  desc: string;
  /** só estas espécies têm (vazio = todos) */
  so?: string[];
}

export function atributoRegras(a: AtributoForm): string {
  const L = [`atributo ${q(a.nome.trim() || 'Atributo')}:`, `  faixa ${a.min} a ${a.max}`, `  média ${a.media}`, `  desvio ${a.desvio}`];
  if (a.herdavel > 0) L.push(`  herdável ${Math.round(a.herdavel)}%`);
  if (a.categoria.trim()) L.push(`  categoria ${q(a.categoria.trim())}`);
  if (a.porAno) L.push(`  por ano ${a.porAno >= 0 ? '+' : ''}${a.porAno}`);
  if (a.desc.trim()) L.push(`  descrição ${q(a.desc.trim())}`);
  const so = (a.so ?? []).filter((x) => x.trim());
  if (so.length) L.push(`  só para ${so.map((x) => q(x.trim())).join(', ')}`);
  return `${L.join('\n')}\n`;
}

export interface EspecieForm {
  nome: string;
  plural: string;
  criatura: boolean;
  /** 0 = não diz (usa o padrão) */
  vida: number;
  maioridade: number;
  /** % (100 = como humanos) */
  fertilidade: number;
  gestacao: number;
  altura: number;
  ajustes: Array<{ campo: string; valor: number }>;
  tracos: string[];
  /** traços que cada um pode ter (chance em %) */
  talvez?: Array<{ traco: string; pct: number }>;
  cruzas: Array<{ com: string; gera: string }>;
  /** % dos figurantes */
  frequencia: number;
  desc: string;
}

export function especieRegras(e: EspecieForm): string {
  const nome = e.nome.trim() || 'Espécie';
  const L = [`${e.criatura ? 'criatura' : 'espécie'} ${q(nome)}${e.plural.trim() ? ` ${q(e.plural.trim())}` : ''}:`];
  if (e.desc.trim()) L.push(`  descrição ${q(e.desc.trim())}`);
  if (e.vida > 0) L.push(`  vida ${e.vida}`);
  if (e.maioridade > 0) L.push(`  maioridade ${e.maioridade}`);
  if (e.fertilidade > 0 && e.fertilidade !== 100) L.push(`  fertilidade ${e.fertilidade}%`);
  if (e.gestacao > 0 && e.gestacao !== 9) L.push(`  gestação ${e.gestacao} meses`);
  if (e.altura > 0) L.push(`  altura ${e.altura}`);
  for (const a of e.ajustes) if (a.campo.trim() && a.valor) L.push(`  ${campoTxt(fold(a.campo.trim()))} ${a.valor >= 0 ? '+' : ''}${a.valor}`);
  if (e.tracos.length) L.push(`  traços ${e.tracos.map(q).join(', ')}`);
  const tv = (e.talvez ?? []).filter((x) => x.traco.trim());
  if (tv.length) L.push(`  pode ter ${tv.map((x) => `${q(x.traco.trim())} ${Math.max(0, Math.min(100, Math.round(x.pct)))}%`).join(', ')}`);
  for (const c of e.cruzas) if (c.com.trim()) L.push(`  cruza com ${q(c.com.trim())}${c.gera.trim() ? ` gera ${q(c.gera.trim())}` : ''}`);
  if (e.frequencia > 0) L.push(`  frequência ${e.frequencia}%`);
  if (L.length === 1) L.push('  vida 70');
  return `${L.join('\n')}\n`;
}

export interface ProfissaoForm {
  nome: string;
  feminino: string;
  renda: number;
  habilidade: 'combate' | 'labia' | 'intriga' | 'oficio' | 'saber';
  status: number;
  /** % de acidente por mês */
  risco: number;
  viaja: boolean;
  requer: Condicao[];
}

export function profissaoRegras(p: ProfissaoForm): string {
  const L = [`profissão ${q(p.nome.trim() || 'Profissão')}${p.feminino.trim() && p.feminino.trim() !== p.nome.trim() ? ` ${q(p.feminino.trim())}` : ''}:`,
    `  renda ${p.renda}`, `  habilidade ${p.habilidade}`, `  status ${p.status}`];
  if (p.risco > 0) L.push(`  risco ${p.risco}%`);
  if (p.viaja) L.push('  viaja');
  if (p.requer.length) L.push(`  requer ${p.requer.map((c) => cond(c, { a: 'isto', b: 'isto' })).join(' e ')}`);
  return `${L.join('\n')}\n`;
}

export interface ItemForm {
  nome: string;
  unico: boolean;
  tipo: string;
  raridade: string;
  valor: number;
  desc: string;
  ajustes: Array<{ campo: string; valor: number }>;
  porMes: Array<{ campo: string; valor: number }>;
  tracos: string[];
  /** quem tem no começo (nome) */
  dono: string;
  /** onde está largado, se ninguém tem */
  lugar: string;
  cobicado: boolean;
  aoGanhar: { efeitos: Consequencia[]; cronica: string };
  aoPerder: { efeitos: Consequencia[]; cronica: string };
  todoMes: { efeitos: Consequencia[]; cronica: string; condicoes: Condicao[] };
}

export function itemRegras(it: ItemForm): string {
  const D: Record<Quem, string> = { a: 'dono', b: 'dono' };
  const L = [`item ${q(it.nome.trim() || 'Item')}:`];
  if (it.unico) L.push('  único');
  if (it.tipo.trim()) L.push(`  tipo ${q(it.tipo.trim())}`);
  if (it.raridade.trim()) L.push(`  raridade ${q(it.raridade.trim())}`);
  L.push(`  valor ${it.valor}`);
  if (it.desc.trim()) L.push(`  descrição ${q(it.desc.trim())}`);
  if (it.cobicado) L.push('  cobiçado');
  if (it.dono.trim()) L.push(`  dono ${q(it.dono.trim())}`);
  else if (it.lugar.trim()) L.push(`  em ${q(it.lugar.trim())}`);
  for (const a of it.ajustes) if (a.campo.trim() && a.valor) L.push(`  ${campoTxt(fold(a.campo.trim()))} ${a.valor >= 0 ? '+' : ''}${a.valor}`);
  for (const a of it.porMes) if (a.campo.trim() && a.valor) L.push(`  por mês ${campoTxt(fold(a.campo.trim()))} ${a.valor >= 0 ? '+' : ''}${a.valor}`);
  if (it.tracos.length) L.push(`  traços ${it.tracos.map(q).join(', ')}`);
  const bloco = (cab: string, b: { efeitos: Consequencia[]; cronica: string; condicoes?: Condicao[] }) => {
    if (!b.efeitos.length && !b.cronica.trim()) return;
    L.push(`  ${cab}:`);
    let ind = '    ';
    if (b.condicoes?.length) {
      L.push(`    se ${b.condicoes.map((c) => cond(c, D)).join(' e ')}:`);
      ind = '      ';
    }
    for (const e of b.efeitos) L.push(...efeito(e, D, ind));
    if (b.cronica.trim()) L.push(`${ind}crônica ${q(texto(b.cronica, D))}`);
  };
  bloco('ao ganhar', it.aoGanhar);
  bloco('ao perder', it.aoPerder);
  bloco('todo mês', it.todoMes);
  return `${L.join('\n')}\n`;
}

export interface EventoForm {
  nome: string;
  desc: string;
  /** % por ano (0 = só à mão) */
  chance: number;
  dura: number;
  global: boolean;
  pesos: Array<{ interacao: string; mult: number }>;
  aoComecar: string;
  aoAcabar: string;
  /** todo mês, para cada pessoa no lugar */
  todoMes: { efeitos: Consequencia[]; cronica: string; condicoes: Condicao[] };
}

export function eventoRegras(ev: EventoForm): string {
  const P: Record<Quem, string> = { a: 'personagem', b: 'personagem' };
  const L = [`evento ${q(ev.nome.trim() || 'Evento')}:`];
  if (ev.desc.trim()) L.push(`  descrição ${q(ev.desc.trim())}`);
  if (ev.chance > 0) L.push(`  chance ${Math.min(100, ev.chance)}%`);
  L.push(`  dura ${Math.max(1, Math.round(ev.dura))} meses`);
  if (ev.global) L.push('  global');
  for (const p of ev.pesos) {
    if (!p.interacao) continue;
    const pct = Math.round((p.mult - 1) * 100);
    L.push(`  peso ${p.interacao} ${p.mult === 0 ? '* 0' : pct >= 0 ? `+${pct}%` : `-${-pct}%`}`);
  }
  if (ev.aoComecar.trim()) L.push('  ao começar:', `    crônica ${q(ev.aoComecar.trim())}`);
  const m = ev.todoMes;
  if (m.efeitos.length || m.cronica.trim()) {
    L.push('  todo mês:');
    let ind = '    ';
    if (m.condicoes.length) {
      L.push(`    se ${m.condicoes.map((c) => cond(c, P)).join(' e ')}:`);
      ind = '      ';
    }
    for (const e of m.efeitos) L.push(...efeito(e, P, ind));
    if (m.cronica.trim()) L.push(`${ind}crônica ${q(texto(m.cronica, P))}`);
  }
  if (ev.aoAcabar.trim()) L.push('  ao acabar:', `    crônica ${q(ev.aoAcabar.trim())}`);
  return `${L.join('\n')}\n`;
}

/** "{a} canta para {b}" → com os nomes das partes. */
function texto(t: string, nomes: Record<Quem, string>): string {
  return t.replace(/\{a\}/g, `{${nomes.a}}`).replace(/\{b\}/g, `{${nomes.b}}`);
}

// ------------------------------------------------------------------ receitas

export interface Receita {
  nome: string;
  desc: string;
  codigo: string;
}

/** Mecânicas prontas: um clique e entram nas regras do mundo. Servem também de exemplo da linguagem. */
export const RECEITAS: Receita[] = [
  {
    nome: 'Relíquia amaldiçoada (item)',
    desc: 'Um anel único que dá lábia e poder, mas corrói a saúde e o humor; ladrões o cobiçam e ele passa de mão em mão.',
    codigo: `item "Anel do Rei Morto":
  único
  tipo joia
  raridade lendária
  valor 800
  cobiçado
  descrição "Frio ao toque, quente na ganância."
  lábia +5
  intriga +3
  por mês humor -2
  por mês saúde -0.5
  traços "ganancioso"
  ao ganhar:
    crônica "{dono} põe o anel no dedo e sente {o mundo inteiro|cada moeda da cidade|a cobiça dos vizinhos} {dono:o/a} observando."
  ao perder:
    dono.humor += 20
    crônica "Sem o anel, {dono} dorme a noite inteira pela primeira vez em anos."
`,
  },
  {
    nome: 'Festival da colheita (evento)',
    desc: 'Todo ano há chance de um festival num lugar: mais conversa, flerte e bebida, humor lá em cima.',
    codigo: `evento "Festival da Colheita":
  chance 60%
  dura 1 meses
  descrição "barracas, música e vinho novo"
  peso flertar +100%
  peso conversar +50%
  peso beber +100%
  todo mês:
    personagem.humor += 10
  ao acabar:
    crônica "{As barracas são desmontadas|Sobram garrafas vazias e corações partidos} em {lugar}."
`,
  },
  {
    nome: 'Conspiração (trama)',
    desc: 'Quem odeia alguém trama em etapas: junta aliados, espalha boatos, ataca. Pode ser descoberto no meio do caminho.',
    codigo: `trama "Conspiração" entre a em personagem, b em personagem onde a.adulto e ódio(a, b) > 50 e não trama(a):
  atração = ódio(a, b)
  chance = 20%
  etapa "Juramento":
    dura 3 meses
    relação(a, b).conspira = sim
    crônica "{a} jura, em silêncio, que {b} vai pagar."
  etapa "Boatos":
    dura 4 meses
    se a.intriga + dado("1d10") < 6:
      crônica "{b} descobre os boatos que {a} anda espalhando."
      relação(b, a).afeto -= 30
      falhar
    b.humor -= 15
    crônica "Boatos sobre {b} correm a cidade. Ninguém sabe de onde vieram."
  etapa "Golpe":
    se chance(50%):
      lutar(a, b, "emboscada")
      concluir "{a} finalmente acerta as contas com {b}."
    repetir
  ao falhar:
    a.estresse += 20
`,
  },
  {
    nome: 'Elfos e meio-elfos',
    desc: 'Uma espécie longeva, que só é adulta aos 100 anos, tem poucos filhos e, com humanos, gera meio-elfos.',
    codigo: `espécie "Elfo" "Elfos":
  vida 700
  maioridade 100
  fertilidade 30%
  gestação 12 meses
  altura 185
  beleza +15
  intelecto +10
  cruza com "Humano" gera "Meio-elfo"
  frequência 15%

espécie "Meio-elfo" "Meios-elfos":
  vida 180
  maioridade 20
  beleza +8
`,
  },
  {
    nome: 'Lobos na floresta (criatura)',
    desc: 'Lobos vivem entre os figurantes, se reproduzem entre si e atacam gente sozinha, sobretudo crianças.',
    codigo: `criatura "Lobo" "Lobos":
  vida 13
  maioridade 2
  gestação 2 meses
  fertilidade 200%
  força +10
  frequência 8%

interação "Ataque de lobo" entre a em personagem, b em personagem onde a.espécie = "Lobo" e b.espécie != "Lobo":
  atração = 1 + (100 - b.força) / 25
  chance = 25%
  lutar(a, b, "emboscada")
  lembrar(b, a, "me atacou", -40)
  crônica "Um lobo ataca {b} na beira da estrada."
`,
  },
  {
    nome: 'Sanidade e loucura',
    desc: 'Um atributo (sanidade) que cai com o estresse; abaixo de 20, a pessoa enlouquece e assusta os vizinhos.',
    codigo: `atributo "Sanidade":
  faixa 0 a 100
  média 75
  desvio 12
  herdável 30%
  categoria mental

quando mês em personagem onde personagem.estresse > 70:
  personagem.sanidade -= 1

traço "Louco" "Louca":
  descrição "Ouve vozes que ninguém mais ouve."
  categoria adquirido
  peso conversar -50%
  peso insultar +100%
  afinidade "" +5
  surge onde isto.sanidade < 20
  chance 60%

interação "Delírio" entre a em personagem, b em personagem onde traço(a, "louco"):
  chance = 30%
  relação(b, a).confiança -= 15
  crônica "{a} grita com {b} sobre coisas que só {a} vê."
`,
  },
  {
    nome: 'Serenata',
    desc: 'Quem gosta de música canta para quem ama; a atração sobe (ou o vexame vira piada).',
    codigo: `interação "Serenata" entre a em personagem, b em personagem onde a.gostos tem "música" e atração(a, b) > 50 e não a.comprometido:
  atração = atração(a, b)
  chance = 20%
  se chance(60%):
    relação(b, a).atração += 15
    crônica "{a} faz uma serenata para {b} debaixo da janela. Funciona."
  senão:
    a.humor -= 10
    crônica "{a} desafina na serenata para {b}; a vila inteira ri."
`,
  },
  {
    nome: 'Vendeta de família',
    desc: 'Quando alguém é assassinado e o crime vem à tona, os filhos adultos juram vingança.',
    codigo: `quando assassinato(assassino, vítima):
  para cada f em vítima.filhos onde f.adulto:
    lembrar(f, assassino, "matou meu pai ou minha mãe", -80)
    meta(f, "vinganca", assassino)
    crônica "{f} jura vingar a morte de {vítima}."
`,
  },
  {
    nome: 'Casamento arranjado',
    desc: 'Pais nobres casam filhos solteiros com outra família nobre, gostem eles ou não.',
    codigo: `interação "Casamento arranjado" entre a em personagem, b em personagem onde a.adulto e b.adulto e não a.comprometido e não b.comprometido e a.profissão = "nobre" e b.profissão = "nobre" e a.família != b.família:
  chance = 15%
  casar(a, b)
  relação(a, b).afeto -= 10
  relação(b, a).afeto -= 10
  crônica "As famílias de {a} e {b} acertam o casamento dos dois."
`,
  },
  {
    nome: 'Inveja da riqueza',
    desc: 'Quem é ganancioso e pobre passa a odiar o vizinho rico.',
    codigo: `interação "Inveja" entre a em personagem, b em personagem onde traço(a, "ganancioso") e a.dinheiro < 10 e b.dinheiro > 60:
  chance = 25%
  relação(a, b).afeto -= 15
  crônica "{a} não suporta ver {b} contando moedas."
`,
  },
  {
    nome: 'Bruxaria',
    desc: 'Um traço novo (Bruxa) que surge em quem estuda muito e é cínico; bruxas lançam maldições em rivais.',
    codigo: `traço "Bruxo" "Bruxa":
  descrição "Mexe com forças que ninguém entende."
  herdável 30%
  afinidade "devoto" -20
  surge onde isto.saber > 10 e traço(isto, "cinico")
  chance 25%

interação "Maldição" entre a em personagem, b em personagem onde traço(a, "bruxo") e a.rivais tem b:
  chance = 30%
  b.saúde -= 25
  ganhar(b, "melancolico")
  crônica "{a} lança uma maldição sobre {b}; a saúde de {b} definha."
`,
  },
  {
    nome: 'Herança disputada',
    desc: 'Quando alguém rico morre, irmãos que não se gostam brigam pela herança.',
    codigo: `quando morte(morto) onde morto.dinheiro > 0 ou contar(morto.filhos) > 1:
  para cada a em morto.filhos onde a.adulto:
    para cada b em morto.filhos onde b.adulto e opinião(a, b) < 0:
      relação(a, b).afeto -= 20
      crônica "{a} e {b} brigam pela herança de {morto}."
      parar
`,
  },
  {
    nome: 'Febre que pega',
    desc: 'Doença contagiosa: quem está doente passa para quem está perto.',
    codigo: `interação "Contágio" entre a em personagem, b em personagem onde a.saúde < 40 e b.saúde > 40:
  chance = 30%
  b.saúde -= 20
  crônica "{b} pega a febre de {a}."
`,
  },
  {
    nome: 'Rito de passagem',
    desc: 'Na maioridade, cada jovem passa por uma prova; quem passa ganha coragem, quem falha fica tímido.',
    codigo: `quando maioridade(pessoa):
  se dado("1d20") + pessoa.combate > 12:
    ganhar(pessoa, "corajoso")
    crônica "{pessoa} passa no rito de passagem e é recebido como adulto."
  senão:
    ganhar(pessoa, "timido")
    crônica "{pessoa} falha no rito de passagem, e a vergonha fica."
`,
  },
  {
    nome: 'Alquimista',
    desc: 'Uma profissão nova: rende bem, exige saber, e às vezes explode.',
    codigo: `profissão "Alquimista":
  renda 12
  habilidade saber
  status 3
  risco 1%
  requer isto.saber pelo menos 6
`,
  },
  {
    nome: 'Ciúme doentio',
    desc: 'Ciumentos vigiam o par e brigam com quem chega perto demais.',
    codigo: `interação "Ciúme" entre a em personagem, b em personagem onde traço(a, "ciumento") e a.parceiro != vazio e atração(b, a.parceiro) > 50:
  chance = 35%
  relação(a, b).afeto -= 20
  se traço(a, "irascivel"):
    lutar(a, b, "briga")
  crônica "{a} encara {b}: \\"fica longe de quem é meu\\"."
`,
  },
];
