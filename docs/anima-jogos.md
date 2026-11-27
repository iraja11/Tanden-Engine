# A Ânima jogando com você: o que vem depois do Minecraft

Estudo de terreno. Nada daqui está implementado ainda; o Minecraft é o modelo
de como fazer ([anima-cerebro.md](anima-cerebro.md#minecraft)). A ideia é
reaproveitar o mesmo desenho em cada jogo novo, sem reinventar nada.

## O desenho que já funciona (e se repete)

```
jogo (mod/script) ──JSON por linha──▶ ponte (Rust, 127.0.0.1 + chave) ──evento──▶ app ──▶ núcleo pensa
        ▲                                                                                   │
        └──────────────────── fala, ação, pedido ◀──────────────────────────────────────────┘
```

- **Quem pensa é o núcleo** (`cerebro/<jogo>.ts`): entende o chat (`entender*`),
  responde a pedidos (`responder*`), reage a eventos (`reagir*`). Puro, testável,
  sem rede. O mod/script só executa e conta o que vê.
- **A ponte** (`src-tauri/src/minecraft.rs`) é genérica no protocolo: porta livre,
  chave nova em `~/.config/tanden/<jogo>.json` (modo 600), primeira linha
  `{"t":"ola","chave":...}`. Para um segundo jogo, o passo é virar
  `ponte.rs` com um nome de jogo por conexão (`{"t":"ola","jogo":"stardew"}`) e
  um evento `jogo` na interface, em vez de copiar o arquivo.
- **Falas** em grupos `<jogo>.*` no cofre (`falas.txt`), com as mesmas regras
  (intensidade, gesto `vazia` = estranha).
- **Memória** por jogo em `memoria.cerebro.<jogo>` (placar, sessões...).

Jogo sem mod (emulador, navegador) usa um **arquivo de eventos** em vez de
socket: o script escreve JSON por linha num arquivo e a ponte só lê. Assim o
Rust continua sem escrever fora do cofre.

## Candidatos

| Jogo | Como ela entra | O que dá para fazer junto | Esforço |
| --- | --- | --- | --- |
| **Stardew Valley** | mod SMAPI (C#) com socket local | companheira que segue, rega, colhe, comenta o dia, presentes, festivais | médio |
| **Street Fighter III: 3rd Strike** | script Lua no FBNeo (o emulador do Fightcade) | treino juntos: ela mede, planeja os treinos e aprende os seus hábitos | médio–alto |
| **Pokémon Showdown** | o simulador open source (`pokemon-showdown`, MIT) rodando local | montar times juntos, batalhar contra ela, ela explica cada turno | médio |
| Terraria | tModLoader (C#) | igual ao Minecraft (briga, faro, chefes) | médio |
| Factorio | mod Lua + RCON | ela vigia a fábrica e avisa do que está faltando | baixo–médio |

### Stardew Valley

- **Caminho:** um mod SMAPI (C#, .NET), o equivalente ao Vanilla Remix. O SMAPI
  dá eventos do dia, do tempo, do inventário, dos amigos e dos presentes; o
  socket local é .NET puro.
- **Corpo dela:** um NPC próprio (sprite + retrato via Content Patcher) que segue
  você. Já existem mods que provam que dá: [NPC Adventures](https://www.curseforge.com/stardewvalley/mods/npc-adventures)
  (companheiros que seguem, só singleplayer) e o framework
  [Custom Companions](https://www.curseforge.com/stardewvalley/mods/custom-companions).
- **"Co-op local" de verdade** (ela controlando um farmhand na tela dividida) é
  muito mais difícil: o farmhand espera input de um jogador. O caminho realista
  é o NPC companheiro no seu save; tela dividida fica para depois, se valer.
- **Ideias:** ela rega um pedaço da plantação, avisa do aniversário dos
  moradores (e tem ciúme de quem você dá presente), comenta a sorte do dia,
  pesca com você, fica na mina com você (e some no andar 100...).

### Street Fighter III: 3rd Strike, aprendendo juntos

- **Caminho:** o FBNeo (o emulador que o Fightcade usa) roda scripts Lua com
  acesso à memória do jogo (Game → Lua Scripting). A comunidade já tem um modo
  treino em Lua para o 3rd Strike (o `3rd_training_lua`, a confirmar a versão
  atual) que lê posição, vida, estado de parry, frame advantage e controla o P2.
  Um script nosso, em cima disso, escreve eventos num arquivo (`parry_tentou`,
  `parry_acertou`, `levou_punicao`, `combo_caiu`, `knockdown`...).
- **O algoritmo de aprender juntos:**
  1. **Árvore de técnicas** por personagem: parry (alto, baixo, vermelho),
     anti-aéreo, hit-confirm, punição, combos, meaty, tech de agarrão.
  2. **Quanto você domina cada uma:** *knowledge tracing* bayesiano (BKT), a
     mesma ideia de tutor inteligente: cada tentativa atualiza a chance de você
     "saber" a técnica, separando acerto de sorte e erro de descuido.
  3. **O que treinar hoje:** repetição espaçada (estilo FSRS/SM-2, como os
     flashcards do Tanden), com o próximo treino de cada técnica marcado pela
     estabilidade dela. A Ânima monta a sessão: "10 min de parry baixo, depois
     punição de shoryuken".
  4. **Ela aprende você:** um modelo de hábitos (cadeia de Markov / n-gramas
     sobre as suas ações por situação: depois de levar knockdown, acordando,
     no canto). Com isso ela controla o P2 e *usa* os seus hábitos contra você,
     e diz quais são: "você sempre pula depois de defender o terceiro golpe".
     Útil, e um pouco assustador.
  5. **Ela aprende junto:** a "habilidade" dela no P2 sobe com você (limite de
     reação e de leitura), para que a luta fique sempre no limite do que você
     aguenta.
- Tudo isso é núcleo puro (`cerebro/sf3/` com BKT, agenda e n-gramas), testável
  sem emulador. O Lua só mede e executa.

### Pokémon Showdown

- **Caminho:** o simulador é open source (MIT) e vem como pacote npm
  (`pokemon-showdown`, ou o `@pkmn/sim`). A API é um stream: você escreve as
  escolhas, lê o protocolo de volta ([SIMULATOR.md](https://github.com/smogon/pokemon-showdown/blob/master/sim/SIMULATOR.md));
  o próprio repositório tem um exemplo de dois bots batalhando. Roda local, sem
  servidor e sem conta.
- **Montar times juntos:** os dados do jogo vêm no pacote (Dex, learnsets,
  validador do formato). Ela propõe times por cobertura de tipos, papéis
  (sweeper, wall, pivot, hazard) e sinergia, e você troca peças; o validador
  garante que o time é legal no formato. Dados de uso da Smogon (estatísticas
  mensais) podem dar o "o que está forte agora".
- **Batalhar:** contra ela (um bot simples primeiro: maior dano esperado,
  trocar quando em desvantagem; depois uma busca de 1–2 turnos), ou os dois
  juntos num formato de dupla, se o formato multi estiver disponível (a
  confirmar no simulador).
- **Onde mora:** o simulador é pesado e de domínio externo; ele vai num módulo
  à parte (worker no app), e o núcleo só recebe o protocolo e decide o que ela
  fala ou escolhe.

## Ordem sugerida

1. Generalizar a ponte (`ponte.rs` + `ola.jogo`), sem mudar nada do Minecraft.
2. **Pokémon Showdown** primeiro: dá para fazer tudo em TypeScript, local, e
   testar sem abrir jogo nenhum.
3. **SF3**: começar só medindo (Lua → arquivo → placar de técnicas), depois a
   agenda de treinos, depois ela no P2.
4. **Stardew**: o mod SMAPI com ela de companheira.
