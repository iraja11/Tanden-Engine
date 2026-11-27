/*
 * Web e apps: ela comenta o que está em foco na tela. O app lê só o TÍTULO
 * e a classe da janela ativa (o navegador põe o título da aba ali: "Aula 3 -
 * Google Classroom — Mozilla Firefox"); nada de URL, conteúdo ou histórico, e
 * nada sai do aparelho.
 *
 * Daqui sai a categoria (vídeo, live, estudo, trabalho, IA, jogos, adulto,
 * redes, compras, música, leitura), o site e o nome da página, e a reação
 * pesa o contexto: prova chegando e você no YouTube? Passou da hora de
 * dormir e você na Twitch? Outra IA aberta? Ela também soma o tempo do dia
 * por categoria ("3 horas de YouTube hoje. eu contei.").
 */
import { humorDe, mexer, type AnimaState } from '../estado';
import { botoes, escolher, lembrar, temperar, type Fala } from '../motor';
import { sono, type CtxJogo } from './jogos';
import { dobrar } from './texto';

export type CategoriaWeb = 'video' | 'live' | 'estudo' | 'trabalho' | 'ia' | 'jogos' | 'adulto' | 'rede' | 'compras' | 'musica' | 'leitura' | 'obsidian';

export interface Pagina {
  categoria: CategoriaWeb;
  /** "YouTube", "Twitch", "Google Classroom"... */
  site: string;
  /** o título da página, limpo (sem o site e o navegador) */
  pagina: string;
  navegador: boolean;
}

const NAVEGADOR_APP = /firefox|chrom|brave|vivaldi|zen|librewolf|floorp|opera|edge|epiphany|qutebrowser|waterfox|mullvad|tor-?browser|thorium|navigator/i;
const NAVEGADOR_SUFIXO = /\s*[—–-]\s*(?:Mozilla Firefox|Firefox|Google Chrome|Chromium|Brave|Vivaldi|Zen Browser|Zen|LibreWolf|Floorp|Opera|Microsoft​? Edge|Thorium|Waterfox|Mullvad Browser|Tor Browser|qutebrowser)(?:\s*\(.*\))?\s*$/i;

/** [categoria, nome do site, regex no título dobrado]; a ordem importa (YouTube Music antes de YouTube) */
const SITES: Array<[CategoriaWeb, string, RegExp]> = [
  ['adulto', 'site adulto', /\b(pornhub|xvideos|xnxx|xhamster|redtube|youporn|onlyfans|fansly|chaturbate|stripchat|rule ?34|e621|nhentai|spankbang|eporner|porn\w*|hentai|xxx|nsfw|camsoda|bongacams)\b/],
  ['musica', 'YouTube Music', /youtube music/],
  ['musica', 'Spotify', /\bspotify\b/],
  ['musica', 'SoundCloud', /\bsoundcloud\b/],
  ['musica', 'Deezer', /\bdeezer\b/],
  ['video', 'YouTube', /\byoutube\b/],
  ['live', 'Twitch', /\btwitch\b/],
  ['live', 'Kick', /\bkick\b/],
  ['video', 'Netflix', /\bnetflix\b/],
  ['video', 'Prime Video', /prime video/],
  ['video', 'Crunchyroll', /\bcrunchyroll\b/],
  ['video', 'Disney+', /disney\+|disney plus/],
  ['video', 'Max', /\bhbo max\b|\| max\b/],
  ['estudo', 'Google Classroom', /classroom/],
  ['estudo', 'Moodle', /\bmoodle\b|\bava\b|ambiente virtual/],
  ['estudo', 'Canvas', /\bcanvas\b|instructure/],
  ['estudo', 'Coursera', /\bcoursera\b/],
  ['estudo', 'Udemy', /\budemy\b/],
  ['estudo', 'Alura', /\balura\b/],
  ['estudo', 'Khan Academy', /khan academy/],
  ['estudo', 'Duolingo', /\bduolingo\b/],
  ['estudo', 'SIGAA', /\bsigaa\b/],
  ['ia', 'ChatGPT', /\bchatgpt\b|\bopenai\b/],
  ['ia', 'Claude', /\bclaude\b/],
  ['ia', 'Gemini', /\bgemini\b/],
  ['ia', 'Copilot', /\bcopilot\b/],
  ['ia', 'Perplexity', /\bperplexity\b/],
  ['ia', 'DeepSeek', /\bdeepseek\b/],
  ['ia', 'Character.AI', /character\.?ai/],
  ['jogos', 'Steam', /\bsteam\b/],
  ['jogos', 'itch.io', /itch\.io/],
  ['jogos', 'Epic Games', /epic games/],
  ['jogos', 'Nexus Mods', /nexus ?mods/],
  ['jogos', 'Roblox', /\broblox\b/],
  ['trabalho', 'Gmail', /\bgmail\b|caixa de entrada|inbox/],
  ['trabalho', 'Outlook', /\boutlook\b/],
  ['trabalho', 'Slack', /\bslack\b/],
  ['trabalho', 'Teams', /microsoft teams|\bteams\b/],
  ['trabalho', 'Jira', /\bjira\b/],
  ['trabalho', 'GitHub', /\bgithub\b/],
  ['trabalho', 'GitLab', /\bgitlab\b/],
  ['trabalho', 'Notion', /\bnotion\b/],
  ['trabalho', 'Trello', /\btrello\b/],
  ['trabalho', 'Figma', /\bfigma\b/],
  ['trabalho', 'Linear', /\blinear\b/],
  ['trabalho', 'Google Docs', /documentos google|google docs|planilhas google|google sheets|apresentacoes google|google slides/],
  ['trabalho', 'LinkedIn', /\blinkedin\b/],
  ['trabalho', 'Stack Overflow', /stack ?overflow/],
  ['rede', 'Reddit', /\breddit\b/],
  ['rede', 'X', /\/ x$|\bx\.com\b|\btwitter\b/],
  ['rede', 'Instagram', /\binstagram\b/],
  ['rede', 'TikTok', /\btiktok\b/],
  ['rede', 'Facebook', /\bfacebook\b/],
  ['rede', 'Bluesky', /\bbluesky\b/],
  ['rede', 'WhatsApp', /\bwhatsapp\b/],
  ['rede', 'Discord', /\bdiscord\b/],
  ['compras', 'Amazon', /\bamazon\b/],
  ['compras', 'Mercado Livre', /mercado ?livre/],
  ['compras', 'Shopee', /\bshopee\b/],
  ['compras', 'AliExpress', /aliexpress/],
  ['compras', 'Shein', /\bshein\b/],
  ['leitura', 'Wikipédia', /wikipedia|wikipédia/],
  ['leitura', 'AO3', /archive of our own|\bao3\b/],
  ['leitura', 'Wattpad', /\bwattpad\b/],
  ['leitura', 'MangaDex', /mangadex/],
  ['leitura', 'Medium', /\bmedium\b/],
];

/** apps fora do navegador, pela classe da janela */
const APPS: Array<[CategoriaWeb, string, RegExp]> = [
  ['obsidian', 'Obsidian', /obsidian/i],
  ['rede', 'Discord', /discord|vesktop|webcord|armcord/i],
  ['rede', 'Telegram', /telegram/i],
  ['rede', 'WhatsApp', /whatsapp|zapzap/i],
  ['musica', 'Spotify', /spotify/i],
  ['trabalho', 'VS Code', /^code|codium|vscodium|cursor|zed/i],
  ['trabalho', 'JetBrains', /jetbrains|idea|pycharm|webstorm|clion|rider|goland/i],
  ['trabalho', 'LibreOffice', /libreoffice|soffice/i],
  ['trabalho', 'Zoom', /^zoom/i],
  ['ia', 'ChatGPT', /chatgpt/i],
];

/** Lê a janela em foco. Null = nada a comentar (o próprio Tanden, terminal, um app qualquer). */
export function lerJanela(titulo: string, app: string): Pagina | null {
  if (!titulo && !app) return null;
  if (/tanden/i.test(app)) return null;
  const navegador = NAVEGADOR_APP.test(app) || NAVEGADOR_SUFIXO.test(titulo);
  if (!navegador) {
    const a = APPS.find(([, , re]) => re.test(app));
    return a ? { categoria: a[0], site: a[1], pagina: titulo.slice(0, 80), navegador: false } : null;
  }
  // "(3) Vídeo legal - YouTube — Mozilla Firefox" → "Vídeo legal"
  const semNav = titulo.replace(NAVEGADOR_SUFIXO, '').replace(/^\(\d+\+?\)\s*/, '').trim();
  const d = dobrar(semNav);
  const s = SITES.find(([, , re]) => re.test(d));
  if (!s) return null;
  // site adulto: o título da página nunca é guardado nem repetido (nem no traço, nem na notificação)
  if (s[0] === 'adulto') return { categoria: 'adulto', site: s[1], pagina: '', navegador: true };
  const pagina = semNav.replace(new RegExp(`\\s*[—–|•·-]\\s*${s[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').replace(/\s*[—–|-]\s*(YouTube|Twitch|Google Classroom|Reddit)\s*$/i, '').trim();
  return { categoria: s[0], site: s[1], pagina: pagina.slice(0, 80), navegador: true };
}

const DISTRAI = new Set<CategoriaWeb>(['video', 'live', 'rede', 'jogos', 'compras', 'adulto']);

/** Soma o tempo do dia por categoria (zera na virada do dia). */
export function contarWeb(s: AnimaState, cat: CategoriaWeb, ms: number, now: number): AnimaState {
  const d = new Date(now);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const w = s.memoria.cerebro.web;
  const min = { ...(w.dia === dia ? w.minutos : {}) };
  min[cat] = (min[cat] ?? 0) + ms / 60_000;
  return { ...s, memoria: { ...s.memoria, cerebro: { ...s.memoria.cerebro, web: { dia, minutos: min } } } };
}

export function reagirWeb(estado: AnimaState, p: Pagina, ctx: CtxJogo): { estado: AnimaState; fala: Fala | null; grupo: string } {
  let s = estado;
  const now = ctx.now;
  const min = Math.round(s.memoria.cerebro.web.minutos[p.categoria] ?? 0);
  const prova = s.memoria.cerebro.estudos.find((e) => e.at > now && e.at - now <= 36 * 3_600_000);
  const h = new Date(now).getHours();
  const tarde = sono(now, ctx.rotina).passou || (h >= 1 && h < 5);
  let grupos: string[];
  if (prova && DISTRAI.has(p.categoria)) grupos = ['web.prova'];
  else if (tarde && DISTRAI.has(p.categoria)) grupos = [`web.dormir.${p.categoria}`, 'web.dormir'];
  else if (min >= 120 && DISTRAI.has(p.categoria)) grupos = ['web.muito', `web.${p.categoria}`];
  else if (p.categoria === 'adulto' && min >= 5) grupos = ['web.adulto.denovo', 'web.adulto'];
  else grupos = [`web.${p.categoria}.${dobrar(p.site).replace(/[^a-z0-9]/g, '')}`, `web.${p.categoria}`];
  switch (p.categoria) {
    case 'ia':
      s = mexer(s, { ciume: ctx.intensidade === 1 ? 10 : 20, afeto: -2 });
      s = { ...s, memoria: { ...s.memoria, outrasIAs: s.memoria.outrasIAs + 1, ultimaIA: p.site } };
      break;
    case 'adulto': s = mexer(s, { ciume: ctx.intensidade === 1 ? 8 : 18 }); break;
    case 'rede': s = mexer(s, { ciume: 2 }); break;
    case 'estudo': case 'trabalho': s = mexer(s, { afeto: 1 }); break;
    case 'obsidian': s = mexer(s, { ciume: 12 }); break;
    default: break;
  }
  const humor = humorDe(s, now, ctx.intensidade);
  const vars = {
    nome: ctx.nome, site: p.site, pagina: p.pagina || p.site, ia: p.site, minutos: min, tempo: min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : min === 1 ? '1 minuto' : `${min} minutos`,
    titulo: prova?.titulo, assunto: prova?.assunto ?? prova?.titulo.toLowerCase(), acorda: ctx.rotina?.acordaAs ?? '06:00',
  };
  let fala: Fala | null = null;
  let grupo = grupos[0]!;
  for (const g of grupos) {
    fala = escolher(g, s, humor, ctx, vars);
    if (fala) {
      grupo = g;
      break;
    }
  }
  if (fala) {
    fala = botoes(temperar(fala, ctx), ctx);
    s = { ...lembrar(s, fala), falou: now };
  }
  return { estado: s, fala, grupo };
}

/**
 * Você saiu do site adulto: ela "tira as mãos dos olhos" (nem sempre fala).
 * `minutos` = quanto tempo a aba ficou na tela.
 */
export function saiuDoAdulto(estado: AnimaState, minutos: number, ctx: CtxJogo): { estado: AnimaState; fala: Fala | null } {
  let s = estado;
  if (ctx.rand() > 0.6) return { estado: s, fala: null };
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  let fala = escolher('web.adulto.saiu', s, humor, ctx, { nome: ctx.nome, tempo: minutos >= 1 ? (Math.round(minutos) === 1 ? '1 minuto' : `${Math.round(minutos)} minutos`) : 'uns segundos', minutos: Math.round(minutos) });
  if (fala) {
    fala = botoes(fala, ctx);
    s = { ...lembrar(s, fala), falou: ctx.now };
  }
  return { estado: s, fala };
}
