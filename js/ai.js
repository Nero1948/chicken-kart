// AI chicken drivers. Each one chases a point a little way down the track,
// slows for sharp corners, uses items after a short think, and rubber-bands
// so the race stays close and fun.

import { track, inSplitZone } from './track.js';
import { angleDiff } from './kart.js';

export class AIDriver {
  constructor(kart, skill, tuning) {
    this.kart = kart;
    this.skill = skill;            // base speed multiplier (varies by difficulty)
    this.tuning = tuning;          // { catchUp, easeOff, cap } from the difficulty preset
    this.itemTimer = 1 + Math.random() * 2.5;
    this.wobble = Math.random() * 100;
    this.time = Math.random() * 100;
    this.lanePref = Math.random() < 0.5 ? -1 : 1; // which side of the split (tunnel/barn) this driver takes
  }

  update(dt, race, items, playerKart) {
    this.time += dt;
    const kart = this.kart;
    const inp = kart.aiInput;

    if (race.state !== 'racing') {
      inp.throttle = 0; inp.steer = 0; inp.brake = 0;
      return;
    }

    // Rubber banding: trail the player, speed up a touch; lead by a lot, ease off.
    // The amounts come from the difficulty preset, so Hard rivals chase harder.
    const t = this.tuning;
    const diff = playerKart.total - kart.total; // in track samples
    let factor = this.skill + Math.max(-t.easeOff, Math.min(t.catchUp, diff * 0.0012));
    if (kart.finished) factor = this.skill * 0.9; // cruise after the flag
    kart.aiFactor = Math.max(0.8, Math.min(t.cap, factor));

    // Aim at a point ahead on the track, with a gentle wobble so each
    // chicken takes a slightly different line
    const lookahead = Math.floor(6 + Math.abs(kart.speed) * 0.45);
    const ti = (kart.idx + lookahead) % track.N;
    const s = track.samples[ti];
    // Normally weave a little; on the split, commit to the tunnel or barn lane
    let lateral = Math.sin(this.time * 0.5 + this.wobble) * 2;
    if (inSplitZone(ti)) lateral = this.lanePref * track.split.laneOffset;
    const tx = s.pos.x + s.normal.x * lateral;
    const tz = s.pos.z + s.normal.z * lateral;

    const desired = Math.atan2(tx - kart.pos.x, tz - kart.pos.z);
    const diffA = angleDiff(desired, kart.heading);
    inp.steer = Math.max(-1, Math.min(1, diffA * 2.5));

    // Ease off for sharp upcoming corners or big heading errors
    const aheadTan = track.samples[(kart.idx + 22) % track.N].tan;
    const hereTan = track.samples[kart.idx].tan;
    const curve = Math.abs(angleDiff(
      Math.atan2(aheadTan.x, aheadTan.z),
      Math.atan2(hereTan.x, hereTan.z)
    ));
    inp.throttle = 1;
    inp.brake = 0;
    if (curve > 0.9 || Math.abs(diffA) > 0.9) inp.throttle = 0.55;
    else if (curve > 0.5) inp.throttle = 0.8;

    // Use a held item after a short delay
    if (kart.item && kart.rollT <= 0) {
      this.itemTimer -= dt;
      if (this.itemTimer <= 0) {
        items.useItem(kart);
        this.itemTimer = 1 + Math.random() * 2.5;
      }
    } else if (!kart.item) {
      this.itemTimer = Math.max(this.itemTimer, 0.8 + Math.random() * 2);
    }
  }
}
