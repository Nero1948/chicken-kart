// Game entry point: sets up the 3D scene, wires up the menus, and runs the
// main loop that drives everything else.

import * as THREE from 'three';
import { buildTrack, track, inBarn, TRACKS } from './track.js';
import { Kart, CHARACTERS, AI_ROSTER, resolveKartCollisions, resolveJumpStomps } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemManager } from './items.js';
import { Crossers } from './chickens.js';
import { Cow } from './cow.js';
import { Race } from './race.js';
import * as hud from './hud.js';
import { audio } from './audio.js';
import * as records from './records.js';
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
  playBtn: document.getElementById('playBtn'),
  raceAgain: document.getElementById('raceAgain'),
  changeChicken: document.getElementById('changeChicken'),
  mainMenu: document.getElementById('mainMenu'),
  muteBtn: document.getElementById('muteBtn'),
  diffBtns: document.querySelectorAll('#difficulty .diff-btn'),
  trackBtns: document.querySelectorAll('#trackSel .track-btn'),
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
  buildSelectCards();
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
    ui.menu.classList.add('hidden');
    ui.select.classList.remove('hidden');
    state = 'select';
  });

  ui.raceAgain.addEventListener('click', () => {
    ui.raceAgain.blur();
    cleanupRace();
    startRace(chosenKey);
  });

  ui.changeChicken.addEventListener('click', () => {
    ui.changeChicken.blur();
    cleanupRace();
    ui.results.classList.add('hidden');
    hud.hide();
    setTouchControls(false);
    ui.select.classList.remove('hidden');
    state = 'select';
    audio.engineOff();
  });

  // Back to the home menu, where the track and difficulty can be chosen again.
  ui.mainMenu.addEventListener('click', () => {
    ui.mainMenu.blur();
    cleanupRace();
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

function buildSelectCards() {
  const hats = { laya: '👑', heyhey: '🕶️' };
  for (const def of Object.values(CHARACTERS)) {
    const card = document.createElement('div');
    card.className = 'card';
    const kartHex = '#' + def.kart.toString(16).padStart(6, '0');
    const statRows = Object.entries(def.bars).map(([label, v]) => `
      <div class="stat">
        <span class="stat-label">${label}</span>
        <span class="stat-bar"><span class="stat-fill" style="width:${Math.round(v * 100)}%"></span></span>
      </div>`).join('');
    card.innerHTML = `
      <div class="card-face" style="background:${kartHex}33; border: 4px solid ${kartHex}">
        ${hats[def.key] ? `<span class="hat">${hats[def.key]}</span>` : ''}
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
    ui.cards.appendChild(card);
  }
}

function startRace(key) {
  // Make sure the chosen track is the one that is built before we grid up.
  if (track.id !== selectedTrack) {
    buildTrack(scene, selectedTrack);
    applyTheme();
    hud.refreshTrack();
  }

  // Field: the player, the two heroes they did not pick, and three extras
  const playerDef = CHARACTERS[key];
  const otherHeroes = Object.values(CHARACTERS).filter((c) => c.key !== key);
  const extras = shuffle([...AI_ROSTER]).slice(0, 3);
  const aiDefs = shuffle([...otherHeroes, ...extras]);
  const diff = DIFFICULTIES[difficulty];
  const skills = shuffle([...diff.skills]);

  player = new Kart(scene, playerDef, true);
  karts = [player];
  drivers = [];
  aiDefs.forEach((def, i) => {
    const kart = new Kart(scene, def, false);
    karts.push(kart);
    drivers.push(new AIDriver(kart, skills[i], diff));
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
  state = 'racing';
  ui.results.classList.add('hidden');
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

  ui.results.classList.remove('hidden');
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
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
