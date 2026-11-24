// Painéis do Layout B (design "Taskmon · interface retrô", TbhDesktopB). Cada janela mostra um tipo,
// vindo de panel.html?w=<tipo>: status, equipe, mapa, caixa (Baú), creche, loja, dex, ajustes ou
// topbar (moedas, cápsulas e atalhos). Não guarda estado do jogo: recebe cópias da faixa e devolve
// comandos. O bicho escolhido (EQUIPE/Baú) é compartilhado entre as janelas.

(async () => {
  'use strict';
  const G = window.Game;
  const A = window.Assets;
  const DX = window.DexInfo;
  const bridge = window.bridge;
  const $ = (id) => document.getElementById(id);
  const KIND = new URLSearchParams(location.search).get('w') || 'equipe';
  const body = $('body'), hdr = $('hdr'), modal = $('modal');

  const META = {
    status: ['Nº01', 'STATUS'], equipe: ['Nº02', 'EQUIPE'], mapa: ['Nº03', 'MAPA'], caixa: ['Nº04', 'BAÚ'],
    creche: ['Nº05', 'CRECHE'], loja: ['Nº06', 'LOJA'], dex: ['Nº07', 'DEX'], ajustes: ['Nº08', 'AJUSTES'],
  };
  document.title = `Taskmon · ${(META[KIND] || ['', 'Painel'])[1]}`;

  let state = null, lastKey = '', pinned = false;
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };
  // preferências desta janela (aba, vista, seleção do mapa/dex...)
  let ui = { bag: 'itens', view: 'list', genes: false, move: null, zone: null, shop: 'itens', dexSel: 0, dexTab: 'reg', dexFilter: 'all', mark: false, ...store.get(`taskmon-ui-${KIND}`, {}) };
  const saveUi = () => store.set(`taskmon-ui-${KIND}`, ui);
  let sel = store.get('taskmon-sel', null); // uid do bicho escolhido (compartilhado)
  let boxFilter = { species: '', nature: '', natureNot: '', minIv: '', maxIv: '', shiny: '', gender: '' };
  let boxSort = 'recent';
  const marked = new Set(); // marcados pra soltar
  let modalState = null;

  const send = (cmd) => bridge.sendCommand(cmd);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const zoneOf = (id) => G.ZONES.find((z) => z.id === id) || G.ZONES[0];
  const all = () => [...state.team, ...state.box];
  const byUid = (u) => (state ? all().find((c) => c.uid === u) || null : null);
  const dexNo = (sp) => `Nº${String(G.SPECIES_ORDER.indexOf(sp) + 1).padStart(3, '0')}`;
  const naZona = (id) => { const n = zoneOf(id).name; return `${/a$/i.test(n) ? 'na' : 'no'} ${n}`; };
  const caps = () => (state.items.capsula || 0) + (state.items.super || 0);
  const hpColor = (r) => (r < 0.25 ? '#c0402e' : r < 0.5 ? '#e0a040' : '#6f9a4a');
  const pct = (r) => `${(G.clamp(r, 0, 1) * 100).toFixed(1)}%`;

  /** O bicho escolhido (ou o líder). */
  function current() {
    const c = byUid(sel);
    return c || G.getLead(state) || state.team[0] || null;
  }
  function select(uid) {
    sel = uid;
    store.set('taskmon-sel', uid);
    bridge.selectCreature(uid);
    rerender();
  }

  // ---------- peças visuais ----------
  const TYPE_B = { normal: '#6a6f66', fogo: '#a0482e', agua: '#3a6a9a', planta: '#4f7a3a', eletrico: '#b08a20', pedra: '#7a5230', voador: '#6a5a9a' };
  const typeBadge = (t) => `<span class="tb" style="background:${TYPE_B[t]}">${G.TYPE_LABEL[t].toUpperCase()}</span>`;
  const gender = (c, size = 15) => (c && c.gender ? `<span class="g-${c.gender === 'F' ? 'f' : 'm'}" style="font-size:${size}px;line-height:1">${c.gender === 'F' ? '♀' : '♂'}</span>` : '');
  const statusTag = (st) => (st ? `<span class="st" style="background:${G.STATUS[st].color}">${G.STATUS[st].short}</span>` : '');

  // ícones de pixel do design: [caminho, viewBox]
  const ICON = {
    x: ['M0 0h2v1h1v1h2V1h1V0h2v2H7v1H6v2h1v1h1v2H6V7H5V6H3v1H2v1H0V6h1V5h1V3H1V2H0z', '0 0 8 8'],
    swap: ['M5 0h1v1h1v1h1v1H7v1H6v1H5V3H0V2h5zM2 3h1v2h5v1H3v2H2V7H1V6H0V5h1V4h1z', '0 0 8 8'],
    gear: ['M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zM3 3v2h2V3z', '0 0 8 8'],
    chest: ['M1 1h6v1h1v6H0V2h1zM1 4v3h6V4zM3 3h2v2H3z', '0 0 8 8'],
    sword: ['M6 0h2v2H7v1H6v1H5v1H4v1H3v1H2v1H0V6h1V5h1V4h1V3h1V2h1V1h1z', '0 0 8 8'],
    dex: ['M0 1h10v8H0zM1 2h3v6H1zM6 2h3v6H6z', '0 0 10 10'],
    map: ['M2 0h4v1h1v1h1v4H7v1H6v1H2V7H1V6H0V2h1V1h1zM4 2h1v2H4zM3 4h1v2H3z', '0 0 8 8'],
    cart: ['M0 0h2v1h6v3H2v1h5v1H1V1H0zM2 7h1v1H2zM5 7h1v1H5z', '0 0 8 8'],
    pin: ['M2 0h4v1H5v3h2v1H1V4h2V1H2zM3 5h2v1H4v2H3V6H3z', '0 0 8 8'],
    sound: ['M0 3h2v2H0zM2 2h1v4H2zM3 1h1v6H3zM5 2h1v1H5zM6 1h1v1H6zM5 5h1v1H5zM6 6h1v1H6zM6 3h2v2H6z', '0 0 8 8'],
    mute: ['M0 3h2v2H0zM2 2h1v4H2zM3 1h1v6H3zM5 2h1v1H5zM7 2h1v1H7zM6 3h1v2H6zM5 5h1v1H5zM7 5h1v1H7z', '0 0 8 8'],
    exit: ['M3 0h2v4H3zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z', '0 0 8 8'],
    zoom: ['M1 0h3v1h1v3H4v1H1V4H0V1h1zM1 1v3h3V1zM5 5h1v1h1v1h1v1H7V7H6V6H5z', '0 0 8 8'],
    grid: ['M0 0h3v3H0zM4 0h3v3H4zM0 4h3v3H0zM4 4h3v3H4z', '0 0 7 7'],
    list: ['M0 0h1v1H0zM2 0h5v1H2zM0 3h1v1H0zM2 3h5v1H2zM0 6h1v1H0zM2 6h5v1H2z', '0 0 7 7'],
    left: ['M3 0h1v6H3zM2 1h1v4H2zM1 2h1v2H1z', '0 0 6 6'],
    right: ['M2 0h1v6H2zM3 1h1v4H3zM4 2h1v2H4z', '0 0 6 6'],
  };
  const svg = (name, size = 16) => {
    const [d, vb] = ICON[name];
    const [, , w, h] = vb.split(' ').map(Number);
    return `<svg width="${size}" height="${Math.round((size * h) / w)}" viewBox="${vb}" shape-rendering="crispEdges" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="${d}"/></svg>`;
  };
  const EGG = '../assets/b/ovo.png';
  const COIN = '../assets/b/moeda.png';

  /** Folha de sprite como <span> (anima com CSS em degraus). */
  function spr(id, { size = 48, shiny = false, silhouette = false, flip = false, item = false, cls = '' } = {}) {
    const sheet = item ? A.item(id) : A.creature(id, shiny);
    const k = (size / Math.max(sheet.fw, sheet.fh)) * (item ? 1 : sheet.size);
    const w = Math.round(sheet.fw * k), h = Math.round(sheet.fh * k);
    const url = silhouette ? A.silhouetteUrl(id) : A.sheetUrl(sheet);
    const n = silhouette ? 1 : sheet.frames;
    const style = `width:${w}px;height:${h}px;--n:${n};--dur:${(n / sheet.fps).toFixed(3)}s;background-image:url(${url})`;
    return `<span class="spr-box ${cls}" style="width:${size}px;height:${size}px"><i class="spr${n > 1 ? ' anim' : ''}${flip ? ' flip' : ''}" style="${style}"></i></span>`;
  }
  const capIcon = (w = 16, h = 20) => {
    const f = A.ui('capsule');
    return f ? `<img class="px" src="${f.img.src}" width="${w}" height="${h}" alt="">` : spr('capsula', { item: true, size: h });
  };

  /** Retrato do design: céu, faixa, chão, sombra e o bicho; `foot` é a barrinha de baixo. */
  function portrait(species, { shiny = false, dark = false, foot = '', width = 168 } = {}) {
    return `<div class="portrait" style="width:${width}px;height:100%">
      <div class="band"></div><div class="gnd"></div><div class="shd"></div>
      <div class="who">${spr(species, { shiny, size: 96, silhouette: dark, cls: dark ? '' : 'bob' })}</div>
      <span class="cnr" style="left:4px;top:4px;border-left-width:2px;border-top-width:2px"></span>
      <span class="cnr" style="right:4px;top:4px;border-right-width:2px;border-top-width:2px"></span>
      ${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
  }

  // ---------- cabeçalho ----------
  function header() {
    if (KIND === 'topbar') return;
    const [no, title] = META[KIND] || ['', 'PAINEL'];
    const extra = KIND === 'equipe'
      ? `<button class="hb hb-s" data-cmd="next" title="Trocar bicho" aria-label="Trocar bicho" style="left:0">${svg('swap')}</button>
         <button class="hb hb-s" data-cmd="open" data-to="ajustes" title="Ajustes" aria-label="Ajustes" style="right:44px">${svg('gear')}</button>`
      : `<span class="tag ss" aria-hidden="true">${no}</span>`;
    hdr.innerHTML = `<div class="rail" aria-hidden="true"></div>${extra}
      <div class="plo"><div class="pli"><h2>${title}</h2></div></div>
      <button class="hb hb-x" data-cmd="close" title="Fechar" aria-label="Fechar ${title.toLowerCase()}">${svg('x', 14)}</button>`;
  }

  // ---------- STATUS ----------
  function viewStatus() {
    const c = current();
    if (!c) return '<p class="muted">Escolha um parceiro primeiro.</p>';
    const sp = G.SPECIES[c.species], st = G.stats(c), max = G.maxHp(c), need = G.xpToNext(c.level);
    const nat = G.NATURES[c.nature] || {};
    let sheet;
    if (ui.genes) {
      sheet = `<div style="height:24px;display:flex;align-items:center;gap:8px"><span class="ss" style="font-size:10px;color:#5a4a36">NATUREZA</span>
          <b style="font-size:15px">${esc(nat.name || '—')}</b>${nat.up ? `<span style="font-size:13px;color:#5a4a36">+${esc(G.STAT_LABEL[nat.up])} −${esc(G.STAT_LABEL[nat.down])}</span>` : ''}
          <span class="ss" style="margin-left:auto;font-size:10px;color:#5a4a36">IV ${G.ivPercent(c)}%</span></div>
        ${G.STAT_KEYS.map((k) => {
          const iv = c.ivs[k], ef = c.effort[k], item = G.gritFor(ef), have = item ? state.items[item] || 0 : 0;
          const r = iv >= 31 ? 5 : iv >= 30 ? 4 : iv >= 26 ? 3 : iv >= 16 ? 2 : iv >= 1 ? 1 : 0;
          const mark = nat.up === k ? '<span class="up">▲</span>' : nat.down === k ? '<span class="down">▼</span>' : '';
          return `<div class="gene"><span class="k">${esc(G.STAT_LABEL[k].toUpperCase().slice(0, 9))}${mark}</span><span class="v">${st[k]}</span>
            <span class="iv r${r}" title="IV ${iv}/31">${esc(G.ivRating(iv))}</span>
            <span class="pips" title="Esforço ${ef}/${G.EFFORT_MAX}">${Array.from({ length: G.EFFORT_MAX }, (_, i) => `<i class="${i < ef ? 'on' : ''}"></i>`).join('')}</span>
            <button class="grit" data-cmd="grit" data-uid="${c.uid}" data-stat="${k}" ${item && have ? '' : 'disabled'} title="${item ? `Usar ${esc(G.SHOP[item].name)} (tem ${have})` : 'Esforço no máximo'}">+</button></div>`;
        }).join('')}`;
    } else {
      const S = (l, v) => `<dt>${l}</dt><dd>${v}</dd>`;
      sheet = `<dl>${S('HP', `${Math.ceil(c.hp)}/${max}`)}${S('ATAQUE', st.atk)}${S('DEFESA', st.def)}${S('VELOC.', st.spd)}${S('MAGIA', st.mag)}${S('RESIST.', st.res)}</dl>`;
    }
    const moves = Array.from({ length: 4 }, (_, i) => c.moves[i] || null);
    if (!c.moves.includes(ui.move)) ui.move = c.moves[0] || null;
    const m = ui.move && G.MOVES[ui.move];
    const ppColor = (id) => { const mm = G.MOVES[id], left = c.pp?.[id] ?? mm.pp; return left / mm.pp < 0.25 ? '#c0402e' : left / mm.pp < 0.5 ? '#e0a040' : '#a8b0a8'; };
    // aprende em breve: próximos golpes por nível (e a evolução)
    const ls = G.LEARNSETS[c.species] || {};
    const soon = [];
    Object.keys(ls).map(Number).filter((l) => l > c.level).sort((a, b) => a - b)
      .forEach((l) => ls[l].forEach((id) => { if (!c.known.includes(id)) soon.push({ l, id }); }));
    const evo = sp.evolvesTo && c.level < sp.evolveLevel ? `<div class="soon"><span class="ss gold" style="width:40px;font-size:11px">NV${sp.evolveLevel}</span><span class="grow" style="font-size:15px;font-weight:600">Evolui pra ${esc(G.SPECIES[sp.evolvesTo].name)}</span>${typeBadge(G.SPECIES[sp.evolvesTo].type)}</div>` : '';
    const fresh = c.known.length - c.moves.length;
    return `
      <div class="sheet" style="flex-shrink:0;position:relative;padding:0 16px 0 48px">
        <div style="height:24px;display:flex;align-items:center;gap:6px"><span style="font-size:19px;font-weight:700;line-height:1">${esc(sp.name)}${c.shiny ? ' ✦' : ''}</span>${gender(c)}${statusTag(c.status)}
          <span class="ss" style="margin-left:auto;font-size:13px;line-height:1">NV${c.level}</span></div>
        <div style="height:24px;display:flex;align-items:center;gap:8px"><span class="ss" style="font-size:10px;color:#5a4a36;width:30px">EXP</span>
          <div style="flex:1;height:8px;box-sizing:border-box;border:1px solid #2a251c;background:#c4baa2"><div style="width:${pct(c.xp / need)};height:100%;background:#3a6a9a"></div></div>
          <span style="font-size:13px;font-weight:600">${fmt(c.xp)} / ${fmt(need)}</span></div>
        ${sheet}
        <button data-cmd="genes" title="${ui.genes ? 'Ver atributos' : 'Ver genes (IV, esforço, natureza)'}" aria-label="Detalhes" style="position:absolute;left:4px;top:2px;width:26px;height:26px;padding:0;background:${ui.genes ? '#e0a040' : '#262c32'};border:2px solid #0a0c0e;color:${ui.genes ? '#1b1608' : '#e0a040'};display:flex;align-items:center;justify-content:center">${svg('zoom', 14)}</button>
      </div>
      <div class="inset" style="height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 6px 0 12px">
        <h3 class="h3">GOLPES</h3><button class="pk sm" data-cmd="editMoves" data-uid="${c.uid}">TROCAR${fresh > 0 ? ` · ${fresh} NOVO${fresh > 1 ? 'S' : ''}` : ''}</button></div>
      <div style="height:156px;flex-shrink:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px">
        ${moves.map((id) => {
          if (!id) return '<div class="mv empty ss" style="font-size:10px">—</div>';
          const mm = G.MOVES[id];
          return `<button class="mv${id === ui.move ? ' on' : ''}" style="--t:${TYPE_B[mm.type]}" data-cmd="mv" data-move="${id}" title="${id === ui.move ? 'Clique de novo pra ver tudo' : esc(mm.name)}">
            <span class="sh" style="font-size:18px;font-weight:600;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${esc(mm.name)}</span>
            <span style="display:flex;align-items:center;gap:8px;width:100%">${typeBadge(mm.type)}
              <span class="ss" style="font-size:10px;color:#a8b0a8">${mm.cat === 'status' ? 'STATUS' : `POD ${mm.power}`}</span>
              <span class="ss" style="margin-left:auto;font-size:11px;color:${ppColor(id)}">PP ${c.pp?.[id] ?? mm.pp}</span></span></button>`;
        }).join('')}
      </div>
      <div class="inset" style="height:74px;flex-shrink:0;padding:9px 12px;display:flex;flex-direction:column;gap:6px;overflow:hidden">
        ${m ? `<span class="ss gold" style="font-size:11px;line-height:1">${esc(m.name.toUpperCase())} · ${esc(G.TYPE_LABEL[m.type].toUpperCase())} · ${m.cat === 'status' ? 'STATUS' : `POD ${m.power}`} · PREC ${m.acc == null ? '—' : `${m.acc}%`}</span>
          <p class="prose" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(G.describeMove(ui.move).join(' · '))}</p>` : '<span class="muted">Sem golpes.</span>'}
      </div>
      <div class="inset" style="flex:1;min-height:0;padding:8px 12px;display:flex;flex-direction:column;gap:2px;overflow:hidden">
        <span class="ss" style="font-size:11px;letter-spacing:1px;color:#a8b0a8;line-height:16px">APRENDE EM BREVE</span>
        ${soon.slice(0, evo ? 3 : 4).map(({ l, id }) => {
          const mm = G.MOVES[id];
          return `<div class="soon"><span class="ss gold" style="width:40px;font-size:11px">NV${l}</span><span class="grow" style="font-size:15px;font-weight:600">${esc(mm.name)}</span>${typeBadge(mm.type)}
            <span class="ss" style="width:52px;text-align:right;font-size:10px;color:#a8b0a8">${mm.cat === 'status' ? '—' : `POD ${mm.power}`}</span></div>`;
        }).join('')}${evo}
        ${!soon.length && !evo ? '<span class="muted" style="font-size:14px;padding-top:6px">Nada novo por nível. Ensine golpes com MTs (Loja).</span>' : ''}
      </div>`;
  }

  // ---------- EQUIPE ----------
  function viewStarters() {
    return `<div class="inset" style="padding:10px 12px"><h3 class="h3">ESCOLHA SEU PARCEIRO</h3><p class="prose muted" style="margin-top:6px">Ele anda logo acima da barra de tarefas e luta sozinho.</p></div>
      <div class="starters">${G.STARTERS.map((id) => {
        const sp = G.SPECIES[id];
        return `<div class="rowp starter"><div style="height:120px">${portrait(id, { width: 140 })}</div>
          <div class="grow" style="display:flex;flex-direction:column;gap:8px"><span class="sh" style="font-size:20px;font-weight:600;color:#f2ecd8">${esc(sp.name)}</span>
          <div>${typeBadge(sp.type)}</div><span class="muted" style="font-size:13px">${esc(DX.INFO[id]?.cat || '')}</span>
          <button class="tab tab-on" style="height:34px;align-self:flex-start" data-cmd="starter" data-species="${id}">ESCOLHER</button></div></div>`;
      }).join('')}</div>`;
  }

  function bagItems(c) {
    if (ui.bag === 'segurar') {
      return Object.entries(G.HELD).filter(([id]) => (state.items[id] || 0) > 0 || c?.held === id).map(([id, it]) => ({
        id, kind: 'held', name: it.name, desc: it.desc, qty: state.items[id] || 0, held: c?.held === id,
        icon: spr(id, { item: true, size: 28 }), bg: '#52401a', hi: '#e0a040', cmd: 'hold',
      }));
    }
    if (ui.bag === 'mts') {
      return Object.keys(G.TMS).filter((t) => G.hasTm(state, t)).map((t) => {
        const m = G.MOVES[G.TMS[t].move];
        return { id: t, kind: 'tm', name: `${t.toUpperCase()} · ${m.name}`, desc: `${G.TYPE_LABEL[m.type]} · ${m.cat === 'status' ? 'status' : `poder ${m.power}`} · ensine pra quem puder`, qty: '∞', icon: `<span class="ss" style="font-size:10px;color:#f2ecd8">MT</span>`, bg: TYPE_B[m.type], hi: 'rgba(255,255,255,.3)', cmd: 'tmInfo' };
      });
    }
    return Object.entries(G.SHOP).filter(([id]) => (state.items[id] || 0) > 0).map(([id, it]) => ({
      id, kind: it.grit ? 'grit' : 'cap', name: it.name, qty: state.items[id],
      desc: it.grit ? `Esforço nível ${it.grit[0]}${it.grit[1] !== it.grit[0] ? `–${it.grit[1]}` : ''} → +1 (use no STATUS)` : `${it.mult}× chance de captura`,
      icon: spr(id, { item: true, size: 28 }), bg: it.grit ? '#3a4a5a' : '#2a4048', hi: it.grit ? '#8ab8e8' : '#6fc0c0', cmd: it.grit ? 'gritOpen' : '',
    }));
  }

  function viewEquipe() {
    if (!state.starterChosen) return viewStarters();
    const c = current();
    const lead = G.getLead(state);
    const sp = G.SPECIES[c.species];
    const max = G.maxHp(c), r = c.hp / max;
    const inTeam = state.team.includes(c);
    const nat = G.NATURES[c.nature] || {};
    const held = c.held && G.HELD[c.held];
    const items = bagItems(c);
    const actions = inTeam
      ? `${c.uid !== lead?.uid ? `<button class="pk sm" data-cmd="setLead" data-uid="${c.uid}" title="Definir como líder">★ LÍDER</button>` : '<span class="pk sm on" style="display:inline-flex;align-items:center">★ LÍDER</span>'}
         <button class="pk sm" data-cmd="toBox" data-uid="${c.uid}" ${state.team.length <= 1 ? 'disabled' : ''} title="Mandar pro Baú">BAÚ</button>`
      : `<button class="pk sm green" data-cmd="toTeam" data-uid="${c.uid}" ${state.team.length >= G.TEAM_MAX ? 'disabled' : ''}>→ EQUIPE</button>`;
    return `
      <div class="show">
        ${portrait(c.species, { shiny: c.shiny, foot: `<span class="ss gold" style="font-size:12px;line-height:1">NV${c.level}</span><div class="bar grow"><i style="width:${pct(r)};background:${hpColor(r)}"></i></div><span class="ss" style="font-size:10px;line-height:1">HP</span>` })}
        <div class="grow" style="display:flex;flex-direction:column;justify-content:space-between">
          <div style="display:flex;align-items:baseline;gap:6px"><span class="sh" style="font-size:20px;font-weight:600;color:#f2ecd8;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sp.name)}${c.shiny ? ' ✦' : ''}</span>${gender(c)}</div>
          <div style="display:flex;gap:6px;align-items:center">${typeBadge(sp.type)}${statusTag(c.status)}<span class="grow"></span>${actions}</div>
          <div style="display:grid;grid-template-columns:82px minmax(0,1fr);row-gap:4px;align-items:baseline">
            <span class="ss" style="font-size:10px;color:#8a8f86">NATUREZA</span><span style="font-size:15px;font-weight:600">${esc(nat.name || '—')}${nat.up ? ` <span class="muted" style="font-size:12px">+${esc(G.STAT_LABEL[nat.up].slice(0, 3))} −${esc(G.STAT_LABEL[nat.down].slice(0, 3))}</span>` : ''}</span>
            <span class="ss" style="font-size:10px;color:#8a8f86">GENES</span><span style="font-size:15px;font-weight:600">IV ${G.ivPercent(c)}%${c.locked ? ' · 🔒' : ''}</span>
          </div>
          <div class="held">
            <button class="ico${held ? '' : ' none'}" data-cmd="heldPick" data-uid="${c.uid}" title="Trocar item segurado">${held ? spr(c.held, { item: true, size: 32 }) : '<span class="ss muted" style="font-size:16px">+</span>'}</button>
            <span style="display:flex;flex-direction:column;gap:3px;min-width:0">
              <span class="ss" style="font-size:9px;letter-spacing:1px;color:#8a8f86;line-height:1">ITEM SEGURADO</span>
              <span style="font-size:15px;font-weight:600;color:#f2ecd8;line-height:1">${held ? esc(held.name) : 'Nenhum'}</span>
              <span class="ss gold" style="font-size:9px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${held ? esc(held.desc.toUpperCase()) : 'CLIQUE PRA DAR UM ITEM'}</span></span>
          </div>
        </div>
      </div>
      <div class="party">${Array.from({ length: G.TEAM_MAX }, (_, i) => {
        const m = state.team[i];
        if (!m) return '<div class="slot empty"></div>';
        const rr = m.hp / G.maxHp(m);
        return `<button class="slot${m.uid === lead?.uid ? ' lead' : ''}${m.uid === c.uid ? ' on pulse' : ''}" data-cmd="select" data-uid="${m.uid}" title="${esc(G.SPECIES[m.species].name)} NV${m.level}">
          ${m.uid === lead?.uid ? '<span class="crown">★</span>' : ''}${spr(m.species, { shiny: m.shiny, size: 32 })}
          <span class="hp"><i style="width:${pct(rr)};background:${hpColor(rr)}"></i></span></button>`;
      }).join('')}</div>
      <div style="height:32px;flex-shrink:0;display:flex;gap:6px;align-items:center">
        ${[['itens', 'ITENS'], ['segurar', 'SEGURAR'], ['mts', 'MTs']].map(([id, l]) => `<button class="pk${ui.bag === id ? ' on' : ''}" data-cmd="bag" data-bag="${id}" aria-pressed="${ui.bag === id}">${l}</button>`).join('')}
        <button class="vt${ui.view === 'grid' ? ' on' : ''}" data-cmd="view" data-view="grid" aria-label="Ver em grade" style="margin-left:auto">${svg('grid', 14)}</button>
        <button class="vt${ui.view === 'list' ? ' on' : ''}" data-cmd="view" data-view="list" aria-label="Ver em lista">${svg('list', 14)}</button>
      </div>
      <div class="inset scroll" style="flex:1;min-height:0;padding:2px">
        ${!items.length ? `<p class="muted" style="margin:10px;font-size:14px">${ui.bag === 'mts' ? 'Nenhuma MT ainda. Compre na Loja ou ache em batalha.' : ui.bag === 'segurar' ? 'Nenhum item de segurar. Tem na Loja.' : 'Mochila vazia. Compre cápsulas na Loja.'}</p>`
          : ui.view === 'grid'
            ? `<div class="bagcells">${items.map((b) => `<button class="cell" style="background:${b.bg};box-shadow:inset 0 3px 0 ${b.hi},inset -2px -2px 0 rgba(0,0,0,.4)${b.held ? ';outline:2px solid #e0a040' : ''}" data-cmd="${b.cmd}" data-id="${b.id}" data-uid="${c.uid}" title="${esc(b.name)} — ${esc(b.desc)}">${b.icon}<span class="qty">${b.qty}</span></button>`).join('')}</div>`
            : `<ul style="margin:0;padding:0;list-style:none">${items.map((b) => `<li><button class="lrow" data-cmd="${b.cmd}" data-id="${b.id}" data-uid="${c.uid}">
                <span class="ico" style="background:${b.bg};box-shadow:inset 0 3px 0 ${b.hi},inset -2px -2px 0 rgba(0,0,0,.4)">${b.icon}</span>
                <span class="grow" style="display:flex;flex-direction:column;gap:3px"><span style="display:flex;align-items:center;gap:6px"><span class="nm">${esc(b.name)}</span>${b.held ? '<span class="ss" style="font-size:9px;color:#1b1608;background:#e0a040;padding:1px 4px;line-height:1.2">SEGURADO</span>' : ''}</span>
                <span class="ds">${esc(b.desc)}</span></span><span class="ss" style="font-size:13px;color:#d8dcd6">${b.qty}</span></button></li>`).join('')}</ul>`}
      </div>
      <nav class="menu" aria-label="Menu">
        <button class="sq" data-cmd="open" data-to="caixa" title="Baú (${state.box.length})" aria-label="Baú">${svg('chest', 24)}</button>
        <button class="sq" data-cmd="open" data-to="creche" title="Creche" aria-label="Creche"><img class="px" src="${EGG}" width="20" height="24" alt=""></button>
        <button class="sq" data-cmd="open" data-to="status" title="Golpes e status" aria-label="Golpes">${svg('sword', 24)}</button>
        <button class="sq" data-cmd="open" data-to="dex" title="Dex" aria-label="Dex">${svg('dex', 24)}</button>
        <button class="sq" data-cmd="open" data-to="mapa" title="Mapa" aria-label="Mapa">${svg('map', 24)}</button>
        <button class="sq" data-cmd="open" data-to="loja" title="Loja" aria-label="Loja">${svg('cart', 24)}</button>
      </nav>`;
  }

  // ---------- MAPA ----------
  // posições dos lugares no mapa (px do design, 438×350) e nomes das regiões
  const MAP_POS = { campina: [64, 274], lago: [168, 182], caverna: [292, 232], vulcao: [318, 92] };
  const DIFF = [['FÁCIL', '#6f9a4a'], ['MÉDIO', '#e0a040'], ['DIFÍCIL', '#d0743a'], ['PERIGOSO', '#c0402e']];
  function areaOf(z) {
    return Object.entries(z.pool).sort((a, b) => b[1] - a[1]).map(([id]) => id)
      .filter((id) => !G.SPECIES[id].legendary || state.dex.seen[id]).slice(0, 4);
  }
  function viewMapa() {
    const open = G.unlockedZones(state).map((z) => z.id);
    const zsel = zoneOf(ui.zone || state.zone);
    const zi = G.ZONES.indexOf(zsel);
    const here = state.zone === zsel.id, locked = !open.includes(zsel.id);
    const ids = areaOf(zsel);
    const caught = ids.filter((id) => state.dex.caught[id]).length;
    const pine = (x, y, s = 21) => `<use href="#pine" x="${x}" y="${y}" width="${s}" height="${Math.round(s * 9 / 7)}"/>`;
    const route = G.ZONES.map((z) => MAP_POS[z.id]);
    const seg = (a, b) => `M${a[0] + 12} ${a[1] + 12}L${b[0] + 12} ${b[1] + 12}`;
    const path = route.slice(1).map((p, i) => seg(route[i], p)).join('');
    return `
      <div class="inset legend">${G.ZONES.map((z, i) => `<div style="display:flex;align-items:center;gap:8px"><span class="sw" style="background:${DIFF[i][1]}"></span><span class="ss" style="font-size:11px;color:#d8dcd6;letter-spacing:1px">${esc(z.name.toUpperCase())}</span><span style="margin-left:auto;font-size:13px;color:#a8b0a8">${open.includes(z.id) ? `${z.levels[0]}–${z.levels[1]}` : `🔒 NV${z.unlock}`}</span></div>`).join('')}</div>
      <div class="inset map"><div style="position:absolute;left:0;top:0;width:438px;height:350px">
        <svg width="438" height="350" viewBox="0 0 438 350" role="img" aria-label="Mapa das zonas" style="position:absolute;left:0;top:0;display:block">
          <defs><symbol id="pine" viewBox="0 0 7 9"><rect x="3" y="0" width="1" height="1" fill="#2e3f24"/><rect x="2" y="1" width="3" height="2" fill="#4f6a3e"/><rect x="1" y="3" width="5" height="2" fill="#4f6a3e"/><rect x="0" y="5" width="7" height="2" fill="#4f6a3e"/><rect x="2" y="1" width="1" height="2" fill="#6f8a58"/><rect x="0" y="6" width="7" height="1" fill="#2e3f24"/><rect x="3" y="7" width="1" height="2" fill="#5a4030"/></symbol></defs>
          <rect width="438" height="350" fill="#cfc8ad"/>
          <g stroke="#c2ba9c" stroke-width="1" shape-rendering="crispEdges"><path d="M40 0V350M80 0V350M120 0V350M160 0V350M200 0V350M240 0V350M280 0V350M320 0V350M360 0V350M400 0V350M0 40H438M0 80H438M0 120H438M0 160H438M0 200H438M0 240H438M0 280H438M0 320H438"/></g>
          <rect x="236" y="0" width="202" height="350" fill="#c4bc9e" opacity=".55"/>
          <g fill="none" stroke="#a89f80" stroke-width="2"><path d="M300 50C330 26 400 40 402 90C404 140 340 150 312 128C284 106 276 72 300 50Z"/><path d="M318 66C338 52 380 62 380 92C380 120 344 126 326 112C308 98 300 78 318 66Z"/><path d="M262 210C286 196 340 206 340 246C340 280 298 286 278 274C258 262 244 226 262 210Z"/></g>
          <ellipse cx="128" cy="214" rx="38" ry="20" fill="#86a8ad" stroke="#4d6f75" stroke-width="3"/><ellipse cx="118" cy="208" rx="14" ry="5" fill="#a8c4c8"/>
          <path d="M0 150C40 160 80 190 100 205" fill="none" stroke="#4d6f75" stroke-width="4"/><path d="M0 150C40 160 80 190 100 205" fill="none" stroke="#86a8ad" stroke-width="2"/>
          <path d="M236 0C222 80 252 160 242 230C234 290 270 320 284 350" fill="none" stroke="#7a705a" stroke-width="2" stroke-dasharray="3 5"/>
          <path d="M330 70L346 48L362 70Z" fill="#a0482e" stroke="#5a2a1a" stroke-width="2"/><rect x="342" y="40" width="8" height="6" fill="#e0a040"/>
          <g fill="none" stroke-linecap="square"><path d="${path}" stroke="#5a4e38" stroke-width="9"/><path d="${path}" stroke="#a8986e" stroke-width="5"/></g>
          <g>${pine(20, 220)}${pine(44, 196)}${pine(110, 268)}${pine(14, 290, 18)}${pine(150, 300, 18)}${pine(200, 250, 18)}${pine(60, 120, 18)}${pine(190, 110, 18)}</g>
          <text x="14" y="338" font-family="Silkscreen, monospace" font-size="15" fill="#8a8066" letter-spacing="2">VALE VERDE</text>
          <text x="250" y="24" font-family="Silkscreen, monospace" font-size="15" fill="#8a8066" letter-spacing="2">SERRA QUENTE</text>
          <g transform="translate(410 190)"><path d="M0 -16L5 0L0 -3L-5 0Z" fill="#8a2e24"/><path d="M0 16L5 0L0 3L-5 0Z" fill="#3a3428"/><text x="-4" y="-20" font-family="Silkscreen, monospace" font-size="10" fill="#3a3428">N</text></g>
        </svg>
        ${G.ZONES.map((z, i) => {
          const [x, y] = MAP_POS[z.id];
          const ok = open.includes(z.id), on = z.id === zsel.id;
          const right = x < 260;
          return `<button class="node${on ? ' pulse' : ''}" data-cmd="zsel" data-id="${z.id}" title="${esc(z.name)}" style="left:${x}px;top:${y}px;width:24px;height:24px;background:${ok ? DIFF[i][1] : '#8a8f86'};${ok ? '' : 'transform:rotate(45deg) scale(.8);'}"></button>
            <span class="mlbl" style="left:${right ? x + 30 : x - 156}px;top:${y + 2}px;align-items:${right ? 'flex-start' : 'flex-end'}"><b>${esc(z.name.toUpperCase())}</b><span>${ok ? `NV ${z.levels[0]}–${z.levels[1]}` : `🔒 NV ${z.unlock}`}</span></span>`;
        }).join('')}
        ${(() => { const [x, y] = MAP_POS[state.zone] || MAP_POS.campina; return `<svg width="22" height="26" viewBox="0 0 13 15" shape-rendering="crispEdges" aria-label="Você está aqui" style="position:absolute;left:${x + 6}px;top:${y - 24}px"><rect x="1" y="0" width="2" height="15" fill="#0a0c0e"/><rect x="3" y="1" width="9" height="6" fill="#0a0c0e"/><rect x="3" y="2" width="8" height="4" fill="#c0402e"/><rect x="3" y="2" width="8" height="1" fill="#e06a52"/></svg>`; })()}
      </div></div>
      <div class="inset zinfo">
        <div style="display:flex;align-items:center;gap:8px"><h3 class="ss sh" style="margin:0;font-size:15px;font-weight:400;letter-spacing:1px;color:#ead9b0">${esc(zsel.name.toUpperCase())}</h3>
          <span class="diff" style="background:${DIFF[zi][1]}">${DIFF[zi][0]}</span><span class="ss gold" style="margin-left:auto;font-size:13px">NV ${zsel.levels[0]}–${zsel.levels[1]}</span></div>
        <span style="font-size:13px;color:#a8b0a8;line-height:1">${here ? 'Você está aqui.' : locked ? `Abre quando o líder chegar no nível ${zsel.unlock}.` : `Zona ${zi + 1} de ${G.ZONES.length} · ${Object.keys(zsel.pool).length} espécies por aqui`}</span>
        <div style="display:flex;align-items:flex-end;gap:8px;margin-top:auto">
          <div style="display:flex;flex-direction:column;gap:5px"><span class="lbl">BICHOS DA ÁREA · DEX ${caught}/${ids.length}</span>
            <div style="display:flex;gap:6px">${ids.map((id) => {
              const seen = state.dex.seen[id];
              return `<span class="acell" style="background:${seen ? '#9fb8b8' : '#20262b'}" title="${seen ? esc(G.SPECIES[id].name) : '???'}">${spr(id, { size: 32, silhouette: !seen })}${state.dex.caught[id] ? '<span class="got"></span>' : ''}</span>`;
            }).join('')}</div></div>
          <button class="tab tab-on" data-cmd="zone" data-id="${zsel.id}" ${here || locked ? 'disabled' : ''} style="margin-left:auto;height:44px;padding:0 14px;flex-direction:column;gap:3px">
            <span style="font-size:14px;line-height:1">VIAJAR</span><span style="font-family:'Pixelify Sans',monospace;font-size:11px;letter-spacing:0;line-height:1">${here ? 'você está aqui' : locked ? 'bloqueado' : 'vai agora mesmo'}</span></button>
        </div>
      </div>`;
  }

  // ---------- BAÚ ----------
  function viewCaixa() {
    const box = state.box;
    for (const u of [...marked]) if (!box.some((c) => c.uid === u)) marked.delete(u);
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
    const c = byUid(sel);
    const inBox = c && box.includes(c);
    return `
      <div class="filters">
        <select data-f="species">${opt('', 'Espécie', boxFilter.species)}${species.map((s) => opt(s, esc(G.SPECIES[s].name), boxFilter.species)).join('')}</select>
        <select data-f="natureNot">${opt('', 'Nat. é', boxFilter.natureNot)}${opt('1', 'Nat. não é', boxFilter.natureNot)}</select>
        <select data-f="nature">${opt('', 'qualquer', boxFilter.nature)}${opt('_neutral', 'neutra', boxFilter.nature)}${Object.entries(G.NATURES).filter(([, n]) => n.up).map(([id, n]) => opt(id, esc(n.name), boxFilter.nature)).join('')}</select>
        <select data-f="shiny">${opt('', '✦ tanto faz', boxFilter.shiny)}${opt('only', 'só ✦', boxFilter.shiny)}${opt('no', 'sem ✦', boxFilter.shiny)}</select>
        IV <input type="number" min="0" max="100" placeholder="0" data-f="minIv" value="${esc(boxFilter.minIv)}"> A <input type="number" min="0" max="100" placeholder="100" data-f="maxIv" value="${esc(boxFilter.maxIv)}">
        <select data-sort>${opt('recent', 'Recentes', boxSort)}${opt('species', 'Espécie', boxSort)}${opt('level', 'Nível', boxSort)}${opt('iv', 'IV', boxSort)}</select>
      </div>
      <div class="inset scroll" style="flex:1;min-height:0">
        ${list.length ? `<div class="boxgrid">${list.slice(0, 280).map((m) => `<button class="cell${marked.has(m.uid) ? ' sel' : ''}${m.uid === sel ? ' on' : ''}" data-cmd="boxCell" data-uid="${m.uid}" title="${esc(G.SPECIES[m.species].name)} NV${m.level} · IV ${G.ivPercent(m)}%${m.locked ? ' · trancado' : ''}">
            <span class="lv">${m.level}</span>${spr(m.species, { shiny: m.shiny, size: 32 })}<span class="mk">${m.locked ? '🔒' : marked.has(m.uid) ? '✓' : ''}</span></button>`).join('')}</div>`
          : `<p class="muted" style="margin:12px;font-size:14px">${box.length ? 'Nada passa nesse filtro.' : 'O Baú está vazio. Quando a equipe enche, as capturas vêm pra cá.'}</p>`}
      </div>
      <div class="inset" style="padding:8px 10px;display:flex;align-items:center;gap:8px;flex-shrink:0;min-height:52px">
        ${inBox ? `${spr(c.species, { shiny: c.shiny, size: 32 })}<span class="grow" style="display:flex;flex-direction:column;gap:3px"><b style="font-size:15px;color:#f2ecd8">${esc(G.SPECIES[c.species].name)}${c.shiny ? ' ✦' : ''} ${gender(c, 13)}</b><span class="ss muted" style="font-size:9px">NV${c.level} · IV ${G.ivPercent(c)}% · ${esc(G.NATURES[c.nature]?.name || '')}</span></span>
          <button class="pk sm" data-cmd="lock" data-uid="${c.uid}">${c.locked ? 'DESTRANCAR' : 'TRANCAR'}</button>
          <button class="pk sm green" data-cmd="toTeam" data-uid="${c.uid}" ${state.team.length >= G.TEAM_MAX ? 'disabled' : ''}>→ EQUIPE</button>
          <button class="pk sm" data-cmd="open" data-to="status">STATUS</button>`
          : '<span class="muted grow" style="font-size:13px">Clique num bicho pra ver ou mover. Ligue MARCAR pra escolher quem soltar.</span>'}
      </div>
      <div class="foot">
        <span class="ss muted grow" style="font-size:10px">${marked.size} ✓ · ${list.length} NO FILTRO · ${box.length} NO BAÚ</span>
        <button class="pk sm${ui.mark ? ' on' : ''}" data-cmd="markMode" aria-pressed="${ui.mark}">MARCAR</button>
        <button class="pk sm" data-cmd="markFiltered">MARCAR FILTRO</button>
        <button class="pk sm red" data-cmd="release" ${marked.size || releasable ? '' : 'disabled'}>SOLTAR${marked.size ? ` (${marked.size})` : ''}</button>
      </div>`;
  }

  // ---------- CRECHE ----------
  function viewCreche() {
    const dc = state.daycare || { mons: [] };
    const eggs = state.eggs || [];
    const [a, b] = dc.mons;
    const ch = G.breedChance(a, b);
    const full = dc.mons.length >= G.DAYCARE_MAX;
    const slot = (c) => (c ? `<div class="rowp dcslot">${spr(c.species, { shiny: c.shiny, size: 48 })}<b style="font-size:15px;color:#f2ecd8">${esc(G.SPECIES[c.species].name)} ${gender(c, 13)}</b><span class="ss muted" style="font-size:9px">NV${c.level}${c.held ? ` · ${esc(G.HELD[c.held].name.toUpperCase())}` : ''}</span>
        <button class="pk sm" data-cmd="daycareTake" data-uid="${c.uid}">BUSCAR</button></div>` : '<div class="rowp dcslot empty">VAGA LIVRE</div>');
    return `
      <div class="dcslots">${slot(a)}<span class="heart${ch ? ' on' : ''}">${ch >= 0.5 ? '♥♥' : ch ? '♥' : '·'}</span>${slot(b)}</div>
      <div class="inset" style="padding:8px 12px;flex-shrink:0"><span style="font-size:14px;color:#d8dcd6">${esc(dc.mons.length < 2 ? 'Deixe um casal do mesmo grupo de ovo (macho e fêmea).' : G.breedMood(ch))}</span></div>
      <div class="inset" style="flex-shrink:0;padding:4px 4px">
        <div style="padding:4px 8px"><span class="lbl">OVOS ${eggs.length}/${G.EGGS_MAX}</span></div>
        ${eggs.length ? eggs.map((e) => {
          const k = e.progress / e.need;
          return `<div class="egg"><img class="px" src="${EGG}" width="24" height="28" alt="Ovo">
            <span class="grow" style="display:flex;flex-direction:column;gap:4px"><span style="font-size:14px;font-weight:600;color:#f2ecd8">Ovo <span class="muted" style="font-size:12px">${k > 0.85 ? 'quase chocando!' : k > 0.5 ? 'se mexendo…' : 'vai demorar'}</span></span>
            <span class="eggbar"><i style="width:${Math.round(k * 100)}%"></i></span></span>
            <span class="ss" style="font-size:10px;color:#d8dcd6;text-align:right">FALTAM<br>${fmt(Math.ceil((e.need - e.progress) * 2))} PASSOS</span></div>`;
        }).join('') : '<p class="muted" style="margin:4px 8px 8px;font-size:13px">Sem ovos. Eles chocam sozinhos com o tempo de jogo.</p>'}
      </div>
      <div class="inset scroll" style="flex:1;min-height:0;padding:2px">
        <div style="padding:6px 8px"><span class="lbl">DEIXAR NA CRECHE</span></div>
        ${all().map((c) => {
          const fit = a && !b ? G.breedChance(a, c) : null;
          return `<div class="lrow">${spr(c.species, { shiny: c.shiny, size: 28 })}<span class="grow" style="display:flex;flex-direction:column;gap:2px"><span class="nm" style="font-size:15px">${esc(G.SPECIES[c.species].name)} ${gender(c, 13)}</span>
            <span class="ds">NV${c.level}${state.team.includes(c) ? ' · equipe' : ' · baú'}${fit != null ? ` · ${fit >= 0.5 ? '♥♥ se dão muito bem' : fit ? '♥ se dão bem' : '✕ não combinam'}` : ''}</span></span>
            <button class="pk sm" data-cmd="daycarePut" data-uid="${c.uid}" ${full || (state.team.includes(c) && state.team.length <= 1) ? 'disabled' : ''}>DEIXAR</button></div>`;
        }).join('')}
      </div>`;
  }

  // ---------- LOJA ----------
  function viewLoja() {
    const coin = `<img class="px" src="${COIN}" width="16" height="16" alt="moedas">`;
    const row = (id, it, desc, five) => `<div class="lrow"><span class="ico">${spr(id, { item: true, size: 28 })}</span>
      <span class="grow" style="display:flex;flex-direction:column;gap:3px"><span class="nm">${esc(it.name)}</span><span class="ds">${esc(desc)}</span></span>
      <span style="display:flex;align-items:center;gap:4px;font-size:15px;font-weight:600;white-space:nowrap">${coin}${fmt(it.price)}</span>
      <button class="pk sm green" data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
      ${five ? `<button class="pk sm green" data-cmd="buy" data-item="${id}" data-qty="5" ${state.coins < it.price * 5 ? 'disabled' : ''}>+5</button>` : ''}</div>`;
    const capsI = Object.entries(G.SHOP).filter(([, it]) => !it.grit);
    const grit = Object.entries(G.SHOP).filter(([, it]) => it.grit);
    const ids = Object.keys(G.TMS);
    const owned = ids.filter((t) => G.hasTm(state, t)).length;
    const tabs = `<div class="tabs"><button class="tab ${ui.shop === 'itens' ? 'tab-on' : 'tab-off'}" data-cmd="shop" data-tab="itens">ITENS</button>
      <button class="tab ${ui.shop === 'mts' ? 'tab-on' : 'tab-off'}" data-cmd="shop" data-tab="mts">MTs ${owned}/${ids.length}</button>
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:18px;font-weight:600;color:#f2ecd8">${coin}${fmt(state.coins)}</span></div>`;
    if (ui.shop === 'mts') {
      return `${tabs}<div class="inset scroll" style="flex:1;min-height:0"><div class="tmgrid">${ids.map((t) => {
        const tm = G.TMS[t], m = G.MOVES[tm.move], have = G.hasTm(state, t);
        return `<button class="mv tm${have ? ' have' : ''}" style="--t:${TYPE_B[m.type]}" data-cmd="tmInfo" data-id="${t}">
          <span class="ss gold" style="font-size:10px">${t.toUpperCase()}${have ? ' ✓' : ''}</span><span style="font-size:15px;font-weight:600;line-height:1.1">${esc(m.name)}</span>
          <span style="font-size:11px;color:#a8b0a8;line-height:1.1">${have ? 'Você tem' : tm.price != null ? `${fmt(tm.price)} moedas` : `Exclusiva · ${esc(tm.drop.map((z) => zoneOf(z).name).join(', '))}`}</span></button>`;
      }).join('')}</div></div>
      <span class="muted" style="font-size:13px;flex-shrink:0">MTs não se gastam: compre uma vez, ensine pra todos.</span>`;
    }
    return `${tabs}<div class="inset scroll" style="flex:1;min-height:0;padding:2px">
        <div style="padding:6px 8px"><span class="lbl">CÁPSULAS</span></div>${capsI.map(([id, it]) => row(id, it, `tem ${state.items[id] || 0} · ${it.mult}× chance`, true)).join('')}
        <div style="padding:10px 8px 6px"><span class="lbl">ESFORÇO</span></div>${grit.map(([id, it]) => row(id, it, `tem ${state.items[id] || 0} · nível ${it.grit[0]}${it.grit[1] !== it.grit[0] ? `–${it.grit[1]}` : ''} → +1`, true)).join('')}
        <div style="padding:10px 8px 6px"><span class="lbl">ITENS DE SEGURAR</span></div>${Object.entries(G.HELD).map(([id, it]) => row(id, it, `${state.items[id] ? `${state.items[id]} na mochila · ` : ''}${it.desc}`, false)).join('')}
      </div>
      <span class="muted" style="font-size:13px;flex-shrink:0">Dê itens de segurar na EQUIPE (quadradinho do item).</span>`;
  }

  // ---------- DEX ----------
  function viewDex() {
    const ids = G.SPECIES_ORDER;
    if (ui.dexSel >= ids.length) ui.dexSel = 0;
    const id = ids[ui.dexSel];
    const sp = G.SPECIES[id], info = DX.INFO[id] || {};
    const seen = state.dex.seen[id], caught = state.dex.caught[id];
    const nCaught = ids.filter((x) => state.dex.caught[x]).length, nSeen = ids.filter((x) => state.dex.seen[x]).length;
    const shown = ids.filter((x) => (ui.dexFilter === 'caught' ? state.dex.caught[x] : ui.dexFilter === 'seen' ? state.dex.seen[x] : true));
    const firstSeen = state.dex.seenAt?.[id];
    let detail;
    if (!seen) detail = '<p class="prose muted">Ainda não visto. Continue explorando!</p>';
    else if (ui.dexTab === 'area') {
      const zones = G.ZONES.filter((z) => z.pool[id]);
      detail = zones.length ? zones.map((z) => {
        const total = Object.values(z.pool).reduce((t, w) => t + w, 0);
        return `<div style="display:flex;align-items:center;gap:8px;height:22px"><b style="font-size:15px;color:#f2ecd8">${esc(z.name)}</b><span class="muted" style="font-size:13px">nível ${z.levels[0]}–${z.levels[1]}</span><span class="ss gold" style="margin-left:auto;font-size:11px">${Math.round((z.pool[id] / total) * 100)}%</span></div>`;
      }).join('') + (sp.evolvesTo ? `<span class="muted" style="font-size:13px">Evolui pra ${esc(G.SPECIES[sp.evolvesTo].name)} no nível ${sp.evolveLevel}.</span>` : '')
        : `<p class="prose muted">Não aparece na natureza. Evolui de outra espécie.</p>${sp.evolvesTo ? `<span class="muted" style="font-size:13px">Evolui pra ${esc(G.SPECIES[sp.evolvesTo].name)} no nível ${sp.evolveLevel}.</span>` : ''}`;
    } else if (ui.dexTab === 'size') {
      const ref = 1.6, hMax = Math.max(ref, info.height || 1), H = 76;
      detail = `<div style="display:flex;align-items:flex-end;gap:36px;justify-content:center;height:${H + 18}px;border-bottom:2px solid #3a4048">
          <div style="display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:16px;height:${Math.round((ref / hMax) * H)}px;background:#6a7890"></div><span class="ss muted" style="font-size:9px">VOCÊ</span></div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:3px">${spr(id, { size: Math.max(14, Math.min(H, Math.round(((info.height || 0.5) / hMax) * H))) })}<span class="ss muted" style="font-size:9px">${esc(sp.name.toUpperCase())}</span></div></div>
        <span class="muted" style="font-size:12px">Comparado a uma pessoa de 1,6 m.</span>`;
    } else {
      detail = `<p class="prose" style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden">${caught ? esc(info.desc || '') : `Visto${firstSeen ? ` ${esc(naZona(firstSeen))}` : ''}. Capture um pra ler o registro completo.`}</p>`;
    }
    return `
      <div class="show" style="height:168px">
        ${portrait(id, { dark: !seen, foot: `<span class="ss gold" style="font-size:11px;line-height:1">${dexNo(id)}</span><span class="grow"></span><span class="ss" style="font-size:9px;line-height:1">${caught ? 'CAPTURADO' : seen ? 'VISTO' : '???'}</span>` })}
        <div class="grow" style="display:flex;flex-direction:column;gap:7px">
          <span class="sh" style="font-size:22px;font-weight:600;color:#f2ecd8;line-height:1">${seen ? esc(sp.name) : '???'}</span>
          <div style="display:flex;gap:6px">${seen ? typeBadge(sp.type) : ''}</div>
          <span class="muted" style="font-size:13px">${seen ? esc(info.cat || '') : 'Espécie desconhecida'}</span>
          ${seen ? `<div style="display:grid;grid-template-columns:62px 1fr;row-gap:4px;align-items:baseline"><span class="lbl">ALTURA</span><b style="font-size:15px">${DX.height(id)}</b><span class="lbl">PESO</span><b style="font-size:15px">${DX.weight(id)}</b><span class="lbl">HABITAT</span><b style="font-size:14px">${esc(info.habitat || '—')}</b></div>` : ''}
        </div>
      </div>
      <div class="tabs">${[['reg', 'REGISTRO'], ['area', 'ÁREA'], ['size', 'TAMANHO']].map(([t, l]) => `<button class="pk${ui.dexTab === t ? ' on' : ''}" data-cmd="dexTab" data-tab="${t}">${l}</button>`).join('')}
        <button class="pk" data-cmd="cry" data-species="${id}" ${seen ? '' : 'disabled'} style="margin-left:auto;display:flex;align-items:center;gap:5px">${svg('sound', 12)}OUVIR</button></div>
      <div class="inset" style="height:112px;flex-shrink:0;padding:8px 12px;display:flex;flex-direction:column;gap:4px;overflow:hidden">${detail}</div>
      <div class="inset scroll" style="flex:1;min-height:0;padding:2px"><ul style="margin:0;padding:0;list-style:none">
        ${shown.map((x) => {
          const i = ids.indexOf(x), s = state.dex.seen[x], c = state.dex.caught[x];
          return `<li><button class="lrow${i === ui.dexSel ? ' on' : ''}" data-cmd="dexSel" data-i="${i}" style="min-height:36px">
            <span class="ss gold" style="font-size:10px;width:38px">${dexNo(x)}</span>${spr(x, { size: 28, silhouette: !s })}
            <span class="nm grow" style="font-size:15px">${s ? esc(G.SPECIES[x].name) : '???'}</span>${c ? capIcon(10, 12) : s ? '<span class="ss muted" style="font-size:9px">VISTO</span>' : ''}</button></li>`;
        }).join('') || '<li class="muted" style="padding:10px">Nenhum nesse filtro.</li>'}
      </ul></div>
      <div class="foot"><button class="pk sm" data-cmd="dexFilter">FILTRO: ${{ all: 'TODOS', caught: 'CAPTURADOS', seen: 'VISTOS' }[ui.dexFilter]}</button>
        <span class="ss muted grow" style="font-size:10px;text-align:center">${capIcon(8, 10).replace('class="px"', 'class="px" style="display:inline-block;vertical-align:-1px"')} ${nCaught} · VISTOS ${nSeen}</span>
        <button class="vt" data-cmd="dexStep" data-d="-1" aria-label="Anterior">${svg('left', 12)}</button><span class="ss muted" style="font-size:10px">${String(ui.dexSel + 1).padStart(3, '0')}/${String(ids.length).padStart(3, '0')}</span><button class="vt" data-cmd="dexStep" data-d="1" aria-label="Próximo">${svg('right', 12)}</button></div>`;
  }

  // ---------- AJUSTES ----------
  function viewAjustes() {
    const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`;
    const tg = (cmd, on) => `<button class="tgl2 ${on ? 'on' : 'off'}" data-cmd="${cmd}" aria-pressed="${!!on}">${on ? 'ON' : 'OFF'}</button>`;
    const s = state.settings;
    return `<div class="inset scroll" style="flex:1;min-height:0">
        <div class="setrow"><span class="t"><b>Captura</b><small>Quando lançar cápsulas sozinho (AUTO na faixa)</small></span><select id="catchMode">${Object.entries(G.CATCH_MODES).map(([id, l]) => opt(id, l, s.catchMode)).join('')}</select></div>
        <div class="setrow"><span class="t"><b>Comprar cápsulas sozinho</b><small>Compra 5 quando acabam</small></span>${tg('autoBuy', s.autoBuy)}</div>
        <div class="setrow"><span class="t"><b>Aprender golpes sozinho</b><small>Troca o mais fraco por um melhor</small></span>${tg('autoMoves', s.autoMoves !== false)}</div>
        <div class="setrow"><span class="t"><b>Som</b><small>Grito dos bichos na Dex</small></span>${tg('mute', !store.get('taskmon-mute', false))}</div>
        <div class="setrow"><span class="t"><b>Equipe toda na faixa</b><small>Desligado: só o líder anda</small></span>${tg('showTeam', s.showTeam !== false)}</div>
        <div class="setrow"><span class="t"><b>Faixa recolhida</b><small>Só a barrinha com o líder</small></span>${tg('collapse', s.collapsed)}</div>
        <div class="setrow"><span class="t"><b>Sprites e tiles</b><small>${A.list().length} arquivo(s) customizado(s)</small></span><button class="pk sm" data-cmd="openSprites">PASTA</button><button class="pk sm" data-cmd="reloadSprites">RECARREGAR</button></div>
        <div class="setrow"><span class="t"><b>Estatísticas</b><small>${state.stats.wins} vitórias · ${state.stats.battles} batalhas · ${state.stats.caught} capturas${state.stats.hatched ? ` · ${state.stats.hatched} ovos` : ''}</small></span></div>
        <div class="setrow"><span class="t"><b>Recomeçar</b><small>Apaga todo o progresso</small></span><button class="pk sm red" data-cmd="reset">RECOMEÇAR</button></div>
      </div>
      <span class="muted" style="font-size:13px;flex-shrink:0">Bandeja (perto do relógio): mover a faixa, largura, tamanho e monitor.</span>`;
  }

  // ---------- barra de cima ----------
  function viewTopbar() {
    const muted = store.get('taskmon-mute', false);
    return `<div class="bar-wrap">
      <div class="pill" style="padding:0 12px 0 6px;gap:8px"><img class="px" src="${COIN}" width="24" height="24" alt="Moedas"><span class="num sh">${fmt(state.coins)}</span>
        <span style="width:2px;height:18px;background:#3a4048"></span>${capIcon(16, 20)}<span class="num sh">${fmt(caps())}</span></div>
      <div class="pill" style="padding:0 3px;gap:2px">
        <button class="tbi${pinned ? ' on' : ''}" data-cmd="pin" title="${pinned ? 'Soltar janelas' : 'Fixar janelas no topo'}" aria-pressed="${pinned}">${svg('pin')}</button>
        <button class="tbi${muted ? '' : ' on'}" data-cmd="mute" title="${muted ? 'Ligar som' : 'Desligar som'}" aria-pressed="${!muted}">${svg(muted ? 'mute' : 'sound')}</button>
        <button class="tbi" data-cmd="open" data-to="dex" title="Dex">${svg('dex')}</button>
        <button class="tbi" data-cmd="open" data-to="loja" title="Loja">${svg('cart')}</button>
        <button class="tbi" data-cmd="closeAll" title="Fechar painéis">${svg('exit')}</button>
      </div></div>`;
  }

  // ---------- popup (golpe / MT / trocar golpes / item) ----------
  function moveDetails(id, c = null) {
    const m = G.MOVES[id];
    const tm = Object.keys(G.TMS).find((t) => G.TMS[t].move === id);
    const learners = G.SPECIES_ORDER.map((sp) => {
      const ls = G.LEARNSETS[sp] || {};
      const lv = Object.keys(ls).map(Number).sort((a, b) => a - b).find((l) => ls[l].includes(id));
      return lv == null ? null : `<span class="chip">${state.dex.seen[sp] ? esc(G.SPECIES[sp].name) : '???'} nv${lv}</span>`;
    }).filter(Boolean);
    return `<div class="md-head" style="border-left:8px solid ${TYPE_B[m.type]};padding-left:8px"><h3>${esc(m.name)}</h3>${typeBadge(m.type)}<span class="ss muted" style="font-size:10px">${esc(G.CATEGORY[m.cat].label.toUpperCase())}</span></div>
      <div class="md-stats">
        <div class="inset s"><span class="lbl">PODER</span><b>${m.cat === 'status' ? '—' : m.power}</b></div>
        <div class="inset s"><span class="lbl">PRECISÃO</span><b>${m.acc == null ? 'sempre' : `${m.acc}%`}</b></div>
        <div class="inset s"><span class="lbl">PP</span><b>${c && c.pp?.[id] != null ? `${c.pp[id]}/${m.pp}` : m.pp}</b></div>
        <div class="inset s"><span class="lbl">PRIOR.</span><b>${m.priority ? `+${m.priority}` : '0'}</b></div>
      </div>
      <ul>${G.describeMove(id).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      ${learners.length ? `<div class="chips"><span class="lbl">APRENDEM:</span>${learners.join('')}</div>` : ''}
      ${tm ? `<div class="chips"><span class="lbl">MÁQUINA:</span><button class="chip" data-cmd="tmInfo" data-id="${tm}">${tm.toUpperCase()}${G.hasTm(state, tm) ? ' ✓' : ''}</button></div>` : ''}`;
  }

  function renderModal() {
    if (!modalState || !state) return;
    const close = '<button class="pk" data-cmd="closeModal">FECHAR</button>';
    let html = '';
    if (modalState.kind === 'move') {
      html = `<div class="scroll" style="display:flex;flex-direction:column;gap:10px">${moveDetails(modalState.id, byUid(modalState.uid))}</div><div style="display:flex;justify-content:flex-end">${close}</div>`;
    } else if (modalState.kind === 'moves') {
      const c = byUid(modalState.uid);
      if (!c) { modal.close(); return; }
      const draft = modalState.draft;
      html = `<div class="md-head"><h3>Golpes de ${esc(G.SPECIES[c.species].name)}</h3><span class="ss gold" style="margin-left:auto;font-size:12px">${draft.length}/4</span></div>
        <div class="scroll" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">${c.known.map((id) => {
          const m = G.MOVES[id], on = draft.includes(id);
          return `<button class="mv${on ? ' on' : ''}" style="--t:${TYPE_B[m.type]};min-height:58px;gap:4px" data-cmd="pick" data-move="${id}" ${!on && draft.length >= 4 ? 'disabled' : ''}>
            <span style="font-size:15px;font-weight:600">${on ? '✓ ' : ''}${esc(m.name)}</span><span style="display:flex;gap:6px;align-items:center">${typeBadge(m.type)}<span class="ss muted" style="font-size:9px">${m.cat === 'status' ? 'STATUS' : `POD ${m.power}`}</span></span></button>`;
        }).join('')}</div>
        <div style="display:flex;justify-content:flex-end;gap:6px"><button class="pk on" data-cmd="saveMoves" ${draft.length ? '' : 'disabled'}>SALVAR</button>${close}</div>`;
    } else if (modalState.kind === 'held') {
      const c = byUid(modalState.uid);
      if (!c) { modal.close(); return; }
      const owned = Object.keys(G.HELD).filter((id) => (state.items[id] || 0) > 0 && id !== c.held);
      html = `<div class="md-head"><h3>Item de ${esc(G.SPECIES[c.species].name)}</h3></div>
        <div class="inset scroll" style="padding:2px">
          ${c.held && G.HELD[c.held] ? `<button class="lrow on" data-cmd="hold" data-id="" data-uid="${c.uid}"><span class="ico">${spr(c.held, { item: true, size: 28 })}</span><span class="grow" style="display:flex;flex-direction:column;gap:3px"><span class="nm">Tirar ${esc(G.HELD[c.held].name)}</span><span class="ds">volta pra mochila</span></span></button>` : ''}
          ${owned.map((id) => `<button class="lrow" data-cmd="hold" data-id="${id}" data-uid="${c.uid}"><span class="ico">${spr(id, { item: true, size: 28 })}</span><span class="grow" style="display:flex;flex-direction:column;gap:3px"><span class="nm">${esc(G.HELD[id].name)}</span><span class="ds">${esc(G.HELD[id].desc)}</span></span><span class="ss">${state.items[id]}</span></button>`).join('')}
          ${!owned.length && !c.held ? '<p class="muted" style="margin:10px;font-size:14px">Nenhum item de segurar na mochila. Tem na Loja.</p>' : ''}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:6px"><button class="pk" data-cmd="open" data-to="loja">LOJA</button>${close}</div>`;
    } else {
      const t = modalState.id, tm = G.TMS[t];
      const have = G.hasTm(state, t);
      const fits = all().filter((c) => G.canLearnTm(c, t));
      html = `<div class="md-head"><span class="ss gold" style="font-size:14px">${t.toUpperCase()}</span>
          ${have ? '<span class="pk sm on" style="display:inline-flex;align-items:center">VOCÊ TEM</span>' : tm.price != null ? `<button class="pk sm green" data-cmd="buyTm" data-id="${t}" ${state.coins < tm.price ? 'disabled' : ''}>COMPRAR · ${fmt(tm.price)}</button>` : `<span class="ss muted" style="font-size:10px">EXCLUSIVA · ${esc(tm.drop.map((z) => zoneOf(z).name.toUpperCase()).join(', '))}</span>`}</div>
        <div class="scroll" style="display:flex;flex-direction:column;gap:10px">${moveDetails(tm.move)}
          <span class="lbl">QUEM PODE APRENDER</span>
          ${fits.length ? fits.map((c) => {
            const knows = c.moves.includes(tm.move), teaching = modalState.teaching === c.uid;
            let action;
            if (knows) action = '<span class="ss muted" style="font-size:9px">JÁ SABE</span>';
            else if (!have) action = '<span class="ss muted" style="font-size:9px">PODE APRENDER</span>';
            else if (c.moves.length < 4) action = `<button class="pk sm green" data-cmd="teach" data-id="${t}" data-uid="${c.uid}">ENSINAR</button>`;
            else action = `<button class="pk sm${teaching ? '' : ' green'}" data-cmd="teachPick" data-uid="${c.uid}">${teaching ? 'CANCELAR' : 'ENSINAR…'}</button>`;
            return `<div class="lrow" style="cursor:default">${spr(c.species, { shiny: c.shiny, size: 26 })}<span class="grow nm" style="font-size:15px">${esc(G.SPECIES[c.species].name)} <span class="muted" style="font-size:12px">nv${c.level}</span></span>${action}</div>
              ${teaching ? `<span class="muted" style="font-size:12px">Esquecer qual golpe?</span><div class="chips">${c.moves.map((id) => `<button class="pk sm" data-cmd="teach" data-id="${t}" data-uid="${c.uid}" data-replace="${id}">${esc(G.MOVES[id].name)}</button>`).join('')}
                <button class="pk sm" data-cmd="teach" data-id="${t}" data-uid="${c.uid}">SÓ GUARDAR</button></div>` : ''}`;
          }).join('') : '<p class="muted" style="margin:0;font-size:13px">Ninguém da equipe ou do Baú pode aprender.</p>'}
        </div><div style="display:flex;justify-content:flex-end">${close}</div>`;
    }
    modal.innerHTML = `<div class="md">${html}</div>`;
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
    if (store.get('taskmon-mute', false)) return;
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

  // ---------- render ----------
  const VIEWS = { status: viewStatus, equipe: viewEquipe, mapa: viewMapa, caixa: viewCaixa, creche: viewCreche, loja: viewLoja, dex: viewDex, ajustes: viewAjustes };
  const rerender = () => { lastKey = ''; if (state) onState(state); };

  function render() {
    if (KIND === 'topbar') { document.body.innerHTML = viewTopbar(); return; }
    // guarda a rolagem das listas (por posição) pra não pular a cada atualização
    const keep = [...body.querySelectorAll('.scroll')].map((el) => el.scrollTop);
    body.innerHTML = (VIEWS[KIND] || viewEquipe)();
    body.querySelectorAll('.scroll').forEach((el, i) => { if (keep[i]) el.scrollTop = keep[i]; });
    const cm = $('catchMode');
    if (cm) cm.addEventListener('change', (e) => send({ type: 'catchMode', value: e.target.value }));
  }

  function onState(s) {
    state = s;
    const slim = KIND === 'topbar' ? [s.coins, caps(), pinned, store.get('taskmon-mute', false), A.version] : {
      ...s, battle: null, resting: null, lastSaved: null, today: null,
      team: s.team.map((c) => [c.uid, c.species, c.level, c.xp, Math.round(c.hp), c.moves, c.known, c.status, c.effort, c.held, c.locked, c.pp]),
      box: s.box.map((c) => [c.uid, c.level, c.locked, c.held, c.moves]),
      eggs: KIND === 'creche' ? s.eggs : (s.eggs || []).length,
      ui, sel, v: A.version, marked: [...marked], boxFilter, boxSort, pinned,
    };
    const key = JSON.stringify(slim);
    if (key === lastKey) return;
    lastKey = key;
    render();
    renderModal();
  }

  // ---------- eventos ----------
  function onClick(e) {
    const b = e.target.closest('[data-cmd]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    const set = (patch) => { Object.assign(ui, patch); saveUi(); rerender(); };
    switch (d.cmd) {
      case 'close': bridge.windowControl('close'); break;
      case 'closeAll': bridge.windowControl('closeAll'); break;
      case 'pin': bridge.windowControl('pin'); break;
      case 'mute': store.set('taskmon-mute', !store.get('taskmon-mute', false)); rerender(); break;
      case 'open': bridge.openPanel(d.to); if (modal.open) modal.close(); break;
      case 'select': select(d.uid); break;
      case 'next': {
        const c = current(), i = state.team.indexOf(c);
        const n = state.team[(i + 1) % state.team.length];
        if (n) select(n.uid);
        break;
      }
      case 'starter': send({ type: 'chooseStarter', species: d.species }); break;
      case 'setLead': send({ type: 'setLead', uid: d.uid }); break;
      case 'toBox': send({ type: 'move', uid: d.uid, to: 'box' }); break;
      case 'toTeam': send({ type: 'move', uid: d.uid, to: 'team' }); break;
      case 'genes': set({ genes: !ui.genes }); break;
      case 'grit': send({ type: 'grit', uid: d.uid, stat: d.stat }); break;
      case 'gritOpen': bridge.selectCreature(d.uid); bridge.openPanel('status'); break;
      case 'mv':
        if (ui.move === d.move) openModal({ kind: 'move', id: d.move, uid: current()?.uid });
        else set({ move: d.move });
        break;
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
      case 'heldPick': openModal({ kind: 'held', uid: d.uid }); break;
      case 'hold': {
        const c = byUid(d.uid);
        const item = d.id && c && c.held === d.id ? null : d.id || null; // clicar no que já segura tira
        send({ type: 'hold', uid: d.uid, item });
        if (modal.open && modalState?.kind === 'held') modal.close();
        break;
      }
      case 'bag': set({ bag: d.bag }); break;
      case 'view': set({ view: d.view }); break;
      case 'tmInfo': openModal({ kind: 'tm', id: d.id, teaching: null }); break;
      case 'buyTm': send({ type: 'buyTm', tm: d.id }); break;
      case 'teachPick': modalState.teaching = modalState.teaching === d.uid ? null : d.uid; renderModal(); break;
      case 'teach': send({ type: 'teachTm', tm: d.id, uid: d.uid, replace: d.replace || null }); modalState.teaching = null; break;
      case 'zsel': set({ zone: d.id }); break;
      case 'zone': send({ type: 'zone', id: d.id }); break;
      case 'buy': send({ type: 'buy', item: d.item, qty: Number(d.qty) }); break;
      case 'shop': set({ shop: d.tab }); break;
      case 'boxCell':
        if (ui.mark) { if (marked.has(d.uid)) marked.delete(d.uid); else marked.add(d.uid); rerender(); } else select(d.uid);
        break;
      case 'markMode': set({ mark: !ui.mark }); break;
      case 'markFiltered': state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).forEach((c) => marked.add(c.uid)); rerender(); break;
      case 'lock': send({ type: 'lock', uid: d.uid }); break;
      case 'release': {
        const uids = marked.size ? [...marked].filter((u) => !byUid(u)?.locked)
          : state.box.filter((c) => G.matchesFilter(c, boxFilter) && !c.locked).map((c) => c.uid);
        const shinies = state.box.filter((c) => uids.includes(c.uid) && c.shiny).length;
        if (uids.length && confirm(`Soltar ${uids.length} criatura(s)${shinies ? `, incluindo ${shinies} brilhante(s)` : ''}? Não dá pra desfazer.`)) {
          send({ type: 'release', uids });
          uids.forEach((u) => marked.delete(u));
        }
        break;
      }
      case 'daycarePut': send({ type: 'daycarePut', uid: d.uid }); break;
      case 'daycareTake': send({ type: 'daycareTake', uid: d.uid }); break;
      case 'dexSel': set({ dexSel: Number(d.i) }); break;
      case 'dexTab': set({ dexTab: d.tab }); break;
      case 'dexFilter': set({ dexFilter: { all: 'caught', caught: 'seen', seen: 'all' }[ui.dexFilter] }); break;
      case 'dexStep': {
        const ids = G.SPECIES_ORDER;
        let i = ui.dexSel;
        for (let n = 0; n < ids.length; n++) { // pula os ainda não vistos
          i = (i + Number(d.d) + ids.length) % ids.length;
          if (state.dex.seen[ids[i]]) break;
        }
        set({ dexSel: i });
        break;
      }
      case 'cry': cry(d.species); break;
      case 'autoBuy': send({ type: 'autoBuy', value: !state.settings.autoBuy }); break;
      case 'autoMoves': send({ type: 'autoMoves', value: state.settings.autoMoves === false }); break;
      case 'collapse': send({ type: 'stripUi', collapsed: !state.settings.collapsed }); break;
      case 'showTeam': send({ type: 'stripUi', showTeam: state.settings.showTeam === false }); break;
      case 'openSprites': bridge.openSpritesFolder(); break;
      case 'reloadSprites': bridge.reloadAssets(); break;
      case 'reset': if (confirm('Apagar todo o progresso e começar de novo?')) send({ type: 'reset' }); break;
      default: break;
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('change', (e) => {
    const ds = e.target.dataset || {};
    if (ds.f !== undefined) { boxFilter[ds.f] = e.target.value; rerender(); return; }
    if (ds.sort !== undefined) { boxSort = e.target.value; rerender(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.open && KIND !== 'topbar') bridge.windowControl('close'); });

  // outro painel escolheu um bicho; a faixa (ou a bandeja) pediu uma seção
  bridge.onSelect((uid) => { if (uid !== sel) { sel = uid; rerender(); } });
  if (bridge.onPinned) bridge.onPinned((on) => { pinned = on; rerender(); });
  if (bridge.onGoto) {
    bridge.onGoto((section) => {
      if (KIND === 'loja' && (section === 'tms' || section === 'shop')) { ui.shop = section === 'tms' ? 'mts' : 'itens'; saveUi(); rerender(); }
    });
  }
  // a seleção pode ter mudado com a janela fechada
  window.addEventListener('focus', () => { const s = store.get('taskmon-sel', null); if (s !== sel) { sel = s; rerender(); } });

  if (KIND === 'topbar') document.body.classList.add('topbar');
  header();
  A.onChange(rerender);
  await A.load();
  bridge.onState(onState);
  bridge.requestState();
})();
