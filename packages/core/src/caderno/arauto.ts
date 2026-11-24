import { asText } from './frontmatter';
import { sameTitle } from './markdown';
import { censo, numeroCurto } from './almanaque';
import { faixaDe, perigoPorLugar, semHabitat } from './bestiario';
import { calendarioDoMundo, conjuncoes, formatarDataCal } from './calendario';
import { mercado, moedasDoMundo } from './economia';
import { NON_CARD_TYPES, parseWorldDate, timeline, worldYear, type Entity, type World } from './mundo';
import { VEREDITOS, arvorePoderes, equilibrio, portadores } from './poderes';
import { elencoQuimica, perfilPsique } from './psique';
import { reviewWorld } from './revisao';
import { contarLigacoes } from './jornada/progresso';

/*
 * O Arauto: notícias do seu mundo. Cruza a economia, os poderes, o bestiário,
 * o calendário, as personagens e a revisão, e avisa o que vale uma cena:
 * um monopólio, um poder quebrado, uma vila ao lado de um dragão, duas luas
 * cheias na mesma noite, dois personagens que vão se odiar.
 *
 * Cada sinal tem um id estável (o mesmo enquanto a situação durar), para a
 * tela lembrar o que já foi lido. Nada aqui grava nas notas.
 */

export type TomSinal = 'alerta' | 'presagio' | 'mercado' | 'ideia' | 'curiosidade' | 'marco';

export const TONS_SINAL: Record<TomSinal, { label: string; glifo: string; cor: string }> = {
  alerta: { label: 'Alerta', glifo: '⚠', cor: '#e5484d' },
  presagio: { label: 'Presságio', glifo: '☾', cor: '#b277ee' },
  mercado: { label: 'Mercado', glifo: '⚖', cor: '#e8c547' },
  ideia: { label: 'Ideia', glifo: '✧', cor: '#4fc1c9' },
  curiosidade: { label: 'Curiosidade', glifo: '❝', cor: '#f2a65a' },
  marco: { label: 'Marco', glifo: '★', cor: '#5fbf77' },
};

export type AcaoSinal = { tipo: 'abrir'; path: string } | { tipo: 'aba'; aba: string } | { tipo: 'criar'; ficha: string; nome?: string };

export interface Sinal {
  id: string;
  tom: TomSinal;
  titulo: string;
  texto: string;
  /** de 1 a 5: os de peso 4 ou mais podem virar aviso na tela */
  peso: number;
  acao?: AcaoSinal;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asText(e.props[key]).trim();
      if (v) return v;
    }
  }
  return '';
};
const lista = (es: Entity[], max = 3) => { const n = es.map((e) => e.name); return n.length <= max ? n.join(', ').replace(/, ([^,]*)$/, ' e $1') : `${n.slice(0, max).join(', ')} e mais ${n.length - max}`; };
const morta = (e: Entity) => !!prop(e, 'morte', 'morreu') || /mort|falec/.test(fold(prop(e, 'status')));

export interface OpcoesArauto {
  posicoes?: Map<string, { x: number; y: number }>;
}

export function sinaisDoMundo(w: World, ler: (path: string) => string, o: OpcoesArauto = {}): Sinal[] {
  const out: Sinal[] = [];
  const add = (s: Sinal) => { if (!out.some((x) => x.id === s.id)) out.push(s); };
  const fichas = w.entities.filter((e) => !NON_CARD_TYPES.has(e.type));
  const conta = (t: string) => w.entities.filter((e) => e.type === t).length;

  // ---------------------------------------------------------------- economia
  const m = mercado(w, o.posicoes);
  for (const r of m.recursos) {
    if (r.monopolio) {
      add({ id: `monopolio:${r.id}:${r.monopolio.path}`, tom: 'mercado', peso: 4, titulo: `${r.monopolio.name} controla todo o ${r.nome.toLowerCase()}`,
        texto: `${r.consumidores.length ? `${lista(r.consumidores)} dependem dela.` : 'Ninguém mais produz.'} Monopólio é motivo de guerra, contrabando e chantagem.`, acao: { tipo: 'aba', aba: 'mercado' } });
    }
    if (!r.produtores.length && r.consumidores.length >= 2) {
      add({ id: `escassez:${r.id}`, tom: 'alerta', peso: 4, titulo: `Ninguém produz ${r.nome.toLowerCase()}`,
        texto: `${lista(r.consumidores)} precisam e nenhum lugar produz. Importação de longe, contrabando, ou uma crise prestes a estourar?`, acao: { tipo: 'aba', aba: 'mercado' } });
    }
  }
  for (const nome of m.semFicha.slice(0, 3)) {
    add({ id: `semficha:${fold(nome)}`, tom: 'ideia', peso: 2, titulo: `${nome} circula sem ficha`, texto: 'Os lugares citam este recurso, mas ele não tem preço nem história. Uma ficha dá valor de mercado e rotas.', acao: { tipo: 'criar', ficha: 'recurso', nome } });
  }
  if (conta('lugar') >= 3 && !moedasDoMundo(w).length) {
    add({ id: 'semmoeda', tom: 'ideia', peso: 2, titulo: 'Com o que se paga aqui?', texto: 'O mundo tem lugares, mas nenhuma moeda. Ouro, conchas, favores, créditos: o dinheiro diz quem manda.', acao: { tipo: 'criar', ficha: 'moeda' } });
  }

  // ---------------------------------------------------------------- poderes
  const arv = arvorePoderes(w, ler);
  for (const p of arv.poderes) {
    const eq = equilibrio(p);
    if (eq.veredito === 'quebrado') add({ id: `quebrado:${p.e.path}`, tom: 'alerta', peso: 4, titulo: `${p.e.name} está quebrado`, texto: `${VEREDITOS.quebrado.desc} ${eq.dicas[0] ?? ''}`.trim(), acao: { tipo: 'abrir', path: p.e.path } });
    if (!portadores(w, p.e.path).length && w.entities.some((e) => e.type === 'personagem')) add({ id: `orfao:${p.e.path}`, tom: 'ideia', peso: 1, titulo: `Ninguém tem ${p.e.name}`, texto: 'Um poder sem dono é só teoria. Quem nasceu com ele, quem o roubou, quem morreu tentando?', acao: { tipo: 'abrir', path: p.e.path } });
  }
  for (const c of arv.ciclos.slice(0, 2)) {
    const e = w.entities.find((x) => x.path === c);
    if (e) add({ id: `ciclo:${c}`, tom: 'alerta', peso: 3, titulo: `${e.name} exige a si mesmo`, texto: 'Os pré-requisitos formam um círculo: ninguém conseguiria aprender o primeiro. Quebre o ciclo em "requer".', acao: { tipo: 'abrir', path: c } });
  }

  // ---------------------------------------------------------------- bestiário
  const pop = censo(w);
  const totalDe = new Map<string, number>();
  const andar = (n: (typeof pop.raizes)[number]) => { totalDe.set(n.lugar.path, n.total); n.filhos.forEach(andar); };
  pop.raizes.forEach(andar);
  for (const p of perigoPorLugar(w).slice(0, 6)) {
    const gente = totalDe.get(p.lugar.path) ?? 0;
    if (p.maior && p.maior.nd >= 8 && gente >= 300) {
      add({ id: `ameaca:${p.lugar.path}:${p.maior.criatura.path}`, tom: 'presagio', peso: 4, titulo: `${p.maior.criatura.name} ronda ${p.lugar.name}`,
        texto: `${numeroCurto(gente)} pessoas vivem onde vive uma ameaça ${faixaDe(p.maior.nd).label.toLowerCase()}. Quem as protege, e quanto isso custa?`, acao: { tipo: 'abrir', path: p.lugar.path } });
    }
  }
  const soltas = semHabitat(w);
  if (soltas.length) add({ id: `semhabitat:${soltas.length}`, tom: 'ideia', peso: 1, titulo: `${soltas.length === 1 ? `${soltas[0]!.name} não tem` : `${soltas.length} criaturas não têm`} habitat`, texto: 'Sem "habitat", elas não entram nas tabelas de encontros das regiões.', acao: { tipo: 'aba', aba: 'seres' } });

  // ---------------------------------------------------------------- calendário
  const cal = calendarioDoMundo(w, ler);
  if (cal.e) {
    const ano = worldYear(w);
    const conj = conjuncoes(cal, ano);
    if (conj[0]) add({ id: `conjuncao:${ano}:${conj[0].mes}:${conj[0].dia}`, tom: 'presagio', peso: 3, titulo: `Noite de ${cal.luas.length} luas cheias`, texto: `Em ${formatarDataCal(conj[0], cal)}, ${cal.luas.map((l) => l.nome).join(' e ')} ficam cheias juntas. Que profecia, ritual ou crime espera essa noite?`, acao: { tipo: 'aba', aba: 'sistemas' } });
    cal.avisos.slice(0, 2).forEach((a, i) => add({ id: `cal:${i}:${fold(a).slice(0, 40)}`, tom: 'alerta', peso: 2, titulo: 'O calendário tem um furo', texto: a, acao: { tipo: 'abrir', path: cal.e!.path } }));
  } else if (timeline(w).length >= 6) {
    add({ id: 'semcalendario', tom: 'ideia', peso: 2, titulo: 'O tempo precisa de nomes', texto: 'Já há várias datas no mundo. Um calendário próprio (meses, semana, luas, festas) faz o tempo parecer daqui.', acao: { tipo: 'criar', ficha: 'calendario', nome: `Calendário de ${w.name}` } });
  }

  // ---------------------------------------------------------------- personagens
  const pessoas = w.entities.filter((e) => e.type === 'personagem');
  if (pessoas.length >= 3) {
    const el = elencoQuimica(w, 10);
    if (el.pior && el.pior.q.pontos <= -40) add({ id: `odio:${el.pior.a.path}:${el.pior.b.path}`, tom: 'curiosidade', peso: 3, titulo: `${el.pior.a.name} e ${el.pior.b.name} são pólvora`, texto: `${el.pior.q.razoes.slice(0, 2).join('; ')}. Ponha os dois numa sala fechada e escreva o que acontece.`, acao: { tipo: 'abrir', path: el.pior.a.path } });
    if (el.melhor && el.melhor.q.pontos >= 45) add({ id: `laco:${el.melhor.a.path}:${el.melhor.b.path}`, tom: 'curiosidade', peso: 2, titulo: `${el.melhor.a.name} e ${el.melhor.b.name}: laço forte`, texto: `${el.melhor.q.razoes.slice(0, 2).join('; ')}. Laço forte é o melhor alvo de uma tragédia.`, acao: { tipo: 'abrir', path: el.melhor.a.path } });
    const links = contarLigacoes(w);
    const principal = [...pessoas].sort((a, b) => (links.get(b.path) ?? 0) - (links.get(a.path) ?? 0))[0]!;
    const pf = perfilPsique(principal);
    if ((links.get(principal.path) ?? 0) >= 3 && pf.tracos.length + pf.soltos.length < 2) add({ id: `semtracos:${principal.path}`, tom: 'ideia', peso: 2, titulo: `Quem é ${principal.name} por dentro?`, texto: 'É a personagem mais ligada do mundo, mas quase não tem traços. Três traços já desenham o perfil e a química com os outros.', acao: { tipo: 'abrir', path: principal.path } });
  }
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  for (const f of w.entities.filter((e) => e.type === 'faccao')) {
    const lider = f.relations.find((r) => r.to && /^(lider|chefe|mestre|rei|rainha|governante)$/.test(fold(r.label)));
    const p = lider ? byPath.get(lider.to!) : undefined;
    if (p && p.type === 'personagem' && morta(p) && !prop(f, 'fim', 'dissolução') && !/extint|dissolv|caiu/.test(fold(prop(f, 'status')))) {
      add({ id: `lidermorto:${f.path}:${p.path}`, tom: 'alerta', peso: 3, titulo: `${f.name} é liderada por alguém morto`, texto: `${p.name} morreu, mas segue como líder. Disputa de sucessão? Um impostor? Ou ninguém teve coragem de contar?`, acao: { tipo: 'abrir', path: f.path } });
    } else if (!lider && fichas.length >= 8) {
      add({ id: `semlider:${f.path}`, tom: 'ideia', peso: 1, titulo: `${f.name} não tem líder`, texto: 'Quem dá as ordens? E quem quer o lugar dele?', acao: { tipo: 'abrir', path: f.path } });
    }
  }

  // ---------------------------------------------------------------- profecias
  const agora = worldYear(w);
  for (const p of w.entities.filter((e) => e.type === 'profecia')) {
    const st = fold(prop(p, 'status'));
    const n = parseWorldDate(prop(p, 'data'));
    if (/cumpr|fals/.test(st) || n === null) continue;
    const anos = Math.floor(agora - n);
    if (anos >= 50) add({ id: `profecia:${p.path}`, tom: 'presagio', peso: 3, titulo: `A profecia espera há ${anos.toLocaleString('pt-BR')} anos`, texto: `${p.name} ainda não se cumpriu. Quem continua acreditando, e quem já desistiu?`, acao: { tipo: 'abrir', path: p.path } });
  }

  // ---------------------------------------------------------------- revisão e marcos
  const erros = reviewWorld(w).filter((i) => i.level === 'erro').length;
  if (erros) add({ id: `erros:${erros}`, tom: 'alerta', peso: erros >= 3 ? 4 : 3, titulo: `${erros} ${erros === 1 ? 'contradição' : 'contradições'} na linha do tempo`, texto: 'Datas que não batem. Resolva, ou transforme o erro em mistério de propósito.', acao: { tipo: 'aba', aba: 'ideias' } });
  for (const marco of [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9]) {
    if (pop.total >= marco && pop.total < marco * 10) add({ id: `pop:${marco}`, tom: 'marco', peso: 2, titulo: `${w.name} passou de ${numeroCurto(marco)} habitantes`, texto: `O censo soma ${numeroCurto(pop.total)} pessoas em ${pop.contados} ${pop.contados === 1 ? 'lugar contado' : 'lugares contados'}.`, acao: { tipo: 'aba', aba: 'almanaque' } });
  }
  const links = contarLigacoes(w);
  const centro = [...fichas].sort((a, b) => (links.get(b.path) ?? 0) - (links.get(a.path) ?? 0))[0];
  if (centro && (links.get(centro.path) ?? 0) >= 8) add({ id: `centro:${centro.path}`, tom: 'marco', peso: 1, titulo: `${centro.name} virou o centro do mundo`, texto: `${links.get(centro.path)} fichas se ligam a ela. O que acontece com o mundo se ela cair?`, acao: { tipo: 'abrir', path: centro.path } });

  return out.sort((a, b) => b.peso - a.peso).slice(0, 40);
}
