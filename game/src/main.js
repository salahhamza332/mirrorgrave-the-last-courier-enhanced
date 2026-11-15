// Mirrorgrave: The Last Courier — game orchestration: states, input, loop, scoring.
import { buildWorld, resolveCollision, inFog, zoneAt } from './world.js';
import { updateGuards, guardSees, alertGuardsTo, nearestGuardDistance } from './guards.js';
import { render, worldToScreen, addShake, snapCamera } from './render.js';
import { sfx } from './audio.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const DAWN_SECONDS = 360; // six minutes to sunrise
const BEST_KEY = 'mirrorgrave.best.v2';
const LANTERN_MAX = 100;

const params = new URLSearchParams(location.search);
const HREF = location.href;
const AUTOSTART = params.get('autostart') === '1' || HREF.includes('autostart=1');
const DEMO = params.get('demo') || (HREF.match(/demo=(win|lose)/) || [])[1] || null; // screenshot aids, still real game code paths

const state = {
  mode: 'title', // title | playing | paused | victory | defeat
  world: null,
  player: { x: 0, y: 0, angle: 0, moving: false, sprinting: false },
  lanternOn: false,
  lanternEnergy: LANTERN_MAX,
  lanternSpent: false,
  bellsTolled: 0,
  secrets: 0,
  zone: '',
  tutT: 0,
  tutStep: 0,
  hidden: false,
  detection: 0,
  peakDetection: 0,
  timesSpotted: 0,
  relicsCollected: 0,
  timeLeft: DAWN_SECONDS,
  score: 0,
  best: Number(localStorage.getItem(BEST_KEY) || 0),
  endReason: null,
  toastT: 0,
  heartbeatT: 0,
  wasOverHalf: false,
  footstepT: 0,
  bellHintNear: false,
};

const keys = new Set();
let lastTime = 0;
let elapsed = 0;

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const hud = $('hud');
const screens = { title: $('screen-title'), pause: $('screen-pause'), end: $('screen-end') };

function showScreen(which) {
  screens.title.classList.toggle('hidden', which !== 'title');
  screens.pause.classList.toggle('hidden', which !== 'pause');
  screens.end.classList.toggle('hidden', which !== 'end');
  // HUD belongs to gameplay only: hide it behind every screen (title, pause, end)
  hud.classList.toggle('hidden', which !== null && which !== undefined);
}

function toast(msg, seconds = 2.6) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  state.toastT = seconds;
}

function resetRun() {
  state.world = buildWorld();
  state.player.x = state.world.spawn.x;
  state.player.y = state.world.spawn.y;
  snapCamera(state.player.x, state.player.y);
  state.player.angle = -Math.PI / 4;
  state.player.moving = false;
  state.lanternOn = false;
  state.lanternEnergy = LANTERN_MAX;
  state.lanternSpent = false;
  state.bellsTolled = 0;
  state.secrets = 0;
  state.zone = '';
  state.tutT = 0;
  state.tutStep = 0;
  state.hidden = false;
  state.detection = 0;
  state.peakDetection = 0;
  state.timesSpotted = 0;
  state.relicsCollected = 0;
  state.timeLeft = DAWN_SECONDS;
  state.score = 0;
  state.endReason = null;
  state.wasOverHalf = false;
  state.heartbeatT = 0;
  updateRelicSlots();
  updateHUD(0);
}

function startGame() {
  resetRun();
  state.mode = 'playing';
  showScreen(null);
  toast('RECOVER THE THREE RELICS', 3);
}

function endRun(kind, reason) {
  state.mode = kind; // 'victory' | 'defeat'
  state.endReason = reason || null;
  const isWin = kind === 'victory';
  const timeBonus = isWin ? Math.floor(state.timeLeft) * 6 : 0;
  const stealthBonus = isWin ? Math.round((1 - state.peakDetection) * 600) : 0;
  const ghost = isWin && state.peakDetection < 0.35;
  const total = state.score + timeBonus + stealthBonus + (ghost ? 250 : 0);
  if (isWin) state.score = total;

  const newBest = state.score > state.best;
  if (newBest) { state.best = state.score; localStorage.setItem(BEST_KEY, String(state.best)); }

  $('end-kicker').textContent = isWin ? 'THE BARGE PULLS AWAY' : (reason === 'dawn' ? 'DAWN BREAKS' : 'THE WATCH CLOSES IN');
  const title = $('end-title');
  title.textContent = isWin ? 'THE COURIER PREVAILS' : 'THE GRAVE KEEPS YOU';
  title.className = isWin ? 'victory' : 'defeat';
  $('end-story').textContent = isWin
    ? 'The barge slips the Mirrorgrave as the first pale light crests the mist. Three relics, one courier, no witnesses. The graves can wait for another thief.'
    : reason === 'dawn'
      ? 'The mist burns off and the cemetery wakes. Caught in the open at sunrise, the courier is folded into the Mirrorgrave like every lost soul before.'
      : 'A lantern flares. A bell tolls. Hands close around your satchel — the Watch does not bargain with couriers. The relics sink back into the dark.';

  const stats = [
    ['RELICS', `${state.relicsCollected} / 3`],
    ['TIME LEFT', fmtTime(state.timeLeft)],
    ['PEAK HEAT', `${Math.round(state.peakDetection * 100)}%`],
    ['SECRETS', `${state.secrets} / 6`],
    ['SCORE', String(state.score)],
  ];
  if (isWin) stats.push(['TIME BONUS', `+${timeBonus}`], ['GHOST BONUS', `+${stealthBonus + (ghost ? 250 : 0)}`]);
  $('end-stats').innerHTML = stats.map(([k, v]) => `<div class="end-stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  $('end-best').textContent = newBest ? `NEW BEST — ${state.best}` : `BEST — ${state.best}`;
  showScreen('end');
  if (isWin) sfx.victory(); else sfx.defeat();
}

function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function updateRelicSlots() {
  document.querySelectorAll('.relic-slot').forEach((el, i) => el.classList.toggle('filled', i < state.relicsCollected));
}

function updateHUD(dt) {
  $('dawn-time').textContent = fmtTime(state.timeLeft);
  $('dawn-time').classList.toggle('urgent', state.timeLeft < 60);
  $('dawn-fill').style.width = `${(state.timeLeft / DAWN_SECONDS) * 100}%`;
  $('score-value').textContent = String(state.score);
  $('best-value').textContent = `BEST ${state.best}`;
  const lChip = $('lantern-state');
  lChip.textContent = state.lanternOn ? 'LANTERN LIT' : (state.lanternSpent ? 'LANTERN SPENT' : 'LANTERN DARK');
  lChip.classList.toggle('on', state.lanternOn);
  lChip.classList.toggle('spent', state.lanternSpent);
  $('lantern-energy-fill').style.width = `${(state.lanternEnergy / LANTERN_MAX) * 100}%`;
  $('lantern-energy-fill').classList.toggle('low', state.lanternEnergy < 28);
  $('secret-count').textContent = `SECRETS ${state.secrets}/6`;
  const hChip = $('hide-state');
  hChip.textContent = state.concealed ? 'CONCEALED' : state.hidden ? 'HIDDEN' : 'IN THE OPEN';
  hChip.classList.toggle('hidden-chip', state.hidden);
  // Detection eye
  const eye = $('detection-eye');
  const show = state.detection > 0.04 && state.mode === 'playing';
  eye.classList.toggle('hidden', !show);
  $('detection-fill-bar').style.width = `${Math.min(1, state.detection) * 100}%`;
  const iris = $('eye-iris');
  iris.setAttribute('fill', state.detection > 0.66 ? '#e86a5a' : state.detection > 0.33 ? '#d8b25a' : '#3a2f55');
  // Context hints
  $('bell-hint').classList.toggle('hidden', !state.bellHintNear);
  $('relic-hint').classList.toggle('hidden', !(state.nearRelic && !state.nearBell && !state.nearBarge));
  $('barge-hint').classList.toggle('hidden', !state.nearBarge);
  // Toast fade
  if (state.toastT > 0) {
    state.toastT -= dt;
    if (state.toastT <= 0) $('toast').classList.add('hidden');
  }
}

// ---------- Input ----------
const GAME_KEYS = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyR','ShiftLeft','ShiftRight','Escape'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  sfx.unlock();
  if (e.repeat) return;
  keys.add(e.code);

  if (e.code === 'KeyR') { startGame(); return; }
  if (e.code === 'Escape') {
    if (state.mode === 'playing') { state.mode = 'paused'; showScreen('pause'); }
    else if (state.mode === 'paused') { state.mode = 'playing'; showScreen(null); }
    return;
  }
  if (state.mode !== 'playing') return;

  if (e.code === 'Space') {
    state.hidden = !state.hidden;
    sfx.hide();
    if (state.hidden) toast('YOU MELT INTO THE MIST', 1.4);
  }
  if (e.code === 'KeyE') handleUse();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { if (state.mode === 'playing') { state.mode = 'paused'; showScreen('pause'); } keys.clear(); });

$('btn-start').addEventListener('click', () => { sfx.unlock(); sfx.uiClick(); startGame(); });
$('btn-resume').addEventListener('click', () => { sfx.uiClick(); state.mode = 'playing'; showScreen(null); });
$('btn-restart-pause').addEventListener('click', () => { sfx.uiClick(); startGame(); });
$('btn-again').addEventListener('click', () => { sfx.uiClick(); startGame(); });
$('title-best').textContent = state.best > 0 ? `BEST DELIVERY — ${state.best}` : '';

function handleUse() {
  const world = state.world, p = state.player;
  // Priority: bell > relic > barge > lantern toggle
  for (const b of world.bells) {
    if (Math.hypot(p.x - b.x, p.y - b.y) < 1.7) {
      if (b.cooldown <= 0) {
        b.cooldown = 12; b.ringT = elapsed;
        state.bellsTolled++;
        sfx.bell(); addShake(7);
        alertGuardsTo(world, b.x, b.y, 15);
        toast('THE GRAVE BELL TOLLS', 2);
      } else {
        toast(`THE BELL RESTS — ${Math.ceil(b.cooldown)}s`, 1.6);
      }
      return;
    }
  }
  for (const r of world.relics) {
    if (r.taken || Math.hypot(p.x - r.x, p.y - r.y) >= 1.5) continue;
    if (r.puzzle === 'reveal' && !r.revealed) { toast('NOTHING GLIMMERS HERE… NOT IN THE DARK', 2.4); return; }
    if (r.puzzle === 'ward' && state.bellsTolled < 2) { toast(`THE PALE WARD HOLDS — ${2 - state.bellsTolled} MORE BELL${state.bellsTolled === 1 ? '' : 'S'} MUST TOLL`, 2.8); return; }
    r.taken = true;
    state.relicsCollected++;
    state.score += 400;
    sfx.relic(); addShake(3);
    updateRelicSlots();
    if (state.relicsCollected >= 3) toast('THE BARGE WILL TAKE YOU — SOUTHWEST DOCK', 3.4);
    else toast(`${r.name.toUpperCase()} SECURED — ${state.relicsCollected}/3`, 2.6);
    return;
  }
  // Epitaphs — lore and a little silver
  for (const ep of world.epitaphs) {
    if (!ep.read && Math.hypot(p.x - ep.x, p.y - ep.y) < 1.6) {
      ep.read = true;
      state.secrets++;
      state.score += 75;
      sfx.uiClick();
      toast(`“${ep.text}”`, 4.2);
      return;
    }
  }
  // Echoes — whispered spirits, lantern-seen
  for (const ec of world.echoes) {
    if (!ec.taken && state.lanternOn && Math.hypot(p.x - ec.x, p.y - ec.y) < 1.5) {
      ec.taken = true;
      state.secrets++;
      state.score += 150;
      sfx.relic();
      toast('AN ECHO SETTLES — +150', 2.2);
      return;
    }
  }
  if (state.relicsCollected >= 3 && Math.hypot(p.x - world.barge.x, p.y - world.barge.y) < 3.4) {
    sfx.barge();
    endRun('victory');
    return;
  }
  if (!state.lanternOn && state.lanternSpent) { toast('THE LANTERN IS SPENT — LET IT REKINDLE', 2.0); return; }
  state.lanternOn = !state.lanternOn;
  sfx.lantern();
}

// ---------- Update ----------
const TUT = [
  [0.6,  'RECOVER THE THREE RELICS — THEN REACH THE BARGE'],
  [4.5,  'HOLD SHIFT TO SPRINT — BUT THE WATCH HEARS IT'],
  [9.0,  'E — LANTERN. LIGHT REVEALS THE HIDDEN… AND BETRAYS YOU'],
  [14.0, 'SPACE — HIDE. STONE AND MIST DEEPEN THE VEIL'],
];
function update(dt) {
  const world = state.world, p = state.player;
  world.timeSec = elapsed;

  // Onboarding beats
  if (state.tutStep < TUT.length) {
    state.tutT += dt;
    if (state.tutT >= TUT[state.tutStep][0]) { toast(TUT[state.tutStep][1], 3.2); state.tutStep++; }
  }

  // Lantern energy: drains lit, rekindles in the dark
  if (state.lanternOn) {
    state.lanternEnergy -= dt * 9;
    if (state.lanternEnergy <= 0) {
      state.lanternEnergy = 0;
      state.lanternOn = false;
      state.lanternSpent = true;
      sfx.lantern();
      toast('THE LANTERN SPUTTERS OUT — LET IT REKINDLE', 2.6);
    }
  } else {
    state.lanternEnergy = Math.min(LANTERN_MAX, state.lanternEnergy + dt * 15);
    if (state.lanternSpent && state.lanternEnergy >= 30) {
      state.lanternSpent = false;
      toast('THE LANTERN BREATHES AGAIN', 1.6);
    }
  }

  // Lantern reveals the Mirror Sigil while lit nearby
  const sigil = world.relics.find(r => r.puzzle === 'reveal');
  if (sigil && !sigil.taken && state.lanternOn && Math.hypot(p.x - sigil.x, p.y - sigil.y) < 5.5) sigil.revealed = true;

  // Zone label
  const z = zoneAt(p.x, p.y);
  if (z !== state.zone) { state.zone = z; const el = $('zone-label'); el.textContent = z; el.classList.remove('zone-fade'); void el.offsetWidth; el.classList.add('zone-fade'); }

  // Movement input (screen-aligned: W = up-screen = decreasing x+y)
  let mx = 0, my = 0;
  const up = keys.has('KeyW') || keys.has('ArrowUp');
  const down = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  // Map screen directions to iso world axes
  if (up) { mx -= 1; my -= 1; }
  if (down) { mx += 1; my += 1; }
  if (left) { mx -= 1; my += 1; }
  if (right) { mx += 1; my -= 1; }
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  p.sprinting = p.moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !state.hidden;
  if (p.moving) {
    mx /= len; my /= len;
    let speed = state.hidden ? 1.9 : p.sprinting ? 5.3 : 3.35;
    // Puddles slow you
    if (world.puddles.some(pl => Math.hypot(p.x - pl.x, p.y - pl.y) < pl.rx + 0.15)) {
      speed *= 0.72;
      state.inPuddle = true;
    } else state.inPuddle = false;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    // Footsteps
    state.footstepT -= dt * (p.sprinting ? 1.7 : 1);
    if (state.footstepT <= 0) {
      state.footstepT = 0.34;
      if (state.inPuddle) sfx.splash(); else sfx.footstep(p.sprinting);
    }
  }

  // Collision
  const solved = resolveCollision(world, p.x, p.y, 0.32);
  p.x = solved.x; p.y = solved.y;

  // Wisps drift
  for (const w of world.wisps) {
    w.x += Math.cos(elapsed * w.speed + w.phase) * dt * 0.35;
    w.y += Math.sin(elapsed * w.speed * 0.8 + w.phase) * dt * 0.35;
  }

  // Bell cooldowns
  for (const b of world.bells) if (b.cooldown > 0) b.cooldown -= dt;

  // Guards & detection
  // Concealment: hiding beside stone (graves, mausoleums, trunks) deepens the veil
  const concealed = state.hidden && (
    world.graves.some(g => Math.hypot(p.x - g.x, p.y - g.y) < 1.5) ||
    world.obstacles.some(o => p.x > o.x - 1.2 && p.x < o.x + o.w + 1.2 && p.y > o.y - 1.2 && p.y < o.y + o.h + 1.2) ||
    world.trees.some(t => Math.hypot(p.x - t.x, p.y - t.y) < 1.4)
  );
  state.concealed = concealed;
  updateGuards(world, p, dt, null);
  let rate = 0;
  for (const g of world.guards) rate += guardSees(world, g, p, state.lanternOn, state.hidden, p.sprinting, concealed);
  if (rate > 0.02) {
    state.detection += rate * dt * 0.55;
    if (!state.wasOverHalf && state.detection >= 0.5) { state.timesSpotted++; state.wasOverHalf = true; sfx.alert(); }
    else if (state.detection > 0.16 && Math.random() < dt * 1.4) sfx.suspicious();
  } else {
    state.detection -= 0.24 * dt;
    if (state.detection < 0.5) state.wasOverHalf = false;
  }
  state.detection = Math.max(0, Math.min(1.05, state.detection));
  state.peakDetection = Math.max(state.peakDetection, Math.min(1, state.detection));

  if (state.detection >= 1) { endRun('defeat', 'caught'); return; }

  // Heartbeat under pressure
  if (state.detection > 0.55) {
    state.heartbeatT -= dt;
    if (state.heartbeatT <= 0) { state.heartbeatT = 0.9 - state.detection * 0.35; sfx.heartbeat(); }
  }

  // Dawn timer
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) { state.timeLeft = 0; endRun('defeat', 'dawn'); return; }

  // Context proximity flags
  state.nearBell = world.bells.some(b => Math.hypot(p.x - b.x, p.y - b.y) < 1.7);
  state.bellHintNear = state.nearBell;
  state.nearRelic = world.relics.some(r => !r.taken && Math.hypot(p.x - r.x, p.y - r.y) < 1.5);
  state.nearBarge = state.relicsCollected >= 3 && Math.hypot(p.x - world.barge.x, p.y - world.barge.y) < 3.4;

  updateHUD(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  let dt = Math.min(0.05, t - (lastTime || t));
  lastTime = t;
  elapsed += dt;

  if (state.mode === 'playing') update(dt);
  else updateHUD(dt);

  // Render world behind screens (title gets a slow drifting demo camera)
  if (state.world) {
    render(ctx, state.world, state, elapsed);
  } else {
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ---------- Boot ----------
resetRun();
state.mode = 'title';
showScreen('title');
$('title-best').textContent = state.best > 0 ? `BEST DELIVERY — ${state.best}` : '';

// Dev/screenshot aids — still real game logic, no fabricated renders
if (params.get('lantern') === '1' || HREF.includes('lantern=1')) window.__forceLantern = true;
if (AUTOSTART || DEMO) {
  startGame();
  if (window.__forceLantern) state.lanternOn = true;
  if (DEMO === 'win') {
    state.relicsCollected = 3; state.score = 1200; updateRelicSlots();
    state.world.relics.forEach(r => r.taken = true);
    state.peakDetection = 0.22; state.timeLeft = 214;
    endRun('victory');
  } else if (DEMO === 'play') {
    state.lanternOn = true;
    state.world.relics[0].taken = true;
    state.relicsCollected = 1; state.score = 400; updateRelicSlots();
    state.player.x = 31.5; state.player.y = 13.2; snapCamera(state.player.x, state.player.y);
    state.timeLeft = 214; state.detection = 0.31;
    toast('MIRROR SIGIL — 2 RELICS REMAIN', 3);
  } else if (DEMO === 'lose') {
    state.peakDetection = 0.95;
    endRun('defeat', 'caught');
  }
}

// Exposed for automated QA harnesses; not used by the game itself
window.__mirrorgrave = state;
requestAnimationFrame(frame);
