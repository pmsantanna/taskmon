// Fichas da Dex: categoria, tamanho, habitat, do que gosta e a descrição de cada espécie.
// Só texto (usado pelo painel). window.DexInfo no navegador, module.exports no Node.

(function (root) {
  'use strict';

  const INFO = {
    pavio:      { cat: 'Bicho Vela',     height: 0.3, weight: 2.1,  habitat: 'Casas antigas',   likes: 'Noites de vento fraco',
      desc: 'A chaminha da cabeça nunca apaga. Quando está feliz, ela fica azulada e esquenta o ambiente.' },
    lampiao:    { cat: 'Bicho Lanterna', height: 1.1, weight: 18,   habitat: 'Estradas de terra', likes: 'Guiar quem se perdeu',
      desc: 'Ilumina o caminho de viajantes perdidos. Diz a lenda que nunca deixou ninguém pra trás.' },
    gotinha:    { cat: 'Bicho Gota',     height: 0.4, weight: 3.5,  habitat: 'Margens de lagoa', likes: 'Garoa fininha',
      desc: 'Feita quase toda de água. Nos dias quentes encolhe um pouco e procura sombra.' },
    mare:       { cat: 'Bicho Onda',     height: 1.4, weight: 42,   habitat: 'Lagos fundos',      likes: 'Lua cheia',
      desc: 'Controla as ondas do lago com o rabo. Na lua cheia, canta baixinho na margem.' },
    brotinho:   { cat: 'Bicho Broto',    height: 0.3, weight: 1.8,  habitat: 'Campos floridos',  likes: 'Sol da manhã',
      desc: 'Passa as manhãs parado no sol. Se ficar tempo demais na sombra, a folha murcha.' },
    ipe:        { cat: 'Bicho Árvore',   height: 2.0, weight: 95,   habitat: 'Cerrado',           likes: 'Fim de inverno',
      desc: 'Floresce de uma vez no fim do inverno, e todo mundo para pra olhar. Vive muitos anos.' },
    capi:       { cat: 'Bicho Roedor',   height: 0.6, weight: 48,   habitat: 'Lagoas e rios',     likes: 'Dias de chuva',
      desc: 'Vive em bando perto da água e quase nada tira sua calma. Dizem que gosta de ficar ao lado de quem trabalha até tarde.' },
    capivarao:  { cat: 'Bicho Roedor',   height: 1.2, weight: 90,   habitat: 'Banhados',          likes: 'Cochilar na lama',
      desc: 'Os outros bichos sobem nas costas dele pra descansar. Ele nem liga, continua mastigando.' },
    vagalume:   { cat: 'Bicho Faísca',   height: 0.2, weight: 0.4,  habitat: 'Matas à noite',     likes: 'Telas acesas',
      desc: 'Pisca em código pra conversar com os outros. Costuma rondar quem fica no computador de madrugada.' },
    seixo:      { cat: 'Bicho Pedra',    height: 0.4, weight: 30,   habitat: 'Cavernas',          likes: 'Ficar paradinho',
      desc: 'Fica tão parado que é confundido com uma pedra comum. Só se mexe quando alguém tropeça nele.' },
    pedregulho: { cat: 'Bicho Rocha',    height: 1.5, weight: 210,  habitat: 'Encostas',          likes: 'Rolar ladeira abaixo',
      desc: 'Rola morro abaixo por diversão. Os mais velhos têm musgo crescendo nas costas.' },
    pipa:       { cat: 'Bicho Vento',    height: 0.5, weight: 0.9,  habitat: 'Céu de agosto',     likes: 'Rajadas de vento',
      desc: 'Aparece em agosto, quando venta mais. Gosta de dar rasantes nos telhados.' },
    boitata:    { cat: 'Bicho Lenda',    height: 4.2, weight: 320,  habitat: 'Vulcões',           likes: 'Proteger as matas',
      desc: 'Uma serpente de fogo que protege as matas. Quase ninguém viu de perto, e quem viu não esquece.' },
  };

  const fmtNum = (n) => String(n).replace('.', ',');
  const height = (sp) => (INFO[sp] ? `${fmtNum(INFO[sp].height)} m` : '—');
  const weight = (sp) => (INFO[sp] ? `${fmtNum(INFO[sp].weight)} kg` : '—');

  const api = { INFO, height, weight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DexInfo = api;
})(typeof window !== 'undefined' ? window : globalThis);
