// On-screen race info: position, lap counter, item slot, minimap, countdown.

import { track } from './track.js';
import { TOTAL_LAPS } from './race.js';
import { formatTime } from './records.js';

const ICONS = { mine: '💣', missile: '🚀', boost: '⚡', llama: '🦙' };
const ROLL_ICONS = ['💣', '🚀', '⚡', '🦙', '🎁'];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

let el = {};
let mapCtx = null;
let mapPts = [];
let mapScale = 1;
let mapOffX = 0;
let mapOffZ = 0;

export function init() {
  el = {
    hud: document.getElementById('hud'),
    position: document.getElementById('position'),
    lap: document.getElementById('lap'),
    lapTime: document.getElementById('lapTime'),
    bestLap: document.getElementById('bestLap'),
    itemIcon: document.getElementById('itemIcon'),
    minimap: document.getElementById('minimap'),
    wrongway: document.getElementById('wrongway'),
    countdown: document.getElementById('countdown'),
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

export function show() { el.hud.classList.remove('hidden'); }
export function hide() { el.hud.classList.add('hidden'); }

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

export function update(player, race, karts, ghost) {
  el.position.textContent = ORDINALS[player.rank - 1] || '';
  const lapShown = Math.min(player.lap + 1, TOTAL_LAPS);
  el.lap.textContent = player.finished ? 'Finished!' : `Lap ${lapShown}/${TOTAL_LAPS}`;

  // Live lap timer: ticks up while racing, then freezes on the line / finish.
  if (race.state === 'racing' && !player.finished) {
    el.lapTime.textContent = formatTime(Math.max(0, race.clockTime - player.lapStart));
  } else if (race.state === 'countdown') {
    el.lapTime.textContent = formatTime(0);
  }
  el.bestLap.textContent = 'Best ' + formatTime(player.bestLap);

  if (player.rollT > 0) {
    const i = Math.floor(performance.now() / 80) % ROLL_ICONS.length;
    el.itemIcon.textContent = ROLL_ICONS[i];
  } else {
    el.itemIcon.textContent = player.item ? ICONS[player.item] : '';
  }

  el.wrongway.classList.toggle('hidden', !player.wrongWay);

  drawMinimap(player, karts, ghost);
}

function drawMinimap(player, karts, ghost) {
  const ctx = mapCtx;
  ctx.clearRect(0, 0, el.minimap.width, el.minimap.height);

  ctx.beginPath();
  ctx.moveTo(mapPts[0][0], mapPts[0][1]);
  for (const [x, y] of mapPts) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
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
