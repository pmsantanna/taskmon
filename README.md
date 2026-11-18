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
- Brilhantes: 1 em 256. Lendário escondido no Vulcão. 👀

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
| `shared/game.js` | **Regras**: espécies, tipos, zonas, dano, XP, captura, offline. Sem DOM, roda no Node |
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
  coloque em `SPECIES_ORDER` e no `pool` de alguma zona.
- **Balanceamento**: `xpToNext` controla a curva de níveis; `typeMult` suaviza as fraquezas;
  `levels`/`pool` de cada zona definem os encontros.
- **Ritmo**: a cura entre lutas, o intervalo de encontros e a velocidade dos turnos ficam no `update()` do strip.js.

## Ideias pra continuar

- Itens: poção, doce de XP, isca pra atrair raros
- Conquistas ("capture 10 Capis", "vença um brilhante")
- Ciclo dia/noite: criaturas diferentes depois das 18h
- Mais zonas e folclore brasileiro: Curupira, Iara, Saci…
- Batalha de treinador a cada X vitórias, com recompensa grande
