import { ensureBlockId, instantiate } from '@tanden/core';
import { bases } from '../bases/bases.svelte';
import { engine } from '../engine.svelte';
import { editorBridge } from '../files/editor-bridge';
import { files } from '../files/files.svelte';
import { noteName } from './host';
import { showMenu } from './menu';
import { notes } from './notes.svelte';

/** Menu com os modelos (Modelos/ e os prontos); o escolhido entra no cursor. */
export function insertTemplate() {
  const cur = engine.active;
  const list = bases.templates;
  if (!list.length) return files.say('Nenhum modelo ainda. Crie notas na pasta Modelos/.');
  const at = { x: innerWidth / 2 - 130, y: innerHeight * 0.22 };
  showMenu(at, list.map((t) => ({
    label: t.name,
    icon: t.path ? '❐' : '▫',
    hint: t.target ? `banco ${t.target.replace(/^\[\[|\]\]$/g, '')}` : undefined,
    run: () => {
      const title = noteName(cur ?? '');
      // o topo do modelo vira propriedades da nota; o corpo entra no cursor
      const text = instantiate(t.text, title);
      const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
      const head = text.slice(0, text.length - body.length);
      if (head && cur) {
        const merged = bases.mergeProps(engine.vault.read(cur), head);
        if (merged !== engine.vault.read(cur)) engine.writeNote(cur, merged);
      }
      setTimeout(() => editorBridge.insert(body.replace(new RegExp(`^# ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`), '')), 30);
    },
  })), { title: 'Inserir modelo' });
}

/** Copia [[Nota#^id]] da linha do cursor (cria o ^id se faltar). */
export async function copyBlockLink() {
  const p = engine.active;
  if (!p) return;
  const line = editorBridge.line?.() ?? -1;
  if (line < 0) return;
  const text = engine.vault.read(p);
  const r = ensureBlockId(text, line);
  if (!r.id) return;
  if (r.text !== text) engine.writeNote(p, r.text);
  const link = `[[${noteName(p)}#^${r.id}]]`;
  await navigator.clipboard?.writeText(link).catch(() => undefined);
  files.say(`Copiado: ${link}`);
}

/** Troca as menções soltas desta nota por [[links]] em todo o cofre. */
export function linkAllMentions(p: string) {
  const u = notes.unlinked(p);
  for (const x of u) notes.linkMentions(x.path, p);
  files.say(u.length ? `Links criados em ${u.length} ${u.length === 1 ? 'nota' : 'notas'}.` : 'Nenhuma menção sem link.');
}
