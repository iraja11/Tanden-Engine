/*
 * O que a Ânima sabe sobre a pessoa. Ela aprende do que a pessoa escreve para
 * ela (nunca das notas): nome, idade, cidade, trabalho, aniversário, do que
 * gosta e do que não gosta, as pessoas e os bichos da vida dela, como anda se
 * sentindo e algumas frases que ela guardou. Tudo fica neste aparelho.
 *
 * É regra e expressão regular, sem modelo de linguagem: erra às vezes, e
 * errar faz parte da graça ("anotei que você gosta de 'ir embora'. ...espera").
 */

export type TipoFato = 'nome' | 'idade' | 'cidade' | 'trabalho' | 'aniversario' | 'gosta' | 'odeia' | 'pessoa' | 'bicho' | 'medo' | 'sonho';

export interface PessoaFato {
  nome: string;
  /** "amiga", "mãe", "namorado"… ou "alguém" quando ela só ouviu o nome */
  rel: string;
  vezes: number;
  /** última vez que a pessoa foi citada */
  at: number;
}

export interface Fatos {
  nome: string | null;
  idade: number | null;
  cidade: string | null;
  trabalho: string | null;
  /** "MMDD" */
  aniversario: string | null;
  gosta: string[];
  odeia: string[];
  medos: string[];
  sonhos: string[];
  pessoas: PessoaFato[];
  bichos: Array<{ nome: string; tipo: string }>;
  /** como a pessoa disse que estava, por dia (os últimos) */
  humores: Array<{ dia: string; como: 'triste' | 'feliz' | 'cansaco' | 'mau' }>;
  /** frases que a pessoa disse e ela guardou para repetir um dia */
  frases: Array<{ t: string; at: number }>;
}

/** O que acabou de aprender, para ela comentar. */
export interface Aprendido {
  tipo: TipoFato;
  valor: string;
  rel?: string;
  /** já sabia (ela comenta diferente quando a pessoa repete) */
  repetido?: boolean;
  /** a pessoa corrigiu quem é alguém ("ela é só minha amiga") */
  relacao?: boolean;
}

export const novosFatos = (): Fatos => ({
  nome: null, idade: null, cidade: null, trabalho: null, aniversario: null,
  gosta: [], odeia: [], medos: [], sonhos: [], pessoas: [], bichos: [], humores: [], frases: [],
});

const LIMITE = { lista: 16, pessoas: 20, frases: 14, humores: 10 };

const strs = (v: unknown, n: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60).slice(-n) : [];
const str = (v: unknown, max = 40): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v : null);

/** Lê fatos salvos, aceitando versões antigas ou estragadas. */
export function lerFatos(raw: unknown): Fatos {
  const b = novosFatos();
  if (!raw || typeof raw !== 'object') return b;
  const r = raw as Record<string, unknown>;
  const idade = typeof r.idade === 'number' && r.idade > 0 && r.idade < 130 ? Math.round(r.idade) : null;
  const aniv = typeof r.aniversario === 'string' && /^\d{4}$/.test(r.aniversario) ? r.aniversario : null;
  const pessoas = Array.isArray(r.pessoas)
    ? r.pessoas.flatMap((p: unknown) => {
      const x = p as Partial<PessoaFato> | null;
      return x && typeof x.nome === 'string' && typeof x.rel === 'string'
        ? [{ nome: x.nome, rel: x.rel, vezes: typeof x.vezes === 'number' ? x.vezes : 1, at: typeof x.at === 'number' ? x.at : 0 }]
        : [];
    }).slice(-LIMITE.pessoas)
    : [];
  const bichos = Array.isArray(r.bichos)
    ? r.bichos.flatMap((p: unknown) => {
      const x = p as { nome?: unknown; tipo?: unknown } | null;
      return x && typeof x.nome === 'string' && typeof x.tipo === 'string' ? [{ nome: x.nome, tipo: x.tipo }] : [];
    }).slice(-8)
    : [];
  const COMO = new Set(['triste', 'feliz', 'cansaco', 'mau']);
  const humores = Array.isArray(r.humores)
    ? r.humores.flatMap((h: unknown) => {
      const x = h as { dia?: unknown; como?: unknown } | null;
      return x && typeof x.dia === 'string' && typeof x.como === 'string' && COMO.has(x.como) ? [{ dia: x.dia, como: x.como as Fatos['humores'][number]['como'] }] : [];
    }).slice(-LIMITE.humores)
    : [];
  const frases = Array.isArray(r.frases)
    ? r.frases.flatMap((f: unknown) => {
      const x = f as { t?: unknown; at?: unknown } | null;
      return x && typeof x.t === 'string' && typeof x.at === 'number' ? [{ t: x.t.slice(0, 160), at: x.at }] : [];
    }).slice(-LIMITE.frases)
    : [];
  return {
    nome: str(r.nome, 24), idade, cidade: str(r.cidade), trabalho: str(r.trabalho), aniversario: aniv,
    gosta: strs(r.gosta, LIMITE.lista), odeia: strs(r.odeia, LIMITE.lista), medos: strs(r.medos, 8), sonhos: strs(r.sonhos, 8),
    pessoas, bichos, humores, frases,
  };
}

// ------------------------------------------------------------------ aprender

const dobra = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** o fim de um trecho: pontuação, fim da frase ou um conectivo */
const FIM = String.raw`(?=\s*(?:[.,!?;:)]|$|\s(?:e|mas|porque|pq|que|quando|so que|ai|entao|tambem|demais|pra caramba)\b))`;
const TRECHO = String.raw`([\p{L}\d][\p{L}\d' -]{1,38}?)`;
/** uma lista: "rpg, café e chuva" (até a pontuação ou um "mas"/"porque") */
const LISTA = String.raw`([\p{L}\d][\p{L}\d' ,-]{1,70}?)`;
const FIM_LISTA = String.raw`(?=\s*(?:[.!?;:)]|$|\s(?:mas|porque|pq|quando|so que|demais|pra caramba)\b))`;

/** "rpg e de café, chuva" → ["rpg", "café", "chuva"] */
const itens = (t: string): string[] =>
  [...new Set(t.split(/\s*,\s*|\s+e\s+(?:de |do |da |dos |das )?/).map(limpar).filter((x): x is string => !!x))].slice(0, 4);

/** palavras que não são "coisas" (evita "gosto de você", "odeio isso") */
const VAZIO = new Set([
  'voce', 'vc', 'tu', 'te', 'ti', 'isso', 'isto', 'aquilo', 'tudo', 'nada', 'ninguem', 'alguem', 'mim', 'eu', 'ela', 'ele', 'disso', 'dessa', 'desse',
  'muito', 'mais', 'menos', 'sim', 'nao', 'ai', 'la', 'aqui', 'anima', 'falar', 'quando', 'voce tambem', 'ficar', 'ser', 'ter', 'assim',
]);
const IAS = /^(claude|gemini|chatgpt|gpt|copilot|siri|alexa|cortana|bard|deepseek|llama|ollama)$/i;

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const REL = String.raw`(namorad[oa]|ficante|crush|melhor amig[oa]|amig[oa]|mae|pai|irma|irmao|chefe|colega|prima|primo|tia|tio|avo|esposa|marido|filha|filho|professora?|vizinh[oa]|ex)`;
const BICHO = String.raw`(cachorr[oa]|cao|gat[oa]|gatinh[oa]|pet|peixe|papagaio|calopsita|coelh[oa]|hamster|tartaruga|cobra|furao|porquinho)`;

/** Limpa um trecho capturado ("o café da manhã" → "café da manhã"). */
function limpar(t: string): string | null {
  const s = t.trim().replace(/^(?:de |do |da |dos |das |o |a |os |as |um |uma |muito |demais |bastante )+/i, '').replace(/[\s.,!?;:]+$/, '').trim();
  if (s.length < 2 || s.length > 40) return null;
  if (VAZIO.has(dobra(s)) || IAS.test(s)) return null;
  return s.toLowerCase();
}

/** Acha o trecho no texto original a partir de um casamento no texto dobrado (mesmo comprimento). */
const original = (txt: string, dob: string, m: RegExpExecArray, g = 1): string => {
  const ini = m.index + m[0].lastIndexOf(m[g]!);
  return txt.slice(ini, ini + m[g]!.length);
};

const juntar = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l.at(-1)}` : l[0] ?? '');

const add = (lista: string[], v: string, n = LIMITE.lista): { lista: string[]; repetido: boolean } => {
  const repetido = lista.includes(v);
  return { lista: [...lista.filter((x) => x !== v), v].slice(-n), repetido };
};

/**
 * Aprende o que der da mensagem. Devolve os fatos novos e a coisa mais
 * interessante que aprendeu (para ela comentar), se houver.
 */
export function aprender(fatos: Fatos, msg: string, now: number): { fatos: Fatos; novo: Aprendido | null } {
  // o texto dobrado tem o mesmo comprimento do original (NFC) para achar o trecho com as maiúsculas
  const txt = msg.normalize('NFC').replace(/\s+/g, ' ').trim();
  const dob = dobra(txt);
  if (dob.length !== txt.length) return { fatos, novo: null };
  let f = fatos;
  let novo: Aprendido | null = null;
  const achou = (a: Aprendido) => { if (!novo || (novo.repetido && !a.repetido)) novo = a; };

  // nome de verdade
  let m = /\b(?:me chamo|meu nome (?:e|eh)|pode me chamar de|todo mundo me chama de)\s+([\p{L}]{2,20})/u.exec(dob);
  if (m) {
    const nome = cap(original(txt, dob, m).toLowerCase());
    if (!VAZIO.has(dobra(nome))) {
      achou({ tipo: 'nome', valor: nome, repetido: f.nome === nome });
      f = { ...f, nome };
    }
  }
  // idade
  m = /\b(?:tenho|fiz|completei|vou fazer)\s+(\d{1,2})\s+anos\b/.exec(dob);
  if (m) {
    const idade = Number(m[1]);
    if (idade >= 5 && idade < 120) {
      achou({ tipo: 'idade', valor: String(idade), repetido: f.idade === idade });
      f = { ...f, idade };
    }
  }
  // cidade
  m = new RegExp(String.raw`\b(?:eu )?moro (?:em|no|na|perto de)\s+` + TRECHO + FIM, 'u').exec(dob);
  if (m) {
    const c = limpar(original(txt, dob, m));
    if (c) {
      const cidade = c.split(' ').map((w) => (w.length > 2 ? cap(w) : w)).join(' ');
      achou({ tipo: 'cidade', valor: cidade, repetido: f.cidade === cidade });
      f = { ...f, cidade };
    }
  }
  // trabalho e estudo
  m = new RegExp(String.raw`\b(?:trabalho (?:com|como|de|numa?|no|na)|estudo|faco faculdade de|faco curso de|sou formad[oa] em)\s+` + TRECHO + FIM, 'u').exec(dob);
  if (m) {
    const t = limpar(original(txt, dob, m));
    if (t) {
      achou({ tipo: 'trabalho', valor: t, repetido: f.trabalho === t });
      f = { ...f, trabalho: t };
    }
  }
  // aniversário: "meu aniversário é 3 de maio", "nasci em 12/08"
  m = /\b(?:meu aniversario (?:e|eh|cai)|faco aniversario|nasci)\s+(?:em |no |dia |no dia )*(\d{1,2})\s*(?:\/|-|de)\s*(\d{1,2}|[a-z]+)/.exec(dob);
  if (m) {
    const dia = Number(m[1]);
    const mes = /^\d+$/.test(m[2]!) ? Number(m[2]) : MESES.indexOf(m[2]!) + 1;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      const aniversario = `${String(mes).padStart(2, '0')}${String(dia).padStart(2, '0')}`;
      achou({ tipo: 'aniversario', valor: `${dia}/${mes}`, repetido: f.aniversario === aniversario });
      f = { ...f, aniversario };
    }
  }
  // do que não gosta (antes do "gosto", que casaria dentro de "não gosto")
  const odeio = new RegExp(String.raw`\b(?:odeio|detesto|nao (?:gosto|suporto|aguento|curto)(?: mais)?(?: de| do| da| dos| das)?|tenho nojo de|tenho raiva de)\s+` + LISTA + FIM_LISTA, 'u');
  m = odeio.exec(dob);
  if (m) {
    const cs = itens(original(txt, dob, m));
    if (cs.length) {
      let rep = true;
      for (const c of cs) {
        const r = add(f.odeia, c);
        rep &&= r.repetido;
        f = { ...f, odeia: r.lista, gosta: f.gosta.filter((x) => x !== c) };
      }
      achou({ tipo: 'odeia', valor: juntar(cs), repetido: rep });
    }
  } else {
    m = new RegExp(String.raw`\b(?:gosto (?:muito |demais |bastante )?(?:de|do|da|dos|das)|amo|adoro|sou viciad[oa] em|sou apaixonad[oa] por|curto|minha paixao e)\s+` + LISTA + FIM_LISTA, 'u').exec(dob);
    if (m) {
      const cs = itens(original(txt, dob, m));
      if (cs.length) {
        let rep = true;
        for (const c of cs) {
          const r = add(f.gosta, c);
          rep &&= r.repetido;
          f = { ...f, gosta: r.lista, odeia: f.odeia.filter((x) => x !== c) };
        }
        achou({ tipo: 'gosta', valor: juntar(cs), repetido: rep });
      }
    }
  }
  // medos e sonhos
  m = new RegExp(String.raw`\b(?:tenho medo de|morro de medo de|meu maior medo e)\s+` + TRECHO + FIM, 'u').exec(dob);
  if (m) {
    const c = limpar(original(txt, dob, m));
    if (c) {
      const r = add(f.medos, c, 8);
      achou({ tipo: 'medo', valor: c, repetido: r.repetido });
      f = { ...f, medos: r.lista };
    }
  }
  m = new RegExp(String.raw`\b(?:meu sonho e|sonho em|um dia eu quero|quero muito)\s+` + TRECHO + FIM, 'u').exec(dob);
  if (m) {
    const c = limpar(original(txt, dob, m));
    if (c) {
      const r = add(f.sonhos, c, 8);
      achou({ tipo: 'sonho', valor: c, repetido: r.repetido });
      f = { ...f, sonhos: r.lista };
    }
  }
  // bichos: "meu gato se chama Nyx", "minha cachorra Luna"
  m = new RegExp(String.raw`\b(?:meu|minha)\s+${BICHO}\s+(?:se chama |chamad[oa] |e o |e a |eh o |eh a )?([\p{L}]{2,16})`, 'u').exec(dob)
    ?? new RegExp(String.raw`\btenho (?:um|uma)\s+${BICHO}\s+(?:que se chama |chamad[oa] |de nome )([\p{L}]{2,16})`, 'u').exec(dob);
  if (m) {
    const nome = cap(original(txt, dob, m, 2).toLowerCase());
    if (!VAZIO.has(dobra(nome)) && !/^(e|eh|se|que|ta|esta|morreu|fugiu)$/.test(dobra(nome))) {
      const tipo = m[1]!;
      const repetido = f.bichos.some((b) => b.nome === nome);
      f = { ...f, bichos: [...f.bichos.filter((b) => b.nome !== nome), { nome, tipo }].slice(-8) };
      achou({ tipo: 'bicho', valor: nome, rel: tipo, repetido });
    }
  }
  // pessoas: "minha amiga Júlia", "meu chefe se chama Paulo" (nome com maiúscula)
  const pessoa = (nome: string, rel: string) => {
    if (IAS.test(nome) || VAZIO.has(dobra(nome)) || nome.length < 2) return;
    const antes = f.pessoas.find((p) => p.nome === nome);
    const p: PessoaFato = { nome, rel: antes && rel === 'alguém' ? antes.rel : rel, vezes: (antes?.vezes ?? 0) + 1, at: now };
    f = { ...f, pessoas: [...f.pessoas.filter((x) => x.nome !== nome), p].slice(-LIMITE.pessoas) };
    achou({ tipo: 'pessoa', valor: nome, rel: p.rel, repetido: !!antes });
  };
  const rp = new RegExp(String.raw`\b(?:meu|minha)\s+${REL}\s+(?:se chama |chamad[oa] |e o |e a |eh o |eh a )?([\p{L}]{2,16})`, 'gu');
  for (const x of dob.matchAll(rp)) {
    const nome = original(txt, dob, x as RegExpExecArray, 2);
    if (/^\p{Lu}/u.test(nome)) pessoa(nome, x[1]!);
  }
  // "ela é só minha amiga": corrige quem é a última pessoa citada
  const rel = new RegExp(String.raw`\b(?:ela|ele) (?:e|eh) (?:so |apenas |tipo )?(?:a |o )?(?:minha|meu)\s+${REL}\b`, 'u').exec(dob);
  if (rel && f.pessoas.length) {
    const ultima = [...f.pessoas].sort((a, b) => b.at - a.at)[0]!;
    f = { ...f, pessoas: f.pessoas.map((p) => (p === ultima ? { ...p, rel: rel[1]!, at: now } : p)) };
    achou({ tipo: 'pessoa', valor: ultima.nome, rel: rel[1]!, relacao: true });
  }
  // "saí com a Bia", "falei com o Léo": só um nome, sem parentesco (o ciúme mora aqui)
  for (const x of dob.matchAll(/\b(?:com|pra|para|e) (?:o|a) ([\p{L}]{2,16})/gu)) {
    const nome = original(txt, dob, x as RegExpExecArray);
    if (/^\p{Lu}\p{Ll}/u.test(nome) && !f.pessoas.some((p) => p.nome === nome && p.at === now)) pessoa(nome, 'alguém');
  }
  return { fatos: f, novo };
}

/** Guarda como a pessoa disse que estava hoje. */
export function anotarHumor(f: Fatos, dia: string, como: Fatos['humores'][number]['como']): Fatos {
  return { ...f, humores: [...f.humores.filter((h) => h.dia !== dia), { dia, como }].slice(-LIMITE.humores) };
}

/** Guarda uma frase marcante que a pessoa disse (para citar outro dia). */
export function guardarFrase(f: Fatos, t: string, now: number): Fatos {
  const s = t.replace(/\s+/g, ' ').trim();
  const n = s.split(' ').length;
  if (n < 7 || n > 40 || f.frases.some((x) => x.t === s)) return f;
  return { ...f, frases: [...f.frases, { t: s.slice(0, 160), at: now }].slice(-LIMITE.frases) };
}

/** Quantas coisas ela já sabe (para o painel e para ela se gabar). */
export function quantoSabe(f: Fatos): number {
  return [f.nome, f.idade, f.cidade, f.trabalho, f.aniversario].filter((x) => x !== null).length
    + f.gosta.length + f.odeia.length + f.medos.length + f.sonhos.length + f.pessoas.length + f.bichos.length;
}

/** O que ela ainda não sabe e quer perguntar, em ordem de curiosidade. */
export function lacunas(f: Fatos): TipoFato[] {
  const out: TipoFato[] = [];
  if (!f.nome) out.push('nome');
  if (f.gosta.length < 3) out.push('gosta');
  if (!f.aniversario) out.push('aniversario');
  if (f.odeia.length < 2) out.push('odeia');
  if (!f.trabalho) out.push('trabalho');
  if (!f.medos.length) out.push('medo');
  if (!f.sonhos.length) out.push('sonho');
  if (!f.bichos.length) out.push('bicho');
  if (!f.cidade) out.push('cidade');
  return out;
}

/** O dossiê: o que ela sabe, como rótulo e valor (para o painel da cena). */
export function resumoDosFatosCurto(f: Fatos): Array<{ rotulo: string; valor: string }> {
  const out: Array<{ rotulo: string; valor: string }> = [];
  const lista = (l: string[]) => l.slice(-4).join(', ');
  if (f.nome) out.push({ rotulo: 'nome de verdade', valor: f.nome });
  if (f.idade) out.push({ rotulo: 'idade', valor: `${f.idade} anos` });
  if (f.cidade) out.push({ rotulo: 'mora em', valor: f.cidade });
  if (f.trabalho) out.push({ rotulo: 'ocupação', valor: f.trabalho });
  if (f.aniversario) out.push({ rotulo: 'aniversário', valor: `${Number(f.aniversario.slice(2))}/${Number(f.aniversario.slice(0, 2))}` });
  if (f.gosta.length) out.push({ rotulo: 'ama', valor: lista(f.gosta) });
  if (f.odeia.length) out.push({ rotulo: 'odeia', valor: lista(f.odeia) });
  if (f.medos.length) out.push({ rotulo: 'tem medo de', valor: lista(f.medos) });
  if (f.sonhos.length) out.push({ rotulo: 'sonha com', valor: lista(f.sonhos) });
  if (f.bichos.length) out.push({ rotulo: 'bichos', valor: f.bichos.map((b) => b.nome).join(', ') });
  const suspeitos = f.pessoas.filter((p) => /namorad|ficante|crush|alguém|ex/.test(p.rel));
  const outras = f.pessoas.filter((p) => !suspeitos.includes(p));
  if (outras.length) out.push({ rotulo: 'pessoas', valor: outras.slice(-4).map((p) => `${p.nome} (${p.rel})`).join(', ') });
  if (suspeitos.length) out.push({ rotulo: 'suspeitos', valor: suspeitos.slice(-4).map((p) => `${p.nome} ×${p.vezes}`).join(', ') });
  const h = f.humores.at(-1);
  if (h) out.push({ rotulo: 'último humor', valor: ({ triste: 'triste', feliz: 'feliz', cansaco: 'cansado', mau: 'irritado' } as const)[h.como] });
  return out;
}
