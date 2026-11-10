// Chicken and kart 3D models, character definitions and driving physics.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { track, nearestIdx, lateralOffset, inMud, surfaceY, atRampLip, tunnelLane, barnLane, KERB_W } from './track.js';
import { audio } from './audio.js';

// Stats are the real physics numbers used while driving. The 0-1 "bars" shown
// on the character select screen are derived from these via statBars() below,
// so what you see always matches how the kart actually drives.
export const CHARACTERS = {
  chickpea: {
    key: 'chickpea', name: 'Chickpea',
    tagline: 'The all-rounder. No weakness, no specialty.',
    body: 0xf2c14e, kart: 0x3f9b46,
    maxSpeed: 30, accel: 24, steer: 2.4,
  },
  heyhey: {
    key: 'heyhey', name: 'HeiHei',
    tagline: 'Blistering top speed, but slow off the line and turns like a bus.',
    body: 0xffffff, kart: 0xd93636,
    maxSpeed: 36, accel: 17, steer: 1.95, sunglasses: true,
  },
  laya: {
    key: 'laya', name: 'Princess Laya',
    tagline: 'Razor handling and a rocket launch, but low top speed.',
    body: 0xfbe3cf, kart: 0xe86fb4,
    maxSpeed: 27, accel: 31, steer: 3.05, crown: true,
  },
};

// Map the real physics stats onto 0-1 bars for the select screen. Single source
// of truth so the bars can never disagree with how the kart actually drives.
export function statBars(def) {
  const norm = (v, lo, hi) => Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));
  return {
    Speed: norm(def.maxSpeed, 25, 37),
    Acceleration: norm(def.accel, 15, 33),
    Handling: norm(def.steer, 1.7, 3.1),
  };
}

// Fancy racers earned by winning a Grand Prix. They start locked and are
// revealed one at a time on the character select screen, in this object's order.
// `tier` decides how each is earned: 'gp' racers come from any cup win;
// 'extreme' racers demand a clean sweep (winning every race) of a four-track
// Grand Prix on Extreme difficulty. Summit, the lone extreme legend, sits last
// as the game's ultimate grand prize.
export const UNLOCKABLES = {
  sir: {
    key: 'sir', name: 'Sir Cluckington', locked: true, tier: 'gp',
    tagline: 'A dapper gentleman. Quick all round with a fine top gear.',
    body: 0xfff0d8, kart: 0x2b2b33, maxSpeed: 32, accel: 23, steer: 2.35,
    tophat: true, bowtie: true,
  },
  disco: {
    key: 'disco', name: 'Disco Diva', locked: true, tier: 'gp',
    tagline: 'Lightning launch and dazzling handling. Top speed? Not so much.',
    body: 0xf2c200, kart: 0xff4fae, maxSpeed: 28, accel: 31, steer: 2.9,
    crown: true, sunglasses: true,
  },
  captain: {
    key: 'captain', name: 'Captain Cluck', locked: true, tier: 'gp',
    tagline: 'A heavyweight powerhouse. Mighty fast, but a beast to steer.',
    body: 0xff5a3c, kart: 0x2a4cd0, maxSpeed: 34, accel: 21, steer: 2.2,
    cape: true, capeColor: 0xd81e3a, mask: true, maskColor: 0x12246e,
  },
  lava: {
    key: 'lava', name: 'Lava Lou', locked: true, tier: 'gp',
    tagline: 'Forged in the fire of Ngauruhoe. The fastest flat-out, but sluggish and stubborn.',
    body: 0xff5a1e, kart: 0x201510, maxSpeed: 35, accel: 20, steer: 2.1,
    sunglasses: true, cape: true, capeColor: 0xff7a1a,
  },
  // The ultimate legend: only a clean sweep of all four tracks on Extreme
  // reveals her. Strong everywhere, with no real weakness.
  summit: {
    key: 'summit', name: 'Summit', locked: true, tier: 'extreme',
    tagline: 'Queen of the snowy peaks. Untouchable: fast, nimble and quick off the line.',
    body: 0xeaf6ff, kart: 0x2e6fb0, maxSpeed: 34, accel: 29, steer: 2.95,
    crown: true, cape: true, capeColor: 0x9fd8ff,
  },
  // The motorbike: earned only by winning an Elimination tournament. Rides on
  // two wheels with `vehicle: 'bike'`, leans hard into corners, and trades a
  // little top speed for a rocket launch and razor steering. A genuinely
  // different machine that still keeps pace with the fastest karts.
  moto: {
    key: 'moto', name: 'Moto Cluck', locked: true, tier: 'tournament',
    vehicle: 'bike',
    tagline: 'Two wheels, all guts. Rockets off the line and carves corners, but skittish at the limit.',
    body: 0xff2d2d, kart: 0x18181c, maxSpeed: 32, accel: 30, steer: 2.9,
    helmet: true, helmetColor: 0xff2d2d,
  },
};

// Extra AI-only racers to fill the grid
export const AI_ROSTER = [
  { key: 'nugget', name: 'Nugget', body: 0xc97b3a, kart: 0xf2a33c, maxSpeed: 30, accel: 24, steer: 2.4 },
  { key: 'drumstick', name: 'Drumstick', body: 0x7a4a21, kart: 0x3a6fd8, maxSpeed: 30, accel: 24, steer: 2.4 },
  { key: 'hennifer', name: 'Hennifer', body: 0x3a3a3a, kart: 0x8e44ad, maxSpeed: 30, accel: 24, steer: 2.4 },
  { key: 'eggbert', name: 'Eggbert', body: 0xf6f1e0, kart: 0xf2d22e, maxSpeed: 30, accel: 24, steer: 2.4 },
  { key: 'colonel', name: 'Colonel Cluck', body: 0xb8b8b8, kart: 0x8c2f2f, maxSpeed: 30, accel: 24, steer: 2.4 },
];

const SPIN_DURATION = 1.25;
const BOOST_DURATION = 2.4;
const BOOST_MULT = 1.45;
const HOP_TIME = 0.24;
export const MAX_CORN = 10;
// Seconds of drifting needed to reach each mini-turbo level, and what each
// level pays out when you let go: [boost seconds, speed multiplier].
const DRIFT_LEVELS = [0.8, 1.8, 3.0];
const DRIFT_PAYOUT = [null, [0.75, 1.26], [1.3, 1.32], [1.95, 1.38]];

export class Kart {
  constructor(scene, def, isPlayer) {
    this.def = def;
    this.isPlayer = isPlayer;
    this.scene = scene;

    this.model = buildChickenKart(def);
    scene.add(this.model.group);

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.steerVisual = 0;
    this.steerSmooth = 0;

    this.spinT = 0;
    this.boostT = 0;
    this.boostMult = BOOST_MULT;
    this.vy = 0;          // vertical speed (jumps + landing)
    this.airborne = false; // off the ground after a ramp launch
    this.item = null;     // 'mine' | 'missile' | 'boost' | 'llama' | 'egg' | 'shield' | 'chilli' | 'crow'
    this.forcedItem = null; // set by a special box to override the random roll
    this.rollT = 0;       // item roulette timer

    // Drift + mini-turbo. driftDir is +1 (left) / -1 (right) while sliding.
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.driftHeld = false;
    this.driftVis = 0;
    this.hopT = 0;

    // Jump tricks
    this.airT = 0;
    this.trickDone = false;
    this.trickT = 0;
    this.landT = 0;

    // Status effects
    this.corn = 0;        // golden corn collected: each one adds a little top speed
    this.shield = false;  // an eggshell bubble that soaks up one hit
    this.shieldT = 0;
    this.invulnT = 0;     // brief safety after a crash so hits cannot chain
    this.slowT = 0;       // startled by a rooster crow: squashed and slow
    this.chilliT = 0;     // red-hot: fast, invincible and bashes rivals aside
    this.splatT = 0;      // egg on your face
    this.stallT = 0;      // bogged down after a wheelspin start
    this.slipT = 0;       // slipstream charge from tucking in behind a rival
    this.padCooldown = 0;
    this.bumpCooldown = 0;
    this.events = [];     // one-frame happenings for the effects + HUD to react to

    // Race progress (managed by race.js)
    this.idx = 0;     // freshest nearest sample, updated every physics step
    this.raceIdx = 0; // only advanced by race.js so lap/checkpoint crossings are seen
    this.lap = 0;
    this.cp = [false, false, false];
    this.total = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapStart = 0;   // clock time when the current lap began (set at GO)
    this.lapTimes = [];  // completed lap durations this race, in seconds
    this.bestLap = null; // fastest completed lap this race, in seconds
    this.rank = 1;
    this.wrongAccum = 0;
    this.wrongWay = false;

    this.onGrass = false;
    this.offRoad = false;  // on grass or in the mud (used for dust puffs)

    this.aiFactor = 1;    // rubber band multiplier set by AI driver (1 for player)
    this.aiInput = { throttle: 0, steer: 0, brake: 0 };
    this.wallCooldown = 0;
    this.time = Math.random() * 100; // desync idle animations
    this.blinkT = 1 + Math.random() * 3;
  }

  forward(out) {
    return (out || new THREE.Vector3()).set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get boosting() { return this.boostT > 0; }

  placeAt(slot) {
    this.pos.copy(slot.pos);
    this.heading = slot.heading;
    this.idx = slot.idx;
    this.raceIdx = slot.idx;
    this.total = slot.idx - track.N; // negative until the start line is crossed
    this.updateVisuals(0);
  }

  // Crash out. Returns false if the hit was shrugged off (already spinning,
  // briefly invulnerable, red-hot, or absorbed by a shield).
  spinOut() {
    if (this.spinT > 0 || this.invulnT > 0 || this.chilliT > 0) return false;
    if (this.shield) { this.popShield(); return false; }
    this.spinT = SPIN_DURATION;
    this.boostT = 0;
    this.speed *= 0.3;
    this.cancelDrift();
    const lost = Math.min(3, this.corn);
    this.corn -= lost;
    this.events.push({ type: 'spin', lost });
    return true;
  }

  popShield() {
    this.shield = false;
    this.shieldT = 0;
    this.invulnT = 0.9;
    this.events.push({ type: 'shieldPop' });
    audio.play('shieldPop');
  }

  // Startled by a rooster crow: squashed flat and slow for a few seconds.
  startle(dur) {
    if (this.invulnT > 0 || this.chilliT > 0 || this.finished) return false;
    if (this.shield) { this.popShield(); return false; }
    this.slowT = dur;
    this.boostT = 0;
    this.cancelDrift();
    return true;
  }

  applyBoost(dur = BOOST_DURATION, mult = BOOST_MULT) {
    // A stronger boost always wins; a weaker one only tops up the timer.
    if (this.boostT <= 0 || mult >= this.boostMult) this.boostMult = mult;
    this.boostT = Math.max(this.boostT, dur);
  }

  addCorn() {
    if (this.corn < MAX_CORN) this.corn++;
  }

  cancelDrift() {
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
  }

  // Let go of a drift: cash the charge in for a mini-turbo.
  releaseDrift() {
    const pay = DRIFT_PAYOUT[this.driftLevel];
    if (pay) {
      this.applyBoost(pay[0], pay[1]);
      this.events.push({ type: 'miniturbo', level: this.driftLevel });
      if (this.isPlayer) audio.play('miniturbo');
    }
    this.cancelDrift();
  }

  // Player drift handling. Tap the drift button for a little hop; hold it while
  // steering and the kart slides. The longer the slide, the bigger the boost.
  updateDrift(dt, input) {
    const held = !!input.drift;
    const pressed = held && !this.driftHeld;
    this.driftHeld = held;

    if (pressed) {
      if (this.airborne) this.tryTrick();
      else if (this.hopT <= 0) {
        this.hopT = HOP_TIME;
        if (this.isPlayer) audio.play('hop');
      }
    }

    const fastEnough = this.speed > this.def.maxSpeed * 0.42;
    if (!this.driftDir) {
      if (held && !this.airborne && this.hopT <= HOP_TIME * 0.4 && fastEnough && Math.abs(input.steer) > 0.3) {
        this.driftDir = Math.sign(input.steer);
        this.driftCharge = 0;
        this.driftLevel = 0;
      }
      return;
    }

    if (!held) { this.releaseDrift(); return; }
    if (!fastEnough) { this.cancelDrift(); return; }
    if (this.airborne) return; // the slide (and its charge) carries over a jump

    const into = input.steer * this.driftDir; // 1 = steering into the slide
    this.driftCharge += dt * (0.72 + 0.5 * into) * (this.offRoad ? 0.4 : 1);
    let level = 0;
    for (const t of DRIFT_LEVELS) if (this.driftCharge >= t) level++;
    if (level > this.driftLevel) {
      this.driftLevel = level;
      this.events.push({ type: 'driftLevel', level });
      if (this.isPlayer) audio.play('spark' + level);
    }
  }

  // Pull a trick off a ramp: press drift just as you take off.
  tryTrick() {
    if (!this.airborne || this.trickDone || this.airT > 0.55) return;
    this.trickDone = true;
    this.trickT = 0.55;
    this.events.push({ type: 'trick' });
    if (this.isPlayer) audio.play('trick');
  }

  update(dt, input) {
    this.time += dt;
    if (this.wallCooldown > 0) this.wallCooldown -= dt;
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (this.bumpCooldown > 0) this.bumpCooldown -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.hopT > 0) this.hopT -= dt;
    if (this.trickT > 0) this.trickT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.chilliT > 0) this.chilliT -= dt;
    if (this.splatT > 0) this.splatT -= dt;
    if (this.stallT > 0) this.stallT -= dt;
    if (this.shield) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.shield = false;
    }

    const lat = lateralOffset(this.pos, this.idx);
    const onGrass = Math.abs(lat) > track.roadHalf + KERB_W;
    const inTheMud = !onGrass && inMud(this.pos);
    let surfaceMult = 1;
    if (onGrass) surfaceMult = 0.5;
    else if (inTheMud) surfaceMult = 0.45;
    this.onGrass = onGrass;
    this.offRoad = onGrass || inTheMud;

    if (this.spinT > 0) {
      // Spinning out: no control, bleed speed
      this.spinT -= dt;
      this.speed *= Math.max(0, 1 - 2.2 * dt);
      this.driftHeld = !!input.drift;
      if (this.spinT <= 0) this.invulnT = 1.6; // a moment of safety to get going again
    } else {
      if (input.drift !== undefined) this.updateDrift(dt, input);

      const boosting = this.boostT > 0;
      // A boost powers straight through grass and mud.
      if (boosting) surfaceMult = Math.max(surfaceMult, 0.88);
      const cornMult = 1 + 0.006 * this.corn;
      const slowMult = this.slowT > 0 ? 0.55 : 1;
      const maxS = this.def.maxSpeed * surfaceMult * (boosting ? this.boostMult : 1)
        * this.aiFactor * cornMult * slowMult;

      if (input.throttle > 0 || boosting) {
        const stall = this.stallT > 0 ? 0.3 : 1;
        this.speed += this.def.accel * (boosting ? 1.7 : 1) * stall * dt;
      } else if (input.brake > 0) {
        this.speed -= 38 * dt;
      } else {
        this.speed -= this.speed * 1.1 * dt; // coast down
      }
      if (this.speed > maxS) this.speed += (maxS - this.speed) * 4 * dt;
      this.speed = Math.max(-8, this.speed);

      // A touch of smoothing so keyboard steering feels weighty, not twitchy
      this.steerSmooth += (input.steer - this.steerSmooth) * Math.min(1, 16 * dt);
      const steerInput = this.steerSmooth;

      // Steering: weak at a standstill, slightly heavier at top speed
      const grip = Math.min(1, Math.abs(this.speed) / 6) * (1 - 0.25 * Math.min(1, Math.abs(this.speed) / this.def.maxSpeed));
      const dir = this.speed < 0 ? -1 : 1;
      if (this.driftDir && input.drift !== undefined) {
        // Sliding: always turning into the corner. Steer in to tighten the
        // line, steer out to run wide.
        const into = steerInput * this.driftDir;
        this.heading += this.driftDir * (0.66 + 0.56 * into) * this.def.steer * grip * dt;
      } else {
        this.heading += steerInput * this.def.steer * grip * dir * dt;
      }
      this.steerVisual += (input.steer - this.steerVisual) * Math.min(1, 10 * dt);
    }

    // Move
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;

    // Keep the progress index roughly fresh for surface and fence checks
    this.idx = nearestIdx(this.pos, this.idx);

    this.collideFence();
    this.collideBales();
    this.collideSplitWalls();
    this.updateVertical(dt);
    this.checkPads();
    this.updateVisuals(dt);
  }

  // Boost pads: glowing arrows on the road that fling you forward.
  checkPads() {
    if (this.airborne || this.padCooldown > 0 || this.spinT > 0) return;
    for (const pad of track.pads) {
      const dx = this.pos.x - pad.pos.x;
      const dz = this.pos.z - pad.pos.z;
      if (dx * dx + dz * dz < pad.r * pad.r) {
        this.applyBoost(1.1, 1.4);
        this.padCooldown = 1.2;
        this.events.push({ type: 'pad' });
        if (this.isPlayer) audio.play('pad');
        return;
      }
    }
  }

  // Follow the ground height (tunnel dip), launch off the ramp lip, and fall
  // back down under gravity when airborne.
  updateVertical(dt) {
    const groundY = surfaceY(this.idx, lateralOffset(this.pos, this.idx));
    if (this.airborne) {
      this.airT += dt;
      this.vy -= 30 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.vy = 0;
        this.airborne = false;
        this.landT = 0.28;
        this.events.push({ type: 'land', trick: this.trickDone });
        if (this.trickDone) {
          this.applyBoost(1.05, 1.34);
          if (this.isPlayer) audio.play('miniturbo');
        } else if (this.isPlayer) {
          audio.play('land');
        }
        this.trickDone = false;
      }
    } else {
      this.pos.y = groundY;
      if (this.spinT <= 0 && Math.abs(this.speed) > 8 && atRampLip(this.idx)) {
        this.airborne = true;
        this.airT = 0;
        this.trickDone = false;
        this.vy = 13 + Math.min(Math.abs(this.speed), 30) * 0.15; // big launch
        if (this.isPlayer) audio.play('jump');
        // Hopping a split second early still counts as a trick
        if (this.hopT > 0) this.tryTrick();
      }
    }
  }

  collideFence() {
    const s = track.samples[this.idx];
    const lat = lateralOffset(this.pos, this.idx);
    if (Math.abs(lat) > track.limit) {
      const over = Math.abs(lat) - track.limit;
      const sign = Math.sign(lat);
      this.pos.x -= s.normal.x * over * sign;
      this.pos.z -= s.normal.z * over * sign;
      if (this.wallCooldown <= 0) {
        this.speed *= 0.45;
        this.wallCooldown = 0.5;
        this.cancelDrift();
        this.events.push({ type: 'wall' });
      }
      // Nudge the kart back toward the direction of travel
      const trackHeading = Math.atan2(s.tan.x, s.tan.z);
      this.heading += angleDiff(trackHeading, this.heading) * 0.12;
    }
  }

  // The outer walls of the covered lanes are solid: shove the kart back into
  // its lane if it tries to slip out sideways through the tunnel's dirt wall
  // (left, negative lateral) or the barn's wall (right, positive lateral).
  collideSplitWalls() {
    const lat = lateralOffset(this.pos, this.idx);
    if (lat < 0) {
      const lane = tunnelLane(this.idx);
      if (lane && lat < lane.outer) this.pushOffWall(lane.outer - lat);
    } else {
      const lane = barnLane(this.idx);
      if (lane && lat > lane.outer) this.pushOffWall(-(lat - lane.outer));
    }
  }

  // Nudge the kart sideways by `delta` along the track normal and scrub speed
  pushOffWall(delta) {
    const s = track.samples[this.idx];
    this.pos.x += s.normal.x * delta;
    this.pos.z += s.normal.z * delta;
    if (this.wallCooldown <= 0) {
      this.speed *= 0.55;
      this.wallCooldown = 0.4;
      this.cancelDrift();
      this.events.push({ type: 'wall' });
    }
  }

  collideBales() {
    for (const b of track.bales) {
      const dx = this.pos.x - b.pos.x;
      const dz = this.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = b.r + 1.0;
      if (d < minD && d > 0.0001) {
        const push = (minD - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
        if (this.wallCooldown <= 0) {
          this.speed *= 0.4;
          this.wallCooldown = 0.5;
          this.cancelDrift();
          this.events.push({ type: 'wall' });
        }
      }
    }
  }

  updateVisuals(dt) {
    const m = this.model;
    m.group.position.copy(this.pos);

    let spinOffset = 0;
    if (this.spinT > 0) {
      spinOffset = (1 - this.spinT / SPIN_DURATION) * Math.PI * 4;
    }
    m.group.rotation.y = this.heading + spinOffset;

    // Flicker while briefly invulnerable after a crash
    m.group.visible = !(this.invulnT > 0 && this.spinT <= 0 && Math.floor(this.time * 16) % 2 === 0);

    // The body slews out sideways in a drift, hops, pitches in the air and
    // spins through a trick. All of it is for show: physics uses `heading`.
    this.driftVis += (this.driftDir * 0.46 - this.driftVis) * Math.min(1, 9 * dt);
    let bodyYaw = this.driftVis;
    let bodyRoll = 0;
    if (this.trickT > 0) {
      const t = 1 - this.trickT / 0.55;
      bodyYaw += t * Math.PI * 2;
      bodyRoll = Math.sin(t * Math.PI) * 0.35;
    }
    m.body.rotation.y = bodyYaw;

    // Karts give a subtle body roll; the motorbike leans hard into the corner.
    const speedNorm = Math.min(1, Math.abs(this.speed) / this.def.maxSpeed);
    const lean = this.def.vehicle === 'bike'
      ? this.steerVisual * 0.42 + this.driftVis * 0.4
      : -this.steerVisual * 0.07 - this.driftVis * 0.18;
    m.body.rotation.z = lean * Math.min(1, Math.abs(this.speed) / 15) + bodyRoll;
    m.body.rotation.x = this.airborne ? Math.max(-0.45, Math.min(0.45, -this.vy * 0.03)) : 0;

    const hop = this.hopT > 0 ? Math.sin(Math.PI * (1 - this.hopT / HOP_TIME)) * 0.5 : 0;
    m.body.position.y = hop;

    // Squash and stretch: flatten on landing, squashed while startled
    let sy = 1;
    if (this.landT > 0) sy = 1 - 0.22 * Math.sin(Math.PI * (this.landT / 0.28));
    if (this.slowT > 0) sy *= 0.62 + 0.04 * Math.sin(this.time * 30);
    const sxz = 1 + (1 - sy) * 0.5;
    m.body.scale.set(sxz, sy, sxz);

    const wheelSpin = (this.speed * dt) / 0.45;
    for (const w of m.wheels) w.rotation.x += wheelSpin;
    for (const p of m.steerPivots) p.rotation.y = this.steerVisual * 0.42;

    // Chicken bobs with speed and flaps wings when boosting or going fast
    m.chicken.position.y = m.chickenBaseY + Math.sin(this.time * 11) * 0.05 * speedNorm;
    const excited = this.boostT > 0 || this.spinT > 0 || this.trickT > 0 || this.airborne;
    const flap = excited
      ? Math.sin(this.time * 26) * 1.1
      : Math.sin(this.time * 9) * 0.25 * speedNorm;
    m.wings[0].rotation.z = -0.2 - Math.max(0, flap);
    m.wings[1].rotation.z = 0.2 + Math.max(0, flap);

    // The head looks into the corner and tips back under a boost
    m.head.rotation.y = this.steerVisual * 0.4 + this.driftVis * 0.5;
    m.head.rotation.z = -this.steerVisual * 0.12;
    m.head.rotation.x = this.boostT > 0 ? -0.22 : (this.spinT > 0 ? Math.sin(this.time * 20) * 0.25 : 0);

    // Blinking (and eyes screwed shut while crashing or startled)
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + Math.random() * 3.5;
    const shut = this.blinkT < 0 || this.spinT > 0 || this.slowT > 0;
    for (const lid of m.lids) lid.visible = shut;

    if (m.cape) m.cape.rotation.x = 0.25 + speedNorm * 0.75 + Math.sin(this.time * 14) * 0.08 * speedNorm;

    // Exhaust flames while boosting
    const fl = this.boostT > 0 ? 0.75 + Math.random() * 0.6 : 0;
    for (const f of m.flames) {
      f.visible = fl > 0;
      if (fl > 0) f.scale.set(1, 1, fl * (this.chilliT > 0 ? 1.7 : 1));
    }

    // Shield bubble
    m.shield.visible = this.shield;
    if (this.shield) {
      const flicker = this.shieldT < 2.5 ? (Math.floor(this.time * 10) % 2 ? 0.12 : 0.32) : 0.3;
      m.shield.material.opacity = flicker;
      m.shield.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
      m.shield.rotation.y += dt * 1.5;
    }

    // Red-hot glow for the chilli
    if (this.chilliT > 0) {
      const g = 0.45 + 0.35 * Math.sin(this.time * 18);
      m.paint.emissive.setRGB(g * 1.6, g * 0.35, 0);
      this.hot = true;
    } else if (this.hot) {
      m.paint.emissive.setRGB(0, 0, 0);
      this.hot = false;
    }
  }

  dispose() {
    this.scene.remove(this.model.group);
    this.model.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((mt) => mt.dispose());
        else o.material.dispose();
      }
    });
  }
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Simple circle push so karts cannot drive through each other. A red-hot
// (chilli) kart sends anything it touches spinning.
export function resolveKartCollisions(karts) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue; // one is jumping over the other
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 2.2;
      if (d < minD && d > 0.0001) {
        const push = (minD - d) / d / 2;
        a.pos.x -= dx * push; a.pos.z -= dz * push;
        b.pos.x += dx * push; b.pos.z += dz * push;
        if (a.chilliT > 0 && b.chilliT <= 0) { if (b.spinOut()) audio.play('knock'); }
        else if (b.chilliT > 0 && a.chilliT <= 0) { if (a.spinOut()) audio.play('knock'); }
        else if (a.bumpCooldown <= 0 && b.bumpCooldown <= 0 && Math.abs(a.speed - b.speed) > 3) {
          a.bumpCooldown = b.bumpCooldown = 0.5;
          const ev = { type: 'bump', x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
          a.events.push(ev);
          if (a.isPlayer || b.isPlayer) audio.play('bump');
        }
      }
    }
  }
}

// A kart coming down from a jump onto another kart crashes it (and bounces off)
export function resolveJumpStomps(karts) {
  for (const a of karts) {
    if (!a.airborne || a.vy >= 0) continue; // must be descending
    for (const b of karts) {
      if (b === a) continue;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      if (dx * dx + dz * dz < 2.6 * 2.6 && a.pos.y > b.pos.y + 0.8) {
        if (b.spinOut()) {
          a.vy = 5; // bounce up off the victim
          audio.play('knock');
        }
        break;
      }
    }
  }
}

// Slipstream: tuck in close behind a rival and the hole they punch in the air
// pulls you along. Hold the tow for a moment and you get slung past them.
const _fa = new THREE.Vector3();
export function updateSlipstream(karts, dt) {
  for (const a of karts) {
    let towing = false;
    if (!a.airborne && a.spinT <= 0 && a.boostT <= 0 && a.speed > a.def.maxSpeed * 0.7) {
      a.forward(_fa);
      for (const b of karts) {
        if (b === a || b.speed < 12) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 9 || d2 > 17 * 17) continue;
        const d = Math.sqrt(d2);
        if ((dx * _fa.x + dz * _fa.z) / d < 0.95) continue; // must be dead ahead
        towing = true;
        break;
      }
    }
    if (towing) {
      a.slipT += dt;
      if (a.slipT > 1.3) {
        a.slipT = 0;
        a.applyBoost(1.25, 1.28);
        a.events.push({ type: 'slipstream' });
        if (a.isPlayer) audio.play('slip');
      }
    } else {
      a.slipT = Math.max(0, a.slipT - dt * 1.5);
    }
  }
}

/* ------------------------- model building ------------------------- */

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Glossy paint: a bright highlight where the sun catches the bodywork.
function gloss(color, shininess = 70) {
  return new THREE.MeshPhongMaterial({ color, shininess, specular: 0x555555 });
}

// Collects lots of little shapes and welds everything that shares a material
// into one mesh. A kart is built from ~60 parts; baking keeps that down to a
// handful of draw calls so six karts stay cheap to render.
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
class Baker {
  constructor() { this.byMat = new Map(); }

  add(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    _m4.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scale));
    g.applyMatrix4(_m4);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }

  build(parent, castShadow = true) {
    for (const [mat, geos] of this.byMat) {
      const merged = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      parent.add(mesh);
    }
    this.byMat.clear();
    return parent;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const HALF_PI = Math.PI / 2;

// Pick the right chassis for a racer. Most chickens drive a kart; the unlockable
// Moto Cluck rides a motorbike (`def.vehicle === 'bike'`). Both share the same
// chicken model and return the same shape, so the physics and animation code
// downstream never has to care which one it is.
export function buildChickenKart(def) {
  const model = def.vehicle === 'bike' ? buildMotorbike(def) : buildKart(def);

  // An eggshell-blue shield bubble, hidden until the shield item is used.
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.05, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shield.position.y = 1.15;
  shield.visible = false;
  model.group.add(shield);
  model.shield = shield;
  return model;
}

// Rocket-exhaust flame: an over-bright cone that only shows during a boost.
function buildFlame() {
  const geo = new THREE.ConeGeometry(0.17, 1.1, 8);
  geo.rotateX(-HALF_PI);        // point backwards (-z)
  geo.translate(0, 0, -0.55);   // grow from the pipe mouth
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.color.setRGB(2.6, 1.3, 0.35);
  const flame = new THREE.Mesh(geo, mat);
  flame.visible = false;
  return flame;
}

// One wheel: a pivot (so front wheels can steer) holding a spinner that rolls.
function buildWheel(r, w, tyreMat, hubMat, spokeMat) {
  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);
  new Baker()
    .add(cyl(r, r, w, 18), tyreMat, [0, 0, 0], [0, 0, HALF_PI])
    .add(cyl(r * 0.56, r * 0.56, w + 0.04, 14), hubMat, [0, 0, 0], [0, 0, HALF_PI])
    .add(box(w + 0.08, r * 0.96, 0.1), spokeMat)
    .add(box(w + 0.08, 0.1, r * 0.96), spokeMat)
    .build(spinner);
  return { pivot, spinner };
}

function buildKart(def) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = gloss(def.kart);
  const dark = lambert(0x26272d);
  const tyre = lambert(0x18181c);
  const trim = lambert(0xf6f1e4);
  const metal = gloss(0xc4cad4, 110);

  const b = new Baker();
  // Bodywork
  b.add(box(1.34, 0.38, 1.75), paint, [0, 0.63, -0.25]);
  b.add(box(0.92, 0.26, 1.05), paint, [0, 0.6, 1.0], [0.12, 0, 0]);
  b.add(sph(0.46), paint, [0, 0.52, 1.5], [0, 0, 0], [1, 0.36, 0.72]);
  for (const s of [-1, 1]) {
    b.add(new THREE.CapsuleGeometry(0.21, 0.95, 4, 10), paint, [s * 0.78, 0.57, -0.2], [HALF_PI, 0, 0]);
    b.add(box(0.06, 0.32, 0.5), paint, [s * 0.82, 1.46, -1.42]);
    b.add(box(0.07, 0.5, 0.07), dark, [s * 0.4, 1.24, -1.4]);
    b.add(cyl(0.085, 0.12, 0.55, 10), metal, [s * 0.27, 0.9, -1.58], [HALF_PI, 0, 0]);
    b.add(cyl(0.2, 0.2, 0.03, 14), trim, [s * 0.995, 0.6, -0.2], [0, 0, HALF_PI]);
  }
  b.add(box(1.66, 0.07, 0.44), paint, [0, 1.6, -1.42]);        // rear wing
  b.add(box(1.92, 0.08, 0.36), paint, [0, 0.36, 1.6]);         // front wing
  b.add(box(1.02, 0.74, 0.18), paint, [0, 1.02, -1.0], [-0.12, 0, 0]); // seat back
  b.add(box(0.26, 0.02, 1.0), trim, [0, 0.745, 1.0], [0.12, 0, 0]);    // racing stripe
  // Underpinnings
  b.add(box(1.5, 0.14, 2.7), dark, [0, 0.4, 0]);
  b.add(box(0.84, 0.42, 0.5), dark, [0, 0.86, -1.28]);
  b.add(cyl(0.035, 0.035, 0.55, 6), dark, [0, 0.9, 0.5], [0.68, 0, 0]);
  b.add(new THREE.TorusGeometry(0.21, 0.05, 6, 14), dark, [0, 1.07, 0.68], [-0.9, 0, 0]);
  b.add(cyl(0.06, 0.06, 1.9, 6), dark, [0, 0.42, 0.98], [0, 0, HALF_PI]);
  b.add(cyl(0.06, 0.06, 1.9, 6), dark, [0, 0.5, -0.98], [0, 0, HALF_PI]);
  b.add(cyl(0.07, 0.07, 1.5, 8), metal, [0, 0.45, -1.52], [0, 0, HALF_PI]);
  b.build(body);

  // Wheels: small steering fronts, chunky rears
  const wheels = [];
  const steerPivots = [];
  for (const [x, z, r, w, steers] of [
    [-0.94, 0.98, 0.42, 0.34, true], [0.94, 0.98, 0.42, 0.34, true],
    [-0.97, -0.98, 0.5, 0.44, false], [0.97, -0.98, 0.5, 0.44, false],
  ]) {
    const wh = buildWheel(r, w, tyre, trim, paint);
    wh.pivot.position.set(x, r, z);
    body.add(wh.pivot);
    wheels.push(wh.spinner);
    if (steers) steerPivots.push(wh.pivot);
  }

  const flames = [];
  for (const s of [-1, 1]) {
    const f = buildFlame();
    f.position.set(s * 0.27, 0.9, -1.85);
    body.add(f);
    flames.push(f);
  }

  const ck = buildChicken(def);
  const chickenBaseY = 1.14;
  ck.chicken.position.set(0, chickenBaseY, -0.28);
  body.add(ck.chicken);

  return { group, body, wheels, steerPivots, flames, paint, chickenBaseY, ...ck };
}

// A sporty two-wheeler. `wheels` holds the front and rear wheels so they still
// spin with speed, and the chicken sits astride the tank wearing a crash helmet.
function buildMotorbike(def) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = gloss(def.kart);
  const dark = lambert(0x222226);
  const tyre = lambert(0x18181c);
  const accent = gloss(def.body);
  const chrome = gloss(0xc4cad4, 110);
  const trim = lambert(0xf6f1e4);

  const wheels = [];
  const steerPivots = [];
  for (const z of [1.15, -1.15]) {
    const wh = buildWheel(0.6, 0.3, tyre, trim, accent);
    wh.pivot.position.set(0, 0.6, z);
    body.add(wh.pivot);
    wheels.push(wh.spinner);
    if (z > 0) steerPivots.push(wh.pivot);
  }

  const b = new Baker();
  b.add(box(0.34, 0.3, 2.2), paint, [0, 0.85, 0]);                       // spine
  b.add(sph(0.36), accent, [0, 1.08, 0.3], [0, 0, 0], [0.8, 0.62, 1.4]); // tank
  b.add(box(0.5, 0.2, 0.85), dark, [0, 1.0, -0.6]);                      // seat
  b.add(box(0.4, 0.26, 0.5), accent, [0, 1.12, -1.08], [0.3, 0, 0]);     // tail cowl
  b.add(box(0.12, 1.05, 0.12), dark, [0, 0.95, 1.12], [-0.32, 0, 0]);    // fork
  b.add(box(0.95, 0.1, 0.1), dark, [0, 1.36, 1.02]);                     // bars
  b.add(cone(0.3, 0.7, 12), accent, [0, 1.0, 1.35], [HALF_PI, 0, 0]);    // fairing
  b.add(box(0.5, 0.36, 0.5), dark, [0, 0.62, 0.1]);                      // engine
  b.add(cyl(0.08, 0.1, 0.9, 8), chrome, [0.26, 0.62, -0.95], [HALF_PI, 0, 0]);
  b.build(body);

  const flame = buildFlame();
  flame.position.set(0.26, 0.62, -1.4);
  body.add(flame);

  const ck = buildChicken(def);
  const chickenBaseY = 1.18;
  ck.chicken.position.set(0, chickenBaseY, -0.3);
  body.add(ck.chicken);

  return { group, body, wheels, steerPivots, flames: [flame], paint, chickenBaseY, ...ck };
}

// Build the chicken that perches on any vehicle, including its hat/accessory
// flair. Returns the chicken group plus the parts the animation code moves:
// the two wings, the head (which turns to look into corners), the eyelids
// (for blinking) and the cape (which flutters with speed).
function buildChicken(def) {
  const bodyMat = lambert(def.body);
  const darkMat = lambert(0x1c1c22);
  const whiteMat = lambert(0xffffff);
  const beakMat = lambert(0xf59a1b);
  const redMat = lambert(0xe2402c);
  const pinkMat = lambert(0xff9db0);

  const chicken = new THREE.Group();

  // Body, neck fluff and a fan of tail feathers
  const b = new Baker();
  b.add(sph(0.55, 16, 12), bodyMat, [0, 0, -0.14], [0, 0, 0], [1, 1.1, 1.26]);
  b.add(sph(0.36, 12, 10), bodyMat, [0, 0.46, 0.12]);
  for (const [x, y, rz] of [[-0.2, 0.36, 0.38], [0, 0.48, 0], [0.2, 0.36, -0.38]]) {
    b.add(cone(0.17, 0.66, 6), bodyMat, [x, y, -0.76], [-0.75, 0, rz], [1, 1, 0.45]);
  }
  if (def.bowtie) {
    const tieMat = lambert(0xc0392b);
    for (const s of [-1, 1]) {
      b.add(cone(0.16, 0.26, 4), tieMat, [s * 0.13, 0.4, 0.5], [0, 0, s * HALF_PI]);
    }
    b.add(box(0.1, 0.13, 0.12), tieMat, [0, 0.4, 0.52]);
  }
  b.build(chicken);

  // Wings (pivot at the shoulder so they can flap)
  const wings = [];
  for (const s of [-1, 1]) {
    const wingGeo = sph(0.34, 10, 8);
    wingGeo.scale(0.26, 0.86, 1.05);
    wingGeo.translate(0, -0.26, 0);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(s * 0.55, 0.3, -0.14);
    wing.rotation.z = s * 0.2;
    wing.castShadow = true;
    chicken.add(wing);
    wings.push(wing);
  }

  // Head: its own group so it can turn, with big cartoon eyes
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.26);
  chicken.add(head);
  const h = new Baker();
  h.add(sph(0.4, 16, 12), bodyMat);
  for (const s of [-1, 1]) {
    h.add(sph(0.125, 10, 8), whiteMat, [s * 0.17, 0.1, 0.3]);
    h.add(sph(0.068, 8, 6), darkMat, [s * 0.178, 0.105, 0.398]);
    h.add(sph(0.024, 6, 4), whiteMat, [s * 0.155, 0.14, 0.452]);
    h.add(sph(0.075, 8, 6), pinkMat, [s * 0.3, -0.06, 0.2], [0, 0, 0], [0.5, 0.8, 1]);
  }
  h.add(cone(0.14, 0.36, 8), beakMat, [0, -0.02, 0.52], [HALF_PI, 0, 0]);
  h.add(cone(0.1, 0.22, 8), beakMat, [0, -0.1, 0.44], [HALF_PI, 0, 0]);
  h.add(sph(0.085, 8, 6), redMat, [0, -0.24, 0.36], [0, 0, 0], [1, 1.35, 1]);

  // Comb (skipped under headwear, which covers the top of the head instead)
  if (!def.helmet && !def.crown && !def.tophat) {
    for (const [z, y, r] of [[0.16, 0.38, 0.1], [0.02, 0.45, 0.125], [-0.13, 0.4, 0.105]]) {
      h.add(sph(r, 8, 6), redMat, [0, y, z]);
    }
  }

  if (def.crown) {
    const gold = gloss(0xf2c200, 100);
    h.add(cyl(0.2, 0.22, 0.14, 10), gold, [0, 0.42, 0]);
    for (const a of [-0.9, 0, 0.9, 2.2, -2.2]) {
      h.add(cone(0.06, 0.18, 6), gold, [Math.sin(a) * 0.17, 0.56, Math.cos(a) * 0.17]);
    }
  }

  if (def.sunglasses) {
    const shade = gloss(0x101014, 120);
    h.add(box(0.66, 0.17, 0.12), shade, [0, 0.1, 0.44]);
    for (const s of [-1, 1]) h.add(box(0.05, 0.05, 0.4), shade, [s * 0.34, 0.12, 0.24]);
  }

  if (def.tophat) {
    const black = lambert(0x1a1a1a);
    h.add(cyl(0.36, 0.36, 0.06, 16), black, [0, 0.38, 0]);
    h.add(cyl(0.25, 0.25, 0.46, 16), black, [0, 0.64, 0]);
    h.add(cyl(0.255, 0.255, 0.1, 16), redMat, [0, 0.48, 0]);
  }

  if (def.mask) {
    // A superhero band around the head at eye level; the eyes poke through.
    const maskMat = lambert(def.maskColor ?? 0x2a4cd0);
    h.add(new THREE.TorusGeometry(0.385, 0.085, 6, 20), maskMat, [0, 0.1, 0], [HALF_PI, 0, 0], [1, 1, 1.3]);
  }

  // A racing crash helmet: a glossy dome over the head with a dark visor.
  if (def.helmet) {
    const helmetMat = gloss(def.helmetColor ?? 0xff2d2d, 100);
    h.add(sph(0.46, 16, 14), helmetMat, [0, 0.06, -0.04], [0, 0, 0], [1.05, 1.08, 1.05]);
    h.add(box(0.56, 0.2, 0.18), gloss(0x101018, 120), [0, 0.08, 0.38]);
  }
  h.build(head);

  // Eyelids: hidden most of the time, shown for a blink
  const lids = [];
  for (const s of [-1, 1]) {
    const lid = new THREE.Mesh(sph(0.135, 10, 8), bodyMat);
    lid.position.set(s * 0.17, 0.1, 0.305);
    lid.visible = false;
    head.add(lid);
    lids.push(lid);
  }

  let cape = null;
  if (def.cape) {
    const capeMat = new THREE.MeshLambertMaterial({
      color: def.capeColor ?? 0xd81e3a, side: THREE.DoubleSide,
    });
    const capeGeo = new THREE.PlaneGeometry(0.95, 1.2, 1, 3);
    capeGeo.translate(0, -0.6, 0); // hinge at the shoulders
    cape = new THREE.Mesh(capeGeo, capeMat);
    cape.position.set(0, 0.62, -0.5);
    cape.rotation.x = 0.25;
    cape.castShadow = true;
    chicken.add(cape);
  }

  return { chicken, wings, head, lids, cape };
}
