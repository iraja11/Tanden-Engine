import type { BaseDef, Group, PropConfig, Row, Value, ViewDef, ViewResult } from '@tanden/core';

/** O que cada tipo de view recebe da tela do banco. */
export interface ViewCtx {
  def: BaseDef;
  view: ViewDef;
  result: ViewResult;
  /** colunas visíveis (file.name sempre primeiro) */
  columns: string[];
  notePath: string;
  label(id: string): string;
  type(id: string): string;
  cfg(id: string): PropConfig;
  set(row: Row, id: string, v: Value): void;
  config(id: string, patch: Partial<PropConfig>): void;
  /** muda a view (e grava o bloco) */
  patchView(patch: Partial<ViewDef>): void;
  open(path: string): void;
  /** nova linha com valores iniciais; abre no painel lateral */
  add(defaults?: Record<string, string | string[]>, name?: string): string;
  /** valor inicial de uma coluna ao criar dentro de um grupo */
  groupDefaults(g: Group): Record<string, string | string[]>;
  /** menu de uma coluna (cabeçalho da tabela) */
  columnMenu(id: string, anchor: HTMLElement): void;
}
