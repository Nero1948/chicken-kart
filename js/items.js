// Mystery eggs (the item boxes), golden corn, every item in the game, and the
// particle effects that go with them: drift sparks, boost flames, feathers,
// explosions and shockwaves.

import * as THREE from 'three';
import { track, nearestIdx, lateralOffset, surfaceY } from './track.js';
import { angleDiff } from './kart.js';
import { audio } from './audio.js';

const BOX_RESPAWN = 5;
const CORN_RESPAWN = 9;
const ROLL_TIME = 1.1;

// Spark colours for the three mini-turbo levels (index 0 is plain tyre smoke).
// The values go above 1 so the sparks glow through the bloom filter.
const SPARK = [
  { color: 0xd8d8d8, glow: 1 },
  { color: 0x35c8ff, glow: 2.6 },
  { color: 0xff9a1f, glow: 2.8 },
  { color: 0xff3fd0, glow: 3.0 },
];

// Pick an item to suit where the kart is running. Leaders get things to defend
// with (mines, shields); back-markers get the big comeback items (missiles, the
// rooster crow, the chilli). A solo time trial only ever hands out boosts.
function rollItem(kart, fieldSize) {
  if (fieldSize <= 1) return 'boost';
  const r = (kart.rank - 1) / (fieldSize - 1); // 0 = leading, 1 = last
  const weights = {
    mine: 0.5 + 2.6 * (1 - r),
    shield: 0.7 + 1.6 * (1 - r),
    egg: 2.2,
    boost: 1.8 + 1.2 * r,
    missile: kart.rank === 1 ? 0 : 0.6 + 2.2 * r,
    crow: r >= 0.4 ? 1.7 * r : 0,
    chilli: r >= 0.4 ? 2.0 * r : 0,
  };
  let total = 0;
  for (const k in weights) total += weights[k];
  let pick = Math.random() * total;
  for (const k in weights) {
    pick -= weights[k];
    if (pick <= 0) return k;
  }
  return 'boost';
}

// An egg shape: a sphere pinched toward the top.
function eggGeometry(r, wSeg = 16, hSeg = 12) {
  const geo = new THREE.SphereGeometry(r, wSeg, hSeg);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / r; // -1..1
    const pinch = y > 0 ? 1 - 0.26 * y : 1;
    p.setXYZ(i, p.getX(i) * pinch, p.getY(i) * 1.28, p.getZ(i) * pinch);
  }
  geo.computeVertexNormals();
  return geo;
}

export class ItemManager {
  constructor(scene, race) {
    this.scene = scene;
    this.race = race;
    this.karts = race.karts;
    this.boxes = [];
    this.mines = [];
    this.missiles = [];
    this.llamas = [];
    this.eggs = [];
    this.particles = new ParticlePool(scene, 320);
    this.flashes = new FlashPool(scene, 6);
    this.rings = new RingPool(scene, 6);
    this.trailTimer = 0;
    this.dustTimer = 0;
    this.sparkTimer = 0;
    this.sparkleT = 0;
    this.cornStreak = 0;
    this.cornStreakT = 0;

    this.buildBoxes();
    this.buildCorn();
  }

  /* ------------------------- mystery eggs ------------------------- */

  buildBoxes() {
    this.eggGeo = eggGeometry(0.82);
    this.specialGeo = eggGeometry(0.98);
    this.haloGeo = new THREE.RingGeometry(0.95, 1.45, 24);
    this.haloGeo.rotateX(-Math.PI / 2);

    const addBox = (pos, special) => {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9 });
      const mesh = new THREE.Mesh(special ? this.specialGeo : this.eggGeo, mat);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const haloMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      const halo = new THREE.Mesh(this.haloGeo, haloMat);
      halo.position.set(pos.x, pos.y - 1.25, pos.z);
      this.scene.add(halo);
      this.boxes.push({
        mesh, halo, pos, active: true, respawnT: 0, popT: 0, special,
        phase: Math.random() * 6, hue: Math.random(),
      });
    };

    for (const idx of track.boxSpotIdx) {
      const s = track.samples[idx];
      for (const off of [-5, 0, 5]) {
        const pos = s.pos.clone().addScaledVector(s.normal, off);
        pos.y = surfaceY(idx, off) + 1.4;
        addBox(pos, false);
      }
    }
    // Sparkly pink eggs that always hatch the toy llama
    for (const spot of track.specialBoxes) {
      const pos = spot.pos.clone();
      const idx = nearestIdx(pos, null);
      pos.y = surfaceY(idx, 0) + 1.5;
      addBox(pos, true);
    }
  }

  updateBoxes(dt, time) {
    const col = _col;
    for (const b of this.boxes) {
      if (b.active) {
        if (b.popT > 0) b.popT -= dt;
        const pop = b.popT > 0 ? 1 - (b.popT / 0.35) : 1;
        b.mesh.scale.setScalar(pop * (1 + Math.sin(time * 3 + b.phase) * 0.05));
        b.mesh.rotation.y += dt * 1.9;
        b.mesh.rotation.z = Math.sin(time * 1.6 + b.phase) * 0.22;
        b.mesh.position.y = b.pos.y + Math.sin(time * 2 + b.phase) * 0.18;
        if (b.special) {
          const tw = Math.pow(Math.sin(time * 6 + b.phase) * 0.5 + 0.5, 2);
          col.setRGB(1, 0.32 + tw * 0.2, 0.72);
          b.mesh.material.color.copy(col);
          b.mesh.material.emissive.setRGB(1.0 + tw * 0.9, 0.18, 0.62);
        } else {
          // Slowly cycle through the rainbow
          col.setHSL((b.hue + time * 0.12) % 1, 0.85, 0.62);
          b.mesh.material.color.copy(col);
          b.mesh.material.emissive.copy(col).multiplyScalar(0.75);
        }
        b.halo.material.color.copy(col).multiplyScalar(1.3);
        b.halo.material.opacity = 0.35 + 0.2 * Math.sin(time * 4 + b.phase);
        b.halo.scale.setScalar(1 + 0.12 * Math.sin(time * 4 + b.phase));
      } else {
        b.respawnT -= dt;
        if (b.respawnT <= 0) {
          b.active = true;
          b.popT = 0.35;
          b.mesh.visible = true;
          b.halo.visible = true;
        }
      }
    }

    // A steady drip of sparkle motes around each pink egg
    this.sparkleT -= dt;
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.1;
      for (const b of this.boxes) {
        if (!b.special || !b.active) continue;
        _v.set(b.pos.x + (Math.random() - 0.5) * 2, b.mesh.position.y + 0.3, b.pos.z + (Math.random() - 0.5) * 2);
        this.particles.burst(_v, 1, {
          color: Math.random() < 0.5 ? 0xffffff : 0xff9ad6, glow: 2, speed: 0.6, up: 1.6, size: 0.18, life: 0.55,
        });
      }
    }
  }

  /* ------------------------- golden corn ------------------------- */

  buildCorn() {
    const n = track.cornSpots.length;
    this.corn = [];
    if (!n) { this.cobMesh = null; return; }
    const cobGeo = new THREE.CapsuleGeometry(0.3, 0.62, 4, 10);
    const cobMat = new THREE.MeshLambertMaterial({ color: 0xffd42a, emissive: 0xffb300, emissiveIntensity: 0.75 });
    this.cobMesh = new THREE.InstancedMesh(cobGeo, cobMat, n);
    const huskGeo = new THREE.ConeGeometry(0.4, 0.75, 6, 1, true);
    huskGeo.rotateX(Math.PI);
    huskGeo.translate(0, -0.3, 0);
    const huskMat = new THREE.MeshLambertMaterial({ color: 0x6fc13e, side: THREE.DoubleSide });
    this.huskMesh = new THREE.InstancedMesh(huskGeo, huskMat, n);
    this.cobMesh.castShadow = true;
    this.cobMesh.frustumCulled = false;
    this.huskMesh.frustumCulled = false;
    this.scene.add(this.cobMesh, this.huskMesh);
    track.cornSpots.forEach((spot, i) => {
      this.corn.push({ pos: spot.pos, active: true, respawnT: 0, phase: i * 0.7 });
    });
  }

  updateCorn(dt, time) {
    if (!this.cobMesh) return;
    if (this.cornStreakT > 0) {
      this.cornStreakT -= dt;
      if (this.cornStreakT <= 0) this.cornStreak = 0;
    }
    const d = _dummy;
    for (let i = 0; i < this.corn.length; i++) {
      const c = this.corn[i];
      if (!c.active) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) c.active = true;
      }
      if (c.active) {
        for (const kart of this.karts) {
          if (kart.finished && !kart.isPlayer) continue;
          const dx = kart.pos.x - c.pos.x;
          const dz = kart.pos.z - c.pos.z;
          if (dx * dx + dz * dz < 2.0 * 2.0 && kart.pos.y < 2.2) {
            c.active = false;
            c.respawnT = CORN_RESPAWN;
            kart.addCorn();
            _v.set(c.pos.x, 1.1, c.pos.z);
            this.particles.burst(_v, 5, { color: 0xffe066, glow: 2.2, speed: 3, up: 3.5, size: 0.2, life: 0.4 });
            if (kart.isPlayer) {
              this.cornStreak = Math.min(8, this.cornStreak + 1);
              this.cornStreakT = 1.2;
              audio.corn(this.cornStreak);
              kart.events.push({ type: 'corn' });
            }
            break;
          }
        }
      }
      const s = c.active ? 1 : 0.0001;
      d.position.set(c.pos.x, 1.05 + Math.sin(time * 2.6 + c.phase) * 0.14, c.pos.z);
      d.rotation.set(0.35, time * 2.4 + c.phase, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.cobMesh.setMatrixAt(i, d.matrix);
      this.huskMesh.setMatrixAt(i, d.matrix);
    }
    this.cobMesh.instanceMatrix.needsUpdate = true;
    this.huskMesh.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------- main update ------------------------- */

  update(dt) {
    const time = performance.now() / 1000;
    this.updateBoxes(dt, time);
    this.updateCorn(dt, time);

    // Pickups and item roulette
    for (const kart of this.karts) {
      if (kart.rollT > 0) {
        kart.rollT -= dt;
        if (kart.rollT <= 0) {
          // The pink egg forces a llama; everything else rolls by race position
          kart.item = kart.forcedItem || rollItem(kart, this.karts.length);
          kart.forcedItem = null;
          if (kart.isPlayer) audio.play('gotItem');
        }
      }
      if (kart.item || kart.rollT > 0 || kart.finished) continue;
      for (const b of this.boxes) {
        if (!b.active) continue;
        const dx = kart.pos.x - b.pos.x;
        const dz = kart.pos.z - b.pos.z;
        if (dx * dx + dz * dz < 2.2 * 2.2 && Math.abs(kart.pos.y + 1.4 - b.pos.y) < 3) {
          b.active = false;
          b.mesh.visible = false;
          b.halo.visible = false;
          b.respawnT = BOX_RESPAWN;
          kart.rollT = ROLL_TIME;
          kart.forcedItem = b.special ? 'llama' : null;
          if (kart.isPlayer) audio.play('pickup');
          // The egg cracks open in a shower of shell and sparkle
          this.particles.burst(b.pos, 8, { color: 0xfffbe8, speed: 5, up: 4.5, size: 0.3, life: 0.6 });
          this.particles.burst(b.pos, 6, { color: b.special ? 0xff7ad0 : 0xfff06a, glow: 2.4, speed: 4, up: 4, size: 0.2, life: 0.5 });
          break;
        }
      }
    }

    this.updateMines(dt);
    this.updateMissiles(dt);
    this.updateLlamas(dt);
    this.updateEggs(dt);
    this.updateKartFx(dt);
    this.particles.update(dt);
    this.flashes.update(dt);
    this.rings.update(dt);
  }

  /* ------------------------- kart effects ------------------------- */

  // World position of a point given in a kart's own (right, up, forward) space.
  kartPoint(kart, right, up, fwd, out = _v) {
    const a = kart.heading + kart.driftVis;
    const fx = Math.sin(a), fz = Math.cos(a);
    return out.set(
      kart.pos.x + fx * fwd - fz * right,
      kart.pos.y + up,
      kart.pos.z + fz * fwd + fx * right
    );
  }

  // Everything that streams off a moving kart: off-road dust, drift sparks,
  // boost flames, slipstream wind, plus one-off bursts for the kart's events.
  updateKartFx(dt) {
    this.dustTimer -= dt;
    const dustTick = this.dustTimer <= 0;
    if (dustTick) this.dustTimer = 0.05;
    this.sparkTimer -= dt;
    const sparkTick = this.sparkTimer <= 0;
    if (sparkTick) this.sparkTimer = 0.028;
    this.trailTimer -= dt;
    const trailTick = this.trailTimer <= 0;
    if (trailTick) this.trailTimer = 0.035;

    for (const kart of this.karts) {
      const fast = Math.abs(kart.speed) > 9;

      // Dust scrabbling over grass or mud at speed
      if (kart.offRoad && fast && dustTick && !kart.airborne) {
        this.kartPoint(kart, (Math.random() - 0.5) * 1.6, 0.3, -1.2);
        this.particles.burst(_v, 1, { color: 0x9a8a5c, speed: 1.5, up: 1.4, size: 0.34, life: 0.45 });
      }

      // Drift sparks from the rear wheels, coloured by mini-turbo level
      if (kart.driftDir && sparkTick && !kart.airborne) {
        const sp = SPARK[kart.driftLevel];
        for (const side of [-1, 1]) {
          this.kartPoint(kart, side * 0.97, 0.15, -1.05);
          if (kart.driftLevel === 0) {
            this.particles.burst(_v, 1, { color: sp.color, speed: 0.8, up: 0.9, size: 0.3, life: 0.3, grav: -1 });
          } else {
            this.particles.burst(_v, 2, { color: sp.color, glow: sp.glow, speed: 3.2, up: 3.2, size: 0.15 + kart.driftLevel * 0.03, life: 0.26 });
          }
        }
      }

      // Boost flames trailing from the exhausts
      if (kart.boostT > 0 && trailTick) {
        this.kartPoint(kart, (Math.random() - 0.5) * 0.6, 0.85, -2.0);
        const hot = kart.chilliT > 0;
        this.particles.burst(_v, hot ? 2 : 1, {
          color: hot ? 0xff3a1a : 0xffc23a, glow: 2.4, speed: 1.6, up: 1.2, size: hot ? 0.42 : 0.3, life: 0.4, grav: -2,
        });
      }

      // Wind streaks while tucked into a rival's slipstream
      if (kart.isPlayer && kart.slipT > 0.3 && trailTick) {
        this.kartPoint(kart, (Math.random() - 0.5) * 3.2, 0.5 + Math.random() * 1.4, 2.5);
        this.particles.burst(_v, 1, { color: 0xffffff, glow: 1.6, speed: 0.3, up: 0, size: 0.14, life: 0.25, grav: 0 });
      }

      for (const ev of kart.events) this.eventFx(kart, ev);
    }
  }

  eventFx(kart, ev) {
    switch (ev.type) {
      case 'spin':
        featherBurst(this.particles, kart.pos);
        if (ev.lost) {
          _v.set(kart.pos.x, kart.pos.y + 1, kart.pos.z);
          this.particles.burst(_v, ev.lost * 2, { color: 0xffd42a, glow: 1.8, speed: 6, up: 6, size: 0.26, life: 0.8 });
        }
        break;
      case 'shieldPop':
        _v.set(kart.pos.x, kart.pos.y + 1.1, kart.pos.z);
        this.particles.burst(_v, 16, { color: 0x9fe8ff, glow: 2.2, speed: 7, up: 4, size: 0.24, life: 0.5 });
        this.rings.spawn(kart.pos, 0x8fe3ff, 5, 0.35);
        break;
      case 'driftLevel': {
        const sp = SPARK[ev.level];
        this.kartPoint(kart, 0, 0.3, -1.1);
        this.particles.burst(_v, 10, { color: sp.color, glow: sp.glow, speed: 5, up: 4, size: 0.2, life: 0.35 });
        break;
      }
      case 'miniturbo': {
        const sp = SPARK[ev.level];
        this.kartPoint(kart, 0, 0.5, -1.4);
        this.particles.burst(_v, 8 + ev.level * 4, { color: sp.color, glow: sp.glow, speed: 6, up: 3, size: 0.22, life: 0.45 });
        break;
      }
      case 'trick':
        _v.set(kart.pos.x, kart.pos.y + 1, kart.pos.z);
        this.particles.burst(_v, 12, { color: 0xfff06a, glow: 2.6, speed: 5, up: 3, size: 0.2, life: 0.5, grav: 2 });
        break;
      case 'land':
        _v.set(kart.pos.x, kart.pos.y + 0.2, kart.pos.z);
        this.particles.burst(_v, 8, { color: 0xc9bb96, speed: 5, up: 1.5, size: 0.4, life: 0.45 });
        if (ev.trick) this.particles.burst(_v, 10, { color: 0xfff06a, glow: 2.6, speed: 6, up: 4, size: 0.2, life: 0.45 });
        break;
      case 'wall':
        this.kartPoint(kart, 0, 0.5, 1.2);
        this.particles.burst(_v, 5, { color: 0xdedede, speed: 4, up: 3, size: 0.26, life: 0.35 });
        break;
      case 'bump':
        _v.set(ev.x, kart.pos.y + 0.7, ev.z);
        this.particles.burst(_v, 5, { color: 0xfff1a8, glow: 2.4, speed: 4, up: 3, size: 0.14, life: 0.25 });
        break;
      case 'slipstream':
        this.kartPoint(kart, 0, 0.8, -1);
        this.particles.burst(_v, 10, { color: 0xffffff, glow: 1.8, speed: 5, up: 2, size: 0.18, life: 0.4 });
        break;
      default:
        break;
    }
  }

  /* ------------------------- using items ------------------------- */

  useItem(kart) {
    if (!kart.item || kart.rollT > 0 || kart.spinT > 0) return;
    const item = kart.item;
    kart.item = null;
    kart.events.push({ type: 'used', item });
    if (item === 'boost') {
      kart.applyBoost();
      audio.play('boost');
    } else if (item === 'mine') {
      this.dropMine(kart);
    } else if (item === 'missile') {
      this.fireMissile(kart);
    } else if (item === 'llama') {
      this.fireLlama(kart);
    } else if (item === 'egg') {
      this.fireEgg(kart);
    } else if (item === 'shield') {
      kart.shield = true;
      kart.shieldT = 14;
      audio.play('shield');
      this.rings.spawn(kart.pos, 0x8fe3ff, 4, 0.3);
    } else if (item === 'chilli') {
      kart.chilliT = 6;
      kart.applyBoost(6, 1.38);
      audio.play('chilli');
      this.rings.spawn(kart.pos, 0xff5a1a, 6, 0.4);
    } else if (item === 'crow') {
      this.roosterCrow(kart);
    }
  }

  // The rooster crow: a deafening cock-a-doodle-doo that startles every racer
  // ahead of you, squashing them flat and slow for a few seconds.
  roosterCrow(kart) {
    audio.play('crow');
    this.rings.spawn(kart.pos, 0xfff06a, 26, 0.9);
    this.rings.spawn(kart.pos, 0xff8a1e, 16, 0.7);
    for (const other of this.karts) {
      if (other === kart || other.rank > kart.rank) continue;
      if (other.startle(3.2)) {
        other.events.push({ type: 'startled' });
        featherBurst(this.particles, other.pos);
      }
    }
  }

  /* ------------------------- mines ------------------------- */

  dropMine(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, -3);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10),
      new THREE.MeshPhongMaterial({ color: 0x23262b, shininess: 80 })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.34, 6);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x4a4f57 });
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(spikeGeo, spikeMat);
      const a = (k / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.6, 0.5, Math.sin(a) * 0.6);
      sp.rotation.z = -Math.cos(a) * Math.PI / 2;
      sp.rotation.x = Math.sin(a) * Math.PI / 2;
      group.add(sp);
    }
    const lightMat = new THREE.MeshBasicMaterial();
    lightMat.color.setRGB(3, 0.25, 0.2);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lightMat);
    light.position.y = 1.08;
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
          if (Math.abs(kart.pos.y - m.pos.y) > 2.2) continue; // jumped clean over it
          const d = Math.hypot(kart.pos.x - m.pos.x, kart.pos.z - m.pos.z);
          if (d < 2.4) {
            this.explodeAt(m.pos, kart);
            exploded = true;
            break;
          }
        }
      }
      if (exploded || m.life <= 0) {
        disposeGroup(this.scene, m.group);
        this.mines.splice(i, 1);
      }
    }
  }

  /* ------------------------- missiles ------------------------- */

  fireMissile(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, 2.6);
    pos.y = kart.pos.y + 0.8;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, shininess: 80 });
    const red = new THREE.MeshLambertMaterial({ color: 0xd8432f });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 10), bodyMat);
    tube.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 10), red);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.8;
    group.add(tube, nose);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.34), red);
      const a = (k / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 0.28, Math.cos(a) * 0.28, -0.45);
      fin.rotation.z = -a;
      group.add(fin);
    }
    group.position.copy(pos);
    this.scene.add(group);

    const target = this.race.kartAhead(kart);
    this.missiles.push({
      group, pos, owner: kart, target,
      heading: kart.heading, speed: 54, life: 6, immuneT: 0.45,
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
      const lat = lateralOffset(ms.pos, ms.idx);
      // Hug the road surface so missiles climb bridges and dip into tunnels
      ms.pos.y += (surfaceY(ms.idx, lat) + 0.8 - ms.pos.y) * Math.min(1, 10 * dt);
      ms.group.position.copy(ms.pos);
      ms.group.rotation.y = ms.heading;
      ms.group.rotation.z += dt * 9;

      // Exhaust sparks
      this.particles.burst(ms.pos, 1, { color: 0xffc266, glow: 2.4, speed: 1.5, up: 1, size: 0.18, life: 0.3 });

      let dead = false;
      // Hit a kart?
      for (const kart of this.karts) {
        if (kart === ms.owner && ms.immuneT > 0) continue;
        if (Math.abs(kart.pos.y + 0.8 - ms.pos.y) > 2.4) continue;
        const dist = Math.hypot(kart.pos.x - ms.pos.x, kart.pos.z - ms.pos.z);
        if (dist < 1.8) {
          this.explodeAt(ms.pos, kart);
          dead = true;
          break;
        }
      }
      // Flew off the track or timed out?
      if (!dead && (Math.abs(lat) > track.limit || ms.life <= 0)) {
        this.explodeAt(ms.pos, null);
        dead = true;
      }
      if (dead) {
        disposeGroup(this.scene, ms.group);
        this.missiles.splice(i, 1);
      }
    }
  }

  /* ------------------------- thrown eggs ------------------------- */

  // A thrown egg flies dead straight and bounces off the fences. Whoever it
  // hits crashes out with a face full of yolk.
  fireEgg(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, 2.8);
    pos.y = kart.pos.y + 0.9;
    const mesh = new THREE.Mesh(eggGeometry(0.42, 12, 10), new THREE.MeshPhongMaterial({ color: 0xfff6e0, shininess: 60 }));
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.eggs.push({
      mesh, pos, owner: kart, heading: kart.heading,
      speed: Math.max(56, kart.speed + 28), life: 5, immuneT: 0.4, bounces: 3, idx: kart.idx,
    });
    audio.play('throw');
  }

  updateEggs(dt) {
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      e.life -= dt;
      if (e.immuneT > 0) e.immuneT -= dt;
      e.pos.x += Math.sin(e.heading) * e.speed * dt;
      e.pos.z += Math.cos(e.heading) * e.speed * dt;
      e.idx = nearestIdx(e.pos, e.idx);
      const s = track.samples[e.idx];
      const lat = lateralOffset(e.pos, e.idx);
      e.pos.y += (surfaceY(e.idx, lat) + 0.9 - e.pos.y) * Math.min(1, 10 * dt);

      let dead = false;
      // Bounce off the fence: mirror the heading about the direction of the road
      const edge = track.limit - 0.4;
      if (Math.abs(lat) > edge) {
        if (e.bounces-- <= 0) dead = true;
        else {
          const over = Math.abs(lat) - edge;
          e.pos.x -= s.normal.x * over * Math.sign(lat);
          e.pos.z -= s.normal.z * over * Math.sign(lat);
          const th = Math.atan2(s.tan.x, s.tan.z);
          e.heading = 2 * th - e.heading;
          audio.play('bonk');
          this.particles.burst(e.pos, 4, { color: 0xffffff, speed: 3, up: 2, size: 0.18, life: 0.3 });
        }
      }
      // Solid obstacles (hay bales, the barn divider) smash it
      if (!dead) {
        for (const b of track.bales) {
          if (Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) < b.r + 0.4) { dead = true; break; }
        }
      }
      let victim = null;
      if (!dead) {
        for (const kart of this.karts) {
          if (kart === e.owner && e.immuneT > 0) continue;
          if (Math.abs(kart.pos.y + 0.9 - e.pos.y) > 2.4) continue;
          if (Math.hypot(kart.pos.x - e.pos.x, kart.pos.z - e.pos.z) < 1.9) { victim = kart; dead = true; break; }
        }
      }
      if (e.life <= 0) dead = true;

      e.mesh.position.copy(e.pos);
      e.mesh.rotation.x += dt * 14;
      e.mesh.rotation.z += dt * 6;

      if (dead) {
        this.splatAt(e.pos, victim);
        disposeGroup(this.scene, e.mesh);
        this.eggs.splice(i, 1);
      }
    }
  }

  splatAt(pos, victim) {
    this.particles.burst(pos, 10, { color: 0xffc81e, speed: 6, up: 5, size: 0.34, life: 0.7 });
    this.particles.burst(pos, 8, { color: 0xfffbea, speed: 5, up: 4, size: 0.26, life: 0.6 });
    audio.play('splat');
    if (victim && victim.spinOut()) {
      victim.splatT = 3.2;
      victim.events.push({ type: 'splat' });
    }
  }

  /* ------------------------- toy llama ------------------------- */

  fireLlama(kart) {
    const f = kart.forward();
    const pos = kart.pos.clone().addScaledVector(f, 3);
    const group = buildLlama();
    group.position.copy(pos);
    this.scene.add(group);

    const target = this.race.kartAhead(kart);
    this.llamas.push({
      // Launches faster than a kart at full boost so it bolts away ahead of
      // you instead of being rear-ended the instant it spawns.
      group, pos, owner: kart, target,
      heading: kart.heading, speed: 46, life: 7, immuneT: 0.5,
      idx: kart.idx, bob: 0,
    });
    audio.play('llama');
  }

  updateLlamas(dt) {
    for (let i = this.llamas.length - 1; i >= 0; i--) {
      const L = this.llamas[i];
      L.life -= dt;
      if (L.immuneT > 0) L.immuneT -= dt;
      L.speed = Math.min(64, L.speed + 28 * dt); // wind up to a full gallop

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
      const lat = lateralOffset(L.pos, L.idx);
      L.pos.y += (surfaceY(L.idx, lat) - L.pos.y) * Math.min(1, 10 * dt);

      // Galloping hop and a puff of dust from its hooves
      L.bob += dt * 18;
      L.group.position.set(L.pos.x, L.pos.y + Math.abs(Math.sin(L.bob)) * 0.5, L.pos.z);
      L.group.rotation.y = L.heading;
      L.group.rotation.x = Math.sin(L.bob) * 0.12;
      this.particles.burst(L.pos, 1, { color: 0xcaa472, speed: 1.2, up: 0.6, size: 0.2, life: 0.35 });

      let dead = false;
      for (const kart of this.karts) {
        if (kart === L.owner && L.immuneT > 0) continue;
        if (Math.abs(kart.pos.y - L.pos.y) > 2.4) continue;
        const dist = Math.hypot(kart.pos.x - L.pos.x, kart.pos.z - L.pos.z);
        if (dist < 2.1) {
          this.knockOver(kart, L.pos);
          dead = true;
          break;
        }
      }
      if (!dead && (Math.abs(lat) > track.limit || L.life <= 0)) dead = true;
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
    this.rings.spawn(pos, 0xffb04a, 7, 0.4);
    this.particles.burst(pos, 14, { color: 0xfff8f0, speed: 7, up: 7, size: 0.4, life: 1.1 });
    this.particles.burst(pos, 10, { color: 0xff8c33, glow: 2.6, speed: 7, up: 5, size: 0.3, life: 0.5 });
    this.particles.burst(pos, 6, { color: 0x55504a, speed: 3, up: 5, size: 0.6, life: 0.9, grav: -1 });
    audio.play('explosion');
    if (victim) victim.spinOut();
    this.lastBlast = { x: pos.x, z: pos.z, t: performance.now() };
  }

  dispose() {
    for (const b of this.boxes) {
      this.scene.remove(b.mesh, b.halo);
      b.mesh.material.dispose();
      b.halo.material.dispose();
    }
    for (const m of this.mines) disposeGroup(this.scene, m.group);
    for (const ms of this.missiles) disposeGroup(this.scene, ms.group);
    for (const L of this.llamas) disposeGroup(this.scene, L.group);
    for (const e of this.eggs) disposeGroup(this.scene, e.mesh);
    this.eggGeo.dispose();
    this.specialGeo.dispose();
    this.haloGeo.dispose();
    if (this.cobMesh) {
      this.scene.remove(this.cobMesh, this.huskMesh);
      for (const m of [this.cobMesh, this.huskMesh]) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
    }
    this.particles.dispose();
    this.flashes.dispose();
    this.rings.dispose();
  }
}

const _v = new THREE.Vector3();
const _col = new THREE.Color();
const _dummy = new THREE.Object3D();

/* ------------------------- llama model ------------------------- */

function buildLlama() {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xf2ead6 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x6b5640 });
  const pink = new THREE.MeshLambertMaterial({ color: 0xff5fb0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.8), wool);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);

  // A little party saddle blanket so it reads as a toy
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.5, 0.8), pink);
  blanket.position.y = 1.3;
  g.add(blanket);

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
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), dark);
    eye.position.set(s * 0.26, 2.32, 1.2);
    g.add(eye);
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

// A fixed pool of little tumbling quads, recycled round-robin. `glow` pushes a
// particle's colour above 1 so it lights up through the bloom filter; `grav`
// sets how hard it falls (negative makes smoke rise).
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
        spinX: 0, spinY: 0, grav: 9, floor: 0.1, active: false,
      });
    }
    this.next = 0;
  }

  burst(pos, n, { color, speed, up, size, life, glow = 1, grav = 9 }) {
    for (let i = 0; i < n; i++) {
      const p = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      p.active = true;
      p.mesh.visible = true;
      p.floor = Math.min(pos.y, 0) + 0.1; // lets effects work down in the tunnel
      p.mesh.position.set(pos.x, Math.max(p.floor + 0.2, pos.y), pos.z);
      p.mesh.scale.setScalar(size);
      p.mesh.material.color.setHex(color);
      if (glow !== 1) p.mesh.material.color.multiplyScalar(glow);
      p.mesh.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      p.vel.set(Math.cos(a) * speed * Math.random(), up * (0.5 + Math.random()), Math.sin(a) * speed * Math.random());
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.grav = grav;
      p.spinX = (Math.random() - 0.5) * 9;
      p.spinY = (Math.random() - 0.5) * 9;
      p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
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
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < p.floor) {
        p.mesh.position.y = p.floor;
        p.vel.y = 0;
        p.vel.x *= 0.9;
        p.vel.z *= 0.9;
      }
      p.mesh.rotation.x += p.spinX * dt;
      p.mesh.rotation.y += p.spinY * dt;
      p.mesh.material.opacity = Math.min(1, (p.life / p.maxLife) * 1.6);
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
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      mat.color.setRGB(2.6, 1.5, 0.5);
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
    f.mesh.position.set(pos.x, pos.y + 1, pos.z);
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
      f.mesh.scale.setScalar(0.5 + t * 3.4);
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

// Flat shockwave rings that race outward along the ground.
class RingPool {
  constructor(scene, count) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.RingGeometry(0.82, 1, 40);
    this.geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 0, dur: 1, radius: 1, active: false });
    }
    this.next = 0;
  }

  spawn(pos, color, radius, dur) {
    const r = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    r.active = true;
    r.life = r.dur = dur;
    r.radius = radius;
    r.mesh.visible = true;
    r.mesh.material.color.setHex(color).multiplyScalar(1.8);
    r.mesh.position.set(pos.x, pos.y + 0.35, pos.z);
  }

  update(dt) {
    for (const r of this.items) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const t = 1 - r.life / r.dur;
      r.mesh.scale.setScalar(0.4 + (1 - Math.pow(1 - t, 2)) * r.radius);
      r.mesh.material.opacity = 0.9 * (1 - t);
    }
  }

  dispose() {
    for (const r of this.items) {
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    this.geo.dispose();
  }
}

// Feather burst helper used when a chicken spins out
export function featherBurst(particles, pos) {
  _v.set(pos.x, pos.y + 1, pos.z);
  particles.burst(_v, 12, { color: 0xffffff, speed: 6, up: 6, size: 0.35, life: 1.2 });
}
