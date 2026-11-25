# Taskmon

Joguinho idle de criaturas que mora logo acima da barra de tarefas do Windows. Sua equipe anda,
encontra criaturas selvagens, batalha sozinho, ganha XP, evolui e captura bichos novos
enquanto você trabalha.

## Rodando

Precisa de [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
npm install
npm start
```

O `koffi` (dependência) fala direto com o Windows: mantém a faixa no topo sem piscar e lê o botão
do mouse como reforço do clique. Ele já vem compilado no pacote do npm, sem baixar nada do GitHub.
Se faltar, a faixa funciona igual, só sem esses reforços.

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

- **Painéis** (botão da faixa): abre STATUS, EQUIPE e MAPA lado a lado; clique de novo pra fechar.
  Clicar num bicho da faixa também abre, já com ele escolhido no STATUS. **Mochila** abre a EQUIPE.
- **Clique no selvagem** durante a luta pra lançar uma cápsula. Quanto menos HP ele tiver, maior a chance.
- **Captura** acontece **depois de derrotar** o selvagem (ele fica caído uns segundos). Modos (⚙ Ajustes):
  *espécies novas e brilhantes* (padrão) e *capturar todos* lançam sozinhos e tentam até 3 vezes;
  *perguntar* mostra "Capturar?" num balão na faixa e no painel; *só manual* espera você clicar no caído.
  O botão **AUTO** do card da direita liga/desliga a captura automática (desligado = perguntar).
  Se ele **escapar da cápsula**, pode fugir de vez (10%, lendário 25%) ou aparece "Tentar outra?".
  Clicar no selvagem no meio da luta ainda arrisca uma cápsula antes (chance menor com HP alto).
  Dá pra ligar a compra automática de cápsulas.
- **Soltar** (Baú): filtre por espécie, natureza (é / não é / neutra), faixa de IV %, brilhante e sexo;
  ligue **MARCAR** e clique nos bichos (ou "Marcar filtro") e solte. Trancados 🔒 nunca saem. Como no
  Legends: Arceus, soltar dá itens de esforço (30% por bicho) e algumas moedas.
- **Arraste a faixa** pelo chão ou pela barrinha recolhida, pra qualquer lugar
  (até pra outro monitor); a posição fica salva. **Ctrl + roda do mouse** em cima dela muda o tamanho
  (Pequeno/Médio/Grande/Enorme = 1 a 4 pixels da tela por pixel de arte, sempre inteiro, pra não borrar).
  O card e os botões ficam sempre do lado da borda da tela: na metade esquerda vão pra esquerda;
  passando do meio, vão pra direita e a faixa fica presa na borda direita (quando cresce, cresce pra
  esquerda). Os bichos sempre andam pra direita.
- **Ícone na bandeja** (perto do relógio): mover a faixa pra esquerda/direita, largura, tamanho
  (Pequeno a Enorme), voltar pra posição padrão, monitor, abrir/recarregar a pasta de sprites, iniciar com o Windows e sair.
- Fechou o app? Ao abrir de novo você ganha o progresso do tempo fora (até 8 h).
- **Golpes**: cada criatura tem até 4, aprendidos por nível ou por MT. No STATUS, **TROCAR** escolhe os
  ativos; clique num golpe pra ver a descrição e clique de novo pra abrir os detalhes.
- **Creche e ovos**: deixe um casal na **Creche** (ovo na EQUIPE); os ovos chocam sozinhos com o tempo.
- **Ajustes**: engrenagem no topo da EQUIPE.
- **MTs**: aba MTs da Loja. Compre ou ache as exclusivas em batalha e ensine pra quem for compatível.
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

### MTs

22 máquinas reutilizáveis (`TMS` em `shared/moves.js`): 15 vendidas na aba MTs e 7 **exclusivas**
que só caem de batalhas (2,5% por vitória, nas zonas indicadas, até achar todas). Cada MT diz por tipo
e/ou espécie quem pode aprender. Ao ensinar com 4 golpes, você escolhe qual esquecer ou só guarda o novo.

Golpes de MT com mecânica própria: **Proteger** (bloqueia o turno; repetido falha cada vez mais),
**Descanso** (HP cheio e dorme 2 turnos) e **Hiper-Raio** (perde o turno seguinte recarregando).

### Sexo, creche e ovos

- Cada espécie tem uma proporção de fêmeas: iniciais 12,5% (como no original), a maioria 50%, Boitatá sem sexo.
- Na **creche** (2 vagas), um macho e uma fêmea que compartilham um **grupo de ovo** (Campo, Água, Planta,
  Inseto, Mineral, Voador) tentam fazer um ovo a cada 60 s de jogo: 50% se são da mesma linhagem, 25% se não.
- O filhote é da **forma base da mãe**, nasce no nível 1, herda **3 IVs** sorteados dos pais (5 se um deles
  segura o **Laço do Destino**) e a **natureza** de quem segura a **Pedra Eterna**. Brilhante: 1 em 256.
- Até 4 ovos chocando ao mesmo tempo, de 5 a 20 min de jogo conforme a raridade (contam também com o app fechado).
- Sprite do ovo: `creatures/_egg.png` na pasta de sprites.

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

## Visual

Feita a partir do design do Claude Design ("Taskmon · interface retrô", Layout B).

- **Faixa B2**: um overlay transparente de 760×200 em px do design (largura na bandeja), encostado na
  barra de tarefas até você arrastar pra outro lugar. Tudo é desenhado no grid de pixel de arte
  (1 pixel de arte = 2 px do design) e a janela tem altura múltipla de 100 px físicos, então nada
  fica "tremido". Só aparecem o chão (de ponta a ponta, vista lateral com grama na frente dos pés,
  paleta por zona com luz amarelada e sombra azulada) com arbustos rolando, sombra embaixo de cada bicho, a **equipe inteira
  andando em fila** (ou só o líder: Ajustes ou bandeja) com barrinhas de HP em cima da cabeça (o líder
  também tem NV e EXP), os botões **Recolher**, **Painéis**
  e **Mochila** e o card da direita; fora deles o clique passa pra área de trabalho.
  - Balões em cima dos bichos: "!" no encontro, o nome do golpe, "· · ·" na cápsula, PEGOU!, +EXP,
    ESCAPOU!, FUGIU!. Na luta aparece a etiqueta de HP do selvagem e os números de dano.
  - Derrotado, o balão **Capturar? SIM / NÃO** com o tempo pra decidir.
  - Card da direita (clique nele pra trocar): **Na área** (bichos da zona, vistos e capturados),
    **Ovo** (passos que faltam pro ovo da creche chocar) e **Hoje** (capturas, EXP e itens do dia).
    Embaixo, as cápsulas e o **AUTO**. A setinha recolhe o card numa coluna.
  - **Recolher** deixa só uma barrinha com o líder e o que está acontecendo; ela reabre sozinha quando
    precisa da sua resposta.
- **Painéis** = janelas soltas de 470×660 (arraste pelo título; encolhem se não couberem acima da faixa):
  - **STATUS**: folha com NV, EXP e atributos (a lupa mostra genes: IV, esforço e natureza, com o botão
    de usar itens de esforço), os 4 golpes, a descrição do escolhido e o que aprende em breve.
  - **EQUIPE**: vitrine do bicho escolhido (natureza, genes, item segurado, líder/Baú), os 6 da equipe,
    a mochila (Itens, Segurar, MTs; em lista ou grade) e atalhos pra Baú, Creche, Golpes, Dex, Mapa e Loja.
  - **MAPA**: as zonas num mapa, com dificuldade, nível, bichos da área e **VIAJAR**.
  - **Baú**, **Creche**, **Loja**, **Dex** e **Ajustes** abrem no mesmo estilo, por cima.
  - Barra de cima: moedas, cápsulas, fixar janelas no topo, som, Dex, Loja e fechar painéis.
  - O bicho escolhido na EQUIPE (ou no Baú) aparece no STATUS.
- Fontes Pixelify Sans (texto) e Silkscreen (rótulos e números), OFL, em `assets/fonts/` (funcionam offline).
  Texturas da faixa em `assets/b/`. O topo do painel é desenhado pelo app
  (arraste por ele; _ minimiza, X fecha).
- Arquivos: `renderer/strip-ui.js` + `strip.css` (faixa), `renderer/panel.js` + `win.css` (painéis),
  fichas da Dex em `shared/dex.js`.

## Sprites e tiles customizados

Coloque PNGs em `%APPDATA%\taskmon\sprites\` (bandeja → **Abrir pasta de sprites**) ou em
`assets/sprites/` do projeto. Eles substituem a pixel art na hora, sem reiniciar:

| Arquivo | Uso |
|---|---|
| `creatures/<especie>.png` | Criatura olhando pra direita. Animação = quadros lado a lado (ex.: 4×32px = 128×32) |
| `creatures/<especie>_shiny.png` | Brilhante (opcional, senão a cor é girada) |
| `items/capsula.png`, `items/super.png` | Cápsulas |
| `tiles/<zona>_ground.png` | Chão da faixa (64 px de altura), repete sem fim e rola enquanto a equipe anda |
| `tiles/<zona>_bg.png` | Faixa de fundo atrás do chão (40 px), rola na metade da velocidade. `default_ground/bg.png` valem pra todas as zonas |
| `ui/coin.png`, `ui/capsule.png` | Ícones |

Ajustes por arquivo (quadros, fps, escala, corte do 9-slice, velocidade) vão num `sprites.json`.
Tudo está explicado em [`assets/sprites/LEIA-ME.txt`](assets/sprites/LEIA-ME.txt), e
`assets/sprites/_exemplos/` tem um chão, um fundo, molduras e um Pavio animado prontos pra copiar.

## Estrutura

| Arquivo | O que faz |
|---|---|
| `main.js` | Processo principal: janela transparente acima da taskbar, bandeja, save em disco |
| `preload.js` | Ponte segura (`window.bridge`) entre as páginas e o main |
| `shared/game.js` | **Regras**: espécies, tipos, zonas, batalha, XP, captura, offline. Sem DOM, roda no Node |
| `shared/moves.js` | **Golpes** (físico, mágico, status) e o que cada espécie aprende por nível |
| `shared/items.js` | **Naturezas** e **itens de segurar** |
| `shared/sprites.js` | **Pixel art** 12×12 de cada criatura, com paleta normal e brilhante |
| `shared/assets.js` | Sprites/tiles em PNG: folhas animadas, tiles infinitos, molduras 9-slice |
| `renderer/strip.js` | A faixa: loop do jogo, animações, cliques. É a dona do estado |
| `renderer/panel.js` | Os painéis (uma janela por tipo): só mostram o estado e mandam comandos |
| `shared/bridge-fallback.js` | Permite abrir os HTML direto no navegador pra mexer no visual |
| `renderer/*.html` | Casca das janelas (faixa e painéis) |
| `renderer/strip-ui.js`, `renderer/strip.css` | Ficha, cards, balões e botões da faixa (HTML por cima do canvas) |
| `renderer/win.css`, `renderer/fonts.css` | Kit visual dos painéis (Layout B) e as fontes de pixel |
| `shared/dex.js` | Fichas da Dex: categoria, altura, peso, habitat, descrição |
| `assets/icon.png` | Ícone do app e da bandeja (256×256) |
| `assets/sprites/` | Sprites que vão junto no build + `LEIA-ME.txt` + `_exemplos/` |

O save fica em `%APPDATA%\taskmon\save.json` e as preferências da faixa (largura, tamanho,
posição, monitor) em `%APPDATA%\taskmon\config.json`. Apague os dois pra começar do zero.

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
