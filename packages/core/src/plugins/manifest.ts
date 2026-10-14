/*
 * Plugins do Tanden: cada plugin é uma página HTML (um artefato do Claude
 * serve) que roda isolada numa janela própria e só fala com o app pela API.
 * O que ele pode fazer está declarado no manifesto e precisa da sua permissão
 * em cada aparelho.
 *
 * Manifesto, dentro do próprio HTML:
 *
 *   <script type="application/tanden+json">
 *   { "id": "meu-plugin", "nome": "Meu plugin", "versao": "1.0.0", "api": 1,
 *     "permissoes": ["notas:ler", "rede"] }
 *   </script>
 */

/** Versão da API. Só muda quando algo deixa de funcionar do jeito antigo. */
export const PLUGIN_API = 1;

export interface PluginManifest {
  id: string;
  nome: string;
  versao: string;
  api: number;
  descricao: string;
  autor: string;
  /** símbolo curto para a barra (1 ou 2 caracteres); vazio usa a inicial */
  icone: string;
  /** o plugin tem tela própria na barra lateral */
  tela: boolean;
  /** roda desde a abertura do app (para avisar e buscar coisas sem a tela aberta) */
  fundo: boolean;
  permissoes: string[];
}

/** Permissões que um plugin pode pedir. Algumas aceitam um escopo depois de ":" extra. */
export const PERMISSIONS = {
  'notas:ler': 'Ler suas notas',
  'notas:escrever': 'Criar e alterar notas',
  rede: 'Acessar a internet',
  avisos: 'Mostrar notificações',
  eventos: 'Saber o que acontece no app (notas criadas, sincronizações, lembretes)',
} as const;

export type PermissionBase = keyof typeof PERMISSIONS;

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SCOPED: Record<string, (scope: string) => boolean> = {
  // pasta do cofre, terminando em "/"
  'notas:ler': (s) => /^[^./][^]*\/$/.test(s) && !s.split('/').some((p) => p === '..' || p.startsWith('.')),
  'notas:escrever': (s) => /^[^./][^]*\/$/.test(s) && !s.split('/').some((p) => p === '..' || p.startsWith('.')),
  // domínio, com "*." para subdomínios
  rede: (s) => /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s),
};

/** "notas:escrever:Notícias/" → base "notas:escrever", escopo "Notícias/". */
export function splitPermission(p: string): { base: string; scope: string } {
  for (const base of Object.keys(PERMISSIONS)) {
    if (p === base) return { base, scope: '' };
    if (p.startsWith(`${base}:`)) return { base, scope: p.slice(base.length + 1) };
  }
  return { base: p, scope: '' };
}

export function validPermission(p: string): boolean {
  const { base, scope } = splitPermission(p);
  if (!(base in PERMISSIONS)) return false;
  return !scope || (SCOPED[base]?.(scope) ?? false);
}

/** Frase para o pedido de permissão ("Criar e alterar notas em Notícias/"). */
export function describePermission(p: string): string {
  const { base, scope } = splitPermission(p);
  const label = PERMISSIONS[base as PermissionBase] ?? p;
  if (!scope) return label;
  return base === 'rede' ? `${label} (só ${scope.replace(/^\*\./, '')})` : `${label} em ${scope}`;
}

/** Permissões novas em `wanted` que `granted` ainda não cobre. */
export function missingPermissions(wanted: string[], granted: string[]): string[] {
  return wanted.filter((w) => !granted.includes(w) && !granted.includes(splitPermission(w).base));
}

/**
 * Lê e valida o manifesto. Campos estranhos são ignorados; os obrigatórios
 * errados geram erro com a explicação.
 */
export function parseManifest(raw: unknown): PluginManifest {
  if (!raw || typeof raw !== 'object') throw new Error('manifesto vazio');
  const m = raw as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof m[k] === 'string' ? (m[k] as string).trim().slice(0, max) : '');
  const id = str('id', 40);
  if (!ID_RE.test(id)) throw new Error('o id do plugin precisa ter de 2 a 40 letras minúsculas, números ou "-"');
  const api = typeof m.api === 'number' ? m.api : PLUGIN_API;
  if (api > PLUGIN_API) throw new Error(`o plugin pede a API ${api}, e este Tanden tem a ${PLUGIN_API}. Atualize o app.`);
  const perms = Array.isArray(m.permissoes) ? m.permissoes.filter((p): p is string => typeof p === 'string') : [];
  const bad = perms.filter((p) => !validPermission(p));
  if (bad.length) throw new Error(`permissão desconhecida: ${bad.join(', ')}`);
  return {
    id,
    nome: str('nome', 40) || id,
    versao: str('versao', 20) || '0.0.0',
    api,
    descricao: str('descricao', 300),
    autor: str('autor', 80),
    icone: [...str('icone', 8)].slice(0, 2).join(''),
    tela: m.tela !== false,
    fundo: m.fundo === true,
    permissoes: [...new Set(perms)],
  };
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * Manifesto de um HTML. Sem manifesto (um artefato qualquer), vira um mini-app
 * sem permissões, com o nome tirado do <title>.
 */
export function manifestFromHtml(html: string, fallbackName = 'mini-app'): PluginManifest {
  const m = /<script[^>]*type=["']application\/tanden\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (m) {
    let json: unknown;
    try {
      json = JSON.parse(m[1]!);
    } catch {
      throw new Error('o manifesto do plugin não é um JSON válido');
    }
    return parseManifest(json);
  }
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || fallbackName;
  const id = slug(title).length >= 2 ? slug(title) : `mini-app-${slug(fallbackName) || 'x'}`.slice(0, 40);
  return parseManifest({ id, nome: title.slice(0, 40), versao: '1.0.0', tela: true, permissoes: [] });
}
