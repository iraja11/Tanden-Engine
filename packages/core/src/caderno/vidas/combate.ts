import type { Vidas } from './motor';
import type { Pessoa } from './tipos';

/*
 * Combate entre pessoas: briga de taverna, duelo, emboscada na estrada.
 *
 * Cada lado tem um vigor (começa em 100) e rola ataques por rodadas. O ataque
 * soma combate, força e agilidade (dos genes, da idade e do treino), traços
 * (veterano, corajoso, caolho...) e sorte. O covarde foge quando o vigor cai.
 * O modo diz o quanto é letal: briga raramente mata, duelo às vezes, emboscada
 * com frequência. Ferimentos graves deixam marcas (cicatriz, manco, caolho).
 */

export type Modo = 'briga' | 'duelo' | 'emboscada';

export interface Resultado {
  /** quem venceu (null = bandidos, na estrada) */
  venceu: string | null;
  perdeu: string | null;
  morto: string | null;
  fugiu: string | null;
  marcas: Array<{ id: string; marca: string }>;
}

const LETAL: Record<Modo, number> = { briga: 0.012, duelo: 0.22, emboscada: 0.3 };

function poder(s: Vidas, p: Pessoa): number {
  const a = s.atrib(p);
  let bonus = 0;
  for (const t of p.tracos) bonus += s.cat.tracos.get(t)?.combate ?? 0;
  const saude = p.saude < 50 ? -6 : 0;
  return s.habilidade(p, 'combate') * 2 + a.forca * 18 + a.agilidade * 10 + bonus + saude + (s.crianca(p) ? -15 : 0);
}

/** Luta entre `a` e `b` (b = null: bandidos na estrada). Escreve na crônica e devolve o resultado. */
export function lutar(s: Vidas, a: Pessoa, b: Pessoa | null, modo: Modo): Resultado {
  const res: Resultado = { venceu: null, perdeu: null, morto: null, fugiu: null, marcas: [] };
  const pa = poder(s, a) + (modo === 'emboscada' && b ? 10 : 0);
  const pb = b ? poder(s, b) : 18 + s.entre(0, 20);
  let va = 100;
  let vb = 100;
  for (let r = 0; r < 6 && va > 0 && vb > 0; r++) {
    const ga = pa + s.entre(0, 30);
    const gb = pb + s.entre(0, 30);
    if (ga >= gb) vb -= 15 + (ga - gb) / 2;
    else va -= 15 + (gb - ga) / 2;
    // o covarde corre
    if (va < 55 && a.tracos.includes('covarde') && s.chance(0.5)) {
      res.fugiu = a.id;
      va = 0;
    } else if (b && vb < 55 && b.tracos.includes('covarde') && s.chance(0.5)) {
      res.fugiu = b.id;
      vb = 0;
    }
  }
  const aVence = va > vb;
  const ven = aVence ? a : b;
  const per = aVence ? b : a;
  res.venceu = ven?.id ?? null;
  res.perdeu = per?.id ?? null;
  for (const p of [a, b]) {
    if (!p) continue;
    s.xp(p, 'lutas');
    s.sobe(p, 'combate', 0.3);
    // depois de uma briga, os ânimos esfriam por uns meses
    p.estados['brigou'] = s.t + 8;
  }
  if (ven) s.xp(ven, 'vitorias');

  // ferimentos e morte de quem perdeu (e às vezes de quem ganhou)
  const letal = LETAL[modo] * s.ajustes.violencia * (per && per.tracos.includes('sangue fraco') ? 2 : 1);
  if (per && !per.protegido && res.fugiu !== per.id && s.chance(letal)) {
    res.morto = per.id;
  } else if (per && s.chance(modo === 'briga' ? 0.18 : 0.5)) {
    const m = s.ferir(per, modo !== 'briga');
    if (m) res.marcas.push({ id: per.id, marca: m });
  }
  if (ven && s.chance(modo === 'briga' ? 0.05 : 0.2)) {
    const m = s.ferir(ven, false);
    if (m) res.marcas.push({ id: ven.id, marca: m });
  }

  // crônica e memórias
  const marca = (id: string) => {
    const m = res.marcas.find((x) => x.id === id);
    const p = s.pessoa(id);
    return m && p ? ` (fica com ${m.marca === 'cicatriz' ? 'uma cicatriz' : s.nomeTraco(p, m.marca)})` : '';
  };
  if (!b) {
    if (aVence) s.say('vida', 'bandidos', `Bandidos atacam ${s.L(a.id)} na estrada, e levam a pior${marca(a.id)}.`, [a.id], 2);
    else if (res.morto) s.say('vida', 'bandidos', `Bandidos atacam ${s.L(a.id)} na estrada.`, [a.id], 2);
    else {
      const perdeu = Math.round(Math.min(a.dinheiro, 5 + a.dinheiro * 0.5));
      a.dinheiro -= perdeu;
      s.say('vida', 'bandidos', `Bandidos ${res.fugiu ? `fazem ${s.L(a.id)} correr` : `derrotam ${s.L(a.id)}`} na estrada e levam ${perdeu} moedas${marca(a.id)}.`, [a.id], 2);
    }
    if (res.morto) s.morrer(a, 'atacad' + s.g(a, 'o', 'a') + ' por bandidos');
    return res;
  }
  const V = ven!;
  const P = per!;
  const frase = modo === 'briga'
    ? res.fugiu ? `${s.L(a.id)} parte para cima de ${s.L(b.id)}; ${s.L(res.fugiu)} sai correndo.`
      : s.pick([`${s.L(a.id)} e ${s.L(b.id)} saem no braço; ${s.L(V.id)} leva a melhor${marca(P.id)}.`, `Briga feia entre ${s.L(a.id)} e ${s.L(b.id)}: ${s.L(P.id)} acaba no chão${marca(P.id)}.`])
    : modo === 'duelo'
      ? res.fugiu ? `No duelo, ${s.L(res.fugiu)} larga a espada e foge de ${s.L(V.id)}.` : `${s.L(a.id)} e ${s.L(b.id)} se enfrentam em duelo; ${s.L(V.id)} vence${res.morto ? '' : marca(P.id)}.`
      : `${s.L(a.id)} embosca ${s.L(b.id)}; ${aVence ? `${s.L(b.id)} não tem chance${res.morto ? '' : marca(b.id)}` : `${s.L(b.id)} reage e põe ${s.L(a.id)} para correr${marca(a.id)}`}.`;
  s.say('conflito', modo, frase, [a.id, b.id], modo === 'briga' && !res.morto ? 2 : 3);
  s.lembra(P.id, V.id, modo === 'briga' ? 'me surrou' : 'me derrotou', -22, 48);
  s.mexe(P.id, V.id, { respeito: 8 });
  s.mexe(V.id, P.id, { respeito: -6 });
  // quem viu não gosta de quem começou
  for (const x of s.aoRedor(a).slice(0, 8)) {
    if (x === b.id || s.opiniao(x, b.id) < -20) continue;
    s.mexe(x, a.id, { afeto: -2 });
  }
  if (res.fugiu) {
    const f = s.pessoa(res.fugiu)!;
    for (const x of s.aoRedor(f).slice(0, 8)) s.mexe(x, f.id, { respeito: -5 });
  }
  s.emitir(modo, [V.id, P.id]);
  if (res.morto) {
    const m = s.pessoa(res.morto)!;
    s.morrer(m, modo === 'briga' ? `numa briga com ${V.nome}` : modo === 'duelo' ? `em duelo com ${V.nome}` : `numa emboscada de ${a.nome}`);
    // derrubar alguém temido vira lenda
    if (modo !== 'emboscada' && (m.tracos.includes('infame') || m.tracos.includes('cruel') || m.tracos.includes('assassino')) && s.chance(0.5)) s.ganhaTraco(V, 'heroi');
  }
  return res;
}
