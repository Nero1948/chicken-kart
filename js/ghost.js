// Ghost racing: record the player's path through a run, and replay a previous
// best run as a translucent "ghost" kart you can race against.

import { buildChickenKart } from './kart.js';

// Seconds between recorded samples. ~12 per second is smooth once interpolated
// and keeps a whole 3-lap run small enough to sit happily in localStorage.
const RATE = 1 / 12;

// Captures the player's position and heading over the course of a run. The times
// are measured from the GO, so a saved ghost lines up with a fresh run's clock.
export class GhostRecorder {
  constructor() { this.reset(); }

  reset() {
    this.samples = [];
    this.next = 0;
  }

  // Call each frame with seconds-since-GO and the live player kart.
  sample(t, kart) {
    if (t < this.next) return;
    this.next = t + RATE;
    this.samples.push([
      +t.toFixed(2),
      +kart.pos.x.toFixed(2),
      +kart.pos.y.toFixed(2),
      +kart.pos.z.toFixed(2),
      +kart.heading.toFixed(3),
    ]);
  }
}

// Replays a recorded run as a see-through kart, positioned by interpolating
// between samples for the current race time.
export class Ghost {
  constructor(scene, def, samples) {
    this.scene = scene;
    this.samples = samples || [];
    this.i = 0;

    this.model = buildChickenKart(def);
    this.group = this.model.group;
    // Make every part translucent and stop it casting shadows or writing depth,
    // so it reads clearly as a ghost and never hides the real player behind it.
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.4;
      o.material.depthWrite = false;
    });
    scene.add(this.group);

    if (this.samples.length) this.applyAt(this.samples[0]);
  }

  applyAt(s) {
    this.group.position.set(s[1], s[2], s[3]);
    this.group.rotation.y = s[4];
  }

  // Place the ghost for the given seconds-since-GO. Hides itself once its run has
  // finished so a slower ghost simply vanishes at its own finish line.
  update(t) {
    const s = this.samples;
    if (s.length < 2) return;

    while (this.i < s.length - 2 && s[this.i + 1][0] <= t) this.i++;
    const a = s[this.i];
    const b = s[this.i + 1];
    const span = b[0] - a[0] || 1;
    const f = Math.max(0, Math.min(1, (t - a[0]) / span));

    this.group.position.set(
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
      a[3] + (b[3] - a[3]) * f,
    );

    // Lerp heading the short way round so it never spins through a full turn.
    let dh = b[4] - a[4];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.group.rotation.y = a[4] + dh * f;

    this.group.visible = t <= s[s.length - 1][0] + 0.15;
  }

  // Exposed for the minimap dot.
  get pos() { return this.group.position; }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    });
  }
}
