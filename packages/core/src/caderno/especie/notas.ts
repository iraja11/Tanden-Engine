import { SPECIES_PLANS, speciesPlan } from './catalogo';
import { fold, speciesFigure, speciesValue } from './figura';
import { speciesWeightGuess } from './sorteio';

/*
 * O "biólogo de plantão": olha a ficha e aponta o que não fecha (um voador de
 * dez toneladas) e o que a biologia sugere para a cultura. Nunca proíbe nada:
 * num mundo de magia, cada aviso é uma pergunta boa de responder.
 */

export interface SpeciesNote {
  tipo: 'aviso' | 'ideia';
  texto: string;
}

const num = (s: string) => {
  const m = /\d+(?:[.,]\d+)?/.exec(s.replace(/\.(?=\d{3}\b)/g, ''));
  return m ? Number(m[0].replace(',', '.')) : 0;
};

export function speciesNotes(props: Record<string, unknown>): SpeciesNote[] {
  const v = (k: string) => fold(speciesValue(props, k));
  const out: SpeciesNote[] = [];
  const aviso = (texto: string) => out.push({ tipo: 'aviso', texto });
  const ideia = (texto: string) => out.push({ tipo: 'ideia', texto });
  const fig = speciesFigure(props);
  const plano = speciesPlan(v('corpo'));
  const medida = num(v('altura'));
  const peso = num(v('peso'));
  const voa = !!fig.asa || /\bvoa\b/.test(v('locomocao'));
  const magia = /magia|levita/.test(`${v('metabolismo')} ${v('dons')} ${v('locomocao')}`);
  const dieta = v('dieta');
  const vida = num(v('expectativa de vida'));
  const adulto = num(v('maioridade'));

  // o que não fecha
  if (voa && peso > 250 && !magia) aviso(`Com ${v('peso')} kg, voar pede explicação: o maior voador que já existiu pesava uns 250 kg. Magia, gás mais leve que o ar ou ar mais denso?`);
  if (medida > 0 && peso > 0) {
    const esperado = speciesWeightGuess(plano, medida, fig.porte);
    if (peso < esperado / 5 && !/espectral|elemental|enxame|orbe/.test(plano)) aviso(`Leve demais para o tamanho: um corpo assim pesaria perto de ${esperado} kg. Ossos ocos, corpo de gás?`);
    else if (peso > esperado * 6) aviso(`Pesado demais para o tamanho: um corpo assim pesaria perto de ${esperado} kg. É feito de pedra ou metal?`);
  }
  if (/quitina/.test(fig.revestimento) && medida > 1.5 && /hexapode|octopode|miriapode|crustaceo/.test(plano)) aviso('Artrópodes gigantes sufocam e racham: precisam de ar muito rico em oxigênio, ou de viver na água.');
  if (!/bipede|colosso|arboreo/.test(plano) && medida > 40 && !SPECIES_PLANS[plano].comprido) aviso('Em terra, passar de 40 m esmaga as próprias pernas. Só a água sustenta corpos assim.');
  if (/fotossint/.test(dieta) && /noite/.test(v('atividade'))) aviso('Vive de luz, mas só acorda à noite. De onde vem a energia?');
  if (/fotossint/.test(dieta) && /vive sem luz/.test(v('adaptacoes'))) aviso('Fotossintético não sobrevive sem luz.');
  if (/sangue frio/.test(v('metabolismo')) && /gelado|frio/.test(v('clima'))) aviso('Sangue frio em clima gelado: passa a maior parte do tempo imóvel. Fontes termais? Sol forte?');
  if (adulto > 0 && vida > 0 && adulto >= vida) aviso('A maioridade chega depois da morte: confira os números.');
  if (/carn|pisc/.test(dieta) && /sem dentes/.test(v('denticao')) && !/bico/.test(fig.cabeca)) aviso('Carnívoro sem dentes nem bico: como rasga a carne?');
  if (/herb/.test(dieta) && /sabre/.test(v('denticao'))) ideia('Herbívoro de dentes-de-sabre: as presas servem para brigar por parceiros, como no cervo-almiscarado.');
  if (/cego/.test(v('sentidos')) && fig.olhos > 0 && v('olhos')) aviso('Marcado como cego, mas tem olhos: atrofiados, de enfeite, ou enxergam outra coisa?');
  if (/predador de topo/.test(v('papel ecologico')) && /abundante|praga/.test(v('frequencia'))) aviso('Predador de topo é sempre raro: uma população enorme acabaria com a própria comida.');
  if (/guelras/.test(fig.marcas.join(' ')) && /deserto|ermo/.test(v('habitat'))) aviso('Guelras no deserto: de onde vem a água?');

  // o que a biologia sugere para a cultura
  const sapiente = /sapiente|coletiva|ancestral/.test(v('inteligencia'));
  if (sapiente) {
    if (/cascos|nadadeiras/.test(fig.extremidade) && fig.bracos === 0) ideia('Sem mãos, como fabricam coisas? Boca, tentáculos, servos de outra espécie?');
    if (vida >= 300) ideia(`Vivendo ${vida} anos, uma pessoa vê dinastias inteiras passar. Como é a política quando ninguém esquece?`);
    if (vida > 0 && vida <= 25) ideia('Com vida tão curta, o saber precisa passar rápido: canções, memória herdada, escolas desde o berço?');
    if (/ovi/.test(v('reproducao'))) ideia('Quem põe ovos pode criar os filhos em ninhos comunais. O que é "família" para eles?');
    if (/muda com/.test(v('sexos'))) ideia('Se o sexo muda ao longo da vida, como ficam casamento, herança e papéis sociais?');
    if (/hermafrodita|um so/.test(v('sexos'))) ideia('Sem divisão de sexos, que outra diferença a sociedade inventa para separar as pessoas?');
    if (/telepatia/.test(`${v('comunicacao')} ${v('sentidos')}`)) ideia('Entre telepatas não existe segredo. Como são a diplomacia, o amor e o crime?');
    if (/noite/.test(v('atividade'))) ideia('Povo noturno: cidades sem janelas, arte em relevo, calendário guiado pelas estrelas.');
    if (/ecolocalizacao|cego/.test(v('sentidos'))) ideia('Quem "vê" com o som tem arquitetura de eco, e silêncio é falta de educação ou arma de guerra.');
    if (/nao dorme/.test(v('metabolismo'))) ideia('Sem sono, não existem noite de folga nem sonhos. Que religião nasce sem sonhos?');
    if (/de emocoes|de memorias|de sonhos|de almas/.test(dieta)) ideia('Comer emoções, memórias ou almas faz dos outros povos gado. Há quem aceite ser alimento em troca de algo?');
  }
  return out.slice(0, 6);
}
