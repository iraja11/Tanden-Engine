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
  /** vínculo entre os dois: os de fábrica, `parentes`, ou um inventado pelo mundo (pelo nome) */
  | { k: 'vinculo'; vinc: string; nao?: boolean }
  | { k: 'sexo'; quem: Quem; sexo: 'f' | 'm' }
  | { k: 'etnia'; quem: Quem; etnia: string; nao?: boolean }
  | { k: 'faccao'; quem: Quem; faccao: string; nao?: boolean }
  /** os dois são do mesmo povo / da mesma facção (ou não) */
  | { k: 'mesma'; o: 'etnia' | 'faccao'; nao?: boolean }
  | { k: 'faixa'; quem: Quem; de: number; ate: number }
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
  /** liga ou desfaz um vínculo entre os dois (de fábrica ou do mundo) */
  | { k: 'vincular' | 'desvincular'; vinculo: string }
  /** um estado que passa (sapo, preso, amaldiçoado...) por alguns meses */
  | { k: 'estado'; quem: Quem; estado: string; meses: number }
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
  /** fantasia, comico, adulto, serio: o mundo regula quanto quer de cada um */
  tom?: string;
}

/** Para quem vale: vira a linha `para ...` das regras. Vazio = todo mundo. */
export interface PublicoForm {
  especies: string[];
  etnias: string[];
  sexo: '' | 'f' | 'm';
  /** 0 = sem limite */
  idadeMin: number;
  idadeMax: number;
  faccoes: string[];
}
export const publicoVazio = (): PublicoForm => ({ especies: [], etnias: [], sexo: '', idadeMin: 0, idadeMax: 0, faccoes: [] });

/** `para espécie "Elfo" e sexo feminino e idade 16 a 60` (ou nada). */
export function publicoRegras(f: PublicoForm | undefined, ind = '  '): string[] {
  if (!f) return [];
  const partes: string[] = [];
  const lista = (l: string[]) => l.map((x) => q(x.trim())).join(', ');
  if (f.especies.filter((x) => x.trim()).length) partes.push(`espécie ${lista(f.especies.filter((x) => x.trim()))}`);
  if (f.etnias.filter((x) => x.trim()).length) partes.push(`etnia ${lista(f.etnias.filter((x) => x.trim()))}`);
  if (f.faccoes.filter((x) => x.trim()).length) partes.push(`facção ${lista(f.faccoes.filter((x) => x.trim()))}`);
  if (f.sexo) partes.push(`sexo ${f.sexo === 'f' ? 'feminino' : 'masculino'}`);
  if (f.idadeMin > 0 && f.idadeMax > 0) partes.push(`idade ${f.idadeMin} a ${f.idadeMax}`);
  else if (f.idadeMin > 0) partes.push(`idade > ${f.idadeMin - 1}`);
  else if (f.idadeMax > 0) partes.push(`idade até ${f.idadeMax}`);
  return partes.length ? [`${ind}para ${partes.join(' e ')}`] : [];
}

/** Os tons do acaso, como se escrevem nas regras. */
export const TONS_REGRAS: Array<{ id: string; nome: string }> = [
  { id: '', nome: 'sem tom' }, { id: 'fantasia', nome: '✨ fantasia' }, { id: 'cômico', nome: '🤡 cômico' }, { id: 'adulto', nome: '🔥 adulto' }, { id: 'sério', nome: '⚖ sério' },
];

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
      if (['namoro', 'amantes', 'amigos', 'rivais', 'inimigos'].includes(c.vinc)) return `${n('a')}.${c.vinc} ${c.nao ? 'não tem' : 'tem'} ${n('b')}`;
      return `${c.nao ? 'não ' : ''}vínculo(${n('a')}, ${n('b')}, ${q(c.vinc)})`;
    case 'sexo': return `${n(c.quem)}.sexo = ${q(c.sexo === 'f' ? 'feminino' : 'masculino')}`;
    case 'etnia': return `${n(c.quem)}.etnia ${c.nao ? '!=' : '='} ${q(c.etnia)}`;
    case 'faccao': return `${n(c.quem)}.facção ${c.nao ? '!=' : '='} ${q(c.faccao)}`;
    case 'mesma': return `${n('a')}.${c.o === 'etnia' ? 'etnia' : 'facção'} ${c.nao ? '!=' : '='} ${n('b')}.${c.o === 'etnia' ? 'etnia' : 'facção'}`;
    case 'faixa': return `${n(c.quem)}.idade pelo menos ${c.de} e ${n(c.quem)}.idade no máximo ${c.ate}`;
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
    case 'vincular': return [`${ind}vincular(${n('a')}, ${n('b')}, ${q(e.vinculo)})`];
    case 'desvincular': return [`${ind}desvincular(${n('a')}, ${n('b')}, ${q(e.vinculo)})`];
    case 'estado': return [`${ind}estado(${n(e.quem)}, ${q(e.estado)}, ${Math.max(1, Math.round(e.meses))})`];
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
  if (m.tom?.trim()) linhas.push(`${ind}tom ${m.tom.trim()}`);
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
  if (m.tom?.trim()) L.push(`${I}tom ${m.tom.trim()}`);
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
  /** quem pode ter (espécie, povo, sexo, idade, facção) */
  publico?: PublicoForm;
  /** % de chance de nascer com o traço (para quem passa no filtro) */
  nasce?: number;
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
  if (t.nasce) L.push(`  nasce com ${Math.max(1, Math.min(100, Math.round(t.nasce)))}%`);
  L.push(...publicoRegras(t.publico));
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
  publico?: PublicoForm;
}

export function atributoRegras(a: AtributoForm): string {
  const L = [`atributo ${q(a.nome.trim() || 'Atributo')}:`, `  faixa ${a.min} a ${a.max}`, `  média ${a.media}`, `  desvio ${a.desvio}`];
  if (a.herdavel > 0) L.push(`  herdável ${Math.round(a.herdavel)}%`);
  if (a.categoria.trim()) L.push(`  categoria ${q(a.categoria.trim())}`);
  if (a.porAno) L.push(`  por ano ${a.porAno >= 0 ? '+' : ''}${a.porAno}`);
  if (a.desc.trim()) L.push(`  descrição ${q(a.desc.trim())}`);
  const so = (a.so ?? []).filter((x) => x.trim());
  if (so.length) L.push(`  só para ${so.map((x) => q(x.trim())).join(', ')}`);
  L.push(...publicoRegras(a.publico));
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
  publico?: PublicoForm;
}

export function profissaoRegras(p: ProfissaoForm): string {
  const L = [`profissão ${q(p.nome.trim() || 'Profissão')}${p.feminino.trim() && p.feminino.trim() !== p.nome.trim() ? ` ${q(p.feminino.trim())}` : ''}:`,
    `  renda ${p.renda}`, `  habilidade ${p.habilidade}`, `  status ${p.status}`];
  if (p.risco > 0) L.push(`  risco ${p.risco}%`);
  if (p.viaja) L.push('  viaja');
  if (p.requer.length) L.push(`  requer ${p.requer.map((c) => cond(c, { a: 'isto', b: 'isto' })).join(' e ')}`);
  L.push(...publicoRegras(p.publico));
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
  tom?: string;
  publico?: PublicoForm;
}

export function eventoRegras(ev: EventoForm): string {
  const P: Record<Quem, string> = { a: 'personagem', b: 'personagem' };
  const L = [`evento ${q(ev.nome.trim() || 'Evento')}:`];
  if (ev.desc.trim()) L.push(`  descrição ${q(ev.desc.trim())}`);
  if (ev.chance > 0) L.push(`  chance ${Math.min(100, ev.chance)}%`);
  L.push(`  dura ${Math.max(1, Math.round(ev.dura))} meses`);
  if (ev.global) L.push('  global');
  if (ev.tom?.trim()) L.push(`  tom ${ev.tom.trim()}`);
  L.push(...publicoRegras(ev.publico));
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

export interface EtniaForm {
  nome: string;
  plural: string;
  desc: string;
  especie: string;
  /** cor dos olhos e do cabelo mais comuns (com %) */
  olhos: Array<{ cor: string; pct: number }>;
  cabelo: Array<{ cor: string; pct: number }>;
  altura: number;
  ajustes: Array<{ campo: string; valor: number }>;
  nomesM: string;
  nomesF: string;
  sobrenomes: string;
  tracos: string[];
  talvez: Array<{ traco: string; pct: number }>;
  gostos: string;
  /** % dos figurantes */
  frequencia: number;
  /** opinião sobre outros povos ("" = o próprio) */
  afinidades: Array<{ etnia: string; pontos: number }>;
}

const listaTxt = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);

export function etniaRegras(e: EtniaForm): string {
  const nome = e.nome.trim() || 'Povo';
  const L = [`etnia ${q(nome)}${e.plural.trim() ? ` ${q(e.plural.trim())}` : ''}:`];
  if (e.desc.trim()) L.push(`  descrição ${q(e.desc.trim())}`);
  if (e.especie.trim()) L.push(`  espécie ${q(e.especie.trim())}`);
  const cores = (l: Array<{ cor: string; pct: number }>) => l.filter((x) => x.cor.trim()).map((x) => `${q(x.cor.trim())} ${Math.max(1, Math.min(100, Math.round(x.pct)))}%`).join(', ');
  if (cores(e.olhos)) L.push(`  olhos ${cores(e.olhos)}`);
  if (cores(e.cabelo)) L.push(`  cabelo ${cores(e.cabelo)}`);
  if (e.altura) L.push(`  altura ${e.altura >= 0 ? '+' : ''}${e.altura}`);
  for (const a of e.ajustes) if (a.campo.trim() && a.valor) L.push(`  ${campoTxt(fold(a.campo.trim()))} ${a.valor >= 0 ? '+' : ''}${a.valor}`);
  if (listaTxt(e.nomesM).length) L.push(`  nomes ${listaTxt(e.nomesM).map(q).join(', ')}`);
  if (listaTxt(e.nomesF).length) L.push(`  nomes femininos ${listaTxt(e.nomesF).map(q).join(', ')}`);
  if (listaTxt(e.sobrenomes).length) L.push(`  sobrenomes ${listaTxt(e.sobrenomes).map(q).join(', ')}`);
  if (e.tracos.length) L.push(`  traços ${e.tracos.map(q).join(', ')}`);
  const tv = e.talvez.filter((x) => x.traco.trim());
  if (tv.length) L.push(`  pode ter ${tv.map((x) => `${q(x.traco.trim())} ${Math.max(0, Math.min(100, Math.round(x.pct)))}%`).join(', ')}`);
  if (listaTxt(e.gostos).length) L.push(`  gostos ${listaTxt(e.gostos).map(q).join(', ')}`);
  if (e.frequencia > 0) L.push(`  frequência ${e.frequencia}%`);
  for (const a of e.afinidades) if (a.pontos) L.push(`  afinidade ${a.etnia.trim() ? `${q(a.etnia.trim())} ` : ''}${a.pontos >= 0 ? '+' : ''}${a.pontos}`);
  if (L.length === 1) L.push('  frequência 0%');
  return `${L.join('\n')}\n`;
}

export interface VinculoForm {
  nome: string;
  desc: string;
  simbolo: string;
  /** papéis diferentes (mentor/aprendiz); vazio = os dois iguais */
  papelA: string;
  papelB: string;
  secreto: boolean;
  exclusivo: boolean;
  romantico: boolean;
  opiniao: number;
  pesos: Array<{ interacao: string; mult: number }>;
  porMes: Array<{ eixo: string; valor: number }>;
  /** surge sozinho entre `a` e `b` quando isto vale (vazio = só à mão ou pelas regras) */
  surge: Condicao[];
  chance: number;
  acaba: Condicao[];
  publico?: PublicoForm;
  aoFormar: { efeitos: Consequencia[]; cronica: string };
  aoAcabar: { efeitos: Consequencia[]; cronica: string };
}

export function vinculoRegras(v: VinculoForm): string {
  const N: Record<Quem, string> = { a: 'a', b: 'b' };
  const L = [`vínculo ${q(v.nome.trim() || 'Vínculo')}:`];
  if (v.desc.trim()) L.push(`  descrição ${q(v.desc.trim())}`);
  if (v.simbolo.trim()) L.push(`  símbolo ${v.simbolo.trim()}`);
  if (v.papelA.trim() && v.papelB.trim()) L.push(`  papéis ${q(v.papelA.trim())}, ${q(v.papelB.trim())}`);
  if (v.secreto) L.push('  secreto');
  if (v.exclusivo) L.push('  exclusivo');
  if (v.romantico) L.push('  romântico');
  if (v.opiniao) L.push(`  opinião ${v.opiniao >= 0 ? '+' : ''}${v.opiniao}`);
  for (const p of v.pesos) {
    if (!p.interacao) continue;
    const pct = Math.round((p.mult - 1) * 100);
    L.push(`  peso ${p.interacao} ${p.mult === 0 ? '* 0' : pct >= 0 ? `+${pct}%` : `-${-pct}%`}`);
  }
  for (const m of v.porMes) if (m.eixo.trim() && m.valor) L.push(`  por mês ${m.eixo.trim()} ${m.valor >= 0 ? '+' : ''}${m.valor}`);
  if (v.surge.length) {
    L.push(`  surge onde ${v.surge.map((c) => cond(c, N)).join(' e ')}`);
    L.push(`  chance ${Math.max(1, Math.min(100, Math.round(v.chance)))}%`);
  }
  if (v.acaba.length) L.push(`  acaba onde ${v.acaba.map((c) => cond(c, N)).join(' e ')}`);
  L.push(...publicoRegras(v.publico));
  for (const [cab, b] of [['ao formar', v.aoFormar], ['ao acabar', v.aoAcabar]] as const) {
    if (!b.efeitos.length && !b.cronica.trim()) continue;
    L.push(`  ${cab}:`);
    for (const e of b.efeitos) L.push(...efeito(e, N, '    '));
    if (b.cronica.trim()) L.push(`    crônica ${q(texto(b.cronica, N))}`);
  }
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
    nome: 'Povos do Norte e do Sul (etnias)',
    desc: 'Dois povos com nomes, aparência, gostos e um velho preconceito um contra o outro. Os figurantes chegam em famílias de cada povo.',
    codigo: `etnia "Nórdico" "Nórdicos":
  descrição "Gente do gelo, do mar e das sagas."
  olhos "azul" 60%, "verde" 20%
  cabelo "loiro" 55%, "ruivo" 15%
  altura +6
  força +5
  nomes "Bjorn", "Erik", "Ulf", "Ragnar", "Leif"
  nomes femininos "Astrid", "Sigrid", "Freya", "Ingrid", "Solveig"
  sobrenomes "Ragnarsson", "Eriksdottir", "Ulfsson"
  pode ter "corajoso" 25%
  gostos "o mar", "histórias"
  frequência 40%
  afinidade +10
  afinidade "Sulista" -20

etnia "Sulista" "Sulistas":
  descrição "Mercadores do deserto e das cidades de pedra branca."
  olhos "castanho" 85%
  cabelo "escuro" 90%
  nomes "Amir", "Tariq", "Samir", "Idris"
  nomes femininos "Leila", "Zara", "Yasmin", "Nadia"
  sobrenomes "al-Rashid", "ibn Faruq"
  pode ter "curioso" 20%
  gostos "astronomia", "culinária"
  frequência 40%
  afinidade +10
  afinidade "Nórdico" -20
`,
  },
  {
    nome: 'Irmãos de sangue (vínculo)',
    desc: 'Amigos muito próximos fazem um juramento de sangue: a opinião sobe, brigas quase somem, e a morte de um fere o outro.',
    codigo: `vínculo "Irmãos de sangue":
  símbolo 🩸
  descrição "Um corte na palma, um juramento para a vida."
  opinião +25
  peso brigar -90%
  peso insultar -70%
  por mês afeto +1
  surge onde a.amigos tem b e opinião(a, b) > 60 e opinião(b, a) > 60
  chance 30%
  ao formar:
    crônica "{a} e {b} cortam as palmas e misturam o sangue à luz da fogueira."

quando morte(morto):
  para cada x em vinculados(morto, "Irmãos de sangue"):
    x.humor -= 40
    x.estresse += 30
    crônica "{x} sente o corte da palma arder no dia em que {morto} morre."
`,
  },
  {
    nome: 'Mentor e aprendiz (vínculo com papéis)',
    desc: 'Gente experiente toma jovens como aprendizes: respeito, habilidade que passa de um para o outro, e um mestre por aprendiz.',
    codigo: `vínculo "Mentor e aprendiz":
  símbolo 🎓
  papéis "mentor", "aprendiz"
  exclusivo
  opinião +10
  por mês respeito +1
  surge onde a.idade > 35 e b.idade >= 14 e b.idade < 22 e a.profissão = b.profissão
  chance 40%
  acaba onde b.idade > 30

quando ano:
  para cada m em personagem:
    para cada x em vinculados(m, "Mentor e aprendiz"):
      se papel(x, m, "Mentor e aprendiz") = "aprendiz":
        x.ofício += 1
`,
  },
  {
    nome: 'Sangue de dragão (traço filtrado)',
    desc: 'Um traço raro, de nascença, que só aparece em mulheres nórdicas: força, temperamento e a cobiça de todos.',
    codigo: `traço "Sangue de dragão" "Sangue de dragão":
  descrição "Os olhos brilham no escuro quando tem raiva."
  categoria congenito
  nasce com 8%
  para etnia "Nórdico" e sexo feminino
  herdável 40%
  ajuste força +12
  peso brigar +60%
  afinidade "" +15
`,
  },
  {
    nome: 'Valquírias (profissão filtrada)',
    desc: 'Uma ordem de guerreiras: só mulheres adultas, bem pagas, com muito prestígio e algum risco.',
    codigo: `profissão "Valquíria":
  renda 14
  habilidade combate
  status 4
  risco 1%
  para sexo feminino e idade 18 a 45
  requer isto.combate pelo menos 6
`,
  },
  {
    nome: 'Bebedeira épica (cômico)',
    desc: 'Na taverna, dois amigos bebem demais e acordam em lugares improváveis. Some se o tom cômico estiver em zero.',
    codigo: `interação "Bebedeira épica" entre a em personagem, b em personagem onde a.amigos tem b e a.adulto e b.adulto:
  tom cômico
  chance = 20%
  a.humor += 10
  b.humor += 10
  relação(a, b).intimidade += 5
  crônica "{a} e {b} bebem até {acordar no telhado da igreja|roubar o sino da capela|batizar uma cabra|declarar guerra a um moinho}."
`,
  },
  {
    nome: 'Lua de Sangue (fantasia)',
    desc: 'Um evento sobrenatural de três meses: os homens ficam agitados, brigam mais, e os sonhos ficam estranhos.',
    codigo: `evento "Lua de Sangue":
  tom fantasia
  chance 8%
  dura 3 meses
  descrição "a lua fica vermelha e os cães uivam a noite inteira"
  peso brigar +80%
  peso flertar +40%
  para sexo masculino e idade 16 a 70
  todo mês:
    personagem.estresse += 4
  ao acabar:
    crônica "A lua volta a ser branca sobre {lugar}. Ninguém fala do que fez naquelas noites."
`,
  },
  {
    nome: 'Amor proibido entre povos (adulto)',
    desc: 'Gente de povos rivais se apaixona às escondidas: um caso secreto que, descoberto, envergonha as duas famílias.',
    codigo: `interação "Amor proibido" entre a em personagem, b em personagem onde a.etnia != b.etnia e atração(a, b) > 55 e atração(b, a) > 40:
  tom adulto
  chance = 15%
  caso(a, b)
  crônica "🤫 Entre povos que se odeiam, {a} e {b} se encontram às escondidas {no celeiro|na beira do rio|na casa abandonada}."
`,
  },
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
