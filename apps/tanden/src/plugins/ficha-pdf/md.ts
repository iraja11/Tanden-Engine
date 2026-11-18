import { el, elementBlock, groupedBlock, type Block } from './layout';

/*
 * Markdown das seções da ficha em blocos que a paginação sabe partir.
 * Cobre o que aparece numa ficha: parágrafos (quebra de linha simples vira
 * quebra, como no Obsidian), listas, tabelas, citações/callouts, títulos,
 * **negrito**, *itálico*, `código`, ==marca==, [[links]] e [links](url).
 * Imagens embutidas ficam de fora (a janela do plugin não lê anexos).
 */

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(src: string): string {
  let s = esc(src);
  s = s.replace(/!\[\[[^\]]*\]\]/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => `<span class="lk">${a ?? t.split('/').pop()!.split('#')[0]}</span>`);
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '<span class="lk">$1</span>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/==(.+?)==/g, '<mark>$1</mark>').replace(/~~(.+?)~~/g, '<s>$1</s>');
  s = s.replace(/(^|\s)#([\p{L}\d_/-]+)/gu, '$1<span class="tag">#$2</span>');
  return s;
}

/** Linha de texto que pode ser partida entre palavras (um ** aberto fecha e reabre). */
export function textBlock(src: string, cls: string, tag: 'p' | 'div' = 'p'): Block {
  const make = (ws: string[], c: string): Block => ({
    mount(body) {
      const e = el(tag, c, inline(ws.join(' ')));
      body.append(e);
      return () => e.remove();
    },
    pieces: ws.length,
    slice(from, to = ws.length) {
      const odd = (t: string) => (t.match(/\*\*/g)?.length ?? 0) % 2 === 1;
      let t = ws.slice(from, to).join(' ');
      if (odd(ws.slice(0, from).join(' '))) t = `**${t}`;
      if (odd(t)) t += '**';
      return make(t.split(' '), from > 0 ? c.replace(/\bgap\b/, '').trim() : c);
    },
  });
  return make(src.split(/\s+/).filter(Boolean), cls);
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
}

let groups = 0;

export function mdBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let gap = false;
  let fence: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(```|~~~)/.test(line.trim())) {
      if (fence) {
        const code = fence.join('\n');
        out.push(elementBlock(() => el('pre', 'code', esc(code))));
        fence = null;
      } else fence = [];
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    if (!line.trim()) {
      gap = true;
      continue;
    }
    const g = gap && out.length ? ' gap' : '';
    gap = false;
    if (/^\s*!\[\[[^\]]*\]\]\s*$|^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) continue;
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(elementBlock(() => el('hr', 'rule')));
      continue;
    }
    const h = /^(#{3,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push(elementBlock(() => el('h4', `sub${out.length ? ' gap' : ''}`, inline(h[2]!))));
      continue;
    }
    // tabela
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      for (; i < lines.length && /^\s*\|/.test(lines[i]!); i++) rows.push(splitRow(lines[i]!));
      i--;
      const id = `t${++groups}`;
      const makeBox = () => {
        const table = el('table', `md-table${g}`);
        const thead = el('thead');
        const tr = el('tr');
        for (const c of head) tr.append(el('th', '', inline(c)));
        thead.append(tr);
        const tbody = el('tbody');
        table.append(thead, tbody);
        return { box: table, slot: tbody };
      };
      for (const r of rows) {
        out.push(groupedBlock(id, makeBox, () => {
          const tr = el('tr');
          head.forEach((_c, k) => tr.append(el('td', '', inline(r[k] ?? ''))));
          return tr;
        }));
      }
      continue;
    }
    // lista (com as linhas de continuação recuadas)
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]!);
      const depth = Math.min(3, Math.floor(li[1]!.replace(/\t/g, '  ').length / 2));
      let text = li[3]!.replace(/^\[( |x|X)\]\s+/, (_m, x: string) => (x === ' ' ? '☐ ' : '☑ '));
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]!) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1]!)) {
        text += `\n${lines[++i]!.trim()}`;
      }
      const prev = out.length ? (out[out.length - 1] as Block & { list?: string }).list : undefined;
      const id = prev && !g ? prev : `l${++groups}`;
      const num = ordered ? li[2]!.replace(/\D/g, '') : '';
      const block = groupedBlock(id, () => {
        const box = el(ordered ? 'ol' : 'ul', `md-list${g}`);
        return { box, slot: box };
      }, () => {
        // marcador escrito no texto (o ::marker não existe no DOM para o desenho do PDF)
        return el('li', `d${depth}`, `<span class="bul">${num ? `${num}.` : '•'}</span>${inline(text).replace(/\n/g, '<br>')}`);
      }) as Block & { list?: string };
      block.list = id;
      out.push(block);
      continue;
    }
    // citação / callout
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      const callout = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(q[1]!);
      const body = callout ? `**${callout[2] || callout[1]}**` : q[1]!;
      if (body.trim()) out.push(textBlock(body, `quote${g}`));
      continue;
    }
    out.push(textBlock(line.trim(), `ln${g}`));
  }
  return out;
}
