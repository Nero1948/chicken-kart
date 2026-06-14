// Item boxes, mines, missiles, speed boosts, and the feather and explosion
// effects that go with them.

import * as THREE from 'three';
import { track, nearestIdx, lateralOffset } from './track.js';
import { angleDiff } from './kart.js';
import { audio } from './audio.js';

const ITEM_TYPES = ['mine', 'missile', 'boost'];
const BOX_RESPAWN = 5;
const ROLL_TIME = 0.9;

export class ItemManager {
  constructor(scene, race) {
    this.scene = scene;
    this.race = race;
    this.karts = race.karts;
    this.boxes = [];
    this.mines = [];
    this.missiles = [];
    this.llamas = [];
    this.particles = new ParticlePool(scene, 90);
    this.flashes = new FlashPool(scene, 5);
    this.trailTimer = 0;

    this.boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    this.boxMat = new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.85 });
    for (const idx of track.boxSpotIdx) {
      const s = track.samples[idx];
      for (const off of [-4, 0, 4]) {
        const mesh = new THREE.Mesh(this.boxGeo, this.boxMat);
        const pos = s.pos.clone().addScaledVector(s.normal, off);
        pos.y = 1.1;
        mesh.position.copy(pos);
        scene.add(mesh);
        this.boxes.push({ mesh, pos, active: true, respawnT: 0, phase: Math.random() * 6 });
      }
    }

    // Special sparkly pink boxes that always grant the toy llama
    this.specialGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    this.specialMat = new THREE.MeshLambertMaterial({
      color: 0xff5fb0, emissive: 0xff2f96, emissiveIntensity: 0.9,
    });
    this.sparkleT = 0;
    for (const spot of track.specialBoxes) {
      const pos = spot.pos.clone();
      pos.y = 1.1;
      const mesh = new THREE.Mesh(this.specialGeo, this.specialMat);
      mesh.position.copy(pos);
      scene.add(mesh);
      this.boxes.push({ mesh, pos, active: true, respawnT: 0, phase: Math.random() * 6, special: true });
    }
  }

  update(dt) {
    const time = performance.now() / 1000;

    // Boxes spin, bob and respawn
    for (const b of this.boxes) {
      if (b.active) {
        b.mesh.rotation.y += dt * 1.6;
        b.mesh.rotation.x += dt * 0.9;
        b.mesh.position.y = 1.1 + Math.sin(time * 2 + b.phase) * 0.15;
      } else {
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.active = true;
          b.mesh.visible = true;
        }
      }
    }

    // Make the pink llama boxes sparkle: a sharp twinkle on their glow, plus a
    // steady drip of little sparkle motes around each one.
    this.specialMat.emissiveIntensity = 0.6 + 0.7 * Math.pow(Math.sin(time * 6) * 0.5 + 0.5, 2);
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.12;
      for (const b of this.boxes) {
        if (!b.special || !b.active) continue;
        const sp = {
          x: b.pos.x + (Math.random() - 0.5) * 1.8,
          y: b.mesh.position.y + 0.3,
          z: b.pos.z + (Math.random() - 0.5) * 1.8,
        };
        const colour = Math.random() < 0.5 ? 0xffffff : 0xff9ad6;
        this.particles.burst(sp, 1, { color: colour, speed: 0.6, up: 1.5, size: 0.16, life: 0.5 });
      }
    }

    // Pickups and item roulette
    for (const kart of this.karts) {
      if (kart.rollT > 0) {
        kart.rollT -= dt;
        if (kart.rollT <= 0) {
          // The golden box forces a llama; everything else rolls at random
          kart.item = kart.forcedItem || ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
          kart.forcedItem = null;
          if (kart.isPlayer) audio.play('gotItem');
        }
      }
      if (kart.item || kart.rollT > 0 || kart.finished) continue;
      for (const b of this.boxes) {
        if (!b.active) continue;
        const dx = kart.pos.x - b.pos.x;
        const dz = kart.pos.z - b.pos.z;
        if (dx * dx + dz * dz < 2.1 * 2.1) {
          b.active = false;
          b.mesh.visible = false;
          b.respawnT = BOX_RESPAWN;
          kart.rollT = ROLL_TIME;
          kart.forcedItem = b.special ? 'llama' : null;
          if (kart.isPlayer) audio.play('pickup');
          this.particles.burst(b.pos, 6, { color: 0xfff3a0, speed: 5, up: 4, size: 0.25, life: 0.5 });
          break;
        }
      }
    }

    this.updateMines(dt);
    this.updateMissiles(dt);
    this.updateLlamas(dt);
    this.updateBoostTrails(dt);
    this.particles.update(dt);
    this.flashes.update(dt);
  }

  useItem(kart) {
    if (!kart.item || kart.rollT > 0 || kart.spinT > 0) return;
    const item = kart.item;
    kart.item = null;
    if (item === 'boost') {
      kart.applyBoost();
      audio.play('boost');
    } else if (item === 'mine') {
      this.dropMine(kart);
    } else if (item === 'missile') {
      this.fireMissile(kart);
    } else if (item === 'llama') {
      this.fireLlama(kart);
    }
  }

  /* ------------------------- mines ------------------------- */

  dropMine(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, -3);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x23262b })
    );
    body.position.y = 0.45;
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2222 })
    );
    light.position.y = 0.95;
    group.add(body, light);
    group.position.copy(pos);
    this.scene.add(group);
    this.mines.push({ group, light, pos, owner: kart, armT: 0.7, ownerImmuneT: 1.6, life: 25 });
    audio.play('drop');
  }

  updateMines(dt) {
    const time = performance.now() / 1000;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.life -= dt;
      if (m.armT > 0) m.armT -= dt;
      if (m.ownerImmuneT > 0) m.ownerImmuneT -= dt;
      m.light.scale.setScalar(1 + Math.sin(time * 10) * 0.4);

      let exploded = false;
      if (m.armT <= 0) {
        for (const kart of this.karts) {
          if (kart === m.owner && m.ownerImmuneT > 0) continue;
          const d = Math.hypot(kart.pos.x - m.pos.x, kart.pos.z - m.pos.z);
          if (d < 2.4) {
            this.explodeAt(m.pos, kart);
            exploded = true;
            break;
          }
        }
      }
      if (exploded || m.life <= 0) {
        this.scene.remove(m.group);
        this.mines.splice(i, 1);
      }
    }
  }

  /* ------------------------- missiles ------------------------- */

  fireMissile(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, 2.6);
    pos.y = 0.8;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), bodyMat);
    tube.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.5, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8432f })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.8;
    group.add(tube, nose);
    group.position.copy(pos);
    this.scene.add(group);

    const target = this.race.kartAhead(kart);
    this.missiles.push({
      group, pos, owner: kart, target,
      heading: kart.heading, speed: 52, life: 6, immuneT: 0.45,
      idx: kart.idx,
    });
    audio.play('missile');
  }

  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      ms.life -= dt;
      if (ms.immuneT > 0) ms.immuneT -= dt;

      // Steer toward the target, or follow the track if there is none
      let desired;
      if (ms.target && !ms.target.finished) {
        desired = Math.atan2(ms.target.pos.x - ms.pos.x, ms.target.pos.z - ms.pos.z);
      } else {
        ms.idx = nearestIdx(ms.pos, ms.idx);
        const tan = track.samples[(ms.idx + 10) % track.N].tan;
        desired = Math.atan2(tan.x, tan.z);
      }
      const d = angleDiff(desired, ms.heading);
      const turn = Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
      ms.heading += turn;
      ms.pos.x += Math.sin(ms.heading) * ms.speed * dt;
      ms.pos.z += Math.cos(ms.heading) * ms.speed * dt;
      ms.idx = nearestIdx(ms.pos, ms.idx);
      ms.group.position.copy(ms.pos);
      ms.group.rotation.y = ms.heading;

      // Exhaust sparks
      this.particles.burst(ms.pos, 1, { color: 0xffc266, speed: 1.5, up: 1, size: 0.16, life: 0.3 });

      let dead = false;
      // Hit a kart?
      for (const kart of this.karts) {
        if (kart === ms.owner && ms.immuneT > 0) continue;
        const dist = Math.hypot(kart.pos.x - ms.pos.x, kart.pos.z - ms.pos.z);
        if (dist < 1.8) {
          this.explodeAt(ms.pos, kart);
          dead = true;
          break;
        }
      }
      // Flew off the track or timed out?
      if (!dead && (Math.abs(lateralOffset(ms.pos, ms.idx)) > track.limit || ms.life <= 0)) {
        this.explodeAt(ms.pos, null);
        dead = true;
      }
      if (dead) {
        this.scene.remove(ms.group);
        this.missiles.splice(i, 1);
      }
    }
  }

  /* ------------------------- toy llama ------------------------- */

  fireLlama(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, 3);
    pos.y = 0;
    const group = buildLlama();
    group.position.copy(pos);
    this.scene.add(group);

    const target = this.race.kartAhead(kart);
    this.llamas.push({
      group, pos, owner: kart, target,
      heading: kart.heading, speed: 26, life: 7, immuneT: 0.5,
      idx: kart.idx, bob: 0,
    });
    audio.play('llama');
  }

  updateLlamas(dt) {
    for (let i = this.llamas.length - 1; i >= 0; i--) {
      const L = this.llamas[i];
      L.life -= dt;
      if (L.immuneT > 0) L.immuneT -= dt;
      L.speed = Math.min(46, L.speed + 22 * dt); // wind up to a full gallop

      // Chase the car ahead, or follow the track if there is no target
      let desired;
      if (L.target && !L.target.finished) {
        desired = Math.atan2(L.target.pos.x - L.pos.x, L.target.pos.z - L.pos.z);
      } else {
        L.idx = nearestIdx(L.pos, L.idx);
        const tan = track.samples[(L.idx + 10) % track.N].tan;
        desired = Math.atan2(tan.x, tan.z);
      }
      const d = angleDiff(desired, L.heading);
      L.heading += Math.max(-3 * dt, Math.min(3 * dt, d));
      L.pos.x += Math.sin(L.heading) * L.speed * dt;
      L.pos.z += Math.cos(L.heading) * L.speed * dt;
      L.idx = nearestIdx(L.pos, L.idx);

      // Galloping hop and a puff of dust from its hooves
      L.bob += dt * 18;
      L.group.position.set(L.pos.x, Math.abs(Math.sin(L.bob)) * 0.5, L.pos.z);
      L.group.rotation.y = L.heading;
      this.particles.burst(L.pos, 1, { color: 0xcaa472, speed: 1.2, up: 0.6, size: 0.18, life: 0.35 });

      let dead = false;
      for (const kart of this.karts) {
        if (kart === L.owner && L.immuneT > 0) continue;
        const dist = Math.hypot(kart.pos.x - L.pos.x, kart.pos.z - L.pos.z);
        if (dist < 2.1) {
          this.knockOver(kart, L.pos);
          dead = true;
          break;
        }
      }
      if (!dead && (Math.abs(lateralOffset(L.pos, L.idx)) > track.limit || L.life <= 0)) dead = true;
      if (dead) {
        disposeGroup(this.scene, L.group);
        this.llamas.splice(i, 1);
      }
    }
  }

  knockOver(victim, pos) {
    victim.spinOut();
    this.flashes.spawn(pos);
    this.particles.burst(pos, 12, { color: 0xffffff, speed: 6, up: 6, size: 0.35, life: 1.1 });
    this.particles.burst(pos, 6, { color: 0xcaa472, speed: 4, up: 3, size: 0.3, life: 0.6 });
    audio.play('knock');
  }

  /* ------------------------- effects ------------------------- */

  explodeAt(pos, victim) {
    this.flashes.spawn(pos);
    this.particles.burst(pos, 14, { color: 0xfff8f0, speed: 7, up: 7, size: 0.4, life: 1.1 });
    this.particles.burst(pos, 6, { color: 0xff8c33, speed: 5, up: 4, size: 0.35, life: 0.5 });
    audio.play('explosion');
    if (victim) victim.spinOut();
  }

  updateBoostTrails(dt) {
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.04;
    for (const kart of this.karts) {
      if (kart.boostT > 0) {
        const f = kart.forward();
        const p = kart.pos.clone().addScaledVector(f, -1.6);
        p.y = 0.5;
        this.particles.burst(p, 1, { color: 0xffd24a, speed: 2, up: 1.5, size: 0.3, life: 0.45 });
      }
    }
  }

  dispose() {
    for (const b of this.boxes) this.scene.remove(b.mesh);
    for (const m of this.mines) this.scene.remove(m.group);
    for (const ms of this.missiles) this.scene.remove(ms.group);
    for (const L of this.llamas) disposeGroup(this.scene, L.group);
    this.boxGeo.dispose();
    this.boxMat.dispose();
    this.specialGeo.dispose();
    this.specialMat.dispose();
    this.particles.dispose();
    this.flashes.dispose();
  }
}

/* ------------------------- llama model ------------------------- */

function buildLlama() {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xf2ead6 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b5640 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.8), wool);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), wool);
  neck.position.set(0, 1.7, 0.7);
  neck.rotation.x = -0.3;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.85), wool);
  head.position.set(0, 2.25, 1.05);
  g.add(head);

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), wool);
    ear.position.set(s * 0.15, 2.6, 0.85);
    g.add(ear);
  }

  for (const [x, z] of [[-0.32, 0.6], [0.32, 0.6], [-0.32, -0.6], [0.32, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), dark);
    leg.position.set(x, 0.5, z);
    g.add(leg);
  }

  g.scale.setScalar(0.9);
  return g;
}

function disposeGroup(scene, group) {
  scene.remove(group);
  group.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

/* ------------------------- particle pools ------------------------- */

class ParticlePool {
  constructor(scene, count) {
    this.scene = scene;
    this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1.3);
    this.geo = geo;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({
        mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1,
        spinX: 0, spinY: 0, active: false,
      });
    }
    this.next = 0;
  }

  burst(pos, n, { color, speed, up, size, life }) {
    for (let i = 0; i < n; i++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      p.active = true;
      p.mesh.visible = true;
      p.mesh.position.set(pos.x, Math.max(0.5, pos.y), pos.z);
      p.mesh.scale.setScalar(size);
      p.mesh.material.color.setHex(color);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      p.vel.set(Math.cos(a) * speed * Math.random(), up * (0.5 + Math.random()), Math.sin(a) * speed * Math.random());
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.spinX = (Math.random() - 0.5) * 9;
      p.spinY = (Math.random() - 0.5) * 9;
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.y = 0.1;
        p.vel.y = 0;
        p.vel.x *= 0.9;
        p.vel.z *= 0.9;
      }
      p.mesh.rotation.x += p.spinX * dt;
      p.mesh.rotation.y += p.spinY * dt;
      p.mesh.material.opacity = p.life / p.maxLife;
    }
  }

  dispose() {
    for (const p of this.items) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    this.geo.dispose();
  }
}

class FlashPool {
  constructor(scene, count) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.SphereGeometry(1, 12, 10);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffa030, transparent: true, depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 0, active: false });
    }
    this.next = 0;
  }

  spawn(pos) {
    const f = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    f.active = true;
    f.life = 0.3;
    f.mesh.visible = true;
    f.mesh.position.set(pos.x, 1, pos.z);
  }

  update(dt) {
    for (const f of this.items) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      const t = 1 - f.life / 0.3;
      f.mesh.scale.setScalar(0.5 + t * 3.2);
      f.mesh.material.opacity = 1 - t;
    }
  }

  dispose() {
    for (const f of this.items) {
      this.scene.remove(f.mesh);
      f.mesh.material.dispose();
    }
    this.geo.dispose();
  }
}

// Feather burst helper used when a chicken spins out
export function featherBurst(particles, pos) {
  particles.burst(pos, 12, { color: 0xffffff, speed: 6, up: 6, size: 0.35, life: 1.2 });
}
