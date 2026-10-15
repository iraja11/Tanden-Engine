/** Foca o elemento ao aparecer (sem o atributo autofocus, que o leitor de tela estranha). */
export function focus(node: HTMLElement) {
  queueMicrotask(() => node.focus());
}
