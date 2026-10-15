import { newBlockId, scanNote } from '@tanden/core';
import { autocompletion, startCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSection } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { setBlockType, type BlockType } from './format';
import { emptyTable } from './tables';
import { fold, hostFacet, noteName, type EditorHost } from './host';

/*
 * Menus que aparecem enquanto se digita, como no Notion:
 *   /      blocos (títulos, listas, tabela, callout, imagem, fórmula...)
 *   [[     link para outra nota (ou criar uma nova)
 *   @      mencionar nota ou data (numa tarefa, a data vira lembrete)
 *   #      tags que já existem no cofre
 */

const S = (name: string, rank: number): CompletionSection => ({ name, rank });
const BASIC = S('Básico', 0);
const CALLOUTS = S('Destaques', 1);
const MEDIA = S('Mídia e links', 2);
const LAYOUT = S('Layout', 3);
const MATH = S('Matemática', 4);
const DATES = S('Datas e lembretes', 5);

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

/** Troca "/consulta" pelo texto; se a linha já tinha conteúdo, o bloco vai para a linha de baixo. */
function putBlock(view: EditorView, from: number, to: number, text: string, caret = text.length): void {
  const line = view.state.doc.lineAt(from);
  const rest = (line.text.slice(0, from - line.from) + line.text.slice(to - line.from)).trim();
  if (!rest) {
    const prev = line.number > 1 ? view.state.doc.line(line.number - 1).text : '';
    // depois de uma tabela, uma linha em branco evita que o bloco vire linha da tabela
    const lead = /^\s*\|/.test(prev) ? '\n' : '';
    view.dispatch({ changes: { from: line.from, to: line.to, insert: lead + text }, selection: { anchor: line.from + lead.length + caret }, userEvent: 'input.complete', scrollIntoView: true });
  } else {
    view.dispatch({ changes: { from, to }, userEvent: 'input.complete' });
    const l = view.state.doc.lineAt(from);
    const ins = `\n${text}`;
    view.dispatch({ changes: { from: l.to, insert: ins }, selection: { anchor: l.to + 1 + caret }, userEvent: 'input.complete', scrollIntoView: true });
  }
}

/** Apaga "/consulta" e muda o tipo da linha. */
function turnInto(view: EditorView, from: number, to: number, type: BlockType): void {
  view.dispatch({ changes: { from, to }, userEvent: 'input.complete' });
  setBlockType(view, type);
}

/** Insere no lugar, sem mudar de linha. */
function putInline(view: EditorView, from: number, to: number, text: string, caret = text.length): void {
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + caret }, userEvent: 'input.complete' });
}

interface Item {
  label: string;
  hint?: string;
  icon: string;
  keys?: string;
  section: CompletionSection;
  run(view: EditorView, from: number, to: number, host: EditorHost | null): void;
}

const callout = (type: string, label: string, icon: string): Item => ({
  label,
  icon,
  keys: `callout ${type} destaque caixa`,
  section: CALLOUTS,
  hint: `> [!${type}]`,
  run: (v, f, t) => putBlock(v, f, t, `> [!${type}] \n> `, `> [!${type}] `.length),
});

const columns = (n: number): Item => ({
  label: `${n} colunas`,
  icon: n === 2 ? '◫' : '▥',
  keys: 'colunas lado a lado layout grade',
  section: LAYOUT,
  run: (v, f, t) => {
    const cols = Array.from({ length: n }, (_, i) => `> > [!coluna]\n> > Coluna ${i + 1}`).join('\n');
    putBlock(v, f, t, `> [!colunas]\n${cols}`, `> [!colunas]\n> > [!coluna]\n> > `.length);
  },
});

const ITEMS: Item[] = [
  { label: 'Texto', icon: 'T', keys: 'paragrafo texto simples', section: BASIC, run: (v, f, t) => turnInto(v, f, t, 'p') },
  { label: 'Título 1', icon: 'H1', keys: 'titulo h1 heading cabecalho', section: BASIC, hint: '#', run: (v, f, t) => turnInto(v, f, t, 'h1') },
  { label: 'Título 2', icon: 'H2', keys: 'titulo h2 heading subtitulo', section: BASIC, hint: '##', run: (v, f, t) => turnInto(v, f, t, 'h2') },
  { label: 'Título 3', icon: 'H3', keys: 'titulo h3 heading', section: BASIC, hint: '###', run: (v, f, t) => turnInto(v, f, t, 'h3') },
  { label: 'Lista', icon: '•', keys: 'lista marcadores bullet', section: BASIC, hint: '-', run: (v, f, t) => turnInto(v, f, t, 'ul') },
  { label: 'Lista numerada', icon: '1.', keys: 'lista numerada ordenada', section: BASIC, hint: '1.', run: (v, f, t) => turnInto(v, f, t, 'ol') },
  { label: 'Tarefa', icon: '☑', keys: 'tarefa todo checkbox caixa de selecao lista de tarefas', section: BASIC, hint: '[ ]', run: (v, f, t) => turnInto(v, f, t, 'task') },
  { label: 'Toggle', icon: '▸', keys: 'toggle recolher expandir sanfona alternar', section: BASIC, hint: 'recolhível', run: (v, f, t) => putBlock(v, f, t, '> [!toggle]- \n> ', '> [!toggle]- '.length) },
  { label: 'Citação', icon: '❝', keys: 'citacao quote', section: BASIC, hint: '>', run: (v, f, t) => turnInto(v, f, t, 'quote') },
  { label: 'Divisor', icon: '—', keys: 'divisor linha separador hr', section: BASIC, hint: '---', run: (v, f, t) => putBlock(v, f, t, '---\n', 4) },
  { label: 'Tabela', icon: '▦', keys: 'tabela grade table', section: BASIC, run: (v, f, t) => putBlock(v, f, t, emptyTable(3, 2) + '\n', 2) },
  { label: 'Código', icon: '</>', keys: 'codigo code bloco programacao', section: BASIC, hint: '```', run: (v, f, t) => putBlock(v, f, t, '```\n\n```', 4) },
  { label: 'Link para nota', icon: '↗', keys: 'link nota pagina wikilink', section: MEDIA, hint: '[[', run: (v, f, t) => { putInline(v, f, t, '[[]]', 2); startCompletion(v); } },
  {
    label: 'Subpágina', icon: '▤', keys: 'pagina nova nota subpagina filha', section: MEDIA, hint: 'nova nota',
    run: (v, f, t, host) => {
      const cur = host?.current?.();
      const dir = cur && cur.includes('/') ? cur.slice(0, cur.lastIndexOf('/') + 1) : '';
      const base = cur ? noteName(cur) : 'Página';
      let name = `${base} - nova página`;
      let n = 1;
      while (host?.notes().includes(`${dir}${name}.md`)) name = `${base} - nova página ${++n}`;
      const path = host?.createNote?.(`${dir}${name}`, '') ?? null;
      putInline(v, f, t, `[[${path ? path.replace(/\.md$/, '') : name}|${name}]]`);
    },
  },
  { label: 'Imagem ou arquivo', icon: '🖼', keys: 'imagem foto arquivo anexo upload pdf', section: MEDIA, run: (v, f, t, host) => { putInline(v, f, t, ''); host?.pickFiles?.(); } },
  { label: 'Página web', icon: '🌐', keys: 'pagina web site link url bookmark favorito', section: MEDIA, run: (v, f, t, host) => { putInline(v, f, t, ''); host?.webClip?.(); } },
  { label: 'Vídeo', icon: '▶', keys: 'video youtube vimeo embed', section: MEDIA, hint: 'YouTube, Vimeo', run: (v, f, t) => putBlock(v, f, t, '![](https://www.youtube.com/watch?v=)', '![](https://www.youtube.com/watch?v='.length) },
  { label: 'Nota embutida', icon: '⧉', keys: 'embutir nota transclusao embed incorporar', section: MEDIA, hint: '![[nota]]', run: (v, f, t) => { putBlock(v, f, t, '![[]]', 3); startCompletion(v); } },
  callout('nota', 'Nota', 'ℹ'),
  callout('dica', 'Dica', '💡'),
  callout('importante', 'Importante', '★'),
  callout('aviso', 'Atenção', '⚠'),
  callout('perigo', 'Perigo', '⛔'),
  callout('pergunta', 'Pergunta', '?'),
  callout('exemplo', 'Exemplo', '≡'),
  callout('resumo', 'Resumo', '¶'),
  columns(2),
  columns(3),
  { label: 'Fórmula (bloco)', icon: '∑', keys: 'formula equacao latex matematica katex bloco', section: MATH, hint: '$$', run: (v, f, t) => putBlock(v, f, t, '$$\n\n$$', 3) },
  { label: 'Fórmula na linha', icon: '𝑥', keys: 'formula equacao latex inline matematica', section: MATH, hint: '$x$', run: (v, f, t) => putInline(v, f, t, '$$', 1) },
  { label: 'Cálculo', icon: '=', keys: 'calculo conta calculadora unidades numeros', section: MATH, hint: 'contas com unidades', run: (v, f, t) => putBlock(v, f, t, '```calc\n\n```', 8) },
  { label: 'Gráfico', icon: '📈', keys: 'grafico funcao plot curva', section: MATH, hint: 'funções e pontos', run: (v, f, t) => putBlock(v, f, t, '```grafico\ny = \nx: -10..10\n```', '```grafico\ny = '.length) },
  { label: 'Hoje', icon: '📅', keys: 'hoje data dia', section: DATES, hint: isoDate(new Date()), run: (v, f, t) => putInline(v, f, t, `[[${isoDate(new Date())}]]`) },
  {
    label: 'Lembrete', icon: '⏰', keys: 'lembrete alarme aviso tarefa com data notificacao', section: DATES, hint: 'tarefa com aviso',
    run: (v, f, t) => {
      const d = addDays(1);
      const at = ` (@${isoDate(d)} 09:00)`;
      putBlock(v, f, t, `- [ ] ${at}`, 6);
    },
  },
];

const iconOf = new WeakMap<Completion, string>();

function slashSource(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:^|[\s(])\/[\p{L}\p{N} ]{0,24}$/u);
  if (!m) return null;
  const slash = m.text.indexOf('/');
  const from = m.from + slash;
  const query = fold(m.text.slice(slash + 1)).trim();
  if (/\s{2}/.test(m.text)) return null;
  const host = ctx.state.facet(hostFacet);
  const words = query.split(/\s+/).filter(Boolean);
  const options: Completion[] = [];
  for (const it of ITEMS) {
    const hay = fold(`${it.label} ${it.keys ?? ''}`);
    if (words.length && !words.every((w) => hay.includes(w))) continue;
    const starts = words.length && fold(it.label).startsWith(words[0]!) ? 2 : 0;
    const c: Completion = {
      label: it.label,
      detail: it.hint,
      section: it.section,
      boost: starts,
      apply: (view, _c, f, t) => it.run(view, f, t, host),
    };
    iconOf.set(c, it.icon);
    options.push(c);
  }
  if (!options.length) return null;
  return { from, options, filter: false };
}

function noteOptions(host: EditorHost, query: string, wrap: (target: string, name: string) => string, extra?: (q: string) => Completion[]): Completion[] {
  const q = fold(query.trim());
  const scored: Array<{ p: string; s: number }> = [];
  for (const p of host.notes()) {
    const name = fold(noteName(p));
    const full = fold(p);
    let s = -1;
    if (!q) s = 1;
    else if (name.startsWith(q)) s = 4;
    else if (name.includes(q)) s = 3;
    else if (full.includes(q)) s = 2;
    else if (q.split(/\s+/).every((w) => full.includes(w))) s = 1;
    if (s >= 0) scored.push({ p, s });
  }
  scored.sort((a, b) => b.s - a.s || a.p.localeCompare(b.p, 'pt-BR'));
  const names = new Map<string, number>();
  for (const p of host.notes()) names.set(noteName(p).toLowerCase(), (names.get(noteName(p).toLowerCase()) ?? 0) + 1);
  const out: Completion[] = scored.slice(0, 40).map(({ p }) => {
    const name = noteName(p);
    // nome repetido em pastas diferentes: o link leva a pasta
    const target = (names.get(name.toLowerCase()) ?? 0) > 1 ? p.replace(/\.md$/, '') : name;
    const c: Completion = { label: name, detail: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '', apply: wrap(target, name), type: 'note' };
    iconOf.set(c, '▤');
    return c;
  });
  if (extra) out.push(...extra(query));
  return out;
}

function wikiSource(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/!?\[\[[^\][\n|]*$/);
  if (!m) return null;
  const host = ctx.state.facet(hostFacet);
  if (!host) return null;
  const open = m.text.indexOf('[[') + 2;
  const query = m.text.slice(open);
  const from = m.from + open;
  // ]] já fechado logo depois (o par automático): substitui junto
  const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
  const close = after === ']]' ? 2 : 0;
  const hash = query.indexOf('#');
  if (hash >= 0) {
    const note = query.slice(0, hash);
    const text = host.noteText?.(note || (host.current?.() ?? '')) ?? '';
    const sub = query.slice(hash + 1);
    const scan = scanNote(text);
    if (sub.startsWith('^')) {
      // [[nota#^  →  blocos (parágrafos, itens) daquela nota; cria o ^id ao escolher
      const q = fold(sub.slice(1));
      const lines = text.split('\n');
      const ids = new Map(scan.blocks.map((b) => [b.line, b.id]));
      const opts: Completion[] = [];
      let inCode = false;
      lines.forEach((l, n) => {
        if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
        if (inCode || n < scan.bodyLine || !l.trim() || /^\s*(---|\^[\w-]+\s*$)/.test(l) || opts.length >= 60) return;
        const shown = l.replace(/\s\^[\w-]+\s*$/, '').trim();
        if (q && !fold(shown).includes(q) && !(ids.get(n) ?? '').includes(q)) return;
        const id = ids.get(n);
        opts.push({
          label: shown.length > 80 ? `${shown.slice(0, 80)}…` : shown,
          detail: id ? `^${id}` : '',
          type: 'text',
          apply: (view, _c, f, t) => {
            const self = !note || host.resolve?.(note) === host.current?.();
            const insert = (got: string) => ({ from: f, to: t, insert: `^${got}]]` });
            if (id) return view.dispatch({ changes: insert(id), selection: { anchor: f + id.length + 3 } });
            if (self && n + 1 <= view.state.doc.lines) {
              // bloco desta mesma nota: o ^id entra na mesma transação
              const got = newBlockId(view.state.doc.toString());
              const line = view.state.doc.line(n + 1);
              const tail = { from: line.to, insert: ` ^${got}` };
              const changes = view.state.changes(line.to <= f ? [tail, insert(got)] : [insert(got), tail]);
              return view.dispatch({ changes, selection: { anchor: changes.mapPos(t, 1) } });
            }
            const got = host.ensureBlock?.(note, n);
            if (got) view.dispatch({ changes: insert(got), selection: { anchor: f + got.length + 3 } });
          },
        });
      });
      return { from: from + hash + 1, to: ctx.pos + close, filter: false, options: opts };
    }
    // [[nota#  →  títulos daquela nota (fora de código)
    const q = fold(sub);
    const heads = scan.headings.map((h) => h.text).filter((h) => fold(h).includes(q));
    return {
      from: from + hash + 1,
      to: ctx.pos + close,
      filter: false,
      options: heads.map((h) => ({ label: h, type: 'heading', apply: `${h}]]` })),
    };
  }
  const options = noteOptions(host, query, (target) => `${target}]]`, (q) => {
    const t = q.trim();
    const out: Completion[] = [];
    // apelidos: [[Nota|apelido]], que o Obsidian também entende
    if (t && host.aliases) {
      for (const a of host.aliases()) {
        if (!fold(a.alias).includes(fold(t)) || out.length >= 8) continue;
        const c: Completion = { label: a.alias, detail: `apelido de ${noteName(a.path)}`, type: 'note', boost: fold(a.alias).startsWith(fold(t)) ? 1 : 0, apply: `${noteName(a.path)}|${a.alias}]]` };
        iconOf.set(c, '≈');
        out.push(c);
      }
    }
    if (!t || host.notes().some((p) => fold(noteName(p)) === fold(t)) || host.resolve?.(t)) return out;
    const c: Completion = {
      label: `Criar "${t}"`,
      detail: 'nota nova',
      boost: -50,
      apply: (view, _c, f, to) => {
        host.createNote?.(t, '');
        view.dispatch({ changes: { from: f, to, insert: `${t}]]` }, selection: { anchor: f + t.length + 2 } });
      },
    };
    iconOf.set(c, '+');
    return [...out, c];
  });
  return { from, to: ctx.pos + close, options, filter: false };
}

function mentionSource(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:^|[\s(])@[\p{L}\p{N} ]{0,30}$/u);
  if (!m) return null;
  const host = ctx.state.facet(hostFacet);
  if (!host) return null;
  const at = m.text.indexOf('@');
  const from = m.from + at;
  const query = m.text.slice(at + 1);
  if (/\s{2}/.test(query)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos).text;
  const isTask = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX/-]\]/.test(line);
  const q = fold(query.trim());
  const week = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const dates: Array<[string, Date]> = [
    ['Hoje', addDays(0)],
    ['Amanhã', addDays(1)],
    ['Ontem', addDays(-1)],
    ...week.map((w, i): [string, Date] => {
      const d = new Date();
      d.setDate(d.getDate() + (((i - d.getDay() + 7) % 7) || 7));
      return [`Próxima ${w}`, d];
    }),
    ['Daqui a uma semana', addDays(7)],
  ];
  const options: Completion[] = [];
  for (const [label, d] of dates) {
    if (q && !fold(label).includes(q) && !fold(label).split(' ').some((w) => w.startsWith(q))) continue;
    const iso = isoDate(d);
    const show = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    const c: Completion = {
      label,
      detail: isTask ? `lembrete ${show}, 09:00` : show,
      section: DATES,
      apply: isTask ? `(@${iso} 09:00)` : `[[${iso}]]`,
    };
    iconOf.set(c, isTask ? '⏰' : '📅');
    options.push(c);
  }
  // "@15/10" ou "@15/10/2026 14:30"
  const typed = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/.exec(query.trim());
  if (typed) {
    const y = typed[3] ? (typed[3].length === 2 ? 2000 + Number(typed[3]) : Number(typed[3])) : new Date().getFullYear();
    const d = new Date(y, Number(typed[2]) - 1, Number(typed[1]));
    if (!Number.isNaN(d.getTime())) {
      const hh = typed[4] ? `${pad(Number(typed[4]))}:${typed[5] ?? '00'}` : '09:00';
      const c: Completion = { label: query.trim(), detail: d.toLocaleDateString('pt-BR', { dateStyle: 'full' }), section: DATES, boost: 10, apply: isTask ? `(@${isoDate(d)} ${hh})` : `[[${isoDate(d)}]]` };
      iconOf.set(c, '📅');
      options.unshift(c);
    }
  }
  const notes = noteOptions(host, query, (target, name) => (target === name ? `[[${name}]]` : `[[${target}|${name}]]`)).slice(0, 12);
  for (const n of notes) n.section = S('Notas', 6);
  options.push(...notes);
  if (!options.length) return null;
  return { from, options, filter: false };
}

function tagSource(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:[\s(])#[\p{L}\p{N}_/-]+$/u);
  if (!m) return null;
  const host = ctx.state.facet(hostFacet);
  const tags = host?.tags?.() ?? [];
  const hash = m.text.indexOf('#');
  const q = fold(m.text.slice(hash + 1));
  const options = tags
    .filter((t) => fold(t).startsWith(q) && fold(t) !== q)
    .slice(0, 30)
    .map((t): Completion => {
      const c: Completion = { label: `#${t}`, apply: `#${t}` };
      iconOf.set(c, '#');
      return c;
    });
  if (!options.length) return null;
  return { from: m.from + hash, options, filter: false };
}

/** Digitar [[ fecha com ]] e abre a lista de notas. */
const autoCloseLink = EditorView.inputHandler.of((view, from, to, text) => {
  // digitar ] por cima do ]] que já fechou o link só anda o cursor
  if (text === ']' && from === to && view.state.sliceDoc(from, from + 1) === ']') {
    const line = view.state.doc.lineAt(from);
    const before = line.text.slice(0, from - line.from);
    const open = before.lastIndexOf('[[');
    if (open >= 0 && (before.slice(open).includes(']') ? /^\[\[[^\]]*\]$/.test(before.slice(open)) : true)) {
      view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'select' });
      return true;
    }
  }
  if (text !== '[' || view.state.sliceDoc(from - 1, from) !== '[') return false;
  if (view.state.sliceDoc(to, to + 1) === ']') {
    // o primeiro [ já tinha ganhado par: [|] → [[|]]
    view.dispatch({ changes: { from, to: to + 1, insert: '[]]' }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
  } else view.dispatch({ changes: { from, to, insert: '[]]' }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
  startCompletion(view);
  return true;
});

export const slashMenu: Extension = [
  autocompletion({
    override: [slashSource, wikiSource, mentionSource, tagSource],
    icons: false,
    closeOnBlur: true,
    maxRenderedOptions: 80,
    optionClass: (c) => (c.type === 'note' ? 'cm-opt-note' : ''),
    addToOptions: [
      {
        position: 20,
        render: (c) => {
          const s = document.createElement('span');
          s.className = 'cm-opt-icon';
          s.textContent = iconOf.get(c) ?? (c.type === 'heading' ? '#' : '•');
          return s;
        },
      },
    ],
  }),
  autoCloseLink,
];
