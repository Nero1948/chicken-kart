// Race control: the countdown, lap and checkpoint tracking, and live positions.

import { track, nearestIdx } from './track.js';
import * as hud from './hud.js';
import { audio } from './audio.js';

export const TOTAL_LAPS = 3;

export class Race {
  constructor(karts, playerKart) {
    this.karts = karts;
    this.player = playerKart;
    this.state = 'countdown';
    this.t = 3.2;
    this.lastShown = null;
    this.goT = 0;
    this.clockTime = 0;
  }

  update(dt) {
    this.clockTime += dt;

    if (this.state === 'countdown') {
      this.updateRanks(); // show real grid positions during the countdown
      this.t -= dt;
      const n = Math.min(3, Math.ceil(this.t));
      if (n !== this.lastShown && n > 0) {
        hud.showCountdown(String(n));
        audio.play('beep');
        this.lastShown = n;
      }
      if (this.t <= 0) {
        this.state = 'racing';
        hud.showCountdown('GO!');
        audio.play('go');
        this.goT = 0.9;
      }
      return;
    }

    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) hud.hideCountdown();
    }

    for (const kart of this.karts) this.updateProgress(kart);
    this.updateRanks();
  }

  updateProgress(kart) {
    const ni = nearestIdx(kart.pos, kart.raceIdx);
    let d = ni - kart.raceIdx;
    if (d > track.N / 2) d -= track.N;
    if (d < -track.N / 2) d += track.N;

    if (d > 0) {
      // Walk each sample we passed so checkpoints and the line are never skipped
      for (let s = 1; s <= d; s++) {
        const j = (kart.raceIdx + s) % track.N;
        const c = track.checkpoints.indexOf(j);
        if (c !== -1) {
          kart.cp[c] = true;
        } else if (j === 0) {
          if (kart.cp.every(Boolean)) {
            kart.lap++;
            if (kart.lap >= TOTAL_LAPS && !kart.finished) {
              kart.finished = true;
              kart.finishTime = this.clockTime;
            }
          }
          kart.cp = [false, false, false];
        }
      }
      kart.wrongAccum = 0;
    } else if (d < 0) {
      kart.wrongAccum += -d;
    }

    kart.raceIdx = ni;
    kart.total += d;
    kart.wrongWay = kart.wrongAccum > 10 && !kart.finished && Math.abs(kart.speed) > 4;
  }

  updateRanks() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.total - a.total;
    });
    sorted.forEach((k, i) => { k.rank = i + 1; });
    return sorted;
  }

  // The kart directly ahead of this one in the standings, used by missiles
  kartAhead(kart) {
    let best = null;
    for (const other of this.karts) {
      if (other === kart) continue;
      if (other.rank < kart.rank && (!best || other.rank > best.rank)) best = other;
    }
    return best;
  }
}
