// On-screen race info: position, lap counter, corn, speed, item slot, minimap,
// countdown, plus the big announcements ("FINAL LAP!") and little toasts.

import { track } from './track.js';
import { TOTAL_LAPS } from './race.js';
import { formatTime } from './records.js';
import { MAX_CORN } from './kart.js';

export const ICONS = {
  mine: '💣', missile: '🚀', boost: '⚡', llama: '🦙',
  egg: '🥚', shield: '🛡️', chilli: '🌶️', crow: '🐓',
};
const ROLL_ICONS = ['💣', '🚀', '⚡', '🥚', '🛡️', '🌶️', '🐓', '🦙'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

let el = {};
let mapCtx = null;
let mapPts = [];
let mapScale = 1;
let mapOffX = 0;
let mapOffZ = 0;
let lastRank = 0;
let lastCorn = 0;
let lastItem = null;
let announceTimer = 0;
let toastTimer = 0;

export function init() {
  el = {
    hud: document.getElementById('hud'),
    position: document.getElementById('position'),
    lap: document.getElementById('lap'),
    lapTime: document.getElementById('lapTime'),
    bestLap: document.getElementById('bestLap'),
    itemSlot: document.getElementById('itemSlot'),
    itemIcon: document.getElementById('itemIcon'),
    minimap: document.getElementById('minimap'),
    wrongway: document.getElementById('wrongway'),
    countdown: document.getElementById('countdown'),
    startTip: document.getElementById('startTip'),
    cornCount: document.getElementById('cornCount'),
    cornNum: document.getElementById('cornNum'),
    speedo: document.getElementById('speedo'),
    speedNum: document.getElementById('speedNum'),
    announce: document.getElementById('announce'),
    toast: document.getElementById('toast'),
    splat: document.getElementById('splat'),
    flash: document.getElementById('flash'),
  };
  mapCtx = el.minimap.getContext('2d');
  refreshTrack();
}

// Recompute the minimap outline for the current track. Call this whenever the
// active track changes so the map matches the loop you are racing.
export function refreshTrack() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) {
    minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
  }
  const w = el.minimap.width, h = el.minimap.height, pad = 14;
  mapScale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  mapOffX = (w - (maxX - minX) * mapScale) / 2 - minX * mapScale;
  mapOffZ = (h - (maxZ - minZ) * mapScale) / 2 - minZ * mapScale;
  mapPts = track.samples.filter((_, i) => i % 6 === 0).map((s) => [
    s.pos.x * mapScale + mapOffX,
    s.pos.z * mapScale + mapOffZ,
  ]);
}

export function show() {
  el.hud.classList.remove('hidden');
  lastRank = 0;
  lastCorn = 0;
  lastItem = null;
  clearOverlays();
}

export function hide() {
  el.hud.classList.add('hidden');
  clearOverlays();
}

function clearOverlays() {
  el.announce.classList.add('hidden');
  el.toast.classList.add('hidden');
  el.startTip.classList.add('hidden');
  el.splat.classList.remove('on');
}

export function showCountdown(text) {
  el.countdown.textContent = text;
  el.countdown.classList.remove('hidden');
  // Restart the pop animation
  el.countdown.style.animation = 'none';
  void el.countdown.offsetWidth;
  el.countdown.style.animation = '';
}

export function hideCountdown() {
  el.countdown.classList.add('hidden');
}

export function showStartTip(on) {
  el.startTip.classList.toggle('hidden', !on);
}

// Re-trigger a CSS animation by removing and re-adding its class.
function replay(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// A big headline across the top of the screen. `kind` is '' | 'gold' | 'bad'.
export function announce(text, kind = '') {
  el.announce.textContent = text;
  el.announce.className = kind;
  el.announce.style.animation = 'none';
  void el.announce.offsetWidth;
  el.announce.style.animation = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.announce.classList.add('hidden'), 2200);
}

// A small pill of text for the quick stuff (tricks, slipstream, mini-turbos).
export function toast(text) {
  el.toast.textContent = text;
  el.toast.className = '';
  el.toast.style.animation = 'none';
  void el.toast.offsetWidth;
  el.toast.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 1300);
}

// A full-screen flash (the rooster crow)
export function flash() {
  replay(el.flash, 'go');
}

export function update(player, race, karts, ghost) {
  if (player.rank !== lastRank) {
    const ord = ORDINALS[player.rank - 1] || '';
    el.position.innerHTML = ord ? `${ord.slice(0, -2)}<sup>${ord.slice(-2)}</sup>` : '';
    if (lastRank && race.state === 'racing') replay(el.position, 'bump');
    lastRank = player.rank;
  }
  const lapShown = Math.min(player.lap + 1, TOTAL_LAPS);
  el.lap.textContent = player.finished ? 'Finished!' : `Lap ${lapShown}/${TOTAL_LAPS}`;

  // Live lap timer: ticks up while racing, then freezes on the line / finish.
  if (race.state === 'racing' && !player.finished) {
    el.lapTime.textContent = formatTime(Math.max(0, race.clockTime - player.lapStart));
  } else if (race.state === 'countdown') {
    el.lapTime.textContent = formatTime(0);
  }
  el.bestLap.textContent = 'Best ' + formatTime(player.bestLap);

  if (player.corn !== lastCorn) {
    el.cornNum.textContent = player.corn;
    el.cornCount.classList.toggle('full', player.corn >= MAX_CORN);
    if (player.corn > lastCorn) replay(el.cornCount, 'pop');
    lastCorn = player.corn;
  }

  // A rough km/h read-out: top speed for the base karts reads about 100.
  el.speedNum.textContent = Math.round(Math.abs(player.speed) * 3.3);
  el.speedo.classList.toggle('boost', player.boostT > 0);

  if (player.rollT > 0) {
    const i = Math.floor(performance.now() / 70) % ROLL_ICONS.length;
    el.itemIcon.textContent = ROLL_ICONS[i];
    lastItem = 'rolling';
  } else {
    el.itemIcon.textContent = player.item ? ICONS[player.item] : '';
    if (player.item && lastItem !== player.item) replay(el.itemSlot, 'got');
    lastItem = player.item;
  }
  el.itemSlot.classList.toggle('has', !!player.item && player.rollT <= 0);

  el.wrongway.classList.toggle('hidden', !player.wrongWay);
  el.splat.classList.toggle('on', player.splatT > 0.9);

  drawMinimap(player, karts, ghost);
}

function drawMinimap(player, karts, ghost) {
  const ctx = mapCtx;
  ctx.clearRect(0, 0, el.minimap.width, el.minimap.height);

  ctx.beginPath();
  ctx.moveTo(mapPts[0][0], mapPts[0][1]);
  for (const [x, y] of mapPts) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,26,38,0.55)';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Start / finish tick
  const s0 = track.samples[0];
  const sx = s0.pos.x * mapScale + mapOffX, sy = s0.pos.z * mapScale + mapOffZ;
  ctx.beginPath();
  ctx.moveTo(sx - s0.normal.x * 6, sy - s0.normal.z * 6);
  ctx.lineTo(sx + s0.normal.x * 6, sy + s0.normal.z * 6);
  ctx.strokeStyle = '#ffd23a';
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const k of karts) {
    if (k === player) continue;
    drawDot(ctx, k, 4, '#' + k.def.kart.toString(16).padStart(6, '0'));
  }
  if (ghost && ghost.group.visible) drawDot(ctx, ghost, 4.5, 'rgba(200,210,230,0.65)');
  drawDot(ctx, player, 5.5, '#ffffff');
}

function drawDot(ctx, kart, r, color) {
  const x = kart.pos.x * mapScale + mapOffX;
  const y = kart.pos.z * mapScale + mapOffZ;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
