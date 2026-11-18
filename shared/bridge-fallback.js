// No Electron, o preload.js cria `window.bridge`. Abrindo os HTML direto no navegador
// (pra desenvolver o visual rápido), este arquivo cria uma versão falsa com
// localStorage + BroadcastChannel, então faixa e painel conversam entre abas.

(function () {
  if (window.bridge) return;
  const ch = new BroadcastChannel('taskmon');
  const listeners = { state: [], cmd: [], stateRequest: [] };
  ch.onmessage = (e) => {
    const { kind, payload } = e.data;
    (listeners[kind] || []).forEach((cb) => cb(payload));
  };
  window.bridge = {
    isFallback: true,
    load: async () => JSON.parse(localStorage.getItem('taskmon-save') || 'null'),
    save: (data) => localStorage.setItem('taskmon-save', JSON.stringify(data)),
    setClickThrough: () => {},
    openPanel: () => window.open('panel.html', 'taskmon-panel', 'width=460,height=680'),
    pushState: (s) => ch.postMessage({ kind: 'state', payload: s }),
    onState: (cb) => listeners.state.push(cb),
    sendCommand: (c) => ch.postMessage({ kind: 'cmd', payload: c }),
    onCommand: (cb) => listeners.cmd.push(cb),
    requestState: () => ch.postMessage({ kind: 'stateRequest' }),
    onStateRequest: (cb) => listeners.stateRequest.push(cb),
  };
})();
