/*
 * Ação Svelte para menus e balões que abrem presos a um botão: se o elemento
 * passar da tela (comum no celular, com o botão perto da borda), ele é
 * empurrado para dentro e, se for mais alto que a parte visível (teclado
 * aberto), ganha rolagem. Uso: <div class="menu" use:fit>.
 */

const GAP = 8;

export function fit(node: HTMLElement) {
  let raf = 0;
  const run = () => {
    const vv = globalThis.visualViewport;
    const left = vv?.offsetLeft ?? 0;
    const top = vv?.offsetTop ?? 0;
    const w = vv?.width ?? innerWidth;
    const h = vv?.height ?? innerHeight;
    node.style.translate = '';
    node.style.maxWidth = '';
    let r = node.getBoundingClientRect();
    if (r.width > w - GAP * 2) {
      node.style.maxWidth = `${w - GAP * 2}px`;
      r = node.getBoundingClientRect();
    }
    let dx = 0;
    if (r.right > left + w - GAP) dx = left + w - GAP - r.right;
    if (r.left + dx < left + GAP) dx = left + GAP - r.left;
    if (r.bottom > top + h - GAP) {
      node.style.maxHeight = `${Math.max(120, top + h - GAP - r.top)}px`;
      node.style.overflowY = 'auto';
    }
    if (dx) node.style.translate = `${Math.round(dx)}px 0`;
  };
  const later = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  };
  run();
  addEventListener('resize', later);
  globalThis.visualViewport?.addEventListener('resize', later);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', later);
      globalThis.visualViewport?.removeEventListener('resize', later);
    },
  };
}
