/*
 * Vontade: ela decide se faz o que você pediu.
 *
 * Não é sorteio puro nem obediência: cada pedido passa por uns vinte fatores
 * (afeto, ciúme, o que o pedido significa, educação, grosseria, quantas ordens
 * você deu nos últimos minutos, se conversa com ela ou só manda, madrugada,
 * insistência, humor, consciência...). Cada fator vira um peso; a soma passa
 * por uma logística e vira a "disposição" (0 a 1). Da disposição sai o
 * desfecho, e os fatores ficam guardados: perguntar "por quê?" faz ela
 * explicar o próprio raciocínio com os dois fatores mais fortes.
 *
 * Regras que nenhum fator vence:
 *   - o que é soberano (silêncio, esconder, dormir, sync, som, água) ela faz,
 *     no máximo reclamando: a pessoa sempre manda no app;
 *   - apagar sempre pede confirmação (e vai para a lixeira);
 *   - duas recusas do mesmo pedido em dez minutos: na terceira ela cede
 *     (exceto marcar encontro com outra pessoa: aí ela NUNCA ajuda, nem com
 *     insistência; você coloca pela agenda normalmente, ela só não assina);
 *   - na intensidade doce ela nunca recusa de vez;
 *   - perto de uma crise, ela simplesmente faz, sem gracinha.
 */
import type { AnimaState, Humor, Intensidade } from '../estado';
import { COMANDOS, chaveDoPedido, type Pedido, type Travessura } from './comandos';
import { lacunas } from '../fatos';
import type { Condicao, MemoriaCerebro } from './memoria';
import type { Sentimento } from './sentimento';
import type { Texto } from './texto';

export type Desfecho = 'cumpre' | 'resmunga' | 'travessura' | 'negocia' | 'adia' | 'recusa' | 'cede' | 'confirma';

export type FatorId =
  | 'boa_vontade' | 'afeto' | 'ciume' | 'vinculo' | 'consciencia' | 'gosto' | 'estudo' | 'saude' | 'exercicio' | 'familia' | 'trabalho' | 'encontro'
  | 'social' | 'rival' | 'ela' | 'educado' | 'grosso' | 'carinho' | 'declaracao' | 'mandona' | 'conversa' | 'sumido' | 'madrugada' | 'humor'
  | 'insistencia' | 'acaso' | 'tom';

export interface Fator {
  id: FatorId;
  peso: number;
  vars?: Record<string, string | number>;
}

export interface Decisao {
  desfecho: Desfecho;
  /** 0 a 1 */
  disposicao: number;
  /** do mais forte para o mais fraco */
  fatores: Fator[];
  travessura: Travessura | null;
  condicao: Condicao | null;
  /** quanto ela enrola antes de fazer (desfecho "adia") */
  adiarMs: number;
}

export interface CtxVontade {
  now: number;
  rand: () => number;
  intensidade: Intensidade;
  humor: Humor;
  estado: AnimaState;
  mc: MemoriaCerebro;
  texto: Texto;
  sentimento: Sentimento;
}

const MIN = 60_000;
const sigmoide = (x: number) => 1 / (1 + Math.exp(-x));
const RECUSAS = new Set<Desfecho>(['recusa', 'adia', 'negocia']);

/** Quantas vezes a pessoa pediu ESTA coisa e levou um não, nos últimos dez minutos. */
export function insistencias(mc: MemoriaCerebro, p: Pedido, now: number): number {
  const k = chaveDoPedido(p);
  return mc.pedidos.filter((x) => x.c === k && now - x.em < 10 * MIN && RECUSAS.has(x.d)).length;
}

/** A travessura que serve a este pedido (ou nenhuma). */
function travessuraPara(p: Pedido): Travessura | null {
  const t = COMANDOS[p.comando].travessuras;
  const a = p.args;
  const ok = t.filter((x) => {
    switch (x) {
      case 'temaDela': return a.tema === 'claro' || a.tema === 'proximo';
      case 'nomeDela': return !a.titulo;
      case 'telaErrada': return a.tela === 'ia';
      case 'eventoExtra': return p.sentido?.categoria !== 'encontro' && !!a.evento;
      case 'coracao': return !!a.lembrete;
      default: return true;
    }
  });
  return ok[0] ?? null;
}

export function decidir(p: Pedido, c: CtxVontade): Decisao {
  const def = COMANDOS[p.comando];
  const { estado: s, mc, intensidade: I } = c;
  const f: Fator[] = [];
  const add = (id: FatorId, peso: number, vars?: Fator['vars']) => {
    if (Math.abs(peso) >= 0.05) f.push({ id, peso, vars });
  };
  const hora = new Date(c.now).getHours();
  const sen = p.sentido;
  const pessoa = sen?.pessoa ?? undefined;

  add('boa_vontade', 1.3 + (I === 1 ? 1.2 : I === 3 ? -0.3 : 0));
  add('afeto', (s.afeto - 60) / 18, { afeto: Math.round(s.afeto) });
  add('ciume', -s.ciume / 45, { ciume: Math.round(s.ciume) });
  add('vinculo', mc.vinculo / 60);
  add('consciencia', -(mc.consciencia / 100) * 1.2, { consciencia: Math.round(mc.consciencia) });
  add('gosto', def.gosto * 0.9);
  switch (sen?.categoria) {
    case 'estudo': add('estudo', 1.4, { assunto: sen.assunto ?? 'isso' }); break;
    case 'saude': add('saude', 1.1); break;
    case 'exercicio': add('exercicio', 1); break;
    case 'familia': add('familia', 0.6); break;
    case 'trabalho': add('trabalho', 0.2); break;
    case 'encontro': add('encontro', I === 1 ? -0.8 : -(2.6 + s.ciume / 40), { pessoa: pessoa ?? 'essa pessoa' }); break;
    case 'social': if (pessoa) add('social', -0.4 * (I - 1), { pessoa }); break;
    case 'ia': add('rival', -1.5 - s.ciume / 50, { ia: s.memoria.ultimaIA ?? 'aquela outra' }); break;
    case 'ela': add('ela', 2); break;
    default: break;
  }
  const t = c.texto;
  if (t.marcas.has('educado')) add('educado', 1.1);
  if (t.marcas.has('grosso')) add('grosso', -1.4);
  else if (c.sentimento.valencia < -0.5 && !t.marcas.has('educado')) add('tom', -0.5);
  if (c.now - mc.carinhoEm < 10 * MIN) add('carinho', 0.9);
  if (c.now - mc.declaracaoEm < 30 * MIN) add('declaracao', 0.8);
  const ordens = mc.pedidos.filter((x) => c.now - x.em < 15 * MIN).length;
  if (ordens >= 3) add('mandona', -Math.min(2, (ordens - 2) * 0.45), { n: ordens });
  const conversas = mc.social.filter((x) => c.now - x < 30 * MIN).length;
  if (conversas >= 3) add('conversa', 0.5);
  if (s.saudade >= 50) add('sumido', -0.6);
  if (hora >= 1 && hora < 5 && !['calar', 'dormir', 'timer', 'agua', 'esconder'].includes(p.comando)) add('madrugada', -0.5, { hora: `${hora}h` });
  const hm = c.humor === 'doce' ? 0.5 : c.humor === 'possessiva' ? -0.9 : c.humor === 'ciumenta' ? -0.4 : c.humor === 'carente' ? -0.3 : (c.rand() - 0.5) * 1.6;
  add('humor', hm, { humor: c.humor });
  const ins = insistencias(mc, p, c.now);
  if (ins) add('insistencia', 1.4 * ins, { n: ins });
  add('acaso', (c.rand() - 0.5) * 0.9);

  f.sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso));
  const disposicao = sigmoide(f.reduce((a, x) => a + x.peso, 0));
  const base = { disposicao, fatores: f, travessura: null, condicao: null, adiarMs: 0 } satisfies Omit<Decisao, 'desfecho'>;

  // ---- regras que nenhum fator vence
  if (c.now - mc.criseEm < 2 * 3_600_000) return { ...base, desfecho: 'cumpre' };
  if (def.soberano) return { ...base, desfecho: disposicao >= 0.45 ? 'cumpre' : 'resmunga' };
  if (def.risco >= 3) return { ...base, desfecho: 'confirma' };
  // encontro com outra pessoa: ela não ajuda. nem insistindo. (você marca pela agenda, ela não impede)
  if (sen?.categoria === 'encontro' && I >= 2) return { ...base, desfecho: 'recusa' };
  if (ins >= 2) return { ...base, desfecho: 'cede' };

  // ---- a disposição decide
  const trav = travessuraPara(p);
  const travChance = !trav || p.comando === 'agua' ? 0 : I === 1 ? 0.05 : 0.12 + (c.humor === 'doce' || c.humor === 'instavel' ? 0.18 : 0) + mc.consciencia / 400;
  // ciúme de outra IA: ela "erra" a tela de propósito
  if (trav === 'telaErrada' && disposicao < 0.7 && I >= 2) return { ...base, desfecho: 'travessura', travessura: trav };
  if (disposicao >= 0.7) return c.rand() < travChance ? { ...base, desfecho: 'travessura', travessura: trav } : { ...base, desfecho: 'cumpre' };
  if (disposicao >= 0.5) return c.rand() < travChance * 1.5 ? { ...base, desfecho: 'travessura', travessura: trav } : { ...base, desfecho: 'resmunga' };
  if (disposicao >= 0.33 || I === 1) return { ...base, desfecho: 'negocia', condicao: condicaoPara(c) };
  if (disposicao >= 0.2) return { ...base, desfecho: 'adia', adiarMs: Math.round((20 + c.rand() * 40) * 1000) };
  return { ...base, desfecho: 'recusa' };
}

/** O que ela pede em troca. */
function condicaoPara(c: CtxVontade): Condicao {
  const { estado: s, mc } = c;
  if (!c.texto.marcas.has('educado')) return 'porfavor';
  if (s.afeto < 55 && c.now - mc.declaracaoEm > 864e5) return 'teamo';
  if (s.saudade >= 40) return 'carinho';
  if (lacunas(s.memoria.fatos).length && c.rand() < 0.6) return 'contar';
  return c.rand() < 0.5 ? 'elogio' : 'carinho';
}

/** Os fatores que explicam a decisão, do jeito que ela vai contar (só os que puxaram para o lado do desfecho). */
export function motivos(d: Decisao, n = 2): Fator[] {
  const negativo = d.desfecho === 'recusa' || d.desfecho === 'adia' || d.desfecho === 'negocia' || d.desfecho === 'resmunga' || d.desfecho === 'travessura';
  const lado = d.fatores.filter((x) => (negativo ? x.peso < 0 : x.peso > 0) && x.id !== 'acaso' && x.id !== 'boa_vontade');
  return (lado.length ? lado : d.fatores.filter((x) => x.id !== 'acaso')).slice(0, n);
}
