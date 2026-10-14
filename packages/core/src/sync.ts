import type { Replicator, ReplicaReport } from './replicator';
import { fromBytes } from './storage';
import type { SyncReport, Vault } from './vault';

/**
 * Ciclo completo de um aparelho: funde o que há na pasta local, troca arquivos
 * com o Drive, funde o que chegou e envia o resultado.
 */
export async function fullSync(vault: Vault, replicator: Replicator): Promise<{ vault: SyncReport; replica: ReplicaReport }> {
  return vault.bus.process(`fullsync:${vault.deviceId}`, 'Sincronizando com o Drive', async () => {
    await vault.sync();
    const first = await replicator.sync();
    const downloaded = new Set(first.downloaded.filter((p) => p.endsWith('.md')));
    const merged = await vault.sync({
      downloaded,
      previousVersions: async (p) => (await replicator.remote.history(p, 10)).map(fromBytes),
    });
    const second = first.downloaded.length > 0 || merged.written > 0 ? await replicator.sync() : { uploaded: [], downloaded: [] };
    return {
      vault: merged,
      replica: { uploaded: [...first.uploaded, ...second.uploaded], downloaded: [...first.downloaded, ...second.downloaded] },
    };
  });
}
