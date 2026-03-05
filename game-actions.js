'use strict';

/* ══════════════════════════════════════════════════════
   CORPORATE DOMINION v7 — HUMAN ACTIONS
   setAction · clearAction · handleCompanyClick
   doAcquire · doUpgrade · doSell · doTakeover
   runDice · resolveTakeover
   doStockBuy · doStockSell
   showCardMenu · playTacticFromMenu · playTactic
   passAction
   + BOOT (drawer backdrop, previews, wrappers)
══════════════════════════════════════════════════════ */

/* ── Action selection ── */
function setAction(action) {
  if (GS.currentPlayerIdx !== mySlot()) return;
  if (GS.players[mySlot()].actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  GS.selectedAction = action;
  ['acquire','upgrade','takeover','sell'].forEach(a => {
    document.getElementById('btn-' + a)?.classList.remove('active');
  });
  document.getElementById('btn-' + action)?.classList.add('active');
  SFX.ui();
  const hints = {
    acquire:  'Tap a company with NO border (unowned) on the map.',
    upgrade:  'Tap one of YOUR companies (gold border) on the map.',
    takeover: 'Tap an ENEMY company on the map — cost shown before you commit.',
    sell:     'Tap one of YOUR companies to sell it for 65% of its value.',
  };
  setInfo(hints[action] || '');
  renderMap();
}

function passAction() {
  if (GS.currentPlayerIdx !== mySlot()) return;
  const p = GS.players[mySlot()];
  if (p.actionsLeft <= 0) { SFX.nope(); return; }
  p.actionsLeft--;
  SFX.pass();
  glog(`${p.name}: passed action.`, 'info');
  clearAction();
  render();
}

/* ── clearAction: unified (dock styling + auto-end) ── */
let _autoEndTimer  = null;
let _lastActionUsed = null; // remember for auto-reselect

function clearAction() {
  const prevAction   = GS.selectedAction;
  GS.selectedAction  = null;
  ['acquire','upgrade','takeover','sell'].forEach(a =>
    document.getElementById('btn-' + a)?.classList.remove('active'));

  const slot = mySlot();
  const p = GS.players[slot];
  if (!p) return;

  if (GS.currentPlayerIdx === slot && p.actionsLeft <= 0 && !GS.gameOver) {
    setInfo('✓ All 3 actions used.');
    const toast = document.getElementById('auto-end-toast');
    clearTimeout(_autoEndTimer);
    if (toast) { toast.classList.add('show'); }
    _autoEndTimer = setTimeout(() => {
      if (toast) toast.classList.remove('show');
      if (GS.currentPlayerIdx === slot && p.actionsLeft <= 0 && !GS.gameOver) endTurn();
    }, 1100);
  } else if (p.actionsLeft > 0) {
    const left = p.actionsLeft;
    setInfo(`Action complete — <b style="color:var(--gold)">${left} action${left !== 1 ? 's' : ''} remaining</b>. [Space] to end turn early.`);
    // Auto-reselect the same action so player doesn't need to tap again
    if (prevAction && ['acquire','upgrade','takeover','sell'].includes(prevAction)) {
      setTimeout(() => {
        if (GS.currentPlayerIdx === slot && p.actionsLeft > 0 && !GS.selectedAction) {
          setAction(prevAction);
        }
      }, 120);
    }
  }
}

/* ── Company click handler ── */
function handleCompanyClick(cid) {
  const slot = mySlot();
  if (GS.currentPlayerIdx !== slot) return;
  const p      = GS.players[slot];
  const c      = GS.companies.find(x => x.id === cid);
  const action = GS.selectedAction;

  /* No action selected: show info panel */
  if (!action) {
    const owner = c.ownerId !== null ? GS.players[c.ownerId] : null;
    const val   = calcCompanyValue(c);
    const tk    = owner && owner.id !== slot ? calcTakeover(slot, c) : null;
    setInfo(
      `${c.name}  |  Rev $${c.revenue}  |  Val $${val}  |  Lv${c.level}+${c.upgrades}  |  ` +
      `${SECTORS[c.sectorId].name}  |  ${owner ? owner.name : 'UNOWNED'}` +
      (tk ? `  |  TO ${Math.round(tk.P * 100)}% · cost $${tk.cost}` : '')
    );
    return;
  }

  if (p.actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining this round!'); return; }

  /* ACQUIRE */
  if (action === 'acquire') {
    if (c.ownerId !== null) { SFX.nope(); setInfo('❌ This company is owned — use Takeover instead.'); return; }
    const canAfford  = p.cash >= c.baseValue;
    const blocked    = p._noAcquire;
    const trRow = c.trait
      ? `<div class="mrow"><div class="ml">Trait</div><div class="mv" style="color:${c.trait.color}">${c.trait.name} — ${c.trait.desc}</div></div>` : '';
    let blockBanner = '';
    if (blocked) {
      blockBanner = `<div style="margin:10px 0;padding:10px 12px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.35);border-radius:8px;font-family:var(--font-mono);font-size:9px;color:var(--red-lt);font-weight:700">📰 HOSTILE PRESS ACTIVE — you cannot acquire companies this round.</div>`;
    } else if (!canAfford) {
      blockBanner = `<div style="margin:10px 0;padding:10px 12px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.35);border-radius:8px;font-family:var(--font-mono);font-size:9px;color:var(--red-lt);font-weight:700">💸 INSUFFICIENT FUNDS — you have $${p.cash}, need $${c.baseValue}. Try selling a company first.</div>`;
    }
    const confirmDisabled = (!canAfford || blocked) ? 'disabled style="opacity:.4;cursor:not-allowed"' : '';
    showModal('Acquire Company', `
      <div class="mrow"><div class="ml">Company</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Region</div><div class="mv">${REGIONS[c.regionIdx].name}</div></div>
      <div class="mrow"><div class="ml">Sector</div><div class="mv">${SECTORS[c.sectorId].name}</div></div>
      <div class="mrow"><div class="ml">Revenue / round</div><div class="mv gold">$${c.revenue}</div></div>
      <div class="mrow"><div class="ml">Base Value</div><div class="mv">$${c.baseValue}</div></div>
      ${trRow}
      ${blockBanner}
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">Acquisition Cost</div>
        <div class="cb-num" style="${!canAfford||blocked?'color:var(--red-lt)':''}">$${c.baseValue}</div>
        <div class="cb-sub">Charged from your cash immediately · You have $${p.cash}</div>
      </div>
      <div class="mbtns">
        <button class="mbtn pri" onclick="doAcquire(${cid})" ${confirmDisabled}>Acquire ✓</button>
        <button class="mbtn" onclick="closeModal()">Cancel</button>
      </div>`);
  }
  }

  /* UPGRADE */
  else if (action === 'upgrade') {
    if (c.ownerId !== slot) { SFX.nope(); setInfo('❌ You can only upgrade your own companies.'); return; }
    const cost    = 20 + c.upgrades * 10;
    const nxtLv   = (c.upgrades + 1) % 2 === 0;
    const canAfford = p.cash >= cost;
    const blockBanner = !canAfford
      ? `<div style="margin:10px 0;padding:10px 12px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.35);border-radius:8px;font-family:var(--font-mono);font-size:9px;color:var(--red-lt);font-weight:700">💸 INSUFFICIENT FUNDS — you have $${p.cash}, need $${cost}. Earn more revenue or sell a company.</div>`
      : '';
    const confirmDisabled = !canAfford ? 'disabled style="opacity:.4;cursor:not-allowed"' : '';
    showModal('⬆ Upgrade Company', `
      <div class="mrow"><div class="ml">Company</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Current Level</div><div class="mv green">Lv${c.level} (${c.upgrades} upgrades)</div></div>
      <div style="margin:12px 0;padding:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px">
        <div style="font-family:var(--font-mono);font-size:8px;color:var(--green-lt);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">This Upgrade Provides</div>
        <div style="display:flex;gap:12px">
          <div style="flex:1">
            <div style="color:var(--green-lt);font-weight:700;font-size:13px">+$4</div>
            <div style="font-family:var(--font-mono);font-size:8px;color:var(--tx-lo);margin-top:2px">revenue/round</div>
          </div>
          <div style="flex:1">
            <div style="color:var(--green-lt);font-weight:700;font-size:13px">+2</div>
            <div style="font-family:var(--font-mono);font-size:8px;color:var(--tx-lo);margin-top:2px">takeover defense</div>
          </div>
          ${nxtLv ? `<div style="flex:1"><div style="color:var(--green-lt);font-weight:700;font-size:13px">→ Lv Up</div><div style="font-family:var(--font-mono);font-size:8px;color:var(--tx-lo);margin-top:2px">next upgrade</div></div>` : ''}
        </div>
      </div>
      ${blockBanner}
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">Upgrade Cost</div>
        <div class="cb-num" style="${!canAfford?'color:var(--red-lt)':''}">$${cost}</div>
        <div class="cb-sub">You have $${p.cash}</div>
      </div>
      <div class="mbtns">
        <button class="mbtn pri" onclick="doUpgrade(${cid})" ${confirmDisabled}>Upgrade ✓</button>
        <button class="mbtn" onclick="closeModal()">Cancel</button>
      </div>`);
  }

  /* TAKEOVER */
  else if (action === 'takeover') {
    if (c.ownerId === null) { SFX.nope(); setInfo('❌ Use Acquire for unowned companies.'); return; }
    if (c.ownerId === slot) { SFX.nope(); setInfo('❌ You already own this company.'); return; }
    const tk  = calcTakeover(slot, c);
    const def = GS.players[c.ownerId];
    const pct = Math.round(tk.P * 100);
    const bc  = pct > 62 ? 'var(--green-lt)' : pct > 38 ? 'var(--gold-lt)' : 'var(--red-lt)';
    const risk = pct < 30 ? 'HIGH RISK — likely to fail'
               : pct < 50 ? 'CONTESTED — coin flip'
               : pct < 68 ? 'FAVORABLE — good odds'
               : 'DOMINANT — nearly certain';
    const isAntitrust  = !!p._noTakeover;
    const cantAfford   = p.cash < tk.cost;
    let blockBanner = '';
    if (isAntitrust) {
      blockBanner = `<div style="margin:10px 0;padding:10px 12px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.35);border-radius:8px;font-family:var(--font-mono);font-size:9px;color:var(--red-lt);font-weight:700">⚖ ANTITRUST PROBE ACTIVE — you are legally blocked from launching takeovers this round. This will clear next round.</div>`;
    } else if (cantAfford) {
      blockBanner = `<div style="margin:10px 0;padding:10px 12px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.35);border-radius:8px;font-family:var(--font-mono);font-size:9px;color:var(--red-lt);font-weight:700">💸 INSUFFICIENT FUNDS — you have $${p.cash}, need $${tk.cost}. Try selling a weak company to fund this takeover.</div>`;
    }
    const confirmDisabled = (isAntitrust || cantAfford) ? 'disabled style="opacity:.4;cursor:not-allowed"' : '';
    const fortW = def.fortified
      ? `<div class="fort-warn">⚠ FORTIFIED — success chance reduced by 15%</div>` : '';
    showModal('⚔ Hostile Takeover', `
      <div class="mrow"><div class="ml">Target</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Current Owner</div><div class="mv" style="color:${def.color}">${def.name}</div></div>
      <div class="mrow"><div class="ml">Your Attack</div><div class="mv gold">${tk.A}</div></div>
      <div class="mrow"><div class="ml">Their Defense</div><div class="mv red">${tk.D}</div></div>
      ${blockBanner}
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">Upfront Cost — charged now</div>
        <div class="cb-num" style="${cantAfford||isAntitrust?'color:var(--red-lt)':''}">$${tk.cost}</div>
        <div class="cb-sub">
          <span style="color:var(--green-lt)">WIN</span>: company is yours &nbsp;·&nbsp;
          <span style="color:var(--red-lt)">FAIL</span>: lose $${Math.floor(tk.cost * .5)}, recover $${Math.ceil(tk.cost * .5)} next round
        </div>
      </div>
      ${fortW}
      <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--tx-lo);letter-spacing:.1em;text-transform:uppercase;margin:8px 0 4px">Success Probability</div>
      <div class="prob-bar">
        <div class="prob-fill" style="width:${pct}%;background:${bc}">${pct}%</div>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${bc};margin:4px 0 8px">${risk}</div>
      <div class="mbtns">
        <button class="mbtn danger" onclick="doTakeover(${cid},${tk.cost},${tk.P.toFixed(4)})" ${confirmDisabled}>Launch Takeover</button>
        <button class="mbtn" onclick="closeModal()">Abort</button>
      </div>`);
  }

  /* SELL COMPANY */
  else if (action === 'sell') {
    if (c.ownerId !== slot) { SFX.nope(); setInfo('❌ You can only sell your own companies.'); return; }
    const sp = calcSellPrice(c);
    const fv = calcCompanyValue(c);
    showModal('💰 Sell Company', `
      <div class="mrow"><div class="ml">Company</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Full Market Value</div><div class="mv">$${fv}</div></div>
      <div class="mrow"><div class="ml">Revenue you'll lose</div><div class="mv red">−$${c.revenue}/round</div></div>
      <div class="cost-block sell-v" style="margin:12px 0">
        <div class="cb-lbl">You receive (65% of value)</div>
        <div class="cb-num">$${sp}</div>
        <div class="cb-sub">Sell a weak company → fund a powerful takeover</div>
      </div>
      <div class="mbtns">
        <button class="mbtn success" onclick="doSell(${cid})">Sell for $${sp}</button>
        <button class="mbtn" onclick="closeModal()">Cancel</button>
      </div>`);
  }
}

/* ── Action executors ── */
function doAcquire(cid) {
  closeModal();
  const slot = mySlot();
  const p = GS.players[slot]; const c = GS.companies.find(x => x.id === cid);
  if (p._noAcquire) {
    SFX.nope();
    glog(`${p.name}: Hostile Press — blocked from acquiring this round!`, 'warn');
    setInfo('❌ Hostile Press: you cannot acquire companies this round.');
    return;
  }
  p.cash -= c.baseValue; c.ownerId = slot; p.actionsLeft--;
  SFX.acquire();
  glog(`${p.name} acquired ${c.name} ($${c.baseValue})`, 'good');
  updateRegionControl(); updateStockPrices(); render(); clearAction();
}

function doUpgrade(cid) {
  closeModal();
  const slot = mySlot();
  const p = GS.players[slot];
  const c = GS.companies.find(x => x.id === cid);
  if (!applyUpgrade(c)) { glog('Insufficient funds for upgrade.', 'bad'); return; }
  p.actionsLeft--;
  SFX.upgrade();
  glog(`${p.name} upgraded ${c.name} → Lv${c.level} (+${c.upgrades} upgrades)`, 'good');
  updateStockPrices(); render(); clearAction();
}

function doSell(cid) {
  closeModal();
  const slot = mySlot();
  const p  = GS.players[slot]; const c = GS.companies.find(x => x.id === cid);
  const sp = calcSellPrice(c);
  p.cash += sp; p.actionsLeft--;
  c.ownerId  = null;
  c.upgrades = 0;
  c.level    = 1;
  c.revenue  = c.initRevenue;
  c._traitDef = c.trait ? 3 : 0;
  SFX.sellco();
  glog(`${p.name} sold ${c.name} for $${sp}`, 'warn');
  updateRegionControl(); updateStockPrices(); render(); clearAction();
}

function doTakeover(cid, cost, prob) {
  closeModal();
  const slot = mySlot();
  const p   = GS.players[slot]; const c = GS.companies.find(x => x.id === cid);
  const def = GS.players[c.ownerId];
  if (p.cash < cost) { SFX.nope(); glog(`❌ Need $${cost}, have $${p.cash}.`, 'bad'); return; }
  p.actionsLeft--;
  p.cash -= cost;
  const fp   = def.fortified ? 0.15 : 0;
  if (def.fortified) def.fortified = false;
  const effP = Math.max(0.05, parseFloat(prob) - fp);
  GS.stats.toa[p.id]++;
  runDice(effP, c, def, cost, p);
  clearAction();
}

/* ── Dice roll animation ── */
function runDice(effP, c, def, cost, p) {
  const ov = document.getElementById('dice-overlay');
  ov.classList.add('show');
  document.getElementById('dice-target').textContent = `${c.name}  ←  ${def.name}`;
  document.getElementById('dice-need').textContent   = `Need ≤ ${effP.toFixed(3)} to succeed`;
  document.getElementById('dice-num').style.color    = 'var(--tx-hi)';
  document.getElementById('dice-result').textContent = '';

  const finalRoll = Math.random();
  let ticks = 0;
  const iv = setInterval(() => {
    ticks++;
    const shown = ticks < 24 ? Math.random() : finalRoll;
    document.getElementById('dice-num').textContent = shown.toFixed(3);
    if (ticks >= 24) {
      clearInterval(iv);
      const ok = finalRoll <= effP;
      document.getElementById('dice-num').style.color    = ok ? 'var(--green-lt)' : 'var(--red-lt)';
      document.getElementById('dice-result').textContent = ok ? '✓  SUCCESS' : '✗  FAILED';
      document.getElementById('dice-result').style.color = ok ? 'var(--green-lt)' : 'var(--red-lt)';
      ok ? SFX.takeover_ok() : SFX.takeover_fail();
      setTimeout(() => {
        ov.classList.remove('show');
        resolveTakeover(ok, c, def, cost, p, finalRoll, effP);
      }, 1400);
    }
  }, 55);
}

function resolveTakeover(ok, c, def, cost, p, roll, effP) {
  if (ok) {
    c.ownerId = p.id;
    GS.stats.tos[p.id]++;
    glog(`🏆 Takeover SUCCESS: ${c.name} from ${def.name}  [${roll.toFixed(3)} ≤ ${effP.toFixed(3)}]`, 'good');
  } else {
    const lost = Math.floor(cost * 0.5);
    const ret  = cost - lost;
    p._lastTOFail = lost; // Sovereign Bailout can recover this
    c.failedTakeoversAgainst++;
    GS._marketInstability = Math.min(3, (GS._marketInstability || 0) + 1);
    setTimeout(() => { p.cash += ret; glog(`+$${ret} returned from failed takeover.`, 'info'); render(); }, 1900);
    glog(`💀 Takeover FAILED: ${c.name}. Lost $${lost} · $${ret} returns next turn.  [roll ${roll.toFixed(3)}]`, 'bad');
  }
  updateRegionControl(); updateStockPrices(); render();
}

/* ── Stock actions ── */
function doStockBuy(sid) {
  if (GS.currentPlayerIdx !== mySlot()) return;
  const slot = mySlot();
  const p = GS.players[slot]; const s = GS.sectors[sid];
  if (p.actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  if (s.sharesLeft <= 0)  { SFX.nope(); setInfo('❌ No shares available.'); return; }
  const cost = s.price - p.ceo.stockBonus;
  if (p.cash < cost) { SFX.nope(); setInfo(`❌ Need $${cost}, you have $${p.cash}.`); return; }
  p.cash -= cost; p.stocks[sid] = (p.stocks[sid] || 0) + 1;
  s.sharesLeft--; s.demand++;
  p.actionsLeft--;
  SFX.buy();
  glog(`${p.name} bought ${s.name} @ $${cost}  (div $${Math.round(s.price / 5)}/round)`, 'good');
  updateStockPrices(); render(); renderRightSidebar();
  // Refresh modal if still open, otherwise clearAction handles auto-end
  if (p.actionsLeft > 0) { closeModal(); showStocksModal(); }
  else { closeModal(); clearAction(); }
}

function doStockSell(sid) {
  if (GS.currentPlayerIdx !== mySlot()) return;
  const slot = mySlot();
  const p = GS.players[slot];
  if (p.actionsLeft <= 0)               { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  if (!p.stocks[sid] || p.stocks[sid] <= 0) { SFX.nope(); setInfo('❌ No shares to sell.'); return; }
  const s = GS.sectors[sid];
  p.cash += s.price; p.stocks[sid]--;
  s.sharesLeft++; s.demand = Math.max(0, s.demand - 1);
  p.actionsLeft--;
  SFX.sell();
  glog(`${p.name} sold ${s.name} @ $${s.price}`, 'warn');
  updateStockPrices(); render(); renderRightSidebar();
  if (p.actionsLeft > 0) { closeModal(); showStocksModal(); }
  else { closeModal(); clearAction(); }
}

/* ── Tactical cards ── */
function showCardMenu() {
  if (GS.currentPlayerIdx !== mySlot()) return;
  const p = GS.players[mySlot()];
  if (p.actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  const av = p.tactics.map((t, i) => ({...t, i})).filter(t => !t.used);
  if (av.length === 0) { SFX.nope(); setInfo('❌ All tactical cards have been used.'); return; }
  const rows = av.map(t => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border:1px solid var(--border);border-radius:var(--r2);padding:9px 12px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">${t.icon}</span>
        <div>
          <div style="font-family:var(--font-ui);font-weight:700;font-size:12px;color:var(--gold)">${t.name}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">${t.effect}</div>
        </div>
      </div>
      <button class="mbtn pri" style="flex:none;padding:5px 12px;font-size:10px;min-width:auto" onclick="playTacticFromMenu(${t.i})">PLAY</button>
    </div>`).join('');
  showModal('🃏 Tactical Cards', rows + `<div class="mbtns"><button class="mbtn" onclick="closeModal()">Cancel</button></div>`);
}

function playTacticFromMenu(i) { closeModal(); playTactic(mySlot(), i); }

function playTactic(pid, i) {
  const p = GS.players[pid];
  if (pid === mySlot() && p.actionsLeft <= 0) { SFX.nope(); return; }
  const t = p.tactics[i];
  if (t.used) return;
  t.used = true;
  t.action(p);
  if (pid === mySlot()) { p.actionsLeft--; clearAction(); }
  render();
}

/* ══════════════════════════════════════════════════════
   BOOT — runs once after all scripts load
══════════════════════════════════════════════════════ */

/* Drawer backdrop for mobile */
const _drawerBackdrop = document.createElement('div');
_drawerBackdrop.id = 'drawer-backdrop';
_drawerBackdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:299;display:none;';
_drawerBackdrop.onclick = () => {
  document.getElementById('left').classList.remove('drawer-open');
  _drawerBackdrop.style.display = 'none';
};
document.body.appendChild(_drawerBackdrop);

/* Patch toggleLeft to show/hide backdrop on mobile */
(function() {
  const _orig = toggleLeft;
  toggleLeft = function() {
    _orig();
    if (window.innerWidth <= 640) {
      _drawerBackdrop.style.display =
        document.getElementById('left').classList.contains('drawer-open') ? 'block' : 'none';
    }
  };
})();

/* Initial setup screen + bonus preview */
buildBonusPreview(2); // default 1v1 preview
document.getElementById('setup-overlay').style.display = '';
