'use strict';

/* ──────────────────── RENDER ──────────────────── */
function render() {
  renderTopBar();
  renderPlayers();
  renderPlayerHUD();
  renderMap();
  renderRightSidebar();
  updateTurnUI();
}

/* ── Topbar: phase label + logo sub ── */
function renderTopBar() {
  const p  = GS.players[mySlot()];
  const ph = GS.phase;
  // Phase label in topbar — includes round number on mobile + instability indicator
  const lbl = document.getElementById('phase-label');
  if (lbl) {
    const isMobile = window.innerWidth <= 640;
    let text = isMobile ? `R${GS.round} · ${ph.name}` : ph.name;
    // Add instability indicator if present
    if (GS._marketInstability > 0) {
      const instSym = GS._marketInstability === 1 ? '⚠' : GS._marketInstability === 2 ? '⚠⚠' : '⚠⚠⚠';
      text += ` ${instSym}`;
    }
    lbl.textContent = text;
    lbl.style.color = ph.color;
  }
  // Logo sub shows round + action count
  const ls = document.getElementById('logo-sub');
  if (ls) ls.textContent = `ROUND ${GS.round}/${GS.maxRounds} · ${p.actionsLeft} ACTIONS`;
  // Action dock pill
  const ap = document.getElementById('ap-count');
  if (ap) ap.textContent = p.actionsLeft;
}

/* ── Round track (desktop, hidden on mobile) ── */
function renderRoundTrack() {
  const el = document.getElementById('round-track');
  if (!el) return;
  el.innerHTML = Array.from({ length: GS.maxRounds }, (_, i) => {
    const rnd=i+1, done=rnd<GS.round, cur=rnd===GS.round;
    const phIdx=GS.roundPhasesIdx[i];
    const col=(done&&phIdx!=null)?PHASES[phIdx].color:'';
    const style=(done&&col)?`background:${col}30;border-color:${col}70;color:${col}`:'';
    return `<div class="rtp ${done?'done':''} ${cur?'cur':''}" style="${style}">${rnd}</div>`;
  }).join('');
}

/* ── Left sidebar: player list ── */
function renderPlayers() {
  const nws   = GS.players.map(p => calcNW(p));
  const maxNW = Math.max(...nws, 1);
  document.getElementById('player-list').innerHTML = GS.players.map((p, i) => {
    const nw=nws[i], active=i===GS.currentPlayerIdx;
    const crown=(nw===maxNW&&GS.round>1)?'👑 ':'';
    const bars = Array.from({length:3},(_,j)=>
      `<div class="pe-bar" style="background:${j<p.actionsLeft?p.color:p.color+'22'}"></div>`
    ).join('');
    return `<div class="pe${active?' active-p':''}">
      <div class="pe-active-bar" style="background:${p.color};display:${active?'block':'none'}"></div>
      <div class="pe-name" style="color:${p.color}">
        ${active?'▶ ':''}${crown}${p.name}${p.fortified?' 🛡':''}
        ${!p.isHuman?'<span style="font-size:9px;color:var(--tx-lo);margin-left:4px">AI</span>':''}
      </div>
      <div class="pe-stats">
        <div>
          <div class="pe-stat-lbl">Cash</div>
          <div class="pe-cash">$${p.cash}</div>
        </div>
        <div style="text-align:right">
          <div class="pe-stat-lbl">Net Worth</div>
          <div class="pe-nw">$${nw}</div>
        </div>
      </div>
      <div class="pe-bars">${bars}</div>
    </div>`;
  }).join('');
}

/* ── Mobile player strip ── */
function renderPlayerHUD() {
  const strip = document.getElementById('player-strip');
  if (!strip) return;
  const nws = GS.players.map(p => calcNW(p));
  const maxNW = Math.max(...nws, 1);
  const playerCols = GS.players.map((p, i) => {
    const active = i === GS.currentPlayerIdx;
    const crown  = (nws[i] === maxNW && GS.round > 1) ? '👑' : '';
    const actDot = active
      ? `<div class="psc-dot" style="background:${p.color}"></div>` : '';
    return `<div class="pstrip-card${active ? ' active-turn' : ''}" style="${active ? `border-top-color:${p.color}` : ''}">
      ${actDot}
      <div class="psc-name" style="color:${p.color}">${active ? '▶ ' : ''}${crown}${p.name}</div>
      <div class="psc-nw">$${nws[i]}</div>
      <div class="psc-cash">$${p.cash} cash</div>
    </div>`;
  }).join('');
  strip.innerHTML = playerCols;
}

/* ── Map / Board — 4-column vertical layout ── */
function renderMap() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  // NOTE: ai-overlay stays in document body — position:fixed works correctly there

  REGIONS.forEach((r, ri) => {
    const region = GS.regions[ri];
    const ctrl   = region.controller;
    const ctrlP  = ctrl !== null ? GS.players[ctrl] : null;

    const col = document.createElement('div');
    col.className = 'region-col';

    // Region header
    const ctrlBadge = ctrlP
      ? `<div class="reg-ctrl" style="background:${ctrlP.color}15;color:${ctrlP.color};border:1px solid ${ctrlP.color}44">CTRL ${ctrlP.name}</div>`
      : `<div class="reg-ctrl" style="color:var(--tx-lo)">OPEN</div>`;
    col.innerHTML = `
      <div class="reg-hdr ${r.rc}">
        <span class="reg-icon">${r.icon}</span>
        <span class="reg-name">${r.name}</span>
        ${ctrlBadge}
      </div>
      <div class="reg-companies" id="rc-${ri}"></div>`;
    board.appendChild(col);

    const cosEl = col.querySelector(`#rc-${ri}`);
    GS.companies.filter(c => c.regionIdx === ri).forEach(c => {
      const owner  = c.ownerId !== null ? GS.players[c.ownerId] : null;
      const action = GS.selectedAction;
      let hi = '';
      const slot = mySlot();
      if (action==='acquire'  && c.ownerId===null)                      hi='hi-acq';
      if (action==='upgrade'  && c.ownerId===slot)                      hi='hi-upg';
      if (action==='takeover' && c.ownerId!==null && c.ownerId!==slot)  hi='hi-tak';
      if (action==='sell'     && c.ownerId===slot)                      hi='hi-sell';

      const card = document.createElement('div');
      card.className   = `cc${owner?' owned-'+owner.id:''} ${hi}`;
      card.dataset.cid = c.id;
      card.onclick     = () => handleCompanyClick(c.id);
      card.onmouseenter = () => {
        if (action==='takeover' && c.ownerId!==null && c.ownerId!==slot) {
          GS.lastHoveredTak = c;
        }
        if (action==='acquire' && c.ownerId===null)
          setInfo(`🏢 Acquire <b>${c.name}</b> — costs $${c.baseValue} · earns $${c.revenue} per round · ${SECTORS[c.sectorId].name}${c.trait?' · '+c.trait.name:''}`);
        if (action==='upgrade' && c.ownerId===mySlot())
          setInfo(`⬆ Upgrade <b>${c.name}</b> — costs $${20+c.upgrades*10} · revenue goes from $${c.revenue} to $${c.revenue+4}`);
        if (action==='sell' && c.ownerId===mySlot())
          setInfo(`📈 Sell <b>${c.name}</b> — receive $${calcSellPrice(c)} (65% of market value $${calcCompanyValue(c)})`);
      };

      const lvProg = ((c.upgrades % 2) / 2) * 100;
      const trHtml = c.trait
        ? `<span class="co-trait" style="background:${c.trait.color}18;color:${c.trait.color};border:1px solid ${c.trait.color}44">${c.trait.name}</span>`
        : '';
      const ownerBadge = owner
        ? `<div class="co-owner-badge" style="background:${owner.color}20;color:${owner.color};border:1px solid ${owner.color}40">${owner.name[0]}</div>`
        : '';
      const revColor = c.revenue>20?'var(--gold-lt)':c.revenue>14?'var(--green-lt)':'var(--tx-md)';
      const upgradeLabel = c.upgrades > 0 ? ` +${c.upgrades}` : '';

      card.innerHTML = `
        ${c.ownerId===null?`<div class="acq-cost">$${c.baseValue}</div>`:''}
        <div class="co-top">
          <div class="co-name">${c.name}</div>
          ${ownerBadge}
        </div>
        <div class="co-rev-row">
          <div>
            <div class="co-rev-lbl">per round</div>
            <div class="co-rev-val" style="color:${revColor}">$${c.revenue}</div>
          </div>
        </div>
        <div class="co-meta">
          <span class="co-lv">Lv${c.level}${upgradeLabel}</span>
          ${trHtml}
          ${owner&&owner.fortified?'<span style="font-size:10px">🛡</span>':''}
        </div>
        <div class="lv-bar"><div class="lv-fill" style="width:${lvProg}%;background:${owner?owner.color:'var(--green)'}"></div></div>`;

      cosEl.appendChild(card);
    });
  });
}

/* ── Right sidebar: CEO + Intel + Stocks + Cards ── */
function renderRightSidebar() {
  renderCEO();
  renderIntel();
  renderCards();
}

function renderCEO() {
  const p = GS.players[mySlot()];
  const el = document.getElementById('ceo-disp');
  if (!el) return;
  el.innerHTML = `
    <div class="ceo-block">
      <div class="ceo-avatar">${p.name[0]}</div>
      <div class="ceo-name">${p.name}</div>
      <div class="ceo-title">${p.ceo.type}</div>
      <div class="ceo-bonus">⚡ ${p.ceo.bonus}</div>
    </div>`;
}

function renderIntel() {
  const el = document.getElementById('intel-area');
  if (!el) return;
  const nws = GS.players.map(p => calcNW(p));

  // Competitor rows
  const rivals = GS.players.slice(1).map((q, i) =>
    `<div class="intel-row">
      <div class="intel-dot" style="background:${q.color}"></div>
      <div class="intel-name" style="color:${q.color}">${q.name}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
        <div class="intel-nw" style="font-size:10px;color:var(--tx-hi)">$${q.cash}<span style="color:var(--tx-lo);margin-left:4px;font-size:9px">cash</span></div>
        <div class="intel-nw">NW $${nws[i+1]}</div>
      </div>
    </div>`
  ).join('');

  // Stocks section
  const p = GS.players[mySlot()];
  const myT = isMyTurn();
  const stockRows = GS.sectors.map((s, i) => {
    const mine=p.stocks[i]||0, cost=s.price-p.ceo.stockBonus;
    const canB=myT&&p.actionsLeft>0&&s.sharesLeft>0&&p.cash>=cost;
    const canS=myT&&p.actionsLeft>0&&mine>0;
    const div=Math.round(s.price/5);
    const hist=s.priceHistory, prev=hist.length>1?hist[hist.length-2]:s.price;
    const delta=s.price-prev;
    const dc=delta>0?'var(--green-lt)':delta<0?'var(--red-lt)':'var(--tx-lo)';
    const ds=delta>0?'+'+delta:delta;
    return `<div class="stock-row">
      <div class="sr-left">
        <div class="sr-name">${s.name}</div>
        <div class="sr-meta">$${s.price} <span style="color:${dc}">${ds}</span> · div+$${div}</div>
        ${mine>0?`<div class="sr-owned">${mine} share${mine>1?'s':''}</div>`:''}
      </div>
      <div class="sr-btns">
        <button class="sab buy"  onclick="doStockBuy(${i})"  ${canB?'':'disabled'}>BUY</button>
        <button class="sab sell" onclick="doStockSell(${i})" ${canS?'':'disabled'}>SELL</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = rivals +
    `<div style="padding:8px 14px 4px;border-top:1px solid var(--border);margin-top:4px">
      <div style="font-family:var(--font-mono);font-size:8px;font-weight:700;letter-spacing:.12em;color:var(--tx-lo);text-transform:uppercase;margin-bottom:6px">📊 STOCK MARKET</div>
      ${stockRows}
    </div>`;
}

function renderStocks() { renderIntel(); } // alias for compatibility

function renderCards() {
  const p  = GS.players[mySlot()];
  const el = document.getElementById('cards-area');
  if (!el) return;
  const cnt = document.getElementById('hand-count');
  const unused = p.tactics.filter(t => !t.used).length;
  if (cnt) cnt.textContent = unused;
  el.innerHTML = p.tactics.map((t, i) => `
    <div class="tcard ${t.used?'used':''}" onclick="${t.used?'':'playTacticFromMenu('+i+')'}">
      <div class="tc-header">
        <span class="tc-icon">${t.icon}</span>
        <span class="tc-nm">${t.name}</span>
      </div>
      <div class="tc-ef">${t.effect}</div>
      ${t.used?'<div class="tc-used">USED</div>':''}
    </div>`).join('');
}

/* ── Turn UI: dock buttons + end turn btn ── */
function updateTurnUI() {
  const human = isMyTurn();
  const endBtn = document.getElementById('end-turn-btn');
  if (endBtn) { endBtn.disabled = !human; }
  const mobEnd = document.getElementById('mobile-end-turn');
  if (mobEnd) { mobEnd.disabled = !human; }
  const dock = document.getElementById('action-dock');
  if (dock) {
    dock.style.opacity       = human ? '1' : '0.38';
    dock.style.pointerEvents = human ? 'auto' : 'none';
    dock.classList.toggle('player-turn', human);
  }
  // Net lock overlay: show only in MP when a HUMAN opponent is playing
  const lock = document.getElementById('net-lock');
  if (lock) {
    const currentPlayer = GS.players[GS.currentPlayerIdx];
    const isOpponentHuman = currentPlayer && currentPlayer.isHuman;
    const showLock = !human && MP && MP.active && isOpponentHuman;
    if (showLock) {
      document.getElementById('net-lock-name').textContent = currentPlayer.name;
      lock.classList.add('show');
    } else {
      lock.classList.remove('show');
    }
  }
}

/* ── Phase Announce ── */
let _phaseTimer = null;
function showPhaseAnnounce() {
  SFX.phase();
  const ph = GS.phase;
  document.getElementById('pa-round').textContent  = GS.round;
  document.getElementById('pa-name').textContent   = ph.name;
  document.getElementById('pa-name').style.color   = ph.color;
  document.getElementById('pa-effect').textContent = ph.effect;
  const pa = document.getElementById('phase-announce');
  pa.style.borderColor = ph.color;
  pa.style.boxShadow   = `0 0 40px ${ph.color}33`;
  const eEl = document.getElementById('pa-event');
  if (GS.currentEvent && GS.round > 1) {
    eEl.textContent = `${GS.currentEvent.icon}  ${GS.currentEvent.name} — ${GS.currentEvent.effect}`;
    eEl.classList.add('show');
  } else { eEl.classList.remove('show'); }
  pa.classList.add('show');
  const fill = document.getElementById('pa-pfill');
  fill.style.background = ph.color; fill.style.transition='none'; fill.style.width='0%';
  requestAnimationFrame(() => { fill.style.transition='width 4s linear'; fill.style.width='100%'; });
  _phaseTimer = setTimeout(dismissPhase, 3000);
}
function dismissPhase() {
  clearTimeout(_phaseTimer);
  document.getElementById('phase-announce').classList.remove('show');
}

/* ── Takeover calc (shown in modal) ── */
function updateTakeoverCalc(company) {
  // Nothing to do here — takeover info is shown in the handleCompanyClick modal
}

/* ── Stock Market Modal (Mobile) ── */
function showStocksModal() {
  SFX.ui();
  const p = GS.players[mySlot()];
  if (!p) return;
  const myTurn = isMyTurn();
  const actLeft = p.actionsLeft;
  const actColor = actLeft === 0 ? 'var(--red-lt)' : actLeft === 1 ? 'var(--gold-lt)' : 'var(--green-lt)';
  let content = '';
  content += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-family:var(--font-mono);font-size:8px;color:var(--tx-lo);letter-spacing:.12em;text-transform:uppercase">4 Sectors · Dividends vary each round</div>
    <div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:${actColor}">⚡ ${actLeft} action${actLeft!==1?'s':''} left</div>
  </div>`;
  GS.sectors.forEach((s, i) => {
    const mine = p.stocks[i] || 0;
    const divBase = Math.round(s.price / 5);
    const divLo   = Math.max(1, Math.round(divBase * 0.65));
    const divHi   = Math.round(divBase * 1.35);
    const canB = myTurn && actLeft > 0 && p.cash >= (s.price - p.ceo.stockBonus) && s.sharesLeft > 0;
    const canS = myTurn && actLeft > 0 && mine > 0;
    // Price history spark arrows
    const hist  = s.priceHistory || [];
    const spark = hist.slice(-4).map((v, j, a) => {
      if (j === 0) return '';
      const d = v - a[j-1];
      return d > 0 ? `<span style="color:var(--green-lt)">↑</span>` : d < 0 ? `<span style="color:var(--red-lt)">↓</span>` : `<span style="color:var(--tx-lo)">→</span>`;
    }).join('');
    const delta = s.price - (hist.length > 1 ? hist[hist.length-2] : s.price);
    const dc    = delta > 0 ? 'var(--green-lt)' : delta < 0 ? 'var(--red-lt)' : 'var(--tx-lo)';
    const ds    = delta > 0 ? '+'+delta : delta;
    const trend = s.growthScore > 3 ? '🔥 hot' : s.growthScore > 0 ? '↑ active' : s.growthScore < -2 ? '❄ cold' : '→ stable';
    const trendColor = s.growthScore > 3 ? 'var(--green-lt)' : s.growthScore > 0 ? 'var(--blue-lt)' : s.growthScore < -2 ? 'var(--red-lt)' : 'var(--tx-md)';
    content += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="color:var(--tx-hi);font-weight:600;font-size:11px">${s.name}</span>
          <span style="font-family:var(--font-mono);font-size:9px">${spark}</span>
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--tx-lo);margin-top:2px">
          <span style="color:var(--gold)">$${s.price}</span>
          <span style="color:${dc}"> ${ds}</span>
          · <span style="color:${trendColor}">${trend}</span>
          · div <span style="color:var(--green-lt)">$${divLo}–$${divHi}</span>
        </div>
        ${mine>0?`<div style="font-family:var(--font-mono);font-size:8px;color:var(--indigo);margin-top:1px">${mine} share${mine>1?'s':''} · est. +$${divLo}–$${divHi*mine}/rnd</div>`:''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="sab buy" onclick="doStockBuy(${i})" ${canB?'':'disabled'}>BUY</button>
        <button class="sab sell" onclick="doStockSell(${i})" ${canS?'':'disabled'}>SELL</button>
      </div>
    </div>`;
  });
  content += '</div>';
  showModal('📊 STOCK MARKET', content);
}
/* ── CEO Info Modal (Mobile) ── */
function showCEOInfoModal() {
  SFX.ui();
  const p = GS.players[mySlot()];
  if (!p) return;
  const ceo = p.ceo;
  let content = '<div style="padding: 4px 0;">';
  content += `<div style="text-align: center; margin-bottom: 16px;">
    <div style="font-size: 48px; margin-bottom: 8px;">👔</div>
    <div style="font-weight: 700; font-size: 18px; font-family: var(--font-ui); color: var(--tx-hi);">${ceo.type}</div>
    <div style="font-family: var(--font-mono); font-size: 9px; color: var(--tx-lo); letter-spacing: .08em; text-transform: uppercase; margin-top: 4px;">CEO ARCHETYPE</div>
  </div>`;
  content += `<div style="background: rgba(99,102,241,.1); border: 1px solid rgba(99,102,241,.3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
    <div style="font-family: var(--font-mono); font-size: 8px; color: var(--tx-lo); letter-spacing: .08em; text-transform: uppercase; margin-bottom: 10px;">Bonuses</div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--tx-md);">⚔ Attack Power</span>
        <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${ceo.attackBonus>0?'var(--gold-lt)':'var(--tx-lo)'}">+${ceo.attackBonus}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--tx-md);">🛡 Defense Bonus</span>
        <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${ceo.defenseBonus>0?'var(--cyan)':'var(--tx-lo)'}">+${ceo.defenseBonus}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--tx-md);">📈 Stock Discount</span>
        <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:${ceo.stockBonus>0?'var(--green-lt)':'var(--tx-lo)'}">$${ceo.stockBonus} off</span>
      </div>
    </div>
  </div>`;
  content += `<div style="background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
    <div style="font-family:var(--font-mono);font-size:11px;color:var(--gold);font-weight:700">${ceo.bonus}</div>
  </div>`;
  content += `<div class="mbtns" style="margin-top:12px"><button class="mbtn pri" onclick="closeModal()">Got it ✓</button></div>`;
  content += '</div>';
  showModal('👔 CEO PROFILE', content);
}
