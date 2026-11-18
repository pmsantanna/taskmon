// Camada de sprites/tiles customizados. Usa PNGs da pasta de sprites quando existem e cai
// pra pixel art de sprites.js quando não. Usado pela faixa (canvas) e pelo painel (CSS).
//
// Estrutura (veja assets/sprites/LEIA-ME.txt):
//   creatures/<especie>.png        folha horizontal de quadros (ex.: 4 quadros 32×32 = 128×32)
//   creatures/<especie>_shiny.png  versão brilhante (opcional; sem ela, gira a matiz)
//   items/<item>.png               capsula, super
//   tiles/<zona>_ground.png        chão que repete sem fim (ou default_ground.png)
//   tiles/<zona>_bg.png            fundo com parallax (ou default_bg.png)
//   ui/hud.png, ui/toast.png       molduras 9-slice da faixa
//   ui/card.png, ui/button.png     molduras 9-slice do painel
//   ui/background.png              textura que repete no fundo do painel
//   ui/coin.png, ui/capsule.png    ícones
//   sprites.json                   ajustes opcionais por arquivo (frames, fps, scale, slice...)

(function (root) {
  'use strict';
  const SP = root.Sprites;

  let files = {};   // 'creatures/pavio.png' -> HTMLImageElement
  let config = {};  // 'creatures/pavio.png' -> { frames, fps, ... }
  let version = 0;
  const listeners = [];
  const cache = new Map();

  const cfgOf = (key) => config[key] || {};

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /** Carrega (ou recarrega) tudo. Resolve quando as imagens estão decodificadas. */
  async function load() {
    const bridge = root.bridge;
    let res = { files: {}, config: {} };
    try { if (bridge && bridge.loadAssets) res = (await bridge.loadAssets()) || res; } catch (e) { console.warn(e); }
    const entries = await Promise.all(
      Object.entries(res.files || {}).map(async ([k, src]) => [k.toLowerCase(), await loadImage(src)]),
    );
    files = {};
    for (const [k, img] of entries) if (img) files[k] = img;
    config = {};
    for (const [k, v] of Object.entries(res.config || {})) config[k.toLowerCase()] = v;
    cache.clear();
    version++;
    listeners.forEach((cb) => cb());
  }

  function onChange(cb) { listeners.push(cb); }

  if (root.bridge && root.bridge.onAssetsChanged) root.bridge.onAssetsChanged(() => load());

  // ---------- Folhas de sprite ----------
  function makeSheet(img, key, defaults = {}) {
    const c = { ...defaults, ...cfgOf(key) };
    const autoFrames = img.width > img.height && img.width % img.height === 0 ? img.width / img.height : 1;
    const frames = Math.max(1, c.frames || autoFrames);
    return {
      src: img, frames, fps: c.fps || 6,
      fw: Math.floor(img.width / frames), fh: img.height,
      size: c.size || 1, // multiplicador do tamanho na faixa
      custom: true, key,
    };
  }

  function gridSheet(id, shiny) {
    const src = SP.getSprite(id, shiny);
    return { src, frames: 1, fps: 1, fw: SP.SIZE, fh: SP.SIZE, size: 1, custom: false, key: id };
  }

  /** Gira a matiz de uma folha inteira (brilhante quando não há arquivo _shiny). */
  function hueShift(img, deg) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.filter = `hue-rotate(${deg}deg) saturate(1.25)`;
    ctx.drawImage(img, 0, 0);
    return c;
  }

  // ---------- Paletas (estilo Game Boy) ----------
  // 4 tons, do mais escuro (0) ao mais claro (3). gb = sprites convertidos pros 4 tons.
  const PALETTES = {
    dmg:    { name: 'Clássico (verde)', gb: true,  c: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
    pocket: { name: 'Pocket (cinza)',   gb: true,  c: ['#1a1a17', '#55554b', '#a5a593', '#dcdccb'] },
    light:  { name: 'Light (azulado)',  gb: true,  c: ['#0c2a3a', '#1f5d6e', '#6fb3b0', '#c9ead7'] },
    color:  { name: 'Color (colorido)', gb: false, c: ['#1b1b2f', '#3d4a7a', '#a9b8e6', '#f4f4ec'] },
  };
  let palette = PALETTES.dmg;
  let paletteId = 'dmg';

  function setPalette(id) {
    if (!PALETTES[id] || id === paletteId) return false;
    paletteId = id;
    palette = PALETTES[id];
    cache.clear();
    version++;
    listeners.forEach((cb) => cb());
    return true;
  }

  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  /** Converte uma imagem pros 4 tons da paleta pela luminosidade (transparência mantida). */
  function toPalette(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const tones = palette.c.map(hexRgb);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const t = tones[l < 60 ? 0 : l < 135 ? 1 : l < 205 ? 2 : 3];
      d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Aplica a paleta numa folha (cacheada por paleta). */
  function themed(ck, build) {
    const key = `${paletteId}:${ck}`;
    if (cache.has(key)) return cache.get(key);
    let sheet = build();
    if (palette.gb) sheet = { ...sheet, src: toPalette(sheet.src), _url: null };
    cache.set(key, sheet);
    return sheet;
  }

  function creature(id, shiny = false) {
    return themed(`c:${id}:${shiny ? 1 : 0}`, () => creatureRaw(id, shiny));
  }

  function item(id) {
    return themed(`i:${id}`, () => itemRaw(id));
  }

  function creatureRaw(id, shiny = false) {
    const ck = `c:${id}:${shiny ? 1 : 0}`;
    if (cache.has(ck)) return cache.get(ck);
    let sheet;
    const base = files[`creatures/${id}.png`];
    const sh = files[`creatures/${id}_shiny.png`];
    if (shiny && sh) sheet = makeSheet(sh, `creatures/${id}_shiny.png`, cfgOf(`creatures/${id}.png`));
    else if (base) {
      sheet = makeSheet(base, `creatures/${id}.png`);
      if (shiny) sheet = { ...sheet, src: hueShift(base, cfgOf(`creatures/${id}.png`).shinyHue ?? 150) };
    } else sheet = gridSheet(id, shiny);
    cache.set(ck, sheet);
    return sheet;
  }

  function itemRaw(id) {
    const ck = `i:${id}`;
    if (cache.has(ck)) return cache.get(ck);
    const heldDef = root.Items && root.Items.HELD[id];
    const grit = id.startsWith('esforco');
    const img = files[`items/${id}.png`] || (!grit && !heldDef && id !== 'capsula' && files['items/capsula.png']);
    let sheet;
    if (img) sheet = makeSheet(img, `items/${id}.png`);
    else if (heldDef) {
      const base = SP.getSprite('_held');
      sheet = { ...gridSheet('_held', false), key: id, src: heldDef.hue ? hueShift(base, heldDef.hue) : base };
    } else if (grit) {
      // pixel art do montinho, com a cor girada por nível (pó → rocha)
      const tier = Number(id.slice(-1)) - 1;
      const base = SP.getSprite('_grit');
      sheet = { ...gridSheet('_grit', false), key: id, src: tier ? hueShift(base, [0, 200, 120, 300][tier]) : base };
    } else sheet = gridSheet('_capsula', false);
    cache.set(ck, sheet);
    return sheet;
  }

  const frameAt = (sheet, t) => (sheet.frames > 1 ? Math.floor(t * sheet.fps) % sheet.frames : 0);

  /** Desenha um quadro encaixado (mantendo proporção) numa caixa, alinhado embaixo e no centro. */
  function drawSheet(ctx, sheet, frame, x, y, w, h, { flip = false, alpha = 1 } = {}) {
    const k = Math.min(w / sheet.fw, h / sheet.fh) * sheet.size;
    const dw = Math.round(sheet.fw * k), dh = Math.round(sheet.fh * k);
    const dx = Math.round(x + (w - dw) / 2), dy = Math.round(y + h - dh);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet.src, frame * sheet.fw, 0, sheet.fw, sheet.fh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(sheet.src, frame * sheet.fw, 0, sheet.fw, sheet.fh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // ---------- Tiles infinitos ----------
  /** layer: 'ground' | 'bg'. Procura <zona>_<layer>.png e depois default_<layer>.png. */
  function tile(zoneId, layer) {
    for (const name of [`tiles/${zoneId}_${layer}.png`, `tiles/default_${layer}.png`]) {
      if (files[name]) return { img: files[name], cfg: cfgOf(name), key: name };
    }
    return null;
  }

  /**
   * Repete a imagem na horizontal, rolando com `offset`. Cobre de x0 até x1.
   * Retorna a altura desenhada.
   */
  function drawTiled(ctx, img, scale, offset, x0, x1, y) {
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.round(img.height * scale);
    const start = x0 - (((offset % tw) + tw) % tw);
    ctx.imageSmoothingEnabled = false;
    for (let x = start; x < x1; x += tw) ctx.drawImage(img, Math.round(x), Math.round(y), tw, th);
    return th;
  }

  // ---------- Molduras 9-slice ----------
  function ui(name) {
    const key = `ui/${name}.png`;
    const img = files[key];
    if (!img) return null;
    const c = cfgOf(key);
    let slice = c.slice ?? Math.floor(Math.min(img.width, img.height) / 3);
    if (typeof slice === 'number') slice = [slice, slice, slice, slice]; // [cima, direita, baixo, esquerda]
    return { img, slice, scale: c.scale || 1, cfg: c, key };
  }

  function drawNine(ctx, frame, x, y, w, h) {
    const { img, slice: [t, r, b, l], scale: s } = frame;
    const iw = img.width, ih = img.height;
    const T = Math.round(t * s), R = Math.round(r * s), B = Math.round(b * s), L = Math.round(l * s);
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const cw = Math.max(0, w - L - R), chh = Math.max(0, h - T - B);
    const sw = iw - l - r, shh = ih - t - b;
    ctx.imageSmoothingEnabled = false;
    const d = (sx, sy, sW, sH, dx, dy, dW, dH) => { if (sW > 0 && sH > 0 && dW > 0 && dH > 0) ctx.drawImage(img, sx, sy, sW, sH, dx, dy, dW, dH); };
    d(0, 0, l, t, x, y, L, T);
    d(l, 0, sw, t, x + L, y, cw, T);
    d(iw - r, 0, r, t, x + L + cw, y, R, T);
    d(0, t, l, shh, x, y + T, L, chh);
    d(l, t, sw, shh, x + L, y + T, cw, chh);
    d(iw - r, t, r, shh, x + L + cw, y + T, R, chh);
    d(0, ih - b, l, b, x, y + T + chh, L, B);
    d(l, ih - b, sw, b, x + L, y + T + chh, cw, B);
    d(iw - r, ih - b, r, b, x + L + cw, y + T + chh, R, B);
  }

  // ---------- Pro painel (HTML/CSS) ----------
  function canvasUrl(src) {
    if (src instanceof HTMLImageElement) return src.src;
    return src.toDataURL();
  }

  /** Folha inteira ampliada (pixel art nítido em <img>/background mesmo sem image-rendering). */
  function sheetUrl(sheet) {
    if (sheet._url) return sheet._url;
    let url;
    if (sheet.custom) url = canvasUrl(sheet.src);
    else {
      const scale = 8;
      const c = document.createElement('canvas');
      c.width = sheet.fw * scale;
      c.height = sheet.fh * scale;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sheet.src, 0, 0, c.width, c.height);
      url = c.toDataURL();
    }
    sheet._url = url;
    return url;
  }

  function silhouetteUrl(id) {
    const ck = `${paletteId}:sil:${id}`;
    if (cache.has(ck)) return cache.get(ck);
    const sheet = creature(id, false);
    const scale = sheet.custom ? 1 : 8;
    const c = document.createElement('canvas');
    c.width = sheet.fw * scale;
    c.height = sheet.fh * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet.src, 0, 0, sheet.fw, sheet.fh, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = palette.gb ? palette.c[1] : '#4a443e';
    ctx.fillRect(0, 0, c.width, c.height);
    const url = c.toDataURL();
    cache.set(ck, url);
    return url;
  }

  const has = (key) => !!files[key.toLowerCase()];
  const list = () => Object.keys(files).sort();

  root.Assets = {
    load, onChange, get version() { return version; },
    creature, item, tile, ui, has, list, cfgOf,
    PALETTES, setPalette, get palette() { return palette; }, get paletteId() { return paletteId; },
    frameAt, drawSheet, drawTiled, drawNine, sheetUrl, silhouetteUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
