// Processo principal do Electron: cria a faixa sobre a barra de tarefas, o painel,
// o ícone da bandeja, cuida do save em disco e carrega os sprites customizados.

const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage, shell, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

const userFile = (name) => path.join(app.getPath('userData'), name);
const SAVE_FILE = () => userFile('save.json');
const CONFIG_FILE = () => userFile('config.json');

// Sprites: os que vêm com o app e os do usuário (estes têm prioridade).
const APP_SPRITES = path.join(__dirname, 'assets', 'sprites');
const USER_SPRITES = () => userFile('sprites');

const DEFAULT_CONFIG = {
  width: 600,      // largura da faixa (o design tem 600 px)
  offsetX: 230,    // distância da borda esquerda da tela (no Win11 o lado esquerdo costuma estar livre)
  mode: 'taskbar', // 'taskbar' = em cima da barra | 'above' = logo acima dela
  displayId: null, // null = monitor principal
};

let strip = null;
let panel = null;
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
  const d = targetDisplay();
  const b = d.bounds;
  const wa = d.workArea;

  // A barra de tarefas é a diferença entre a tela inteira e a área útil.
  let height = b.y + b.height - (wa.y + wa.height);
  let y = wa.y + wa.height;

  // Barra oculta, na lateral ou no topo (ou modo "acima"): fica logo acima da borda inferior.
  if (config.mode === 'above' || height < 28) {
    height = 48;
    y = wa.y + wa.height - height;
  }

  const width = Math.min(config.width, b.width);
  const x = b.x + Math.max(0, Math.min(config.offsetX, b.width - width));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
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
  if (!alive(strip)) return;
  placeTimers.forEach(clearTimeout);
  const apply = () => {
    if (!alive(strip)) return;
    const want = stripBounds();
    if (force) strip.setBounds({ ...want, width: want.width + 1 });
    strip.setBounds(want);
    strip.webContents.send('strip:relayout');
  };
  apply();
  placeTimers = [120, 400, 1200].map((ms) => setTimeout(apply, ms));
}

// ---------- Sempre no topo ----------
// Clicar na barra de tarefas (ou em qualquer janela "topmost") joga ela pra cima da faixa.
// Só chamar setAlwaysOnTop(true) de novo não adianta: o Electron acha que já está no topo
// e não faz nada. Desligar e religar força o Windows a reinserir a janela no topo da pilha.
function reassertTop() {
  if (!alive(strip)) return;
  if (stripGrabbing) { strip.moveTop(); return; } // no meio de um clique: sem desligar o topo
  if (!strip.isVisible() || strip.isMinimized()) strip.showInactive();
  strip.setAlwaysOnTop(false);
  strip.setAlwaysOnTop(true, 'screen-saver', 1);
  strip.moveTop();
}

let lastFix = 0;
function watchdog() {
  if (!alive(strip)) return;
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
  strip.once('ready-to-show', () => {
    strip.showInactive();
    placeStrip({ force: true });
  });
  // "Mostrar área de trabalho" (Win+D) e afins escondem a janela: traz de volta.
  strip.on('hide', () => setTimeout(reassertTop, 300));
  strip.on('minimize', () => { strip.restore(); reassertTop(); });

  setInterval(watchdog, 750);
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

// O painel é um "DS": topo do aparelho + tela de cima (384) + dobradiça (24) + tela de baixo (384),
// com 512 px de largura (256×192 por tela, em 2×). Se não couber na área útil, encolhe com zoom.
const PANEL_W = 512, PANEL_H = 26 + 384 + 24 + 384;
function panelZoom() {
  const wa = targetDisplay().workArea;
  return Math.min(1, (wa.height - 16) / PANEL_H, (wa.width - 16) / PANEL_W);
}

function panelBounds() {
  const z = panelZoom();
  const w = Math.round(PANEL_W * z), h = Math.round(PANEL_H * z);
  const wa = targetDisplay().workArea;
  const sb = alive(strip) ? strip.getBounds() : stripBounds();
  // abre logo acima da faixa, alinhado com ela, sem sair da área útil
  const x = Math.max(wa.x + 8, Math.min(sb.x, wa.x + wa.width - w - 8));
  const y = Math.max(wa.y + 8, wa.y + wa.height - h - 8);
  return { x, y, width: w, height: h };
}

let pendingSection = null;
function showPanel(section) {
  if (typeof section !== 'string') section = null;
  if (alive(panel)) {
    if (panel.isMinimized()) panel.restore();
    panel.show();
    panel.focus();
    if (section) panel.webContents.send('panel:goto', section);
    return;
  }
  pendingSection = section;
  panel = new BrowserWindow({
    ...panelBounds(),
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Taskmon',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    frame: false, // a moldura do "aparelho" é desenhada pelo painel
    backgroundColor: '#34343e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  panel.setMenu(null);
  panel.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  panel.webContents.on('did-finish-load', () => {
    panel.webContents.setZoomFactor(panelZoom());
    if (pendingSection) panel.webContents.send('panel:goto', pendingSection);
    pendingSection = null;
  });
  panel.once('ready-to-show', () => { panel.show(); panel.focus(); });
  panel.on('closed', () => { panel = null; });
}

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
  for (const w of [strip, panel]) if (alive(w)) w.webContents.send('assets:changed');
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
  saveConfig();
  placeStrip();
}

function buildTrayMenu() {
  const displays = screen.getAllDisplays();
  const current = targetDisplay().id;
  return Menu.buildFromTemplate([
    { label: 'Abrir painel', click: showPanel },
    { type: 'separator' },
    { label: '← Mover para a esquerda', click: () => moveBy(-60) },
    { label: '→ Mover para a direita', click: () => moveBy(60) },
    {
      label: 'Largura',
      submenu: [360, 460, 600, 800].map((w) => ({
        label: `${w}px`, type: 'radio', checked: config.width === w,
        click: () => { config.width = w; saveConfig(); placeStrip({ force: true }); },
      })),
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
    {
      label: 'Ficar acima da barra de tarefas',
      type: 'checkbox',
      checked: config.mode === 'above',
      click: (item) => {
        config.mode = item.checked ? 'above' : 'taskbar';
        saveConfig();
        placeStrip({ force: true });
      },
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
  tray.on('click', showPanel);
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
ipcMain.on('panel:win', (_e, action) => {
  if (!alive(panel)) return;
  if (action === 'min') panel.minimize();
  if (action === 'close') panel.close();
});
ipcMain.on('state:push', (_e, s) => {
  lastState = s;
  if (alive(panel)) panel.webContents.send('state', s);
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
  if (config.width === 460 && !config.widthMigrated) { config.width = 600; config.widthMigrated = true; } // antigo padrão
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

app.on('second-instance', showPanel);
app.on('window-all-closed', (e) => e.preventDefault()); // continua vivo na bandeja
