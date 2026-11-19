// Painel em duas telas (design DS do Claude Design).
// Tela de cima: batalha ou exploração. Tela de baixo: Equipe, Mochila, Dex e Opções (os mesmos
// 4 botões da faixa), com abas; quando a faixa pergunta "Capturar?", vira a tela de ações.
// Não guarda estado do jogo: recebe cópias da faixa e devolve comandos.

(async () => {
  'use strict';
  const G = window.Game;
  const A = window.Assets;
  const DX = window.DexInfo;
  const bridge = window.bridge;
  const $ = (id) => document.getElementById(id);
  const top = $('top'), bottom = $('bottom'), modal = $('modal');

  let state = null;
  let lastKey = '', topKey = '';

  // ---------- navegação ----------
  const SECTIONS = {
    team: { tabs: [['team', 'EQUIPE'], ['box', 'CAIXA'], ['daycare', 'CRECHE']] },
    bag: { tabs: [['shop', 'LOJA'], ['tms', 'MTs']] },
    dex: { tabs: null },
    opts: { tabs: [['zones', 'ZONAS'], ['settings', 'AJUSTES']] },
  };
  let nav = { sect: 'team', screen: 'team', uid: null, from: 'team', sumTab: 'info', dexSel: 0, dexTab: 'reg', dexFilter: 'all' };
  try { nav = { ...nav, ...JSON.parse(localStorage.getItem('taskmon-nav') || '{}') }; } catch { /* sem storage */ }
  const saveNav = () => { try { localStorage.setItem('taskmon-nav', JSON.stringify(nav)); } catch { /* sem storage */ } };

  let boxFilter = { species: '', nature: '', natureNot: '', minIv: '', maxIv: '', shiny: '', gender: '' };
  let boxSort = 'recent';
  const selected = new Set();
  let modalState = null; // { kind: 'move'|'tm'|'moves', ... }
  let askSeen = false;   // a pergunta de captura abriu a tela de ações?

  const send = (cmd) => bridge.sendCommand(cmd);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const zoneOf = (id) => G.ZONES.find((z) => z.id === id) || G.ZONES[0];
  const all = () => [...state.team, ...state.box];
  const byUid = (u) => all().find((c) => c.uid === u) || null;
  const dexNo = (sp) => `Nº ${String(G.SPECIES_ORDER.indexOf(sp) + 1).padStart(3, '0')}`;
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const naZona = (id) => { const n = zoneOf(id).name; return `${/a$/i.test(n) ? 'na' : 'no'} ${n}`; }; // "na Campina", "no Lago"

  // ---------- peças visuais ----------
  // cores dos selos de tipo (mais escuras que as da batalha, com texto branco, como no kit)
  const TYPE_DS = { normal: '#8a8a80', fogo: '#c8502c', agua: '#2f6fc0', planta: '#3a8a3c', eletrico: '#c89a10', pedra: '#8a5a2c', voador: '#6a5ab8' };
  const typeBadge = (t, sm = false) => `<span class="badge${sm ? ' sm' : ''}" style="background:${TYPE_DS[t]}">${G.TYPE_LABEL[t].toUpperCase()}</span>`;
  const gender = (c) => (c && c.gender ? `<span class="g ${c.gender === 'F' ? 'f' : 'm'}" style="font-size:16px">${c.gender === 'F' ? '♀' : '♂'}</span>` : '');
  const statusTag = (st) => (st ? `<span class="st" style="background:${G.STATUS[st].color}">${G.STATUS[st].short}</span>` : '');
  const hpGrad = (r) => {
    const [a, b] = r > 0.5 ? ['#80f4a8', '#28c048'] : r > 0.2 ? ['#fce07a', '#f0a818'] : ['#ff9a8a', '#e83838'];
    return `linear-gradient(${a} 0 45%, ${b} 45% 100%)`;
  };
  const lvl = (n, small = 12, big = 18) => `<span class="lv dts" style="font-size:${big}px"><span style="font-size:${small}px">Nv</span>${n}</span>`;

  // ícones de pixel do design: [caminho, viewBox]
  const ICON = {
    team: ['M1 2h3v3H1zM6 1h3v4H6zM0 6h5v3H0zM5 6h5v3H5z', '0 0 10 10'],
    bag: ['M3 0h4v1H3zM2 1h1v2H2zM7 1h1v2H7zM1 3h8v7H1zM4 5h2v2H4z', '0 0 10 10'],
    dex: ['M0 1h10v8H0zM1 2h3v6H1zM6 2h3v6H6z', '0 0 10 10'],
    opts: ['M0 2h10v1H0zM0 5h10v1H0zM0 8h10v1H0zM2 1h2v3H2zM6 4h2v3H6zM3 7h2v3H3z', '0 0 10 10'],
    left: ['M3 0h1v6H3zM2 1h1v4H2zM1 2h1v2H1z', '0 0 6 6'],
    right: ['M2 0h1v6H2zM3 1h1v4H3zM4 2h1v2H4z', '0 0 6 6'],
    filter: ['M0 0h8v1H0zM1 1h6v1H1zM2 2h4v1H2zM3 3h2v5H3z', '0 0 8 8'],
    sound: ['M0 3h2v2H0zM2 2h1v4H2zM3 1h1v6H3zM5 2h1v1H5zM6 1h1v1H6zM5 5h1v1H5zM6 6h1v1H6zM6 3h2v2H6z', '0 0 8 8'],
    eye: ['M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v2H0zM7 2h1v2H7zM1 4h1v1H1zM6 4h1v1H6zM2 5h4v1H2zM3 2h2v2H3z', '0 0 8 6'],
  };
  const svg = (name, size = 20) => {
    const [d, vb] = ICON[name];
    const [, , w, h] = vb.split(' ').map(Number);
    return `<svg width="${size}" height="${Math.round((size * h) / w)}" viewBox="${vb}" shape-rendering="crispEdges" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="${d}"/></svg>`;
  };

  /** Folha de sprite como <span> (anima com CSS em degraus). */
  function spr(species, { size = 48, shiny = false, silhouette = false, flip = false, item = false, cls = '' } = {}) {
    const sheet = item ? A.item(species) : A.creature(species, shiny);
    const k = (size / Math.max(sheet.fw, sheet.fh)) * (item ? 1 : sheet.size);
    const w = Math.round(sheet.fw * k), h = Math.round(sheet.fh * k);
    const url = silhouette ? A.silhouetteUrl(species) : A.sheetUrl(sheet);
    const n = silhouette ? 1 : sheet.frames;
    const style = `width:${w}px;height:${h}px;--n:${n};--dur:${(n / sheet.fps).toFixed(3)}s;background-image:url(${url})`;
    return `<span class="spr-box ${cls}" style="width:${size}px;height:${size}px"><i class="spr${n > 1 ? ' anim' : ''}${flip ? ' flip' : ''}" style="${style}"></i></span>`;
  }
  const capIcon = (w = 12, h = 15) => {
    const f = A.ui('capsule');
    return f ? `<img src="${f.img.src}" width="${w}" height="${h}" alt="">` : spr('capsula', { item: true, size: h });
  };

  /** Cenário do retrato (céu em faixas, plataforma e o bicho pulando). */
  function portrait(species, { shiny = false, height = 140, small = false, silhouette = false, corner = '' } = {}) {
    const oval = small ? 'width:140px;height:30px;bottom:10px' : 'width:150px;height:34px;bottom:12px';
    const who = small ? 'bottom:20px' : 'bottom:22px';
    return `<div class="portrait${small ? ' small' : ''}" style="height:${height}px">
      <div class="b1"></div><div class="b2"></div><div class="b3"></div><div class="b4"></div><div class="b5"></div>
      <div class="oval" style="${oval}"></div>
      <div class="who" style="${who}">${spr(species, { shiny, size: small ? 72 : 88, silhouette, cls: silhouette ? '' : 'bob' })}</div>
      ${corner}
    </div>`;
  }

  function sects(active) {
    const b = (id, color, title) => `<button class="rbtn${active === id ? ' on' : ''}" style="background:${color}" data-cmd="sect" data-sect="${id}" title="${title}">${svg(id, 18)}</button>`;
    return `<div class="sects">${b('team', '#4caa52', 'Equipe')}${b('bag', '#e89a30', 'Mochila')}${b('dex', '#e05848', 'Dex')}${b('opts', '#4888d0', 'Opções')}</div>`;
  }
  function tabs(list, cur, attr = 'screen') {
    return list.map(([id, label]) => `<button class="tab${cur === id ? ' on' : ''}" data-cmd="tab" data-${attr}="${id}">${label}</button>`).join('');
  }
  const closeBtn = (label = 'Fechar', cmd = 'close') => `<button class="tbtn blue" data-cmd="${cmd}">${label}</button>`;

  // ---------- tela de cima ----------
  const PLATE = {
    foe: `<svg aria-hidden="true" width="256" height="68" viewBox="0 0 256 68"><defs><clipPath id="bt-foe"><path d="M10 3H240Q245 3 244 8L233 55Q232 61 226 61H10Q3 61 3 54V10Q3 3 10 3Z"/></clipPath></defs>
      <path d="M8 4H242Q250 4 248 12L236 60Q234 68 226 68H8Q0 68 0 60V12Q0 4 8 4Z" fill="#2a303c"/><path d="M8 0H242Q250 0 248 8L236 56Q234 64 226 64H8Q0 64 0 56V8Q0 0 8 0Z" fill="#404858"/>
      <g clip-path="url(#bt-foe)"><rect width="256" height="68" fill="#f6f6ea"/><rect y="50" width="256" height="18" fill="#dcdfce"/><rect y="4" width="256" height="2" fill="#ffffff"/></g></svg>`,
    me: `<svg aria-hidden="true" width="270" height="90" viewBox="0 0 270 90"><defs><clipPath id="bt-me"><path d="M15 3H261Q267 3 267 9V77Q267 83 261 83H35Q28 83 27 77L11 8Q10 3 15 3Z"/></clipPath></defs>
      <path d="M14 4H262Q270 4 270 12V82Q270 90 262 90H34Q26 90 24 82L8 12Q6 4 14 4Z" fill="#2a303c"/><path d="M14 0H262Q270 0 270 8V78Q270 86 262 86H34Q26 86 24 78L8 8Q6 0 14 0Z" fill="#404858"/>
      <g clip-path="url(#bt-me)"><rect width="270" height="90" fill="#f6f6ea"/><rect y="70" width="270" height="20" fill="#dcdfce"/><rect y="4" width="270" height="2" fill="#ffffff"/></g></svg>`,
  };

  function renderTop() {
    if (!state) return;
    const lead = G.getLead(state);
    const b = state.battle;
    if (!state.starterChosen || !lead) {
      if (topKey === 'starter') return;
      topKey = 'starter';
      top.innerHTML = `${bands()}<div class="dlg"><p class="dts">Olá! Escolha um parceiro na tela de baixo.</p><p class="dts soft">Ele vai andar pela sua barra de tarefas.</p><span class="more">▼</span></div>`;
      return;
    }
    const key = [lead.uid, lead.species, lead.shiny, lead.gender, b ? `${b.species}${b.shiny}${b.level}${b.gender}` : '-', A.version].join('|');
    if (key !== topKey) {
      topKey = key;
      const sp = G.SPECIES[lead.species];
      top.innerHTML = `${bands()}
        ${b ? `<div class="oval" style="right:36px;top:132px;width:200px;height:46px;background:#c8eaa4;box-shadow:inset 0 -7px 0 #94c870"></div>
          <div class="ab" id="t-foe-spr" style="right:104px;top:84px">${spr(b.species, { shiny: b.shiny, size: 72, flip: true, cls: 'bob' })}</div>` : `<span class="zone-tag" id="t-zone"></span>`}
        <div class="oval" style="left:22px;bottom:112px;width:240px;height:50px;background:#b4de90;box-shadow:inset 0 -8px 0 #80b85c"></div>
        <div class="ab" style="left:94px;bottom:128px">${spr(lead.species, { shiny: lead.shiny, size: 104, cls: 'bob' })}</div>
        ${b ? `<div class="bplate" style="left:0;top:22px;width:256px;height:68px">${PLATE.foe}
          <div class="in" style="left:14px;right:34px;top:9px;bottom:15px">
            <div class="line"><span class="dts" style="font-size:20px;font-weight:600;line-height:1">${esc(G.SPECIES[b.species].name)}${b.shiny ? ' ✦' : ''}</span>${gender(b)}<span id="t-foe-st"></span>${lvl(b.level)}</div>
            <div class="hp"><span class="hp-l">HP</span><span class="hp-t"><i id="t-foe-hp"></i></span></div>
          </div></div>` : ''}
        <div class="bplate" style="right:0;bottom:100px;width:270px;height:90px">${PLATE.me}
          <div class="in" style="left:34px;right:14px;top:9px;bottom:15px">
            <div class="line"><span class="dts" style="font-size:20px;font-weight:600;line-height:1">${esc(sp.name)}${lead.shiny ? ' ✦' : ''}</span>${gender(lead)}<span id="t-me-st"></span><span class="lv dts" style="font-size:18px"><span style="font-size:12px">Nv</span><span id="t-me-lv"></span></span></div>
            <div class="hp"><span class="hp-l">HP</span><span class="hp-t"><i id="t-me-hp"></i></span></div>
            <div class="line"><span class="dts" id="t-me-hpn" style="margin-left:auto;font-size:16px;font-weight:600;line-height:1"></span></div>
            <div class="xpbar"><i id="t-me-xp"></i></div>
          </div></div>
        <div class="dlg" id="t-dlg"><p class="dts" id="t-l1"></p><p class="dts soft" id="t-l2"></p><span class="more" id="t-more">▼</span></div>`;
    }
    // partes vivas
    const max = G.maxHp(lead), r = lead.hp / max;
    const meHp = $('t-me-hp');
    meHp.style.width = `${(G.clamp(r, 0, 1) * 100).toFixed(1)}%`;
    meHp.style.background = hpGrad(r);
    $('t-me-hpn').textContent = `${Math.ceil(lead.hp)} / ${max}`;
    $('t-me-lv').textContent = lead.level;
    $('t-me-xp').style.width = `${(G.clamp(lead.xp / G.xpToNext(lead.level), 0, 1) * 100).toFixed(1)}%`;
    $('t-me-st').innerHTML = statusTag(lead.status);
    if (b) {
      const fr = b.max ? b.hp / b.max : 0;
      const fh = $('t-foe-hp');
      fh.style.width = `${(G.clamp(fr, 0, 1) * 100).toFixed(1)}%`;
      fh.style.background = hpGrad(fr);
      $('t-foe-st').innerHTML = statusTag(b.status);
      $('t-foe-spr').classList.toggle('downed', !!b.defeated);
    } else {
      $('t-zone').textContent = `ZONA ${G.ZONES.indexOf(zoneOf(state.zone)) + 1} · ${zoneOf(state.zone).name.toUpperCase()}`;
    }
    // caixa de diálogo
    const dlg = $('t-dlg');
    let l1 = '', l2 = '', kind = '';
    if (b && b.ask) {
      const nm = `<strong>${esc(G.SPECIES[b.species].name.toUpperCase())}</strong>`;
      l1 = b.ask === 'retry' ? `${nm} escapou da cápsula!` : `${nm} foi derrotado!`;
      l2 = b.ask === 'retry' ? 'Tentar outra cápsula?' : `Capturar? (${b.caps} cápsula${b.caps === 1 ? '' : 's'})`;
      kind = !b.caught || b.shiny ? 'alert' : '';
    } else if (b) {
      const log = (b.log || []).slice(-2);
      if (log.length > 1) { l1 = esc(log[0]); l2 = esc(log[1]); } else {
        l1 = `Um <strong>${esc(G.SPECIES[b.species].name.toUpperCase())}</strong> selvagem apareceu!`; // como no design
        l2 = `O que o ${esc(G.SPECIES[lead.species].name)} vai fazer?`;
      }
    } else if (state.resting) {
      l1 = `${esc(G.SPECIES[lead.species].name)} está descansando…`;
      l2 = 'Recupera o HP em alguns segundos.';
    } else {
      l1 = `Explorando: <strong>${esc(zoneOf(state.zone).name)}</strong>`;
      l2 = `${esc(G.SPECIES[lead.species].name)} caminha na barra de tarefas.`;
    }
    dlg.className = `dlg ${kind}`;
    $('t-l1').innerHTML = l1;
    $('t-l2').innerHTML = l2;
    $('t-l2').classList.toggle('hide', !l2);
  }
  const bands = () => '<div class="sky"></div><div class="sky2"></div><div class="sky3"></div><div class="sky4"></div><div class="gr1"></div><div class="gr2"></div><div class="gr3"></div><div class="gr4"></div>';

  // ---------- telas de baixo ----------
  function teamCard(c, lead) {
    if (!c) return '<div class="slot-empty">vazio</div>';
    const max = G.maxHp(c), r = c.hp / max;
    const isLead = c.uid === lead?.uid;
    return `<button class="card${isLead ? ' lead' : ''}" data-cmd="summary" data-uid="${c.uid}">
      ${isLead ? '<span class="tag gold lead-tag">LÍDER</span>' : ''}
      <span class="medal">${spr(c.species, { shiny: c.shiny, size: 38 })}</span>
      <span class="info">
        <span class="line" style="gap:5px"><span class="nm dts">${esc(G.SPECIES[c.species].name)}</span>${gender(c)}${statusTag(c.status)}${lvl(c.level, 11, 15)}</span>
        <span class="hp"><span class="hp-l">HP</span><span class="hp-t"><i style="width:${(G.clamp(r, 0, 1) * 100).toFixed(1)}%;background:${hpGrad(r)}"></i></span></span>
        <span class="hpn dts">${Math.ceil(c.hp)}/${max}</span>
      </span>
    </button>`;
  }

  const screens = {
    starters() {
      return {
        head: '<div class="pill"><h1>ESCOLHA SEU PARCEIRO</h1></div>',
        body: `<div class="starters">${G.STARTERS.map((id) => {
          const sp = G.SPECIES[id];
          return `<div class="plate starter">${portrait(id, { height: 120, small: true })}
            <b class="dts">${esc(sp.name)}</b>${typeBadge(sp.type, true)}
            <button class="tbtn green sm" data-cmd="starter" data-species="${id}">Escolher</button></div>`;
        }).join('')}</div>`,
        foot: '<span class="hint dts">Ele anda pela barra de tarefas e luta sozinho.</span>',
      };
    },

    encounter() {
      const b = state.battle;
      const caps = (state.items.capsula || 0) + (state.items.super || 0);
      const retry = b && b.ask === 'retry';
      return {
        raw: `<div class="head" style="height:22px;padding:0 14px"><span class="dts grow" style="font-size:15px;font-weight:600;color:#3c4a48">Escolha uma ação</span>
            <span style="display:flex;align-items:center;gap:6px;font-size:15px;font-weight:600;color:#3c4a48">${capIcon()}${caps}</span></div>
          <div class="actions">
            <button class="tbtn red big" data-cmd="catchYes" ${caps ? '' : 'disabled'}>${capIcon(48, 60)}${retry ? 'TENTAR OUTRA' : 'CAPTURAR'}</button>
            <div class="two">
              <button class="tbtn orange" data-cmd="sect" data-sect="bag">${svg('bag', 28)}MOCHILA</button>
              <button class="tbtn green" data-cmd="sect" data-sect="team">${svg('team', 28)}EQUIPE</button>
            </div>
            <button class="tbtn blue leave" data-cmd="catchNo">DEIXAR IR</button>
          </div>`,
      };
    },

    team() {
      const lead = G.getLead(state);
      const slots = Array.from({ length: G.TEAM_MAX }, (_, i) => state.team[i] || null);
      return {
        head: tabs(SECTIONS.team.tabs.map(([id, l]) => [id, id === 'team' ? `${l} ${state.team.length}/${G.TEAM_MAX}` : id === 'box' && state.box.length ? `${l} ${state.box.length}` : l]), 'team') + sects('team'),
        body: `<div class="team">${slots.map((c) => teamCard(c, lead)).join('')}</div>`,
        foot: `<span class="hint dts grow">Toque num bicho pra ver o resumo</span><button class="tbtn green" data-cmd="tab" data-screen="box">Trocar</button>${closeBtn()}`,
      };
    },

    summary() {
      const list = nav.from === 'box' ? state.box : state.team;
      let c = byUid(nav.uid);
      if (!c) { c = list[0] || state.team[0]; nav.uid = c?.uid; }
      if (!c) return screens.team();
      const sp = G.SPECIES[c.species];
      const lead = G.getLead(state);
      const inTeam = state.team.includes(c);
      const idx = Math.max(0, (inTeam ? state.team : state.box).indexOf(c));
      const n = (inTeam ? state.team : state.box).length;
      let right = '';
      if (nav.sumTab === 'status') {
        const st = G.stats(c), nat = G.NATURES[c.nature] || {};
        right = `<div class="line" style="justify-content:space-between"><span class="lbl">TEMPERAMENTO</span><span class="dts" style="font-size:14px;font-weight:600">${esc(nat.name || '—')}${nat.up ? ` <span class="muted" style="font-size:12px">+${G.STAT_LABEL[nat.up].slice(0, 3)} −${G.STAT_LABEL[nat.down].slice(0, 3)}</span>` : ''}</span></div>
          ${G.STAT_KEYS.map((k) => {
            const iv = c.ivs[k], ef = c.effort[k], item = G.gritFor(ef), have = item ? state.items[item] || 0 : 0;
            const r = iv >= 31 ? 5 : iv >= 30 ? 4 : iv >= 26 ? 3 : iv >= 16 ? 2 : iv >= 1 ? 1 : 0;
            const mark = nat.up === k ? '<span class="up">▲</span>' : nat.down === k ? '<span class="down">▼</span>' : '';
            return `<div class="gene"><span class="k">${G.STAT_LABEL[k]} ${mark}</span><span class="v">${st[k]}</span>
              <span style="display:flex;flex-direction:column;gap:2px"><span class="iv r${r}" title="IV ${iv}/31">${G.ivRating(iv)}</span><span class="pips" title="Esforço ${ef}/${G.EFFORT_MAX}">${Array.from({ length: G.EFFORT_MAX }, (_, i) => `<i class="${i < ef ? 'on' : ''}"></i>`).join('')}</span></span>
              <button class="grit" data-cmd="grit" data-uid="${c.uid}" data-stat="${k}" ${item && have ? '' : 'disabled'} title="${item ? `Usar ${esc(G.SHOP[item].name)} (tem ${have})` : 'Esforço no máximo'}">+</button></div>`;
          }).join('')}`;
      } else if (nav.sumTab === 'moves') {
        const owned = Object.keys(G.HELD).filter((id) => (state.items[id] || 0) > 0 && id !== c.held);
        const cur = c.held && G.HELD[c.held];
        right = `<div class="moves">${c.moves.map((id) => {
            const m = G.MOVES[id];
            return `<button class="move" style="--t:${TYPE_DS[m.type]}" data-cmd="moveInfo" data-move="${id}" data-uid="${c.uid}"><b>${esc(m.name)}</b><span>${G.CATEGORY[m.cat].icon} ${m.cat === 'status' ? '—' : m.power} · ${c.pp?.[id] ?? m.pp}/${m.pp} PP</span></button>`;
          }).join('')}</div>
          <button class="tbtn slate sm" data-cmd="editMoves" data-uid="${c.uid}">Trocar golpes${c.known.length > c.moves.length ? ` (${c.known.length - c.moves.length} novo${c.known.length - c.moves.length > 1 ? 's' : ''})` : ''}</button>
          <div class="held" style="margin-top:auto"><span class="lbl">SEGURANDO</span>${cur ? spr(c.held, { item: true, size: 20 }) : ''}
            <select data-hold="${c.uid}" ${!cur && !owned.length ? 'disabled' : ''}>
              <option value="">${cur ? 'Tirar item' : 'Nenhum'}</option>${cur ? `<option value="${c.held}" selected>${esc(cur.name)}</option>` : ''}
              ${owned.map((id) => `<option value="${id}">${esc(G.HELD[id].name)} (${state.items[id]})</option>`).join('')}
            </select></div>
          ${cur ? `<span class="muted" style="font-size:12px;font-weight:600">${esc(cur.desc)}</span>` : ''}`;
      } else {
        const nat = G.NATURES[c.nature];
        const met = c.met || {};
        const how = { capturado: 'Capturado em', ovo: 'Nasceu na', inicial: 'Parceiro desde', antigo: 'Com você desde' }[met.how] || 'Origem';
        const where = met.how === 'ovo' ? 'creche' : met.zone ? zoneOf(met.zone).name : '—';
        const ms = Date.now() - (met.at || Date.now());
        const hours = Math.floor(ms / 3600000), mins = Math.floor((ms % 3600000) / 60000);
        const need = G.xpToNext(c.level);
        const rows = [
          ['Temperamento', nat ? nat.name : '—'], [how, where], ['No nível', met.level ?? '—'],
          ['Tempo junto', `${hours ? `${hours}h ` : ''}${mins}min`], ['Passos', fmt(c.steps || 0)],
          ['Gosta de', DX.INFO[c.species]?.likes || '—'],
        ];
        right = `<dl class="rows">${rows.map(([k, v], i) => `<dt class="${i % 2 ? '' : 'z'}">${k}</dt><dd class="${i % 2 ? '' : 'z'}">${esc(v)}</dd>`).join('')}</dl>
          <div class="xpline"><div class="top"><span class="lbl">EXP PARA O NV${c.level + 1}</span><span class="dts" style="font-size:14px;font-weight:600">faltam ${fmt(need - c.xp)}</span></div>
            <div class="bar2"><span><i style="width:${(G.clamp(c.xp / need, 0, 1) * 100).toFixed(1)}%;background:linear-gradient(#8cd0ff 0 45%, #3896e8 45% 100%)"></i></span></div></div>`;
      }
      return {
        head: tabs([['info', 'INFO'], ['status', 'STATUS'], ['moves', 'GOLPES']], nav.sumTab, 'sumtab') + `<span class="num-pill" style="margin-left:auto">${dexNo(c.species)}</span>`,
        body: `<div class="plate left-plate">${portrait(c.species, { shiny: c.shiny })}
            <div class="meta">
              <div class="line"><h2 class="dts">${esc(sp.name)}${c.shiny ? ' ✦' : ''}</h2>${gender(c)}${lvl(c.level)}</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">${typeBadge(sp.type)}${statusTag(c.status)}</div>
              <span class="muted" style="font-size:12px;font-weight:600">${inTeam ? 'Na equipe' : 'Na caixa'} · IV ${G.ivPercent(c)}%</span>
            </div></div>
          <div class="plate right-plate">${right}</div>`,
        foot: `<button class="tbtn slate sq" data-cmd="sumPrev" aria-label="Anterior">${svg('left', 14)}</button>
          <span class="hint dts">${idx + 1} de ${n}</span>
          <button class="tbtn slate sq" data-cmd="sumNext" aria-label="Próximo">${svg('right', 14)}</button>
          <span class="grow"></span>
          ${inTeam && c.uid !== lead?.uid ? `<button class="tbtn orange" data-cmd="setLead" data-uid="${c.uid}">Definir líder</button>` : ''}
          ${inTeam ? `<button class="tbtn slate" data-cmd="toBox" data-uid="${c.uid}" ${state.team.length <= 1 ? 'disabled' : ''}>Caixa</button>`
            : `<button class="tbtn green" data-cmd="toTeam" data-uid="${c.uid}" ${state.team.length >= G.TEAM_MAX ? 'disabled' : ''}>Equipe</button>`}
          ${closeBtn('Voltar', 'back')}`,
      };
    },

    box() {
      const box = state.box;
      for (const u of [...selected]) if (!box.some((c) => c.uid === u)) selected.delete(u);
      const list = box.filter((c) => G.matchesFilter(c, boxFilter));
      const sorters = {
        recent: (a, b) => box.indexOf(b) - box.indexOf(a),
        species: (a, b) => G.SPECIES_ORDER.indexOf(a.species) - G.SPECIES_ORDER.indexOf(b.species) || b.level - a.level,
        level: (a, b) => b.level - a.level,
        iv: (a, b) => G.ivPercent(b) - G.ivPercent(a),
      };
      list.sort(sorters[boxSort] || sorters.recent);
      const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
      const species = [...new Set(box.map((c) => c.species))].sort((a, b) => G.SPECIES_ORDER.indexOf(a) - G.SPECIES_ORDER.indexOf(b));
      const releasable = list.filter((c) => !c.locked).length;
      return {
        head: tabs(SECTIONS.team.tabs.map(([id, l]) => [id, id === 'team' ? `${l} ${state.team.length}/${G.TEAM_MAX}` : id === 'box' ? `${l} ${box.length}` : l]), 'box') + sects('team'),
        body: `<div class="plate panel">
            <div class="filters">
              <select data-f="species">${opt('', 'Espécie', boxFilter.species)}${species.map((s) => opt(s, esc(G.SPECIES[s].name), boxFilter.species)).join('')}</select>
              <select data-f="natureNot">${opt('', 'Nat. é', boxFilter.natureNot)}${opt('1', 'Nat. não é', boxFilter.natureNot)}</select>
              <select data-f="nature">${opt('', 'qualquer', boxFilter.nature)}${opt('_neutral', 'neutra', boxFilter.nature)}${Object.entries(G.NATURES).filter(([, n]) => n.up).map(([id, n]) => opt(id, esc(n.name), boxFilter.nature)).join('')}</select>
              IV<input type="number" min="0" max="100" placeholder="0" data-f="minIv" value="${esc(boxFilter.minIv)}">a<input type="number" min="0" max="100" placeholder="100" data-f="maxIv" value="${esc(boxFilter.maxIv)}">
              <select data-f="shiny">${opt('', '✦ tanto faz', boxFilter.shiny)}${opt('only', 'só ✦', boxFilter.shiny)}${opt('no', 'sem ✦', boxFilter.shiny)}</select>
              <select data-sort>${opt('recent', 'Recentes', boxSort)}${opt('species', 'Espécie', boxSort)}${opt('level', 'Nível', boxSort)}${opt('iv', 'IV', boxSort)}</select>
            </div>
            <div class="scroll"><div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
              ${list.length ? list.slice(0, 240).map((c) => `<div class="mini${selected.has(c.uid) ? ' sel' : ''}${c.locked ? ' locked' : ''}" data-cmd="summary" data-uid="${c.uid}" data-from="box">
                  <span class="ck" data-cmd="sel" data-uid="${c.uid}">${selected.has(c.uid) ? '✓' : ''}</span>
                  <button class="lk" data-cmd="lock" data-uid="${c.uid}" title="${c.locked ? 'Destrancar' : 'Trancar'}">${c.locked ? '🔒' : '🔓'}</button>
                  ${spr(c.species, { shiny: c.shiny, size: 36 })}<b>${esc(G.SPECIES[c.species].name)}</b><span class="muted">Nv${c.level} · IV ${G.ivPercent(c)}%</span>
                </div>`).join('') : `<p class="muted" style="grid-column:1/-1;font-size:14px;font-weight:600">${box.length ? 'Nada passa nesse filtro.' : 'A caixa está vazia. Quando a equipe enche, as capturas vêm pra cá.'}</p>`}
            </div></div>
          </div>`,
        foot: `<span class="hint dts grow">${selected.size} marcado(s) · ${list.length} no filtro</span>
          <button class="tbtn slate sm" data-cmd="selFiltered">Marcar filtro</button>
          <button class="tbtn red sm" data-cmd="release" ${selected.size || releasable ? '' : 'disabled'}>Soltar${selected.size ? ` (${selected.size})` : ''}</button>
          ${closeBtn()}`,
      };
    },

    daycare() {
      const dc = state.daycare || { mons: [] };
      const eggs = state.eggs || [];
      const [a, b] = dc.mons;
      const ch = G.breedChance(a, b);
      const slot = (c) => (c ? `<div class="dcslot">${spr(c.species, { shiny: c.shiny, size: 44 })}<b class="dts">${esc(G.SPECIES[c.species].name)} ${gender(c)}</b><span class="muted">Nv${c.level}${c.held ? ` · ${esc(G.HELD[c.held].name)}` : ''}</span>
          <button class="tbtn slate sm" data-cmd="daycareTake" data-uid="${c.uid}">Buscar</button></div>` : '<div class="dcslot empty">vaga livre</div>');
      const full = dc.mons.length >= G.DAYCARE_MAX;
      return {
        head: tabs(SECTIONS.team.tabs.map(([id, l]) => [id, id === 'team' ? `${l} ${state.team.length}/${G.TEAM_MAX}` : id === 'box' && state.box.length ? `${l} ${state.box.length}` : l]), 'daycare') + sects('team'),
        body: `<div class="plate panel"><div class="scroll" style="display:flex;flex-direction:column;gap:8px">
            <div class="slots">${slot(a)}<span class="heart${ch ? ' on' : ''}">${ch >= 0.5 ? '♥♥' : ch ? '♥' : '·'}</span>${slot(b)}</div>
            ${eggs.length ? eggs.map((e) => `<div class="egg" data-egg="${e.id}">${spr('_egg', { size: 28 })}<span class="grow" style="display:flex;flex-direction:column;gap:3px"><span><b>Ovo</b> <span class="muted egg-hint"></span></span>
              <span class="bar2"><span><i class="egg-bar" style="background:linear-gradient(#fce07a 0 45%, #f0a818 45% 100%)"></i></span></span></span><span class="muted egg-left"></span></div>`).join('')
              : '<p class="muted" style="margin:0;font-size:13px;font-weight:600">Sem ovos. Eles chocam com o tempo de jogo.</p>'}
            <span class="lbl">DEIXAR NA CRECHE</span>
            ${all().map((c) => {
              const fit = a && !b ? G.breedChance(a, c) : null;
              return `<div class="lrow">${spr(c.species, { shiny: c.shiny, size: 28 })}<span class="t"><b>${esc(G.SPECIES[c.species].name)} ${gender(c)}</b><span>Nv${c.level}${fit != null ? ` · ${fit >= 0.5 ? '♥♥' : fit ? '♥' : '✕'}` : ''}</span></span>
                <button class="tbtn slate sm" data-cmd="daycarePut" data-uid="${c.uid}" ${full || (state.team.includes(c) && state.team.length <= 1) ? 'disabled' : ''}>Deixar</button></div>`;
            }).join('')}
          </div></div>`,
        foot: `<span class="hint dts grow">${esc(dc.mons.length < 2 ? 'Deixe um casal do mesmo grupo de ovo.' : G.breedMood(ch))}</span>${closeBtn()}`,
      };
    },

    shop() {
      const row = (id, it, kind) => `<div class="lrow">${spr(id, { item: true, size: 28 })}<span class="t"><b>${esc(it.name)}</b><span>${esc(kind)}</span></span>
        <span class="dts" style="font-size:14px;font-weight:700;white-space:nowrap">${fmt(it.price)}</span>
        <button class="tbtn green sm" data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
        ${kind.startsWith('tem') ? `<button class="tbtn green sm" data-cmd="buy" data-item="${id}" data-qty="5" ${state.coins < it.price * 5 ? 'disabled' : ''}>+5</button>` : ''}</div>`;
      const caps = Object.entries(G.SHOP).filter(([, it]) => !it.grit);
      const grit = Object.entries(G.SHOP).filter(([, it]) => it.grit);
      return {
        head: tabs(SECTIONS.bag.tabs, 'shop') + `<span class="num-pill" style="gap:6px;margin-left:8px">${A.ui('coin') ? `<img src="${A.ui('coin').img.src}" width="14" height="14" alt="">` : ''}${fmt(state.coins)}</span>` + sects('bag'),
        body: `<div class="plate panel"><div class="scroll">
            <span class="lbl">CÁPSULAS</span>${caps.map(([id, it]) => row(id, it, `tem ${state.items[id] || 0} · ${it.mult}× chance`)).join('')}
            <span class="lbl">ESFORÇO</span>${grit.map(([id, it]) => row(id, it, `tem ${state.items[id] || 0} · nível ${it.grit[0]}${it.grit[1] !== it.grit[0] ? `–${it.grit[1]}` : ''} → +1`)).join('')}
            <span class="lbl">ITENS DE SEGURAR</span>${Object.entries(G.HELD).map(([id, it]) => row(id, it, `${state.items[id] ? `${state.items[id]} na mochila · ` : ''}${it.desc}`)).join('')}
          </div></div>`,
        foot: `<span class="hint dts grow">Itens de segurar: no resumo do bicho → GOLPES</span>${closeBtn()}`,
      };
    },

    tms() {
      const ids = Object.keys(G.TMS);
      const owned = ids.filter((t) => G.hasTm(state, t)).length;
      return {
        head: tabs(SECTIONS.bag.tabs, 'tms') + `<span class="num-pill" style="margin-left:8px">${owned}/${ids.length}</span>` + sects('bag'),
        body: `<div class="plate panel"><div class="scroll"><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
            ${ids.map((t) => {
              const tm = G.TMS[t], m = G.MOVES[tm.move], have = G.hasTm(state, t);
              return `<button class="tmcard${have ? ' have' : ''}" style="--t:${TYPE_DS[m.type]}" data-cmd="tmInfo" data-tm="${t}">
                <span class="no">${t.toUpperCase()}${have ? ' ✓' : ''}</span><b>${esc(m.name)}</b>
                <span>${have ? 'Você tem' : tm.price != null ? `${fmt(tm.price)} moedas` : `Exclusiva · ${tm.drop.map((z) => zoneOf(z).name).join(', ')}`}</span></button>`;
            }).join('')}</div></div></div>`,
        foot: `<span class="hint dts grow">MTs não se gastam: compre uma vez, ensine pra todos.</span>${closeBtn()}`,
      };
    },

    dex() {
      const ids = G.SPECIES_ORDER;
      const shown = ids.filter((id) => nav.dexFilter === 'caught' ? state.dex.caught[id] : nav.dexFilter === 'seen' ? state.dex.seen[id] : true);
      if (nav.dexSel >= ids.length) nav.dexSel = 0;
      const sel = ids[nav.dexSel];
      const seen = state.dex.seen[sel], caught = state.dex.caught[sel];
      const sp = G.SPECIES[sel];
      const nCaught = ids.filter((id) => state.dex.caught[id]).length, nSeen = ids.filter((id) => state.dex.seen[id]).length;
      const firstSeen = state.dex.seenAt?.[sel];
      return {
        head: `<div class="pill"><h1 style="letter-spacing:3px">DEX</h1></div>
          <span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#2c3a38">${capIcon()}Capturados <strong style="font-size:16px">${nCaught}</strong></span>
          <span style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#2c3a38">${svg('eye', 16)}Vistos <strong style="font-size:16px">${nSeen}</strong></span>${sects('dex').replace('margin-left:auto', '')}`,
        body: `<div class="plate left-plate">${portrait(sel, { height: 118, small: true, silhouette: !seen })}
            <div class="meta">
              <div class="line" style="justify-content:space-between"><span class="lbl" style="font-size:13px">${dexNo(sel)}</span><span class="tag">${caught ? 'CAPTURADO' : seen ? 'VISTO' : '???'}</span></div>
              <div class="line" style="align-items:center;gap:8px"><span class="dts" style="font-size:22px;font-weight:600;line-height:1">${seen ? esc(sp.name) : '???'}</span>${seen ? typeBadge(sp.type, true) : ''}</div>
              <p style="margin:0;font-size:13px;font-weight:500;color:#4a4a54;line-height:1.25">${!seen ? 'Ainda não visto. Continue explorando!' : caught ? esc(DX.INFO[sel]?.cat || '') + '. Veja o registro completo.' : `Visto${firstSeen ? ` ${esc(naZona(firstSeen))}` : ''}. Capture um pra liberar o registro completo.`}</p>
            </div></div>
          <div class="plate dexlist"><ul class="scroll" style="flex:1">
            ${shown.map((id) => {
              const i = ids.indexOf(id), s = state.dex.seen[id], c = state.dex.caught[id];
              return `<li><button class="drow${i === nav.dexSel ? ' on' : ''}" data-cmd="dexSel" data-i="${i}">
                <span class="cur">${i === nav.dexSel ? '▶' : ''}</span><span class="no">${dexNo(id).replace('Nº ', 'Nº')}</span>
                <span class="ic">${spr(id, { size: 28, silhouette: !s })}</span><span class="nm dts">${s ? esc(G.SPECIES[id].name) : '???'}</span>
                ${c ? capIcon() : s ? '<span class="tag flat">VISTO</span>' : ''}</button></li>`;
            }).join('') || '<li class="muted" style="padding:10px;font-size:14px;font-weight:600">Nenhum nesse filtro.</li>'}
          </ul></div>`,
        foot: `<button class="tbtn slate" data-cmd="dexFilter">${svg('filter', 16)}Filtrar</button>
          <span class="hint dts grow">${{ all: 'Todos', caught: 'Capturados', seen: 'Vistos' }[nav.dexFilter]} · Ordem: Nº</span>
          <button class="tbtn orange" data-cmd="dexEntry" ${seen ? '' : 'disabled'}>Ver registro</button>${closeBtn()}`,
      };
    },

    entry() {
      const ids = G.SPECIES_ORDER;
      const sel = ids[nav.dexSel] || ids[0];
      const sp = G.SPECIES[sel], info = DX.INFO[sel] || {};
      const seen = state.dex.seen[sel], caught = state.dex.caught[sel];
      if (!seen) { nav.screen = 'dex'; return screens.dex(); }
      const inTeam = state.team.filter((c) => c.species === sel).length;
      const zones = G.ZONES.filter((z) => z.pool[sel]);
      let right;
      if (nav.dexTab === 'area') {
        right = `<span class="lbl">ONDE APARECE</span>
          ${zones.length ? zones.map((z) => {
            const total = Object.values(z.pool).reduce((t, w) => t + w, 0);
            return `<div class="lrow"><span class="t"><b>${esc(z.name)}</b><span>nível ${z.levels[0]}–${z.levels[1]}</span></span><span class="tag">${Math.round((z.pool[sel] / total) * 100)}%</span></div>`;
          }).join('') : '<p class="muted" style="margin:0;font-size:14px;font-weight:600">Não aparece na natureza. Evolui de outra espécie.</p>'}
          ${sp.evolvesTo ? `<span class="muted" style="font-size:13px;font-weight:600;margin-top:auto">Evolui para ${esc(G.SPECIES[sp.evolvesTo].name)} no nível ${sp.evolveLevel}.</span>` : ''}`;
      } else if (nav.dexTab === 'size') {
        const ref = 1.6; // treinador
        const hMax = Math.max(ref, info.height || 1);
        right = `<span class="lbl">TAMANHO COMPARADO A UMA PESSOA (1,6 m)</span>
          <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;gap:40px;padding:8px 0 4px;border-bottom:3px solid #c4c8b8">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:26px;height:${Math.round((ref / hMax) * 150)}px;background:#6a7890;border-radius:13px 13px 4px 4px"></div><span class="muted" style="font-size:12px;font-weight:600">Você</span></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="height:${Math.max(18, Math.round(((info.height || 0.5) / hMax) * 150))}px;display:flex;align-items:flex-end">${spr(sel, { size: Math.max(18, Math.min(150, Math.round(((info.height || 0.5) / hMax) * 150))) })}</div><span class="muted" style="font-size:12px;font-weight:600">${esc(sp.name)}</span></div>
          </div>
          <div style="display:flex;gap:8px"><div class="stat"><span class="lbl">ALTURA</span><b class="dts">${DX.height(sel)}</b></div><div class="stat"><span class="lbl">PESO</span><b class="dts">${DX.weight(sel)}</b></div></div>`;
      } else {
        const firstSeen = state.dex.seenAt?.[sel];
        right = `<div style="display:flex;gap:8px"><div class="stat"><span class="lbl">ALTURA</span><b class="dts">${DX.height(sel)}</b></div><div class="stat"><span class="lbl">PESO</span><b class="dts">${DX.weight(sel)}</b></div></div>
          <div style="display:flex;gap:8px"><div class="stat"><span class="lbl">HABITAT</span><b class="dts" style="font-size:15px">${esc(info.habitat || '—')}</b></div><div class="stat" style="flex:0 0 76px"><span class="lbl">NA EQUIPE</span><b class="dts" style="font-size:15px">${inTeam}</b></div></div>
          <div class="prose"><p>${caught ? esc(info.desc || '') : 'Capture um pra ler o registro completo.'}</p></div>
          <span class="muted" style="font-size:12px;font-weight:600;line-height:1">${firstSeen ? `Visto pela 1ª vez ${esc(naZona(firstSeen))}` : 'Visto por aí'}</span>`;
      }
      return {
        head: tabs([['reg', 'REGISTRO'], ['area', 'ÁREA'], ['size', 'TAMANHO']], nav.dexTab, 'dextab') + `<span class="num-pill" style="margin-left:auto">${dexNo(sel)}</span>`,
        body: `<div class="plate left-plate">${portrait(sel, { corner: caught ? `<span class="corner">${capIcon(8, 10)}CAPTURADO</span>` : '' })}
            <div class="meta"><h2 class="dts" style="font-size:22px">${esc(sp.name)}</h2><span class="muted" style="font-size:13px;font-weight:600;line-height:1">${esc(info.cat || '')}</span>
              <div style="display:flex;gap:6px">${typeBadge(sp.type)}</div></div></div>
          <div class="plate right-plate">${right}</div>`,
        foot: `<button class="tbtn slate sq" data-cmd="dexPrev" aria-label="Anterior">${svg('left', 14)}</button>
          <span class="hint dts">${String(nav.dexSel + 1).padStart(3, '0')} / ${String(ids.length).padStart(3, '0')}</span>
          <button class="tbtn slate sq" data-cmd="dexNext" aria-label="Próximo">${svg('right', 14)}</button>
          <span class="grow"></span>
          <button class="tbtn orange" data-cmd="cry" data-species="${sel}">${svg('sound', 16)}Ouvir</button>${closeBtn('Voltar', 'back')}`,
      };
    },

    zones() {
      const open = G.unlockedZones(state).map((z) => z.id);
      return {
        head: tabs(SECTIONS.opts.tabs, 'zones') + sects('opts'),
        body: `<div class="plate panel"><div class="scroll"><div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            ${G.ZONES.map((z, i) => {
              const ok = open.includes(z.id), here = state.zone === z.id;
              return `<button class="zonecard${here ? ' on' : ''}" data-cmd="zone" data-id="${z.id}" ${ok ? '' : 'disabled'}>
                <span class="pv"><i style="background:#c4e6f6"></i><i style="background:${z.color}"></i></span>
                <span class="zt"><b>${i + 1} · ${esc(z.name)}</b><span>${here ? '<span class="tag gold">AQUI</span>' : ok ? `nv ${z.levels[0]}–${z.levels[1]}` : `🔒 nv ${z.unlock}`}</span></span></button>`;
            }).join('')}</div></div></div>`,
        foot: `<span class="hint dts grow">Zonas novas abrem quando o líder sobe de nível.</span>${closeBtn()}`,
      };
    },

    settings() {
      const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
      const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;
      return {
        head: tabs(SECTIONS.opts.tabs, 'settings') + sects('opts'),
        body: `<div class="plate panel"><div class="scroll">
            <div class="setrow"><span>Captura<small>Quando lançar cápsulas sozinho</small></span><select id="catchMode">${Object.entries(G.CATCH_MODES).map(([id, l]) => opt(id, l, state.settings.catchMode)).join('')}</select></div>
            <div class="setrow"><span>Comprar cápsulas sozinho<small>Compra 5 quando acabam</small></span>${sw('autoBuy', state.settings.autoBuy)}</div>
            <div class="setrow"><span>Aprender golpes sozinho<small>Troca o mais fraco por um melhor</small></span>${sw('autoMoves', state.settings.autoMoves !== false)}</div>
            <div class="setrow"><span>Sprites e tiles<small>${A.list().length} arquivo(s) customizado(s)</small></span><span style="display:flex;gap:5px"><button class="tbtn slate sm" data-cmd="openSprites">Pasta</button><button class="tbtn slate sm" data-cmd="reloadSprites">Recarregar</button></span></div>
            <div class="setrow"><span>Estatísticas<small>${state.stats.wins} vitórias · ${state.stats.battles} batalhas · ${state.stats.caught} capturas${state.stats.hatched ? ` · ${state.stats.hatched} ovos` : ''}</small></span></div>
            <div class="setrow"><span>Recomeçar<small>Apaga todo o progresso</small></span><button class="tbtn red sm" data-cmd="reset">Recomeçar</button></div>
          </div></div>`,
        foot: `<span class="hint dts grow">Bandeja: mover a faixa, largura e monitor.</span>${closeBtn()}`,
      };
    },
  };

  function currentScreen() {
    if (!state.starterChosen) return 'starters';
    if (state.battle && state.battle.ask && askSeen) return 'encounter';
    return nav.screen;
  }

  function renderBottom() {
    const name = currentScreen();
    const s = (screens[name] || screens.team)();
    const scroll = bottom.querySelector('.scroll');
    const keep = scroll ? scroll.scrollTop : 0;
    bottom.innerHTML = s.raw || `<div class="head">${s.head}</div><div class="body">${s.body}</div><div class="foot">${s.foot}</div>`;
    const sc = bottom.querySelector('.scroll');
    if (sc && name === bottom.dataset.screen) sc.scrollTop = keep;
    bottom.dataset.screen = name;
    renderEggs();
    bindInputs();
  }

  function renderEggs() {
    for (const e of state.eggs || []) {
      const el = bottom.querySelector(`[data-egg="${e.id}"]`);
      if (!el) continue;
      const k = e.progress / e.need;
      el.querySelector('.egg-bar').style.width = `${Math.round(k * 100)}%`;
      el.querySelector('.egg-hint').textContent = k > 0.85 ? 'quase chocando!' : k > 0.5 ? 'se mexendo…' : 'vai demorar';
      el.querySelector('.egg-left').textContent = `~${Math.max(0, Math.ceil((e.need - e.progress) / 60))} min`;
    }
  }

  function bindInputs() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('change', fn); };
    on('catchMode', (e) => send({ type: 'catchMode', value: e.target.value }));
    on('autoBuy', (e) => send({ type: 'autoBuy', value: e.target.checked }));
    on('autoMoves', (e) => send({ type: 'autoMoves', value: e.target.checked }));
  }

  // ---------- popup (golpe / MT / trocar golpes) ----------
  function moveDetails(id, c = null) {
    const m = G.MOVES[id];
    const tm = Object.keys(G.TMS).find((t) => G.TMS[t].move === id);
    const learners = G.SPECIES_ORDER.map((sp) => {
      const ls = G.LEARNSETS[sp] || {};
      const lv = Object.keys(ls).map(Number).sort((a, b) => a - b).find((l) => ls[l].includes(id));
      return lv == null ? null : `<span class="chip">${state.dex.seen[sp] ? esc(G.SPECIES[sp].name) : '???'} nv${lv}</span>`;
    }).filter(Boolean);
    return `<div class="md-head" style="border-left:9px solid ${TYPE_DS[m.type]};padding-left:8px"><h3 class="dts">${esc(m.name)}</h3>${typeBadge(m.type, true)}<span class="tag">${G.CATEGORY[m.cat].label.toUpperCase()}</span></div>
      <div class="md-stats">
        <div class="stat"><span class="lbl">PODER</span><b>${m.cat === 'status' ? '—' : m.power}</b></div>
        <div class="stat"><span class="lbl">PRECISÃO</span><b>${m.acc == null ? 'sempre' : `${m.acc}%`}</b></div>
        <div class="stat"><span class="lbl">PP</span><b>${c && c.pp?.[id] != null ? `${c.pp[id]}/${m.pp}` : m.pp}</b></div>
        <div class="stat"><span class="lbl">PRIORIDADE</span><b>${m.priority ? `+${m.priority}` : '0'}</b></div>
      </div>
      <ul class="desc">${G.describeMove(id).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${learners.length ? `<div class="chips"><span class="lbl">APRENDEM:</span>${learners.join('')}</div>` : ''}
      ${tm ? `<div class="chips"><span class="lbl">MÁQUINA:</span><button class="chip" data-cmd="tmInfo" data-tm="${tm}">${tm.toUpperCase()}${G.hasTm(state, tm) ? ' ✓' : ''}</button></div>` : ''}`;
  }

  function renderModal() {
    if (!modalState || !state) return;
    let body = '';
    const close = `<button class="tbtn blue sm" data-cmd="closeModal">Fechar</button>`;
    if (modalState.kind === 'move') {
      body = `<div class="scroll">${moveDetails(modalState.id, byUid(modalState.uid))}</div><div style="display:flex;justify-content:flex-end">${close}</div>`;
    } else if (modalState.kind === 'moves') {
      const c = byUid(modalState.uid);
      if (!c) { modal.close(); return; }
      const draft = modalState.draft;
      body = `<div class="md-head"><h3 class="dts">Golpes de ${esc(G.SPECIES[c.species].name)}</h3><span class="tag dark">${draft.length}/4</span></div>
        <div class="scroll"><div class="moves">${c.known.map((id) => {
          const m = G.MOVES[id], on = draft.includes(id);
          return `<button class="move" style="--t:${TYPE_DS[m.type]};${on ? 'background:#fde8c8;border-color:#e8892a' : ''}" data-cmd="pick" data-move="${id}" ${!on && draft.length >= 4 ? 'disabled' : ''}>
            <b>${on ? '✓ ' : ''}${esc(m.name)}</b><span>${G.CATEGORY[m.cat].icon} ${m.cat === 'status' ? '—' : m.power} · ${esc(G.TYPE_LABEL[m.type])}</span></button>`;
        }).join('')}</div></div>
        <div style="display:flex;justify-content:flex-end;gap:6px"><button class="tbtn green sm" data-cmd="saveMoves" ${draft.length ? '' : 'disabled'}>Salvar</button>${close}</div>`;
    } else {
      const t = modalState.id, tm = G.TMS[t];
      const have = G.hasTm(state, t);
      const fits = all().filter((c) => G.canLearnTm(c, t));
      body = `<div class="md-head"><span class="num-pill">${t.toUpperCase()}</span>
          ${have ? '<span class="tag gold">VOCÊ TEM</span>' : tm.price != null ? `<button class="tbtn green sm" data-cmd="buyTm" data-tm="${t}" ${state.coins < tm.price ? 'disabled' : ''}>Comprar · ${fmt(tm.price)}</button>` : `<span class="tag">EXCLUSIVA · ${esc(tm.drop.map((z) => zoneOf(z).name).join(', '))}</span>`}</div>
        <div class="scroll">${moveDetails(tm.move)}
          <span class="lbl">QUEM PODE APRENDER</span>
          ${fits.length ? fits.map((c) => {
            const knows = c.moves.includes(tm.move), teaching = modalState.teaching === c.uid;
            let action;
            if (knows) action = '<span class="muted">já sabe</span>';
            else if (!have) action = '<span class="muted">pode aprender</span>';
            else if (c.moves.length < 4) action = `<button class="tbtn green sm" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}">Ensinar</button>`;
            else action = `<button class="tbtn ${teaching ? 'slate' : 'green'} sm" data-cmd="teachPick" data-uid="${c.uid}">${teaching ? 'Cancelar' : 'Ensinar…'}</button>`;
            return `<div class="trow">${spr(c.species, { shiny: c.shiny, size: 26 })}<span class="grow">${esc(G.SPECIES[c.species].name)} <span class="muted">nv${c.level}</span></span>${action}</div>
              ${teaching ? `<span class="muted" style="font-size:12px;font-weight:600">Esquecer qual golpe?</span><div class="swaps">${c.moves.map((id) => `<button class="tbtn slate sm" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}" data-replace="${id}">${esc(G.MOVES[id].name)}</button>`).join('')}</div>
                <button class="tbtn slate sm" data-cmd="teach" data-tm="${t}" data-uid="${c.uid}">Só aprender (guardar)</button>` : ''}`;
          }).join('') : '<p class="muted" style="margin:0;font-size:13px;font-weight:600">Ninguém da equipe ou caixa pode aprender.</p>'}
        </div><div style="display:flex;justify-content:flex-end">${close}</div>`;
    }
    modal.innerHTML = `<div class="md">${body}</div>`;
  }
  function openModal(st) {
    modalState = st;
    renderModal();
    if (!modal.open) modal.showModal();
  }
  modal.addEventListener('close', () => { modalState = null; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // grito do bicho no "Ouvir": um piado sintetizado diferente por espécie
  function cry(species) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const i = G.SPECIES_ORDER.indexOf(species) + 1;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = ['square', 'sawtooth', 'triangle'][i % 3];
      const f0 = 220 + ((i * 97) % 500);
      o.frequency.setValueAtTime(f0, ac.currentTime);
      o.frequency.linearRampToValueAtTime(f0 * 1.6, ac.currentTime + 0.12);
      o.frequency.linearRampToValueAtTime(f0 * 0.8, ac.currentTime + 0.35);
      g.gain.setValueAtTime(0.08, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.45);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.5);
    } catch { /* sem áudio */ }
  }

  // ---------- estado / render ----------
  function go(screen, extra = {}) {
    nav = { ...nav, ...extra, screen };
    for (const [sect, s] of Object.entries(SECTIONS)) {
      if ((s.tabs || []).some(([id]) => id === screen) || (sect === 'dex' && (screen === 'dex' || screen === 'entry'))) nav.sect = sect;
    }
    if (screen === 'summary') nav.sect = 'team';
    saveNav();
    rerender();
  }
  function goSection(sect) {
    const first = { team: 'team', bag: 'shop', dex: 'dex', opts: 'zones' }[sect] || 'team';
    askSeen = false; // sair da tela de ações
    go(first);
  }
  const rerender = () => { lastKey = ''; if (state) onState(state); };

  function onState(s) {
    state = s;
    // a pergunta de captura apareceu: tela de baixo vira "Escolha uma ação" (uma vez por pergunta)
    const ask = s.battle && s.battle.ask ? `${s.battle.species}:${s.battle.ask}:${s.battle.tries}` : '';
    if (ask && ask !== onState.lastAsk) askSeen = true;
    if (!ask) askSeen = false;
    onState.lastAsk = ask;
    renderTop();
    const key = JSON.stringify({
      ...s, battle: s.battle ? { ask: s.battle.ask, caps: s.battle.caps, species: s.battle.species } : null, resting: null, lastSaved: null,
      v: A.version, nav, boxFilter, boxSort, sel: [...selected], modal: modalState, askSeen,
      team: s.team.map((c) => [c.uid, c.species, c.level, c.xp, Math.round(c.hp), c.moves, c.known, c.status, c.effort, c.held, c.locked, Object.values(c.pp || {})]),
      eggs: (s.eggs || []).map((e) => e.id), box: s.box.map((c) => [c.uid, c.level, c.locked]),
    });
    if (key !== lastKey) {
      lastKey = key;
      renderBottom();
      renderModal();
    } else {
      renderEggs();
    }
  }

  // ---------- eventos ----------
  function onClick(e) {
    const b = e.target.closest('[data-cmd]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    switch (d.cmd) {
      case 'sect': goSection(d.sect); break;
      case 'tab':
        if (d.screen) go(d.screen);
        else if (d.sumtab) { nav.sumTab = d.sumtab; saveNav(); rerender(); }
        else if (d.dextab) { nav.dexTab = d.dextab; saveNav(); rerender(); }
        break;
      case 'close': bridge.windowControl('close'); break;
      case 'back': go(nav.screen === 'entry' ? 'dex' : nav.from === 'box' ? 'box' : 'team'); break;
      case 'summary': go('summary', { uid: d.uid, from: d.from || 'team', sumTab: nav.sumTab || 'info' }); break;
      case 'sumPrev': case 'sumNext': {
        const c = byUid(nav.uid);
        const list = c && state.box.includes(c) ? state.box : state.team;
        const i = list.indexOf(c);
        const n = list[(i + (d.cmd === 'sumNext' ? 1 : -1) + list.length) % list.length];
        if (n) go('summary', { uid: n.uid });
        break;
      }
      case 'starter': send({ type: 'chooseStarter', species: d.species }); break;
      case 'setLead': send({ type: 'setLead', uid: d.uid }); break;
      case 'toBox': send({ type: 'move', uid: d.uid, to: 'box' }); nav.from = 'box'; break;
      case 'toTeam': send({ type: 'move', uid: d.uid, to: 'team' }); nav.from = 'team'; break;
      case 'zone': send({ type: 'zone', id: d.id }); break;
      case 'buy': send({ type: 'buy', item: d.item, qty: Number(d.qty) }); break;
      case 'grit': send({ type: 'grit', uid: d.uid, stat: d.stat }); break;
      case 'moveInfo': openModal({ kind: 'move', id: d.move, uid: d.uid || null }); break;
      case 'tmInfo': openModal({ kind: 'tm', id: d.tm, teaching: null }); break;
      case 'editMoves': { const c = byUid(d.uid); if (c) openModal({ kind: 'moves', uid: c.uid, draft: [...c.moves] }); break; }
      case 'pick': {
        const dr = modalState.draft, id = d.move;
        if (dr.includes(id)) modalState.draft = dr.filter((x) => x !== id);
        else if (dr.length < 4) dr.push(id);
        renderModal();
        break;
      }
      case 'saveMoves': send({ type: 'setMoves', uid: modalState.uid, moves: modalState.draft }); modal.close(); break;
      case 'closeModal': modal.close(); break;
      case 'buyTm': send({ type: 'buyTm', tm: d.tm }); break;
      case 'teachPick': modalState.teaching = modalState.teaching === d.uid ? null : d.uid; renderModal(); break;
      case 'teach': send({ type: 'teachTm', tm: d.tm, uid: d.uid, replace: d.replace || null }); modalState.teaching = null; break;
      case 'catchYes': send({ type: 'throw' }); break;
      case 'catchNo': send({ type: 'catchAnswer', yes: false }); askSeen = false; break;
      case 'lock': send({ type: 'lock', uid: d.uid }); break;
      case 'sel': if (selected.has(d.uid)) selected.delete(d.uid); else selected.add(d.uid); rerender(); break;
      case 'selFiltered': state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).forEach((c) => selected.add(c.uid)); rerender(); break;
      case 'release': {
        const uids = selected.size ? [...selected].filter((u) => !byUid(u)?.locked)
          : state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).map((c) => c.uid);
        const shinies = state.box.filter((c) => uids.includes(c.uid) && c.shiny).length;
        if (uids.length && confirm(`Soltar ${uids.length} criatura(s)${shinies ? `, incluindo ${shinies} brilhante(s)` : ''}? Não dá pra desfazer.`)) {
          send({ type: 'release', uids });
          uids.forEach((u) => selected.delete(u));
        }
        break;
      }
      case 'daycarePut': send({ type: 'daycarePut', uid: d.uid }); break;
      case 'daycareTake': send({ type: 'daycareTake', uid: d.uid }); break;
      case 'dexSel': nav.dexSel = Number(d.i); saveNav(); rerender(); break;
      case 'dexEntry': go('entry', { dexTab: 'reg' }); break;
      case 'dexPrev': case 'dexNext': {
        const ids = G.SPECIES_ORDER;
        let i = nav.dexSel;
        for (let n = 0; n < ids.length; n++) { // pula os ainda não vistos
          i = (i + (d.cmd === 'dexNext' ? 1 : -1) + ids.length) % ids.length;
          if (state.dex.seen[ids[i]]) break;
        }
        nav.dexSel = i; saveNav(); rerender();
        break;
      }
      case 'dexFilter': nav.dexFilter = { all: 'caught', caught: 'seen', seen: 'all' }[nav.dexFilter]; saveNav(); rerender(); break;
      case 'cry': cry(d.species); break;
      case 'openSprites': bridge.openSpritesFolder(); break;
      case 'reloadSprites': bridge.reloadAssets(); break;
      case 'reset': if (confirm('Apagar todo o progresso e começar de novo?')) send({ type: 'reset' }); break;
      default: break;
    }
  }
  bottom.addEventListener('click', (e) => {
    // clique no cartão da caixa abre o resumo, mas não quando é no quadradinho/cadeado
    if (e.target.closest('.ck, .lk')) { e.stopPropagation(); onClick({ target: e.target.closest('.ck, .lk') }); return; }
    onClick(e);
  });
  modal.addEventListener('click', onClick);
  bottom.addEventListener('change', (e) => {
    const ds = e.target.dataset || {};
    if (ds.f !== undefined) { boxFilter[ds.f] = e.target.value; rerender(); return; }
    if (ds.sort !== undefined) { boxSort = e.target.value; rerender(); return; }
    if (ds.hold) send({ type: 'hold', uid: ds.hold, item: e.target.value || null });
  });
  document.querySelectorAll('[data-win]').forEach((b) => b.addEventListener('click', () => bridge.windowControl(b.dataset.win)));
  if (bridge.onGoto) bridge.onGoto((sect) => goSection(sect));

  A.onChange(() => { topKey = ''; rerender(); });
  await A.load();
  bridge.onState(onState);
  bridge.requestState();
})();
