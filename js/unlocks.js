// Persistent unlock progress: which fancy racers the player has earned and how
// many Grand Prix they have won. Saved in localStorage, like the lap records.

import { UNLOCKABLES } from './kart.js';

const KEY = 'chickenkart.unlocks.v1';

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return d && Array.isArray(d.unlocked) ? d : { unlocked: [], gpWins: 0 };
  } catch {
    return { unlocked: [], gpWins: 0 };
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage may be unavailable; progress just won't persist */
  }
}

export function isUnlocked(key) {
  return load().unlocked.includes(key);
}

export function getGpWins() {
  return load().gpWins || 0;
}

// Unlock the next still-locked racer of a given tier ('gp' or 'extreme').
// A standard cup win counts toward the gpWins tally; Extreme sweeps do not.
// Returns the newly unlocked definition, or null if that tier is fully unlocked.
export function unlockNext(tier = 'gp') {
  const data = load();
  if (tier === 'gp') data.gpWins = (data.gpWins || 0) + 1;
  let newly = null;
  for (const def of Object.values(UNLOCKABLES)) {
    if ((def.tier || 'gp') !== tier) continue;
    if (!data.unlocked.includes(def.key)) {
      data.unlocked.push(def.key);
      newly = def;
      break;
    }
  }
  save(data);
  return newly;
}
