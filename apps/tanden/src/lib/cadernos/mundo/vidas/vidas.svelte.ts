import {
  MOTOR_VERSAO, abrirSim, catalogo, cronicaMarkdown, entityFolder, entityTemplate, fichasDaSimulacao, lacosDasFichas, noteDir, pessoaDaFicha, povoar, readSim,
  regrasHash, saveDe, setProps, setSection, getSection, simNoteText, type Comando, type Laco, type Nomeador, type Passo, type Pessoa, type SimSave,
  type VidaEvento, type Vidas, type World,
} from '@tanden/core';
import { sound } from '../../../sound.svelte';
import { cadernos } from '../../cadernos.svelte';

// Estado da simulação de vidas aberta. O motor (Vidas) é uma classe comum,
// fora do $state: a tela acompanha pelo contador `ver`, que sobe a cada mês
// andado ou intervenção. A nota da simulação é regravada logo depois, com
// só o que mudou (o mês atual e as intervenções novas).

interface Aberta {
  path: string;
  sim: Vidas;
  base: Pick<SimSave, 'elenco' | 'lacos' | 'regras'>;
  avisos: string[];
}

export interface NovaSim {
  nome: string;
  lugar: string;
  ano: number;
  mes: number;
  /** caminhos das fichas que entram */
  fichas: string[];
  figurantes: number;
  estilo: string;
  semente: number;
}

class VidasStore {
  /** sobe a cada mudança na simulação aberta */
  ver = $state(0);
  aberta = $state<Aberta | null>(null);
  ocupado = $state(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  get sim(): Vidas | null {
    return this.aberta?.sim ?? null;
  }

  /** Abre uma simulação salva: lê a nota e refaz os meses. */
  abrir(path: string, w: World): boolean {
    const sv = readSim(path, cadernos.read(path));
    if (!sv) {
      cadernos.say('Não consegui ler esta simulação (o bloco ```vidas está quebrado?).');
      return false;
    }
    this.ocupado = true;
    try {
      const { sim, avisos } = abrirSim(sv, w, { rules: cadernos.program(w), tables: cadernos.tables, positions: cadernos.positions(w) });
      this.aberta = { path, sim, base: { elenco: sv.elenco, lacos: sv.lacos, regras: sv.regras }, avisos };
      this.ver++;
      sound.play('open');
      return true;
    } finally {
      this.ocupado = false;
    }
  }

  fechar(): void {
    this.salvarJa();
    this.aberta = null;
    this.ver++;
  }

  /** Monta o elenco (fichas + figurantes), grava a nota da simulação e abre. */
  criar(w: World, cfg: NovaSim): string | null {
    const cat = catalogo(cadernos.program(w), w.entities);
    const inicio = cfg.ano * 12 + (cfg.mes - 1);
    const escolhidas = new Set(cfg.fichas);
    const fichas = w.entities
      .filter((e) => e.type === 'personagem' && escolhidas.has(e.path))
      .map((e) => pessoaDaFicha(e, w, cat, { inicio, lugar: cfg.lugar }))
      .filter((p): p is Pessoa => !!p);
    const nomes: Nomeador = { estilo: cfg.estilo, amostras: w.entities.filter((e) => e.type === 'personagem').map((e) => e.name) };
    const pov = povoar(cat, { quantos: cfg.figurantes, inicio, lugar: cfg.lugar, semente: cfg.semente, nomes, existentes: fichas });
    const lacos: Laco[] = [...lacosDasFichas(w.entities, new Set(fichas.map((p) => p.id))), ...pov.lacos];
    const sv: SimSave = {
      versao: MOTOR_VERSAO, nome: cfg.nome.trim() || 'Simulação', mundo: w.name, semente: cfg.semente, inicio, lugar: cfg.lugar, meses: 0, regras: regrasHash(w),
      elenco: [...fichas, ...pov.pessoas], lacos, registro: [],
    };
    if (!sv.elenco.length) {
      cadernos.say('Escolha pelo menos uma ficha ou peça alguns figurantes.');
      return null;
    }
    const folder = `${w.path ? noteDir(w.path) : `Mundos/${w.name}`}/Simulações`;
    const path = cadernos.create(folder, sv.nome, (n) => simNoteText({ ...sv, nome: n }, w));
    this.abrir(path, cadernos.worlds.find((x) => x.name === w.name) ?? w);
    return path;
  }

  /** Anda `meses`; com `importante`, para no primeiro marco de quem tem ficha ou é conduzido. */
  andar(meses: number, importante = false): Passo | null {
    const a = this.aberta;
    if (!a) return null;
    const s = a.sim;
    const parar = importante
      ? (e: VidaEvento) => e.peso >= 3 && e.quem.some((id) => { const p = s.pessoa(id); return !!p && (!!p.nota || p.conduzido); })
      : undefined;
    const r = s.avancar(meses, parar);
    this.ver++;
    this.salvar();
    if (r.parou === 'decisao') sound.play('alert');
    else if (r.novos.some((e) => e.peso >= 3)) sound.play('receive');
    else sound.play('tick');
    return r;
  }

  /** Uma intervenção de quem joga. */
  agir(cmd: Comando): void {
    const a = this.aberta;
    if (!a) return;
    a.sim.comando(cmd);
    this.ver++;
    this.salvar();
    sound.play('tick');
  }

  /** Grava a nota da simulação (com uma pequena espera, para juntar vários cliques). */
  salvar(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvarJa(), 900);
  }

  salvarJa(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const a = this.aberta;
    if (!a || !cadernos.exists(a.path)) return;
    const w = cadernos.worlds.find((x) => x.name === a.sim.world.name);
    cadernos.typed(a.path, simNoteText(saveDe(a.sim, a.base), w));
  }

  /**
   * Grava o estado da simulação nas fichas: atualiza as que existem e cria
   * as de quem nasceu ou foi gerado (só para quem está em `so`, se vier).
   */
  gravarFichas(so?: Set<string>): number {
    const a = this.aberta;
    if (!a) return 0;
    const s = a.sim;
    const w = cadernos.worlds.find((x) => x.name === s.world.name) ?? s.world;
    const fichas = fichasDaSimulacao(s, so ? { so } : {});
    let n = 0;
    // primeiro cria as fichas novas (para os [[links]] das outras já acharem)
    for (const f of fichas) {
      if (f.path && cadernos.exists(f.path)) continue;
      const path = cadernos.create(entityFolder(w, 'personagem'), f.nome, (nome) => entityTemplate(nome, w.name, 'personagem'));
      s.comando({ c: 'vincular', p: f.id, nota: path });
      f.path = path;
    }
    for (const f of fichas) {
      if (!f.path) continue;
      const linhas = f.registro;
      cadernos.update(f.path, (t) => {
        let x = setProps(t, f.props);
        if (linhas.length) {
          const cur = (getSection(x, 'Registro') ?? '').replace(/\s+$/, '');
          const novas = linhas.filter((l) => !cur.includes(l));
          if (novas.length) x = setSection(x, 'Registro', `${cur ? `${cur}\n` : ''}${novas.map((l) => `- ${l}`).join('\n')}`);
        }
        return x;
      });
      n++;
    }
    this.ver++;
    this.salvarJa();
    sound.play('complete');
    return n;
  }

  /** Salva a crônica como nota e devolve o caminho. */
  salvarCronica(minPeso = 2): string | null {
    const a = this.aberta;
    if (!a) return null;
    const s = a.sim;
    const w = cadernos.worlds.find((x) => x.name === s.world.name) ?? s.world;
    const folder = `${w.path ? noteDir(w.path) : `Mundos/${w.name}`}/Simulações`;
    return cadernos.create(folder, `${s.cfg.nome} — crônica até ${s.data().split(' ')[1]}`, () => cronicaMarkdown(s, minPeso));
  }
}

export const vidas = new VidasStore();
