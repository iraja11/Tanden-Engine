// Menu flutuante simples (alça do bloco, barra de seleção): teclado e clique fora fecham.

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: string;
  /** item marcado (tipo atual do bloco) */
  on?: boolean;
  danger?: boolean;
  run?: () => void;
  /** submenu */
  items?: MenuItem[];
}

let open: { el: HTMLElement; close: () => void } | null = null;

export function closeMenu(): void {
  open?.close();
}

/** Abre o menu na posição (coordenadas da janela). */
export function showMenu(at: { x: number; y: number }, items: Array<MenuItem | null>, opts: { onClose?: () => void; title?: string } = {}): HTMLElement {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'tdn-menu';
  el.setAttribute('role', 'menu');
  if (opts.title) {
    const t = document.createElement('div');
    t.className = 'tdn-menu-title';
    t.textContent = opts.title;
    el.append(t);
  }
  const buttons: HTMLButtonElement[] = [];
  let sub: HTMLElement | null = null;
  for (const it of items) {
    if (!it) {
      el.append(document.createElement('hr'));
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (it.on) b.classList.add('on');
    if (it.danger) b.classList.add('danger');
    b.innerHTML = `<span class="ic"></span><span class="lb"></span><span class="ht"></span>`;
    b.querySelector('.ic')!.textContent = it.icon ?? '';
    b.querySelector('.lb')!.textContent = it.label;
    b.querySelector('.ht')!.textContent = it.items ? '›' : it.hint ?? '';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    const openSub = () => {
      sub?.remove();
      if (!it.items) return;
      const r = b.getBoundingClientRect();
      sub = document.createElement('div');
      sub.className = 'tdn-menu sub';
      for (const s of it.items) {
        const sb = document.createElement('button');
        sb.type = 'button';
        if (s.on) sb.classList.add('on');
        sb.innerHTML = `<span class="ic"></span><span class="lb"></span><span class="ht"></span>`;
        sb.querySelector('.ic')!.textContent = s.icon ?? '';
        sb.querySelector('.lb')!.textContent = s.label;
        sb.querySelector('.ht')!.textContent = s.hint ?? '';
        sb.addEventListener('mousedown', (e) => e.preventDefault());
        sb.addEventListener('click', () => {
          close();
          s.run?.();
        });
        sub.append(sb);
      }
      document.body.append(sub);
      place(sub, { x: r.right - 4, y: r.top - 6 }, r.left);
    };
    b.addEventListener('mouseenter', openSub);
    b.addEventListener('click', () => {
      if (it.items) return openSub();
      close();
      it.run?.();
    });
    buttons.push(b);
    el.append(b);
  }
  document.body.append(el);
  place(el, at);
  let idx = -1;
  const focus = (i: number) => {
    idx = (i + buttons.length) % buttons.length;
    buttons[idx]!.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(idx - 1);
    }
  };
  const onDown = (e: Event) => {
    const t = e.target as Node;
    if (!el.contains(t) && !sub?.contains(t)) close();
  };
  function close() {
    el.remove();
    sub?.remove();
    removeEventListener('keydown', onKey, true);
    removeEventListener('pointerdown', onDown, true);
    if (open?.el === el) open = null;
    opts.onClose?.();
  }
  addEventListener('keydown', onKey, true);
  setTimeout(() => addEventListener('pointerdown', onDown, true));
  open = { el, close };
  return el;
}

/** Põe o menu na tela, virando para o outro lado se não couber. */
function place(el: HTMLElement, at: { x: number; y: number }, flipX?: number): void {
  el.style.left = '0px';
  el.style.top = '0px';
  const r = el.getBoundingClientRect();
  let x = at.x;
  let y = at.y;
  if (x + r.width > innerWidth - 8) x = flipX !== undefined ? flipX - r.width + 4 : innerWidth - r.width - 8;
  if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}
