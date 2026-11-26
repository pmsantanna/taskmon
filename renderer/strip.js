// A faixa (Layout B2), logo acima da barra de tarefas: loop do jogo, animações e cliques.
// Este arquivo é o "dono" do estado do jogo; o painel só manda comandos e recebe cópias.

(async () => {
  'use strict';
  const G = window.Game;
  const A = window.Assets;
  const bridge = window.bridge;

  // ?speed=10 na URL acelera tudo (útil pra testar no navegador)
  const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // ---------- Layout ----------
  // Faixa B2: tudo em px do design (800×200), ampliado por k = altura da janela / 200.
  // O "campo" (chão + bichos) começa em x=196 (depois da ficha do líder) e vai até o card da direita.
  const FX = 0;            // início do campo (a ficha do líder saiu; o chão vai de ponta a ponta)
  const FEET = 148;        // linha dos pés (bottom: 52 no design)
  const BOX = 64;          // caixa de cada bicho (64×48, sprite 12×12 em 4×)
  const BOX_H = 48;
  const GAP = 52;          // distância entre os bichos da fila
  const SCENE_DY = 24;
  const TAG_GAP = 144;     // distância líder -> selvagem (centro a centro)
  const snap = (v) => Math.round(v / 2) * 2; // posições sempre em pixel de arte inteiro (2 px do design)
  // O card e os botões ficam na borda da tela e os bichos andam pro meio dela (ver layout()).
  let mirror = false, mirrorText = false;
  bridge.onSide && bridge.onSide((m) => { mirror = !!m; });     // a cena (chão, bichos, balões) fica 24 px mais baixa: mais céu, menos terra
  let W = 0, H = 0, k = 1, DW = 800, fieldW = 652, groundW = 800, leadX = 370, wildTargetX = 480;
  let dpr = 1, kd = 1, oy = 0, axis = 800, fieldX0 = 0, enterX = 800, sceneFlip = false;

  // Tamanho do canvas em pixels físicos. Chamado no resize, quando o DPI muda (o evento
  // 'resize' NÃO dispara se só a escala mudar) e quando o main reposiciona a janela.
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.imageSmoothingEnabled = false;
  }

  let dprQuery = null;
  function watchDpr() {
    if (dprQuery) dprQuery.removeEventListener('change', onDprChange);
    dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', onDprChange);
  }
  function onDprChange() { resize(); watchDpr(); }

  window.addEventListener('resize', resize);
  bridge.onRelayout(resize);
  watchDpr();
  resize();

  // texturas do design (chão e arbustos); tiles da pasta de sprites têm prioridade
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const TEX = { chao: img('../assets/b/chao.png'), arbustos: img('../assets/b/arbustos.png') };

  const FIGHTING = ['fight', 'down', 'prompt', 'retry', 'throw', 'shake'];
  function layout() {
    // pixels físicos por unidade do design: N/2, com N inteiro quando a janela tem altura múltipla
    // de 100 px físicos (o main ajusta). Assim cada pixel de arte (2 unidades) = N pixels da tela.
    const pn = canvas.height / 100, pi = Math.round(pn);
    kd = pi >= 1 && Math.abs(pn - pi) < 0.06 ? pi / 2 : canvas.height / 200;
    k = kd / dpr || 1;
    oy = H - 200 * k; // sobra (fração de px) em cima: a cena fica colada na base
    DW = W / k;
    axis = Math.floor(DW / 2) * 2; // eixo do espelhamento, par pra continuar no grid
    groundW = Math.ceil(DW);
    // parte visível do chão (o card da direita cobre o resto); a fila inteira cabe atrás do líder
    fieldW = Math.max(200, Math.round(DW - (state.settings.cardClosed ? 48 : 148)));
    const n = state.settings.showTeam === false ? 1 : state.team.length;
    // Contas "lógicas": o card fica na esquerda e os bichos andam pra direita, saindo da borda da
    // tela pro meio. A fila começa colada no card (o último da fila do lado dele), o líder vai na
    // frente e o selvagem 110 px adiante, chegando pelo lado aberto. Com o card na borda DIREITA da
    // tela a cena é espelhada (aí eles andam pra esquerda). O card passa por cima do chão e
    // abrir/fechar ele não mexe na cena.
    const CARD = 148;
    sceneFlip = !mirror;                                // mirror = card à esquerda (vem do main)
    // etiquetas centralizadas em cima de cada um (até ~140 de largura): o líder sozinho se afasta um
    // pouco do card e o selvagem fica longe o bastante pras duas etiquetas não se encostarem
    leadX = snap(Math.max(CARD + 12 + GAP * (n - 1), CARD + 40));
    wildTargetX = leadX + TAG_GAP;
    fieldX0 = Math.round(DW - fieldW);                  // início (lógico) da parte visível do chão
    enterX = DW + 10;                                   // o selvagem entra pela borda aberta
    // largura mínima pra caber a fila inteira (a largura normal vem da bandeja)
    const need = 24 + GAP * (n - 1) + TAG_GAP + BOX + 60 + CARD;
    if (need !== layout.need) { layout.need = need; if (bridge.stripWidth) bridge.stripWidth(need); }
    if (sim && sim.wild && FIGHTING.includes(sim.phase)) sim.wildX = wildTargetX;
  }

  // ---------- Estado ----------
  const saved = await bridge.load();
  let state = saved && saved.version === 1 ? { ...G.newGame(), ...saved } : G.newGame();
  // saves antigos não tinham golpes
  G.ensureBreeding(state);
  G.ensureSettings(state);
  const gone = G.sanitizeState(state); // espécies apagadas/renomeadas no shared/species.js
  [...state.team, ...state.box, ...state.daycare.mons].forEach((c) => G.ensureMoves(c));
  await A.load();
  A.setPalette(state.settings.palette);
  StripUI.init(document.body);
  A.onChange(() => StripUI.icons());
  // fontes de pixel antes do primeiro desenho (sem travar se demorarem)
  let sim = null; // definido logo abaixo; layout() checa
  await Promise.race([
    Promise.all([...[500, 600, 700].map((w) => document.fonts.load(`${w} 16px "Pixelify Sans"`)), document.fonts.load('14px Silkscreen')]).catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  layout();

  sim = {
    phase: 'walk', t: 0, encounterAt: 3,
    wild: null, wildX: 0, wildAlpha: 1,
    turnT: 0, queue: [], bl: null, bw: null, log: [], ppT: 0, defeated: false, catchTries: 0, prompt: null,
    walkT: 0, walkFlip: false, lastReward: null, xpGain: 0, xpGainT: 0, alertT: 0, sparkT: 0,
    lunge: null, floaters: [], bubbles: {}, statFx: {}, capsule: null, fled: false,
    toasts: [], toast: null, flash: 0, scroll: 0, anim: 0,
  };

  const name = (c) => G.SPECIES[c.species].name + (c.shiny ? ' ✨' : '');
  const nextEncounter = () => G.rand(Math.random, 5, 10);

  // ---------- Mensagens ----------
  /** Mensagem na caixa de diálogo da faixa. opts: { sub, kind: 'info'|'success'|'alert' } */
  function toast(text, seconds = 2.6, opts = {}) {
    // texto longo fica mais tempo na tela (dá pra ler tudo)
    const len = text.length + (opts.sub ? opts.sub.length : 0);
    sim.toasts.push({ text, seconds: Math.max(seconds, 1.5 + len * 0.06), sub: opts.sub || '', kind: opts.kind || 'info' });
  }

  /** Número/texto subindo na cena (px do campo). size 14 = dano; 11 = textinho. */
  function floater(text, x, y, color = '#f2ecd8', life = 0.9, size = 14) {
    sim.floaters.push({ text, x, y, t: 0, color, life, size });
  }

  // Atributo subiu/caiu: o bicho fica todo vermelho (subiu) ou azul (caiu), com faixas claras
  // correndo pra cima ou pra baixo por cima dele, como nos portáteis antigos.
  const STAT_FX_S = 0.9;
  function statFx(who, up) { sim.statFx[who] = { up, t: 0 }; }

  // Balões do design: um por dono ('lead', 'wild', 'cap'); o novo substitui o anterior.
  // y = topo do balão em px do campo.
  const BUBBLE_Y = { lead: 36, wild: 38, cap: 92 }; // o líder tem as barrinhas de HP/EXP em cima da cabeça
  function bubble(who, text, { accent = '#6a6f66', color = '#f2ecd8', life = 1.2, y } = {}) {
    sim.bubbles[who] = { text, accent, color, life, t: 0, y };
  }

  // Registro da batalha (aparece no painel) e textos de evento.
  function log(line) {
    sim.log.push(line);
    if (sim.log.length > 6) sim.log.shift();
  }

  // ---------- Persistência e sincronização com o painel ----------
  function save() {
    state.lastSaved = Date.now();
    bridge.save(state);
  }

  function sync() {
    const w = sim.wild;
    bridge.pushState({
      ...state,
      battle: w && ['appear', 'fight', 'throw', 'shake', 'prompt', 'down', 'retry'].includes(sim.phase)
        ? { species: w.species, level: w.level, hp: w.hp, max: G.maxHp(w), shiny: w.shiny, gender: w.gender, status: w.status || null, moves: w.moves, log: sim.log, ask: sim.phase === 'prompt' ? sim.prompt : null, defeated: !!sim.defeated, tries: sim.catchTries || 0, caps: (state.items.capsula || 0) + (state.items.super || 0), caught: !!state.dex.caught[w.species] }
        : null,
      resting: sim.phase === 'rest',
    });
  }

  // progresso offline
  if (gone) toast(`${gone} bicho(s) do save não existem mais no species.js e saíram`, 6, { kind: 'alert' });
  if (state.starterChosen) {
    const summary = G.simulateOffline(state, (Date.now() - state.lastSaved) / 1000);
    if (summary) {
      const h = Math.floor(summary.seconds / 3600), m = Math.round((summary.seconds % 3600) / 60);
      toast(`Enquanto você estava fora (${h ? h + 'h ' : ''}${m}min)`, 6, { sub: `+${summary.xp.toLocaleString('pt-BR')} EXP · +${summary.coins.toLocaleString('pt-BR')} moedas · ${summary.battles} batalhas` });
      summary.evolutions.forEach((e) => toast(`${G.SPECIES[e.from].name} evoluiu para ${G.SPECIES[e.to].name}!`, 4));
      (summary.hatched || []).forEach((c) => toast(`Enquanto você estava fora, nasceu um ${name(c)}!`, 4));
    }
  } else {
    bridge.openPanel();
  }
  save();

  // ---------- Batalha ----------
  function startEncounter() {
    sim.wild = G.rollWild(state);
    sim.wildX = enterX;
    sim.wildAlpha = 1;
    sim.fled = false;
    sim.defeated = false;
    sim.catchTries = 0;
    sim.prompt = null;
    sim.queue = [];
    sim.log = [`Um ${name(sim.wild)} selvagem nv ${sim.wild.level} apareceu!`];
    setPhase('appear');
    sim.alertT = 1.6;
    bubble('wild', '!', { accent: '#c0402e', color: '#e06a52', life: 1.6 }); // "!" em cima do selvagem
    if (sim.wild.shiny) toast(`Um ${name(sim.wild)} brilhante apareceu!`, 4, { kind: 'alert' });
    sync();
  }

  function setPhase(p) {
    sim.phase = p;
    sim.t = 0;
  }

  function endBattle() {
    const lead = G.getLead(state);
    if (lead) G.afterBattle(lead);
    sim.queue = [];
    sim.bl = sim.bw = null;
    sim.wild = null;
    sim.capsule = null;
    delete sim.bubbles.cap;
    setPhase('walk');
    sim.encounterAt = nextEncounter();
  }

  // ---------- Turnos (estilo original) ----------
  const posOf = (who) => (who === 'lead' ? leadX + BOX / 2 : sim.wildX + BOX / 2);
  const nameSide = (who) => (who === 'lead' ? name(G.getLead(state)) : `${name(sim.wild)} selvagem`);
  const STAT_SHORT = { atk: 'Atq', def: 'Def', mag: 'Mag', res: 'Res', spd: 'Vel', acc: 'Prec', eva: 'Eva' };
  // Selos de tipo da etiqueta do selvagem: nomes em inglês (abreviados como nos jogos antigos) e as
  // cores clássicas de cada tipo; a faixa de cima é mais clara e o contorno é a cor escurecida.
  const TYPE_EN = {
    normal: ['NORMAL', '#a8a878'], fogo: ['FIRE', '#f08030'], agua: ['WATER', '#6890f0'], planta: ['GRASS', '#78c850'],
    eletrico: ['ELECTR', '#f8d030'], gelo: ['ICE', '#98d8d8'], lutador: ['FIGHT', '#c03028'], veneno: ['POISON', '#a040a0'],
    terra: ['GROUND', '#e0c068'], voador: ['FLYING', '#a890f0'], psiquico: ['PSYCHC', '#f85888'], inseto: ['BUG', '#a8b820'],
    pedra: ['ROCK', '#b8a038'], fantasma: ['GHOST', '#705898'], dragao: ['DRAGON', '#7038f8'], sombrio: ['DARK', '#705848'],
    aco: ['STEEL', '#b8b8d0'], fada: ['FAIRY', '#ee99ac'], misterio: ['???', '#68a090'],
  };
  const shade = (hex, f) => `#${[1, 3, 5].map((i) => Math.round(f < 0 ? parseInt(hex.slice(i, i + 2), 16) * (1 + f) : parseInt(hex.slice(i, i + 2), 16) + (255 - parseInt(hex.slice(i, i + 2), 16)) * f).toString(16).padStart(2, '0')).join('')}`;
  const typeChip = (t) => {
    const [label, base] = TYPE_EN[t] || [String(t).toUpperCase(), '#888888'];
    return { label, base, light: shade(base, 0.35), dark: shade(base, -0.55) };
  };
  // cores de tipo do Layout B (faixa no topo do balão) e do texto do balão
  // faixa colorida no topo do balão do golpe (cor do tipo escurecida) e texto do balão (clareada)
  const TYPE_B = Object.fromEntries(Object.entries(TYPE_EN).map(([t, [, c]]) => [t, shade(c, -0.35)]));
  const TYPE_TXT = Object.fromEntries(Object.entries(TYPE_EN).map(([t, [, c]]) => [t, shade(c, 0.45)]));

  /** Monta a rodada: os dois escolhem golpe e a ordem sai por prioridade/velocidade. */
  function startRound() {
    const am = G.chooseMove(sim.bl, sim.bw), bm = G.chooseMove(sim.bw, sim.bl);
    const a = { who: 'lead', move: am }, b = { who: 'wild', move: bm };
    sim.queue = G.firstToAct(sim.bl, am, sim.bw, bm) ? [a, b] : [b, a];
    sim.queue.push({ end: true });
  }

  function showEvents(events) {
    for (const e of events) {
      // números saem do corpo do bicho e sobem (em cima da cabeça ficam as barrinhas)
      const x = posOf(e.who), y = 106, ty = 100;
      const who = nameSide(e.who);
      switch (e.kind) {
        case 'use': {
          const m = G.MOVES[e.move];
          bubble(e.who, `${m.name.toUpperCase()}!`, { accent: TYPE_B[m.type] || '#6a6f66', color: TYPE_TXT[m.type] || '#f2ecd8', life: 1.2, y: e.who === 'wild' ? 38 : 36 });
          if (m.cat !== 'status') sim.lunge = { who: e.who, t: 0 };
          else sim.glow = { who: e.who, t: 0, color: G.TYPE_COLOR[m.type] };
          log(`${who} usou ${m.name}!`);
          break;
        }
        case 'damage': {
          const color = e.mult > 1 ? '#e0a040' : e.mult < 1 ? '#a8b0a8' : e.who === 'lead' ? '#e06a52' : '#f2ecd8';
          floater(`-${e.amount}`, x, y, color, 0.9, e.crit ? 18 : 14);
          if (e.crit) floater('CRÍTICO!', x, y - 16, '#e0a040', 1.1, 11);
          sim.hit = { who: e.who, t: 0, crit: e.crit };
          if (e.crit) log('Um golpe crítico!');
          if (e.mult >= 4) log('É extremamente efetivo!');
          else if (e.mult > 1) log('É super efetivo!');
          if (e.mult <= 0.25) log('Quase não fez efeito…');
          else if (e.mult < 1) log('Não é muito efetivo…');
          break;
        }
        case 'immune': log(`Não afeta ${who}…`); floater('NÃO AFETA', x, ty, '#a8b0a8', 1.1, 11); break;
        case 'miss': log('Mas errou!'); floater('ERROU!', posOf(e.who === 'lead' ? 'wild' : 'lead'), ty, '#a8b0a8', 1.1, 11); break;
        case 'critUp':
          if (e.failed) log(`A concentração de ${who} já está no máximo!`);
          else { floater('FOCO↑', x, ty, '#e0a040', 1.1, 11); log(`${who} está concentrado!`); statFx(e.who, true); }
          break;
        case 'item': {
          const it = G.HELD[e.item];
          const msg = {
            heal: `${who} comeu a ${it.name} e recuperou HP!`,
            cure: `${who} usou a ${it.name} e se curou!`,
            sash: `${who} aguentou firme com a ${it.name}!`,
            orb: `${who} perdeu um pouco de HP pela ${it.name}.`,
            leftovers: `${who} recuperou um pouco de HP com as ${it.name}.`,
          }[e.what];
          if (e.what === 'heal' || e.what === 'leftovers') floater(`+${e.amount}`, x, y, '#8ac25a');
          else if (e.what === 'orb') floater(`-${e.amount}`, x, y, '#e06a52');
          else floater(it.name.toUpperCase(), x, ty, '#ead9b0', 1.2, 11);
          log(msg);
          break;
        }
        case 'stat': {
          const up = e.stages > 0;
          if (e.failed) { log(`${G.STAT_LABEL[e.stat]} de ${who} não vai mais ${up ? 'subir' : 'cair'}!`); break; }
          statFx(e.who, up);
          floater(`${STAT_SHORT[e.stat].toUpperCase()}${up ? '↑' : '↓'}${Math.abs(e.stages) > 1 ? (up ? '↑' : '↓') : ''}`, x, ty, up ? '#8ac25a' : '#e06a52', 1.1, 11);
          log(`${G.STAT_LABEL[e.stat]} de ${who} ${up ? 'subiu' : 'caiu'}${Math.abs(e.stages) > 1 ? ' muito' : ''}!`);
          break;
        }
        case 'status': {
          const st = G.STATUS[e.status];
          floater(st.short.toUpperCase(), x, ty, st.color, 1.1, 11);
          log(e.rest ? `${who} dormiu e recuperou a saúde!` : `${who} ficou ${st.label.toLowerCase()}!`);
          break;
        }
        case 'fail': log('Não teve efeito…'); break;
        case 'cant':
          if (e.why === 'recarga') {
            floater('...', x, ty, '#a8b0a8', 1.1, 11);
            log(`${who} precisa recarregar!`);
            break;
          }
          floater(e.why === 'sono' ? 'ZZZ' : 'PAR', x, ty, G.STATUS[e.why].color, 1.1, 11);
          log(e.why === 'sono' ? `${who} está dormindo.` : `${who} está paralisado e não consegue se mexer!`);
          break;
        case 'protect': floater('PROTEGER', x, ty, '#8ab8e8', 1.1, 11); sim.glow = { who: e.who, t: 0, color: '#7dd3fc' }; log(`${who} se protegeu!`); break;
        case 'protected': floater('BLOQUEOU', x, ty, '#8ab8e8', 1.1, 11); log(`${who} se protegeu do ataque!`); break;
        case 'wake': log(`${who} acordou!`); break;
        case 'heal': floater(`+${e.amount}`, x, y, '#8ac25a'); log(e.drain ? `${who} sugou energia!` : `${who} recuperou HP!`); break;
        case 'recoil': floater(`-${e.amount}`, x, y, '#e06a52'); log(`${who} sofreu o impacto do golpe!`); break;
        case 'residual': {
          floater(`-${e.amount}`, x, y, G.STATUS[e.status].color);
          log(`${who} sofre com ${e.status === 'queimadura' ? 'a queimadura' : 'o veneno'}!`);
          break;
        }
        case 'faint': log(`${who} desmaiou!`); break;
      }
    }
  }

  /** Executa a próxima ação da fila. Devolve o tempo até a próxima. */
  function nextAction() {
    if (!sim.queue.length) startRound();
    const act = sim.queue.shift();
    let events;
    if (act.end) {
      events = [...G.endOfTurn(sim.bl), ...G.endOfTurn(sim.bw)];
      if (!events.length) return 0.15;
    } else {
      const [att, def] = act.who === 'lead' ? [sim.bl, sim.bw] : [sim.bw, sim.bl];
      if (att.c.hp <= 0 || def.c.hp <= 0) return 0;
      events = G.useMove(att, def, act.move);
    }
    showEvents(events);
    const lead = G.getLead(state);
    if (lead.hp <= 0) faint();
    else if (sim.wild.hp <= 0) win();
    return 0.95;
  }

  function win() {
    const lead = G.getLead(state);
    const res = G.rewardWin(state, sim.wild);
    sim.lastReward = res;
    sim.xpGain = res.xp;
    sim.xpGainT = 3; // "+XP" ao lado da barra de EXP
    bubble('lead', `+${res.xp.toLocaleString('pt-BR')} EXP`, { accent: '#e0a040', color: '#e0a040', life: 2, y: 34 });
    const td = G.today(state);
    td.xp += res.xp;
    if (res.tm) td.items++;
    if (res.drop) td.items++;
    if (res.tm) toast(`Achou a ${res.tm.toUpperCase()}: ${G.MOVES[G.TMS[res.tm].move].name}! (exclusiva)`, 4.5);
    if (res.drop) toast(`O ${G.SPECIES[sim.wild.species].name} deixou cair: ${G.SHOP[res.drop].name}!`, 3);
    handleXpEvents(res.events, lead);
    sim.defeated = true; // já ganhou XP; daqui pra frente é só a captura
    sim.catchTries = 0;
    log(`${name(sim.wild)} foi derrotado!`);
    afterDefeat();
    save();
    sync();
  }

  // ---------- Captura depois de derrotar ----------
  // Derrotado, o selvagem fica caído uns segundos. Conforme o modo: lança sozinho, pergunta
  // ("Capturar?") ou espera um clique (manual). Se escapar da cápsula: tenta de novo (auto),
  // pergunta "Tentar outra?" ou deixa ir. Depois de escapar ele ainda pode fugir.
  const AUTO_TRIES = 3;
  const PROMPT_S = 10; // sem resposta, deixa ir
  const DOWN_S = 3;    // janela do modo manual pra clicar no caído

  function afterDefeat() {
    const w = sim.wild;
    const mode = state.settings.catchMode;
    if ((mode === 'all' || mode === 'new') && G.wantsCatch(state, w)) {
      if (pickCapsule(w)) return autoThrow();
      toast('Sem cápsulas pra capturar!');
      return setPhase('win');
    }
    if (mode === 'ask') return openPrompt('catch');
    setPhase('down'); // manual: clique no caído pra lançar
  }

  function autoThrow() {
    const item = pickCapsule(sim.wild);
    if (!item) { toast('Acabaram as cápsulas!'); setPhase('win'); return; }
    sim.catchTries++;
    throwCapsule(item);
  }

  function openPrompt(kind) {
    sim.prompt = kind;
    if (state.settings.collapsed) state.settings.collapsed = false; // recolhida: abre pra perguntar
    setPhase('prompt');
    sync();
  }

  function answerCatch(yes) {
    if (!sim.wild || sim.phase !== 'prompt') return;
    sim.prompt = null;
    if (!yes) { log(`Você deixou ${name(sim.wild)} ir.`); setPhase('win'); sync(); return; }
    if (!pickCapsule(sim.wild)) { toast('Sem cápsulas! Compre no painel.'); setPhase('win'); sync(); return; }
    autoThrow();
  }

  function handleXpEvents(events, c) {
    for (const e of events) {
      if (e.type === 'levelup') toast(`${G.SPECIES[c.species].name} subiu pro nível ${e.level}!`);
      if (e.type === 'learn') {
        toast(e.replaced
          ? `${G.SPECIES[c.species].name} esqueceu ${G.MOVES[e.replaced].name} e aprendeu ${G.MOVES[e.move].name}!`
          : `${G.SPECIES[c.species].name} aprendeu ${G.MOVES[e.move].name}!`, 3.5);
      }
      if (e.type === 'learnLater') toast(`${G.SPECIES[c.species].name} pode aprender ${G.MOVES[e.move].name}! Troque no painel.`, 3.5);
      if (e.type === 'evolve') {
        toast(`${G.SPECIES[e.from].name} evoluiu para ${G.SPECIES[e.to].name}!`, 4, { kind: 'success' });
        sim.flash = 1;
      }
    }
  }

  function faint() {
    toast(`${name(G.getLead(state))} desmaiou… descansando`);
    sim.queue = [];
    state.stats.battles++;
    setPhase('rest');
    sync();
  }

  function pickCapsule(wild) {
    const bought = G.autoBuyCapsules(state);
    if (bought) toast(`Comprou ${bought} cápsulas sozinho`);
    const rare = G.SPECIES[wild.species].catch < 0.15;
    if (rare && state.items.super > 0) return 'super';
    if (state.items.capsula > 0) return 'capsula';
    if (state.items.super > 0) return 'super';
    return null;
  }

  function throwCapsule(item) {
    state.items[item]--;
    sim.capsule = { item, success: Math.random() < G.catchChance(sim.wild, item) };
    setPhase('throw');
    sync();
  }

  function finishCapture() {
    const w = sim.wild;
    if (sim.capsule.success) {
      if (!sim.defeated) { // capturou no meio da luta (clique): ainda não tinha ganhado a XP
        const res = G.rewardWin(state, w);
        sim.lastReward = res;
        handleXpEvents(res.events, G.getLead(state));
        if (res.tm) toast(`Achou a ${res.tm.toUpperCase()}: ${G.MOVES[G.TMS[res.tm].move].name}! (exclusiva)`, 4.5);
        if (res.drop) toast(`Encontrou: ${G.SHOP[res.drop].name}!`, 3);
      }
      G.addCaught(state, w);
      G.today(state).caught++;
      if (!sim.defeated && sim.lastReward) G.today(state).xp += sim.lastReward.xp;
      bubble('cap', 'PEGOU!', { accent: '#e0a040', color: '#e0a040', life: 2 });
      const r = sim.lastReward;
      const sub = [r ? `+${r.xp} EXP` : '', r ? `+${r.coins} moedas` : '', state.box.includes(w) ? 'foi pra caixa' : 'registrado na Dex'].filter(Boolean).join(' · ');
      toast(`Oba! ${G.SPECIES[w.species].name.toUpperCase()}${w.shiny ? ' ✦' : ''} foi capturado!`, 4.5, { sub, kind: 'success' });
      if (w.held) toast(`${G.SPECIES[w.species].name} estava segurando ${G.HELD[w.held].name}!`, 3);
      setPhase('caught');
    } else if (sim.defeated) {
      log(`${name(w)} escapou da cápsula!`);
      bubble('cap', 'ESCAPOU!', { accent: '#c0402e', color: '#e06a52', life: 1.3 });
      // depois de escapar, às vezes foge de vez
      if (Math.random() < (G.SPECIES[w.species].legendary ? 0.25 : 0.1)) {
        log(`${name(w)} fugiu!`);
        bubble('wild', 'FUGIU!', { accent: '#6a6f66', color: '#a8b0a8', life: 1.4, y: 92 });
        sim.fled = true; // sai correndo pra direita
        setPhase('win');
      } else {
        const mode = state.settings.catchMode;
        const auto = mode === 'all' || mode === 'new';
        if (auto && sim.catchTries < AUTO_TRIES && pickCapsule(w)) setPhase('retry');
        else if (auto) { toast(`${name(w)} escapou, desisti depois de ${sim.catchTries} tentativa(s)`, 3); setPhase('win'); }
        else openPrompt('retry');
      }
    } else {
      bubble('cap', 'ESCAPOU!', { accent: '#c0402e', color: '#e06a52', life: 1.3 });
      log(`${name(w)} escapou da cápsula!`);
      // jogar a cápsula gastou o turno do líder: só o selvagem age nesta rodada
      sim.queue = [{ who: 'wild', move: G.chooseMove(sim.bw, sim.bl) }, { end: true }];
      sim.turnT = 0.4;
      setPhase('fight');
    }
    save();
    sync();
  }

  // ---------- Atualização ----------
  function update(dt) {
    // mensagens
    if (!sim.toast && sim.toasts.length) sim.toast = { ...sim.toasts.shift(), t: 0 };
    if (sim.toast && (sim.toast.t += dt) > sim.toast.seconds) sim.toast = null;
    sim.floaters = sim.floaters.filter((f) => (f.t += dt) < f.life);
    for (const [who, b] of Object.entries(sim.bubbles)) if ((b.t += dt) > b.life) delete sim.bubbles[who];
    if (sim.lunge && (sim.lunge.t += dt) > 0.25) sim.lunge = null;
    if (sim.glow && (sim.glow.t += dt) > 0.5) sim.glow = null;
    if (sim.hit && (sim.hit.t += dt) > 0.3) sim.hit = null;
    for (const who of Object.keys(sim.statFx)) if ((sim.statFx[who].t += dt) > STAT_FX_S) delete sim.statFx[who];
    sim.flash = Math.max(0, sim.flash - dt * 0.8);
    sim.alertT = Math.max(0, sim.alertT - dt);
    sim.xpGainT = Math.max(0, sim.xpGainT - dt);
    if (sim.phase !== 'rest') sim.anim += dt;

    const lead = G.getLead(state);
    if (!lead) return;
    const max = G.maxHp(lead);
    sim.t += dt;
    G.today(state).active += dt;

    // creche e ovos andam com o tempo de jogo
    for (const e of G.tickBreeding(state, dt)) {
      if (e.type === 'egg') toast('A creche achou um ovo! 🥚', 3.5);
      if (e.type === 'hatch') {
        toast(`O ovo chocou! Nasceu um ${name(e.creature)}${e.creature.gender ? (e.creature.gender === 'F' ? ' ♀' : ' ♂') : ''}!`, 4);
        sim.flash = 1;
      }
      save();
      sync();
    }

    switch (sim.phase) {
      case 'walk':
        sim.walkT += dt;
        lead.steps = (lead.steps || 0) + dt * 2; // ~2 passos por segundo andando
        sim.scroll += dt * 32; // 4 px a cada quadro de 8 fps, como no design
        lead.hp = Math.min(max, lead.hp + max * 0.15 * dt); // cura entre batalhas
        if ((sim.ppT += dt) > 2.5) { // PP volta aos poucos andando
          sim.ppT = 0;
          state.team.forEach((c) => G.restorePp(c, 1));
        }
        if (sim.t >= sim.encounterAt) startEncounter();
        break;

      case 'appear': {
        const kk = Math.min(1, sim.t / 0.8);
        sim.wildX = enterX + (wildTargetX - enterX) * (1 - Math.pow(1 - kk, 3));
        if (kk >= 1) {
          sim.bl = G.battler(lead, 'lead');
          sim.bw = G.battler(sim.wild, 'wild');
          sim.queue = [];
          sim.turnT = 0.4;
          setPhase('fight');
        }
        break;
      }

      case 'fight':
        sim.turnT -= dt;
        if (sim.turnT <= 0) {
          sim.turnT = nextAction();
          if (sim.phase === 'fight') sync();
        }
        break;

      case 'throw':
        if (sim.t >= 0.55) setPhase('shake');
        break;

      case 'shake': // "·", "· ·", "· · ·" em cima da cápsula
        sim.bubbles.cap = { text: ['·', '· ·', '· · ·'][Math.min(2, Math.floor(sim.t / 0.5))], accent: '#e0a040', color: '#f2ecd8', life: 9, t: 0 };
        if (sim.t >= 1.5) finishCapture();
        break;

      case 'win':
        if (sim.fled) sim.wildX += dt * 128; // foge correndo pra direita
        else sim.wildAlpha = Math.max(0, 1 - sim.t / 0.8);
        if (sim.t >= (sim.fled ? 1.4 : 1)) endBattle();
        break;

      case 'caught':
        if (sim.t >= 1.6) endBattle();
        break;

      case 'prompt':
        if (sim.t >= PROMPT_S) { sim.prompt = null; log(`${name(sim.wild)} foi embora.`); setPhase('win'); sync(); }
        break;

      case 'down':
        if (sim.t >= DOWN_S) setPhase('win');
        break;

      case 'retry': // pausa curtinha antes de lançar de novo
        if (sim.t >= 0.8) autoThrow();
        break;

      case 'rest':
        sim.wildAlpha = Math.max(0, 1 - sim.t / 0.8);
        lead.hp = Math.max(lead.hp, Math.round(max * Math.min(1, sim.t / 8)));
        if (sim.t >= 8) {
          lead.hp = max;
          G.restorePp(lead);
          endBattle();
          sync();
        }
        break;
    }
  }

  // ---------- Desenho da cena (canvas) ----------
  // A ficha, os cards, os balões e a pergunta são HTML (strip-ui.js). O canvas desenha, dentro do
  // campo, os arbustos e o chão rolando, a fila de bichos, o selvagem, a cápsula, as faíscas e os
  // números de dano. Coordenadas em px do campo (x=0 no início do campo, y em px do design).

  /** Texto do canvas no estilo do design: Silkscreen com contorno de 2 px nas 4 direções. */
  function text(str, x, y, { size = 14, color = '#f2ecd8', align = 'center', font = 'Silkscreen' } = {}) {
    ctx.font = `${size}px ${font}, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    x = Math.round(x); y = Math.round(y);
    unflip(x, () => {
      ctx.fillStyle = '#0a0c0e';
      const o = size <= 10 ? 1 : 2; // texto pequeno: contorno de 1 px (2 px borra)
      for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o]]) ctx.fillText(str, x + dx, y + dy);
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    });
  }
  /** Com a cena espelhada, desvira o texto em volta de x (senão as letras saem ao contrário). */
  function unflip(x, fn) {
    if (!mirrorText) return fn();
    ctx.save();
    ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
    fn();
    ctx.restore();
  }

  function measure(str, size = 14) {
    ctx.font = `${size}px Silkscreen, monospace`;
    return ctx.measureText(str).width;
  }

  /**
   * Criatura (PNG customizado animado ou pixel art): recortada, em escala inteira, centralizada na
   * caixa de 64 px que começa em x, com os pés em FEET (+dy do pulinho) e sombra no chão.
   * Devolve { w, h } em px do design.
   */
  function sprite(id, shiny, x, { flip = false, alpha = 1, dy = 0, t = sim.anim, filter = null, fx = null } = {}) {
    const sheet = A.creature(id, shiny);
    const box = sheetBox(sheet), s = spriteScale(sheet);
    const dw = box.w * s, dh = box.h * s, cx = x + BOX / 2;
    footShadow(cx, FEET, dw, alpha);
    const px = snap(cx - dw / 2), py = snap(FEET + dy - dh);
    const sx = A.frameAt(sheet, t) * sheet.fw + box.x;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    if (sheet.facesLeft) flip = !flip; // PNG desenhado olhando pra esquerda (sprites.json: "facing": "left")
    const img = fx ? statTint(sheet.src, sx, box, dw, dh, fx) : null; // efeito de atributo (vermelho/azul)
    if (flip) {
      ctx.translate(px + dw, py); ctx.scale(-1, 1);
      if (img) ctx.drawImage(img, 0, 0, dw, dh); else ctx.drawImage(sheet.src, sx, box.y, box.w, box.h, 0, 0, dw, dh);
    } else if (img) ctx.drawImage(img, px, py, dw, dh);
    else ctx.drawImage(sheet.src, sx, box.y, box.w, box.h, px, py, dw, dh);
    ctx.restore();
    return { w: dw, h: dh };
  }

  /**
   * Sprite pintado de uma cor só (vermelho subindo / azul descendo) com faixas de 1 pixel de arte
   * rolando por cima, só onde o bicho tem pixel. Feito numa tela de rascunho do tamanho do sprite.
   */
  const fxCanvas = document.createElement('canvas');
  function statTint(src, sx, box, dw, dh, fx) {
    const c = fxCanvas;
    if (c.width !== dw || c.height !== dh) { c.width = dw; c.height = dh; }
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dw, dh);
    g.drawImage(src, sx, box.y, box.w, box.h, 0, 0, dw, dh);
    g.globalCompositeOperation = 'source-atop';
    const k = fx.t / STAT_FX_S;
    const fade = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1; // entra e sai suave
    g.globalAlpha = 0.72 * fade;
    g.fillStyle = fx.up ? '#e83a3a' : '#3a62e8';
    g.fillRect(0, 0, dw, dh);
    // faixas: 2 px (1 pixel de arte) a cada 8, andando 48 px/s pra cima (subiu) ou pra baixo (caiu)
    g.globalAlpha = 0.9 * fade;
    g.fillStyle = fx.up ? '#ffb0a0' : '#a8c4ff';
    const off = snap((fx.t * 48) % 8) * (fx.up ? -1 : 1);
    for (let y = -8 + (((off % 8) + 8) % 8); y < dh; y += 8) g.fillRect(0, y, dw, 2);
    g.globalAlpha = 1;
    return c;
  }

  function itemSprite(id, x, y, size, alpha = 1) {
    const sheet = A.item(id);
    A.drawSheet(ctx, sheet, A.frameAt(sheet, sim.t), Math.round(x), Math.round(y), size, size, { alpha });
  }

  // ---------- Chão no grid de pixel de arte ----------
  // Ajustes do Claude Design: 1 pixel de arte = 2 px do design (a densidade do chao.png/arbustos.png) e
  // a janela tem altura múltipla de 100 px físicos, então cada pixel de arte vira um número INTEIRO de
  // pixels da tela. Tudo é posicionado em números pares do design (snap). Paletas por zona com
  // "hue shift" (luz puxando pro amarelo, sombra pro azul/roxo), trocando as cores das texturas.
  const ZONE_PAL = {
    campina: {
      grama: ['#c8f088', '#98d860', '#68b848', '#4a9440', '#2c5a3a'],
      terra: ['#d0a060', '#a87444', '#7c5236', '#583a32', '#3a2428'],
      pedra: ['#c0c8d0', '#8890a0', '#545c70'],
      fundo: ['#7fb088', '#5e9474', '#44766a'],
    },
    lago: {
      grama: ['#b8ec98', '#88d070', '#5cb060', '#3f8c58', '#24504a'],
      terra: ['#c8a070', '#9c7450', '#72543e', '#4e3a38', '#30242c'],
      pedra: ['#c4d0dc', '#8a9ab0', '#56627c'],
      fundo: ['#80b8a8', '#5e9a90', '#447a7a'],
    },
    caverna: {
      grama: ['#c8c0b4', '#a49c90', '#827a72', '#625a58', '#3c3440'],
      terra: ['#9a8c80', '#766a62', '#564c4a', '#3c3438', '#241e28'],
      pedra: ['#d0d4dc', '#9aa0b0', '#646a80'],
      fundo: ['#6a6478', '#544e64', '#403a52'],
    },
    vulcao: {
      grama: ['#b48a74', '#8e6a5c', '#6a4c48', '#4a3438', '#2e2028'],
      terra: ['#7a5450', '#5a3c40', '#422c34', '#2e1e28', '#1c121a'],
      pedra: ['#9a8a90', '#6a5a66', '#46384a'],
      fundo: ['#8a5a5c', '#6c4450', '#503444'],
      lava: ['#f8e070', '#f8a040', '#e05830', '#a83028'],
    },
  };
  // cores originais das texturas do design -> posição na rampa da zona
  const SRC_INDEX = {
    '#b4e88a': ['grama', 0], '#8ad06a': ['grama', 1], '#5fae4a': ['grama', 2], '#3f8a38': ['grama', 3], '#2f5a2a': ['grama', 4],
    '#b8854f': ['terra', 0], '#a0703f': ['terra', 1], '#8a5a32': ['terra', 2], '#6e4426': ['terra', 3], '#5a3a20': ['terra', 4],
    '#bcbcae': ['pedra', 0], '#8a8a7e': ['pedra', 1], '#55554c': ['pedra', 2],
    '#7f8a64': ['fundo', 0], '#6a7452': ['fundo', 1], '#58603f': ['fundo', 2],
  };
  const recolorCache = {};
  /** Textura com as cores da zona (feita uma vez e guardada). Substitui o ctx.filter. */
  function zoneTexture(im, zone) {
    if (!im || !im.complete || !im.naturalWidth) return null;
    const key = `${im.src}|${zone}`;
    if (recolorCache[key]) return recolorCache[key];
    const Z = ZONE_PAL[zone] || ZONE_PAL.campina;
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
    const hex = (r, gg, b) => `#${[r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const m = SRC_INDEX[hex(d[i], d[i + 1], d[i + 2])];
      const target = m && Z[m[0]] && Z[m[0]][m[1]];
      if (!target) continue;
      d[i] = parseInt(target.slice(1, 3), 16); d[i + 1] = parseInt(target.slice(3, 5), 16); d[i + 2] = parseInt(target.slice(5, 7), 16);
    }
    g.putImageData(data, 0, 0);
    return (recolorCache[key] = c);
  }

  /** Repete uma imagem na horizontal (w×h cada), rolando com `offset`. sy/sh = recorte da origem. */
  function tiled(im, w, h, offset, y, sy = 0, sh = null) {
    if (!im || im.complete === false || !(im.naturalWidth || im.width)) return;
    const iw = im.naturalWidth || im.width, ih = sh ?? (im.naturalHeight || im.height);
    let x = -(((snap(offset) % w) + w) % w);
    for (; x < groundW + w; x += w) ctx.drawImage(im, 0, sy, iw, ih, x, y, w, h);
  }

  // Chão de vista lateral (combina com os sprites): arbustos no fundo e terra + grama colada na base.
  const GROUND_Y = 200 - 64;   // topo da textura do chão; os pés (148) ficam 2 pixels de arte dentro da grama
  function drawGround() {
    const bg = A.tile(state.zone, 'bg'), gr = A.tile(state.zone, 'ground');
    const Z = ZONE_PAL[state.zone] || ZONE_PAL.campina;
    if (bg) { const sc = bg.cfg.scale || 40 / bg.img.height; tiled(bg.img, bg.img.width * sc, bg.img.height * sc, sim.scroll * (bg.cfg.speed ?? 0.4), GROUND_Y + 8 - bg.img.height * sc); }
    else tiled(zoneTexture(TEX.arbustos, state.zone), 128, 40, sim.scroll * 0.4, GROUND_Y - 34);
    if (gr) { // chão da pasta de sprites: colado na base, de ponta a ponta
      const sc = gr.cfg.scale || 64 / gr.img.height;
      tiled(gr.img, gr.img.width * sc, gr.img.height * sc, sim.scroll * (gr.cfg.speed ?? 1), 200 - gr.img.height * sc);
      return;
    }
    tiled(zoneTexture(TEX.chao, state.zone), 128, 64, sim.scroll, GROUND_Y);
    // contato entre os arbustos e a grama: uma linha chapada de sombra fria
    ctx.fillStyle = Z.fundo[2];
    ctx.fillRect(0, GROUND_Y + 6, groundW, 2);
    if (Z.lava) {
      ctx.fillStyle = Z.lava[2]; ctx.fillRect(0, 196, groundW, 4);
      ctx.fillStyle = Z.lava[0]; ctx.fillRect(0, 196, groundW, 2);
    }
  }
  /** Pontas da grama por cima dos pés (desenhado depois dos bichos): "planta" eles no chão. */
  function drawFrontTufts() {
    if (A.tile(state.zone, 'ground')) return;
    tiled(zoneTexture(TEX.chao, state.zone), 128, 8, sim.scroll, FEET - 6, 0, 4);
  }

  // ---------- Sprites: recortados, nunca reduzidos, em escala inteira ----------
  const trimCache = new WeakMap();
  /** Caixa útil (sem margem transparente) da folha: a maior entre os quadros, pra não "pular". */
  function sheetBox(sheet) {
    const hit = trimCache.get(sheet.src);
    if (hit) return hit;
    const fw = sheet.fw, fh = sheet.fh, frames = sheet.frames || 1;
    let box = { x: 0, y: 0, w: fw, h: fh };
    try {
      const c = document.createElement('canvas');
      c.width = fw; c.height = fh;
      const g = c.getContext('2d', { willReadFrequently: true });
      let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
      for (let f = 0; f < frames; f++) {
        g.clearRect(0, 0, fw, fh);
        g.drawImage(sheet.src, f * fw, 0, fw, fh, 0, 0, fw, fh);
        const d = g.getImageData(0, 0, fw, fh).data;
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          if (d[(y * fw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch { /* imagem ainda carregando: usa a folha inteira */ return box; }
    trimCache.set(sheet.src, box);
    return box;
  }
  /**
   * Tamanho na tela (px do design) de um pixel do sprite: 2 por pixel de arte, nunca menor que 1.
   * Conta pela altura do quadro inteiro (não do recorte), pra todos os bichos do mesmo tamanho de
   * folha saírem na mesma escala (um bicho baixinho não pode virar gigante).
   */
  function spriteScale(sheet) {
    const art = Math.max(1, Math.floor(24 / sheet.fh));     // folha 12 px -> 2 pixels de arte por pixel
    return Math.max(1, Math.round(art * (sheet.size || 1))) * 2;
  }

  /** Sombra de pixel embaixo do bicho: elipse de 4 linhas, azulada e translúcida. */
  function footShadow(cx, feetY, spriteW, alpha = 1) {
    const P = 2, hw = Math.max(6, snap(spriteW * 0.36)), x = snap(cx), y = snap(feetY) - P;
    ctx.fillStyle = `rgba(28,36,60,${(0.3 * alpha).toFixed(2)})`;
    ctx.fillRect(x - hw + 2 * P, y, hw * 2 - 4 * P, P);
    ctx.fillRect(x - hw, y + P, hw * 2, 2 * P);
    ctx.fillRect(x - hw + 2 * P, y + 3 * P, hw * 2 - 4 * P, P);
  }

  /** Quem anda atrás do líder (e onde), conforme "só o líder" / "equipe toda". */
  function mates(lead) {
    if (state.settings.showTeam === false) return [];
    return state.team.filter((c) => c !== lead).map((c, i) => ({ c, x: leadX - GAP * (i + 1) - (i === 0 ? 2 : 0) })).filter((m) => m.x > -BOX);
  }

  const HP_FILL = (r) => (r < 0.25 ? ['#c84038', '#f88868'] : r < 0.5 ? ['#d89838', '#f8d070'] : ['#48a850', '#98e070']);

  /** Faísca em "+" de 4 px (captura). */
  function spark(x, y) {
    ctx.fillStyle = '#fff6a8';
    for (const [dx, dy] of [[0, 0], [0, -4], [0, 4], [-4, 0], [4, 0]]) ctx.fillRect(Math.round(x + dx), Math.round(y + dy), 4, 4);
  }

  // avanço no ataque: o líder vai 20 px pra frente, o selvagem 16 px pra trás (pro lado do líder)
  function lungeOffset(who) {
    if (!sim.lunge || sim.lunge.who !== who) return 0;
    return snap(Math.sin((Math.PI * sim.lunge.t) / 0.25) * (who === 'lead' ? 20 : 16));
  }
  const hurt = (who) => sim.hit && sim.hit.who === who && sim.hit.t < 0.25;

  /** Posição da cápsula (px do campo) agora, ou null. */
  function capsulePos() {
    if (!sim.capsule) return null;
    const rest = { x: wildTargetX + BOX / 2 - 12, y: FEET - 24 };
    if (sim.phase === 'throw') {
      const kk = Math.min(1, sim.t / 0.55);
      const x0 = leadX + 40, y0 = 110;
      return { x: x0 + (rest.x - x0) * kk, y: y0 + (rest.y - y0) * kk - Math.sin(Math.PI * kk) * 56 };
    }
    if (['shake', 'caught'].includes(sim.phase) || (sim.phase === 'retry' && sim.t < 0.3)) {
      const wob = sim.phase === 'shake' && Math.floor(sim.t / 0.25) % 2 === 1 ? (Math.floor(sim.t * 8) % 2 ? -3 : 3) : 0;
      return { x: rest.x + wob, y: rest.y };
    }
    return null;
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (cursor) hover(cursor.x, cursor.y); // a cena muda embaixo do cursor parado (ex.: a pergunta aparece)
    layout();
    const lead = G.getLead(state);
    StripUI.update(view(lead));
    if (!state.starterChosen || !lead || state.settings.collapsed) return;

    ctx.setTransform(kd, 0, 0, kd, kd * FX, Math.round(canvas.height - 200 * kd) + kd * SCENE_DY);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (sceneFlip) { ctx.translate(axis, 0); ctx.scale(-1, 1); } // card à direita: andam pra esquerda
    mirrorText = sceneFlip;
    drawGround();
    if (sim.hit && sim.hit.crit) ctx.translate(snap(Math.sin(sim.hit.t * 90) * 2), 0); // tremidinha no crítico

    // a equipe anda em fila atrás do líder (8 quadros por segundo, como no design)
    const walking = sim.phase === 'walk';
    const tick = Math.floor(sim.anim * 8);
    const resting = sim.phase === 'rest';
    const team = mates(lead);
    team.forEach(({ c, x }, i) => {
      const still = A.creature(c.species, c.shiny).frames > 1;
      const dy = still ? 0 : walking ? ((tick + i + 1) % 2 === 0 ? -2 : 0) : (((tick >> 2) + i + 1) % 2 === 0 ? -2 : 0);
      sprite(c.species, c.shiny, x, { dy, alpha: c.hp <= 0 ? 0.45 : 1 });
    });
    const animated = A.creature(lead.species, lead.shiny).frames > 1;
    const bob = animated || resting ? 0 : walking || sim.phase === 'caught' ? (tick % 2 === 0 ? -2 : 0) : ((tick >> 2) % 2 === 0 ? -2 : 0);
    sprite(lead.species, lead.shiny, leadX + lungeOffset('lead'), {
      dy: bob, alpha: resting ? 0.45 : hurt('lead') && tick % 2 === 0 ? 0.35 : 1, fx: sim.statFx.lead,
    });
    if (resting) text('Z', leadX + BOX - 4 + Math.sin(sim.t * 3) * 2, 104 - ((sim.t * 6) % 10), { size: 11, color: '#e8ecff' });
    if (sim.flash > 0) {
      ctx.globalAlpha = sim.flash;
      ctx.fillStyle = '#fff';
      ctx.fillRect(leadX + 6, FEET - BOX_H - 2, BOX - 12, BOX_H + 4);
      ctx.globalAlpha = 1;
    }

    // selvagem (olha pra esquerda; foge virado pra direita)
    const w = sim.wild;
    if (w && sim.phase !== 'shake' && sim.phase !== 'caught') {
      const wx = snap(sim.wildX) - lungeOffset('wild');
      const wbob = sim.phase === 'fight' && !sim.defeated && ((tick >> 1) % 2 === 0) ? -2 : 0;
      const flash = hurt('wild') && tick % 2 === 0;
      sprite(w.species, w.shiny, wx, {
        flip: !sim.fled, dy: wbob, t: sim.defeated ? 0 : sim.anim,
        alpha: (sim.defeated && !sim.fled ? 0.6 : 1) * sim.wildAlpha,
        filter: flash ? 'brightness(2.4)' : sim.phase === 'throw' && sim.t > 0.4 ? 'brightness(3)' : null, fx: sim.statFx.wild,
      });
    }

    drawFrontTufts();

    // cápsula voando / balançando no chão / faíscas da captura
    const cp = capsulePos();
    if (cp) itemSprite(sim.capsule.item, snap(cp.x), snap(cp.y), 24);
    if (cp && sim.phase === 'caught' && Math.floor(sim.t / 0.25) % 2 === 0) {
      spark(cp.x - 12, cp.y - 8);
      spark(cp.x + 22, cp.y - 14);
      spark(cp.x + 6, cp.y - 22);
    }

    // números subindo (3 px a cada quadro de 8 fps)
    for (const f of sim.floaters) {
      ctx.globalAlpha = Math.min(1, 3 * (1 - f.t / f.life));
      const half = measure(f.text, f.size) / 2 + 3;
      text(f.text, Math.min(DW - half, Math.max(fieldX0 + half, f.x)), f.y - f.t * 24, { size: f.size, color: f.color });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    mirrorText = false;

    if (debug && debug.on) {
      const hit = cursor ? hitTest(cursor.x, cursor.y) : null;
      const lines = [
        `mouse ${cursor ? `${Math.round(cursor.x)},${Math.round(cursor.y)}` : '—'} ${hit || '-'} · ${clickThrough ? 'atravessa' : 'PEGA'} · dpr ${dpr}`,
        `sistema ${debug.pt ? `${debug.pt.x - debug.b.x},${debug.pt.y - debug.b.y}` : '—'} · botão ${debug.reader ? 'lido' : 'SEM leitor'} · clique ${debug.lastClick || '—'}`,
      ];
      ctx.fillStyle = 'rgba(18,22,26,0.92)';
      ctx.fillRect(0, 176, fieldW, 24);
      lines.forEach((l, i) => text(l, 4, 178 + i * 11, { size: 9, font: '"Pixelify Sans"', align: 'left', color: '#cdf5dc' }));
    }
  }

  /** Bichos da zona pro card "Na área": até 4, lendários só depois de vistos. */
  function areaMons() {
    const zone = G.ZONES.find((z) => z.id === state.zone) || G.ZONES[0];
    const ids = Object.entries(zone.pool).sort((a, b) => b[1] - a[1]).map(([id]) => id)
      .filter((id) => !G.SPECIES[id].legendary || state.dex.seen[id]).slice(0, 4);
    const mons = ids.map((id) => ({
      species: id, name: G.SPECIES[id].name, seen: true,
      state: state.dex.caught[id] ? 'caught' : state.dex.seen[id] ? 'seen' : 'unk',
    }));
    return {
      range: `${zone.levels[0]}–${zone.levels[1]}`, zone: zone.name.toUpperCase(), mons,
      caught: mons.filter((m) => m.state === 'caught').length, total: mons.length,
    };
  }

  function eggInfo() {
    const eggs = state.eggs || [];
    const e = [...eggs].sort((a, b) => b.progress / b.need - a.progress / a.need)[0];
    const [a, b] = (state.daycare && state.daycare.mons) || [];
    const hint = G.breedChance(a, b) > 0 ? 'Casal na creche: logo vem um ovo.' : a && b ? 'Esse par não põe ovo.' : 'Deixe um casal na creche.';
    return {
      egg: e ? { pct: Math.floor((e.progress / e.need) * 100), left: Math.ceil((e.need - e.progress) * 2) } : null, // ~2 passos por segundo
      eggs: eggs.length, eggsMax: G.EGGS_MAX, daycareHint: hint,
    };
  }

  /** Texto do modo recolhido (o que está acontecendo agora). */
  function miniLine(zoneTxt) {
    const w = sim.wild, nm = w ? G.SPECIES[w.species].name.toUpperCase() : '';
    const gold = '#e0a040', gray = '#a8b0a8', red = '#e06a52';
    switch (sim.phase) {
      case 'appear': return { text: `! ${nm} NV${w.level}`, color: red, alert: Math.floor(sim.t * 4) % 2 === 0 };
      case 'fight': return { text: `LUTANDO · ${nm}`, color: gray };
      case 'down': case 'prompt': return { text: `? ${nm} NV${w.level}`, color: red, alert: Math.floor(sim.t * 4) % 2 === 0 };
      case 'throw': case 'shake': case 'retry': return { text: 'CÁPSULA · · ·', color: gold };
      case 'caught': return { text: 'PEGOU!', color: gold };
      case 'win':
        if (sim.fled) return { text: `${nm} FUGIU`, color: gray };
        return sim.lastReward ? { text: `${nm} · +${sim.lastReward.xp} EXP`, color: gold } : { text: nm, color: gray };
      case 'rest': return { text: 'DESCANSANDO…', color: gray };
    }
    if (sim.toast) return { text: sim.toast.text.toUpperCase(), color: sim.toast.kind === 'success' ? gold : gray };
    return { text: zoneTxt, color: gray };
  }

  /** O que a camada HTML mostra agora. */
  function view(lead) {
    const st = state.settings;
    const caps = (state.items.capsula || 0) + (state.items.super || 0);
    const over = cursor && hitTest(cursor.x, cursor.y);
    const v = {
      width: W, height: 200 * k, starter: !state.starterChosen || !lead, collapsed: st.collapsed, cardClosed: st.cardClosed,
      card: st.card, fieldW, caps, auto: G.isAuto(state), hot: over && !['lead', 'wild', 'drag'].includes(over) && !over.startsWith('mon:') ? over : null,
      tag: null, bubbles: [], prompt: null, toast: null, mirror, fieldX0: mirror ? fieldX0 : 0,
    };
    // x lógico da cena -> x dentro da parte visível do chão (camada HTML, que nunca espelha)
    const fxp = (x) => (sceneFlip ? axis - x : x - fieldX0);
    if (v.starter) return v;
    const tick = Math.floor(sim.anim * 8);
    v.lead = {
      species: lead.species, shiny: lead.shiny, name: G.SPECIES[lead.species].name + (lead.shiny ? ' ✦' : ''), g: lead.gender,
      lv: lead.level, hp: lead.hp, max: G.maxHp(lead), xp: G.clamp(lead.xp / G.xpToNext(lead.level), 0, 1),
      st: lead.status ? G.STATUS[lead.status] : null, xpGain: sim.xpGainT > 0 ? sim.xpGain : 0,
      blink: hurt('lead') && tick % 2 === 0, resting: sim.phase === 'rest',
    };
    const area = areaMons();
    if (st.collapsed) {
      v.mini = { ...miniLine(`${area.zone} NV${area.range}`), dy: sim.phase === 'walk' && tick % 2 === 0 ? -2 : 0, gx: -(Math.floor(sim.scroll / 2) % 64) };
      return v;
    }
    v.area = area;
    Object.assign(v, eggInfo());
    v.eggDx = tick % 24 < 4 ? (tick % 2 === 0 ? 1 : -1) : 0;
    const td = G.today(state), mins = Math.floor(td.active / 60);
    v.today = { active: `${Math.floor(mins / 60)}H${String(mins % 60).padStart(2, '0')}`, caught: td.caught, xp: td.xp, items: td.items };

    const w = sim.wild;
    // etiquetas espelhadas: a informação fica virada pro adversário e os selos de tipo pra fora
    const tagOf = (c, x, chipsOut, withXp) => {
      const r = G.clamp(c.hp / G.maxHp(c), 0, 1), [base, hi] = HP_FILL(r);
      const st = c.status && G.STATUS[c.status];
      return {
        x: Math.round(fxp(snap(x) + BOX / 2)), y: 80 + SCENE_DY,
        name: G.SPECIES[c.species].name.toUpperCase(), lv: c.level, hp: { r, base, hi },
        xp: withXp ? G.clamp(c.xp / G.xpToNext(c.level), 0, 1) : null,
        st: st ? { short: st.short.slice(0, 3).toUpperCase(), color: st.color } : null,
        types: G.typesOf(c).map(typeChip), chips: chipsOut,
      };
    };
    // na tela o líder fica à esquerda do selvagem (andando pra direita) ou à direita (cena espelhada)
    v.ltag = tagOf(lead, leadX + lungeOffset('lead'), sceneFlip ? 'right' : 'left', true);
    if (w && !sim.defeated && ['fight', 'throw'].includes(sim.phase)) {
      v.tag = tagOf(w, sim.wildX - lungeOffset('wild'), sceneFlip ? 'left' : 'right', false);
    }
    const cp = capsulePos();
    for (const [who, b] of Object.entries(sim.bubbles)) {
      if (who === 'wild' && !w) continue;
      if (who === 'lead' && sim.phase === 'prompt') continue; // a pergunta fica por cima dele
      const x = who === 'lead' ? leadX + 24 : who === 'cap' ? (cp ? cp.x + 12 : wildTargetX + BOX / 2) : sim.wildX + 28;
      v.bubbles.push({ id: who, text: b.text, accent: b.accent, color: b.color, x: fxp(x), y: (b.y ?? BUBBLE_Y[who]) + SCENE_DY });
    }
    if (sim.phase === 'prompt' && w) {
      v.prompt = {
        x: fxp(sim.wildX + 28), y: 12 + SCENE_DY,
        q: sim.prompt === 'retry' ? 'Tentar outra?' : 'Capturar?',
        who: `${G.SPECIES[w.species].name.toUpperCase()} NV${w.level}`,
        frac: Math.max(0, 1 - sim.t / PROMPT_S),
      };
    } else if (sim.toast) {
      v.toast = { text: sim.toast.text, sub: sim.toast.sub, kind: sim.toast.kind, x: Math.round(fieldW / 2) };
    }
    return v;
  }

  // ---------- Mouse ----------
  // A janela ignora o mouse (cliques passam pra barra de tarefas), exceto em cima do HUD
  // e das criaturas. O Electron continua mandando mousemove pra gente decidir isso.
  let clickThrough = true;

  function hitTest(x, y) {
    const ui = StripUI.hit(x, y); // ficha, cards e botões HTML (data-hit)
    if (ui) return ui;
    if (!state.starterChosen || state.settings.collapsed) return null;
    // bichos no campo; o chão e os arbustos servem pra arrastar; o céu deixa o clique passar
    let fx = x / k - FX;
    const fy = (y - oy) / k - SCENE_DY;
    if (sceneFlip) fx = axis - fx;
    if (fx < 0 || fx > groundW) return null;
    if (fy >= FEET - BOX_H - 14 && fy <= FEET + 4) { // bicho + barrinhas em cima dele
      if (fx >= leadX + 8 && fx <= leadX + BOX - 8) return 'lead';
      if (sim.wild && ['fight', 'down'].includes(sim.phase) && fx >= sim.wildX + 6 && fx <= sim.wildX + BOX - 6) return 'wild';
      const lead = G.getLead(state);
      const m = lead && mates(lead).find((mm) => fx >= mm.x + 10 && fx <= mm.x + BOX - 10);
      if (m) return `mon:${m.c.uid}`;
    }
    return fy >= GROUND_Y - 34 ? 'drag' : null; // arbustos e chão servem pra arrastar
  }
  // onde dá pra arrastar a faixa: ficha do líder (e a barrinha recolhida) e o chão
  const DRAG_HITS = new Set(['hud', 'drag']);
  // clicar num bicho abre os painéis com ele escolhido (o STATUS mostra ele)
  function openWith(uid) {
    try { localStorage.setItem('taskmon-sel', JSON.stringify(uid)); } catch { /* sem storage */ }
    if (bridge.selectCreature) bridge.selectCreature(uid);
    bridge.openPanel('trio');
  }

  // Liga/desliga o "clique atravessa" conforme o que está embaixo do cursor.
  // A posição vem SÓ do mousemove da página (coordenadas exatas). A posição do sistema que o main
  // consulta pode vir deslocada com escala de DPI, e misturar as duas fazia o clique atravessar.
  let dragging = false, dragFrom = null; // arrastando a faixa (ver startDrag)
  // Cursor de captura: o ícone da cápsula (o PNG de items/capsula.png ou ui/capsule.png, se tiver)
  // ampliado em pixel, com a ponta no meio dele.
  let capCursor = null, capCursorV = -1;
  function captureCursor() {
    if (capCursor && capCursorV === A.version) return capCursor;
    const f = A.ui('capsule');
    const sheet = f ? null : A.item('capsula');
    const src = f ? f.img : sheet.src;
    const sw = f ? f.img.width : sheet.fw, sh = f ? f.img.height : sheet.fh;
    const k = Math.max(1, Math.floor(28 / Math.max(sw, sh)));
    const c = document.createElement('canvas');
    c.width = sw * k; c.height = sh * k;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, sw, sh, 0, 0, c.width, c.height);
    capCursorV = A.version;
    return (capCursor = `url(${c.toDataURL()}) ${Math.floor(c.width / 2)} ${Math.floor(c.height / 2)}, pointer`);
  }
  let cursor = null; // último mousemove (pra reavaliar quando a cena muda embaixo do mouse parado)
  let lastMove = 0;
  function hover(x, y) {
    cursor = x == null ? null : { x, y };
    const hit = cursor ? hitTest(x, y) : null;
    // cursor normal em tudo; só em cima do selvagem que dá pra capturar vira a cápsula
    document.body.style.cursor = hit === 'wild' ? captureCursor() : 'default';
    if (!!hit === clickThrough) {
      clickThrough = !hit;
      bridge.setClickThrough(clickThrough);
    }
  }

  window.addEventListener('mousemove', (e) => { lastMove = performance.now(); hover(e.clientX, e.clientY); });

  // Não dá pra confiar no 'mouseleave': no Windows ele dispara à toa quando a janela troca o modo
  // de ignorar o mouse ou é reposicionada no topo. Quem avisa que o mouse saiu é o main (null),
  // e só vale se não houve mousemove recente (o mousemove sempre tem a palavra final).
  bridge.onCursor((p) => { if (!p && performance.now() - lastMove > 300) hover(null); });
  if (bridge.isFallback) document.addEventListener('mouseleave', () => hover(null));

  // Diagnóstico (bandeja → "Diagnóstico do mouse"): mostra na faixa o que ela está vendo.
  let debug = null;
  bridge.onDebug((d) => { debug = d; });

  // O mesmo clique pode chegar duas vezes: pelo main (botão lido do Windows) e pela janela.
  // Só o primeiro vale.
  let lastAction = 0;
  function act(x, y, source) {
    const hit = hitTest(x, y);
    if (debug) debug.lastClick = `${Math.round(x)},${Math.round(y)} ${hit || '-'} (${source})`;
    if (!hit) return;
    const now = performance.now();
    if (now - lastAction < 400) return;
    lastAction = now;
    const st = state.settings;
    if (hit === 'hud') bridge.openPanel(state.starterChosen ? 'trio' : undefined);
    if (hit === 'lead') openWith(state.lead);
    if (hit.startsWith('mon:')) openWith(hit.slice(4));
    if (hit.startsWith('menu:')) bridge.openPanel(hit.slice(5));
    if (hit === 'collapse' || hit === 'expand') st.collapsed = hit === 'collapse';
    if (hit === 'card:close' || hit === 'card:open') st.cardClosed = hit === 'card:close';
    if (hit === 'card:next') st.card = { bichos: 'ovo', ovo: 'hoje', hoje: 'bichos' }[st.card] || 'bichos';
    if (hit === 'auto') G.toggleAuto(state);
    if (['collapse', 'expand', 'card:close', 'card:open', 'card:next', 'auto'].includes(hit)) { save(); sync(); }
    if (hit === 'askYes') answerCatch(true);
    if (hit === 'askNo') answerCatch(false);
    if (hit === 'wild') {
      const item = pickCapsule(sim.wild);
      if (!item) toast('Sem cápsulas! Compre no painel.');
      else if (sim.phase === 'down') autoThrow();
      else throwCapsule(item);
    }
  }
  // Ficha e chão: apertar começa a arrastar (o main move a janela); soltar sem ter movido vale
  // como clique. Os outros alvos agem no clique normal.
  function startDrag(x, y) {
    if (dragging) return;
    dragging = true;
    dragFrom = { x, y };
    bridge.dragStart();
  }
  bridge.onDragEnd((r) => {
    const from = dragFrom;
    dragging = false;
    dragFrom = null;
    if (from && !r.moved) act(from.x, from.y, 'clique');
    if (cursor) hover(cursor.x, cursor.y);
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && DRAG_HITS.has(hitTest(e.clientX, e.clientY))) startDrag(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => { if (dragging) bridge.dragEnd(); });
  window.addEventListener('click', (e) => { if (!DRAG_HITS.has(hitTest(e.clientX, e.clientY))) act(e.clientX, e.clientY, 'janela'); });
  // Ctrl + roda do mouse em cima da faixa: muda o tamanho
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    bridge.stripScale(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  // só leitura, pra diagnóstico/testes: o que está embaixo de um ponto da faixa
  window.__taskmon = { hit: (x, y) => hitTest(x, y), side: () => (mirror ? 'card à esquerda' : 'card à direita'), statFx: () => JSON.stringify(sim.statFx) };
  bridge.onPress((p) => {
    if (DRAG_HITS.has(hitTest(p.x, p.y))) startDrag(p.x, p.y);
    else act(p.x, p.y, 'windows');
  });

  // ---------- Comandos do painel ----------
  bridge.onCommand((cmd) => {
    switch (cmd.type) {
      case 'chooseStarter':
        if (G.chooseStarter(state, cmd.species)) {
          toast(`${G.SPECIES[cmd.species].name}, eu escolho você!`, 3);
          endBattle();
          sim.encounterAt = 3;
        }
        break;
      case 'setLead':
        if (state.team.some((c) => c.uid === cmd.uid) && state.lead !== cmd.uid) {
          state.lead = cmd.uid;
          if (sim.wild) toast('Trocou de líder, o selvagem fugiu');
          endBattle();
        }
        break;
      case 'move':
        if (!G.moveCreature(state, cmd.uid, cmd.to)) toast(cmd.to === 'team' ? 'Equipe cheia (máx. 6)' : 'Precisa ter alguém na equipe');
        break;
      case 'zone':
        if (G.unlockedZones(state).some((z) => z.id === cmd.id) && state.zone !== cmd.id) {
          state.zone = cmd.id;
          toast(`Indo para ${G.ZONES.find((z) => z.id === cmd.id).name}…`);
          endBattle();
        }
        break;
      case 'buy':
        if (G.buy(state, cmd.item, cmd.qty)) toast(`Comprou ${cmd.qty}× ${(G.SHOP[cmd.item] || G.HELD[cmd.item]).name}`);
        else toast('Moedas insuficientes');
        break;
      case 'catchMode':
        if (G.CATCH_MODES[cmd.value]) state.settings.catchMode = cmd.value;
        break;
      case 'palette':
        if (A.PALETTES[cmd.value]) { state.settings.palette = cmd.value; A.setPalette(cmd.value); }
        break;
      case 'autoBuy':
        state.settings.autoBuy = !!cmd.value;
        break;
      case 'toggleAuto':
        G.toggleAuto(state);
        break;
      case 'stripUi': // recolher/expandir a faixa, fechar o card, trocar o card
        if ('collapsed' in cmd) state.settings.collapsed = !!cmd.collapsed;
        if ('cardClosed' in cmd) state.settings.cardClosed = !!cmd.cardClosed;
        if (['bichos', 'ovo', 'hoje'].includes(cmd.card)) state.settings.card = cmd.card;
        if ('showTeam' in cmd) state.settings.showTeam = !!cmd.showTeam;
        break;
      case 'catchAnswer':
        answerCatch(cmd.yes);
        break;
      case 'throw': // botão CAPTURAR do painel: no meio da luta arrisca; derrotado, lança
        if (!sim.wild) break;
        if (sim.phase === 'prompt') answerCatch(true);
        else if (sim.phase === 'down') { if (pickCapsule(sim.wild)) autoThrow(); }
        else if (sim.phase === 'fight') { const it = pickCapsule(sim.wild); if (it) throwCapsule(it); else toast('Sem cápsulas!'); }
        break;
      case 'release': {
        const r = G.releaseCreatures(state, cmd.uids || []);
        if (r.count) {
          const items = Object.entries(r.items).map(([id, n]) => `${n}× ${G.SHOP[id].name}`).join(', ');
          toast(`Soltou ${r.count}: +${r.coins} 🪙${items ? ` e ${items}` : ''}`, 4);
        }
        break;
      }
      case 'lock':
        G.toggleLock(state, cmd.uid);
        break;
      case 'buyTm':
        if (G.buyTm(state, cmd.tm)) toast(`Comprou a ${cmd.tm.toUpperCase()}: ${G.MOVES[G.TMS[cmd.tm].move].name}`);
        else toast('Não deu pra comprar essa MT');
        break;
      case 'teachTm': {
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        const r = c && G.teachTm(state, c, cmd.tm, cmd.replace || null);
        const nm = c && G.SPECIES[c.species].name;
        if (!r) toast('Não deu pra ensinar essa MT');
        else if (r.replaced) toast(`${nm} esqueceu ${G.MOVES[r.replaced].name} e aprendeu ${G.MOVES[r.move].name}!`, 3.5);
        else if (r.active) toast(`${nm} aprendeu ${G.MOVES[r.move].name}!`, 3);
        else toast(`${nm} aprendeu ${G.MOVES[r.move].name} (guardado, troque em Golpes)`, 3.5);
        break;
      }
      case 'daycarePut': {
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        if (c && G.daycarePut(state, cmd.uid)) {
          toast(`${G.SPECIES[c.species].name} foi pra creche`);
          if (!G.getLead(state) || sim.wild) endBattle();
        } else toast('A creche está cheia (ou a equipe ficaria vazia)');
        break;
      }
      case 'daycareTake':
        if (G.daycareTake(state, cmd.uid)) toast('Buscou na creche');
        break;
      case 'hold': {
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        if (c && G.hold(state, c, cmd.item || null)) {
          toast(cmd.item ? `${G.SPECIES[c.species].name} está segurando ${G.HELD[cmd.item].name}` : `Tirou o item de ${G.SPECIES[c.species].name}`);
        }
        break;
      }
      case 'grit': {
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        const used = c && G.useGrit(state, c, cmd.stat);
        if (used) toast(`${G.SPECIES[c.species].name}: ${G.STAT_LABEL[cmd.stat] || 'HP'} subiu pro nível de esforço ${c.effort[cmd.stat]}!`);
        else toast('Sem o item de esforço certo pra esse nível');
        break;
      }
      case 'autoMoves':
        state.settings.autoMoves = !!cmd.value;
        break;
      case 'useEvoItem': { // item de evolução usado na EQUIPE
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        const evs = c && G.evolveWithItem(state, c, cmd.item);
        if (evs) handleXpEvents(evs, c);
        else toast('Esse item não serve pra esse bicho');
        break;
      }
      case 'setMoves': {
        const c = [...state.team, ...state.box].find((x) => x.uid === cmd.uid);
        if (c && G.setMoves(c, cmd.moves)) toast(`Golpes de ${G.SPECIES[c.species].name} atualizados`);
        break;
      }
      case 'reset':
        state = G.newGame();
        endBattle();
        bridge.openPanel();
        break;
    }
    save();
    sync();
  });

  bridge.onStateRequest(sync);

  // ---------- Loop ----------
  let last = performance.now();
  let syncTimer = 0, saveTimer = 0;

  // A lógica roda num timer próprio (30×/s) e o desenho no requestAnimationFrame. Se o sistema
  // parar de desenhar a janela por um tempo, o jogo e as mensagens continuam andando.
  function tick() {
    const now = performance.now();
    const real = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (!(real > 0)) return;
    const dt = real * SPEED;
    update(dt);
    if ((syncTimer += real) > 1) { syncTimer = 0; sync(); }
    if ((saveTimer += real) > 10) { saveTimer = 0; save(); }
  }
  function frame() {
    try { draw(); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('beforeunload', save);
  sync();
  setInterval(() => { try { tick(); } catch (err) { console.error(err); } }, 33);
  requestAnimationFrame(frame);
})();
