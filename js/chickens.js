// Two red farm chickens that wander across the road at random moments. Clip one
// and your kart crashes out, the same spin-out as taking a missile. Jump over
// them and you are fine.

import * as THREE from 'three';
import { track, surfaceY } from './track.js';
import { audio } from './audio.js';
import { featherBurst } from './items.js';

const CROSS_TIME = 1.6; // seconds to walk from one fence to the other

export class Crossers {
  constructor(scene) {
    this.scene = scene;
    this.chickens = [];
    for (let i = 0; i < 2; i++) {
      const model = buildRedChicken();
      model.visible = false;
      scene.add(model);
      this.chickens.push({
        model,
        state: 'wait',
        timer: 2 + Math.random() * 6,
        t: 0,
        step: Math.random() * 10,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        pos: new THREE.Vector3(),
      });
    }
  }

  // Begin a crossing at a random point on the track, fence to fence. Keep clear
  // of raised stretches (the city bridge) so a chicken never floats over water.
  startCrossing(c) {
    let idx = Math.floor(Math.random() * track.N);
    for (let k = 0; k < 8 && surfaceY(idx, 0) > 0.5; k++) {
      idx = Math.floor(Math.random() * track.N);
    }
    const s = track.samples[idx];
    const side = Math.random() < 0.5 ? 1 : -1;
    c.from.copy(s.pos).addScaledVector(s.normal, track.limit * side);
    c.to.copy(s.pos).addScaledVector(s.normal, -track.limit * side);
    c.from.y = 0; c.to.y = 0;
    c.t = 0;
    c.state = 'cross';
    c.model.visible = true;
    c.model.rotation.y = Math.atan2(c.to.x - c.from.x, c.to.z - c.from.z);
  }

  update(dt, karts, particles) {
    for (const c of this.chickens) {
      if (c.state === 'wait') {
        c.timer -= dt;
        if (c.timer <= 0) this.startCrossing(c);
        continue;
      }

      c.t += dt / CROSS_TIME;
      c.pos.lerpVectors(c.from, c.to, Math.min(1, c.t));
      c.step += dt * 12;
      c.model.position.set(c.pos.x, Math.abs(Math.sin(c.step)) * 0.12, c.pos.z);

      // A kart at road level that touches the chicken crashes out
      for (const k of karts) {
        const dx = k.pos.x - c.pos.x;
        const dz = k.pos.z - c.pos.z;
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(k.pos.y) < 2) {
          if (k.spinOut()) {
            audio.play('squawk');
            if (particles) featherBurst(particles, c.pos);
          }
          this.reset(c);
          break;
        }
      }

      if (c.state === 'cross' && c.t >= 1) this.reset(c);
    }
  }

  reset(c) {
    c.state = 'wait';
    c.timer = 4 + Math.random() * 8;
    c.model.visible = false;
  }

  dispose() {
    for (const c of this.chickens) {
      this.scene.remove(c.model);
      c.model.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
    }
    this.chickens = [];
  }
}

function buildRedChicken() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xcc2b2b });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xf2a33c });
  const combMat = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), red);
  body.scale.set(1, 1.1, 1.25);
  body.position.y = 0.6;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), red);
  head.position.set(0, 1.15, 0.18);
  g.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 8), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.12, 0.48);
  g.add(beak);

  const comb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), combMat);
  comb.position.set(0, 1.42, 0.14);
  g.add(comb);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dark);
    eye.position.set(s * 0.13, 1.2, 0.4);
    g.add(eye);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.07), beakMat);
    leg.position.set(s * 0.14, 0.2, 0);
    g.add(leg);
  }

  g.scale.setScalar(1.1);
  return g;
}
