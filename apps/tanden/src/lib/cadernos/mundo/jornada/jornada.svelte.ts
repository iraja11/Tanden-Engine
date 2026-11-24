import {
  CONQUISTAS, ContadorEscrita, atividadeDoMundo, bausDoAutor, calcularSequencia, colecaoDe, countWords, diaLocal, diasCumpridos, estadoDoMundo, gerarMissoes,
  marcasDoMomento, medirAutor, medirMissao, novasConquistas, pontosDoMundo, sinaisDoMundo, sortearCarta,
  type Bau, type Carta, type Conquista, type EstadoMundo, type Metricas, type Missao, type Sequencia, type Sinal, type Vitrine, type World,
} from '@tanden/core';
import { engine } from '../../../engine.svelte';
import { sound } from '../../../sound.svelte';
import { cadernos } from '../../cadernos.svelte';

// Progresso de escrita nos mundos. A lógica (níveis, conquistas, sequência) mora
// no núcleo; aqui ficam o relógio do sprint, a contagem ao vivo e a fila de avisos.

export interface OpcoesSprint {
  minutos: number;
  meta: number;
  /** Escreva ou Desapareça: parou de escrever, o texto some da vista */
  duro: boolean;
}

export interface Sprint extends OpcoesSprint {
  mundo: string;
  inicio: number;
  fim: number;
  palavras: number;
  restante: number;
  /** de 0 (texto normal) a 1 (texto sumiu) */
  sumir: number;
}

export interface ResultadoSprint {
  ok: boolean;
  duro: boolean;
  palavras: number;
  meta: number;
  ppm: number;
  recorde: boolean;
}

export type Aviso =
  | { id: number; tipo: 'conquista'; conquista: Conquista; mais: number }
  | { id: number; tipo: 'nivel'; mundo: string; nivel: number; moeda: string }
  | { id: number; tipo: 'era'; mundo: string; era: string; desc: string; glifo: string }
  | { id: number; tipo: 'missao'; texto: string; xp: number; moeda: string }
  | { id: number; tipo: 'lote'; n: number }
  | { id: number; tipo: 'bau'; titulo: string; n: number }
  | { id: number; tipo: 'sinal'; mundo: string; sinal: Sinal };

type AvisoNovo = Aviso extends infer A ? (A extends Aviso ? Omit<A, 'id'> : never) : never;

/** Sem digitar por este tempo, a sessão de escrita acabou e os avisos podem aparecer. */
const FIM_DA_SESSAO_MS = 20_000;
/** Escreva ou Desapareça: pausa tolerada antes de o texto começar a sumir. */
const GRACA_MS = 8_000;
const SUMIR_MS = 12_000;
const FAISCA_A_CADA = 25;

class Jornada {
  /** sobe quando o registro muda; as telas derivam dele */
  rev = $state(0);
  /** avisos na tela */
  avisos = $state<Aviso[]>([]);
  sprint = $state<Sprint | null>(null);
  resultado = $state<ResultadoSprint | null>(null);
  /** sobe a cada punhado de palavras: acende uma faísca discreta */
  faisca = $state(0);
  /** palavras escritas desde que o app abriu */
  sessao = $state(0);
  /** o último texto escrito, para o sprint saber onde voltar */
  ultimoTexto = $state<string | null>(null);
  /** pedido vindo de uma missão: abrir o painel de sprint no próximo editor */
  querSprint = $state(false);

  private started = false;
  private contador = new ContadorEscrita();
  private espera: Aviso[] = [];
  private proximoId = 1;
  private ultimoDigitado = 0;
  private editores = 0;
  private timerAvaliar: ReturnType<typeof setTimeout> | null = null;
  private timerGravar: ReturnType<typeof setTimeout> | null = null;
  private relogio: ReturnType<typeof setInterval> | null = null;
  private niveis = new Map<string, { nivel: number; era: number }>();
  private primeira = true;
  private quaseSumiu = false;
  /** baús fechados na última avaliação, para avisar só dos novos */
  private fechadosAntes: number | null = null;
  /** sinais do arauto já anunciados nesta sessão */
  private anunciados = new Set<string>();
  /** pedido de abrir um painel vindo de um aviso */
  pedido = $state<null | { tipo: 'tesouro' } | { tipo: 'arauto'; mundo: string }>(null);

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.jornada.onChange(() => { this.rev++; });
    $effect.root(() => {
      $effect(() => { void cadernos.rev; this.agendar(); });
    });
    setInterval(() => this.soltarAvisos(), 1500);
  }

  // ------------------------------------------------ leituras

  get hoje(): string { return diaLocal(new Date()); }
  get registro() { void this.rev; return engine.jornada.registro; }
  get meta(): number { return this.registro.ajustes.meta; }

  get sequencia(): Sequencia {
    return calcularSequencia(diasCumpridos(this.registro), this.hoje);
  }

  palavrasHoje(mundo?: string): number {
    const dia = this.registro.dias[this.hoje] ?? {};
    return Object.entries(dia).reduce((a, [m, c]) => a + (!mundo || m === mundo ? c.palavras ?? 0 : 0), 0);
  }

  estado(w: World): EstadoMundo {
    const r = this.registro;
    return estadoDoMundo(w, atividadeDoMundo(r, w.name, pontosDoMundo(r, w.name)));
  }

  get totalConquistas(): number { return Object.keys(this.registro.conquistas).length; }

  /** Medição atual do autor (para mostrar o progresso das conquistas). */
  metricas(): Metricas {
    return medirAutor(cadernos.worlds, (p) => cadernos.read(p), this.registro, this.hoje);
  }

  missoes(mundo: string): { lista: Missao[]; feitas: string[] } {
    const m = this.registro.missoes[this.hoje]?.[mundo];
    return { lista: m?.lista ?? [], feitas: m?.feitas ?? [] };
  }

  /** Sorteia as missões de hoje, se ainda não houver. */
  garantirMissoes(w: World): void {
    if (this.registro.missoes[this.hoje]?.[w.name]) return;
    engine.jornada.definirMissoes(this.hoje, w.name, gerarMissoes(w, this.hoje, this.meta), Date.now());
    this.gravar();
  }

  // ------------------------------------------------ tesouro

  /** Todos os baús ganhos: os fechados primeiro. */
  baus(): Bau[] {
    const niveis = cadernos.worlds.map((w) => ({ mundo: w.name, nivel: this.estado(w).nivel.nivel }));
    return bausDoAutor(this.registro, niveis, this.hoje);
  }

  colecao(): Map<string, { em: number; vezes: number }> { return colecaoDe(this.registro); }

  /** Abre o baú. A carta sai do nome do baú: vale igual em qualquer aparelho. */
  abrirBau(b: Bau): Carta {
    const c = sortearCarta(b.id, new Set(this.colecao().keys()), b.sorte);
    if (engine.jornada.abrirBau(b.id, c.id, Date.now(), b.mundo)) {
      this.gravar();
      this.agendar();
    }
    return c;
  }

  vitrine(mundo: string): Vitrine { return this.registro.vitrine[mundo] ?? { em: 0 }; }

  definirVitrine(mundo: string, v: Omit<Vitrine, 'em'>): void {
    engine.jornada.definirVitrine(mundo, v, Date.now());
    this.gravar();
  }

  // ------------------------------------------------ arauto

  /** Sinais lidos de um mundo (id → quando). */
  lidos(mundo: string): Record<string, number> { return this.registro.lidos[mundo] ?? {}; }

  lerSinais(mundo: string, ids: string[]): void {
    const ja = this.lidos(mundo);
    const novos = ids.filter((id) => !ja[id]);
    if (!novos.length) return;
    engine.jornada.lerSinais(mundo, novos, Date.now());
    this.gravar();
  }

  sinais(w: World): Sinal[] {
    return sinaisDoMundo(w, (p) => cadernos.read(p));
  }

  // ------------------------------------------------ escrita

  /** Um editor abriu este texto: o que já está escrito nele não conta. */
  abrirTexto(path: string, corpo: string): void {
    this.contador.abrir(path, countWords(corpo));
  }

  editorAberto(aberto: boolean): void {
    this.editores = Math.max(0, this.editores + (aberto ? 1 : -1));
  }

  /** O texto mudou: credita só as palavras novas de verdade. */
  escreveu(mundo: string, path: string, corpo: string): void {
    this.ultimoDigitado = Date.now();
    this.ultimoTexto = path;
    if (this.sprint) {
      this.sprint.sumir = 0;
    }
    this.creditar(mundo, this.contador.registrar(path, countWords(corpo)));
  }

  /** Soma palavras ao dia (e ao sprint, se houver um correndo). */
  creditar(mundo: string, n: number): void {
    if (n <= 0) return;
    const dia = this.hoje;
    const antes = this.palavrasHoje();
    const jaMarcou = Object.values(engine.jornada.registro.dias[dia] ?? {});
    for (const marca of marcasDoMomento(new Date())) {
      if (!jaMarcou.some((c) => c[marca])) engine.jornada.somar(dia, mundo, marca);
    }
    engine.jornada.somar(dia, mundo, 'palavras', n);
    const depois = antes + n;
    if (depois >= this.meta) engine.jornada.marcarMeta(dia);
    if (Math.floor(depois / FAISCA_A_CADA) > Math.floor(antes / FAISCA_A_CADA)) this.faisca++;
    this.sessao += n;
    if (this.sprint) this.sprint.palavras += n;
    this.gravar();
    this.agendar();
  }

  /** Conta uma ação do dia (oráculo, respostas de entrevista...). */
  contar(mundo: string, chave: string, n = 1): void {
    engine.jornada.somar(this.hoje, mundo, chave, n);
    this.gravar();
    this.agendar();
  }

  definirMeta(meta: number): void {
    engine.jornada.definirMeta(meta, Date.now());
    this.gravar();
  }

  private gravar(): void {
    if (this.timerGravar) return;
    this.timerGravar = setTimeout(() => {
      this.timerGravar = null;
      void engine.jornada.sync();
    }, 4000);
  }

  // ------------------------------------------------ sprint

  iniciarSprint(mundo: string, o: OpcoesSprint): void {
    const inicio = Date.now();
    this.resultado = null;
    this.querSprint = false;
    this.quaseSumiu = false;
    this.ultimoDigitado = inicio;
    this.sprint = { ...o, mundo, inicio, fim: inicio + o.minutos * 60_000, palavras: 0, restante: o.minutos * 60, sumir: 0 };
    sound.play('open');
    this.relogio ??= setInterval(() => this.tique(), 250);
  }

  private tique(): void {
    const s = this.sprint;
    if (!s) return;
    const agora = Date.now();
    s.restante = Math.max(0, Math.ceil((s.fim - agora) / 1000));
    if (s.duro) {
      const parado = agora - this.ultimoDigitado;
      s.sumir = parado <= GRACA_MS ? 0 : Math.min(1, (parado - GRACA_MS) / SUMIR_MS);
      if (s.sumir > 0.7) this.quaseSumiu = true;
      if (s.sumir >= 1) return this.terminarSprint(false);
    }
    if (agora >= s.fim) this.terminarSprint(true);
  }

  /** Desiste sem registrar nada. */
  cancelarSprint(): void {
    this.pararRelogio();
    this.sprint = null;
  }

  private pararRelogio(): void {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
  }

  private terminarSprint(ok: boolean): void {
    const s = this.sprint;
    if (!s) return;
    this.pararRelogio();
    this.sprint = null;
    const ppm = Math.round(s.palavras / s.minutos);
    let recorde = false;
    if (ok) {
      this.contar(s.mundo, 'sprints');
      if (s.duro) this.contar(s.mundo, 'duros');
      if (s.duro && this.quaseSumiu) this.contar(s.mundo, 'triz');
      if (s.meta > 0 && s.palavras >= s.meta * 2) this.contar(s.mundo, 'dobro');
      const a = engine.jornada.recorde('ppm', ppm);
      const b = engine.jornada.recorde('sprint', s.palavras);
      recorde = (a || b) && s.palavras > 0;
      if (recorde) this.contar(s.mundo, 'recordes');
      sound.play('complete');
    } else {
      this.contar(s.mundo, 'desapareceu');
      sound.play('error');
    }
    this.resultado = { ok, duro: s.duro, palavras: s.palavras, meta: s.meta, ppm, recorde };
  }

  // ------------------------------------------------ avaliação e avisos

  private agendar(): void {
    if (this.timerAvaliar) clearTimeout(this.timerAvaliar);
    this.timerAvaliar = setTimeout(() => {
      this.timerAvaliar = null;
      // enquanto digita não mede nada: o editor fica sempre leve
      if (Date.now() - this.ultimoDigitado < 2000) return this.agendar();
      this.avaliar();
    }, 1200);
  }

  private avaliar(): void {
    const worlds = cadernos.worlds;
    if (!worlds.length) return;
    const dia = this.hoje;

    // missões cumpridas, por qualquer caminho
    for (const w of worlds) {
      const hojeM = engine.jornada.registro.missoes[dia]?.[w.name];
      if (!hojeM) continue;
      const cont = engine.jornada.registro.dias[dia]?.[w.name] ?? {};
      for (const m of hojeM.lista) {
        if (hojeM.feitas.includes(m.id) || medirMissao(m, w, cont) < m.alvo) continue;
        engine.jornada.concluirMissao(dia, w.name, m.id);
        this.avisar({ tipo: 'missao', texto: m.texto, xp: m.xp, moeda: this.estado(w).genero.moeda });
      }
    }

    // conquistas
    const tem = new Set(Object.keys(engine.jornada.registro.conquistas));
    const novas = novasConquistas(medirAutor(worlds, (p) => cadernos.read(p), engine.jornada.registro, dia), tem);
    const ativo = worlds.find((w) => w.path === this.ultimoTexto || w.entities.some((e) => e.path === this.ultimoTexto)) ?? worlds[0]!;
    for (const c of novas) engine.jornada.conquistar(c.id, Date.now(), ativo.name);
    if (novas.length) {
      this.gravar();
      // conquistas dão experiência, e o nível novo pode abrir outras conquistas
      this.agendar();
      // na primeira leitura de um mundo já cheio, um aviso só basta
      if (this.primeira && novas.length > 3) this.avisar({ tipo: 'lote', n: novas.length });
      else {
        const ordem = ['lendaria', 'epica', 'rara', 'incomum', 'comum'];
        const [top, ...resto] = [...novas].sort((a, b) => ordem.indexOf(a.raridade) - ordem.indexOf(b.raridade));
        if (top) this.avisar({ tipo: 'conquista', conquista: top, mais: resto.length });
      }
    }

    // subiu de nível ou de era
    for (const w of worlds) {
      const e = this.estado(w);
      const antes = this.niveis.get(w.name);
      this.niveis.set(w.name, { nivel: e.nivel.nivel, era: e.indiceEra });
      if (!antes) continue;
      if (e.indiceEra > antes.era) this.avisar({ tipo: 'era', mundo: w.name, era: e.era.nome, desc: e.era.desc, glifo: e.genero.glifo });
      else if (e.nivel.nivel > antes.nivel) this.avisar({ tipo: 'nivel', mundo: w.name, nivel: e.nivel.nivel, moeda: e.genero.moeda });
    }

    // baús novos (missões completas, sequência, níveis)
    const fechados = this.baus().filter((b) => !b.aberto);
    if (this.fechadosAntes !== null && fechados.length > this.fechadosAntes) this.avisar({ tipo: 'bau', titulo: fechados[0]!.titulo, n: fechados.length });
    this.fechadosAntes = fechados.length;

    // o arauto: um sinal forte e ainda não lido do mundo em que se escreve
    if (!this.primeira) {
      const lidos = this.lidos(ativo.name);
      const forte = this.sinais(ativo).find((s) => s.peso >= 4 && !lidos[s.id] && !this.anunciados.has(`${ativo.name}:${s.id}`));
      if (forte) {
        this.anunciados.add(`${ativo.name}:${forte.id}`);
        this.avisar({ tipo: 'sinal', mundo: ativo.name, sinal: forte });
      }
    } else for (const w of worlds) for (const s of this.sinais(w)) this.anunciados.add(`${w.name}:${s.id}`);
    this.primeira = false;
  }

  private avisar(a: AvisoNovo): void {
    this.espera.push({ ...a, id: this.proximoId++ });
  }

  /** Enquanto há escrita acontecendo, nada interrompe: os avisos esperam a pausa. */
  private soltarAvisos(): void {
    if (!this.espera.length || this.avisos.length >= 3) return;
    const escrevendo = this.sprint !== null || (this.editores > 0 && Date.now() - this.ultimoDigitado < FIM_DA_SESSAO_MS);
    if (escrevendo) return;
    const a = this.espera.shift()!;
    this.avisos = [...this.avisos, a];
    sound.play(a.tipo === 'sinal' ? 'tick' : 'complete');
    setTimeout(() => this.dispensar(a.id), a.tipo === 'era' || a.tipo === 'sinal' ? 9000 : 6500);
  }

  dispensar(id: number): void {
    this.avisos = this.avisos.filter((a) => a.id !== id);
  }
}

export const jornada = new Jornada();
export const totalDeConquistas = CONQUISTAS.length;
