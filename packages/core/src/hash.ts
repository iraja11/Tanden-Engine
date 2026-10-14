// cyrb53: hash rápido e determinístico de 53 bits. Não é criptográfico;
// serve para chaves de arquivo e para comparar conteúdos.
export function hash53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const hashHex = (text: string): string => hash53(text).toString(16).padStart(14, '0');

// clientID do Yjs é um uint32; usamos isso para gerar operações idênticas
// em aparelhos diferentes quando eles importam o mesmo conteúdo externo.
export const clientIdFor = (text: string): number => hash53(text, 7) >>> 0;

/** Mesmo hash, sobre bytes (estado CRDT binário). */
export function hashBytesHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return hashHex(s);
}
