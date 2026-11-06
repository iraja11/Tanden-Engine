/*
 * Simulação de vidas: os tipos.
 *
 * Uma simulação é um elenco (pessoas), as visões que cada uma tem das outras
 * (afeto, atração, confiança, respeito, intimidade e memórias que apagam com
 * o tempo), os vínculos (namoro, casamento, caso, amizade, rivalidade...) e
 * os segredos (quem sabe do quê). O tempo anda de mês em mês.
 *
 * Tudo aqui é dado simples (sem funções), para dar para comparar, copiar e
 * guardar o elenco inicial na nota da simulação.
 */

/** Os cinco grandes da personalidade, de 0 a 100. */
export type Big5 = [abertura: number, conscienciosidade: number, extroversao: number, amabilidade: number, neuroticismo: number];
export const BIG5_NAMES = ['abertura', 'conscienciosidade', 'extroversão', 'amabilidade', 'neuroticismo'] as const;

export type Habilidade = 'combate' | 'labia' | 'intriga' | 'oficio' | 'saber';
export const HABILIDADES: Array<{ id: Habilidade; nome: string }> = [
  { id: 'combate', nome: 'combate' }, { id: 'labia', nome: 'lábia' }, { id: 'intriga', nome: 'intriga' }, { id: 'oficio', nome: 'ofício' }, { id: 'saber', nome: 'saber' },
];

/** Alelo de um gene discreto (letra) ou quantitativo (0 a 1). */
export interface Genoma {
  /** olhos: C castanho > V verde > A azul */
  olhos: [string, string];
  /** cabelo: E escuro > L loiro > R ruivo */
  cabelo: [string, string];
  altura: [number, number];
  forca: [number, number];
  intelecto: [number, number];
  beleza: [number, number];
  saude: [number, number];
  fertilidade: [number, number];
  longevidade: [number, number];
  /** alelo recessivo de uma doença do sangue (true = carrega) */
  sangue: [boolean, boolean];
  /** tendência a gêmeos */
  gemeos: [number, number];
}

export type Sexo = 'f' | 'm';
export type Orientacao = 'hetero' | 'homo' | 'bi' | 'ace';

export interface Meta {
  tipo: 'amor' | 'familia' | 'riqueza' | 'vinganca' | 'fama' | 'paz' | 'conquistar' | 'saber';
  alvo?: string;
  desde: number;
}

export interface Pessoa {
  /** id estável: o caminho da ficha, ou `x1`, `x2`... para figurantes e quem nasce na simulação */
  id: string;
  nome: string;
  /** ficha no cofre, se tiver */
  nota: string | null;
  sexo: Sexo;
  /** para a gramática da crônica: f, m ou n (neutro) */
  genero: 'f' | 'm' | 'n';
  orientacao: Orientacao;
  /** mês de nascimento (ano × 12 + mês − 1) */
  nasc: number;
  morte: number | null;
  causa: string | null;
  /** morte já escrita na ficha (o cânone manda): a pessoa morre nesse mês se ainda viver */
  destino: number | null;
  /** onde vive (caminho da ficha do lugar, ou um nome) */
  local: string;
  viagem: { para: string; chega: number; motivo: string } | null;
  especie: string | null;
  /** expectativa de vida da espécie (anos); 70 se não souber */
  vida: number;
  /** sobrenome / casa */
  casa: string | null;
  /** pais biológicos [mãe, pai] */
  pais: [string | null, string | null];
  /** pai que todos acham que é (quando o biológico é segredo) */
  paiOficial: string | null;
  conjuge: string | null;
  prof: string | null;
  genes: Genoma;
  big5: Big5;
  tracos: string[];
  gostos: string[];
  hab: Record<Habilidade, number>;
  /** 0 a 100 */
  saude: number;
  /** -100 a 100 */
  humor: number;
  /** 0 a 100 */
  estresse: number;
  dinheiro: number;
  gravidez: { pai: string; desde: number; gemeos: boolean } | null;
  /** fim do resguardo depois do parto */
  resguardo: number;
  meta: Meta | null;
  /** contadores de experiência (lutas, vitórias, traições sofridas...) que fazem traços surgirem */
  xp: Record<string, number>;
  /** a pessoa decide o que importa pela mão de quem joga */
  conduzido: boolean;
  /** não morre por acaso (armadura de roteiro) */
  protegido: boolean;
  /** estados que passam: doente, bêbado, enlutado (id → mês em que acaba) */
  estados: Record<string, number>;
  /** campos livres que as regras criam (`p.rancor += 1`) */
  campos: Record<string, CampoValor>;
  /** itens que carrega (ids do catálogo; um comum pode aparecer mais de uma vez) */
  itens?: string[];
}

export type CampoValor = number | string | boolean | null | string[];

export interface Memoria {
  /** o que foi, em poucas palavras ("traiu", "salvou minha vida") */
  o: string;
  /** pontos de opinião no dia em que aconteceu */
  v: number;
  /** mês */
  t: number;
  /** meia-vida em meses (quanto demora para pesar metade) */
  m: number;
}

/** Como `a` vê `b`. */
export interface Visao {
  afeto: number;
  atracao: number;
  confianca: number;
  respeito: number;
  intimidade: number;
  mem: Memoria[];
  /** último mês em que se falaram */
  visto: number;
}

export type Vinculo = 'namoro' | 'noivado' | 'amantes' | 'amigos' | 'rivais' | 'inimigos' | 'ex';

export interface Segredo {
  id: number;
  tipo: 'caso' | 'paternidade' | 'assassinato' | 'roubo';
  /** quem está no segredo como protagonista (caso: [a, b]; paternidade: [filho, pai, mãe]; assassinato: [assassino, vítima]) */
  sobre: string[];
  /** quem sabe */
  sabem: string[];
  t: number;
  /** caiu na boca do povo */
  publico: boolean;
}

export type Categoria = 'social' | 'romance' | 'familia' | 'conflito' | 'vida' | 'morte' | 'trabalho' | 'mundo' | 'regra' | 'voce';

export interface VidaEvento {
  t: number;
  cat: Categoria;
  /** id da interação ou do acontecimento (flertar, nascimento, morte...) */
  tipo: string;
  /** frase da crônica, com [[links]] */
  texto: string;
  /** ids das pessoas envolvidas */
  quem: string[];
  /** 1 miúdo, 2 notável, 3 marco */
  peso: number;
  /** só quem lê a crônica sabe (ninguém na história sabe ainda) */
  segredo?: boolean;
}

export interface Decisao {
  id: number;
  t: number;
  /** quem decide (pessoa conduzida) */
  pessoa: string;
  tipo: 'pedido' | 'casamento' | 'seducao' | 'descoberta' | 'desafio';
  /** quem provocou a decisão */
  de: string;
  /** terceiro envolvido (o amante, no caso de descoberta) */
  outro?: string;
  texto: string;
  opcoes: Array<{ id: string; rotulo: string }>;
}

export interface Ajustes {
  romance: number;
  violencia: number;
  fertilidade: number;
  mortalidade: number;
  drama: number;
  social: number;
}
export const AJUSTES_PADRAO: Ajustes = { romance: 1, violencia: 1, fertilidade: 1, mortalidade: 1, drama: 1, social: 1 };

/** Evento do mundo com duração (festa, peste, fome, guerra, fartura). */
export interface Efeito {
  tipo: 'festa' | 'peste' | 'fome' | 'guerra' | 'fartura';
  lugar: string | null;
  ate: number;
}

/** Intervenções de quem joga. Ficam no registro da simulação e se repetem no replay. */
export type Comando =
  | { c: 'agir'; a: string; b: string | null; i: string; garantir?: boolean }
  | { c: 'sussurrar'; a: string; b: string; tipo: 'paixao' | 'odio' | 'amizade' | 'desconfianca' | 'respeito' | 'inveja' }
  | { c: 'traco'; p: string; add?: string; del?: string }
  | { c: 'campo'; p: string; campo: string; valor: CampoValor }
  | { c: 'relacao'; a: string; b: string; campo: 'afeto' | 'atracao' | 'confianca' | 'respeito' | 'intimidade'; valor: number }
  | { c: 'meta'; p: string; tipo: Meta['tipo'] | null; alvo?: string }
  | { c: 'conduzir'; p: string; on: boolean }
  | { c: 'proteger'; p: string; on: boolean }
  | { c: 'evento'; tipo: Efeito['tipo']; lugar: string | null; meses?: number }
  /** evento do mundo declarado nas regras (`evento "Lua de Sangue":`) */
  | { c: 'mundo'; id: string; lugar: string | null }
  /** dá (on) ou tira um item */
  | { c: 'item'; p: string; item: string; on: boolean }
  | { c: 'ajuste'; k: keyof Ajustes; v: number }
  | { c: 'decidir'; id: number; opcao: string }
  | { c: 'matar'; p: string; causa?: string }
  | { c: 'mudar'; p: string; lugar: string }
  | { c: 'adicionar'; pessoa: Pessoa }
  | { c: 'vincular'; p: string; nota: string };

/** Relação inicial entre duas pessoas do elenco (das fichas ou da vizinhança gerada). */
export interface Laco {
  a: string;
  b: string;
  v?: Vinculo;
  afeto?: number;
  intimidade?: number;
  atracao?: number;
  confianca?: number;
  respeito?: number;
}

export interface Registro {
  /** mês em que a intervenção vale (antes de o mês andar) */
  t: number;
  cmd: Comando;
}

// ---------------------------------------------------------------- calendário

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const mesDe = (ano: number, mes = 1): number => ano * 12 + (mes - 1);
export const anoDe = (t: number): number => Math.floor(t / 12);
export const mesDoAno = (t: number): number => (((t % 12) + 12) % 12) + 1;

/** "mar 314" (ou com os nomes de meses do mundo). */
export function dataTexto(t: number, meses: string[] = MESES): string {
  return `${meses[mesDoAno(t) - 1] ?? mesDoAno(t)} ${anoDe(t)}`;
}

/** Idade em anos completos. */
export const idadeDe = (p: Pick<Pessoa, 'nasc' | 'morte'>, t: number): number => Math.floor(((p.morte ?? t) - p.nasc) / 12);
