import { hashHex } from '../../hash';
import type { RollTable } from '../../rpg/tables';
import { asText, bodyOf, parseProps } from '../frontmatter';
import type { World } from '../mundo';
import type { Program } from '../regras/parse';
import { MOTOR_VERSAO, Vidas } from './motor';
import { anoDe, dataTexto, type Laco, type Pessoa, type Registro } from './tipos';

/*
 * A simulação vive numa nota comum (`tipo: simulação`), dentro da pasta do
 * mundo. Ela não guarda a história inteira (que mudaria a cada mês e incharia
 * o histórico de sincronização): guarda o elenco do primeiro mês, a semente e
 * as suas intervenções. Ao abrir, o Tanden refaz os meses. O texto é escrito
 * com um item por linha, então cada intervenção nova é uma linha a mais.
 */

export interface SimSave {
  versao: number;
  nome: string;
  mundo: string;
  semente: number;
  /** mês inicial */
  inicio: number;
  lugar: string;
  /** meses já simulados */
  meses: number;
  /** impressão digital das regras do mundo quando a simulação começou */
  regras: string;
  elenco: Pessoa[];
  lacos: Laco[];
  registro: Registro[];
}

/** Impressão digital das regras do mundo (para avisar quando elas mudaram). */
export const regrasHash = (w: World): string => hashHex((w.scripts ?? []).map((s) => s.code).join('\n---\n'));

export function simNoteText(sv: SimSave, w?: World): string {
  const lugar = w?.entities.find((e) => e.path === sv.lugar);
  const json = [
    '{',
    `"versao": ${sv.versao}, "regras": ${JSON.stringify(sv.regras)}, "inicio": ${sv.inicio}, "lugar": ${JSON.stringify(sv.lugar)},`,
    '"elenco": [',
    sv.elenco.map((p) => JSON.stringify(p)).join(',\n'),
    '],',
    '"lacos": [',
    sv.lacos.map((l) => JSON.stringify(l)).join(',\n'),
    '],',
    '"registro": [',
    sv.registro.map((r) => JSON.stringify(r)).join(',\n'),
    ']',
    '}',
  ].join('\n');
  return `---
tipo: simulação
mundo: ${sv.mundo}
semente: ${sv.semente}
início: ${anoDe(sv.inicio)}
lugar: ${lugar ? `"[[${lugar.name}]]"` : JSON.stringify(sv.lugar)}
meses simulados: ${sv.meses}
---
# ${sv.nome}

Simulação de vidas de [[${sv.mundo}]], a partir de ${dataTexto(sv.inicio)}, com ${sv.elenco.length} ${sv.elenco.length === 1 ? 'pessoa' : 'pessoas'} no começo. Abra em **Mundos › Simulação › Vidas**.

> [!nota] Como funciona
> A história é refeita a partir da semente, do elenco inicial e das suas intervenções (o bloco abaixo). Mudar o bloco à mão muda a história. Para fixar o que aconteceu, use **Gravar nas fichas** ou **Salvar crônica**.

\`\`\`vidas
${json}
\`\`\`
`;
}

/** Lê a nota da simulação (ou null, se não for uma). */
export function readSim(path: string, text: string): SimSave | null {
  if (!text.startsWith('---')) return null;
  const props = parseProps(text);
  const tipo = asText(props['tipo']).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  if (tipo !== 'simulacao') return null;
  const body = bodyOf(text);
  const m = /```vidas\s*\n([\s\S]*?)\n```/.exec(body);
  if (!m) return null;
  let data: { versao?: number; regras?: string; inicio?: number; lugar?: string; elenco?: Pessoa[]; lacos?: Laco[]; registro?: Registro[] };
  try {
    data = JSON.parse(m[1]!) as typeof data;
  } catch {
    return null;
  }
  const titulo = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? path.split('/').pop()!.replace(/\.md$/, '');
  const num = (k: string) => Number(asText(props[k]).replace(',', '.'));
  return {
    versao: data.versao ?? MOTOR_VERSAO,
    nome: titulo,
    mundo: asText(props['mundo']).replace(/^\[\[|\]\]$/g, ''),
    semente: num('semente') || 1,
    inicio: data.inicio ?? (num('início') || 0) * 12,
    lugar: data.lugar ?? asText(props['lugar']).replace(/^\[\[|\]\]$/g, ''),
    meses: Math.max(0, Math.round(num('meses simulados') || 0)),
    regras: data.regras ?? '',
    elenco: data.elenco ?? [],
    lacos: data.lacos ?? [],
    registro: data.registro ?? [],
  };
}

export interface Abertura {
  sim: Vidas;
  /** avisos para mostrar (regras mudaram, motor novo...) */
  avisos: string[];
}

/** Abre uma simulação salva: monta o elenco e refaz os meses com as intervenções. */
export function abrirSim(sv: SimSave, w: World, opts: { rules?: Program | null; tables?: RollTable[]; positions?: Map<string, { x: number; y: number }> } = {}): Abertura {
  const sim = new Vidas(w, { nome: sv.nome, semente: sv.semente, inicio: sv.inicio, lugar: sv.lugar }, { pessoas: sv.elenco, lacos: sv.lacos }, { ...opts, registro: sv.registro });
  sim.avancar(sv.meses);
  sim.aplicarPendentes();
  const avisos: string[] = [];
  if (sv.regras && sv.regras !== regrasHash(w)) avisos.push('As regras do mundo mudaram desde o começo desta simulação; a história foi refeita com as regras de agora e pode ter mudado.');
  if (sv.versao !== MOTOR_VERSAO) avisos.push('Esta simulação foi feita com outra versão do Tanden; a história pode ter mudado um pouco.');
  if (sim.t - sv.inicio < sv.meses) avisos.push(`A história parou antes do esperado (${sim.t - sv.inicio} de ${sv.meses} meses): ${sim.decisoes.length ? 'há uma decisão esperando' : 'não sobrou ninguém vivo'}.`);
  return { sim, avisos };
}

/** O estado atual para gravar (o elenco do começo não muda; o registro e os meses, sim). */
export function saveDe(sim: Vidas, base: Pick<SimSave, 'elenco' | 'lacos' | 'regras'>): SimSave {
  return {
    versao: MOTOR_VERSAO, nome: sim.cfg.nome, mundo: sim.world.name, semente: sim.cfg.semente, inicio: sim.cfg.inicio, lugar: sim.cfg.lugar,
    meses: sim.t - sim.cfg.inicio, regras: base.regras, elenco: base.elenco, lacos: base.lacos, registro: sim.registro,
  };
}

/** A crônica da simulação como nota. */
export function cronicaMarkdown(sim: Vidas, minPeso = 2): string {
  const linhas = ['---', `mundo: ${sim.world.name}`, `de: ${anoDe(sim.cfg.inicio)}`, `até: ${anoDe(sim.t)}`, 'tags: [simulação, vidas]', '---',
    `# ${sim.cfg.nome}: crônica (${anoDe(sim.cfg.inicio)}–${anoDe(sim.t)})`, '', '> [!nota] Simulação', `> Gerada pelo Tanden (semente ${sim.cfg.semente}). Não é cânone até você decidir que é.`, ''];
  let ano: number | null = null;
  for (const e of sim.eventos) {
    if (e.peso < minPeso) continue;
    const a = anoDe(e.t);
    if (a !== ano) {
      ano = a;
      linhas.push('', `## ${a}`, '');
    }
    linhas.push(`- ${sim.data(e.t).split(' ')[0]}: ${e.texto}`);
  }
  linhas.push('', '## Quem vive', '');
  for (const p of sim.vivos().sort((x, y) => x.nasc - y.nasc)) linhas.push(`- [[${p.nome}]], ${sim.idade(p)} anos${p.prof ? `, ${sim.nomeProf(p)}` : ''}`);
  return `${linhas.join('\n')}\n`;
}
