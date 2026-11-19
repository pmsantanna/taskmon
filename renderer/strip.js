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
  // A faixa segue o design do Claude Design (strip-ui.js desenha as placas em HTML por cima);
  // aqui ficam só as medidas da cena onde os bichos andam, em px da janela.
  let W = 0, H = 0, S = 24, groundY = 0, leadX = 0, wildTargetX = 0;
  let sceneL = 0, sceneR = 0, k = 0.5; // k = px de tela por px do design 2× (altura/104)
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

  // Posições da cena (recalculadas todo quadro; o retângulo vem da camada HTML).
  let ground = null, groundScale = 1, bg = null, bgScale = 1;
  function layout() {
    k = H / 104;
    ground = A.tile(state.zone, 'ground');
    bg = A.tile(state.zone, 'bg');
    if (ground) groundScale = ground.cfg.scale || Math.max(1, Math.round((H * 0.28) / ground.img.height));
    if (bg) bgScale = bg.cfg.scale || H / bg.img.height;
    const r = window.StripUI && StripUI.sceneRect();
    sceneL = r ? r.left : W * 0.3;
    sceneR = r ? r.right : W * 0.7;
    S = Math.round(42 * k);                  // bicho: 42 px de altura no design
    groundY = Math.round(H - 7 * k);         // pés: 2 px do chão + 5 px de folga da plataforma
    const walkSpan = Math.max(0, sceneR - sceneL - S - 36 * k);
    if (sim && sim.phase === 'walk' && walkSpan > 0) {
      // passeia de um lado pro outro (o "stroll" do design), virando no fim
      const period = 12, t = (sim.walkT || 0) % period;
      const kx = t < period / 2 ? t / (period / 2) : 2 - t / (period / 2);
      leadX = Math.round(sceneL + 18 * k + walkSpan * kx);
      sim.walkFlip = t >= period / 2;
    } else {
      leadX = Math.round(sceneL + 18 * k);
      if (sim) sim.walkFlip = false;
    }
    wildTargetX = Math.round(sceneR - 14 * k - S);
    // a cena muda de largura (o diálogo da pergunta ocupa espaço): o selvagem acompanha
    if (sim && sim.wild && sim.phase !== 'appear') sim.wildX = wildTargetX;
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
  StripUI.init(document.body);
  A.onChange(() => StripUI.icons());
  // fontes de pixel antes do primeiro desenho (sem travar se demorarem)
  let sim = null; // definido logo abaixo; layout() checa
  await Promise.race([
    Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 16px "Pixelify Sans"`))).catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  layout();

  sim = {
    phase: 'walk', t: 0, encounterAt: 3,
    wild: null, wildX: 0, wildAlpha: 1,
    turnT: 0, queue: [], bl: null, bw: null, log: [], ppT: 0, defeated: false, catchTries: 0, prompt: null,
    walkT: 0, walkFlip: false, lastReward: null, xpGain: 0, xpGainT: 0, alertT: 0, sparkT: 0,
    lunge: null, floaters: [], capsule: null,
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
    sim.wildX = W + 4;
    sim.wildAlpha = 1;
    sim.defeated = false;
    sim.catchTries = 0;
    sim.prompt = null;
    sim.queue = [];
    sim.log = [`Um ${name(sim.wild)} selvagem nv ${sim.wild.level} apareceu!`];
    setPhase('appear');
    sim.alertT = 1.6; // "!" em cima do selvagem
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
    sim.lastReward = res;
    sim.xpGain = res.xp;
    sim.xpGainT = 3; // "+XP" ao lado da barra de EXP
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
      const r = sim.lastReward;
      const sub = [r ? `+${r.xp} EXP` : '', r ? `+${r.coins} moedas` : '', state.box.includes(w) ? 'foi pra caixa' : 'registrado na Dex'].filter(Boolean).join(' · ');
      toast(`Oba! ${G.SPECIES[w.species].name.toUpperCase()}${w.shiny ? ' ✦' : ''} foi capturado!`, 4.5, { sub, kind: 'success' });
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
    sim.alertT = Math.max(0, sim.alertT - dt);
    sim.xpGainT = Math.max(0, sim.xpGainT - dt);
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
        sim.walkT += dt;
        lead.steps = (lead.steps || 0) + dt * 2; // ~2 passos por segundo andando
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

  // ---------- Desenho da cena (canvas) ----------
  // As placas, diálogos e botões são HTML (strip-ui.js). O canvas desenha o céu/chão, os bichos,
  // a cápsula, os números flutuando, o "!" do encontro e as faíscas da captura.
  const FONT = '"Pixelify Sans", monospace';

  /** Texto do canvas (números flutuando): branco com contorno escuro. */
  function text(str, x, y, { size = 12, weight = 700, color = '#fff', align = 'center', outline = true } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    x = Math.round(x); y = Math.round(y);
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, size / 4);
      ctx.strokeStyle = '#383840';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function measure(str, size = 12, weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(str).width;
  }

  function ellipse(cx, cy, rx, ry, color) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** Plataforma oval embaixo de um bicho (52×12 no design). */
  function platform(x, w) {
    ellipse(x + w / 2, H - 8 * k, 26 * k, 6 * k, '#7cb45a');
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

  function drawGround() {
    // céu e grama em faixas, como no design (20/14/18/22 px do topo, o resto é grama)
    const bands = [[20, '#c4e6f6'], [14, '#d8f0ee'], [18, '#bfe6a0'], [22, '#acdc8c'], [999, '#98ce78']];
    let y0 = 0;
    for (const [h, c] of bands) {
      const hh = Math.min(H - y0, Math.ceil(h * k));
      ctx.fillStyle = c;
      ctx.fillRect(0, Math.floor(y0), W, hh + 1);
      y0 += h * k;
      if (y0 >= H) break;
    }
    // tiles customizados da zona (pasta de sprites) por cima, rolando enquanto anda
    if (bg) {
      const h = bg.img.height * bgScale;
      A.drawTiled(ctx, bg.img, bgScale, sim.scroll * (bg.cfg.speed ?? 0.35), 0, W, H - h + (bg.cfg.offsetY || 0) * bgScale);
    }
    if (ground) {
      const h = ground.img.height * groundScale;
      A.drawTiled(ctx, ground.img, groundScale, sim.scroll * (ground.cfg.speed ?? 1), 0, W, H - h);
    }
  }

  /** "!" de alerta em cima do selvagem quando ele aparece (balãozinho do design). */
  function drawAlert(x, y) {
    const w = 22 * k, h = 26 * k, dy = Math.floor(sim.alertT * 5) % 2 ? -5 * k : 0;
    const bx = Math.round(x - w / 2), by = Math.round(y - h + dy);
    ctx.fillStyle = '#566072';
    ctx.beginPath(); ctx.roundRect(bx, by, Math.round(w), Math.round(h), 6 * k); ctx.fill();
    ctx.fillStyle = '#f8f8f8';
    ctx.beginPath(); ctx.roundRect(bx + 3 * k, by + 3 * k, Math.round(w - 6 * k), Math.round(h - 6 * k), 3 * k); ctx.fill();
    text('!', bx + w / 2, by + h / 2 + k, { size: Math.round(17 * k), color: '#c82838', outline: false });
  }

  /** Faísca em "+" (captura), piscando. */
  function spark(x, y, s, on) {
    if (!on) return;
    const q = Math.max(1, Math.round(6 * k * s));
    ctx.fillStyle = '#fff6a8';
    ctx.fillRect(x, y, q, q);
    ctx.fillRect(x, y - q, q, q); ctx.fillRect(x, y + q, q, q); ctx.fillRect(x - q, y, q, q); ctx.fillRect(x + q, y, q, q);
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
    layout();
    const lead = G.getLead(state);
    StripUI.update(view(lead));
    if (!state.starterChosen || !lead) return;

    drawGround();
    if (sim.hit && sim.hit.crit) ctx.translate(Math.round(Math.sin(sim.hit.t * 90) * 2), 0); // tremidinha no crítico
    const y = groundY - S;

    // líder (passeia virando no fim; pula de leve)
    const walking = sim.phase === 'walk';
    const animated = A.creature(lead.species, lead.shiny).frames > 1;
    const bob = !animated && (walking || sim.phase === 'caught') ? (Math.floor(sim.t * (walking ? 3.3 : 5)) % 2 ? -Math.round(3 * k) : 0) : 0;
    const resting = sim.phase === 'rest';
    platform(leadX, S);
    drawGlow('lead', leadX, y);
    sprite(lead.species, lead.shiny, leadX + lungeOffset('lead'), y + bob, { alpha: resting ? 0.45 : blinkAlpha('lead'), flip: sim.walkFlip });
    if (resting) text('z', leadX + S + 3 + Math.sin(sim.t * 3) * 2, y + 6 - ((sim.t * 6) % 8), { size: Math.round(14 * k), color: '#e8ecff' });
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
      const wbob = sim.phase === 'fight' && !sim.defeated && Math.floor(sim.t * 4) % 2 ? -Math.round(3 * k) : 0;
      platform(wx, S);
      drawGlow('wild', wx, y);
      // derrotado: fica caído e meio apagado esperando a captura
      sprite(w.species, w.shiny, wx, y + wbob, { flip: true, alpha: (sim.defeated ? 0.5 : 1) * sim.wildAlpha * blinkAlpha('wild'), t: sim.defeated ? 0 : sim.anim });
      if (sim.defeated && sim.phase === 'down') {
        text('clique pra capturar', wx + S / 2, y - 4 * k, { size: Math.round(16 * k) });
      }
      if (sim.alertT > 0) drawAlert(wx + S / 2 + 6 * k, y - 2 * k);
    }

    // cápsula
    const capSize = Math.round(S * 0.6);
    if (sim.phase === 'throw') {
      const kk = sim.t / 0.55;
      const x0 = leadX + S, x1 = wildTargetX + S / 4;
      const cx = x0 + (x1 - x0) * kk;
      const cy = y + S / 3 - Math.sin(Math.PI * kk) * (H * 0.35);
      itemSprite(sim.capsule.item, cx, cy, { size: capSize });
    } else if (sim.phase === 'shake' || sim.phase === 'caught') {
      const wob = sim.phase === 'shake' ? Math.round(Math.sin(sim.t * 14) * 2) * (Math.floor(sim.t / 0.5) % 2) : 0;
      const cx = wildTargetX + (S - capSize) / 2 + wob;
      platform(wildTargetX + (S - capSize) / 2, capSize);
      itemSprite(sim.capsule.item, cx, groundY - capSize, { size: capSize, alpha: 1 });
      if (sim.phase === 'caught') { // faíscas piscando (como no design)
        const tw = Math.floor(sim.t / 0.4) % 2 === 0;
        spark(Math.round(cx - 18 * k), Math.round(groundY - capSize - 6 * k), 1, tw);
        spark(Math.round(cx + capSize + 14 * k), Math.round(groundY - capSize - 14 * k), 1, !tw);
        spark(Math.round(cx - 30 * k), Math.round(groundY - 8 * k), 0.66, !tw);
      }
    }

    // números flutuando (presos na cena)
    for (const f of sim.floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
      const fs = Math.round(((f.size || 10) >= 12 ? 22 : 16) * k);
      const half = measure(f.text, fs) / 2 + 2;
      const fx = Math.min(sceneR - half, Math.max(sceneL + half, f.x));
      text(f.text, fx, f.y - f.t * 12, { size: fs, color: f.color });
      ctx.globalAlpha = 1;
    }

    if (debug && debug.on) {
      const hit = cursor ? hitTest(cursor.x, cursor.y) : null;
      const lines = [
        `mouse ${cursor ? `${Math.round(cursor.x)},${Math.round(cursor.y)}` : '—'} ${hit || '-'} · ${clickThrough ? 'atravessa' : 'PEGA'} · dpr ${dpr}`,
        `sistema ${debug.pt ? `${debug.pt.x - debug.b.x},${debug.pt.y - debug.b.y}` : '—'} · botão ${debug.reader ? 'lido' : 'SEM leitor'} · clique ${debug.lastClick || '—'}`,
      ];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(20,22,30,0.9)';
      ctx.fillRect(sceneL, H - 22, sceneR - sceneL, 22);
      lines.forEach((l, i) => text(l, sceneL + 4, H - 16 + i * 10, { size: 9, weight: 500, color: '#cdf5dc', align: 'left', outline: false }));
    }
  }

  /** O que a camada HTML mostra agora. */
  function view(lead) {
    const zoneIdx = Math.max(0, G.ZONES.findIndex((z) => z.id === state.zone));
    const zone = G.ZONES[zoneIdx];
    const caps = (state.items.capsula || 0) + (state.items.super || 0);
    const over = cursor && hitTest(cursor.x, cursor.y);
    const v = {
      width: W, height: H, starter: !state.starterChosen || !lead, mode: 'explore',
      zone: `ZONA ${zoneIdx + 1} · ${zone.name.toUpperCase()}`, coins: state.coins, caps, hot: over, foe: null, dialog: null,
    };
    if (v.starter) {
      v.dialog = { kind: 'info', title: 'Clique aqui pra escolher seu parceiro!', more: true };
      return v;
    }
    v.lead = {
      species: lead.species, shiny: lead.shiny, name: G.SPECIES[lead.species].name + (lead.shiny ? ' ✦' : ''), g: lead.gender,
      lv: lead.level, hp: lead.hp, max: G.maxHp(lead), xp: G.clamp(lead.xp / G.xpToNext(lead.level), 0, 1),
      st: lead.status ? G.STATUS[lead.status] : null, xpGain: sim.xpGainT > 0 ? sim.xpGain : 0,
    };
    const w = sim.wild;
    if (w && !sim.defeated && ['appear', 'fight', 'throw'].includes(sim.phase)) {
      v.foe = { name: G.SPECIES[w.species].name + (w.shiny ? ' ✦' : ''), g: w.gender, lv: w.level, hp: w.hp, max: G.maxHp(w), st: w.status ? G.STATUS[w.status] : null };
    }
    if (sim.phase === 'prompt' && w) {
      const nm = StripUI.esc(G.SPECIES[w.species].name.toUpperCase());
      const left = Math.max(0, Math.ceil(PROMPT_S - sim.t));
      v.mode = 'prompt';
      v.dialog = {
        kind: w.shiny || !state.dex.caught[w.species] ? 'alert' : 'info',
        title: sim.prompt === 'retry' ? `<strong>${nm}</strong> escapou da cápsula!` : `<strong>${nm}</strong> foi derrotado${state.dex.caught[w.species] ? '' : ' (novo!)'}`,
        ask: { q: sim.prompt === 'retry' ? 'Tentar outra?' : 'Capturar?', left, frac: Math.max(0, 1 - sim.t / PROMPT_S) },
      };
    } else if (sim.toast) {
      v.mode = 'toast';
      v.dialog = { kind: sim.toast.kind, title: StripUI.esc(sim.toast.text), sub: sim.toast.sub, more: true };
    }
    return v;
  }

  // ---------- Mouse ----------
  // A janela ignora o mouse (cliques passam pra barra de tarefas), exceto em cima do HUD
  // e das criaturas. O Electron continua mandando mousemove pra gente decidir isso.
  let clickThrough = true;

  function hitTest(x, y) {
    if (!state.starterChosen) return 'hud';
    const ui = StripUI.hit(x, y); // placas e botões HTML (data-hit)
    if (ui) return ui;
    const top = groundY - S;
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
    if (hit === 'hud' || hit === 'lead') bridge.openPanel('team');
    if (hit.startsWith('menu:')) bridge.openPanel(hit.slice(5));
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
