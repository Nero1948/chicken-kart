// Chicken and kart 3D models, character definitions and driving physics.

import * as THREE from 'three';
import { track, nearestIdx, lateralOffset, inMud, surfaceY, atRampLip, tunnelLane, barnLane } from './track.js';
import { audio } from './audio.js';

// The three playable racers. Stats are real physics numbers; the 0-1 "bars"
// are just for the character select screen.
export const CHARACTERS = {
  chickpea: {
    key: 'chickpea', name: 'Chickpea',
    tagline: 'The all-rounder. Steady, speedy, dependable.',
    body: 0xf2c14e, kart: 0x3f9b46,
    maxSpeed: 30, accel: 24, steer: 2.3,
    bars: { Speed: 0.7, Acceleration: 0.7, Handling: 0.7 },
  },
  heyhey: {
    key: 'heyhey', name: 'Heyhey',
    tagline: 'Top speed terror. Hold on to your feathers!',
    body: 0xffffff, kart: 0xd93636,
    maxSpeed: 33, accel: 19, steer: 1.85, sunglasses: true,
    bars: { Speed: 0.95, Acceleration: 0.5, Handling: 0.5 },
  },
  laya: {
    key: 'laya', name: 'Princess Laya',
    tagline: 'Royal handling. Corners like a dream.',
    body: 0xfbe3cf, kart: 0xe86fb4,
    maxSpeed: 28, accel: 30, steer: 2.85, crown: true,
    bars: { Speed: 0.55, Acceleration: 0.9, Handling: 0.95 },
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
    this.rank = 1;
    this.wrongAccum = 0;
    this.wrongWay = false;

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

      // Steering: weak at a standstill, slightly heavier at top speed
      const grip = Math.min(1, Math.abs(this.speed) / 6) * (1 - 0.25 * Math.min(1, Math.abs(this.speed) / this.def.maxSpeed));
      const dir = this.speed < 0 ? -1 : 1;
      this.heading += input.steer * this.def.steer * grip * dir * dt;
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
    m.group.rotation.z = -this.steerVisual * 0.07 * Math.min(1, Math.abs(this.speed) / 15);
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

function buildChickenKart(def) {
  const group = new THREE.Group();
  const kartMat = lambert(def.kart);
  const darkMat = lambert(0x333333);
  const bodyMat = lambert(def.body);
  const beakMat = lambert(0xf28c28);
  const redMat = lambert(0xd8432f);

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

  // The chicken
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

  // Comb
  const combGeo = new THREE.SphereGeometry(0.1, 8, 6);
  for (const [z, y] of [[0.14, 1.16], [0.0, 1.2], [-0.14, 1.14]]) {
    const c = new THREE.Mesh(combGeo, redMat);
    c.position.set(0, y, 0.28 + z);
    chicken.add(c);
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

  const chickenBaseY = 1.15;
  chicken.position.set(0, chickenBaseY, -0.25);
  group.add(chicken);

  return { group, wheels, wings, chicken, chickenBaseY };
}
