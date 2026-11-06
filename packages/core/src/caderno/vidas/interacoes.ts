import { ATIVIDADE } from './catalogo';
import { lutar } from './combate';
import type { Vidas } from './motor';
import type { Categoria, Habilidade, Pessoa } from './tipos';

/*
 * O que as pessoas fazem umas com as outras (e sozinhas).
 *
 * Cada interação diz quando pode acontecer (`pode`), o quanto `a` tem vontade
 * (`peso`, antes dos traços: o motor multiplica pelo peso de cada traço, pelos
 * ajustes e pela meta) e o que acontece (`fazer`). Quem decide se aceita
 * responde pelos próprios números: a atração e a opinião que tem de `a`.
 *
 * Romance e sexo só entre adultos (`podeRomance`). Família próxima não namora.
 */

export interface Interacao {
  id: string;
  /** rótulo do botão ("Flertar") */
  nome: string;
  /** para a frase "Você faz Ana {verbo} Rui" */
  verbo: string;
  cat: Categoria;
  /** precisa de outra pessoa */
  alvo: boolean;
  pode(s: Vidas, a: Pessoa, b: Pessoa | null): boolean;
  peso(s: Vidas, a: Pessoa, b: Pessoa | null): number;
  /**
   * `garantir`: quem joga forçou e quer que dê certo.
   * `resposta`: a resposta de `b` já foi dada (decisão de quem joga); `null` = a sorte decide sem perguntar.
   */
  fazer(s: Vidas, a: Pessoa, b: Pessoa | null, garantir: boolean, resposta?: boolean | null): void;
}

const B = (b: Pessoa | null): Pessoa => b!;
const ok = (s: Vidas, p: number, garantir: boolean, resposta?: boolean | null) =>
  typeof resposta === 'boolean' ? resposta : garantir ? true : s.chance(Math.min(0.97, Math.max(0.01, p)));
const t = (p: Pessoa, id: string) => p.tracos.includes(id);
const ex = (p: Pessoa) => p.big5[2] / 100;
const am = (p: Pessoa) => p.big5[3] / 100;

/** Se `b` é conduzido, a resposta vira uma decisão para quem joga. */
function pergunta(s: Vidas, a: Pessoa, b: Pessoa, tipo: 'pedido' | 'casamento' | 'seducao' | 'desafio', texto: string, garantir: boolean, resposta: boolean | null | undefined,
  opcoes = [{ id: 'aceitar', rotulo: 'Aceitar' }, { id: 'recusar', rotulo: 'Recusar' }]): boolean {
  if (!b.conduzido || resposta !== undefined || garantir) return false;
  s.decide({ pessoa: b.id, tipo, de: a.id, texto, opcoes: [...opcoes, { id: 'auto', rotulo: 'Deixar o destino decidir' }] });
  return true;
}

/** Ciúme: o par de `alvo` vê `a` flertando (ou seduzindo) e não gosta. */
function ciume(s: Vidas, a: Pessoa, alvo: Pessoa): void {
  for (const x of [a, alvo]) {
    const par = s.parceiro(x);
    if (!par || par.id === a.id || par.id === alvo.id || s.ondeEsta(par) !== s.ondeEsta(x)) continue;
    const mult = t(par, 'ciumento') ? 2.5 : t(par, 'desapegado') ? 0.3 : 1;
    if (!s.chance(0.18 * mult * s.ajustes.drama)) continue;
    const outro = x === a ? alvo : a;
    s.lembra(par.id, outro.id, 'flertou com meu par', -12 * mult, 24);
    s.mexe(par.id, x.id, { confianca: -8 * mult });
    s.estresse(par, 8 * mult);
    s.say('romance', 'ciume', `${s.L(par.id)} flagra ${s.L(x.id)} de olho em ${s.L(outro.id)} e fecha a cara.`, [par.id, x.id, outro.id], 2);
    if (s.chance(0.25 * mult * s.ajustes.violencia) && (t(par, 'irascivel') || t(par, 'ciumento'))) {
      s.say('conflito', 'ciume', `O ciúme de ${s.L(par.id)} vira briga com ${s.L(outro.id)}.`, [par.id, outro.id], 2);
      lutar(s, par, outro, 'briga');
    }
    return;
  }
}

const solo = (id: string, nome: string, verbo: string, cat: Categoria, pode: Interacao['pode'], peso: Interacao['peso'], fazer: Interacao['fazer']): Interacao =>
  ({ id, nome, verbo, cat, alvo: false, pode, peso, fazer });

export const INTERACOES: Interacao[] = [
  // ================================================================ social
  {
    id: 'conversar', nome: 'Conversar', verbo: 'puxar conversa com', cat: 'social', alvo: true,
    pode: () => true,
    peso: (s, a, b) => 3 * (0.5 + ex(a)) * (s.crianca(B(b)) && !s.crianca(a) && !s.parentesco(a.id, B(b).id) ? 0.3 : 1),
    fazer: (s, a, b) => {
      const o = B(b);
      const antes = s.intimidade(a.id, o.id);
      s.mexe(a.id, o.id, { intimidade: s.entre(2, 5), afeto: s.compat(a.id, o.id) / 12 + s.entre(-2, 3) });
      s.mexe(o.id, a.id, { intimidade: s.entre(2, 5), afeto: s.compat(o.id, a.id) / 12 + s.entre(-2, 3) });
      const comum = a.gostos.find((g) => o.gostos.includes(g));
      if (comum && antes < 25 && s.intimidade(a.id, o.id) >= 25) {
        s.say('social', 'afinidade', `${s.L(a.id)} e ${s.L(o.id)} descobrem que os dois adoram ${comum}.`, [a.id, o.id], 1);
      }
    },
  },
  {
    id: 'atividade', nome: 'Fazer algo juntos', verbo: 'chamar para um passatempo', cat: 'social', alvo: true,
    pode: (s, a, b) => a.gostos.some((g) => B(b).gostos.includes(g)) && s.idade(a) >= 5 && s.idade(B(b)) >= 5,
    peso: (s, a, b) => 1 + s.intimidade(a.id, B(b).id) / 50 + a.gostos.filter((g) => B(b).gostos.includes(g)).length * 0.3,
    fazer: (s, a, b) => {
      const o = B(b);
      const g = s.pick(a.gostos.filter((x) => o.gostos.includes(x)));
      for (const [x, y] of [[a, o], [o, a]] as const) s.mexe(x.id, y.id, { afeto: s.entre(4, 8), intimidade: 5 });
      for (const x of [a, o]) {
        s.humor(x, 5);
        s.estresse(x, -5);
      }
      if (s.chance(0.3)) s.say('social', 'atividade', `${s.L(a.id)} e ${s.L(o.id)} ${ATIVIDADE[g] ?? `aproveitam ${g} juntos`}.`, [a.id, o.id], 1);
    },
  },
  {
    id: 'elogiar', nome: 'Elogiar', verbo: 'elogiar', cat: 'social', alvo: true,
    pode: () => true,
    peso: (s, a, b) => 0.5 * am(a) * 2 * (s.opiniao(a.id, B(b).id) > 10 ? 1.5 : 0.4),
    fazer: (s, a, b) => {
      const o = B(b);
      s.mexe(o.id, a.id, { afeto: s.entre(3, 6) * (t(o, 'desconfiado') ? 0.4 : 1) + (t(o, 'orgulhoso') ? 2 : 0) });
      s.humor(o, 2);
    },
  },
  {
    id: 'presentear', nome: 'Dar um presente', verbo: 'dar um presente a', cat: 'social', alvo: true,
    pode: (s, a) => a.dinheiro >= 8 && !s.crianca(a),
    peso: (s, a, b) => 0.3 * (s.opiniao(a.id, B(b).id) > 20 ? 1.5 : 0.4) * (s.atracao(a.id, B(b).id) > 50 ? 1.6 : 1),
    fazer: (s, a, b, g) => {
      const o = B(b);
      const v = s.dar(a, o, s.entre(3, 8));
      s.mexe(o.id, a.id, { afeto: 6 + v / 2 + (t(o, 'ganancioso') ? 4 : 0), confianca: 3 });
      if (s.chance(0.3) || g) {
        const coisa = s.pick(['um anel de cobre', 'flores do campo', 'um livro raro', 'uma faca bem afiada', 'um lenço bordado', 'uma garrafa de vinho bom', 'um amuleto']);
        s.say('social', 'presente', `${s.L(a.id)} presenteia ${s.L(o.id)} com ${coisa}.`, [a.id, o.id], 1);
      }
    },
  },
  {
    id: 'ajudar', nome: 'Ajudar', verbo: 'ajudar', cat: 'social', alvo: true,
    pode: (s, a, b) => {
      const o = B(b);
      return !s.crianca(a) && (o.saude < 50 || (o.dinheiro < 4 && !s.crianca(o)) || o.estresse > 65 || 'doente' in o.estados);
    },
    peso: (s, a, b) => 1.2 * am(a) * 2 * (s.opiniao(a.id, B(b).id) > 0 ? 1.4 : 0.3),
    fazer: (s, a, b) => {
      const o = B(b);
      s.mexe(o.id, a.id, { afeto: 8, confianca: 6 });
      s.lembra(o.id, a.id, 'me ajudou quando precisei', 15, 60);
      s.estresse(o, -10);
      if (o.dinheiro < 4 && a.dinheiro > 15) s.dar(a, o, 5);
      if ('doente' in o.estados || o.saude < 40) {
        o.saude = Math.min(100, o.saude + (a.prof === 'curandeiro' ? 15 : 5));
        if (s.chance(0.4)) s.say('social', 'ajuda', `${s.L(a.id)} cuida de ${s.L(o.id)}, que não sai da cama.`, [a.id, o.id], 1);
      } else if (s.chance(0.25)) s.say('social', 'ajuda', `${s.L(a.id)} estende a mão para ${s.L(o.id)} num momento difícil.`, [a.id, o.id], 1);
    },
  },
  {
    id: 'confidenciar', nome: 'Abrir o coração', verbo: 'se abrir com', cat: 'social', alvo: true,
    pode: (s, a, b) => s.intimidade(a.id, B(b).id) >= 40 && s.opiniao(a.id, B(b).id) > 25 && !s.crianca(a),
    peso: () => 0.5,
    fazer: (s, a, b) => {
      const o = B(b);
      s.mexe(a.id, o.id, { confianca: 6, intimidade: 4 });
      s.mexe(o.id, a.id, { confianca: 6, intimidade: 4 });
      s.estresse(a, -8);
      // confiar demais: um segredo escapa
      const seg = s.segredos.find((x) => x.sobre.includes(a.id) && !x.sabem.includes(o.id) && x.tipo !== 'paternidade');
      if (seg && s.chance(t(a, 'ingenuo') ? 0.25 : 0.06)) {
        seg.sabem.push(o.id);
        s.say('social', 'confissao', `🤫 ${s.L(a.id)} confessa um segredo a ${s.L(o.id)}.`, [a.id, o.id], 2, true);
      }
    },
  },
  {
    id: 'fofocar', nome: 'Fofocar', verbo: 'fazer fofoca com', cat: 'social', alvo: true,
    pode: (s, a, b) => s.sabeAlgo(a.id) && !s.crianca(a) && s.intimidade(a.id, B(b).id) >= 15 && s.segredos.some((x) => !x.publico && x.sabem.includes(a.id) && !x.sobre.includes(a.id) && !x.sabem.includes(B(b).id)),
    peso: () => 0.3,
    fazer: (s, a, b) => {
      const o = B(b);
      const seg = s.segredos.find((x) => !x.publico && x.sabem.includes(a.id) && !x.sobre.includes(a.id) && !x.sabem.includes(o.id));
      if (!seg) return;
      // a vítima do caso ouvindo da boca de outro: descoberta
      if (seg.tipo === 'caso') {
        const [x, y] = seg.sobre as [string, string];
        const X = s.vivo(x);
        const Y = s.vivo(y);
        if (X && Y) {
          const traidor = s.parceiro(X)?.id === o.id ? X : s.parceiro(Y)?.id === o.id ? Y : null;
          if (traidor) {
            s.descobrir(o, traidor, traidor === X ? Y : X, `pela boca de ${a.nome}`);
            return;
          }
        }
      }
      seg.sabem.push(o.id);
      const sobre = seg.sobre.map((x) => s.L(x));
      const texto = seg.tipo === 'caso' ? `o caso de ${sobre.join(' com ')}` : seg.tipo === 'assassinato' ? `quem matou ${sobre[1]}` : seg.tipo === 'roubo' ? `quem roubou ${sobre[1]}` : `quem é o pai de verdade de ${sobre[0]}`;
      const contados = seg.sabem.filter((x) => !seg.sobre.includes(x)).length;
      s.say('social', 'fofoca', `${s.L(a.id)} conta a ${s.L(o.id)} ${texto}.`, [a.id, o.id, ...seg.sobre], (seg.tipo === 'caso' || seg.tipo === 'assassinato') && contados <= 2 ? 2 : 1);
      for (const x of seg.sobre) if (s.vivo(x) && x !== o.id) s.lembra(o.id, x, seg.tipo === 'caso' ? 'soube do caso' : 'soube do que fez', t(o, 'leal') || t(o, 'devoto') || t(o, 'honesto') ? -12 : -5, 48);
      s.mexe(o.id, a.id, { intimidade: 3, confianca: t(o, 'discreto') ? -6 : 2 });
      s.publicar(seg);
    },
  },
  {
    id: 'insultar', nome: 'Insultar', verbo: 'insultar', cat: 'conflito', alvo: true,
    pode: (s, a) => s.idade(a) >= 6,
    peso: (s, a, b) => 0.12 + Math.max(0, -s.opiniao(a.id, B(b).id)) / 45,
    fazer: (s, a, b) => {
      const o = B(b);
      s.mexe(o.id, a.id, { afeto: -s.entre(8, 14) });
      s.lembra(o.id, a.id, 'me insultou', t(o, 'orgulhoso') ? -16 : -9, 24);
      s.mexe(a.id, o.id, { respeito: -3 });
      s.humor(o, -5);
      const publico = s.aoRedor(a).length > 3 && s.chance(0.4);
      s.say('conflito', 'insulto', `${s.L(a.id)} insulta ${s.L(o.id)}${publico ? ' na frente de todo mundo' : ''}.`, [a.id, o.id], 1);
      if ((t(o, 'irascivel') || t(o, 'orgulhoso') || t(o, 'brigao')) && !t(o, 'covarde') && s.chance(0.3 * s.ajustes.violencia) && s.idade(o) >= 12) {
        lutar(s, o, a, 'briga');
      }
    },
  },
  {
    id: 'discutir', nome: 'Discutir', verbo: 'discutir com', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.idade(a) >= 8 && (s.opiniao(a.id, B(b).id) < 10 || s.vinculos(a.id, B(b).id).has('rivais')),
    peso: (s, a, b) => 0.15 + Math.max(0, -s.opiniao(a.id, B(b).id)) / 55 + (a.conjuge === B(b).id && s.opiniao(a.id, B(b).id) < 20 ? 0.5 : 0),
    fazer: (s, a, b) => {
      const o = B(b);
      for (const [x, y] of [[a, o], [o, a]] as const) {
        s.mexe(x.id, y.id, { afeto: -s.entre(3, 7) });
        s.estresse(x, 5);
      }
      const casal = a.conjuge === o.id;
      if (s.chance(0.4)) s.say('conflito', 'discussao', casal ? `${s.L(a.id)} e ${s.L(o.id)} brigam feio em casa.` : `${s.L(a.id)} e ${s.L(o.id)} discutem aos gritos.`, [a.id, o.id], 1);
      if ((t(a, 'irascivel') || t(o, 'irascivel')) && s.chance(0.22 * s.ajustes.violencia) && s.idade(a) >= 12 && s.idade(o) >= 12) lutar(s, a, o, 'briga');
    },
  },
  {
    id: 'reconciliar', nome: 'Fazer as pazes', verbo: 'fazer as pazes com', cat: 'social', alvo: true,
    pode: (s, a, b) => s.opiniao(a.id, B(b).id) < -10 && s.intimidade(a.id, B(b).id) >= 10,
    peso: (_s, a) => 0.25 * am(a) * 2,
    fazer: (s, a, b, g) => {
      const o = B(b);
      const p = 0.45 + (t(o, 'clemente') ? 0.3 : 0) - (t(o, 'vingativo') ? 0.35 : 0) - (Math.abs(s.opiniao(o.id, a.id)) > 60 ? 0.2 : 0) + (t(a, 'humilde') ? 0.1 : 0);
      if (ok(s, p, g)) {
        for (const [x, y] of [[a, o], [o, a]] as const) {
          s.mexe(x.id, y.id, { afeto: 15 });
          s.lembra(x.id, y.id, 'fizemos as pazes', 12, 36);
        }
        s.desliga(a.id, o.id, 'inimigos');
        s.desliga(a.id, o.id, 'rivais');
        s.say('social', 'paz', `${s.L(a.id)} e ${s.L(o.id)} fazem as pazes.`, [a.id, o.id], 2);
        s.emitir('reconciliacao', [a.id, o.id]);
      } else {
        s.humor(a, -5);
        if (s.chance(0.4)) s.say('social', 'paz', `${s.L(a.id)} tenta fazer as pazes com ${s.L(o.id)}, que vira a cara.`, [a.id, o.id], 1);
      }
    },
  },
  {
    id: 'ensinar', nome: 'Ensinar', verbo: 'ensinar', cat: 'social', alvo: true,
    pode: (s, a, b) => !s.crianca(a) && s.idade(a) - s.idade(B(b)) >= 8 && (Object.keys(a.hab) as Habilidade[]).some((k) => a.hab[k] - B(b).hab[k] >= 4),
    peso: (s, a, b) => 0.45 * (s.parentesco(a.id, B(b).id) ? 2 : 1) * (s.crianca(B(b)) ? 1.5 : 1),
    fazer: (s, a, b) => {
      const o = B(b);
      const k = (Object.keys(a.hab) as Habilidade[]).sort((x, y) => (a.hab[y] - o.hab[y]) - (a.hab[x] - o.hab[x]))[0]!;
      s.sobe(o, k, 0.4);
      s.mexe(o.id, a.id, { afeto: 3, respeito: 4 });
      s.mexe(a.id, o.id, { afeto: 2 });
      s.xp(a, 'ensinou');
      if (s.chance(0.08)) s.say('social', 'ensino', `${s.L(a.id)} ensina a ${s.L(o.id)} os segredos de ${k === 'labia' ? 'lábia' : k === 'oficio' ? 'ofício' : k}.`, [a.id, o.id], 1);
    },
  },
  {
    id: 'brincar', nome: 'Brincar', verbo: 'brincar com', cat: 'social', alvo: true,
    pode: (s, a, b) => s.idade(a) >= 3 && s.idade(B(b)) >= 3 && s.idadeBio(a) < 13 && s.idadeBio(B(b)) < 13,
    peso: () => 3,
    fazer: (s, a, b) => {
      const o = B(b);
      for (const [x, y] of [[a, o], [o, a]] as const) s.mexe(x.id, y.id, { afeto: s.entre(3, 6), intimidade: 5 });
      if (s.chance(0.03)) s.say('familia', 'brincadeira', `${s.L(a.id)} e ${s.L(o.id)} passam o dia aprontando pela vila.`, [a.id, o.id], 1);
    },
  },
  {
    id: 'cuidar', nome: 'Cuidar do filho', verbo: 'cuidar de', cat: 'familia', alvo: true,
    pode: (s, a, b) => s.crianca(B(b)) && !s.crianca(a) && (B(b).pais.includes(a.id) || B(b).paiOficial === a.id),
    peso: () => 2.5,
    fazer: (s, a, b) => {
      const o = B(b);
      s.mexe(a.id, o.id, { afeto: 4 });
      s.mexe(o.id, a.id, { afeto: 4 });
      s.estresse(o, -5);
      // o exemplo de casa: o temperamento e os gostos passam um pouco
      for (let i = 0; i < 5; i++) o.big5[i] = o.big5[i]! + (a.big5[i]! - o.big5[i]!) * 0.01;
      const novo = a.gostos.find((g) => !o.gostos.includes(g));
      if (novo && o.gostos.length < 5 && s.chance(0.04)) o.gostos.push(novo);
    },
  },

  // ================================================================ romance
  {
    id: 'flertar', nome: 'Flertar', verbo: 'flertar com', cat: 'romance', alvo: true,
    pode: (s, a, b) => s.podeRomance(a.id, B(b).id) && s.atraido(a.id, B(b).id) && !s.temVinc(a.id, B(b).id, 'amantes') && a.conjuge !== B(b).id && s.parceiro(a)?.id !== B(b).id,
    peso: (s, a, b) => {
      const at = s.atracao(a.id, B(b).id);
      return Math.pow(at / 30, 1.4) * (s.comprometido(a) ? 0.2 : 1) * (s.comprometido(B(b)) ? 0.5 : 1);
    },
    fazer: (s, a, b, g) => {
      const o = B(b);
      const atr = s.atrib(a);
      const p = 0.2 + s.atracao(o.id, a.id) / 110 + a.hab.labia / 60 + atr.beleza * 0.15 - (s.atraido(o.id, a.id) ? 0 : 1);
      if (ok(s, p, g)) {
        s.mexe(a.id, o.id, { atracao: s.entre(3, 6), afeto: 2 });
        s.mexe(o.id, a.id, { atracao: s.entre(5, 10), afeto: 3 });
        s.humor(a, 4);
        s.humor(o, 3);
        if (s.chance(0.18)) s.say('romance', 'flerte', `${s.L(a.id)} e ${s.L(o.id)} trocam olhares demorados.`, [a.id, o.id], 1);
        s.emitir('flerte', [a.id, o.id]);
      } else {
        s.humor(a, -3);
        if (s.comprometido(o) && (t(o, 'leal') || t(o, 'honesto'))) s.mexe(o.id, a.id, { afeto: -4 });
        if (s.chance(0.08)) s.say('romance', 'flerte', `${s.L(a.id)} arrisca um galanteio; ${s.L(o.id)} finge que não ouviu.`, [a.id, o.id], 1);
      }
      if (s.comprometido(a) || s.comprometido(o)) ciume(s, a, o);
    },
  },
  {
    id: 'cortejar', nome: 'Pedir em namoro', verbo: 'pedir em namoro', cat: 'romance', alvo: true,
    pode: (s, a, b) => {
      const o = B(b);
      return s.podeRomance(a.id, o.id) && s.atraido(a.id, o.id) && !s.comprometido(a) && !s.comprometido(o) && !s.temVinc(a.id, o.id, 'amantes');
    },
    peso: (s, a, b) => {
      const o = B(b);
      const at = s.atracao(a.id, o.id);
      if (at < 38 || s.opiniao(a.id, o.id) < 10 || s.intimidade(a.id, o.id) < 12) return 0;
      return (at / 45) * (s.temVinc(a.id, o.id, 'ex') ? 0.4 : 1);
    },
    fazer: (s, a, b, g, resposta) => {
      const o = B(b);
      if (pergunta(s, a, o, 'pedido', `${a.nome} pede ${o.nome} em namoro.`, g, resposta)) return;
      const op = s.opiniao(o.id, a.id);
      let p = !s.atraido(o.id, a.id) ? (t(o, 'pragmatico') && a.dinheiro > 60 ? 0.12 : 0.01)
        : op < -10 ? 0.02
          : 0.08 + s.atracao(o.id, a.id) / 95 + op / 160 + (o.meta?.tipo === 'amor' ? 0.15 : 0) + (o.meta?.alvo === a.id ? 0.3 : 0);
      if (s.temVinc(a.id, o.id, 'ex') && s.ha(a.id, o.id, 'ex') < 24) p *= 0.4;
      if (ok(s, p, g, resposta)) {
        s.desliga(a.id, o.id, 'ex');
        s.liga(a.id, o.id, 'namoro');
        for (const [x, y] of [[a, o], [o, a]] as const) {
          s.humor(x, 15);
          s.lembra(x.id, y.id, 'começamos a namorar', 10, 60);
        }
        s.say('romance', 'namoro', `${s.L(a.id)} e ${s.L(o.id)} começam a namorar.`, [a.id, o.id], 2);
        s.emitir('namoro', [a.id, o.id]);
      } else {
        s.humor(a, t(a, 'orgulhoso') ? -14 : -9);
        s.lembra(a.id, o.id, 'me rejeitou', t(a, 'orgulhoso') ? -12 : -5, 18);
        s.mexe(a.id, o.id, { atracao: -8 });
        s.say('romance', 'recusa', `${s.L(o.id)} recusa o pedido de namoro de ${s.L(a.id)}.`, [a.id, o.id], 1);
      }
    },
  },
  {
    id: 'intimidade', nome: 'Passar a noite juntos', verbo: 'passar a noite com', cat: 'romance', alvo: true,
    pode: (s, a, b) => {
      const o = B(b);
      if (!s.podeRomance(a.id, o.id)) return false;
      const casados = a.conjuge === o.id;
      const vs = s.vinculos(a.id, o.id);
      if (!casados && !vs.has('namoro') && !vs.has('noivado')) return false;
      if (!casados && (t(a, 'casto') || t(a, 'devoto') || t(o, 'casto'))) return false;
      return a.orientacao !== 'ace' || casados;
    },
    peso: (s, a, b) => (1 + ex(a) * 0.5) * (a.conjuge === B(b).id ? 1.2 : 1) * (a.orientacao === 'ace' ? 0.15 : 1) * (s.opiniao(a.id, B(b).id) < 0 ? 0.3 : 1),
    fazer: (s, a, b) => {
      const o = B(b);
      for (const [x, y] of [[a, o], [o, a]] as const) {
        s.mexe(x.id, y.id, { afeto: 2, atracao: 1 });
        s.humor(x, 5);
        s.estresse(x, -5);
      }
      // quem já tem filhos pequenos demais se cuida mais
      const pequenos = s.filhosOficiais(a.id).filter((f) => f.morte === null && s.idade(f) < 2).length;
      s.conceber(a, o, pequenos ? 0.4 : a.meta?.tipo === 'familia' || o.meta?.tipo === 'familia' ? 1.4 : 1);
    },
  },
  {
    id: 'pedir_casamento', nome: 'Pedir em casamento', verbo: 'pedir em casamento', cat: 'romance', alvo: true,
    pode: (s, a, b) => s.podeRomance(a.id, B(b).id) && s.temVinc(a.id, B(b).id, 'namoro') && !a.conjuge && !B(b).conjuge,
    peso: (s, a, b) => {
      const o = B(b);
      const meses = s.ha(a.id, o.id, 'namoro');
      if (meses < 6 || s.opiniao(a.id, o.id) < 30) return 0;
      return 0.35 * (meses > 24 ? 1.6 : 1) * (a.meta?.tipo === 'familia' ? 2 : 1);
    },
    fazer: (s, a, b, g, resposta) => {
      const o = B(b);
      if (pergunta(s, a, o, 'casamento', `${a.nome} pede ${o.nome} em casamento.`, g, resposta)) return;
      const p = 0.3 + s.opiniao(o.id, a.id) / 100 + (t(o, 'romantico') ? 0.15 : 0) - (t(o, 'desapegado') ? 0.2 : 0) - (t(o, 'pragmatico') && a.dinheiro < 10 ? 0.2 : 0);
      if (ok(s, p, g, resposta)) {
        s.desliga(a.id, o.id, 'namoro');
        s.liga(a.id, o.id, 'noivado');
        s.casamentos.set(a.id < o.id ? `${a.id}|${o.id}` : `${o.id}|${a.id}`, s.t + Math.round(s.entre(3, 9)));
        s.humor(a, 20);
        s.humor(o, 20);
        s.say('romance', 'noivado', `${s.L(a.id)} pede ${s.L(o.id)} em casamento, e ouve um sim.`, [a.id, o.id], 2);
        s.emitir('noivado', [a.id, o.id]);
      } else {
        s.humor(a, -20);
        s.lembra(a.id, o.id, 'recusou meu pedido', -10, 24);
        s.say('romance', 'recusa', `${s.L(o.id)} recusa o pedido de casamento de ${s.L(a.id)}.`, [a.id, o.id], 2);
        if (s.chance(0.3)) s.terminar(a, o, a);
      }
    },
  },
  {
    id: 'seduzir', nome: 'Seduzir (trair)', verbo: 'seduzir', cat: 'romance', alvo: true,
    pode: (s, a, b) => {
      const o = B(b);
      return s.podeRomance(a.id, o.id) && s.atraido(a.id, o.id) && (s.comprometido(a) || s.comprometido(o)) && s.parceiro(a)?.id !== o.id && !s.temVinc(a.id, o.id, 'amantes');
    },
    peso: (s, a, b) => {
      const o = B(b);
      const at = s.atracao(a.id, o.id);
      if (at < 45) return 0;
      const par = s.parceiro(a);
      const infeliz = par ? Math.max(0, -s.opiniao(a.id, par.id)) / 25 : 0;
      const longe = par && s.ondeEsta(par) !== s.ondeEsta(a) ? 2 : 1;
      return Math.pow(at / 40, 1.5) * 0.3 * (1 + infeliz) * longe;
    },
    fazer: (s, a, b, g, resposta) => {
      const o = B(b);
      if (pergunta(s, a, o, 'seducao', `${a.nome} tenta seduzir ${o.nome}${s.comprometido(o) ? `, que está com ${s.parceiro(o)!.nome}` : `, mesmo comprometid${s.g(a, 'o', 'a')} com ${s.parceiro(a)!.nome}`}.`, g, resposta,
        [{ id: 'ceder', rotulo: 'Ceder' }, { id: 'resistir', rotulo: 'Resistir' }, ...(s.comprometido(a) ? [{ id: 'contar', rotulo: `Resistir e contar a ${s.parceiro(a)!.nome}` }] : [])])) return;
      const parO = s.parceiro(o);
      const p = !s.atraido(o.id, a.id) ? 0 : 0.04 + s.atracao(o.id, a.id) / 110 + a.hab.labia / 70 + s.atrib(a).beleza * 0.15
        - (t(o, 'leal') && parO ? 0.3 : 0) - (t(o, 'casto') ? 0.4 : 0) - (t(o, 'devoto') ? 0.15 : 0) + (t(o, 'luxurioso') ? 0.2 : 0)
        + (parO ? Math.max(0, -s.opiniao(o.id, parO.id)) / 150 : 0);
      if (ok(s, p, g, resposta)) {
        s.comecarCaso(a, o);
        ciume(s, a, o);
      } else {
        s.humor(a, -6);
        if (parO && (t(o, 'leal') || t(o, 'honesto'))) {
          s.mexe(o.id, a.id, { afeto: -8, confianca: -10 });
        }
        // quem foi assediado pode contar ao par de quem tentou
        const parA = s.parceiro(a);
        if (parA && (t(o, 'honesto') || t(o, 'leal')) && s.opiniao(o.id, parA.id) > 0 && s.chance(0.35)) {
          s.lembra(parA.id, a.id, 'tentou me trair', -25, 60);
          s.mexe(parA.id, a.id, { confianca: -25 });
          s.say('romance', 'denuncia', `${s.L(o.id)} conta a ${s.L(parA.id)} que ${s.L(a.id)} tentou seduzi-l${s.g(o, 'o', 'a')}.`, [o.id, parA.id, a.id], 2);
        } else if (s.chance(0.2)) s.say('romance', 'recusa', `🤫 ${s.L(a.id)} tenta seduzir ${s.L(o.id)}, sem sucesso.`, [a.id, o.id], 1, true);
      }
    },
  },
  {
    id: 'encontro_secreto', nome: 'Encontro às escondidas', verbo: 'se encontrar às escondidas com', cat: 'romance', alvo: true,
    pode: (s, a, b) => s.temVinc(a.id, B(b).id, 'amantes') && s.podeRomance(a.id, B(b).id),
    peso: (s, a, b) => 0.9 * Math.max(0.2, s.atracao(a.id, B(b).id) / 50),
    fazer: (s, a, b) => {
      const o = B(b);
      for (const [x, y] of [[a, o], [o, a]] as const) {
        s.mexe(x.id, y.id, { afeto: 3, atracao: 2 });
        s.humor(x, 7);
      }
      s.conceber(a, o, 0.8);
      if (s.chance(0.08)) s.say('romance', 'encontro', `🤫 ${s.L(a.id)} e ${s.L(o.id)} se encontram de novo, longe dos olhos de todos.`, [a.id, o.id], 1, true);
      // às vezes alguém vê
      const testemunha = s.aoRedor(a).filter((x) => x !== o.id);
      if (testemunha.length && s.chance(0.04 * s.ajustes.drama)) {
        const w = s.vivo(s.pick(testemunha))!;
        const seg = s.segredos.find((x) => x.tipo === 'caso' && x.sobre.includes(a.id) && x.sobre.includes(o.id));
        if (seg && !seg.sabem.includes(w.id)) {
          const vitima = [s.parceiro(a), s.parceiro(o)].find((x) => x?.id === w.id);
          if (vitima) s.descobrir(vitima, vitima.id === s.parceiro(a)?.id ? a : o, vitima.id === s.parceiro(a)?.id ? o : a, 'flagrando os dois');
          else {
            seg.sabem.push(w.id);
            s.say('social', 'testemunha', `🤫 ${s.L(w.id)} vê ${s.L(a.id)} e ${s.L(o.id)} juntos, e guarda o que viu.`, [w.id, a.id, o.id], 1, true);
          }
        }
      }
    },
  },
  {
    id: 'terminar', nome: 'Terminar', verbo: 'terminar com', cat: 'romance', alvo: true,
    pode: (s, a, b) => {
      const vs = s.vinculos(a.id, B(b).id);
      return vs.has('namoro') || vs.has('noivado') || vs.has('amantes');
    },
    peso: (s, a, b) => {
      const o = B(b);
      const amantes = s.temVinc(a.id, o.id, 'amantes');
      const culpa = amantes && s.comprometido(a) && (t(a, 'honesto') || t(a, 'leal')) ? 0.12 : 0;
      const outra = s.aoRedor(a).some((x) => x !== o.id && s.atracao(a.id, x) > 70) ? 0.08 : 0;
      return 0.02 + Math.max(0, 10 - s.opiniao(a.id, o.id)) / 60 + culpa + outra;
    },
    fazer: (s, a, b) => s.terminar(a, B(b), a),
  },
  {
    id: 'divorciar', nome: 'Pedir o divórcio', verbo: 'pedir o divórcio a', cat: 'romance', alvo: true,
    pode: (_s, a, b) => a.conjuge === B(b).id,
    peso: (s, a, b) => 0.01 + Math.max(0, -s.opiniao(a.id, B(b).id) - 35) / 70,
    fazer: (s, a, b) => s.terminar(a, B(b), a),
  },

  // ================================================================ conflito
  {
    id: 'brigar', nome: 'Partir para a briga', verbo: 'partir para cima de', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.idade(a) >= 12 && s.idade(B(b)) >= 12,
    peso: (s, a, b) => {
      const op = s.opiniao(a.id, B(b).id);
      if (op > -25 && a.estados['bebado'] !== s.t) return 0;
      return 0.04 + Math.max(0, -op - 25) / 45 + (s.vinculos(a.id, B(b).id).has('inimigos') ? 0.2 : 0);
    },
    fazer: (s, a, b) => {
      lutar(s, a, B(b), 'briga');
    },
  },
  {
    id: 'duelar', nome: 'Desafiar para um duelo', verbo: 'desafiar para um duelo', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.adulto(a) && s.adulto(B(b)),
    peso: (s, a, b) => {
      const op = s.opiniao(a.id, B(b).id);
      if (op > -50) return 0;
      return 0.02 + Math.max(0, -op - 50) / 90;
    },
    fazer: (s, a, b, g, resposta) => {
      const o = B(b);
      if (pergunta(s, a, o, 'desafio', `${a.nome} desafia ${o.nome} para um duelo.`, g, resposta)) return;
      const p = 0.35 + (t(o, 'corajoso') ? 0.35 : 0) + (t(o, 'orgulhoso') ? 0.25 : 0) - (t(o, 'covarde') ? 0.5 : 0);
      if (ok(s, p, g, resposta)) {
        lutar(s, a, o, 'duelo');
      } else {
        for (const x of s.aoRedor(o)) if (x !== a.id) s.mexe(x, o.id, { respeito: -8 });
        s.mexe(a.id, o.id, { respeito: -10 });
        s.say('conflito', 'covardia', `${s.L(o.id)} recusa o duelo de ${s.L(a.id)}; a vila cochicha que foi covardia.`, [a.id, o.id], 2);
        if (s.chance(0.25)) s.ganhaTraco(o, 'covarde');
      }
    },
  },
  {
    id: 'ameacar', nome: 'Ameaçar', verbo: 'ameaçar', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.idade(a) >= 14 && a.hab.combate + s.atrib(a).forca * 10 > B(b).hab.combate + s.atrib(B(b)).forca * 10,
    peso: (s, a, b) => (s.opiniao(a.id, B(b).id) < -20 ? 0.12 : 0),
    fazer: (s, a, b) => {
      const o = B(b);
      s.estresse(o, 12);
      s.mexe(o.id, a.id, { afeto: -8, respeito: 4 });
      s.lembra(o.id, a.id, 'me ameaçou', -10, 36);
      s.say('conflito', 'ameaca', `${s.L(a.id)} ameaça ${s.L(o.id)}: "da próxima vez, não vai ter conversa".`, [a.id, o.id], 1);
    },
  },
  {
    id: 'roubar', nome: 'Roubar', verbo: 'roubar', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.idade(a) >= 12 && (B(b).dinheiro > 20 || s.valorItens(B(b)) > 0) && !s.proximos(a.id, B(b).id) && a.conjuge !== B(b).id && s.parceiro(a)?.id !== B(b).id,
    peso: (_s, a) => (a.dinheiro < 15 || a.prof === 'ladrão' ? 0.05 : 0.008) * (a.prof === 'ladrão' ? 6 : 1),
    fazer: (s, a, b, g) => {
      const o = B(b);
      const p = 0.42 + (a.hab.intriga - o.hab.intriga) / 30;
      if (ok(s, p, g)) {
        const v = s.dar(o, a, Math.max(5, Math.min(25, o.dinheiro * 0.3)));
        s.sobe(a, 'intriga', 0.2);
        s.segredo('roubo', [a.id, o.id], [a.id]);
        o.estresse = Math.min(100, o.estresse + 10);
        s.say('conflito', 'roubo', `🤫 ${s.L(a.id)} rouba ${Math.round(v)} moedas de ${s.L(o.id)}.`, [a.id, o.id], 2, true);
        s.emitir('roubo', [a.id, o.id]);
        s.roubarItem(a, o);
      } else {
        s.lembra(o.id, a.id, 'tentou me roubar', -35, 96);
        s.mexe(o.id, a.id, { confianca: -40 });
        s.liga(a.id, o.id, 'rivais');
        const guarda = s.aoRedor(a).map((x) => s.pessoa(x)!).find((x) => x.prof === 'guarda' && x.id !== a.id);
        if (guarda) {
          a.dinheiro = Math.max(0, a.dinheiro - 10);
          s.mexe(guarda.id, a.id, { respeito: -15 });
        }
        s.say('conflito', 'roubo', `${s.L(o.id)} pega ${s.L(a.id)} com a mão na bolsa${guarda ? `; ${s.L(guarda.id)} aplica a multa` : ''}.`, [a.id, o.id, ...(guarda ? [guarda.id] : [])], 2);
        if (s.chance(0.3)) s.ganhaTraco(a, 'infame', false);
      }
    },
  },
  {
    id: 'assassinar', nome: 'Tramar um assassinato', verbo: 'tentar matar', cat: 'conflito', alvo: true,
    pode: (s, a, b) => s.adulto(a) && s.idade(B(b)) >= 12,
    peso: (s, a, b) => {
      const op = s.opiniao(a.id, B(b).id);
      if (op > -75 || t(a, 'gentil')) return 0;
      return 0.003 + Math.max(0, -op - 75) / 700;
    },
    fazer: (s, a, b, g) => {
      const o = B(b);
      const p = o.protegido ? 0 : 0.35 + (a.hab.intriga - o.hab.intriga) / 25;
      if (o.protegido && g) g = false;
      if (ok(s, p, g)) {
        s.segredo('assassinato', [a.id, o.id], [a.id]);
        s.ganhaTraco(a, 'assassino', false);
        if (!t(a, 'cruel')) s.estresse(a, 25);
        s.morrer(o, s.pick(['envenenad' + s.g(o, 'o', 'a'), 'esfaquead' + s.g(o, 'o', 'a') + ' num beco', 'numa queda suspeita', 'durante o sono']));
        s.say('conflito', 'assassinato', `🤫 Foi ${s.L(a.id)} quem matou ${s.L(o.id)}.`, [a.id, o.id], 3, true);
        s.emitir('assassinato', [a.id, o.id]);
      } else {
        s.lembra(o.id, a.id, 'tentou me matar', -70, 240);
        s.liga(a.id, o.id, 'inimigos');
        o.meta = { tipo: 'vinganca', alvo: a.id, desde: s.t };
        const m = s.ferir(o, false);
        s.say('conflito', 'atentado', `${s.L(a.id)} tenta matar ${s.L(o.id)}, e falha${m ? ` (${s.nomeTraco(o, m)})` : ''}. Agora são inimigos mortais.`, [a.id, o.id], 3);
        s.emitir('atentado', [a.id, o.id]);
      }
    },
  },

  // ================================================================ sozinho
  solo('trabalhar', 'Trabalhar dobrado', 'trabalhar dobrado', 'trabalho', (s, a) => s.adulto(a) && !!a.prof, () => 0.9, (s, a) => {
    const pr = s.prof(a);
    if (!pr) return;
    a.dinheiro += pr.renda * 0.5;
    s.sobe(a, pr.hab, 0.05);
    s.estresse(a, 2);
  }),
  solo('treinar', 'Treinar', 'treinar', 'trabalho', (s, a) => s.idade(a) >= 10, (_s, a) => 0.25 * (a.prof === 'soldado' || a.prof === 'guarda' ? 4 : 1), (s, a) => {
    s.sobe(a, 'combate', 0.15);
  }),
  solo('estudar', 'Estudar', 'estudar', 'trabalho', (s, a) => s.idade(a) >= 7, (_s, a) => 0.25 * (a.prof === 'estudioso' || a.prof === 'curandeiro' ? 4 : a.prof === 'sacerdote' ? 2 : 1), (s, a) => {
    s.sobe(a, 'saber', 0.15);
  }),
  solo('rezar', 'Rezar', 'rezar', 'vida', () => true, (_s, a) => 0.15 + (a.prof === 'sacerdote' ? 1 : 0), (s, a) => {
    s.estresse(a, -8);
    s.humor(a, 3);
  }),
  solo('beber', 'Beber', 'beber até cair', 'vida', (s, a) => s.adulto(a), (_s, a) => 0.25 + a.estresse / 100 + (a.gostos.includes('bebida') ? 0.3 : 0), (s, a) => {
    a.estados['bebado'] = s.t;
    s.estresse(a, -10);
    a.saude = Math.max(0, a.saude - 0.8);
    a.dinheiro = Math.max(0, a.dinheiro - 1);
    s.xp(a, 'bebedeiras');
    if (s.chance(0.02)) s.say('vida', 'bebedeira', `${s.L(a.id)} enche a cara e canta em cima da mesa da taverna.`, [a.id], 1);
  }),
  solo('viajar', 'Viajar', 'viajar', 'vida', (s, a) => s.adulto(a) && !a.viagem && s.destinos(a.local).length > 0, (s, a) => {
    const pr = s.prof(a);
    const sozinho = !s.comprometido(a) && a.meta?.tipo === 'amor' && !s.aoRedor(a).some((x) => s.atracao(a.id, x) > 40);
    return 0.012 * (pr?.viaja ? 12 : 1) * (sozinho ? 3 : 1) * (s.filhosOficiais(a.id).some((f) => s.crianca(f) && f.morte === null) ? 0.4 : 1);
  }, (s, a) => {
    const d = s.destinos(a.local);
    if (!d.length) return;
    const pr = s.prof(a);
    s.viajar(a, s.pick(d), pr?.viaja ? 'negócios' : s.pick(['ver o mundo', 'procurar a sorte', 'visitar parentes', 'fugir da rotina']));
  }),
];

export const interacao = (id: string): Interacao | undefined => INTERACOES.find((i) => i.id === id);
