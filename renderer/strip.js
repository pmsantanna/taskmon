// A faixa que fica em cima da barra de tarefas: loop do jogo, animações e cliques.
// Este arquivo é o "dono" do estado do jogo; o painel só manda comandos e recebe cópias.

(async () => {
  'use strict';
  const G = window.Game;
  const SP = window.Sprites;
  const bridge = window.bridge;

  // ?speed=10 na URL acelera tudo (útil pra testar no navegador)
  const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  // ---------- Layout ----------
  const HUD_W = 122;
  let W = 0, H = 0, S = 24, groundY = 0, leadX = 0, wildTargetX = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    S = Math.max(24, Math.round((H * 0.6) / 12) * 12); // múltiplo de 12 = pixels nítidos
    groundY = H - 3;
    leadX = HUD_W + 18;
    wildTargetX = Math.min(W - S - 8, leadX + S + 56);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Estado ----------
  const saved = await bridge.load();
  let state = saved && saved.version === 1 ? { ...G.newGame(), ...saved } : G.newGame();

  const sim = {
    phase: 'walk', t: 0, encounterAt: 3,
    wild: null, wildX: 0, wildAlpha: 1,
    turnT: 0, nextAttacker: 'lead', autoTries: 0,
    lunge: null, floaters: [], capsule: null,
    toasts: [], toast: null, flash: 0, scroll: 0,
  };

  const name = (c) => G.SPECIES[c.species].name + (c.shiny ? ' ✨' : '');
  const nextEncounter = () => G.rand(Math.random, 5, 10);

  // ---------- Mensagens ----------
  function toast(text, seconds = 2.6) {
    sim.toasts.push({ text, seconds });
  }

  function floater(text, x, y, color = '#fff') {
    sim.floaters.push({ text, x, y, t: 0, color });
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
        ? { species: w.species, level: w.level, hp: w.hp, max: G.maxHp(w), shiny: w.shiny }
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
    setPhase('appear');
    if (sim.wild.shiny) toast(`Um ${name(sim.wild)} brilhante apareceu!`, 4);
    sync();
  }

  function setPhase(p) {
    sim.phase = p;
    sim.t = 0;
  }

  function endBattle() {
    sim.wild = null;
    sim.capsule = null;
    setPhase('walk');
    sim.encounterAt = nextEncounter();
  }

  function attack(who) {
    const lead = G.getLead(state);
    const [att, def] = who === 'lead' ? [lead, sim.wild] : [sim.wild, lead];
    const r = G.damage(att, def);
    def.hp = Math.max(0, def.hp - r.amount);
    sim.lunge = { who, t: 0 };
    const x = who === 'lead' ? sim.wildX + S / 2 : leadX + S / 2;
    const color = r.mult > 1 ? '#fb923c' : r.mult < 1 ? '#a8a29e' : '#fff';
    floater(`${r.amount}${r.crit ? '!' : ''}`, x, groundY - S / 2, color);

    if (sim.wild.hp <= 0) win();
    else if (lead.hp <= 0) faint();
  }

  function win() {
    const lead = G.getLead(state);
    const res = G.rewardWin(state, sim.wild);
    floater(`+${res.xp} XP`, leadX + S / 2, groundY - S / 2, '#67e8f9');
    handleXpEvents(res.events, lead);
    setPhase('win');
    save();
    sync();
  }

  function handleXpEvents(events, c) {
    for (const e of events) {
      if (e.type === 'levelup') toast(`${G.SPECIES[c.species].name} subiu pro nível ${e.level}!`);
      if (e.type === 'evolve') {
        toast(`${G.SPECIES[e.from].name} evoluiu para ${G.SPECIES[e.to].name}!`, 4);
        sim.flash = 1;
      }
    }
  }

  function faint() {
    toast(`${name(G.getLead(state))} desmaiou… descansando`);
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
      G.addCaught(state, w);
      const where = state.box.includes(w) ? ' (foi pra caixa)' : '';
      toast(`Capturou ${name(w)}!${where}`, 3);
      setPhase('caught');
    } else {
      toast('Escapou!');
      sim.nextAttacker = 'wild';
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
    sim.floaters = sim.floaters.filter((f) => (f.t += dt) < 1.1);
    if (sim.lunge && (sim.lunge.t += dt) > 0.25) sim.lunge = null;
    sim.flash = Math.max(0, sim.flash - dt * 0.8);

    const lead = G.getLead(state);
    if (!lead) return;
    const max = G.maxHp(lead);
    sim.t += dt;

    switch (sim.phase) {
      case 'walk':
        sim.scroll += dt * 26;
        lead.hp = Math.min(max, lead.hp + max * 0.15 * dt); // cura entre batalhas
        if (sim.t >= sim.encounterAt) startEncounter();
        break;

      case 'appear': {
        const k = Math.min(1, sim.t / 0.8);
        sim.wildX = W + 4 + (wildTargetX - W - 4) * (1 - Math.pow(1 - k, 3));
        if (k >= 1) {
          sim.nextAttacker = G.stats(lead).spd >= G.stats(sim.wild).spd ? 'lead' : 'wild';
          sim.turnT = 0.4;
          setPhase('fight');
        }
        break;
      }

      case 'fight':
        sim.turnT -= dt;
        if (sim.turnT <= 0) {
          if (sim.nextAttacker === 'lead' && shouldAutoCatch()) {
            sim.autoTries++;
            throwCapsule(pickCapsule(sim.wild));
            break;
          }
          attack(sim.nextAttacker);
          sim.nextAttacker = sim.nextAttacker === 'lead' ? 'wild' : 'lead';
          sim.turnT = 0.8;
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

  function sprite(id, shiny, x, y, { flip = false, alpha = 1, size = S } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate(Math.round(x + size), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(SP.getSprite(id, shiny), 0, 0, size, size);
    } else {
      ctx.drawImage(SP.getSprite(id, shiny), Math.round(x), Math.round(y), size, size);
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawHud(lead) {
    roundRect(2, 3, HUD_W - 4, H - 6, 6, 'rgba(12,10,9,0.55)');
    const max = G.maxHp(lead);
    const midY = H / 2;
    text(`${G.SPECIES[lead.species].name}${lead.shiny ? '✨' : ''}`, 9, midY - 12, { size: 11 });
    text(`Nv ${lead.level}`, HUD_W - 9, midY - 12, { size: 10, color: '#d6d3d1', align: 'right' });
    bar(9, midY - 3, HUD_W - 18, 4, lead.hp / max, hpColor(lead.hp / max));
    bar(9, midY + 3, HUD_W - 18, 2, lead.xp / G.xpToNext(lead.level), '#38bdf8');
    const caps = (state.items.capsula || 0) + (state.items.super || 0);
    text(`🪙 ${state.coins}`, 9, midY + 13, { size: 10, color: '#fde68a' });
    text(`◓ ${caps}`, HUD_W - 9, midY + 13, { size: 10, color: '#99f6e4', align: 'right' });
  }

  function drawGround() {
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

  function lungeOffset(who) {
    if (!sim.lunge || sim.lunge.who !== who) return 0;
    return Math.round(Math.sin((Math.PI * sim.lunge.t) / 0.25) * 7);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const lead = G.getLead(state);

    if (!state.starterChosen || !lead) {
      roundRect(2, 3, W - 4, H - 6, 6, 'rgba(12,10,9,0.6)');
      text('Clique aqui pra escolher seu parceiro!', W / 2, H / 2, { size: 12, align: 'center', color: '#fde68a' });
      return;
    }

    drawGround();
    const y = groundY - S;

    // líder
    const walking = sim.phase === 'walk';
    const bob = walking ? Math.round(Math.abs(Math.sin(sim.t * 9)) * -2) : 0;
    const resting = sim.phase === 'rest';
    sprite(lead.species, lead.shiny, leadX + lungeOffset('lead'), y + bob, { alpha: resting ? 0.45 : 1 });
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
      sprite(w.species, w.shiny, wx, y, { flip: true, alpha: sim.wildAlpha });
      if (['appear', 'fight', 'throw'].includes(sim.phase)) {
        const max = G.maxHp(w);
        const label = `${G.SPECIES[w.species].name} ${w.level}`;
        text(label, wx + S / 2, y - 12, { size: 9, align: 'center', color: w.shiny ? '#fde047' : '#e7e5e4' });
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
      sprite('_capsula', false, cx, cy, { size: capSize });
    } else if (sim.phase === 'shake' || (sim.phase === 'caught')) {
      const wob = sim.phase === 'shake' ? Math.round(Math.sin(sim.t * 14) * 2) * (Math.floor(sim.t / 0.5) % 2) : 0;
      sprite('_capsula', false, wildTargetX + S / 4 + wob, groundY - capSize, { size: capSize, alpha: sim.phase === 'caught' ? 1 - sim.t : 1 });
    }

    // números flutuando
    for (const f of sim.floaters) {
      ctx.globalAlpha = 1 - f.t / 1.1;
      text(f.text, f.x, f.y - f.t * 12, { size: 10, align: 'center', color: f.color });
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
      roundRect(tx, 2, tw, 14, 7, 'rgba(12,10,9,0.85)');
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
        if (G.buy(state, cmd.item, cmd.qty)) toast(`Comprou ${cmd.qty}× ${G.SHOP[cmd.item].name}`);
        else toast('Moedas insuficientes');
        break;
      case 'autoCatch':
        state.settings.autoCatch = !!cmd.value;
        break;
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
