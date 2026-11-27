#!/usr/bin/env node
/*
 * Dados sintéticos para a rede da Ânima, destilados de um modelo de linguagem
 * LOCAL (Ollama). Só no treino: nada disto roda no app.
 *
 *   ollama serve &                     (e `ollama pull llama3.1` uma vez)
 *   node scripts/anima-cerebro/parafrasear.mjs [--modelo llama3.1] [--rodadas 3] [--por 25] [--paralelo 3] [--so esclarecer,corrige]
 *
 * A gramática (corpus.ts) ensina cada intenção com as palavras que ela tem. O
 * modelo de linguagem conhece o resto da língua: para cada intenção ele recebe
 * exemplos reais da gramática (sorteados a cada rodada), uma descrição quando o
 * nome não basta e um estilo de escrita diferente por rodada, e devolve frases
 * novas com o mesmo sentido. O resultado vai para `parafrases.tsv` (no git, para
 * o treino ser reproduzível sem GPU), que o `rede.mjs exportar` e o
 * `treinar.mjs` misturam ao corpus.
 *
 * NUNCA mostra os conjuntos de teste (fixtures/anima-intencoes*.txt) ao modelo.
 * Retoma de onde parou: intenções que já têm frases suficientes são puladas.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await import(pathToFileURL(join(ROOT, 'scripts/ts-loader.mjs')).href);
const C = await import(pathToFileURL(join(ROOT, 'packages/core/src/anima/cerebro/corpus.ts')).href);
const MOTOR = await import(pathToFileURL(join(ROOT, 'packages/core/src/anima/motor.ts')).href);

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const MODELO = opt('modelo', 'llama3.1');
const RODADAS = Number(opt('rodadas', 3));
const POR = Number(opt('por', 25));
const PARALELO = Number(opt('paralelo', 3));
const SO = opt('so', '') ? new Set(opt('so', '').split(',')) : null;
const SAIDA = join(dirname(fileURLToPath(import.meta.url)), 'parafrases.tsv');
const URL_OLLAMA = process.env.OLLAMA_HOST ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, '')}` : 'http://127.0.0.1:11434';

/** Onde o nome da intenção não diz o bastante (o resto se explica pelos exemplos). */
const DESCRICAO = {
  'cmd.agenda': 'pedir para ela marcar um compromisso/evento na agenda, com dia e hora',
  'cmd.agenda_ver': 'perguntar o que tem marcado na agenda (hoje, amanhã, semana)',
  'cmd.lembrete': 'pedir para ela lembrar a pessoa de fazer algo num horário (um lembrete, um alarme)',
  'cmd.abrir_nota': 'pedir para abrir uma nota existente do app de notas',
  'cmd.criar_nota': 'pedir para criar uma nota nova no app de notas',
  'cmd.apagar_nota': 'pedir para apagar/deletar uma nota',
  'cmd.buscar': 'pedir para procurar/pesquisar uma palavra nas notas',
  'cmd.ir': 'pedir para ir/abrir uma tela do aplicativo (agenda, flashcards, planilhas...)',
  'cmd.tema': 'pedir para trocar o tema do app (escuro, claro)',
  'cmd.anotar': 'pedir para escrever/anotar um texto na nota do dia',
  'cmd.timer': 'pedir um timer/cronômetro/pomodoro de X minutos',
  'cmd.dado': 'pedir para rolar dados de RPG (d20, 2d6)',
  'cmd.moeda': 'pedir cara ou coroa',
  'cmd.sync': 'pedir para sincronizar as notas com a nuvem',
  'cmd.agua': 'contar que bebeu água / registrar um copo de água',
  'cmd.treinar': 'pedir para ela abrir/começar a tela de exercícios de estudo',
  'cmd.aleatoria': 'pedir para abrir uma nota aleatória',
  'cmd.diario': 'pedir para abrir o diário (de hoje, de ontem)',
  'cmd.som': 'pedir para ligar ou desligar o som dela',
  'cmd.calar': 'pedir para ela ficar quieta/calada por um tempo',
  'cmd.esconder': 'pedir para ela se esconder/sair da tela',
  'cmd.dormir': 'mandar ela dormir/desligar por um tempo',
  'cmd.voltar': 'pedir para ela voltar/aparecer de novo na tela',
  'cmd.mundo': 'pedir para ela escrever algo (lenda, profecia, personagem) no mundo de RPG/world building',
  'cmd.paleta': 'pedir um comando do aplicativo (exportar pdf, modo foco, duplicar nota...)',
  sim: 'responder sim / concordar com uma pergunta, curto', nao: 'responder não / recusar, curto',
  porque: 'perguntar o motivo de algo que ela fez ou disse', insistir: 'insistir num pedido que ela não fez ("faz logo")',
  desfazer: 'pedir para desfazer o que ela acabou de fazer', repetir: 'pedir para repetir / mais uma vez / outra',
  conta: 'pedir uma conta de matemática', hora: 'perguntar as horas', data: 'perguntar a data de hoje',
  lembrar: 'perguntar o que ela lembra sobre a pessoa (nome do pet, onde mora, quem é fulano)',
  sobre_ela: 'perguntar os gostos e opiniões dela (a Ânima)', fato: 'contar um fato sobre si mesmo (nome, cidade, trabalho, pet, gosto)',
  eco: 'comentário qualquer do dia a dia, sem pedido nem emoção forte', etu: 'devolver a pergunta: "e você?"',
  comovai: 'perguntar como ela está', estoubem: 'dizer que está bem', humordela: 'perguntar se ela está brava/triste/com ciúme',
  concorda: 'concordar com o que ela disse', espanto: 'reagir com espanto/surpresa', contamais: 'pedir para ela continuar/contar mais',
  opiniaogeral: 'pedir a opinião dela sobre algo', desabafo: 'pedir para desabafar / pedir ajuda emocional', capacidades: 'perguntar o que ela sabe fazer',
  presenca: 'checar se ela está ali ("tá aí?")', perguntame: 'pedir para ela fazer uma pergunta', surpresa: 'pedir algo aleatório/curiosidade',
  provoca: 'provocar ciúme: falar de outra IA ou de alguém que está ficando/namorando', real: 'perguntar se ela é real/tem sentimentos',
  quem: 'perguntar quem/o que ela é', elogiame: 'pedir para ela elogiar a pessoa', rejeicao: 'ser grosso, mandar ela embora, dizer que é chata',
  desinstalar: 'ameaçar desinstalar/apagar ela', conquistei: 'contar uma conquista (passou, conseguiu, foi aprovado)',
  esclarecer: 'não entender o que ELA acabou de dizer e pedir explicação ("como assim?", "ela quem?", "do que você tá falando?")',
  corrige: 'corrigir algo que ELA disse ou lembrou errado sobre a pessoa ("eu nunca disse isso", "não gosto de X", "você entendeu errado")',
  converter: 'pedir conversão de unidades (km, milhas, celsius, kg, litros, GB)', datas: 'perguntar contagem de dias, que dia cai uma data, quantos anos tem quem nasceu em X',
  'papo.escolhe': 'pedir para ela escolher entre duas opções ("X ou Y?")', 'papo.filosofia': 'pergunta filosófica sobre a vida, morte, existência',
  'papo.corpo': 'perguntar sobre o corpo dela (ela come? dorme? tem rosto?)', 'papo.onde': 'perguntar onde ela mora/está', 'papo.codigo': 'perguntar do código/programação dela',
  'papo.boba': 'chamar ela de boba/bobinha de brincadeira', 'papo.verdade': 'pedir sinceridade/verdade dela', 'papo.promete': 'pedir uma promessa',
  'papo.bravocomela': 'dizer que está bravo/chateado COM ELA', 'papo.perdoo': 'perdoar ela', 'papo.ciumenta': 'perguntar se ela é ciumenta',
  'papo.voltei': 'avisar que voltou/chegou', 'papo.terminei': 'contar que terminou um namoro', 'papo.fracasso': 'sentir que fracassou / não serve pra nada',
  'papo.bebado': 'contar que bebeu / está bêbado', 'papo.tempojuntos': 'perguntar há quanto tempo estão juntos', 'papo.sentiufalta': 'perguntar se ela sentiu falta',
};

const ESTILOS = [
  'do jeito que um brasileiro jovem digita no celular: minúsculas, abreviações (vc, tb, pq, q, mds, slk, tlgd), sem acento, gíria',
  'frases curtas, de 1 a 5 palavras',
  'frases completas e naturais, como numa conversa de verdade, algumas com um pouco de contexto antes do pedido',
  'variando bastante as palavras: sinônimos, expressões regionais do Brasil, jeitos diferentes de dizer a mesma coisa',
  'misturando tons: carinhoso, irritado, brincalhão, cansado; algumas com emoji',
];

let a = 7;
const rand = () => {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function exemplos(rotulo, n) {
  const ms = C.GRAMATICA[rotulo];
  const out = new Set();
  for (let i = 0; i < n * 6 && out.size < n; i++) out.add(C.expandir(ms[Math.floor(rand() * ms.length)], rand).replace(/\s+/g, ' ').trim());
  return [...out];
}

const jaTem = new Map();
if (existsSync(SAIDA)) {
  for (const l of readFileSync(SAIDA, 'utf8').split('\n')) {
    const [r, t] = l.split('\t');
    if (!r || !t) continue;
    if (!jaTem.has(r)) jaTem.set(r, new Set());
    jaTem.get(r).add(t.toLowerCase());
  }
}

async function pedir(rotulo, rodada) {
  const ex = exemplos(rotulo, 9);
  const desc = DESCRICAO[rotulo];
  const estilo = ESTILOS[(rodada + rotulo.length) % ESTILOS.length];
  const prompt = `Você gera dados de treino para entender mensagens em português do Brasil que uma pessoa manda para a Ânima, a namorada virtual dela que vive dentro de um app de notas e agenda.

Intenção: "${rotulo}"${desc ? ` — ${desc}` : ''}.
Exemplos dessa intenção:
${ex.map((e) => `- ${e}`).join('\n')}

Escreva ${POR} mensagens NOVAS e DIFERENTES dos exemplos, com exatamente essa mesma intenção, ${estilo}.
Regras: português do Brasil coloquial; cada mensagem é o que a pessoa digitaria, sozinha, sem aspas nem numeração; não repita os exemplos; não explique nada.
Responda só com JSON: {"frases": ["...", "..."]}`;
  const r = await fetch(`${URL_OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, prompt, format: 'json', stream: false, options: { temperature: 0.95, top_p: 0.95, num_predict: 1400 } }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${await r.text()}`);
  const j = await r.json();
  let lista = [];
  try {
    lista = JSON.parse(j.response).frases ?? [];
  } catch {
    return [];
  }
  return lista.filter((x) => typeof x === 'string');
}

/** Frase que serve: tamanho de mensagem, sem quebra, sem cara de explicação e nunca parecida com crise. */
function limpa(t) {
  const x = t.replace(/^[-•\d.)\s"]+|["\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (x.length < 1 || x.length > 140 || /\n|intenção|exemplo|mensagem:/i.test(x)) return null;
  if (MOTOR.intencaoDe(x) === 'crise') return null;
  return x;
}

const rotulos = C.ROTULOS.filter((r) => !SO || SO.has(r));
const alvo = RODADAS * POR * 0.6;
const fila = rotulos.flatMap((r) => Array.from({ length: RODADAS }, (_, k) => [r, k])).filter(([r]) => (jaTem.get(r)?.size ?? 0) < alvo);
console.log(`${fila.length} pedidos para ${new Set(fila.map(([r]) => r)).size} intenções (${MODELO}, ${PARALELO} em paralelo)`);
const t0 = Date.now();
let feitos = 0, novas = 0;
async function trabalhador() {
  for (;;) {
    const item = fila.shift();
    if (!item) return;
    const [rotulo, rodada] = item;
    let frases = [];
    for (let tent = 0; tent < 3 && !frases.length; tent++) {
      try {
        frases = await pedir(rotulo, rodada + tent * 7);
      } catch (e) {
        console.error(`  ${rotulo}: ${e.message}`);
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    }
    if (!jaTem.has(rotulo)) jaTem.set(rotulo, new Set());
    const vistos = jaTem.get(rotulo);
    const linhas = [];
    for (const f of frases) {
      const x = limpa(f);
      if (!x || vistos.has(x.toLowerCase())) continue;
      vistos.add(x.toLowerCase());
      linhas.push(`${rotulo}\t${x}`);
    }
    if (linhas.length) appendFileSync(SAIDA, `${linhas.join('\n')}\n`);
    novas += linhas.length;
    feitos++;
    if (feitos % 10 === 0) console.log(`  ${feitos} pedidos, ${novas} frases, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await Promise.all(Array.from({ length: PARALELO }, trabalhador));
console.log(`pronto: ${novas} frases novas em ${((Date.now() - t0) / 60000).toFixed(1)} min → ${SAIDA}`);
