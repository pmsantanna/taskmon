// Camada HTML da faixa B2 (design "Taskmon · interface retrô", Layout B): botões,
// card da direita (bichos da área / ovo / hoje), etiqueta de HP do selvagem, balões, pergunta de
// captura e o modo recolhido. Chão e bichos ficam no canvas (strip.js).
// Tudo em px do design (800×200); o #ui é ampliado com zoom = altura da janela / 200.
// update(view) só mexe no DOM quando algo muda.

(function (root) {
  'use strict';
  const A = root.Assets;

  const svg = (w, vb, d, extra = '') => `<svg width="${w[0]}" height="${w[1]}" viewBox="${vb}" shape-rendering="crispEdges" fill="currentColor" fill-rule="evenodd" aria-hidden="true" ${extra}><path d="${d}"/></svg>`;
  const ICON = {
    down: svg([14, 14], '0 0 7 7', 'M0 2h1v1h1v1h1v1h1V4h1V3h1V2h1v1H6v1H5v1H4v1H3V5H2V4H1V3H0z'),
    up: svg([12, 12], '0 0 7 7', 'M3 1h1v1h1v1h1v1h1v1H6V4H5V3H4V2H3v1H2v1H1v1H0V4h1V3h1V2h1z'),
    grid: svg([16, 16], '0 0 8 8', 'M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM5 5h3v3H5z'),
    bag: svg([16, 16], '0 0 10 10', 'M3 0h4v1H3zM2 1h1v2H2zM7 1h1v2H7zM1 3h8v7H1zM4 5h2v2H4z'),
    right: svg([6, 10], '0 0 3 5', 'M0 0h1v1h1v1h1v1H2v1H1v1H0z'),
    left: svg([6, 10], '0 0 3 5', 'M2 0h1v5H2V4H1V3H0V2h1V1h1z'),
    dex: svg([16, 16], '0 0 10 10', 'M0 1h10v8H0zM1 2h3v6H1zM6 2h3v6H6z', 'style="color:#ead9b0"'),
    clock: svg([16, 16], '0 0 8 8', 'M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1zM2 1v1H1v4h1v1h4V6h1V2H6V1zM3 2h1v2h2v1H3z', 'style="color:#ead9b0"'),
  };
  const EGG = '../assets/b/ovo.png';

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const hpColor = (r) => (r < 0.25 ? '#c0402e' : r < 0.5 ? '#e0a040' : '#6f9a4a');

  let ui, els = {}, last = {}, capIcon = '';

  function init(parent) {
    ui = document.createElement('div');
    ui.id = 'ui';
    ui.innerHTML = `
      <div id="full">
        <div id="field">
          <div id="tag" class="hide"><div class="main"><div class="row ss"><span id="t-name" style="color:#ead9b0"></span><span id="t-lv" style="color:#e0a040"></span></div><div class="bar5"><i id="t-hp"></i></div></div><div class="types ss" id="t-types"></div></div>
          <div id="ltypes" class="types ss hide"></div>
          <div id="bubbles"></div>
          <div id="toast" class="bubble wide hide"><span id="ts-t"></span><small id="ts-s"></small></div>
          <div id="prompt" class="hide" role="group">
            <div style="display:flex;align-items:baseline;gap:6px"><span class="q" id="p-q"></span><span class="who ss" id="p-who"></span></div>
            <div style="display:flex;gap:6px"><div class="yn yes ss" data-hit="askYes">SIM</div><div class="yn no ss" data-hit="askNo">NÃO</div></div>
            <div class="tm"><i id="p-tm"></i></div>
            <span class="tail" id="p-tail"></span>
          </div>
        </div>
        <div id="tools">
          <div class="tool" data-hit="collapse" title="Recolher">${ICON.down}</div>
          <div class="tool" data-hit="menu:panels" title="Painéis">${ICON.grid}</div>
          <div class="tool" data-hit="menu:bag" title="Mochila">${ICON.bag}</div>
        </div>
        <section id="card">
          <div id="card-close" data-hit="card:close" title="Recolher card">${ICON.right}</div>
          <div id="card-body" data-hit="card:next" title="Trocar card (bichos · ovo · hoje)"></div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="capico"></span><span class="big13 ss sh" id="c-caps"></span>
            <div class="auto ss" data-hit="auto" id="c-auto" title="Captura automática"></div>
          </div>
        </section>
        <section id="card-mini">
          <div class="cbtn" data-hit="card:open" title="Expandir card">${ICON.left}</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><span id="cm-ico"></span><span class="ss" id="cm-txt" style="font-size:9px;color:#ead9b0;line-height:1"></span></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:3px"><span class="capico sm"></span><span class="ss" id="cm-caps" style="font-size:8px;line-height:1"></span></div>
          <div data-hit="auto" id="cm-auto" style="width:24px;height:14px;box-sizing:border-box;border:2px solid #0a0c0e"></div>
        </section>
      </div>
      <div id="mini" data-hit="hud" title="Equipe">
        <div class="gnd" id="m-gnd"></div>
        <div style="width:34px;height:30px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center"><canvas id="m-portrait" class="px" width="32" height="24"></canvas></div>
        <div style="width:64px;flex-shrink:0;display:flex;flex-direction:column;gap:4px"><span class="ss" id="m-name" style="font-size:8px;color:#ead9b0;line-height:1;white-space:nowrap;overflow:hidden"></span><div class="bar4"><i id="m-hp"></i></div></div>
        <span id="mini-txt" class="ss" role="status"></span>
        <span class="seeds ss"><span class="capico sm"></span><span id="m-caps"></span></span>
        <div class="exp" data-hit="expand" title="Expandir">${ICON.up}</div>
      </div>
      <div id="starter" data-hit="hud">Clique aqui pra escolher seu parceiro!</div>`;
    parent.appendChild(ui);
    ui.querySelectorAll('[id]').forEach((el) => { els[el.id] = el; });
    els.ui = ui;
    icons();
    return ui;
  }

  /** Ícone da cápsula (PNG da pasta de sprites ou pixel art embutida). */
  function icons() {
    const cap = A.ui('capsule');
    capIcon = cap ? cap.img.src : A.sheetUrl(A.item('capsula'));
    ui.querySelectorAll('.capico').forEach((el) => {
      const sm = el.classList.contains('sm');
      el.innerHTML = `<img class="px" src="${capIcon}" width="${sm ? 8 : 12}" height="${sm ? 10 : 15}" alt="Cápsulas">`;
    });
    last.portrait = last.mportrait = last.area = null; // redesenha (pode ter sprite novo)
  }

  const set = (id, key, value, fn) => {
    if (last[key] === value) return;
    last[key] = value;
    fn(els[id], value);
  };
  const text = (id, key, v) => set(id, key, v, (el, x) => { el.textContent = x; });
  const show = (id, key, on) => set(id, key, !!on, (el, x) => el.classList.toggle('hide', !x));
  const bar = (id, key, r, color) => set(id, key, `${Math.round(r * 1000)}:${color}`, (el) => { el.style.width = `${(r * 100).toFixed(1)}%`; el.style.background = color; });

  function drawSprite(canvas, species, shiny, w, h, opts = {}) {
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    if (opts.dark) { c.filter = 'brightness(0)'; c.globalAlpha = 0.55; }
    A.drawSheet(c, A.creature(species, shiny), 0, (canvas.width - w) / 2, canvas.height - h, w, h);
    c.restore();
  }

  // ---------- partes ----------
  function mini(v) {
    const L = v.lead;
    text('m-name', 'mn', L.name.toUpperCase());
    bar('m-hp', 'mhp', L.max ? L.hp / L.max : 0, '#6f9a4a');
    set('m-portrait', 'mportrait', `${L.species}:${L.shiny}:${A.version}`, (el) => drawSprite(el, L.species, L.shiny, 32, 24));
    set('m-portrait', 'mdy', v.mini.dy, (el, x) => { el.style.transform = `translateY(${x}px)`; });
    text('mini-txt', 'mt', v.mini.text);
    set('mini-txt', 'mc', v.mini.color, (el, x) => { el.style.color = x; });
    set('mini', 'mb', v.mini.alert ? '#c0402e' : '#1c2030', (el, x) => el.style.setProperty('--mb', x));
    set('m-gnd', 'mg', v.mini.gx, (el, x) => { el.style.backgroundPositionX = `${x}px`; });
    text('m-caps', 'mcaps', fmt(v.caps));
  }

  function cardBody(v) {
    if (v.card === 'ovo') {
      const E = v.egg;
      if (!E) {
        return `<div style="display:flex;flex-direction:column;gap:7px">
          <div class="row"><span class="k9 ss">OVO</span><span class="v9 ss">${v.eggs}/${v.eggsMax}</span></div>
          <div style="display:flex;align-items:center;gap:8px"><div class="egg-box" style="opacity:.45"><img class="px" src="${EGG}" width="48" height="56" alt="" style="filter:grayscale(1)"></div>
          <span style="font-size:11px;line-height:1.15;color:#a8b0a8">${esc(v.daycareHint)}</span></div></div>`;
      }
      return `<div style="display:flex;flex-direction:column;gap:7px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="egg-box"><img class="px" id="egg-img" src="${EGG}" width="48" height="56" alt="Ovo chocando"></div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <span class="k9 ss">OVO${v.eggs > 1 ? ` <span style="color:#e0a040">×${v.eggs}</span>` : ''}</span>
            <span class="ss" style="font-size:8px;color:#a8b0a8;line-height:1">FALTAM</span>
            <span class="ss sh" style="font-size:14px;color:#f2ecd8;line-height:1">${fmt(E.left)}</span>
            <span class="ss" style="font-size:8px;color:#a8b0a8;line-height:1">PASSOS</span>
          </div>
        </div>
        <div class="eggbar" role="img" aria-label="Ovo ${E.pct}% chocado"><i style="width:${E.pct}%"></i></div></div>`;
    }
    if (v.card === 'hoje') {
      const T = v.today;
      return `<div style="display:flex;flex-direction:column;gap:6px">
        <div class="row"><span class="k9 ss">HOJE</span><span class="ss" style="font-size:9px;color:#e0a040;line-height:1">${esc(T.active)} ATIVO</span></div>
        <dl class="today ss"><dt>CAPTURAS</dt><dd>${fmt(T.caught)}</dd><dt>EXP</dt><dd>+${fmt(T.xp)}</dd><dt>ITENS</dt><dd>${fmt(T.items)}</dd></dl></div>`;
    }
    const Ar = v.area;
    return `<div style="display:flex;flex-direction:column;gap:7px">
      <div class="row"><span class="k9 ss">NA ÁREA</span><span class="v9 ss"><span class="dot"></span>NV ${Ar.range}</span></div>
      <div class="mons">${Ar.mons.map((m, i) => `<span class="mon${m.state === 'unk' ? ' unk' : ''}" title="${m.state === 'unk' ? '???' : esc(m.name)}"><canvas class="px" data-mon="${i}" width="24" height="24" style="margin:0 -2px"></canvas>${m.state === 'caught' ? '<span class="got"></span>' : ''}</span>`).join('')}</div>
      <div class="row"><span class="ss" style="font-size:10px;color:#ead9b0;line-height:1">DEX ${Ar.caught}/${Ar.total}</span><span class="ss" style="font-size:9px;color:#a8b0a8;line-height:1;white-space:nowrap;overflow:hidden">${esc(Ar.zone)}</span></div></div>`;
  }

  function card(v) {
    const key = v.card === 'ovo' ? `ovo:${v.egg ? `${v.egg.left}:${v.egg.pct}` : v.daycareHint}:${v.eggs}`
      : v.card === 'hoje' ? `hoje:${JSON.stringify(v.today)}`
      : `bichos:${JSON.stringify(v.area)}:${A.version}`;
    set('card-body', 'area', key, (el) => {
      el.innerHTML = cardBody(v);
      el.querySelectorAll('canvas[data-mon]').forEach((c) => {
        const m = v.area.mons[c.dataset.mon];
        if (m.state !== 'unk' || m.seen) drawSprite(c, m.species, false, 24, 24, { dark: m.state === 'unk' });
      });
    });
    const egg = els['card-body'].querySelector('#egg-img');
    if (egg) egg.style.transform = `translateX(${v.eggDx}px)`;
    text('c-caps', 'ccaps', fmt(v.caps));
    set('c-auto', 'cauto', v.auto, (el, on) => { el.textContent = on ? 'AUTO ON' : 'AUTO OFF'; el.className = `auto ss ${on ? 'on' : 'off'}`; });
    set('cm-auto', 'cmauto', v.auto, (el, on) => { el.style.background = on ? '#6f9a4a' : '#262c32'; el.title = on ? 'AUTO ON' : 'AUTO OFF'; });
    text('cm-caps', 'cmcaps', fmt(v.caps));
    set('cm-ico', 'cmico', v.card, (el, c) => { el.innerHTML = c === 'ovo' ? `<img class="px" src="${EGG}" width="24" height="28" alt="">` : c === 'hoje' ? ICON.clock : ICON.dex; });
    text('cm-txt', 'cmtxt', v.card === 'ovo' ? (v.egg ? `${v.egg.pct}%` : '—') : v.card === 'hoje' ? `${v.today.caught}x` : `${v.area.caught}/${v.area.total}`);
  }

  /** Balões (um por "dono"): cria/remove conforme a lista e prende dentro do campo. */
  function bubbles(list, fieldW) {
    const host = els.bubbles;
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let el = host.querySelector(`[data-id="${b.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble ss';
        el.dataset.id = b.id;
        el.innerHTML = '<span class="t"></span><span class="tail"></span>';
        host.appendChild(el);
      }
      if (el.dataset.text !== b.text) { el.dataset.text = b.text; el.firstChild.textContent = b.text; el.dataset.w = ''; }
      el.style.setProperty('--acc', b.accent);
      el.style.setProperty('--col', b.color);
      const w = Number(el.dataset.w) || (el.dataset.w = el.offsetWidth) || 40;
      const left = Math.round(Math.max(2, Math.min(fieldW - w - 2, b.x - w / 2)));
      el.style.left = `${left}px`;
      el.style.top = `${Math.round(b.y)}px`;
      el.lastChild.style.left = `${Math.round(Math.max(4, Math.min(w - 14, b.x - left - 5)))}px`;
    }
    for (const el of [...host.children]) if (!seen.has(el.dataset.id)) el.remove();
  }

  /**
   * view = { width, height, starter, collapsed, cardClosed, card, fieldW, lead, tag, bubbles, prompt,
   *          toast, area, egg, eggs, eggsMax, daycareHint, today, caps, auto, mini, hot }
   */
  function update(v) {
    if (!ui) return;
    const k = v.height / 200;
    set('ui', 'zoom', k, (el, x) => { el.style.zoom = x; });
    const dw = Math.round(v.width / k);
    set('ui', 'w', dw, (el, x) => { el.style.width = `${x}px`; el.style.height = '200px'; });

    const mode = v.starter ? 'starter' : v.collapsed ? 'mini' : 'full';
    set('ui', 'mode', mode, (el, m) => {
      els.full.classList.toggle('hide', m !== 'full');
      els.mini.classList.toggle('hide', m !== 'mini');
      els.starter.classList.toggle('hide', m !== 'starter');
    });
    set('mini', 'mx', Math.round((dw - 300) / 2), (el, x) => { el.style.left = `${x}px`; });
    if (mode === 'starter') return;

    if (mode === 'mini') { mini(v); hot(v.hot); return; }

    set('field', 'fw', v.fieldW, (el, x) => { el.style.width = `${x}px`; });
    set('field', 'fl', v.fieldX0 || 0, (el, x) => { el.style.left = `${x}px`; });
    set('ui', 'mir', !!v.mirror, (el, x) => el.classList.toggle('mirror', x));
    show('card', 'cardo', !v.cardClosed);
    show('card-mini', 'cardc', v.cardClosed);
    card(v);

    show('tag', 'tags', v.tag);
    if (v.tag) {
      const T = v.tag;
      set('tag', 'tagpos', `${T.x},${T.y}`, (el) => { el.style.left = `${T.x}px`; el.style.top = `${T.y}px`; });
      text('t-name', 'tn', T.name);
      text('t-lv', 'tlv', `NV${T.lv}`);
      bar('t-hp', 'thp', T.r, hpColor(T.r));
      set('t-types', 'ttypes', T.types.map((t) => t.label).join('/'), (el) => {
        el.innerHTML = T.types.map((t) => `<span class="tchip" style="--b:${t.base};--l:${t.light};--d:${t.dark}">${esc(t.label)}</span>`).join('');
      });
    }

    show('ltypes', 'lts', v.leadTypes);
    if (v.leadTypes) {
      const LT = v.leadTypes;
      // ancorada na ponta da frente das barrinhas: cresce pra trás (pra esquerda quando a frente é a direita)
      set('ltypes', 'ltpos', `${LT.x},${LT.y},${LT.front}`, (el) => {
        el.style.left = `${LT.x}px`; el.style.top = `${LT.y}px`;
        el.style.transform = LT.front === 'right' ? 'translateX(-100%)' : 'none';
      });
      const key = `${LT.lv}|${LT.st ? LT.st.short : ''}|${LT.types.map((t) => t.label).join('/')}`;
      set('ltypes', 'ltt', key, (el) => {
        el.innerHTML = `<span class="lv">NV${LT.lv}</span>${LT.st ? `<span class="stc" style="background:${LT.st.color}">${esc(LT.st.short)}</span>` : ''}`
          + LT.types.map((t) => `<span class="tchip" style="--b:${t.base};--l:${t.light};--d:${t.dark}">${esc(t.label)}</span>`).join('');
      });
    }
    bubbles(v.bubbles, v.fieldW);

    show('prompt', 'ps', v.prompt);
    if (v.prompt) {
      const P = v.prompt;
      text('p-q', 'pq', P.q);
      text('p-who', 'pwho', P.who);
      const pw = els.prompt.offsetWidth || 156;
      const left = Math.round(Math.max(2, Math.min(v.fieldW - pw - 2, P.x - 96)));
      set('prompt', 'ppos', `${left},${P.y}`, (el) => { el.style.left = `${left}px`; el.style.top = `${P.y}px`; });
      set('p-tail', 'ptail', `${P.x - left - 5}:${pw}`, (el) => { el.style.left = `${Math.max(6, Math.min(pw - 16, P.x - left - 5))}px`; });
      set('p-tm', 'ptm', Math.round(P.frac * 100), (el, x) => { el.style.width = `${x}%`; });
    }

    show('toast', 'tos', v.toast && !v.prompt);
    if (v.toast) {
      const T = v.toast;
      text('ts-t', 'tst', T.text);
      text('ts-s', 'tss', T.sub || '');
      show('ts-s', 'tsss', T.sub);
      set('toast', 'tsk', T.kind, (el, kd) => el.style.setProperty('--acc', kd === 'success' ? '#e0a040' : kd === 'alert' ? '#c0402e' : '#6a6f66'));
      set('toast', 'tsmax', v.fieldW, (el, x) => { el.style.maxWidth = `${Math.min(360, x - 8)}px`; });
      const el = els.toast;
      const w = el.offsetWidth;
      set('toast', 'tspos', `${w}:${v.fieldW}:${T.x}`, () => { el.style.left = `${Math.round(Math.max(4, Math.min(v.fieldW - w - 4, T.x - w / 2)))}px`; el.style.top = '6px'; });
    }
    hot(v.hot);
  }

  function hot(h) {
    if (last.hot === h) return;
    if (last.hotEl) last.hotEl.classList.remove('hot');
    last.hot = h;
    last.hotEl = h ? ui.querySelector(`[data-hit="${h}"]`) : null;
    if (last.hotEl) last.hotEl.classList.add('hot');
  }

  /** Alvo de clique (data-hit) num ponto, ou null. */
  function hit(x, y) {
    const el = document.elementFromPoint(x, y);
    const h = el && el.closest && el.closest('[data-hit]');
    return h && ui.contains(h) && h.offsetParent !== null ? h.dataset.hit : null;
  }

  root.StripUI = { init, update, hit, icons, esc };
})(typeof window !== 'undefined' ? window : globalThis);
