// AI chicken drivers. Each one chases a point a little way down the track,
// slows for sharp corners, slides through bends for mini-turbos, pulls tricks
// off ramps, picks its moment to use items, and rubber-bands so the race stays
// close and fun.

import { track, inSplitZone, inRoadworks } from './track.js';
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
    // How often this driver nails the fancy stuff (drift boosts, tricks).
    // Faster rivals are sharper; Easy rivals mostly just drive.
    this.flair = Math.max(0.1, Math.min(0.95, (skill - 0.7) * 2.2));
    this.wasAirborne = false;
    this.started = false;
  }

  update(dt, race, items, playerKart) {
    this.time += dt;
    const kart = this.kart;
    const inp = kart.aiInput;

    if (race.state !== 'racing') {
      inp.throttle = 0; inp.steer = 0; inp.brake = 0;
      return;
    }

    // A good getaway for the sharper drivers
    if (!this.started) {
      this.started = true;
      if (Math.random() < this.flair * 0.7) kart.applyBoost(0.8, 1.28);
    }

    // Tracks share the same sample count but differ a lot in lap length, so a
    // fixed number of samples is a different real distance on each track
    // (Tokyo's samples are nearly twice as far apart as the farm's). Convert
    // the tuned distances from world units into samples so the drivers aim
    // and brake the same real distance ahead everywhere.
    const spacing = track.length / track.N; // world units per sample

    // Rubber banding: trail the player, speed up a touch; lead by a lot, ease off.
    // The amounts come from the difficulty preset, so Hard rivals chase harder.
    const t = this.tuning;
    const diff = (playerKart.total - kart.total) * spacing; // in world units
    let factor = this.skill + Math.max(-t.easeOff, Math.min(t.catchUp, diff * 0.0008));
    if (kart.finished) factor = this.skill * 0.9; // cruise after the flag
    kart.aiFactor = Math.max(0.8, Math.min(t.cap, factor));

    // Aim at a point ahead on the track, with a gentle wobble so each
    // chicken takes a slightly different line
    const lookahead = Math.max(3, Math.floor((9 + Math.abs(kart.speed) * 0.68) / spacing));
    const ti = (kart.idx + lookahead) % track.N;
    const s = track.samples[ti];
    // Normally weave a little; on the split, commit to a lane; through the road
    // works, merge into the open lane so they steer around the cones.
    let lateral = Math.sin(this.time * 0.5 + this.wobble) * 3.0;
    if (inSplitZone(ti)) lateral = this.lanePref * track.split.laneOffset;
    else if (inRoadworks(ti)) lateral = track.roadworks.openOffset;
    const tx = s.pos.x + s.normal.x * lateral;
    const tz = s.pos.z + s.normal.z * lateral;

    const desired = Math.atan2(tx - kart.pos.x, tz - kart.pos.z);
    const diffA = angleDiff(desired, kart.heading);
    inp.steer = Math.max(-1, Math.min(1, diffA * 2.5));
    // Egg on the windscreen: weave about blindly for a moment
    if (kart.splatT > 0) inp.steer = Math.max(-1, Math.min(1, inp.steer + Math.sin(this.time * 7) * 0.7));

    // Ease off for sharp upcoming corners or big heading errors
    const aheadTan = track.samples[(kart.idx + Math.round(33 / spacing)) % track.N].tan;
    const hereTan = track.samples[kart.idx].tan;
    const signedCurve = angleDiff(
      Math.atan2(aheadTan.x, aheadTan.z),
      Math.atan2(hereTan.x, hereTan.z)
    );
    const curve = Math.abs(signedCurve);
    inp.throttle = 1;
    inp.brake = 0;
    if (curve > 0.9 || Math.abs(diffA) > 0.9) inp.throttle = 0.55;
    else if (curve > 0.5) inp.throttle = 0.8;

    this.updateDrift(dt, curve, signedCurve);
    this.updateTricks();
    this.updateItems(dt, race, items, curve);
  }

  // Rivals slide through the bigger corners and fire a mini-turbo on the way
  // out, just like the player can. Their slide is for show (they steer
  // normally); the pay-off is the same boost.
  updateDrift(dt, curve, signedCurve) {
    const kart = this.kart;
    const sliding = kart.driftDir !== 0;
    const cornering = curve > 0.42 && kart.speed > kart.def.maxSpeed * 0.6 && !kart.airborne
      && kart.spinT <= 0 && kart.slowT <= 0 && !kart.finished && !inSplitZone(kart.idx);
    if (!sliding) {
      if (cornering && this.flair > 0.2) {
        kart.driftDir = Math.sign(signedCurve) || 1;
        kart.driftCharge = 0;
        kart.driftLevel = 0;
      }
      return;
    }
    if (kart.spinT > 0) { kart.cancelDrift(); return; }
    kart.driftCharge += dt * this.flair;
    kart.driftLevel = kart.driftCharge > 1.7 ? 2 : kart.driftCharge > 0.75 ? 1 : 0;
    if (curve < 0.26 || !cornering && curve < 0.42) kart.releaseDrift();
  }

  // Pull a trick off a ramp now and then.
  updateTricks() {
    const kart = this.kart;
    if (kart.airborne && !this.wasAirborne && Math.random() < this.flair * 0.8) kart.tryTrick();
    this.wasAirborne = kart.airborne;
  }

  // Use a held item at a sensible moment rather than the instant it lands.
  updateItems(dt, race, items, curve) {
    const kart = this.kart;
    if (!kart.item || kart.rollT > 0) {
      if (!kart.item) this.itemTimer = Math.max(this.itemTimer, 0.8 + Math.random() * 2);
      return;
    }
    this.itemTimer -= dt;
    if (this.itemTimer > 0) return;

    let use = true;
    const patience = this.itemTimer > -6; // after 6s of waiting, just use it
    const ahead = race.kartAhead(kart);
    const gapAhead = ahead ? Math.hypot(ahead.pos.x - kart.pos.x, ahead.pos.z - kart.pos.z) : Infinity;

    switch (kart.item) {
      case 'boost':
      case 'chilli':
        // Save the speed for a straight
        use = curve < 0.35 || !patience;
        break;
      case 'egg': {
        // Only throw when a rival is roughly lined up in front
        const f = kart.forward();
        const dot = ahead ? ((ahead.pos.x - kart.pos.x) * f.x + (ahead.pos.z - kart.pos.z) * f.z) / (gapAhead || 1) : 0;
        use = (ahead && gapAhead < 45 && dot > 0.96) || !patience;
        break;
      }
      case 'missile':
      case 'llama':
        use = (ahead && gapAhead < 90) || !patience;
        break;
      case 'mine': {
        // Drop it when someone is breathing down your neck
        let close = false;
        for (const o of race.karts) {
          if (o === kart || o.rank < kart.rank) continue;
          if (Math.hypot(o.pos.x - kart.pos.x, o.pos.z - kart.pos.z) < 16) { close = true; break; }
        }
        use = close || !patience;
        break;
      }
      case 'crow':
        use = kart.rank > 1 || !patience;
        break;
      default:
        use = true; // shield: pop it straight on
    }

    if (use) {
      items.useItem(kart);
      this.itemTimer = 1 + Math.random() * 2.5;
    }
  }
}
