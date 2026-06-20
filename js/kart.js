// Chicken and kart 3D models, character definitions and driving physics.

import * as THREE from 'three';
import { track, nearestIdx, lateralOffset, inMud, surfaceY, atRampLip, tunnelLane, barnLane } from './track.js';
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

const SPIN_DURATION = 1.4;
const BOOST_DURATION = 2.4;
const BOOST_MULT = 1.45;

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

    this.spinT = 0;
    this.boostT = 0;
    this.vy = 0;          // vertical speed (jumps + landing)
    this.airborne = false; // off the ground after a ramp launch
    this.item = null;     // 'mine' | 'missile' | 'boost' | 'llama'
    this.forcedItem = null; // set by a special box to override the random roll
    this.rollT = 0;       // item roulette timer

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
  }


  forward(out) {
    return (out || new THREE.Vector3()).set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  placeAt(slot) {
    this.pos.copy(slot.pos);
    this.heading = slot.heading;
    this.idx = slot.idx;
    this.raceIdx = slot.idx;
    this.total = slot.idx - track.N; // negative until the start line is crossed
    this.updateVisuals(0);
  }

  spinOut() {
    if (this.spinT > 0) return false;
    this.spinT = SPIN_DURATION;
    this.boostT = 0;
    this.speed *= 0.3;
    return true;
  }

  applyBoost() {
    this.boostT = BOOST_DURATION;
  }

  update(dt, input) {
    this.time += dt;
    if (this.wallCooldown > 0) this.wallCooldown -= dt;
    if (this.boostT > 0) this.boostT -= dt;

    const lat = lateralOffset(this.pos, this.idx);
    const onGrass = Math.abs(lat) > track.roadHalf;
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
    } else {
      const boosting = this.boostT > 0;
      const maxS = this.def.maxSpeed * surfaceMult * (boosting ? BOOST_MULT : 1) * this.aiFactor;

      if (input.throttle > 0 || boosting) {
        this.speed += this.def.accel * (boosting ? 1.6 : 1) * dt;
      } else if (input.brake > 0) {
        this.speed -= 38 * dt;
      } else {
        this.speed -= this.speed * 1.1 * dt; // coast down
      }
      if (this.speed > maxS) this.speed += (maxS - this.speed) * 4 * dt;
      this.speed = Math.max(-8, this.speed);

      const steerInput = input.steer;

      // Steering: weak at a standstill, slightly heavier at top speed
      const grip = Math.min(1, Math.abs(this.speed) / 6) * (1 - 0.25 * Math.min(1, Math.abs(this.speed) / this.def.maxSpeed));
      const dir = this.speed < 0 ? -1 : 1;
      this.heading += steerInput * this.def.steer * grip * dir * dt;
      this.steerVisual += (steerInput - this.steerVisual) * Math.min(1, 10 * dt);
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
    this.updateVisuals(dt);
  }

  // Follow the ground height (tunnel dip), launch off the ramp lip, and fall
  // back down under gravity when airborne.
  updateVertical(dt) {
    const groundY = surfaceY(this.idx, lateralOffset(this.pos, this.idx));
    if (this.airborne) {
      this.vy -= 30 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.vy = 0;
        this.airborne = false;
      }
    } else {
      this.pos.y = groundY;
      if (this.spinT <= 0 && Math.abs(this.speed) > 8 && atRampLip(this.idx)) {
        this.airborne = true;
        this.vy = 13 + Math.min(Math.abs(this.speed), 30) * 0.15; // big launch
        if (this.isPlayer) audio.play('jump');
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

    // Karts give a subtle body roll; the motorbike leans hard into the corner.
    const lean = this.def.vehicle === 'bike'
      ? this.steerVisual * 0.42
      : -this.steerVisual * 0.07;
    m.group.rotation.z = lean * Math.min(1, Math.abs(this.speed) / 15);
    m.group.rotation.x = this.airborne ? Math.max(-0.45, Math.min(0.45, -this.vy * 0.03)) : 0;

    const wheelSpin = (this.speed * dt) / 0.45;
    for (const w of m.wheels) w.rotation.x += wheelSpin;

    // Chicken bobs with speed and flaps wings when boosting or going fast
    const speedNorm = Math.min(1, Math.abs(this.speed) / this.def.maxSpeed);
    m.chicken.position.y = m.chickenBaseY + Math.sin(this.time * 11) * 0.05 * speedNorm;
    const flap = (this.boostT > 0 || this.spinT > 0)
      ? Math.sin(this.time * 26) * 1.1
      : Math.sin(this.time * 9) * 0.25 * speedNorm;
    m.wings[0].rotation.z = 0.25 + Math.max(0, flap);
    m.wings[1].rotation.z = -0.25 - Math.max(0, flap);
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

// Simple circle push so karts cannot drive through each other
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

/* ------------------------- model building ------------------------- */

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Pick the right chassis for a racer. Most chickens drive a kart; the unlockable
// Moto Cluck rides a motorbike (`def.vehicle === 'bike'`). Both share the same
// chicken model and return the same shape, so the physics and animation code
// downstream never has to care which one it is.
function buildChickenKart(def) {
  return def.vehicle === 'bike' ? buildMotorbike(def) : buildKart(def);
}

function buildKart(def) {
  const group = new THREE.Group();
  const kartMat = lambert(def.kart);
  const darkMat = lambert(0x333333);

  // Kart chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 2.7), kartMat);
  chassis.position.y = 0.55;
  chassis.castShadow = true;
  group.add(chassis);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.4), kartMat);
  bumper.position.set(0, 0.5, 1.45);
  group.add(bumper);

  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.25), kartMat);
  seatBack.position.set(0, 1.0, -1.05);
  group.add(seatBack);

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  const wheels = [];
  for (const [x, z] of [[-0.95, 0.95], [0.95, 0.95], [-0.95, -0.95], [0.95, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.45, z);
    group.add(w);
    wheels.push(w);
  }

  // Steering wheel
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), darkMat);
  wheel.position.set(0, 1.05, 0.7);
  wheel.rotation.x = -0.9;
  group.add(wheel);

  const { chicken, wings } = buildChicken(def);
  const chickenBaseY = 1.15;
  chicken.position.set(0, chickenBaseY, -0.25);
  group.add(chicken);

  return { group, wheels, wings, chicken, chickenBaseY };
}

// A sporty two-wheeler. `wheels` holds the front and rear wheels so they still
// spin with speed, and the chicken sits astride the tank wearing a crash helmet.
function buildMotorbike(def) {
  const group = new THREE.Group();
  const frameMat = lambert(def.kart);
  const darkMat = lambert(0x222226);
  const accentMat = lambert(def.body);
  const chromeMat = lambert(0xb8bcc4);

  // Front and rear wheels (axle along x, like the kart's, so they roll forward)
  const wheelGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.3, 16);
  const wheels = [];
  for (const z of [1.15, -1.15]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, 0.6, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }

  // Spine of the bike, plus a fuel tank and a low seat
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 2.2), frameMat);
  frame.position.set(0, 0.85, 0);
  frame.castShadow = true;
  group.add(frame);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.95), accentMat);
  tank.position.set(0, 1.06, 0.28);
  tank.castShadow = true;
  group.add(tank);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.85), darkMat);
  seat.position.set(0, 1.0, -0.6);
  group.add(seat);

  // Front fork and handlebars
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), darkMat);
  fork.position.set(0, 0.95, 1.12);
  fork.rotation.x = -0.32;
  group.add(fork);

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.1), darkMat);
  bars.position.set(0, 1.36, 1.02);
  group.add(bars);

  // A little nose fairing and a chrome exhaust pipe out the back
  const fairing = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 12), accentMat);
  fairing.rotation.x = Math.PI / 2;
  fairing.position.set(0, 1.0, 1.35);
  group.add(fairing);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8), chromeMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.26, 0.62, -0.95);
  group.add(exhaust);

  const { chicken, wings } = buildChicken(def);
  const chickenBaseY = 1.18;
  chicken.position.set(0, chickenBaseY, -0.3);
  group.add(chicken);

  return { group, wheels, wings, chicken, chickenBaseY };
}

// Build the chicken that perches on any vehicle, including its hat/accessory
// flair. Returns the group and its two wings (which the animation code flaps).
function buildChicken(def) {
  const darkMat = lambert(0x333333);
  const bodyMat = lambert(def.body);
  const beakMat = lambert(0xf28c28);
  const redMat = lambert(0xd8432f);

  const chicken = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), bodyMat);
  body.scale.set(1, 1.15, 1.3);
  body.position.set(0, 0, -0.15);
  body.castShadow = true;
  chicken.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), bodyMat);
  head.position.set(0, 0.78, 0.28);
  head.castShadow = true;
  chicken.add(head);

  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, darkMat);
    eye.position.set(s * 0.18, 0.88, 0.58);
    chicken.add(eye);
  }

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.76, 0.72);
  chicken.add(beak);

  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), redMat);
  wattle.position.set(0, 0.6, 0.62);
  chicken.add(wattle);

  // Comb (skipped under a helmet, which covers the head instead)
  if (!def.helmet) {
    const combGeo = new THREE.SphereGeometry(0.1, 8, 6);
    for (const [z, y] of [[0.14, 1.16], [0.0, 1.2], [-0.14, 1.14]]) {
      const c = new THREE.Mesh(combGeo, redMat);
      c.position.set(0, y, 0.28 + z);
      chicken.add(c);
    }
  }

  // Wings (pivot at the shoulder so they can flap)
  const wings = [];
  for (const s of [-1, 1]) {
    const wingGeo = new THREE.BoxGeometry(0.12, 0.5, 0.65);
    wingGeo.translate(0, -0.22, 0);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(s * 0.56, 0.25, -0.15);
    chicken.add(wing);
    wings.push(wing);
  }

  // Tail feathers
  for (const [ry, y] of [[-0.35, 0.35], [0, 0.45], [0.35, 0.35]]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.18), bodyMat);
    tail.position.set(ry * 0.5, y, -0.78);
    tail.rotation.x = -0.6;
    tail.rotation.z = ry;
    chicken.add(tail);
  }

  if (def.crown) {
    const gold = lambert(0xf2c200);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 10), gold);
    ring.position.set(0, 1.18, 0.28);
    chicken.add(ring);
    for (const a of [-0.7, 0, 0.7]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), gold);
      spike.position.set(Math.sin(a) * 0.15, 1.32, 0.28 + Math.cos(a) * 0.15 - 0.13);
      chicken.add(spike);
    }
  }

  if (def.sunglasses) {
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.1), darkMat);
    shades.position.set(0, 0.88, 0.6);
    chicken.add(shades);
  }

  if (def.tophat) {
    const black = lambert(0x1a1a1a);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 16), black);
    brim.position.set(0, 1.16, 0.28);
    chicken.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.46, 16), black);
    top.position.set(0, 1.42, 0.28);
    chicken.add(top);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 16), redMat);
    band.position.set(0, 1.26, 0.28);
    chicken.add(band);
  }

  if (def.bowtie) {
    const tieMat = lambert(0xc0392b);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 4), tieMat);
      wing.rotation.z = s * Math.PI / 2;
      wing.position.set(s * 0.13, 0.42, 0.56);
      chicken.add(wing);
    }
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.12), tieMat);
    knot.position.set(0, 0.42, 0.58);
    chicken.add(knot);
  }

  if (def.cape) {
    const capeMat = new THREE.MeshLambertMaterial({
      color: def.capeColor ?? 0xd81e3a, side: THREE.DoubleSide,
    });
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), capeMat);
    cape.position.set(0, 0.18, -0.6);
    cape.rotation.x = 0.22;
    cape.castShadow = true;
    chicken.add(cape);
  }

  if (def.mask) {
    const maskMat = lambert(def.maskColor ?? 0x2a4cd0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.1), maskMat);
    band.position.set(0, 0.9, 0.58);
    chicken.add(band);
  }

  // A racing crash helmet: a glossy dome over the head with a dark visor.
  if (def.helmet) {
    const helmetMat = lambert(def.helmetColor ?? 0xff2d2d);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 14), helmetMat);
    dome.scale.set(1.05, 1.08, 1.05);
    dome.position.set(0, 0.84, 0.24);
    dome.castShadow = true;
    chicken.add(dome);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.16), lambert(0x101018));
    visor.position.set(0, 0.82, 0.6);
    chicken.add(visor);
  }

  return { chicken, wings };
}
