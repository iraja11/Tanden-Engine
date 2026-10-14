import { describe, expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
import {
  EventBus,
  PluginHost,
  describePermission,
  discoverFeeds,
  manifestFromHtml,
  missingPermissions,
  parseFeed,
  parseManifest,
  pluginDocument,
  type Fetched,
  type ParseHtml,
  type PluginServices,
  type TandenEvent,
} from '../src/index';

const parse: ParseHtml = (text, type) => new DOMParser().parseFromString(text, type === 'application/xml' ? 'text/xml' : 'text/html') as unknown as Document;
const enc = (s: string) => new TextEncoder().encode(s);

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Frame Data &amp; Cia</title>
  <link>https://fgc.example.com/</link>
  <description>Notícias de jogos de luta</description>
  <item>
    <title>Seth volta no &lt;b&gt;SF6&lt;/b&gt;</title>
    <link>https://fgc.example.com/seth</link>
    <guid isPermaLink="false">post-42</guid>
    <pubDate>Tue, 13 Oct 2026 18:30:00 GMT</pubDate>
    <dc:creator>Ana</dc:creator>
    <description><![CDATA[<p>O <b>chefe</b> volta.</p><p>Com tanden engine.</p><img src="/img/seth.jpg"><script>alert(1)</script>]]></description>
    <media:thumbnail url="https://cdn.example.com/seth-thumb.jpg"/>
  </item>
  <item>
    <title>Sem data</title>
    <link>/relativo</link>
    <description>&lt;img src="x.png" onerror="alert(1)"&gt;Texto escapado</description>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Blog do Tanden</title>
  <link href="https://blog.example.org/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="https://blog.example.org/" rel="alternate" type="text/html"/>
  <entry>
    <title>Plugins chegaram</title>
    <link rel="alternate" href="https://blog.example.org/plugins"/>
    <id>tag:blog.example.org,2026:1</id>
    <published>2026-10-14T10:00:00-03:00</published>
    <author><name>Girlene</name></author>
    <summary type="html">&lt;p&gt;Agora com &lt;em&gt;permissões&lt;/em&gt;.&lt;/p&gt;</summary>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://old.example.net/"><title>Antigo</title><link>https://old.example.net/</link></channel>
  <item rdf:about="https://old.example.net/1"><title>Um</title><link>https://old.example.net/1</link><dc:date>2026-01-02T03:04:05Z</dc:date></item>
</rdf:RDF>`;

const JSONFEED = JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1',
  title: 'JSON',
  home_page_url: 'https://j.example.com/',
  items: [{ id: '1', url: 'https://j.example.com/1', content_html: '<p>Olá <b>mundo</b></p>', date_published: '2026-10-01T00:00:00Z', authors: [{ name: 'X' }] }],
});

describe('feeds', () => {
  it('lê RSS 2.0 com HTML só como texto', () => {
    const f = parseFeed(RSS, 'https://fgc.example.com/rss', parse);
    expect(f.titulo).toBe('Frame Data & Cia');
    expect(f.site).toBe('https://fgc.example.com/');
    expect(f.itens).toHaveLength(2);
    const [a, b] = f.itens;
    expect(a!.titulo).toBe('Seth volta no SF6');
    expect(a!.id).toBe('post-42');
    expect(a!.link).toBe('https://fgc.example.com/seth');
    expect(a!.resumo).toBe('O chefe volta. Com tanden engine.');
    expect(a!.resumo).not.toContain('alert');
    expect(a!.autor).toBe('Ana');
    expect(a!.data).toBe(Date.UTC(2026, 9, 13, 18, 30));
    expect(a!.imagem).toBe('https://cdn.example.com/seth-thumb.jpg');
    expect(b!.link).toBe('https://fgc.example.com/relativo');
    expect(b!.resumo).toBe('Texto escapado');
    expect(b!.data).toBe(0);
  });

  it('lê Atom, RSS 1.0 e JSON Feed', () => {
    const atom = parseFeed(ATOM, 'https://blog.example.org/feed.xml', parse);
    expect(atom.site).toBe('https://blog.example.org/');
    expect(atom.itens[0]).toMatchObject({ titulo: 'Plugins chegaram', link: 'https://blog.example.org/plugins', resumo: 'Agora com permissões.', autor: 'Girlene' });
    expect(atom.itens[0]!.data).toBe(Date.UTC(2026, 9, 14, 13));

    const rdf = parseFeed(RDF, 'https://old.example.net/rss', parse);
    expect(rdf.itens.map((i) => i.titulo)).toEqual(['Um']);
    expect(rdf.itens[0]!.data).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));

    const json = parseFeed(JSONFEED, 'https://j.example.com/feed.json', parse);
    expect(json.itens[0]).toMatchObject({ titulo: 'Olá mundo', resumo: 'Olá mundo', autor: 'X', link: 'https://j.example.com/1' });
  });

  it('recusa o que não é feed e acha o feed anunciado por uma página', () => {
    expect(() => parseFeed('<html><body>oi</body></html>', 'https://x.com', parse)).toThrow(/feed/);
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="Comentários" href="/comments/feed">
      <link rel="alternate" type="application/rss+xml" title="Notícias" href="/feed">
      <link rel="alternate" hreflang="en" href="/en">
    </head></html>`;
    expect(discoverFeeds(html, 'https://site.com.br/', parse)).toEqual([
      { url: 'https://site.com.br/feed', titulo: 'Notícias' },
      { url: 'https://site.com.br/comments/feed', titulo: 'Comentários' },
    ]);
  });
});

describe('manifesto', () => {
  it('valida id, permissões e versão da API', () => {
    const m = parseManifest({ id: 'noticias', nome: 'Notícias', api: 1, permissoes: ['rede', 'notas:escrever:Notícias/', 'rede'] });
    expect(m.permissoes).toEqual(['rede', 'notas:escrever:Notícias/']);
    expect(m.tela).toBe(true);
    expect(() => parseManifest({ id: 'X Y' })).toThrow(/id/);
    expect(() => parseManifest({ id: 'ok', permissoes: ['disco'] })).toThrow(/desconhecida/);
    expect(() => parseManifest({ id: 'ok', permissoes: ['notas:escrever:../'] })).toThrow(/desconhecida/);
    expect(() => parseManifest({ id: 'ok', api: 99 })).toThrow(/API 99/);
    expect(describePermission('notas:escrever:Notícias/')).toBe('Criar e alterar notas em Notícias/');
    expect(describePermission('rede:*.g1.globo.com')).toBe('Acessar a internet (só g1.globo.com)');
  });

  it('artefato sem manifesto vira mini-app sem permissões', () => {
    const m = manifestFromHtml('<!doctype html><html><head><title>Bola 8 Mágica</title></head><body></body></html>');
    expect(m).toMatchObject({ id: 'bola-8-magica', nome: 'Bola 8 Mágica', permissoes: [], tela: true });
    const withManifest = manifestFromHtml('<script type="application/tanden+json">{"id":"dados","permissoes":["avisos"]}</script>');
    expect(withManifest.permissoes).toEqual(['avisos']);
  });

  it('só pede de novo as permissões que são novas', () => {
    expect(missingPermissions(['rede', 'avisos'], ['rede'])).toEqual(['avisos']);
    expect(missingPermissions(['notas:ler:Diário/'], ['notas:ler'])).toEqual([]);
  });
});

function fakeServices(over: Partial<PluginServices> = {}) {
  const notes = new Map<string, string>([['Diário/hoje.md', 'oi'], ['Segredos/senha.md', '123']]);
  const store = new Map<string, unknown>();
  const pushed: unknown[] = [];
  const notified: string[] = [];
  const bus = new EventBus();
  const fetched: string[] = [];
  const responses = new Map<string, Fetched>();
  const services: PluginServices = {
    parse,
    notes: { list: () => [...notes.keys()], read: (p) => notes.get(p) ?? null, write: (p, t) => void notes.set(p, t) },
    clip: async (url, folder) => `${folder}/${new URL(url).pathname.slice(1)}.md`,
    fetch: async (url) => {
      fetched.push(url);
      const r = responses.get(url);
      if (!r) throw new Error(`sem resposta para ${url}`);
      return r;
    },
    notify: (t, b) => void notified.push(`${t}|${b}`),
    store: { get: (k) => store.get(k), set: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k), keys: () => [...store.keys()] },
    openNote: () => {},
    openLink: () => {},
    badge: () => {},
    subscribe: (fn) => bus.on('*', fn),
    push: (m) => void pushed.push(m),
    ...over,
  };
  return { services, notes, store, pushed, notified, bus, fetched, responses };
}

const manifest = (permissoes: string[]) => parseManifest({ id: 'teste', permissoes });

describe('API dos plugins', () => {
  it('recusa o que não foi permitido', async () => {
    const { services } = fakeServices();
    const host = new PluginHost(manifest(['notas:ler']), [], services);
    await expect(host.call('notas.ler', ['Diário/hoje.md'])).rejects.toThrow('sem permissão: notas:ler');
    await expect(host.call('rede.buscar', ['https://x.com'])).rejects.toThrow('sem permissão: rede');
    await expect(host.call('nada.disso', [])).rejects.toThrow(/não tem/);
    await expect(host.call('constructor', [])).rejects.toThrow(/não tem/);
    // dados próprios e abrir coisas não precisam de permissão
    await host.call('dados.gravar', ['k', { a: 1 }]);
    expect(await host.call('dados.ler', ['k'])).toEqual({ a: 1 });
  });

  it('respeita a pasta do escopo e bloqueia caminhos perigosos', async () => {
    const { services, notes } = fakeServices();
    const host = new PluginHost(manifest([]), ['notas:ler:Diário/', 'notas:escrever:Diário/'], services);
    expect(await host.call('notas.listar', [])).toEqual(['Diário/hoje.md']);
    expect(await host.call('notas.ler', ['Diário/hoje.md'])).toBe('oi');
    await expect(host.call('notas.ler', ['Segredos/senha.md'])).rejects.toThrow(/sem permissão/);
    await expect(host.call('notas.escrever', ['Diário/../Segredos/senha.md', 'x'])).rejects.toThrow(/inválido/);
    await expect(host.call('notas.escrever', ['.tanden/crdt/x.md', 'x'])).rejects.toThrow(/inválido/);
    await expect(host.call('notas.escrever', ['/etc/passwd.md', 'x'])).rejects.toThrow(/inválido/);
    await expect(host.call('notas.escrever', ['Diário/script.js', 'x'])).rejects.toThrow(/\.md/);
    await host.call('notas.acrescentar', ['Diário/hoje.md', '- item']);
    expect(notes.get('Diário/hoje.md')).toBe('oi\n- item');
  });

  it('rede: domínio do escopo, redirecionamento e feed descoberto pela página', async () => {
    const { services, responses, fetched } = fakeServices();
    const host = new PluginHost(manifest([]), ['rede:*.example.com'], services);
    await expect(host.call('rede.buscar', ['https://evil.com/'])).rejects.toThrow(/evil\.com/);
    await expect(host.call('rede.buscar', ['file:///etc/passwd'])).rejects.toThrow(/http/);
    responses.set('https://a.example.com/r', { url: 'https://evil.com/x', status: 200, type: 'text/plain', data: enc('x') });
    await expect(host.call('rede.buscar', ['https://a.example.com/r'])).rejects.toThrow(/evil\.com/);

    responses.set('https://fgc.example.com/', {
      url: 'https://fgc.example.com/',
      status: 200,
      type: 'text/html; charset=utf-8',
      data: enc('<html><head><link rel="alternate" type="application/rss+xml" href="/rss"></head></html>'),
    });
    responses.set('https://fgc.example.com/rss', { url: 'https://fgc.example.com/rss', status: 200, type: 'application/rss+xml', data: enc(RSS) });
    const r = (await host.call('rede.feed', ['https://fgc.example.com/'])) as { url: string; feed: { itens: unknown[] } };
    expect(r.url).toBe('https://fgc.example.com/rss');
    expect(r.feed.itens).toHaveLength(2);
    expect(fetched).toContain('https://fgc.example.com/rss');
  });

  it('decodifica latin-1 e recusa imagens que não são imagens', async () => {
    const { services, responses } = fakeServices();
    const host = new PluginHost(manifest([]), ['rede'], services);
    responses.set('https://br.com/', { url: 'https://br.com/', status: 200, type: 'text/html; charset=iso-8859-1', data: Uint8Array.from([0x6e, 0x6f, 0x74, 0xed, 0x63, 0x69, 0x61]) });
    expect(((await host.call('rede.buscar', ['https://br.com/'])) as { texto: string }).texto).toBe('notícia');
    responses.set('https://br.com/a.svg', { url: 'https://br.com/a.svg', status: 200, type: 'image/svg+xml', data: enc('<svg onload="x"/>') });
    await expect(host.call('rede.imagem', ['https://br.com/a.svg'])).rejects.toThrow(/imagem/);
    responses.set('https://br.com/a.png', { url: 'https://br.com/a.png', status: 200, type: 'application/octet-stream', data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) });
    expect(await host.call('rede.imagem', ['https://br.com/a.png'])).toBe('data:image/png;base64,iVBORw==');
  });

  it('limita avisos e entrega só eventos do escopo', async () => {
    const { services, notified, bus, pushed } = fakeServices();
    const host = new PluginHost(manifest([]), ['avisos', 'eventos', 'notas:ler:Diário/'], services);
    for (let i = 0; i < 6; i++) await host.call('avisos.notificar', [`t${i}`, 'b']);
    await expect(host.call('avisos.notificar', ['demais'])).rejects.toThrow(/demais/);
    expect(notified).toHaveLength(6);
    await host.call('eventos.ouvir', []);
    await host.call('eventos.ouvir', []); // ouvir duas vezes não duplica
    bus.emit({ type: 'note.created', path: 'Diário/novo.md' } as TandenEvent);
    bus.emit({ type: 'note.created', path: 'Segredos/x.md' } as TandenEvent);
    bus.emit({ type: 'sync.finished', merged: 1, external: 0, written: 1 });
    expect(pushed.map((p) => (p as { evento: TandenEvent }).evento.type)).toEqual(['note.created', 'sync.finished']);
    host.dispose();
    bus.emit({ type: 'note.created', path: 'Diário/outro.md' } as TandenEvent);
    expect(pushed).toHaveLength(2);
  });

  it('recorte vai para a pasta do escopo de escrita', async () => {
    const { services } = fakeServices();
    const host = new PluginHost(manifest([]), ['rede', 'notas:escrever:Notícias/'], services);
    expect(await host.call('notas.recortar', ['https://x.com/artigo'])).toBe('Notícias/artigo.md');
    await expect(host.call('notas.recortar', ['https://x.com/artigo', 'Outra'])).rejects.toThrow(/sem permissão/);
  });
});

describe('documento do plugin', () => {
  it('põe a política e o SDK antes de qualquer script do plugin', () => {
    const doc = pluginDocument('<!DOCTYPE html><html lang="pt"><head><script>window.x = 1</script></head><body>oi</body></html>');
    expect(doc.startsWith('<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc.indexOf('window.tanden') === -1 && doc.indexOf("'tanden'") > 0).toBe(true);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('window.x'));
    expect(doc).toContain('"notas.ler"');
    const bare = pluginDocument('<p>só um trecho</p>');
    expect(bare).toMatch(/^<!doctype html><html><head><meta charset="utf-8">.*<\/head><body><p>só um trecho<\/p><\/body><\/html>$/s);
  });
});
