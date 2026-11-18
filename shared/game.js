// Regras do jogo: espécies, zonas, batalha, XP, captura e progresso offline.
// Sem DOM e sem Electron: roda no navegador (window.Game) e no Node (require).

(function (root) {
  'use strict';
  const MV = root.Moves || require('./moves.js');
  const { MOVES, LEARNSETS, TMS, tmCompatible } = MV;
  const IT = root.Items || require('./items.js');
  const { NATURES, HELD, WILD_HELD } = IT;
  const NATURE_IDS = Object.keys(NATURES);

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
  // female = chance de nascer fêmea (null = sem sexo). egg = grupos de ovo ('indefinido' = não põe ovo).
  const SPECIES = {
    capi:       { name: 'Capi',       type: 'normal',   base: { hp: 60, atk: 45, def: 45, mag: 35, res: 45, spd: 40 },  xp: 40,  catch: 0.55, evolvesTo: 'capivarao', evolveLevel: 18, female: 0.5, egg: ['campo', 'agua'] },
    capivarao:  { name: 'Capivarão',  type: 'normal',   base: { hp: 95, atk: 70, def: 72, mag: 50, res: 70, spd: 48 },  xp: 110, catch: 0.2, female: 0.5, egg: ['campo', 'agua'] },
    pavio:      { name: 'Pavio',      type: 'fogo',     base: { hp: 48, atk: 60, def: 46, mag: 65, res: 50, spd: 60 },  xp: 62,  catch: 0.3,  evolvesTo: 'lampiao', evolveLevel: 16, female: 0.125, egg: ['campo'] },
    lampiao:    { name: 'Lampião',    type: 'fogo',     base: { hp: 76, atk: 90, def: 70, mag: 95, res: 75, spd: 80 },  xp: 150, catch: 0.1, female: 0.125, egg: ['campo'] },
    gotinha:    { name: 'Gotinha',    type: 'agua',     base: { hp: 50, atk: 48, def: 55, mag: 55, res: 60, spd: 50 },  xp: 62,  catch: 0.3,  evolvesTo: 'mare', evolveLevel: 16, female: 0.125, egg: ['agua'] },
    mare:       { name: 'Maré',       type: 'agua',     base: { hp: 85, atk: 78, def: 82, mag: 85, res: 85, spd: 65 },  xp: 150, catch: 0.1, female: 0.125, egg: ['agua'] },
    brotinho:   { name: 'Brotinho',   type: 'planta',   base: { hp: 52, atk: 50, def: 52, mag: 55, res: 55, spd: 45 },  xp: 62,  catch: 0.3,  evolvesTo: 'ipe', evolveLevel: 16, female: 0.125, egg: ['planta'] },
    ipe:        { name: 'Ipê',        type: 'planta',   base: { hp: 88, atk: 80, def: 80, mag: 85, res: 85, spd: 60 },  xp: 150, catch: 0.1, female: 0.125, egg: ['planta'] },
    vagalume:   { name: 'Vagalume',   type: 'eletrico', base: { hp: 40, atk: 55, def: 35, mag: 70, res: 40, spd: 85 },  xp: 55,  catch: 0.45, female: 0.5, egg: ['inseto'] },
    seixo:      { name: 'Seixo',      type: 'pedra',    base: { hp: 45, atk: 55, def: 80, mag: 25, res: 40, spd: 20 },  xp: 58,  catch: 0.45, evolvesTo: 'pedregulho', evolveLevel: 24, female: 0.5, egg: ['mineral'] },
    pedregulho: { name: 'Pedregulho', type: 'pedra',    base: { hp: 75, atk: 85, def: 115, mag: 40, res: 60, spd: 25 }, xp: 160, catch: 0.12, female: 0.5, egg: ['mineral'] },
    pipa:       { name: 'Pipa',       type: 'voador',   base: { hp: 42, atk: 50, def: 38, mag: 45, res: 40, spd: 80 },  xp: 50,  catch: 0.5, female: 0.5, egg: ['voador'] },
    boitata:    { name: 'Boitatá',    type: 'fogo',     base: { hp: 90, atk: 110, def: 85, mag: 115, res: 90, spd: 95 }, xp: 280, catch: 0.04, legendary: true, female: null, egg: ['indefinido'] },
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
    // Itens de esforço: +1 nível de esforço, cada um numa faixa (como no Legends: Arceus).
    esforco1: { name: 'Pó de Esforço', price: 40, grit: [0, 2] },
    esforco2: { name: 'Cascalho de Esforço', price: 120, grit: [3, 5] },
    esforco3: { name: 'Pedrisco de Esforço', price: 300, grit: [6, 8] },
    esforco4: { name: 'Rocha de Esforço', price: 800, grit: [9, 9] },
  };
  const GRIT_ITEMS = ['esforco1', 'esforco2', 'esforco3', 'esforco4'];

  /** Qual item de esforço serve pro nível atual (null se já está no máximo). */
  const gritFor = (effort) => (effort >= EFFORT_MAX ? null : GRIT_ITEMS.find((id) => effort >= SHOP[id].grit[0] && effort <= SHOP[id].grit[1]));

  /** Usa um item de esforço num atributo. Devolve o id do item gasto ou null. */
  function useGrit(state, c, stat) {
    if (!STAT_KEYS.includes(stat)) return null;
    ensureGenes(c);
    const item = gritFor(c.effort[stat]);
    if (!item || !(state.items[item] > 0)) return null;
    const before = maxHp(c);
    state.items[item]--;
    c.effort[stat]++;
    if (stat === 'hp') c.hp += maxHp(c) - before;
    return item;
  }

  const TEAM_MAX = 6;
  const TM_DROP_CHANCE = 0.025; // por vitória, se ainda houver MT exclusiva pra achar na zona
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
  // ---------- IVs e níveis de esforço (sistema do Legends: Arceus) ----------
  // IV: 0–31 por atributo, sorteado ao nascer, nunca muda.
  // Nível de esforço (NE): 0–10 por atributo, sobe com os itens de esforço. Substitui os EVs.
  // Ao ser criada, a criatura já começa com NE conforme o IV (20+ → 1, 26+ → 2, 31 → 3).
  const STAT_KEYS = ['hp', 'atk', 'def', 'mag', 'res', 'spd'];
  const EFFORT_MULT = [0, 2, 3, 4, 7, 8, 9, 14, 15, 16, 25];
  const EFFORT_MAX = 10;

  const effortFromIv = (iv) => (iv >= 31 ? 3 : iv >= 26 ? 2 : iv >= 20 ? 1 : 0);

  /** Avaliação do IV, como o juiz do jogo. */
  function ivRating(iv) {
    if (iv >= 31) return 'Perfeito';
    if (iv >= 30) return 'Fantástico';
    if (iv >= 26) return 'Muito bom';
    if (iv >= 16) return 'Bom';
    if (iv >= 1) return 'Razoável';
    return 'Nada bom';
  }

  /** Bônus do nível de esforço: ⌊(round(√Base × multiplicador) + Nível) / 2,5⌋. */
  function effortBonus(base, effort, level) {
    return Math.floor((Math.round(Math.sqrt(base) * EFFORT_MULT[effort || 0]) + level) / 2.5);
  }

  /** Garante IVs e níveis de esforço (criaturas novas e saves antigos). */
  function ensureGenes(c, rng = Math.random) {
    if (!c.ivs) c.ivs = Object.fromEntries(STAT_KEYS.map((k) => [k, randInt(rng, 0, 31)]));
    if (!c.effort) c.effort = Object.fromEntries(STAT_KEYS.map((k) => [k, effortFromIv(c.ivs[k])]));
    if (!NATURES[c.nature]) c.nature = NATURE_IDS[randInt(rng, 0, NATURE_IDS.length - 1)];
    if (c.held === undefined) c.held = null;
    if (c.gender === undefined) c.gender = rollGender(c.species, rng);
    return c;
  }

  /** 'M', 'F' ou null (sem sexo), pela proporção da espécie. */
  function rollGender(species, rng = Math.random) {
    const f = SPECIES[species].female;
    if (f == null) return null;
    return rng() < f ? 'F' : 'M';
  }

  /** +10% / −10% / 1 conforme a natureza. */
  function natureMult(c, stat) {
    const n = NATURES[c.nature];
    if (!n || n.up === n.down) return 1;
    return stat === n.up ? 1.1 : stat === n.down ? 0.9 : 1;
  }

  function stats(c) {
    const b = SPECIES[c.species].base;
    const L = c.level;
    const iv = c.ivs || {}, ef = c.effort || {};
    // ⌊(⌊(2·Base + IV)·Nv/100⌋ + 5) × natureza⌋ + bônus de esforço
    const s = (k) => Math.floor((Math.floor(((2 * b[k] + (iv[k] || 0)) * L) / 100) + 5) * natureMult(c, k)) + effortBonus(b[k], ef[k], L);
    return {
      hp: Math.floor(((2 * b.hp + (iv.hp || 0)) * L) / 100) + L + 10 + effortBonus(b.hp, ef.hp, L),
      atk: s('atk'), def: s('def'), mag: s('mag'), res: s('res'), spd: s('spd'),
    };
  }

  const maxHp = (c) => stats(c).hp;
  const xpToNext = (level) => Math.floor(12 * Math.pow(level, 2.4)) + 20;

  function createCreature(species, level, rng = Math.random) {
    const c = { uid: uid(rng), species, level, xp: 0, shiny: rng() < SHINY_CHANCE };
    ensureGenes(c, rng);
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
    if (!c.ivs || !c.nature) { // save antigo: sorteia o que falta mantendo a proporção do HP
      const ratio = c.hp / maxHp(c);
      ensureGenes(c);
      c.hp = Math.round(maxHp(c) * ratio);
    }
    ensureGenes(c); // campos mais novos (sexo) em saves antigos
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

  // Igual ao original: 2× super efetivo, 0.5× pouco efetivo.
  function typeMult(attType, defType) {
    return (EFFECT[attType] && EFFECT[attType][defType]) ?? 1;
  }

  // ---------- Batalha (estilo original: categoria, estágios, status, prioridade, crítico, itens) ----------
  // Crítico por estágios (gerações recentes): 0 → 1/24, 1 → 1/8, 2 → 1/2, 3+ → sempre. Dano ×1,5.
  // Golpe de crítico alto = +1, item Lente de Mira = +1, Concentração = +2.
  const CRIT_RATE = [1 / 24, 1 / 8, 1 / 2, 1];
  const heldOf = (b) => (b.c.held && HELD[b.c.held]) || {};
  const canUseOnce = (b, key) => !!heldOf(b)[key] && !b.used[b.c.held];

  function critStage(att, m) {
    return Math.min(3, (m.crit || 0) + att.critStage + (heldOf(att).crit || 0));
  }

  /** Chance de acertar: precisão do golpe × estágios (precisão − evasão, de −6 a +6) × itens. */
  function hitChance(att, def, m) {
    if (m.acc == null) return 1;
    return (m.acc / 100) * accStageMult(clamp(att.stages.acc - def.stages.eva, -6, 6))
      * (heldOf(att).accMult || 1) * (heldOf(def).evaMult || 1);
  }

  /** Baga da Vida: abaixo da metade do HP, recupera uma parte (1× por luta). */
  function checkBerry(b, ev) {
    const c = b.c;
    if (c.hp > 0 && c.hp <= maxHp(c) / 2 && canUseOnce(b, 'berryHeal')) {
      b.used[c.held] = true;
      const h = Math.min(maxHp(c) - c.hp, Math.floor(maxHp(c) * heldOf(b).berryHeal));
      c.hp += h;
      ev.push({ kind: 'item', who: b.side, item: c.held, what: 'heal', amount: h });
    }
  }

  const STAGES = ['atk', 'def', 'mag', 'res', 'spd', 'acc', 'eva'];
  const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));     // atributos: ×0.25 .. ×4
  const accStageMult = (s) => (s >= 0 ? (3 + s) / 3 : 3 / (3 - s));  // precisão/evasão: ×0.33 .. ×3

  /** Estado de uma criatura dentro da batalha (os estágios zeram quando a luta acaba). */
  function battler(c, side) {
    ensureMoves(c);
    return { c, side, stages: Object.fromEntries(STAGES.map((k) => [k, 0])), critStage: 0, used: {}, protecting: false, protectChain: 0, mustRecharge: false };
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
    const crit = rng() < CRIT_RATE[critStage(att, m)];
    const A = effStat(att, physical ? 'atk' : 'mag', { ignoreDrops: crit });
    const D = effStat(def, physical ? 'def' : 'res', { ignoreBoosts: crit });
    const mult = m.typeless ? 1 : typeMult(m.type, typeOf(def.c));
    const stab = !m.typeless && m.type === typeOf(att.c) ? 1.5 : 1;
    const burn = physical && att.c.status === 'queimadura' ? 0.5 : 1;
    // itens de quem ataca
    const h = heldOf(att);
    let item = 1;
    if (h.catBoost && h.catBoost.cat === m.cat) item *= h.catBoost.mult;
    if (h.typeBoost && h.typeBoost.type === m.type && !m.typeless) item *= h.typeBoost.mult;
    if (h.superMult && mult > 1) item *= h.superMult;
    if (h.orb) item *= 1.3;
    const base = ((2 * att.c.level / 5 + 2) * m.power * A / D) / 50 + 2;
    const amount = Math.max(1, Math.floor(base * stab * mult * (crit ? 1.5 : 1) * burn * item * rand(rng, 0.85, 1)));
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
    if (canUseOnce(target, 'berryCure')) { // Baga Curativa age na hora
      target.used[target.c.held] = true;
      target.c.status = null;
      target.c.sleep = 0;
      ev.push({ kind: 'item', who: target.side, item: target.c.held, what: 'cure', status });
    }
    return true;
  }

  /**
   * Executa a ação de `att` contra `def` com o golpe `id`. Mexe no HP/PP/status e devolve
   * a lista de eventos (pra animar e escrever o log).
   */
  function useMove(att, def, id, rng = Math.random) {
    const ev = [];
    const c = att.c;

    if (att.mustRecharge) { // turno perdido depois de um golpe com recarga
      att.mustRecharge = false;
      ev.push({ kind: 'cant', who: att.side, why: 'recarga' });
      return ev;
    }

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

    // Proteger: chance cai pra 1/3 a cada uso seguido
    if (m.protect) {
      if (rng() < 1 / Math.pow(3, att.protectChain)) {
        att.protecting = true;
        att.protectChain++;
        ev.push({ kind: 'protect', who: att.side });
      } else {
        att.protectChain = 0;
        ev.push({ kind: 'fail', who: att.side });
      }
      return ev;
    }
    att.protectChain = 0;

    // Descanso: HP cheio e dorme 2 turnos (acorda e age no 3º)
    if (m.rest) {
      if (c.hp >= maxHp(c)) { ev.push({ kind: 'fail', who: att.side }); return ev; }
      ev.push({ kind: 'heal', who: att.side, amount: maxHp(c) - c.hp });
      c.hp = maxHp(c);
      c.status = 'sono';
      c.sleep = 3;
      ev.push({ kind: 'status', who: att.side, status: 'sono', rest: true });
      return ev;
    }

    const selfTarget = m.cat === 'status' && (m.heal || (m.effect && (m.effect.target === 'self' || m.effect.crit)));
    if (!selfTarget && def.protecting) {
      ev.push({ kind: 'protected', who: def.side });
      return ev;
    }
    if (!selfTarget && rng() >= hitChance(att, def, m)) {
      ev.push({ kind: 'miss', who: att.side });
      return ev;
    }

    if (m.cat !== 'status') {
      const r = moveDamage(att, def, id, rng);
      let dealt = Math.min(def.c.hp, r.amount);
      // Fita de Foco: com HP cheio, segura com 1
      if (dealt >= def.c.hp && def.c.hp === maxHp(def.c) && canUseOnce(def, 'sash')) {
        def.used[def.c.held] = true;
        dealt = def.c.hp - 1;
        def.c.hp -= dealt;
        ev.push({ kind: 'damage', who: def.side, amount: dealt, crit: r.crit, mult: r.mult });
        ev.push({ kind: 'item', who: def.side, item: def.c.held, what: 'sash' });
      } else {
        def.c.hp -= dealt;
        ev.push({ kind: 'damage', who: def.side, amount: r.amount, crit: r.crit, mult: r.mult });
      }
      checkBerry(def, ev);
      if (m.recharge) att.mustRecharge = true;
      if (m.drain && dealt > 0) {
        const h = Math.min(maxHp(c) - c.hp, Math.max(1, Math.floor(dealt * m.drain)));
        if (h > 0) { c.hp += h; ev.push({ kind: 'heal', who: att.side, amount: h, drain: true }); }
      }
      if (m.recoil && dealt > 0) {
        const rc = Math.min(c.hp, Math.max(1, Math.floor(dealt * m.recoil)));
        c.hp -= rc;
        ev.push({ kind: 'recoil', who: att.side, amount: rc });
      }
      if (heldOf(att).orb && dealt > 0 && c.hp > 0) { // Orbe Vital cobra 10% do HP
        const oc = Math.min(c.hp, Math.max(1, Math.floor(maxHp(c) / 10)));
        c.hp -= oc;
        ev.push({ kind: 'item', who: att.side, item: c.held, what: 'orb', amount: oc });
      }
      checkBerry(att, ev);
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
      if (e && e.crit) {
        const before = att.critStage;
        att.critStage = Math.min(3, before + e.crit);
        ev.push({ kind: 'critUp', who: att.side, failed: before === att.critStage });
      }
    }

    if (def.c.hp <= 0) ev.push({ kind: 'faint', who: def.side });
    if (c.hp <= 0) ev.push({ kind: 'faint', who: att.side });
    return ev;
  }

  /** Dano de queimadura (1/16) e veneno (1/8) no fim do turno. */
  function endOfTurn(b) {
    const ev = [];
    const c = b.c;
    b.protecting = false;
    if (c.hp <= 0) return ev;
    const frac = c.status === 'queimadura' ? 1 / 16 : c.status === 'veneno' ? 1 / 8 : 0;
    if (frac) {
      const amount = Math.min(c.hp, Math.max(1, Math.floor(maxHp(c) * frac)));
      c.hp -= amount;
      ev.push({ kind: 'residual', who: b.side, status: c.status, amount });
      if (c.hp <= 0) ev.push({ kind: 'faint', who: b.side });
    }
    if (c.hp > 0 && heldOf(b).leftovers && c.hp < maxHp(c)) {
      const h = Math.min(maxHp(c) - c.hp, Math.max(1, Math.floor(maxHp(c) / 16)));
      c.hp += h;
      ev.push({ kind: 'item', who: b.side, item: c.held, what: 'leftovers', amount: h });
    }
    checkBerry(b, ev);
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
        if (m.recharge) score *= 0.7;
      } else if (m.heal) {
        score = hpR < 0.35 ? 140 : hpR < 0.6 ? 55 : 0;
      } else if (m.rest) {
        score = hpR < 0.3 ? 130 : hpR < 0.5 && c.status ? 90 : 0;
      } else if (m.protect) {
        score = self.protectChain ? 3 : (foe.c.status === 'veneno' || foe.c.status === 'queimadura' ? 55 : 18);
      } else if (m.effect?.status) {
        score = foe.c.status || statusImmune(foe, m.effect.status, m) ? 0 : m.effect.status === 'sono' ? 75 : 60;
        score *= (m.acc ?? 100) / 100;
      } else if (m.effect?.crit) {
        score = self.critStage < 2 && hpR > 0.5 ? 40 : 2;
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
      tms: {},                // MTs que o jogador tem (reutilizáveis)
      daycare: { mons: [], egg: null, t: 0 },
      eggs: [],
      zone: 'campina',
      dex: { seen: {}, caught: {} },
      // catchMode: 'new' = espécies novas e brilhantes | 'all' = todos | 'ask' = pergunta | 'off' = só manual
      settings: { catchMode: 'new', autoBuy: false, autoMoves: true },
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
    if (rng() < 0.08) wild.held = WILD_HELD[randInt(rng, 0, WILD_HELD.length - 1)]; // vem junto na captura
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
    let coins = coinReward(wild, rng);
    const lead = getLead(state);
    const auto = state.settings.autoMoves !== false;
    const xpOf = (c) => (c.held && HELD[c.held].xpMult) || 1; // Ovo da Sorte
    const events = lead ? gainXp(lead, Math.ceil(xp * xpOf(lead)), auto) : [];
    for (const c of state.team) {
      if (c !== lead) gainXp(c, Math.ceil(xp * 0.3 * xpOf(c)), auto);
    }
    const coinMult = (lead && lead.held && HELD[lead.held].coinMult) || 1; // Moeda da Sorte
    coins *= coinMult;
    state.coins += coins;
    state.stats.battles++;
    state.stats.wins++;
    // às vezes o selvagem deixa um item de esforço (mais raro e melhor em nível alto)
    let drop = null;
    if (rng() < 0.12) {
      const r = rng() * (wild.level / 12);
      drop = r > 2.6 ? 'esforco4' : r > 1.6 ? 'esforco3' : r > 0.7 ? 'esforco2' : 'esforco1';
      state.items[drop] = (state.items[drop] || 0) + 1;
    }
    const tm = rollTmDrop(state, rng);
    return { xp, coins, events, drop, tm };
  }

  function buy(state, item, qty = 1) {
    const it = SHOP[item] || HELD[item];
    if (!it || qty < 1) return false;
    const cost = it.price * qty;
    if (state.coins < cost) return false;
    state.coins -= cost;
    state.items[item] = (state.items[item] || 0) + qty;
    return true;
  }

  // ---------- MTs ----------
  const hasTm = (state, tmId) => !!(state.tms && state.tms[tmId]);

  function canLearnTm(c, tmId) {
    return tmCompatible(tmId, c.species, SPECIES[c.species].type);
  }

  function buyTm(state, tmId) {
    const tm = TMS[tmId];
    if (!tm || tm.price == null || hasTm(state, tmId) || state.coins < tm.price) return false;
    state.coins -= tm.price;
    state.tms = { ...(state.tms || {}), [tmId]: true };
    return true;
  }

  /**
   * Ensina a MT. Com vaga, o golpe já fica ativo. Sem vaga: troca por `replace` (um dos ativos)
   * ou, sem replace, só guarda entre os conhecidos. Devolve o resultado ou null.
   */
  function teachTm(state, c, tmId, replace = null) {
    if (!hasTm(state, tmId) || !canLearnTm(c, tmId)) return null;
    ensureMoves(c);
    const id = TMS[tmId].move;
    if (c.moves.includes(id)) return null;
    if (!c.known.includes(id)) c.known.push(id);
    if (c.moves.length < 4) {
      c.moves.push(id);
      c.pp[id] = MOVES[id].pp;
      return { move: id, active: true };
    }
    if (replace && c.moves.includes(replace)) {
      c.moves[c.moves.indexOf(replace)] = id;
      delete c.pp[replace];
      c.pp[id] = MOVES[id].pp;
      return { move: id, active: true, replaced: replace };
    }
    return { move: id, active: false };
  }

  /** MT exclusiva que pode cair agora (da zona atual e que o jogador ainda não tem). */
  function rollTmDrop(state, rng = Math.random) {
    const pool = Object.keys(TMS).filter((id) => TMS[id].drop && TMS[id].drop.includes(state.zone) && !hasTm(state, id));
    if (!pool.length || rng() >= TM_DROP_CHANCE) return null;
    const id = pool[randInt(rng, 0, pool.length - 1)];
    state.tms = { ...(state.tms || {}), [id]: true };
    return id;
  }

  // ---------- Creche, ovos e eclosão ----------
  // Dois bichos de sexos opostos que compartilham um grupo de ovo, deixados na creche, às vezes
  // produzem um ovo. O filhote é da forma base da mãe, herda 3 IVs dos pais (5 com Laço do Destino)
  // e a natureza de quem segura a Pedra Eterna. O ovo choca com o tempo de jogo.
  const DAYCARE_MAX = 2;
  const EGGS_MAX = 4;
  const EGG_CHECK_S = 60; // a cada quanto tempo a creche tenta fazer um ovo

  function baseSpecies(sp) {
    for (let guard = 0; guard < 5; guard++) {
      const prev = Object.keys(SPECIES).find((k) => SPECIES[k].evolvesTo === sp);
      if (!prev) break;
      sp = prev;
    }
    return sp;
  }

  /** Chance de ovo por tentativa (0 = incompatível). Mesma espécie se dá melhor. */
  function breedChance(a, b) {
    if (!a || !b || !a.gender || !b.gender || a.gender === b.gender) return 0;
    const ga = SPECIES[a.species].egg, gb = SPECIES[b.species].egg;
    if (ga.includes('indefinido') || gb.includes('indefinido')) return 0;
    if (!ga.some((g) => gb.includes(g))) return 0;
    return baseSpecies(a.species) === baseSpecies(b.species) ? 0.5 : 0.25;
  }

  function breedMood(chance) {
    if (chance >= 0.5) return 'Os dois parecem se dar muito bem.';
    if (chance > 0) return 'Os dois se dão bem.';
    return 'Os dois preferem brincar com outros.';
  }

  /** Tempo (s) pra chocar: espécies mais raras demoram mais. */
  const hatchTime = (sp) => Math.round(300 + (1 - SPECIES[sp].catch) * 900);

  function makeEgg(a, b, rng = Math.random) {
    const mother = a.gender === 'F' ? a : b;
    const species = baseSpecies(mother.species);
    const knot = [a, b].some((p) => p.held === 'laco_destino');
    const stats = [...STAT_KEYS].sort(() => rng() - 0.5).slice(0, knot ? 5 : 3);
    const ivs = Object.fromEntries(STAT_KEYS.map((k) => [k, randInt(rng, 0, 31)]));
    for (const k of stats) ivs[k] = (rng() < 0.5 ? a : b).ivs[k];
    const stone = [a, b].filter((p) => p.held === 'pedra_eterna');
    const nature = stone.length ? stone[randInt(rng, 0, stone.length - 1)].nature : NATURE_IDS[randInt(rng, 0, NATURE_IDS.length - 1)];
    return { id: uid(rng), species, ivs, nature, shiny: rng() < SHINY_CHANCE, progress: 0, need: hatchTime(species), inherited: stats };
  }

  function hatchEgg(state, egg, rng = Math.random) {
    const c = { uid: uid(rng), species: egg.species, level: 1, xp: 0, shiny: egg.shiny, ivs: egg.ivs, nature: egg.nature };
    ensureGenes(c, rng);
    c.hp = maxHp(c);
    ensureMoves(c);
    if (state.team.length < TEAM_MAX) state.team.push(c);
    else state.box.push(c);
    state.dex.seen[c.species] = true;
    state.dex.caught[c.species] = true;
    state.stats.hatched = (state.stats.hatched || 0) + 1;
    return c;
  }

  function ensureBreeding(state) {
    if (!state.daycare) state.daycare = { mons: [], egg: null, t: 0 };
    if (!state.eggs) state.eggs = [];
  }

  /** Avança creche e ovos em `dt` segundos. Devolve eventos: {type:'egg'} e {type:'hatch', creature}. */
  function tickBreeding(state, dt, rng = Math.random) {
    ensureBreeding(state);
    const ev = [];
    const dc = state.daycare;
    const [a, b] = dc.mons;
    const chance = breedChance(a, b);
    if (chance && !dc.egg) {
      dc.t += dt;
      while (dc.t >= EGG_CHECK_S && !dc.egg) {
        dc.t -= EGG_CHECK_S;
        if (rng() < chance) { dc.egg = makeEgg(a, b, rng); ev.push({ type: 'egg', species: dc.egg.species }); }
      }
    } else if (!chance) dc.t = 0;
    if (dc.egg && state.eggs.length < EGGS_MAX) { // pega o ovo sozinho quando há espaço
      state.eggs.push(dc.egg);
      dc.egg = null;
    }
    for (const egg of [...state.eggs]) {
      egg.progress = Math.min(egg.need, egg.progress + dt);
      if (egg.progress >= egg.need) {
        state.eggs.splice(state.eggs.indexOf(egg), 1);
        ev.push({ type: 'hatch', creature: hatchEgg(state, egg, rng) });
      }
    }
    return ev;
  }

  /** Deixa na creche (sai da equipe/caixa). A equipe precisa ficar com alguém. */
  function daycarePut(state, cUid) {
    ensureBreeding(state);
    if (state.daycare.mons.length >= DAYCARE_MAX) return false;
    const fromTeam = state.team.findIndex((c) => c.uid === cUid);
    const fromBox = state.box.findIndex((c) => c.uid === cUid);
    if (fromTeam < 0 && fromBox < 0) return false;
    if (fromTeam >= 0 && state.team.length <= 1) return false;
    const [c] = fromTeam >= 0 ? state.team.splice(fromTeam, 1) : state.box.splice(fromBox, 1);
    afterBattle(c);
    c.hp = maxHp(c);
    state.daycare.mons.push(c);
    if (state.lead === c.uid) state.lead = state.team[0].uid;
    state.daycare.t = 0;
    return true;
  }

  function daycareTake(state, cUid) {
    ensureBreeding(state);
    const i = state.daycare.mons.findIndex((c) => c.uid === cUid);
    if (i < 0) return false;
    const [c] = state.daycare.mons.splice(i, 1);
    if (state.team.length < TEAM_MAX) state.team.push(c);
    else state.box.push(c);
    state.daycare.t = 0;
    return true;
  }

  // ---------- Captura automática ----------
  const CATCH_MODES = {
    new: 'Espécies novas e brilhantes',
    all: 'Capturar todos',
    ask: 'Perguntar depois de derrotar',
    off: 'Só manual (clicar no derrotado)',
  };

  /** Settings de saves antigos (autoCatch booleano) viram catchMode. */
  function ensureSettings(state) {
    const st = state.settings || (state.settings = {});
    if (!CATCH_MODES[st.catchMode]) st.catchMode = st.autoCatch === false ? 'off' : 'new';
    delete st.autoCatch;
    if (st.autoBuy === undefined) st.autoBuy = false;
    if (st.autoMoves === undefined) st.autoMoves = true;
    return st;
  }

  /** Os modos automáticos querem capturar esse selvagem depois de derrotado? */
  function wantsCatch(state, wild) {
    switch (ensureSettings(state).catchMode) {
      case 'all': return true;
      case 'new': return !state.dex.caught[wild.species] || wild.shiny;
      default: return false; // 'ask' e 'off' decidem na hora (pergunta / clique)
    }
  }

  /** Sem cápsula e com compra automática ligada: compra 5 (ou o que der). Devolve quantas comprou. */
  function autoBuyCapsules(state) {
    if (!state.settings.autoBuy || (state.items.capsula || 0) > 0 || (state.items.super || 0) > 0) return 0;
    const qty = Math.min(5, Math.floor(state.coins / SHOP.capsula.price));
    if (qty > 0) buy(state, 'capsula', qty);
    return qty;
  }

  // ---------- Soltar (liberar) ----------
  /** IV total em % (0–100). */
  const ivPercent = (c) => Math.round((STAT_KEYS.reduce((t, k) => t + (c.ivs?.[k] || 0), 0) / (31 * 6)) * 100);
  const perfectIvs = (c) => STAT_KEYS.filter((k) => (c.ivs?.[k] || 0) >= 31).length;

  /**
   * Filtro da caixa. f = { species, nature, natureNot, maxIv, minIv, shiny: 'any'|'only'|'no', gender }
   * (campos vazios = qualquer).
   */
  function matchesFilter(c, f = {}) {
    if (f.species && c.species !== f.species) return false;
    if (f.nature) {
      const neutral = !NATURES[c.nature]?.up;
      const hit = f.nature === '_neutral' ? neutral : c.nature === f.nature;
      if (f.natureNot ? hit : !hit) return false;
    }
    const iv = ivPercent(c);
    if (f.maxIv != null && f.maxIv !== '' && iv > Number(f.maxIv)) return false;
    if (f.minIv != null && f.minIv !== '' && iv < Number(f.minIv)) return false;
    if (f.shiny === 'only' && !c.shiny) return false;
    if (f.shiny === 'no' && c.shiny) return false;
    if (f.gender && c.gender !== f.gender) return false;
    return true;
  }

  /**
   * Solta criaturas da caixa (equipe e trancadas 🔒 nunca). Como no Legends: Arceus, soltar dá
   * itens de esforço; aqui também algumas moedas. O item segurado volta pra mochila.
   */
  function releaseCreatures(state, uids, rng = Math.random) {
    const set = new Set(uids);
    const out = { count: 0, coins: 0, items: {} };
    state.box = state.box.filter((c) => {
      if (!set.has(c.uid) || c.locked) return true;
      out.count++;
      out.coins += c.level * 2;
      if (c.held) state.items[c.held] = (state.items[c.held] || 0) + 1;
      if (rng() < 0.3) {
        const id = c.level >= 30 ? 'esforco3' : c.level >= 15 ? 'esforco2' : 'esforco1';
        out.items[id] = (out.items[id] || 0) + 1;
        state.items[id] = (state.items[id] || 0) + 1;
      }
      return false;
    });
    state.coins += out.coins;
    state.stats.released = (state.stats.released || 0) + out.count;
    return out;
  }

  function toggleLock(state, cUid) {
    const c = [...state.team, ...state.box].find((x) => x.uid === cUid);
    if (!c) return false;
    c.locked = !c.locked;
    return true;
  }

  /** Dá um item pra criatura segurar (null = tirar). O item anterior volta pra mochila. */
  function hold(state, c, item) {
    if (item && (!HELD[item] || !(state.items[item] > 0))) return false;
    if (c.held) state.items[c.held] = (state.items[c.held] || 0) + 1;
    c.held = item || null;
    if (item) state.items[item]--;
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
    const hatched = [];
    for (let t = 0; t < s; t += EGG_CHECK_S) {
      tickBreeding(state, Math.min(EGG_CHECK_S, s - t), rng).forEach((e) => { if (e.type === 'hatch') hatched.push(e.creature); });
    }
    return { seconds: s, battles, xp, coins, levels: lead.level - startLevel, evolutions, hatched };
  }

  const api = {
    TYPE_LABEL, TYPE_COLOR, EFFECT, SPECIES, SPECIES_ORDER, STARTERS, ZONES, SHOP, TEAM_MAX,
    CATCH_MODES, ensureSettings, wantsCatch, autoBuyCapsules, ivPercent, perfectIvs, matchesFilter, releaseCreatures, toggleLock,
    DAYCARE_MAX, EGGS_MAX, EGG_CHECK_S, rollGender, baseSpecies, breedChance, breedMood, hatchTime, makeEgg,
    hatchEgg, ensureBreeding, tickBreeding, daycarePut, daycareTake,
    TMS, TM_DROP_CHANCE, hasTm, canLearnTm, buyTm, teachTm, rollTmDrop, describeMove: MV.describeMove,
    NATURES, HELD, natureMult, hold, critStage, hitChance, CRIT_RATE,
    STAT_KEYS, EFFORT_MULT, EFFORT_MAX, GRIT_ITEMS, ivRating, effortBonus, effortFromIv, ensureGenes, gritFor, useGrit,
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
