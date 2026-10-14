// Ponte entre o editor de notas aberto e quem quer escrever nele (anexos,
// páginas web). O editor se registra ao montar e sai ao desmontar.

interface EditorApi {
  /** insere no cursor, em linha própria; devolve false se não deu */
  insert(text: string): boolean;
  /** leva o cursor para o começo da linha (a partir de 0) e mostra ela */
  goto?(line: number): void;
}

let current: EditorApi | null = null;

export const editorBridge = {
  attach(api: EditorApi): () => void {
    current = api;
    return () => {
      if (current === api) current = null;
    };
  },
  insert(text: string): boolean {
    return current?.insert(text) ?? false;
  },
  goto(line: number): void {
    current?.goto?.(line);
  },
};
