/*
 * Modelos para começar: uma nota de regras comentada e um banco de textos.
 * Pensados para indivíduos e histórias: cobiça, roubo, rancor, vingança e
 * encontros que acontecem de vez em quando.
 */

export function rulesExample(world: string): string {
  return `---
tags: [regras]
---
# Regras de ${world}

Estas regras rodam na **Simulação** e nos botões das fichas. Os textos sorteados
vêm de [[Textos]] (qualquer nota com \`tipo: tabela\` serve de banco).

\`\`\`regras
# ── Estruturas de dados ─────────────────────────────────
tipo relíquia "Relíquia" "Relíquias":
  símbolo ✶
  campo dono
  campo valor = 10
  extra maldição

# ── Campos calculados (aparecem na ficha) ───────────────
calcular idade em personagem = ano - nascimento

# ── Ações: botões na ficha ──────────────────────────────
ação "Treinar" em personagem:
  habilidade += 1
  crônica "{personagem} treina até a exaustão (habilidade {habilidade})."

# ── Acontecimentos ocasionais ───────────────────────────
interação "Encontro na estrada" de viajante em personagem:
  chance = 6%
  crônica tabela("Encontros")

# ── Indivíduos que se atraem pelo que o outro tem ───────
interação "Cobiça" entre ladrão em personagem, vítima em personagem onde vítima.tesouro existe e ladrão.tesouro não existe e ladrão.ambição maior que 5:
  atração = ladrão.ambição + vítima.tesouro.valor / 10
  chance = 15%
  seja coisa = vítima.tesouro
  coisa.dono = ladrão
  ladrão.tesouro = coisa
  vítima.tesouro = vazio
  liga vítima, "inimigos", ladrão
  crônica tabela("Roubos")
  disparar roubo(ladrão, vítima, coisa)

# ── Eventos em cadeia ───────────────────────────────────
quando roubo(ladrão, vítima, coisa):
  vítima.rancor += 2
  se vítima.rancor pelo menos 4:
    disparar vingança(vítima, ladrão)

quando vingança(quem, alvo):
  se dado("1d20") + quem.habilidade > 12:
    alvo.ferido = sim
    crônica "{quem} encontra {alvo} e cobra a dívida."
  senão:
    crônica "{quem} tenta se vingar de {alvo}, e falha."
\`\`\`
`;
}

export function textBankExample(): string {
  return `---
tipo: tabela
---
# Textos

Bancos de texto das regras. Cada lista debaixo de um título é sorteada por
\`tabela("Título")\`. Use {nome} para as variáveis da regra, {1d6} para dados
e {@Outro título} para sortear em outro banco.

## Encontros

- {viajante} cruza com um mercador que vende mapas de lugares que não existem.
- Uma tempestade obriga {viajante} a dividir abrigo com {@Estranhos}.
- {viajante} encontra {1d4+1} corpos na beira da estrada, todos com a mesma tatuagem.
- Um velho reconhece {viajante} de uma vida que {viajante} jura nunca ter vivido.

## Estranhos

- uma caçadora de recompensas calada
- dois monges que discutem sem parar
- uma criança que sabe nomes demais

## Roubos

- {ladrão} some na noite com {coisa}, e {vítima} jura vingança.
- {vítima} acorda e {coisa} não está mais lá. {ladrão} sorri de longe.
- Ninguém viu {ladrão} entrar. Mas {coisa} agora pesa no cinto errado.
`;
}
