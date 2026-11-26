// Golpes e quais criaturas aprendem cada um (e em que nível).
// Sem DOM: roda no navegador (window.Moves) e no Node (require).
//
// Campos de um golpe:
//   name, type, cat ('fisico' | 'magico' | 'status'), power, acc (null = nunca erra), pp
//   priority   ordem no turno (+1 age antes, mesmo sendo mais lento)
//   crit       1 = chance alta de crítico (1/8 em vez de 1/16)
//   drain      fração do dano que volta como HP
//   recoil     fração do dano que o atacante sofre
//   heal       fração do HP máximo que o atacante recupera
//   powder     pó/esporo: criaturas de planta são imunes
//   protect    protege de golpes no alvo neste turno (falha cada vez mais se repetido)
//   rest       recupera todo o HP e dorme 2 turnos
//   recharge   depois de acertar, perde o próximo turno recarregando
//   desc       texto livre (opcional); sem ele, a descrição é montada pelos campos
//   effect     { status: 'queimadura'|'veneno'|'paralisia'|'sono', chance? }
//              { stat: { atk: -1, ... }, target: 'foe'|'self', chance? }
//              { crit: 2 }  sobe estágios de crítico de quem usa
//              (chance só vale pra golpes de dano; golpe de status sempre aplica se acertar)

(function (root) {
  'use strict';

  const CATEGORY = {
    fisico: { label: 'Físico', icon: '⚔', color: '#f97316' },
    magico: { label: 'Mágico', icon: '✦', color: '#818cf8' },
    status: { label: 'Status', icon: '◐', color: '#a8a29e' },
  };

  const STATUS = {
    queimadura: { label: 'Queimado', short: 'QUE', color: '#f97316' },
    veneno:     { label: 'Envenenado', short: 'ENV', color: '#a855f7' },
    paralisia:  { label: 'Paralisado', short: 'PAR', color: '#eab308' },
    sono:       { label: 'Dormindo', short: 'SON', color: '#94a3b8' },
  };

  const STAT_LABEL = { hp: 'HP', atk: 'Ataque', def: 'Defesa', mag: 'Magia', res: 'Resistência', spd: 'Velocidade', acc: 'Precisão', eva: 'Evasão' };

  const MOVES = {
    // ----- Normal -----
    trombada:     { name: 'Trombada', type: 'normal', cat: 'fisico', power: 40, acc: 100, pp: 35 },
    mordida:      { name: 'Mordida', type: 'normal', cat: 'fisico', power: 60, acc: 100, pp: 25 },
    bote:         { name: 'Bote Rápido', type: 'normal', cat: 'fisico', power: 40, acc: 100, pp: 30, priority: 1 },
    esmagar:      { name: 'Esmagamento', type: 'normal', cat: 'fisico', power: 85, acc: 90, pp: 15 },
    pancadao:     { name: 'Pancadão', type: 'normal', cat: 'fisico', power: 120, acc: 100, pp: 10, recoil: 1 / 3 },
    rosnado:      { name: 'Rosnado', type: 'normal', cat: 'status', acc: 100, pp: 40, effect: { stat: { atk: -1 }, target: 'foe' } },
    encarada:     { name: 'Encarada', type: 'normal', cat: 'status', acc: 100, pp: 30, effect: { stat: { def: -1 }, target: 'foe' } },
    grito:        { name: 'Grito de Guerra', type: 'normal', cat: 'status', acc: null, pp: 20, effect: { stat: { atk: 2 }, target: 'self' } },
    concentrar:   { name: 'Concentração', type: 'normal', cat: 'status', acc: null, pp: 30, effect: { crit: 2 } },
    miragem:      { name: 'Miragem', type: 'normal', cat: 'status', acc: null, pp: 15, effect: { stat: { eva: 1 }, target: 'self' } },
    soneca:       { name: 'Soneca', type: 'normal', cat: 'status', acc: null, pp: 10, heal: 0.5 },

    // ----- Fogo -----
    fagulha:      { name: 'Fagulha', type: 'fogo', cat: 'magico', power: 40, acc: 100, pp: 25, effect: { status: 'queimadura', chance: 0.1 } },
    soco_brasa:   { name: 'Soco em Brasa', type: 'fogo', cat: 'fisico', power: 75, acc: 100, pp: 15, effect: { status: 'queimadura', chance: 0.1 } },
    labareda:     { name: 'Labareda', type: 'fogo', cat: 'magico', power: 90, acc: 100, pp: 15, effect: { status: 'queimadura', chance: 0.1 } },
    erupcao:      { name: 'Erupção Ancestral', type: 'fogo', cat: 'magico', power: 110, acc: 85, pp: 5, effect: { status: 'queimadura', chance: 0.3 } },
    fogo_fatuo:   { name: 'Fogo-Fátuo', type: 'fogo', cat: 'status', acc: 85, pp: 15, effect: { status: 'queimadura' } },
    chama_interior: { name: 'Chama Interior', type: 'fogo', cat: 'status', acc: null, pp: 20, effect: { stat: { mag: 2 }, target: 'self' } },

    // ----- Água -----
    borbulha:     { name: 'Borbulha', type: 'agua', cat: 'magico', power: 40, acc: 100, pp: 30, effect: { stat: { spd: -1 }, target: 'foe', chance: 0.1 } },
    jato_agua:    { name: "Jato d'Água", type: 'agua', cat: 'magico', power: 65, acc: 100, pp: 20 },
    cauda_molhada: { name: 'Cauda Molhada', type: 'agua', cat: 'fisico', power: 80, acc: 90, pp: 15 },
    onda_forte:   { name: 'Onda Forte', type: 'agua', cat: 'magico', power: 90, acc: 100, pp: 10 },
    casca_agua:   { name: "Casca d'Água", type: 'agua', cat: 'status', acc: null, pp: 20, effect: { stat: { def: 1, res: 1 }, target: 'self' } },
    neblina:      { name: 'Neblina', type: 'agua', cat: 'status', acc: 100, pp: 20, effect: { stat: { acc: -1 }, target: 'foe' } },
    agua_fresca:  { name: 'Água Fresca', type: 'agua', cat: 'status', acc: null, pp: 10, heal: 0.5 },

    // ----- Planta -----
    semente:      { name: 'Semente Sugadora', type: 'planta', cat: 'magico', power: 45, acc: 100, pp: 15, drain: 0.5 },
    folha:        { name: 'Folha Cortante', type: 'planta', cat: 'fisico', power: 55, acc: 95, pp: 25, crit: 1 },
    petalas:      { name: 'Chuva de Pétalas', type: 'planta', cat: 'magico', power: 95, acc: 100, pp: 10 },
    po_sono:      { name: 'Pó do Sono', type: 'planta', cat: 'status', acc: 75, pp: 15, powder: true, effect: { status: 'sono' } },
    polen:        { name: 'Pólen Tóxico', type: 'planta', cat: 'status', acc: 90, pp: 20, powder: true, effect: { status: 'veneno' } },
    raiz:         { name: 'Raiz Profunda', type: 'planta', cat: 'status', acc: null, pp: 10, heal: 0.5 },

    // ----- Elétrico -----
    choquinho:    { name: 'Choquinho', type: 'eletrico', cat: 'magico', power: 40, acc: 100, pp: 30, effect: { status: 'paralisia', chance: 0.1 } },
    faisca:       { name: 'Faísca', type: 'eletrico', cat: 'fisico', power: 65, acc: 100, pp: 20, effect: { status: 'paralisia', chance: 0.3 } },
    relampago:    { name: 'Relâmpago', type: 'eletrico', cat: 'magico', power: 90, acc: 100, pp: 15, effect: { status: 'paralisia', chance: 0.1 } },
    estatica:     { name: 'Estática', type: 'eletrico', cat: 'status', acc: 90, pp: 20, effect: { status: 'paralisia' } },
    pisca:        { name: 'Pisca-Pisca', type: 'eletrico', cat: 'status', acc: 100, pp: 20, effect: { stat: { acc: -1 }, target: 'foe' } },
    zunido:       { name: 'Zunido', type: 'eletrico', cat: 'status', acc: null, pp: 30, effect: { stat: { spd: 2 }, target: 'self' } },

    // ----- Pedra -----
    pedrada:      { name: 'Pedrada', type: 'pedra', cat: 'fisico', power: 50, acc: 90, pp: 15 },
    desmoronar:   { name: 'Desmoronamento', type: 'pedra', cat: 'fisico', power: 90, acc: 85, pp: 10, crit: 1 },
    areia:     { name: 'Areia nos Olhos', type: 'pedra', cat: 'status', acc: 100, pp: 15, effect: { stat: { acc: -1 }, target: 'foe' } },
    endurecer:    { name: 'Endurecer', type: 'pedra', cat: 'status', acc: null, pp: 30, effect: { stat: { def: 1 }, target: 'self' } },
    muralha:      { name: 'Muralha', type: 'pedra', cat: 'status', acc: null, pp: 20, effect: { stat: { def: 2 }, target: 'self' } },

    // ----- Voador -----
    bicada:       { name: 'Bicada', type: 'voador', cat: 'fisico', power: 35, acc: 100, pp: 35 },
    rajada:       { name: 'Rajada', type: 'voador', cat: 'magico', power: 40, acc: 100, pp: 35 },
    rasante:      { name: 'Voo Rasante', type: 'voador', cat: 'fisico', power: 60, acc: 100, pp: 20 },
    ciclone:      { name: 'Ciclone', type: 'voador', cat: 'magico', power: 75, acc: 95, pp: 15, effect: { stat: { acc: -1 }, target: 'foe', chance: 0.3 } },
    corrente_ar:  { name: 'Corrente de Ar', type: 'voador', cat: 'status', acc: null, pp: 30, effect: { stat: { spd: 2 }, target: 'self' } },

    // ----- Ensinados por MT -----
    lealdade:     { name: 'Lealdade', type: 'normal', cat: 'fisico', power: 102, acc: 100, pp: 20, desc: 'Um golpe dado com toda a amizade pelo treinador.' },
    proteger:     { name: 'Proteger', type: 'normal', cat: 'status', acc: null, pp: 10, priority: 4, protect: true },
    descanso:     { name: 'Descanso', type: 'normal', cat: 'status', acc: null, pp: 10, rest: true },
    toxico:       { name: 'Tóxico', type: 'normal', cat: 'status', acc: 90, pp: 10, effect: { status: 'veneno' } },
    hiper_raio:   { name: 'Hiper-Raio', type: 'normal', cat: 'magico', power: 150, acc: 90, pp: 5, recharge: true },
    musculacao:   { name: 'Musculação', type: 'normal', cat: 'status', acc: null, pp: 20, effect: { stat: { atk: 1, def: 1 }, target: 'self' } },
    mente_calma:  { name: 'Mente Calma', type: 'normal', cat: 'status', acc: null, pp: 20, effect: { stat: { mag: 1, res: 1 }, target: 'self' } },
    golpe_aereo:  { name: 'Golpe Aéreo', type: 'voador', cat: 'fisico', power: 60, acc: null, pp: 20 },
    furacao:      { name: 'Furacão', type: 'voador', cat: 'magico', power: 110, acc: 70, pp: 10, effect: { stat: { acc: -1 }, target: 'foe', chance: 0.3 } },
    grande_dreno: { name: 'Grande Dreno', type: 'planta', cat: 'magico', power: 75, acc: 100, pp: 10, drain: 0.5 },
    raio_sol:     { name: 'Raio de Sol', type: 'planta', cat: 'magico', power: 120, acc: 85, pp: 10 },
    tremor:       { name: 'Tremor', type: 'pedra', cat: 'fisico', power: 100, acc: 100, pp: 10 },
    laminas_pedra: { name: 'Lâminas de Pedra', type: 'pedra', cat: 'fisico', power: 100, acc: 80, pp: 5, crit: 1 },
    chama_azul:   { name: 'Chama Azul', type: 'fogo', cat: 'fisico', power: 120, acc: 100, pp: 15, recoil: 1 / 3, effect: { status: 'queimadura', chance: 0.1 } },
    hidrocanhao:  { name: 'Hidrocanhão', type: 'agua', cat: 'magico', power: 110, acc: 80, pp: 5 },
    trovoada:     { name: 'Trovoada', type: 'eletrico', cat: 'magico', power: 110, acc: 70, pp: 10, effect: { status: 'paralisia', chance: 0.3 } },

    // Quando todos os PP acabam (não dá pra aprender).
    debater:      { name: 'Debater-se', type: 'normal', cat: 'fisico', power: 50, acc: null, pp: 0, recoil: 1 / 4, typeless: true },
  };

  // Golpes aprendidos por nível: ficam em shared/species.js (campo learnset de cada espécie).

  // ---------- MTs (máquinas de técnica) ----------
  // Reutilizáveis: comprou/achou uma vez, ensina pra quantas criaturas compatíveis quiser.
  //   price     preço na loja (null = exclusiva: só cai de batalha)
  //   compat    tipos (fogo, agua...) e/ou espécies que podem aprender; 'all' = todas
  //   drop      só exclusivas: zonas onde cai
  const ALL = ['all'];
  const TMS = {
    mt01: { move: 'lealdade', price: 600, compat: ALL },
    mt02: { move: 'proteger', price: 800, compat: ALL },
    mt03: { move: 'descanso', price: 700, compat: ALL },
    mt04: { move: 'toxico', price: 500, compat: ALL },
    mt05: { move: 'golpe_aereo', price: 500, compat: ['voador', 'pavio', 'lampiao', 'capi', 'capivarao', 'vagalume', 'brotinho', 'ipe'] },
    mt06: { move: 'musculacao', price: 600, compat: ['pedra', 'capi', 'capivarao', 'lampiao', 'mare', 'ipe'] },
    mt07: { move: 'mente_calma', price: 600, compat: ['fogo', 'agua', 'planta', 'eletrico', 'pipa'] },
    mt08: { move: 'grande_dreno', price: 900, compat: ['planta', 'vagalume'] },
    mt09: { move: 'tremor', price: 1200, compat: ['pedra', 'capivarao', 'lampiao', 'mare', 'ipe', 'boitata'] },
    mt10: { move: 'labareda', price: 1000, compat: ['fogo', 'capivarao'] },
    mt11: { move: 'onda_forte', price: 1000, compat: ['agua', 'capi', 'capivarao'] },
    mt12: { move: 'relampago', price: 1000, compat: ['eletrico', 'pipa', 'mare'] },
    mt13: { move: 'petalas', price: 1000, compat: ['planta'] },
    mt14: { move: 'desmoronar', price: 1000, compat: ['pedra', 'capivarao', 'lampiao', 'ipe'] },
    mt15: { move: 'ciclone', price: 1000, compat: ['voador', 'vagalume', 'boitata'] },
    // exclusivas (drop)
    mt16: { move: 'raio_sol', price: null, compat: ['planta', 'boitata'], drop: ['campina', 'lago'] },
    mt17: { move: 'furacao', price: null, compat: ['voador', 'boitata'], drop: ['campina', 'lago'] },
    mt18: { move: 'hidrocanhao', price: null, compat: ['agua', 'capivarao'], drop: ['lago'] },
    mt19: { move: 'trovoada', price: null, compat: ['eletrico', 'pipa', 'mare'], drop: ['lago', 'caverna'] },
    mt20: { move: 'laminas_pedra', price: null, compat: ['pedra', 'capivarao', 'lampiao'], drop: ['caverna'] },
    mt21: { move: 'chama_azul', price: null, compat: ['fogo', 'capivarao'], drop: ['vulcao'] },
    mt22: { move: 'hiper_raio', price: null, compat: ALL, drop: ['caverna', 'vulcao'] },
  };

  /** Pode aprender a MT? (por tipo, por espécie ou 'all') */
  function tmCompatible(tmId, species, type) {
    const tm = TMS[tmId];
    return !!tm && (tm.compat.includes('all') || tm.compat.includes(species) || tm.compat.includes(type));
  }

  // ---------- Descrição em português simples ----------
  const pct = (x) => `${Math.round(x * 100)}%`;
  const STATUS_VERB = { queimadura: 'queimar', veneno: 'envenenar', paralisia: 'paralisar', sono: 'fazer dormir' };

  /** Frases curtas explicando o golpe (a primeira é o resumo). */
  function describeMove(id) {
    const m = MOVES[id];
    if (!m) return [];
    const out = [];
    if (m.desc) out.push(m.desc);
    if (m.cat !== 'status') {
      out.push(`Causa dano ${m.cat === 'fisico' ? 'físico (usa Ataque contra Defesa)' : 'mágico (usa Magia contra Resistência)'}.`);
    }
    if (m.priority) out.push(`Age antes dos outros golpes${m.priority > 1 ? ', quase sempre primeiro' : ''}.`);
    if (m.acc == null && m.cat !== 'status') out.push('Nunca erra.');
    if (m.crit) out.push('Chance de crítico maior.');
    if (m.drain) out.push(`Recupera ${pct(m.drain)} do dano causado.`);
    if (m.recoil) out.push(`Quem usa sofre ${pct(m.recoil)} do dano causado.`);
    if (m.heal) out.push(`Recupera ${pct(m.heal)} do HP máximo.`);
    if (m.protect) out.push('Bloqueia os golpes do inimigo neste turno. Usado seguido, tende a falhar.');
    if (m.rest) out.push('Recupera todo o HP e cura o status, mas dorme por 2 turnos.');
    if (m.recharge) out.push('Muito forte, mas quem usa perde o turno seguinte recarregando.');
    const e = m.effect;
    if (e && e.status) {
      out.push(e.chance ? `${pct(e.chance)} de chance de ${STATUS_VERB[e.status]} o alvo.` : `Tenta ${STATUS_VERB[e.status]} o alvo.`);
    }
    if (e && e.stat) {
      const parts = Object.entries(e.stat).map(([k, v]) => `${v > 0 ? 'aumenta' : 'diminui'} ${STAT_LABEL[k]}${Math.abs(v) > 1 ? ' muito' : ''}`);
      const who = e.target === 'self' ? 'de quem usa' : 'do alvo';
      const txt = `${parts.join(' e ')} ${who}`;
      out.push(e.chance ? `${pct(e.chance)} de chance: ${txt}.` : `${txt[0].toUpperCase()}${txt.slice(1)}.`);
    }
    if (e && e.crit) out.push('Aumenta muito a chance de crítico de quem usa.');
    if (m.powder) out.push('Criaturas de Planta são imunes.');
    if (id === 'debater') out.push('Usado quando todos os PP acabam.');
    return out;
  }

  const api = { MOVES, CATEGORY, STATUS, STAT_LABEL, TMS, tmCompatible, describeMove };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Moves = api;
})(typeof window !== 'undefined' ? window : globalThis);
