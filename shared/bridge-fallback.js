// No Electron, o preload.js cria `window.bridge`. Abrindo os HTML direto no navegador
// (pra desenvolver o visual rápido), este arquivo cria uma versão falsa com
// localStorage + BroadcastChannel, então faixa e painel conversam entre abas.

(function () {
  if (window.bridge) return;
  const ch = new BroadcastChannel('taskmon');
  const listeners = { state: [], cmd: [], stateRequest: [], assets: [] };
  ch.onmessage = (e) => {
    const { kind, payload } = e.data;
    if (kind === 'closeAll' && /panel\.html/.test(location.pathname)) window.close();
    (listeners[kind] || []).forEach((cb) => cb(payload));
  };

  // Sem acesso ao disco: testa os nomes padrão em ../assets/sprites/ (404 = não existe).
  const BASE = '../assets/sprites/';
  function candidates() {
    const G = window.Game;
    const out = ['items/capsula.png', 'items/super.png', 'tiles/default_ground.png', 'tiles/default_bg.png',
      ...['hud', 'toast', 'card', 'button', 'background', 'coin', 'capsule'].map((n) => `ui/${n}.png`)];
    if (G) {
      G.SPECIES_ORDER.forEach((id) => out.push(`creatures/${id}.png`, `creatures/${id}_shiny.png`));
      G.ZONES.forEach((z) => out.push(`tiles/${z.id}_ground.png`, `tiles/${z.id}_bg.png`));
    }
    return out;
  }
  const exists = (rel) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = BASE + rel;
  });
  async function loadAssets() {
    const files = {};
    await Promise.all(candidates().map(async (rel) => { if (await exists(rel)) files[rel] = BASE + rel; }));
    let config = {};
    try { const r = await fetch(BASE + 'sprites.json'); if (r.ok) config = await r.json(); } catch { /* sem config */ }
    return { files, config };
  }

  window.bridge = {
    isFallback: true,
    load: async () => JSON.parse(localStorage.getItem('taskmon-save') || 'null'),
    save: (data) => localStorage.setItem('taskmon-save', JSON.stringify(data)),
    setClickThrough: () => {},
    windowControl: (action) => {
      if (action === 'close') window.close();
      if (action === 'closeAll') ch.postMessage({ kind: 'closeAll' });
    },
    // cada painel numa janelinha do navegador (popup), como no Electron
    openPanel: (section) => {
      const KIND = { team: 'equipe', bag: 'equipe', zones: 'mapa', map: 'mapa', box: 'caixa', daycare: 'creche', shop: 'loja', tms: 'loja', opts: 'ajustes', settings: 'ajustes' };
      const kinds = !section || section === 'panels' || section === 'trio' ? ['status', 'equipe', 'mapa'] : [KIND[section] || section];
      kinds.forEach((k, i) => window.open(`panel.html?w=${k}`, `taskmon-${k}`, `width=486,height=676,left=${40 + i * 490},top=40`));
      if (section) ch.postMessage({ kind: 'goto', payload: section });
    },
    onPinned: () => {},
    selectCreature: (uid) => { ch.postMessage({ kind: 'select', payload: uid }); (listeners.select || []).forEach((cb) => cb(uid)); },
    onSelect: (cb) => { (listeners.select = listeners.select || []).push(cb); },
    onGoto: (cb) => {
      listeners.goto = listeners.goto || [];
      listeners.goto.push(cb);
      if (location.hash.length > 1) setTimeout(() => cb(location.hash.slice(1)), 0);
    },
    pushState: (s) => ch.postMessage({ kind: 'state', payload: s }),
    onState: (cb) => listeners.state.push(cb),
    sendCommand: (c) => ch.postMessage({ kind: 'cmd', payload: c }),
    onCommand: (cb) => listeners.cmd.push(cb),
    requestState: () => ch.postMessage({ kind: 'stateRequest' }),
    onStateRequest: (cb) => listeners.stateRequest.push(cb),
    onRelayout: () => {},
    onCursor: () => {},
    onDebug: () => {},
    onPress: () => {},
    loadAssets,
    onAssetsChanged: (cb) => listeners.assets.push(cb),
    openSpritesFolder: () => alert('No navegador, coloque os PNGs em assets/sprites/ e recarregue.'),
    reloadAssets: () => {
      ch.postMessage({ kind: 'assets' });
      listeners.assets.forEach((cb) => cb());
    },
  };
})();
