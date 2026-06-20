// Daily Time Trial: works out the day's track (the same for everyone on a given
// calendar day), and stores your personal-best runs (with their ghost
// recordings) plus your daily streak in the browser's localStorage.

import { TRACKS } from './track.js';
import { formatTime } from './records.js';

const RUN_KEY = 'chickenkart.timetrial.v1'; // per-track best run + ghost samples
const DAILY_KEY = 'chickenkart.daily.v1';   // streak + today's best time

// A fixed rotation so the daily track is predictable and shared by everyone.
const ROTATION = ['farm', 'city', 'park', 'beach'];

// A stable whole-number index for the local calendar day. Shifting by the
// timezone offset means the day rolls over at local midnight, not UTC midnight.
function dayIndex(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// "2026-06-20" style key for the local day, used to tell days apart.
export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// Which track is today's challenge. The modulo is written to stay positive even
// for dates before the epoch, so it can never index out of the rotation.
export function todayTrackId(d = new Date()) {
  const n = ROTATION.length;
  return ROTATION[((dayIndex(d) % n) + n) % n];
}

export function trackName(id) {
  return (TRACKS[id] && TRACKS[id].name) || id;
}

// ---- Personal-best runs (also the source of the ghost) -------------------

function loadRuns() {
  try { return JSON.parse(localStorage.getItem(RUN_KEY)) || {}; } catch { return {}; }
}
function saveRuns(data) {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
}

// The best stored run for a track: { time, key, samples } or null.
export function getTrackBest(trackId) {
  const r = loadRuns()[trackId];
  return r && typeof r.time === 'number' ? r : null;
}

// Save a full run (total time, racer key and ghost samples) only if it beats the
// stored best for that track. Returns true on a new personal best.
export function saveRun(trackId, time, key, samples) {
  const data = loadRuns();
  const prev = data[trackId];
  if (prev && typeof prev.time === 'number' && prev.time <= time) return false;
  data[trackId] = { time, key, samples: samples || [] };
  saveRuns(data);
  return true;
}

// ---- Daily streak --------------------------------------------------------

function loadDaily() {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch { return {}; }
}
function saveDaily(data) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
}

// Current streak and today's best time, normalised so a broken streak (a day was
// missed) reads as 0 and a stale "today's best" from a previous day is dropped.
export function getDaily() {
  const d = loadDaily();
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));
  const streak = (d.lastDate === today || d.lastDate === yesterday) ? (d.streak || 0) : 0;
  const todayBest = d.lastDate === today ? d.todayBest : null;
  return { streak, todayBest };
}

// Record a completed daily run. Increments the streak the first time you finish
// on a new day (continuing it if you also played yesterday, otherwise resetting
// to 1), and keeps the best time for today. Returns the refreshed state.
export function recordDailyRun(time) {
  const d = loadDaily();
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));

  let streak = d.streak || 0;
  if (d.lastDate === today) {
    /* already counted today: streak unchanged */
  } else if (d.lastDate === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }

  let todayBest = d.lastDate === today ? d.todayBest : null;
  const improved = todayBest == null || time < todayBest;
  if (improved) todayBest = time;

  saveDaily({ lastDate: today, streak, todayBest });
  return { streak, todayBest, improved };
}

// Re-exported so callers can format times without also importing records.
export { formatTime };
