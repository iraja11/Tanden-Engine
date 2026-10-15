import { asText, parseProps, type Props } from '../caderno/frontmatter';
import { linkTarget, noteDir, noteName, sameTitle } from '../caderno/markdown';
import { normalizeType } from '../caderno/mundo';
import { hasSheet, findPropKey } from './sheet';

/*
 * Campanhas de RPG, em cima dos mundos do world building.
 *
 *   Campanhas/A Mina Perdida/A Mina Perdida.md   tipo: campanha, mundo: "[[Aerth]]", sistema: 5e
 *   Campanhas/A Mina Perdida/Sessões/Sessão 3.md tipo: sessão, campanha: "[[A Mina Perdida]]", número: 3
 *   Campanhas/A Mina Perdida/Encontros/...       tipo: encontro
 *
 * Os personagens são as fichas do mundo da campanha (Mundos/Aerth/...) que
 * têm números de jogo, mais as que estiverem na pasta da campanha.
 */

export interface Session {
  path: string;
  name: string;
  number: number | null;
  date: string;
}

export interface SheetRef {
  path: string;
  name: string;
  type: string;
  /** personagem de jogador (tem `jogador`) */
  pc: boolean;
}

export interface Campaign {
  path: string;
  name: string;
  /** nome do mundo ("" se a campanha não tem mundo) */
  world: string;
  system: string;
  folder: string;
  sessions: Session[];
  encounters: Array<{ path: string; name: string; round: number }>;
  sheets: SheetRef[];
}

const unlink = (v: string): string => linkTarget(v.trim().replace(/^\[\[|\]\]$/g, ''));
const typeOf = (p: Props): string => normalizeType(asText(p['tipo'] ?? p['type']));
const isSession = (t: string) => sameTitle(t, 'sessão') || t === 'session';
const isEncounter = (t: string) => t === 'encontro' || t === 'encounter' || t === 'combate';
const PC = ['jogador', 'jogadora', 'player'];

function worldOf(path: string, props: Props): string {
  const w = unlink(asText(props['mundo'] ?? props['world']));
  if (w) return w;
  const parts = path.split('/');
  return parts.length >= 3 && sameTitle(parts[0]!, 'Mundos') ? parts[1]! : '';
}

export function campaignIndex(notes: Array<{ path: string; text: string }>): Campaign[] {
  const camps: Campaign[] = [];
  const rest: Array<{ path: string; props: Props; type: string }> = [];
  for (const { path, text } of notes) {
    if (!text.startsWith('---')) continue;
    const props = parseProps(text);
    const type = typeOf(props);
    if (type === 'campanha' || type === 'campaign') {
      camps.push({
        path,
        name: noteName(path),
        world: unlink(asText(props['mundo'] ?? props['world'])),
        system: asText(props['sistema'] ?? props['system']) || '5e',
        folder: noteDir(path),
        sessions: [],
        encounters: [],
        sheets: [],
      });
    } else rest.push({ path, props, type });
  }
  const owner = (path: string, props: Props): Campaign | undefined => {
    const c = unlink(asText(props['campanha'] ?? props['campaign']));
    if (c) return camps.find((x) => sameTitle(x.name, c) || sameTitle(x.path.replace(/\.md$/i, ''), c));
    // sem a propriedade: a campanha cuja pasta contém a nota (a mais funda)
    return camps.filter((x) => x.folder && path.startsWith(`${x.folder}/`)).sort((a, b) => b.folder.length - a.folder.length)[0];
  };
  for (const { path, props, type } of rest) {
    if (isSession(type)) {
      const c = owner(path, props);
      if (!c) continue;
      const n = /\d+/.exec(asText(props['número'] ?? props['numero'] ?? props['number'] ?? '')) ?? /(\d+)\s*$/.exec(noteName(path));
      c.sessions.push({ path, name: noteName(path), number: n ? Number(n[1] ?? n[0]) : null, date: asText(props['data'] ?? props['date']) });
    } else if (isEncounter(type)) {
      const c = owner(path, props);
      if (c) c.encounters.push({ path, name: noteName(path), round: Number(asText(props['rodada'])) || 0 });
    } else if (hasSheet(props)) {
      const world = worldOf(path, props);
      const ref: SheetRef = { path, name: noteName(path), type: type || 'personagem', pc: !!findPropKey(props, PC) };
      for (const c of camps) {
        const inFolder = c.folder && path.startsWith(`${c.folder}/`);
        const ownC = unlink(asText(props['campanha'] ?? props['campaign']));
        if (inFolder || (ownC && sameTitle(ownC, c.name)) || (c.world && world && sameTitle(world, c.world))) c.sheets.push(ref);
      }
    }
  }
  for (const c of camps) {
    c.sessions.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    c.encounters.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    c.sheets.sort((a, b) => Number(b.pc) - Number(a.pc) || a.name.localeCompare(b.name, 'pt-BR'));
  }
  return camps.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function campaignTemplate(name: string, world: string, system: string): string {
  return `---
tipo: campanha${world ? `\nmundo: "[[${world}]]"` : ''}
sistema: ${system || '5e'}
---
# ${name}

## Premissa

## Grupo

## Fios soltos
- [ ]
`;
}

export function sessionTemplate(n: number, campaign: string, date: string, previous?: { name: string; recap: string }): string {
  const recap = previous?.recap.trim();
  return `---
tipo: sessão
campanha: "[[${campaign}]]"
número: ${n}
data: ${date}
---
# Sessão ${n}

${previous ? `> [!quote] Na sessão anterior ([[${previous.name}]])\n${recap ? recap.split('\n').map((l) => `> ${l}`).join('\n') : '> '}\n\n` : ''}## Preparação
- [ ]

## Resumo

## Registro

`;
}
