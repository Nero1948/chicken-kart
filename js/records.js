// Persistent fastest-lap records. Each track keeps its single best lap time,
// saved in the browser's localStorage so records survive between visits.

const KEY = 'chickenkart.records.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {}; // storage blocked or corrupt: behave as if no records exist
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage may be unavailable (private mode etc.); records just won't stick */
  }
}

// The best lap stored for a track, in seconds, or null if none set yet.
export function getBestLap(trackId) {
  const time = load()[trackId];
  return typeof time === 'number' ? time : null;
}

// Save a lap time only if it beats the stored record. Returns true on a new record.
export function recordLap(trackId, time) {
  const data = load();
  const prev = data[trackId];
  if (typeof prev === 'number' && prev <= time) return false;
  data[trackId] = time;
  save(data);
  return true;
}

// Seconds -> a tidy clock string: "32.45" under a minute, "1:04.20" over.
export function formatTime(seconds) {
  if (seconds == null) return '—'; // em-dash placeholder for "no time yet"
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${s}` : s;
}
