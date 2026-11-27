/*
 * Música: ela ouve junto. O app lê a faixa tocando no programa do Spotify
 * (ou outro player) pelo lado nativo, sem precisar da janela em foco, e ela
 * comenta de vez em quando: o artista que é a cara dela, anime, música
 * triste, a mesma música pela quinta vez hoje, música de amor (pra quem?),
 * e madrugada com fone no ouvido.
 *
 * Ela também conta: quantas vezes cada faixa tocou hoje e quantas faixas de
 * cada artista já passaram (o mais ouvido vira "o seu artista").
 */
import { humorDe, mexer, type AnimaState } from '../estado';
import { botoes, escolher, lembrar, temperar, type Fala } from '../motor';
import { sono, type CtxJogo } from './jogos';
import { dobrar } from './texto';

export interface Faixa {
  /** "spotify", "vlc"... */
  player: string;
  artista: string;
  titulo: string;
  album: string;
  /** muda a cada música */
  id: string;
  tocando: boolean;
  duracao_ms?: number;
}

export type EstiloMusica = 'dela' | 'anime' | 'metal' | 'triste' | 'rap' | 'funk' | 'sertanejo' | 'eletronica' | 'lofi' | 'kpop' | 'classica' | 'pop' | 'rock' | 'indie' | 'mpb';

/** pelo artista (dobrado: sem acento, minúsculo). A ordem importa: o primeiro que casar vence. */
const ARTISTAS: Array<[EstiloMusica, RegExp]> = [
  ['dela', /\b(the cure|siouxsie|bauhaus|joy division|sisters of mercy|type o negative|lebanon hanover|molchat doma|boy harsher|chelsea wolfe|cocteau twins|deftones|evanescence|depeche mode|the smiths|interpol|cold cave|she past away|drab majesty|ghost|lacrimosa|killing joke|gang of four|the mission|and also the trees|mr\.? kitty|christian death|clan of xymox|she wants revenge|in this moment|bring me the horizon|my chemical romance|nine inch nails|marilyn manson|lana del rey|mitski|radiohead|massive attack|portishead|sleep token|crystal castles|grimes|billie eilish|placebo|hole|garbage|the neighbourhood|vv|poppy|zeal & ardor|zeal and ardor|florence \+ the machine|florence and the machine|fka twigs|poison the well|she's in parties|the damned|alvvays|beach house|have a nice life|slowdive|my bloody valentine|jesus and mary chain|the jesus and mary chain|peter murphy|fields of the nephilim|gary numan|ministry|front 242|vnv nation|covenant|kmfdm|rosa crux|cigarettes after sex)\b/],
  ['anime', /\b(lisa|aimer|yoasobi|ado|kenshi yonezu|eve|radwimps|king gnu|vaundy|reol|zutomayo|zutto mayonaka|mrs\.? green apple|official hige dandism|higedan|claris|asca|kana-boon|ling tosite sigure|supercell|egoist|granrodeo|trysail|sakanaction|back number|bump of chicken|mafumafu|kasane teto|kikuo|wowaka|deco\*27|syudou|chinozo|kanaria|orangestar|linked horizon|sawano|hiroyuki sawano|yuki kajiura|kalafina|fripside|man with a mission|spyair|uverworld|one ok rock|tk from ling tosite sigure|myth & roid|minami|milet|tuyu|yorushika|aimyon|fujii kaze|kenshi|hatsune miku|kaf)\b/],
  ['metal', /\b(metallica|slipknot|iron maiden|sepultura|megadeth|black sabbath|system of a down|korn|gojira|avenged sevenfold|pantera|slayer|lamb of god|trivium|bullet for my valentine|parkway drive|architects|motionless in white|babymetal|nightwish|within temptation|epica|rammstein)\b/],
  ['kpop', /\b(bts|blackpink|twice|stray kids|newjeans|aespa|le sserafim|ive|seventeen|txt|enhypen|itzy|red velvet|exo|nct|ateez|g-?idle)\b/],
  ['rap', /\b(kendrick lamar|drake|travis scott|kanye|eminem|tyler,? the creator|j\. ?cole|21 savage|playboi carti|racionais|matue|teto|wiu|filipe ret|djonga|bk|baco exu do blues|emicida|criolo|orochi|veigh|kayblack|tz da coronel|ret)\b/],
  ['funk', /\b(mc |anitta|ludmilla|pedro sampaio|kevin o chris|dj )/],
  ['sertanejo', /\b(marilia mendonca|henrique e juliano|jorge e mateus|gusttavo lima|ze neto|maiara e maraisa|luan santana|ana castela|simone mendes|lauana prado|matheus e kauan|wesley safadao)\b/],
  ['eletronica', /\b(daft punk|deadmau5|skrillex|avicii|calvin harris|martin garrix|alok|vintage culture|porter robinson|madeon|justice|aphex twin|boards of canada|fred again|peggy gou|disclosure|odesza|flume)\b/],
  ['lofi', /\b(lofi|lo-fi|chillhop|nujabes|idealism|jinsang|tomppabeats|potsu|kudasai)\b/],
  ['classica', /\b(chopin|mozart|bach|beethoven|debussy|satie|vivaldi|tchaikovsky|rachmaninoff|liszt|ludovico einaudi|hans zimmer|joe hisaishi|max richter|olafur arnalds|yiruma)\b/],
  ['rock', /\b(arctic monkeys|nirvana|foo fighters|queen|led zeppelin|pink floyd|the strokes|green day|blink-?182|paramore|linkin park|red hot chili peppers|oasis|the killers|legiao urbana|legião urbana|barao vermelho|cazuza|raimundos|charlie brown jr|capital inicial|paralamas|titas|skank|nenhum de nos|engenheiros do hawaii|pitty|detonautas|pearl jam|soundgarden|ac\/dc|guns n' roses|the rolling stones|the beatles|david bowie|fall out boy|twenty one pilots|my morning jacket|wolf alice|royal blood)\b/],
  ['indie', /\b(tame impala|the 1975|clairo|phoebe bridgers|lorde|girl in red|beabadoobee|boygenius|big thief|bon iver|fleet foxes|men i trust|mac demarco|angel olsen|japanese breakfast|snail mail|soccer mommy|wallows|dayglow|rex orange county|gus dapperton|conan gray|the marias|cavetown|d4vd|sombr|keshi|laufey|beach bunny|weyes blood|lucy dacus|lizzy mcalpine)\b/],
  ['mpb', /\b(caetano veloso|gilberto gil|chico buarque|djavan|milton nascimento|gal costa|maria bethania|elis regina|tim maia|jorge ben|seu jorge|marisa monte|rita lee|os mutantes|novos baianos|tom jobim|joao gilberto|vinicius de moraes|cassia eller|ana carolina|liniker|tulipa ruiz|marina lima|cartola|zeca pagodinho|ze ramalho|alceu valenca|luiz gonzaga)\b/],
  ['pop', /\b(taylor swift|dua lipa|ariana grande|olivia rodrigo|sabrina carpenter|the weeknd|harry styles|ed sheeran|bruno mars|doja cat|lady gaga|rihanna|beyonce|katy perry|charli xcx|chappell roan|sza|pabllo vittar|luisa sonza|iza)\b/],
];

/** no título (ou no álbum), quando o artista não diz nada */
const TITULO: Array<[EstiloMusica, RegExp]> = [
  ['lofi', /\blo-?fi\b|chill beats|beats to (study|relax)/],
  ['anime', /\bopening\b|\bending\b|\bop\b ?\d|\bed\b ?\d|\banime\b|\bost\b/],
  ['triste', /\b(sad|cry|crying|tears|alone|lonely|goodbye|broken|hurt|pain|die|dead|death|funeral|empty|triste|chorar|choro|lagrima|sozinh[oa]|saudade|adeus|dor|vazio|morrer|solidao)\b/],
];

const AMOR = /\b(love|lover|heart|kiss|baby|darling|crush|amor|coracao|beijo|paixao|te amo|apaixonad[oa]|namorad[oa])\b/;

/** O estilo da faixa, se der para dizer. */
export function estiloDe(f: Pick<Faixa, 'artista' | 'titulo' | 'album'>): EstiloMusica | null {
  const a = dobrar(f.artista);
  const hit = ARTISTAS.find(([, re]) => re.test(a));
  if (hit) return hit[0];
  const t = dobrar(`${f.titulo} ${f.album}`);
  return TITULO.find(([, re]) => re.test(t))?.[0] ?? null;
}

const diaDe = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** O primeiro artista da lista ("LiSA, Aimer" → "LiSA"). */
const principal = (artista: string) => artista.split(/,|&| feat\.? | ft\.? /i)[0]!.trim() || artista;

/**
 * Conta a faixa (uma vez por música que começa): vezes hoje e faixas do
 * artista. Chamar só quando o `id` muda.
 */
export function contarFaixa(s: AnimaState, f: Faixa, now: number): AnimaState {
  const m = s.memoria.cerebro.musica;
  const dia = diaDe(now);
  const faixas = { ...(m.dia === dia ? m.faixas : {}) };
  faixas[f.id] = (faixas[f.id] ?? 0) + 1;
  const art = principal(f.artista);
  let artistas = { ...m.artistas, [art]: (m.artistas[art] ?? 0) + 1 };
  // não cresce sem limite: fica com os 200 mais ouvidos
  if (Object.keys(artistas).length > 200) artistas = Object.fromEntries(Object.entries(artistas).sort((a, b) => b[1] - a[1]).slice(0, 200));
  return { ...s, memoria: { ...s.memoria, cerebro: { ...s.memoria.cerebro, musica: { dia, faixas, artistas } } } };
}

/** O artista mais ouvido, se já tiver faixas o bastante. */
export function artistaFavorito(s: AnimaState): { nome: string; faixas: number } | null {
  const top = Object.entries(s.memoria.cerebro.musica.artistas).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 25 ? { nome: top[0], faixas: top[1] } : null;
}

export interface ReacaoMusica {
  estado: AnimaState;
  fala: Fala | null;
  grupo: string;
  estilo: EstiloMusica | null;
}

/** Ela comenta a faixa que está tocando (o app decide quando: não é a cada música). */
export function reagirMusica(estado: AnimaState, f: Faixa, ctx: CtxJogo): ReacaoMusica {
  let s = estado;
  const now = ctx.now;
  const estilo = estiloDe(f);
  const artista = principal(f.artista);
  const vezes = s.memoria.cerebro.musica.dia === diaDe(now) ? s.memoria.cerebro.musica.faixas[f.id] ?? 1 : 1;
  const fav = artistaFavorito(s);
  const h = new Date(now).getHours();
  const tarde = sono(now, ctx.rotina).passou || (h >= 1 && h < 5);
  const amor = AMOR.test(dobrar(f.titulo));
  const grupos: string[] = [];
  if (vezes >= 3) grupos.push('musica.repete');
  if (tarde) grupos.push('musica.madrugada');
  if (fav && fav.nome === artista && ctx.rand() < 0.35) grupos.push('musica.favorito');
  if (amor && ctx.rand() < 0.5) grupos.push('musica.amor');
  if (estilo && ctx.rand() < 0.75) grupos.push(`musica.estilo.${estilo}`);
  // detalhes da faixa e da hora: variam o que ela diz sem depender só do estilo
  const longa = (f.duracao_ms ?? 0) >= 7 * 60_000;
  const curta = (f.duracao_ms ?? 0) > 0 && (f.duracao_ms ?? 0) <= 100_000;
  if (longa && ctx.rand() < 0.6) grupos.push('musica.longa');
  if (curta && ctx.rand() < 0.6) grupos.push('musica.curta');
  if (/,|&| feat\.? | ft\.? /i.test(f.artista) && ctx.rand() < 0.4) grupos.push('musica.feat');
  if (h >= 5 && h < 11 && ctx.rand() < 0.4) grupos.push('musica.manha');
  if (h >= 19 && h < 23 && ctx.rand() < 0.4) grupos.push('musica.noite');
  grupos.push('musica.faixa');
  if (estilo === 'dela') s = mexer(s, { afeto: 2 });
  if (amor) s = mexer(s, { ciume: ctx.intensidade === 1 ? 2 : 5 });
  const humor = humorDe(s, now, ctx.intensidade);
  const vars = { nome: ctx.nome, artista, musica: f.titulo, album: f.album || f.titulo, vezes, faixas: fav?.faixas ?? 0 };
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
  return { estado: s, fala, grupo, estilo };
}
