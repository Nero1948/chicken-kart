// A single stubborn cow that stands on the track at a random spot each race.
// Steer around it: clip it and your kart crashes out (the same spin-out as a
// missile) and the cow lets out a loud moo. It does not move, so once you know
// where it is you can plan your line past it.

import * as THREE from 'three';
import { track, surfaceY, inSplitZone, inRoadworks } from './track.js';
import { audio } from './audio.js';

const HIT_RADIUS = 2.6;   // how close a kart must get to clip the cow
const MOO_COOLDOWN = 1.4; // stop the moo spamming if karts keep piling in
const GRACE_TIME = 2.6;   // after crashing, a kart can drive clear without re-crashing
                          // (must outlast the spin so you recover, not get stuck)

export class Cow {
  constructor(scene) {
    this.scene = scene;
    const built = buildCow();
    this.model = built.group;
    this.head = built.head;
    this.tail = built.tail;
    scene.add(this.model);
    this.pos = new THREE.Vector3();
    this.cooldown = 0;
    this.time = Math.random() * 10;
    this.grace = new Map(); // kart -> remaining seconds it may not be re-crashed
    this.place();
  }

  // Pick a fair, clear, flat spot on the road, offset to one side so there is
  // always room to pass. Avoids the start straight, the tunnel/barn split and
  // the raised jump ramp.
  place() {
    let idx = 0;
    for (let tries = 0; tries < 40; tries++) {
      const cand = Math.floor(Math.random() * track.N);
      const nearStart = cand < 28 || cand > track.N - 28;
      const raised = Math.abs(surfaceY(cand, 0)) > 0.05; // ramp / tunnel dip
      if (nearStart || inSplitZone(cand) || inRoadworks(cand) || raised) continue;
      idx = cand;
      break;
    }
    const s = track.samples[idx];
    const lateral = (Math.random() - 0.5) * 5; // roughly -2.5..2.5 across the road
    this.pos.copy(s.pos).addScaledVector(s.normal, lateral);
    this.pos.y = surfaceY(idx, lateral);
    this.model.position.copy(this.pos);
    // Stand broadside across the road so it reads as an obstacle
    this.model.rotation.y = Math.atan2(s.normal.x, s.normal.z);
  }

  update(dt, karts, particles) {
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    // Tick down each kart's post-crash grace period
    for (const [k, t] of this.grace) {
      if (t - dt <= 0) this.grace.delete(k);
      else this.grace.set(k, t - dt);
    }

    // Lazy idle: a slow head sway and a flicking tail
    this.head.rotation.z = Math.sin(this.time * 0.8) * 0.08;
    this.tail.rotation.x = -0.5 + Math.sin(this.time * 2.2) * 0.35;

    for (const k of karts) {
      if (this.grace.has(k)) continue; // just crashed here — let it drive clear
      const dx = k.pos.x - this.pos.x;
      const dz = k.pos.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < HIT_RADIUS * HIT_RADIUS && Math.abs(k.pos.y - this.pos.y) < 2) {
        if (k.spinOut()) {
          // Shove the kart to the edge so it is not left embedded in the cow,
          // then grant grace so it recovers and drives off instead of being
          // stuck spinning out again and again on the same spot.
          const d = Math.sqrt(d2) || 0.0001;
          const push = (HIT_RADIUS + 0.4 - d) / d;
          k.pos.x += dx * push;
          k.pos.z += dz * push;
          this.grace.set(k, GRACE_TIME);
          if (this.cooldown <= 0) {
            audio.play('moo');
            this.cooldown = MOO_COOLDOWN;
          }
          if (particles) {
            particles.burst(this.pos, 12, { color: 0xe8dfcb, speed: 5, up: 4, size: 0.32, life: 0.8 });
          }
        }
      }
    }
  }

  dispose() {
    this.scene.remove(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

function buildCow() {
  const group = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf3efe6 });
  const black = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const pink = new THREE.MeshLambertMaterial({ color: 0xe79aa3 });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe8d9b0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.25, 2.4), white);
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);

  // Black Holstein patches dotted over the body
  const spotGeo = new THREE.SphereGeometry(0.42, 10, 8);
  const patches = [
    [0.72, 1.4, 0.5], [-0.72, 1.2, -0.4], [0.0, 1.75, -0.2],
    [-0.72, 1.5, 0.7], [0.72, 0.95, -0.6],
  ];
  for (const [x, y, z] of patches) {
    const spot = new THREE.Mesh(spotGeo, black);
    spot.position.set(x, y, z);
    spot.scale.set(x === 0 ? 1.2 : 0.5, 0.9, 1.1);
    group.add(spot);
  }

  // Head + snout
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.8), white);
  skull.castShadow = true;
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.4), pink);
  muzzle.position.set(0, -0.15, 0.5);
  head.add(muzzle);
  for (const sx of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), dark);
    nostril.position.set(sx * 0.16, -0.18, 0.71);
    head.add(nostril);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), dark);
    eye.position.set(sx * 0.28, 0.22, 0.36);
    head.add(eye);
    // Floppy ears
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.5), white);
    ear.position.set(sx * 0.58, 0.18, -0.05);
    ear.rotation.z = sx * 0.5;
    head.add(ear);
    // Little horns
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 8), cream);
    horn.position.set(sx * 0.24, 0.62, -0.05);
    horn.rotation.z = sx * 0.3;
    head.add(horn);
  }
  head.position.set(0, 1.35, 1.45);
  group.add(head);

  // Four legs with dark hooves
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.9, 8), white);
      leg.position.set(x, 0.45, z);
      leg.castShadow = true;
      group.add(leg);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 8), dark);
      hoof.position.set(x, 0.09, z);
      group.add(hoof);
    }
  }

  // Udder underneath (a clear cow tell)
  const udder = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.7), pink);
  udder.position.set(0, 0.55, -0.35);
  group.add(udder);

  // Tail that hangs off the back and flicks
  const tail = new THREE.Group();
  const tailStem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 1.0, 6), white);
  tailStem.position.y = -0.5;
  tail.add(tailStem);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark);
  tuft.position.y = -1.0;
  tail.add(tuft);
  tail.position.set(0, 1.55, -1.2);
  tail.rotation.x = -0.5;
  group.add(tail);

  return { group, head, tail };
}
