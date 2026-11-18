/*
 * Paginação da ficha. Os cartões (Ataques, Características, Inventário...)
 * correm de coluna em coluna como num jornal: enchem a coluna da direita da
 * página 1 e depois as duas colunas de cada página seguinte. Um cartão que
 * não cabe continua na próxima coluna com "(cont.)"; um parágrafo longo é
 * partido entre palavras; uma tabela repete o cabeçalho.
 *
 * As medidas usam scrollHeight/clientHeight (layout), que não mudam com a
 * escala da prévia.
 */

export interface Block {
  /** põe o bloco no corpo do cartão; devolve como desfazer */
  mount(body: HTMLElement): () => void;
  /** quantos pedaços dá para partir (palavras de um parágrafo); 0 = não parte */
  pieces?: number;
  slice?(from: number, to?: number): Block;
}

export interface Card {
  title: string;
  blocks: Block[];
  /** classe extra do cartão */
  cls?: string;
  /** não parte: se não couber inteiro, vai todo para a próxima coluna */
  whole?: boolean;
  /** cartão que estica até o fim da coluna (anotações) */
  fill?: boolean;
}

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** Bloco feito de um elemento pronto. */
export function elementBlock(make: () => HTMLElement): Block {
  return {
    mount(body) {
      const e = make();
      body.append(e);
      return () => e.remove();
    },
  };
}

/**
 * Bloco que vive dentro de um recipiente compartilhado (linhas de uma tabela,
 * itens de uma lista): reaproveita o último recipiente do cartão se for do
 * mesmo grupo, ou cria um novo (com o cabeçalho de novo, na continuação).
 */
export function groupedBlock(group: string, makeBox: () => { box: HTMLElement; slot: HTMLElement }, makeItem: () => HTMLElement): Block {
  return {
    mount(body) {
      const last = body.lastElementChild as HTMLElement | null;
      let box: HTMLElement;
      let slot: HTMLElement;
      let created = false;
      if (last && last.dataset['group'] === group) {
        box = last;
        slot = (box.querySelector('[data-slot]') as HTMLElement | null) ?? box;
      } else {
        ({ box, slot } = makeBox());
        box.dataset['group'] = group;
        if (slot !== box) slot.dataset['slot'] = '';
        body.append(box);
        created = true;
      }
      const item = makeItem();
      slot.append(item);
      return () => {
        item.remove();
        if (created) box.remove();
      };
    },
  };
}

const overflows = (col: HTMLElement) => col.scrollHeight > col.clientHeight + 0.5;

export interface Flow {
  /** próxima coluna livre (cria página nova quando precisa) */
  next(): HTMLElement;
}

function makeCard(card: Card, cont: boolean): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', `card${card.cls ? ` ${card.cls}` : ''}${cont ? ' cont' : ''}`);
  const h = el('h3', 'card-title');
  h.textContent = card.title;
  if (cont) h.append(el('span', 'cont-mark', ' (cont.)'));
  const body = el('div', 'card-body');
  root.append(h, body);
  return { root, body };
}

/** Distribui os cartões pelas colunas. Devolve a última coluna usada. */
export function flowCards(cards: Card[], flow: Flow, first: HTMLElement): HTMLElement {
  let col = first;
  for (const card of cards) {
    if (card.fill) {
      // só entra se sobrar espaço de verdade na coluna
      const { root } = makeCard(card, false);
      root.classList.add('fill');
      col.append(root);
      if (overflows(col) || root.clientHeight < 90) root.remove();
      continue;
    }
    let { root, body } = makeCard(card, false);
    col.append(root);
    if (overflows(col) && col.firstElementChild !== root) {
      root.remove();
      col = flow.next();
      col.append(root);
    }
    if (card.whole) {
      for (const b of card.blocks) b.mount(body);
      if (overflows(col) && col.firstElementChild !== root) {
        root.remove();
        col = flow.next();
        col.append(root);
      }
      continue;
    }
    const queue = [...card.blocks];
    let placed = 0;
    /** o que este pedaço do cartão já pôs na coluna (para desfazer uma órfã) */
    let here: Array<{ block: Block; undo: () => void }> = [];
    let isCont = false;
    while (queue.length) {
      const b = queue.shift()!;
      const undo = b.mount(body);
      if (!overflows(col)) {
        placed++;
        here.push({ block: b, undo });
        continue;
      }
      undo();
      // uma linha só no pé da coluna fica feia: leva o pedaço inteiro adiante
      if (placed === 1 && queue.length && col.firstElementChild !== root && !b.pieces) {
        here[0]!.undo();
        queue.unshift(here[0]!.block, b);
        root.remove();
        col = flow.next();
        ({ root, body } = makeCard(card, isCont));
        col.append(root);
        placed = 0;
        here = [];
        continue;
      }
      // parágrafo comprido: o que couber fica aqui, o resto continua
      if (b.pieces && b.slice && b.pieces > 6) {
        let lo = 0;
        let hi = b.pieces - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          const u = b.slice(0, mid).mount(body);
          const ok = !overflows(col);
          u();
          if (ok) lo = mid;
          else hi = mid - 1;
        }
        if (lo >= 4 && b.pieces - lo >= 3) {
          b.slice(0, lo).mount(body);
          queue.unshift(b.slice(lo));
          ({ root, body } = continueIn((col = flow.next()), card));
          placed = 0;
          here = [];
          isCont = true;
          continue;
        }
      }
      if (placed === 0 && col.firstElementChild === root) {
        // nem sozinho numa coluna vazia ele cabe: fica assim mesmo
        b.mount(body);
        placed++;
        continue;
      }
      if (placed === 0) {
        // nada do cartão ficou aqui: leva o cartão inteiro
        root.remove();
        col = flow.next();
        col.append(root);
        queue.unshift(b);
        continue;
      }
      ({ root, body } = continueIn((col = flow.next()), card));
      placed = 0;
      here = [];
      isCont = true;
      queue.unshift(b);
    }
  }
  return col;
}

function continueIn(col: HTMLElement, card: Card): { root: HTMLElement; body: HTMLElement } {
  const c = makeCard(card, true);
  col.append(c.root);
  return c;
}
