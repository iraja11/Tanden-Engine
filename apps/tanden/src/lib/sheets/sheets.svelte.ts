import { SheetStore, Workbook, csvSheet, readXlsx, toBytes, writeCsv, writeXlsx, type Storage } from '@tanden/core';
import { engine } from '../engine.svelte';
import { isTauri, TauriStorage } from '../storage-tauri';

// Estado do módulo de planilhas. A grade e os gráficos leem daqui.

class Sheets {
  store: SheetStore | null = null;
  list = $state<string[]>([]);
  active = $state<string | null>(null);
  /** sobe a cada mudança na pasta aberta; a interface redesenha */
  version = $state(0);
  /** aviso curto no rodapé da planilha (importou, exportou, erro) */
  notice = $state('');
  private unwatch: (() => void) | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Liga a tela ao SheetStore do engine (que já sincroniza junto com as notas). */
  start(): void {
    if (this.store || !engine.ready) return;
    this.store = engine.sheets;
    this.store.onChange((path, origin) => {
      this.refresh();
      if (path === this.active) this.version++;
      if (origin === 'local') this.scheduleSync();
      else engine.pulse('editor', 'out');
      if (!this.active && this.list.length) this.open(this.list[0]!);
    });
    this.refresh();
    if (this.list.length) this.open(this.list[0]!);
  }

  get workbook(): Workbook | null {
    void this.version;
    return this.store && this.active && this.store.has(this.active) ? this.store.workbook(this.active) : null;
  }

  private refresh(): void {
    this.list = this.store?.list() ?? [];
  }

  /** O sync espera uma pausa na digitação, como nas notas. */
  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      engine.pulse('editor', 'in');
      void engine.syncNow();
    }, 1500);
  }

  say(text: string): void {
    this.notice = text;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 6000);
  }

  open(path: string): void {
    if (!this.store?.has(path)) return;
    this.unwatch?.();
    this.active = path;
    this.unwatch = this.store.workbook(path).onChange(() => this.version++);
    this.version++;
  }

  create(name = 'Nova planilha'): void {
    if (!this.store) return;
    const path = this.store.freePath(name);
    this.store.create(path);
    this.open(path);
  }

  /** Importa .xlsx, .csv ou .tsv como uma planilha nova. */
  async importFile(file: File): Promise<void> {
    if (!this.store) return;
    try {
      await engine.bus.process('sheets:import', `Importando ${file.name}`, async () => {
        const base = file.name.replace(/\.[^.]+$/, '');
        const data = /\.xlsx$/i.test(file.name)
          ? readXlsx(new Uint8Array(await file.arrayBuffer()))
          : { sheets: [csvSheet(base.slice(0, 31) || 'Dados', await file.text())] };
        const path = this.store!.freePath(base);
        this.store!.create(path, data);
        this.open(path);
        this.say(`Importei ${file.name}.`);
      });
    } catch (e) {
      this.say(`Não consegui importar ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Baixa o arquivo (navegador) ou grava em Exportados/ no cofre (app instalado). */
  async export(kind: 'xlsx' | 'csv' | 'csv-br', sheetId?: string): Promise<void> {
    const wb = this.workbook;
    if (!wb || !this.active) return;
    const name = this.active.split('/').pop()!.replace(/\.xlsx$/i, '');
    const sheetName = wb.sheets().find((s) => s.id === sheetId)?.name;
    const fileName = kind === 'xlsx' ? `${name}.xlsx` : `${name}${sheetName && wb.sheets().length > 1 ? ` - ${sheetName}` : ''}.csv`;
    const data =
      kind === 'xlsx'
        ? writeXlsx(wb)
        : toBytes(`﻿${writeCsv(wb, sheetId ?? wb.sheets()[0]!.id, { delimiter: kind === 'csv-br' ? ';' : ',' })}`);
    if (isTauri()) {
      const path = `Exportados/${fileName}`;
      const storage: Storage = new TauriStorage();
      await storage.write(path, data);
      this.say(`Salvei em ${engine.location}/${path}`);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([data as BlobPart], { type: kind === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv' }),
    );
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export const sheets = new Sheets();
