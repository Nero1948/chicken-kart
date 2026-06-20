// Game entry point: sets up the 3D scene, wires up the menus, and runs the
// main loop that drives everything else.

import * as THREE from 'three';
import { buildTrack, track, inBarn, TRACKS } from './track.js';
import { Kart, CHARACTERS, UNLOCKABLES, AI_ROSTER, statBars, resolveKartCollisions, resolveJumpStomps } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemManager } from './items.js';
import { Crossers } from './chickens.js';
import { Cow } from './cow.js';
import { Moa } from './moa.js';
import { Race } from './race.js';
import * as hud from './hud.js';
import { audio } from './audio.js';
import * as records from './records.js';
import * as unlocks from './unlocks.js';
import * as daily from './daily.js';
import { GhostRecorder, Ghost } from './ghost.js';
import { input, initInput, initTouch, updateInput, consumeFire } from './player.js';

const ZERO_INPUT = { throttle: 0, steer: 0, brake: 0 };

// Difficulty presets. `skills` are the AI base speed multipliers (one per
// rival, fastest first). `catchUp`/`easeOff` control rubber banding: how much
// a trailing AI speeds up and a leading AI backs off. `cap` is the highest
// speed multiplier an AI may ever reach, so Hard rivals can out-drag the player.
const DIFFICULTIES = {
  easy:    { skills: [0.84, 0.81, 0.78, 0.75, 0.72], catchUp: 0.08, easeOff: 0.22, cap: 0.96 },
  medium:  { skills: [0.99, 0.96, 0.93, 0.90, 0.87], catchUp: 0.16, easeOff: 0.10, cap: 1.12 },
  hard:    { skills: [1.06, 1.03, 1.00, 0.97, 0.94], catchUp: 0.20, easeOff: 0.06, cap: 1.24 },
  // Extreme: rivals are flat-out fast, claw back hard when behind and barely
  // ease off when ahead. Winning every race here is a real test.
  extreme: { skills: [1.16, 1.12, 1.08, 1.04, 1.00], catchUp: 0.24, easeOff: 0.03, cap: 1.38 },
};
let difficulty = 'medium';

// Grand Prix: a series of races over all four tracks, scored by finishing
// position, always ending on the hardest track (Mt Maunganui Beach).
const GP_RACE_COUNT = 4;
const GP_POINTS = [9, 6, 4, 3, 2, 1]; // points for 1st..6th each race
let mode = 'single'; // 'single' | 'daily' | 'gp' | 'elim'
let gp = null;        // { raceIndex, tracks, field, points }

// Daily Time Trial: a solo run on the day's track, racing the clock (and
// optionally a ghost of your best run). `isDaily` marks the active race so the
// loop records the ghost and the results show time-trial info.
let isDaily = false;
let ghost = null;       // translucent playback of a previous best run
let ghostRec = null;    // records this run so it can become the next ghost
let raceTime = 0;       // seconds since GO, the shared clock for ghost timing
let ghostOn = (() => {
  try { return localStorage.getItem('chickenkart.ghost') !== 'off'; } catch { return true; }
})();

// Elimination tournament: a six-racer knockout. Each race the last-placed
// racer is dropped until one champion remains. Survive to the end and you win
// a trophy and unlock the motorbike. `field` shrinks every round.
let elim = null;      // { raceIndex, tracks, field, eliminated, diff }

// Emoji shown on each racer's select card (declared up here so it is ready
// before init() builds the cards on first load).
const CARD_HATS = { laya: '👑', heyhey: '🕶️', sir: '🎩', disco: '🪩', captain: '🦸', lava: '🌋', summit: '❄️', moto: '🏍️' };

let renderer, scene, camera, hemi, sun;
let darkness = 0;     // 0 = daylight, 1 = inside the dark barn
let cluckTimer = 0;
const currentSky = new THREE.Color(0x87ceeb); // follows the active track's theme
const BARN_DARK = new THREE.Color(0x0a0b14);
let selectedTrack = 'farm';
let karts = [];
let drivers = [];
let player = null;
let race = null;
let items = null;
let crossers = null;
let cow = null;
let moa = null;
let state = 'menu'; // menu | select | racing | results
let chosenKey = 'chickpea';
let resultTimer = 0;
let fanfarePlayed = false;
let orbitAngle = 0;

// Juice: camera shake + overtake detection
let shakeT = 0;
let shakeMag = 0;
let prevBoosting = false;
let prevSpin = false;
let lastPlayerRank = 6;

// Touch device? Used to show on-screen controls and lighten rendering load.
const isTouch = matchMedia('(pointer: coarse)').matches
  || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const clock = new THREE.Clock();
const tmpF = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();

const ui = {
  menu: document.getElementById('menu'),
  select: document.getElementById('select'),
  results: document.getElementById('results'),
  cards: document.getElementById('cards'),
  placings: document.getElementById('placings'),
  lapResult: document.getElementById('lapResult'),
  lapBoardList: document.getElementById('lapBoardList'),
  gpHeading: document.getElementById('gpHeading'),
  gpStandings: document.getElementById('gpStandings'),
  unlockMsg: document.getElementById('unlockMsg'),
  trophy: document.getElementById('trophy'),
  confetti: document.getElementById('confetti'),
  speedLines: document.getElementById('speedLines'),
  playBtn: document.getElementById('playBtn'),
  nextRace: document.getElementById('nextRace'),
  raceAgain: document.getElementById('raceAgain'),
  changeChicken: document.getElementById('changeChicken'),
  mainMenu: document.getElementById('mainMenu'),
  muteBtn: document.getElementById('muteBtn'),
  modeBtns: document.querySelectorAll('#modeSel .mode-btn'),
  diffBtns: document.querySelectorAll('#difficulty .diff-btn'),
  trackBtns: document.querySelectorAll('#trackSel .track-btn'),
  trackSel: document.getElementById('trackSel'),
  difficulty: document.getElementById('difficulty'),
  dailyInfo: document.getElementById('dailyInfo'),
  dailyTrack: document.getElementById('dailyTrack'),
  dailyBest: document.getElementById('dailyBest'),
  dailyStreak: document.getElementById('dailyStreak'),
  ghostToggle: document.getElementById('ghostToggle'),
  touch: document.getElementById('touch'),
  hint: document.querySelector('#menu .controls-hint'),
};

// Show or hide the on-screen touch controls (a no-op on non-touch devices,
// where CSS keeps them hidden anyway).
function setTouchControls(on) {
  if (ui.touch) ui.touch.classList.toggle('hidden', !on);
}

init();

function init() {
  // Cap the resolution lower on phones so the framerate stays smooth
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: !isTouch });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (isTouch) {
    document.body.classList.add('touch');
    if (ui.hint) ui.hint.innerHTML = '<span><b>Tap & hold</b> the on-screen buttons to drive</span>';
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 200, 460);

  // Far plane is generous so Tongariro Park's distant volcanoes stay in view.
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

  hemi = new THREE.HemisphereLight(0xffffff, 0x88aa55, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3d0, 1.6);
  sun.position.set(80, 130, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 400;
  scene.add(sun);

  buildTrack(scene, selectedTrack);
  applyTheme();
  hud.init();
  initInput();
  initTouch();
  renderSelectCards();
  wireUi();
  renderLapBoard();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

function wireUi() {
  // Mode: single race vs a three-race Grand Prix. The track picker only
  // applies to single races (a cup chooses its own tracks).
  ui.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      ui.modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      applyModeUI();
      btn.blur();
    });
  });

  // Ghost on/off: remembered between visits so a preference sticks.
  updateGhostToggle();
  ui.ghostToggle.addEventListener('click', () => {
    ghostOn = !ghostOn;
    try { localStorage.setItem('chickenkart.ghost', ghostOn ? 'on' : 'off'); } catch { /* ignore */ }
    updateGhostToggle();
    ui.ghostToggle.blur();
  });

  ui.diffBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.diff;
      ui.diffBtns.forEach((b) => b.classList.toggle('active', b === btn));
      btn.blur();
    });
  });

  // Picking a track rebuilds the scene straight away, so the menu's scenic
  // orbit shows the track you are about to race.
  ui.trackBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTrack = btn.dataset.track;
      ui.trackBtns.forEach((b) => b.classList.toggle('active', b === btn));
      selectTrack(selectedTrack);
      btn.blur();
    });
  });

  ui.playBtn.addEventListener('click', () => {
    audio.init();
    ui.playBtn.blur();
    renderSelectCards(); // reflect any newly unlocked racers
    ui.menu.classList.add('hidden');
    ui.select.classList.remove('hidden');
    state = 'select';
  });

  // Next race in a series (Grand Prix or Elimination): keep the surviving
  // field and move to the next track.
  ui.nextRace.addEventListener('click', () => {
    ui.nextRace.blur();
    if (mode === 'gp') gp.raceIndex++;
    else if (mode === 'elim') elim.raceIndex++;
    cleanupRace();
    ui.results.classList.add('hidden');
    startRace(chosenKey);
  });

  // In single mode this re-races; after a cup it starts a fresh Grand Prix.
  ui.raceAgain.addEventListener('click', () => {
    ui.raceAgain.blur();
    cleanupRace();
    ui.results.classList.add('hidden');
    startRace(chosenKey);
  });

  ui.changeChicken.addEventListener('click', () => {
    ui.changeChicken.blur();
    cleanupRace();
    gp = null;
    elim = null;
    renderSelectCards();
    ui.results.classList.add('hidden');
    hud.hide();
    setTouchControls(false);
    ui.select.classList.remove('hidden');
    state = 'select';
    audio.engineOff();
  });

  // Back to the home menu, where the mode, track and difficulty can be chosen.
  ui.mainMenu.addEventListener('click', () => {
    ui.mainMenu.blur();
    cleanupRace();
    gp = null;
    elim = null;
    ui.results.classList.add('hidden');
    hud.hide();
    setTouchControls(false);
    ui.menu.classList.remove('hidden');
    if (mode === 'daily') refreshDailyInfo(); // show the streak/best just earned
    state = 'menu';
    audio.engineOff();
  });

  ui.muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  ui.muteBtn.addEventListener('click', () => {
    audio.init();
    ui.muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
    ui.muteBtn.blur();
  });
}

// Show the right menu sections for the chosen mode. The track picker is only
// for single races; difficulty is hidden for the solo Daily run; and the Daily
// info panel (with the ghost toggle) appears only in Daily mode.
function applyModeUI() {
  ui.trackSel.classList.toggle('hidden', mode !== 'single');
  ui.difficulty.classList.toggle('hidden', mode === 'daily');
  ui.dailyInfo.classList.toggle('hidden', mode !== 'daily');
  if (mode === 'daily') {
    selectTrack(daily.todayTrackId()); // show today's track in the menu orbit
    refreshDailyInfo();
  }
}

// Fill the Daily panel with today's track, your best run and your streak.
function refreshDailyInfo() {
  const tid = daily.todayTrackId();
  ui.dailyTrack.textContent = daily.trackName(tid);
  const best = daily.getTrackBest(tid);
  ui.dailyBest.textContent = best ? records.formatTime(best.time) : '—';
  const ds = daily.getDaily();
  ui.dailyStreak.textContent = `${ds.streak} day${ds.streak === 1 ? '' : 's'}`;
}

function updateGhostToggle() {
  ui.ghostToggle.textContent = ghostOn ? '👻 Race your ghost: On' : '👻 Race your ghost: Off';
  ui.ghostToggle.setAttribute('aria-pressed', String(ghostOn));
  ui.ghostToggle.classList.toggle('off', !ghostOn);
}

// Find a racer definition by key across the base roster and the unlockables.
function defFor(key) {
  return CHARACTERS[key] || UNLOCKABLES[key] || AI_ROSTER.find((d) => d.key === key);
}

// Rebuild the world for a given track (only if it is not already active) and
// refresh anything that depends on the track layout.
function selectTrack(id) {
  if (track.id === id) return;
  buildTrack(scene, id);
  applyTheme();
  hud.refreshTrack();
}

// Push the active track's colour theme to the sky and fog.
function applyTheme() {
  const th = track.theme || {};
  currentSky.set(th.sky ?? 0x87ceeb);
  scene.background.copy(currentSky);
  if (scene.fog) {
    scene.fog.color.copy(currentSky);
    if (th.fog) { scene.fog.near = th.fog[0]; scene.fog.far = th.fog[1]; }
  }
}

// Build the character cards. Base chickens are always available; the fancy
// unlockables show as locked cards until they have been earned.
function renderSelectCards() {
  ui.cards.innerHTML = '';
  const all = [...Object.values(CHARACTERS), ...Object.values(UNLOCKABLES)];
  for (const def of all) {
    const locked = def.locked && !unlocks.isUnlocked(def.key);
    const card = document.createElement('div');
    card.className = 'card' + (locked ? ' locked' : '');

    if (locked) {
      const hint = def.tier === 'extreme'
        ? 'Win all four races of a Grand Prix on Extreme to unlock'
        : def.tier === 'tournament'
        ? 'Win an Elimination tournament to unlock'
        : 'Win a Grand Prix to unlock this racer';
      card.innerHTML = `
        <div class="card-face locked-face">🔒</div>
        <div class="card-name">???</div>
        <div class="card-tag">${hint}</div>`;
    } else {
      const kartHex = '#' + def.kart.toString(16).padStart(6, '0');
      const statRows = Object.entries(statBars(def)).map(([label, v]) => `
        <div class="stat">
          <span class="stat-label">${label}</span>
          <span class="stat-bar"><span class="stat-fill" style="width:${Math.round(v * 100)}%"></span></span>
          <span class="stat-num">${Math.round(v * 10)}</span>
        </div>`).join('');
      card.innerHTML = `
        <div class="card-face" style="background:${kartHex}33; border: 4px solid ${kartHex}">
          ${CARD_HATS[def.key] ? `<span class="hat">${CARD_HATS[def.key]}</span>` : ''}
          🐔
        </div>
        <div class="card-name">${def.name}</div>
        <div class="card-tag">${def.tagline}</div>
        ${statRows}`;
      card.addEventListener('click', () => {
        audio.init();
        chosenKey = def.key;
        ui.select.classList.add('hidden');
        startRace(def.key);
      });
    }
    ui.cards.appendChild(card);
  }
}

// The six-racer field for a race: the player plus five rivals (the heroes they
// did not pick, topped up with extras from the roster).
function buildSingleField(key) {
  const playerDef = CHARACTERS[key] || UNLOCKABLES[key];
  const heroes = Object.values(CHARACTERS).filter((c) => c.key !== key);
  const pool = shuffle([...heroes, ...AI_ROSTER]);
  return [playerDef, ...pool.slice(0, 5)];
}

// Set up a fresh Grand Prix: one race on each of the four tracks, the first
// three shuffled and the hardest (Mt Maunganui Beach) always last as a grand
// finale. One fixed field, points carried across all races. `wonAll` stays true
// only while the player has won every race so far (the Extreme unlock test).
function startGrandPrix(key) {
  gp = {
    raceIndex: 0,
    tracks: [...shuffle(['farm', 'city', 'park']), 'beach'],
    field: buildSingleField(key),
    points: {},
    wonAll: true,
    diff: difficulty, // the difficulty the cup was started on
  };
  for (const d of gp.field) gp.points[d.key] = 0;
}

// Set up a fresh Elimination tournament: a six-racer knockout over five rounds
// (6 -> 5 -> 4 -> 3 -> 2 -> 1). Each round runs on its own track, the first
// four shuffled and Mt Maunganui Beach saved as the grand-final showdown.
function startElimination(key) {
  elim = {
    raceIndex: 0,
    tracks: [...shuffle(['farm', 'city', 'park', 'beach']), 'beach'],
    field: buildSingleField(key), // six defs, player first; shrinks each round
    eliminated: [],               // defs in the order they were knocked out
    diff: difficulty,
  };
}

function startRace(key) {
  // Work out which track to race and who is on the grid.
  let trackId, field;
  isDaily = mode === 'daily';
  if (mode === 'gp') {
    if (!gp) startGrandPrix(key);
    trackId = gp.tracks[gp.raceIndex];
    field = gp.field;
  } else if (mode === 'elim') {
    if (!elim) startElimination(key);
    trackId = elim.tracks[elim.raceIndex];
    field = elim.field;
  } else if (isDaily) {
    // Solo time trial against the clock on the day's track: no rivals.
    trackId = daily.todayTrackId();
    field = [defFor(key)];
  } else {
    trackId = selectedTrack;
    field = buildSingleField(key);
  }

  // Build the right track if it is not already the active one.
  if (track.id !== trackId) {
    buildTrack(scene, trackId);
    applyTheme();
    hud.refreshTrack();
  }
  selectedTrack = trackId;

  const diff = DIFFICULTIES[difficulty];
  const skills = shuffle([...diff.skills]);

  player = new Kart(scene, field[0], true);
  karts = [player];
  drivers = [];
  field.slice(1).forEach((def, i) => {
    const kart = new Kart(scene, def, false);
    karts.push(kart);
    drivers.push(new AIDriver(kart, skills[i % skills.length], diff));
  });

  // Grid slots: front row first, AI rivals ahead and the player slotted in
  // second to last. Works for any field size (Elimination shrinks the grid).
  const order = karts.slice(1); // the AI rivals
  order.splice(Math.max(0, order.length - 1), 0, player);
  order.forEach((kart, i) => kart.placeAt(track.startGrid[i]));
  const startRank = order.indexOf(player) + 1;

  race = new Race(karts, player);
  items = new ItemManager(scene, race);
  crossers = new Crossers(scene);
  cow = new Cow(scene);
  moa = new Moa(scene);

  resultTimer = 0;
  fanfarePlayed = false;
  lastPlayerRank = startRank; // where the player lines up on the grid
  state = 'racing';
  ui.results.classList.add('hidden');
  if (ui.confetti) ui.confetti.innerHTML = '';
  hud.show();
  setTouchControls(true);

  // Snap the camera straight behind the player so it does not swing in
  player.forward(tmpF);
  camera.position.set(player.pos.x - tmpF.x * 9, player.pos.y + 4.6, player.pos.z - tmpF.z * 9);
  camera.lookAt(player.pos.x, player.pos.y + 1.4, player.pos.z);

  // Daily run: start recording this attempt, and (if enabled) spawn a ghost of
  // the best previous run on this track to race against.
  raceTime = 0;
  ghostRec = isDaily ? new GhostRecorder() : null;
  if (isDaily && ghostOn) {
    const best = daily.getTrackBest(trackId);
    if (best && best.samples && best.samples.length) {
      ghost = new Ghost(scene, defFor(best.key) || field[0], best.samples);
    }
  }
}

function cleanupRace() {
  for (const kart of karts) kart.dispose();
  if (ghost) ghost.dispose();
  ghost = null;
  ghostRec = null;
  raceTime = 0;
  if (items) items.dispose();
  if (crossers) crossers.dispose();
  if (cow) cow.dispose();
  if (moa) moa.dispose();
  karts = [];
  drivers = [];
  player = null;
  race = null;
  items = null;
  crossers = null;
  cow = null;
  moa = null;
  hud.hideCountdown();
  setTouchControls(false);
  if (ui.confetti) ui.confetti.innerHTML = '';
  if (ui.trophy) ui.trophy.classList.add('hidden');
  if (ui.speedLines) ui.speedLines.classList.remove('on');
}

// Fill the main-menu board with each track's stored fastest lap.
function renderLapBoard() {
  ui.lapBoardList.innerHTML = '';
  for (const def of Object.values(TRACKS)) {
    const best = records.getBestLap(def.id);
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="lb-name">${def.name}</span>
      <span class="lb-time${best == null ? ' none' : ''}">${records.formatTime(best)}</span>`;
    ui.lapBoardList.appendChild(li);
  }
}

// Results for a Daily Time Trial: total time, whether it beat your personal
// best, your day streak, and how you fared against the ghost. Reuses the result
// screen's heading / lap-result / message slots instead of the placings list.
function showDailyResults() {
  ui.placings.classList.add('hidden');
  ui.gpStandings.classList.add('hidden');

  const runTime = player.lapTimes.reduce((a, b) => a + b, 0);
  const racedGhost = !!(ghost && ghost.samples.length);
  const ghostTime = racedGhost ? daily.getTrackBest(track.id)?.time : null;

  // Save the run (and its ghost) if it's a new personal best, and update the
  // streak / today's best. Order matters: read the old best for the ghost gap
  // above before saveRun overwrites it.
  const pb = daily.saveRun(track.id, runTime, chosenKey, ghostRec ? ghostRec.samples : []);
  const ds = daily.recordDailyRun(runTime);
  // A daily run also counts toward the menu's fastest-lap board.
  if (player.bestLap != null) records.recordLap(track.id, player.bestLap);

  ui.gpHeading.textContent = `🏁 Daily Time Trial · ${daily.trackName(track.id)}`;
  ui.gpHeading.classList.remove('hidden');

  ui.lapResult.textContent = pb
    ? `🏆 New personal best! ${records.formatTime(runTime)}`
    : `Your time: ${records.formatTime(runTime)}`;
  ui.lapResult.classList.toggle('record', pb);
  ui.lapResult.classList.remove('hidden');

  let msg = `🔥 ${ds.streak} day streak`;
  if (ghostTime != null) {
    const delta = runTime - ghostTime;
    msg += delta < 0
      ? ` · beat your ghost by ${records.formatTime(-delta)}`
      : ` · ${records.formatTime(delta)} behind your ghost`;
  }
  ui.unlockMsg.textContent = msg;
  ui.unlockMsg.classList.remove('hidden');

  setResultButtons({ next: false });
  if (pb) spawnConfetti();
  renderLapBoard();
}

function showResults() {
  state = 'results';
  setTouchControls(false);
  if (ui.trophy) ui.trophy.classList.add('hidden');

  // Daily Time Trial has its own results layout (your time, streak, ghost gap).
  if (isDaily) {
    showDailyResults();
    ui.results.classList.remove('hidden');
    return;
  }

  ui.placings.classList.remove('hidden');
  const sorted = race.updateRanks();
  const medals = ['🥇', '🥈', '🥉', '4th', '5th', '6th'];
  ui.placings.innerHTML = '';
  sorted.forEach((kart, i) => {
    const li = document.createElement('li');
    if (kart.isPlayer) li.className = 'you';
    li.innerHTML = `
      <span class="medal">${medals[i]}</span>
      <span>${kart.def.name}</span>
      ${kart.isPlayer ? '<span class="you-tag">YOU</span>' : ''}`;
    ui.placings.appendChild(li);
  });

  // Report the player's fastest lap and crown a new track record if they beat it.
  if (player.bestLap != null) {
    const isRecord = records.recordLap(track.id, player.bestLap);
    ui.lapResult.textContent = isRecord
      ? `🏆 New lap record! ${records.formatTime(player.bestLap)}`
      : `Fastest lap: ${records.formatTime(player.bestLap)}`;
    ui.lapResult.classList.toggle('record', isRecord);
    ui.lapResult.classList.remove('hidden');
    renderLapBoard();
  } else {
    ui.lapResult.classList.add('hidden');
  }

  const playerWon = sorted[0] && sorted[0].isPlayer;

  if (mode === 'gp') {
    // Award championship points for this race's finishing order.
    sorted.forEach((k, i) => { gp.points[k.def.key] += (GP_POINTS[i] || 0); });
    // Track the clean sweep: the player must win every race to keep this true.
    gp.wonAll = gp.wonAll && playerWon;
    renderGpStandings();
    ui.gpStandings.classList.remove('hidden');
    if (gp.raceIndex >= GP_RACE_COUNT - 1) {
      finishGrandPrix();
    } else {
      ui.gpHeading.textContent = `Race ${gp.raceIndex + 1} of ${GP_RACE_COUNT} complete`;
      ui.gpHeading.classList.remove('hidden');
      ui.unlockMsg.classList.add('hidden');
      setResultButtons({ next: true });
    }
  } else if (mode === 'elim') {
    handleElimination(sorted);
  } else {
    ui.gpHeading.classList.add('hidden');
    ui.gpStandings.classList.add('hidden');
    ui.unlockMsg.classList.add('hidden');
    setResultButtons({ next: false });
    if (playerWon) spawnConfetti();
  }

  ui.results.classList.remove('hidden');
}

// Show/hide the right buttons for the situation. Mid-series (a cup or
// tournament still running) we only offer "Next race"; otherwise the
// single-race buttons (re-race / change / menu) apply.
function setResultButtons({ next }) {
  const midSeries = next;
  ui.nextRace.classList.toggle('hidden', !next);
  ui.raceAgain.classList.toggle('hidden', midSeries);
  ui.changeChicken.classList.toggle('hidden', midSeries);
  ui.raceAgain.textContent = mode === 'gp' ? 'New cup'
    : mode === 'elim' ? 'New tournament' : 'Race again';
}

function renderGpStandings() {
  const rows = gp.field
    .map((def) => ({ def, pts: gp.points[def.key] }))
    .sort((a, b) => b.pts - a.pts);
  ui.gpStandings.innerHTML = '';
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.def.key === chosenKey) li.className = 'you';
    li.innerHTML = `
      <span class="gp-pos">${i + 1}</span>
      <span class="gp-name">${r.def.name}</span>
      <span class="gp-pts">${r.pts} pts</span>`;
    ui.gpStandings.appendChild(li);
  });
}

// Final race of a cup: crown the champion, and if it's the player, unlock the
// next fancy racer and throw confetti.
function finishGrandPrix() {
  const rows = gp.field
    .map((def) => ({ def, pts: gp.points[def.key] }))
    .sort((a, b) => b.pts - a.pts);
  const champ = rows[0];
  const won = champ.def.key === chosenKey;
  // A clean sweep of an Extreme cup (winning all three races) is the only way
  // to earn the extreme-tier legends.
  const extremeSweep = gp.diff === 'extreme' && gp.wonAll && won;

  ui.gpHeading.textContent = won ? '🏆 Grand Prix Champion!' : `${champ.def.name} wins the cup`;
  ui.gpHeading.classList.remove('hidden');

  if (won) {
    // Standard cup win reveals the next gp-tier racer; an Extreme sweep also
    // reveals the next extreme-tier legend.
    const unlocked = unlocks.unlockNext('gp');
    const extreme = extremeSweep ? unlocks.unlockNext('extreme') : null;
    let msg;
    if (extreme) {
      msg = `🌋 EXTREME SWEEP! Legend unlocked: ${extreme.name}!`;
    } else if (gp.diff === 'extreme' && gp.wonAll) {
      msg = '🌋 Extreme legends all unlocked. Unstoppable!';
    } else if (unlocked) {
      msg = `🎉 New racer unlocked: ${unlocked.name}!`;
    } else {
      msg = 'A true champion of the henhouse!';
    }
    ui.unlockMsg.textContent = msg;
    ui.unlockMsg.classList.remove('hidden');
    spawnConfetti();
    audio.play('fanfare');
  } else {
    ui.unlockMsg.classList.add('hidden');
  }

  gp = null; // cup is over; "New cup" will start a fresh one
  setResultButtons({ next: false });
}

// Resolve one round of an Elimination tournament: the last-placed racer is
// knocked out. If that's the player the run is over; if the player is the last
// one standing they win the trophy and the motorbike; otherwise we tee up the
// next round on a fresh track.
function handleElimination(sorted) {
  const knockedOut = sorted[sorted.length - 1];
  elim.field = elim.field.filter((d) => d.key !== knockedOut.def.key);
  elim.eliminated.push(knockedOut.def);

  renderElimStandings(sorted, knockedOut);
  ui.gpStandings.classList.remove('hidden');
  ui.gpHeading.classList.remove('hidden');

  if (knockedOut.isPlayer) {
    // The player finished last and is out of the tournament.
    ui.gpHeading.textContent = '💥 Knocked out!';
    ui.unlockMsg.textContent = 'You finished last and were eliminated. Try again, champ!';
    ui.unlockMsg.classList.remove('hidden');
    elim = null;
    setResultButtons({ next: false });
  } else if (elim.field.length <= 1) {
    // Everyone else is gone: the player is the last chicken standing.
    finishElimination();
  } else {
    const remaining = elim.field.length;
    ui.gpHeading.textContent = `${knockedOut.def.name} is eliminated! ${remaining} racers left`;
    ui.unlockMsg.classList.add('hidden');
    setResultButtons({ next: true });
  }
}

// The player has outlasted the whole field. Crown them with a big trophy and
// unlock the motorbike (the tournament-tier prize).
function finishElimination() {
  ui.gpHeading.textContent = '🏆 Last Chicken Standing!';
  const newly = unlocks.unlockNext('tournament');
  ui.unlockMsg.textContent = newly
    ? `🏍️ MOTORBIKE UNLOCKED: ${newly.name}!`
    : 'Tournament champion! The henhouse bows to you.';
  ui.unlockMsg.classList.remove('hidden');
  showTrophy();
  spawnConfetti();
  audio.play('fanfare');
  elim = null; // tournament over; "New tournament" starts a fresh one
  setResultButtons({ next: false });
}

// Show this round's finishing order with the last-placed racer marked OUT.
function renderElimStandings(sorted, knockedOut) {
  ui.gpStandings.innerHTML = '';
  sorted.forEach((k, i) => {
    const li = document.createElement('li');
    if (k.isPlayer) li.className = 'you';
    const out = k === knockedOut;
    li.innerHTML = `
      <span class="gp-pos">${i + 1}</span>
      <span class="gp-name">${k.def.name}${out ? ' ❌' : ''}</span>
      <span class="gp-pts">${out ? 'OUT' : 'SAFE'}</span>`;
    ui.gpStandings.appendChild(li);
  });
}

// Pop the big trophy onto the results screen.
function showTrophy() {
  if (ui.trophy) ui.trophy.classList.remove('hidden');
}

// Lightweight DOM confetti for the results screen.
function spawnConfetti() {
  if (!ui.confetti) return;
  ui.confetti.innerHTML = '';
  const colours = ['#ffb300', '#ff5fb0', '#4ab8ff', '#7ed957', '#ff7a1a', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colours[i % colours.length];
    piece.style.animationDelay = (Math.random() * 0.7) + 's';
    piece.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
    ui.confetti.appendChild(piece);
  }
}

function addShake(mag) {
  shakeMag = Math.max(shakeMag, mag);
  shakeT = Math.max(shakeT, 0.3);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (race) {
    race.update(dt);
    updateInput();

    const playerDriving = race.state === 'racing' && !player.finished && state === 'racing';
    if (playerDriving && consumeFire()) items.useItem(player);
    else consumeFire();

    for (const d of drivers) d.update(dt, race, items, player);
    for (const kart of karts) {
      kart.update(dt, kart === player ? (playerDriving ? input : ZERO_INPUT) : kart.aiInput);
    }
    resolveKartCollisions(karts);
    resolveJumpStomps(karts);
    items.update(dt);
    crossers.update(dt, karts, items.particles);
    cow.update(dt, karts, items.particles);
    moa.update(dt, karts, items.particles);

    // Daily ghost: advance the shared race clock, record the player's path, and
    // replay the ghost at the same point in time.
    if (isDaily && race.state === 'racing') {
      raceTime += dt;
      if (ghostRec && !player.finished) ghostRec.sample(raceTime, player);
      if (ghost) ghost.update(raceTime);
    }

    hud.update(player, race, karts, ghost);
    updateChaseCamera(dt);

    audio.setEngine(Math.abs(player.speed) / player.def.maxSpeed);

    // Juice: a kick of shake when a boost fires or you get hit, speed lines
    // while boosting, and a proud bawk whenever you climb a place.
    const boostingNow = player.boostT > 0;
    if (boostingNow && !prevBoosting) addShake(0.5);
    prevBoosting = boostingNow;
    const spinningNow = player.spinT > 0;
    if (spinningNow && !prevSpin) addShake(0.9);
    prevSpin = spinningNow;
    if (ui.speedLines) ui.speedLines.classList.toggle('on', boostingNow && race.state === 'racing');
    if (race.state === 'racing' && !player.finished && player.rank < lastPlayerRank) {
      audio.play('bawk');
    }
    lastPlayerRank = player.rank;

    if (player.finished && !fanfarePlayed) {
      fanfarePlayed = true;
      audio.play('fanfare');
    }
    if (player.finished && state === 'racing') {
      resultTimer += dt;
      if (resultTimer > 2.2) showResults();
    }
  } else {
    // Slow scenic orbit behind the menus
    orbitAngle += dt * 0.06;
    camera.position.set(Math.sin(orbitAngle) * 150, 75, Math.cos(orbitAngle) * 150);
    camera.lookAt(0, 0, 0);
    audio.setEngine(0);
  }

  const inBarnNow = state === 'racing' && !!player && inBarn(player.pos, player.idx);
  applyBarnDarkness(dt, inBarnNow);

  renderer.render(scene, camera);
}

// Drives the barn into darkness with a flurry of chicken clucks, and eases
// back to daylight once the player is clear of it.
function applyBarnDarkness(dt, inside) {
  const target = inside ? 1 : 0;
  darkness += (target - darkness) * Math.min(1, 5 * dt);
  scene.background.copy(currentSky).lerp(BARN_DARK, darkness);
  scene.fog.color.copy(scene.background);
  hemi.intensity = 0.9 * (1 - 0.93 * darkness);
  sun.intensity = 1.6 * (1 - 0.96 * darkness);

  if (inside) {
    cluckTimer -= dt;
    if (cluckTimer <= 0) {
      audio.play('cluck');
      cluckTimer = 0.12 + Math.random() * 0.2;
    }
  }
}

function updateChaseCamera(dt) {
  player.forward(tmpF);
  camTarget.set(player.pos.x - tmpF.x * 9, player.pos.y + 4.6, player.pos.z - tmpF.z * 9);
  const k = 1 - Math.pow(0.0001, dt);
  camera.position.lerp(camTarget, k);
  camLook.set(player.pos.x + tmpF.x * 5, player.pos.y + 1.4, player.pos.z + tmpF.z * 5);
  camera.lookAt(camLook);

  const targetFov = player.boostT > 0 ? 72 : 62;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 6 * dt);
    camera.updateProjectionMatrix();
  }

  // Camera shake (decays over ~0.3s), applied after the look so it jitters
  if (shakeT > 0) {
    shakeT -= dt;
    const s = shakeMag * Math.max(0, shakeT / 0.3);
    camera.position.x += (Math.random() - 0.5) * s * 3;
    camera.position.y += (Math.random() - 0.5) * s * 3;
    camera.position.z += (Math.random() - 0.5) * s * 3;
    if (shakeT <= 0) shakeMag = 0;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
