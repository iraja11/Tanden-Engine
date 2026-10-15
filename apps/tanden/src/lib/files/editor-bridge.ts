// Ponte entre o editor de notas aberto e quem quer escrever nele (anexos,
// páginas web). O editor se registra ao montar e sai ao desmontar; com dois
// editores abertos (a nota e o painel lateral de um banco), vale o mais novo,
// e o anterior volta a valer quando o mais novo fecha.

interface EditorApi {
  /** insere no cursor, em linha própria; devolve false se não deu. caret: onde o cursor fica, contado dentro de text */
  insert(text: string, caret?: number): boolean;
  /** leva o cursor para o começo da linha (a partir de 0) e mostra ela */
  goto?(line: number): void;
  /** devolve o foco ao texto (atEnd: cursor no fim) */
  focus?(atEnd?: boolean): void;
  /** linha (a partir de 0) onde o cursor está */
  line?(): number;
}

const stack: EditorApi[] = [];
const current = (): EditorApi | null => stack[stack.length - 1] ?? null;

export const editorBridge = {
  attach(api: EditorApi): () => void {
    stack.push(api);
    return () => {
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
    };
  },
  insert(text: string, caret?: number): boolean {
    return current()?.insert(text, caret) ?? false;
  },
  goto(line: number): void {
    current()?.goto?.(line);
  },
  focus(atEnd?: boolean): void {
    current()?.focus?.(atEnd);
  },
  line(): number {
    return current()?.line?.() ?? -1;
  },
};
