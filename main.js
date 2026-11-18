// Processo principal do Electron: cria a faixa sobre a barra de tarefas, o painel,
// o ícone da bandeja e cuida do save em disco.

const { app, BrowserWindow, screen, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

const userFile = (name) => path.join(app.getPath('userData'), name);
const SAVE_FILE = () => userFile('save.json');
const CONFIG_FILE = () => userFile('config.json');

const DEFAULT_CONFIG = {
  width: 460,      // largura da faixa
  offsetX: 230,    // distância da borda esquerda da tela (no Win11 o lado esquerdo costuma estar livre)
  mode: 'taskbar', // 'taskbar' = em cima da barra | 'above' = logo acima dela
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
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// ---------- Posição da faixa ----------
function stripBounds() {
  const d = screen.getPrimaryDisplay();
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
  return { x, y, width, height };
}

function placeStrip() {
  if (strip && !strip.isDestroyed()) strip.setBounds(stripBounds());
}

// ---------- Janelas ----------
function createStrip() {
  strip = new BrowserWindow({
    ...stripBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
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
  strip.setAlwaysOnTop(true, 'screen-saver');
  strip.setIgnoreMouseEvents(true, { forward: true });
  strip.loadFile(path.join(__dirname, 'renderer', 'strip.html'));
  strip.once('ready-to-show', () => strip.showInactive());

  // A barra de tarefas do Windows às vezes "passa por cima" quando é clicada; reafirma o topo.
  setInterval(() => {
    if (strip && !strip.isDestroyed()) {
      strip.setAlwaysOnTop(true, 'screen-saver');
      strip.moveTop();
    }
  }, 2000);
}

function showPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    return;
  }
  panel = new BrowserWindow({
    width: 460,
    height: 680,
    title: 'Taskmon',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#141210',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  panel.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  panel.on('closed', () => { panel = null; });
}

// ---------- Bandeja ----------
function moveBy(dx) {
  config.offsetX = Math.max(0, config.offsetX + dx);
  writeJsonAtomic(CONFIG_FILE(), config);
  placeStrip();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir painel', click: showPanel },
    { type: 'separator' },
    { label: '← Mover para a esquerda', click: () => moveBy(-60) },
    { label: '→ Mover para a direita', click: () => moveBy(60) },
    {
      label: 'Ficar acima da barra de tarefas',
      type: 'checkbox',
      checked: config.mode === 'above',
      click: (item) => {
        config.mode = item.checked ? 'above' : 'taskbar';
        writeJsonAtomic(CONFIG_FILE(), config);
        placeStrip();
      },
    },
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
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', showPanel);
}

// ---------- IPC ----------
ipcMain.handle('save:load', () => readJson(SAVE_FILE(), null));
ipcMain.on('save:write', (_e, data) => {
  try { writeJsonAtomic(SAVE_FILE(), data); } catch (err) { console.error('Falha ao salvar', err); }
});
ipcMain.on('strip:clickthrough', (_e, ignore) => {
  if (strip && !strip.isDestroyed()) strip.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('panel:open', showPanel);
ipcMain.on('state:push', (_e, s) => {
  lastState = s;
  if (panel && !panel.isDestroyed()) panel.webContents.send('state', s);
});
ipcMain.on('state:request', (e) => {
  if (lastState) e.sender.send('state', lastState);
  if (strip && !strip.isDestroyed()) strip.webContents.send('state:request');
});
ipcMain.on('cmd', (_e, cmd) => {
  if (strip && !strip.isDestroyed()) strip.webContents.send('cmd', cmd);
});

// ---------- Ciclo de vida ----------
app.whenReady().then(() => {
  config = { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE(), {}) };
  createStrip();
  createTray();
  screen.on('display-metrics-changed', placeStrip);
  screen.on('display-added', placeStrip);
  screen.on('display-removed', placeStrip);
});

app.on('second-instance', showPanel);
app.on('window-all-closed', (e) => e.preventDefault()); // continua vivo na bandeja
