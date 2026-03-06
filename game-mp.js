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

/* ─────────────────────────────────────────────
   PEERJS CONFIG — public PeerJS signaling server
   Game data is fully peer-to-peer (WebRTC).
   Signaling server only brokers the handshake.
───────────────────────────────────────────── */
function makePeerCfg() {
  return {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ]
    }
  };
}


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
function mpPeerId(code, slot) {
  // Include a session salt on the host ID so re-used room codes don't collide with
  // a previous session that may still be registered on the signaling server.
  return `corpdom-${code}-${slot}`;
}

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

  const rawName = document.getElementById('mp-name-input')?.value?.trim().toUpperCase() || '';
  MP.playerName = rawName.replace(/[^A-Z0-9]/g,'').slice(0,8) || (role === 'host' ? 'HOST' : 'PLAYER');

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
    MP.slots[0].name = MP.playerName;
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
  MP.slots[0]  = { name: MP.playerName || 'HOST', filled:true, ready:true, peerId:null, isLocal:true };
  setLobbyStatus('connecting', 'Opening connection server…');

  try {
    MP.peer = new Peer(mpPeerId(MP.roomCode, 0), makePeerCfg());
  } catch(e) {
    setLobbyStatus('err', 'PeerJS not available — check internet connection.');
    return;
  }

  MP.peer.on('open', id => {
    setLobbyStatus('ok', `Room open · Waiting for players (${Object.keys(MP.conns).length}/3 joined)`);
    renderLobby();
  });

  MP.peer.on('connection', conn => {
    // Register data/close handlers IMMEDIATELY at connection level,
    // before 'open' fires — prevents the race where client sends 'ready'
    // before the host's data handler is attached.
    conn.on('data',  data => mpHostReceive(data, conn.peer));
    conn.on('close', () => {
      const wasInGame = GS.round > 0 && !GS.gameOver && GS.players.length > 0;
      const slot = MP.slots.findIndex(s => s.peerId === conn.peer);
      if (wasInGame && slot !== -1) {
        const leavingPlayer = GS.players[slot];
        if (leavingPlayer) {
          leavingPlayer.isHuman = false;
          glog(`⚠ ${leavingPlayer.name} left the game.`, 'warn');
          mpChatSystem(`${leavingPlayer.name} has left the game.`);
        }
        const activeHumans = GS.players.filter(p => p.isHuman).length;
        if (activeHumans <= 1) {
          glog('⚠ All opponents left — ending game.', 'warn');
          mpChatSystem('All opponents have left. Game over!');
          setTimeout(() => { endGame(); mpBroadcastState(); }, 1200);
        } else {
          if (slot !== -1 && GS.currentPlayerIdx === slot) mpEndTurnForSlot(slot);
          else mpBroadcastState();
        }
      }
      if (slot !== -1) MP.slots[slot] = { name:'—', filled:false, ready:false, peerId:null, isLocal:false };
      delete MP.conns[conn.peer];
      if (!wasInGame) {
        mpHostBroadcast({ type:'lobby', slots: MP.slots });
        renderLobby();
        setLobbyStatus('ok', `Player disconnected. ${Object.keys(MP.conns).length} connected.`);
        mpCheckStartable();
      }
    });

    conn.on('open', () => {
      const slot = MP.slots.findIndex((s, i) => i > 0 && !s.filled);
      if (slot === -1) { conn.send({type:'full'}); conn.close(); return; }
      // Register conn FIRST so mpHostBroadcast can reach this client
      MP.conns[conn.peer] = conn;
      // Apply any pending name/ready that arrived before open
      const pendingName = MP._pendingNames?.[conn.peer];
      MP.slots[slot] = {
        name:    pendingName || `Player ${slot+1}`,
        filled:  true,
        ready:   !!pendingName,
        peerId:  conn.peer,
        isLocal: false,
      };
      if (MP._pendingNames) delete MP._pendingNames[conn.peer];
      conn.send({ type:'assigned', slot, roomCode: MP.roomCode });
      mpHostBroadcast({ type:'lobby', slots: MP.slots });
      setLobbyStatus('ok', `${Object.keys(MP.conns).length} player(s) connected — waiting for ready…`);
      renderLobby();
      if (pendingName) mpCheckStartable();
    });
  });

  MP.peer.on('error', e => {
    if (e.type === 'unavailable-id') {
      // Room code already in use by an active session — generate a new one and retry
      setLobbyStatus('connecting', 'Room code taken — generating a new one…');
      setTimeout(() => {
        MP.roomCode = mpGenCode();
        document.getElementById('lobby-code').textContent = MP.roomCode;
        MP.peer?.destroy();
        MP.peer = null;
        mpInitHost();
      }, 800);
    } else {
      setLobbyStatus('err', `Connection error: ${e.type} — check your internet connection and try again.`);
    }
  });

  renderLobby();
}

function mpHostReceive(data, peerId) {
  if (data.type === 'ready') {
    const slot = MP.slots.findIndex(s => s.peerId === peerId);
    if (slot !== -1) {
      MP.slots[slot].ready = true;
      if (data.name) MP.slots[slot].name = data.name; // always update — overrides pendingName placeholder
      mpHostBroadcast({ type:'lobby', slots: MP.slots });
      renderLobby();
      mpCheckStartable();
    } else {
      // Slot not yet assigned (data arrived before open) — queue it
      if (!MP._pendingNames) MP._pendingNames = {};
      MP._pendingNames[peerId] = data.name || 'PLAYER';
    }
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
  const n          = humanSlots.length;
  const allReady   = n >= 2 && humanSlots.every(s => s.ready || s.isLocal);
  const btn        = document.getElementById('lobby-start-btn');
  const info       = document.getElementById('lobby-info');
  if (btn) btn.disabled = !allReady;
  if (info) {
    if (n < 2) {
      info.textContent = 'Waiting for at least 1 more player to join…';
    } else if (!allReady) {
      info.textContent = `${n} players connected — waiting for everyone to be ready…`;
    } else {
      info.textContent = `${n} players ready — host can start!`;
    }
  }
}

/* ─────────────────────────────────────────────
   CLIENT SETUP
───────────────────────────────────────────── */
function mpInitClient() {
  setLobbyStatus('connecting', `Connecting to room ${MP.roomCode}…`);

  // Destroy any previous peer cleanly
  if (MP.peer) { try { MP.peer.destroy(); } catch(e){} MP.peer = null; }

  let _attempt        = 0;
  const MAX_ATTEMPTS  = 4;
  let   _activeConn   = null;   // track current conn so old ones can be ignored
  let   _retrying     = false;  // flag — don't show disconnect modal during intentional retry

  try {
    MP.peer = new Peer(`corpdom-${MP.roomCode}-c${Date.now()}`, makePeerCfg());
  } catch(e) {
    setLobbyStatus('err', 'PeerJS not available — check internet connection.');
    return;
  }

  function attemptConnect() {
    _attempt++;
    _retrying = false;
    const label = _attempt > 1 ? ` (attempt ${_attempt}/${MAX_ATTEMPTS})` : '';
    setLobbyStatus('connecting', `Reaching host…${label}`);

    // Close and discard any previous connection before creating a new one
    if (_activeConn) {
      _retrying = true;
      try { _activeConn.close(); } catch(e){}
      _activeConn = null;
    }

    const conn = MP.peer.connect(mpPeerId(MP.roomCode, 0), { reliable: true, serialization: 'json' });
    _activeConn  = conn;
    MP.hostConn  = conn;

    // Single open handler — send ready and clear timeout
    let _connTimeout = setTimeout(() => {
      if (!conn.open && conn === _activeConn) {
        _retrying = true;
        try { conn.close(); } catch(e){}
        _activeConn = null;
        if (_attempt < MAX_ATTEMPTS) {
          setLobbyStatus('connecting', `Timed out — retrying…`);
          setTimeout(attemptConnect, 600);
        } else {
          _retrying = false;
          setLobbyStatus('err', `Could not reach room "${MP.roomCode}". Is the host connected?`);
        }
      }
    }, 7000);

    conn.on('open', () => {
      if (conn !== _activeConn) return; // stale conn — ignore
      clearTimeout(_connTimeout);
      setLobbyStatus('ok', 'Connected — waiting for slot assignment…');
      conn.send({ type: 'ready', name: MP.playerName });
    });

    conn.on('data', data => {
      if (conn !== _activeConn) return; // stale conn — ignore
      mpClientReceive(data);
    });

    conn.on('error', e => {
      if (conn !== _activeConn) return;
      setLobbyStatus('err', `Connection error: ${e.type || e}`);
    });

    conn.on('close', () => {
      if (conn !== _activeConn) return; // stale close from a replaced conn — ignore
      clearTimeout(_connTimeout);
      if (_retrying) return; // intentional close during retry — don't show modal
      setLobbyStatus('err', 'Lost connection to host.');
      if (!GS.gameOver) {
        showModal('Disconnected', `<p style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tx-md);margin-bottom:14px">Lost connection to the host. The game cannot continue.</p><div class="mbtns"><button class="mbtn pri" onclick="location.reload()">Reload</button></div>`);
      }
    });
  }

  MP.peer.on('open', () => attemptConnect());

  MP.peer.on('error', e => {
    if (e.type === 'peer-unavailable') {
      // Host peer not found on signaling server — retry with backoff
      if (_attempt < MAX_ATTEMPTS) {
        const wait = 1000 + (_attempt * 800);
        setLobbyStatus('connecting', `Room not found — retrying in ${(wait/1000).toFixed(1)}s… (${_attempt}/${MAX_ATTEMPTS})`);
        _retrying = true;
        setTimeout(attemptConnect, wait);
      } else {
        setLobbyStatus('err', `Room "${MP.roomCode}" not found. Check the code and try again.`);
      }
    } else if (e.type === 'unavailable-id') {
      // Client ID collision — reinit with a new timestamp ID
      setLobbyStatus('connecting', 'ID conflict — reconnecting…');
      setTimeout(mpInitClient, 400);
    } else {
      setLobbyStatus('err', `Connection error: ${e.type} — check internet and try again.`);
    }
  });
}

function mpClientReceive(data) {
  if (data.type === 'full') {
    setLobbyStatus('err', 'Room is full (4 players max).');
    return;
  }
  if (data.type === 'assigned') {
    MP.localSlot = data.slot;
    setLobbyStatus('ok', `Joined as Player ${data.slot + 1} — waiting for host to start…`);
    // ready was already sent in conn.on('open') — do NOT send again here
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
    else badge = `<div class="lslot-badge open">WAITING</div>`;
    return `<div class="lslot ${s.filled ? 'filled' : 'open-slot'}">
      <div class="lslot-num">${i+1}</div>
      <div class="lslot-icon">${s.filled ? '🧑' : '⏳'}</div>
      <div class="lslot-name" style="color:${s.filled ? pColor : 'var(--tx-lo)'}">${s.filled ? s.name : 'Waiting for player…'}</div>
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
  MP.numHumans = humanCount;

  const startData = {
    type: 'start',
    roomCode: MP.roomCode,
    humanCount,
    humanSlots: MP.slots.map((s,i) => ({ slot:i, filled:s.filled, name:s.name })),
    tutCheck: MP.tutCheck,
  };
  mpHostBroadcast(startData);
  mpBeginGameAsHost(startData);
}

function mpBeginGameAsHost(data) {
  document.getElementById('lobby-overlay').classList.remove('show');

  const humanCount = data.humanCount || data.humanSlots.filter(s => s.filled).length;

  // Set names on PLAYER_DEFS for the filled slots only
  data.humanSlots.forEach((s, i) => {
    if (s.filled && PLAYER_DEFS[i]) {
      PLAYER_DEFS[i].isHuman = true;
      PLAYER_DEFS[i].name    = s.name || (i === 0 ? 'HOST' : `P${i+1}`);
    }
  });

  // initGameData(n) creates n+1 players — so pass humanCount-1
  initGameData(humanCount - 1);

  // Mark every player slot as human and apply correct names
  GS.players.forEach((p, i) => {
    p.isHuman = true;
    p.name    = MP.slots[i]?.name || (i === 0 ? 'HOST' : `P${i+1}`);
  });

  // Rebuild bonuses for this exact player count
  buildBonusPreview(humanCount);
  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));
  setPhase(1);
  updateRegionControl();
  updateStockPrices();

  render(); renderRoundTrack();
  mpBroadcastState();
  const chatBtn = document.getElementById('chat-btn');
  if (chatBtn) { chatBtn.style.display = 'flex'; chatBtn.classList.add('mp-active'); }
  mpChatSystem('=== ONLINE GAME STARTED ===');
  mpChatSystem('💬 Tap the 💬 button (top-right) to negotiate with opponents!');
  if (data.tutCheck) startTutorial(); else showPhaseAnnounce();
  glog(`=== ONLINE GAME STARTED — ${humanCount} players ===`, 'phase');
}

function mpClientBeginGame(data) {
  document.getElementById('lobby-overlay').classList.remove('show');
  document.getElementById('setup-overlay').style.display = 'none';
  setInfo('⏳ Waiting for host to send game state…');
  const chatBtn = document.getElementById('chat-btn');
  if (chatBtn) { chatBtn.style.display = 'flex'; chatBtn.classList.add('mp-active'); }
  // Request state after a short delay — host broadcasts immediately after sending 'start',
  // but the 'start' and 'state' packets may arrive out of order on slow connections.
  // Only request if state hasn't arrived within 2 seconds.
  const _stateTimeout = setTimeout(() => {
    if (GS.round === 1 && GS.players.length === 0 && MP.hostConn?.open) {
      MP.hostConn.send({ type: 'requestState' });
    }
  }, 2000);
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
    _marketInstability: GS._marketInstability || 0,
    _skipNextEvent:     GS._skipNextEvent || false,
    players: GS.players.map(p => ({
      id: p.id, name: p.name, color: p.color, isHuman: p.isHuman, style: p.style,
      cash: p.cash, actionsLeft: p.actionsLeft, stocks: p.stocks,
      ceo: p.ceo, fortified: p.fortified, _noTakeover: p._noTakeover, _noAcquire: p._noAcquire||false,
      _revPenalty: p._revPenalty, _lastTOFail: p._lastTOFail||0, _declaredBankrupt: p._declaredBankrupt||false,
      tactics: p.tactics.map(t => ({ name:t.name, icon:t.icon, effect:t.effect, used:t.used,
        poolIdx: TACTICS_POOL.findIndex(tp => tp.name === t.name) })),
    })),
    companies: GS.companies.map(c => ({ ...c, trait: c.trait ? c.trait.name : null })),
    sectors:   GS.sectors,
    regions:   GS.regions,
  };
}

function mpApplyState(gs) {
  const prevRound    = GS.round;
  const prevGameOver = GS.gameOver; // track so we can fire endGame() exactly once

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
  GS._marketInstability = gs._marketInstability || 0;
  GS._skipNextEvent     = gs._skipNextEvent     || false;

  // Restore event
  if (gs.currentEvent) {
    GS.currentEvent = GLOBAL_EVENTS.find(e => e.name === gs.currentEvent) || null;
  } else { GS.currentEvent = null; }

  // Restore players (with tactic action functions)
  GS.players = gs.players.map(p => ({
    ...p,
    _noAcquire:  p._noAcquire  || false,
    _lastTOFail: p._lastTOFail || 0,
    _declaredBankrupt: p._declaredBankrupt || false,
    tactics: p.tactics.map(t => {
      const pool = t.poolIdx >= 0 ? TACTICS_POOL[t.poolIdx] : TACTICS_POOL[0];
      return { ...pool, used: t.used };
    }),
  }));

  // Ensure overlays are hidden and key UI shown when state arrives
  document.getElementById('setup-overlay').style.display = 'none';
  document.getElementById('lobby-overlay').classList.remove('show');
  document.querySelectorAll('.leave-sidebar-btn').forEach(b => b.style.display = 'flex');
  // Always ensure chat button is visible (covers case where client missed 'start' packet)
  const chatBtn = document.getElementById('chat-btn');
  if (chatBtn) { chatBtn.style.display = 'flex'; chatBtn.classList.add('mp-active'); }

  // Restore companies (with trait objects)
  GS.companies = gs.companies.map(c => ({
    ...c,
    trait: c.trait ? COMPANY_TRAITS.find(t => t.name === c.trait) || null : null,
  }));

  render();
  renderRoundTrack();
  updateTurnUI();

  // Show phase announce when a new round starts
  if (gs.round > prevRound && gs.round > 1) {
    showPhaseAnnounce();
  }

  // Show end-game overlay if game just ended (host set gameOver, client hasn't shown it yet)
  // Guard with a flag so we never fire endGame() twice on the same client
  if (gs.gameOver && !prevGameOver && !GS._endGameShown) {
    GS._endGameShown = true;
    endGame();
  }

  // Show net-lock only when it's another player's turn mid-game
  const myTurn = GS.currentPlayerIdx === MP.localSlot;
  const showLock = !myTurn && !GS.gameOver;
  document.getElementById('net-lock').classList.toggle('show', showLock);
  const turnerName = GS.players[GS.currentPlayerIdx]?.name || '?';
  const lockEl = document.getElementById('net-lock-name');
  if (lockEl) lockEl.textContent = turnerName;

  // Give the client an info strip cue on their turn
  if (myTurn && !GS.gameOver) {
    const myP = GS.players[MP.localSlot];
    if (myP && myP.actionsLeft > 0) {
      setInfo(`Your turn — <b style="color:var(--gold)">${myP.actionsLeft} action${myP.actionsLeft !== 1 ? 's' : ''} remaining</b>. Select an action below.`);
    }
  }
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
  // endTurn must bypass the actionsLeft guard — it's valid even with 0 actions left
  if (data.action === 'endTurn') {
    mpEndTurnForSlot(slotIdx);
    return;
  }

  // Temporarily set currentPlayerIdx to the remote player's slot
  const prevIdx = GS.currentPlayerIdx;
  GS.currentPlayerIdx = slotIdx;
  const p = GS.players[slotIdx];
  if (!p || p.actionsLeft <= 0) { GS.currentPlayerIdx = prevIdx; return; }

  switch (data.action) {
    case 'acquire': {
      const c = GS.companies.find(x => x.id === data.cid);
      if (c && c.ownerId === null && p.cash >= c.baseValue && !p._noAcquire) {
        p.cash -= c.baseValue; c.ownerId = slotIdx; p.actionsLeft--;
        glog(`${p.name} acquired ${c.name}`, 'info');
        updateRegionControl(); updateStockPrices();
      } else if (p._noAcquire) {
        glog(`${p.name}: Hostile Press — acquisition blocked!`, 'warn');
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
        p.cash += sp; c.ownerId = null;
        c.upgrades = 0; c.level = 1; c.revenue = c.initRevenue;
        c._traitDef = c.trait ? 3 : 0;
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
          else {
            const ret=Math.floor(tk.cost*.5); const lost=tk.cost-ret;
            p._lastTOFail=lost; p.cash+=ret; // immediate — no setTimeout, prevents stale state broadcast race
            c.failedTakeoversAgainst++; GS._marketInstability = Math.min(3, GS._marketInstability + 1);
            glog(`${p.name} takeover failed: ${c.name}`, 'info');
          }
          updateRegionControl(); updateStockPrices();
        }
      }
      break;
    }
    case 'stockBuy': {
      const s = GS.sectors[data.sid];
      const cost = s ? s.price - p.ceo.stockBonus : 0;
      if (s && s.sharesLeft > 0 && p.cash >= cost) {
        p.cash -= cost; p.stocks[data.sid]=(p.stocks[data.sid]||0)+1;
        s.sharesLeft--; s.demand++; p.actionsLeft--;
        glog(`${p.name} bought ${s.name} @ $${cost}`, 'info');
        updateStockPrices();
      }
      break;
    }
    case 'stockSell': {
      const s = GS.sectors[data.sid];
      if (s && p.stocks[data.sid] > 0) {
        p.cash += s.price; p.stocks[data.sid]--;
        s.sharesLeft++; s.demand=Math.max(0,s.demand-1); p.actionsLeft--;
        glog(`${p.name} sold ${s.name} @ $${s.price}`, 'info');
        updateStockPrices();
      }
      break;
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
  // Always broadcast state immediately so client sees updated actionsLeft
  mpBroadcastState();
}

/* End-of-turn: advance to next player. All MP players are human — no AI runner needed. */
async function mpEndTurnForSlot(slotIdx) {
  const total   = GS.players.length;
  const nextIdx = slotIdx + 1;

  if (nextIdx >= total) {
    endRound();
    if (MP.active && MP.isHost) mpBroadcastState();
  } else {
    GS.players[nextIdx].actionsLeft = 3;
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
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    setTimeout(() => document.getElementById('chat-input')?.focus(), 120);
    // Dismiss any visible toast — user is now reading the panel
    clearTimeout(_chatToastTimer);
    const toast = document.getElementById('chat-toast');
    if (toast) { toast.style.opacity = '0'; toast.style.display = 'none'; }
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

  // Deduplicate optimistic renders
  if (!MP.isHost && data.slot === MP.localSlot && !data._optimistic) {
    msgs.querySelectorAll('.cmsg.mine.optimistic').forEach(el => el.remove());
  }

  const isMine = data.slot === MP.localSlot;
  const d  = new Date(data.ts);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');

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

  // When panel is closed: badge button + show mobile toast
  if (!_chatOpen) {
    _chatUnread++;
    const n = _chatUnread > 9 ? '9+' : String(_chatUnread);
    const badge = document.getElementById('chat-unread');
    if (badge) { badge.textContent = n; badge.classList.add('show'); }

    // Mobile toast — non-blocking 7s notification for ALL messages
    mpShowChatToast(data);
  }
}

let _chatToastTimer = null;
function mpShowChatToast(data) {
  const toast = document.getElementById('chat-toast');
  if (!toast) return;
  // Only show on mobile (panel slides from top; desktop has the side panel)
  if (window.innerWidth > 640) return;

  clearTimeout(_chatToastTimer);
  toast.style.display = 'block';
  toast.innerHTML = `<span style="color:${data.color};font-weight:700;font-family:var(--font-mono);font-size:10px">${data.name}</span> <span style="color:var(--tx-md)">·</span> ${escapeHtml(data.text)}`;

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Fade out after 7s
  _chatToastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-4px)';
    setTimeout(() => { toast.style.display = 'none'; }, 320);
  }, 7000);
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
/* ── MP client helper: send action + decrement actionsLeft locally so clearAction works ── */
function mpClientAction(data) {
  if (!mpSendAction(data)) return false;
  // Optimistic local decrement — host will confirm via state broadcast
  const p = GS.players[MP.localSlot];
  if (p && p.actionsLeft > 0) p.actionsLeft--;
  return true;
}

if (typeof doAcquire === 'function') {
  const _doAcquire = doAcquire;
  globalThis.doAcquire = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'acquire',cid}); clearAction(); return; }
    _doAcquire(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doAcquire = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'acquire',cid}); clearAction(); return; }
    console.warn('doAcquire called before core is defined');
  };
}

if (typeof doUpgrade === 'function') {
  const _doUpgrade = doUpgrade;
  globalThis.doUpgrade = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'upgrade',cid}); clearAction(); return; }
    _doUpgrade(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doUpgrade = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'upgrade',cid}); clearAction(); return; }
    console.warn('doUpgrade called before core is defined');
  };
}

if (typeof doSell === 'function') {
  const _doSell = doSell;
  globalThis.doSell = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'sell',cid}); clearAction(); return; }
    _doSell(cid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doSell = function(cid) {
    if (MP.active && !MP.isHost) { closeModal(); mpClientAction({action:'sell',cid}); clearAction(); return; }
    console.warn('doSell called before core is defined');
  };
}

if (typeof doTakeover === 'function') {
  const _doTakeover = doTakeover;
  globalThis.doTakeover = function(cid, cost, prob) {
    if (MP.active && !MP.isHost) {
      closeModal();
      clearAction();
      // Show dice animation on client — visual only, host resolves the real outcome
      const c   = GS.companies.find(x => x.id === cid);
      const def = c && c.ownerId !== null ? GS.players[c.ownerId] : null;
      const me  = GS.players[MP.localSlot];
      if (c && def && me && typeof runDiceDisplay === 'function') {
        runDiceDisplay(prob, c.name, me.name, def.name);
      }
      mpClientAction({action:'takeover', cid});
      return;
    }
    _doTakeover(cid, cost, prob);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doTakeover = function(cid, cost, prob) {
    if (MP.active && !MP.isHost) {
      closeModal(); clearAction();
      const c = GS.companies.find(x => x.id === cid);
      const def = c && c.ownerId !== null ? GS.players[c.ownerId] : null;
      const me  = GS.players[MP.localSlot];
      if (c && def && me && typeof runDiceDisplay === 'function') runDiceDisplay(prob, c.name, me.name, def.name);
      mpClientAction({action:'takeover', cid});
      return;
    }
    console.warn('doTakeover called before core is defined');
  };
}

if (typeof doStockBuy === 'function') {
  const _doStockBuy = doStockBuy;
  globalThis.doStockBuy = function(sid) {
    if (MP.active && !MP.isHost) {
      if (mpClientAction({action:'stockBuy',sid})) {
        const p = GS.players[MP.localSlot];
        // Re-open stock modal if still have actions, otherwise close
        if (p && p.actionsLeft > 0) { closeModal(); showStocksModal(); }
        else { closeModal(); clearAction(); }
      }
      return;
    }
    _doStockBuy(sid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doStockBuy = function(sid) {
    if (MP.active && !MP.isHost) {
      if (mpClientAction({action:'stockBuy',sid})) {
        const p = GS.players[MP.localSlot];
        if (p && p.actionsLeft > 0) { closeModal(); showStocksModal(); }
        else { closeModal(); clearAction(); }
      }
      return;
    }
    console.warn('doStockBuy called before core is defined');
  };
}

if (typeof doStockSell === 'function') {
  const _doStockSell = doStockSell;
  globalThis.doStockSell = function(sid) {
    if (MP.active && !MP.isHost) {
      if (mpClientAction({action:'stockSell',sid})) {
        const p = GS.players[MP.localSlot];
        if (p && p.actionsLeft > 0) { closeModal(); showStocksModal(); }
        else { closeModal(); clearAction(); }
      }
      return;
    }
    _doStockSell(sid);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
} else {
  globalThis.doStockSell = function(sid) {
    if (MP.active && !MP.isHost) {
      if (mpClientAction({action:'stockSell',sid})) {
        const p = GS.players[MP.localSlot];
        if (p && p.actionsLeft > 0) { closeModal(); showStocksModal(); }
        else { closeModal(); clearAction(); }
      }
      return;
    }
    console.warn('doStockSell called before core is defined');
  };
}

if (typeof endTurn === 'function') {
  const _endTurn = endTurn;
  globalThis.endTurn = async function() {
    if (MP.active && !MP.isHost) { mpSendEndTurn(); return; }
    if (MP.active && MP.isHost) {
      if (!isMyTurn() || GS.gameOver) return;
      SFX.endTurn();
      clearAction(); updateTurnUI();
      await mpEndTurnForSlot(MP.localSlot);
      return;
    }
    await _endTurn();
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
    if (MP.active && !MP.isHost) { mpClientAction({ action:'pass' }); clearAction(); return; }
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
      mpClientAction({ action:'tactic', idx: i });
      clearAction();
      return;
    }
    _playTacticFromMenu(i);
    if (MP.active && MP.isHost) mpBroadcastState();
  };
}
