'use strict';

/* ──────────────────── SOUND ──────────────────── */
/* ═══════════════════════════════════════════
   SOUND ENGINE v3 — three modes: Normal | Headphone | Off
════════════════════════════════════════════════ */
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

/* ──────────────────── UI HELPERS ──────────────────── */
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

function setInfo(msg) {
  const el = document.getElementById('info-strip');
  if (el) el.innerHTML = msg;
}

function toggleLeft() {
  const l = document.getElementById('left');
  if (window.innerWidth <= 640) l.classList.toggle('drawer-open');
  else l.classList.toggle('collapsed');
}

function glog(msg, type='info') {
  /* ── DOM system log ── */
  const el = document.getElementById('log-area');
  const d  = document.createElement('div');
  d.className   = 'le ' + type;
  d.textContent = `[R${GS.round}] ${msg}`;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 120) el.removeChild(el.lastChild);

  /* ── Action feed ticker ── */
  // 'phase' and 'info' are system noise — skip feed for those
  if (type === 'phase' || type === 'info') return;
  if (typeof actionFeedPush !== 'function') return;

  const colorMap = {
    good:  'var(--green-lt)',
    bad:   'var(--red-lt)',
    warn:  'var(--amber)',
    event: 'var(--purple)',
  };
  const feedColor = colorMap[type] || null;
  const isDanger  = type === 'bad' || type === 'warn';

  /* In solo OR when host in MP: push to local feed */
  const isMPHost = typeof MP !== 'undefined' && MP.active && MP.isHost;
  const isSolo   = typeof MP === 'undefined' || !MP.active;
  if (isSolo || isMPHost) {
    actionFeedPush(msg, feedColor, isDanger);
  }

  /* MP host: broadcast feed entry to all clients */
  if (isMPHost && typeof mpHostBroadcast === 'function') {
    mpHostBroadcast({ type: 'feed', text: msg, color: feedColor, isDanger });
  }
}

/* ════════════════════════════════════════
   ACTION FEED TICKER
   Queue of opponent actions shown one at a time
   above the mobile dock — auto-fades, no tap needed
════════════════════════════════════════ */
const _feedQueue  = [];
let   _feedActive = false;
let   _feedTimer  = null;

function actionFeedPush(msg, color, isDanger = false) {
  // Strip leading round tag if present
  const text = msg.replace(/^\[R\d+\]\s*/, '');
  _feedQueue.push({ text, color, isDanger });
  if (!_feedActive) _feedNext();
}

function _feedNext() {
  if (!_feedQueue.length) { _feedActive = false; return; }
  _feedActive = true;

  const { text, color, isDanger } = _feedQueue.shift();
  const inner = document.getElementById('action-feed-inner');
  const dot   = document.getElementById('action-feed-dot');
  const txt   = document.getElementById('action-feed-text');
  if (!inner || !txt) { _feedActive = false; return; }

  dot.style.background = color || 'var(--tx-lo)';
  txt.textContent      = text;
  txt.style.color      = color ? `${color}` : 'var(--tx-hi)';

  inner.classList.remove('visible', 'danger');
  // Force reflow so transition fires fresh
  void inner.offsetWidth;
  inner.classList.add('visible');
  if (isDanger) inner.classList.add('danger');

  // Danger messages stay 5s, normal 3s; if queue has more, chain faster
  const hold = isDanger ? 5000 : (_feedQueue.length > 2 ? 2000 : 3000);
  clearTimeout(_feedTimer);
  _feedTimer = setTimeout(_feedDismiss, hold);
}

function _feedDismiss() {
  const inner = document.getElementById('action-feed-inner');
  if (!inner) { _feedActive = false; return; }
  inner.classList.remove('visible', 'danger');
  // Wait for fade-out then show next
  setTimeout(_feedNext, 280);
}

/* ════════════════════════════════════════
   ROUND SUMMARY CARD
   Shows income per player for 4s at end of round
   Called from endRound() before phase announce
════════════════════════════════════════ */
/* ════════════════════════════════════════
   ROUND NARRATIVES — personalized story per rank per round
════════════════════════════════════════ */
const ROUND_NARRATIVES = [
  // Round 1: The Ribbon Cutting
  [
    { title: 'The Prodigy',   text: "The press is calling you a 'Natural.' Your flagship office has a fountain in the lobby and the city's elite are begging for an invite to the opening." },
    { title: 'The Competitor',text: "You've secured a solid mid-town office. It's respectable, professional, and within walking distance of the bank. You're on the radar." },
    { title: 'The Struggler', text: "Your 'office' is currently a cubicle in a shared space. You're paying for your own coffee and the Wi-Fi password changes every hour. It's a start." },
    { title: 'The Basement',  text: "You're operating out of your garage. The neighbors are complaining about the noise, and your 'desk' is a door balanced on two stacks of boxes." },
  ],
  // Round 2: The Dividend Gala
  [
    { title: 'The Host',      text: "You hosted a charity gala this weekend. You didn't care about the cause, but you looked fantastic in a tuxedo. Everyone who is anyone was there." },
    { title: 'The Guest',     text: "You were invited to the gala. You spent the night networking by the buffet, making sure the right people saw your business card." },
    { title: 'The Crasher',   text: "You weren't invited, so you 'bumped into' a Senator at the dry cleaners instead. You're hustle-heavy, but the doors aren't opening yet." },
    { title: 'The Outsider',  text: "You spent the weekend at a dive bar, sketching your next move on a damp napkin. The bartender thinks you're crazy; you know you're just warming up." },
  ],
  // Round 3: The Mid-Point Turbulence
  [
    { title: 'The Target',    text: "Your phone won't stop ringing. Everyone wants a piece of you, but you've started wearing sunglasses indoors to avoid the 'little people.'" },
    { title: 'The Challenger',text: "You've just hired a top-tier PR firm. You're closing the gap, and the magazines are starting to ask if the leader is losing their edge." },
    { title: 'The Survivor',  text: "You just survived a minor scandal. It was stressful, but it gave you a thick skin. You're officially 'battle-tested' now." },
    { title: 'The Scrappy',   text: "Your lead engineer just quit for a 'better offer.' You're doing three people's jobs at once, fueled entirely by spite and cheap espresso." },
  ],
  // Round 4: The Pivot or The Peak
  [
    { title: 'The Titan',     text: "You're considering buying a sports team just to see if you can make them win. The view from the penthouse is lonely, but the air is very expensive." },
    { title: 'The Specialist',text: "You've specialized your portfolio. You aren't the biggest yet, but you are the most efficient. You're the one everyone is actually afraid of." },
    { title: 'The Pivot',     text: "You've realized your old strategy wasn't working. You've fired half your staff and sold the fancy art. It's time for a lean, mean comeback." },
    { title: 'The Underdog',  text: "The news calls you a 'Short-seller's Dream.' They think you're going under. You're using that anonymity to move in the shadows while they aren't looking." },
  ],
  // Round 5: The Global Empire
  [
    { title: 'The Systemic',  text: "You are now a 'Systemic Entity.' If you fall, the whole market shakes. You spend your mornings deciding which small country's GDP you'd like to exceed." },
    { title: 'The Prince',    text: "You're the 'Crown Prince' of the market. You're waiting for the leader to make one tiny mistake so you can seize the throne." },
    { title: 'The Resilient', text: "You've climbed back from the brink. You aren't the wealthiest, but you are the most respected for your sheer refusal to go bankrupt." },
    { title: 'The Disruptor', text: "You've become the 'Scrappy Disruptor.' The leaders are looking over their shoulders because they see you in the rearview mirror. You have nothing left to lose." },
  ],
  // Round 6: The Exit Strategy
  [
    { title: 'The Legend',    text: "Your name is on the building and the university library. You didn't just play the game; you redefined it. You retire to your own private island." },
    { title: 'The Power',     text: "You are a titan in your own right. You might not own the world, but you certainly have a permanent seat at the table where it's run." },
    { title: 'The Executive', text: "You've built a solid, lasting legacy. You're the 'Old Money' now — stable, respected, and comfortably wealthy for generations." },
    { title: 'The Lesson',    text: "You lost the fortune, but you gained the 'Experience.' You're already writing a book about your 'Spectacular Failure' — it'll probably be a bestseller." },
  ],
];

function showRoundSummary(revenueMap) {
  const card  = document.getElementById('round-summary');
  const inner = document.getElementById('round-summary-inner');
  const rows  = document.getElementById('round-summary-rows');
  const title = document.getElementById('round-summary-title');
  if (!card || !inner || !rows) return;

  // Round that just completed (GS.round increments AFTER this call in endRound)
  const roundIdx = Math.min(GS.round - 1, 5); // 0-based index, capped at 5
  const roundNames = ['The Ribbon Cutting','The Dividend Gala','The Mid-Point Turbulence',
                      'The Pivot or the Peak','The Global Empire','The Exit Strategy'];
  title.textContent = `R${GS.round} · ${roundNames[roundIdx] || 'Income Summary'}`;

  // Sort by NW descending to determine rank
  const sorted = GS.players
    .map(p => ({ p, rev: revenueMap[p.id] || 0, nw: calcNW(p) }))
    .sort((a, b) => b.nw - a.nw);

  const narratives = ROUND_NARRATIVES[roundIdx] || [];
  const mySlotId   = mySlot();

  // Build rows — all players
  rows.innerHTML = sorted.map(({ p, rev, nw }, rankIdx) => `
    <div class="rsrow">
      <div class="rsrow-rank">${rankIdx + 1}</div>
      <div class="rsrow-name" style="color:${p.color}">${p.name}</div>
      <div class="rsrow-rev">+$${rev}</div>
      <div class="rsrow-nw">$${nw}</div>
      <div class="rsrow-cash" style="color:var(--tx-lo)">💵$${p.cash}</div>
    </div>`).join('');

  // Find the human player's rank for their personal narrative
  const humanRankIdx = sorted.findIndex(({ p }) => p.id === mySlotId);
  const narrative    = narratives[Math.min(humanRankIdx, narratives.length - 1)];
  const humanPlayer  = sorted[humanRankIdx]?.p;

  if (narrative && humanPlayer) {
    rows.innerHTML += `
      <div class="rsrow-narrative">
        <div class="rsrow-narrative-title" style="color:${humanPlayer.color}">${narrative.title}</div>
        <div class="rsrow-narrative-text">"${narrative.text}"</div>
      </div>`;
  }

  inner.classList.remove('visible');
  void inner.offsetWidth;
  inner.classList.add('visible');

  // Hold for 5s — CEO narrative reads in ~4s, then phase announce fires
  setTimeout(() => inner.classList.remove('visible'), 5000);
}



function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showRulebook() {
  SFX.ui();
  showModal('📖 Rulebook', `
    <div class="rb-s"><h3>Win Condition</h3>
      <p>Highest <span class="rg">Net Worth</span> after 6 rounds wins. NW = Cash + Company Values + Stocks.</p></div>
    <div class="rb-s"><h3>Actions (3 per turn)</h3><ul>
      <li><b>[1] Acquire</b> — Buy an unowned company at base cost.</li>
      <li><b>[2] Upgrade</b> — $20 + $10×upgrades. +$4 rev, +2 def. Every 2 upgrades = level up.</li>
      <li><b>[3] Takeover</b> — Pay cost upfront. Dice decides outcome.</li>
      <li><b>[S] Sell Co</b> — Sell a company for 65% of its value.</li>
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

/* ──────────────────── TUTORIAL SYSTEM ──────────────────── */
const TUT_STEPS = [
  {
    title: 'Welcome, Executive',
    body: `You run a corporation competing for market dominance over <b style="color:var(--gold)">6 rounds</b>.

The goal: build the highest <b style="color:var(--gold)">Net Worth</b>.

<span style="color:var(--tx-lo)">Net Worth = Cash + Company Values + Stock Portfolio</span>`,
    spotId: null, tab: null,
  },
  {
    title: 'The Company Map',
    body: `The grid shows all 16 companies across 4 regions.

Companies you <b style="color:var(--gold)">own</b> have a colored left border. Unowned companies have a plain border.

Tap any company card to inspect its stats.`,
    spotId: 'board', tab: null,
  },
  {
    title: 'Your 3 Actions',
    body: `Each round you get <b style="color:var(--gold)">3 actions</b>. Choose wisely:
• <b>Acquire</b> — buy unowned companies
• <b>Upgrade</b> — improve your companies (+revenue)
• <b>Takeover</b> — capture rivals\u2019 companies
• <b>Sell Co</b> — sell a company for quick cash
• <b>Stocks</b> — invest in market sectors`,
    spotId: 'action-dock', tab: null,
  },
  {
    title: 'Takeover — Cost Always Shown Upfront',
    body: `Before committing to a takeover you see the <b style="color:var(--gold)">cost in gold</b> \u2014 charged immediately.

A dice roll decides success.
<span style="color:var(--green-lt)">Win</span>: company is yours. <span style="color:var(--red-lt)">Fail</span>: lose 50% of cost, 50% returns next round.`,
    spotId: 'board', tab: null,
  },
  {
    title: 'Sell to Raise Capital',
    body: `Need cash for a big takeover? <b>Sell a company</b> you don't need for <b>65% of its value</b>.

Sell a weak company, then use the cash to take over a much stronger one.`,
    spotId: 'action-dock', tab: null,
  },
  {
    title: 'Economic Phases',
    body: `Each round a random phase is revealed:
<b style="color:var(--green-lt)">BOOM</b> \u2014 Revenue +50%, takeovers harder
<b>STABLE</b> \u2014 Normal conditions
<b style="color:var(--amber)">RECESSION</b> \u2014 Revenue \u221230%, easier takeovers
<b style="color:var(--red-lt)">CRASH</b> \u2014 Revenue \u221260%, high chaos`,
    spotId: 'phase-label', tab: null,
  },
  {
    title: 'Ready to Trade',
    body: `Keyboard shortcuts:
<span class="tut-kbd">1</span> Acquire &nbsp;<span class="tut-kbd">2</span> Upgrade &nbsp;<span class="tut-kbd">3</span> Takeover
<span class="tut-kbd">S</span> Sell &nbsp;<span class="tut-kbd">4</span> Card &nbsp;<span class="tut-kbd">P</span> Pass &nbsp;<span class="tut-kbd">Space</span> End Turn

Own <b>both companies</b> in a region for the region control bonus. Good luck.`,
    spotId: null, tab: null,
  },
];
let tutIdx = 0;

function switchTab(name) { /* no-op in v7 layout */ }

function startTutorial() {
  tutIdx = 0;
  document.getElementById('tut-overlay').classList.add('show');
  renderTutStep();
}

function renderTutStep() {
  const s = TUT_STEPS[tutIdx];
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
  const isMob = window.innerWidth <= 640;
  // Mobile dock is ~210px tall (actions-pill + dock buttons + end-turn + padding + safe-area)
  const dockH = isMob ? 210 : 0;

  if (s.spotId) {
    const el = document.getElementById(s.spotId);
    if (el) {
      const r  = el.getBoundingClientRect();
      spot.style.cssText =
        `left:${r.left - 5}px;top:${r.top - 5}px;width:${r.width + 10}px;height:${r.height + 10}px;`;
      const cW = isMob ? window.innerWidth - 24 : 295;
      const cH = 220;
      let cx = isMob ? 12 : r.left;
      let cy = r.bottom + 14;
      /* Clamp above dock on mobile, above viewport bottom on desktop */
      const maxBottom = window.innerHeight - dockH - 8;
      if (cy + cH > maxBottom) cy = r.top - cH - 14;
      cy = Math.max(isMob ? 56 : 8, cy); // stay below topbar
      card.style.cssText = `left:${cx}px;top:${cy}px;transform:none;${isMob?`width:${cW}px;`:''}`;
    }
  } else {
    spot.style.cssText = 'width:0;height:0;box-shadow:0 0 0 0;border:none;';
    if (isMob) {
      // Center vertically in the safe area between topbar and dock
      const safeTop = 56, safeBottom = window.innerHeight - dockH;
      const safeH = safeBottom - safeTop;
      const cardW = window.innerWidth - 24;
      const topPos = safeTop + Math.max(0, (safeH - 260) / 2);
      card.style.cssText = `left:12px;top:${topPos}px;transform:none;width:${cardW}px;`;
    } else {
      card.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)';
    }
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

/* ──────────────────── KEYBOARD SHORTCUTS ──────────────────── */
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
