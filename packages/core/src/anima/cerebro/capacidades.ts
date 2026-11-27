/*
 * Capacidades exatas, sem rede: conversão de unidades e contas de calendário.
 * A rede só diz "é sobre converter" ou "é sobre datas"; a resposta é cálculo.
 *
 *   converter("quantos km são 10 milhas")        → 10 milhas = 16,09 km
 *   converter("30 graus celsius em fahrenheit")  → 86 °F
 *   datas("quantos dias faltam pro natal", now)  → 29 dias (quinta, 25/12)
 *   datas("que dia cai o carnaval")              → terça, 16/2/2027 (Páscoa por Meeus/Jones/Butcher)
 *   datas("quantos anos tem quem nasceu em 2004")→ 22 anos
 *
 * Recebe o texto dobrado (sem acento, minúsculo): `dobrar(t.original)`.
 */
import { fmt, numeroExtenso } from './numeros';

// ------------------------------------------------------------------ unidades

interface Unidade { nome: string; plural: string; dim: string; fator: number; nomes: string[] }

const U: Unidade[] = [
  // comprimento (metro)
  { nome: 'quilômetro', plural: 'quilômetros', dim: 'L', fator: 1000, nomes: ['km', 'quilometro', 'quilometros', 'kilometro', 'kilometros'] },
  { nome: 'metro', plural: 'metros', dim: 'L', fator: 1, nomes: ['m', 'metro', 'metros'] },
  { nome: 'centímetro', plural: 'centímetros', dim: 'L', fator: 0.01, nomes: ['cm', 'centimetro', 'centimetros'] },
  { nome: 'milímetro', plural: 'milímetros', dim: 'L', fator: 0.001, nomes: ['mm', 'milimetro', 'milimetros'] },
  { nome: 'milha', plural: 'milhas', dim: 'L', fator: 1609.344, nomes: ['milha', 'milhas', 'mi'] },
  { nome: 'pé', plural: 'pés', dim: 'L', fator: 0.3048, nomes: ['pe', 'pes', 'ft'] },
  { nome: 'polegada', plural: 'polegadas', dim: 'L', fator: 0.0254, nomes: ['polegada', 'polegadas', 'pol', 'in'] },
  { nome: 'jarda', plural: 'jardas', dim: 'L', fator: 0.9144, nomes: ['jarda', 'jardas', 'yd'] },
  { nome: 'légua', plural: 'léguas', dim: 'L', fator: 6000, nomes: ['legua', 'leguas'] },
  // massa (grama)
  { nome: 'quilo', plural: 'quilos', dim: 'M', fator: 1000, nomes: ['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas', 'kilo', 'kilos'] },
  { nome: 'grama', plural: 'gramas', dim: 'M', fator: 1, nomes: ['g', 'grama', 'gramas'] },
  { nome: 'miligrama', plural: 'miligramas', dim: 'M', fator: 0.001, nomes: ['mg', 'miligrama', 'miligramas'] },
  { nome: 'tonelada', plural: 'toneladas', dim: 'M', fator: 1e6, nomes: ['t', 'tonelada', 'toneladas'] },
  { nome: 'libra', plural: 'libras', dim: 'M', fator: 453.59237, nomes: ['libra', 'libras', 'lb', 'lbs'] },
  { nome: 'onça', plural: 'onças', dim: 'M', fator: 28.349523125, nomes: ['onca', 'oncas', 'oz'] },
  { nome: 'arroba', plural: 'arrobas', dim: 'M', fator: 15000, nomes: ['arroba', 'arrobas'] },
  // volume (mililitro)
  { nome: 'litro', plural: 'litros', dim: 'V', fator: 1000, nomes: ['l', 'litro', 'litros'] },
  { nome: 'mililitro', plural: 'mililitros', dim: 'V', fator: 1, nomes: ['ml', 'mililitro', 'mililitros'] },
  { nome: 'galão', plural: 'galões', dim: 'V', fator: 3785.411784, nomes: ['galao', 'galoes', 'gal'] },
  { nome: 'xícara', plural: 'xícaras', dim: 'V', fator: 240, nomes: ['xicara', 'xicaras'] },
  { nome: 'colher de sopa', plural: 'colheres de sopa', dim: 'V', fator: 15, nomes: ['colher de sopa', 'colheres de sopa', 'colher', 'colheres'] },
  { nome: 'colher de chá', plural: 'colheres de chá', dim: 'V', fator: 5, nomes: ['colher de cha', 'colheres de cha'] },
  { nome: 'copo', plural: 'copos', dim: 'V', fator: 250, nomes: ['copo', 'copos'] },
  { nome: 'metro cúbico', plural: 'metros cúbicos', dim: 'V', fator: 1e6, nomes: ['m3', 'metro cubico', 'metros cubicos'] },
  // tempo (segundo)
  { nome: 'segundo', plural: 'segundos', dim: 'T', fator: 1, nomes: ['s', 'seg', 'segundo', 'segundos'] },
  { nome: 'minuto', plural: 'minutos', dim: 'T', fator: 60, nomes: ['min', 'minuto', 'minutos'] },
  { nome: 'hora', plural: 'horas', dim: 'T', fator: 3600, nomes: ['h', 'hora', 'horas'] },
  { nome: 'dia', plural: 'dias', dim: 'T', fator: 86400, nomes: ['dia', 'dias'] },
  { nome: 'semana', plural: 'semanas', dim: 'T', fator: 604800, nomes: ['semana', 'semanas'] },
  { nome: 'mês', plural: 'meses', dim: 'T', fator: 2629746, nomes: ['mes', 'meses'] },
  { nome: 'ano', plural: 'anos', dim: 'T', fator: 31556952, nomes: ['ano', 'anos'] },
  // dados (byte, base 1024 como o sistema mostra)
  { nome: 'byte', plural: 'bytes', dim: 'D', fator: 1, nomes: ['byte', 'bytes', 'b'] },
  { nome: 'KB', plural: 'KB', dim: 'D', fator: 1024, nomes: ['kb', 'kilobyte', 'kilobytes'] },
  { nome: 'MB', plural: 'MB', dim: 'D', fator: 1024 ** 2, nomes: ['mb', 'mega', 'megas', 'megabyte', 'megabytes'] },
  { nome: 'GB', plural: 'GB', dim: 'D', fator: 1024 ** 3, nomes: ['gb', 'giga', 'gigas', 'gigabyte', 'gigabytes'] },
  { nome: 'TB', plural: 'TB', dim: 'D', fator: 1024 ** 4, nomes: ['tb', 'tera', 'teras', 'terabyte', 'terabytes'] },
  // velocidade (m/s)
  { nome: 'km/h', plural: 'km/h', dim: 'S', fator: 1 / 3.6, nomes: ['km/h', 'kmh', 'km por hora', 'quilometros por hora', 'quilometro por hora'] },
  { nome: 'm/s', plural: 'm/s', dim: 'S', fator: 1, nomes: ['m/s', 'metros por segundo', 'metro por segundo'] },
  { nome: 'mph', plural: 'mph', dim: 'S', fator: 0.44704, nomes: ['mph', 'milhas por hora', 'milha por hora'] },
  { nome: 'nó', plural: 'nós', dim: 'S', fator: 0.514444, nomes: ['no', 'nos', 'knot', 'knots'] },
  // temperatura: tratada à parte (não é só fator)
  { nome: 'grau Celsius', plural: 'graus Celsius', dim: 'C', fator: 1, nomes: ['celsius', 'graus celsius', 'grau celsius', 'c', 'graus c'] },
  { nome: 'grau Fahrenheit', plural: 'graus Fahrenheit', dim: 'C', fator: 1, nomes: ['fahrenheit', 'graus fahrenheit', 'grau fahrenheit', 'f', 'graus f'] },
  { nome: 'kelvin', plural: 'kelvins', dim: 'C', fator: 1, nomes: ['kelvin', 'kelvins', 'k'] },
];

/** nomes → unidade, dos mais longos para os mais curtos (para "colher de sopa" vencer "colher") */
const NOMES = U.flatMap((u) => u.nomes.map((n) => [n, u] as const)).sort((a, b) => b[0].length - a[0].length);
const re = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNID = NOMES.map(([n]) => re(n)).join('|');
const NUM = String.raw`(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|meia|meio|cem|mil)`;

const unidade = (s: string): Unidade | null => NOMES.find(([n]) => n === s.trim())?.[1] ?? null;

function numero(s: string): number | null {
  if (/^\d/.test(s)) return Number(s.replace(',', '.'));
  if (s === 'meia' || s === 'meio') return 0.5;
  return numeroExtenso([s], 0)?.valor ?? null;
}

function temperatura(v: number, de: string, para: string): number {
  const c = de.startsWith('grau C') ? v : de.startsWith('grau F') ? ((v - 32) * 5) / 9 : v - 273.15;
  return para.startsWith('grau C') ? c : para.startsWith('grau F') ? (c * 9) / 5 + 32 : c + 273.15;
}

export interface Conversao { valor: number; de: Unidade; para: Unidade; resultado: number; texto: string }

const arred = (n: number): number => {
  const a = Math.abs(n);
  const casas = a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return Number(n.toFixed(casas));
};

/** Uma conversão de unidades no texto dobrado, ou null. */
export function converter(t: string): Conversao | null {
  const x = ` ${t.replace(/[?!]/g, ' ').replace(/°\s*c\b/g, ' celsius').replace(/°\s*f\b/g, ' fahrenheit').replace(/\s+/g, ' ')} `;
  let m: RegExpExecArray | null;
  let valor: number | null = null, de: Unidade | null = null, para: Unidade | null = null;
  // "10 milhas em km", "converte 30 graus celsius pra fahrenheit", "100 km/h é quanto em mph"
  if ((m = new RegExp(String.raw` ${NUM} (?:graus? )?(${UNID}) (?:em|pra|para|e quanto em|sao quantos|sao quantas|da quantos|da quantas|equivale a|=|->|vira|em quantos|em quantas) (?:graus? )?(${UNID}) `).exec(x))) {
    [valor, de, para] = [numero(m[1]!), unidade(m[2]!), unidade(m[3]!)];
  } else if ((m = new RegExp(String.raw` quant[oa]s? (?:graus? )?(${UNID}) (?:sao|e|tem|da|cabem em|dao|tem em|ha em|equivalem a) ${NUM} (?:graus? )?(${UNID}) `).exec(x))) {
    // "quantos km são 10 milhas"
    [para, valor, de] = [unidade(m[1]!), numero(m[2]!), unidade(m[3]!)];
  } else if ((m = new RegExp(String.raw` quant[oa]s? (${UNID}) (?:tem|ha|cabem) (?:em )?(?:um|uma|1) (${UNID}) `).exec(x))) {
    // "quantos segundos tem um dia", "quantos ml tem uma xícara"
    [para, valor, de] = [unidade(m[1]!), 1, unidade(m[2]!)];
  }
  if (valor === null || !de || !para || de.dim !== para.dim || de === para || !Number.isFinite(valor)) return null;
  const resultado = arred(de.dim === 'C' ? temperatura(valor, de.nome, para.nome) : (valor * de.fator) / para.fator);
  const nome = (u: Unidade, n: number) => (u.dim === 'C' ? (u.nome === 'kelvin' ? 'K' : u.nome.endsWith('Celsius') ? '°C' : '°F') : Math.abs(n) === 1 ? u.nome : u.plural);
  const texto = de.dim === 'C' ? `${fmt(valor)} ${nome(de, valor)} = ${fmt(resultado)} ${nome(para, resultado)}` : `${fmt(valor)} ${nome(de, valor)} = ${fmt(resultado)} ${nome(para, resultado)}`;
  return { valor, de, para, resultado, texto };
}

// ------------------------------------------------------------------ calendário

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIA = 86_400_000;

const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasEntre = (a: Date, b: Date) => Math.round((meiaNoite(b).getTime() - meiaNoite(a).getTime()) / DIA);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** Datas que a pessoa pode citar pelo nome: [regex, nome, data no ano]. */
const FESTAS: Array<[RegExp, string, (ano: number) => Date]> = [
  [/\bnatal\b/, 'o Natal', (y) => new Date(y, 11, 25)], [/\bvespera de natal|\bnoite de natal/, 'a véspera de Natal', (y) => new Date(y, 11, 24)],
  [/\bano novo|\breveillon|\bvirada do ano/, 'o Ano-Novo', (y) => new Date(y + 1, 0, 1)], [/\bfim do ano\b/, 'o fim do ano', (y) => new Date(y, 11, 31)],
  [/\bcarnaval\b/, 'o Carnaval', (y) => new Date(pascoa(y).getTime() - 47 * DIA)], [/\bpascoa\b/, 'a Páscoa', (y) => pascoa(y)],
  [/\bsexta(-| )feira santa\b/, 'a Sexta-Feira Santa', (y) => new Date(pascoa(y).getTime() - 2 * DIA)], [/\bcorpus christi\b/, 'Corpus Christi', (y) => new Date(pascoa(y).getTime() + 60 * DIA)],
  [/\btiradentes\b/, 'Tiradentes', (y) => new Date(y, 3, 21)], [/\bdia do trabalho(ador)?\b/, 'o Dia do Trabalho', (y) => new Date(y, 4, 1)],
  [/\bdia dos namorados\b/, 'o Dia dos Namorados', (y) => new Date(y, 5, 12)], [/\bindependencia|\b7 de setembro\b/, 'a Independência', (y) => new Date(y, 8, 7)],
  [/\bdia das criancas|\b12 de outubro\b|\bnossa senhora aparecida/, 'o Dia das Crianças', (y) => new Date(y, 9, 12)], [/\bhalloween|\bdia das bruxas/, 'o Halloween', (y) => new Date(y, 9, 31)],
  [/\bfinados\b/, 'Finados', (y) => new Date(y, 10, 2)], [/\bproclamacao da republica\b/, 'a Proclamação da República', (y) => new Date(y, 10, 15)],
  [/\bconsciencia negra\b/, 'a Consciência Negra', (y) => new Date(y, 10, 20)], [/\bdia das maes\b/, 'o Dia das Mães', (y) => nDomingo(y, 4, 2)],
  [/\bdia dos pais\b/, 'o Dia dos Pais', (y) => nDomingo(y, 7, 2)], [/\bfim do mes\b/, 'o fim do mês', () => fimDoMes()],
];

let agoraRef = Date.now();
const fimDoMes = () => {
  const d = new Date(agoraRef);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/** O n-ésimo domingo do mês (mês 0-11). */
function nDomingo(ano: number, mes: number, n: number): Date {
  const d = new Date(ano, mes, 1);
  const primeiro = (7 - d.getDay()) % 7;
  return new Date(ano, mes, 1 + primeiro + 7 * (n - 1));
}

/** Uma data citada no texto: festa pelo nome, "25 de dezembro", "25/12", "dia 15", ou o aniversário (MMDD). */
function dataCitada(t: string, now: Date, aniversario: string | null): { data: Date; nome: string } | null {
  if (/\b(meu aniversario|meu niver|meu aniver)\b/.test(t) && aniversario) {
    const mes = Number(aniversario.slice(0, 2)) - 1, dia = Number(aniversario.slice(2));
    let d = new Date(now.getFullYear(), mes, dia);
    if (diasEntre(now, d) < 0) d = new Date(now.getFullYear() + 1, mes, dia);
    return { data: d, nome: 'o seu aniversário' };
  }
  for (const [rx, nome, f] of FESTAS) {
    if (!rx.test(t)) continue;
    let d = f(now.getFullYear());
    if (diasEntre(now, d) < 0 && !/\bfim do mes\b/.test(t)) d = f(now.getFullYear() + 1);
    return { data: d, nome };
  }
  let m = /\b(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/.exec(t);
  if (m && MESES.includes(m[2]!)) {
    const ano = m[3] ? Number(m[3]) : now.getFullYear();
    let d = new Date(ano, MESES.indexOf(m[2]!), Number(m[1]));
    if (!m[3] && diasEntre(now, d) < 0) d = new Date(ano + 1, d.getMonth(), d.getDate());
    return { data: d, nome: `${Number(m[1])} de ${m[2]!.replace('marco', 'março')}` };
  }
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    let d = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && diasEntre(now, d) < 0) d = new Date(ano + 1, d.getMonth(), d.getDate());
    return { data: d, nome: `${Number(m[1])}/${Number(m[2])}` };
  }
  m = /\bdia (\d{1,2})\b/.exec(t);
  if (m) {
    let d = new Date(now.getFullYear(), now.getMonth(), Number(m[1]));
    if (diasEntre(now, d) < 0) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(m[1]));
    return { data: d, nome: `dia ${Number(m[1])}` };
  }
  return null;
}

export const dataCurta = (d: Date): string => `${SEMANA[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}${d.getFullYear() !== new Date(agoraRef).getFullYear() ? `/${d.getFullYear()}` : ''}`;

export type RespostaData =
  | { tipo: 'faltam'; dias: number; nome: string; data: string; semanas: number }
  | { tipo: 'diasemana'; nome: string; data: string; semana: string }
  | { tipo: 'daqui'; dias: number; data: string; passado: boolean }
  | { tipo: 'idade'; anos: number; ano: number }
  | { tipo: 'bissexto'; ano: number; e: boolean }
  | { tipo: 'diasmes'; dias: number; mes: string }
  | { tipo: 'ano'; passados: number; faltam: number; semana: number };

/** Uma pergunta de calendário no texto dobrado, ou null. `aniversario` = "MMDD" (dos fatos). */
export function datas(t: string, now: number, aniversario: string | null = null): RespostaData | null {
  agoraRef = now;
  const hoje = new Date(now);
  const x = t.replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m: RegExpExecArray | null;
  // idade: "quantos anos tem quem nasceu em 2004", "se eu nasci em 2000 quantos anos eu tenho"
  if ((m = /\bnasc\w* (?:em|no ano de) (\d{4})\b/.exec(x)) && /\bquantos anos\b/.test(x)) {
    const ano = Number(m[1]);
    if (ano > 1900 && ano <= hoje.getFullYear()) return { tipo: 'idade', anos: hoje.getFullYear() - ano, ano };
  }
  if ((m = /\b(?:esse|este|o) ano(?: de (\d{4}))? (?:e|eh|vai ser) bissexto\b|\b(\d{4}) (?:e|eh|foi|vai ser) (?:um ano )?bissexto\b/.exec(x))) {
    const ano = Number(m[1] ?? m[2] ?? hoje.getFullYear());
    return { tipo: 'bissexto', ano, e: (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0 };
  }
  if ((m = /\bquantos dias tem (?:esse mes|este mes|o mes|(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))\b/.exec(x))) {
    const mes = m[1] ? MESES.indexOf(m[1]) : hoje.getMonth();
    return { tipo: 'diasmes', dias: new Date(hoje.getFullYear(), mes + 1, 0).getDate(), mes: MESES[mes]!.replace('marco', 'março') };
  }
  if (/\b(quantos dias (ja )?(passaram|se passaram|foram) (esse|este|do) ano|que semana do ano)\b/.test(x)) {
    const ini = new Date(hoje.getFullYear(), 0, 1), fim = new Date(hoje.getFullYear(), 11, 31);
    return { tipo: 'ano', passados: diasEntre(ini, hoje), faltam: diasEntre(hoje, fim), semana: Math.ceil((diasEntre(ini, hoje) + ini.getDay() + 1) / 7) };
  }
  // "que dia vai ser daqui a 45 dias", "que dia foi há 10 dias"
  if ((m = /\b(daqui a|em|dentro de|ha|faz) (\d+|\w+) (dias|semanas)\b/.exec(x)) && /\bque dia\b|\bdata\b|\bcai\b/.test(x)) {
    const n = /^\d/.test(m[2]!) ? Number(m[2]) : numeroExtenso([m[2]!], 0)?.valor;
    if (n !== undefined && n !== null) {
      const dias = n * (m[3] === 'semanas' ? 7 : 1);
      const passado = m[1] === 'ha' || m[1] === 'faz';
      return { tipo: 'daqui', dias, data: dataCurta(new Date(meiaNoite(hoje).getTime() + (passado ? -dias : dias) * DIA + 12 * 3600_000)), passado };
    }
  }
  const alvo = dataCitada(x, hoje, aniversario);
  if (!alvo) return null;
  if (/\b(que dia (da semana )?(cai|vai ser|e|foi|caiu)|cai (em )?que dia|quando (e|cai|vai ser))\b/.test(x)) {
    return { tipo: 'diasemana', nome: alvo.nome, data: dataCurta(alvo.data), semana: SEMANA[alvo.data.getDay()]! };
  }
  if (/\b(quant[oa]s? (dias|semanas|tempo)|falta(m)? (muito|quanto|quantos)|quanto (tempo )?falta|faltam)\b/.test(x)) {
    const dias = diasEntre(hoje, alvo.data);
    return { tipo: 'faltam', dias, nome: alvo.nome, data: dataCurta(alvo.data), semanas: Math.floor(dias / 7) };
  }
  return null;
}
