// Ponte segura entre as páginas e o processo principal (contextIsolation ligado).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  load: () => ipcRenderer.invoke('save:load'),
  save: (data) => ipcRenderer.send('save:write', data),
  setClickThrough: (ignore) => ipcRenderer.send('strip:clickthrough', ignore),
  openPanel: () => ipcRenderer.send('panel:open'),
  windowControl: (action) => ipcRenderer.send('panel:win', action),
  pushState: (s) => ipcRenderer.send('state:push', s),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  sendCommand: (c) => ipcRenderer.send('cmd', c),
  onCommand: (cb) => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  requestState: () => ipcRenderer.send('state:request'),
  onStateRequest: (cb) => ipcRenderer.on('state:request', () => cb()),
  onRelayout: (cb) => ipcRenderer.on('strip:relayout', () => cb()),
  onCursor: (cb) => ipcRenderer.on('strip:cursor', (_e, p) => cb(p)),
  onPress: (cb) => ipcRenderer.on('strip:press', (_e, p) => cb(p)),
  onDebug: (cb) => ipcRenderer.on('strip:debug', (_e, d) => cb(d)),
  // sprites customizados
  loadAssets: () => ipcRenderer.invoke('assets:load'),
  onAssetsChanged: (cb) => ipcRenderer.on('assets:changed', () => cb()),
  openSpritesFolder: () => ipcRenderer.send('assets:openFolder'),
  reloadAssets: () => ipcRenderer.send('assets:reload'),
});
