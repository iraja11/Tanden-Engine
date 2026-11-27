import { describe, expect, it } from 'vitest';
import { banco, cerebro, novoEstado, sorteio } from '../src/index';

/*
 * A Ânima no Minecraft, a parte nova: briga e placar, faro de minério, esconde-esconde e pega-pega, avisos com
 * o lado do perigo e o modo estranho do escuro (espreitar). O básico (ordens, receitas, eventos) fica em
 * anima-cerebro.test.ts.
 */
describe('Ânima no Minecraft: melhor que você, e estranha no escuro', () => {
  const { entenderMine, responderMine, reagirMine, ladoDe, rumoDe, relativo, minerioDe } = cerebro;
  const now = new Date(2026, 10, 18, 15, 0).getTime();
  const rot = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };
  const jogo: cerebro.EstadoMine = {
    jogador: 'Iraja', mundo: 'Novo Mundo', vida: 20, vidaMax: 20, fome: 20, dimensao: 'overworld', bioma: 'minecraft:plains', hora: 6000, clima: 'limpo',
    y: 64, segurando: 'iron_pickaxe', hostis: 0, modoDela: 'seguir', bolso: 0,
  };
  const c = (x: Partial<cerebro.CtxMine> = {}): cerebro.CtxMine => ({ now, rand: sorteio(9), intensidade: 2, nome: 'amor', rotina: rot, jogo, ...x });

  it('entende brincadeiras, briga, faro e placar sem roubar as ordens antigas', () => {
    expect(entenderMine('vamos brincar de esconde-esconde')).toEqual({ tipo: 'acao', acao: 'esconder' });
    expect(entenderMine('se esconde ânima')).toEqual({ tipo: 'acao', acao: 'esconder' });
    expect(entenderMine('eu me escondo e você procura')).toEqual({ tipo: 'acao', acao: 'procurar' });
    expect(entenderMine('pega-pega!')).toEqual({ tipo: 'acao', acao: 'pegar' });
    expect(entenderMine('duvido você me pegar')).toEqual({ tipo: 'acao', acao: 'pegar' });
    expect(entenderMine('desisto')).toEqual({ tipo: 'acao', acao: 'desisto' });
    expect(entenderMine('me dá uma dica')).toEqual({ tipo: 'acao', acao: 'dica' });
    expect(entenderMine('me protege')).toEqual({ tipo: 'acao', acao: 'proteger' });
    expect(entenderMine('não briga com eles')).toEqual({ tipo: 'acao', acao: 'paz' });
    expect(entenderMine('fica em paz')).toEqual({ tipo: 'acao', acao: 'paz' });
    expect(entenderMine('me assusta')).toEqual({ tipo: 'acao', acao: 'espreitar' });
    expect(entenderMine('acha diamante pra mim')).toEqual({ tipo: 'farejar', alvo: 'diamante' });
    expect(entenderMine('tem ferro aqui perto?')).toEqual({ tipo: 'farejar', alvo: 'ferro' });
    expect(entenderMine('fareja')).toEqual({ tipo: 'farejar', alvo: 'qualquer' });
    expect(entenderMine('quem matou mais?')).toEqual({ tipo: 'placar' });
    // as antigas continuam iguais
    expect(entenderMine('onde acho diamante?')).toEqual({ tipo: 'duvida', tema: 'diamante' });
    expect(entenderMine('fica aqui')).toEqual({ tipo: 'acao', acao: 'ficar' });
    expect(entenderMine('pega uma flor pra mim')).toEqual({ tipo: 'acao', acao: 'colher' });
    expect(entenderMine('pega os itens')).toEqual({ tipo: 'acao', acao: 'coletar' });
    expect(entenderMine('me segue')).toEqual({ tipo: 'acao', acao: 'seguir' });
  });

  it('sabe onde fica, do seu ponto de vista', () => {
    // yaw 0 = olhando para o sul (+z); a direita é o oeste (−x)
    expect(relativo(0, 5, 0)).toMatchObject({ frente: 5 });
    expect(relativo(-3, 0, 0).direita).toBeCloseTo(3);
    expect(ladoDe(0, -4, 0)).toBe('atrás de você');
    expect(ladoDe(4, 0, 0)).toBe('à sua esquerda');
    // olhando para o oeste (yaw 90): o norte (−z) fica à direita
    expect(ladoDe(0, -4, 90)).toBe('à sua direita');
    // olhando para o norte (yaw 180): o oeste (−x) fica à esquerda
    expect(rumoDe(-6, -14, 0, 180)).toBe('14 pra baixo e 6 pra esquerda');
    expect(rumoDe(0, 0, 1, 0)).toBe('bem do seu lado');
    expect(minerioDe('deepslate_diamond_ore')).toEqual({ chave: 'diamante', nome: 'diamante' });
    expect(minerioDe('minecraft:ancient_debris').chave).toBe('netherite');
  });

  it('fareja: manda o pedido ao mod e fala com o caminho quando ele responde', () => {
    const s = novoEstado(now);
    const r = responderMine(s, { tipo: 'farejar', alvo: 'diamante' }, c());
    expect(r.envios).toEqual([{ t: 'farejar', alvo: 'diamante' }]);
    expect(r.fala).toBeNull();
    const achou = reagirMine(s, { tipo: 'faro', item: 'deepslate_diamond_ore', dx: 3, dy: -12, dz: 0, n: 4, yaw: 0 }, c());
    expect(achou.grupo).toBe('mine.faro.achou.diamante');
    expect(achou.fala!.texto).toMatch(/12 pra baixo/);
    expect(reagirMine(s, { tipo: 'faro', item: '', dx: 0, dy: 0, dz: 0, n: 0, yaw: 0 }, c()).grupo).toBe('mine.faro.nada');
  });

  it('conta o placar dos mobs e se gaba quando passa você', () => {
    let s = novoEstado(now);
    for (let i = 0; i < 4; i++) s = reagirMine(s, { tipo: 'voceMatou', mob: 'zombie' }, c({ rand: () => 0.99 })).estado;
    for (let i = 0; i < 4; i++) s = reagirMine(s, { tipo: 'matou', mob: 'zombie' }, c({ rand: () => 0.99 })).estado;
    expect(s.memoria.cerebro.minecraft).toMatchObject({ abates: 4, abatesVoce: 4 });
    const passou = reagirMine(s, { tipo: 'matou', mob: 'skeleton' }, c({ rand: () => 0.99 }));
    expect(passou.grupo).toBe('mine.placar.passei');
    expect(passou.fala!.texto).toMatch(/5/);
    // quieta na maior parte dos abates
    expect(reagirMine(passou.estado, { tipo: 'matou', mob: 'zombie' }, c({ rand: () => 0.99 })).fala).toBeNull();
    expect(responderMine(passou.estado, { tipo: 'placar' }, c()).grupo).toBe('mine.placar.ganhando');
    expect(responderMine(novoEstado(now), { tipo: 'placar' }, c()).grupo).toBe('mine.placar.zero');
  });

  it('brincadeiras: quem ganhou vai para o placar; dica e desisto só valem no jogo', () => {
    let s = novoEstado(now);
    s = reagirMine(s, { tipo: 'brincadeira', jogo: 'esconde', fase: 'achou', segundos: 80 }, c()).estado;
    expect(s.memoria.cerebro.minecraft).toMatchObject({ vitorias: 0, derrotas: 1 });
    const pegou = reagirMine(s, { tipo: 'brincadeira', jogo: 'pega', fase: 'pegou', segundos: 9 }, c());
    expect(pegou.grupo).toBe('mine.brinca.pega.pegou.rapido');
    expect(pegou.estado.memoria.cerebro.minecraft.vitorias).toBe(1);
    expect(reagirMine(s, { tipo: 'brincadeira', jogo: 'esconde', fase: 'dica', dist: 4 }, c()).grupo).toBe('mine.brinca.esconde.dica.quente');
    expect(reagirMine(s, { tipo: 'brincadeira', jogo: 'esconde', fase: 'dica', dist: 30 }, c()).grupo).toBe('mine.brinca.esconde.dica.frio');
    // fora do esconde-esconde, "dica" vira ideia e "desisto" vira "vem cá"
    expect(responderMine(s, { tipo: 'acao', acao: 'dica' }, c()).grupo).toMatch(/^mine\.ideia/);
    expect(responderMine(s, { tipo: 'acao', acao: 'desisto' }, c()).envios).toEqual([{ t: 'acao', acao: 'vir' }]);
    // no esconde-esconde, a fala vem depois (com a distância)
    const dica = responderMine(s, { tipo: 'acao', acao: 'dica' }, c({ jogo: { ...jogo, modoDela: 'esconder' } }));
    expect(dica.envios).toEqual([{ t: 'acao', acao: 'dica' }]);
    expect(dica.fala).toBeNull();
  });

  it('avisa do perigo pelo lado em que ele está', () => {
    const s = novoEstado(now);
    const cr = reagirMine(s, { tipo: 'creeper', dx: 0, dz: -3, yaw: 0 }, c());
    expect(cr.grupo).toBe('mine.creeper.lado');
    expect(cr.fala!.texto).toMatch(/atrás de você/);
    expect(reagirMine(s, { tipo: 'creeper' }, c()).grupo).toBe('mine.creeper');
    expect(reagirMine(s, { tipo: 'lava', dx: 2, dz: 0, yaw: 0 }, c()).fala!.texto).toMatch(/esquerda/);
    expect(reagirMine(s, { tipo: 'anoitecendo', dist: 230 }, c()).fala!.texto).toMatch(/230/);
  });

  it('no escuro, às vezes ela não fala: some e espreita', () => {
    const s = novoEstado(now);
    const noite = { ...jogo, hora: 18000 };
    const r = reagirMine(s, { tipo: 'espontanea' }, c({ jogo: noite, rand: () => 0.1 }));
    expect(r.fala).toBeNull();
    expect(r.envios).toEqual([{ t: 'acao', acao: 'espreitar', longe: true }]);
    // de dia, ou com a intensidade baixa, nada disso
    expect(reagirMine(s, { tipo: 'espontanea' }, c({ rand: () => 0.1 })).envios.some((e) => e.t === 'acao')).toBe(false);
    expect(reagirMine(s, { tipo: 'espontanea' }, c({ jogo: noite, intensidade: 1, rand: () => 0.1 })).envios.some((e) => e.t === 'acao')).toBe(false);
    // espreitar a pedido também é em silêncio
    const pedido = responderMine(s, { tipo: 'acao', acao: 'espreitar' }, c());
    expect(pedido.fala).toBeNull();
    expect(pedido.envios[0]).toMatchObject({ t: 'acao', acao: 'espreitar' });
    // e quando você a pega olhando
    expect(reagirMine(s, { tipo: 'flagrada', visto: true, segundos: 40, longe: false }, c()).grupo).toBe('mine.flagrada.perto');
    expect(reagirMine(s, { tipo: 'flagrada', visto: false, segundos: 90 }, c()).fala!.texto).toMatch(/90|olha pra trás/);
  });

  it('todo grupo novo do Minecraft existe no cofre', () => {
    const f = banco().falas;
    const grupos = [
      ...['esconder', 'procurar', 'pegar', 'desisto', 'dica', 'proteger', 'paz'].map((a) => `mine.acao.${a}`),
      ...['achou', 'achou.rapido', 'desistiu', 'dica', 'dica.quente', 'dica.morno', 'dica.frio'].map((x) => `mine.brinca.esconde.${x}`),
      ...['comecou', 'achou', 'achou.rapido', 'desistiu'].map((x) => `mine.brinca.procura.${x}`),
      ...['comecou', 'pegou', 'pegou.rapido', 'escapou'].map((x) => `mine.brinca.pega.${x}`),
      'mine.flagrada', 'mine.flagrada.perto', 'mine.flagrada.longe', 'mine.flagrada.naoviu', 'mine.espontanea.creepy',
      'mine.matou', 'mine.matou.marco', 'mine.voceMatou', 'mine.placar.passei', 'mine.placar.virou', 'mine.placar.ganhando', 'mine.placar.perdendo', 'mine.placar.zero',
      'mine.faro.achou', 'mine.faro.achou.diamante', 'mine.faro.achou.netherite', 'mine.faro.nada',
      'mine.creeper.lado', 'mine.lava', 'mine.anoitecendo', 'mine.placa.sono',
    ];
    for (const g of grupos) expect(f[g]?.length, g).toBeGreaterThan(0);
    // no nível 1 de intensidade, todo grupo novo ainda tem o que dizer
    for (const g of grupos) {
      expect(f[g]!.some((l) => typeof l === 'string' || !l.i || l.i <= 1), g).toBe(true);
    }
  });
});
