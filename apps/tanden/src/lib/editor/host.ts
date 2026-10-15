import { Facet } from '@codemirror/state';
import type { EmbedHost } from '../embeds';

/** O que o editor pede ao resto do app (cofre, arquivos, outras telas). */
export interface EditorHost extends EmbedHost {
  /** caminhos das notas do cofre */
  notes(): readonly string[];
  /** tags usadas no cofre, sem o # */
  tags?(): string[];
  /** escolhe arquivos no aparelho e anexa no cursor */
  pickFiles?(accept?: string): void;
  /** abre o diálogo de página web */
  webClip?(): void;
  /** cria uma nota nova (devolve o caminho) sem sair da atual */
  createNote?(title: string, text?: string): string | null;
  /** texto de outra nota, para mostrar ![[nota]] dentro desta */
  noteText?(target: string): string | null;
  /** Markdown → HTML (colunas, notas embutidas) */
  render?(md: string): string;
  /** caminho da nota aberta */
  current?(): string | null;
  /** para onde um [[alvo]] leva (com apelidos), ou null se a nota não existe */
  resolve?(target: string): string | null;
  /** apelidos (aliases:) das notas, para sugerir [[Nota|apelido]] */
  aliases?(): Array<{ alias: string; path: string }>;
  /** clique numa #tag */
  openTag?(tag: string): void;
  /** garante um ^id na linha da nota (vazio = a atual) e devolve o id */
  ensureBlock?(target: string, line: number): string | null;
}

export const hostFacet = Facet.define<EditorHost | null, EditorHost | null>({ combine: (v) => v.find((x) => x) ?? null });

const strip = (p: string) => p.replace(/\.md$/i, '').toLowerCase();

/** O [[alvo]] existe no cofre? Arquivos (com extensão) e endereços contam como existentes. */
export function linkExists(host: EditorHost | null, target: string): boolean {
  if (!host) return true;
  const t = target.split('#')[0]!.trim();
  if (!t || /^https?:/i.test(t) || (/\.[a-z0-9]{2,5}$/i.test(t) && !/\.md$/i.test(t))) return true;
  if (host.resolve) return host.resolve(t) !== null;
  const want = strip(t);
  return host.notes().some((p) => {
    const s = strip(p);
    return s === want || s.endsWith(`/${want}`);
  });
}

/** Sem acentos e em minúsculas, para buscar "calculo" e achar "Cálculo". */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Nome da nota (sem pasta e sem .md). */
export const noteName = (p: string) => p.replace(/\.md$/i, '').split('/').pop()!;
