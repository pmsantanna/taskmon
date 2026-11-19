// Camada HTML da faixa (design DS do Claude Design): placa do líder, plaquinha do selvagem,
// caixa de diálogo, botões CAPTURAR/DEIXAR IR, bolsa e menu. Os bichos ficam no canvas (strip.js).
// update(view) só mexe no DOM quando algo muda.

(function (root) {
  'use strict';
  const A = root.Assets;

  // formas das placas, copiadas do design (coordenadas em px do design 2×)
  const SVG = {
    lead: `<svg aria-hidden="true" width="320" height="88" viewBox="0 0 320 88">
      <defs><clipPath id="pa-in"><path d="M13 3H304Q309 3 308 8L293 75Q292 81 286 81H13Q3 81 3 71V13Q3 3 13 3Z"/></clipPath></defs>
      <path d="M12 4H306Q314 4 312 12L296 80Q294 88 286 88H12Q0 88 0 76V16Q0 4 12 4Z" fill="#2a303c"/>
      <path d="M12 0H306Q314 0 312 8L296 76Q294 84 286 84H12Q0 84 0 72V12Q0 0 12 0Z" fill="#404858"/>
      <g clip-path="url(#pa-in)"><rect width="320" height="88" fill="#f6f6ea"/><rect y="68" width="320" height="20" fill="#dcdfce"/><rect y="4" width="320" height="2" fill="#ffffff"/></g>
      <circle cx="42" cy="42" r="29" fill="#dfe6f6" stroke="#404858" stroke-width="3"/>
      <rect x="24" y="55" width="36" height="5" fill="#b8c4e4"/></svg>`,
    foe: `<svg aria-hidden="true" width="168" height="44" viewBox="0 0 168 44">
      <defs><clipPath id="pb-foe"><path d="M9 2H155Q160 2 159 7L152 35Q151 38 147 38H9Q2 38 2 31V9Q2 2 9 2Z"/></clipPath></defs>
      <path d="M8 3H157Q164 3 162 10L155 37Q153 43 147 43H8Q0 43 0 35V11Q0 3 8 3Z" fill="#2a303c"/>
      <path d="M8 0H157Q164 0 162 7L155 34Q153 40 147 40H8Q0 40 0 32V8Q0 0 8 0Z" fill="#404858"/>
      <g clip-path="url(#pb-foe)"><rect width="168" height="44" fill="#f6f6ea"/><rect y="31" width="168" height="10" fill="#dcdfce"/><rect y="3" width="168" height="2" fill="#ffffff"/></g></svg>`,
    purse: `<svg aria-hidden="true" width="220" height="88" viewBox="0 0 220 88">
      <defs><clipPath id="pa-cur"><path d="M15 3H207Q217 3 217 13V71Q217 81 207 81H35Q28 81 27 75L11 8Q10 3 15 3Z"/></clipPath></defs>
      <path d="M14 4H208Q220 4 220 16V76Q220 88 208 88H34Q26 88 24 80L8 12Q6 4 14 4Z" fill="#2a303c"/>
      <path d="M14 0H208Q220 0 220 12V72Q220 84 208 84H34Q26 84 24 76L8 8Q6 0 14 0Z" fill="#404858"/>
      <g clip-path="url(#pa-cur)"><rect width="220" height="88" fill="#f6f6ea"/><rect y="68" width="220" height="20" fill="#dcdfce"/><rect y="4" width="220" height="2" fill="#ffffff"/></g></svg>`,
  };
  // ícones do menu (grade 10×10 do design)
  const ICON = {
    team: 'M1 2h3v3H1zM6 1h3v4H6zM0 6h5v3H0zM5 6h5v3H5z',
    bag: 'M3 0h4v1H3zM2 1h1v2H2zM7 1h1v2H7zM1 3h8v7H1zM4 5h2v2H4z',
    dex: 'M0 1h10v8H0zM1 2h3v6H1zM6 2h3v6H6z',
    opts: 'M0 2h10v1H0zM0 5h10v1H0zM0 8h10v1H0zM2 1h2v3H2zM6 4h2v3H6zM3 7h2v3H3z',
  };
  const icon = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 10 10" shape-rendering="crispEdges" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="${d}"/></svg>`;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hpFill = (r) => (r > 0.5 ? ['#80f4a8', '#28c048'] : r > 0.2 ? ['#fce07a', '#f0a818'] : ['#ff9a8a', '#e83838']);
  const grad = (r) => { const [a, b] = hpFill(r); return `linear-gradient(${a} 0 45%, ${b} 45% 100%)`; };
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

  let ui, els = {}, last = {};

  function init(parent) {
    ui = document.createElement('div');
    ui.id = 'ui';
    ui.className = 'explore';
    ui.innerHTML = `
      <div class="row">
        <div id="lead" data-hit="hud">${SVG.lead}
          <canvas id="portrait" class="px" width="48" height="40"></canvas>
          <div class="info">
            <div class="line"><span class="name dts" id="l-name"></span><span class="g" id="l-g"></span><span class="st hide" id="l-st"></span><span class="lv dts"><small>Nv</small><span id="l-lv"></span></span></div>
            <div class="line" style="align-items:center;gap:8px"><div class="hp" style="flex:1"><span class="hp-l">HP</span><div class="hp-t"><i id="l-hp"></i></div></div><span class="hpnum dts" id="l-hpn"></span></div>
            <div class="line" style="align-items:center"><div class="xp" style="flex:1"><i id="l-xp"></i></div><span class="xpgain hide" id="l-xpg"></span></div>
          </div>
        </div>
        <div id="scene">
          <span id="zone"></span>
          <div id="foe" class="hide">${SVG.foe}
            <div class="info">
              <div class="line" style="gap:5px"><span class="name dts" id="f-name"></span><span class="g" id="f-g"></span><span class="st hide" id="f-st"></span><span class="lv dts"><small>Nv</small><span id="f-lv"></span></span></div>
              <div class="bar"><i id="f-hp"></i></div>
            </div>
          </div>
        </div>
        <div id="dlg"><p id="d-title"></p><p class="sub hide" id="d-sub"></p>
          <div class="ask hide" id="d-ask"><span id="d-q"></span><div class="timer"><div class="tm"><i id="d-tm"></i></div></div><span class="secs dts" id="d-secs"></span></div>
          <span class="more hide" id="d-more">▼</span></div>
        <div id="act">
          <div class="tbtn red" data-hit="askYes" id="b-yes"><img class="px" id="b-yes-ico" width="12" height="15" alt="">CAPTURAR</div>
          <div class="tbtn blue" data-hit="askNo" id="b-no">DEIXAR IR</div>
        </div>
        <div id="purse" data-hit="menu:bag">${SVG.purse}
          <div class="info">
            <div class="it"><span class="ico" id="p-coin"></span><span class="lbl">MOEDAS</span><span class="val dts" id="p-coins"></span></div>
            <div class="it"><span class="ico" id="p-cap"></span><span class="lbl">CÁPSULAS</span><span class="val dts" id="p-caps"></span></div>
          </div>
        </div>
        <nav id="menu" aria-label="Menu do jogo">
          <div class="rbtn" data-hit="menu:team" title="Equipe" style="background:#4caa52">${icon(ICON.team)}</div>
          <div class="rbtn" data-hit="menu:bag" title="Mochila" style="background:#e89a30">${icon(ICON.bag)}</div>
          <div class="rbtn" data-hit="menu:dex" title="Dex" style="background:#e05848">${icon(ICON.dex)}</div>
          <div class="rbtn" data-hit="menu:opts" title="Opções" style="background:#4888d0">${icon(ICON.opts)}</div>
        </nav>
      </div>`;
    parent.appendChild(ui);
    ui.querySelectorAll('[id]').forEach((el) => { els[el.id] = el; });
    els.ui = ui;
    icons();
    return ui;
  }

  /** Ícones de moeda e cápsula (PNG da pasta de sprites ou pixel art embutida). */
  function icons() {
    const put = (host, sheet, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h; c.className = 'px';
      A.drawSheet(c.getContext('2d'), sheet, 0, 0, 0, w, h);
      host.replaceChildren(c);
    };
    const coin = A.ui('coin'), cap = A.ui('capsule');
    if (coin) els['p-coin'].innerHTML = `<img class="px" src="${coin.img.src}" width="16" height="16" alt="">`;
    else put(els['p-coin'], A.creature('_coin'), 16, 16);
    if (cap) els['p-cap'].innerHTML = `<img class="px" src="${cap.img.src}" width="16" height="20" alt="">`;
    else put(els['p-cap'], A.item('capsula'), 16, 20);
    const yes = els['b-yes-ico'];
    yes.src = cap ? cap.img.src : A.sheetUrl(A.item('capsula'));
    last.portrait = null; // redesenha o retrato também (pode ter sprite novo)
  }

  const set = (id, key, value, fn) => {
    if (last[key] === value) return;
    last[key] = value;
    fn(els[id], value);
  };
  const text = (id, key, v) => set(id, key, v, (el, x) => { el.textContent = x; });
  const show = (id, key, on) => set(id, key, !!on, (el, x) => el.classList.toggle('hide', !x));

  function gender(id, key, g) {
    set(id, key, g || '', (el, x) => { el.textContent = x === 'F' ? '♀' : x === 'M' ? '♂' : ''; el.className = `g ${x === 'F' ? 'f' : 'm'}`; });
  }
  function status(id, key, st) {
    set(id, key, st ? st.short : '', (el) => {
      el.classList.toggle('hide', !st);
      if (st) { el.textContent = st.short; el.style.background = st.color; }
    });
  }

  /**
   * view = { width, height, starter, mode: 'explore'|'toast'|'prompt', zone,
   *          lead: {species, shiny, name, g, lv, hp, max, xp, st, xpGain}, foe: {...}|null,
   *          dialog: {kind, title (html), sub, ask: {q, left, frac}, more}, coins, caps, hot }
   */
  function update(v) {
    if (!ui) return;
    const k = v.height / 104;
    set('ui', 'zoom', k, (el, x) => { el.style.zoom = x; });
    const dw = Math.round(v.width / k);
    set('ui', 'w', dw, (el, x) => { el.style.width = `${x}px`; });
    const cls = [v.starter ? 'starter' : v.mode, dw < 1150 ? 'narrow' : '', dw < 820 ? 'nomenu' : ''].join(' ');
    set('ui', 'cls', cls, (el, x) => { el.className = x; });

    const L = v.lead;
    if (L) {
      text('l-name', 'ln', L.name);
      gender('l-g', 'lg', L.g);
      status('l-st', 'lst', L.st);
      text('l-lv', 'llv', String(L.lv));
      const r = L.max ? L.hp / L.max : 0;
      set('l-hp', 'lhp', `${Math.round(r * 1000)}`, (el) => { el.style.width = `${(r * 100).toFixed(1)}%`; el.style.background = grad(r); });
      text('l-hpn', 'lhpn', `${Math.ceil(L.hp)}/${L.max}`);
      set('l-xp', 'lxp', Math.round(L.xp * 1000), (el, x) => { el.style.width = `${x / 10}%`; });
      show('l-xpg', 'lxpgs', L.xpGain);
      text('l-xpg', 'lxpg', L.xpGain ? `+${L.xpGain}` : '');
      set('portrait', 'portrait', `${L.species}:${L.shiny}:${A.version}`, (el) => {
        const c = el.getContext('2d');
        c.clearRect(0, 0, el.width, el.height);
        A.drawSheet(c, A.creature(L.species, L.shiny), 0, 2, 0, 44, 38);
      });
    }

    text('zone', 'zone', v.zone || '');
    show('zone', 'zones', v.mode === 'explore');
    show('foe', 'foes', !!v.foe);
    if (v.foe) {
      const F = v.foe;
      text('f-name', 'fn', F.name);
      gender('f-g', 'fg', F.g);
      status('f-st', 'fst', F.st);
      text('f-lv', 'flv', String(F.lv));
      const r = F.max ? F.hp / F.max : 0;
      set('f-hp', 'fhp', `${Math.round(r * 1000)}`, (el) => { el.style.width = `${(r * 100).toFixed(1)}%`; el.style.background = grad(r); });
    }

    const D = v.dialog;
    if (D) {
      set('dlg', 'dk', D.kind || 'info', (el, x) => { el.className = x; });
      set('d-title', 'dt', D.title, (el, x) => { el.innerHTML = x; });
      show('d-sub', 'dss', D.sub);
      text('d-sub', 'ds', D.sub || '');
      show('d-ask', 'das', D.ask);
      show('d-more', 'dm', D.more);
      if (D.ask) {
        text('d-q', 'dq', D.ask.q);
        set('d-tm', 'dtm', Math.round(D.ask.frac * 24), (el, x) => { el.style.width = `${(x / 24) * 100}%`; }); // 24 degraus, como no design
        text('d-secs', 'dsec', `${D.ask.left}s`);
      }
    }

    text('p-coins', 'pc', fmt(v.coins));
    text('p-caps', 'pk', fmt(v.caps));
    set('b-yes', 'hy', v.hot === 'askYes', (el, x) => el.classList.toggle('hot', x));
    set('b-no', 'hn', v.hot === 'askNo', (el, x) => el.classList.toggle('hot', x));
  }

  /** Retângulo da cena (onde os bichos andam), em px da janela. */
  const sceneRect = () => (els.scene ? els.scene.getBoundingClientRect() : null);

  /** Alvo de clique (data-hit) num ponto, ou null. */
  function hit(x, y) {
    const el = document.elementFromPoint(x, y);
    const h = el && el.closest && el.closest('[data-hit]');
    return h && ui.contains(h) && h.offsetParent !== null ? h.dataset.hit : null;
  }

  root.StripUI = { init, update, sceneRect, hit, icons, esc };
})(typeof window !== 'undefined' ? window : globalThis);
