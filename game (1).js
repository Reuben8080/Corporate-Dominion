'use strict';
/* ═══════════════════════════════════════════════════════════
   CORPORATE DOMINION v7 — game.js
   Combined: constants · sound · game · render · multiplayer · main
   Deployment: index.html + game.css + game.js
   Online play: host on any static server (Netlify / GitHub Pages)
   WebRTC peer-to-peer via PeerJS — no backend required
═══════════════════════════════════════════════════════════ */


/* ──────────────────── CONSTANTS ──────────────────── */

const PLAYER_DEFS = [
  { id:0, name:'YOU',    color:'#6366f1', isHuman:true,  style:'human'       },
  { id:1, name:'NEXUS',  color:'#f43f5e', isHuman:false, style:'aggressive'  },
  { id:2, name:'AXIOM',  color:'#10b981', isHuman:false, style:'builder'     },
  { id:3, name:'VORTEX', color:'#f59e0b', isHuman:false, style:'opportunist' },
];
const CEO_TYPES = [
  { type:'Aggressive Raider',    bonus:'+4 attack',         attackBonus:4, defenseBonus:0, stockBonus:0 },
  { type:'Infrastructure Mogul', bonus:'+5 defense / co',   attackBonus:0, defenseBonus:5, stockBonus:0 },
  { type:'Financial Architect',  bonus:'−3 on stock buys',  attackBonus:0, defenseBonus:0, stockBonus:3 },
  { type:'Corp Opportunist',     bonus:'+2 attack, +2 def', attackBonus:2, defenseBonus:2, stockBonus:0 },
];
const TACTICS_POOL = [
  { name:'Emergency Funding', icon:'💰', effect:'+$50 cash',             action: p => { p.cash += 50; SFX.card(); glog(`${p.name}: Emergency Funding +$50`, 'good'); } },
  { name:'Iron Fortress',     icon:'🛡', effect:'Block next takeover',    action: p => { p.fortified = true; SFX.card(); glog(`${p.name}: Iron Fortress active!`, 'info'); } },
  { name:'Market Crash',      icon:'📉', effect:'All stocks −3',          action: p => { GS.sectors.forEach(s => s.price = Math.max(5, s.price-3)); SFX.card(); glog(`${p.name}: Market Crash!`, 'warn'); renderStocks(); } },
  { name:'Hostile Intel',     icon:'🔍', effect:'Cut rival 1 action',     action: p => { const ai = GS.players.filter(x=>!x.isHuman&&x.id!==p.id)[0]; if(ai){ ai.actionsLeft=Math.max(0,ai.actionsLeft-1); glog(`${p.name}: Hostile Intel on ${ai.name}!`,'warn'); } SFX.card(); } },
  { name:'Headhunt',          icon:'⬆', effect:'Free upgrade on best co', action: p => { const c = GS.companies.filter(x=>x.ownerId===p.id).sort((a,b)=>b.revenue-a.revenue)[0]; if(c){ applyUpgrade(c,true); glog(`${p.name}: Headhunt — ${c.name} upgraded!`,'good'); } SFX.card(); } },
  { name:'Leveraged Buyout',  icon:'🏢', effect:'Acquire cheapest co free',action: p => { const c = GS.companies.filter(x=>x.ownerId===null).sort((a,b)=>a.baseValue-b.baseValue)[0]; if(c){ c.ownerId=p.id; updateRegionControl(); updateStockPrices(); glog(`${p.name}: LBO — ${c.name}!`,'good'); render(); } SFX.card(); } },
  { name:'Market Pump',       icon:'📈', effect:'Your sectors +4 price',  action: p => { const sids=new Set(GS.companies.filter(c=>c.ownerId===p.id).map(c=>c.sectorId)); sids.forEach(sid=>{ GS.sectors[sid].price=Math.min(25,GS.sectors[sid].price+4); }); SFX.card(); glog(`${p.name}: Market Pump!`,'good'); renderStocks(); } },
  { name:'Espionage',         icon:'🕵', effect:'Steal $40 from leader',  action: p => { const lead=GS.players.filter(x=>x.id!==p.id).sort((a,b)=>calcNW(b)-calcNW(a))[0]; const amt=Math.min(40,lead.cash); lead.cash-=amt; p.cash+=amt; SFX.card(); glog(`${p.name}: Stole $${amt} from ${lead.name}!`,'warn'); } },
];
const GLOBAL_EVENTS = [
  { name:'TECH SURGE',    icon:'💻', effect:'Tech sector +5',                      apply: () => { const s=GS.sectors.find(x=>x.name==='Tech'); if(s) s.price=Math.min(25,s.price+5); } },
  { name:'LABOR STRIKE',  icon:'✊', effect:'Random player −30% rev this round',   apply: () => { const p=GS.players[Math.floor(Math.random()*GS.players.length)]; p._revPenalty=0.70; glog(`${p.name}: Labor Strike!`,'warn'); } },
  { name:'MARKET BUBBLE', icon:'🫧', effect:'All stocks +4',                       apply: () => { GS.sectors.forEach(s=>{ s._bubble=s.price; s.price=Math.min(25,s.price+4); }); } },
  { name:'INTEREST CUT',  icon:'🏦', effect:'All players +$20 cash',               apply: () => { GS.players.forEach(p=>p.cash+=20); glog('Interest Rate Cut — everyone +$20!','good'); } },
  { name:'CYBER ATTACK',  icon:'💀', effect:'Random player loses $30',             apply: () => { const p=GS.players[Math.floor(Math.random()*GS.players.length)]; const l=Math.min(30,p.cash); p.cash-=l; glog(`${p.name}: Cyber Attack −$${l}!`,'bad'); } },
  { name:'BULL RUN',      icon:'🐂', effect:'All stocks +2',                       apply: () => { GS.sectors.forEach(s=>s.price=Math.min(25,s.price+2)); } },
  { name:'ANTITRUST',     icon:'⚖',  effect:'Market leader cannot takeover',       apply: () => { const lead=GS.players.slice().sort((a,b)=>calcNW(b)-calcNW(a))[0]; lead._noTakeover=true; glog(`Antitrust probe locks ${lead.name}!`,'warn'); } },
  { name:'PHARMA BOOM',   icon:'💊', effect:'Pharma sector +6',                    apply: () => { const s=GS.sectors.find(x=>x.name==='Pharma'); if(s) s.price=Math.min(25,s.price+6); } },
];
const COMPANY_TRAITS = [
  { name:'Hi-Grow',  color:'#10b981', desc:'Rev +50%',  apply: c => { c.initRevenue=Math.floor(c.initRevenue*1.5); c.revenue=c.initRevenue; } },
  { name:'Fortress', color:'#60a5fa', desc:'+3 def',    apply: c => { c._traitDef=3; } },
  { name:'BlueChip', color:'#f59e0b', desc:'Val +$20',  apply: c => { c.baseValue+=20; } },
  { name:'Volatile', color:'#fb923c', desc:'Rev ±30%',  apply: c => { c.volatile=true; } },
];
const STARTUP_BONUSES = [
  { name:'Seed Funding',    icon:'💰', desc:'+$45 starting cash',          apply: p => { p.cash += 45; } },
  { name:'Early Mover',     icon:'🏃', desc:'Start with a free company',   apply: p => { const c=GS.companies.filter(x=>x.ownerId===null).sort((a,b)=>a.baseValue-b.baseValue)[0]; if(c) c.ownerId=p.id; } },
  { name:'Stock Portfolio', icon:'📈', desc:'1 share in Tech & Finance',   apply: p => { [0,1].forEach(i=>{ if(GS.sectors[i].sharesLeft>0){ p.stocks[i]=(p.stocks[i]||0)+1; GS.sectors[i].sharesLeft--; } }); } },
  { name:'War Chest',       icon:'⚔', desc:'+$50 cash & +2 attack power', apply: p => { p.cash+=50; p.ceo={...p.ceo,attackBonus:p.ceo.attackBonus+2}; } },
  { name:'Insider',         icon:'🛡', desc:'Iron Fortress pre-activated', apply: p => { p.fortified=true; } },
];
const SECTORS = [
  { name:'Tech',    gm:1.8 }, { name:'Finance', gm:1.5 }, { name:'Energy',  gm:1.2 },
  { name:'Pharma',  gm:1.6 }, { name:'Defense', gm:1.3 },
];
const REGIONS = [
  { name:'SILICON VALLEY', icon:'⚡', pool:['ByteForge','NeuraNet','QuantumOS','DataVault','CoreAI','NexusTech'],     rc:'r0' },
  { name:'WALL STREET',    icon:'📈', pool:['GoldBridge','AssetPrime','NexusFund','AlphaVault','TradeCo','CapitalX'],  rc:'r1' },
  { name:'ENERGY HUB',     icon:'🔋', pool:['SolarCore','FusionTec','GridMax','OilDelta','WindPeak','AtomCo'],          rc:'r2' },
  { name:'BIOMEDICAL',     icon:'🧬', pool:['GenoCure','VitaLab','NanoMed','CureCore','BioNex','PharmaOne'],            rc:'r3' },
];
const PHASES = [
  { name:'BOOM',      color:'#10b981', revMult:1.5,  toMod:-.12, stockMod: 3, effect:'Revenue +50% · Stocks +3 · Takeovers harder'  },
  { name:'STABLE',    color:'#60a5fa', revMult:1.0,  toMod:  0,  stockMod: 0, effect:'Standard market conditions'                   },
  { name:'RECESSION', color:'#fb923c', revMult:0.7,  toMod: .12, stockMod:-3, effect:'Revenue −30% · Stocks −3 · Takeovers easier'  },
  { name:'CRASH',     color:'#f43f5e', revMult:0.4,  toMod: .22, stockMod:-5, effect:'Revenue −60% · Stocks −5 · Maximum chaos'     },
];
const GS = {
  round:1, maxRounds:6, phase:null, phaseIdx:1, lastPhaseIdx:1,
  currentPlayerIdx:0, players:[], companies:[], sectors:[], regions:[],
  selectedAction:null, lastHoveredTak:null, gameOver:false, numAI:3,
  currentEvent:null, _skipNextEvent:false, roundPhasesIdx:[],
  stats:{ toa:[], tos:[], rev:[], peak:[] },
};
let selectedMode   = 1;
let startupBonuses = [];


/* ──────────────────── SOUND ──────────────────── */

/* ═══════════════════════════════════════════
   SOUND ENGINE v3 — three modes: Normal | Headphone | Off
═══════════════════════════════════════════ */
const SND = { on: true, mode: 'normal', vol: 0.20 };
let _actx = null;
function getACtx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}
function playNote(freq, type, dur, vol, delay=0, attack=0.015, release=0.12, harmonic=0) {
  if (!SND.on) return;
  try {
    const ctx = getACtx(), now = ctx.currentTime + delay;
    const peak = vol * SND.vol * (SND.mode === 'headphone' ? 0.55 : 1.0);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + attack);
    env.gain.setValueAtTime(peak, now + attack + 0.01);
    env.gain.exponentialRampToValueAtTime(peak * 0.6, now + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(freq, now);
    osc.connect(env); osc.start(now); osc.stop(now + dur + release + 0.05);
    if (harmonic > 0) {
      const osc2 = ctx.createOscillator(), env2 = ctx.createGain();
      osc2.type = 'sine'; osc2.frequency.setValueAtTime(freq * harmonic, now);
      env2.gain.setValueAtTime(0, now);
      env2.gain.linearRampToValueAtTime(peak * 0.28, now + attack);
      env2.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);
      osc2.connect(env2); env2.connect(env); osc2.start(now); osc2.stop(now + dur + release + 0.05);
    }
    if (SND.mode === 'headphone') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.8;
      const dl = ctx.createDelay(0.08), dr = ctx.createDelay(0.08);
      dl.delayTime.value = 0.022; dr.delayTime.value = 0.034;
      const dg = ctx.createGain(); dg.gain.value = 0.18;
      const mg = ctx.createChannelMerger(2);
      env.connect(lp); lp.connect(dl); lp.connect(dr);
      dl.connect(mg,0,0); dr.connect(mg,0,1); mg.connect(dg); dg.connect(ctx.destination);
      lp.connect(ctx.destination);
    } else { env.connect(ctx.destination); }
  } catch(e) {}
}
function chord(freqs, type, dur, vol, delay=0, spread=0.06) {
  freqs.forEach((f,i) => playNote(f, type, dur, vol*(1-i*0.08), delay+i*spread));
}
const SFX = {
  acquire:      () => { playNote(440,'sine',.18,.42,0,.012,.15,2); playNote(554,'sine',.14,.30,.10,.012,.12); },
  upgrade:      () => { [330,415,494,587].forEach((f,i)=>playNote(f,'sine',.14,.30,i*.075,.010,.10,1.5)); },
  levelUp:      () => { chord([523,659,784],'sine',.30,.38,0,.05); playNote(1047,'sine',.28,.28,.22,.012,.20,2); },
  takeover_ok:  () => { playNote(150,'triangle',.08,.45,0,.005,.06); playNote(440,'sine',.22,.35,.08,.012,.18,2); playNote(880,'sine',.20,.28,.18,.010,.16); },
  takeover_fail:() => { playNote(200,'triangle',.10,.45,0,.005,.08); playNote(130,'sine',.35,.38,.09,.012,.22); playNote(98,'sine',.40,.28,.22,.010,.28); },
  buy:          () => { playNote(587,'sine',.12,.30,0,.010,.10,2); playNote(784,'sine',.10,.24,.08,.010,.08); },
  sell:         () => { playNote(523,'sine',.12,.30,0,.010,.10); playNote(392,'sine',.14,.24,.08,.010,.10); },
  sellco:       () => { playNote(440,'sine',.14,.30,0,.012,.14,.5); playNote(330,'sine',.18,.24,.10,.012,.16); },
  card:         () => { [440,554,659,784].forEach((f,i)=>playNote(f,'triangle',.12,.24,i*.045,.008,.10)); },
  endTurn:      () => { playNote(330,'sine',.12,.22,0,.012,.10); playNote(247,'sine',.20,.18,.12,.012,.16); },
  phase:        () => { [110,165,220,277].forEach((f,i)=>playNote(f,'sine',.30,.26,i*.12,.015,.20,2)); },
  event:        () => { playNote(523,'triangle',.07,.24,0,.008,.06); playNote(659,'triangle',.10,.26,.07,.008,.08); },
  gameOver:     () => { [523,659,784,659,784,1047].forEach((f,i)=>playNote(f,'sine',.26,.32,i*.16,.012,.20,2)); },
  ui:           () => playNote(800,'sine',.06,.12,0,.005,.05),
  pass:         () => playNote(330,'sine',.14,.14,0,.010,.10),
  nope:         () => { playNote(220,'sine',.14,.28,0,.008,.10); playNote(165,'sine',.14,.22,.08,.008,.10); },
  aiact:        () => playNote(200+Math.random()*100,'sine',.07,.08,0,.008,.05),
};
function showSoundMenu() {
  SFX.ui();
  showModal('🔊 Sound Settings', `
    <p style="font-family:var(--font-mono);font-size:10px;color:var(--tx-lo);margin-bottom:12px">
      Headphone mode applies a low-pass filter + stereo depth — safe for earphones.
    </p>
    <div class="snd-modes">
      <div class="snd-mode ${SND.on&&SND.mode==='normal'?'on':''}"     id="sm-normal"    onclick="setSndMode('normal')">🔊 Normal</div>
      <div class="snd-mode ${SND.on&&SND.mode==='headphone'?'on':''}"  id="sm-headphone" onclick="setSndMode('headphone')">🎧 Headphone</div>
      <div class="snd-mode ${!SND.on?'on':''}"                         id="sm-off"       onclick="setSndMode('off')">🔇 Off</div>
    </div>
    <div class="vol-row">
      <div class="vol-lbl">Volume</div>
      <input type="range" min="0" max="100" value="${Math.round(SND.vol*100)}" oninput="SND.vol=this.value/100">
    </div>
    <div class="mbtns">
      <button class="mbtn pri" onclick="SFX.acquire();SFX.ui()">▶ Preview</button>
      <button class="mbtn" onclick="closeModal()">Close</button>
    </div>`);
}
function setSndMode(m) {
  if (m==='off') { SND.on=false; } else { SND.on=true; SND.mode=m; }
  document.getElementById('snd-btn').textContent = SND.on?(SND.mode==='headphone'?'🎧':'🔊'):'🔇';
  ['normal','headphone','off'].forEach(id => {
    const el = document.getElementById('sm-'+id);
    if (el) el.classList.toggle('on', (id==='off'&&!SND.on)||(SND.on&&SND.mode===id));
  });
}


/* ──────────────────── GAME ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — GAME LOGIC
   Setup · Core Math · Actions · AI · Rounds
═══════════════════════════════════════════ */

/* ── Setup UI ── */
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
  const el = document.getElementById('bonus-preview');
  if (!el) return;
  el.innerHTML = pDefs.map((p, i) => `
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
  GS.stats = { toa:Array(n).fill(0), tos:Array(n).fill(0), rev:Array(n).fill(0), peak:Array(n).fill(0) };
  GS.players = PLAYER_DEFS.slice(0, n).map((p, i) => ({
    ...p,
    cash: 260, actionsLeft: 3, stocks: {},
    ceo: CEO_TYPES[i % CEO_TYPES.length],
    tactics: [
      { ...TACTICS_POOL[i % TACTICS_POOL.length],       used:false },
      { ...TACTICS_POOL[(i + 2) % TACTICS_POOL.length], used:false },
    ],
    fortified: false, _noTakeover: false, _revPenalty: 1,
  }));
  GS.sectors = SECTORS.map((s, i) => ({
    ...s, id:i, sharesLeft: 3+numAI, price: 12, growthScore: 0,
    demand: 0, priceHistory: [12,12,12], _stablePrice: 12,
  }));
  let cid = 0;
  GS.companies = [];
  REGIONS.forEach((r, ri) => {
    const pool = [...r.pool], picked = [];
    while (picked.length < 2 && pool.length > 0) {
      picked.push(pool.splice(Math.floor(Math.random()*pool.length), 1)[0]);
    }
    picked.forEach(name => {
      const baseRev = 14 + Math.floor(Math.random() * 13);
      const c = {
        id: cid++, name, regionIdx: ri, ownerId: null,
        level: 1, upgrades: 0, initRevenue: baseRev, revenue: baseRev,
        baseValue: 32 + Math.floor(Math.random()*18),
        sectorId: ri % SECTORS.length, failedTakeoversAgainst: 0,
        volatile: false, _traitDef: 0, _evtDef: 0, trait: null,
      };
      if (Math.random() < 0.3) {
        const t = COMPANY_TRAITS[Math.floor(Math.random()*COMPANY_TRAITS.length)];
        c.trait = t; t.apply(c);
      }
      GS.companies.push(c);
    });
  });
  GS.regions = REGIONS.map(r => ({ name: r.name, controller: null }));
}

function startGame() {
  const numAI = selectedMode;
  initGameData(numAI);
  setPhase(1);
  /* Rebuild bonuses for actual player count (fixes bug where only 2 were generated) */
  buildBonusPreview(numAI + 1);
  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));
  updateRegionControl();
  updateStockPrices();
  document.getElementById('setup-overlay').style.display = 'none';
  render();
  renderRoundTrack();
  if (document.getElementById('tut-check').checked) startTutorial();
  else showPhaseAnnounce();
  glog(`=== CORPORATE DOMINION — ${numAI===1?'1v1':'1v3'} — ROUND 1 ===`, 'phase');
}

/* ── Core Math ── */
function setPhase(idx) { GS.phaseIdx = idx; GS.phase = PHASES[idx]; }

function rollPhase() {
  const r = GS.round;
  let w = r<=2 ? [2,5,2,1] : r<=4 ? [2,3,3,2] : [1,2,3,4];
  const tot = w.reduce((a,b)=>a+b,0);
  for (let attempt=0; attempt<20; attempt++) {
    let x = Math.random()*tot;
    for (let i=0; i<w.length; i++) {
      x -= w[i];
      if (x<=0) { if (i===GS.lastPhaseIdx && Math.random()<0.60 && attempt<10) break; setPhase(i); return; }
    }
  }
  setPhase(1);
}

function updateStockPrices() {
  GS.sectors.forEach(s => {
    const owned = GS.companies.filter(c => c.sectorId===s.id && c.ownerId!==null);
    s.growthScore = owned.reduce((a,c) => a+c.upgrades*2+3-c.failedTakeoversAgainst, 0);
    s.demand      = owned.length;
    const raw     = 10 + (s.growthScore*s.gm) + s.demand + GS.phase.stockMod;
    const stable  = Math.min(25, Math.max(5, Math.round(raw)));
    s.price = stable; s._stablePrice = stable;
  });
}

function updateRegionControl() {
  GS.regions.forEach((region, ri) => {
    const counts = {};
    GS.companies.filter(c=>c.regionIdx===ri&&c.ownerId!==null).forEach(c=>{ counts[c.ownerId]=(counts[c.ownerId]||0)+1; });
    region.controller = null;
    Object.entries(counts).forEach(([pid,cnt]) => { if (cnt>=2) region.controller=parseInt(pid); });
  });
}

function calcBaseRevenue(p) {
  let rev=0; const ph=GS.phase, pen=p._revPenalty||1;
  GS.companies.forEach(c => {
    if (c.ownerId!==p.id) return;
    let r = c.revenue*ph.revMult*pen;
    if (GS.regions[c.regionIdx].controller===p.id) r+=5*ph.revMult;
    rev += r;
  });
  Object.entries(p.stocks).forEach(([sid,qty]) => { const s=GS.sectors[sid]; if(s) rev+=Math.round(s.price/5)*qty; });
  return Math.floor(rev);
}

function calcRevenue(p) {
  let rev=0; const ph=GS.phase, pen=p._revPenalty||1;
  GS.companies.forEach(c => {
    if (c.ownerId!==p.id) return;
    let r = c.revenue*ph.revMult*(0.85+Math.random()*0.30)*pen;
    if (c.volatile) r *= (0.70+Math.random()*0.60);
    if (GS.regions[c.regionIdx].controller===p.id) r+=5*ph.revMult;
    rev += r;
  });
  Object.entries(p.stocks).forEach(([sid,qty]) => { const s=GS.sectors[sid]; if(s) rev+=Math.round(s.price/5)*qty; });
  return Math.floor(rev);
}

function calcNW(p) {
  let nw=p.cash;
  GS.companies.forEach(c => { if(c.ownerId===p.id) nw+=calcCompanyValue(c); });
  Object.entries(p.stocks).forEach(([sid,qty]) => { const s=GS.sectors[sid]; if(s) nw+=qty*s.price; });
  return nw;
}

function calcCompanyValue(c) { return c.baseValue + c.upgrades*22 + c.level*10; }
function calcSellPrice(c)    { return Math.floor(calcCompanyValue(c)*0.65); }

function calcTakeover(attackerIdx, company) {
  const att=GS.players[attackerIdx], defIdx=company.ownerId;
  const def=defIdx!==null?GS.players[defIdx]:null;
  const A = (att.cash*0.15)+att.ceo.attackBonus+(GS.phase.toMod*60);
  const regionBonus = (GS.regions[company.regionIdx].controller===defIdx)?6:0;
  const D = 6+company.level*3+company.upgrades*2+regionBonus+(def?def.ceo.defenseBonus:0)+(company._traitDef||0)+(company._evtDef||0);
  const P    = Math.max(0.05, Math.min(0.93, A/(A+D)));
  const cost = Math.floor(company.baseValue*1.20+company.upgrades*14+company.level*10);
  return { A:Math.round(A), D:Math.round(D), P, cost };
}

function applyUpgrade(company, free=false) {
  if (company.ownerId === null || company.ownerId === undefined) return false;
  const p=GS.players[company.ownerId], cost=free?0:(20+company.upgrades*10);
  if (!p) return false;
  if (!free && p.cash<cost) return false;
  if (!free) p.cash-=cost;
  company.upgrades++; company.revenue+=4;
  if (company.upgrades%2===0) {
    company.level++; SFX.levelUp();
    glog(`🆙 ${company.name} → Level ${company.level}!`, 'good');
    document.querySelectorAll(`.cc[data-cid="${company.id}"]`).forEach(el => {
      el.classList.add('lv-flash'); setTimeout(()=>el.classList.remove('lv-flash'),720);
    });
  }
  return true;
}

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
  glog(`YOU bought ${s.name} @ $${cost}  (div $${Math.round(s.price / 5)}/round)`, 'good');
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
  if (p.cash < 35 && mine.length > 1 && GS.round >= 3) {
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


/* ──────────────────── RENDER ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — RENDER ENGINE
   All DOM writes live here. Uses new layout:
   #board (4-col regions), #action-dock,
   #intel-area (stocks + rivals), right sidebar
═══════════════════════════════════════════ */

let _stocksVisible = false; // toggled on mobile

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
  const p  = GS.players[0];
  const ph = GS.phase;
  // Phase label in topbar
  const lbl = document.getElementById('phase-label');
  if (lbl) { lbl.textContent = ph.name; lbl.style.color = ph.color; }
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
    const dots = Array.from({length:3},(_,j)=>
      `<div class="ps-dot" style="background:${j<p.actionsLeft?p.color:p.color+'22'}"></div>`
    ).join('');
    const crown = (nws[i]===maxNW&&GS.round>1)?'👑':'';
    return `<div class="ps-col${active?' ps-active':''}">
      <div class="ps-name" style="color:${p.color}">${active?'▶ ':''}${crown}${p.name}</div>
      <div class="ps-cash">$${p.cash}</div>
      <div class="ps-nw">NW $${nws[i]}</div>
      <div class="ps-dots">${dots}</div>
    </div>`;
  }).join('');
  const roundDots = Array.from({length:GS.maxRounds},(_,i)=>{
    const rnd=i+1,done=rnd<GS.round,cur=rnd===GS.round;
    const phIdx=GS.roundPhasesIdx[i];
    const col=(done&&phIdx!=null)?PHASES[phIdx].color:'';
    const style=col?`background:${col}30;border-color:${col}88;color:${col}`:'';
    return `<div class="ps-r${cur?' cur':''}${done?' done':''}" style="${style}">${rnd}</div>`;
  }).join('');
  strip.innerHTML = playerCols + `<div class="ps-rounds">${roundDots}</div>`;
}

/* ── Map / Board — 4-column vertical layout ── */
function renderMap() {
  const board = document.getElementById('board');
  const aiOvl = document.getElementById('ai-overlay');
  board.innerHTML = '';
  board.appendChild(aiOvl);

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
      if (action==='acquire'  && c.ownerId===null)                     hi='hi-acq';
      if (action==='upgrade'  && c.ownerId===0)                        hi='hi-upg';
      if (action==='takeover' && c.ownerId!==null && c.ownerId!==0)    hi='hi-tak';
      if (action==='sell'     && c.ownerId===0)                        hi='hi-sell';

      const card = document.createElement('div');
      card.className   = `cc${owner?' owned-'+owner.id:''} ${hi}`;
      card.dataset.cid = c.id;
      card.onclick     = () => handleCompanyClick(c.id);
      card.onmouseenter = () => {
        if (action==='takeover' && c.ownerId!==null && c.ownerId!==0) {
          GS.lastHoveredTak = c;
        }
        if (action==='acquire' && c.ownerId===null)
          setInfo(`🏢 Acquire <b>${c.name}</b> — Cost: <b style="color:var(--gold-lt)">$${c.baseValue}</b> · Rev $${c.revenue}/rnd · ${SECTORS[c.sectorId].name}${c.trait?' · '+c.trait.name:''}`);
        if (action==='upgrade' && c.ownerId===0)
          setInfo(`⬆ Upgrade <b>${c.name}</b> — Cost: <b style="color:var(--gold-lt)">$${20+c.upgrades*10}</b> · New rev $${c.revenue+3}/rnd`);
        if (action==='sell' && c.ownerId===0)
          setInfo(`📈 Sell <b>${c.name}</b> — Receive: <b style="color:var(--amber)">$${calcSellPrice(c)}</b> (65% of $${calcCompanyValue(c)})`);
      };

      const lvProg = ((c.upgrades % 2) / 2) * 100;
      const trHtml = c.trait
        ? `<span class="co-trait" style="background:${c.trait.color}18;color:${c.trait.color};border:1px solid ${c.trait.color}44">${c.trait.name}</span>`
        : '';
      const ownerBadge = owner
        ? `<div class="co-owner-badge" style="background:${owner.color}20;color:${owner.color};border:1px solid ${owner.color}40">${owner.name[0]}</div>`
        : '';
      const revColor = c.revenue>20?'var(--gold-lt)':c.revenue>14?'var(--green-lt)':'var(--tx-md)';

      card.innerHTML = `
        ${c.ownerId===null?`<div class="acq-cost">$${c.baseValue}</div>`:''}
        <div class="co-top">
          <div class="co-name">${c.name}</div>
          ${ownerBadge}
        </div>
        <div class="co-rev-row">
          <div>
            <div class="co-rev-lbl">Rev/rnd</div>
            <div class="co-rev-val" style="color:${revColor}">$${c.revenue}</div>
          </div>
        </div>
        <div class="co-meta">
          <span class="co-lv">Lv${c.level}+${c.upgrades}</span>
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
  const p = GS.players[0];
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
  const p = GS.players[0];
  const myT = GS.currentPlayerIdx === 0;
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
  const p  = GS.players[0];
  const el = document.getElementById('cards-area');
  if (!el) return;
  const cnt = document.getElementById('hand-count');
  const unused = p.tactics.filter(t => !t.used).length;
  if (cnt) cnt.textContent = unused;
  el.innerHTML = p.tactics.map((t, i) => `
    <div class="tcard ${t.used?'used':''}" onclick="${t.used?'':'playTactic(0,'+i+')'}">
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
  const human = GS.currentPlayerIdx === 0;
  const endBtn = document.getElementById('end-turn-btn');
  if (endBtn) { endBtn.disabled = !human; }
  const dock = document.getElementById('action-dock');
  if (dock) {
    dock.style.opacity       = human ? '1' : '0.38';
    dock.style.pointerEvents = human ? 'auto' : 'none';
  }
  // Net lock overlay
  const lock = document.getElementById('net-lock');
  if (lock) {
    if (!human && MP && MP.active) {
      const p = GS.players[GS.currentPlayerIdx];
      document.getElementById('net-lock-name').textContent = p.name;
      lock.classList.add('show');
    } else { lock.classList.remove('show'); }
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
  _phaseTimer = setTimeout(dismissPhase, 5000);
}
function dismissPhase() {
  clearTimeout(_phaseTimer);
  document.getElementById('phase-announce').classList.remove('show');
}

/* ── Takeover calc (shown in modal) ── */
function updateTakeoverCalc(company) {
  // Nothing to do here — takeover info is shown in the handleCompanyClick modal
}

/* ── Modal ── */
function showModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-overlay').classList.add('show');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('show'); }
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});

/* ── Info strip ── */
function setInfo(msg) {
  const el = document.getElementById('info-strip');
  if (el) el.innerHTML = msg;
}

/* ── Sidebar toggle ── */
function toggleLeft() {
  const l = document.getElementById('left');
  if (window.innerWidth <= 640) l.classList.toggle('drawer-open');
  else l.classList.toggle('collapsed');
}

/* ── Activity log ── */
function glog(msg, type='info') {
  const el = document.getElementById('log-area');
  const d  = document.createElement('div');
  d.className   = 'le ' + type;
  d.textContent = `[R${GS.round}] ${msg}`;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 120) el.removeChild(el.lastChild);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Rulebook ── */
function showRulebook() {
  SFX.ui();
  showModal('📖 Rulebook', `
    <div class="rb-s"><h3>Win Condition</h3>
      <p>Highest <span class="rg">Net Worth</span> after 6 rounds wins. NW = Cash + Company Values + Stocks.</p></div>
    <div class="rb-s"><h3>Actions (3 per turn)</h3><ul>
      <li><b>[1] Acquire</b> — Buy an unowned company at base cost.</li>
      <li><b>[2] Upgrade</b> — $20 + $10×upgrades. +$3 rev, +2 def. Every 2 upgrades = level up.</li>
      <li><b>[3] Takeover</b> — Pay cost upfront. Dice decides outcome.</li>
      <li><b>[S] Sell Co</b> — Sell your company for 65% of value.</li>
      <li><b>Stocks</b> — Trade in the right panel. Earn dividends each round.</li>
      <li><b>[4] Card</b> — One-time tactical card from your hand.</li>
    </ul></div>
    <div class="rb-s"><h3>Takeover</h3>
      <p>A = (Cash×0.15) + CEO attack + Phase mod</p>
      <p>D = 6 + Level×3 + Upgrades×2 + Region(6) + CEO def + Traits</p>
      <p>P = A÷(A+D), capped 5–93%.</p></div>
    <div class="rb-s"><h3>Phases</h3><ul>
      <li><span class="rg">BOOM</span> — Rev ×1.5, Stocks +3, harder takeovers</li>
      <li><span class="rb">STABLE</span> — Normal</li>
      <li><span class="ro">RECESSION</span> — Rev ×0.7, Stocks −3, easier takeovers</li>
      <li><span class="rr">CRASH</span> — Rev ×0.4, Stocks −5, chaos</li>
    </ul></div>
    <div class="rb-s"><h3>Region Control</h3>
      <p>Own <b>both</b> companies in a region → +$5 rev/co + +6 defense per company.</p></div>
    <div class="mbtns" style="padding-top:4px"><button class="mbtn pri" onclick="closeModal()">Got it ✓</button></div>`);
}

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  const blocked = ['modal-overlay','setup-overlay','tut-overlay','dice-overlay','phase-announce'];
  if (blocked.some(id => {
    const el=document.getElementById(id);
    return el&&(el.classList.contains('show')||el.style.display==='flex'||el.style.display==='block');
  })) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  switch(e.key) {
    case '1': setAction('acquire');  break;
    case '2': setAction('upgrade');  break;
    case '3': setAction('takeover'); break;
    case '4': showCardMenu();        break;
    case 's': case 'S': setAction('sell'); break;
    case 'p': case 'P': passAction();      break;
    case ' ': e.preventDefault(); endTurn(); break;
    case 'Escape': clearAction(); break;
  }
});


/* ──────────────────── MULTIPLAYER ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — MULTIPLAYER ENGINE
   PeerJS WebRTC · Host-authoritative
   BUGS FIXED:
   1. Client lobby/setup overlay now hidden when game starts
   2. Client can request state resend if packet missed
   3. Host rebuilds startup bonuses for actual player count
   4. mpApplyState hides overlays on first packet
═══════════════════════════════════════════ */

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

  // Rebuild bonuses for actual player count (was only built for preview count)
  buildBonusPreview(GS.players.length);
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
  // Hide both overlays — critical fix: setup was staying visible on client
  document.getElementById('lobby-overlay').classList.remove('show');
  document.getElementById('setup-overlay').style.display = 'none';
  setInfo('⏳ Waiting for host to send game state…');
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



/* ──────────────────── MAIN ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — MAIN / BOOT
   Runs after all other scripts loaded.
   Sets up: dock btn actions, action state sync,
   auto-end timer, init setup screen.
═══════════════════════════════════════════ */

/* ── Dock button active state sync ── */
const DOCK_ACTIONS = {
  'acquire': 'btn-acquire', 'upgrade': 'btn-upgrade',
  'takeover': 'btn-takeover', 'sell': 'btn-sell',
};

/* Patch setAction to update dock button styling */
const _setAction_orig = setAction;
setAction = function(action) {
  _setAction_orig(action);
  Object.entries(DOCK_ACTIONS).forEach(([a, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', a === GS.selectedAction);
  });
};

/* Patch clearAction to clear dock styling */
const _clearAction_orig = clearAction;
clearAction = function() {
  _clearAction_orig();
  Object.values(DOCK_ACTIONS).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('active');
  });
};

/* ── Auto-end toast ── */
function showAutoEndToast() {
  const t = document.getElementById('auto-end-toast');
  if (!t) return;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1100);
}

/* Patch clearAction to trigger auto-end when actions run out */
const _clearAction_ae = clearAction;
clearAction = function() {
  _clearAction_ae();
  if (GS.gameOver || GS.currentPlayerIdx !== 0) return;
  const p = GS.players[0];
  if (p && p.actionsLeft <= 0) {
    showAutoEndToast();
    setTimeout(() => { if (GS.currentPlayerIdx === 0 && p.actionsLeft <= 0) endTurn(); }, 1100);
  }
};

/* ── Drawer backdrop (mobile) ── */
const backdrop = document.createElement('div');
backdrop.id = 'drawer-backdrop';
backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:299;display:none;';
backdrop.onclick = () => {
  document.getElementById('left').classList.remove('drawer-open');
  backdrop.style.display = 'none';
};
document.body.appendChild(backdrop);

const _toggleLeft_orig = toggleLeft;
toggleLeft = function() {
  _toggleLeft_orig();
  if (window.innerWidth <= 640) {
    backdrop.style.display = document.getElementById('left').classList.contains('drawer-open') ? 'block' : 'none';
  }
};

/* ── Stock buy/sell wrappers (keeps render in sync) ── */
const _doStockBuy_orig  = doStockBuy;
const _doStockSell_orig = doStockSell;
doStockBuy  = function(sid) { _doStockBuy_orig(sid);  renderRightSidebar(); };
doStockSell = function(sid) { _doStockSell_orig(sid); renderRightSidebar(); };

/* ── Takeover calc: shown in handleCompanyClick modal, no separate panel needed ── */

/* ── Boot ── */
buildBonusPreview(2); // default 1v1 preview

// Ensure setup overlay is showing on load
document.getElementById('setup-overlay').style.display = '';
