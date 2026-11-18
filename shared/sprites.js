// Pixel art das criaturas: grades 12×12, cada caractere é uma cor da paleta ('.' = transparente).
// Todas olhando pra DIREITA; os selvagens são desenhados espelhados.
// Quer redesenhar um bicho? É só editar a grade aqui.

(function (root) {
  'use strict';

  const K = '#1c1917'; // contorno

  const SPRITES = {
    pavio: {
      rows: [
        '.....a......',
        '....aba.....',
        '....aba.....',
        '.....c......',
        '...kkkkk....',
        '..kwwwwwk...',
        '..kwkwkwk...',
        '..kwwwwwk...',
        '..kwwrwwk...',
        '..kwwwwwk...',
        '...kkkkk....',
        '...k...k....',
      ],
      pal: { k: K, a: '#f97316', b: '#fde047', c: '#44403c', w: '#fef3c7', r: '#fca5a5' },
      shiny: { a: '#3b82f6', b: '#a5f3fc', w: '#e9d5ff' },
    },
    lampiao: {
      rows: [
        '....kkkk....',
        '....k..k....',
        '...kkkkkk...',
        '..kggaaggk..',
        '..kgabbagk..',
        '..kgabbagk..',
        '..kggaaggk..',
        '..kddddddk..',
        '..kdkddkdk..',
        '..kddddddk..',
        '...kk..kk...',
        '............',
      ],
      pal: { k: K, a: '#f97316', b: '#fde047', g: '#fef9c3', d: '#b45309' },
      shiny: { a: '#22c55e', b: '#bef264', d: '#64748b' },
    },
    gotinha: {
      rows: [
        '.....k......',
        '....kak.....',
        '....kak.....',
        '...kaaak....',
        '..kaaaaak...',
        '..kabaaak...',
        '.kabaaaaak..',
        '.kakaaakak..',
        '.kaaaaaaak..',
        '.kaaaaaaak..',
        '..kaaaaak...',
        '...kkkkk....',
      ],
      pal: { k: K, a: '#60a5fa', b: '#dbeafe' },
      shiny: { a: '#f472b6', b: '#fce7f3' },
    },
    mare: {
      rows: [
        '............',
        '......kkk...',
        '....kkbbak..',
        '...kbbaaak..',
        '..kbaakaak..',
        '..kaaaaaak..',
        '.kaaaaaaak..',
        '.kaaaaaaaak.',
        'kaaaaaaaaak.',
        'kawwawwawak.',
        'kkkkkkkkkkk.',
        '............',
      ],
      pal: { k: K, a: '#2563eb', b: '#93c5fd', w: '#f0f9ff' },
      shiny: { a: '#7c3aed', b: '#c4b5fd' },
    },
    brotinho: {
      rows: [
        '...aa..aa...',
        '....aaaa....',
        '.....bb.....',
        '....kkkk....',
        '...kcccck...',
        '..kcccccck..',
        '..kckcckck..',
        '..kcccccck..',
        '..kcrccrck..',
        '...kcccck...',
        '....kkkk....',
        '....k..k....',
      ],
      pal: { k: K, a: '#4ade80', b: '#15803d', c: '#d9f99d', r: '#fda4af' },
      shiny: { a: '#facc15', c: '#fef08a' },
    },
    ipe: {
      rows: [
        '.pppppppp...',
        'ppappppppap.',
        '.pppapppppp.',
        '..pppppppp..',
        '...kbbbbbk..',
        '...kbkbkbk..',
        '...kbbbbbk..',
        '...kbbbbbk..',
        '..kbbbbbbbk.',
        '.kbbkbbbkbbk',
        '.kk.kk.kk.kk',
        '............',
      ],
      pal: { k: K, p: '#f472b6', a: '#fbcfe8', b: '#92400e' },
      shiny: { p: '#facc15', a: '#fef9c3' },
    },
    capi: {
      rows: [
        '............',
        '............',
        '............',
        '.......kk...',
        '..kkkkkaak..',
        '.kaaaaaaakk.',
        'kaaaaaaakak.',
        'kaaaaaaaaaak',
        'kaaaaaaaaak.',
        '.kaaaaaaak..',
        '.kk.kk.kk...',
        '............',
      ],
      pal: { k: K, a: '#a16207' },
      shiny: { a: '#fbbf24' },
    },
    capivarao: {
      rows: [
        '.......oo...',
        '......oooo..',
        '.......kk...',
        '..kkkkkaak..',
        '.kaaaaaaakk.',
        'kaaaaaaakak.',
        'kaaaaaaaaaak',
        'kaabaaaaaak.',
        'kaaaaaaaaak.',
        'kaaaaaaaaak.',
        '.kk.kk.kk...',
        '............',
      ],
      pal: { k: K, a: '#854d0e', b: '#a16207', o: '#fb923c' },
      shiny: { a: '#d4a017', b: '#fde047', o: '#4ade80' },
    },
    vagalume: {
      rows: [
        '............',
        '.....ww.....',
        '....wwww.k..',
        '...wwwwwk...',
        '..yyykaaak..',
        '.yyyykaakak.',
        '.yyyykaaaak.',
        '..yyykaaak..',
        '....k.k.k...',
        '............',
        '............',
        '............',
      ],
      pal: { k: K, a: '#44403c', y: '#fde047', w: '#e0f2fe' },
      shiny: { y: '#4ade80', a: '#1e3a8a' },
    },
    seixo: {
      rows: [
        '............',
        '............',
        '............',
        '............',
        '....kkkk....',
        '..kkaaaakk..',
        '.kaabaaaaak.',
        '.kaakaakaak.',
        '.kaaaaaaaak.',
        '.kaaaaccaak.',
        '..kkkkkkkk..',
        '............',
      ],
      pal: { k: K, a: '#a8a29e', b: '#e7e5e4', c: '#78716c' },
      shiny: { a: '#fca5a5', c: '#f87171' },
    },
    pedregulho: {
      rows: [
        '....mmm.....',
        '..kkmmmkk...',
        '.kaaaaaaak..',
        'kaabaaaaaak.',
        'kaakaaakaak.',
        'kaaaaaaaaak.',
        'kaaccaaaaak.',
        'kaaaaaaccak.',
        'kaaaaaaaaak.',
        '.kaaaaaaak..',
        '.kk.kkk.kk..',
        '............',
      ],
      pal: { k: K, a: '#78716c', b: '#d6d3d1', c: '#57534e', m: '#65a30d' },
      shiny: { a: '#475569', c: '#1e293b', m: '#f472b6' },
    },
    pipa: {
      rows: [
        '.....k......',
        '....kak.....',
        '...kaabk....',
        '..kaaabbk...',
        '.kakaabkbk..',
        '..kaaabbk...',
        '...kaabk....',
        '....kbk.....',
        '.....k......',
        '......c.....',
        '.....c......',
        '......c.....',
      ],
      pal: { k: K, a: '#ef4444', b: '#facc15', c: '#e5e7eb' },
      shiny: { a: '#111827', b: '#a855f7' },
    },
    boitata: {
      rows: [
        '............',
        '......aaa...',
        '.....abbba..',
        '....abkbkb..',
        '....abbbbba.',
        '.....aaaaa..',
        '...aa.......',
        '..abba......',
        '..abbbaaaa..',
        '...abbbbbba.',
        '....aaaaaa..',
        '............',
      ],
      pal: { k: K, a: '#dc2626', b: '#fbbf24' },
      shiny: { a: '#2563eb', b: '#67e8f9' },
    },
    // ícone da cápsula (usado na tela e no painel)
    _capsula: {
      rows: [
        '............',
        '....kkkk....',
        '..kkaaaakk..',
        '.kaaaaaaaak.',
        '.kaaaaaaaak.',
        'kkkkkwwkkkkk',
        'kwwwkwwkwwwk',
        '.kwwwkkwwwk.',
        '.kwwwwwwwwk.',
        '..kkwwwwkk..',
        '....kkkk....',
        '............',
      ],
      pal: { k: K, a: '#14b8a6', w: '#f5f5f4' },
    },
    // Moeda (ícone do HUD e do painel).
    _coin: {
      rows: [
        '............',
        '....kkkk....',
        '...kyyyyk...',
        '..kywyyyyk..',
        '..kwyykyyk..',
        '..kyyykyyk..',
        '..kyyykyyk..',
        '..kyyykyyk..',
        '..kyyyyyok..',
        '...kyyyok...',
        '....kkkk....',
        '............',
      ],
      pal: { k: K, y: '#fcd34d', w: '#fef9c3', o: '#d97706' },
    },
    // Ovo (creche). Dá pra trocar por creatures/_egg.png.
    _egg: {
      rows: [
        '............',
        '.....kk.....',
        '....kwwk....',
        '...kwwwwk...',
        '...kwswwk...',
        '..kwwwwswk..',
        '..kwsswwwk..',
        '..kwwwwwwk..',
        '..kwwwswwk..',
        '...kwwwwk...',
        '....kkkk....',
        '............',
      ],
      pal: { k: K, w: '#fef9ef', s: '#86d48a' },
    },
    // Itens de segurar: saquinho amarrado (a cor muda por item).
    _held: {
      rows: [
        '............',
        '....k..k....',
        '.....kk.....',
        '....kbbk....',
        '...kaaaak...',
        '..kaabaaak..',
        '..kabaaaak..',
        '.kaaaaaaaak.',
        '.kaaaaaaaak.',
        '.kaaaaaaaak.',
        '..kkkkkkkk..',
        '............',
      ],
      pal: { k: K, a: '#ef4444', b: '#fecaca' },
    },
    // Itens de esforço: montinho de areia/pedra (a cor muda por nível no painel/faixa).
    _grit: {
      rows: [
        '............',
        '............',
        '............',
        '.....kk.....',
        '....kabk....',
        '...kaabak...',
        '..kabaaabk..',
        '..kaaabaak..',
        '.kabaaaabak.',
        '.kaaabaaaak.',
        'kkkkkkkkkkkk',
        '............',
      ],
      pal: { k: K, a: '#d6b98c', b: '#f5e6c8' },
    },
  };

  const SIZE = 12;
  const cache = new Map();

  /** Devolve um canvas 12×12 com o sprite (cacheado). */
  function getSprite(id, shiny = false) {
    const key = id + (shiny ? ':s' : '');
    if (cache.has(key)) return cache.get(key);
    const def = SPRITES[id];
    if (!def) throw new Error('Sprite desconhecido: ' + id);
    const pal = shiny ? { ...def.pal, ...(def.shiny || {}) } : def.pal;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    def.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x, y, 1, 1);
      });
    });
    cache.set(key, canvas);
    return canvas;
  }

  /** Silhueta preta (pro bestiário, espécies ainda não vistas). */
  function getSilhouette(id) {
    const key = id + ':sil';
    if (cache.has(key)) return cache.get(key);
    const src = getSprite(id);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#57534e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    cache.set(key, canvas);
    return canvas;
  }

  /** Data URL ampliada, pra usar em <img> no painel. */
  function spriteDataUrl(id, { shiny = false, scale = 4, silhouette = false } = {}) {
    const src = silhouette ? getSilhouette(id) : getSprite(id, shiny);
    const c = document.createElement('canvas');
    c.width = SIZE * scale;
    c.height = SIZE * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  }

  const api = { SPRITES, SIZE, getSprite, getSilhouette, spriteDataUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
