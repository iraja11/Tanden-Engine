/*
 * Construtor de mecânicas: em vez de escrever regras do zero, a pessoa monta
 * uma mecânica por partes (quem, quando, com que chance, o que acontece) e o
 * Tanden escreve o bloco ```regras. O texto gerado é a mesma linguagem de
 * sempre: dá para abrir a nota e ajustar à mão depois.
 */

export type Quem = 'a' | 'b';

export type Condicao =
  | { k: 'traco'; quem: Quem; traco: string; nao?: boolean }
  | { k: 'opiniao' | 'atracao' | 'confianca' | 'intimidade'; de: Quem; op: '>' | '<'; valor: number }
  | { k: 'idade'; quem: Quem; op: '>' | '<'; valor: number }
  | { k: 'vinculo'; vinc: 'casados' | 'namoro' | 'amantes' | 'amigos' | 'rivais' | 'inimigos' | 'parentes'; nao?: boolean }
  | { k: 'comprometido' | 'gravida' | 'adulto'; quem: Quem; nao?: boolean }
  | { k: 'profissao'; quem: Quem; prof: string; nao?: boolean }
  | { k: 'gosto'; quem: Quem; gosto: string }
  | { k: 'campo'; quem: Quem; campo: string; op: '>' | '<' | '=' | '!='; valor: string }
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
  | { k: 'disparar'; evento: string }
  | { k: 'livre'; codigo: string };

export interface Mecanica {
  /** interação entre duas pessoas, acontecimento de uma pessoa só, ou reação a um evento */
  tipo: 'par' | 'solo' | 'reacao';
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

const id = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
const valor = (v: string) => (/^-?\d+(?:[.,]\d+)?$/.test(v.trim()) ? v.trim().replace(',', '.') : /^(sim|não|nao|vazio|verdadeiro|falso)$/i.test(v.trim()) ? v.trim() : q(v));

function cond(c: Condicao, nomes: Record<Quem, string>): string {
  const n = (x: Quem) => nomes[x];
  const o = (x: Quem) => nomes[x === 'a' ? 'b' : 'a'];
  switch (c.k) {
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
    case 'campo': return [`${ind}${n(e.quem)}.${id(e.campo)} ${e.op} ${valor(e.valor)}`];
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
