// Regras do jogo: espécies, zonas, batalha, XP, captura e progresso offline.
// Sem DOM e sem Electron: roda no navegador (window.Game) e no Node (require).

(function (root) {
  'use strict';

  // ---------- Tipos ----------
  const TYPE_LABEL = {
    normal: 'Normal', fogo: 'Fogo', agua: 'Água', planta: 'Planta',
    eletrico: 'Elétrico', pedra: 'Pedra', voador: 'Voador',
  };
  const TYPE_COLOR = {
    normal: '#a8a29e', fogo: '#f97316', agua: '#3b82f6', planta: '#22c55e',
    eletrico: '#eab308', pedra: '#a16207', voador: '#8b5cf6',
  };
  // atacante -> defensor -> multiplicador (o que não estiver aqui é 1)
  const EFFECT = {
    normal: { pedra: 0.5 },
    fogo: { planta: 2, agua: 0.5, pedra: 0.5, fogo: 0.5 },
    agua: { fogo: 2, pedra: 2, planta: 0.5, agua: 0.5 },
    planta: { agua: 2, pedra: 2, fogo: 0.5, planta: 0.5, voador: 0.5 },
    eletrico: { agua: 2, voador: 2, planta: 0.5, eletrico: 0.5, pedra: 0.5 },
    pedra: { fogo: 2, voador: 2 },
    voador: { planta: 2, eletrico: 0.5, pedra: 0.5 },
  };

  // ---------- Espécies (todas originais) ----------
  const SPECIES = {
    capi:       { name: 'Capi',       type: 'normal',   base: { hp: 60, atk: 45, def: 45, spd: 40 },  xp: 40,  catch: 0.55, evolvesTo: 'capivarao', evolveLevel: 18 },
    capivarao:  { name: 'Capivarão',  type: 'normal',   base: { hp: 95, atk: 70, def: 72, spd: 48 },  xp: 110, catch: 0.2 },
    pavio:      { name: 'Pavio',      type: 'fogo',     base: { hp: 48, atk: 60, def: 46, spd: 60 },  xp: 62,  catch: 0.3,  evolvesTo: 'lampiao', evolveLevel: 16 },
    lampiao:    { name: 'Lampião',    type: 'fogo',     base: { hp: 76, atk: 90, def: 70, spd: 80 },  xp: 150, catch: 0.1 },
    gotinha:    { name: 'Gotinha',    type: 'agua',     base: { hp: 50, atk: 48, def: 55, spd: 50 },  xp: 62,  catch: 0.3,  evolvesTo: 'mare', evolveLevel: 16 },
    mare:       { name: 'Maré',       type: 'agua',     base: { hp: 85, atk: 78, def: 82, spd: 65 },  xp: 150, catch: 0.1 },
    brotinho:   { name: 'Brotinho',   type: 'planta',   base: { hp: 52, atk: 50, def: 52, spd: 45 },  xp: 62,  catch: 0.3,  evolvesTo: 'ipe', evolveLevel: 16 },
    ipe:        { name: 'Ipê',        type: 'planta',   base: { hp: 88, atk: 80, def: 80, spd: 60 },  xp: 150, catch: 0.1 },
    vagalume:   { name: 'Vagalume',   type: 'eletrico', base: { hp: 40, atk: 55, def: 35, spd: 85 },  xp: 55,  catch: 0.45 },
    seixo:      { name: 'Seixo',      type: 'pedra',    base: { hp: 45, atk: 55, def: 80, spd: 20 },  xp: 58,  catch: 0.45, evolvesTo: 'pedregulho', evolveLevel: 24 },
    pedregulho: { name: 'Pedregulho', type: 'pedra',    base: { hp: 75, atk: 85, def: 115, spd: 25 }, xp: 160, catch: 0.12 },
    pipa:       { name: 'Pipa',       type: 'voador',   base: { hp: 42, atk: 50, def: 38, spd: 80 },  xp: 50,  catch: 0.5 },
    boitata:    { name: 'Boitatá',    type: 'fogo',     base: { hp: 90, atk: 110, def: 85, spd: 95 }, xp: 280, catch: 0.04, legendary: true },
  };
  const SPECIES_ORDER = ['pavio', 'lampiao', 'gotinha', 'mare', 'brotinho', 'ipe', 'capi', 'capivarao',
    'vagalume', 'seixo', 'pedregulho', 'pipa', 'boitata'];
  const STARTERS = ['pavio', 'gotinha', 'brotinho'];

  // ---------- Zonas ----------
  // unlock = nível do líder necessário. pool = peso de cada espécie.
  const ZONES = [
    { id: 'campina', name: 'Campina', unlock: 1,  levels: [2, 5],   pool: { capi: 50, pipa: 20, vagalume: 16, brotinho: 14 }, color: '#7cc46a' },
    { id: 'lago',    name: 'Lago',    unlock: 8,  levels: [7, 14],  pool: { gotinha: 30, capi: 25, pipa: 25, vagalume: 20 }, color: '#5aa7d9' },
    { id: 'caverna', name: 'Caverna', unlock: 15, levels: [14, 24], pool: { seixo: 45, vagalume: 25, capi: 18, pedregulho: 12 }, color: '#a8a29e' },
    { id: 'vulcao',  name: 'Vulcão',  unlock: 25, levels: [24, 36], pool: { pavio: 35, seixo: 22, pedregulho: 20, capivarao: 21, boitata: 2 }, color: '#e0704a' },
  ];

  const SHOP = {
    capsula: { name: 'Cápsula', price: 20, mult: 1 },
    super:   { name: 'Super cápsula', price: 60, mult: 1.8 },
  };

  const TEAM_MAX = 6;
  const SHINY_CHANCE = 1 / 256;
  const OFFLINE_CAP_S = 8 * 3600;

  // ---------- Utilidades ----------
  const rand = (rng, a, b) => a + rng() * (b - a);
  const randInt = (rng, a, b) => Math.floor(rand(rng, a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = (rng) => Date.now().toString(36) + Math.floor(rng() * 1e9).toString(36);

  function weighted(rng, pool) {
    const entries = Object.entries(pool);
    let r = rng() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) {
      if ((r -= w) < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  // ---------- Criaturas ----------
  function stats(c) {
    const b = SPECIES[c.species].base;
    const s = (v) => Math.floor((v * 2 * c.level) / 100) + 5;
    return {
      hp: Math.floor((b.hp * 2 * c.level) / 100) + c.level + 10,
      atk: s(b.atk), def: s(b.def), spd: s(b.spd),
    };
  }

  const maxHp = (c) => stats(c).hp;
  const xpToNext = (level) => Math.floor(12 * Math.pow(level, 2.4)) + 20;

  function createCreature(species, level, rng = Math.random) {
    const c = { uid: uid(rng), species, level, xp: 0, shiny: rng() < SHINY_CHANCE };
    c.hp = maxHp(c);
    return c;
  }

  // Na tabela, 2 = "super efetivo" e 0.5 = "pouco efetivo". Aqui suavizamos pra 1.5× / 0.7×:
  // num idle você não escolhe golpes, então fraquezas cheias seriam punitivas demais.
  function typeMult(attType, defType) {
    const m = (EFFECT[attType] && EFFECT[attType][defType]) ?? 1;
    return m > 1 ? 1.5 : m < 1 ? 0.7 : 1;
  }

  function damage(att, def, rng = Math.random) {
    const a = stats(att), d = stats(def);
    const mult = typeMult(SPECIES[att.species].type, SPECIES[def.species].type);
    const crit = rng() < 0.0625;
    const baseDmg = ((2 * att.level / 5 + 2) * 40 * a.atk / d.def) / 50 + 2;
    const amount = Math.max(1, Math.floor(baseDmg * mult * (crit ? 1.5 : 1) * rand(rng, 0.85, 1)));
    return { amount, crit, mult };
  }

  /** Dá XP e devolve os eventos (subiu de nível, evoluiu). Mexe em `c`. */
  function gainXp(c, amount) {
    const events = [];
    c.xp += amount;
    while (c.xp >= xpToNext(c.level) && c.level < 100) {
      const before = maxHp(c);
      c.xp -= xpToNext(c.level);
      c.level++;
      c.hp += maxHp(c) - before;
      events.push({ type: 'levelup', level: c.level });
      const sp = SPECIES[c.species];
      if (sp.evolvesTo && c.level >= sp.evolveLevel) {
        const from = c.species;
        const ratio = c.hp / maxHp(c);
        c.species = sp.evolvesTo;
        c.hp = Math.round(maxHp(c) * ratio);
        events.push({ type: 'evolve', from, to: c.species });
      }
    }
    return events;
  }

  function xpReward(wild) {
    return Math.max(1, Math.floor((SPECIES[wild.species].xp * wild.level) / 7));
  }

  function coinReward(wild, rng = Math.random) {
    return wild.level * 2 + randInt(rng, 0, 4) + (SPECIES[wild.species].legendary ? 200 : 0);
  }

  function catchChance(wild, item = 'capsula') {
    const hpRatio = wild.hp / maxHp(wild);
    const base = SPECIES[wild.species].catch * (1 - hpRatio * 0.66) * SHOP[item].mult;
    return clamp(base, 0.02, 0.95);
  }

  // ---------- Estado do jogo ----------
  function newGame() {
    return {
      version: 1,
      starterChosen: false,
      team: [],
      box: [],
      lead: null,         // uid do líder
      coins: 50,
      items: { capsula: 5, super: 0 },
      zone: 'campina',
      dex: { seen: {}, caught: {} },
      settings: { autoCatch: true },
      stats: { battles: 0, wins: 0, caught: 0 },
      lastSaved: Date.now(),
    };
  }

  function getLead(state) {
    return state.team.find((c) => c.uid === state.lead) || state.team[0] || null;
  }

  function chooseStarter(state, species, rng = Math.random) {
    if (state.starterChosen || !STARTERS.includes(species)) return null;
    const c = createCreature(species, 5, rng);
    state.team.push(c);
    state.lead = c.uid;
    state.starterChosen = true;
    state.dex.seen[species] = true;
    state.dex.caught[species] = true;
    return c;
  }

  function unlockedZones(state) {
    const lead = getLead(state);
    const lvl = lead ? lead.level : 1;
    return ZONES.filter((z) => lvl >= z.unlock || z.id === 'campina');
  }

  function rollWild(state, rng = Math.random) {
    if (state.stats.battles === 0) { // primeira luta sempre tranquila
      state.dex.seen.capi = true;
      const first = createCreature('capi', 2, rng);
      first.shiny = false;
      return first;
    }
    const zone = ZONES.find((z) => z.id === state.zone) || ZONES[0];
    const species = weighted(rng, zone.pool);
    const wild = createCreature(species, randInt(rng, zone.levels[0], zone.levels[1]), rng);
    state.dex.seen[species] = true;
    return wild;
  }

  /** Coloca na equipe (se couber) ou na caixa. */
  function addCaught(state, c) {
    c.hp = maxHp(c);
    if (state.team.length < TEAM_MAX) state.team.push(c);
    else state.box.push(c);
    state.dex.caught[c.species] = true;
    state.stats.caught++;
  }

  /** XP pro líder e uma parte (30%) pro resto da equipe. Devolve os eventos do líder. */
  function rewardWin(state, wild, rng = Math.random) {
    const xp = xpReward(wild);
    const coins = coinReward(wild, rng);
    const lead = getLead(state);
    const events = lead ? gainXp(lead, xp) : [];
    for (const c of state.team) {
      if (c !== lead) gainXp(c, Math.ceil(xp * 0.3));
    }
    state.coins += coins;
    state.stats.battles++;
    state.stats.wins++;
    return { xp, coins, events };
  }

  function buy(state, item, qty = 1) {
    const it = SHOP[item];
    if (!it || qty < 1) return false;
    const cost = it.price * qty;
    if (state.coins < cost) return false;
    state.coins -= cost;
    state.items[item] = (state.items[item] || 0) + qty;
    return true;
  }

  function moveCreature(state, uidToMove, to) {
    const from = to === 'team' ? state.box : state.team;
    const dest = to === 'team' ? state.team : state.box;
    const i = from.findIndex((c) => c.uid === uidToMove);
    if (i < 0) return false;
    if (to === 'team' && state.team.length >= TEAM_MAX) return false;
    if (to === 'box' && state.team.length <= 1) return false; // precisa de pelo menos um na equipe
    const [c] = from.splice(i, 1);
    dest.push(c);
    if (to === 'box' && state.lead === c.uid) state.lead = state.team[0].uid;
    return true;
  }

  /**
   * Progresso enquanto o app estava fechado. Versão simplificada: uma batalha a cada ~20 s,
   * sempre vencida, sem capturas. Devolve um resumo pra mostrar na tela.
   */
  function simulateOffline(state, seconds, rng = Math.random) {
    const lead = getLead(state);
    if (!lead || seconds < 60) return null;
    const s = Math.min(seconds, OFFLINE_CAP_S);
    const battles = Math.floor(s / 20);
    const startLevel = lead.level;
    let xp = 0, coins = 0;
    const evolutions = [];
    for (let i = 0; i < battles; i++) {
      const wild = rollWild(state, rng);
      const r = rewardWin(state, wild, rng);
      xp += r.xp;
      coins += r.coins;
      r.events.filter((e) => e.type === 'evolve').forEach((e) => evolutions.push(e));
    }
    lead.hp = maxHp(lead);
    return { seconds: s, battles, xp, coins, levels: lead.level - startLevel, evolutions };
  }

  const api = {
    TYPE_LABEL, TYPE_COLOR, EFFECT, SPECIES, SPECIES_ORDER, STARTERS, ZONES, SHOP, TEAM_MAX,
    stats, maxHp, xpToNext, createCreature, typeMult, damage, gainXp, xpReward, coinReward,
    catchChance, newGame, getLead, chooseStarter, unlockedZones, rollWild, addCaught, rewardWin,
    buy, moveCreature, simulateOffline, clamp, rand,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
