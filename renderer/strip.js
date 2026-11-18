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
  [...state.team, ...state.box, ...state.daycare.mons].forEach((c) => G.ensureMoves(c));
  await A.load();
  layout();

  const sim = {
    phase: 'walk', t: 0, encounterAt: 3,
    wild: null, wildX: 0, wildAlpha: 1,
    turnT: 0, queue: [], bl: null, bw: null, log: [], autoTries: 0, ppT: 0,
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
      battle: w && ['appear', 'fight', 'throw', 'shake'].includes(sim.phase)
        ? { species: w.species, level: w.level, hp: w.hp, max: G.maxHp(w), shiny: w.shiny, status: w.status || null, moves: w.moves, log: sim.log }
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
    sim.autoTries = 0;
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
    if (!sim.queue.length) {
      if (shouldAutoCatch()) {
        sim.autoTries++;
        throwCapsule(pickCapsule(sim.wild));
        return 0;
      }
      startRound();
    }
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
    setPhase('win');
    save();
    sync();
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
    const rare = G.SPECIES[wild.species].catch < 0.15;
    if (rare && state.items.super > 0) return 'super';
    if (state.items.capsula > 0) return 'capsula';
    if (state.items.super > 0) return 'super';
    return null;
  }

  function shouldAutoCatch() {
    const w = sim.wild;
    return state.settings.autoCatch
      && sim.autoTries < 2
      && pickCapsule(w)
      && w.hp / G.maxHp(w) < 0.4
      && (!state.dex.caught[w.species] || w.shiny);
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
      const res = G.rewardWin(state, w);
      handleXpEvents(res.events, G.getLead(state));
      if (res.tm) toast(`Achou a ${res.tm.toUpperCase()}: ${G.MOVES[G.TMS[res.tm].move].name}! (exclusiva)`, 4.5);
      if (res.drop) toast(`Encontrou: ${G.SHOP[res.drop].name}!`, 3);
      G.addCaught(state, w);
      const where = state.box.includes(w) ? ' (foi pra caixa)' : '';
      toast(`Capturou ${name(w)}!${where}`, 3);
      if (w.held) toast(`${G.SPECIES[w.species].name} estava segurando ${G.HELD[w.held].name}!`, 3);
      setPhase('caught');
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

  // ---------- Desenho ----------
  function text(str, x, y, { size = 10, color = '#fff', align = 'left', bold = true } = {}) {
    ctx.font = `${bold ? '600 ' : ''}${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.round(w * G.clamp(ratio, 0, 1)), h);
  }

  function hpColor(r) {
    return r > 0.5 ? '#4ade80' : r > 0.2 ? '#facc15' : '#ef4444';
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

  /** Moldura 9-slice se existir ui/<name>.png; senão, retângulo arredondado. */
  function frameBox(name, x, y, w, h, r, fill) {
    const f = A.ui(name);
    if (f) A.drawNine(ctx, f, x, y, w, h);
    else roundRect(x, y, w, h, r, fill);
  }

  function icon(name, x, y, size) {
    const f = A.ui(name);
    if (!f) return false;
    ctx.imageSmoothingEnabled = false;
    const k = size / Math.max(f.img.width, f.img.height);
    ctx.drawImage(f.img, Math.round(x), Math.round(y - (f.img.height * k) / 2), Math.round(f.img.width * k), Math.round(f.img.height * k));
    return true;
  }

  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function statusBadge(status, x, y) {
    const st = G.STATUS[status];
    roundRect(x - 1, y - 5, 20, 10, 3, st.color);
    text(st.short, x + 9, y, { size: 7, align: 'center', color: '#0c0a09' });
  }

  function drawHud(lead) {
    frameBox('hud', 2, 3, HUD_W - 4, H - 6, 6, 'rgba(12,10,9,0.55)');
    const max = G.maxHp(lead);
    const midY = H / 2;
    text(`${G.SPECIES[lead.species].name}${lead.shiny ? '✨' : ''}`, 9, midY - 12, { size: 11 });
    if (lead.status) statusBadge(lead.status, HUD_W - 52, midY - 12);
    text(`Nv ${lead.level}`, HUD_W - 9, midY - 12, { size: 10, color: '#d6d3d1', align: 'right' });
    bar(9, midY - 3, HUD_W - 18, 4, lead.hp / max, hpColor(lead.hp / max));
    bar(9, midY + 3, HUD_W - 18, 2, lead.xp / G.xpToNext(lead.level), '#38bdf8');
    const caps = (state.items.capsula || 0) + (state.items.super || 0);
    if (icon('coin', 9, midY + 13, 10)) text(`${state.coins}`, 22, midY + 13, { size: 10, color: '#fde68a' });
    else text(`🪙 ${state.coins}`, 9, midY + 13, { size: 10, color: '#fde68a' });
    const capsW = (ctx.font = '600 10px "Segoe UI", system-ui, sans-serif', ctx.measureText(String(caps)).width);
    if (icon('capsule', HUD_W - 9 - capsW - 13, midY + 13, 10)) text(`${caps}`, HUD_W - 9, midY + 13, { size: 10, color: '#99f6e4', align: 'right' });
    else text(`◓ ${caps}`, HUD_W - 9, midY + 13, { size: 10, color: '#99f6e4', align: 'right' });
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
    ctx.globalAlpha = 0.8;
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
    if (sim.hit && sim.hit.crit) ctx.translate(Math.round(Math.sin(sim.hit.t * 90) * 2), 0); // tremidinha no crítico
    layout();
    const lead = G.getLead(state);

    if (!state.starterChosen || !lead) {
      frameBox('hud', 2, 3, W - 4, H - 6, 6, 'rgba(12,10,9,0.6)');
      text('Clique aqui pra escolher seu parceiro!', W / 2, H / 2, { size: 12, align: 'center', color: '#fde68a' });
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
      sprite(w.species, w.shiny, wx, y, { flip: true, alpha: sim.wildAlpha * blinkAlpha('wild') });
      if (['appear', 'fight', 'throw'].includes(sim.phase)) {
        const max = G.maxHp(w);
        const label = `${G.SPECIES[w.species].name}${w.gender ? (w.gender === 'F' ? '♀' : '♂') : ''} ${w.level}`;
        text(label, wx + S / 2, y - 12, { size: 9, align: 'center', color: w.shiny ? '#fde047' : '#e7e5e4' });
        if (w.status) statusBadge(w.status, Math.round(wx + S / 2 + 18), y - 5);
        bar(Math.round(wx + S / 2 - 15), y - 6, 30, 3, w.hp / max, hpColor(w.hp / max));
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
      text(f.text, f.x, f.y - f.t * 12, { size: f.size || 10, align: 'center', color: f.color });
      ctx.globalAlpha = 1;
    }

    drawHud(lead);

    // aviso
    if (sim.toast) {
      const t = sim.toast;
      const a = Math.min(1, t.t / 0.2, (t.seconds - t.t) / 0.3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(t.text).width + 14;
      const tx = Math.max(HUD_W + 4, Math.min(W - tw - 4, (HUD_W + W) / 2 - tw / 2));
      frameBox('toast', tx, 2, tw, 14, 7, 'rgba(12,10,9,0.85)');
      text(t.text, tx + tw / 2, 9, { size: 10, align: 'center', color: '#fef3c7' });
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Mouse ----------
  // A janela ignora o mouse (cliques passam pra barra de tarefas), exceto em cima do HUD
  // e das criaturas. O Electron continua mandando mousemove pra gente decidir isso.
  let clickThrough = true;

  function hitTest(x, y) {
    if (!state.starterChosen) return 'hud';
    const top = groundY - S;
    if (x < HUD_W) return 'hud';
    if (x >= leadX && x <= leadX + S && y >= top) return 'lead';
    if (sim.wild && sim.phase === 'fight' && x >= sim.wildX && x <= sim.wildX + S && y >= top - 14) return 'wild';
    return null;
  }

  window.addEventListener('mousemove', (e) => {
    const hit = hitTest(e.clientX, e.clientY);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    if (!!hit === clickThrough) {
      clickThrough = !hit;
      bridge.setClickThrough(clickThrough);
    }
  });

  document.addEventListener('mouseleave', () => {
    clickThrough = true;
    bridge.setClickThrough(true);
  });

  window.addEventListener('click', (e) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit === 'hud' || hit === 'lead') bridge.openPanel();
    if (hit === 'wild') {
      const item = pickCapsule(sim.wild);
      if (item) throwCapsule(item);
      else toast('Sem cápsulas! Compre no painel.');
    }
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
      case 'autoCatch':
        state.settings.autoCatch = !!cmd.value;
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
