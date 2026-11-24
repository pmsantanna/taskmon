// Processo principal do Electron: cria a faixa logo acima da barra de tarefas, o painel,
// o ícone da bandeja, cuida do save em disco e carrega os sprites customizados.

const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, shell, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

// No Windows, o Chromium para de desenhar (e congela o requestAnimationFrame) quando acha que a
// janela está coberta. Em cima da barra de tarefas isso acontecia o tempo todo: a faixa piscava e
// as mensagens ficavam paradas na tela. Desliga esse rastreamento de oclusão.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const userFile = (name) => path.join(app.getPath('userData'), name);
const SAVE_FILE = () => userFile('save.json');
const CONFIG_FILE = () => userFile('config.json');

// Sprites: os que vêm com o app e os do usuário (estes têm prioridade).
const APP_SPRITES = path.join(__dirname, 'assets', 'sprites');
const USER_SPRITES = () => userFile('sprites');

// A faixa é um overlay transparente de 800×200 (px do design B2) logo acima da barra de tarefas.
// Só a ficha, o chão, os bichos e os cards aparecem; o resto deixa o clique passar.
const STRIP_H = 200;
const DEFAULT_CONFIG = {
  width: 760,      // largura em px do design (escala 100%); cresce se a equipe não couber
  scale: 0.75,     // tamanho: 1 = 1:1 com o design (Ctrl + roda do mouse em cima da faixa muda)
  offsetX: 230,    // distância da borda esquerda da área útil
  offsetY: 0,      // distância da borda de baixo da área útil (0 = encostada na barra de tarefas)
  displayId: null, // null = monitor principal
};

let strip = null;
let tray = null;
let lastState = null;
let config = { ...DEFAULT_CONFIG };

// ---------- Arquivos ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const saveConfig = () => writeJsonAtomic(CONFIG_FILE(), config);
const alive = (w) => w && !w.isDestroyed();

// ---------- Posição da faixa ----------
function targetDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === config.displayId) || screen.getPrimaryDisplay();
}

function stripBounds() {
  const wa = targetDisplay().workArea;
  // fica em cima da área útil, encostada na barra de tarefas (sem brigar com ela pelo topo)
  const s = config.scale || DEFAULT_CONFIG.scale;
  const height = Math.round(Math.min(STRIP_H * s, wa.height / 3));
  // largura da bandeja; a faixa pede mais se a equipe inteira não couber
  const dw = Math.max(config.width, wantWidth || 0);
  const width = Math.round(Math.min(dw * (height / STRIP_H), wa.width));
  // presa na borda esquerda (cresce pra direita) ou, passando do meio da tela, na direita
  const x = config.anchor === 'right'
    ? wa.x + Math.max(0, wa.width - width - Math.max(0, config.offsetR || 0))
    : wa.x + Math.max(0, Math.min(config.offsetX, wa.width - width));
  const up = Math.max(0, Math.min(config.offsetY || 0, wa.height - height));
  return { x: Math.round(x), y: Math.round(wa.y + wa.height - height - up), width, height };
}

const sameBounds = (a, b) =>
  Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 &&
  Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1;

/**
 * Reposiciona a faixa. No Windows, quando o DPI muda o próprio sistema redimensiona a
 * janela logo depois (WM_DPICHANGED) e desfaz o nosso setBounds; e um setBounds com os
 * mesmos números às vezes é ignorado. Por isso "cutucamos" o tamanho (+1px e volta)
 * e repetimos algumas vezes depois que a poeira baixa.
 */
let placeTimers = [];
function placeStrip({ force = false } = {}) {
  if (!alive(strip) || drag) return;
  placeTimers.forEach(clearTimeout);
  const apply = () => {
    if (!alive(strip)) return;
    const want = stripBounds();
    if (force) strip.setBounds({ ...want, width: want.width + 1 });
    strip.setBounds(want);
    strip.webContents.send('strip:relayout');
    strip.webContents.send('strip:side', stripMirrored()); // card e botões do lado da borda da tela
  };
  apply();
  placeTimers = [120, 400, 1200].map((ms) => setTimeout(apply, ms));
}

// ---------- Arrastar e redimensionar ----------
// A faixa não é "movível" pelo sistema (ela ignora o mouse fora dos elementos). Quem arrasta é a
// gente: a página avisa quando apertou na ficha, no chão ou na barrinha recolhida, e aqui a janela
// segue o cursor até soltar o botão. Soltou: guarda a posição (relativa à área útil do monitor).
let drag = null, dragTimer = null;
let wantWidth = null; // largura (px do design) que a faixa pediu
// O desenho "normal" da faixa tem o card e os botões à direita. Do lado esquerdo da tela ela espelha,
// pra que fiquem sempre do lado da borda da tela.
const stripMirrored = () => config.anchor !== 'right';
function dragStart() {
  if (drag || !alive(strip)) return;
  const p = screen.getCursorScreenPoint(), b = strip.getBounds();
  drag = { dx: p.x - b.x, dy: p.y - b.y, sx: p.x, sy: p.y, w: b.width, h: b.height, moved: false, t: Date.now() };
  clearInterval(dragTimer);
  dragTimer = setInterval(dragStep, 16);
}
function dragStep() {
  if (!drag || !alive(strip)) return dragEnd();
  // no Windows lemos o botão direto (o "soltar" pode acontecer fora da janela)
  if (mouseButton && !mouseButton().down && Date.now() - drag.t > 60) return dragEnd();
  if (Date.now() - drag.t > 60000) return dragEnd(); // trava de segurança
  const p = screen.getCursorScreenPoint();
  if (!drag.moved && Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) < 5) return;
  drag.moved = true;
  strip.setBounds({ x: p.x - drag.dx, y: p.y - drag.dy, width: drag.w, height: drag.h });
}
function dragEnd() {
  clearInterval(dragTimer);
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  if (!alive(strip)) return;
  if (moved) {
    const b = strip.getBounds();
    const d = screen.getDisplayMatching(b);
    const wa = d.workArea;
    config.displayId = d.id === screen.getPrimaryDisplay().id ? null : d.id;
    config.offsetX = Math.max(0, Math.round(b.x - wa.x));
    config.offsetR = Math.max(0, Math.round(wa.x + wa.width - (b.x + b.width)));
    config.anchor = b.x + b.width / 2 > wa.x + wa.width / 2 ? 'right' : 'left';
    config.offsetY = Math.max(0, Math.round(wa.y + wa.height - (b.y + b.height)));
    saveConfig();
    placeStrip({ force: true }); // encaixa dentro da área útil (e acerta o tamanho no monitor novo)
  }
  strip.webContents.send('strip:dragEnd', { moved });
}

const SCALES = [0.5, 0.6, 0.75, 0.9, 1, 1.25, 1.5];
function setScale(s) {
  config.scale = s;
  saveConfig();
  placeStrip({ force: true });
}
function stepScale(dir) {
  const cur = config.scale || DEFAULT_CONFIG.scale;
  let i = SCALES.findIndex((x) => x >= cur - 0.001);
  if (i < 0) i = SCALES.length - 1;
  setScale(SCALES[Math.max(0, Math.min(SCALES.length - 1, i + (dir > 0 ? 1 : -1)))]);
}

// ---------- Sempre no topo ----------
// Clicar na barra de tarefas (ou em qualquer janela "topmost") joga ela pra cima da faixa.
// Só chamar setAlwaysOnTop(true) de novo não adianta: o Electron acha que já está no topo
// e não faz nada. Desligar e religar força o Windows a reinserir a janela no topo da pilha.
// Traz a faixa pro topo SEM desligar o "sempre no topo" (desligar, mesmo por um instante, jogava
// a faixa atrás da barra de tarefas e fazia piscar). No Windows chama SetWindowPos(HWND_TOPMOST)
// direto, que reinsere a janela no topo da pilha mesmo ela já sendo topmost (o Electron ignoraria).
const raiseNative = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags)');
    const HWND_TOPMOST = -1;
    const FLAGS = 0x0001 | 0x0002 | 0x0010 | 0x0200; // NOSIZE | NOMOVE | NOACTIVATE | NOOWNERZORDER
    return (win) => {
      const buf = win.getNativeWindowHandle();
      const hwnd = buf.length >= 8 ? Number(buf.readBigInt64LE(0)) : buf.readInt32LE(0);
      return SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, FLAGS);
    };
  } catch (err) {
    console.warn('Sem SetWindowPos (koffi):', err.message);
    return null;
  }
})();

// Quando a janela em primeiro plano muda (clique em outra janela, Alt+Tab, restaurar), a barra
// de tarefas costuma se colocar na frente da faixa. Em vez de esperar o vigia (300 ms, dá pra ver
// piscar), o Windows avisa na hora (SetWinEventHook) e a faixa volta pro topo imediatamente.
let winEventHook = null; // guardado pra não ser coletado
function watchForeground() {
  if (process.platform !== 'win32' || winEventHook) return;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const WinEventProc = koffi.proto('void __stdcall WinEventProc(intptr hWinEventHook, uint32 event, intptr hwnd, int32 idObject, int32 idChild, uint32 idEventThread, uint32 dwmsEventTime)');
    const SetWinEventHook = user32.func('intptr __stdcall SetWinEventHook(uint32 eventMin, uint32 eventMax, intptr hmodWinEventProc, WinEventProc *pfnWinEventProc, uint32 idProcess, uint32 idThread, uint32 dwFlags)');
    const EVENT_SYSTEM_FOREGROUND = 0x0003, EVENT_SYSTEM_SWITCHEND = 0x0015, EVENT_SYSTEM_MINIMIZEEND = 0x0017;
    const WINEVENT_OUTOFCONTEXT = 0x0000, WINEVENT_SKIPOWNPROCESS = 0x0002;
    let timers = [];
    const cb = koffi.register((_h, event) => {
      if (event !== EVENT_SYSTEM_FOREGROUND && event !== EVENT_SYSTEM_SWITCHEND && event !== EVENT_SYSTEM_MINIMIZEEND) return;
      reassertTop();
      timers.forEach(clearTimeout); // a barra às vezes se coloca na frente logo depois: repete
      timers = [60, 200].map((ms) => setTimeout(reassertTop, ms));
    }, koffi.pointer(WinEventProc));
    const hook = SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND, 0, cb, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    winEventHook = { hook, cb };
  } catch (err) {
    console.warn('Sem aviso de troca de janela (koffi):', err.message);
  }
}

function reassertTop() {
  if (!alive(strip)) return;
  if (!strip.isVisible() || strip.isMinimized()) strip.showInactive();
  if (raiseNative) {
    try { raiseNative(strip); return; } catch { /* cai no caminho do Electron */ }
  }
  if (!strip.isAlwaysOnTop()) strip.setAlwaysOnTop(true, 'screen-saver', 1);
  strip.moveTop();
}

let lastFix = 0;
function watchdog() {
  if (!alive(strip) || drag) return;
  reassertTop();
  // Se algo mexeu no tamanho/posição (DPI, barra mudou, explorer reiniciou), corrige.
  // No máximo a cada 3 s, pra não ficar brigando com arredondamento de escala fracionada.
  if (!sameBounds(strip.getBounds(), stripBounds()) && Date.now() - lastFix > 3000) {
    lastFix = Date.now();
    placeStrip({ force: true });
  }
}

// ---------- Janelas ----------
function createStrip() {
  strip = new BrowserWindow({
    ...stripBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false, // continua animando mesmo sem foco
    },
  });
  strip.setAlwaysOnTop(true, 'screen-saver', 1);
  strip.setIgnoreMouseEvents(true, { forward: true });
  strip.loadFile(path.join(__dirname, 'renderer', 'strip.html'));
  strip.webContents.on('did-finish-load', () => strip.webContents.send('strip:side', stripMirrored()));
  strip.once('ready-to-show', () => {
    strip.showInactive();
    placeStrip({ force: true });
  });
  // "Mostrar área de trabalho" (Win+D) e afins escondem a janela: traz de volta.
  strip.on('hide', () => setTimeout(reassertTop, 300));
  strip.on('minimize', () => { strip.restore(); reassertTop(); });

  setInterval(watchdog, 300); // barato: só reinsere no topo (não pisca)
  watchForeground();
  setInterval(trackCursor, 30);
}

// Avisa a faixa quando o cursor SAI dela (a posição exata vem do mousemove da própria página;
// a do sistema pode vir deslocada com escala de DPI). Com o diagnóstico ligado, manda os números.
// ---------- Clique em cima da barra de tarefas ----------
// Em cima da barra, o Windows entrega o clique pra barra mesmo com a faixa aceitando o mouse
// (ela se coloca na frente das janelas sempre no topo). Então, enquanto o cursor está em cima
// da faixa, lemos o botão esquerdo direto do Windows (GetAsyncKeyState: só o estado do botão,
// sem hook e sem teclado) e avisamos a faixa do ponto apertado. Fora do Windows, ou sem o koffi,
// fica só o clique normal da janela.
const mouseButton = (() => {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');
    const VK_LBUTTON = 0x01;
    return () => {
      const st = GetAsyncKeyState(VK_LBUTTON);
      return { down: (st & 0x8000) !== 0, pressedSince: (st & 0x0001) !== 0 };
    };
  } catch (err) {
    console.warn('Sem leitura do botão do mouse (koffi):', err.message);
    return null;
  }
})();

let cursorInside = false;
let stripGrabbing = false; // a faixa está aceitando clique (mouse em cima de algo clicável)
let wasDown = false;
let lastPress = null;
function trackCursor() {
  if (!alive(strip)) return;
  const p = screen.getCursorScreenPoint();
  const b = strip.getBounds();
  const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  if (!inside && cursorInside) strip.webContents.send('strip:cursor', null);
  cursorInside = inside;
  if (mouseButton) {
    const st = mouseButton(); // lê sempre, pra zerar o "apertou desde a última leitura"
    const pressed = (st.down && !wasDown) || (st.pressedSince && !st.down && !wasDown);
    wasDown = st.down;
    if (inside && pressed) {
      lastPress = { x: p.x - b.x, y: p.y - b.y };
      strip.webContents.send('strip:press', lastPress);
    }
  }
  if (config.debugMouse) {
    strip.webContents.send('strip:debug', { on: true, pt: p, b, scale: targetDisplay().scaleFactor, reader: !!mouseButton, press: lastPress });
  }
}

// ---------- Painéis (Layout B) ----------
// Cada painel é uma janela solta de 470×660 (px do design) com moldura própria: STATUS, EQUIPE e
// MAPA abrem juntos (o "trio", botão Painéis da faixa) e os outros (Baú, Creche, Loja, Dex, Ajustes)
// abrem por cima. Uma barrinha em cima mostra moedas e cápsulas. Se não couber, tudo encolhe (zoom).
const WIN_W = 470, WIN_H = 660, WIN_PAD = 8; // margem transparente pras cantoneiras e a sombra
const TOP_H = 36;
const TRIO = ['status', 'equipe', 'mapa'];
const SECTION_KIND = {
  status: 'status', equipe: 'equipe', team: 'equipe', bag: 'equipe', mapa: 'mapa', zones: 'mapa', map: 'mapa',
  caixa: 'caixa', box: 'caixa', creche: 'creche', daycare: 'creche', loja: 'loja', shop: 'loja', tms: 'loja',
  dex: 'dex', ajustes: 'ajustes', opts: 'ajustes', settings: 'ajustes',
};
const panels = new Map(); // tipo -> BrowserWindow
let topbar = null;
let pinned = false;       // "fixar": painéis sempre no topo

// espaço livre acima da faixa (ela é sempre no topo e cobriria o pé dos painéis)
function panelArea() {
  const wa = targetDisplay().workArea;
  const sb = alive(strip) ? strip.getBounds() : stripBounds();
  const h = sb.y - wa.y;
  return h >= (WIN_H + TOP_H) * 0.6 ? { ...wa, height: h } : wa;
}
function winZoom() {
  const a = panelArea();
  return Math.min(1, (a.width - 24) / (3 * (WIN_W + 2 * WIN_PAD)), (a.height - 16) / (WIN_H + TOP_H + 4 * WIN_PAD));
}
function trioOrigin() {
  const z = winZoom(), a = panelArea();
  const w = Math.round((WIN_W + 2 * WIN_PAD) * z), h = Math.round((WIN_H + 2 * WIN_PAD) * z);
  const step = w - Math.round(2 * z);                 // 12 px entre as molduras (8 + 8 de margem − 4)
  const topH = Math.round((TOP_H + 2 * WIN_PAD) * z);
  const x0 = a.x + Math.round((a.width - (step * 2 + w)) / 2);
  const y = a.y + Math.max(0, Math.round((a.height - h - topH) / 2)) + topH - Math.round(6 * z);
  return { z, w, h, step, x0, y, topH };
}
function panelBounds(kind) {
  const o = trioOrigin();
  const i = TRIO.indexOf(kind);
  if (i >= 0) return { x: o.x0 + i * o.step, y: o.y, width: o.w, height: o.h };
  // os outros abrem por cima, em cascata a partir do meio
  const open = [...panels.keys()].filter((k) => !TRIO.includes(k)).length;
  const d = Math.round(28 * o.z) * (open % 4);
  return { x: o.x0 + Math.round(o.step / 2) + d, y: o.y + d, width: o.w, height: o.h };
}
function topbarBounds() {
  const o = trioOrigin();
  return { x: o.x0 + o.step, y: o.y - o.topH + Math.round(6 * o.z), width: o.w, height: o.topH };
}

function makeWin(bounds, query) {
  const w = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: pinned,
    title: 'Taskmon',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  w.setMenu(null);
  w.loadFile(path.join(__dirname, 'renderer', 'panel.html'), { query });
  const z = winZoom();
  w.webContents.on('did-finish-load', () => {
    w.webContents.setZoomFactor(z);
    w.webContents.send('panel:pinned', pinned);
  });
  return w;
}

function ensureTopbar() {
  if (alive(topbar)) { topbar.showInactive(); return; }
  topbar = makeWin(topbarBounds(), { w: 'topbar' });
  topbar.once('ready-to-show', () => topbar.showInactive());
  topbar.on('closed', () => { topbar = null; });
}

/** Abre (ou traz pra frente) um painel. focus=false abre sem roubar o foco. */
function openKind(kind, { focus = true, section = null } = {}) {
  let w = panels.get(kind);
  if (alive(w)) {
    if (w.isMinimized()) w.restore();
    if (focus) { w.show(); w.focus(); } else w.showInactive();
    if (section) w.webContents.send('panel:goto', section);
  } else {
    w = makeWin(panelBounds(kind), { w: kind });
    panels.set(kind, w);
    w.webContents.once('did-finish-load', () => { if (section) w.webContents.send('panel:goto', section); });
    w.once('ready-to-show', () => { if (focus) { w.show(); w.focus(); } else w.showInactive(); });
    w.on('closed', () => {
      panels.delete(kind);
      if (![...panels.values()].some(alive) && alive(topbar)) topbar.close();
    });
  }
  ensureTopbar();
  return w;
}

const trioOpen = () => TRIO.some((k) => alive(panels.get(k)) && panels.get(k).isVisible());
function openTrio(focusKind = 'equipe') {
  for (const k of TRIO) if (k !== focusKind) openKind(k, { focus: false });
  openKind(focusKind);
}
function closeAllPanels() {
  for (const w of [...panels.values()]) if (alive(w)) w.close();
  if (alive(topbar)) topbar.close();
}

/** Pedido de abrir painel (faixa, bandeja ou outro painel). 'panels' liga/desliga o trio. */
function showPanel(section) {
  if (typeof section !== 'string' || !section) return openTrio('equipe');
  if (section === 'panels') return trioOpen() ? closeAllPanels() : openTrio('equipe');
  if (section === 'trio') return openTrio('status');
  const kind = SECTION_KIND[section] || 'equipe';
  openKind(kind, { section });
}

function setPinned(on) {
  pinned = !!on;
  for (const w of [...panels.values(), topbar]) {
    if (!alive(w)) continue;
    w.setAlwaysOnTop(pinned);
    w.webContents.send('panel:pinned', pinned);
  }
}

const panelWindows = () => [...panels.values(), topbar].filter(alive);

// ---------- Sprites customizados ----------
function ensureUserSprites() {
  const root = USER_SPRITES();
  for (const sub of ['creatures', 'items', 'tiles', 'ui']) fs.mkdirSync(path.join(root, sub), { recursive: true });
  const readme = path.join(root, 'LEIA-ME.txt');
  const src = path.join(APP_SPRITES, 'LEIA-ME.txt');
  if (!fs.existsSync(readme) && fs.existsSync(src)) fs.copyFileSync(src, readme);
  return root;
}

function scanPngs(root, rel = '', out = {}) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!e.name.startsWith('_')) scanPngs(root, r, out); } // _exemplos etc. ficam de fora
    else if (/\.png$/i.test(e.name)) out[r.toLowerCase()] = path.join(root, r);
  }
  return out;
}

/** Junta os PNGs do app + do usuário e devolve como data URLs (passa pelo CSP sem drama). */
function loadAssets() {
  const files = { ...scanPngs(APP_SPRITES), ...scanPngs(USER_SPRITES()) };
  const out = {};
  for (const [rel, abs] of Object.entries(files)) {
    try { out[rel] = 'data:image/png;base64,' + fs.readFileSync(abs).toString('base64'); } catch { /* ignora */ }
  }
  const cfg = {
    ...readJson(path.join(APP_SPRITES, 'sprites.json'), {}),
    ...readJson(path.join(USER_SPRITES(), 'sprites.json'), {}),
  };
  return { files: out, config: cfg };
}

function broadcastAssetsChanged() {
  for (const w of [strip, ...panelWindows()]) if (alive(w)) w.webContents.send('assets:changed');
}

let watchTimer = null;
function watchUserSprites() {
  try {
    fs.watch(ensureUserSprites(), { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(broadcastAssetsChanged, 400);
    });
  } catch (err) {
    console.warn('Não deu pra observar a pasta de sprites:', err.message);
  }
}

// ---------- Bandeja ----------
function moveBy(dx) {
  config.offsetX = Math.max(0, config.offsetX + dx);
  config.offsetR = Math.max(0, (config.offsetR || 0) - dx);
  saveConfig();
  placeStrip();
}

function buildTrayMenu() {
  const displays = screen.getAllDisplays();
  const current = targetDisplay().id;
  return Menu.buildFromTemplate([
    { label: 'Abrir painéis', click: () => showPanel() },
    { type: 'separator' },
    { label: '← Mover para a esquerda', click: () => moveBy(-60) },
    { label: '→ Mover para a direita', click: () => moveBy(60) },
    {
      label: 'Largura',
      submenu: [560, 680, 760, 900, 1100].map((w) => ({
        label: `${w}px`, type: 'radio', checked: config.width === w,
        click: () => { config.width = w; saveConfig(); placeStrip({ force: true }); },
      })),
    },
    {
      label: 'Tamanho',
      submenu: SCALES.map((s) => ({
        label: `${Math.round(s * 100)}%`, type: 'radio', checked: (config.scale || DEFAULT_CONFIG.scale) === s,
        click: () => setScale(s),
      })),
    },
    {
      label: 'Mostrar a equipe toda',
      type: 'checkbox',
      checked: !lastState || !lastState.settings || lastState.settings.showTeam !== false,
      click: (item) => { if (alive(strip)) strip.webContents.send('cmd', { type: 'stripUi', showTeam: item.checked }); },
    },
    {
      label: 'Voltar pra posição padrão',
      click: () => { config.offsetX = DEFAULT_CONFIG.offsetX; config.offsetY = 0; config.anchor = 'left'; config.displayId = null; saveConfig(); placeStrip({ force: true }); },
    },
    {
      label: 'Monitor',
      visible: displays.length > 1,
      submenu: displays.map((d, i) => ({
        label: `${i + 1}: ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (principal)' : ''}`,
        type: 'radio', checked: d.id === current,
        click: () => { config.displayId = d.id; saveConfig(); placeStrip({ force: true }); },
      })),
    },
    { type: 'separator' },
    {
      label: 'Diagnóstico do mouse',
      type: 'checkbox',
      checked: !!config.debugMouse,
      click: (item) => {
        config.debugMouse = item.checked;
        saveConfig();
        if (alive(strip)) strip.webContents.send('strip:debug', { on: item.checked });
      },
    },
    { label: 'Abrir pasta de sprites', click: () => shell.openPath(ensureUserSprites()) },
    { label: 'Recarregar sprites', click: broadcastAssetsChanged },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Taskmon');
  tray.on('click', () => showPanel());
  // Monta o menu na hora de abrir, pra refletir monitores/config atuais.
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()));
}

// ---------- IPC ----------
ipcMain.handle('save:load', () => readJson(SAVE_FILE(), null));
ipcMain.on('save:write', (_e, data) => {
  try { writeJsonAtomic(SAVE_FILE(), data); } catch (err) { console.error('Falha ao salvar', err); }
});
ipcMain.on('strip:clickthrough', (_e, ignore) => {
  if (!alive(strip)) return;
  strip.setIgnoreMouseEvents(ignore, { forward: true });
  stripGrabbing = !ignore;
});
ipcMain.on('panel:open', (_e, section) => showPanel(section));
ipcMain.on('strip:dragStart', dragStart);
ipcMain.on('strip:dragEnd', dragEnd);
ipcMain.on('strip:scale', (_e, dir) => stepScale(dir));
ipcMain.on('strip:width', (_e, w) => {
  w = Math.max(360, Math.round(Number(w) || 0));
  if (w === wantWidth) return;
  wantWidth = w;
  placeStrip();
});
ipcMain.on('panel:win', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (action === 'closeAll') return closeAllPanels();
  if (action === 'pin') return setPinned(!pinned);
  if (!alive(w)) return;
  if (action === 'min') w.minimize();
  if (action === 'close') w.close();
});
// bicho escolhido num painel (EQUIPE, Baú) aparece nos outros (STATUS)
ipcMain.on('ui:select', (_e, uid) => {
  for (const w of panelWindows()) w.webContents.send('ui:select', uid);
});
ipcMain.on('state:push', (_e, s) => {
  lastState = s;
  for (const w of panelWindows()) w.webContents.send('state', s);
});
ipcMain.on('state:request', (e) => {
  if (lastState) e.sender.send('state', lastState);
  if (alive(strip)) strip.webContents.send('state:request');
});
ipcMain.on('cmd', (_e, cmd) => {
  if (alive(strip)) strip.webContents.send('cmd', cmd);
});
ipcMain.handle('assets:load', () => loadAssets());
ipcMain.on('assets:openFolder', () => shell.openPath(ensureUserSprites()));
ipcMain.on('assets:reload', broadcastAssetsChanged);

// ---------- Ciclo de vida ----------
app.whenReady().then(() => {
  config = { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE(), {}) };
  if (!config.layoutB) { config.width = 800; config.layoutB = true; delete config.mode; } // faixa nova (Layout B2)
  if (!config.sizeV3) { config.width = DEFAULT_CONFIG.width; config.sizeV3 = true; } // largura tipo TaskBarHero
  if (!config.sizeV2) { if (!config.scale || config.scale === 1) config.scale = DEFAULT_CONFIG.scale; config.sizeV2 = true; } // 100% ficou grande
  createStrip();
  createTray();
  watchUserSprites();
  const relayout = () => placeStrip({ force: true });
  screen.on('display-metrics-changed', relayout);
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);
  powerMonitor.on('resume', relayout);
  powerMonitor.on('unlock-screen', relayout);
});

app.on('second-instance', () => showPanel());
app.on('window-all-closed', (e) => e.preventDefault()); // continua vivo na bandeja
