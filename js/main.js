// Game entry point: sets up the 3D scene, wires up the menus, and runs the
// main loop that drives everything else.

import * as THREE from 'three';
import { buildTrack, track, inBarn, TRACKS } from './track.js';
import { Kart, CHARACTERS, UNLOCKABLES, AI_ROSTER, resolveKartCollisions, resolveJumpStomps } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemManager } from './items.js';
import { Crossers } from './chickens.js';
import { Cow } from './cow.js';
import { Race } from './race.js';
import * as hud from './hud.js';
import { audio } from './audio.js';
import * as records from './records.js';
import * as unlocks from './unlocks.js';
import { input, initInput, initTouch, updateInput, consumeFire } from './player.js';

const ZERO_INPUT = { throttle: 0, steer: 0, brake: 0 };

// Difficulty presets. `skills` are the AI base speed multipliers (one per
// rival, fastest first). `catchUp`/`easeOff` control rubber banding: how much
// a trailing AI speeds up and a leading AI backs off. `cap` is the highest
// speed multiplier an AI may ever reach, so Hard rivals can out-drag the player.
const DIFFICULTIES = {
  easy:   { skills: [0.84, 0.81, 0.78, 0.75, 0.72], catchUp: 0.08, easeOff: 0.22, cap: 0.96 },
  medium: { skills: [0.99, 0.96, 0.93, 0.90, 0.87], catchUp: 0.16, easeOff: 0.10, cap: 1.12 },
  hard:   { skills: [1.06, 1.03, 1.00, 0.97, 0.94], catchUp: 0.20, easeOff: 0.06, cap: 1.24 },
};
let difficulty = 'medium';

// Grand Prix: a series of races over both tracks, scored by finishing position.
const GP_RACE_COUNT = 3;
const GP_POINTS = [9, 6, 4, 3, 2, 1]; // points for 1st..6th each race
let mode = 'single'; // 'single' | 'gp'
let gp = null;        // { raceIndex, tracks, field, points }

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

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

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
      ui.trackSel.classList.toggle('hidden', mode === 'gp');
      btn.blur();
    });
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

  // Next race in a Grand Prix: keep the same field, move to the next track.
  ui.nextRace.addEventListener('click', () => {
    ui.nextRace.blur();
    gp.raceIndex++;
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
    ui.results.classList.add('hidden');
    hud.hide();
    setTouchControls(false);
    ui.menu.classList.remove('hidden');
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

const CARD_HATS = { laya: '👑', heyhey: '🕶️', sir: '🎩', disco: '🪩', captain: '🦸' };

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
      card.innerHTML = `
        <div class="card-face locked-face">🔒</div>
        <div class="card-name">???</div>
        <div class="card-tag">Win a Grand Prix to unlock this racer</div>`;
    } else {
      const kartHex = '#' + def.kart.toString(16).padStart(6, '0');
      const statRows = Object.entries(def.bars).map(([label, v]) => `
        <div class="stat">
          <span class="stat-label">${label}</span>
          <span class="stat-bar"><span class="stat-fill" style="width:${Math.round(v * 100)}%"></span></span>
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

// Set up a fresh Grand Prix: three races over both tracks, one fixed field,
// points carried across all races.
function startGrandPrix(key) {
  gp = {
    raceIndex: 0,
    tracks: Math.random() < 0.5 ? ['farm', 'city', 'farm'] : ['city', 'farm', 'city'],
    field: buildSingleField(key),
    points: {},
  };
  for (const d of gp.field) gp.points[d.key] = 0;
}

function startRace(key) {
  // Work out which track to race and who is on the grid.
  let trackId, field;
  if (mode === 'gp') {
    if (!gp) startGrandPrix(key);
    trackId = gp.tracks[gp.raceIndex];
    field = gp.field;
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

  // Grid slots: front row first. The player starts second to last.
  const order = [karts[1], karts[2], karts[3], karts[4], player, karts[5]];
  order.forEach((kart, i) => kart.placeAt(track.startGrid[i]));

  race = new Race(karts, player);
  items = new ItemManager(scene, race);
  crossers = new Crossers(scene);
  cow = new Cow(scene);

  resultTimer = 0;
  fanfarePlayed = false;
  lastPlayerRank = 5; // the player lines up 5th on the grid
  state = 'racing';
  ui.results.classList.add('hidden');
  if (ui.confetti) ui.confetti.innerHTML = '';
  hud.show();
  setTouchControls(true);

  // Snap the camera straight behind the player so it does not swing in
  player.forward(tmpF);
  camera.position.set(player.pos.x - tmpF.x * 9, player.pos.y + 4.6, player.pos.z - tmpF.z * 9);
  camera.lookAt(player.pos.x, player.pos.y + 1.4, player.pos.z);
}

function cleanupRace() {
  for (const kart of karts) kart.dispose();
  if (items) items.dispose();
  if (crossers) crossers.dispose();
  if (cow) cow.dispose();
  karts = [];
  drivers = [];
  player = null;
  race = null;
  items = null;
  crossers = null;
  cow = null;
  hud.hideCountdown();
  setTouchControls(false);
  if (ui.confetti) ui.confetti.innerHTML = '';
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

function showResults() {
  state = 'results';
  setTouchControls(false);
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
  } else {
    ui.gpHeading.classList.add('hidden');
    ui.gpStandings.classList.add('hidden');
    ui.unlockMsg.classList.add('hidden');
    setResultButtons({ next: false });
    if (playerWon) spawnConfetti();
  }

  ui.results.classList.remove('hidden');
}

// Show/hide the right buttons for the situation. Mid-cup we only offer "Next
// race"; otherwise the single-race buttons (re-race / change / menu) apply.
function setResultButtons({ next }) {
  const midCup = mode === 'gp' && next;
  ui.nextRace.classList.toggle('hidden', !next);
  ui.raceAgain.classList.toggle('hidden', midCup);
  ui.changeChicken.classList.toggle('hidden', midCup);
  ui.raceAgain.textContent = mode === 'gp' ? 'New cup' : 'Race again';
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

  ui.gpHeading.textContent = won ? '🏆 Grand Prix Champion!' : `${champ.def.name} wins the cup`;
  ui.gpHeading.classList.remove('hidden');

  if (won) {
    const unlocked = unlocks.unlockNext();
    ui.unlockMsg.textContent = unlocked
      ? `🎉 New racer unlocked: ${unlocked.name}!`
      : 'A true champion of the henhouse!';
    ui.unlockMsg.classList.remove('hidden');
    spawnConfetti();
    audio.play('fanfare');
  } else {
    ui.unlockMsg.classList.add('hidden');
  }

  gp = null; // cup is over; "New cup" will start a fresh one
  setResultButtons({ next: false });
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
    hud.update(player, race, karts);
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
