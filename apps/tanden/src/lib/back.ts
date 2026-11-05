/*
 * Voltar do celular (botão ou gesto do Android) e do navegador: fecha a camada
 * de cima (gaveta, painel, diálogo, leitor) em vez de sair do app.
 *
 * Cada camada aberta ganha uma entrada no histórico. O "voltar" consome essa
 * entrada e fecha a camada; quando a camada fecha por outro caminho (×, Esc,
 * clique fora), a entrada é devolvida em silêncio.
 *
 * Uso num componente que só existe enquanto está aberto:
 *   onMount(() => back.layer(() => onclose()));
 * Uso com um estado que abre e fecha:
 *   $effect(() => { if (aberto) return back.layer(() => (aberto = false)); });
 */

interface Layer {
  id: number;
  close: () => void;
}

class Back {
  private layers: Layer[] = [];
  private seq = 0;
  /** voltas de histórico pedidas por nós mesmos, que não fecham nada */
  private skip = 0;
  private bound = false;

  /** quantas camadas estão abertas (para depuração) */
  get depth(): number {
    return this.layers.length;
  }

  private bind(): void {
    if (this.bound || typeof window === 'undefined') return;
    this.bound = true;
    addEventListener('popstate', () => {
      if (this.skip > 0) {
        this.skip--;
        return;
      }
      this.layers.pop()?.close();
    });
  }

  /** Registra uma camada aberta. Devolve a função que a solta (chame ao fechar). */
  layer(close: () => void): () => void {
    this.bind();
    const id = ++this.seq;
    try {
      history.pushState({ tanden: id }, '');
    } catch {
      // sem histórico (iframe isolado): o voltar só não fecha nada
      return () => {};
    }
    this.layers.push({ id, close });
    return () => {
      const i = this.layers.findIndex((l) => l.id === id);
      if (i < 0) return; // já fechou pelo voltar
      this.layers.splice(i, 1);
      this.skip++;
      history.back();
    };
  }
}

export const back = new Back();
