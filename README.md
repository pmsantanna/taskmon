# Taskmon

Joguinho idle de criaturas que mora na barra de tarefas do Windows. Seu parceiro anda,
encontra criaturas selvagens, batalha sozinho, ganha XP, evolui e captura bichos novos
enquanto você trabalha.

## Rodando

Precisa de [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm start
```

### Atrás do proxy da empresa

O `npm install` do Electron baixa um binário do GitHub, e o proxy corporativo costuma
barrar essa parte. Se travar ou falhar no `electron/install.js`:

```powershell
npm config set proxy http://SEU_PROXY:PORTA
npm config set https-proxy http://SEU_PROXY:PORTA
$env:ELECTRON_GET_USE_PROXY = "true"
$env:GLOBAL_AGENT_HTTPS_PROXY = "http://SEU_PROXY:PORTA"
npm install
```

### Gerar um .exe portátil (opcional)

```bash
npm run dist   # sai em dist/Taskmon x.y.z.exe, não precisa instalar
```

## Como jogar

- **Clique no HUD ou no seu bicho** pra abrir o painel (equipe, caixa, zonas, loja e bestiário).
- **Clique no selvagem** durante a luta pra lançar uma cápsula. Quanto menos HP ele tiver, maior a chance.
- Com a captura automática ligada, ele lança sozinho em espécies que você ainda não tem e em brilhantes.
- **Ícone na bandeja** (perto do relógio): mover a faixa pra esquerda/direita, largura, monitor,
  ficar acima da barra, abrir/recarregar a pasta de sprites, iniciar com o Windows e sair.
- Fechou o app? Ao abrir de novo você ganha o progresso do tempo fora (até 8 h).
- **Golpes**: cada criatura tem até 4, aprendidos por nível. Na aba Equipe, o botão **Golpes**
  troca os ativos (passe o mouse num golpe pra ver os detalhes).
- Brilhantes: 1 em 256. Lendário escondido no Vulcão. 👀

## Batalha

Turnos no estilo clássico: os dois escolhem um golpe, quem tem **prioridade** age primeiro e,
empatando, o mais **rápido**. Os dois lados lutam sozinhos (uma IA pontua os golpes).

- **Físico** (⚔) usa Ataque × Defesa, **Mágico** (✦) usa Magia × Resistência, **Status** (◐) não causa dano.
- Dano: `((2·Nv/5+2)·Poder·A/D)/50+2`, × 1,5 se o golpe é do tipo da criatura, × tipo (2× super efetivo,
  0,5× pouco efetivo), × 1,5 no crítico, × 0,85–1.
- **Crítico** por estágios: 0 → 1/24, 1 → 1/8, 2 → 1/2, 3+ → sempre (dano ×1,5, ignora quedas do
  atacante e subidas do defensor). Golpe de crítico alto +1, Lente de Mira +1, Concentração +2.
- **Acerto**: precisão do golpe × estágios (precisão do atacante − evasão do alvo, de −6 a +6) × itens.
  Golpes sem precisão (em si mesmo, Debater-se) nunca erram.
- **Estágios** de −6 a +6 em Ataque, Defesa, Magia, Resistência, Velocidade, Precisão e Evasão. Zeram no fim da luta.
- **Status**: queimadura (perde 1/16 do HP por turno, golpe físico causa metade), veneno (perde 1/8),
  paralisia (metade da velocidade, 25% de chance de não agir), sono (1 a 3 turnos sem agir).
  Fogo não se queima, Elétrico não paralisa, Planta é imune a pós. O status some depois da batalha.
- **PP**: cada golpe gasta 1. Voltam aos poucos andando e de vez depois de desmaiar. Sem nenhum PP: Debater-se.
- Com 4 golpes e um novo aprendido, troca o mais fraco sozinho (dá pra desligar em Ajustes).

Golpes e quem aprende o quê ficam em `shared/moves.js`.

### IVs e níveis de esforço (como no Legends: Arceus)

- **IV**: 0–31 por atributo, sorteado quando a criatura aparece, nunca muda. No painel (botão
  **Atributos**) aparece como a avaliação do juiz: Nada bom, Razoável, Bom, Muito bom, Fantástico, Perfeito.
- **Nível de esforço**: 0–10 por atributo, no lugar dos EVs. Começa conforme o IV (20+ → 1, 26+ → 2,
  31 → 3) e sobe com os itens de esforço da loja (ou que os selvagens às vezes deixam cair):
  Pó (0–2), Cascalho (3–5), Pedrisco (6–8) e Rocha (9 → 10).
- **Natureza**: as 25 do original; 20 dão +10% num atributo e −10% em outro, 5 são neutras.
- Atributo = `⌊(⌊(2·Base + IV)·Nv/100⌋ + 5) × natureza⌋` (HP: `+ Nv + 10`, sem natureza) + bônus de esforço
  `⌊(round(√Base × M) + Nv) / 2,5⌋`, com M = 0, 2, 3, 4, 7, 8, 9, 14, 15, 16, 25 do nível 0 ao 10.

### Itens de segurar

Cada criatura segura um item (aba Equipe → **Segurando**). Compre na loja; selvagens às vezes
seguram um, que vem junto na captura. Os de uso único valem 1× por batalha e voltam na próxima.

| Item | Efeito |
|---|---|
| Lente de Mira | +1 estágio de crítico |
| Lupa / Pó Brilhante | +10% de precisão / inimigo com −10% |
| Faixa de Força / Óculos Sábios | golpes físicos / mágicos +10% |
| Cinto de Mestre | super efetivos +20% |
| Orbe Vital | dano ×1,3, perde 10% do HP por golpe que acerta |
| Sobras | recupera 1/16 do HP por turno |
| Fita de Foco | com HP cheio, aguenta um golpe fatal com 1 HP |
| Baga da Vida / Baga Curativa | cura 1/4 do HP abaixo da metade / cura status |
| Ovo da Sorte / Moeda da Sorte | +50% de XP / moedas ×2 (líder) |
| Lenço de Seda, Carvão, Gota Mística, Semente Viva, Ímã, Pedra Dura, Pena Afiada | +20% num tipo |

Naturezas e itens ficam em `shared/items.js`.

## Sprites e tiles customizados

Coloque PNGs em `%APPDATA%\taskmon\sprites\` (bandeja → **Abrir pasta de sprites**) ou em
`assets/sprites/` do projeto. Eles substituem a pixel art na hora, sem reiniciar:

| Arquivo | Uso |
|---|---|
| `creatures/<especie>.png` | Criatura olhando pra direita. Animação = quadros lado a lado (ex.: 4×32px = 128×32) |
| `creatures/<especie>_shiny.png` | Brilhante (opcional, senão a cor é girada) |
| `items/capsula.png`, `items/super.png` | Cápsulas |
| `tiles/<zona>_ground.png` | Chão que repete sem fim e rola enquanto o bicho anda |
| `tiles/<zona>_bg.png` | Fundo com parallax. `default_ground/bg.png` valem pra todas as zonas |
| `ui/hud.png`, `ui/toast.png` | Molduras 9-slice da faixa |
| `ui/card.png`, `ui/button.png`, `ui/background.png` | Molduras 9-slice e textura do painel |
| `ui/coin.png`, `ui/capsule.png` | Ícones |

Ajustes por arquivo (quadros, fps, escala, corte do 9-slice, velocidade) vão num `sprites.json`.
Tudo está explicado em [`assets/sprites/LEIA-ME.txt`](assets/sprites/LEIA-ME.txt), e
`assets/sprites/_exemplos/` tem um chão, um fundo, molduras e um Pavio animado prontos pra copiar.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `main.js` | Processo principal: janela transparente sobre a taskbar, bandeja, save em disco |
| `preload.js` | Ponte segura (`window.bridge`) entre as páginas e o main |
| `shared/game.js` | **Regras**: espécies, tipos, zonas, batalha, XP, captura, offline. Sem DOM, roda no Node |
| `shared/moves.js` | **Golpes** (físico, mágico, status) e o que cada espécie aprende por nível |
| `shared/items.js` | **Naturezas** e **itens de segurar** |
| `shared/sprites.js` | **Pixel art** 12×12 de cada criatura, com paleta normal e brilhante |
| `shared/assets.js` | Sprites/tiles em PNG: folhas animadas, tiles infinitos, molduras 9-slice |
| `renderer/strip.js` | A faixa: loop do jogo, animações, cliques. É a dona do estado |
| `renderer/panel.js` | O painel: só mostra o estado e manda comandos |
| `shared/bridge-fallback.js` | Permite abrir os HTML direto no navegador pra mexer no visual |
| `renderer/*.html` | Casca das duas janelas (faixa e painel) |
| `assets/icon.png` | Ícone do app e da bandeja (256×256) |
| `assets/sprites/` | Sprites que vão junto no build + `LEIA-ME.txt` + `_exemplos/` |

O save fica em `%APPDATA%\taskmon\save.json` e as preferências da faixa (largura, posição,
modo) em `%APPDATA%\taskmon\config.json`. Apague os dois pra começar do zero.

`node_modules/` e `dist/` ficam fora do git (veja o `.gitignore`).

## Desenvolvendo no navegador

Dá pra mexer no visual sem abrir o Electron: sirva a pasta (`npx serve .`) e abra
`renderer/strip.html?speed=10` (10× mais rápido) e `renderer/panel.html` em outra aba.
As duas conversam via BroadcastChannel e salvam no localStorage.

## Mexendo no jogo

- **Nova criatura**: adicione em `SPECIES` (game.js), desenhe a grade em `SPRITES` (sprites.js),
  coloque em `SPECIES_ORDER`, no `pool` de alguma zona e dê uma lista em `LEARNSETS` (moves.js).
- **Novo golpe**: adicione em `MOVES` (moves.js) e coloque no `LEARNSETS` de quem aprende.
- **Balanceamento**: `xpToNext` controla a curva de níveis; `typeMult` suaviza as fraquezas;
  `levels`/`pool` de cada zona definem os encontros.
- **Ritmo**: a cura entre lutas, o intervalo de encontros e a velocidade dos turnos ficam no `update()` do strip.js.

## Ideias pra continuar

- Itens: poção, doce de XP, isca pra atrair raros
- Conquistas ("capture 10 Capis", "vença um brilhante")
- Ciclo dia/noite: criaturas diferentes depois das 18h
- Mais zonas e folclore brasileiro: Curupira, Iara, Saci…
- Batalha de treinador a cada X vitórias, com recompensa grande
