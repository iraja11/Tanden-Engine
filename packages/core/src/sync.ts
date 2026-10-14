import type { Replicator, ReplicaReport } from './replicator';
import { fromBytes } from './storage';
import type { SyncOptions, SyncReport, Vault } from './vault';

/** Outro tipo de documento que funde junto com as notas (quadros, planilhas...). */
export interface Syncable {
  sync(opts?: SyncOptions): Promise<{ written: number }>;
}

/**
 * Ciclo completo de um aparelho: funde o que há na pasta local, troca arquivos
 * com o Drive, funde o que chegou e envia o resultado.
 */
export async function fullSync(vault: Vault, replicator: Replicator, extras: Syncable[] = []): Promise<{ vault: SyncReport; replica: ReplicaReport }> {
  return vault.bus.process(`fullsync:${vault.deviceId}`, 'Sincronizando com o Drive', async () => {
    await vault.sync();
    for (const x of extras) await x.sync();
    const first = await replicator.sync();
    const downloaded = new Set(first.downloaded.filter((p) => !p.startsWith('.tanden/')));
    const opts: SyncOptions = {
      downloaded,
      previousVersions: async (p) => (await replicator.remote.history(p, 10)).map(fromBytes),
    };
    const merged = await vault.sync(opts);
    let extraWritten = 0;
    for (const x of extras) extraWritten += (await x.sync(opts)).written;
    const second = first.downloaded.length > 0 || merged.written > 0 || extraWritten > 0 ? await replicator.sync() : { uploaded: [], downloaded: [] };
    return {
      vault: merged,
      replica: { uploaded: [...first.uploaded, ...second.uploaded], downloaded: [...first.downloaded, ...second.downloaded] },
    };
  });
}
