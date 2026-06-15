// A great big Moa that trundles across the road pushing a lawnmower, leaving a
// spray of grass clippings behind it. Clip the Moa (or its mower) and your kart
// crashes out — the same spin-out as taking a missile. It is slow and wide, so
// it is a proper "mind the gap" hazard you have to time your run around. Jump
// over it on a ramp and you are fine.

import * as THREE from 'three';
import { track, surfaceY } from './track.js';
import { audio } from './audio.js';

const CROSS_TIME = 3.6;     // seconds to lumber from one fence to the other
const HIT_RADIUS = 2.3;     // the Moa + mower make a wide obstacle

export class Moa {
  constructor(scene) {
    this.scene = scene;
    const built = buildMoa();
    this.model = built.group;
    this.neck = built.neck;
    this.legs = built.legs;
    this.model.visible = false;
    scene.add(this.model);

    this.state = 'wait';
    this.timer = 3 + Math.random() * 5;
    this.t = 0;
    this.step = Math.random() * 10;
    this.clipT = 0;
    this.from = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.pos = new THREE.Vector3();
  }

  // Begin a crossing fence to fence at a random spot. Keep clear of raised
  // stretches (the city bridge, park ramps) so the Moa never floats in the air.
  startCrossing() {
    let idx = Math.floor(Math.random() * track.N);
    for (let k = 0; k < 8 && surfaceY(idx, 0) > 0.5; k++) {
      idx = Math.floor(Math.random() * track.N);
    }
    const s = track.samples[idx];
    const side = Math.random() < 0.5 ? 1 : -1;
    this.from.copy(s.pos).addScaledVector(s.normal, (track.limit + 2) * side);
    this.to.copy(s.pos).addScaledVector(s.normal, -(track.limit + 2) * side);
    this.from.y = 0; this.to.y = 0;
    this.t = 0;
    this.state = 'cross';
    this.model.visible = true;
    // Face the direction of travel: the model is built with +z forward, so the
    // mower it pushes leads the way.
    this.model.rotation.y = Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z);
  }

  update(dt, karts, particles) {
    if (this.state === 'wait') {
      this.timer -= dt;
      if (this.timer <= 0) this.startCrossing();
      return;
    }

    this.t += dt / CROSS_TIME;
    this.pos.lerpVectors(this.from, this.to, Math.min(1, this.t));
    this.step += dt * 7;

    // Lumbering walk: a heavy bob, swinging legs and a bobbing neck.
    this.model.position.set(this.pos.x, Math.abs(Math.sin(this.step)) * 0.18, this.pos.z);
    this.legs[0].rotation.x = Math.sin(this.step) * 0.5;
    this.legs[1].rotation.x = -Math.sin(this.step) * 0.5;
    this.neck.rotation.x = -0.2 + Math.sin(this.step * 0.5) * 0.1;

    // Grass clippings spitting out from under the mower as it mows across.
    this.clipT -= dt;
    if (particles && this.clipT <= 0) {
      this.clipT = 0.06;
      particles.burst(
        { x: this.pos.x, y: 0.3, z: this.pos.z },
        2,
        { color: 0x5fa83a, speed: 3, up: 2.2, size: 0.16, life: 0.5 }
      );
    }

    // A kart at road level that touches the Moa crashes out.
    for (const k of karts) {
      const dx = k.pos.x - this.pos.x;
      const dz = k.pos.z - this.pos.z;
      if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS && Math.abs(k.pos.y) < 2) {
        if (k.spinOut()) {
          audio.play('moa');
          if (particles) {
            particles.burst(this.pos, 14, { color: 0x6e5a3c, speed: 6, up: 5, size: 0.32, life: 1.0 });
            particles.burst(this.pos, 8, { color: 0x5fa83a, speed: 5, up: 3, size: 0.24, life: 0.6 });
          }
          this.reset();
          return;
        }
      }
    }

    if (this.t >= 1) this.reset();
  }

  reset() {
    this.state = 'wait';
    this.timer = 4 + Math.random() * 6;
    this.model.visible = false;
  }

  dispose() {
    this.scene.remove(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

// Build the Moa and the lawnmower it pushes, as one group with +z facing the
// direction of travel (so the mower leads and the Moa pushes from behind).
function buildMoa() {
  const group = new THREE.Group();
  const feather = new THREE.MeshLambertMaterial({ color: 0x6e5a3c });
  const featherDark = new THREE.MeshLambertMaterial({ color: 0x5a4830 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0x9a8045 });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xcfc08a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });

  // Big plump body, tilted forward into a pushing stance.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 12), feather);
  body.scale.set(1, 1.05, 1.35);
  body.position.set(0, 1.45, -0.35);
  body.rotation.x = 0.25;
  body.castShadow = true;
  group.add(body);

  // Stubby wings tucked at the sides, reaching toward the mower handle.
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.7), featherDark);
    wing.position.set(s * 0.6, 1.45, 0.1);
    wing.rotation.x = 0.5;
    group.add(wing);
  }

  // Long neck (pivots at the shoulders) and a small head with a stubby beak.
  const neck = new THREE.Group();
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.3, 10), feather);
  neckMesh.position.y = 0.65;
  neck.add(neckMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), feather);
  head.position.set(0, 1.4, 0.12);
  head.castShadow = true;
  neck.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.4, 0.42);
  neck.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
    eye.position.set(s * 0.12, 1.5, 0.28);
    neck.add(eye);
  }
  neck.position.set(0, 1.7, 0.05);
  neck.rotation.x = -0.2;
  group.add(neck);

  // Two sturdy legs (pivot at the hip so they can swing as it walks).
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.1, 8), legMat);
    thigh.position.y = -0.55;
    leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.5), legMat);
    foot.position.set(0, -1.08, 0.12);
    leg.add(foot);
    leg.position.set(s * 0.3, 1.1, -0.3);
    group.add(leg);
    legs.push(leg);
  }

  // The push lawnmower out in front, the bit that does the mowing.
  const mower = buildMower();
  mower.position.set(0, 0, 0.85);
  group.add(mower);

  group.scale.setScalar(1.0);
  return { group, neck, legs };
}

function buildMower() {
  const m = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xcf3b2f });
  const metal = new THREE.MeshLambertMaterial({ color: 0x3a3f44 });

  // Deck low to the ground.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 0.7), deckMat);
  deck.position.y = 0.34;
  deck.castShadow = true;
  m.add(deck);

  // Four little wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10);
  for (const x of [-0.5, 0.5]) {
    for (const z of [-0.28, 0.28]) {
      const w = new THREE.Mesh(wheelGeo, metal);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.18, z);
      m.add(w);
    }
  }

  // Grass catcher bag at the back.
  const catcher = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.4), new THREE.MeshLambertMaterial({ color: 0x6fae3e }));
  catcher.position.set(0, 0.5, -0.45);
  m.add(catcher);

  // U-shaped handle sweeping up and back toward the Moa's wings.
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), metal);
    bar.position.set(s * 0.45, 0.85, -0.55);
    bar.rotation.x = 0.7;
    m.add(bar);
  }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), metal);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 1.25, -0.95);
  m.add(grip);

  return m;
}
