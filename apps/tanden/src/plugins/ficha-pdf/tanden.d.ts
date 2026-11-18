// O objeto que o SDK de plugins injeta na janela (veja docs/plugins.md).

interface TandenTema {
  vars: Record<string, string>;
  escuro: boolean;
  movimento: string;
  destaque: string;
}

interface TandenEvento {
  type: string;
  path?: string;
}

interface TandenApi {
  notas: {
    listar(pasta?: string): Promise<string[]>;
    ler(caminho: string): Promise<string | null>;
  };
  dados: {
    gravar(chave: string, valor: unknown): Promise<void>;
    ler(chave: string): Promise<unknown>;
    apagar(chave: string): Promise<void>;
  };
  app: {
    abrirNota(caminho: string): Promise<void>;
  };
  eventos: { ouvir(fn: (e: TandenEvento) => void): () => void };
  tema(): TandenTema | null;
  aoMudarTema(fn: (t: TandenTema) => void): () => void;
  aoMostrar(fn: (visivel: boolean) => void): () => void;
}

interface Window {
  tanden?: TandenApi;
}
