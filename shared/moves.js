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
//   effect     { status: 'queimadura'|'veneno'|'paralisia'|'sono', chance? }
//              { stat: { atk: -1, ... }, target: 'foe'|'self', chance? }
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

  const STAT_LABEL = { atk: 'Ataque', def: 'Defesa', mag: 'Magia', res: 'Resistência', spd: 'Velocidade', acc: 'Precisão', eva: 'Evasão' };

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

    // Quando todos os PP acabam (não dá pra aprender).
    debater:      { name: 'Debater-se', type: 'normal', cat: 'fisico', power: 50, acc: null, pp: 0, recoil: 1 / 4, typeless: true },
  };

  // nível -> golpes aprendidos. As evoluções repetem a lista da forma anterior.
  const L_PAVIO = { 1: ['trombada', 'rosnado'], 4: ['fagulha'], 8: ['fogo_fatuo'], 11: ['bote'], 14: ['soco_brasa'] };
  const L_GOTA = { 1: ['trombada', 'encarada'], 4: ['borbulha'], 8: ['casca_agua'], 11: ['neblina'], 14: ['jato_agua'] };
  const L_BROTO = { 1: ['trombada', 'rosnado'], 4: ['semente'], 8: ['po_sono'], 11: ['folha'], 14: ['polen'] };
  const L_CAPI = { 1: ['trombada', 'rosnado'], 5: ['mordida'], 9: ['soneca'], 13: ['bote'], 16: ['grito'] };
  const L_SEIXO = { 1: ['trombada', 'endurecer'], 6: ['areia'], 10: ['pedrada'], 16: ['muralha'], 21: ['desmoronar'] };

  const LEARNSETS = {
    pavio: L_PAVIO,
    lampiao: { ...L_PAVIO, 16: ['chama_interior'], 21: ['labareda'], 30: ['pancadao'] },
    gotinha: L_GOTA,
    mare: { ...L_GOTA, 16: ['agua_fresca'], 20: ['cauda_molhada'], 27: ['onda_forte'] },
    brotinho: L_BROTO,
    ipe: { ...L_BROTO, 16: ['raiz'], 22: ['petalas'], 30: ['esmagar'] },
    capi: L_CAPI,
    capivarao: { ...L_CAPI, 18: ['esmagar'], 28: ['pancadao'] },
    vagalume: { 1: ['choquinho', 'pisca'], 6: ['estatica'], 10: ['bote'], 14: ['faisca'], 19: ['zunido'], 24: ['relampago'] },
    seixo: L_SEIXO,
    pedregulho: { ...L_SEIXO, 24: ['esmagar'], 32: ['pancadao'] },
    pipa: { 1: ['bicada', 'encarada'], 5: ['rajada'], 9: ['corrente_ar'], 13: ['rasante'], 19: ['ciclone'] },
    boitata: { 1: ['fagulha', 'fogo_fatuo', 'chama_interior'], 24: ['labareda'], 32: ['erupcao'] },
  };

  const api = { MOVES, LEARNSETS, CATEGORY, STATUS, STAT_LABEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Moves = api;
})(typeof window !== 'undefined' ? window : globalThis);
