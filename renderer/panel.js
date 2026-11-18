// Painel de gerenciamento: equipe, caixa, zonas, loja e bestiário.
// Não guarda estado próprio: recebe cópias da faixa e devolve comandos.

(() => {
  'use strict';
  const G = window.Game;
  const SP = window.Sprites;
  const bridge = window.bridge;
  const app = document.getElementById('app');

  let state = null;
  let lastKey = '';

  const img = (species, opts = {}) =>
    `<img class="px" width="${opts.size || 48}" height="${opts.size || 48}" src="${SP.spriteDataUrl(species, opts)}" alt="">`;
  const typeBadge = (t) => `<span class="type" style="background:${G.TYPE_COLOR[t]}">${G.TYPE_LABEL[t]}</span>`;
  const send = (cmd) => bridge.sendCommand(cmd);

  function bar(ratio, color) {
    return `<div class="bar"><i style="width:${Math.round(G.clamp(ratio, 0, 1) * 100)}%;background:${color}"></i></div>`;
  }

  function monCard(c, lead) {
    const sp = G.SPECIES[c.species];
    const max = G.maxHp(c);
    const isLead = c.uid === lead?.uid;
    const evo = sp.evolvesTo ? ` · evolui no ${sp.evolveLevel}` : '';
    return `
      <div class="mon">
        ${img(c.species, { shiny: c.shiny })}
        <div>
          <div class="nm">${sp.name}${c.shiny ? ' ✨' : ''}</div>
          <div class="sub">Nv ${c.level} ${typeBadge(sp.type)} <span>${evo}</span></div>
          <div class="bars">
            ${bar(c.hp / max, '#4ade80')}
            ${bar(c.xp / G.xpToNext(c.level), '#38bdf8')}
          </div>
          <div class="muted">HP ${Math.round(c.hp)}/${max} · XP ${c.xp}/${G.xpToNext(c.level)}</div>
        </div>
        <div class="actions">
          ${isLead ? '<div class="badge">★ Líder</div>' : `<button data-cmd="setLead" data-uid="${c.uid}">★ Líder</button>`}
          <button data-cmd="toBox" data-uid="${c.uid}" ${state.team.length <= 1 ? 'disabled' : ''}>→ Caixa</button>
        </div>
      </div>`;
  }

  function renderStarters() {
    app.innerHTML = `
      <section>
        <h2>Escolha seu parceiro</h2>
        <p class="muted">Ele vai andar pela sua barra de tarefas, batalhar sozinho e ficar mais forte enquanto você trabalha.</p>
        <div class="starters">
          ${G.STARTERS.map((id) => {
            const sp = G.SPECIES[id];
            return `<div class="starter">
              ${img(id, { scale: 6, size: 72 })}
              <b>${sp.name}</b>${typeBadge(sp.type)}
              <button class="primary" data-cmd="starter" data-species="${id}">Escolher</button>
            </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderNow() {
    const el = document.getElementById('now');
    if (!el || !state) return;
    const zone = G.ZONES.find((z) => z.id === state.zone);
    const b = state.battle;
    if (state.resting) el.innerHTML = 'Seu líder está <b>descansando</b>…';
    else if (b) el.innerHTML = `Batalhando contra <b>${G.SPECIES[b.species].name}${b.shiny ? ' ✨' : ''}</b> nv ${b.level} (HP ${b.hp}/${b.max}). Clique nele na barra pra lançar uma cápsula!`;
    else el.innerHTML = `Explorando: <b>${zone.name}</b>`;
  }

  function render() {
    document.getElementById('coins').textContent = `🪙 ${state.coins}`;
    document.getElementById('caps').textContent = `◓ ${state.items.capsula || 0} + ${state.items.super || 0}`;

    if (!state.starterChosen) return renderStarters();

    const lead = G.getLead(state);
    const zonesUnlocked = G.unlockedZones(state).map((z) => z.id);
    const caughtCount = G.SPECIES_ORDER.filter((id) => state.dex.caught[id]).length;

    app.innerHTML = `
      <section><div class="now" id="now"></div></section>

      <section>
        <h2>Equipe (${state.team.length}/${G.TEAM_MAX})</h2>
        ${state.team.map((c) => monCard(c, lead)).join('')}
      </section>

      <section>
        <h2>Caixa (${state.box.length})</h2>
        ${state.box.length ? state.box.map((c) => `
          <div class="box-item">
            ${img(c.species, { shiny: c.shiny, size: 32 })}
            <span>${G.SPECIES[c.species].name}${c.shiny ? ' ✨' : ''} · Nv ${c.level}</span>
            <button data-cmd="toTeam" data-uid="${c.uid}" ${state.team.length >= G.TEAM_MAX ? 'disabled' : ''}>→ Equipe</button>
          </div>`).join('') : '<p class="muted">Vazia. Quando a equipe enche, as capturas vêm pra cá.</p>'}
      </section>

      <section>
        <h2>Zonas</h2>
        <div class="zones">
          ${G.ZONES.map((z) => {
            const open = zonesUnlocked.includes(z.id);
            return `<button class="${state.zone === z.id ? 'on' : ''}" data-cmd="zone" data-id="${z.id}" ${open ? '' : 'disabled'}>
              <span>${z.name}</span><span class="muted">${open ? `nv ${z.levels[0]}–${z.levels[1]}` : `🔒 líder nv ${z.unlock}`}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section>
        <h2>Loja</h2>
        <div class="shop">
          ${Object.entries(G.SHOP).map(([id, it]) => `
            <div class="row">
              ${img('_capsula', { size: 24 })}
              <span class="label">${it.name} <span class="muted">· ${it.price} 🪙 · tem ${state.items[id] || 0}</span></span>
              <button data-cmd="buy" data-item="${id}" data-qty="1" ${state.coins < it.price ? 'disabled' : ''}>+1</button>
              <button data-cmd="buy" data-item="${id}" data-qty="5" ${state.coins < it.price * 5 ? 'disabled' : ''}>+5</button>
            </div>`).join('')}
        </div>
      </section>

      <section>
        <h2>Bestiário (${caughtCount}/${G.SPECIES_ORDER.length})</h2>
        <div class="dex">
          ${G.SPECIES_ORDER.map((id) => {
            const caught = state.dex.caught[id], seen = state.dex.seen[id];
            return `<div class="${caught ? 'caught' : ''}">
              ${img(id, { size: 36, silhouette: !seen, scale: 3 })}
              ${seen ? G.SPECIES[id].name : '???'}${caught ? ' ◓' : ''}
            </div>`;
          }).join('')}
        </div>
      </section>

      <section>
        <h2>Configurações</h2>
        <label class="check"><input type="checkbox" id="auto" ${state.settings.autoCatch ? 'checked' : ''}>
          Lançar cápsulas sozinho em espécies novas e brilhantes</label>
        <p class="muted" style="margin:8px 0 0">Na barra de tarefas: clique no HUD ou no seu bicho pra abrir este painel, e no selvagem pra lançar uma cápsula.</p>
        <p style="margin:10px 0 0"><button data-cmd="reset">Recomeçar do zero</button></p>
      </section>

      <footer>${state.stats.wins} vitórias · ${state.stats.battles} batalhas · ${state.stats.caught} capturas</footer>`;

    document.getElementById('auto').addEventListener('change', (e) => send({ type: 'autoCatch', value: e.target.checked }));
    renderNow();
  }

  // Redesenha tudo só quando algo "estrutural" muda; a linha da batalha atualiza sempre.
  function onState(s) {
    state = s;
    const key = JSON.stringify({ ...s, battle: null, resting: null, lastSaved: null, team: s.team.map((c) => [c.uid, c.species, c.level, c.xp, Math.round(c.hp)]) });
    if (key !== lastKey) {
      lastKey = key;
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
    } else {
      renderNow();
    }
  }

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
      case 'reset':
        if (confirm('Apagar todo o progresso e começar de novo?')) send({ type: 'reset' });
        break;
    }
  });

  bridge.onState(onState);
  bridge.requestState();
})();
