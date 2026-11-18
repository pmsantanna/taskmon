# Taskmon

Joguinho idle de criaturas que mora na barra de tarefas do Windows. Seu parceiro anda,
encontra criaturas selvagens, batalha sozinho, ganha XP, evolui e captura bichos novos
enquanto você trabalha.

## Rodando

```bash
npm install
npm start
```

### Atrás do proxy da empresa

O `npm install` do Electron baixa um binário do GitHub, e o proxy corporativo costuma
barrar essa parte. Se travar ou falhar no `electron/install.js`:

```powershell
npm config set proxy http://proxy.el.com.br:PORTA
npm config set https-proxy http://proxy.el.com.br:PORTA
$env:ELECTRON_GET_USE_PROXY = "true"
$env:GLOBAL_AGENT_HTTPS_PROXY = "http://proxy.el.com.br:PORTA"
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
- **Ícone na bandeja** (perto do relógio): mover a faixa pra esquerda/direita, ficar acima da barra,
  iniciar com o Windows e sair.
- Fechou o app? Ao abrir de novo você ganha o progresso do tempo fora (até 8 h).
- Brilhantes: 1 em 256. Lendário escondido no Vulcão. 👀

## Estrutura

| Arquivo | O que faz |
|---|---|
| `main.js` | Processo principal: janela transparente sobre a taskbar, bandeja, save em disco |
| `preload.js` | Ponte segura (`window.bridge`) entre as páginas e o main |
| `shared/game.js` | **Regras**: espécies, tipos, zonas, dano, XP, captura, offline. Sem DOM, roda no Node |
| `shared/sprites.js` | **Pixel art** 12×12 de cada criatura, com paleta normal e brilhante |
| `renderer/strip.js` | A faixa: loop do jogo, animações, cliques. É a dona do estado |
| `renderer/panel.js` | O painel: só mostra o estado e manda comandos |
| `shared/bridge-fallback.js` | Permite abrir os HTML direto no navegador pra mexer no visual |

O save fica em `%APPDATA%\taskmon\save.json`.

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
