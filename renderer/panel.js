// Painel de gerenciamento: equipe, caixa, zonas, loja, bestiário e ajustes.
// Não guarda estado do jogo: recebe cópias da faixa e devolve comandos.

(async () => {
  'use strict';
  const G = window.Game;
  const A = window.Assets;
  const bridge = window.bridge;
  const $ = (id) => document.getElementById(id);
  const app = $('app'), hero = $('hero'), tabsEl = $('tabs');

  let state = null;
  let lastKey = '';
  let heroKey = '';

  const TABS = [
    { id: 'team', label: 'Equipe' },
    { id: 'box', label: 'Caixa' },
    { id: 'zones', label: 'Zonas' },
    { id: 'shop', label: 'Loja' },
    { id: 'dex', label: 'Bestiário' },
    { id: 'settings', label: 'Ajustes' },
  ];
  let tab = 'team';
  try { tab = localStorage.getItem('taskmon-tab') || 'team'; } catch { /* sem storage */ }

  const send = (cmd) => bridge.sendCommand(cmd);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const zoneOf = (id) => G.ZONES.find((z) => z.id === id) || G.ZONES[0];
  const nameOf = (c) => G.SPECIES[c.species].name + (c.shiny ? ' ✨' : '');

  // ---------- Sprites em HTML ----------
  /** Folha de sprite como <span> com animação CSS em degraus (funciona com PNG customizado ou pixel art). */
  function spr(species, { size = 48, shiny = false, silhouette = false, flip = false, item = false } = {}) {
    const sheet = item ? A.item(species) : A.creature(species, shiny);
    const k = size / Math.max(sheet.fw, sheet.fh) * (item ? 1 : sheet.size);
    const w = Math.round(sheet.fw * k), h = Math.round(sheet.fh * k);
    const url = silhouette ? A.silhouetteUrl(species) : A.sheetUrl(sheet);
    const n = silhouette ? 1 : sheet.frames;
    const anim = n > 1 ? ' anim' : '';
    const style = `width:${w}px;height:${h}px;--n:${n};--dur:${(n / sheet.fps).toFixed(3)}s;background-image:url(${url})`;
    return `<span class="spr-box" style="width:${size}px;height:${size}px"><i class="spr${anim}${flip ? ' flip' : ''}" style="${style}"></i></span>`;
  }

  const typeBadge = (t) => `<span class="type" style="background:${G.TYPE_COLOR[t]}">${G.TYPE_LABEL[t]}</span>`;
  const bar = (ratio, color) => `<div class="bar"><i style="width:${Math.round(G.clamp(ratio, 0, 1) * 100)}%;background:${color}"></i></div>`;

  function uiIcon(name, fallback) {
    const f = A.ui(name);
    return f ? `<img class="ico" src="${f.img.src}" alt="">` : fallback;
  }

  // ---------- Tema (molduras/texturas da pasta ui/ e tiles das zonas) ----------
  function nineCss(name, selector) {
    const f = A.ui(name);
    if (!f) return '';
    const [t, r, b, l] = f.slice;
    const s = f.scale;
    return `${selector} {
      border-style: solid; border-color: transparent; border-radius: 0; background: none;
      border-width: ${t * s}px ${r * s}px ${b * s}px ${l * s}px;
      border-image: url(${f.img.src}) ${t} ${r} ${b} ${l} fill / ${t * s}px ${r * s}px ${b * s}px ${l * s}px ${f.cfg.repeat || 'stretch'};
      image-rendering: pixelated;
    }`;
  }

  function applyTheme() {
    let css = '';
    css += nineCss('card', '.card, .hero');
    css += nineCss('button', 'button.btn');
    const bgTex = A.ui('background');
    if (bgTex) {
      css += `body { background-image: url(${bgTex.img.src}); background-size: ${bgTex.img.width * bgTex.scale}px ${bgTex.img.height * bgTex.scale}px; image-rendering: pixelated; }`;
    }
    $('theme').textContent = css;
  }

  function zoneStyle(zoneId) {
    const z = zoneOf(zoneId);
    const parts = [`--zone:${z.color}`];
    const bg = A.tile(zoneId, 'bg');
    const gr = A.tile(zoneId, 'ground');
    if (bg) parts.push(`--stage-bg:url(${bg.img.src})`);
    if (gr) parts.push(`--ground-bg:url(${gr.img.src})`, '--ground-op:1', `--ground-h:${Math.min(48, gr.img.height * 2)}px`);
    return parts.join(';');
  }

  function zonePreview(zoneId) {
    const z = zoneOf(zoneId);
    const gr = A.tile(zoneId, 'ground');
    const bg = A.tile(zoneId, 'bg');
    const layers = [gr, bg].filter(Boolean).map((t) => `url(${t.img.src})`);
    if (!layers.length) return `background:linear-gradient(180deg, color-mix(in srgb, ${z.color} 35%, #111), ${z.color})`;
    return `background-image:${layers.join(',')};background-color:${z.color}`;
  }

  // ---------- Herói (líder + batalha atual) ----------
  function renderHero() {
    if (!state || !state.starterChosen) { hero.innerHTML = ''; heroKey = ''; return; }
    const lead = G.getLead(state);
    if (!lead) return;
    const b = state.battle;
    // A parte "estrutural" só é refeita quando muda (não reinicia as animações a cada segundo).
    const key = [lead.uid, lead.species, lead.shiny, state.zone, b ? `${b.species}${b.shiny}${b.level}` : '-', A.version].join('|');
    if (key !== heroKey) {
      heroKey = key;
      const sp = G.SPECIES[lead.species];
      hero.innerHTML = `
        <div class="hero">
          <div class="stage" style="${zoneStyle(state.zone)}">
            <span class="zone-name">${esc(zoneOf(state.zone).name)}</span>
            ${spr(lead.species, { size: 72, shiny: lead.shiny })}
            ${b ? `<span class="vs">VS</span>
              <div class="wild"><small id="h-wild"></small>${spr(b.species, { size: 64, shiny: b.shiny, flip: true })}</div>` : '<span></span>'}
          </div>
          <div class="info">
            <div class="row1"><b>${esc(nameOf(lead))}</b><span class="lv" id="h-lv"></span>${typeBadge(sp.type)}<span class="grow"></span><span class="nums" id="h-nums"></span></div>
            <div class="bars"><div class="bar"><i id="h-hp"></i></div><div class="bar"><i id="h-xp" style="background:var(--xp)"></i></div></div>
            <div class="status" id="h-status"></div>
          </div>
        </div>`;
    }
    // Partes "vivas": atualizam a cada sync.
    const max = G.maxHp(lead), hpR = lead.hp / max, need = G.xpToNext(lead.level);
    $('h-lv').textContent = `Nv ${lead.level}`;
    $('h-nums').textContent = `HP ${Math.round(lead.hp)}/${max} · XP ${lead.xp}/${need}`;
    const hp = $('h-hp');
    hp.style.width = `${Math.round(G.clamp(hpR, 0, 1) * 100)}%`;
    hp.style.background = hpR > 0.5 ? 'var(--hp)' : hpR > 0.2 ? '#facc15' : 'var(--danger)';
    $('h-xp').style.width = `${Math.round(G.clamp(lead.xp / need, 0, 1) * 100)}%`;
    if (b && $('h-wild')) $('h-wild').textContent = `${G.SPECIES[b.species].name} nv ${b.level} · ${b.hp}/${b.max}`;
    const st = $('h-status');
    if (state.resting) st.innerHTML = '<b>Descansando…</b> recupera o HP em alguns segundos.';
    else if (b) st.innerHTML = `Batalhando contra <b>${esc(G.SPECIES[b.species].name)}${b.shiny ? ' ✨' : ''}</b>. Clique nele na barra pra lançar uma cápsula!`;
    else st.innerHTML = `Explorando <b>${esc(zoneOf(state.zone).name)}</b>…`;
  }

  // ---------- Abas ----------
  function renderTabs() {
    if (!state.starterChosen) { tabsEl.hidden = true; return; }
    tabsEl.hidden = false;
    const counts = { team: `${state.team.length}/${G.TEAM_MAX}`, box: state.box.length || '' };
    tabsEl.innerHTML = TABS.map((t) =>
      `<button class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label}${counts[t.id] !== undefined && counts[t.id] !== '' ? `<span class="n">${counts[t.id]}</span>` : ''}</button>`,
    ).join('');
  }

  function monCard(c, lead) {
    const sp = G.SPECIES[c.species];
    const max = G.maxHp(c), need = G.xpToNext(c.level);
    const isLead = c.uid === lead?.uid;
    const evo = sp.evolvesTo ? `evolui no ${sp.evolveLevel}` : '';
    return `
      <div class="mon ${isLead ? 'lead' : ''}">
        <div class="portrait">${spr(c.species, { shiny: c.shiny, size: 48 })}</div>
        <div>
          <div class="nm">${esc(nameOf(c))} ${isLead ? '<span class="tag">LÍDER</span>' : ''}</div>
          <div class="sub">Nv ${c.level} ${typeBadge(sp.type)} <span>${evo}</span></div>
          <div class="bars">${bar(c.hp / max, 'var(--hp)')}${bar(c.xp / need, 'var(--xp)')}</div>
          <div class="nums">HP ${Math.round(c.hp)}/${max} · XP ${c.xp}/${need}</div>
        </div>
        <div class="actions">
          ${isLead ? '' : `<button class="btn primary" data-cmd="setLead" data-uid="${c.uid}">★ Líder</button>`}
          <button class="btn" data-cmd="toBox" data-uid="${c.uid}" ${state.team.length <= 1 ? 'disabled' : ''}>→ Caixa</button>
        </div>
      </div>`;
  }

  const views = {
    team() {
      const lead = G.getLead(state);
      return `<div class="card"><h2>Equipe <span>${state.team.length}/${G.TEAM_MAX}</span></h2>${state.team.map((c) => monCard(c, lead)).join('')}</div>`;
    },

    box() {
      if (!state.box.length) return '<div class="card empty">A caixa está vazia.<br><span class="muted">Quando a equipe enche, as capturas vêm pra cá.</span></div>';
      const full = state.team.length >= G.TEAM_MAX;
      return `<div class="card"><h2>Caixa <span>${state.box.length}</span></h2><div class="box">
        ${state.box.map((c) => `
          <div class="box-item">
            ${spr(c.species, { shiny: c.shiny, size: 48 })}
            <span class="nm">${esc(nameOf(c))}</span>
            <span class="muted">Nv ${c.level} · ${G.TYPE_LABEL[G.SPECIES[c.species].type]}</span>
            <button class="btn" data-cmd="toTeam" data-uid="${c.uid}" ${full ? 'disabled title="Equipe cheia"' : ''}>→ Equipe</button>
          </div>`).join('')}
      </div></div>`;
    },

    zones() {
      const open = G.unlockedZones(state).map((z) => z.id);
      return `<div class="card"><h2>Zonas</h2><div class="zones">
        ${G.ZONES.map((z) => {
          const ok = open.includes(z.id), here = state.zone === z.id;
          return `<button class="zone ${here ? 'on' : ''}" data-cmd="zone" data-id="${z.id}" ${ok ? '' : 'disabled'} style="--zone:${z.color}">
            <div class="preview" style="${zonePreview(z.id)}"></div>
            ${here ? '<span class="tag here">AQUI</span>' : ''}
            <div class="zt"><b>${esc(z.name)}</b><span class="muted">${ok ? `nv ${z.levels[0]}–${z.levels[1]}` : `🔒 líder nv ${z.unlock}`}</span></div>
          </button>`;
        }).join('')}
      </div></div>`;
    },

    shop() {
      return `<div class="card"><h2>Loja <span>${state.coins} moedas</span></h2><div class="shop">
        ${Object.entries(G.SHOP).map(([id, it]) => `
          <div class="row">
            ${spr(id, { item: true, size: 32 })}
            <span class="label"><b>${esc(it.name)}</b><span class="muted">${it.price} 🪙 · ${it.mult}× chance · você tem ${state.items[id] || 0}</span></span>
            <button class="btn" data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
            <button class="btn" data-cmd="buy" data-item="${id}" data-qty="5" ${state.coins < it.price * 5 ? 'disabled' : ''}>+5</button>
          </div>`).join('')}
      </div></div>`;
    },

    dex() {
      const caught = G.SPECIES_ORDER.filter((id) => state.dex.caught[id]).length;
      return `<div class="card"><h2>Bestiário <span>${caught}/${G.SPECIES_ORDER.length}</span></h2>
        <div class="progress"><i style="width:${(caught / G.SPECIES_ORDER.length) * 100}%"></i></div>
        <div class="dex">
          ${G.SPECIES_ORDER.map((id, i) => {
            const c = state.dex.caught[id], s = state.dex.seen[id];
            return `<div class="${c ? 'caught' : s ? 'seen' : ''}" title="${s ? esc(G.SPECIES[id].name) : '???'}">
              <span class="no">#${String(i + 1).padStart(2, '0')}</span>
              ${spr(id, { size: 40, silhouette: !s })}
              <span>${s ? esc(G.SPECIES[id].name) : '???'}${c ? ' ◓' : ''}</span>
            </div>`;
          }).join('')}
        </div></div>`;
    },

    settings() {
      const custom = A.list();
      return `
        <div class="card"><h2>Jogo</h2>
          <div class="setting">
            <div>Captura automática<div class="muted">Lança cápsulas sozinho em espécies novas e brilhantes.</div></div>
            <label class="switch"><input type="checkbox" id="auto" ${state.settings.autoCatch ? 'checked' : ''}><span></span></label>
          </div>
          <div class="setting">
            <div>Recomeçar<div class="muted">Apaga equipe, moedas e bestiário.</div></div>
            <button class="btn danger" data-cmd="reset">Recomeçar do zero</button>
          </div>
        </div>

        <div class="card"><h2>Sprites e tiles <span>${custom.length} arquivo(s)</span></h2>
          <p class="muted" style="margin:0 0 8px">Coloque PNGs na pasta de sprites e eles substituem a pixel art na hora.
            Ex.: <code>creatures/pavio.png</code> (quadros lado a lado), <code>tiles/campina_ground.png</code> (chão infinito),
            <code>ui/hud.png</code> (moldura 9-slice). Detalhes no <code>LEIA-ME.txt</code> da pasta.</p>
          <div class="btn-row">
            <button class="btn primary" data-cmd="openSprites">Abrir pasta de sprites</button>
            <button class="btn" data-cmd="reloadSprites">Recarregar</button>
          </div>
          ${custom.length ? `<ul class="files">${custom.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        </div>

        <div class="card"><h2>Estatísticas</h2>
          <div class="stats">
            <div><b>${state.stats.wins}</b><span>vitórias</span></div>
            <div><b>${state.stats.battles}</b><span>batalhas</span></div>
            <div><b>${state.stats.caught}</b><span>capturas</span></div>
          </div>
          <p class="muted" style="margin:10px 0 0">Na barra: clique no HUD ou no seu bicho pra abrir este painel, e no selvagem pra lançar uma cápsula.
            Pelo ícone da bandeja dá pra mover a faixa, mudar a largura e o monitor.</p>
        </div>`;
    },
  };

  function renderStarters() {
    app.innerHTML = `
      <div class="card">
        <h2>Escolha seu parceiro</h2>
        <p class="muted" style="margin:0 0 12px">Ele vai andar pela sua barra de tarefas, batalhar sozinho e ficar mais forte enquanto você trabalha.</p>
        <div class="starters">
          ${G.STARTERS.map((id) => {
            const sp = G.SPECIES[id];
            return `<div class="starter">
              ${spr(id, { size: 72 })}
              <b>${esc(sp.name)}</b>${typeBadge(sp.type)}
              <button class="btn primary" data-cmd="starter" data-species="${id}">Escolher</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderHeader() {
    $('coins').innerHTML = `${uiIcon('coin', '🪙')} ${state.coins}`;
    $('caps').innerHTML = `${uiIcon('capsule', '◓')} ${state.items.capsula || 0} + ${state.items.super || 0}`;
  }

  function render() {
    renderHeader();
    renderTabs();
    renderHero();
    if (!state.starterChosen) return renderStarters();
    if (!views[tab]) tab = 'team';
    app.innerHTML = views[tab]();
    const auto = $('auto');
    if (auto) auto.addEventListener('change', (e) => send({ type: 'autoCatch', value: e.target.checked }));
  }

  // Redesenha tudo só quando algo "estrutural" muda; o herói atualiza sempre.
  function onState(s) {
    state = s;
    const key = JSON.stringify({
      ...s, battle: null, resting: null, lastSaved: null, v: A.version, tab,
      team: s.team.map((c) => [c.uid, c.species, c.level, c.xp, Math.round(c.hp)]),
    });
    if (key !== lastKey) {
      lastKey = key;
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
    } else {
      renderHero();
    }
  }

  const rerender = () => { lastKey = ''; heroKey = ''; if (state) onState(state); };

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    try { localStorage.setItem('taskmon-tab', tab); } catch { /* sem storage */ }
    rerender();
    window.scrollTo(0, 0);
  });

  app.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    const d = b.dataset;
    switch (d.cmd) {
      case 'starter': send({ type: 'chooseStarter', species: d.species }); break;
      case 'setLead': send({ type: 'setLead', uid: d.uid }); break;
      case 'toBox': send({ type: 'move', uid: d.uid, to: 'box' }); break;
      case 'toTeam': send({ type: 'move', uid: d.uid, to: 'team' }); break;
      case 'zone': send({ type: 'zone', id: d.id }); break;
      case 'buy': send({ type: 'buy', item: d.item, qty: Number(d.qty) }); break;
      case 'openSprites': bridge.openSpritesFolder(); break;
      case 'reloadSprites': bridge.reloadAssets(); break;
      case 'reset':
        if (confirm('Apagar todo o progresso e começar de novo?')) send({ type: 'reset' });
        break;
    }
  });

  A.onChange(() => { applyTheme(); rerender(); });
  await A.load();
  bridge.onState(onState);
  bridge.requestState();
})();
