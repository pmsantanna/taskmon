// Naturezas e itens de segurar. Sem DOM: roda no navegador (window.Items) e no Node (require).

(function (root) {
  'use strict';

  // ---------- Naturezas (as 25 do original) ----------
  // up/down: atributo com +10% / −10%. Sem up/down = neutra.
  // (mag = ataque especial, res = defesa especial, spd = velocidade)
  const NATURES = {
    resistente: { name: 'Resistente' },
    solitario:  { name: 'Solitário',  up: 'atk', down: 'def' },
    corajoso:   { name: 'Corajoso',   up: 'atk', down: 'spd' },
    teimoso:    { name: 'Teimoso',    up: 'atk', down: 'mag' },
    travesso:   { name: 'Travesso',   up: 'atk', down: 'res' },
    ousado:     { name: 'Ousado',     up: 'def', down: 'atk' },
    docil:      { name: 'Dócil' },
    relaxado:   { name: 'Relaxado',   up: 'def', down: 'spd' },
    levado:     { name: 'Levado',     up: 'def', down: 'mag' },
    desleixado: { name: 'Desleixado', up: 'def', down: 'res' },
    timido:     { name: 'Tímido',     up: 'spd', down: 'atk' },
    apressado:  { name: 'Apressado',  up: 'spd', down: 'def' },
    serio:      { name: 'Sério' },
    alegre:     { name: 'Alegre',     up: 'spd', down: 'mag' },
    ingenuo:    { name: 'Ingênuo',    up: 'spd', down: 'res' },
    modesto:    { name: 'Modesto',    up: 'mag', down: 'atk' },
    brando:     { name: 'Brando',     up: 'mag', down: 'def' },
    quieto:     { name: 'Quieto',     up: 'mag', down: 'spd' },
    acanhado:   { name: 'Acanhado' },
    imprudente: { name: 'Imprudente', up: 'mag', down: 'res' },
    calmo:      { name: 'Calmo',      up: 'res', down: 'atk' },
    gentil:     { name: 'Gentil',     up: 'res', down: 'def' },
    atrevido:   { name: 'Atrevido',   up: 'res', down: 'spd' },
    cuidadoso:  { name: 'Cuidadoso',  up: 'res', down: 'mag' },
    peculiar:   { name: 'Peculiar' },
  };

  // ---------- Itens de segurar ----------
  // Cada criatura segura um. Os de uso único (once) valem uma vez por batalha e voltam na próxima.
  //   crit       +estágios de crítico
  //   accMult    multiplica a precisão de quem segura
  //   evaMult    multiplica a precisão de quem ataca quem segura
  //   catBoost   { cat, mult }   dano de golpes físicos ou mágicos
  //   typeBoost  { type, mult }  dano de golpes de um tipo
  //   superMult  dano extra em golpes super efetivos
  //   orb        dano ×1,3 e perde 10% do HP a cada golpe que acerta
  //   leftovers  recupera 1/16 do HP no fim de cada turno
  //   sash       com HP cheio, aguenta com 1 HP um golpe que nocautearia (once)
  //   berryHeal  recupera essa fração do HP ao ficar com menos da metade (once)
  //   berryCure  cura status assim que pega um (once)
  //   xpMult / coinMult  fora da batalha
  //   (Pedra Eterna e Laço do Destino só valem na creche: veja makeEgg em game.js)
  const HELD = {
    lente_mira:   { name: 'Lente de Mira', desc: 'Aumenta a chance de crítico (+1 estágio).', price: 250, hue: 0, crit: 1 },
    lupa:         { name: 'Lupa', desc: 'Golpes de quem segura têm 10% mais precisão.', price: 200, hue: 40, accMult: 1.1 },
    po_brilho:    { name: 'Pó Brilhante', desc: 'O inimigo erra mais (−10% de precisão).', price: 220, hue: 60, evaMult: 0.9 },
    faixa_forca:  { name: 'Faixa de Força', desc: 'Golpes físicos causam 10% a mais.', price: 200, hue: 20, catBoost: { cat: 'fisico', mult: 1.1 } },
    oculos_sabio: { name: 'Óculos Sábios', desc: 'Golpes mágicos causam 10% a mais.', price: 200, hue: 250, catBoost: { cat: 'magico', mult: 1.1 } },
    cinto_mestre: { name: 'Cinto de Mestre', desc: 'Golpes super efetivos causam 20% a mais.', price: 300, hue: 300, superMult: 1.2 },
    orbe_vital:   { name: 'Orbe Vital', desc: 'Dano ×1,3, mas perde 10% do HP a cada golpe que acerta.', price: 450, hue: 330, orb: true },
    sobras:       { name: 'Sobras', desc: 'Recupera 1/16 do HP no fim de cada turno.', price: 400, hue: 90, leftovers: true },
    fita_foco:    { name: 'Fita de Foco', desc: 'Com HP cheio, aguenta com 1 HP um golpe fatal (1× por luta).', price: 350, hue: 10, sash: true },
    baga_vida:    { name: 'Baga da Vida', desc: 'Recupera 1/4 do HP ao ficar abaixo da metade (1× por luta).', price: 120, hue: 200, berryHeal: 0.25 },
    baga_cura:    { name: 'Baga Curativa', desc: 'Cura queimadura, veneno, paralisia ou sono (1× por luta).', price: 150, hue: 140, berryCure: true },
    ovo_sorte:    { name: 'Ovo da Sorte', desc: 'Quem segura ganha 50% a mais de XP.', price: 600, hue: 50, xpMult: 1.5 },
    moeda_sorte:  { name: 'Moeda da Sorte', desc: 'Dobra as moedas quando o líder segura.', price: 600, hue: 45, coinMult: 2 },
    pedra_eterna: { name: 'Pedra Eterna', desc: 'Na creche, passa a natureza de quem segura pro filhote.', price: 500, hue: 220 },
    laco_destino: { name: 'Laço do Destino', desc: 'Na creche, o filhote herda 5 IVs dos pais em vez de 3.', price: 900, hue: 340 },
    lenco_seda:   { name: 'Lenço de Seda', desc: 'Golpes Normal causam 20% a mais.', price: 180, hue: 0, typeBoost: { type: 'normal', mult: 1.2 } },
    carvao:       { name: 'Carvão', desc: 'Golpes de Fogo causam 20% a mais.', price: 180, hue: 15, typeBoost: { type: 'fogo', mult: 1.2 } },
    gota_mistica: { name: 'Gota Mística', desc: 'Golpes de Água causam 20% a mais.', price: 180, hue: 210, typeBoost: { type: 'agua', mult: 1.2 } },
    semente_viva: { name: 'Semente Viva', desc: 'Golpes de Planta causam 20% a mais.', price: 180, hue: 110, typeBoost: { type: 'planta', mult: 1.2 } },
    ima:          { name: 'Ímã', desc: 'Golpes Elétricos causam 20% a mais.', price: 180, hue: 55, typeBoost: { type: 'eletrico', mult: 1.2 } },
    pedra_dura:   { name: 'Pedra Dura', desc: 'Golpes de Pedra causam 20% a mais.', price: 180, hue: 30, typeBoost: { type: 'pedra', mult: 1.2 } },
    pena_afiada:  { name: 'Pena Afiada', desc: 'Golpes Voadores causam 20% a mais.', price: 180, hue: 270, typeBoost: { type: 'voador', mult: 1.2 } },
  };

  // Itens que selvagens às vezes seguram (e vêm junto na captura).
  const WILD_HELD = ['baga_vida', 'baga_cura', 'lenco_seda', 'carvao', 'gota_mistica', 'semente_viva', 'ima', 'pedra_dura', 'pena_afiada', 'lupa'];

  const api = { NATURES, HELD, WILD_HELD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Items = api;
})(typeof window !== 'undefined' ? window : globalThis);
