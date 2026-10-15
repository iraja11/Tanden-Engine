import { describe, expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
import {
  addHighlight, canonicalUrl, clipToMarkdown, collectHighlights, findClip, parseClipTemplate, parseProps, pickClipTemplate,
  prepareClip, syncHighlights, youtubeId, clipperBookmarklet,
} from '../src/index';

const parse = (t: string, type: 'text/html' | 'application/xml') => new DOMParser().parseFromString(t, type === 'application/xml' ? 'text/xml' : type) as unknown as Document;
const now = new Date(2026, 9, 15, 10, 5);

const page = `<html><head><title>Como treinar combos | Blog FGC</title>
  <meta property="og:title" content="Como treinar combos"><meta property="og:site_name" content="Blog FGC">
  <meta name="author" content="Rui"></head><body><nav>Menu</nav><article><h1>Como treinar combos</h1>
  ${'<p>Treinar combos exige repetição com intenção, sempre no modo treino antes de levar para a partida. '.repeat(6)}</p>
  <p>O segredo é <em>começar devagar</em> e aumentar a velocidade aos poucos, como um_músico.</p>
  <h2>Rotina</h2><p>${'Dez minutos por dia bastam para fixar a sequência na memória muscular. '.repeat(6)}</p></article></body></html>`;

describe('recorte com tags, nota e destaques', () => {
  it('grava tags extras, a sua nota, site e status de leitura', () => {
    const clip = prepareClip(page, 'https://blog.fgc.dev/combos', parse);
    const md = clipToMarkdown(clip, { parse, now, tags: ['fgc', '#estudo', 'web'], comment: 'Ler antes do treino.' });
    const p = parseProps(md);
    expect(p.tags).toEqual(['web', 'fgc', 'estudo']);
    expect(p.site).toBe('Blog FGC');
    expect(p.status).toBe('Para ler');
    expect(md).toContain('> [!quote] Minha nota\n> Ler antes do treino.');
  });

  it('marca o trecho no texto, mesmo com escapes do Markdown, e lista em Destaques', () => {
    const clip = prepareClip(page, 'https://blog.fgc.dev/combos', parse);
    const md = clipToMarkdown(clip, { parse, now, highlights: ['aumentar a velocidade aos poucos, como um_músico', 'Dez minutos por dia bastam'] });
    expect(md).toContain('==aumentar a velocidade aos poucos, como um\\_músico==');
    expect(md).toContain('==Dez minutos por dia bastam==');
    expect(md).toMatch(/> \[!info\][^\n]*\n\n## Destaques\n\n- aumentar a velocidade aos poucos, como um_músico\n- Dez minutos por dia bastam\n\n/);
    // destaque repetido não duplica
    const again = addHighlight(md, 'Dez minutos por dia bastam');
    expect(again.added).toBe(false);
    expect(again.text.match(/==Dez minutos/g)).toHaveLength(1);
  });

  it('destaca trechos de vários parágrafos e lê os ==destaques== da nota', () => {
    const note = '---\ntitle: X\n---\n# X\n\nPrimeiro parágrafo aqui.\n\nSegundo parágrafo ali.\n\n```\nnão ==conta==\n```\n';
    const r = addHighlight(note, 'parágrafo aqui.\n\nSegundo parágrafo');
    expect(r.marked).toBe(true);
    expect(r.text).toContain('Primeiro ==parágrafo aqui.==');
    expect(r.text).toContain('==Segundo parágrafo== ali.');
    expect(r.text).toContain('## Destaques\n\n- parágrafo aqui. Segundo parágrafo');
    expect(collectHighlights(r.text)).toEqual(['parágrafo aqui.', 'Segundo parágrafo']);
    const marked = '# Nota\n\nTexto com ==uma ideia== e ==outra==.\n';
    const synced = syncHighlights(marked);
    expect(synced).toContain('## Destaques\n\n- uma ideia\n- outra');
    expect(syncHighlights(synced)).toBe(synced);
  });

  it('trecho que não aparece no texto fica só na lista', () => {
    const r = addHighlight('# A\n\nalgo\n', 'frase que não existe');
    expect(r.marked).toBe(false);
    expect(r.text).toBe('# A\n\n## Destaques\n\n- frase que não existe\n\nalgo\n');
  });
});

describe('YouTube', () => {
  it('reconhece os formatos de endereço', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'])
      expect(youtubeId(u), u).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/@canal')).toBeNull();
    expect(youtubeId('https://vimeo.com/1')).toBeNull();
  });

  it('vira nota com o player, o canal e a descrição inteira', () => {
    const html = `<html><head><meta property="og:title" content="Guia de SF6"><meta property="og:description" content="curta…">
      <meta itemprop="uploadDate" content="2026-03-01T08:00:00-08:00"></head><body><script>var ytInitialPlayerResponse = {"videoDetails":{"ownerChannelName":"Canal FGC","shortDescription":"Linha 1\\nLinha 2\\n\\nLinks: https://x.dev/a"}};</script></body></html>`;
    const clip = prepareClip(html, 'https://youtu.be/dQw4w9WgXcQ', parse);
    expect(clip.meta).toMatchObject({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', author: 'Canal FGC', published: '2026-03-01', siteName: 'YouTube' });
    const md = clipToMarkdown(clip, { parse, now });
    expect(md).toContain('![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    expect(md).toContain('Linha 1');
    expect(md).toContain('[https://x.dev/a](https://x.dev/a)');
  });
});

describe('modelos de recorte', () => {
  const yt = parseClipTemplate('Modelos/Recortes/Vídeo.md', '---\nrecorte-sites: [youtube.com]\nrecorte-pasta: Vídeos\ntipo: vídeo\ncanal: "{{author}}"\ntags: [vídeo]\n---\n# {{title}}\n\n{{content}}\n\nSalvo em {{date:DD/MM/YYYY}}\n')!;
  const all = parseClipTemplate('Modelos/Recortes/Padrão.md', '---\nfonte: "{{url}}"\n---\n{{content}}\n')!;

  it('escolhe pelo domínio, com * por último', () => {
    expect(yt.sites).toEqual(['youtube.com']);
    expect(yt.folder).toBe('Vídeos');
    expect(all.sites).toEqual(['*']);
    expect(pickClipTemplate([all, yt], 'https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(yt);
    expect(pickClipTemplate([all, yt], 'https://blog.fgc.dev/x')).toBe(all);
    expect(pickClipTemplate([yt], 'https://blog.fgc.dev/x')).toBeNull();
    expect(parseClipTemplate('Modelos/Outro.md', '# x')).toBeNull();
  });

  it('preenche topo e corpo, e sempre guarda source e tags', () => {
    const clip = prepareClip(page, 'https://blog.fgc.dev/combos', parse);
    const md = clipToMarkdown(clip, { parse, now, template: yt, tags: ['fgc'] });
    const p = parseProps(md);
    expect(p).toMatchObject({ tipo: 'vídeo', canal: 'Rui', source: 'https://blog.fgc.dev/combos', tags: ['vídeo', 'web', 'fgc'] });
    expect(p['recorte-sites']).toBeUndefined();
    expect(md).toContain('# Como treinar combos\n\n');
    expect(md).toContain('## Rotina');
    expect(md).toContain('Salvo em 15/10/2026');
  });
});

describe('mesma página', () => {
  it('compara endereços sem rastreio, # e www', () => {
    expect(canonicalUrl('https://www.site.com/a/?utm_source=x&b=2#topo')).toBe('site.com/a?b=2');
    expect(canonicalUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('youtube.com/watch?v=dQw4w9WgXcQ');
    const notes: Array<{ path: string; props: Record<string, string> }> = [{ path: 'Web/A.md', props: { source: 'https://site.com/a?b=2' } }, { path: 'Leituras/B.md', props: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } }];
    expect(findClip(notes, 'https://www.site.com/a/?b=2&utm_medium=y')).toBe('Web/A.md');
    expect(findClip(notes, 'https://youtu.be/dQw4w9WgXcQ')).toBe('Leituras/B.md');
    expect(findClip(notes, 'https://site.com/c')).toBeNull();
  });
});

describe('favorito do recortador', () => {
  it('é um javascript: válido com a porta e a chave', () => {
    const b = clipperBookmarklet(27183, 'abc123');
    expect(b.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(b.slice('javascript:'.length));
    expect(code).toContain('"http://127.0.0.1:27183/clip"');
    expect(code).toContain('"abc123"');
    expect(() => new Function(code)).not.toThrow();
  });
});
