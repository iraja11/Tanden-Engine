/*
 * O modelo treinado e o léxico do corretor, carregados só quando ela pensa
 * pela primeira vez. O léxico junta três fontes: as palavras da gramática
 * (pesam mais), todas as palavras que ela mesma fala (o cofre tem milhares) e
 * as do léxico de sentimento. É o mesmo no treino e no app, por isso as
 * correções que o modelo viu treinando são as que ele vê aqui.
 */
import { banco, textoDe } from '../cofre';
import { carregar, indices, prever, type Amostra, type Modelo, type Previsao } from './classificador';
import { palavrasDaGramatica, type Exemplo } from './corpus';
import { MODELO_DAT } from './modelo.dat';
import { carregarRede, probabilidadesDaRede, type Rede } from './rede';
import { Lexico, normalizar, type Texto } from './texto';
import { VOCABULARIO_DAT } from './vocabulario.dat';

let lexico: Lexico | null = null;
let modelo: Modelo | null | undefined;
let rede: Rede | null | undefined;
let carregando: Promise<Rede | null> | null = null;

/** O léxico base (sem títulos de notas). */
export function lexicoBase(): Lexico {
  if (lexico) return lexico;
  const l = new Lexico();
  l.ensinar(palavrasDaGramatica(), 3);
  for (const ls of Object.values(banco().falas)) for (const x of ls) l.ensinar(textoDe(x).replace(/\{\w+\}/g, ' '), 1);
  for (const p of banco().perguntas) l.ensinar(`${p.texto} ${p.opcoes.map((o) => o.texto).join(' ')}`, 1);
  l.ensinar(PALAVRAS_COMUNS, 2);
  l.reconhecer(vocabulario());
  lexico = l;
  return l;
}

/** As palavras reais do vocabulário (vocabulario.dat.ts: prefixo comum em base 36 + o resto). */
function* vocabulario(): Generator<string> {
  let prev = '';
  for (const p of VOCABULARIO_DAT ? VOCABULARIO_DAT.split(' ') : []) {
    const w = prev.slice(0, parseInt(p[0]!, 36)) + p.slice(1);
    prev = w;
    yield w;
  }
}

/** O modelo que vem com o app (null se ainda não foi treinado). */
export function modeloPadrao(): Modelo | null {
  if (modelo === undefined) modelo = MODELO_DAT ? carregar(MODELO_DAT) : null;
  return modelo;
}

/** Troca o modelo em uso (testes, ou um modelo treinado na GPU carregado em tempo de execução). */
export function usarModelo(m: Modelo | null): void {
  modelo = m;
}

/**
 * A rede neural (~6 MB) vem num pedaço separado do app e carrega em segundo
 * plano: enquanto não chega, quem entende é o modelo antigo. Chame cedo (o app
 * chama quando ela acorda; os testes, antes de começar).
 */
export function prepararRede(): Promise<Rede | null> {
  if (rede !== undefined) return Promise.resolve(rede);
  carregando ??= import('./rede.dat')
    .then(({ REDE_DAT }) => (rede = REDE_DAT ? carregarRede(REDE_DAT) : null))
    .catch(() => (rede = null));
  return carregando;
}

/** A rede, se já carregou. */
export function redePadrao(): Rede | null {
  return rede ?? null;
}

/** Troca a rede em uso (testes e o script de treino); null desliga. */
export function usarRede(r: Rede | null): void {
  rede = r;
}

/** Quanto a rede pesa na decisão quando os dois modelos conhecem as mesmas intenções. */
const PESO_REDE = 0.75;

/**
 * A intenção de um texto: a rede neural, somada ao modelo antigo (bolsa de
 * palavras) quando os dois conhecem as mesmas intenções. Os dois erram em
 * coisas diferentes: a rede vê ordem e contexto, o antigo é mais firme com
 * palavra-chave solta. Sem rede, só o antigo.
 */
export function classificar(t: Texto, m: Modelo | null = modeloPadrao(), r: Rede | null = redePadrao()): Previsao | null {
  if (!r) return m ? prever(m, t) : null;
  const { p, conhecidas } = probabilidadesDaRede(r, t);
  const final = Float32Array.from(p);
  if (m && m.rotulos.length === r.rotulos.length && m.rotulos.every((x, i) => x === r.rotulos[i])) {
    const a = prever(m, t, m.rotulos.length);
    const pa = new Map(a.top);
    for (let i = 0; i < final.length; i++) final[i] = PESO_REDE * p[i]! + (1 - PESO_REDE) * (pa.get(r.rotulos[i]!) ?? 0);
  }
  const ordem = [...final.keys()].sort((x, y) => final[y]! - final[x]!);
  const top = ordem.slice(0, 3).map((i) => [r.rotulos[i]!, final[i]!] as [string, number]);
  return { rotulo: top[0]![0], p: top[0]![1], top, conhecidas };
}

/** Exemplos de texto → amostras (índices) para o treino. */
export function amostrar(ex: Exemplo[], rotulos: readonly string[], buckets: number): Amostra[] {
  const lx = lexicoBase();
  const pos = new Map(rotulos.map((r, i) => [r, i]));
  return ex.map((e) => ({ ids: indices(normalizar(e.texto, lx), buckets), y: pos.get(e.rotulo)! }));
}

/** Palavras do dia a dia que não estão na gramática nem nas falas, para o corretor não "consertar" o que está certo. */
const PALAVRAS_COMUNS = `
casa carro rua cidade trabalho escola faculdade amigo amiga familia mae pai irmao irma filho filha namorado namorada marido esposa
comida agua cafe cerveja vinho pao arroz feijao carne frango peixe salada fruta banana maca bolo doce chocolate sorvete pizza lanche
dia noite manha tarde semana mes ano hora minuto segundo ontem hoje amanha sempre nunca agora depois antes cedo tarde logo ainda
bom mau bem mal grande pequeno novo velho bonito feio facil dificil certo errado rapido devagar alto baixo cheio vazio quente frio
fazer ter ser estar ir vir ver dar saber poder querer dizer falar pensar achar ficar passar deixar levar trazer comprar vender pagar
abrir fechar ligar desligar comecar terminar acabar voltar sair entrar subir descer correr andar dormir acordar comer beber ler escrever
estudar trabalhar jogar assistir ouvir cantar dancar desenhar pintar cozinhar limpar lavar arrumar viajar morar nascer morrer viver
gente pessoa coisa vez parte lugar mundo vida tempo jeito forma caso ponto problema questao ideia historia livro filme serie musica jogo
celular computador internet wifi senha email mensagem foto video arquivo pasta pagina site link nota notas texto titulo lista tarefa
dinheiro conta boleto banco cartao preco valor compra loja mercado farmacia hospital medico dentista remedio consulta exame prova aula
professor professora aluno curso materia trabalho tcc projeto reuniao chefe cliente empresa emprego salario ferias fim semana feriado
cachorro gato passaro peixe cavalo vaca porco galinha rato barata aranha cobra leao tigre urso lobo raposa coelho
azul vermelho verde amarelo preto branco roxo rosa laranja cinza marrom dourado prateado
um dois tres quatro cinco seis sete oito nove dez cem mil primeiro segundo terceiro ultimo meio metade dobro
sim nao talvez claro obvio certeza duvida verdade mentira serio brincadeira sério
`;
