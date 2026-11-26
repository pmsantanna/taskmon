// ============================================================================================
//  ESPÉCIES: tudo de cada bicho num lugar só. Pra criar, trocar ou apagar um bicho, mexa aqui.
// ============================================================================================
//
// A ordem das entradas é a ordem da Dex (Nº001, Nº002...). A chave (ex.: capi) é o id da espécie:
// é usada no save, nas zonas (shared/game.js, ZONES) e no nome do PNG (sprites/creatures/<id>.png).
// Trocou ou apagou um id que já está no save? Recomece o jogo (Ajustes → Recomeçar).
//
// Campos:
//   name        nome que aparece no jogo
//   types       um ou dois tipos: normal, fogo, agua, planta, eletrico, pedra, voador
//   base        atributos base: hp, atk (ataque físico), def, mag (ataque mágico), res, spd (velocidade)
//   xp          experiência que dá quando é derrotado (multiplicada pelo nível)
//   catch       chance base de captura (0 a 1)
//   female      chance de nascer fêmea (0 a 1); null = sem sexo
//   egg         grupos de ovo (casal precisa ter um grupo em comum); ['indefinido'] = não põe ovo
//   legendary   true = lendário (dá mais moedas, foge mais da cápsula)
//   starter     true = aparece na escolha do inicial
//   evolutions  lista de evoluções (vazia ou ausente = não evolui). Cada uma:
//                 to      id da espécie pra qual evolui
//                 level   nível mínimo (sozinho: evolui ao subir pra esse nível)
//                 item    item de evolução (shared/game.js, SHOP com evo: true): evolui ao usar o item
//                         na EQUIPE (com level junto, só a partir desse nível)
//                 gender  'F' ou 'M': só esse sexo
//                 held    item de segurar: só se estiver segurando (o item é gasto)
//                 zone    id da zona: só subindo de nível nessa zona
//                 time    'dia' (6h às 18h) ou 'noite': só nesse horário (relógio do computador)
//               Com mais de uma, vale a PRIMEIRA da lista cujas condições batem (ramificação).
//               Deixe a mais "comum" por último.
//   learnset    nível -> golpes aprendidos (ids de shared/moves.js). As evoluções herdam a lista da
//               forma anterior; aqui só entra o que é novo.
//   dex         ficha da Dex: cat (categoria), height (m), weight (kg), habitat, likes, desc
//
// Pixel art embutida: shared/sprites.js (sem arte, usa um "?" até você pôr um PNG na pasta de sprites).

(function (root) {
  'use strict';

  const SPECIES = {
    pavio: {
      name: 'Pavio', types: ['fogo'], starter: true,
      base: { hp: 48, atk: 60, def: 46, mag: 65, res: 50, spd: 60 }, xp: 62, catch: 0.3, female: 0.125, egg: ['campo'],
      evolutions: [{ to: 'lampiao', level: 16 }],
      learnset: { 1: ['trombada', 'rosnado'], 4: ['fagulha'], 8: ['fogo_fatuo'], 11: ['bote'], 14: ['soco_brasa'] },
      dex: { cat: 'Bicho Vela', height: 0.3, weight: 2.1, habitat: 'Casas antigas', likes: 'Noites de vento fraco',
        desc: 'A chaminha da cabeça nunca apaga. Quando está feliz, ela fica azulada e esquenta o ambiente.' },
    },
    lampiao: {
      name: 'Lampião', types: ['fogo', 'eletrico'],
      base: { hp: 76, atk: 90, def: 70, mag: 95, res: 75, spd: 80 }, xp: 150, catch: 0.1, female: 0.125, egg: ['campo'],
      learnset: { 16: ['chama_interior'], 21: ['labareda'], 30: ['pancadao'] },
      dex: { cat: 'Bicho Lanterna', height: 1.1, weight: 18, habitat: 'Estradas de terra', likes: 'Guiar quem se perdeu',
        desc: 'Ilumina o caminho de viajantes perdidos. Diz a lenda que nunca deixou ninguém pra trás.' },
    },
    gotinha: {
      name: 'Gotinha', types: ['agua'], starter: true,
      base: { hp: 50, atk: 48, def: 55, mag: 55, res: 60, spd: 50 }, xp: 62, catch: 0.3, female: 0.125, egg: ['agua'],
      // ramificação por item: com a Pedra do Trovão vira Tempestade; senão, Maré no nível 16
      evolutions: [{ to: 'tempestade', item: 'pedra_trovao' }, { to: 'mare', level: 16 }],
      learnset: { 1: ['trombada', 'encarada'], 4: ['borbulha'], 8: ['casca_agua'], 11: ['neblina'], 14: ['jato_agua'] },
      dex: { cat: 'Bicho Gota', height: 0.4, weight: 3.5, habitat: 'Margens de lagoa', likes: 'Garoa fininha',
        desc: 'Feita quase toda de água. Nos dias quentes encolhe um pouco e procura sombra.' },
    },
    mare: {
      name: 'Maré', types: ['agua'],
      base: { hp: 85, atk: 78, def: 82, mag: 85, res: 85, spd: 65 }, xp: 150, catch: 0.1, female: 0.125, egg: ['agua'],
      learnset: { 16: ['agua_fresca'], 20: ['cauda_molhada'], 27: ['onda_forte'] },
      dex: { cat: 'Bicho Onda', height: 1.4, weight: 42, habitat: 'Lagos fundos', likes: 'Lua cheia',
        desc: 'Controla as ondas do lago com o rabo. Na lua cheia, canta baixinho na margem.' },
    },
    tempestade: {
      name: 'Tempestade', types: ['agua', 'eletrico'],
      base: { hp: 72, atk: 60, def: 70, mag: 100, res: 80, spd: 88 }, xp: 150, catch: 0.1, female: 0.125, egg: ['agua'],
      learnset: { 1: ['faisca'], 18: ['estatica'], 24: ['relampago'], 30: ['onda_forte'] },
      dex: { cat: 'Bicho Nuvem', height: 1.2, weight: 30, habitat: 'Céu carregado', likes: 'Trovoadas de verão',
        desc: 'Uma Gotinha que tocou a Pedra do Trovão. Junta nuvens em volta de si e chove só em quem a irrita.' },
    },
    brotinho: {
      name: 'Brotinho', types: ['planta'], starter: true,
      base: { hp: 52, atk: 50, def: 52, mag: 55, res: 55, spd: 45 }, xp: 62, catch: 0.3, female: 0.125, egg: ['planta'],
      // ramificação por horário: subindo pro nível 16 de noite vira Dama-da-Noite; de dia, Ipê
      evolutions: [{ to: 'damadanoite', level: 16, time: 'noite' }, { to: 'ipe', level: 16 }],
      learnset: { 1: ['trombada', 'rosnado'], 4: ['semente'], 8: ['po_sono'], 11: ['folha'], 14: ['polen'] },
      dex: { cat: 'Bicho Broto', height: 0.3, weight: 1.8, habitat: 'Campos floridos', likes: 'Sol da manhã',
        desc: 'Passa as manhãs parado no sol. Se ficar tempo demais na sombra, a folha murcha.' },
    },
    ipe: {
      name: 'Ipê', types: ['planta'],
      base: { hp: 88, atk: 80, def: 80, mag: 85, res: 85, spd: 60 }, xp: 150, catch: 0.1, female: 0.125, egg: ['planta'],
      learnset: { 16: ['raiz'], 22: ['petalas'], 30: ['esmagar'] },
      dex: { cat: 'Bicho Árvore', height: 2.0, weight: 95, habitat: 'Cerrado', likes: 'Fim de inverno',
        desc: 'Floresce de uma vez no fim do inverno, e todo mundo para pra olhar. Vive muitos anos.' },
    },
    damadanoite: {
      name: 'Dama-da-Noite', types: ['planta'],
      base: { hp: 70, atk: 55, def: 70, mag: 100, res: 95, spd: 78 }, xp: 150, catch: 0.1, female: 0.125, egg: ['planta'],
      learnset: { 16: ['miragem'], 20: ['petalas'], 26: ['grande_dreno'] },
      dex: { cat: 'Bicho Perfume', height: 0.9, weight: 12, habitat: 'Jardins à noite', likes: 'Lua nova',
        desc: 'Só abre as flores depois que escurece. O perfume faz quem passa perto dormir em pé.' },
    },
    capi: {
      name: 'Capi', types: ['normal'],
      base: { hp: 60, atk: 45, def: 45, mag: 35, res: 45, spd: 40 }, xp: 40, catch: 0.55, female: 0.5, egg: ['campo', 'agua'],
      evolutions: [{ to: 'capivarao', level: 18 }],
      learnset: { 1: ['trombada', 'rosnado'], 5: ['mordida'], 9: ['soneca'], 13: ['bote'], 16: ['grito'] },
      dex: { cat: 'Bicho Roedor', height: 0.6, weight: 48, habitat: 'Lagoas e rios', likes: 'Dias de chuva',
        desc: 'Vive em bando perto da água e quase nada tira sua calma. Dizem que gosta de ficar ao lado de quem trabalha até tarde.' },
    },
    capivarao: {
      name: 'Capivarão', types: ['normal', 'agua'],
      base: { hp: 95, atk: 70, def: 72, mag: 50, res: 70, spd: 48 }, xp: 110, catch: 0.2, female: 0.5, egg: ['campo', 'agua'],
      learnset: { 18: ['esmagar'], 22: ['concentrar'], 28: ['pancadao'] },
      dex: { cat: 'Bicho Roedor', height: 1.2, weight: 90, habitat: 'Banhados', likes: 'Cochilar na lama',
        desc: 'Os outros bichos sobem nas costas dele pra descansar. Ele nem liga, continua mastigando.' },
    },
    vagalume: {
      name: 'Vagalume', types: ['eletrico', 'voador'],
      base: { hp: 40, atk: 55, def: 35, mag: 70, res: 40, spd: 85 }, xp: 55, catch: 0.45, female: 0.5, egg: ['inseto'],
      learnset: { 1: ['choquinho', 'pisca'], 6: ['estatica'], 10: ['bote'], 12: ['miragem'], 14: ['faisca'], 19: ['zunido'], 24: ['relampago'] },
      dex: { cat: 'Bicho Faísca', height: 0.2, weight: 0.4, habitat: 'Matas à noite', likes: 'Telas acesas',
        desc: 'Pisca em código pra conversar com os outros. Costuma rondar quem fica no computador de madrugada.' },
    },
    seixo: {
      name: 'Seixo', types: ['pedra'],
      base: { hp: 45, atk: 55, def: 80, mag: 25, res: 40, spd: 20 }, xp: 58, catch: 0.45, female: 0.5, egg: ['mineral'],
      evolutions: [{ to: 'pedregulho', level: 24 }],
      learnset: { 1: ['trombada', 'endurecer'], 6: ['areia'], 10: ['pedrada'], 16: ['muralha'], 21: ['desmoronar'] },
      dex: { cat: 'Bicho Pedra', height: 0.4, weight: 30, habitat: 'Cavernas', likes: 'Ficar paradinho',
        desc: 'Fica tão parado que é confundido com uma pedra comum. Só se mexe quando alguém tropeça nele.' },
    },
    pedregulho: {
      name: 'Pedregulho', types: ['pedra'],
      base: { hp: 75, atk: 85, def: 115, mag: 40, res: 60, spd: 25 }, xp: 160, catch: 0.12, female: 0.5, egg: ['mineral'],
      learnset: { 24: ['esmagar'], 32: ['pancadao'] },
      dex: { cat: 'Bicho Rocha', height: 1.5, weight: 210, habitat: 'Encostas', likes: 'Rolar ladeira abaixo',
        desc: 'Rola morro abaixo por diversão. Os mais velhos têm musgo crescendo nas costas.' },
    },
    pipa: {
      name: 'Pipa', types: ['normal', 'voador'],
      base: { hp: 42, atk: 50, def: 38, mag: 45, res: 40, spd: 80 }, xp: 50, catch: 0.5, female: 0.5, egg: ['voador'],
      learnset: { 1: ['bicada', 'encarada'], 5: ['rajada'], 9: ['corrente_ar'], 13: ['rasante'], 16: ['miragem', 'concentrar'], 19: ['ciclone'] },
      dex: { cat: 'Bicho Vento', height: 0.5, weight: 0.9, habitat: 'Céu de agosto', likes: 'Rajadas de vento',
        desc: 'Aparece em agosto, quando venta mais. Gosta de dar rasantes nos telhados.' },
    },
    boitata: {
      name: 'Boitatá', types: ['fogo', 'planta'], legendary: true,
      base: { hp: 90, atk: 110, def: 85, mag: 115, res: 90, spd: 95 }, xp: 280, catch: 0.04, female: null, egg: ['indefinido'],
      learnset: { 1: ['fagulha', 'fogo_fatuo', 'chama_interior'], 24: ['labareda'], 32: ['erupcao'] },
      dex: { cat: 'Bicho Lenda', height: 4.2, weight: 320, habitat: 'Vulcões', likes: 'Proteger as matas',
        desc: 'Uma serpente de fogo que protege as matas. Quase ninguém viu de perto, e quem viu não esquece.' },
    },
  };

  const api = { SPECIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpeciesData = api;
})(typeof window !== 'undefined' ? window : globalThis);
