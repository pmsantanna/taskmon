// Regras do jogo: espécies, zonas, batalha, XP, captura e progresso offline.
// Sem DOM e sem Electron: roda no navegador (window.Game) e no Node (require).

(function (root) {
  'use strict';
  const MV = root.Moves || require('./moves.js');
  const { MOVES, LEARNSETS } = MV;

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
  // atk/def = físico, mag/res = mágico (ataque e defesa especiais), spd = velocidade.
  const SPECIES = {
    capi:       { name: 'Capi',       type: 'normal',   base: { hp: 60, atk: 45, def: 45, mag: 35, res: 45, spd: 40 },  xp: 40,  catch: 0.55, evolvesTo: 'capivarao', evolveLevel: 18 },
    capivarao:  { name: 'Capivarão',  type: 'normal',   base: { hp: 95, atk: 70, def: 72, mag: 50, res: 70, spd: 48 },  xp: 110, catch: 0.2 },
    pavio:      { name: 'Pavio',      type: 'fogo',     base: { hp: 48, atk: 60, def: 46, mag: 65, res: 50, spd: 60 },  xp: 62,  catch: 0.3,  evolvesTo: 'lampiao', evolveLevel: 16 },
    lampiao:    { name: 'Lampião',    type: 'fogo',     base: { hp: 76, atk: 90, def: 70, mag: 95, res: 75, spd: 80 },  xp: 150, catch: 0.1 },
    gotinha:    { name: 'Gotinha',    type: 'agua',     base: { hp: 50, atk: 48, def: 55, mag: 55, res: 60, spd: 50 },  xp: 62,  catch: 0.3,  evolvesTo: 'mare', evolveLevel: 16 },
    mare:       { name: 'Maré',       type: 'agua',     base: { hp: 85, atk: 78, def: 82, mag: 85, res: 85, spd: 65 },  xp: 150, catch: 0.1 },
    brotinho:   { name: 'Brotinho',   type: 'planta',   base: { hp: 52, atk: 50, def: 52, mag: 55, res: 55, spd: 45 },  xp: 62,  catch: 0.3,  evolvesTo: 'ipe', evolveLevel: 16 },
    ipe:        { name: 'Ipê',        type: 'planta',   base: { hp: 88, atk: 80, def: 80, mag: 85, res: 85, spd: 60 },  xp: 150, catch: 0.1 },
    vagalume:   { name: 'Vagalume',   type: 'eletrico', base: { hp: 40, atk: 55, def: 35, mag: 70, res: 40, spd: 85 },  xp: 55,  catch: 0.45 },
    seixo:      { name: 'Seixo',      type: 'pedra',    base: { hp: 45, atk: 55, def: 80, mag: 25, res: 40, spd: 20 },  xp: 58,  catch: 0.45, evolvesTo: 'pedregulho', evolveLevel: 24 },
    pedregulho: { name: 'Pedregulho', type: 'pedra',    base: { hp: 75, atk: 85, def: 115, mag: 40, res: 60, spd: 25 }, xp: 160, catch: 0.12 },
    pipa:       { name: 'Pipa',       type: 'voador',   base: { hp: 42, atk: 50, def: 38, mag: 45, res: 40, spd: 80 },  xp: 50,  catch: 0.5 },
    boitata:    { name: 'Boitatá',    type: 'fogo',     base: { hp: 90, atk: 110, def: 85, mag: 115, res: 90, spd: 95 }, xp: 280, catch: 0.04, legendary: true },
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
      atk: s(b.atk), def: s(b.def), mag: s(b.mag), res: s(b.res), spd: s(b.spd),
    };
  }

  const maxHp = (c) => stats(c).hp;
  const xpToNext = (level) => Math.floor(12 * Math.pow(level, 2.4)) + 20;

  function createCreature(species, level, rng = Math.random) {
    const c = { uid: uid(rng), species, level, xp: 0, shiny: rng() < SHINY_CHANCE };
    c.hp = maxHp(c);
    ensureMoves(c);
    return c;
  }

  // ---------- Golpes ----------
  /** Golpes que a espécie aprende até `level`, na ordem em que aprende. */
  function movesUpTo(species, level) {
    const ls = LEARNSETS[species] || {};
    return Object.keys(ls).map(Number).sort((a, b) => a - b)
      .filter((l) => l <= level).flatMap((l) => ls[l]);
  }

  /** Garante known/moves/pp (criaturas novas e saves antigos). Como no original: os 4 últimos aprendidos. */
  function ensureMoves(c) {
    if (!Array.isArray(c.known)) c.known = [];
    for (const id of movesUpTo(c.species, c.level)) if (!c.known.includes(id)) c.known.push(id);
    if (!Array.isArray(c.moves) || !c.moves.length) c.moves = c.known.slice(-4);
    c.moves = c.moves.filter((id) => MOVES[id]).slice(0, 4);
    c.pp = c.pp || {};
    for (const id of c.moves) if (c.pp[id] == null) c.pp[id] = MOVES[id].pp;
    if (c.status === undefined) c.status = null;
    return c;
  }

  /** Valor "bruto" de um golpe, pra decidir qual sai quando aprende um novo com 4 já ativos. */
  function moveValue(c, id) {
    const m = MOVES[id];
    if (m.cat === 'status') return 30;
    const stab = m.type === SPECIES[c.species].type ? 1.5 : 1;
    return m.power * stab * ((m.acc ?? 100) / 100);
  }

  /**
   * Aprende um golpe. Com vaga, entra direto. Sem vaga e com `autoReplace`, troca o de menor
   * valor se o novo for melhor. Senão fica só na lista de conhecidos (dá pra trocar no painel).
   */
  function learnMove(c, id, autoReplace = true) {
    if (!MOVES[id]) return null;
    if (!c.known.includes(id)) c.known.push(id);
    if (c.moves.includes(id)) return null;
    if (c.moves.length < 4) {
      c.moves.push(id);
      c.pp[id] = MOVES[id].pp;
      return { type: 'learn', move: id };
    }
    if (autoReplace) {
      const worst = c.moves.reduce((a, b) => (moveValue(c, a) <= moveValue(c, b) ? a : b));
      if (moveValue(c, id) > moveValue(c, worst)) {
        c.moves[c.moves.indexOf(worst)] = id;
        delete c.pp[worst];
        c.pp[id] = MOVES[id].pp;
        return { type: 'learn', move: id, replaced: worst };
      }
    }
    return { type: 'learnLater', move: id };
  }

  /** Define os golpes ativos (1 a 4, só entre os conhecidos). */
  function setMoves(c, ids) {
    const list = [...new Set(ids)].filter((id) => c.known.includes(id) && MOVES[id]).slice(0, 4);
    if (!list.length) return false;
    for (const id of list) if (c.pp[id] == null) c.pp[id] = MOVES[id].pp;
    for (const id of Object.keys(c.pp)) if (!list.includes(id)) delete c.pp[id];
    c.moves = list;
    return true;
  }

  /** Recupera PP (amount = por golpe; Infinity = tudo). */
  function restorePp(c, amount = Infinity) {
    for (const id of c.moves) c.pp[id] = Math.min(MOVES[id].pp, (c.pp[id] ?? 0) + amount);
  }

  // Na tabela, 2 = "super efetivo" e 0.5 = "pouco efetivo". Aqui suavizamos pra 1.5× / 0.7×:
  // num idle você não escolhe golpes, então fraquezas cheias seriam punitivas demais.
  function typeMult(attType, defType) {
    const m = (EFFECT[attType] && EFFECT[attType][defType]) ?? 1;
    return m > 1 ? 1.5 : m < 1 ? 0.7 : 1;
  }

  // ---------- Batalha (estilo original: categoria, estágios, status, prioridade) ----------
  const STAGES = ['atk', 'def', 'mag', 'res', 'spd', 'acc', 'eva'];
  const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));     // atributos: ×0.25 .. ×4
  const accStageMult = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));  // precisão/evasão: ×0.33 .. ×3

  /** Estado de uma criatura dentro da batalha (os estágios zeram quando a luta acaba). */
  function battler(c, side) {
    ensureMoves(c);
    return { c, side, stages: Object.fromEntries(STAGES.map((k) => [k, 0])) };
  }

  function effStat(b, stat, { ignoreDrops = false, ignoreBoosts = false } = {}) {
    let st = b.stages[stat];
    if (ignoreDrops) st = Math.max(0, st);
    if (ignoreBoosts) st = Math.min(0, st);
    let v = stats(b.c)[stat] * stageMult(st);
    if (stat === 'spd' && b.c.status === 'paralisia') v *= 0.5;
    return v;
  }

  const hasPp = (c) => c.moves.some((id) => (c.pp[id] ?? 0) > 0);
  const typeOf = (c) => SPECIES[c.species].type;

  function statusImmune(target, status, move) {
    const t = typeOf(target.c);
    if (status === 'queimadura' && t === 'fogo') return true;
    if (status === 'paralisia' && t === 'eletrico') return true;
    if (move && move.powder && t === 'planta') return true;
    return false;
  }

  /** Cálculo de dano do original: ((2N/5+2)·Poder·A/D)/50+2, × mesmo tipo × tipo × crítico × aleatório × queimadura. */
  function moveDamage(att, def, id, rng = Math.random) {
    const m = MOVES[id];
    const physical = m.cat === 'fisico';
    const crit = rng() < (m.crit ? 0.125 : 0.0625);
    const A = effStat(att, physical ? 'atk' : 'mag', { ignoreDrops: crit });
    const D = effStat(def, physical ? 'def' : 'res', { ignoreBoosts: crit });
    const mult = m.typeless ? 1 : typeMult(m.type, typeOf(def.c));
    const stab = !m.typeless && m.type === typeOf(att.c) ? 1.5 : 1;
    const burn = physical && att.c.status === 'queimadura' ? 0.5 : 1;
    const base = ((2 * att.c.level / 5 + 2) * m.power * A / D) / 50 + 2;
    const amount = Math.max(1, Math.floor(base * stab * mult * (crit ? 1.5 : 1) * burn * rand(rng, 0.85, 1)));
    return { amount, crit, mult };
  }

  function applyStages(target, changes, ev) {
    for (const [stat, delta] of Object.entries(changes)) {
      const before = target.stages[stat];
      target.stages[stat] = clamp(before + delta, -6, 6);
      ev.push({ kind: 'stat', who: target.side, stat, stages: delta, failed: before === target.stages[stat] });
    }
  }

  function applyStatus(target, status, move, ev, quiet = false) {
    if (target.c.status || target.c.hp <= 0 || statusImmune(target, status, move)) {
      if (!quiet) ev.push({ kind: 'fail', who: target.side });
      return false;
    }
    target.c.status = status;
    if (status === 'sono') target.c.sleep = 1 + Math.floor(rand(Math.random, 0, 3)); // 1 a 3 turnos
    ev.push({ kind: 'status', who: target.side, status });
    return true;
  }

  /**
   * Executa a ação de `att` contra `def` com o golpe `id`. Mexe no HP/PP/status e devolve
   * a lista de eventos (pra animar e escrever o log).
   */
  function useMove(att, def, id, rng = Math.random) {
    const ev = [];
    const c = att.c;

    // Status que impedem de agir
    if (c.status === 'sono') {
      c.sleep = (c.sleep || 1) - 1;
      if (c.sleep > 0) { ev.push({ kind: 'cant', who: att.side, why: 'sono' }); return ev; }
      c.status = null;
      ev.push({ kind: 'wake', who: att.side });
    }
    if (c.status === 'paralisia' && rng() < 0.25) {
      ev.push({ kind: 'cant', who: att.side, why: 'paralisia' });
      return ev;
    }

    if (!MOVES[id] || (id !== 'debater' && !(c.pp[id] > 0))) id = 'debater';
    const m = MOVES[id];
    if (id !== 'debater') c.pp[id]--;
    ev.push({ kind: 'use', who: att.side, move: id });

    const selfTarget = m.cat === 'status' && (m.heal || (m.effect && m.effect.target === 'self'));
    if (m.acc != null && !selfTarget) {
      const chance = (m.acc / 100) * accStageMult(att.stages.acc - def.stages.eva);
      if (rng() >= chance) { ev.push({ kind: 'miss', who: att.side }); return ev; }
    }

    if (m.cat !== 'status') {
      const r = moveDamage(att, def, id, rng);
      const dealt = Math.min(def.c.hp, r.amount);
      def.c.hp -= dealt;
      ev.push({ kind: 'damage', who: def.side, amount: r.amount, crit: r.crit, mult: r.mult });
      if (m.drain && dealt > 0) {
        const h = Math.min(maxHp(c) - c.hp, Math.max(1, Math.floor(dealt * m.drain)));
        if (h > 0) { c.hp += h; ev.push({ kind: 'heal', who: att.side, amount: h, drain: true }); }
      }
      if (m.recoil && dealt > 0) {
        const rc = Math.min(c.hp, Math.max(1, Math.floor(dealt * m.recoil)));
        c.hp -= rc;
        ev.push({ kind: 'recoil', who: att.side, amount: rc });
      }
      // efeito secundário (com chance), só se o alvo ainda está de pé
      const e = m.effect;
      if (e && def.c.hp > 0 && rng() < (e.chance ?? 1)) {
        if (e.status) applyStatus(def, e.status, m, ev, true);
        if (e.stat) applyStages(e.target === 'self' ? att : def, e.stat, ev);
      }
    } else {
      if (m.heal) {
        const h = Math.min(maxHp(c) - c.hp, Math.floor(maxHp(c) * m.heal));
        if (h > 0) { c.hp += h; ev.push({ kind: 'heal', who: att.side, amount: h }); }
        else ev.push({ kind: 'fail', who: att.side });
      }
      const e = m.effect;
      if (e && e.status) applyStatus(def, e.status, m, ev);
      if (e && e.stat) applyStages(e.target === 'self' ? att : def, e.stat, ev);
    }

    if (def.c.hp <= 0) ev.push({ kind: 'faint', who: def.side });
    if (c.hp <= 0) ev.push({ kind: 'faint', who: att.side });
    return ev;
  }

  /** Dano de queimadura (1/16) e veneno (1/8) no fim do turno. */
  function endOfTurn(b) {
    const ev = [];
    const c = b.c;
    if (c.hp <= 0) return ev;
    const frac = c.status === 'queimadura' ? 1 / 16 : c.status === 'veneno' ? 1 / 8 : 0;
    if (frac) {
      const amount = Math.min(c.hp, Math.max(1, Math.floor(maxHp(c) * frac)));
      c.hp -= amount;
      ev.push({ kind: 'residual', who: b.side, status: c.status, amount });
      if (c.hp <= 0) ev.push({ kind: 'faint', who: b.side });
    }
    return ev;
  }

  /** Quem age primeiro: prioridade do golpe, depois velocidade (empate = sorteio). */
  function firstToAct(a, aMove, b, bMove, rng = Math.random) {
    const pa = MOVES[aMove]?.priority || 0, pb = MOVES[bMove]?.priority || 0;
    if (pa !== pb) return pa > pb;
    const sa = effStat(a, 'spd'), sb = effStat(b, 'spd');
    if (sa !== sb) return sa > sb;
    return rng() < 0.5;
  }

  /** IA simples (os dois lados lutam sozinhos): pontua cada golpe e escolhe com um pouco de sorte. */
  function chooseMove(self, foe, rng = Math.random) {
    const c = self.c;
    if (!hasPp(c)) return 'debater';
    const hpR = c.hp / maxHp(c);
    let best = null, bestScore = -1;
    for (const id of c.moves) {
      if (!(c.pp[id] > 0)) continue;
      const m = MOVES[id];
      let score = 0;
      if (m.cat !== 'status') {
        const physical = m.cat === 'fisico';
        const ratio = effStat(self, physical ? 'atk' : 'mag') / effStat(foe, physical ? 'def' : 'res');
        const stab = m.type === typeOf(c) ? 1.5 : 1;
        score = m.power * stab * typeMult(m.type, typeOf(foe.c)) * ratio * ((m.acc ?? 100) / 100);
        if (physical && c.status === 'queimadura') score *= 0.5;
        if (m.drain && hpR < 0.6) score *= 1.25;
        if (m.recoil && hpR < 0.35) score *= 0.6;
        if (m.priority && foe.c.hp / maxHp(foe.c) < 0.2) score *= 1.6;
      } else if (m.heal) {
        score = hpR < 0.35 ? 140 : hpR < 0.6 ? 55 : 0;
      } else if (m.effect?.status) {
        score = foe.c.status || statusImmune(foe, m.effect.status, m) ? 0 : m.effect.status === 'sono' ? 75 : 60;
        score *= (m.acc ?? 100) / 100;
      } else if (m.effect?.stat) {
        const target = m.effect.target === 'self' ? self : foe;
        const [stat, delta] = Object.entries(m.effect.stat)[0];
        const st = target.stages[stat];
        const room = delta > 0 ? st < 2 : st > -2;
        score = room ? 42 : 4;
        if (m.effect.target === 'self' && hpR < 0.5) score *= 0.4;
      }
      score *= rand(rng, 0.75, 1.25);
      if (score > bestScore) { bestScore = score; best = id; }
    }
    return best || 'debater';
  }

  /** Limpa o que só vale durante a luta (status some depois da batalha, pra não incomodar no idle). */
  function afterBattle(c) {
    c.status = null;
    c.sleep = 0;
  }

  /** Dá XP e devolve os eventos (subiu de nível, evoluiu). Mexe em `c`. */
  function gainXp(c, amount, autoReplace = true) {
    ensureMoves(c);
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
      // golpes novos deste nível (da forma atual, já evoluída se for o caso)
      for (const id of (LEARNSETS[c.species] || {})[c.level] || []) {
        const r = learnMove(c, id, autoReplace);
        if (r) events.push(r);
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
      settings: { autoCatch: true, autoMoves: true },
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
    afterBattle(c);
    restorePp(c);
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
    const auto = state.settings.autoMoves !== false;
    const events = lead ? gainXp(lead, xp, auto) : [];
    for (const c of state.team) {
      if (c !== lead) gainXp(c, Math.ceil(xp * 0.3), auto);
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
    afterBattle(lead);
    for (const c of state.team) restorePp(c);
    return { seconds: s, battles, xp, coins, levels: lead.level - startLevel, evolutions };
  }

  const api = {
    TYPE_LABEL, TYPE_COLOR, EFFECT, SPECIES, SPECIES_ORDER, STARTERS, ZONES, SHOP, TEAM_MAX,
    MOVES, LEARNSETS, CATEGORY: MV.CATEGORY, STATUS: MV.STATUS, STAT_LABEL: MV.STAT_LABEL,
    stats, maxHp, xpToNext, createCreature, typeMult, gainXp, xpReward, coinReward,
    movesUpTo, ensureMoves, learnMove, setMoves, restorePp, hasPp,
    battler, effStat, moveDamage, useMove, endOfTurn, firstToAct, chooseMove, afterBattle,
    catchChance, newGame, getLead, chooseStarter, unlockedZones, rollWild, addCaught, rewardWin,
    buy, moveCreature, simulateOffline, clamp, rand,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
