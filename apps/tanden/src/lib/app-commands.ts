import { commands, type Command } from './commands.svelte';
import { engine } from './engine.svelte';
import { files } from './files/files.svelte';
import { notes } from './editor/notes.svelte';
import { noteName } from './editor/host';
import { quadros } from './quadro/quadros.svelte';
import { snippets } from './snippets.svelte';
import { sound } from './sound.svelte';
import { theme } from './theme.svelte';

/*
 * Os comandos do app inteiro: a paleta (Ctrl+P) lista todos, e qualquer um
 * pode ganhar um atalho em Aparência → Atalhos.
 */

export interface AppActions {
  go: (view: string) => void;
  newNote: () => void;
  sync: () => void;
  settings: (tab?: 'aparencia' | 'atalhos' | 'snippets') => void;
  focusMode: () => void;
}

const MODULES: [string, string][] = [
  ['notas', 'Notas'], ['bancos', 'Bancos'], ['grafo', 'Grafo'], ['ia', 'IA'], ['lembretes', 'Lembretes'], ['quadros', 'Quadros'],
  ['planilhas', 'Planilhas'], ['calculo', 'Cálculo'], ['slides', 'Slides'], ['mundos', 'Mundos'], ['luta', 'Luta'], ['arquivos', 'Arquivos'], ['plugins', 'Plugins'],
];

const roll = (sides: number) => 1 + Math.floor(Math.random() * sides);

export function registerAppCommands(a: AppActions): () => void {
  const cur = () => engine.active;
  const list: Command[] = [
    // paleta e navegação
    { id: 'paleta.comandos', label: 'Paleta de comandos', hotkeys: ['Ctrl+P'], run: () => notes.openPalette('comandos') },
    { id: 'paleta.abrir', label: 'Abrir nota rápida', keys: 'buscar procurar quick switcher', hotkeys: ['Ctrl+O', 'Ctrl+K'], run: () => notes.openPalette('tudo') },
    { id: 'paleta.busca', label: 'Buscar no texto de todas as notas', keys: 'procurar pesquisa', hotkeys: ['Ctrl+Shift+F'], run: () => notes.openPalette('busca') },
    ...MODULES.map(([id, name]): Command => ({ id: `ir.${id}`, label: `Ir para ${name}`, keys: 'abrir tela modulo', run: () => a.go(id) })),

    // notas
    { id: 'nota.nova', label: 'Nova nota', hotkeys: ['Ctrl+N'], run: () => { a.newNote(); a.go('notas'); } },
    { id: 'nota.hoje', label: 'Nota de hoje (diário)', keys: 'diario daily hoje', run: () => { notes.daily(0); a.go('notas'); } },
    { id: 'nota.ontem', label: 'Nota de ontem', keys: 'diario', run: () => { notes.daily(-1); a.go('notas'); } },
    { id: 'nota.amanha', label: 'Nota de amanhã', keys: 'diario', run: () => { notes.daily(1); a.go('notas'); } },
    {
      id: 'nota.aleatoria', label: 'Nota aleatória', keys: 'sorte random surpresa', run: () => {
        const pool = engine.notes.filter((p) => p !== cur());
        const p = pool[Math.floor(Math.random() * pool.length)];
        if (!p) return;
        sound.play('tick');
        engine.open(p);
        a.go('notas');
      },
    },
    { id: 'nota.renomear', label: 'Renomear nota', when: cur, run: () => { a.go('notas'); setTimeout(() => (document.querySelector('.page .title') as HTMLTextAreaElement | null)?.select(), 60); } },
    { id: 'nota.duplicar', label: 'Duplicar nota', when: cur, run: () => notes.duplicate(cur()!) },
    { id: 'nota.favoritar', label: 'Favoritar / desfavoritar', when: cur, run: () => notes.toggleFavorite(cur()!) },
    { id: 'nota.apagar', label: 'Apagar nota', keys: 'excluir deletar lixeira', when: cur, run: () => { if (confirm(`Apagar "${noteName(cur()!)}"? Uma cópia fica na lixeira (.trash).`)) void notes.remove(cur()!); } },
    { id: 'nota.historico', label: 'Histórico de versões', keys: 'versao restaurar desfazer', when: cur, run: () => (notes.history = cur()) },
    { id: 'nota.sumario', label: 'Mostrar sumário', keys: 'indice titulos outline', run: () => notes.setAside('sumario') },
    { id: 'nota.conexoes', label: 'Mostrar conexões e backlinks', keys: 'links grafo', run: () => notes.setAside('conexoes') },
    { id: 'nota.markdown', label: 'Alternar prévia ao vivo / Markdown', keys: 'codigo fonte source modo leitura', hotkeys: ['Ctrl+Shift+E'], run: () => notes.setPreview(!notes.preview) },
    { id: 'nota.pdf', label: 'Exportar como PDF', when: cur, run: () => void files.exportNote(cur()!, 'pdf') },
    { id: 'nota.docx', label: 'Exportar como Word (.docx)', when: cur, run: () => void files.exportNote(cur()!, 'docx') },
    { id: 'nota.html', label: 'Exportar como página (.html)', when: cur, run: () => void files.exportNote(cur()!, 'html') },
    { id: 'nota.md', label: 'Exportar como Markdown (.md)', when: cur, run: () => void files.exportNote(cur()!, 'md') },
    { id: 'nota.link', label: 'Copiar link [[ ]] da nota', when: cur, run: () => void navigator.clipboard?.writeText(`[[${noteName(cur()!)}]]`) },
    { id: 'nota.anexar', label: 'Anexar arquivo', when: cur, run: () => notes.host.pickFiles?.() },
    { id: 'nota.web', label: 'Salvar página web', keys: 'clipper recorte', when: cur, run: () => (notes.clip = true) },

    // grafo e quadros
    {
      id: 'grafo.local', label: 'Grafo local da nota aberta', keys: 'conexoes vizinhos', when: cur, run: () => {
        try {
          const s = JSON.parse(localStorage.getItem('tanden.grafo') ?? '{}');
          localStorage.setItem('tanden.grafo', JSON.stringify({ ...s, mode: 'local' }));
        } catch {
          /* abre no modo que estiver */
        }
        a.go('grafo');
      },
    },
    { id: 'quadro.mapa-da-nota', label: 'Mapa mental da nota aberta', keys: 'canvas mindmap titulos topicos', when: cur, run: () => { quadros.fromNote(cur()!); sound.play('create'); } },
    { id: 'quadro.novo-mapa', label: 'Novo mapa mental', keys: 'canvas quadro', run: () => { quadros.create('Mapa mental', 'mapa', (e) => e.setNode({ id: 'raiz', type: 'text', text: 'Ideia central', x: -90, y: -30, width: 160, height: 50 })); sound.play('create'); } },
    { id: 'quadro.novo-fluxo', label: 'Novo workflow', keys: 'canvas quadro fluxograma', run: () => { quadros.create('Workflow', 'fluxo'); sound.play('create'); } },
    { id: 'quadro.novo-desenho', label: 'Novo desenho', keys: 'canvas quadro caneta', run: () => { quadros.create('Desenho', 'livre'); sound.play('create'); } },

    // aparência e janela
    { id: 'app.sync', label: 'Sincronizar agora', keys: 'drive salvar', hotkeys: ['Ctrl+S'], run: a.sync },
    { id: 'app.aparencia', label: 'Aparência e sons', keys: 'tema configuracoes opcoes', hotkeys: ['Ctrl+,'], run: () => a.settings('aparencia') },
    { id: 'app.atalhos', label: 'Atalhos de teclado', keys: 'hotkeys teclas configurar', run: () => a.settings('atalhos') },
    { id: 'app.snippets', label: 'Snippets CSS', keys: 'estilo css personalizar', run: () => a.settings('snippets') },
    { id: 'app.snippets-recarregar', label: 'Recarregar snippets CSS', keys: 'estilo css', run: () => void snippets.reload() },
    { id: 'app.snippets-desligar', label: 'Desligar todos os snippets CSS', keys: 'estilo css quebrou', run: () => void snippets.allOff() },
    { id: 'app.foco', label: 'Modo foco (esconde as barras)', keys: 'zen tela cheia distração', hotkeys: ['Ctrl+Shift+Enter'], run: a.focusMode },
    { id: 'app.zoom-mais', label: 'Aumentar a interface', keys: 'zoom maior texto', hotkeys: ['Ctrl+=', 'Ctrl+Shift+='], run: () => theme.zoomBy(0.05) },
    { id: 'app.zoom-menos', label: 'Diminuir a interface', keys: 'zoom menor texto', hotkeys: ['Ctrl+-'], run: () => theme.zoomBy(-0.05) },
    { id: 'app.zoom-normal', label: 'Interface em 100%', keys: 'zoom normal', hotkeys: ['Ctrl+0'], run: () => theme.zoomBy(0) },
    { id: 'tema.claro-escuro', label: 'Alternar tema claro / escuro', keys: 'dark light noite dia', run: () => theme.toggleDark() },
    { id: 'tema.proximo', label: 'Próximo tema', keys: 'cores trocar preset', run: () => theme.nextPreset() },
    { id: 'som.alternar', label: 'Ligar / desligar sons', keys: 'mudo silencio audio', run: () => { sound.set({ on: !sound.on }); files.say(sound.on ? 'Sons ligados.' : 'Sons desligados.'); } },

    // brinquedos
    { id: 'dado.d20', label: 'Rolar d20', keys: 'dado rpg sorte', run: () => { const n = roll(20); sound.play(n === 20 ? 'complete' : 'tick'); files.say(n === 20 ? '🎲 d20: 20. Crítico!' : n === 1 ? '🎲 d20: 1. Falha crítica.' : `🎲 d20: ${n}`); } },
    { id: 'dado.2d6', label: 'Rolar 2d6', keys: 'dado rpg', run: () => { const x = roll(6), y = roll(6); sound.play('tick'); files.say(`🎲 2d6: ${x} + ${y} = ${x + y}`); } },
    { id: 'dado.moeda', label: 'Cara ou coroa', keys: 'moeda sorte decidir', run: () => { sound.play('tick'); files.say(Math.random() < 0.5 ? '🪙 Cara' : '🪙 Coroa'); } },
  ];
  return commands.register(list);
}
