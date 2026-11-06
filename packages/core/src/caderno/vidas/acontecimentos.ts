import type { Rng } from '../../rpg/dice';
import type { Vidas } from './motor';
import type { Categoria, Pessoa, TomVida } from './tipos';

/*
 * Acontecimentos: o acaso da vida, em quatro tons.
 *
 * Além do que as pessoas escolhem fazer (conversar, flertar, brigar), a vida
 * apronta: fadas, maldições e profecias (fantasia); gansos furiosos, apostas
 * idiotas e perucas voando no sermão (cômico); noites proibidas, bordéis,
 * chantagens e vícios, sempre só entre adultos (adulto); incêndios,
 * julgamentos, dívidas e atos de coragem (sério).
 *
 * Cada tom tem um ajuste no mundo (0 = nunca, 1 = normal, 3 = o triplo):
 * dá para ter um mundo só de comédia, ou um drama sombrio sem nada de magia.
 * Os acontecimentos marcam a crônica com o tom (dá para filtrar).
 */

export interface Acontecimento {
  id: string;
  nome: string;
  tom: TomVida;
  cat: Categoria;
  /** precisa de outra pessoa por perto */
  alvo: boolean;
  /** peso relativo (padrão 1) */
  peso?: number;
  pode?(s: Vidas, a: Pessoa, b: Pessoa | null): boolean;
  fazer(s: Vidas, a: Pessoa, b: Pessoa | null): void;
}

/** Estados que passam (com ícone na tela); alguns tiram a pessoa de cena enquanto duram. */
export const ESTADOS_VIDA: Record<string, { nome: string; icone: string; bloqueia?: boolean; fim?: string }> = {
  enlutado: { nome: 'de luto', icone: '🖤' },
  doente: { nome: 'doente', icone: '🤒' },
  vigiado: { nome: 'vigiado', icone: '👁' },
  sapo: { nome: 'transformado em sapo', icone: '🐸', bloqueia: true, fim: '{a} volta a ser gente, com uma vontade estranha de comer moscas.' },
  preso: { nome: 'na prisão', icone: '⛓', bloqueia: true, fim: '{a} sai da prisão, mais magr{o/a} e mais calad{o/a}.' },
  sumido: { nome: 'no reino das fadas', icone: '🍄', bloqueia: true, fim: '{a} reaparece no círculo de cogumelos jurando que passou só uma noite fora.' },
  amaldicoado: { nome: 'sob uma maldição', icone: '🌑', fim: 'A maldição sobre {a} se desfaz numa noite sem lua.' },
  apaixonado: { nome: 'enfeitiçado de amor', icone: '💘' },
  ressaca: { nome: 'de ressaca', icone: '🥴' },
  envergonhado: { nome: 'morrendo de vergonha', icone: '🙈' },
};

const T = (p: Pessoa, ...ids: string[]) => ids.some((x) => p.tracos.includes(x));
const o = (s: Vidas, p: Pessoa) => s.g(p, 'o', 'a');
const pick = <X>(s: Vidas, l: readonly X[]): X => s.pick(l);
const adultos = (s: Vidas, a: Pessoa, b: Pessoa | null) => s.adulto(a) && (!b || s.adulto(b));
/** Romance possível (adultos, não parentes, espécies que cruzam) e `a` sente atração por gente como `b`. */
const quer = (s: Vidas, a: Pessoa, b: Pessoa | null) => !!b && s.podeRomance(a.id, b.id) && s.atraido(a.id, b.id);
const L = (s: Vidas, p: Pessoa) => s.L(p.id);
const fala = (s: Vidas, a: Pessoa, cat: Categoria, id: string, texto: string, quem: Pessoa[], peso = 1, segredo = false) =>
  s.say(cat, id, texto, quem.map((x) => x.id), peso, segredo);

export const ACONTECIMENTOS: Acontecimento[] = [
  // ================================================================ fantasia
  {
    id: 'fada_desejo', nome: 'Uma fada concede um desejo', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.8,
    fazer: (s, a) => {
      const meta = a.meta?.tipo;
      let qual: string;
      if (meta === 'riqueza' || a.dinheiro < 5) {
        a.dinheiro += 80;
        qual = 'pede ouro, e acorda com um baú de moedas debaixo da cama';
      } else if ((meta === 'amor' || meta === 'conquistar') && s.adulto(a)) {
        const alvo = s.aoRedor(a).map((x) => s.vivo(x)).find((x): x is Pessoa => !!x && s.podeRomance(a.id, x.id) && s.atraido(x.id, a.id));
        if (alvo) {
          s.mexe(alvo.id, a.id, { atracao: 40, intimidade: 10 });
          qual = `pede amor, e no dia seguinte ${L(s, alvo)} não consegue tirar os olhos de ${L(s, a)}`;
        } else {
          a.humor = Math.min(100, a.humor + 30);
          qual = 'pede amor, e a fada responde que primeiro é preciso se amar; sai estranhamente feliz';
        }
      } else if (meta === 'saber') {
        s.sobe(a, 'saber', 4);
        qual = 'pede sabedoria, e passa a sonhar com livros que nunca leu';
      } else {
        a.saude = 100;
        a.humor = Math.min(100, a.humor + 25);
        qual = 'pede saúde, e nunca mais sente aquela dor nas costas';
      }
      fala(s, a, 'acaso', 'fada', `✨ Uma fada aparece para ${L(s, a)} ao pé de um cogumelo. ${s.g(a, 'Ele', 'Ela')} ${qual}.`, [a], 2);
    },
  },
  {
    id: 'sapo', nome: 'Vira sapo', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.6,
    fazer: (s, a) => {
      a.estados['sapo'] = s.t + 2 + Math.floor(s.entre(0, 6));
      const por = pick(s, ['uma bruxa do pântano a quem deveu dinheiro', 'um mago que não gostou de ser chamado de "vovô"', 'uma fada ofendida com um espirro', 'um feiticeiro que errou o alvo']);
      fala(s, a, 'acaso', 'sapo', `🐸 ${L(s, a)} irrita ${por} e vira sapo. A vila inteira vai olhar o laguinho.`, [a], 2);
      const c = s.conjuge(a);
      if (c) fala(s, a, 'acaso', 'sapo', `${L(s, c)} leva ${s.g(a, 'o marido', 'a esposa')} sapo num balde para todo lado.`, [c, a], 1);
    },
  },
  {
    id: 'profecia', nome: 'Uma profecia', tom: 'fantasia', cat: 'acaso', alvo: false,
    pode: (s, a) => s.adulto(a),
    fazer: (s, a) => {
      const r = s.entre(0, 3);
      if (r < 1) {
        a.meta = { tipo: 'fama', desde: s.t };
        if (!T(a, 'ambicioso', 'acomodado')) s.ganhaTraco(a, 'ambicioso', false);
        fala(s, a, 'acaso', 'profecia', `🔮 Uma vidente cega agarra o braço de ${L(s, a)}: "um dia você vai usar uma coroa". ${s.g(a, 'Ele', 'Ela')} nunca mais é ${s.g(a, 'o mesmo', 'a mesma')}.`, [a], 2);
      } else if (r < 2) {
        s.estresse(a, 25);
        if (!T(a, 'desconfiado', 'ingenuo')) s.ganhaTraco(a, 'desconfiado', false);
        fala(s, a, 'acaso', 'profecia', `🔮 Uma vidente diz a ${L(s, a)} que vai morrer pelas mãos de quem ama. ${s.g(a, 'Ele', 'Ela')} passa a dormir com uma faca debaixo do travesseiro.`, [a], 2);
      } else {
        if (!s.comprometido(a)) a.meta = { tipo: 'amor', desde: s.t };
        s.humor(a, 15);
        fala(s, a, 'acaso', 'profecia', `🔮 Uma vidente promete a ${L(s, a)} um grande amor "sob a próxima lua cheia". ${s.g(a, 'Ele', 'Ela')} conta os dias.`, [a], 1);
      }
    },
  },
  {
    id: 'fantasma', nome: 'O fantasma de alguém querido', tom: 'fantasia', cat: 'acaso', alvo: false,
    pode: (s, a) => mortoQuerido(s, a) !== null,
    fazer: (s, a) => {
      const m = mortoQuerido(s, a)!;
      const crime = s.segredos.find((x) => x.tipo === 'assassinato' && x.sobre[1] === m.id && !x.sabem.includes(a.id));
      if (crime) {
        crime.sabem.push(a.id);
        const assassino = s.pessoa(crime.sobre[0]!);
        if (assassino) {
          s.lembra(a.id, assassino.id, `matou ${m.nome}`, -70, 240);
          if (assassino.morte === null) a.meta = { tipo: 'vinganca', alvo: assassino.id, desde: s.t };
          fala(s, a, 'acaso', 'fantasma', `👻 O fantasma de ${L(s, m)} aparece para ${L(s, a)} e sussurra um nome: ${L(s, assassino)}.`, [a, m, assassino], 3);
          return;
        }
      }
      s.humor(a, s.entre(-15, 20));
      fala(s, a, 'acaso', 'fantasma', `👻 ${L(s, a)} jura que ${L(s, m)} sentou na beira da cama ${pick(s, ['e pediu para cuidar das plantas', 'e riu como antigamente', 'e disse que estava tudo bem', 'e reclamou do pão'])}.`, [a, m], 1);
    },
  },
  {
    id: 'espada_pedra', nome: 'Arranca a espada da pedra', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.15,
    pode: (s, a) => s.adulto(a) && !T(a, 'heroi') && (T(a, 'corajoso', 'honesto') || a.hab.combate > 8),
    fazer: (s, a) => {
      s.ganhaTraco(a, 'heroi', false);
      s.sobe(a, 'combate', 3);
      fala(s, a, 'acaso', 'espada', `🗡 Numa clareira esquecida, ${L(s, a)} puxa uma espada cravada numa pedra, e ela sai. Os sinos da vila tocam sozinhos.`, [a], 3);
      s.emitir('lenda', [a.id]);
    },
  },
  {
    id: 'dragao', nome: 'Um dragão passa', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.4,
    pode: (s, a) => s.adulto(a),
    fazer: (s, a) => {
      if (T(a, 'corajoso') && a.hab.combate > 9 && s.chance(0.35)) {
        s.ganhaTraco(a, 'heroi', false);
        fala(s, a, 'acaso', 'dragao', `🐉 Um dragão desce sobre os campos; ${L(s, a)} o espanta com uma lança e uma coragem que ninguém sabia que ${s.g(a, 'ele', 'ela')} tinha.`, [a], 3);
      } else {
        a.dinheiro *= 0.6;
        s.estresse(a, 15);
        fala(s, a, 'acaso', 'dragao', `🐉 Um dragão passa sobre ${s.lugarNome(a.local)} e leva ${pick(s, ['as ovelhas', 'o celeiro inteiro', 'o telhado', 'a vaca premiada'])} de ${L(s, a)}.`, [a], 2);
      }
    },
  },
  {
    id: 'pocao_amor', nome: 'Poção do amor', tom: 'fantasia', cat: 'romance', alvo: true, peso: 0.7,
    pode: (s, a, b) => quer(s, a, b) && s.atracao(a.id, b!.id) > 40 && !s.comprometido(a),
    fazer: (s, a, b) => {
      const B = b!;
      B.estados['apaixonado'] = s.t + 6;
      s.mexe(B.id, a.id, { atracao: 45, intimidade: 12, afeto: 10 });
      fala(s, a, 'romance', 'pocao', `💘 🤫 ${L(s, a)} pinga uma poção do amor no vinho de ${L(s, B)}. Funciona até bem demais.`, [a, B], 2, true);
    },
  },
  {
    id: 'pacto', nome: 'Pacto na encruzilhada', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.35,
    pode: (s, a) => s.adulto(a) && !T(a, 'pactuado') && (T(a, 'ganancioso', 'ambicioso', 'cinico') || a.dinheiro < 3),
    fazer: (s, a) => {
      a.dinheiro += 150;
      s.ganhaTraco(a, 'pactuado', false);
      fala(s, a, 'acaso', 'pacto', `🌑 🤫 À meia-noite, numa encruzilhada, ${L(s, a)} aperta a mão de um estranho de olhos vermelhos. No dia seguinte é ric${o(s, a)}. O preço vem depois.`, [a], 2, true);
    },
  },
  {
    id: 'cobranca_pacto', nome: 'O pacto cobra', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 3,
    pode: (s, a) => T(a, 'pactuado') && s.chance(0.25),
    fazer: (s, a) => {
      const r = s.entre(0, 3);
      if (r < 1 && !a.protegido) {
        s.morrer(a, 'numa noite de tempestade, levado pelo estranho de olhos vermelhos');
      } else if (r < 2) {
        a.dinheiro = 0;
        s.perdeTraco(a, 'pactuado');
        s.ganhaTraco(a, 'amaldicoado', false);
        a.estados['amaldicoado'] = s.t + 36;
        fala(s, a, 'acaso', 'pacto', `🌑 O estranho volta para cobrar: ${L(s, a)} perde tudo o que ganhou, e mais um pouco.`, [a], 3);
      } else {
        s.perdeTraco(a, 'pactuado');
        s.ganhaTraco(a, 'heroi', false);
        fala(s, a, 'acaso', 'pacto', `🌑 ${L(s, a)} engana o diabo num jogo de dados e rasga o contrato. A vila conta essa história por gerações.`, [a], 3);
      }
    },
  },
  {
    id: 'lobisomem', nome: 'Mordida na lua cheia', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.25,
    pode: (s, a) => s.adulto(a) && !T(a, 'licantropo'),
    fazer: (s, a) => {
      s.ganhaTraco(a, 'licantropo', false);
      s.ferir(a, false);
      fala(s, a, 'acaso', 'lobisomem', `🌕 🤫 Voltando para casa numa noite de lua cheia, ${L(s, a)} é ${s.g(a, 'mordido', 'mordida')} por algo grande demais para ser um cão.`, [a], 2, true);
    },
  },
  {
    id: 'lua_cheia', nome: 'Noite de lobisomem', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 4,
    pode: (s, a) => T(a, 'licantropo'),
    fazer: (s, a) => {
      const vitima = s.aoRedor(a).map((x) => s.vivo(x)).find((x): x is Pessoa => !!x && s.adulto(x));
      if (vitima && s.chance(0.3 * s.ajustes.violencia)) {
        s.briga(a, vitima, 'emboscada');
        fala(s, a, 'acaso', 'lobisomem', `🌕 Algo ataca ${L(s, vitima)} no escuro. Ninguém sabe que era ${L(s, a)}.`, [vitima], 2);
      } else {
        a.estados['envergonhado'] = s.t + 1;
        fala(s, a, 'acaso', 'lobisomem', `🌕 ${L(s, a)} acorda nu${s.g(a, '', 'a')} no bosque, coberto de lama e com uma galinha inteira no estômago. De novo.`, [a], 1);
      }
    },
  },
  {
    id: 'tesouro_goblin', nome: 'Segue um goblin', tom: 'fantasia', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      if (s.chance(0.55)) {
        const v = Math.round(s.entre(20, 70));
        a.dinheiro += v;
        fala(s, a, 'acaso', 'goblin', `✨ ${L(s, a)} segue um goblin até a toca dele e sai de lá com ${v} moedas e uma colher de prata.`, [a], 1);
      } else {
        s.ferir(a, false);
        fala(s, a, 'acaso', 'goblin', `✨ ${L(s, a)} segue um goblin até a toca dele. Era uma armadilha. Era sempre uma armadilha.`, [a], 1);
      }
    },
  },
  {
    id: 'estrela', nome: 'Uma estrela cai no quintal', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.4,
    pode: (s, a) => !T(a, 'abencoado'),
    fazer: (s, a) => {
      s.ganhaTraco(a, 'abencoado', false);
      s.humor(a, 20);
      fala(s, a, 'acaso', 'estrela', `🌠 Uma estrela cai no quintal de ${L(s, a)} e não se apaga. Dizem que quem a toca tem sorte para sempre.`, [a], 2);
    },
  },
  {
    id: 'bruxa_pantano', nome: 'Amaldiçoado por uma bruxa', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.6,
    pode: (s, a) => !a.estados['amaldicoado'],
    fazer: (s, a) => {
      a.estados['amaldicoado'] = s.t + 12 + Math.floor(s.entre(0, 24));
      a.saude = Math.max(0, a.saude - 10);
      const qual = pick(s, ['nunca mais acertar uma receita', 'ouvir sinos onde não há sinos', 'ser seguid' + o(s, a) + ' por corvos', 'espirrar toda vez que mentir']);
      fala(s, a, 'acaso', 'maldicao', `🌑 Uma bruxa do pântano amaldiçoa ${L(s, a)} a ${qual}.`, [a], 2);
    },
  },
  {
    id: 'troca_corpos', nome: 'Troca de corpos', tom: 'fantasia', cat: 'social', alvo: true, peso: 0.3,
    pode: (s, a, b) => adultos(s, a, b),
    fazer: (s, a, b) => {
      const B = b!;
      for (const [x, y] of [[a, B], [B, a]] as const) s.mexe(x.id, y.id, { intimidade: 25, respeito: 15, afeto: 8 });
      fala(s, a, 'acaso', 'troca', `✨ ${L(s, a)} e ${L(s, B)} acordam um no corpo do outro e passam uma semana assim. Depois disso, se entendem como ninguém.`, [a, B], 2);
    },
  },
  {
    id: 'circulo_fadas', nome: 'Levado pelas fadas', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.2,
    pode: (s, a) => !a.gravidez && !s.conjuge(a)?.gravidez,
    fazer: (s, a) => {
      a.estados['sumido'] = s.t + 3 + Math.floor(s.entre(0, 18));
      if (!T(a, 'vidente')) s.ganhaTraco(a, 'vidente', false);
      fala(s, a, 'acaso', 'fadas', `🍄 ${L(s, a)} dança dentro de um círculo de cogumelos e some no ar.`, [a], 3);
    },
  },
  {
    id: 'gato_fala', nome: 'O gato fala', tom: 'fantasia', cat: 'acaso', alvo: false, peso: 0.5,
    fazer: (s, a) => {
      if (!T(a, 'curioso', 'tradicional')) s.ganhaTraco(a, 'curioso', false);
      fala(s, a, 'acaso', 'gato', `🐈 O gato de ${L(s, a)} começa a falar. Só com ${s.g(a, 'ele', 'ela')}, e só para ${pick(s, ['dar conselhos amorosos péssimos', 'reclamar da comida', 'contar fofocas dos vizinhos', 'recitar poesia ruim'])}.`, [a], 1);
    },
  },

  // ================================================================ cômico
  {
    id: 'chafariz', nome: 'Cai no chafariz', tom: 'comico', cat: 'romance', alvo: true,
    pode: (s, a, b) => quer(s, a, b),
    fazer: (s, a, b) => {
      const B = b!;
      const fofo = s.chance(0.4);
      s.mexe(B.id, a.id, { atracao: fofo ? 8 : -4, afeto: 4 });
      a.estados['envergonhado'] = s.t + 1;
      fala(s, a, 'acaso', 'chafariz', `🤡 ${L(s, a)} tenta impressionar ${L(s, B)} dançando e cai de costas no chafariz. ${fofo ? `${L(s, B)} acha fofo.` : `${L(s, B)} ri até chorar.`}`, [a, B], 1);
    },
  },
  {
    id: 'cabra', nome: 'A cabra rebelde', tom: 'comico', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      const padre = s.aoRedor(a).map((x) => s.vivo(x)).find((x): x is Pessoa => !!x && x.prof === 'sacerdote');
      if (padre) {
        s.mexe(padre.id, a.id, { afeto: -8 });
        fala(s, a, 'acaso', 'cabra', `🐐 A cabra de ${L(s, a)} come o chapéu de ${L(s, padre)} no meio da missa.`, [a, padre], 1);
      } else fala(s, a, 'acaso', 'cabra', `🐐 A cabra de ${L(s, a)} foge, invade o mercado e derruba ${pick(s, ['três barracas de frutas', 'a torre de queijos', 'um bispo de passagem', 'o palanque do prefeito'])}.`, [a], 1);
    },
  },
  {
    id: 'aposta', nome: 'Aposta perdida', tom: 'comico', cat: 'social', alvo: true,
    pode: (s, a, b) => adultos(s, a, b),
    fazer: (s, a, b) => {
      const B = b!;
      const castigo = pick(s, ['atravessar a praça de ceroulas', 'cantar no telhado da taverna', 'beijar a vaca do vizinho', 'usar um chapéu de penas por uma semana', 'pedir desculpas a uma árvore']);
      s.humor(a, -10);
      s.humor(B, 12);
      s.mexe(a.id, B.id, { intimidade: 6 });
      s.mexe(B.id, a.id, { intimidade: 6, afeto: 4 });
      a.estados['envergonhado'] = s.t + 1;
      fala(s, a, 'acaso', 'aposta', `🤡 ${L(s, a)} perde uma aposta para ${L(s, B)} e tem que ${castigo}.`, [a, B], 1);
    },
  },
  {
    id: 'gansos', nome: 'Perseguido por gansos', tom: 'comico', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      s.humor(a, -5);
      fala(s, a, 'acaso', 'gansos', `🪿 ${L(s, a)} é ${s.g(a, 'perseguido', 'perseguida')} por gansos furiosos ${pick(s, ['até o rio', 'por três ruas', 'até dentro da igreja', 'até subir numa árvore'])}. A vila não fala de outra coisa.`, [a], 1);
    },
  },
  {
    id: 'sal_acucar', nome: 'Sal no bolo', tom: 'comico', cat: 'acaso', alvo: false,
    pode: (s, a) => s.adulto(a),
    fazer: (s, a) => {
      for (const x of s.aoRedor(a).slice(0, 4)) s.mexe(x, a.id, { afeto: -2 });
      fala(s, a, 'acaso', 'bolo', `🤡 ${L(s, a)} confunde sal com açúcar no bolo da festa. Os convidados sorriem com a boca cheia e os olhos marejados.`, [a], 1);
    },
  },
  {
    id: 'declaracao_bebada', nome: 'Declaração bêbada', tom: 'comico', cat: 'romance', alvo: true,
    pode: (s, a, b) => quer(s, a, b) && (T(a, 'alcoolatra') || a.gostos.includes('bebida') || !!a.estados['bebado']),
    fazer: (s, a, b) => {
      const B = b!;
      const deu = s.chance(0.3);
      s.mexe(B.id, a.id, { atracao: deu ? 12 : -3, intimidade: 4 });
      a.estados['ressaca'] = s.t + 1;
      fala(s, a, 'acaso', 'bebado', `🍺 Bêbad${o(s, a)}, ${L(s, a)} faz uma declaração de amor emocionada a um poste, e depois a ${L(s, B)}. ${deu ? 'A segunda funciona.' : 'Nenhum dos dois responde.'}`, [a, B], 1);
    },
  },
  {
    id: 'carta_errada', nome: 'Carta de amor no endereço errado', tom: 'comico', cat: 'romance', alvo: true,
    pode: (s, a, b) => s.adulto(a) && !!b && s.adulto(b) && !s.parentesco(a.id, b.id),
    fazer: (s, a, b) => {
      const B = b!;
      const virou = quer(s, B, a) && s.chance(0.35);
      if (virou) s.mexe(B.id, a.id, { atracao: 20, intimidade: 6 });
      else s.mexe(B.id, a.id, { respeito: -4 });
      fala(s, a, 'acaso', 'carta', `💌 Uma carta de amor de ${L(s, a)} vai parar nas mãos de ${L(s, B)}, a pessoa errada. ${virou ? `${L(s, B)} lê três vezes e resolve responder.` : `${L(s, B)} lê em voz alta na taverna.`}`, [a, B], 1);
    },
  },
  {
    id: 'ronco', nome: 'O ronco', tom: 'comico', cat: 'familia', alvo: false,
    pode: (s, a) => !!s.conjuge(a),
    fazer: (s, a) => {
      const c = s.conjuge(a)!;
      s.mexe(c.id, a.id, { afeto: -3 });
      fala(s, a, 'acaso', 'ronco', `😴 O ronco de ${L(s, a)} faz ${L(s, c)} ir dormir no celeiro, com as vacas. As vacas também reclamam.`, [a, c], 1);
    },
  },
  {
    id: 'concurso_tortas', nome: 'Concurso de tortas', tom: 'comico', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      a.saude = Math.max(5, a.saude - 8);
      s.humor(a, 15);
      fala(s, a, 'acaso', 'tortas', `🥧 ${L(s, a)} vence o concurso de comer tortas com ${Math.round(s.entre(11, 23))} tortas e passa três dias sem conseguir se abaixar.`, [a], 1);
    },
  },
  {
    id: 'telhado', nome: 'Preso no telhado', tom: 'comico', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      if (s.chance(0.25)) s.ferir(a, false);
      fala(s, a, 'acaso', 'telhado', `🐈 ${L(s, a)} sobe no telhado para salvar um gato e fica ${s.g(a, 'preso', 'presa')} lá a tarde toda. O gato desce sozinho.`, [a], 1);
    },
  },
  {
    id: 'nome_do_ex', nome: 'Chama pelo nome do ex', tom: 'comico', cat: 'romance', alvo: false,
    pode: (s, a) => !!s.parceiro(a) && s.ligados(a.id).some((x) => s.temVinc(a.id, x, 'ex')),
    fazer: (s, a) => {
      const p = s.parceiro(a)!;
      const ex = s.pessoa(s.ligados(a.id).find((x) => s.temVinc(a.id, x, 'ex'))!)!;
      s.mexe(p.id, a.id, { afeto: -12, confianca: -6 });
      s.lembra(p.id, a.id, `me chamou de ${ex.nome}`, -10, 24);
      fala(s, a, 'acaso', 'ex', `😬 No meio de um beijo, ${L(s, a)} chama ${L(s, p)} de "${ex.nome.split(' ')[0]}". Silêncio.`, [a, p], 2);
    },
  },
  {
    id: 'peruca', nome: 'A peruca voa', tom: 'comico', cat: 'acaso', alvo: false,
    pode: (s, a) => s.idade(a) > 35,
    fazer: (s, a) => {
      a.estados['envergonhado'] = s.t + 2;
      s.humor(a, -10);
      fala(s, a, 'acaso', 'peruca', `🤡 Uma ventania arranca a peruca de ${L(s, a)} no meio do sermão e a pendura no sino da igreja. Ninguém sabia.`, [a], 1);
    },
  },
  {
    id: 'galinha', nome: 'Presente vivo', tom: 'comico', cat: 'social', alvo: true,
    fazer: (s, a, b) => {
      const B = b!;
      s.mexe(B.id, a.id, { afeto: 4, intimidade: 3 });
      fala(s, a, 'acaso', 'galinha', `🐔 ${L(s, a)} dá a ${L(s, B)} uma galinha viva de presente. ${L(s, B)} não sabe o que fazer com ela e dá o nome de ${pick(s, ['Duquesa', 'Bartolomeu', 'Dona Penosa', 'General'])}.`, [a, B], 1);
    },
  },
  {
    id: 'porco_chapeu', nome: 'Viu um porco de chapéu', tom: 'comico', cat: 'acaso', alvo: false,
    fazer: (s, a) => {
      for (const x of s.aoRedor(a).slice(0, 5)) s.mexe(x, a.id, { respeito: -3 });
      fala(s, a, 'acaso', 'porco', `🐖 ${L(s, a)} jura a quem quiser ouvir que viu um porco ${pick(s, ['de chapéu e bengala', 'lendo o jornal', 'dançando valsa', 'cobrando impostos'])}. Ninguém acredita.`, [a], 1);
    },
  },
  {
    id: 'janela_errada', nome: 'Serenata na janela errada', tom: 'comico', cat: 'romance', alvo: true,
    pode: (s, a, b) => s.adulto(a) && !!b && quer(s, b, a) && !s.comprometido(b),
    fazer: (s, a, b) => {
      const B = b!;
      s.mexe(B.id, a.id, { atracao: 22, intimidade: 8 });
      fala(s, a, 'acaso', 'serenata', `🎻 ${L(s, a)} canta a noite inteira embaixo da janela errada e conquista, sem querer, ${L(s, B)}.`, [a, B], 2);
    },
  },
  {
    id: 'guerra_comida', nome: 'Guerra de comida', tom: 'comico', cat: 'social', alvo: true,
    pode: (s, a, b) => !!b && s.opiniao(a.id, b.id) < 10,
    fazer: (s, a, b) => {
      const B = b!;
      for (const [x, y] of [[a, B], [B, a]] as const) s.mexe(x.id, y.id, { intimidade: 8, afeto: 6 });
      s.humor(a, 10);
      s.humor(B, 10);
      fala(s, a, 'acaso', 'comida', `🍅 Uma discussão entre ${L(s, a)} e ${L(s, B)} vira guerra de tomates no mercado. Os dois terminam rindo, cobertos de molho.`, [a, B], 1);
    },
  },

  // ================================================================ adulto (só entre adultos)
  {
    id: 'noite_proibida', nome: 'Noite proibida', tom: 'adulto', cat: 'romance', alvo: true, peso: 1.2,
    pode: (s, a, b) => quer(s, a, b) && quer(s, b!, a) && s.atracao(a.id, b!.id) > 35 && !s.temVinc(a.id, b!.id, 'amantes') && a.conjuge !== b!.id,
    fazer: (s, a, b) => {
      const B = b!;
      const onde = pick(s, ['no palheiro', 'na adega da taverna', 'atrás do moinho', 'na casa de banhos', 'na cabana do caçador']);
      s.mexe(a.id, B.id, { intimidade: 15, atracao: 8 });
      s.mexe(B.id, a.id, { intimidade: 15, atracao: 8 });
      if (s.comprometido(a) || s.comprometido(B)) {
        fala(s, a, 'romance', 'noite', `🔥 🤫 ${L(s, a)} e ${L(s, B)} passam uma noite proibida ${onde}.`, [a, B], 2, true);
        s.comecarCaso(a, B);
      } else {
        fala(s, a, 'romance', 'noite', `🔥 ${L(s, a)} e ${L(s, B)} passam a noite juntos ${onde}. A vila finge que não viu.`, [a, B], 2);
        if (s.chance(0.35)) s.liga(a.id, B.id, 'namoro');
      }
      s.conceber(a, B, 0.6);
    },
  },
  {
    id: 'bordel', nome: 'Noite na casa da Madame', tom: 'adulto', cat: 'romance', alvo: false,
    pode: (s, a) => s.adulto(a) && a.dinheiro > 12 && a.orientacao !== 'ace' && !T(a, 'casto'),
    fazer: (s, a) => {
      const gasto = Math.round(Math.min(a.dinheiro, s.entre(8, 30)));
      a.dinheiro -= gasto;
      s.humor(a, 12);
      const par = s.parceiro(a);
      if (par && s.chance(0.3 * s.ajustes.drama)) {
        s.lembra(par.id, a.id, 'foi ao bordel', -30, 60);
        s.mexe(par.id, a.id, { confianca: -20 });
        fala(s, a, 'romance', 'bordel', `🔥 ${L(s, a)} gasta ${gasto} moedas na casa da Madame Rosa, e ${L(s, par)} fica sabendo pela vizinha.`, [a, par], 2);
      } else fala(s, a, 'romance', 'bordel', `🔥 🤫 ${L(s, a)} gasta ${gasto} moedas numa noite na casa da Madame Rosa.`, [a], 1, !!par);
    },
  },
  {
    id: 'chantagem', nome: 'Chantagem', tom: 'adulto', cat: 'conflito', alvo: true,
    pode: (s, a, b) => adultos(s, a, b) && !!b && s.segredos.some((x) => !x.publico && x.sobre.includes(b.id) && x.sabem.includes(a.id) && !x.sobre.includes(a.id)) && !T(a, 'honesto', 'gentil'),
    fazer: (s, a, b) => {
      const B = b!;
      const seg = s.segredos.find((x) => !x.publico && x.sobre.includes(B.id) && x.sabem.includes(a.id) && !x.sobre.includes(a.id))!;
      if (B.dinheiro > 15 && s.chance(0.6)) {
        const v = s.dar(B, a, Math.round(B.dinheiro * 0.4));
        s.lembra(B.id, a.id, 'me chantageou', -45, 120);
        fala(s, a, 'conflito', 'chantagem', `🔥 🤫 ${L(s, a)} chantageia ${L(s, B)}: ou paga, ou todo mundo fica sabendo. ${L(s, B)} paga ${v} moedas.`, [a, B], 2, true);
      } else {
        for (const x of s.aoRedor(a)) if (!seg.sabem.includes(x)) seg.sabem.push(x);
        s.lembra(B.id, a.id, 'espalhou meu segredo', -60, 180);
        fala(s, a, 'conflito', 'chantagem', `🔥 ${L(s, B)} se recusa a pagar a chantagem de ${L(s, a)}, e o segredo cai na boca do povo.`, [a, B], 2);
        s.publicar(seg);
      }
    },
  },
  {
    id: 'banho_rio', nome: 'Flagra no banho do rio', tom: 'adulto', cat: 'romance', alvo: true,
    pode: (s, a, b) => quer(s, b!, a),
    fazer: (s, a, b) => {
      const B = b!;
      s.mexe(B.id, a.id, { atracao: 14 });
      const gostou = T(a, 'luxurioso', 'devasso') || s.chance(0.3);
      if (!gostou) a.estados['envergonhado'] = s.t + 1;
      fala(s, a, 'romance', 'banho', `🔥 ${L(s, B)} flagra ${L(s, a)} tomando banho nu${s.g(a, '', 'a')} no rio. ${gostou ? `${L(s, a)} acena.` : `${L(s, a)} afunda até o nariz.`}`, [a, B], 1);
    },
  },
  {
    id: 'erva_sonho', nome: 'A erva-de-sonho', tom: 'adulto', cat: 'vida', alvo: false,
    pode: (s, a) => s.adulto(a) && !T(a, 'viciado'),
    fazer: (s, a) => {
      a.dinheiro = Math.max(0, a.dinheiro - 6);
      if (s.chance(T(a, 'impulsivo', 'melancolico', 'alcoolatra') ? 0.5 : 0.25)) {
        s.ganhaTraco(a, 'viciado', false);
        fala(s, a, 'vida', 'vicio', `🔥 ${L(s, a)} prova a erva-de-sonho num beco do porto e não consegue mais parar.`, [a], 2);
      } else fala(s, a, 'vida', 'vicio', `🔥 ${L(s, a)} prova a erva-de-sonho num beco do porto e passa a noite conversando com a lua.`, [a], 1);
    },
  },
  {
    id: 'mesa_dados', nome: 'Perde tudo nos dados', tom: 'adulto', cat: 'vida', alvo: false,
    pode: (s, a) => s.adulto(a) && a.dinheiro > 10 && (a.gostos.includes('jogos de azar') || T(a, 'impulsivo', 'ganancioso', 'viciado')),
    fazer: (s, a) => {
      if (s.chance(0.25)) {
        const v = Math.round(a.dinheiro);
        a.dinheiro *= 2;
        fala(s, a, 'vida', 'dados', `🎲 ${L(s, a)} aposta tudo num lance de dados e dobra ${v} moedas. Pede mais vinho.`, [a], 1);
        return;
      }
      const v = Math.round(a.dinheiro);
      a.dinheiro = 0;
      s.estresse(a, 30);
      a.meta = { tipo: 'riqueza', desde: s.t };
      fala(s, a, 'vida', 'dados', `🎲 ${L(s, a)} perde ${v} moedas numa noite de dados${v > 60 ? ', e mais a casa' : ''}.`, [a], v > 60 ? 3 : 2);
    },
  },
  {
    id: 'cartas_picantes', nome: 'Cartas picantes vazam', tom: 'adulto', cat: 'romance', alvo: false,
    pode: (s, a) => s.amantes(a).length > 0,
    fazer: (s, a) => {
      const b = s.amantes(a)[0]!;
      const seg = s.segredos.find((x) => x.tipo === 'caso' && x.sobre.includes(a.id) && x.sobre.includes(b.id));
      fala(s, a, 'romance', 'cartas', `🔥 As cartas picantes de ${L(s, a)} para ${L(s, b)} somem de um baú e aparecem, lidas em voz alta, na taverna.`, [a, b], 2);
      if (seg) {
        for (const x of s.aoRedor(a)) if (!seg.sabem.includes(x)) seg.sabem.push(x);
        s.publicar(seg);
      }
      const par = s.parceiro(a);
      if (par && seg && !seg.sabem.includes(par.id)) s.descobrir(par, a, b, 'pelas cartas lidas na taverna');
    },
  },
  {
    id: 'forasteiro', nome: 'Seduzido por um forasteiro', tom: 'adulto', cat: 'romance', alvo: false,
    pode: (s, a) => s.adulto(a) && a.dinheiro > 15 && a.orientacao !== 'ace' && !T(a, 'casto', 'desconfiado'),
    fazer: (s, a) => {
      const v = Math.round(a.dinheiro * 0.7);
      a.dinheiro -= v;
      s.humor(a, -15);
      s.ganhaTraco(a, 'desconfiado', false);
      fala(s, a, 'romance', 'forasteiro', `🔥 Um forasteiro de olhos verdes seduz ${L(s, a)} em três dias e some no quarto com ${v} moedas e um par de botas.`, [a], 2);
    },
  },
  {
    id: 'baile_mascaras', nome: 'Baile de máscaras', tom: 'adulto', cat: 'acaso', alvo: false,
    pode: (s, a) => s.adulto(a) && !T(a, 'casto'),
    fazer: (s, a) => {
      a.estados['ressaca'] = s.t + 1;
      fala(s, a, 'acaso', 'mascaras', `🎭 ${L(s, a)} acorda depois de um baile de máscaras sem lembrar de nada, com ${pick(s, ['um anel que não é seu', 'uma tatuagem de sereia', 'um bilhete dizendo "até a próxima lua"', 'a capa de um nobre'])}.`, [a], 1);
    },
  },
  {
    id: 'fuga_janela', nome: 'Fuga pela janela', tom: 'adulto', cat: 'romance', alvo: false,
    pode: (s, a) => s.amantes(a).some((b) => !!s.parceiro(b) && s.parceiro(b)!.id !== a.id),
    fazer: (s, a) => {
      const b = s.amantes(a).find((x) => !!s.parceiro(x) && s.parceiro(x)!.id !== a.id)!;
      const traido = s.parceiro(b)!;
      fala(s, a, 'romance', 'janela', `🔥 Flagrad${o(s, a)} por ${L(s, traido)}, ${L(s, a)} foge pela janela da casa de ${L(s, b)} só de camisa, e cai em cima do carrinho de verduras.`, [a, b, traido], 2);
      s.descobrir(traido, b, a, 'chegando em casa mais cedo');
    },
  },
  {
    id: 'proposta_indecente', nome: 'Proposta indecente', tom: 'adulto', cat: 'romance', alvo: true,
    pode: (s, a, b) => quer(s, a, b) && a.dinheiro > 60 && b!.dinheiro < 10 && !T(a, 'gentil', 'casto'),
    fazer: (s, a, b) => {
      const B = b!;
      const aceita = (T(B, 'ganancioso') || B.dinheiro < 3) && !T(B, 'casto', 'devoto', 'orgulhoso') && s.chance(0.5);
      if (aceita) {
        s.dar(a, B, 40);
        s.mexe(a.id, B.id, { intimidade: 10 });
        fala(s, a, 'romance', 'proposta', `🔥 🤫 ${L(s, a)} oferece 40 moedas por uma noite com ${L(s, B)}. ${L(s, B)} aceita e nunca fala disso.`, [a, B], 2, true);
        if (s.comprometido(B) || s.comprometido(a)) s.segredo('caso', [a.id, B.id], [a.id, B.id]);
      } else {
        s.mexe(B.id, a.id, { respeito: -25, afeto: -20 });
        s.lembra(B.id, a.id, 'me tratou como mercadoria', -30, 72);
        fala(s, a, 'romance', 'proposta', `🔥 ${L(s, a)} oferece 40 moedas por uma noite com ${L(s, B)} e leva um tapa que se ouve do outro lado da praça.`, [a, B], 2);
      }
    },
  },
  {
    id: 'chama_reacesa', nome: 'A chama reacende', tom: 'adulto', cat: 'romance', alvo: false,
    pode: (s, a) => !!s.conjuge(a) && s.ondeEsta(s.conjuge(a)!) === s.ondeEsta(a) && s.opiniao(a.id, s.conjuge(a)!.id) > -20 && a.orientacao !== 'ace',
    fazer: (s, a) => {
      const c = s.conjuge(a)!;
      s.mexe(a.id, c.id, { afeto: 10, atracao: 10, intimidade: 8 });
      s.mexe(c.id, a.id, { afeto: 10, atracao: 10, intimidade: 8 });
      fala(s, a, 'romance', 'chama', `🔥 ${L(s, a)} e ${L(s, c)} mandam as crianças para a casa da avó e reacendem a chama do casamento.`, [a, c], 1);
      s.conceber(a, c, 1.2);
    },
  },
  {
    id: 'acorda_na_praca', nome: 'Acorda pelado na praça', tom: 'adulto', cat: 'acaso', alvo: false,
    pode: (s, a) => s.adulto(a) && (T(a, 'alcoolatra') || a.gostos.includes('bebida') || a.gostos.includes('festas')),
    fazer: (s, a) => {
      a.estados['envergonhado'] = s.t + 2;
      s.humor(a, -12);
      if (s.chance(0.15)) s.ganhaTraco(a, 'infame', false);
      fala(s, a, 'acaso', 'praca', `🥴 Depois da festa, ${L(s, a)} acorda nu${s.g(a, '', 'a')} na praça, abraçad${o(s, a)} à estátua do fundador.`, [a], 1);
    },
  },
  {
    id: 'voto_castidade', nome: 'O voto balança', tom: 'adulto', cat: 'romance', alvo: true,
    pode: (s, a, b) => quer(s, a, b) && (a.prof === 'sacerdote' || T(a, 'casto', 'devoto')),
    fazer: (s, a, b) => {
      const B = b!;
      s.estresse(a, 20);
      s.mexe(a.id, B.id, { atracao: 15 });
      if (s.chance(0.3)) {
        s.perdeTraco(a, 'casto');
        fala(s, a, 'romance', 'voto', `🔥 🤫 O voto de ${L(s, a)} não resiste a ${L(s, B)}. Depois, ${s.g(a, 'ele', 'ela')} reza a noite inteira.`, [a, B], 2, true);
        if (quer(s, B, a)) s.comecarCaso(a, B);
      } else fala(s, a, 'romance', 'voto', `🔥 ${L(s, a)} passa a rezar o dobro desde que ${L(s, B)} chegou à vila.`, [a, B], 1);
    },
  },
  {
    id: 'boato_caso', nome: 'Boato de caso', tom: 'adulto', cat: 'social', alvo: true,
    pode: (s, a, b) => adultos(s, a, b) && !!b && (s.comprometido(a) || s.comprometido(b)) && !s.temVinc(a.id, b.id, 'amantes'),
    fazer: (s, a, b) => {
      const B = b!;
      for (const x of [a, B]) {
        const par = s.parceiro(x);
        if (par && par.id !== a.id && par.id !== B.id) s.mexe(par.id, x.id, { confianca: -12 });
      }
      s.estresse(a, 8);
      s.estresse(B, 8);
      fala(s, a, 'social', 'boato', `🗣 Corre o boato de que ${L(s, a)} e ${L(s, B)} têm um caso. Não têm. Ainda.`, [a, B], 1);
      s.mexe(a.id, B.id, { atracao: 6 });
    },
  },

  // ================================================================ sério
  {
    id: 'incendio', nome: 'Incêndio', tom: 'serio', cat: 'vida', alvo: false, peso: 0.7,
    pode: (s, a) => s.adulto(a),
    fazer: (s, a) => {
      a.dinheiro *= 0.3;
      s.estresse(a, 30);
      s.humor(a, -25);
      for (const f of s.filhosOficiais(a.id).filter((x) => x.morte === null && x.local === a.local)) s.estresse(f, 15);
      if (!a.protegido && s.chance(0.04 * s.ajustes.mortalidade)) {
        s.morrer(a, 'no incêndio da própria casa');
        return;
      }
      fala(s, a, 'vida', 'incendio', `🔥 Um incêndio destrói a casa de ${L(s, a)}. ${pick(s, ['Sobra só a lareira.', 'Os vizinhos passam a noite carregando baldes.', 'Ninguém sabe como começou.'])}`, [a], 3);
    },
  },
  {
    id: 'salva_crianca', nome: 'Salva uma criança do rio', tom: 'serio', cat: 'social', alvo: true,
    pode: (s, a, b) => s.adulto(a) && !!b && s.crianca(b),
    fazer: (s, a, b) => {
      const B = b!;
      if (s.chance(0.4) && !T(a, 'heroi')) s.ganhaTraco(a, 'heroi', false);
      for (const p of B.pais) if (p && s.vivo(p)) s.lembra(p, a.id, 'salvou meu filho', 50, 240);
      s.mexe(B.id, a.id, { afeto: 30, respeito: 20 });
      fala(s, a, 'social', 'salvamento', `🌊 ${L(s, a)} se joga no rio e tira ${L(s, B)} da correnteza.`, [a, B], 3);
    },
  },
  {
    id: 'julgamento', nome: 'Acusado injustamente', tom: 'serio', cat: 'conflito', alvo: false, peso: 0.5,
    pode: (s, a) => s.adulto(a) && !a.estados['preso'],
    fazer: (s, a) => {
      const defesa = a.hab.labia + s.entre(0, 12) + (T(a, 'heroi') ? 4 : 0) - (T(a, 'infame') ? 4 : 0);
      if (defesa > 10) {
        s.estresse(a, 15);
        fala(s, a, 'conflito', 'julgamento', `⚖ ${L(s, a)} é ${s.g(a, 'acusado', 'acusada')} de um crime que não cometeu e se defende tão bem que o juiz pede desculpas.`, [a], 2);
      } else {
        a.estados['preso'] = s.t + 6 + Math.floor(s.entre(0, 18));
        s.ganhaTraco(a, 'infame', false);
        s.humor(a, -30);
        fala(s, a, 'conflito', 'julgamento', `⚖ ${L(s, a)} é ${s.g(a, 'condenado', 'condenada')} por um crime que não cometeu e vai para a prisão.`, [a], 3);
      }
    },
  },
  {
    id: 'agiota', nome: 'O agiota cobra', tom: 'serio', cat: 'vida', alvo: false,
    pode: (s, a) => s.adulto(a) && a.dinheiro < 8,
    fazer: (s, a) => {
      a.dinheiro = 0;
      s.estresse(a, 25);
      if (s.chance(0.3 * s.ajustes.violencia)) s.ferir(a, false);
      fala(s, a, 'vida', 'divida', `💰 Um agiota bate à porta de ${L(s, a)} cobrando uma dívida com juros${s.chance(0.5) ? ' e quebra a mesa da cozinha para deixar claro' : ''}.`, [a], 2);
    },
  },
  {
    id: 'colheita', nome: 'A geada leva a colheita', tom: 'serio', cat: 'vida', alvo: false,
    pode: (s, a) => a.prof === 'camponês' || a.gostos.includes('jardinagem'),
    fazer: (s, a) => {
      a.dinheiro *= 0.5;
      s.estresse(a, 15);
      fala(s, a, 'vida', 'colheita', `❄ Uma geada fora de época destrói a colheita de ${L(s, a)}.`, [a], 1);
    },
  },
  {
    id: 'cao_morre', nome: 'O velho cão morre', tom: 'serio', cat: 'vida', alvo: false,
    fazer: (s, a) => {
      s.humor(a, -20);
      fala(s, a, 'vida', 'cao', `🐕 Morre ${pick(s, ['o velho cão', 'a égua', 'o gato rabugento', 'o burro'])} de ${L(s, a)}, companheiro de muitos anos. ${s.g(a, 'Ele', 'Ela')} cava a cova com as próprias mãos.`, [a], 1);
    },
  },
  {
    id: 'heranca_distante', nome: 'Herança de um parente distante', tom: 'serio', cat: 'familia', alvo: false, peso: 0.4,
    pode: (s, a) => s.adulto(a),
    fazer: (s, a) => {
      const v = Math.round(s.entre(40, 120));
      a.dinheiro += v;
      s.humor(a, 15);
      fala(s, a, 'familia', 'heranca', `📜 Chega uma carta lacrada: um tio-avô de ${L(s, a)}, que ninguém conhecia, deixou ${v} moedas para ${s.g(a, 'ele', 'ela')}.`, [a], 2);
    },
  },
  {
    id: 'febre_filho', nome: 'Noites em claro com o filho doente', tom: 'serio', cat: 'familia', alvo: false,
    pode: (s, a) => s.filhosOficiais(a.id).some((f) => f.morte === null && s.crianca(f)),
    fazer: (s, a) => {
      const f = s.filhosOficiais(a.id).find((x) => x.morte === null && s.crianca(x))!;
      f.saude = Math.max(5, f.saude - 20);
      s.estresse(a, 15);
      s.mexe(a.id, f.id, { afeto: 12 });
      s.mexe(f.id, a.id, { afeto: 18, intimidade: 10 });
      fala(s, a, 'familia', 'febre', `🕯 ${L(s, a)} passa três noites em claro ao lado de ${L(s, f)}, que arde em febre.`, [a, f], 1);
    },
  },
  {
    id: 'perdao_leito', nome: 'Perdão no leito de morte', tom: 'serio', cat: 'social', alvo: false,
    pode: (s, a) => a.saude < 35 && s.ligados(a.id).some((x) => s.temVinc(a.id, x, 'rivais') || s.temVinc(a.id, x, 'inimigos')),
    fazer: (s, a) => {
      const id = s.ligados(a.id).find((x) => s.temVinc(a.id, x, 'rivais') || s.temVinc(a.id, x, 'inimigos'))!;
      const b = s.pessoa(id)!;
      s.desliga(a.id, id, 'rivais');
      s.desliga(a.id, id, 'inimigos');
      s.lembra(a.id, id, 'fizemos as pazes', 30, 120);
      s.lembra(id, a.id, 'fizemos as pazes', 30, 120);
      fala(s, a, 'social', 'perdao', `🕯 Doente, ${L(s, a)} manda chamar ${L(s, b)} e pede perdão. Os dois choram feito crianças.`, [a, b], 2);
    },
  },
  {
    id: 'bondade_secreta', nome: 'Paga a dívida de alguém', tom: 'serio', cat: 'social', alvo: true,
    pode: (s, a, b) => s.adulto(a) && !!b && a.dinheiro > 40 && b.dinheiro < 5 && T(a, 'generoso', 'gentil'),
    fazer: (s, a, b) => {
      const B = b!;
      s.dar(a, B, 25);
      s.lembra(B.id, a.id, 'me salvou da ruína', 35, 180);
      fala(s, a, 'social', 'bondade', `🤲 🤫 ${L(s, a)} paga em segredo as dívidas de ${L(s, B)}. ${L(s, B)} nunca descobre quem foi.`, [a, B], 2, true);
    },
  },
  {
    id: 'tumulo', nome: 'Visita ao túmulo', tom: 'serio', cat: 'familia', alvo: false,
    pode: (s, a) => mortoQuerido(s, a) !== null && s.adulto(a),
    fazer: (s, a) => {
      const m = mortoQuerido(s, a)!;
      s.humor(a, -8);
      a.estresse = Math.max(0, a.estresse - 10);
      fala(s, a, 'familia', 'tumulo', `🕯 ${L(s, a)} leva flores ao túmulo de ${L(s, m)} e conta as novidades em voz baixa.`, [a, m], 1);
    },
  },
  {
    id: 'crise_fe', nome: 'Perde a fé', tom: 'serio', cat: 'vida', alvo: false,
    pode: (s, a) => T(a, 'devoto') && (a.humor < -20 || !!a.estados['enlutado']),
    fazer: (s, a) => {
      s.perdeTraco(a, 'devoto');
      if (s.chance(0.5)) s.ganhaTraco(a, 'cinico', false);
      fala(s, a, 'vida', 'fe', `⛪ ${L(s, a)} reza por um milagre que não vem, e para de rezar.`, [a], 2);
    },
  },
  {
    id: 'aprendiz', nome: 'Toma um aprendiz', tom: 'serio', cat: 'social', alvo: true,
    pode: (s, a, b) => !!b && !!a.prof && s.idade(a) > 35 && s.adulto(b) && s.idade(b) < 25 && b.prof !== a.prof,
    fazer: (s, a, b) => {
      const B = b!;
      const pr = s.prof(a);
      if (pr) s.sobe(B, pr.hab, 3);
      s.mexe(B.id, a.id, { respeito: 20, afeto: 10, intimidade: 15 });
      s.mexe(a.id, B.id, { afeto: 10, intimidade: 15 });
      s.xp(a, 'ensinou', 2);
      fala(s, a, 'social', 'aprendiz', `⚒ ${L(s, a)} toma ${L(s, B)} como aprendiz e ensina os segredos do ofício de ${s.nomeProf(a)}.`, [a, B], 1);
    },
  },
  {
    id: 'denuncia', nome: 'Denuncia um crime', tom: 'serio', cat: 'conflito', alvo: true,
    pode: (s, a, b) => !!b && T(a, 'honesto', 'leal') && s.segredos.some((x) => (x.tipo === 'assassinato' || x.tipo === 'roubo') && x.sobre[0] === b.id && x.sabem.includes(a.id) && !x.publico),
    fazer: (s, a, b) => {
      const B = b!;
      const seg = s.segredos.find((x) => (x.tipo === 'assassinato' || x.tipo === 'roubo') && x.sobre[0] === B.id && x.sabem.includes(a.id) && !x.publico)!;
      for (const x of s.aoRedor(a)) if (!seg.sabem.includes(x)) seg.sabem.push(x);
      s.publicar(seg);
      s.lembra(B.id, a.id, 'me denunciou', -70, 240);
      if (s.chance(0.6)) {
        B.estados['preso'] = s.t + (seg.tipo === 'assassinato' ? 36 : 10) + Math.floor(s.entre(0, 12));
        fala(s, a, 'conflito', 'denuncia', `⚖ ${L(s, a)} denuncia ${L(s, B)} às autoridades. ${L(s, B)} vai para a prisão.`, [a, B], 3);
      } else {
        fala(s, a, 'conflito', 'denuncia', `⚖ ${L(s, a)} denuncia ${L(s, B)}, que foge da vila antes dos guardas chegarem.`, [a, B], 3);
        const d = s.destinos(B.local);
        if (d.length) s.viajar(B, s.pick(d), 'fuga');
      }
    },
  },
  {
    id: 'esquecimento', nome: 'A memória falha', tom: 'serio', cat: 'vida', alvo: false,
    pode: (s, a) => s.idadeBio(a) > 66,
    fazer: (s, a) => {
      s.estresse(a, 10);
      for (const f of s.filhosOficiais(a.id).filter((x) => x.morte === null)) s.estresse(f, 5);
      fala(s, a, 'vida', 'memoria', `🕰 ${L(s, a)} começa a esquecer os nomes dos netos, mas lembra de cada palavra de uma canção da infância.`, [a], 1);
    },
  },
];

/** Alguém querido que já morreu (pai, mãe, cônjuge, filho). */
function mortoQuerido(s: Vidas, a: Pessoa): Pessoa | null {
  for (const id of [...a.pais, ...s.filhosOficiais(a.id).map((f) => f.id)]) {
    const p = id ? s.pessoa(id) : undefined;
    if (p && p.morte !== null && s.t - p.morte < 240) return p;
  }
  for (const r of s.relacoes(a.id, 12)) {
    const p = s.pessoa(r.id);
    if (p && p.morte !== null && r.opiniao > 40 && s.t - p.morte < 240) return p;
  }
  return null;
}

/**
 * O acaso do mês: cada pessoa tem uma pequena chance de viver um acontecimento,
 * sorteado entre os que cabem nela, pesado pelo tom. Usa uma sorte própria.
 */
export function acasoDoMes(s: Vidas, r: Rng): void {
  const aj = s.ajustes;
  const media = (aj.fantasia + aj.comico + aj.adulto + aj.serio) / 4;
  if (media <= 0) return;
  const chance = 0.016 * Math.min(2.5, media);
  for (const a of s.vivos()) {
    if (a.morte !== null || s.criatura(a) || s.bloqueado(a) || s.naGuerra(a) || s.idadeBio(a) < 8) continue;
    if (r() >= chance) continue;
    const perto = s.aoRedor(a).map((x) => s.vivo(x)).filter((x): x is Pessoa => !!x && !s.bloqueado(x) && !s.criatura(x));
    const bs: Pessoa[] = [];
    for (let k = 0; k < 3 && perto.length; k++) bs.push(perto[Math.floor(r() * perto.length)]!);
    const ops: Array<{ ac: Acontecimento; b: Pessoa | null; w: number }> = [];
    for (const ac of ACONTECIMENTOS) {
      const m = aj[ac.tom];
      if (!(m > 0)) continue;
      // adulto: nunca com crianças
      if (ac.tom === 'adulto' && !s.adulto(a)) continue;
      if (!ac.alvo) {
        if (!ac.pode || ac.pode(s, a, null)) ops.push({ ac, b: null, w: (ac.peso ?? 1) * m });
        continue;
      }
      const b = bs.find((x) => x.id !== a.id && (ac.tom !== 'adulto' || s.adulto(x)) && (!ac.pode || ac.pode(s, a, x)));
      if (b) ops.push({ ac, b, w: (ac.peso ?? 1) * m });
    }
    if (!ops.length) continue;
    let x = r() * ops.reduce((t, o) => t + o.w, 0);
    for (const o of ops) {
      if ((x -= o.w) <= 0) {
        s.acontecer(o.ac, a, o.b);
        break;
      }
    }
  }
}
