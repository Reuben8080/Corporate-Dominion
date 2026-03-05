'use strict';

/* ── DIAGNOSTIC ERROR HANDLER ── */
window.onerror = function(msg, src, line, col, err) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;color:#ff6b6b;'+
    'font-family:monospace;font-size:13px;padding:20px;overflow:auto;white-space:pre-wrap;';
  div.textContent = 'JavaScript Error:\n' + msg + '\nLine: ' + line + '\nFile: ' + src + 
    '\n\n' + (err ? err.stack : '');
  document.body.appendChild(div);
  return true;
};
window.addEventListener('unhandledrejection', function(e) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a0000;'+
    'color:#ff6b6b;font-family:monospace;font-size:12px;padding:10px;';
  div.textContent = 'Unhandled Promise Error: ' + (e.reason?.message || e.reason);
  document.body.appendChild(div);
});

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
  { name:'Emergency Funding',  icon:'💰', effect:'+$60 cash injection',
    action: p => { p.cash += 60; SFX.card(); glog(`${p.name}: Emergency Funding +$60`, 'good'); } },
  { name:'Espionage',          icon:'🕵', effect:'Steal $50 from the leader',
    action: p => { const lead=GS.players.filter(x=>x.id!==p.id).sort((a,b)=>calcNW(b)-calcNW(a))[0]; if(!lead){SFX.nope();return;} const amt=Math.min(50,lead.cash); lead.cash-=amt; p.cash+=amt; SFX.card(); glog(`${p.name}: Espionage — stole $${amt} from ${lead.name}!`,'warn'); } },
  { name:'Hostile Press',      icon:'📰', effect:'Leader loses $40 · frozen from acquiring next turn',
    action: p => { const lead=GS.players.filter(x=>x.id!==p.id).sort((a,b)=>calcNW(b)-calcNW(a))[0]; if(!lead){SFX.nope();return;} const amt=Math.min(40,lead.cash); lead.cash-=amt; lead._noAcquire=true; SFX.card(); glog(`${p.name}: Hostile Press! ${lead.name} loses $${amt} & locked out of acquisitions!`,'warn'); } },
  { name:'Market Correction',  icon:'📉', effect:'All players lose 15% cash (min $20)',
    action: p => { GS.players.forEach(q => { const loss=Math.max(20,Math.floor(q.cash*0.15)); q.cash=Math.max(0,q.cash-loss); glog(`${q.name}: Market Correction −$${loss}`,'warn'); }); SFX.card(); render(); } },
  { name:'Sovereign Bailout',  icon:'🏛', effect:'Recover your last failed takeover loss',
    action: p => { const amt=p._lastTOFail||0; if(amt>0){ p.cash+=amt; p._lastTOFail=0; SFX.card(); glog(`${p.name}: Sovereign Bailout — recovered $${amt}!`,'good'); } else { p.cash+=30; SFX.card(); glog(`${p.name}: Sovereign Bailout — +$30 (no prior loss on record).`,'good'); } } },
  { name:'Golden Parachute',   icon:'🪂', effect:'Sell your weakest company at 100% value',
    action: p => { const c=GS.companies.filter(x=>x.ownerId===p.id).sort((a,b)=>calcCompanyValue(a)-calcCompanyValue(b))[0]; if(c){ const full=calcCompanyValue(c); p.cash+=full; c.ownerId=null; c.upgrades=0; c.level=1; c.revenue=c.initRevenue; c._traitDef=c.trait?3:0; updateRegionControl(); updateStockPrices(); render(); SFX.card(); glog(`${p.name}: Golden Parachute — sold ${c.name} at full value $${full}!`,'good'); } else { SFX.nope(); glog(`${p.name}: No company to sell.`,'info'); } } },
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
  { name:'Pharma',  gm:1.6 },
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
  _marketInstability:0,
};
const MP = {
  active:   false,
  isHost:   false,
  role:     'host',
  peer:     null,
  conns:    {},
  hostConn: null,
  roomCode: '',
  localSlot: 0,
  slots: [
    { name:'YOU',    filled:true,  ready:false, peerId:null, isLocal:true  },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
    { name:'—',      filled:false, ready:false, peerId:null, isLocal:false },
  ],
  playerName: 'Player',
  numHumans:  1,
  tutCheck:   true,
};
let selectedMode   = 1;
let startupBonuses = [];

/* ── MP helpers (safe to call in solo mode) ── */
function mySlot()   { return MP.active ? MP.localSlot : 0; }
function isMyTurn() { return GS.currentPlayerIdx === mySlot(); }

/* ──────────────────── GAME ──────────────────── */

/* ═══════════════════════════════════════════
   CORPORATE DOMINION v7 — GAME LOGIC
   Setup · Core Math · Actions · AI · Rounds
═══════════════════════════════════════════ */

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
  const ceoShuffled = [...CEO_TYPES].sort(() => Math.random() - 0.5);

  // Shuffle-deal-2: build a deck large enough for all players, no two cards the same per player
  const buildDeck = () => [...TACTICS_POOL].sort(() => Math.random() - 0.5);
  let tacticDeck = buildDeck();
  while (tacticDeck.length < n * 2) tacticDeck = tacticDeck.concat(buildDeck());

  GS.players = PLAYER_DEFS.slice(0, n).map((p, i) => ({
    ...p,
    cash: 260, actionsLeft: 3, stocks: {},
    ceo: ceoShuffled[i % ceoShuffled.length],
    tactics: [
      { ...tacticDeck[i * 2],     used: false },
      { ...tacticDeck[i * 2 + 1], used: false },
    ],
    fortified: false, _noTakeover: false, _noAcquire: false,
    _revPenalty: 1, _lastTOFail: 0,
  }));
  GS.sectors = SECTORS.map((s, i) => ({
    ...s, id:i, sharesLeft: 3 + numAI, price: 12, growthScore: 0,
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
        sectorId: ri % SECTORS.length, failedTakeoversAgainst:0,
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
  const nameEl = document.getElementById('solo-name-input');
  const playerName = (nameEl?.value?.trim().toUpperCase() || 'YOU').replace(/[^A-Z0-9]/g,'') || 'YOU';
  initGameData(numAI);
  if (GS.players[0]) GS.players[0].name = playerName;
  setPhase(1);
  buildBonusPreview(numAI + 1);
  GS.players.forEach((p, i) => startupBonuses[i]?.apply(p));
  updateRegionControl();
  updateStockPrices();
  document.getElementById('setup-overlay').style.display = 'none';
  const leaveBtns = document.querySelectorAll('.leave-sidebar-btn');
  leaveBtns.forEach(b => b.style.display = 'flex');
  render();
  renderRoundTrack();
  if (document.getElementById('tut-check').checked) startTutorial();
  else showPhaseAnnounce();
  glog(`=== CORPORATE DOMINION — ${numAI===1?'1v1':'1v3'} — ROUND 1  [${playerName}] ===`, 'phase');
}

/* ── Core Math ── */
function setPhase(idx) { GS.phaseIdx = idx; GS.phase = PHASES[idx]; }

function rollPhase() {
  const r = GS.round;
  // Late-game tension: if round 6 and no crash yet, force crash
  const crashSeen = GS.roundPhasesIdx.some(idx => idx === 3); // 3 = CRASH phase
  if (r === 6 && !crashSeen) {
    setPhase(3); // Force CRASH phase in final round if not yet seen
    return;
  }
  // Normal phase weighting
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
    // ±3 intra-round noise — markets are never perfectly calm
    const noise   = (Math.random() - 0.5) * 6;
    const stable  = Math.min(25, Math.max(5, Math.round(raw + noise)));
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
  const myCompanies = GS.companies.filter(c => c.ownerId===p.id);
  // Option C: diminishing returns — each extra company yields slightly less
  // 1 co=×1.0, 2=×0.93, 3=×0.87, 4=×0.82, 5=×0.78  (natural market saturation)
  const efficiencyFactor = 1 / (1 + 0.08 * Math.max(0, myCompanies.length - 1));
  myCompanies.forEach(c => {
    let r = c.revenue * ph.revMult * (0.80 + Math.random()*0.40) * pen * efficiencyFactor;
    if (c.volatile) r *= (0.55 + Math.random()*0.90); // volatile: wider ±45% swing
    if (GS.regions[c.regionIdx].controller===p.id) r += 5*ph.revMult;
    rev += r;
  });
  // Variable stock dividends: ±35% around base yield (markets fluctuate)
  Object.entries(p.stocks).forEach(([sid,qty]) => {
    const s=GS.sectors[sid]; if(!s) return;
    const divYield = (0.65 + Math.random()*0.70); // 65%–135% of base div
    rev += Math.round((s.price / 5) * divYield) * qty;
  });
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
  // Option D: cap cash contribution at 1.5× field median — wealth shouldn't guarantee dominance
  const sortedCash = GS.players.map(x=>x.cash).slice().sort((a,b)=>a-b);
  const mid = Math.floor(sortedCash.length/2);
  const medianCash = sortedCash.length%2 ? sortedCash[mid] : (sortedCash[mid-1]+sortedCash[mid])/2;
  const cappedCash = Math.min(att.cash, Math.max(medianCash * 1.5, 80)); // floor of 80 so early game still works
  const A = (cappedCash*0.15)+att.ceo.attackBonus+(GS.phase.toMod*60);
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

/* ══════════════════════════════════════════════════════
   AI ENGINE
   Three distinct personalities with sell trigger for
   cash-poor states (FIX: AI was stuck with $0 in late CRASH)
══════════════════════════════════════════════════════ */
async function endTurn() {
  if (!isMyTurn() || GS.gameOver) return;
  SFX.endTurn();
  GS.currentPlayerIdx = 1;
  clearAction(); updateTurnUI();
  for (let ai = 1; ai < GS.players.length; ai++) {
    if (!GS.players[ai].isHuman) await runAITurn(ai);
  }
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
  for (let ap = 0; ap < 3; ap++) {
    await sleep(260 + Math.random() * 180);
    // On last action: if trailing leader by >$80, play a tactic card
    if (ap === 2) {
      const leader = GS.players.slice().sort((a,b) => calcNW(b)-calcNW(a))[0];
      if (leader.id !== pid && calcNW(leader) - calcNW(p) > 80) {
        const avail = p.tactics.map((t,i) => ({...t,i})).filter(t => !t.used);
        if (avail.length > 0) {
          playTactic(pid, avail[0].i);
          continue;
        }
      }
    }
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

  // Find current leader for +20 EV targeting bonus
  const leader = GS.players.slice().sort((a,b) => calcNW(b)-calcNW(a))[0];

  /* ── Phase-aware sell: RECESSION/CRASH → sell weakest if cash < 60 (any round) ── */
  const inDownturn = GS.phase && (GS.phase.name === 'RECESSION' || GS.phase.name === 'CRASH');
  if ((p.cash < 60 && inDownturn) || (p.cash < 35 && mine.length > 1 && GS.round >= 3)) {
    const weakest = mine.slice().sort((a, b) => a.revenue - b.revenue)[0];
    if (weakest && mine.length > 1) {
      const sp = calcSellPrice(weakest);
      p.cash += sp;
      weakest.ownerId  = null;
      weakest.upgrades = 0;
      weakest.level    = 1;
      weakest.revenue  = weakest.initRevenue;
      weakest._traitDef = weakest.trait ? 3 : 0;
      SFX.aiact();
      glog(`${p.name} sold ${weakest.name} for $${sp} (capital management)`, 'info');
      updateRegionControl(); updateStockPrices(); render();
      return;
    }
  }

  /* ── Acquire (blocked if _noAcquire from Hostile Press) ── */
  if (!p._noAcquire && unowned.length > 0) {
    const t = [...unowned].sort((a, b) => a.baseValue - b.baseValue)[0];
    if (p.cash >= t.baseValue) {
      const ev = t.revenue * 3 - t.baseValue;
      if (ev > bestEV) { bestEV = ev; best = { type:'acquire', t }; }
    }
  }

  /* ── Takeover — +20 EV bonus when targeting the leader's companies ── */
  if (!p._noTakeover) {
    let tgts = enemies;
    if (style === 'opportunist') {
      const lc = enemies.filter(c => c.ownerId === leader?.id);
      if (lc.length > 0) tgts = lc;
    }
    tgts.forEach(c => {
      const tk = calcTakeover(pid, c);
      const minP = style === 'aggressive' ? 0.20 : 0.30;
      if (tk.P < minP || p.cash < tk.cost) return;
      const gain = calcCompanyValue(c);
      const loss = tk.cost * 0.5;
      const leaderBonus = (c.ownerId === leader?.id && leader.id !== pid) ? 20 : 0;
      const ev   = tk.P * gain - (1 - tk.P) * loss
        + (style === 'aggressive' ? 16 : style === 'opportunist' ? 10 : 0)
        + leaderBonus;
      if (ev > bestEV) { bestEV = ev; best = { type:'takeover', c, tk }; }
    });
  }

  /* ── Upgrade — target highest-revenue company first (not lowest upgrades) ── */
  if (mine.length > 0) {
    const t    = [...mine].sort((a, b) => b.revenue - a.revenue)[0];
    const cost = 20 + t.upgrades * 10;
    if (p.cash >= cost) {
      const ev = t.revenue * (style === 'builder' ? 3.6 : 2.4);
      if (ev > bestEV) { bestEV = ev; best = { type:'upgrade', t }; }
    }
  }

  /* ── Stock investment: proactive if owning a co in that sector (price < 15), else fallback ── */
  {
    const proactive = style !== 'opportunist';
    const scored = GS.sectors
      .filter(s => s.sharesLeft > 0 && p.cash >= s.price)
      .map(s => {
        const ownInSector = mine.filter(c => c.sectorId === s.id).length;
        // Proactive: buy if we own ≥1 company there and price is attractive
        const urgency = (ownInSector >= 1 && s.price < 15) ? 30 : 0;
        return {
          s,
          score: ownInSector * 5 + s.growthScore - s.price
               + (style === 'builder' ? 4 : 0) + urgency,
        };
      })
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
      const candidate = scored[0];
      // Proactive buy (overrides other options if urgency is high)
      const ownInSector = mine.filter(c => c.sectorId === candidate.s.id).length;
      if (ownInSector >= 1 && candidate.s.price < 15 && proactive) {
        best = { type:'invest', s: candidate.s };
      } else if (!best) {
        best = { type:'invest', s: candidate.s };
      }
    }
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
      const ret  = Math.floor(tk.cost * 0.5);
      const lost = tk.cost - ret;
      p._lastTOFail = lost; // track for Sovereign Bailout
      c.failedTakeoversAgainst++;
      GS._marketInstability = Math.min(3, GS._marketInstability + 1);
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

  /* Revenue payout */
  GS.players.forEach(p => {
    p._noTakeover = false;
    p._noAcquire  = false;  // clear Hostile Press lock
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

  /* End-of-round stock drift — volatile with occasional sector shocks */
  GS.sectors.forEach(s => {
    // Base drift: −4 to +4 (wider than before)
    const drift = Math.round(Math.random() * 8 - 4);
    // 12% chance of a sector shock (±6) — mimics real market events
    const shock = Math.random() < 0.12 ? (Math.random() < 0.5 ? -6 : 6) : 0;
    s.price     = Math.min(25, Math.max(5, s.price + drift + shock));
    s._stablePrice = s.price;
    s.priceHistory = [...s.priceHistory, s.price].slice(-5);
    if (shock !== 0) glog(`📊 ${s.name} sector ${shock > 0 ? 'spike' : 'drop'} (${shock > 0 ? '+' : ''}${shock})`, shock > 0 ? 'good' : 'warn');
  });

  if (GS.round >= GS.maxRounds) { endGame(); return; }

  GS.roundPhasesIdx.push(GS.phaseIdx);
  GS.lastPhaseIdx = GS.phaseIdx;
  GS.round++;
  GS._marketInstability = 0;
  rollPhase();
  rollEvent();
  GS.currentPlayerIdx = 0;

  glog(`=== ROUND ${GS.round}  ·  ${GS.phase.name} ===`, 'phase');
  render(); updateTurnUI(); renderRoundTrack(); showPhaseAnnounce();
}

/* ══════════════════════════════════════════════════════
   PHASE EVENTS
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

  /* Populate dedicated endgame overlay */
  const ov = document.getElementById('endgame-overlay');
  if (ov) {
    document.getElementById('eg-winner-name').textContent = winner.name;
    document.getElementById('eg-winner-name').style.color = winner.color;
    document.getElementById('eg-winner-nw').textContent   = `$${winner.nw}`;
    document.getElementById('eg-standings').innerHTML = scores.map((s, i) => `
      <div class="mrow">
        <div class="ml" style="color:${s.color};font-family:var(--font-ui);font-weight:700">
          ${i === 0 ? '🏆 ' : ''}${s.name}
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <div class="mv gold" style="font-size:15px">$${s.nw}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">${s.cos}co · ${s.regs}reg</div>
        </div>
      </div>`).join('');
    document.getElementById('eg-stats').innerHTML = scores.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
        <div style="color:${s.color};font-family:var(--font-ui);font-weight:700;font-size:10px;min-width:54px">${s.name}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">TOs <span style="color:var(--gold)">${GS.stats.toa[s.id]}</span></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Win% <span style="color:var(--green-lt)">${GS.stats.toa[s.id] > 0 ? Math.round(GS.stats.tos[s.id] / GS.stats.toa[s.id] * 100) + '%' : '—'}</span></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Rev <span style="color:var(--blue-lt)">$${GS.stats.rev[s.id]}</span></div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx-lo)">Peak <span style="color:var(--gold)">$${GS.stats.peak[s.id]}</span></div>
      </div>`).join('');
    ov.classList.add('show');
  } else {
    /* Fallback for missing overlay */
    showModal('Game Over', `<div style="text-align:center;padding:20px 0"><div style="font-size:32px;font-weight:800;color:${winner.color}">${winner.name}</div><div style="font-size:18px;color:var(--gold)">$${winner.nw}</div></div><div class="mbtns"><button class="mbtn pri" onclick="location.reload()">▶ Play Again</button></div>`);
  }
}

function endgamePlayAgain() {
  const ov = document.getElementById('endgame-overlay');
  if (ov) ov.classList.remove('show');
  location.reload();
}
function endgameMainMenu() {
  const ov = document.getElementById('endgame-overlay');
  if (ov) ov.classList.remove('show');
  location.reload();
}
function leaveGame() {
  if (MP.active) { MP.peer?.destroy(); MP.active = false; }
  location.reload();
}
