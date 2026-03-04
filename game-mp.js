'use strict';

/* ──────────────────── MULTIPLAYER ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — MULTIPLAYER ENGINE
   PeerJS WebRTC · Host-authoritative
   BUGS FIXED:
   1. Client lobby/setup overlay now hidden when game starts
   2. Client can request state resend if packet missed
   3. Host rebuilds startup bonuses for actual player count
   4. mpApplyState hides overlays on first packet
════════════════════════════════════════════════ */

function setupTab(tab) {
  document.getElementById('stab-solo').classList.toggle('active', tab === 'solo');
  document.getElementById('stab-online').classList.toggle('active', tab === 'online');
  document.getElementById('spane-solo').classList.toggle('active', tab === 'solo');
  document.getElementById('spane-online').classList.toggle('active', tab === 'online');
  SFX.ui();
}

/* ── Online role selection ── */
function mpSelectRole(role) {
  MP.role = role;
  document.getElementById('mp-host-card').classList.toggle('sel', role === 'host');
  document.getElementById('mp-join-card').classList.toggle('sel', role === 'join');
  document.getElementById('mp-join-row').style.display = role === 'join' ? 'flex' : 'none';
  SFX.ui();
}

/* ── Generate / validate room code ── */
function mpGenCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
function mpPeerId(code, slot) { return `corpdom-${code}-${slot}`; }

/* ── Copy room code to clipboard ── */
function mpCopyCode() {
  navigator.clipboard?.writeText(MP.roomCode).catch(()=>{});
  const el = document.getElementById('lobby-code');
  el.style.opacity = '0.4';
  setTimeout(() => el.style.opacity = '1', 600);
  setLobbyStatus('ok', `Room code ${MP.roomCode} copied to clipboard!`);
}

function setLobbyStatus(state, msg) {
  const dot = document.getElementById('lobby-dot');
  dot.className = 'lobby-dot ' + state;
  document.getElementById('lobby-status-txt').textContent = msg;
}

/* ─────────────────────────────────────────────
   CONNECT — host or join
───────────────────────────────────────────── */
function mpConnect() {
  const role = MP.role;
  if (!role || role === 'solo') { alert('Select Host or Join first.'); return; }

  if (role === 'join') {
    const code = document.getElementById('mp-code-input').value.trim().toUpperCase();
    if (code.length !== 6) { alert('Enter a 6-character room code.'); return; }
    MP.roomCode = code;
  } else {
    MP.roomCode = mpGenCode();
  }

  MP.tutCheck = document.getElementById('tut-check-mp')?.checked ?? true;
  MP.isHost   = role === 'host';
  MP.active   = true;

  // Show lobby
  document.getElementById('setup-overlay').style.display = 'none';
  document.getElementById('lobby-overlay').classList.add('show');
  document.getElementById('lobby-code').textContent = MP.roomCode;
  document.getElementById('lobby-code-block').style.display = MP.isHost ? 'block' : 'none';

  if (MP.isHost) {
    document.getElementById('lobby-title').textContent = 'Your Room';
    document.getElementById('lobby-sub').textContent   = 'Share the code below — up to 3 friends can join';
    mpInitHost();
  } else {
    document.getElementById('lobby-title').textContent = 'Joining Room';
    document.getElementById('lobby-sub').textContent   = `Connecting to room ${MP.roomCode}…`;
    mpInitClient();
  }
}

/* ─────────────────────────────────────────────
   HOST SETUP
───────────────────────────────────────────── */
function mpInitHost() {
  MP.localSlot = 0;
  MP.slots[0]  = { name:'YOU (Host)', filled:true, ready:true, peerId:null, isLocal:true };
  setLobbyStatus('connecting', 'Opening connection server…');

  try {
    MP.peer = new Peer(mpPeerId(MP.roomCode, 0), { debug: 0 });
  } catch(e) {
    setLobbyStatus('err', 'PeerJS not available — check internet connection.');
    return;
  }

  MP.peer.on('open', id => {
    setLobbyStatus('ok', `Room open · Waiting for players (${Object.keys(MP.conns).length}/3 joined)`);
    renderLobby();
  });

  MP.peer.on('connection', conn => {
    conn.on('open', () => {
      // Assign next free slot
      const slot = MP.slots.findIndex((s, i) => i > 0 && !s.filled);
      if (slot === -1) { conn.send({type:'full'}); conn.close(); return; }
      MP.conns[conn.peer] = conn;
      MP.slots[slot] = { name:`Player ${slot+1}`, filled:true, ready:false, peerId:conn.peer, isLocal:false };
      conn.send({ type:'assigned', slot, roomCode:MP.roomCode });
      mpHostBroadcast({ type:'lobby', slots: MP.slots });
      setLobbyStatus('ok', `${Object.keys(MP.conns).length} player(s) connected — waiting for ready…`);
      renderLobby();

      conn.on('data', data => mpHostReceive(data, conn.peer));
      conn.on('close', () => {
        MP.slots[slot] = { name:'—', filled:false, ready:false, peerId:null, isLocal:false };
        delete MP.conns[conn.peer];
        mpHostBroadcast({ type:'lobby', slots: MP.slots });
        renderLobby();
        setLobbyStatus('ok', `Player disconnected. ${Object.keys(MP.conns).length} connected.`);
        mpCheckStartable();
      });
    });
  });

  MP.peer.on('error', e => {
    setLobbyStatus('err', `Connection error: ${e.type}`);
  });

  renderLobby();
}

function mpHostReceive(data, peerId) {
  if (data.type === 'ready') {
    const slot = MP.slots.findIndex(s => s.peerId === peerId);
    if (slot !== -1) { MP.slots[slot].ready = true; }
    mpHostBroadcast({ type:'lobby', slots: MP.slots });
    renderLobby();
    mpCheckStartable();
  }
  // Client missed the initial state packet — resend
  if (data.type === 'requestState') {
    const conn = MP.conns[peerId];
    if (conn) { try { conn.send({ type:'state', gs: mpSerialiseGS() }); } catch(e){} }
  }
  // Chat relay: host receives from client, rebroadcasts to everyone then renders locally
  if (data.type === 'chat') {
    mpHostBroadcast(data);      // relay to all other clients
    mpRenderChatMsg(data);      // show on host screen
  }
  if (data.type === 'action' && MP.active && GS.currentPlayerIdx === mpSlotForPeer(peerId)) {
    mpExecuteRemoteAction(data, mpSlotForPeer(peerId));
  }
}

function mpSlotForPeer(peerId) {
  return MP.slots.findIndex(s => s.peerId === peerId);
}

function mpHostBroadcast(msg) {
  Object.values(MP.conns).forEach(c => { try { c.send(msg); } catch(e){} });
}

function mpCheckStartable() {
  const humanSlots = MP.slots.filter(s => s.filled);
  const allReady   = humanSlots.every(s => s.ready || s.isLocal);
  const btn        = document.getElementById('lobby-start-btn');
  if (btn) btn.disabled = !allReady;
}

/* ─────────────────────────────────────────────
   CLIENT SETUP
───────────────────────────────────────────── */
function mpInitClient() {
  setLobbyStatus('connecting', `Connecting to room ${MP.roomCode}…`);
  try {
    const clientId = `corpdom-${MP.roomCode}-c${Date.now()}`;
    MP.peer = new Peer(clientId, { debug: 0 });
  } catch(e) {
    setLobbyStatus('err', 'PeerJS not available — check internet connection.');
    return;
  }

  MP.peer.on('open', () => {
    setLobbyStatus('connecting', 'Reaching host…');
    const conn = MP.peer.connect(mpPeerId(MP.roomCode, 0));
    MP.hostConn = conn;

    conn.on('open', () => {
      setLobbyStatus('ok', 'Connected to host — waiting for slot assignment…');
    });

    conn.on('data', data => mpClientReceive(data));

    conn.on('close', () => {
      setLobbyStatus('err', 'Lost connection to host.');
      if (!GS.gameOver) showModal('Disconnected', `<p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tx-md);margin-bottom:14px">Lost connection to the host. The game cannot continue.</p><div class="mbtns"><button class="mbtn pri" onclick="location.reload()">Reload</button></div>`);
    });

    conn.on('error', e => setLobbyStatus('err', `Peer error: ${e}`));
  });

  MP.peer.on('error', e => {
    if (e.type === 'peer-unavailable') {
      setLobbyStatus('err', `Room "${MP.roomCode}" not found. Check the code and try again.`);
    } else {
      setLobbyStatus('err', `Connection error: ${e.type}`);
    }
  });

  // Mark self as ready immediately (client has no "ready" button flow — just joins)
  setTimeout(() => {
    if (MP.hostConn?.open) MP.hostConn.send({ type:'ready' });
  }, 2000);
}

function mpClientReceive(data) {
  if (data.type === 'full') {
    setLobbyStatus('err', 'Room is full (4 players max).');
    return;
  }
  if (data.type === 'assigned') {
    MP.localSlot = data.slot;
    setLobbyStatus('ok', `Joined as Player ${data.slot + 1} — waiting for host to start…`);
    if (MP.hostConn?.open) MP.hostConn.send({ type:'ready' });
  }
  if (data.type === 'lobby') {
    MP.slots = data.slots;
    renderLobby();
  }
  if (data.type === 'start') {
    mpClientBeginGame(data);
  }
  if (data.type === 'state') {
    mpApplyState(data.gs);
  }
  if (data.type === 'chat') {
    mpRenderChatMsg(data);
  }
}

/* ─────────────────────────────────────────────
   LOBBY RENDER
───────────────────────────────────────────── */
function renderLobby() {
  const el = document.getElementById('lobby-slots');
  if (!el) return;
  el.innerHTML = MP.slots.map((s, i) => {
    const pColor = PLAYER_DEFS[i]?.color || '#666';
    let badge = '';
    if (i === 0 && s.filled) badge = `<div class="lslot-badge host">HOST</div>`;
    else if (s.filled && s.ready) badge = `<div class="lslot-badge ready">READY</div>`;
    else if (s.filled) badge = `<div class="lslot-badge wait">JOINING</div>`;
    else badge = `<div class="lslot-badge ai">AI BOT</div>`;
    return `<div class="lslot ${s.filled ? 'filled' : ''}">
      <div class="lslot-num">${i+1}</div>
      <div class="lslot-icon">${s.filled ? '🧑' : '🤖'}</div>
      <div class="lslot-name" style="color:${s.filled ? pColor : 'var(--tx-lo)'}">${s.filled ? s.name : 'Open Slot'}</div>
      ${badge}
    </div>`;
  }).join('');

  // Update start button
  if (MP.isHost) mpCheckStartable();
}

/* ─────────────────────────────────────────────
   START GAME (host triggers)
───────────────────────────────────────────── */
function mpStartGame() {
  if (!MP.isHost) return;
  const humanCount = MP.slots.filter(s => s.filled).length;
  const numAI      = 3 - (humanCount - 1); // fill remaining with AI
  MP.numHumans     = humanCount;

  // Build player defs: human slots first, AI fill rest
  // We repurpose PLAYER_DEFS but set isHuman flags per slot
  const startData = {
    type: 'start',
    roomCode: MP.roomCode,
    numAI,
    humanSlots: MP.slots.map((s,i) => ({ slot:i, filled:s.filled, name:s.name })),
    tutCheck: MP.tutCheck,
  };
  mpHostBroadcast(startData);
  mpBeginGameAsHost(startData);
}

function mpBeginGameAsHost(data) {
  document.getElementById('lobby-overlay').classList.remove('show');

  // Mark non-human slots as AI
  data.humanSlots.forEach((s, i) => {
    if (i > 0 && PLAYER_DEFS[i]) {
      PLAYER_DEFS[i].isHuman = s.filled;
      if (s.filled) PLAYER_DEFS[i].name = s.name || `P${i+1}`;
    }
  });

  // Compute how many AI needed
  const numAI = PLAYER_DEFS.slice(1).filter(p => !p.isHuman).length;
  // Pad to always have 4 players but correctly flagged
  const totalAI = 3; // always init 4p, some are human
  initGameData(totalAI); // inits all 4 player slots

  // Override isHuman on GS.players
  GS.players.forEach((p, i) => {
    p.isHuman = MP.slots[i]?.filled ?? (i === 0);
  });

  // Rebuild bonuses for actual player count (was only built for preview count)
  buildBonusPreview(GS.players.length);
  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));
  setPhase(1); // must come before updateStockPrices — GS.phase.stockMod is read there
  updateRegionControl();
  updateStockPrices();

  render(); renderRoundTrack();
  mpBroadcastState(); // send initial state to all clients
  // Show chat
  const chatBtn = document.getElementById('chat-btn');
  if (chatBtn) chatBtn.style.display = 'flex';
  mpChatSystem('=== ONLINE GAME STARTED ===');
  if (data.tutCheck) startTutorial(); else showPhaseAnnounce();
  glog('=== ONLINE GAME STARTED ===', 'phase');
}

function mpClientBeginGame(data) {
  document.getElementById('lobby-overlay').classList.remove('show');
  document.getElementById('setup-overlay').style.display = 'none';
  setInfo('⏳ Waiting for host to send game state…');
  // Show chat button
  const chatBtn = document.getElementById('chat-btn');
  if (chatBtn) chatBtn.style.display = 'flex';
  // If host already sent state before this callback fired, request resend
  if (MP.hostConn && MP.hostConn.open) {
    MP.hostConn.send({ type: 'requestState' });
  }
}

/* ─────────────────────────────────────────────
   STATE SYNC
   Serialise/deserialise GS for network transfer
   Tactics action functions are stripped and reconstructed by index
───────────────────────────────────────────── */
function mpSerialiseGS() {
  return {
    round:        GS.round,
    maxRounds:    GS.maxRounds,
    phaseIdx:     GS.phaseIdx,
    lastPhaseIdx: GS.lastPhaseIdx,
    currentPlayerIdx: GS.currentPlayerIdx,
    gameOver:     GS.gameOver,
    currentEvent: GS.currentEvent ? GS.currentEvent.name : null,
    roundPhasesIdx: GS.roundPhasesIdx,
    stats:        GS.stats,
    players: GS.players.map(p => ({
      id: p.id, name: p.name, color: p.color, isHuman: p.isHuman, style: p.style,
      cash: p.cash, actionsLeft: p.actionsLeft, stocks: p.stocks,
      ceo: p.ceo, fortified: p.fortified, _noTakeover: p._noTakeover, _revPenalty: p._revPenalty,
      tactics: p.tactics.map(t => ({ name:t.name, icon:t.icon, effect:t.effect, used:t.used,
        poolIdx: TACTICS_POOL.findIndex(tp => tp.name === t.name) })),
    })),
    companies: GS.companies.map(c => ({ ...c, trait: c.trait ? c.trait.name : null })),
    sectors:   GS.sectors,
    regions:   GS.regions,
  };
}

function mpApplyState(gs) {
  GS.round        = gs.round;
  GS.maxRounds    = gs.maxRounds;
  GS.phaseIdx     = gs.phaseIdx;
  GS.lastPhaseIdx = gs.lastPhaseIdx;
  GS.phase        = PHASES[gs.phaseIdx];
  GS.currentPlayerIdx = gs.currentPlayerIdx;
  GS.gameOver     = gs.gameOver;
  GS.roundPhasesIdx = gs.roundPhasesIdx;
  GS.stats        = gs.stats;
  GS.sectors      = gs.sectors;
  GS.regions      = gs.regions;

  // Restore event
  if (gs.currentEvent) {
    GS.currentEvent = GLOBAL_EVENTS.find(e => e.name === gs.currentEvent) || null;
  } else { GS.currentEvent = null; }

  // Restore players (with tactic action functions)
  GS.players = gs.players.map(p => ({
    ...p,
    tactics: p.tactics.map(t => {
      const pool = t.poolIdx >= 0 ? TACTICS_POOL[t.poolIdx] : TACTICS_POOL[0];
      return { ...pool, used: t.used };
    }),
  }));

  // Ensure overlays are hidden when first state arrives
  document.getElementById('setup-overlay').style.display = 'none';
  document.getElementById('lobby-overlay').classList.remove('show');

  // Restore companies (with trait objects)
  GS.companies = gs.companies.map(c => ({
    ...c,
    trait: c.trait ? COMPANY_TRAITS.find(t => t.name === c.trait) || null : null,
  }));

  render();
  renderRoundTrack();
  updateTurnUI();

  // Show lock overlay if it's not our turn
  const myTurn = GS.currentPlayerIdx === MP.localSlot;
  document.getElementById('net-lock').classList.toggle('show', !myTurn && !GS.gameOver);
  const turnerName = GS.players[GS.currentPlayerIdx]?.name || '?';
  const lockEl = document.getElementById('net-lock-name');
  if (lockEl) lockEl.textContent = turnerName;
}

/* Broadcast full game state from host to all clients */
function mpBroadcastState() {
  if (!MP.active || !MP.isHost) return;
  mpHostBroadcast({ type:'state', gs: mpSerialiseGS() });
}

/* ─────────────────────────────────────────────
   REMOTE ACTION EXECUTION (host side)
   Client sends { type:'action', action, cid?, sid? }
   Host executes, then broadcasts new state
───────────────────────────────────────────── */
function mpExecuteRemoteAction(data, slotIdx) {
  // Temporarily set currentPlayerIdx to the remote player's slot
  // so action functions work correctly
  const prevIdx = GS.currentPlayerIdx;
  GS.currentPlayerIdx = slotIdx;
  const p = GS.players[slotIdx];
  if (!p || p.actionsLeft <= 0) { GS.currentPlayerIdx = prevIdx; return; }

  switch (data.action) {
    case 'acquire': {
      const c = GS.companies.find(x => x.id === data.cid);
      if (c && c.ownerId === null && p.cash >= c.baseValue) {
        p.cash -= c.baseValue; c.ownerId = slotIdx; p.actionsLeft--;
        glog(`${p.name} acquired ${c.name}`, 'info');
        updateRegionControl(); updateStockPrices();
      }
      break;
    }
    case 'upgrade': {
      const c = GS.companies.find(x => x.id === data.cid);
      if (c && c.ownerId === slotIdx && applyUpgrade(c)) { p.actionsLeft--; updateStockPrices(); }
      break;
    }
    case 'sell': {
      const c = GS.companies.find(x => x.id === data.cid);
      if (c && c.ownerId === slotIdx) {
        const sp = calcSellPrice(c);
        p.cash += sp; c.ownerId = null; c.upgrades = 0; c.level = 1; c.revenue = c.initRevenue;
        p.actionsLeft--;
        glog(`${p.name} sold ${c.name} for $${sp}`, 'warn');
        updateRegionControl(); updateStockPrices();
      }
      break;
    }
    case 'takeover': {
      const c = GS.companies.find(x => x.id === data.cid);
      if (c && c.ownerId !== null && c.ownerId !== slotIdx) {
        const tk = calcTakeover(slotIdx, c);
        if (p.cash >= tk.cost) {
          p.cash -= tk.cost; p.actionsLeft--; GS.stats.toa[slotIdx]++;
          const def = GS.players[c.ownerId];
          const fp  = def.fortified ? 0.15 : 0; if(def.fortified) def.fortified=false;
          const ep  = Math.max(0.05, tk.P - fp);
          const roll = Math.random();
          if (roll <= ep) { c.ownerId = slotIdx; GS.stats.tos[slotIdx]++; glog(`${p.name} ⚔ captured ${c.name}`, 'warn'); }
          else { const ret=Math.floor(tk.cost*.5); c.failedTakeoversAgainst++; GS._marketInstability = Math.min(3, GS._marketInstability + 1); setTimeout(()=>{p.cash+=ret; mpBroadcastState();},1900); glog(`${p.name} takeover failed: ${c.name}`, 'info'); }
          updateRegionControl(); updateStockPrices();
        }
      }
      break;
    }
    case 'stockBuy': {
      const s = GS.sectors[data.sid];
      const cost = s.price - p.ceo.stockBonus;
      if (s && s.sharesLeft > 0 && p.cash >= cost) {
        p.cash -= cost; p.stocks[data.sid]=(p.stocks[data.sid]||0)+1; s.sharesLeft--; s.demand++; p.actionsLeft--;
        updateStockPrices();
      }
      break;
    }
    case 'stockSell': {
      const s = GS.sectors[data.sid];
      if (s && p.stocks[data.sid] > 0) {
        p.cash += s.price; p.stocks[data.sid]--; s.sharesLeft++; s.demand=Math.max(0,s.demand-1); p.actionsLeft--;
        updateStockPrices();
      }
      break;
    }
    case 'endTurn': {
      GS.currentPlayerIdx = prevIdx; // restore before endTurn logic
      mpEndTurnForSlot(slotIdx);
      mpBroadcastState();
      return;
    }
    case 'pass': {
      if (p.actionsLeft > 0) {
        p.actionsLeft--;
        glog(`${p.name}: passed action.`, 'info');
      }
      break;
    }
    case 'tactic': {
      const t = p.tactics[data.idx];
      if (t && !t.used && p.actionsLeft > 0) {
        t.used = true;
        t.action(p);
        p.actionsLeft--;
        updateRegionControl(); updateStockPrices();
      }
      break;
    }
  }

  GS.currentPlayerIdx = prevIdx;
  render();
  mpBroadcastState();
}

/* End-of-turn handling for a remote human player */
async function mpEndTurnForSlot(slotIdx) {
  // Advance to next human or AI
  let nextIdx = (slotIdx + 1) % GS.players.length;
  GS.currentPlayerIdx = nextIdx;
  // Run AI turns for any AI slots
  while (nextIdx < GS.players.length && !GS.players[nextIdx].isHuman) {
    await runAITurn(nextIdx);
    nextIdx++;
  }
  if (nextIdx >= GS.players.length) {
    endRound(); // all players done — triggers endRound which broadcasts
  } else {
    GS.currentPlayerIdx = nextIdx;
    render(); updateTurnUI();
    mpBroadcastState();
  }
}

/* ── Client: send action to host ── */
function mpSendAction(data) {
  if (!MP.active || MP.isHost) return false;
  if (GS.currentPlayerIdx !== MP.localSlot) return false;
  if (MP.hostConn?.open) { MP.hostConn.send({ type:'action', ...data }); return true; }
  return false;
}

/* ── Client: send end turn ── */
function mpSendEndTurn() {
  if (!MP.active || MP.isHost) return false;
  if (GS.currentPlayerIdx !== MP.localSlot) return false;
  if (MP.hostConn?.open) { MP.hostConn.send({ type:'action', action:'endTurn' }); return true; }
  return false;
}

/* ── Leave lobby ── */
function mpLeaveLobby() {
  MP.peer?.destroy();
  MP.active = false; MP.peer = null; MP.conns = {}; MP.hostConn = null;
  document.getElementById('lobby-overlay').classList.remove('show');
  document.getElementById('setup-overlay').style.display = 'flex';
}

/* ─────────────────────────────────────────────
   CHAT SYSTEM
   Host receives from clients → relays to all → renders locally
   Clients send direct to host
   Solo players cannot access chat (chat-btn stays hidden)
───────────────────────────────────────────── */

let _chatUnread = 0;
let _chatOpen   = false;

function toggleChat() {
  _chatOpen = !_chatOpen;
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.toggle('open', _chatOpen);
  if (_chatOpen) {
    _chatUnread = 0;
    const badge = document.getElementById('chat-unread');
    if (badge) { badge.textContent = ''; badge.classList.remove('show'); }
    // scroll to bottom
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    setTimeout(() => document.getElementById('chat-input')?.focus(), 120);
  }
}

function mpSendChat() {
  if (!MP.active) return;
  const input = document.getElementById('chat-input');
  const text  = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const p = GS.players[MP.localSlot];
  const msg = {
    type:  'chat',
    slot:  MP.localSlot,
    name:  p?.name || `P${MP.localSlot + 1}`,
    color: p?.color || '#6366f1',
    text,
    ts:    Date.now(),
  };
  // Host sends to all clients and renders locally
  // Client sends to host (who relays back to everyone incl. sender)
  if (MP.isHost) {
    mpHostBroadcast(msg);
    mpRenderChatMsg(msg);
  } else {
    if (MP.hostConn?.open) MP.hostConn.send(msg);
    // Optimistic local render so sender sees their message immediately
    mpRenderChatMsg({ ...msg, _optimistic: true });
  }
}

function chatQuick(text) {
  const input = document.getElementById('chat-input');
  if (input) input.value = text;
  mpSendChat();
}

function mpChatSystem(text) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'cmsg-sys';
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function mpRenderChatMsg(data) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  // Deduplicate optimistic renders: if we're a client and get back our own message, skip
  if (!MP.isHost && data.slot === MP.localSlot && !data._optimistic) {
    // Find and remove the optimistic copy if it exists
    const opts = msgs.querySelectorAll('.cmsg.mine.optimistic');
    opts.forEach(el => el.remove());
  }

  const isMine = data.slot === MP.localSlot;
  const d   = new Date(data.ts);
  const hh  = String(d.getHours()).padStart(2,'0');
  const mm  = String(d.getMinutes()).padStart(2,'0');

  const div = document.createElement('div');
  div.className = `cmsg${isMine ? ' mine' : ''}${data._optimistic ? ' optimistic' : ''}`;
  div.innerHTML = `
    <div class="cmsg-meta">
      <span class="cmsg-name" style="color:${data.color}">${data.name}</span>
      <span class="cmsg-time">${hh}:${mm}</span>
    </div>
    <div class="cmsg-text">${escapeHtml(data.text)}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;

  // Badge if panel is closed
  if (!_chatOpen) {
    _chatUnread++;
    const badge = document.getElementById('chat-unread');
    if (badge) {
      badge.textContent = _chatUnread > 9 ? '9+' : _chatUnread;
      badge.classList.add('show');
    }
    // Flash info strip on non-sender messages
    if (!isMine) {
      setInfo(`💬 <b style="color:${data.color}">${data.name}</b>: ${escapeHtml(data.text)}`);
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────
   PATCH EXISTING FUNCTIONS FOR ONLINE AWARENESS
   Intercept human action executors to route through
   MP.sendAction when in online mode as a client
───────────────────────────────────────────── */

/* Wrap/guard action functions so MP can route client actions when needed.
   If the core function doesn't exist yet, provide a safe fallback that still
   routes actions for remote clients. */
if (typeof doAcquire === 'function') {
  const _doAcquire = doAcquire;
  globalThis.doAcquire = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'acquire',cid}); clearAction(); return; }
    _doAcquire(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doAcquire = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'acquire',cid}); clearAction(); return; }
    console.warn('doAcquire called before core is defined');
  };
}

if (typeof doUpgrade === 'function') {
  const _doUpgrade = doUpgrade;
  globalThis.doUpgrade = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'upgrade',cid}); clearAction(); return; }
    _doUpgrade(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doUpgrade = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'upgrade',cid}); clearAction(); return; }
    console.warn('doUpgrade called before core is defined');
  };
}

if (typeof doSell === 'function') {
  const _doSell = doSell;
  globalThis.doSell = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'sell',cid}); clearAction(); return; }
    _doSell(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doSell = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'sell',cid}); clearAction(); return; }
    console.warn('doSell called before core is defined');
  };
}

if (typeof doTakeover === 'function') {
  const _doTakeover = doTakeover;
  globalThis.doTakeover = function(cid, cost, prob) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'takeover',cid}); clearAction(); return; }
    _doTakeover(cid, cost, prob);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doTakeover = function(cid, cost, prob) {
    if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'takeover',cid}); clearAction(); return; }
    console.warn('doTakeover called before core is defined');
  };
}

if (typeof doStockBuy === 'function') {
  const _doStockBuy = doStockBuy;
  globalThis.doStockBuy = function(sid) {
    if (MP.active && !MP.isHost) { mpSendAction({action:'stockBuy',sid}); return; }
    _doStockBuy(sid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doStockBuy = function(sid) {
    if (MP.active && !MP.isHost) { mpSendAction({action:'stockBuy',sid}); return; }
    console.warn('doStockBuy called before core is defined');
  };
}

if (typeof doStockSell === 'function') {
  const _doStockSell = doStockSell;
  globalThis.doStockSell = function(sid) {
    if (MP.active && !MP.isHost) { mpSendAction({action:'stockSell',sid}); return; }
    _doStockSell(sid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doStockSell = function(sid) {
    if (MP.active && !MP.isHost) { mpSendAction({action:'stockSell',sid}); return; }
    console.warn('doStockSell called before core is defined');
  };
}

if (typeof endTurn === 'function') {
  const _endTurn = endTurn;
  globalThis.endTurn = async function() {
    if (MP.active && !MP.isHost) { mpSendEndTurn(); return; }
    await _endTurn();
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.endTurn = async function() {
    if (MP.active && !MP.isHost) { mpSendEndTurn(); return; }
    console.warn('endTurn called before core is defined');
  };
}

// Guard handleCompanyClick — block if not our turn in online mode
if (typeof handleCompanyClick === 'function') {
  const _handleCompanyClick = handleCompanyClick;
  globalThis.handleCompanyClick = function(cid) {
    if (MP.active && GS.currentPlayerIdx !== MP.localSlot) { setInfo('⏳ Not your turn — wait for other players.'); return; }
    _handleCompanyClick(cid);
  };
} else {
  globalThis.handleCompanyClick = function(cid) {
    if (MP.active && GS.currentPlayerIdx !== MP.localSlot) { setInfo('⏳ Not your turn — wait for other players.'); return; }
    console.warn('handleCompanyClick called before core is defined');
  };
}

// Wrap passAction — client routes {action:'pass'} to host
if (typeof passAction === 'function') {
  const _passAction = passAction;
  globalThis.passAction = function() {
    if (MP.active && !MP.isHost) { mpSendAction({ action:'pass' }); return; }
    _passAction();
    if (MP.active && MP.isHost) mpBroadcastState();
  };
}

// Wrap playTacticFromMenu — client routes {action:'tactic', idx} to host
if (typeof playTacticFromMenu === 'function') {
  const _playTacticFromMenu = playTacticFromMenu;
  globalThis.playTacticFromMenu = function(i) {
    if (MP.active && !MP.isHost) {
      closeModal();
      mpSendAction({ action:'tactic', idx: i });
      clearAction();
      return;
    }
    _playTacticFromMenu(i);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
}
