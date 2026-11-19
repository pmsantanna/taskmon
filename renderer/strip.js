// A faixa que fica em cima da barra de tarefas: loop do jogo, animações e cliques.
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
  const HUD_W = 122;
  let W = 0, H = 0, S = 24, groundY = 0, leadX = 0, wildTargetX = 0;
  let dpr = 1;

  // Tamanho do canvas em pixels físicos. Chamado no resize, quando o DPI muda (o evento
  // 'resize' NÃO dispara se só a escala mudar) e quando o main reposiciona a janela.
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // Posições que dependem do tamanho e do tile de chão da zona atual (recalculado todo quadro).
  let ground = null, groundScale = 1, bg = null, bgScale = 1;
  function layout() {
    const zoneId = state.zone;
    ground = A.tile(zoneId, 'ground');
    bg = A.tile(zoneId, 'bg');
    S = Math.max(24, Math.round((H * 0.6) / 12) * 12); // múltiplo de 12 = pixels nítidos
    if (ground) {
      const gi = ground.img, c = ground.cfg;
      groundScale = c.scale || Math.max(1, Math.round((H * 0.28) / gi.height));
      // "feet": a quantos px (do PNG) da base do tile os pés ficam. Padrão: 35% da altura.
      const feet = c.feet ?? Math.round(gi.height * 0.35);
      groundY = Math.round(H - feet * groundScale);
    } else {
      groundY = H - 3;
    }
    if (bg) bgScale = bg.cfg.scale || H / bg.img.height;
    if (S > groundY - 4) S = Math.max(12, Math.floor((groundY - 4) / 12) * 12);
    leadX = HUD_W + 18;
    wildTargetX = Math.min(W - S - 8, leadX + S + 56);
  }

  // ---------- Estado ----------
  const saved = await bridge.load();
  let state = saved && saved.version === 1 ? { ...G.newGame(), ...saved } : G.newGame();
  // saves antigos não tinham golpes
  G.ensureBreeding(state);
  G.ensureSettings(state);
  [...state.team, ...state.box, ...state.daycare.mons].forEach((c) => G.ensureMoves(c));
  await A.load();
  A.setPalette(state.settings.palette);
  // fontes de pixel antes do primeiro desenho (sem travar se demorarem)
  await Promise.race([
    document.fonts.load('12px "DotGothic16"').catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  layout();

  const sim = {
    phase: 'walk', t: 0, encounterAt: 3,
    wild: null, wildX: 0, wildAlpha: 1,
    turnT: 0, queue: [], bl: null, bw: null, log: [], ppT: 0, defeated: false, catchTries: 0, prompt: null,
    lunge: null, floaters: [], capsule: null,
    toasts: [], toast: null, flash: 0, scroll: 0, anim: 0,
  };

  const name = (c) => G.SPECIES[c.species].name + (c.shiny ? ' ✨' : '');
  const nextEncounter = () => G.rand(Math.random, 5, 10);

  // ---------- Mensagens ----------
  function toast(text, seconds = 2.6) {
    sim.toasts.push({ text, seconds });
  }

  function floater(text, x, y, color = '#fff', life = 1.1, size = 10) {
    sim.floaters.push({ text, x, y, t: 0, color, life, size });
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
  if (state.starterChosen) {
    const summary = G.simulateOffline(state, (Date.now() - state.lastSaved) / 1000);
    if (summary) {
      const h = Math.floor(summary.seconds / 3600), m = Math.round((summary.seconds % 3600) / 60);
      toast(`Enquanto você estava fora (${h ? h + 'h ' : ''}${m}min): +${summary.xp} XP, +${summary.coins} 🪙`, 6);
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
    sim.wildX = W + 4;
    sim.wildAlpha = 1;
    sim.defeated = false;
    sim.catchTries = 0;
    sim.prompt = null;
    sim.queue = [];
    sim.log = [`Um ${name(sim.wild)} selvagem nv ${sim.wild.level} apareceu!`];
    setPhase('appear');
    if (sim.wild.shiny) toast(`Um ${name(sim.wild)} brilhante apareceu!`, 4);
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
    setPhase('walk');
    sim.encounterAt = nextEncounter();
  }

  // ---------- Turnos (estilo original) ----------
  const posOf = (who) => (who === 'lead' ? leadX + S / 2 : sim.wildX + S / 2);
  const nameSide = (who) => (who === 'lead' ? name(G.getLead(state)) : `${name(sim.wild)} selvagem`);
  const STAT_SHORT = { atk: 'Atq', def: 'Def', mag: 'Mag', res: 'Res', spd: 'Vel', acc: 'Prec', eva: 'Eva' };

  /** Monta a rodada: os dois escolhem golpe e a ordem sai por prioridade/velocidade. */
  function startRound() {
    const am = G.chooseMove(sim.bl, sim.bw), bm = G.chooseMove(sim.bw, sim.bl);
    const a = { who: 'lead', move: am }, b = { who: 'wild', move: bm };
    sim.queue = G.firstToAct(sim.bl, am, sim.bw, bm) ? [a, b] : [b, a];
    sim.queue.push({ end: true });
  }

  function showEvents(events) {
    for (const e of events) {
      const x = posOf(e.who), y = groundY - S / 2;
      const who = nameSide(e.who);
      switch (e.kind) {
        case 'use': {
          const m = G.MOVES[e.move];
          floater(m.name, x, groundY - S - 4, G.TYPE_COLOR[m.type] || '#fff', 1.2);
          if (m.cat !== 'status') sim.lunge = { who: e.who, t: 0 };
          else sim.glow = { who: e.who, t: 0, color: G.TYPE_COLOR[m.type] };
          log(`${who} usou ${m.name}!`);
          break;
        }
        case 'damage': {
          const color = e.mult > 1 ? '#fb923c' : e.mult < 1 ? '#a8a29e' : '#fff';
          floater(`${e.amount}`, x, y, color, 1.1, e.crit ? 13 : 10);
          if (e.crit) floater('CRÍTICO!', x, y - 13, '#fde047', 1.2, 9);
          sim.hit = { who: e.who, t: 0, crit: e.crit };
          if (e.crit) log('Um golpe crítico!');
          if (e.mult > 1) log('É super efetivo!');
          if (e.mult < 1) log('Não é muito efetivo…');
          break;
        }
        case 'miss': log('Mas errou!'); floater('ERROU!', posOf(e.who === 'lead' ? 'wild' : 'lead'), y, '#d6d3d1', 1.1, 9); break;
        case 'critUp':
          if (e.failed) log(`A concentração de ${who} já está no máximo!`);
          else { floater('Foco↑', x, y - 6, '#fde047'); log(`${who} está concentrado!`); }
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
          if (e.what === 'heal' || e.what === 'leftovers') floater(`+${e.amount}`, x, y, '#4ade80');
          else if (e.what === 'orb') floater(`-${e.amount}`, x, y + 4, '#fca5a5');
          else floater(it.name, x, y - 8, '#fde68a', 1.2, 9);
          log(msg);
          break;
        }
        case 'stat': {
          const up = e.stages > 0;
          if (e.failed) { log(`${G.STAT_LABEL[e.stat]} de ${who} não vai mais ${up ? 'subir' : 'cair'}!`); break; }
          floater(`${STAT_SHORT[e.stat]}${up ? '↑' : '↓'}${Math.abs(e.stages) > 1 ? (up ? '↑' : '↓') : ''}`, x, y - 6, up ? '#86efac' : '#fca5a5');
          log(`${G.STAT_LABEL[e.stat]} de ${who} ${up ? 'subiu' : 'caiu'}${Math.abs(e.stages) > 1 ? ' muito' : ''}!`);
          break;
        }
        case 'status': {
          const st = G.STATUS[e.status];
          floater(st.short, x, y - 6, st.color);
          log(e.rest ? `${who} dormiu e recuperou a saúde!` : `${who} ficou ${st.label.toLowerCase()}!`);
          break;
        }
        case 'fail': log('Não teve efeito…'); break;
        case 'cant':
          if (e.why === 'recarga') {
            floater('...', x, y - 6, '#d6d3d1');
            log(`${who} precisa recarregar!`);
            break;
          }
          floater(e.why === 'sono' ? 'zzz' : 'PAR', x, y - 6, G.STATUS[e.why].color);
          log(e.why === 'sono' ? `${who} está dormindo.` : `${who} está paralisado e não consegue se mexer!`);
          break;
        case 'protect': floater('Proteger', x, y - 8, '#7dd3fc', 1.1, 9); sim.glow = { who: e.who, t: 0, color: '#7dd3fc' }; log(`${who} se protegeu!`); break;
        case 'protected': floater('bloqueou', x, y - 8, '#7dd3fc', 1.1, 9); log(`${who} se protegeu do ataque!`); break;
        case 'wake': log(`${who} acordou!`); break;
        case 'heal': floater(`+${e.amount}`, x, y, '#4ade80'); log(e.drain ? `${who} sugou energia!` : `${who} recuperou HP!`); break;
        case 'recoil': floater(`-${e.amount}`, x, y + 4, '#fca5a5'); log(`${who} sofreu o impacto do golpe!`); break;
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
    floater(`+${res.xp} XP`, leadX + S / 2, groundY - S / 2, '#67e8f9');
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
        toast(`${G.SPECIES[e.from].name} evoluiu para ${G.SPECIES[e.to].name}!`, 4);
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
        handleXpEvents(res.events, G.getLead(state));
        if (res.tm) toast(`Achou a ${res.tm.toUpperCase()}: ${G.MOVES[G.TMS[res.tm].move].name}! (exclusiva)`, 4.5);
        if (res.drop) toast(`Encontrou: ${G.SHOP[res.drop].name}!`, 3);
      }
      G.addCaught(state, w);
      const where = state.box.includes(w) ? ' (foi pra caixa)' : '';
      toast(`Capturou ${name(w)}!${where}`, 3);
      if (w.held) toast(`${G.SPECIES[w.species].name} estava segurando ${G.HELD[w.held].name}!`, 3);
      setPhase('caught');
    } else if (sim.defeated) {
      log(`${name(w)} escapou da cápsula!`);
      floater('Escapou!', wildTargetX + S / 2, groundY - S - 4, '#fca5a5', 1.2, 10);
      // depois de escapar, às vezes foge de vez
      if (Math.random() < (G.SPECIES[w.species].legendary ? 0.25 : 0.1)) {
        toast(`${name(w)} fugiu!`, 3);
        log(`${name(w)} fugiu!`);
        setPhase('win');
      } else {
        const mode = state.settings.catchMode;
        const auto = mode === 'all' || mode === 'new';
        if (auto && sim.catchTries < AUTO_TRIES && pickCapsule(w)) setPhase('retry');
        else if (auto) { toast(`${name(w)} escapou, desisti depois de ${sim.catchTries} tentativa(s)`, 3); setPhase('win'); }
        else openPrompt('retry');
      }
    } else {
      toast('Escapou!');
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
    if (sim.lunge && (sim.lunge.t += dt) > 0.25) sim.lunge = null;
    if (sim.glow && (sim.glow.t += dt) > 0.5) sim.glow = null;
    if (sim.hit && (sim.hit.t += dt) > 0.3) sim.hit = null;
    sim.flash = Math.max(0, sim.flash - dt * 0.8);
    if (sim.phase !== 'rest') sim.anim += dt;

    const lead = G.getLead(state);
    if (!lead) return;
    const max = G.maxHp(lead);
    sim.t += dt;

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
        sim.scroll += dt * 26;
        lead.hp = Math.min(max, lead.hp + max * 0.15 * dt); // cura entre batalhas
        if ((sim.ppT += dt) > 2.5) { // PP volta aos poucos andando
          sim.ppT = 0;
          state.team.forEach((c) => G.restorePp(c, 1));
        }
        if (sim.t >= sim.encounterAt) startEncounter();
        break;

      case 'appear': {
        const k = Math.min(1, sim.t / 0.8);
        sim.wildX = W + 4 + (wildTargetX - W - 4) * (1 - Math.pow(1 - k, 3));
        if (k >= 1) {
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

      case 'shake':
        if (sim.t >= 1.5) finishCapture();
        break;

      case 'win':
        sim.wildAlpha = Math.max(0, 1 - sim.t / 0.8);
        if (sim.t >= 1) endBattle();
        break;

      case 'caught':
        if (sim.t >= 1) endBattle();
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

  // ---------- Desenho (estilo DS) ----------
  // Caixas arredondadas com moldura na cor do tema (Assets.PALETTES), texto com sombra,
  // barras de HP verde/amarelo/vermelho e botões "apertáveis".
  const T = () => A.palette;
  const FONT = '"DotGothic16", "Segoe UI", sans-serif'; // um peso só: o "weight" vira tamanho/sombra

  /** Texto. Dentro de caixa: tinta com sombra clara. outline: branco com contorno escuro (em cima do cenário). */
  function text(str, x, y, { size = 12, color, align = 'left', outline = false, shadow = !outline } = {}) {
    const t = T();
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    x = Math.round(x); y = Math.round(y);
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,22,30,0.9)';
      ctx.strokeText(str, x, y);
    } else if (shadow) {
      ctx.fillStyle = t.shadow;
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = color || (outline ? '#fff' : t.ink);
    ctx.fillText(str, x, y);
  }

  function measure(str, size = 12) {
    ctx.font = `${size}px ${FONT}`;
    return ctx.measureText(str).width;
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1, r);
  }

  /** Janela/caixa da era DS: papel com leve degradê, moldura de 2px no tom do tema e filete claro por dentro. */
  function box(x, y, w, h, { r = 6, frame } = {}) {
    const t = T();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, t.paper);
    g.addColorStop(1, t.paper2);
    rr(x, y, w, h, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = frame || t.frame;
    ctx.stroke();
    if (h > 12) {
      rr(x + 2, y + 2, w - 4, h - 4, Math.max(2, r - 2));
      ctx.lineWidth = 1;
      ctx.strokeStyle = t.frame3;
      ctx.stroke();
    }
  }

  /** Barra de HP/XP: trilho escuro arredondado e preenchimento com brilho em cima. */
  function bar(x, y, w, h, ratio, color) {
    rr(x, y, w, h, h / 2);
    ctx.fillStyle = '#4a4d58';
    ctx.fill();
    const fw = Math.round((w - 2) * G.clamp(ratio, 0, 1));
    if (fw > 0) {
      rr(x + 1, y + 1, fw + 1, h - 2, (h - 2) / 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(Math.round(x) + 2, Math.round(y) + 1, Math.max(0, fw - 2), Math.max(1, Math.floor((h - 2) / 3)));
    }
  }

  const hpColor = (r) => (r > 0.5 ? '#3fcf5c' : r > 0.2 ? '#f4c430' : '#ee4a3c');

  /** Etiqueta "HP" laranja das caixas de batalha. */
  function hpTag(x, y) {
    rr(x, y, 17, 9, 3);
    ctx.fillStyle = '#f08a2c';
    ctx.fill();
    text('HP', x + 8.5, y + 5, { size: 8, weight: 700, color: '#fff', align: 'center', shadow: false });
  }

  /** Setinha ▼ vermelha de "continua", piscando. */
  function arrowDown(x, y) {
    if (Math.floor(performance.now() / 450) % 2) return;
    ctx.fillStyle = '#ee4a3c';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + 7, y); ctx.lineTo(x + 3.5, y + 5); ctx.closePath();
    ctx.fill();
  }

  /** Botão de toque (Sim/Não): degradê, borda escura e "degrau" embaixo; afunda com o mouse em cima. */
  function pillButton(label, x, y, w, h, { primary = false, hover = false } = {}) {
    const t = T();
    const base = primary ? t.frame2 : '#e9ecf2';
    const edge = primary ? t.frame : '#9aa0ad';
    const dy = hover ? 1 : 0;
    rr(x, y + 2, w, h, 6);
    ctx.fillStyle = edge;
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, primary ? '#ffffff55' : '#ffffff');
    g.addColorStop(1, base);
    rr(x, y + dy, w, h, 6);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = edge;
    ctx.stroke();
    text(label, x + w / 2, y + h / 2 + dy + 1, { size: 12, weight: 700, align: 'center', color: primary ? '#fff' : '#3a3a44', shadow: !primary });
  }

  /** Criatura (PNG customizado animado ou pixel art), encaixada numa caixa size×size. */
  function sprite(id, shiny, x, y, { flip = false, alpha = 1, size = S, t = sim.anim } = {}) {
    const sheet = A.creature(id, shiny);
    A.drawSheet(ctx, sheet, A.frameAt(sheet, t), x, y, size, size, { flip, alpha });
  }

  function itemSprite(id, x, y, { size, alpha = 1 } = {}) {
    const sheet = A.item(id);
    A.drawSheet(ctx, sheet, A.frameAt(sheet, sim.t), x, y, size, size, { alpha });
  }

  /** Moldura 9-slice se existir ui/<name>.png; senão, a caixa de texto clássica. */
  function frameBox(name, x, y, w, h) {
    const f = A.ui(name);
    if (f) A.drawNine(ctx, f, x, y, w, h);
    else box(x, y, w, h);
  }

  function icon(name, x, y, size) {
    const f = A.ui(name);
    if (!f) return false;
    ctx.imageSmoothingEnabled = false;
    const k = size / Math.max(f.img.width, f.img.height);
    ctx.drawImage(f.img, Math.round(x), Math.round(y - (f.img.height * k) / 2), Math.round(f.img.width * k), Math.round(f.img.height * k));
    return true;
  }

  function statusBadge(status, x, y) {
    const st = G.STATUS[status];
    rr(x - 1, y - 5, 22, 10, 3);
    ctx.fillStyle = st.color;
    ctx.fill();
    text(st.short, x + 10, y + 1, { size: 8, weight: 700, align: 'center', color: '#fff', shadow: false });
  }

  function drawHud(lead) {
    frameBox('hud', 1, 1, HUD_W - 2, H - 2);
    const max = G.maxHp(lead);
    const midY = H / 2;
    const x0 = 8, x1 = HUD_W - 8;
    text(`${G.SPECIES[lead.species].name}${lead.shiny ? '✦' : ''}`, x0, midY - 12, { size: 13, weight: 700 });
    if (lead.gender) {
      const nw = measure(`${G.SPECIES[lead.species].name}${lead.shiny ? '✦' : ''}`, 13, 700);
      text(lead.gender === 'F' ? '♀' : '♂', x0 + nw + 3, midY - 12, { size: 14, color: lead.gender === 'F' ? '#e0578a' : '#3b7ddd' });
    }
    if (lead.status) statusBadge(lead.status, x1 - 52, midY - 12);
    text(`Nv${lead.level}`, x1, midY - 12, { size: 12, weight: 700, align: 'right' });
    hpTag(x0, midY - 5);
    bar(x0 + 19, midY - 5, x1 - x0 - 19, 9, lead.hp / max, hpColor(lead.hp / max));
    bar(x0 + 19, midY + 5, x1 - x0 - 19, 4, lead.xp / G.xpToNext(lead.level), '#3a9bf0');
    // moedas e cápsulas com os ícones em pixel
    const caps = (state.items.capsula || 0) + (state.items.super || 0);
    const yRow = midY + 15;
    if (!icon('coin', x0 - 1, yRow, 11)) A.drawSheet(ctx, A.creature('_coin'), 0, x0 - 1, yRow - 6, 11, 11);
    text(`${state.coins}`, x0 + 12, yRow, { size: 11, weight: 600 });
    const cw = measure(String(caps), 11, 600);
    if (!icon('capsule', x1 - cw - 13, yRow, 11)) A.drawSheet(ctx, A.item('capsula'), 0, x1 - cw - 13, yRow - 6, 11, 11);
    text(`${caps}`, x1, yRow, { size: 11, weight: 600, align: 'right' });
  }

  function drawGround() {
    // Tiles infinitos: fundo (parallax lento) + chão, rolando enquanto o líder anda.
    if (bg) {
      const h = bg.img.height * bgScale;
      A.drawTiled(ctx, bg.img, bgScale, sim.scroll * (bg.cfg.speed ?? 0.35), 0, W, H - h + (bg.cfg.offsetY || 0) * bgScale);
    }
    if (ground) {
      const h = ground.img.height * groundScale;
      A.drawTiled(ctx, ground.img, groundScale, sim.scroll * (ground.cfg.speed ?? 1), 0, W, H - h);
      return;
    }
    if (bg) return;
    const zone = G.ZONES.find((z) => z.id === state.zone) || G.ZONES[0];
    ctx.fillStyle = zone.color;
    ctx.globalAlpha = 0.9;
    const span = W - HUD_W;
    for (let i = 0; i < Math.ceil(span / 34) + 1; i++) {
      const x = HUD_W + ((((i * 34 - sim.scroll) % span) + span) % span);
      ctx.fillRect(Math.round(x), groundY - 2, 2, 2);
      ctx.fillRect(Math.round(x) + 3, groundY - 3, 2, 3);
    }
    ctx.globalAlpha = 1;
  }

  // pisca quando leva dano; brilho colorido quando usa golpe de status
  const blinkAlpha = (who) => (sim.hit && sim.hit.who === who && Math.floor(sim.hit.t * 20) % 2 === 0 ? 0.25 : 1);

  function drawGlow(who, x, y) {
    if (!sim.glow || sim.glow.who !== who) return;
    const k = sim.glow.t / 0.5;
    ctx.save();
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.fillStyle = sim.glow.color || '#fff';
    ctx.beginPath();
    ctx.arc(x + S / 2, y + S / 2, S * (0.45 + k * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function lungeOffset(who) {
    if (!sim.lunge || sim.lunge.who !== who) return 0;
    return Math.round(Math.sin((Math.PI * sim.lunge.t) / 0.25) * 7);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (cursor) hover(cursor.x, cursor.y); // a cena muda embaixo do cursor parado (ex.: a pergunta aparece)
    if (sim.hit && sim.hit.crit) ctx.translate(Math.round(Math.sin(sim.hit.t * 90) * 2), 0); // tremidinha no crítico
    layout();
    const lead = G.getLead(state);

    if (!state.starterChosen || !lead) {
      frameBox('hud', 1, 1, W - 2, H - 2);
      text('Clique aqui pra escolher seu parceiro!', W / 2, H / 2, { size: 14, weight: 700, align: 'center' });
      arrowDown(W - 16, H - 13);
      return;
    }

    drawGround();
    const y = groundY - S;

    // líder
    const walking = sim.phase === 'walk';
    const animated = A.creature(lead.species, lead.shiny).frames > 1; // folha animada dispensa o "pulinho"
    const bob = walking && !animated ? Math.round(Math.abs(Math.sin(sim.t * 9)) * -2) : 0;
    const resting = sim.phase === 'rest';
    drawGlow('lead', leadX, y);
    sprite(lead.species, lead.shiny, leadX + lungeOffset('lead'), y + bob, { alpha: resting ? 0.45 : blinkAlpha('lead') });
    if (resting) text('z', leadX + S + 2 + Math.sin(sim.t * 3) * 2, y + 4 - ((sim.t * 6) % 8), { size: 10, color: '#c7d2fe' });
    if (sim.flash > 0) {
      ctx.globalAlpha = sim.flash;
      ctx.fillStyle = '#fff';
      ctx.fillRect(leadX - 2, y - 2, S + 4, S + 4);
      ctx.globalAlpha = 1;
    }

    // selvagem
    const w = sim.wild;
    if (w && sim.phase !== 'shake' && sim.phase !== 'caught') {
      const wx = sim.wildX - lungeOffset('wild');
      drawGlow('wild', wx, y);
      // derrotado: fica caído e meio apagado esperando a captura
      sprite(w.species, w.shiny, wx, y, { flip: true, alpha: (sim.defeated ? 0.5 : 1) * sim.wildAlpha * blinkAlpha('wild'), t: sim.defeated ? 0 : sim.anim });
      if (sim.defeated && sim.phase === 'down') {
        text('clique pra capturar', wx + S / 2, y - 6, { size: 11, weight: 700, align: 'center', outline: true });
      }
      if (!sim.defeated && ['appear', 'fight', 'throw'].includes(sim.phase)) {
        const max = G.maxHp(w);
        // plaquinha do selvagem (como no topo da tela de batalha): nome, nível e HP
        const label = `${G.SPECIES[w.species].name}${w.gender ? (w.gender === 'F' ? '♀' : '♂') : ''}${w.shiny ? '✦' : ''} Nv${w.level}`;
        const lw = Math.max(52, Math.ceil(measure(label, 11, 700)) + 12);
        const lx = Math.round(Math.min(W - lw - 2, Math.max(HUD_W + 2, wx + S / 2 - lw / 2)));
        const ly = Math.max(0, y - 19);
        box(lx, ly, lw, 18, { r: 5 });
        text(label, lx + lw / 2, ly + 7, { size: 11, weight: 700, align: 'center' });
        bar(lx + 4, ly + 12, lw - 8, 4, w.hp / max, hpColor(w.hp / max));
        if (w.status) statusBadge(w.status, lx + lw + 3, ly + 9);
      }
    }

    // cápsula
    const capSize = Math.round(S / 2);
    if (sim.phase === 'throw') {
      const k = sim.t / 0.55;
      const x0 = leadX + S, x1 = wildTargetX + S / 4;
      const cx = x0 + (x1 - x0) * k;
      const cy = y + S / 3 - Math.sin(Math.PI * k) * (H * 0.35);
      itemSprite(sim.capsule.item, cx, cy, { size: capSize });
    } else if (sim.phase === 'shake' || (sim.phase === 'caught')) {
      const wob = sim.phase === 'shake' ? Math.round(Math.sin(sim.t * 14) * 2) * (Math.floor(sim.t / 0.5) % 2) : 0;
      itemSprite(sim.capsule.item, wildTargetX + S / 4 + wob, groundY - capSize, { size: capSize, alpha: sim.phase === 'caught' ? 1 - sim.t : 1 });
    }

    // números flutuando
    for (const f of sim.floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      // números/nomes flutuando: tom claro com contorno escuro (no Color, a cor do evento)
      const fs = (f.size || 10) >= 12 ? 15 : 11;
      const half = measure(f.text, fs, 700) / 2 + 2; // não deixa o texto entrar embaixo do HUD nem sair da faixa
      const fx = Math.min(W - half, Math.max(HUD_W + half, f.x));
      text(f.text, fx, f.y - f.t * 12, { size: fs, weight: 700, align: 'center', color: f.color, outline: true });
      ctx.globalAlpha = 1;
    }

    drawHud(lead);

    if (debug && debug.on) {
      const hit = cursor ? hitTest(cursor.x, cursor.y) : null;
      const lines = [
        `mouse ${cursor ? `${Math.round(cursor.x)},${Math.round(cursor.y)}` : '—'} ${hit || '-'} · ${clickThrough ? 'atravessa' : 'PEGA'} · dpr ${dpr}`,
        `sistema ${debug.pt ? `${debug.pt.x - debug.b.x},${debug.pt.y - debug.b.y}` : '—'} · botão ${debug.reader ? 'lido' : 'SEM leitor'} · clique ${debug.lastClick || '—'}`,
      ];
      ctx.fillStyle = 'rgba(20,22,30,0.9)';
      ctx.fillRect(HUD_W, H - 22, W - HUD_W, 22);
      lines.forEach((l, i) => text(l, HUD_W + 4, H - 16 + i * 10, { size: 9, weight: 400, color: '#cdf5dc', shadow: false }));
    }
    // pergunta de captura (no lugar dos avisos enquanto espera resposta)
    sim.askRects = null;
    if (sim.phase === 'prompt' && sim.wild) {
      const w2 = sim.wild;
      const nm = `${G.SPECIES[w2.species].name}${w2.gender ? (w2.gender === 'F' ? '♀' : '♂') : ''}`;
      const left = Math.max(0, Math.ceil(PROMPT_S - sim.t));
      const q = sim.prompt === 'retry'
        ? `Escapou! Tentar outra? (${left}s)`
        : `Capturar ${nm}${state.dex.caught[w2.species] ? '' : ' (novo!)'}? (${left}s)`;
      // caixa de mensagem com a pergunta + botões Sim / Não (afundam com o mouse em cima)
      const qw = measure(q, 12, 600);
      const bw = 38, bh = 15, gap = 5;
      const total = Math.ceil(qw) + 20 + bw * 2 + gap;
      const qx = Math.round(Math.max(HUD_W + 2, Math.min(W - total - 2, (HUD_W + W) / 2 - total / 2)));
      frameBox('toast', qx, 1, total, 21);
      text(q, qx + 9, 12, { size: 12 });
      const yesX = qx + total - bw * 2 - gap - 4, noX = yesX + bw + gap;
      const over = cursor && hitTest(cursor.x, cursor.y);
      pillButton('Sim', yesX, 2, bw, bh, { primary: true, hover: over === 'askYes' });
      pillButton('Não', noX, 2, bw, bh, { hover: over === 'askNo' });
      sim.askRects = { yes: [yesX, 1, bw, 20], no: [noX, 1, bw, 20] };
    } else if (sim.toast) {
      // mensagem: caixa de texto no topo com a setinha ▼ vermelha piscando
      const t = sim.toast;
      const a = Math.min(1, t.t / 0.15, (t.seconds - t.t) / 0.25);
      ctx.globalAlpha = Math.max(0, a);
      const tw = Math.ceil(measure(t.text, 12, 600)) + 26;
      const tx = Math.round(Math.max(HUD_W + 2, Math.min(W - tw - 2, (HUD_W + W) / 2 - tw / 2)));
      frameBox('toast', tx, 1, tw, 19);
      text(t.text, tx + 9, 11, { size: 12 });
      arrowDown(tx + tw - 13, 9);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Mouse ----------
  // A janela ignora o mouse (cliques passam pra barra de tarefas), exceto em cima do HUD
  // e das criaturas. O Electron continua mandando mousemove pra gente decidir isso.
  let clickThrough = true;

  function hitTest(x, y) {
    if (!state.starterChosen) return 'hud';
    const r = sim.askRects;
    const inR = (q) => q && x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3];
    if (r && inR(r.yes)) return 'askYes';
    if (r && inR(r.no)) return 'askNo';
    const top = groundY - S;
    if (x < HUD_W) return 'hud';
    if (x >= leadX && x <= leadX + S && y >= top) return 'lead';
    if (sim.wild && ['fight', 'down'].includes(sim.phase) && x >= sim.wildX && x <= sim.wildX + S && y >= top - 14) return 'wild';
    return null;
  }

  // Liga/desliga o "clique atravessa" conforme o que está embaixo do cursor.
  // A posição vem SÓ do mousemove da página (coordenadas exatas). A posição do sistema que o main
  // consulta pode vir deslocada com escala de DPI, e misturar as duas fazia o clique atravessar.
  let cursor = null; // último mousemove (pra reavaliar quando a cena muda embaixo do mouse parado)
  let lastMove = 0;
  function hover(x, y) {
    cursor = x == null ? null : { x, y };
    const hit = cursor ? hitTest(x, y) : null;
    canvas.style.cursor = hit ? 'pointer' : 'default';
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
    if (hit === 'hud' || hit === 'lead') bridge.openPanel();
    if (hit === 'askYes') answerCatch(true);
    if (hit === 'askNo') answerCatch(false);
    if (hit === 'wild') {
      const item = pickCapsule(sim.wild);
      if (!item) toast('Sem cápsulas! Compre no painel.');
      else if (sim.phase === 'down') autoThrow();
      else throwCapsule(item);
    }
  }
  window.addEventListener('click', (e) => act(e.clientX, e.clientY, 'janela'));
  // só leitura, pra diagnóstico/testes: o que está embaixo de um ponto da faixa
  window.__taskmon = { hit: (x, y) => hitTest(x, y) };
  bridge.onPress((p) => act(p.x, p.y, 'windows'));

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
      case 'catchAnswer':
        answerCatch(cmd.yes);
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

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.25) * SPEED;
    last = now;
    update(dt);
    draw();
    if ((syncTimer += dt / SPEED) > 1) { syncTimer = 0; sync(); }
    if ((saveTimer += dt / SPEED) > 10) { saveTimer = 0; save(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('beforeunload', save);
  sync();
  requestAnimationFrame(frame);
})();
