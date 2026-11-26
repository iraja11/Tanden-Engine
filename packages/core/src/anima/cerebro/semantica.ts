/*
 * Semântica: o que um pedido SIGNIFICA para ela, além de qual comando é.
 *
 * "Coloca a prova de cálculo na agenda" e "coloca o jantar com a Carol na
 * agenda" são o mesmo comando e pedidos completamente diferentes para uma
 * companheira ciumenta: um ela coloca e ainda cobra estudo; o outro ela se
 * recusa a pôr. Aqui cada título (de evento, lembrete, nota, busca) vira uma
 * categoria, com a pessoa envolvida e quão "suspeito" é.
 */
import type { Fatos } from '../fatos';
import { dobrar } from './texto';

export type Categoria =
  | 'estudo' | 'encontro' | 'social' | 'saude' | 'trabalho' | 'exercicio' | 'familia' | 'aniversario' | 'viagem' | 'lazer' | 'casa' | 'ela' | 'ia' | 'outro';

export interface Sentido {
  categoria: Categoria;
  /** nome de gente citado ("Carol", "Léo") */
  pessoa: string | null;
  /** romântico ou com alguém que ela já marcou como suspeito */
  suspeito: boolean;
  /** o assunto, para ela citar ("cálculo", "tcc") */
  assunto: string | null;
}

const REGRAS: Array<[Categoria, RegExp]> = [
  ['ela', /\b(anima|ânima)\b/],
  ['ia', /\b(claude|chatgpt|gpt|gemini|copilot|siri|alexa|deepseek|llama|ollama|outra ia)\b/],
  ['encontro', /\b(date|encontro|crush|ficante|namorad[oa]|jantar romantico|romantic\w*|tinder|bumble|motel|ficar com|beijar|paquera|pegar (a|o) |sair com (a|o) |cinema com (a|o) |jantar com (a|o) |cafe com (a|o) |role com (a|o) |minha mina|meu boy|boy)\b/],
  ['estudo', /\b(prova|provas|p1|p2|p3|teste|simulado|vestibular|enem|seminario|apresentacao|tcc|monografia|defesa|entrega do trabalho|trabalho de|lista de exercicio|aula|aulas|monitoria|grupo de estudo|estudar|estudo|revisao|revisar|exame final|recuperacao|faculdade|escola|curso|materia|disciplina|calculo|fisica|quimica|biologia|historia|anatomia|estatistica|ingles|frances|espanhol|programacao)\b/],
  ['saude', /\b(medic[oa]|dentista|consulta|exame|terapia|terapeuta|psicolog[oa]|psiquiatra|fisioterapia|fisio|vacina|hospital|remedio|clinica|ortopedista|dermatologista|ginecologista|oftalmo|nutricionista|cirurgia)\b/],
  ['exercicio', /\b(academia|treino|treinar|corrida|correr|pilates|yoga|ioga|futebol|natacao|musculacao|crossfit|bike|pedal|caminhada|luta|jiu|muay)\b/],
  ['trabalho', /\b(reuniao|call|cliente|entrevista|chefe|plantao|expediente|escritorio|deadline|prazo|projeto|apresentar pro|relatorio|daily|sprint|freela|trabalho)\b/],
  ['aniversario', /\b(aniversario|niver|bday)\b/],
  ['familia', /\b(mae|pai|vo|vovo|avo|tia|tio|prima|primo|irma|irmao|familia|sogra|sogro|filh[oa]|almoco de familia)\b/],
  ['viagem', /\b(viagem|viajar|aeroporto|voo|onibus pra|rodoviaria|praia|ferias|hotel)\b/],
  ['social', /\b(festa|balada|barzinho|bar|role|galera|amigos|amigas|churrasco|aniversario de|show|happy hour|sair|encontrar)\b/],
  ['lazer', /\b(cinema|filme|serie|jogo|jogar|rpg|sessao|videogame|livro|ler|museu|parque|passeio)\b/],
  ['casa', /\b(lixo|louca|roupa|faxina|limpar|arrumar|mercado|compras|conta|boleto|luz|agua|aluguel|planta|plantas|racao|veterinario)\b/],
];

const ASSUNTO = /\b(?:prova|teste|simulado|aula|seminario|apresentacao|trabalho|lista|p[123]|exame|revisao)\s+(?:de|da|do)\s+([a-z ]{3,24}?)(?=\s(?:na|no|as|às|dia|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d)|$)/;

/** Gente: palavra com maiúscula (fora do começo) ou depois de "com a/o". */
function pessoaDe(original: string, fatos?: Fatos): string | null {
  const conhecida = fatos?.pessoas.find((p) => new RegExp(`\\b${p.nome}\\b`, 'i').test(original));
  if (conhecida) return conhecida.nome;
  const com = /\b(?:com|pra|para|da|do|de)\s+(?:a|o)\s+(\p{Lu}\p{Ll}+)/u.exec(original) ?? /\b(?:com|pra)\s+(\p{Lu}\p{Ll}{2,})/u.exec(original);
  if (com) return com[1]!;
  return null;
}

export function sentido(original: string, fatos?: Fatos): Sentido {
  const d = dobrar(original);
  let categoria: Categoria = 'outro';
  for (const [c, re] of REGRAS) if (re.test(d)) {
    categoria = c;
    break;
  }
  const pessoa = pessoaDe(original, fatos);
  const relDaPessoa = pessoa ? fatos?.pessoas.find((p) => p.nome === pessoa)?.rel ?? null : null;
  const suspeitaRel = !!relDaPessoa && /namorad|ficante|crush|alguém|ex/.test(relDaPessoa);
  // "sair com a Carol": sem nada que diga que é amizade, para ela é encontro
  if (pessoa && categoria === 'social' && !/\b(amigos|amigas|galera|familia|turma)\b/.test(d) && (suspeitaRel || /\bsair com\b|\bencontr/.test(d))) categoria = 'encontro';
  if (pessoa && suspeitaRel && categoria !== 'estudo' && categoria !== 'saude') categoria = categoria === 'outro' || categoria === 'lazer' ? 'encontro' : categoria;
  const suspeito = categoria === 'encontro' || suspeitaRel;
  const m = ASSUNTO.exec(d);
  const assunto = m ? m[1]!.trim() : categoria === 'estudo' ? (/\b(tcc|enem|vestibular|monografia)\b/.exec(d)?.[1] ?? null) : null;
  return { categoria, pessoa, suspeito, assunto };
}
