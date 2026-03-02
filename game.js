'use strict';


/* ═══════════════════════════════════════════════════════════════
   CORPORATE DOMINION v6 — PART 2
   Sound Engine · Constants · Setup · Core Math
═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   SOUND ENGINE v3
   ─ Three modes: Normal | Headphone | Off
   ─ ADSR envelopes on every note (no clicks/pops)
   ─ Headphone mode: low-pass filter (1400 Hz cutoff)
     + stereo delay node for spatial depth
     + reduced gain (safe for earphones)
   ─ Harmonic richness via oscillator stacking
   ─ Volume slider 0–100
══════════════════════════════════════════════════════ */
const SND = { on: true, mode: 'normal', vol: 0.20 };
let _actx = null;

function getACtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

/**
 * Play a single note with full ADSR envelope.
 * @param {number}  freq    - Fundamental frequency in Hz
 * @param {string}  type    - OscillatorType: 'sine'|'triangle'
 * @param {number}  dur     - Sustain + release duration (seconds)
 * @param {number}  vol     - Peak gain (0–1, before master vol)
 * @param {number}  delay   - Start offset in seconds (default 0)
 * @param {number}  attack  - Attack time (default 0.015)
 * @param {number}  release - Release time (default 0.12)
 * @param {number}  harmonic- Optional 2nd oscillator ratio (e.g. 2 = octave)
 */
function playNote(freq, type, dur, vol, delay = 0, attack = 0.015, release = 0.12, harmonic = 0) {
  if (!SND.on) return;
  try {
    const ctx  = getACtx();
    const now  = ctx.currentTime + delay;
    const peak = vol * SND.vol * (SND.mode === 'headphone' ? 0.55 : 1.0);

    /* ── Master gain (ADSR) ── */
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + attack);
    env.gain.setValueAtTime(peak, now + attack + 0.01);
    env.gain.exponentialRampToValueAtTime(peak * 0.6, now + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);

    /* ── Primary oscillator ── */
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(env);
    osc.start(now);
    osc.stop(now + dur + release + 0.05);

    /* ── Optional harmonic layer (adds warmth) ── */
    if (harmonic > 0) {
      const osc2  = ctx.createOscillator();
      const env2  = ctx.createGain();
      osc2.type   = 'sine';
      osc2.frequency.setValueAtTime(freq * harmonic, now);
      env2.gain.setValueAtTime(0, now);
      env2.gain.linearRampToValueAtTime(peak * 0.28, now + attack);
      env2.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
      osc2.connect(env2);
      env2.connect(env); // route through same path
      osc2.start(now);
      osc2.stop(now + dur + release + 0.05);
    }

    /* ── Headphone mode routing ── */
    if (SND.mode === 'headphone') {
      /* Low-pass filter — removes harsh high partials */
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 0.8;

      /* Subtle stereo delay for spatial depth */
      const delay_l = ctx.createDelay(0.08);
      const delay_r = ctx.createDelay(0.08);
      delay_l.delayTime.value = 0.022;
      delay_r.delayTime.value = 0.034;
      const delay_gain = ctx.createGain();
      delay_gain.gain.value = 0.18;

      /* Stereo splitter/merger for L/R offset */
      const merger = ctx.createChannelMerger(2);
      env.connect(lp);
      lp.connect(delay_l);
      lp.connect(delay_r);
      delay_l.connect(merger, 0, 0);  // left
      delay_r.connect(merger, 0, 1);  // right
      merger.connect(delay_gain);
      delay_gain.connect(ctx.destination);
      /* Dry signal */
      lp.connect(ctx.destination);
    } else {
      env.connect(ctx.destination);
    }
  } catch (e) { /* AudioContext blocked — silently ignore */ }
}

/* ── Chord helper ── */
function chord(freqs, type, dur, vol, delay = 0, spread = 0.06) {
  freqs.forEach((f, i) => playNote(f, type, dur, vol * (1 - i * 0.08), delay + i * spread));
}

/* ─────────────────────────────────────────────
   ALL SOUND EFFECTS — polished fintech tones
───────────────────────────────────────────── */
const SFX = {
  /* Acquisition: warm two-tone rise */
  acquire: () => {
    playNote(440, 'sine', .18, .42, 0,    .012, .15, 2);
    playNote(554, 'sine', .14, .30, .10,  .012, .12);
  },

  /* Upgrade: ascending 4-note arpeggio */
  upgrade: () => {
    const notes = [330, 415, 494, 587];
    notes.forEach((f, i) => playNote(f, 'sine', .14, .30, i * .075, .010, .10, 1.5));
  },

  /* Level up: triumphant fanfare chord */
  levelUp: () => {
    chord([523, 659, 784], 'sine', .30, .38, 0,   .05);
    playNote(1047, 'sine', .28, .28, .22, .012, .20, 2);
  },

  /* Takeover success: impact + soar */
  takeover_ok: () => {
    playNote(150, 'triangle', .08, .45, 0,    .005, .06);
    playNote(440, 'sine',     .22, .35, .08,  .012, .18, 2);
    playNote(880, 'sine',     .20, .28, .18,  .010, .16);
  },

  /* Takeover fail: descending low thud */
  takeover_fail: () => {
    playNote(200, 'triangle', .10, .45, 0,    .005, .08);
    playNote(130, 'sine',     .35, .38, .09,  .012, .22);
    playNote(98,  'sine',     .40, .28, .22,  .010, .28);
  },

  /* Stock buy: bright upward pair */
  buy: () => {
    playNote(587, 'sine', .12, .30, 0,   .010, .10, 2);
    playNote(784, 'sine', .10, .24, .08, .010, .08);
  },

  /* Stock sell: downward pair */
  sell: () => {
    playNote(523, 'sine', .12, .30, 0,   .010, .10);
    playNote(392, 'sine', .14, .24, .08, .010, .10);
  },

  /* Sell company: deeper, more deliberate */
  sellco: () => {
    playNote(440, 'sine', .14, .30, 0,   .012, .14, 0.5);
    playNote(330, 'sine', .18, .24, .10, .012, .16);
  },

  /* Tactical card: sparkle burst */
  card: () => {
    [440, 554, 659, 784].forEach((f, i) =>
      playNote(f, 'triangle', .12, .24, i * .045, .008, .10));
  },

  /* End turn: winding down */
  endTurn: () => {
    playNote(330, 'sine', .12, .22, 0,   .012, .10);
    playNote(247, 'sine', .20, .18, .12, .012, .16);
  },

  /* Phase reveal: deep resonant sweep */
  phase: () => {
    [110, 165, 220, 277].forEach((f, i) =>
      playNote(f, 'sine', .30, .26, i * .12, .015, .20, 2));
  },

  /* Event pop: triangle alert */
  event: () => {
    playNote(523, 'triangle', .07, .24, 0,   .008, .06);
    playNote(659, 'triangle', .10, .26, .07, .008, .08);
  },

  /* Game over: victory melody */
  gameOver: () => {
    const mel = [523, 659, 784, 659, 784, 1047];
    mel.forEach((f, i) => playNote(f, 'sine', .26, .32, i * .16, .012, .20, 2));
  },

  /* UI click: short sine tick */
  ui: () => playNote(800, 'sine', .06, .12, 0, .005, .05),

  /* Pass action: neutral low tone */
  pass: () => playNote(330, 'sine', .14, .14, 0, .010, .10),

  /* Nope (invalid action): soft descending pair */
  nope: () => {
    playNote(220, 'sine', .14, .28, 0,   .008, .10);
    playNote(165, 'sine', .14, .22, .08, .008, .10);
  },

  /* AI action: randomised quiet tone */
  aiact: () => playNote(200 + Math.random() * 100, 'sine', .07, .08, 0, .008, .05),
};

/* ── Sound settings modal ── */
function showSoundMenu() {
  SFX.ui();
  showModal('Sound Settings', `
    <p style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--tx-lo);margin-bottom:10px">
      Choose audio mode. Headphone mode applies a 1400 Hz low-pass filter, adds stereo depth, and lowers overall volume — safe and pleasant for earphones.
    </p>
    <div class="snd-modes">
      <div class="snd-mode ${SND.on && SND.mode==='normal'    ? 'on' : ''}" id="sm-normal"     onclick="setSndMode('normal')">🔊 Normal</div>
      <div class="snd-mode ${SND.on && SND.mode==='headphone' ? 'on' : ''}" id="sm-headphone"  onclick="setSndMode('headphone')">🎧 Headphone</div>
      <div class="snd-mode ${!SND.on                          ? 'on' : ''}" id="sm-off"        onclick="setSndMode('off')">🔇 Off</div>
    </div>
    <div class="vol-row">
      <div class="vol-lbl">Volume</div>
      <input type="range" min="0" max="100" value="${Math.round(SND.vol * 100)}"
             oninput="SND.vol = this.value / 100">
    </div>
    <div class="snd-note">
      Tip: Press any action button to preview the current sound mode.
    </div>
    <div class="mbtns">
      <button class="mbtn pri" onclick="SFX.acquire();SFX.ui()">▶ Preview</button>
      <button class="mbtn" onclick="closeModal()">Close</button>
    </div>`);
}

function setSndMode(m) {
  if (m === 'off') { SND.on = false; }
  else             { SND.on = true; SND.mode = m; }
  document.getElementById('snd-btn').textContent =
    SND.on ? (SND.mode === 'headphone' ? '🎧' : '🔊') : '🔇';
  ['normal','headphone','off'].forEach(id => {
    const el = document.getElementById('sm-' + id);
    if (el) el.classList.toggle('on',
      (id === 'off' && !SND.on) || (SND.on && SND.mode === id));
  });
}

/* ══════════════════════════════════════════════════════
   GAME CONSTANTS
══════════════════════════════════════════════════════ */
const PLAYER_DEFS = [
  { id:0, name:'YOU',    color:'#e8a020', isHuman:true,  style:'human'       },
  { id:1, name:'NEXUS',  color:'#e83a52', isHuman:false, style:'aggressive'  },
  { id:2, name:'AXIOM',  color:'#18a96a', isHuman:false, style:'builder'     },
  { id:3, name:'VORTEX', color:'#9b7fe8', isHuman:false, style:'opportunist' },
];

const CEO_TYPES = [
  { type:'Aggressive Raider',    bonus:'+4 attack',          attackBonus:4, defenseBonus:0, stockBonus:0 },
  { type:'Infrastructure Mogul', bonus:'+5 defense / co',    attackBonus:0, defenseBonus:5, stockBonus:0 },
  { type:'Financial Architect',  bonus:'−3 on stock buys',   attackBonus:0, defenseBonus:0, stockBonus:3 },
  { type:'Corp Opportunist',     bonus:'+2 attack, +2 def',  attackBonus:2, defenseBonus:2, stockBonus:0 },
];

const TACTICS_POOL = [
  {
    name:'Emergency Funding', icon:'💰', effect:'+$50 cash',
    action: p => { p.cash += 50; SFX.card(); glog(`${p.name}: Emergency Funding +$50`, 'good'); },
  },
  {
    name:'Iron Fortress', icon:'🛡', effect:'Block next takeover',
    action: p => { p.fortified = true; SFX.card(); glog(`${p.name}: Iron Fortress active!`, 'info'); },
  },
  {
    name:'Market Crash', icon:'📉', effect:'All stocks −3',
    action: p => {
      GS.sectors.forEach(s => s.price = Math.max(5, s.price - 3));
      SFX.card(); glog(`${p.name}: Market Crash!`, 'warn'); renderStocks();
    },
  },
  {
    name:'Hostile Intel', icon:'🔍', effect:'Cut rival 1 action',
    action: p => {
      const ai = GS.players.filter(x => !x.isHuman && x.id !== p.id)[0];
      if (ai) { ai.actionsLeft = Math.max(0, ai.actionsLeft - 1); glog(`${p.name}: Hostile Intel on ${ai.name}!`, 'warn'); }
      SFX.card();
    },
  },
  {
    name:'Headhunt', icon:'⬆', effect:'Free upgrade on best co',
    action: p => {
      const c = GS.companies.filter(x => x.ownerId === p.id).sort((a,b) => b.revenue - a.revenue)[0];
      if (c) { applyUpgrade(c, true); glog(`${p.name}: Headhunt — ${c.name} upgraded!`, 'good'); }
      SFX.card();
    },
  },
  {
    name:'Leveraged Buyout', icon:'🏢', effect:'Acquire cheapest co free',
    action: p => {
      const c = GS.companies.filter(x => x.ownerId === null).sort((a,b) => a.baseValue - b.baseValue)[0];
      if (c) { c.ownerId = p.id; updateRegionControl(); updateStockPrices(); glog(`${p.name}: LBO — ${c.name}!`, 'good'); render(); }
      SFX.card();
    },
  },
  {
    name:'Market Pump', icon:'📈', effect:'Your sectors +4 price',
    action: p => {
      const sids = new Set(GS.companies.filter(c => c.ownerId === p.id).map(c => c.sectorId));
      sids.forEach(sid => { GS.sectors[sid].price = Math.min(25, GS.sectors[sid].price + 4); });
      SFX.card(); glog(`${p.name}: Market Pump!`, 'good'); renderStocks();
    },
  },
  {
    name:'Espionage', icon:'🕵', effect:'Steal $40 from leader',
    action: p => {
      const lead = GS.players.filter(x => x.id !== p.id).sort((a,b) => calcNW(b) - calcNW(a))[0];
      const amt  = Math.min(40, lead.cash);
      lead.cash -= amt; p.cash += amt;
      SFX.card(); glog(`${p.name}: Stole $${amt} from ${lead.name}!`, 'warn');
    },
  },
];

const GLOBAL_EVENTS = [
  { name:'TECH SURGE',    icon:'💻', effect:'Tech sector +5',
    apply: () => { const s = GS.sectors.find(x => x.name === 'Tech'); if(s) s.price = Math.min(25, s.price + 5); }},
  { name:'LABOR STRIKE',  icon:'✊', effect:'Random player −30% rev this round',
    apply: () => { const p = GS.players[Math.floor(Math.random() * GS.players.length)]; p._revPenalty = 0.70; glog(`${p.name}: Labor Strike!`, 'warn'); }},
  { name:'MARKET BUBBLE', icon:'🫧', effect:'All stocks +4 (resets end of round)',
    apply: () => { GS.sectors.forEach(s => { s._bubble = s.price; s.price = Math.min(25, s.price + 4); }); }},
  { name:'INTEREST CUT',  icon:'🏦', effect:'All players +$20 cash',
    apply: () => { GS.players.forEach(p => p.cash += 20); glog('Interest Rate Cut — everyone +$20!', 'good'); }},
  { name:'CYBER ATTACK',  icon:'💀', effect:'Random player loses $30',
    apply: () => { const p = GS.players[Math.floor(Math.random() * GS.players.length)]; const l = Math.min(30, p.cash); p.cash -= l; glog(`${p.name}: Cyber Attack −$${l}!`, 'bad'); }},
  { name:'BULL RUN',      icon:'🐂', effect:'All stocks +2',
    apply: () => { GS.sectors.forEach(s => s.price = Math.min(25, s.price + 2)); }},
  { name:'ANTITRUST',     icon:'⚖',  effect:'Market leader cannot takeover',
    apply: () => { const lead = GS.players.slice().sort((a,b) => calcNW(b) - calcNW(a))[0]; lead._noTakeover = true; glog(`Antitrust probe locks ${lead.name}!`, 'warn'); }},
  { name:'PHARMA BOOM',   icon:'💊', effect:'Pharma sector +6',
    apply: () => { const s = GS.sectors.find(x => x.name === 'Pharma'); if(s) s.price = Math.min(25, s.price + 6); }},
];

const COMPANY_TRAITS = [
  { name:'Hi-Grow',  color:'#18a96a', desc:'Rev +50%',  apply: c => { c.initRevenue = Math.floor(c.initRevenue * 1.5); c.revenue = c.initRevenue; } },
  { name:'Fortress', color:'#4a9eff', desc:'+3 def',    apply: c => { c._traitDef = 3; } },
  { name:'BlueChip', color:'#e8a020', desc:'Val +$20',  apply: c => { c.baseValue += 20; } },
  { name:'Volatile', color:'#f09030', desc:'Rev ±30%',  apply: c => { c.volatile = true; } },
];

const STARTUP_BONUSES = [
  { name:'Seed Funding',    icon:'💰', desc:'+$60 starting cash',           apply: p => { p.cash += 60; } },
  { name:'Early Mover',     icon:'🏃', desc:'Start with a free company',    apply: p => { const c = GS.companies.filter(x => x.ownerId === null).sort((a,b) => a.baseValue - b.baseValue)[0]; if(c) c.ownerId = p.id; } },
  { name:'Stock Portfolio', icon:'📈', desc:'1 share in Tech & Finance',    apply: p => { [0,1].forEach(i => { if(GS.sectors[i].sharesLeft > 0){ p.stocks[i] = (p.stocks[i]||0)+1; GS.sectors[i].sharesLeft--; } }); } },
  { name:'War Chest',       icon:'⚔', desc:'+$40 cash & +2 attack power',  apply: p => { p.cash += 40; p.ceo = {...p.ceo, attackBonus: p.ceo.attackBonus + 2}; } },
  { name:'Insider',         icon:'🛡', desc:'Iron Fortress pre-activated',  apply: p => { p.fortified = true; } },
];

const SECTORS = [
  { name:'Tech',    gm:1.8 },
  { name:'Finance', gm:1.5 },
  { name:'Energy',  gm:1.2 },
  { name:'Pharma',  gm:1.6 },
  { name:'Defense', gm:1.3 },
];

const REGIONS = [
  { name:'SILICON VALLEY', companies:['ByteForge','NeuraNet','QuantumOS','DataVault']    },
  { name:'WALL STREET',    companies:['GoldBridge','AssetPrime','NexusFund','AlphaVault']},
  { name:'ENERGY HUB',     companies:['SolarCore','FusionTec','GridMax','OilDelta']      },
  { name:'BIOMEDICAL',     companies:['GenoCure','VitaLab','NanoMed','CureCore']         },
];

const PHASES = [
  { name:'BOOM',      color:'#18a96a', revMult:1.5,  toMod:-.12, stockMod: 3, effect:'Revenue +50%  ·  Stocks +3  ·  Takeovers harder'  },
  { name:'STABLE',    color:'#4a9eff', revMult:1.0,  toMod:  0,  stockMod: 0, effect:'Standard market conditions'                       },
  { name:'RECESSION', color:'#f09030', revMult:0.7,  toMod: .12, stockMod:-3, effect:'Revenue −30%  ·  Stocks −3  ·  Takeovers easier'  },
  { name:'CRASH',     color:'#e83a52', revMult:0.4,  toMod: .22, stockMod:-5, effect:'Revenue −60%  ·  Stocks −5  ·  Maximum chaos'     },
];

/* ══════════════════════════════════════════════════════
   GAME STATE
══════════════════════════════════════════════════════ */
const GS = {
  round:1, maxRounds:6,
  phase:null, phaseIdx:1, lastPhaseIdx:1,
  currentPlayerIdx:0,
  players:[], companies:[], sectors:[], regions:[],
  selectedAction:null, lastHoveredTak:null,
  gameOver:false, numAI:3,
  currentEvent:null, _skipNextEvent:false,
  roundPhasesIdx:[],
  stats:{ toa:[], tos:[], rev:[], peak:[] },  // dynamic per numPlayers
};

/* ═══════════════════════════════════════════════════════════════
   MULTIPLAYER STATE — hoisted here so all functions can reference MP
   safely regardless of parse/execution order.
═══════════════════════════════════════════════════════════════ */
const MP = {
  active:   false,   // true when online game is running
  isHost:   false,
  role:     'solo',  // 'host' | 'join' | 'solo'
  peer:     null,    // PeerJS Peer instance
  conns:    {},      // { peerId: DataConnection } — host only
  hostConn: null,    // DataConnection to host — client only
  roomCode: '',
  localSlot: 0,      // which player slot we are (0 = host/YOU)
  slots: [           // 4 lobby slots
    { name:'YOU',    filled:true,  ready:false, peerId:null, isLocal:true  },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
  ],
  playerName: 'Player',
  numHumans:  1,
  tutCheck:   true,
};

/* ══════════════════════════════════════════════════════
   SETUP
══════════════════════════════════════════════════════ */
let selectedMode    = 1;
let startupBonuses  = [];

function selectMode(n) {
  selectedMode = n;
  document.getElementById('mode-1v1').classList.toggle('sel', n === 1);
  document.getElementById('mode-1v3').classList.toggle('sel', n === 3);
  buildBonusPreview(n + 1);
  SFX.ui();
}

function buildBonusPreview(numPlayers) {
  const pool  = [...STARTUP_BONUSES];
  startupBonuses = Array.from({ length: numPlayers }, () => {
    const i = Math.floor(Math.random() * pool.length);
    return pool.splice(i, 1)[0] || STARTUP_BONUSES[0];
  });
  const pDefs = PLAYER_DEFS.slice(0, numPlayers);
  document.getElementById('bonus-preview').innerHTML = pDefs.map((p, i) => `
    <div class="bonus-row">
      <div class="bonus-ico">${startupBonuses[i].icon}</div>
      <div>
        <div class="bonus-pnm" style="color:${p.color}">${p.name}</div>
        <div class="bonus-desc">${startupBonuses[i].name}: <span>${startupBonuses[i].desc}</span></div>
      </div>
    </div>`).join('');
}

function initGameData(numAI) {
  GS.numAI = numAI;
  const n   = numAI + 1;

  /* Dynamic stats arrays — sized per actual player count (FIX #10) */
  GS.stats = {
    toa:  Array(n).fill(0),
    tos:  Array(n).fill(0),
    rev:  Array(n).fill(0),
    peak: Array(n).fill(0),
  };

  GS.players = PLAYER_DEFS.slice(0, n).map((p, i) => ({
    ...p,
    cash:         250,
    actionsLeft:  3,
    stocks:       {},
    ceo:          CEO_TYPES[i % CEO_TYPES.length],
    tactics: [
      { ...TACTICS_POOL[i % TACTICS_POOL.length],        used:false },
      { ...TACTICS_POOL[(i + 2) % TACTICS_POOL.length],  used:false },
    ],
    fortified:    false,
    _noTakeover:  false,
    _revPenalty:  1,
  }));

  /* Share supply balanced per mode — FIX #12 */
  GS.sectors = SECTORS.map((s, i) => ({
    ...s, id:i,
    sharesLeft:   3 + numAI,
    price:        10,
    growthScore:  0,
    demand:       0,
    priceHistory: [10, 10, 10],
    /* Stable price cache used for display — never drifts mid-turn */
    _stablePrice: 10,
  }));

  let cid = 0;
  GS.companies = [];
  REGIONS.forEach((r, ri) => {
    r.companies.forEach(name => {
      const baseRev = 10 + Math.floor(Math.random() * 10);
      const c = {
        id:   cid++, name, regionIdx: ri,
        ownerId:    null,
        level:      1,
        upgrades:   0,
        initRevenue:baseRev,   /* FIX #3: stored for sell-reset */
        revenue:    baseRev,
        baseValue:  32 + Math.floor(Math.random() * 18),
        sectorId:   ri % SECTORS.length,
        failedTakeoversAgainst: 0,
        volatile:   false,
        _traitDef:  0,
        _evtDef:    0,
        trait:      null,
        revenueHistory: [baseRev, baseRev, baseRev],
      };
      if (Math.random() < 0.3) {
        const t = COMPANY_TRAITS[Math.floor(Math.random() * COMPANY_TRAITS.length)];
        c.trait = t;
        t.apply(c);
      }
      GS.companies.push(c);
    });
  });

  GS.regions = REGIONS.map(r => ({ name: r.name, controller: null }));
}

function startGame() {
  const numAI = selectedMode;
  initGameData(numAI);

  /* Set phase FIRST — updateStockPrices reads GS.phase.stockMod */
  setPhase(1);

  /* Apply startup bonuses */
  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));

  /* Update derived state after bonuses (FIX #11) */
  updateRegionControl();
  updateStockPrices();

  document.getElementById('setup-overlay').style.display = 'none';
  render();
  renderRoundTrack();

  if (document.getElementById('tut-check').checked) {
    startTutorial();
  } else {
    showPhaseAnnounce();
  }
  glog(`=== CORPORATE DOMINION — ${numAI === 1 ? '1v1' : '1v3'} — ROUND 1 ===`, 'phase');
}

/* ══════════════════════════════════════════════════════
   CORE MATH
══════════════════════════════════════════════════════ */

function setPhase(idx) {
  GS.phaseIdx = idx;
  GS.phase    = PHASES[idx];
}

/**
 * FIX #2: True re-draw anti-repeat — never silently falls through.
 * Weighted random with up-to-20-attempt collision rejection.
 */
function rollPhase() {
  const r = GS.round;
  let w;
  if      (r <= 2) w = [2, 5, 2, 1];
  else if (r <= 4) w = [2, 3, 3, 2];
  else             w = [1, 2, 3, 4];
  const tot = w.reduce((a, b) => a + b, 0);

  for (let attempt = 0; attempt < 20; attempt++) {
    let x = Math.random() * tot;
    for (let i = 0; i < w.length; i++) {
      x -= w[i];
      if (x <= 0) {
        /* Reject same-phase repeat with 60% probability */
        if (i === GS.lastPhaseIdx && Math.random() < 0.60 && attempt < 10) break;
        setPhase(i);
        return;
      }
    }
  }
  /* Fallback: pick STABLE */
  setPhase(1);
}

/**
 * updateStockPrices — DETERMINISTIC, no random drift.
 * FIX #4: drift removed from here; applied once in endRound only.
 * Recalculates from game state: upgrades, ownership, phase.
 */
function updateStockPrices() {
  GS.sectors.forEach(s => {
    const owned = GS.companies.filter(c => c.sectorId === s.id && c.ownerId !== null);
    s.growthScore = owned.reduce((a, c) => a + c.upgrades * 2 + 3 - c.failedTakeoversAgainst, 0);
    s.demand      = owned.length;
    const raw     = 10 + (s.growthScore * s.gm) + s.demand + GS.phase.stockMod;
    const stable  = Math.min(25, Math.max(5, Math.round(raw)));
    s.price       = stable;
    s._stablePrice= stable;
    /* Do not push to priceHistory here — only push in endRound */
  });
}

function updateRegionControl() {
  GS.regions.forEach((region, ri) => {
    const counts = {};
    GS.companies
      .filter(c => c.regionIdx === ri && c.ownerId !== null)
      .forEach(c => { counts[c.ownerId] = (counts[c.ownerId] || 0) + 1; });
    region.controller = null;
    Object.entries(counts).forEach(([pid, cnt]) => {
      if (cnt >= 3) region.controller = parseInt(pid);
    });
  });
}

/**
 * calcBaseRevenue — DETERMINISTIC display value (FIX #1).
 * Shows player exactly what to expect, before variance.
 * Used in topbar and company info.
 */
function calcBaseRevenue(p) {
  let rev = 0;
  const ph  = GS.phase;
  const pen = p._revPenalty || 1;
  GS.companies.forEach(c => {
    if (c.ownerId !== p.id) return;
    let r = c.revenue * ph.revMult * pen;
    if (GS.regions[c.regionIdx].controller === p.id) r += 5 * ph.revMult;
    rev += r;
  });
  /* Stock dividends — always deterministic */
  Object.entries(p.stocks).forEach(([sid, qty]) => {
    const s = GS.sectors[sid];
    if (s) rev += Math.floor(s.price / 5) * qty;
  });
  return Math.floor(rev);
}

/**
 * calcRevenue — settlement value with variance (called once in endRound).
 * FIX #1: variance NOT applied in display path.
 */
function calcRevenue(p) {
  let rev = 0;
  const ph  = GS.phase;
  const pen = p._revPenalty || 1;
  GS.companies.forEach(c => {
    if (c.ownerId !== p.id) return;
    /* Variance: ±15% base, ±30% extra if Volatile */
    let r = c.revenue * ph.revMult * (0.85 + Math.random() * 0.30) * pen;
    if (c.volatile) r *= (0.70 + Math.random() * 0.60);
    if (GS.regions[c.regionIdx].controller === p.id) r += 5 * ph.revMult;
    rev += r;
  });
  Object.entries(p.stocks).forEach(([sid, qty]) => {
    const s = GS.sectors[sid];
    if (s) rev += Math.floor(s.price / 5) * qty;
  });
  return Math.floor(rev);
}

function calcNW(p) {
  let nw = p.cash;
  GS.companies.forEach(c => {
    if (c.ownerId === p.id) nw += calcCompanyValue(c);
  });
  Object.entries(p.stocks).forEach(([sid, qty]) => {
    const s = GS.sectors[sid];
    if (s) nw += qty * s.price;
  });
  return nw;
}

function calcCompanyValue(c) {
  return c.baseValue + c.upgrades * 15 + c.level * 8;
}

/**
 * calcSellPrice — 65% of company value (FIX: was 60%).
 * Shown prominently in sell modal as large amber number.
 */
function calcSellPrice(c) {
  return Math.floor(calcCompanyValue(c) * 0.65);
}

/**
 * calcTakeover — returns A, D, probability P, and UPFRONT COST.
 * Cost is shown in large gold text before player commits.
 */
function calcTakeover(attackerIdx, company) {
  const att      = GS.players[attackerIdx];
  const defIdx   = company.ownerId;
  const def      = defIdx !== null ? GS.players[defIdx] : null;

  const A = (att.cash * 0.15) + att.ceo.attackBonus + (GS.phase.toMod * 60);
  const regionBonus = (GS.regions[company.regionIdx].controller === defIdx) ? 6 : 0;
  const D = 6
    + company.level    * 3
    + company.upgrades * 2
    + regionBonus
    + (def ? def.ceo.defenseBonus : 0)
    + (company._traitDef || 0)
    + (company._evtDef   || 0);

  const P    = Math.max(0.05, Math.min(0.93, A / (A + D)));
  const cost = Math.floor(company.baseValue * 0.70 + company.upgrades * 12 + company.level * 8);

  return { A: Math.round(A), D: Math.round(D), P, cost };
}

/**
 * applyUpgrade — mutates company; used by human & AI & tactic cards.
 * @param {boolean} free - waives the cash cost (tactic card usage)
 */
function applyUpgrade(company, free = false) {
  const p    = GS.players[company.ownerId];
  const cost = free ? 0 : (20 + company.upgrades * 10);
  if (!free && p.cash < cost) return false;
  if (!free) p.cash -= cost;
  company.upgrades++;
  company.revenue += 3;
  if (company.upgrades % 2 === 0) {
    company.level++;
    SFX.levelUp();
    glog(`🆙 ${company.name} → Level ${company.level}!`, 'good');
    /* Trigger CSS flash animation on the card */
    document.querySelectorAll(`.cc[data-cid="${company.id}"]`).forEach(el => {
      el.classList.add('lv-flash');
      setTimeout(() => el.classList.remove('lv-flash'), 720);
    });
  }
  /* FIX #4: do NOT call updateStockPrices here — let caller decide */
  return true;
}

/* ── Init setup screen on load ── */
buildBonusPreview(2);  /* default 1v1 = 2 players */




/* ═══════════════════════════════════════════════════════════════
   CORPORATE DOMINION v6 — PART 3
   Human Actions · AI · endRound · Render · Tutorial · Keyboard
═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   TUTORIAL SYSTEM
   Steps spotlight actual UI elements with tab-switching
   before getBoundingClientRect so position is correct.
══════════════════════════════════════════════════════ */
const TUT_STEPS = [
  {
    title: 'Welcome, Executive',
    body: `You run a corporation competing for market dominance over <b style="color:var(--gold)">6 rounds</b>.\n\nThe goal: build the highest <b style="color:var(--gold)">Net Worth</b>.\n\n<span style="color:var(--tx-lo)">Net Worth = Cash + Company Values + Stock Portfolio</span>`,
    spotId: null, tab: null,
  },
  {
    title: 'The Company Map',
    body: `The grid shows all 16 companies across 4 regions.\n\nCompanies you <b style="color:var(--gold)">own</b> have a colored left border. Unowned companies have a plain border.\n\nTap any company card to inspect its stats.`,
    spotId: 'map-area', tab: null,
  },
  {
    title: 'Your 3 Actions',
    body: `Each round you get <b style="color:var(--gold)">3 actions</b>. Choose wisely:\n• <b>Acquire</b> — buy unowned companies\n• <b>Upgrade</b> — improve your companies (+revenue)\n• <b>Takeover</b> — capture rivals' companies\n• <b>Sell Co</b> — sell a company for quick cash\n• <b>Stocks</b> — invest in market sectors`,
    spotId: 'panel-actions', tab: 'actions',
  },
  {
    title: 'Takeover Cost — Always Shown Upfront',
    body: `Before any takeover you see the <b style="color:var(--gold)">cost in large gold text</b> — it's charged immediately.\n\nA dice roll determines success.\n<span style="color:var(--green-lt)">Win</span>: company is yours.\n<span style="color:var(--red-lt)">Fail</span>: lose 50% of cost; 50% returns next round.\n\nCheck this panel for live odds before attacking.`,
    spotId: 'tak-panel', tab: 'takeover',
  },
  {
    title: 'Sell to Raise Capital',
    body: `Need cash before a big takeover? <b style="color:var(--amber)">Sell a company</b> you don't need for <b style="color:var(--amber)">65% of its value</b> — shown as a large orange number before you confirm.\n\nUse this strategically: sell a weak company, then use the cash to fund a takeover of a much stronger one.`,
    spotId: 'panel-actions', tab: 'actions',
  },
  {
    title: 'Economic Phases',
    body: `Each round a random phase is revealed:\n<b style="color:var(--green-lt)">BOOM</b> — Revenue +50%, takeovers harder\n<b style="color:var(--blue-lt)">STABLE</b> — Normal conditions\n<b style="color:var(--amber)">RECESSION</b> — Revenue −30%, easier to take over\n<b style="color:var(--red-lt)">CRASH</b> — Revenue −60%, high chaos\n\nPhases also affect all stock prices.`,
    spotId: 'phase-pill', tab: null,
  },
  {
    title: "Ready to Trade",
    body: `Quick shortcuts:\n<span class="tut-kbd">1</span> Acquire &nbsp;<span class="tut-kbd">2</span> Upgrade &nbsp;<span class="tut-kbd">3</span> Takeover\n<span class="tut-kbd">S</span> Sell Co &nbsp;<span class="tut-kbd">4</span> Card &nbsp;<span class="tut-kbd">P</span> Pass\n<span class="tut-kbd">Space</span> End Turn &nbsp;<span class="tut-kbd">Esc</span> Cancel action\n\nOwn 3+ companies in a region for a <b style="color:var(--gold)">region control bonus</b>.\n\nGood luck, Executive.`,
    spotId: null, tab: null,
  },
];
let tutIdx = 0;

function startTutorial() {
  tutIdx = 0;
  document.getElementById('tut-overlay').classList.add('show');
  renderTutStep();
}

function renderTutStep() {
  const s = TUT_STEPS[tutIdx];
  /* FIX #5: switch to the correct tab BEFORE measuring element bounds */
  if (s.tab) switchTab(s.tab);

  document.getElementById('tut-step').textContent  = `Step ${tutIdx + 1} of ${TUT_STEPS.length}`;
  document.getElementById('tut-title').textContent = s.title;
  document.getElementById('tut-body').innerHTML    = s.body.replace(/\n/g, '<br>');
  document.getElementById('tut-dots').innerHTML    = TUT_STEPS.map((_, i) =>
    `<div class="tut-dot${i === tutIdx ? ' on' : ''}"></div>`).join('');
  document.getElementById('tut-prev').style.visibility = tutIdx === 0 ? 'hidden' : 'visible';
  document.getElementById('tut-next').textContent =
    tutIdx === TUT_STEPS.length - 1 ? 'Start Game ▶' : 'Next ›';

  const spot = document.getElementById('tut-spot');
  const card = document.getElementById('tut-card');

  if (s.spotId) {
    const el = document.getElementById(s.spotId);
    if (el) {
      const r  = el.getBoundingClientRect();
      spot.style.cssText =
        `left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;`;
      const cW = 295, cH = 210;
      let cx = r.left;
      let cy = r.bottom + 14;
      /* Bottom edge clamp */
      if (cy + cH > window.innerHeight - 8) cy = r.top - cH - 14;
      /* Right & left edge clamps */
      cx = Math.max(8, Math.min(window.innerWidth - cW - 8, cx));
      cy = Math.max(8, cy);
      card.style.cssText = `left:${cx}px;top:${cy}px;transform:none;`;
    }
  } else {
    spot.style.cssText = 'width:0;height:0;box-shadow:0 0 0 0;border:none;';
    card.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);';
  }
}

function tutNav(dir) {
  tutIdx += dir;
  if (tutIdx >= TUT_STEPS.length) { skipTutorial(); return; }
  if (tutIdx < 0) tutIdx = 0;
  renderTutStep();
}

function skipTutorial() {
  document.getElementById('tut-overlay').classList.remove('show');
  showPhaseAnnounce();
}

/* ══════════════════════════════════════════════════════
   PHASE & EVENTS
══════════════════════════════════════════════════════ */
function rollEvent() {
  if (GS._skipNextEvent) { GS._skipNextEvent = false; GS.currentEvent = null; return; }
  if (Math.random() < 0.65) {
    const e = GLOBAL_EVENTS[Math.floor(Math.random() * GLOBAL_EVENTS.length)];
    GS.currentEvent = e;
    e.apply();
    SFX.event();
    const eb = document.getElementById('event-bar');
    eb.textContent = `${e.icon}  EVENT: ${e.name} — ${e.effect}`;
    eb.classList.add('show');
    setTimeout(() => eb.classList.remove('show'), 9000);
    glog(`🌐 ${e.name}: ${e.effect}`, 'event');
  } else {
    GS.currentEvent = null;
    document.getElementById('event-bar').classList.remove('show');
  }
}

/* ══════════════════════════════════════════════════════
   HUMAN ACTIONS
══════════════════════════════════════════════════════ */
function setAction(action) {
  if (GS.currentPlayerIdx !== 0) return;
  if (GS.players[0].actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  GS.selectedAction = action;
  ['acquire','upgrade','takeover','sell'].forEach(a =>
    document.getElementById('btn-' + a)?.classList.remove('active'));
  document.getElementById('btn-' + action)?.classList.add('active');
  SFX.ui();
  if (action === 'takeover') switchTab('takeover');
  else if (action !== 'sell') switchTab('actions');
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
  if (GS.currentPlayerIdx !== 0) return;
  const p = GS.players[0];
  if (p.actionsLeft <= 0) { SFX.nope(); return; }
  p.actionsLeft--;
  SFX.pass();
  glog('YOU: passed action.', 'info');
  clearAction();
  render();
}

function handleCompanyClick(cid) {
  if (GS.currentPlayerIdx !== 0) return;
  const p      = GS.players[0];
  const c      = GS.companies.find(x => x.id === cid);
  const action = GS.selectedAction;

  /* ── No action selected: show info ── */
  if (!action) {
    const owner = c.ownerId !== null ? GS.players[c.ownerId] : null;
    const val   = calcCompanyValue(c);
    const tk    = owner && owner.id !== 0 ? calcTakeover(0, c) : null;
    setInfo(
      `${c.name}  |  Rev $${c.revenue}  |  Val $${val}  |  Lv${c.level}+${c.upgrades}  |  ` +
      `${SECTORS[c.sectorId].name}  |  ${owner ? owner.name : 'UNOWNED'}` +
      (tk ? `  |  TO ${Math.round(tk.P * 100)}% · cost $${tk.cost}` : '')
    );
    if (tk) { GS.lastHoveredTak = c; updateTakeoverCalc(c); switchTab('takeover'); }
    return;
  }

  if (p.actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining this round!'); return; }

  /* ── ACQUIRE ── */
  if (action === 'acquire') {
    if (c.ownerId !== null) { SFX.nope(); setInfo('❌ This company is owned — use Takeover instead.'); return; }
    if (p.cash < c.baseValue) { SFX.nope(); setInfo(`❌ Need $${c.baseValue}, you have $${p.cash}.`); return; }
    const trRow = c.trait ? `<div class="mrow"><div class="ml">Trait</div><div class="mv" style="color:${c.trait.color}">${c.trait.name} — ${c.trait.desc}</div></div>` : '';
    showModal('Acquire Company', `
      <div class="mrow"><div class="ml">Company</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Region</div><div class="mv">${REGIONS[c.regionIdx].name}</div></div>
      <div class="mrow"><div class="ml">Sector</div><div class="mv">${SECTORS[c.sectorId].name}</div></div>
      <div class="mrow"><div class="ml">Revenue / round</div><div class="mv gold">$${c.revenue}</div></div>
      <div class="mrow"><div class="ml">Base Value</div><div class="mv">$${c.baseValue}</div></div>
      ${trRow}
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">Acquisition Cost</div>
        <div class="cb-num">$${c.baseValue}</div>
        <div class="cb-sub">Charged from your cash immediately</div>
      </div>
      <div class="mbtns">
        <button class="mbtn pri" onclick="doAcquire(${cid})">Acquire ✓</button>
        <button class="mbtn" onclick="closeModal()">Cancel</button>
      </div>`);
  }

  /* ── UPGRADE ── */
  else if (action === 'upgrade') {
    if (c.ownerId !== 0) { SFX.nope(); setInfo('❌ You can only upgrade your own companies.'); return; }
    const cost   = 20 + c.upgrades * 10;
    const nxtLv  = (c.upgrades + 1) % 2 === 0 ? ` → <span style="color:var(--green-lt)">Level Up!</span>` : '';
    if (p.cash < cost) { SFX.nope(); setInfo(`❌ Need $${cost}, you have $${p.cash}.`); return; }
    showModal('Upgrade Company', `
      <div class="mrow"><div class="ml">Company</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Current Level</div><div class="mv green">Lv${c.level} (${c.upgrades} upgrades)</div></div>
      <div class="mrow"><div class="ml">Effect</div><div class="mv green">+$3 revenue · +2 defense${nxtLv}</div></div>
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">Upgrade Cost</div>
        <div class="cb-num">$${cost}</div>
      </div>
      <div class="mbtns">
        <button class="mbtn pri" onclick="doUpgrade(${cid})">Upgrade ✓</button>
        <button class="mbtn" onclick="closeModal()">Cancel</button>
      </div>`);
  }

  /* ── TAKEOVER ── */
  else if (action === 'takeover') {
    if (c.ownerId === null) { SFX.nope(); setInfo('❌ Use Acquire for unowned companies.'); return; }
    if (c.ownerId === 0)    { SFX.nope(); setInfo('❌ You already own this company.'); return; }
    if (p._noTakeover)      { SFX.nope(); setInfo('❌ Antitrust probe: no takeovers this round.'); return; }
    const tk  = calcTakeover(0, c);
    const def = GS.players[c.ownerId];
    if (p.cash < tk.cost) { SFX.nope(); setInfo(`❌ Need $${tk.cost} for this takeover — you have $${p.cash}. Consider selling a company first.`); return; }
    const pct  = Math.round(tk.P * 100);
    const bc   = pct > 62 ? 'var(--green-lt)' : pct > 38 ? 'var(--gold-lt)' : 'var(--red-lt)';
    const risk = pct < 30 ? 'HIGH RISK — likely to fail' : pct < 50 ? 'CONTESTED — coin flip' : pct < 68 ? 'FAVORABLE — good odds' : 'DOMINANT — nearly certain';
    const fortW = def.fortified
      ? `<div class="fort-warn">⚠ FORTIFIED — success chance reduced by 15%</div>` : '';
    GS.lastHoveredTak = c; updateTakeoverCalc(c);
    showModal('⚔ Hostile Takeover', `
      <div class="mrow"><div class="ml">Target</div><div class="mv">${c.name}</div></div>
      <div class="mrow"><div class="ml">Current Owner</div><div class="mv" style="color:${def.color}">${def.name}</div></div>
      <div class="mrow"><div class="ml">Attack Power (A)</div><div class="mv gold">${tk.A}</div></div>
      <div class="mrow"><div class="ml">Defense Score (D)</div><div class="mv red">${tk.D}</div></div>
      <div class="cost-block" style="margin:12px 0">
        <div class="cb-lbl">⬆ Upfront Cost — charged now</div>
        <div class="cb-num">$${tk.cost}</div>
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
        <button class="mbtn danger" onclick="doTakeover(${cid},${tk.cost},${tk.P.toFixed(4)})">Launch Takeover</button>
        <button class="mbtn" onclick="closeModal()">Abort</button>
      </div>`);
  }

  /* ── SELL COMPANY ── */
  else if (action === 'sell') {
    if (c.ownerId !== 0) { SFX.nope(); setInfo('❌ You can only sell your own companies.'); return; }
    const sp  = calcSellPrice(c);
    const fv  = calcCompanyValue(c);
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
  const p = GS.players[0]; const c = GS.companies.find(x => x.id === cid);
  p.cash -= c.baseValue; c.ownerId = 0; p.actionsLeft--;
  SFX.acquire();
  glog(`YOU acquired ${c.name} ($${c.baseValue})`, 'good');
  updateRegionControl(); updateStockPrices(); render(); clearAction();
}

function doUpgrade(cid) {
  closeModal();
  const c = GS.companies.find(x => x.id === cid);
  if (!applyUpgrade(c)) { glog('Insufficient funds for upgrade.', 'bad'); return; }
  GS.players[0].actionsLeft--;
  SFX.upgrade();
  glog(`YOU upgraded ${c.name} → Lv${c.level} (+${c.upgrades} upgrades)`, 'good');
  updateStockPrices(); render(); clearAction();
}

function doSell(cid) {
  closeModal();
  const p  = GS.players[0]; const c = GS.companies.find(x => x.id === cid);
  const sp = calcSellPrice(c);
  p.cash += sp; p.actionsLeft--;
  /* FIX #3: reset company to initial state on sell */
  c.ownerId  = null;
  c.upgrades = 0;
  c.level    = 1;
  c.revenue  = c.initRevenue;   /* restore original revenue */
  c._traitDef= c.trait ? 3 : 0; /* re-apply trait defense if applicable */
  SFX.sellco();
  glog(`YOU sold ${c.name} for $${sp}`, 'warn');
  updateRegionControl(); updateStockPrices(); render(); clearAction();
}

function doTakeover(cid, cost, prob) {
  closeModal();
  const p   = GS.players[0]; const c = GS.companies.find(x => x.id === cid);
  const def = GS.players[c.ownerId];
  if (p.cash < cost) { SFX.nope(); glog(`❌ Need $${cost}, have $${p.cash}.`, 'bad'); return; }
  p.actionsLeft--;
  p.cash -= cost;
  /* Fortification check */
  const fp   = def.fortified ? 0.15 : 0;
  if (def.fortified) def.fortified = false;
  const effP = Math.max(0.05, parseFloat(prob) - fp);
  GS.stats.toa[p.id]++;
  runDice(effP, c, def, cost, p);
  clearAction();
}

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
      document.getElementById('dice-num').style.color   = ok ? 'var(--green-lt)' : 'var(--red-lt)';
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
    c.failedTakeoversAgainst++;
    setTimeout(() => { p.cash += ret; glog(`+$${ret} returned from failed takeover.`, 'info'); render(); }, 1900);
    glog(`💀 Takeover FAILED: ${c.name}. Lost $${lost} · $${ret} returns next turn.  [roll ${roll.toFixed(3)}]`, 'bad');
  }
  updateRegionControl(); updateStockPrices(); render();
}

/* ── Stock actions ── */
function doStockBuy(sid) {
  if (GS.currentPlayerIdx !== 0) return;
  const p = GS.players[0]; const s = GS.sectors[sid];
  if (p.actionsLeft <= 0)  { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  if (s.sharesLeft <= 0)   { SFX.nope(); setInfo('❌ No shares available.'); return; }
  const cost = s.price - p.ceo.stockBonus;
  if (p.cash < cost) { SFX.nope(); setInfo(`❌ Need $${cost}, you have $${p.cash}.`); return; }
  p.cash -= cost; p.stocks[sid] = (p.stocks[sid] || 0) + 1;
  s.sharesLeft--; s.demand++;
  p.actionsLeft--;
  SFX.buy();
  glog(`YOU bought ${s.name} @ $${cost}  (div $${Math.floor(s.price / 5)}/round)`, 'good');
  updateStockPrices(); render();
}

function doStockSell(sid) {
  if (GS.currentPlayerIdx !== 0) return;
  const p = GS.players[0];
  if (p.actionsLeft <= 0)             { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  if (!p.stocks[sid] || p.stocks[sid] <= 0) { SFX.nope(); setInfo('❌ No shares to sell.'); return; }
  const s = GS.sectors[sid];
  p.cash += s.price; p.stocks[sid]--;
  s.sharesLeft++; s.demand = Math.max(0, s.demand - 1);
  p.actionsLeft--;
  SFX.sell();
  glog(`YOU sold ${s.name} @ $${s.price}`, 'warn');
  updateStockPrices(); render();
}

/* ── Tactical cards ── */
function showCardMenu() {
  if (GS.currentPlayerIdx !== 0) return;
  const p  = GS.players[0];
  if (p.actionsLeft <= 0) { SFX.nope(); setInfo('❌ No actions remaining.'); return; }
  const av = p.tactics.map((t, i) => ({...t, i})).filter(t => !t.used);
  if (av.length === 0) { SFX.nope(); setInfo('❌ All tactical cards have been used.'); return; }
  const rows = av.map(t => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--s2);border:1px solid var(--border);border-radius:var(--r2);padding:9px 12px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">${t.icon}</span>
        <div>
          <div style="font-family:'Sora',sans-serif;font-weight:700;font-size:12px;color:var(--gold)">${t.name}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">${t.effect}</div>
        </div>
      </div>
      <button class="mbtn pri" style="flex:none;padding:5px 12px;font-size:10px;min-width:auto" onclick="playTacticFromMenu(${t.i})">PLAY</button>
    </div>`).join('');
  showModal('🃏 Tactical Cards', rows + `<div class="mbtns"><button class="mbtn" onclick="closeModal()">Cancel</button></div>`);
}

function playTacticFromMenu(i) { closeModal(); playTactic(0, i); }

function playTactic(pid, i) {
  const p = GS.players[pid];
  if (pid === 0 && p.actionsLeft <= 0) { SFX.nope(); return; }
  const t = p.tactics[i];
  if (t.used) return;
  t.used = true;
  t.action(p);
  if (pid === 0) { p.actionsLeft--; clearAction(); }
  render();
}

let _autoEndTimer = null;
function clearAction() {
  GS.selectedAction = null;
  ['acquire','upgrade','takeover','sell'].forEach(a =>
    document.getElementById('btn-' + a)?.classList.remove('active'));
  const p = GS.players[0];
  if (GS.currentPlayerIdx === 0 && p.actionsLeft <= 0) {
    setInfo('✓ All 3 actions used.');
    // Show toast and auto-end after brief pause
    clearTimeout(_autoEndTimer);
    const toast = document.getElementById('auto-end-toast');
    if (toast) { toast.classList.add('show'); _autoEndTimer = setTimeout(() => { toast.classList.remove('show'); endTurn(); }, 1100); }
    else setTimeout(() => endTurn(), 1100);
  } else {
    const left = p.actionsLeft;
    setInfo(`Action complete — <b style="color:var(--gold)">${left} action${left!==1?'s':''} remaining</b>. [Space] to end turn early.`);
  }
}

/* ══════════════════════════════════════════════════════
   AI ENGINE
   Three distinct personalities with sell trigger for
   cash-poor states (FIX: AI was stuck with $0 in late CRASH)
══════════════════════════════════════════════════════ */
async function endTurn() {
  if (GS.currentPlayerIdx !== 0 || GS.gameOver) return;
  SFX.endTurn();
  GS.currentPlayerIdx = 1;
  clearAction(); updateTurnUI();
  for (let ai = 1; ai < GS.players.length; ai++) await runAITurn(ai);
  endRound();
}

async function runAITurn(pid) {
  const p  = GS.players[pid];
  const ov = document.getElementById('ai-overlay');
  const lb = document.getElementById('ai-lbl');
  ov.style.background  = p.color + '12';
  lb.textContent       = `${p.name}  thinking…`;
  lb.style.color       = p.color;
  lb.style.borderColor = p.color;
  ov.classList.add('show');
  await sleep(520);
  p.actionsLeft = 3;
  /* AI gets 3 decision passes */
  for (let ap = 0; ap < 3; ap++) {
    await sleep(260 + Math.random() * 180);
    aiDecide(pid);
  }
  ov.classList.remove('show');
  render();
}

function aiDecide(pid) {
  const p       = GS.players[pid];
  const style   = p.style;
  const mine    = GS.companies.filter(c => c.ownerId === pid);
  const unowned = GS.companies.filter(c => c.ownerId === null);
  const enemies = GS.companies.filter(c => c.ownerId !== null && c.ownerId !== pid);
  let best = null, bestEV = -Infinity;

  /* ── AI sell trigger: cash-poor in late rounds (FIX) ── */
  if (p.cash < 35 && mine.length > 2 && GS.round >= 3) {
    const weakest = mine.slice().sort((a, b) => a.revenue - b.revenue)[0];
    if (weakest) {
      const sp = calcSellPrice(weakest);
      p.cash += sp;
      weakest.ownerId  = null;
      weakest.upgrades = 0;
      weakest.level    = 1;
      weakest.revenue  = weakest.initRevenue;
      SFX.aiact();
      glog(`${p.name} sold ${weakest.name} for $${sp} (capital)`, 'info');
      updateRegionControl(); updateStockPrices(); render();
      return;
    }
  }

  /* ── Acquire ── */
  if (unowned.length > 0) {
    const t = [...unowned].sort((a, b) => a.baseValue - b.baseValue)[0];
    if (p.cash >= t.baseValue) {
      const ev = t.revenue * 3 - t.baseValue;
      if (ev > bestEV) { bestEV = ev; best = { type:'acquire', t }; }
    }
  }

  /* ── Takeover ── */
  if (!p._noTakeover) {
    let tgts = enemies;
    if (style === 'opportunist') {
      const lead = GS.players.filter(x => x.id !== pid).sort((a,b) => calcNW(b) - calcNW(a))[0];
      const lc   = enemies.filter(c => c.ownerId === lead?.id);
      if (lc.length > 0) tgts = lc;
    }
    tgts.forEach(c => {
      const tk = calcTakeover(pid, c);
      const minP = style === 'aggressive' ? 0.20 : 0.30;
      if (tk.P < minP || p.cash < tk.cost) return;
      const gain = calcCompanyValue(c);
      const loss = tk.cost * 0.5;
      const ev   = tk.P * gain - (1 - tk.P) * loss
        + (style === 'aggressive' ? 16 : style === 'opportunist' ? 10 : 0);
      if (ev > bestEV) { bestEV = ev; best = { type:'takeover', c, tk }; }
    });
  }

  /* ── Upgrade ── */
  if (mine.length > 0) {
    const t    = [...mine].sort((a, b) => a.upgrades - b.upgrades)[0];
    const cost = 20 + t.upgrades * 10;
    if (p.cash >= cost) {
      const ev = t.revenue * (style === 'builder' ? 3.6 : 2.4);
      if (ev > bestEV) { bestEV = ev; best = { type:'upgrade', t }; }
    }
  }

  /* ── Stock investment ── */
  if (!best && style !== 'opportunist') {
    const scored = GS.sectors
      .filter(s => s.sharesLeft > 0 && p.cash >= s.price)
      .map(s => ({
        s,
        score: mine.filter(c => c.sectorId === s.id).length * 5
             + s.growthScore - s.price + (style === 'builder' ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) best = { type:'invest', s: scored[0].s };
  }

  if (!best) { glog(`${p.name}: passes`, 'info'); return; }

  /* ── Execute best decision ── */
  if (best.type === 'acquire') {
    p.cash -= best.t.baseValue; best.t.ownerId = pid;
    SFX.aiact(); glog(`${p.name} acquired ${best.t.name} ($${best.t.baseValue})`, 'info');
  }
  else if (best.type === 'upgrade') {
    applyUpgrade(best.t); SFX.aiact();
    glog(`${p.name} upgraded ${best.t.name}`, 'info');
  }
  else if (best.type === 'takeover') {
    const { c, tk } = best; const def = GS.players[c.ownerId];
    const fp   = def.fortified ? 0.15 : 0;
    if (def.fortified) def.fortified = false;
    const ep   = Math.max(0.05, tk.P - fp);
    const roll = Math.random();
    p.cash -= tk.cost; GS.stats.toa[pid]++;
    if (roll <= ep) {
      c.ownerId = pid; GS.stats.tos[pid]++;
      SFX.aiact(); glog(`${p.name} ⚔ captured ${c.name}  [${Math.round(ep * 100)}%]`, 'warn');
    } else {
      const ret = Math.floor(tk.cost * 0.5);
      c.failedTakeoversAgainst++;
      setTimeout(() => { p.cash += ret; render(); }, 1900);
      glog(`${p.name} takeover failed: ${c.name}`, 'info');
    }
  }
  else if (best.type === 'invest') {
    const s = best.s;
    p.cash -= s.price; p.stocks[s.id] = (p.stocks[s.id] || 0) + 1;
    s.sharesLeft--; s.demand++;
    SFX.aiact(); glog(`${p.name} bought ${s.name} stock`, 'info');
  }

  updateRegionControl(); updateStockPrices(); render();
}

/* ══════════════════════════════════════════════════════
   END ROUND
══════════════════════════════════════════════════════ */
function endRound() {
  /* Pop event bubbles */
  GS.companies.forEach(c => { c._evtDef = 0; });
  GS.sectors.forEach(s => { if (s._bubble) { s.price = s._bubble; delete s._bubble; } });

  /* Revenue payout (with variance — FIX #1: only here, not in display) */
  GS.players.forEach(p => {
    p._noTakeover = false;
    const rev = calcRevenue(p);
    p.cash += rev;
    GS.stats.rev[p.id]  = (GS.stats.rev[p.id]  || 0) + rev;
    const nw = calcNW(p);
    if (nw > GS.stats.peak[p.id]) GS.stats.peak[p.id] = nw;
    if (rev > 0) glog(`${p.name}  +$${rev} revenue`, p.id === 0 ? 'good' : 'info');
    p.actionsLeft  = 3;
    p.fortified    = false;
    p._revPenalty  = 1;
  });

  /* Update company revenueHistory for bar charts */
  GS.companies.forEach(c => {
    const rev = c.ownerId !== null ? c.revenue : 0;
    c.revenueHistory = [...(c.revenueHistory || [rev, rev]), rev].slice(-6);
  });

  /* FIX #4: single drift pass at end-of-round only */
  GS.sectors.forEach(s => {
    const drift = Math.round(Math.random() * 3 - 1.4);
    s.price     = Math.min(25, Math.max(5, s.price + drift));
    s._stablePrice = s.price;
    s.priceHistory = [...s.priceHistory, s.price].slice(-5);
  });

  if (GS.round >= GS.maxRounds) { endGame(); return; }

  GS.roundPhasesIdx.push(GS.phaseIdx);
  GS.lastPhaseIdx = GS.phaseIdx;
  GS.round++;
  rollPhase();
  rollEvent();
  GS.currentPlayerIdx = 0;

  glog(`=== ROUND ${GS.round}  ·  ${GS.phase.name} ===`, 'phase');
  render(); updateTurnUI(); renderRoundTrack(); showPhaseAnnounce();
}

function endGame() {
  GS.gameOver = true;
  SFX.gameOver();
  const scores = GS.players
    .map(p => ({
      ...p,
      nw:   calcNW(p),
      cos:  GS.companies.filter(c => c.ownerId === p.id).length,
      regs: GS.regions.filter(r => r.controller === p.id).length,
    }))
    .sort((a, b) => b.nw - a.nw);
  const winner = scores[0];
  const standRows = scores.map((s, i) => `
    <div class="mrow">
      <div class="ml" style="color:${s.color};font-family:'Sora',sans-serif;font-weight:700">
        ${i === 0 ? '🏆 ' : ''}${s.name}
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="mv gold" style="font-size:15px">$${s.nw}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">${s.cos}co · ${s.regs}reg</div>
      </div>
    </div>`).join('');
  const statRows = scores.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
      <div style="color:${s.color};font-family:'Sora',sans-serif;font-weight:700;font-size:10px;min-width:54px">${s.name}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">TOs <span style="color:var(--gold)">${GS.stats.toa[s.id]}</span></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Win% <span style="color:var(--green-lt)">${GS.stats.toa[s.id] > 0 ? Math.round(GS.stats.tos[s.id] / GS.stats.toa[s.id] * 100) + '%' : '—'}</span></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Rev <span style="color:var(--blue-lt)">$${GS.stats.rev[s.id]}</span></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Peak <span style="color:var(--gold)">$${GS.stats.peak[s.id]}</span></div>
    </div>`).join('');
  showModal('Game Over', `
    <div style="text-align:center;padding:14px 0 18px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--tx-lo);letter-spacing:.16em;text-transform:uppercase;margin-bottom:5px">Winner</div>
      <div style="font-family:'Sora',sans-serif;font-weight:800;font-size:32px;color:${winner.color}">${winner.name}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:var(--gold);margin-top:4px">$${winner.nw}</div>
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--tx-lo);margin-bottom:6px">Final Standings</div>
    ${standRows}
    <div style="font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--tx-lo);margin:12px 0 6px">Game Stats</div>
    ${statRows}
    <div class="mbtns"><button class="mbtn pri" onclick="location.reload()">▶ Play Again</button></div>`);
}

/* ══════════════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════════════ */
function render() {
  renderTopBar();
  renderPlayers();
  renderMap();
  renderStocks();
  renderCEO();
  renderCards();
  if (GS.lastHoveredTak) updateTakeoverCalc(GS.lastHoveredTak);
}

function renderTopBar() {
  const p  = GS.players[0];
  const ph = GS.phase;
  document.getElementById('s-cash').textContent = '$' + p.cash;
  document.getElementById('s-nw').textContent   = '$' + calcNW(p);
  document.getElementById('s-ap').textContent   = p.actionsLeft;
  /* FIX #1: deterministic display using calcBaseRevenue */
  document.getElementById('s-rev').textContent  = '~$' + calcBaseRevenue(p);
  const apC = document.getElementById('ap-count');
  if (apC) apC.textContent = `(${p.actionsLeft} left)`;
  const pb = document.getElementById('phase-pill');
  pb.textContent = ph.name;
  pb.style.color        = ph.color;
  pb.style.borderColor  = ph.color;
  pb.style.background   = ph.color + '18';
}

function renderRoundTrack() {
  const el = document.getElementById('round-track');
  el.innerHTML = Array.from({ length: GS.maxRounds }, (_, i) => {
    const rnd   = i + 1;
    const done  = rnd < GS.round;
    const cur   = rnd === GS.round;
    const phIdx = GS.roundPhasesIdx[i];
    const phClr = (done && phIdx != null) ? PHASES[phIdx].color : '';
    const style = (done && phClr)
      ? `background:${phClr}30;border-color:${phClr}70;color:${phClr}` : '';
    return `<div class="rtp ${done?'done':''} ${cur?'cur':''}" style="${style}" title="Round ${rnd}">${rnd}</div>`;
  }).join('');
}

function renderPlayers() {
  const nws   = GS.players.map(p => calcNW(p));
  const maxNW = Math.max(...nws, 1);
  document.getElementById('player-list').innerHTML = GS.players.map((p, i) => {
    const nw     = nws[i];
    const bw     = Math.round((nw / maxNW) * 100);
    const crown  = (nw === maxNW && GS.round > 1) ? '👑 ' : '';
    const active = i === GS.currentPlayerIdx;
    const pips   = Array.from({ length: 3 }, (_, j) => `
      <div class="ap-dot" style="background:${j < p.actionsLeft ? p.color : p.color + '28'};
        width:${j < p.actionsLeft ? '7' : '5'}px;height:${j < p.actionsLeft ? '7' : '5'}px"></div>`
    ).join('');
    return `<div class="pe ${active ? 'active-p' : ''}">
      <div class="pe-name" style="color:${p.color}">
        ${active ? '▶ ' : ''}${crown}${p.name}${p.fortified ? ' 🛡' : ''}
      </div>
      <div class="pe-nums">
        <div class="pe-cash">$${p.cash}</div>
        <div class="pe-nw">NW $${nw}</div>
      </div>
      <div class="nw-track"><div class="nw-fill" style="width:${bw}%;background:${p.color}"></div></div>
      <div class="ap-row">${pips}</div>
    </div>`;
  }).join('');
}

function renderMap() {
  const mapEl  = document.getElementById('map-area');
  const overlay = document.getElementById('ai-overlay');
  mapEl.innerHTML = '';
  mapEl.appendChild(overlay);
  REGIONS.forEach((r, ri) => {
    const region  = GS.regions[ri];
    const ctrl    = region.controller;
    const ctrlP   = ctrl !== null ? GS.players[ctrl] : null;
    const div     = document.createElement('div');
    div.className = `region${ctrl !== null ? ' ctrl-' + ctrl : ''}`;
    const badge   = ctrlP
      ? `<div class="ctrl-tag" style="background:${ctrlP.color}22;color:${ctrlP.color};border:1px solid ${ctrlP.color}44">CTRL ${ctrlP.name}</div>`
      : `<div class="ctrl-tag" style="background:var(--s4);color:var(--tx-lo);border:1px solid var(--border)">OPEN</div>`;
    div.innerHTML = `<div class="reg-hdr"><div class="reg-name">${r.name}</div>${badge}</div><div class="reg-cos" id="rc-${ri}"></div>`;
    mapEl.appendChild(div);
    const cosEl = div.querySelector(`#rc-${ri}`);
    GS.companies.filter(c => c.regionIdx === ri).forEach(c => {
      const owner  = c.ownerId !== null ? GS.players[c.ownerId] : null;
      const action = GS.selectedAction;
      let hi = '';
      if (action === 'acquire'  && c.ownerId === null)                       hi = 'hi-acq';
      if (action === 'upgrade'  && c.ownerId === 0)                          hi = 'hi-upg';
      if (action === 'takeover' && c.ownerId !== null && c.ownerId !== 0)    hi = 'hi-tak';
      if (action === 'sell'     && c.ownerId === 0)                          hi = 'hi-sell';
      const card = document.createElement('div');
      card.className       = `cc ${owner ? 'owned-' + owner.id : ''} ${hi}`;
      card.dataset.cid     = c.id;
      card.onclick         = () => handleCompanyClick(c.id);
      card.onmouseenter    = () => {
        if (GS.selectedAction === 'takeover' && c.ownerId !== null && c.ownerId !== 0) {
          GS.lastHoveredTak = c; updateTakeoverCalc(c);
        }
        if (GS.selectedAction === 'acquire' && c.ownerId === null) {
          setInfo(`🏢 Acquire <b>${c.name}</b> — Cost: <b style="color:var(--gold)">$${c.baseValue}</b> · Rev $${c.revenue}/round · ${SECTORS[c.sectorId].name}${c.trait ? ' · ' + c.trait.name : ''}`);
        }
        if (GS.selectedAction === 'upgrade' && c.ownerId === 0) {
          const uc = 20 + c.upgrades * 10;
          setInfo(`⬆ Upgrade <b>${c.name}</b> — Cost: <b style="color:var(--gold)">$${uc}</b> · New rev $${c.revenue+3}/round · Lv${c.level}+${c.upgrades}`);
        }
        if (GS.selectedAction === 'sell' && c.ownerId === 0) {
          setInfo(`💰 Sell <b>${c.name}</b> — You receive: <b style="color:var(--amber)">$${calcSellPrice(c)}</b> (65% of $${calcCompanyValue(c)})`);
        }
      };
      const lvProg = ((c.upgrades % 2) / 2) * 100;
      const trHtml = c.trait
        ? `<div class="trait-badge" style="background:${c.trait.color}20;color:${c.trait.color};border:1px solid ${c.trait.color}44">${c.trait.name}</div>`
        : '';
      const revCol = c.revenue > 20 ? 'var(--gold)' : c.revenue > 14 ? 'var(--green-lt)' : 'var(--tx-md)';

      /* ── Mini bar chart ── */
      const hist = c.revenueHistory || [c.revenue, c.revenue, c.revenue];
      const maxH = Math.max(...hist, 1);
      const barColor = owner ? owner.color : 'var(--border-l)';
      const barsHtml = hist.map((v, i) => {
        const hPct = Math.round((v / maxH) * 100);
        const isLast = i === hist.length - 1;
        const opacity = 0.35 + (i / hist.length) * 0.65;
        return `<div class="co-bar" style="height:${hPct}%;background:${barColor};opacity:${isLast ? 1 : opacity};${isLast ? 'filter:brightness(1.3)' : ''}"></div>`;
      }).join('');

      /* ── Revenue trend badge ── */
      const prev = hist.length >= 2 ? hist[hist.length - 2] : hist[0];
      const curr = hist[hist.length - 1];
      let trendHtml = '';
      if (prev > 0 && curr !== prev) {
        const pct = ((curr - prev) / prev * 100).toFixed(1);
        const up  = curr >= prev;
        trendHtml = `<div class="co-trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${Math.abs(pct)}%</div>`;
      } else {
        trendHtml = `<div class="co-trend flat">—</div>`;
      }

      card.innerHTML = `
        ${c.ownerId === null ? `<div class="acq-pill">$${c.baseValue}</div>` : ''}
        <div class="co-top">
          <div class="co-name">${c.name}</div>
          <div class="co-id">ID-C${c.id}</div>
        </div>
        <div class="co-chart">${barsHtml}</div>
        <div class="co-rev-row">
          <div class="co-rev-val" style="color:${revCol}">$${c.revenue}M</div>
          ${trendHtml}
        </div>
        <div class="co-stats" style="margin-top:2px">
          <div class="co-st">L<span class="v" style="color:var(--green-lt)">${c.level}</span>+${c.upgrades}</div>
          ${trHtml}
        </div>
        ${owner ? `<div class="owner-dot" style="background:${owner.color};box-shadow:0 0 5px ${owner.color}"></div>` : ''}
        ${owner && owner.fortified ? `<div class="fort-icon">🛡</div>` : ''}
        <div class="lv-prog"><div class="lv-fill" style="width:${lvProg}%"></div></div>`;
      cosEl.appendChild(card);
    });
  });
}

function renderStocks() {
  const el  = document.getElementById('stock-list');
  const p   = GS.players[0];
  const myT = GS.currentPlayerIdx === 0;
  el.innerHTML = GS.sectors.map((s, i) => {
    const mine  = p.stocks[i] || 0;
    const cost  = s.price - p.ceo.stockBonus;
    const canB  = myT && p.actionsLeft > 0 && s.sharesLeft > 0 && p.cash >= cost;
    const canS  = myT && p.actionsLeft > 0 && mine > 0;
    const div   = Math.floor(s.price / 5);
    const spark = buildSparkline(s.priceHistory, s.price);
    const hist  = s.priceHistory;
    const prev  = hist.length > 1 ? hist[hist.length - 2] : s.price;
    const delta = s.price - prev;
    const dStr  = delta > 0
      ? `<span style="color:var(--green-lt)">+${delta}</span>`
      : delta < 0
        ? `<span style="color:var(--red-lt)">${delta}</span>`
        : `<span style="color:var(--tx-lo)">0</span>`;
    return `<div class="srow">
      <div class="s-name">${s.name}</div>
      ${spark}
      <div class="s-price">$${s.price}</div>
      <div class="s-delta">${dStr}</div>
      <div class="s-avail" title="${s.sharesLeft} shares remaining">${s.sharesLeft}✦</div>
      <div class="s-mine">${mine > 0 ? mine + '▣' : ''}</div>
      <div class="s-div" title="Dividend per share per round">+$${div}</div>
      <button class="sab buy"  onclick="doStockBuy(${i})"  ${canB ? '' : 'disabled'}>BUY $${cost}</button>
      <button class="sab sell" onclick="doStockSell(${i})" ${canS ? '' : 'disabled'}>SELL</button>
    </div>`;
  }).join('');
}

function buildSparkline(history, current) {
  if (!history || history.length < 2) return `<svg class="s-spark" viewBox="0 0 30 14"></svg>`;
  const h     = history.slice(-5);
  const mn    = Math.min(...h) - 1;
  const mx    = Math.max(...h) + 1;
  const range = mx - mn || 1;
  const pts   = h.map((v, i) => {
    const x = i / (h.length - 1) * 28 + 1;
    const y = 13 - (v - mn) / range * 11;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rising  = h[h.length - 1] >= h[h.length - 2];
  const col     = rising ? '#18a96a' : '#e83a52';
  const lastPt  = pts[pts.length - 1].split(',');
  return `<svg class="s-spark" viewBox="0 0 30 14">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="1.8" fill="${col}"/>
  </svg>`;
}

function renderCEO() {
  const p = GS.players[0];
  document.getElementById('ceo-disp').innerHTML = `
    <div class="ceo-card">
      <div class="ceo-nm">Your CEO</div>
      <div class="ceo-tp">${p.ceo.type}</div>
      <div class="ceo-bx">${p.ceo.bonus}</div>
    </div>
    ${GS.players.slice(1).map(q => `
      <div class="rival-row">
        <div class="rival-nm" style="color:${q.color}">
          ${q.name}<span class="rival-tag">[${q.style}]</span>
        </div>
        <div class="rival-nw">${q.ceo.type} · NW $${calcNW(q)}</div>
      </div>`).join('')}`;
}

function renderCards() {
  const p = GS.players[0];
  document.getElementById('cards-area').innerHTML = p.tactics.map((t, i) => `
    <div class="tcard ${t.used ? 'used' : ''}" onclick="${t.used ? '' : `playTactic(0,${i})`}">
      <div class="tc-nm"><span>${t.icon}</span>${t.name}</div>
      <div class="tc-ef">${t.effect}</div>
      ${t.used ? `<div class="tc-used">USED</div>` : ''}
    </div>`).join('');
}

function updateTakeoverCalc(company) {
  const el = document.getElementById('tak-calc');
  if (!company || company.ownerId === null || company.ownerId === 0) {
    el.innerHTML = `<div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo);line-height:1.6">Hover or tap an enemy company to calculate odds and upfront cost.</div>`;
    return;
  }
  const tk   = calcTakeover(0, company);
  const pct  = Math.round(tk.P * 100);
  const bc   = pct > 62 ? 'var(--green-lt)' : pct > 38 ? 'var(--gold-lt)' : 'var(--red-lt)';
  const def  = GS.players[company.ownerId];
  const risk = pct < 30 ? 'HIGH RISK' : pct < 50 ? 'CONTESTED' : pct < 68 ? 'FAVORABLE' : 'DOMINANT';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo);margin-bottom:5px">
      <span><b style="color:var(--tx-hi)">${company.name}</b></span>
      <span style="color:${def.color}">${def.name}</span>
    </div>
    <div class="cost-block" style="padding:6px 10px;margin:4px 0">
      <div class="cb-lbl">Upfront Cost</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;color:var(--gold);line-height:1">$${tk.cost}</div>
    </div>
    <div class="prob-bar">
      <div class="prob-fill" style="width:${pct}%;background:${bc}">${pct}%</div>
    </div>
    <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:9px;margin-top:3px">
      <span style="color:var(--tx-lo)">A:${tk.A}  D:${tk.D}</span>
      <span style="color:${bc};font-weight:700">${risk}</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   TURN UI & PHASE ANNOUNCE
══════════════════════════════════════════════════════ */
function updateTurnUI() {
  const human = GS.currentPlayerIdx === 0;
  const ti    = document.getElementById('turn-pill');
  if (human) {
    ti.textContent = 'YOUR TURN';
    ti.style.borderColor = 'var(--amber)';
    ti.style.color       = 'var(--amber)';
    ti.style.background  = 'rgba(240,144,48,.08)';
  } else {
    const p = GS.players[GS.currentPlayerIdx];
    ti.textContent = p.name;
    ti.style.borderColor = p.color;
    ti.style.color       = p.color;
    ti.style.background  = p.color + '18';
  }
  const btn = document.getElementById('end-btn');
  btn.disabled     = !human;
  btn.style.opacity= human ? '1' : '0.28';
  const aBtn = document.getElementById('act-end-btn');
  if (aBtn) { aBtn.disabled = !human; }
  const ap = document.getElementById('act-panel');
  ap.style.opacity       = human ? '1' : '0.35';
  ap.style.pointerEvents = human ? 'auto' : 'none';
  const sw = document.getElementById('slist-wrap');
  sw.style.opacity       = human ? '1' : '0.45';
  sw.style.pointerEvents = human ? 'auto' : 'none';
}

let _phaseTimer = null;
function showPhaseAnnounce() {
  SFX.phase();
  const ph = GS.phase;
  document.getElementById('pa-round').textContent = GS.round;
  document.getElementById('pa-name').textContent  = ph.name;
  document.getElementById('pa-name').style.color  = ph.color;
  document.getElementById('pa-effect').textContent= ph.effect;
  const pa  = document.getElementById('phase-announce');
  pa.style.borderColor = ph.color;
  pa.style.boxShadow   = `0 0 40px ${ph.color}33`;
  /* Event display */
  const eEl = document.getElementById('pa-event');
  if (GS.currentEvent && GS.round > 1) {
    eEl.textContent = `${GS.currentEvent.icon}  ${GS.currentEvent.name} — ${GS.currentEvent.effect}`;
    eEl.classList.add('show');
  } else {
    eEl.classList.remove('show');
  }
  pa.classList.add('show');
  /* Progress bar */
  const fill = document.getElementById('pa-pfill');
  fill.style.background   = ph.color;
  fill.style.transition   = 'none';
  fill.style.width        = '0%';
  requestAnimationFrame(() => {
    fill.style.transition = 'width 4s linear';
    fill.style.width      = '100%';
  });
  _phaseTimer = setTimeout(dismissPhase, 5000);
}

function dismissPhase() {
  clearTimeout(_phaseTimer);
  document.getElementById('phase-announce').classList.remove('show');
}

/* ══════════════════════════════════════════════════════
   UI UTILITIES
══════════════════════════════════════════════════════ */
function switchTab(name) {
  ['stocks','actions','takeover'].forEach(t => {
    document.getElementById('tab-'   + t).classList.toggle('active', t === name);
    document.getElementById('panel-' + t).classList.toggle('active', t === name);
  });
}

function setInfo(msg) { document.getElementById('info-strip').innerHTML = msg; }

/* FIX #6: Modal backdrop close via addEventListener */
function showModal(title, content) {
  document.getElementById('modal-title').textContent  = title;
  document.getElementById('modal-content').innerHTML  = content;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

/* FIX #7: toggleLeft uses CSS class — correct on both mobile and desktop */
function toggleLeft() {
  const l = document.getElementById('left');
  if (window.innerWidth <= 640) {
    l.classList.toggle('drawer-open');
  } else {
    l.classList.toggle('collapsed');
  }
}

function glog(msg, type = 'info') {
  const el = document.getElementById('log-area');
  const d  = document.createElement('div');
  d.className  = 'le ' + type;
  d.textContent= `[R${GS.round}] ${msg}`;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 120) el.removeChild(el.lastChild);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════
   RULEBOOK
══════════════════════════════════════════════════════ */
function showRulebook() {
  SFX.ui();
  showModal('📖 Rulebook', `
    <div class="rb-s">
      <h3>Win Condition</h3>
      <p>Highest <span class="rg">Net Worth</span> after 6 rounds wins.<br>
      NW = Cash + Company Values + Stock Portfolio.</p>
    </div>
    <div class="rb-s">
      <h3>Actions (3 per round)</h3>
      <ul>
        <li><b>[1] Acquire</b> — Buy unowned company at base value.</li>
        <li><b>[2] Upgrade</b> — Cost $20+$10×upgrades. +$3 rev, +2 def. Every 2 upgrades = Level Up.</li>
        <li><b>[3] Takeover</b> — Pay full cost upfront. Dice roll decides. Win = yours. Fail = lose 50%, recover 50%.</li>
        <li><b>[S] Sell Co</b> — Sell your company for 65% of its value. Use to fund a bigger takeover.</li>
        <li><b>Stocks</b> — Buy/sell in Stocks tab. Earns dividends each round.</li>
        <li><b>[4] Card</b> — Play a one-time tactical card.</li>
        <li><b>[P] Pass</b> — Skip an action.</li>
      </ul>
    </div>
    <div class="rb-s">
      <h3>Takeover Formula</h3>
      <p>A = (Cash × 0.15) + CEO attack + Phase modifier</p>
      <p>D = 6 + Level×3 + Upgrades×2 + Region bonus(6) + CEO def + Traits</p>
      <p>P = A ÷ (A+D), capped 5–93%. <span class="rg">Cost shown upfront in large gold text</span> before you commit.</p>
    </div>
    <div class="rb-s">
      <h3>Economic Phases</h3>
      <ul>
        <li><span class="rg">BOOM</span> — Rev ×1.5, Stocks +3, Takeovers harder</li>
        <li><span class="rb">STABLE</span> — Standard conditions</li>
        <li><span class="ro">RECESSION</span> — Rev ×0.7, Stocks −3, Takeovers easier</li>
        <li><span class="rr">CRASH</span> — Rev ×0.4, Stocks −5, Chaos</li>
      </ul>
    </div>
    <div class="rb-s">
      <h3>Region Control</h3>
      <p>Own ≥3 companies in a region → control it.<br>
      Bonus: +$5 rev/company (phase-scaled) + +6 defense per company.</p>
    </div>
    <div class="rb-s">
      <h3>AI Personalities</h3>
      <ul>
        <li><span class="rr">NEXUS [aggressive]</span> — Pursues takeovers at low EV threshold.</li>
        <li><span class="rg">AXIOM [builder]</span> — Prioritises upgrades and stock investment.</li>
        <li><span class="ro">VORTEX [opportunist]</span> — Hunts the current NW leader.</li>
      </ul>
    </div>
    <div class="mbtns" style="padding-top:4px"><button class="mbtn pri" onclick="closeModal()">Got it ✓</button></div>`);
}

/* ══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  /* Block shortcuts when any overlay is active */
  const blocked = [
    document.getElementById('modal-overlay'),
    document.getElementById('setup-overlay'),
    document.getElementById('tut-overlay'),
    document.getElementById('dice-overlay'),
    document.getElementById('phase-announce'),
  ];
  if (blocked.some(el => el.classList.contains('show') || el.style.display === 'flex')) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;

  switch (e.key) {
    case '1': setAction('acquire');  switchTab('actions');   break;
    case '2': setAction('upgrade');  switchTab('actions');   break;
    case '3': setAction('takeover'); switchTab('takeover');  break;
    case '4': showCardMenu();                                break;
    case 's': case 'S': setAction('sell'); switchTab('actions'); break;
    case 'p': case 'P': passAction();                        break;
    case ' ': e.preventDefault(); endTurn();                 break;
    case 'Escape': clearAction();                            break;
    case 'q': case 'Q': switchTab('stocks');                 break;
    case 'a': case 'A': switchTab('actions');                break;
    case 't': case 'T': switchTab('takeover');               break;
  }
});



/* ═══════════════════════════════════════════════════════════════
   MULTIPLAYER ENGINE — PeerJS WebRTC
   Architecture: Host-authoritative
   · Host runs all game logic; broadcasts full GS state after every action
   · Clients send action requests → host validates → broadcast → all re-render
   · Unfilled slots (no human connected) become AI players
   · Room code = 6-char alphanumeric, maps to PeerJS peer ID prefix
   NOTE: MP object is declared at top of file alongside GS to avoid TDZ errors.
═══════════════════════════════════════════════════════════════ */

/* ── Setup tab switching ── */
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
  if (data.type === 'action' && MP.active && GS.currentPlayerIdx === mpSlotForPeer(peerId)) {
    // Client submitted an action — execute on host then broadcast state
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

  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));
  updateRegionControl();
  updateStockPrices();
  setPhase(1);

  render(); renderRoundTrack();
  mpBroadcastState(); // send initial state to all clients

  if (data.tutCheck) startTutorial(); else showPhaseAnnounce();
  glog('=== ONLINE GAME STARTED ===', 'phase');
}

function mpClientBeginGame(data) {
  document.getElementById('lobby-overlay').classList.remove('show');
  // Client does nothing — waits for 'state' packet to arrive then renders
  setInfo('Waiting for host to send game state…');
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
          else { const ret=Math.floor(tk.cost*.5); c.failedTakeoversAgainst++; setTimeout(()=>{p.cash+=ret; mpBroadcastState();},1900); glog(`${p.name} takeover failed: ${c.name}`, 'info'); }
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
   PATCH EXISTING FUNCTIONS FOR ONLINE AWARENESS
   Intercept human action executors to route through
   MP.sendAction when in online mode as a client
───────────────────────────────────────────── */

/* Wrap doAcquire */
const _doAcquire = doAcquire;
doAcquire = function(cid) {
  if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'acquire',cid}); clearAction(); return; }
  _doAcquire(cid);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap doUpgrade */
const _doUpgrade = doUpgrade;
doUpgrade = function(cid) {
  if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'upgrade',cid}); clearAction(); return; }
  _doUpgrade(cid);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap doSell */
const _doSell = doSell;
doSell = function(cid) {
  if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'sell',cid}); clearAction(); return; }
  _doSell(cid);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap doTakeover */
const _doTakeover = doTakeover;
doTakeover = function(cid, cost, prob) {
  if (MP.active && !MP.isHost) { closeModal(); mpSendAction({action:'takeover',cid}); clearAction(); return; }
  _doTakeover(cid, cost, prob);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap doStockBuy */
const _doStockBuy = doStockBuy;
doStockBuy = function(sid) {
  if (MP.active && !MP.isHost) { mpSendAction({action:'stockBuy',sid}); return; }
  _doStockBuy(sid);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap doStockSell */
const _doStockSell = doStockSell;
doStockSell = function(sid) {
  if (MP.active && !MP.isHost) { mpSendAction({action:'stockSell',sid}); return; }
  _doStockSell(sid);
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Wrap endTurn */
const _endTurn = endTurn;
endTurn = async function() {
  if (MP.active && !MP.isHost) { mpSendEndTurn(); return; }
  await _endTurn();
  if (MP.active && MP.isHost) mpBroadcastState();
};

/* Guard handleCompanyClick — block if not our turn in online mode */
const _handleCompanyClick = handleCompanyClick;
handleCompanyClick = function(cid) {
  if (MP.active && GS.currentPlayerIdx !== MP.localSlot) {
    setInfo('⏳ Not your turn — wait for other players.'); return;
  }
  _handleCompanyClick(cid);
};



</body>
