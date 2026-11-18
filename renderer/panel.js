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
  let editing = null; // uid da criatura com o editor de golpes aberto
  let boxFilter = { species: '', nature: '', natureNot: '', minIv: '', maxIv: '', shiny: '', gender: '' };
  let boxSort = 'recent';
  let selected = new Set();
  const BOX_SHOW_MAX = 240;
  let genesOf = null; // uid da criatura com o quadro de IV/esforço aberto
  let draft = [];     // golpes marcados no editor

  const TABS = [
    { id: 'team', label: 'Equipe' },
    { id: 'box', label: 'Caixa' },
    { id: 'daycare', label: 'Creche' },
    { id: 'zones', label: 'Zonas' },
    { id: 'shop', label: 'Loja' },
    { id: 'tms', label: 'MTs' },
    { id: 'dex', label: 'Bestiário' },

  ];
  let tab = 'team';
  try { tab = localStorage.getItem('taskmon-tab') || 'team'; } catch { /* sem storage */ }

  const send = (cmd) => bridge.sendCommand(cmd);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const zoneOf = (id) => G.ZONES.find((z) => z.id === id) || G.ZONES[0];
  const genderIcon = (c) => (c.gender ? `<span class="g ${c.gender === 'F' ? 'f' : 'm'}">${c.gender === 'F' ? '♀' : '♂'}</span>` : '');
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
  const statusBadge = (st) => (st ? `<span class="st" style="background:${G.STATUS[st].color}" title="${G.STATUS[st].label}">${G.STATUS[st].short}</span>` : '');

  function moveChip(id, c) {
    const m = G.MOVES[id];
    const cat = G.CATEGORY[m.cat];
    const pp = `${c.pp?.[id] ?? m.pp}/${m.pp} PP`;
    const power = m.cat === 'status' ? '—' : m.power;
    return `<button class="move" style="--t:${G.TYPE_COLOR[m.type]}" data-cmd="moveInfo" data-move="${id}" data-uid="${c.uid}">
      <b>${esc(m.name)}</b>
      <span><i style="color:${cat.color}">${cat.icon}</i> ${power} · <em data-pp-of="${c.uid}" data-move="${id}">${pp}</em></span>
    </button>`;
  }

  const catBadge = (cat) => `<span class="cat" style="--c:${G.CATEGORY[cat].color}">${G.CATEGORY[cat].icon} ${G.CATEGORY[cat].label}</span>`;
  const tmOfMove = (id) => Object.keys(G.TMS).find((t) => G.TMS[t].move === id);

  /** Quem aprende o golpe por nível (espécies já vistas; as outras ficam como ???). */
  function learnedBy(id) {
    const out = [];
    for (const sp of G.SPECIES_ORDER) {
      const ls = G.LEARNSETS[sp] || {};
      const lvl = Object.keys(ls).map(Number).sort((a, b) => a - b).find((l) => ls[l].includes(id));
      if (lvl == null) continue;
      // evolução que herda o mesmo nível da forma anterior não precisa aparecer duas vezes
      const prev = G.SPECIES_ORDER.find((o) => G.SPECIES[o].evolvesTo === sp);
      if (prev && (G.LEARNSETS[prev] || {})[lvl]?.includes(id)) continue;
      out.push({ sp, lvl, seen: !!state.dex.seen[sp] });
    }
    return out;
  }

  /** Conteúdo do popup de um golpe: cabeçalho, números, descrição e como aprender. */
  function moveDetails(id, c = null) {
    const m = G.MOVES[id];
    const lines = G.describeMove(id);
    const stat = (label, value) => `<div><span>${label}</span><b>${value}</b></div>`;
    const tm = tmOfMove(id);
    const by = learnedBy(id);
    return `
      <div class="md-head" style="--t:${G.TYPE_COLOR[m.type]}">
        <h3>${esc(m.name)}</h3>
        <div class="md-tags">${typeBadge(m.type)}${catBadge(m.cat)}</div>
      </div>
      <div class="md-stats">
        ${stat('Poder', m.cat === 'status' ? '—' : m.power)}
        ${stat('Precisão', m.acc == null ? 'sempre' : `${m.acc}%`)}
        ${stat('PP', c && c.pp?.[id] != null ? `${c.pp[id]}/${m.pp}` : m.pp)}
        ${stat('Prioridade', m.priority ? `+${m.priority}` : '0')}
      </div>
      <ul class="md-desc">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${by.length || tm ? `<div class="md-learn">
        ${by.length ? `<div><span class="muted">Aprendem por nível:</span> ${by.map((b) => `<span class="lchip">${b.seen ? esc(G.SPECIES[b.sp].name) : '???'} <i>nv ${b.lvl}</i></span>`).join('')}</div>` : ''}
        ${tm ? `<div><span class="muted">Máquina:</span> <button class="lchip link" data-cmd="tmInfo" data-tm="${tm}">${tm.toUpperCase()}${G.hasTm(state, tm) ? ' ✓' : ''}</button></div>` : ''}
      </div>` : ''}`;
  }

  /** Quadro de atributos: valor, IV (avaliação do juiz) e nível de esforço com botão de item. */
  function natureText(c) {
    const n = G.NATURES[c.nature];
    if (!n) return '';
    return n.up ? `${n.name} (+${G.STAT_LABEL[n.up]}, −${G.STAT_LABEL[n.down]})` : `${n.name} (neutra)`;
  }

  function genesBox(c) {
    const st = G.stats(c);
    const nat = G.NATURES[c.nature] || {};
    const rows = G.STAT_KEYS.map((k) => {
      const mark = nat.up === k ? '<i class="up">▲</i>' : nat.down === k ? '<i class="down">▼</i>' : '';
      const iv = c.ivs[k], ef = c.effort[k];
      const item = G.gritFor(ef);
      const have = item ? state.items[item] || 0 : 0;
      const pips = Array.from({ length: G.EFFORT_MAX }, (_, i) => `<i class="${i < ef ? 'on' : ''}"></i>`).join('');
      const rating = G.ivRating(iv);
      return `<div class="gene">
        <span class="gk">${G.STAT_LABEL[k]} ${mark}</span>
        <b class="gv">${st[k]}</b>
        <span class="iv r${iv >= 31 ? 5 : iv >= 30 ? 4 : iv >= 26 ? 3 : iv >= 16 ? 2 : iv >= 1 ? 1 : 0}" title="IV ${iv}/31">${rating}</span>
        <span class="pips" title="Nível de esforço ${ef}/${G.EFFORT_MAX}">${pips}</span>
        ${item
          ? `<button class="btn mini" data-cmd="grit" data-uid="${c.uid}" data-stat="${k}" ${have ? '' : 'disabled'} title="Usar ${esc(G.SHOP[item].name)} (você tem ${have})">${spr(item, { item: true, size: 16 })}+</button>`
          : '<span class="tag">MÁX</span>'}
      </div>`;
    }).join('');
    return `<div class="editor genes">
      <div><b>Natureza:</b> ${esc(natureText(c))}</div>
      <div class="muted">Valor · IV (avaliação) · nível de esforço. Os itens de esforço vêm da loja e de batalhas.</div>
      ${rows}
    </div>`;
  }

  /** Linha do item de segurar: ícone + seletor com os itens da mochila. */
  function heldRow(c) {
    const owned = Object.keys(G.HELD).filter((id) => (state.items[id] || 0) > 0 && id !== c.held);
    const cur = c.held && G.HELD[c.held];
    const opts = [
      `<option value="">${cur ? 'Tirar item' : 'Nenhum item'}</option>`,
      ...(cur ? [`<option value="${c.held}" selected>${esc(cur.name)}</option>`] : []),
      ...owned.map((id) => `<option value="${id}">${esc(G.HELD[id].name)} (${state.items[id]})</option>`),
    ].join('');
    return `<div class="held" title="${cur ? esc(cur.desc) : 'Compre itens de segurar na loja'}">
      ${cur ? spr(c.held, { item: true, size: 20 }) : '<span class="held-empty"></span>'}
      <span class="muted">Segurando</span>
      <select data-hold="${c.uid}" ${!cur && !owned.length ? 'disabled' : ''}>${opts}</select>
      ${cur ? `<span class="muted held-desc">${esc(cur.desc)}</span>` : ''}
    </div>`;
  }

  function moveEditor(c) {
    return `<div class="editor">
      <div class="muted">Escolha até 4 golpes (${draft.length}/4):</div>
      <div class="known">
        ${c.known.map((id) => {
          const on = draft.includes(id);
          const m = G.MOVES[id];
          return `<label class="pick ${on ? 'on' : ''}" style="--t:${G.TYPE_COLOR[m.type]}">
            <input type="checkbox" data-pick="${id}" ${on ? 'checked' : ''} ${!on && draft.length >= 4 ? 'disabled' : ''}>
            <b>${esc(m.name)}</b><span>${G.CATEGORY[m.cat].icon} ${m.cat === 'status' ? '—' : m.power}</span>
            <button class="info" data-cmd="moveInfo" data-move="${id}" data-uid="${c.uid}" title="Detalhes">?</button>
          </label>`;
        }).join('')}
      </div>
      <div class="btn-row">
        <button class="btn primary" data-cmd="saveMoves" data-uid="${c.uid}" ${draft.length ? '' : 'disabled'}>Salvar</button>
        <button class="btn" data-cmd="cancelMoves">Cancelar</button>
      </div>
    </div>`;
  }

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
            <div class="row1"><b>${esc(nameOf(lead))} ${genderIcon(lead)}</b><span class="lv" id="h-lv"></span>${typeBadge(sp.type)}<span id="h-st"></span><span class="grow"></span><span class="nums" id="h-nums"></span></div>
            <div class="bars"><div class="bar"><i id="h-hp"></i></div><div class="bar"><i id="h-xp" style="background:var(--xp)"></i></div></div>
            <div class="status" id="h-status"></div>
            <div class="ask" id="h-ask" hidden></div>
            <div class="log" id="h-log"></div>
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
    if (b && $('h-wild')) $('h-wild').innerHTML = `${esc(G.SPECIES[b.species].name)} nv ${b.level} · ${b.hp}/${b.max} ${statusBadge(b.status)}`;
    $('h-st').innerHTML = statusBadge(lead.status);
    const logEl = $('h-log');
    const lines = b && b.log ? b.log.slice(-3) : [];
    logEl.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
    logEl.hidden = !lines.length;
    const wildEl = hero.querySelector('.stage .wild');
    if (wildEl) wildEl.classList.toggle('down', !!(b && b.defeated));
    const askEl = $('h-ask');
    if (b && b.ask) {
      const key = `${b.ask}${b.species}${b.level}${b.gender}${b.tries}${b.caps}`;
      if (askEl.dataset.k !== key) {
        askEl.dataset.k = key;
        const who = `<b>${esc(G.SPECIES[b.species].name)}</b>${b.gender ? (b.gender === 'F' ? ' ♀' : ' ♂') : ''} nv ${b.level}${b.caught ? '' : ' <span class="tag">NOVO</span>'}${b.shiny ? ' ✨' : ''}`;
        const q = b.ask === 'retry'
          ? `${who} escapou da cápsula! Tentar outra? <span class="muted">(${b.caps} restante(s))</span>`
          : `${who} foi derrotado. Capturar? <span class="muted">(${b.caps} cápsula(s))</span>`;
        askEl.innerHTML = `<span>${q}</span>
          <button class="btn primary" data-cmd="catchYes" ${b.caps ? '' : 'disabled'}>${b.ask === 'retry' ? 'Tentar outra' : 'Capturar'}</button><button class="btn" data-cmd="catchNo">${b.ask === 'retry' ? 'Deixar ir' : 'Não'}</button>`;
      }
      askEl.hidden = false;
    } else { askEl.hidden = true; askEl.dataset.k = ''; }
    const st = $('h-status');
    if (state.resting) st.innerHTML = '<b>Descansando…</b> recupera o HP em alguns segundos.';
    else if (b && b.defeated) st.innerHTML = `Derrotou <b>${esc(G.SPECIES[b.species].name)}${b.shiny ? ' ✨' : ''}</b>${b.tries ? ` · ${b.tries} cápsula(s) lançada(s)` : ''}.`;
    else if (b) st.innerHTML = `Batalhando contra <b>${esc(G.SPECIES[b.species].name)}${b.shiny ? ' ✨' : ''}</b>. Derrote pra capturar (ou clique nele na barra pra arriscar antes).`;
    else st.innerHTML = `Explorando <b>${esc(zoneOf(state.zone).name)}</b>…`;
    // PP do líder mudam a cada golpe: atualiza os chips sem redesenhar tudo
    document.querySelectorAll(`[data-pp-of="${lead.uid}"]`).forEach((el) => {
      const id = el.dataset.move, m = G.MOVES[id];
      el.textContent = `${lead.pp?.[id] ?? m.pp}/${m.pp} PP`;
    });
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
          <div class="nm">${esc(nameOf(c))} ${genderIcon(c)} ${isLead ? '<span class="tag">LÍDER</span>' : ''} ${statusBadge(c.status)}</div>
          <div class="sub">Nv ${c.level} ${typeBadge(sp.type)} <span>${evo}</span></div>
          <div class="bars">${bar(c.hp / max, 'var(--hp)')}${bar(c.xp / need, 'var(--xp)')}</div>
          <div class="nums">HP ${Math.round(c.hp)}/${max} · XP ${c.xp}/${need}</div>
        </div>
        <div class="actions">
          ${isLead ? '' : `<button class="btn primary" data-cmd="setLead" data-uid="${c.uid}">★ Líder</button>`}
          <button class="btn" data-cmd="toBox" data-uid="${c.uid}" ${state.team.length <= 1 ? 'disabled' : ''}>→ Caixa</button>
          <button class="btn" data-cmd="genes" data-uid="${c.uid}">Atributos</button>
          <button class="btn" data-cmd="editMoves" data-uid="${c.uid}">Golpes${c.known.length > c.moves.length ? ` <span class="new">${c.known.length - c.moves.length}</span>` : ''}</button>
        </div>
        <div class="moves">${c.moves.map((id) => moveChip(id, c)).join('')}</div>
        ${heldRow(c)}
        ${editing === c.uid ? moveEditor(c) : ''}
        ${genesOf === c.uid ? genesBox(c) : ''}
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
      const all = state.box;
      for (const u of [...selected]) if (!all.some((c) => c.uid === u)) selected.delete(u); // limpa quem saiu
      const list = all.filter((c) => G.matchesFilter(c, boxFilter));
      const sorters = {
        recent: (a, b) => all.indexOf(b) - all.indexOf(a),
        species: (a, b) => G.SPECIES_ORDER.indexOf(a.species) - G.SPECIES_ORDER.indexOf(b.species) || b.level - a.level,
        level: (a, b) => b.level - a.level,
        iv: (a, b) => G.ivPercent(b) - G.ivPercent(a),
      };
      list.sort(sorters[boxSort] || sorters.recent);
      const releasable = (arr) => arr.filter((c) => !c.locked);
      const selCount = selected.size;
      const filtRel = releasable(list).length;
      const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
      const species = [...new Set(all.map((c) => c.species))].sort((a, b) => G.SPECIES_ORDER.indexOf(a) - G.SPECIES_ORDER.indexOf(b));
      const ivClass = (p) => (p >= 90 ? 'r5' : p >= 75 ? 'r4' : p >= 60 ? 'r3' : p >= 40 ? 'r2' : 'r1');
      return `<div class="card"><h2>Caixa <span>${all.length}</span></h2>
        <div class="filters">
          <select data-f="species">${opt('', 'Todas as espécies', boxFilter.species)}${species.map((sp) => opt(sp, esc(G.SPECIES[sp].name), boxFilter.species)).join('')}</select>
          <span class="frow">
            <select data-f="natureNot">${opt('', 'Natureza é', boxFilter.natureNot)}${opt('1', 'Natureza não é', boxFilter.natureNot)}</select>
            <select data-f="nature">${opt('', 'qualquer', boxFilter.nature)}${opt('_neutral', 'neutra', boxFilter.nature)}${Object.entries(G.NATURES).filter(([, n]) => n.up).map(([id, n]) => opt(id, `${esc(n.name)} (+${G.STAT_LABEL[n.up].slice(0, 3)} −${G.STAT_LABEL[n.down].slice(0, 3)})`, boxFilter.nature)).join('')}</select>
          </span>
          <span class="frow">IV
            <input type="number" min="0" max="100" placeholder="0" data-f="minIv" value="${esc(boxFilter.minIv)}"> a
            <input type="number" min="0" max="100" placeholder="100" data-f="maxIv" value="${esc(boxFilter.maxIv)}"> %
          </span>
          <span class="frow">
            <select data-f="shiny">${opt('', 'Brilhante: tanto faz', boxFilter.shiny)}${opt('only', 'Só brilhantes', boxFilter.shiny)}${opt('no', 'Sem brilhantes', boxFilter.shiny)}</select>
            <select data-f="gender">${opt('', 'Sexo: tanto faz', boxFilter.gender)}${opt('M', '♂ Macho', boxFilter.gender)}${opt('F', '♀ Fêmea', boxFilter.gender)}</select>
          </span>
          <span class="frow">Ordem
            <select data-sort>${opt('recent', 'Recentes', boxSort)}${opt('species', 'Espécie', boxSort)}${opt('level', 'Nível', boxSort)}${opt('iv', 'IV', boxSort)}</select>
            <button class="btn" data-cmd="clearFilter">Limpar filtro</button>
          </span>
        </div>
        <div class="bulk">
          <span class="muted">${list.length} de ${all.length} no filtro · <b>${selCount}</b> selecionado(s)</span>
          <div class="btn-row">
            <button class="btn" data-cmd="selectFiltered">Selecionar filtrados</button>
            <button class="btn" data-cmd="clearSel" ${selCount ? '' : 'disabled'}>Limpar seleção</button>
            <button class="btn danger" data-cmd="releaseSel" ${selCount ? '' : 'disabled'}>Soltar selecionados (${selCount})</button>
            <button class="btn danger" data-cmd="releaseFiltered" ${filtRel ? '' : 'disabled'}>Soltar filtrados (${filtRel})</button>
          </div>
          <span class="muted small">Trancados 🔒 nunca são soltos. Soltar dá moedas e, às vezes, itens de esforço.</span>
        </div>
        <div class="box">
        ${list.slice(0, BOX_SHOW_MAX).map((c) => {
          const iv = G.ivPercent(c), nat = G.NATURES[c.nature];
          const sel = selected.has(c.uid);
          return `
          <div class="box-item ${sel ? 'sel' : ''} ${c.locked ? 'locked' : ''}" data-sel="${c.uid}">
            <button class="lock" data-cmd="lock" data-uid="${c.uid}" title="${c.locked ? 'Destrancar' : 'Trancar (não pode ser solto)'}">${c.locked ? '🔒' : '🔓'}</button>
            <span class="check">${sel ? '✓' : ''}</span>
            ${spr(c.species, { shiny: c.shiny, size: 48 })}
            <span class="nm">${esc(nameOf(c))} ${genderIcon(c)}</span>
            <span class="muted">Nv ${c.level} · ${esc(nat ? nat.name : '')}</span>
            <span class="iv ${ivClass(iv)}" title="IV total ${iv}% · ${G.perfectIvs(c)} perfeito(s)">IV ${iv}%</span>
            <button class="btn" data-cmd="toTeam" data-uid="${c.uid}" ${full ? 'disabled title="Equipe cheia"' : ''}>→ Equipe</button>
          </div>`;
        }).join('')}
        </div>
        ${list.length > BOX_SHOW_MAX ? `<p class="muted">Mostrando ${BOX_SHOW_MAX} de ${list.length}. Use o filtro pra achar os outros.</p>` : ''}
      </div>`;
    },

    daycare() {
      const dc = state.daycare || { mons: [] };
      const eggs = state.eggs || [];
      const [a, b] = dc.mons;
      const chance = G.breedChance(a, b);
      const slot = (c) => c ? `
        <div class="dc-slot">
          ${spr(c.species, { shiny: c.shiny, size: 56 })}
          <b>${esc(nameOf(c))} ${genderIcon(c)}</b>
          <span class="muted">nv ${c.level}${c.held ? ` · ${esc(G.HELD[c.held].name)}` : ''}</span>
          <button class="btn" data-cmd="daycareTake" data-uid="${c.uid}">Buscar</button>
        </div>` : '<div class="dc-slot empty"><span class="muted">Vaga livre</span></div>';
      const mood = dc.mons.length < 2 ? 'Deixe dois bichos de sexos opostos e do mesmo grupo de ovo.' : G.breedMood(chance);
      const pick = [...state.team, ...state.box];
      const full = dc.mons.length >= G.DAYCARE_MAX;
      return `
        <div class="card"><h2>Creche <span>${dc.mons.length}/${G.DAYCARE_MAX}</span></h2>
          <div class="dc">${slot(a)}<span class="dc-heart ${chance ? 'on' : ''}">${chance >= 0.5 ? '♥♥' : chance ? '♥' : '·'}</span>${slot(b)}</div>
          <p class="dc-mood">${esc(mood)}${dc.egg ? ' <b>Tem um ovo esperando espaço!</b>' : ''}</p>
          <p class="muted" style="margin:0">O filhote é da forma base da mãe, herda 3 IVs dos pais (5 com <b>Laço do Destino</b>)
            e a natureza de quem segura a <b>Pedra Eterna</b>.</p>
        </div>

        <div class="card"><h2>Ovos <span>${eggs.length}/${G.EGGS_MAX}</span></h2>
          ${eggs.length ? `<div class="eggs">${eggs.map((e) => `
            <div class="egg" data-egg="${e.id}">
              ${spr('_egg', { size: 40 })}
              <div class="grow">
                <b>Ovo</b> <span class="muted egg-hint"></span>
                <div class="bar"><i class="egg-bar" style="background:var(--gold)"></i></div>
                <span class="nums egg-left"></span>
              </div>
            </div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum ovo. Os ovos chocam com o tempo de jogo, inclusive com o app fechado.</p>'}
        </div>

        <div class="card"><h2>Deixar na creche</h2>
          <div class="dc-pick">${pick.map((c) => {
            const fit = a && !b ? G.breedChance(a, c) : null;
            return `<div class="dc-row">
              ${spr(c.species, { shiny: c.shiny, size: 28 })}
              <span class="grow">${esc(nameOf(c))} ${genderIcon(c)} <span class="muted">nv ${c.level} · ${SPECIES_EGG(c)}</span></span>
              ${fit != null ? `<span class="muted">${fit >= 0.5 ? '♥♥' : fit ? '♥' : '✕'}</span>` : ''}
              <button class="btn" data-cmd="daycarePut" data-uid="${c.uid}" ${full || (state.team.includes(c) && state.team.length <= 1) ? 'disabled' : ''}>Deixar</button>
            </div>`;
          }).join('')}</div>
        </div>`;
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
            <span class="label"><b>${esc(it.name)}</b><span class="muted">${it.price} 🪙 · ${it.grit
              ? `esforço ${it.grit[0] === it.grit[1] ? it.grit[0] : `${it.grit[0]}–${it.grit[1]}`} → +1`
              : `${it.mult}× chance`} · você tem ${state.items[id] || 0}</span></span>
            <button class="btn" data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
            <button class="btn" data-cmd="buy" data-item="${id}" data-qty="5" ${state.coins < it.price * 5 ? 'disabled' : ''}>+5</button>
          </div>`).join('')}
      </div></div>
      <div class="card"><h2>Itens de segurar <span>1 por criatura</span></h2><div class="shop">
        ${Object.entries(G.HELD).map(([id, it]) => `
          <div class="row">
            ${spr(id, { item: true, size: 28 })}
            <span class="label"><b>${esc(it.name)}</b><span class="muted">${esc(it.desc)}</span>
              <span class="muted">${it.price} 🪙 · na mochila ${state.items[id] || 0} · em uso ${[...state.team, ...state.box].filter((c) => c.held === id).length}</span></span>
            <button class="btn" data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
          </div>`).join('')}
      </div></div>`;
    },

    tms() {
      const ids = Object.keys(G.TMS);
      const owned = ids.filter((t) => G.hasTm(state, t)).length;
      const card = (t) => {
        const tm = G.TMS[t], m = G.MOVES[tm.move], have = G.hasTm(state, t);
        const canTeach = have && [...state.team, ...state.box].some((c) => G.canLearnTm(c, t) && !c.moves.includes(tm.move));
        let foot;
        if (have) foot = `<span class="tag">TENHO</span>${canTeach ? '<span class="muted">pode ensinar</span>' : ''}`;
        else if (tm.price != null) foot = `<span class="muted">${tm.price} 🪙</span>`;
        else foot = `<span class="tag excl">EXCLUSIVA</span><span class="muted">${tm.drop.map((z) => esc(G.ZONES.find((x) => x.id === z).name)).join(', ')}</span>`;
        return `<button class="tm ${have ? 'have' : ''}" style="--t:${G.TYPE_COLOR[m.type]}" data-cmd="tmInfo" data-tm="${t}">
          <span class="tm-no">${t.toUpperCase()}</span>
          <b>${esc(m.name)}</b>
          <span class="tm-meta">${G.TYPE_LABEL[m.type]} · ${G.CATEGORY[m.cat].icon} ${m.cat === 'status' ? '—' : m.power}</span>
          <span class="tm-foot">${foot}</span>
        </button>`;
      };
      return `<div class="card"><h2>Máquinas de técnica <span>${owned}/${ids.length}</span></h2>
        <p class="muted" style="margin:0 0 10px">MTs ensinam golpes e não se gastam: compre uma vez e ensine pra todo mundo compatível.
          As exclusivas só caem de batalhas na zona indicada.</p>
        <div class="tms">${ids.map(card).join('')}</div>
      </div>`;
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
            <div>Captura<div class="muted">Quando lançar cápsulas sozinho. Clicar no selvagem sempre lança.</div></div>
            <select id="catchMode">${Object.entries(G.CATCH_MODES).map(([id, label]) => `<option value="${id}" ${state.settings.catchMode === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
          </div>
          <div class="setting">
            <div>Comprar cápsulas sozinho<div class="muted">Quando acabam, compra 5 (se tiver moedas).</div></div>
            <label class="switch"><input type="checkbox" id="autoBuy" ${state.settings.autoBuy ? 'checked' : ''}><span></span></label>
          </div>
          <div class="setting">
            <div>Aprender golpes sozinho<div class="muted">Com 4 golpes, troca o mais fraco quando aprende um melhor.</div></div>
            <label class="switch"><input type="checkbox" id="autoMoves" ${state.settings.autoMoves !== false ? 'checked' : ''}><span></span></label>
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

  // ---------- Popup (golpe / MT) ----------
  const modal = $('modal');
  let modalState = null; // { kind: 'move', id, uid } | { kind: 'tm', id, teaching }

  function openModal(st) {
    modalState = st;
    renderModal();
    if (!modal.open) modal.showModal();
  }

  function tmTeachList(t) {
    const tm = G.TMS[t];
    const all = [...state.team, ...state.box];
    const fits = all.filter((c) => G.canLearnTm(c, t));
    if (!fits.length) return '<p class="muted">Ninguém da sua equipe ou caixa pode aprender essa MT.</p>';
    return fits.map((c) => {
      const knows = c.moves.includes(tm.move);
      const teaching = modalState.teaching === c.uid;
      let action;
      if (knows) action = '<span class="muted">já sabe</span>';
      else if (!G.hasTm(state, t)) action = '<span class="muted">pode aprender</span>';
      else if (c.moves.length < 4) action = `<button class="btn primary" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}">Ensinar</button>`;
      else action = `<button class="btn ${teaching ? '' : 'primary'}" data-cmd="teachPick" data-uid="${c.uid}">${teaching ? 'Cancelar' : 'Ensinar…'}</button>`;
      return `<div class="teach-row">
        ${spr(c.species, { shiny: c.shiny, size: 32 })}
        <span class="grow"><b>${esc(nameOf(c))}</b> ${genderIcon(c)} <span class="muted">nv ${c.level}${state.box.includes(c) ? ' · caixa' : ''}</span></span>
        ${action}
      </div>
      ${teaching ? `<div class="teach-pick">
        <span class="muted">Esquecer qual golpe?</span>
        <div class="known">${c.moves.map((id) => `<button class="pick swap" style="--t:${G.TYPE_COLOR[G.MOVES[id].type]}" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}" data-replace="${id}"><b>${esc(G.MOVES[id].name)}</b><span>trocar</span></button>`).join('')}</div>
        <button class="btn" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}">Só aprender (guardar pra depois)</button>
      </div>` : ''}`;
    }).join('');
  }

  function renderModal() {
    if (!modalState || !state) return;
    let body = '';
    if (modalState.kind === 'move') {
      const c = [...state.team, ...state.box].find((x) => x.uid === modalState.uid) || null;
      body = moveDetails(modalState.id, c);
    } else {
      const t = modalState.id, tm = G.TMS[t];
      const have = G.hasTm(state, t);
      let get;
      if (have) get = '<span class="tag">VOCÊ TEM</span>';
      else if (tm.price != null) get = `<button class="btn primary" data-cmd="buyTm" data-tm="${t}" ${state.coins < tm.price ? 'disabled' : ''}>Comprar por ${tm.price} 🪙</button>`;
      else get = `<span class="tag excl">EXCLUSIVA</span> <span class="muted">cai em batalhas: ${tm.drop.map((z) => esc(G.ZONES.find((x) => x.id === z).name)).join(', ')}</span>`;
      body = `<div class="md-tm"><b>${t.toUpperCase()}</b> ${get}</div>
        ${moveDetails(tm.move)}
        <h4>Quem pode aprender</h4>
        ${tmTeachList(t)}`;
    }
    modal.innerHTML = `<div class="md">
      <button class="md-close" data-cmd="closeModal" aria-label="Fechar">✕</button>
      ${body}
    </div>`;
  }

  modal.addEventListener('close', () => { modalState = null; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); }); // clique fora fecha

  const EGG_LABEL = { campo: 'Campo', agua: 'Água', planta: 'Planta', inseto: 'Inseto', mineral: 'Mineral', voador: 'Voador', indefinido: 'Sem ovos' };
  const SPECIES_EGG = (c) => G.SPECIES[c.species].egg.map((g) => EGG_LABEL[g]).join('/');

  /** Barras dos ovos: atualizam a cada sync sem redesenhar a aba. */
  function renderEggs() {
    for (const e of state.eggs || []) {
      const el = document.querySelector(`[data-egg="${e.id}"]`);
      if (!el) continue;
      const k = e.progress / e.need;
      el.querySelector('.egg-bar').style.width = `${Math.round(k * 100)}%`;
      el.querySelector('.egg-hint').textContent = k > 0.85 ? 'Está quase chocando!' : k > 0.5 ? 'Às vezes se mexe…' : 'Ainda vai demorar.';
      const left = Math.max(0, Math.ceil((e.need - e.progress) / 60));
      el.querySelector('.egg-left').textContent = `faltam ~${left} min`;
    }
  }

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
    renderModal();
    renderEggs();
    $('gear').classList.toggle('on', tab === 'settings');
    if ($('catchMode')) $('catchMode').addEventListener('change', (e) => send({ type: 'catchMode', value: e.target.value }));
    if ($('autoBuy')) $('autoBuy').addEventListener('change', (e) => send({ type: 'autoBuy', value: e.target.checked }));
    const am = $('autoMoves');
    if (am) am.addEventListener('change', (e) => send({ type: 'autoMoves', value: e.target.checked }));
  }

  // Redesenha tudo só quando algo "estrutural" muda; o herói atualiza sempre.
  function onState(s) {
    state = s;
    const key = JSON.stringify({
      ...s, battle: null, resting: null, lastSaved: null, v: A.version, tab, editing, draft, genesOf, modal: modalState,
      eggs: (s.eggs || []).map((e) => e.id), daycare: s.daycare && [s.daycare.mons.map((c) => [c.uid, c.held]), !!s.daycare.egg],
      team: s.team.map((c) => [c.uid, c.species, c.level, c.xp, Math.round(c.hp), c.moves, c.known, c.status, c.effort, c.held, c.nature]),
    });
    if (key !== lastKey) {
      lastKey = key;
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
    } else {
      renderHero();
      renderEggs();
    }
  }

  const rerender = () => { lastKey = ''; heroKey = ''; if (state) onState(state); };

  $('gear').addEventListener('click', () => {
    tab = tab === 'settings' ? 'team' : 'settings';
    try { localStorage.setItem('taskmon-tab', tab); } catch { /* sem storage */ }
    rerender();
    window.scrollTo(0, 0);
  });

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b || b.dataset.tab === tab) return;
    tab = b.dataset.tab;
    try { localStorage.setItem('taskmon-tab', tab); } catch { /* sem storage */ }
    rerender();
    window.scrollTo(0, 0);
  });

  app.addEventListener('change', (e) => {
    const ds = e.target.dataset || {};
    if (ds.f !== undefined) { boxFilter[ds.f] = e.target.value; rerender(); return; }
    if (ds.sort !== undefined) { boxSort = e.target.value; rerender(); return; }
    if (e.target.dataset && e.target.dataset.hold) {
      send({ type: 'hold', uid: e.target.dataset.hold, item: e.target.value || null });
      return;
    }
    const id = e.target.dataset && e.target.dataset.pick;
    if (!id) return;
    if (e.target.checked && !draft.includes(id) && draft.length < 4) draft.push(id);
    if (!e.target.checked) draft = draft.filter((x) => x !== id);
    rerender();
  });

  function onCommandClick(e) {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    e.preventDefault(); // não marca o checkbox quando o botão "?" está dentro do label
    const d = b.dataset;
    switch (d.cmd) {
      case 'moveInfo': openModal({ kind: 'move', id: d.move, uid: d.uid || null }); break;
      case 'tmInfo': openModal({ kind: 'tm', id: d.tm, teaching: null }); break;
      case 'closeModal': modal.close(); break;
      case 'catchYes': send({ type: 'catchAnswer', yes: true }); break;
      case 'catchNo': send({ type: 'catchAnswer', yes: false }); break;
      case 'lock': send({ type: 'lock', uid: d.uid }); break;
      case 'clearFilter': boxFilter = { species: '', nature: '', natureNot: '', minIv: '', maxIv: '', shiny: '', gender: '' }; rerender(); break;
      case 'selectFiltered':
        state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).forEach((c) => selected.add(c.uid));
        rerender();
        break;
      case 'clearSel': selected.clear(); rerender(); break;
      case 'releaseSel':
      case 'releaseFiltered': {
        const uids = d.cmd === 'releaseSel'
          ? [...selected].filter((u) => !state.box.find((c) => c.uid === u)?.locked)
          : state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).map((c) => c.uid);
        const shinies = state.box.filter((c) => uids.includes(c.uid) && c.shiny).length;
        if (!uids.length) break;
        if (confirm(`Soltar ${uids.length} criatura(s)${shinies ? `, incluindo ${shinies} brilhante(s)` : ''}? Não dá pra desfazer.`)) {
          send({ type: 'release', uids });
          uids.forEach((u) => selected.delete(u));
        }
        break;
      }
      case 'daycarePut': send({ type: 'daycarePut', uid: d.uid }); break;
      case 'daycareTake': send({ type: 'daycareTake', uid: d.uid }); break;
      case 'buyTm': send({ type: 'buyTm', tm: d.tm }); break;
      case 'teachPick': modalState.teaching = modalState.teaching === d.uid ? null : d.uid; renderModal(); break;
      case 'teach':
        send({ type: 'teachTm', tm: d.tm, uid: d.uid, replace: d.replace || null });
        modalState.teaching = null;
        break;
      case 'starter': send({ type: 'chooseStarter', species: d.species }); break;
      case 'setLead': send({ type: 'setLead', uid: d.uid }); break;
      case 'toBox': send({ type: 'move', uid: d.uid, to: 'box' }); break;
      case 'toTeam': send({ type: 'move', uid: d.uid, to: 'team' }); break;
      case 'zone': send({ type: 'zone', id: d.id }); break;
      case 'buy': send({ type: 'buy', item: d.item, qty: Number(d.qty) }); break;
      case 'editMoves': {
        const c = state.team.find((x) => x.uid === d.uid);
        if (editing === d.uid) { editing = null; } else if (c) { editing = d.uid; draft = [...c.moves]; }
        rerender();
        break;
      }
      case 'genes': genesOf = genesOf === d.uid ? null : d.uid; rerender(); break;
      case 'grit': send({ type: 'grit', uid: d.uid, stat: d.stat }); break;
      case 'saveMoves': send({ type: 'setMoves', uid: d.uid, moves: draft }); editing = null; rerender(); break;
      case 'cancelMoves': editing = null; rerender(); break;
      case 'openSprites': bridge.openSpritesFolder(); break;
      case 'reloadSprites': bridge.reloadAssets(); break;
      case 'reset':
        if (confirm('Apagar todo o progresso e começar de novo?')) send({ type: 'reset' });
        break;
    }
  }
  app.addEventListener('click', onCommandClick);
  hero.addEventListener('click', onCommandClick);
  // clicar no cartão da caixa (fora dos botões) marca/desmarca
  app.addEventListener('click', (e) => {
    if (e.target.closest('button, select, input')) return;
    const item = e.target.closest('[data-sel]');
    if (!item) return;
    const u = item.dataset.sel;
    if (selected.has(u)) selected.delete(u); else selected.add(u);
    rerender();
  });
  modal.addEventListener('click', onCommandClick);

  A.onChange(() => { applyTheme(); rerender(); });
  await A.load();
  bridge.onState(onState);
  bridge.requestState();
})();
