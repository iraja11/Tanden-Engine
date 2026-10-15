import { hashHex, readText, toBytes } from '@tanden/core';
import { engine } from '../engine.svelte';

/*
 * Histórico de versões de cada nota, guardado só neste aparelho
 * (.tanden/local/<aparelho>/versoes/). Uma versão nova a cada 5 minutos de
 * edição, mais a versão de quando a nota foi aberta. As antigas vão ficando
 * espaçadas (uma por hora depois de 2 dias, uma por dia depois de 30).
 */

export interface Version {
  /** quando o texto ficou assim */
  at: number;
  text: string;
  /** começo da janela de 5 minutos desta versão */
  since?: number;
}

const GAP = 5 * 60_000;
const MAX = 120;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const fileOf = (path: string) => `.tanden/local/${engine.vault.deviceId}/versoes/${hashHex(path)}.json`;

/** Deixa as antigas mais espaçadas e limita o total. */
export function thin(list: Version[], now = Date.now()): Version[] {
  const out: Version[] = [];
  let lastBucket = '';
  for (const v of [...list].sort((a, b) => b.at - a.at)) {
    const age = now - v.at;
    const bucket = age < 2 * DAY ? `m${v.at}` : age < 30 * DAY ? `h${Math.floor(v.at / HOUR)}` : `d${Math.floor(v.at / DAY)}`;
    if (bucket === lastBucket) continue;
    lastBucket = bucket;
    out.push(v);
  }
  return out.slice(0, MAX).reverse();
}

class Versions {
  private cache = new Map<string, Version[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private writing = Promise.resolve();

  async list(path: string): Promise<Version[]> {
    const hit = this.cache.get(path);
    if (hit) return hit;
    let list: Version[] = [];
    try {
      const raw = await readText(engine.storage, fileOf(path));
      if (raw) list = (JSON.parse(raw) as { items?: Version[] }).items ?? [];
    } catch {
      list = [];
    }
    this.cache.set(path, list);
    return list;
  }

  /** Guarda a versão atual (abrir a nota, ou depois de uma pausa na edição). */
  async snapshot(path: string, text: string, force = false): Promise<void> {
    const list = await this.list(path);
    const last = list[list.length - 1];
    if (last && last.text === text) return;
    const now = Date.now();
    // dentro da mesma janela de edição, a versão mais recente substitui a anterior
    if (!force && last && list.length > 1 && now - (last.since ?? last.at) < GAP) {
      last.text = text;
      last.at = now;
    } else list.push({ at: now, text, since: now });
    const next = thin(list, now);
    this.cache.set(path, next);
    this.writing = this.writing.then(() => engine.storage.write(fileOf(path), toBytes(JSON.stringify({ path, items: next })))).catch(() => {});
    await this.writing;
  }

  /** Chamado a cada mudança: espera a pessoa parar de digitar. */
  touch(path: string): void {
    const t = this.timers.get(path);
    if (t) clearTimeout(t);
    this.timers.set(
      path,
      setTimeout(() => {
        this.timers.delete(path);
        if (engine.vault.has(path)) void this.snapshot(path, engine.vault.read(path));
      }, 4000),
    );
  }

  /** A nota foi renomeada: o histórico vai junto. */
  async moved(from: string, to: string): Promise<void> {
    const list = await this.list(from);
    if (!list.length) return;
    this.cache.set(to, list);
    await engine.storage.write(fileOf(to), toBytes(JSON.stringify({ path: to, items: list })));
  }
}

export const versions = new Versions();
