// The tracks. There are two: the Funny Farm (a dirt loop with a barn, tunnel
// and jump ramp) and Chickens in the City (an Auckland circuit with the Sky
// Tower and a drive over the Harbour Bridge). Each track shares the same loop
// machinery — a closed Catmull-Rom curve sampled into evenly spaced points —
// and then layers its own scenery and surface features on top.
//
// `buildTrack(scene, id)` swaps the active track: it disposes the previous
// track's meshes, resets the shared `track` object, and rebuilds. Every other
// module reads from `track`, so they all just follow whichever track is active.

import * as THREE from 'three';

const N = 546;     // number of evenly spaced samples around the loop
const COAST = 66;  // city: water lives north of this z line (the harbour)
const ARCH_H = 17; // city: how high the Harbour Bridge steel arch rises

/* ------------------------- track control points ------------------------- */

// Funny Farm: the right (east) side is a long straight where the tunnel/barn
// split lives; the west side stretches into a tight hairpin.
const FARM_PTS = [
  [0, -82],        // 0  start / finish (bottom centre)
  [48, -80],       // 1
  [82, -64],       // 2
  [98, -36],       // 3
  [102, 0],        // 4  east straight (tunnel/barn split lives here)
  [98, 36],        // 5
  [82, 64],        // 6
  [44, 80],        // 7
  [0, 84],         // 8  top centre
  [-50, 80],       // 9
  [-88, 60],       // 10
  [-106, 34],      // 11 hairpin entry (turn in off the top straight)
  [-146, 32],      // 12 out-leg heading west
  [-182, 26],      // 13 out-leg far
  [-204, 8],       // 14 hairpin tip upper
  [-204, -14],     // 15 hairpin tip lower
  [-180, -28],     // 16 in-leg far heading back east
  [-144, -26],     // 17 in-leg
  [-110, -26],     // 18 rejoin
  [-86, -52],      // 19
  [-46, -78],      // 20 sweep down to the start line
];

// Chickens in the City: a technical street circuit. The bottom has a tight
// chicane, the east straight carries a road works lane closure, the top straight
// is the Harbour Bridge over the water, and the south-west corner is a tight
// left-hander back onto the main street.
const CITY_PTS = [
  [0, -100],       // 0  start / finish (bottom: the main street), heading east
  [44, -100],      // 1  start straight (kept flat for the grid)
  [82, -98],       // 2  chicane approach
  [106, -84],      // 3  chicane: jog north (left flick)
  [128, -100],     // 4  chicane: jog south (right flick) -> tight S-bend
  [152, -76],      // 5  swing up onto the east straight
  [158, -40],      // 6  east straight (road works lane closure here)
  [158, 4],        // 7  east straight
  [138, 40],       // 8  north-east sweep
  [102, 66],       // 9  bridge approach (rising, east end)
  [54, 86],        // 10 bridge deck
  [0, 90],         // 11 bridge midpoint (high over the harbour)
  [-54, 86],       // 12 bridge deck
  [-102, 66],      // 13 bridge approach (descending, west end)
  [-140, 40],      // 14 north-west sweep
  [-158, 2],       // 15 west straight
  [-156, -40],     // 16 west straight, lower
  [-146, -74],     // 17 tight left-hander apex
  [-110, -86],     // 18 corner exit kink
  [-70, -98],      // 19 onto the bottom straight
  [-34, -101],     // 20 sweep back to the start line
];

// Tongariro National Park: an off-road volcanic loop. Long flowing straights
// carry jump ramps, the infield holds boulders and the Emerald Lakes, and the
// three great volcanoes (Ngauruhoe, Ruapehu, Tongariro) ring the horizon.
const PARK_PTS = [
  [0, -86],     // 0  start / finish (bottom), heading east
  [46, -84],    // 1  start straight (flat for the grid)
  [84, -70],    // 2
  [108, -42],   // 3
  [114, -6],    // 4  east straight (jump ramp)
  [110, 30],    // 5
  [134, 56],    // 6  outer bulge
  [120, 90],    // 7
  [80, 110],    // 8
  [34, 114],    // 9  top straight (jump ramp)
  [-14, 110],   // 10
  [-60, 112],   // 11
  [-104, 96],   // 12
  [-136, 68],   // 13
  [-146, 32],   // 14 west straight (jump ramp)
  [-150, -6],   // 15
  [-150, -42],  // 16
  [-130, -70],  // 17
  [-92, -86],   // 18
  [-46, -90],   // 19 sweep back to the start line
];

// Mt Maunganui Beach: the tightest, most technical loop in the game. The sea
// runs the whole way along the east (seaward, +x) side; the inland (west) side
// is dunes. The lap packs in two hairpins and several stacked S-bends so it is
// clearly the hardest to drive at speed. The control points are laid out so the
// curve never crosses the seaward boundary line at x = SEA_EDGE.
const SEA_EDGE = 150; // beach: everything east of this x line is open water
const BEACH_PTS = [
  [0, -92],      // 0  start / finish (bottom centre), heading east toward the sea
  [40, -90],     // 1  start straight, kept flat for the grid
  [78, -82],     // 2  sweeping right toward the shoreline
  [104, -60],    // 3  shoreline approach (sea close on the right)
  [96, -30],     // 4  S-bend: flick back inland
  [120, -12],    // 5  S-bend: flick seaward again (tight S)
  [104, 14],     // 6  S-bend: back inland
  [128, 34],     // 7  push out to the seawall
  [118, 60],     // 8  hairpin entry along the shore
  [128, 84],     // 9  hairpin tip (top-right, by the sea)
  [96, 90],      // 10 hairpin exit, doubling back west
  [82, 64],      // 11 return leg running back south a touch
  [54, 78],      // 12 kink out toward the top straight
  [16, 92],      // 13 top of the loop
  [-30, 86],     // 14 inland sweep begins
  [-66, 100],    // 15 chicane: jog north (left flick)
  [-92, 76],     // 16 chicane: jog south (right flick) -> tight S in the dunes
  [-118, 92],    // 17 swing out to the far dune
  [-138, 64],    // 18 dune hairpin entry
  [-150, 34],    // 19 dune hairpin tip (far west)
  [-128, 10],    // 20 hairpin exit heading back east-ish
  [-138, -20],   // 21 down the inland straight (dune jumps live here)
  [-118, -52],   // 22 sweep toward the bottom
  [-86, -78],    // 23 final S into the start
  [-44, -92],    // 24 sweep back to the start line
];

/* ------------------------- the shared track object ------------------------- */

export const track = {
  N,
  id: null,
  name: '',
  theme: null,
  roadHalf: 7,    // half width of the road
  limit: 12,      // how far from the centre line a kart may go before the fence stops it
  samples: [],    // { pos, tan, normal } around the loop
  length: 0,
  bales: [],      // { pos, r } solid round obstacles
  mud: [],        // { pos, r } slow zones
  boxSpotIdx: [], // sample indices where item box rows live
  startGrid: [],  // { pos, heading, idx } six starting slots, front first
  checkpoints: [Math.floor(N * 0.25), Math.floor(N * 0.5), Math.floor(N * 0.75)],
  split: null,     // farm: { startIdx, endIdx, laneOffset } the tunnel|barn straight
  barnZone: null,  // farm: { startIdx, endIdx } sample range covered by the barn
  tunnel: null,    // farm: { startIdx, endIdx, depth } the underground tunnel dip
  ramp: null,      // farm: { startIdx, lipIdx, height } the jump ramp
  jumps: [],       // park: [{ startIdx, lipIdx, height }] several off-road jumps
  bridge: null,    // city: { startIdx, endIdx, deckHeight } the Harbour Bridge arch
  roadworks: null, // city: { startIdx, endIdx, coneSide, openOffset } lane closure
  specialBoxes: [], // [{ pos }] where the sparkly pink llama boxes sit
};

// Track registry. Each definition supplies its points, dimensions, a colour
// theme for the sky/fog, and a `build` function that lays down its scenery.
export const TRACKS = {
  farm: {
    id: 'farm', name: 'Funny Farm', roadHalf: 7, limit: 12, pts: FARM_PTS,
    theme: { sky: 0x87ceeb, fog: [200, 460] },
    build: buildFarm,
  },
  city: {
    id: 'city', name: 'Chickens in the City', roadHalf: 7, limit: 12, pts: CITY_PTS,
    theme: { sky: 0x9fc4dd, fog: [230, 540] },
    build: buildCity,
  },
  park: {
    id: 'park', name: 'Tongariro Park', roadHalf: 7.5, limit: 13, pts: PARK_PTS,
    theme: { sky: 0x8fc1e3, fog: [340, 980] },
    build: buildPark,
  },
  beach: {
    id: 'beach', name: 'Mt Maunganui Beach', roadHalf: 6.5, limit: 11.5, pts: BEACH_PTS,
    theme: { sky: 0x8fd0ec, fog: [220, 520] },
    build: buildBeach,
  },
};

let root = null; // group holding every mesh of the active track

// Deterministic random so the scenery is the same every visit
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/* ------------------------- build / teardown ------------------------- */

export function buildTrack(scene, id = 'farm') {
  const def = TRACKS[id] || TRACKS.farm;

  if (root) {
    scene.remove(root);
    disposeGroup(root);
  }
  root = new THREE.Group();
  resetTrack();

  track.id = def.id;
  track.name = def.name;
  track.roadHalf = def.roadHalf;
  track.limit = def.limit;
  track.theme = def.theme;

  buildSamples(def.pts);
  def.build(root);
  computeStartGrid();

  scene.add(root);
  return def;
}

function resetTrack() {
  track.samples = [];
  track.bales = [];
  track.mud = [];
  track.boxSpotIdx = [];
  track.startGrid = [];
  track.split = null;
  track.barnZone = null;
  track.tunnel = null;
  track.ramp = null;
  track.jumps = [];
  track.bridge = null;
  track.roadworks = null;
  track.specialBoxes = [];
  track.length = 0;
}

function buildSamples(pts) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5
  );
  track.length = curve.getLength();
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const pos = curve.getPointAt(t);
    pos.y = 0;
    const tan = curve.getTangentAt(t);
    tan.y = 0;
    tan.normalize();
    const normal = new THREE.Vector3(-tan.z, 0, tan.x); // points to the right of travel
    track.samples.push({ pos, tan, normal });
  }
}

function disposeGroup(obj) {
  obj.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m) { m.map?.dispose(); m.dispose(); } }
    }
  });
}

/* ------------------------- shared lookups ------------------------- */

// Find the nearest sample index to a position. With a hint we only search a
// window around the previous index, which is fast and stops the index jumping
// across the map where two parts of the track pass near each other.
export function nearestIdx(pos, hint) {
  let best = 0;
  let bestD = Infinity;
  if (hint === null || hint === undefined) {
    for (let i = 0; i < N; i++) {
      const d = pos.distanceToSquared(track.samples[i].pos);
      if (d < bestD) { bestD = d; best = i; }
    }
  } else {
    for (let o = -45; o <= 45; o++) {
      const i = (hint + o + N) % N;
      const d = pos.distanceToSquared(track.samples[i].pos);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

// Signed sideways distance from the centre line (positive = right of travel)
export function lateralOffset(pos, idx) {
  const s = track.samples[idx];
  const dx = pos.x - s.pos.x;
  const dz = pos.z - s.pos.z;
  return dx * s.normal.x + dz * s.normal.z;
}

export function inMud(pos) {
  for (const m of track.mud) {
    if (pos.distanceTo(m.pos) < m.r) return true;
  }
  return false;
}

// Inclusive sample-index range test that copes with wrapping past sample 0
function idxInRange(i, a, b) {
  a = (a + N) % N; b = (b + N) % N;
  return a <= b ? (i >= a && i <= b) : (i >= a || i <= b);
}

// True while a kart is on the divided straight (with a short approach so AI
// drivers commit to the tunnel or barn lane before the divider begins)
export function inSplitZone(idx) {
  const sp = track.split;
  return sp ? idxInRange(idx, sp.startIdx - 16, sp.endIdx) : false;
}

// True while a kart is in (or approaching) the city road works lane closure, so
// AI drivers move over to the open lane before reaching the cones.
export function inRoadworks(idx) {
  const r = track.roadworks;
  return r ? idxInRange(idx, r.startIdx - 12, r.endIdx) : false;
}

// True while a kart is inside the barn (right-hand lane of the split). Used to
// darken the scene and trigger chicken sounds.
export function inBarn(pos, idx) {
  const b = track.barnZone;
  if (!b || !idxInRange(idx, b.startIdx, b.endIdx)) return false;
  const lat = lateralOffset(pos, idx);
  return lat > 0.4 && lat < track.roadHalf + 1.5;
}

// How far from the centre line a kart may sit inside a covered lane before the
// solid outer wall stops it.
export const TUNNEL_WALL_OUTER = -6.4; // left lane (negative lateral)
export const BARN_WALL_OUTER = 6.4;    // right lane (positive lateral)

export function tunnelLane(idx) {
  const tn = track.tunnel;
  if (!tn || !idxInRange(idx, tn.startIdx, tn.endIdx)) return null;
  return { outer: TUNNEL_WALL_OUTER };
}

export function barnLane(idx) {
  const b = track.barnZone;
  if (!b || !idxInRange(idx, b.startIdx, b.endIdx)) return null;
  return { outer: BARN_WALL_OUTER };
}

// Fraction (0..1) of the way through an index range, clamped
function zonePos(idx, a, b) {
  const span = (b - a + N) % N;
  if (span === 0) return 0;
  return Math.min(1, Math.max(0, ((idx - a + N) % N) / span));
}

function smoothstep(x) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

// Height of the drivable surface at a point: the farm's tunnel dip and launch
// ramp, or the city's bridge arch. Ground level (0) everywhere else.
export function surfaceY(idx, lateral) {
  let y = 0;

  const tn = track.tunnel;
  if (tn && lateral < -0.3 && idxInRange(idx, tn.startIdx, tn.endIdx)) {
    const t = zonePos(idx, tn.startIdx, tn.endIdx);
    y -= tn.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * t)); // smooth bowl
  }

  const rp = track.ramp;
  if (rp && idxInRange(idx, rp.startIdx, rp.lipIdx)) {
    y += rp.height * zonePos(idx, rp.startIdx, rp.lipIdx);
  }

  // Off-road jump ramps (park): each rises smoothly to its lip, then the road
  // falls away so a kart at speed launches into the air.
  for (const jp of track.jumps) {
    if (idxInRange(idx, jp.startIdx, jp.lipIdx)) {
      y += jp.height * zonePos(idx, jp.startIdx, jp.lipIdx);
    }
  }

  const br = track.bridge;
  if (br && idxInRange(idx, br.startIdx, br.endIdx)) {
    y += br.deckHeight * bridgeProfile(zonePos(idx, br.startIdx, br.endIdx));
  }

  return y;
}

// The bridge road profile: rise smoothly onto the deck, run flat across the
// main span, then descend. The flat plateau sits over the water.
function bridgeProfile(t) {
  const e = 0.30;
  if (t < e) return smoothstep(t / e);
  if (t > 1 - e) return smoothstep((1 - t) / e);
  return 1;
}

// True for the couple of samples at the ramp lip, where a kart launches
export function atRampLip(idx) {
  const rp = track.ramp;
  if (rp && idxInRange(idx, rp.lipIdx, rp.lipIdx + 1)) return true;
  for (const jp of track.jumps) {
    if (idxInRange(idx, jp.lipIdx, jp.lipIdx + 1)) return true;
  }
  return false;
}

/* ------------------------- geometry helpers ------------------------- */

// A point on the ground a given sideways distance from a sample's centre line
function latPoint(s, lateral) {
  return new THREE.Vector3(s.pos.x + s.normal.x * lateral, 0, s.pos.z + s.normal.z * lateral);
}

// Samples from a to b inclusive, walking forward around the loop
function rangeSamples(a, b) {
  const out = [];
  let i = a;
  for (let n = 0; n < N; n++) {
    out.push(track.samples[i]);
    if (i === b) break;
    i = (i + 1) % N;
  }
  return out;
}

// Indices from a to b inclusive, walking forward
function rangeIndices(a, b) {
  const out = [];
  let i = a;
  for (let n = 0; n < N; n++) { out.push(i); if (i === b) break; i = (i + 1) % N; }
  return out;
}

// A box drawn between two 3D points, used for struts, rails and cables
function strut(group, a, b, w, mat, cast = true) {
  const len = a.distanceTo(b) + 0.05;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), mat);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.lookAt(b.x, b.y, b.z);
  if (cast) m.castShadow = true;
  group.add(m);
  return m;
}

/* ------------------------- shared scenery ------------------------- */

// The road ribbon. `followY` makes it climb the bridge; otherwise it is flat.
function buildRoad(group, { color = 0x9c7b50, shade = true, shadeAmt = 0.16, shadeBase = 0.92, followY = false, seed = 7 } = {}) {
  const half = track.roadHalf;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color(color);
  const rng = mulberry32(seed);

  for (let i = 0; i <= N; i++) {
    const s = track.samples[i % N];
    const l = s.pos.clone().addScaledVector(s.normal, -half);
    const r = s.pos.clone().addScaledVector(s.normal, half);
    const ly = followY ? surfaceY(i % N, -half) + 0.04 : 0.015;
    const ry = followY ? surfaceY(i % N, half) + 0.04 : 0.015;
    positions.push(l.x, ly, l.z, r.x, ry, r.z);
    const sh = shade ? (shadeBase + rng() * shadeAmt) : 1;
    const c = base.clone().multiplyScalar(sh);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  road.receiveShadow = true;
  group.add(road);
}

// A thin painted line along the road (lane markings on the city track)
function buildRoadStrip(group, lat, width, colorHex, followY) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= N; i++) {
    const s = track.samples[i % N];
    const a = s.pos.clone().addScaledVector(s.normal, lat - width / 2);
    const b = s.pos.clone().addScaledVector(s.normal, lat + width / 2);
    const y = followY ? surfaceY(i % N, lat) + 0.06 : 0.025;
    positions.push(a.x, y, a.z, b.x, y, b.z);
  }
  for (let i = 0; i < N; i++) {
    const k = i * 2;
    indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colorHex }));
  group.add(line);
}

function buildStartLine(group) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  const s = track.samples[0];
  const geo = new THREE.PlaneGeometry(track.roadHalf * 2, 3);
  const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(s.pos.x, surfaceY(0, 0) + 0.03, s.pos.z);
  line.rotation.z = Math.atan2(s.tan.x, s.tan.z);
  group.add(line);
}

// Roadside posts and rails. The farm uses white paddock fences; the city uses
// low grey crash barriers that skip the elevated bridge.
function buildRoadside(group, opt) {
  const step = 6;
  const count = Math.ceil(N / step) * 2;
  const postGeo = new THREE.BoxGeometry(opt.postW, opt.postH, opt.postW);
  const railGeo = new THREE.BoxGeometry(0.1, 0.12, 1);
  const mat = lambert(opt.color);
  const posts = new THREE.InstancedMesh(postGeo, mat, count);
  const rails = new THREE.InstancedMesh(railGeo, mat, count * opt.rails.length);
  const dummy = new THREE.Object3D();
  let pi = 0, ri = 0;

  for (const side of [-1, 1]) {
    let prev = null;
    let first = null;
    let firstSkipped = false;
    for (let i = 0; i < N; i += step) {
      if (opt.skipElevated && surfaceY(i, 0) > 1.0) { prev = null; continue; }
      const s = track.samples[i];
      const p = s.pos.clone().addScaledVector(s.normal, opt.offset * side);
      dummy.position.set(p.x, opt.postH / 2, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(pi++, dummy.matrix);
      if (prev) ri = addRails(rails, dummy, prev, p, ri, opt.rails);
      else if (!firstSkipped) { first = p; firstSkipped = true; }
      prev = p;
    }
    if (prev && first && !opt.skipElevated) ri = addRails(rails, dummy, prev, first, ri, opt.rails);
  }
  posts.count = pi;
  rails.count = ri;
  group.add(posts);
  group.add(rails);
}

function addRails(rails, dummy, a, b, ri, heights) {
  const dist = a.distanceTo(b);
  for (const h of heights) {
    dummy.position.set((a.x + b.x) / 2, h, (a.z + b.z) / 2);
    dummy.lookAt(b.x, h, b.z);
    dummy.scale.set(1, 1, dist);
    dummy.updateMatrix();
    rails.setMatrixAt(ri++, dummy.matrix);
  }
  return ri;
}

function buildClouds(group, count) {
  const rng = mulberry32(99);
  const mat = lambert(0xffffff);
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const r = 3 + rng() * 4;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set(j * 4.5 - n * 2, rng() * 1.5, rng() * 3);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set((rng() - 0.5) * 460, 58 + rng() * 28, (rng() - 0.5) * 460);
    group.add(cloud);
  }
}

function buildBanner(group, text, bg) {
  const s = track.samples[0];
  const g = new THREE.Group();
  const poleMat = lambert(0xeeeeee);
  const poleGeo = new THREE.CylinderGeometry(0.25, 0.25, 8, 8);
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * (track.roadHalf + 1.2), 4, 0);
    g.add(pole);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${text.length > 14 ? 38 : 56}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(canvas);
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry((track.roadHalf + 1.2) * 2, 1.8, 0.2),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  banner.position.y = 7.4;
  g.add(banner);

  g.position.set(s.pos.x, 0, s.pos.z);
  g.rotation.y = Math.atan2(-s.tan.x, -s.tan.z);
  group.add(g);
}

function computeStartGrid() {
  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const idx = (N - 12 - row * 6 + N) % N;
    const s = track.samples[idx];
    const pos = s.pos.clone().addScaledVector(s.normal, col === 0 ? -3 : 3);
    pos.y = surfaceY(idx, col === 0 ? -3 : 3);
    const heading = Math.atan2(s.tan.x, s.tan.z);
    track.startGrid.push({ pos, heading, idx });
  }
}

function setBoxSpots(fractions) {
  track.boxSpotIdx = fractions.map((f) => Math.floor(f * N));
}

/* ===================================================================== */
/* ===========================  FUNNY FARM  ============================ */
/* ===================================================================== */

function buildFarm(group) {
  detectStraight();
  computeRamp();
  buildFarmGround(group);
  buildRoad(group); // dirt, flat
  buildStartLine(group);
  buildRoadside(group, { offset: 13, postW: 0.25, postH: 1.1, rails: [0.45, 0.9], color: 0xf5f0e6 });
  buildSplit(group);
  buildRamp(group);
  buildBales(group);
  buildMud(group);
  buildBarn(group);
  buildTrees(group);
  buildClouds(group, 7);
  buildBanner(group, 'CHICKEN KART', '#d8432f');
  setBoxSpots([0.07, 0.40, 0.60, 0.88]);
}

// Locate the long east straight, carve out the divided tunnel/barn section, and
// place the golden llama boxes.
function detectStraight() {
  let best = { start: 0, end: -1, len: 0 };
  let runStart = -1;
  for (let i = 0; i < N; i++) {
    const s = track.samples[i];
    const straightish = s.pos.x > 55 && s.tan.z > 0.85;
    if (straightish && runStart < 0) runStart = i;
    if ((!straightish || i === N - 1) && runStart >= 0) {
      const end = straightish ? i : i - 1;
      if (end - runStart > best.len) best = { start: runStart, end, len: end - runStart };
      runStart = -1;
    }
  }

  if (best.len < 12) {
    track.specialBoxes = [
      { pos: track.samples[Math.floor(0.1 * N)].pos.clone() },
      { pos: track.samples[Math.floor(0.55 * N)].pos.clone() },
    ];
    return;
  }

  const pad = Math.max(4, Math.floor(best.len * 0.18));
  const startIdx = best.start + pad;
  const endIdx = best.end - pad;
  track.split = { startIdx, endIdx, laneOffset: 3.4 };
  track.barnZone = { startIdx, endIdx };
  const tunnelEnd = startIdx + Math.floor((endIdx - startIdx) * 0.55);
  track.tunnel = { startIdx, endIdx: tunnelEnd, depth: 6 };
  track.specialBoxes = [
    { pos: track.samples[(best.start - 8 + N) % N].pos.clone() },
    { pos: track.samples[Math.floor(0.50 * N)].pos.clone() },
  ];
}

// Place the jump ramp on the in-leg coming out of the hairpin.
function computeRamp() {
  const lipIdx = Math.floor(0.80 * N);
  track.ramp = { startIdx: (lipIdx - 5 + N) % N, lipIdx, height: 2.2 };
}

function buildFarmGround(group) {
  const mat = lambert(0x6db33f);
  let geo;
  if (track.tunnel) {
    // A big square with the tunnel lane cut out so the road can dip into earth.
    const shape = new THREE.Shape();
    shape.moveTo(-350, -350);
    shape.lineTo(350, -350);
    shape.lineTo(350, 350);
    shape.lineTo(-350, 350);
    shape.closePath();
    const samples = rangeSamples(track.tunnel.startIdx, track.tunnel.endIdx);
    const inner = [];
    const outer = [];
    for (const s of samples) {
      const pi = latPoint(s, -0.5);
      const po = latPoint(s, -7.4);
      inner.push(new THREE.Vector2(pi.x, -pi.z));
      outer.push(new THREE.Vector2(po.x, -po.z));
    }
    const ring = inner.concat(outer.reverse());
    const hole = new THREE.Path();
    hole.moveTo(ring[0].x, ring[0].y);
    for (let i = 1; i < ring.length; i++) hole.lineTo(ring[i].x, ring[i].y);
    hole.closePath();
    shape.holes.push(hole);
    geo = new THREE.ShapeGeometry(shape);
  } else {
    geo = new THREE.PlaneGeometry(700, 700);
  }
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);
}

function buildSplit(parent) {
  if (!track.split) return;
  const samples = rangeSamples(track.split.startIdx, track.split.endIdx);
  const group = new THREE.Group();

  const red = lambert(0xb03a2e);
  const roofRed = lambert(0x5f201a);
  const wood = lambert(0x7a5230);

  buildTunnel(group);

  const HB = 5.6;
  buildWall(group, samples, 7.0, HB, 0.4, red);
  buildRoof(group, samples, 0.4, 7.0, HB, roofRed);
  buildGable(group, samples[0], 0.4, 7.0, HB, red);
  buildGable(group, samples[samples.length - 1], 0.4, 7.0, HB, red);

  buildWall(group, samples, 0, 2.6, 0.7, wood);
  for (const s of samples) track.bales.push({ pos: latPoint(s, 0), r: 1.2 });

  parent.add(group);
}

function buildTunnel(group) {
  const idxs = rangeIndices(track.tunnel.startIdx, track.tunnel.endIdx);
  const dirt = lambert(0x6b4f34);
  const dark = lambert(0x3a2f26);
  const floorMat = lambert(0x8d8d8d);
  const floorY = (idx) => surfaceY(idx, -3.5);

  buildSloped(group, idxs, -7.0, -0.4, floorY, floorMat, true);
  buildTrenchWall(group, idxs, -7.2, 0.6, dirt);
  buildTrenchWall(group, idxs, -0.4, 0.6, dirt);
  buildSloped(group, idxs, -7.0, -0.4, (idx) => {
    const fy = floorY(idx);
    return fy <= -3.3 ? fy + 3 : null;
  }, dark, false);
}

function buildSloped(group, idxs, latA, latB, yFn, mat, receive) {
  const width = Math.abs(latB - latA);
  const latMid = (latA + latB) / 2;
  for (let i = 0; i < idxs.length - 1; i++) {
    const ya = yFn(idxs[i]);
    const yb = yFn(idxs[i + 1]);
    if (ya === null || yb === null) continue;
    const a = latPoint(track.samples[idxs[i]], latMid); a.y = ya;
    const b = latPoint(track.samples[idxs[i + 1]], latMid); b.y = yb;
    const len = a.distanceTo(b) + 0.05;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, len), mat);
    slab.position.set((a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2);
    slab.lookAt(b.x, b.y, b.z);
    if (receive) slab.receiveShadow = true;
    group.add(slab);
  }
}

function buildTrenchWall(group, idxs, lateral, topY, mat) {
  for (let i = 0; i < idxs.length - 1; i++) {
    const floor = Math.min(surfaceY(idxs[i], -3.5), surfaceY(idxs[i + 1], -3.5));
    const a = latPoint(track.samples[idxs[i]], lateral);
    const b = latPoint(track.samples[idxs[i + 1]], lateral);
    const h = topY - floor;
    const cy = (topY + floor) / 2;
    const len = a.distanceTo(b) + 0.05;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, len), mat);
    seg.position.set((a.x + b.x) / 2, cy, (a.z + b.z) / 2);
    seg.lookAt(b.x, cy, b.z);
    seg.castShadow = true;
    group.add(seg);
  }
}

function buildRamp(parent) {
  if (!track.ramp) return;
  const idxs = rangeIndices(track.ramp.startIdx, track.ramp.lipIdx);
  const group = new THREE.Group();
  const wood = lambert(0x8a5a2b);
  buildSloped(group, idxs, -track.roadHalf, track.roadHalf, (idx) => surfaceY(idx, 0), wood, true);

  const lipS = track.samples[track.ramp.lipIdx];
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(track.roadHalf * 2, 0.5, 0.9),
    lambert(0xf2c14e)
  );
  const lp = latPoint(lipS, 0); lp.y = surfaceY(track.ramp.lipIdx, 0);
  lip.position.copy(lp);
  lip.lookAt(lp.x + lipS.tan.x, lp.y, lp.z + lipS.tan.z);
  lip.castShadow = true;
  group.add(lip);
  parent.add(group);
}

function buildWall(group, samples, lateral, height, thickness, mat) {
  for (let i = 0; i < samples.length - 1; i++) {
    const a = latPoint(samples[i], lateral);
    const b = latPoint(samples[i + 1], lateral);
    const len = a.distanceTo(b) + 0.05;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, len), mat);
    seg.position.set((a.x + b.x) / 2, height / 2, (a.z + b.z) / 2);
    seg.lookAt(b.x, height / 2, b.z);
    seg.castShadow = true;
    group.add(seg);
  }
}

function buildRoof(group, samples, latA, latB, y, mat) {
  const width = Math.abs(latB - latA);
  const latMid = (latA + latB) / 2;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = latPoint(samples[i], latMid);
    const b = latPoint(samples[i + 1], latMid);
    const len = a.distanceTo(b) + 0.05;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, len), mat);
    slab.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    slab.lookAt(b.x, y, b.z);
    slab.castShadow = true;
    group.add(slab);
  }
}

function buildGable(group, s, latA, latB, baseY, mat) {
  const width = Math.abs(latB - latA);
  const latMid = (latA + latB) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, 2.2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
  geo.translate(0, 0, -0.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(latPoint(s, latMid));
  mesh.position.y = baseY;
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(s.normal.x, 0, s.normal.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(s.tan.x, 0, s.tan.z)
  );
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.castShadow = true;
  group.add(mesh);
}

function buildBales(group) {
  const spots = [
    { f: 0.10, s: 1 }, { f: 0.30, s: -1 }, { f: 0.44, s: 1 },
    { f: 0.56, s: -1 }, { f: 0.70, s: 1 }, { f: 0.92, s: -1 },
  ];
  const geo = new THREE.CylinderGeometry(1.1, 1.1, 2.0, 14);
  const mat = lambert(0xd9b44a);
  for (const sp of spots) {
    const idx = Math.floor(sp.f * N);
    if (track.split && idxInRange(idx, track.split.startIdx - 10, track.split.endIdx + 4)) continue;
    const s = track.samples[idx];
    const pos = s.pos.clone().addScaledVector(s.normal, (track.roadHalf - 1.0) * sp.s);
    const bale = new THREE.Mesh(geo, mat);
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = Math.atan2(s.tan.x, s.tan.z);
    bale.position.set(pos.x, 1.1, pos.z);
    bale.castShadow = true;
    group.add(bale);
    track.bales.push({ pos: new THREE.Vector3(pos.x, 0, pos.z), r: 1.5 });
  }
}

function buildMud(group) {
  const s = track.samples[Math.floor(0.50 * N)];
  const geo = new THREE.CircleGeometry(5.5, 24);
  const mat = lambert(0x5e4226);
  const mud = new THREE.Mesh(geo, mat);
  mud.rotation.x = -Math.PI / 2;
  mud.position.set(s.pos.x, 0.04, s.pos.z);
  group.add(mud);
  track.mud.push({ pos: new THREE.Vector3(s.pos.x, 0, s.pos.z), r: 5.5 });
}

function buildBarn(group) {
  const barn = new THREE.Group();
  const red = lambert(0xb03a2e);
  const white = lambert(0xfdf6ec);
  const dark = lambert(0x7a2820);

  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 10), red);
  body.position.y = 3.5;
  body.castShadow = true;
  barn.add(body);

  for (const s of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.5, 6.4), dark);
    slope.position.set(0, 8.6, s * 2.6);
    slope.rotation.x = s * 0.62;
    slope.castShadow = true;
    barn.add(slope);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.5, 0.3), white);
  door.position.set(0, 2.25, 5.05);
  barn.add(door);

  barn.position.set(5, 0, -8);
  barn.rotation.y = 0.4;
  group.add(barn);
}

function buildTrees(group) {
  const rng = mulberry32(42);
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 3, 8);
  const leafGeo = new THREE.ConeGeometry(2.6, 5.5, 9);
  const trunkMat = lambert(0x7a5230);
  const leafMat = lambert(0x3e8e41);

  let placed = 0;
  let tries = 0;
  while (placed < 20 && tries < 400) {
    tries++;
    const x = (rng() - 0.5) * 290;
    const z = (rng() - 0.5) * 250;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 4) {
      minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    }
    if (minD < 18 || p.distanceTo(new THREE.Vector3(5, 0, -8)) < 16) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 5.2;
    leaves.castShadow = true;
    tree.add(trunk, leaves);
    const sc = 0.8 + rng() * 0.7;
    tree.scale.setScalar(sc);
    tree.position.set(x, 0, z);
    group.add(tree);
    placed++;
  }
}

/* ===================================================================== */
/* ======================  CHICKENS IN THE CITY  ====================== */
/* ===================================================================== */

const SKY_TOWER = new THREE.Vector3(-6, 0, -16);

function buildCity(group) {
  computeBridge();
  computeRoadworks();
  buildHarbour(group);
  buildCityGround(group);
  buildRoad(group, { color: 0x3b4046, shadeAmt: 0.07, followY: true, seed: 11 });
  buildRoadStrip(group, 0, 0.5, 0xf4d03f, true);                 // centre line
  buildRoadStrip(group, -(track.roadHalf - 0.7), 0.35, 0xf2f2f2, true); // edge lines
  buildRoadStrip(group, track.roadHalf - 0.7, 0.35, 0xf2f2f2, true);
  buildStartLine(group);
  buildRoadside(group, { offset: 11, postW: 0.22, postH: 0.9, rails: [0.62], color: 0x9aa1a6, skipElevated: true });
  buildBridge(group);
  buildRoadworks(group);
  buildSkyTower(group);
  buildBuildings(group);
  buildStreetlights(group);
  buildBanner(group, 'CHICKENS IN THE CITY', '#1b6fb3');
  buildClouds(group, 5);
  // Box rows kept clear of the bridge crest (~0.5), the chicane and the cones.
  setBoxSpots([0.06, 0.36, 0.65, 0.93]);
  track.specialBoxes = [
    { pos: track.samples[Math.floor(0.46 * N)].pos.clone() },  // on the bridge
    { pos: track.samples[Math.floor(0.70 * N)].pos.clone() },
  ];
}

// Find the east straight (high +x, heading north) and close one lane for road
// works, leaving an open lane on the inside that drivers must merge into.
function computeRoadworks() {
  let best = { s: 0, e: -1, len: 0 };
  let runStart = -1;
  for (let i = 0; i < N; i++) {
    const s = track.samples[i];
    const on = s.pos.x > 142 && s.tan.z > 0.75;
    if (on && runStart < 0) runStart = i;
    if ((!on || i === N - 1) && runStart >= 0) {
      const end = on ? i : i - 1;
      if (end - runStart > best.len) best = { s: runStart, e: end, len: end - runStart };
      runStart = -1;
    }
  }
  if (best.len < 14) { track.roadworks = null; return; }
  const pad = Math.floor(best.len * 0.16);
  // coneSide +1 closes the outer (right) lane; openOffset steers onto the inside.
  track.roadworks = { startIdx: best.s + pad, endIdx: best.e - pad, coneSide: 1, openOffset: -3.6 };
}

// Find the top straight (samples north of z=50) and make it the bridge.
function computeBridge() {
  let best = { s: 0, e: -1, len: 0 };
  let runStart = -1;
  for (let i = 0; i < N; i++) {
    const over = track.samples[i].pos.z > 50;
    if (over && runStart < 0) runStart = i;
    if ((!over || i === N - 1) && runStart >= 0) {
      const end = over ? i : i - 1;
      if (end - runStart > best.len) best = { s: runStart, e: end, len: end - runStart };
      runStart = -1;
    }
  }
  if (best.len < 10) { track.bridge = null; return; }
  track.bridge = { startIdx: best.s, endIdx: best.e, deckHeight: 5.0 };
}

// The harbour: a big water plane, with land to the south (the city) and a
// strip of land to the north (the North Shore) so the bridge spans a strait.
function buildHarbour(group) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshLambertMaterial({ color: 0x2f6f9c })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.4;
  group.add(water);
}

function buildCityGround(group) {
  const mat = lambert(0x6c7178); // city concrete/asphalt grey-green
  // South land (the city) covers everything up to the coastline.
  const south = new THREE.Mesh(new THREE.PlaneGeometry(900, 350 + COAST), mat);
  south.rotation.x = -Math.PI / 2;
  south.position.set(0, -0.02, (COAST - 350) / 2);
  south.receiveShadow = true;
  group.add(south);

  // North Shore land beyond the harbour, so the strait reads as crossable.
  const north = new THREE.Mesh(new THREE.PlaneGeometry(900, 220), mat);
  north.rotation.x = -Math.PI / 2;
  north.position.set(0, -0.02, 160 + 110);
  group.add(north);

  // A thin sandy waterfront edge along the coastline for a bit of contrast.
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(900, 6), lambert(0x8a8068));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(0, 0.0, COAST - 1);
  group.add(edge);
}

/* ------------------------- the Harbour Bridge ------------------------- */

function buildBridge(group) {
  const br = track.bridge;
  if (!br) return;
  const g = new THREE.Group();
  const idxs = rangeIndices(br.startIdx, br.endIdx);
  const deckMat = lambert(0x9aa1a6);
  const steel = lambert(0x7e8c85);    // the bridge's grey-green steel
  const rail = lambert(0xb9c0c4);
  const pierMat = lambert(0x8b9298);

  // Wide deck slab that carries the road and its shoulders over the water.
  buildSloped(g, idxs, -12, 12, (idx) => surfaceY(idx, 0) - 0.25, deckMat, true);

  // Side railings along both edges of the deck.
  buildDeckRail(g, idxs, -11.6, 1.1, rail);
  buildDeckRail(g, idxs, 11.6, 1.1, rail);

  // Support piers wherever the deck is raised, so the approaches and the span
  // over the harbour are both held up (on land the pier foot is just buried).
  for (let i = 0; i < idxs.length; i += 4) {
    const idx = idxs[i];
    if (surfaceY(idx, 0) <= 1.0) continue;
    addPier(g, idx, pierMat);
  }

  // The two steel arches (the "coat hanger"), their hangers and cross-bracing.
  const archL = archPoints(idxs, -9);
  const archR = archPoints(idxs, 9);
  buildArchStruts(g, archL, steel);
  buildArchStruts(g, archR, steel);
  buildHangers(g, archL, steel);
  buildHangers(g, archR, steel);
  buildArchBraces(g, archL, archR, steel);

  group.add(g);
}

// Low solid railing following the deck height.
function buildDeckRail(group, idxs, lateral, height, mat) {
  for (let i = 0; i < idxs.length - 1; i++) {
    const a = latPoint(track.samples[idxs[i]], lateral); a.y = surfaceY(idxs[i], lateral) + height / 2 - 0.1;
    const b = latPoint(track.samples[idxs[i + 1]], lateral); b.y = surfaceY(idxs[i + 1], lateral) + height / 2 - 0.1;
    const len = a.distanceTo(b) + 0.05;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.3, height, len), mat);
    seg.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    seg.lookAt(b.x, b.y, b.z);
    group.add(seg);
  }
}

function addPier(group, idx, mat) {
  const s = track.samples[idx];
  const top = surfaceY(idx, 0) - 0.3;
  const bottomY = -2.4;
  const h = top - bottomY;
  const pier = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.6), mat);
  const p = latPoint(s, 0);
  pier.position.set(p.x, (top + bottomY) / 2, p.z);
  pier.rotation.y = Math.atan2(s.tan.x, s.tan.z);
  pier.castShadow = true;
  group.add(pier);
}

// Points tracing one steel arch: a parabola rising from the deck over the
// central span, kept as { p, idx } so hangers know where the deck sits below.
function archPoints(idxs, side) {
  const n = idxs.length;
  const a0 = Math.floor(n * 0.16);
  const a1 = Math.ceil(n * 0.84);
  const span = a1 - a0;
  const pts = [];
  for (let i = a0; i < a1; i++) {
    const idx = idxs[i];
    const t = (i - a0) / (span - 1);
    const p = latPoint(track.samples[idx], side);
    p.y = surfaceY(idx, 0) + 0.6 + Math.sin(Math.PI * t) * ARCH_H;
    pts.push({ p, idx, side });
  }
  return pts;
}

function buildArchStruts(group, pts, mat) {
  for (let i = 0; i < pts.length - 1; i++) {
    strut(group, pts[i].p, pts[i + 1].p, 0.9, mat);
  }
}

function buildHangers(group, pts, mat) {
  for (let i = 2; i < pts.length - 2; i += 2) {
    const top = pts[i].p;
    const deck = latPoint(track.samples[pts[i].idx], pts[i].side);
    deck.y = surfaceY(pts[i].idx, 0) + 0.4;
    strut(group, top, deck, 0.16, mat, false);
  }
}

function buildArchBraces(group, left, right, mat) {
  const n = Math.min(left.length, right.length);
  for (let i = 3; i < n - 3; i += 3) {
    strut(group, left[i].p, right[i].p, 0.32, mat);
  }
}

/* ------------------------- road works ------------------------- */

// A lane closure on the east straight: a line of traffic cones tapers in from
// the outer edge to the centre and back out, with a striped barrier board and
// a gravel patch in the closed lane. Cones are solid (added to track.bales) and
// the gravel is a slow zone, so clipping the works costs you.
function buildRoadworks(group) {
  const rw = track.roadworks;
  if (!rw) return;
  const g = new THREE.Group();
  const idxs = rangeIndices(rw.startIdx, rw.endIdx);
  const n = idxs.length;
  const taper = Math.max(4, Math.floor(n * 0.28));
  const coneGeo = new THREE.ConeGeometry(0.5, 1.1, 12);
  const baseGeo = new THREE.BoxGeometry(0.85, 0.12, 0.85);
  const orange = lambert(0xff7518);
  const stripe = lambert(0xf3f3f3);
  const base = lambert(0x33373d);

  // Lateral offset of the cone line at step i: tapers from the outer edge in to
  // the centre, runs along the lane divider, then tapers back out.
  const laneLat = (i) => {
    let t;
    if (i < taper) t = i / taper;                       // taper in
    else if (i > n - 1 - taper) t = (n - 1 - i) / taper; // taper out
    else t = 1;                                          // along the divider
    return rw.coneSide * (6.4 - t * 5.8); // 6.4 at the edge -> 0.6 at the divider
  };

  for (let i = 0; i < n; i += 2) {
    const idx = idxs[i];
    const s = track.samples[idx];
    const lat = laneLat(i);
    const p = latPoint(s, lat);
    const y = surfaceY(idx, lat);
    const cone = new THREE.Mesh(coneGeo, orange);
    cone.position.set(p.x, y + 0.55, p.z);
    cone.castShadow = true;
    g.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.18, 12), stripe);
    band.position.set(p.x, y + 0.6, p.z);
    g.add(band);
    const foot = new THREE.Mesh(baseGeo, base);
    foot.position.set(p.x, y + 0.06, p.z);
    g.add(foot);
    track.bales.push({ pos: new THREE.Vector3(p.x, 0, p.z), r: 0.55 });
  }

  // Gravel slow patch in the middle of the closed lane.
  const midS = track.samples[idxs[Math.floor(n / 2)]];
  const gravelPos = latPoint(midS, rw.coneSide * 4.2);
  const gravel = new THREE.Mesh(new THREE.CircleGeometry(4.0, 20), lambert(0x6b6256));
  gravel.rotation.x = -Math.PI / 2;
  gravel.position.set(gravelPos.x, surfaceY(idxs[Math.floor(n / 2)], 0) + 0.03, gravelPos.z);
  g.add(gravel);
  track.mud.push({ pos: new THREE.Vector3(gravelPos.x, 0, gravelPos.z), r: 4.0 });

  // Striped barrier board where the closure begins, facing oncoming karts.
  buildBarrierBoard(g, idxs[Math.max(0, taper - 2)], rw.coneSide * 4.0);

  // A couple of works props on the closed shoulder for flavour (off the road).
  const propS = track.samples[idxs[Math.floor(n * 0.5)]];
  const dirtPos = latPoint(propS, rw.coneSide * 8.5);
  const dirt = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 10), lambert(0x7a6a4f));
  dirt.position.set(dirtPos.x, 0.8, dirtPos.z);
  dirt.castShadow = true;
  g.add(dirt);
  const hutPos = latPoint(track.samples[idxs[Math.floor(n * 0.35)]], rw.coneSide * 9.2);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), lambert(0xe0a83c));
  hut.position.set(hutPos.x, 1.3, hutPos.z);
  hut.castShadow = true;
  g.add(hut);

  group.add(g);
}

function buildBarrierBoard(group, idx, lateral) {
  const s = track.samples[idx];
  const board = new THREE.Group();
  const post = lambert(0x33373d);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  // Diagonal black/orange hazard stripes with a yellow arrow.
  for (let x = -96; x < 256; x += 28) {
    ctx.fillStyle = '#ff7518';
    ctx.beginPath();
    ctx.moveTo(x, 96); ctx.lineTo(x + 14, 96); ctx.lineTo(x + 14 + 96, 0); ctx.lineTo(x + 96, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(x + 14, 96); ctx.lineTo(x + 28, 96); ctx.lineTo(x + 28 + 96, 0); ctx.lineTo(x + 14 + 96, 0);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.3, 0.18), new THREE.MeshBasicMaterial({ map: tex }));
  panel.position.y = 1.5;
  board.add(panel);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), post);
    leg.position.set(side * 1.4, 0.8, 0);
    board.add(leg);
  }
  const p = latPoint(s, lateral);
  board.position.set(p.x, surfaceY(idx, lateral), p.z);
  board.rotation.y = Math.atan2(-s.tan.x, -s.tan.z); // face oncoming traffic
  board.castShadow = true;
  group.add(board);
  track.bales.push({ pos: new THREE.Vector3(p.x, 0, p.z), r: 1.6 });
}

/* ------------------------- the Sky Tower ------------------------- */

function buildSkyTower(group) {
  const g = new THREE.Group();
  const concrete = lambert(0xd2d6d9);
  const dark = lambert(0x556069);
  const glass = lambert(0x7fa8c4);
  const gold = lambert(0xc6a76a);

  // Podium (the SkyCity base) and the tapering shaft.
  const podium = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 16), lambert(0x8b929a));
  podium.position.y = 3; podium.castShadow = true; g.add(podium);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.2, 46, 28), concrete);
  shaft.position.y = 29; shaft.castShadow = true; g.add(shaft);

  // Three slim leg fins running up the shaft, a Sky Tower hallmark.
  for (let k = 0; k < 3; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 44, 1.4), dark);
    const a = (k / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 2.7, 28, Math.sin(a) * 2.7);
    fin.rotation.y = -a;
    g.add(fin);
  }

  // The observation pod near the top.
  const podBase = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.0, 2.4, 28), dark);
  podBase.position.y = 49; g.add(podBase);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 4.2, 28), glass);
  pod.position.y = 52; pod.castShadow = true; g.add(pod);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1.0, 28), gold);
  band.position.y = 53.2; g.add(band);
  const podTop = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.4, 3.0, 28), concrete);
  podTop.position.y = 55.6; g.add(podTop);

  // Upper shaft and the needle mast.
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.0, 9, 20), concrete);
  upper.position.y = 61.5; g.add(upper);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.7, 22, 12), dark);
  mast.position.y = 77; g.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  tip.position.y = 88.5; g.add(tip);

  g.position.copy(SKY_TOWER);
  group.add(g);
}

/* ------------------------- city buildings ------------------------- */

function makeWindowTexture(baseHex, litHex) {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 48, 96);
  const cols = 4, rows = 8;
  const gx = 48 / cols, gy = 96 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < 0.45;
      ctx.fillStyle = lit ? litHex : '#2b3640';
      ctx.fillRect(col * gx + 2, r * gy + 3, gx - 4, gy - 6);
    }
  }
  return new THREE.CanvasTexture(c);
}

function buildBuildings(group) {
  const rng = mulberry32(2026);
  const palettes = [
    ['#7d8893', '#ffe7a8'], ['#5f6b78', '#bfe0ff'], ['#94a0aa', '#ffd98a'],
    ['#6d7a86', '#cfe9ff'], ['#838f99', '#ffe7a8'],
  ];
  const baseTex = palettes.map((p) => makeWindowTexture(p[0], p[1]));

  const placeBuilding = (x, z, w, d, h, ti) => {
    const tex = baseTex[ti].clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 8)));
    tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    group.add(b);
    // A flat darker roof cap.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), lambert(0x49525b));
    cap.position.set(x, h + 0.3, z);
    group.add(cap);
  };

  const clearOfTrack = (x, z, pad) => {
    let minD = Infinity;
    for (let i = 0; i < N; i += 3) {
      const dx = x - track.samples[i].pos.x;
      const dz = z - track.samples[i].pos.z;
      minD = Math.min(minD, dx * dx + dz * dz);
    }
    return minD > pad * pad;
  };

  // Downtown: scattered through the city land, taller closer to the Sky Tower.
  let placed = 0, tries = 0;
  while (placed < 40 && tries < 800) {
    tries++;
    const x = (rng() - 0.5) * 300;
    const z = -95 + rng() * 150; // city land, south of the coastline
    if (z > COAST - 8) continue;
    if (!clearOfTrack(x, z, 13)) continue;
    if (new THREE.Vector3(x, 0, z).distanceTo(SKY_TOWER) < 22) continue;
    const distTower = new THREE.Vector3(x, 0, z).distanceTo(SKY_TOWER);
    const tall = distTower < 90 ? 1.6 : 1.0;
    const w = 6 + rng() * 8;
    const d = 6 + rng() * 8;
    const h = (8 + rng() * 26) * tall;
    placeBuilding(x, z, w, d, h, Math.floor(rng() * baseTex.length));
    placed++;
  }

  // North Shore skyline across the harbour: lower, denser, purely scenic.
  for (let i = 0; i < 16; i++) {
    const x = -150 + rng() * 300;
    const z = 165 + rng() * 70;
    const w = 7 + rng() * 9;
    const d = 7 + rng() * 9;
    const h = 8 + rng() * 18;
    placeBuilding(x, z, w, d, h, Math.floor(rng() * baseTex.length));
  }
}

function buildStreetlights(group) {
  const poleMat = lambert(0x4a4f55);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 6, 8);
  const armGeo = new THREE.BoxGeometry(0.14, 0.14, 2.2);
  const lampGeo = new THREE.SphereGeometry(0.3, 8, 6);

  for (let i = 0; i < N; i += 13) {
    if (surfaceY(i, 0) > 1.0) continue; // not on the bridge
    const side = (Math.floor(i / 13) % 2 === 0) ? 1 : -1;
    const s = track.samples[i];
    const base = s.pos.clone().addScaledVector(s.normal, (track.roadHalf + 2.4) * side);
    const light = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3; light.add(pole);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(0, 6, -1.1 * side); light.add(arm);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0, 5.95, -2.1 * side); light.add(lamp);
    light.position.set(base.x, 0, base.z);
    light.rotation.y = Math.atan2(s.normal.x * side, s.normal.z * side);
    group.add(light);
  }
}

/* ===================================================================== */
/* =====================  TONGARIRO NATIONAL PARK  ==================== */
/* ===================================================================== */

// Where the three great volcanoes sit on the horizon. Kept inside the camera's
// far plane so they read as huge but ever-present landmarks. The order matters
// only for flavour: Ngauruhoe is the perfect smoking cone, Ruapehu the broad
// snow-capped massif, Tongariro the lower rugged ridge.
const VOLCANOES = [
  { x: 36, z: 300, baseR: 66, height: 152, color: 0x4a4038, snowFrac: 0.28, smoke: true },   // Ngauruhoe
  { x: -150, z: 296, baseR: 108, height: 176, color: 0x575049, snowFrac: 0.5, twin: true },   // Ruapehu
  { x: 196, z: 270, baseR: 86, height: 112, color: 0x52473d, snowFrac: 0.2 },                 // Tongariro
];

function buildPark(group) {
  computeParkJumps();
  buildParkGround(group);
  buildRoad(group, { color: 0x8a6038, shadeAmt: 0.22, shadeBase: 0.86, followY: true, seed: 23 });
  buildStartLine(group);
  buildRoadside(group, { offset: 13, postW: 0.28, postH: 1.0, rails: [0.5], color: 0x6e4a28, skipElevated: true });
  buildParkJumps(group);
  buildVolcanoes(group);
  buildEmeraldLakes(group);
  buildBoulders(group);
  buildTussock(group);
  buildBanner(group, 'TONGARIRO PARK', '#7a4a1f');
  buildClouds(group, 6);
  // Item box rows on the flatter stretches, kept clear of the jump ramps.
  setBoxSpots([0.08, 0.34, 0.60, 0.86]);
  track.specialBoxes = [
    { pos: track.samples[Math.floor(0.30 * N)].pos.clone() },
    { pos: track.samples[Math.floor(0.82 * N)].pos.clone() },
  ];
}

// Three jump ramps spaced around the loop, each on one of the long straights.
function computeParkJumps() {
  const defs = [
    { lip: 0.21, height: 2.7 },
    { lip: 0.46, height: 2.4 },
    { lip: 0.71, height: 2.9 },
  ];
  track.jumps = defs.map((d) => {
    const lipIdx = Math.floor(d.lip * N);
    return { startIdx: (lipIdx - 6 + N) % N, lipIdx, height: d.height };
  });
}

// Volcanic ground: a tussocky alpine-desert base with darker scorched lava
// fields scattered around the infield and surrounds.
function buildParkGround(group) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lambert(0x9c8a52));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Dark old-lava patches for texture, well clear of the racing line.
  const rng = mulberry32(71);
  const lava = lambert(0x4f4034);
  let placed = 0, tries = 0;
  while (placed < 14 && tries < 300) {
    tries++;
    const x = (rng() - 0.5) * 360;
    const z = (rng() - 0.5) * 320;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 5) minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    if (minD < 16) continue;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(6 + rng() * 10, 16), lava);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rng() * Math.PI;
    patch.position.set(x, 0.0, z);
    group.add(patch);
    placed++;
  }
}

// Build the dirt jump ramps: a bright caution lip plank at each take-off, with
// chevron stripes, sitting on top of the road that already rises to meet it.
function buildParkJumps(parent) {
  const g = new THREE.Group();
  for (const jp of track.jumps) {
    const lipS = track.samples[jp.lipIdx];
    const lp = latPoint(lipS, 0);
    lp.y = surfaceY(jp.lipIdx, 0);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(track.roadHalf * 2, 0.45, 1.0),
      makeChevronMaterial()
    );
    lip.position.copy(lp);
    lip.position.y += 0.18;
    lip.lookAt(lp.x + lipS.tan.x, lp.y + 0.18, lp.z + lipS.tan.z);
    lip.castShadow = true;
    g.add(lip);

    // Dirt support berms either side of the take-off for a rugged ramp look.
    const berm = lambert(0x6e4a28);
    for (const side of [-1, 1]) {
      const bp = latPoint(lipS, side * (track.roadHalf + 0.8));
      bp.y = surfaceY(jp.lipIdx, 0) * 0.5;
      const mound = new THREE.Mesh(new THREE.ConeGeometry(1.8, jp.height + 1.2, 7), berm);
      mound.position.set(bp.x, bp.y, bp.z);
      mound.castShadow = true;
      g.add(mound);
    }
  }
  parent.add(g);
}

// A reusable yellow/black hazard-chevron texture for the ramp lips.
function makeChevronMaterial() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#1a1a1a';
  for (let x = -32; x < 128; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 32); ctx.lineTo(x + 12, 32); ctx.lineTo(x + 12 + 32, 0); ctx.lineTo(x + 32, 0);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  return new THREE.MeshLambertMaterial({ map: tex });
}

// The three volcanoes ringing the park: a rugged cone, a snow cap that follows
// the cone's slope, and (for Ngauruhoe) a lazy plume of smoke from the crater.
function buildVolcanoes(group) {
  for (const v of VOLCANOES) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(v.baseR, v.height, 36), lambert(v.color));
    cone.position.y = v.height / 2 - 3;
    g.add(cone);

    // Ruapehu is a broad massif: add a second shoulder peak alongside.
    if (v.twin) {
      const peak2 = new THREE.Mesh(new THREE.ConeGeometry(v.baseR * 0.7, v.height * 0.82, 30), lambert(v.color));
      peak2.position.set(v.baseR * 0.7, v.height * 0.82 / 2 - 3, -v.baseR * 0.3);
      g.add(peak2);
    }

    // Snow cap: a white cone covering the top `snowFrac` of the mountain, sized
    // so its base meets the cone's slope at that height.
    const sf = v.snowFrac;
    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(v.baseR * sf, v.height * sf, 36),
      lambert(0xf4f8ff)
    );
    snow.position.y = v.height * (1 - sf / 2) - 3;
    g.add(snow);

    // A dark crater notch at the very top.
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(v.baseR * 0.1, v.baseR * 0.16, v.height * 0.05, 16), lambert(0x2a221c));
    crater.position.y = v.height - 3.5;
    g.add(crater);

    if (v.smoke) {
      const smokeMat = new THREE.MeshLambertMaterial({ color: 0xb6b0a8, transparent: true, opacity: 0.7 });
      const rng = mulberry32(13);
      for (let i = 0; i < 5; i++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(5 + i * 2.5, 10, 8), smokeMat);
        puff.position.set((rng() - 0.5) * 8, v.height + 4 + i * 9, (rng() - 0.5) * 8);
        g.add(puff);
      }
    }

    g.position.set(v.x, 0, v.z);
    group.add(g);
  }
}

// Tongariro's Emerald Lakes: a couple of small vivid teal pools in the infield.
function buildEmeraldLakes(group) {
  const lakes = [
    { f: 0.40, lat: -22, r: 7 },
    { f: 0.58, lat: 18, r: 5 },
  ];
  for (const lk of lakes) {
    const s = track.samples[Math.floor(lk.f * N)];
    const p = latPoint(s, lk.lat);
    const water = new THREE.Mesh(new THREE.CircleGeometry(lk.r, 22), lambert(0x1fb6a6));
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x, 0.03, p.z);
    group.add(water);
    // A pale mineral rim around each pool.
    const rim = new THREE.Mesh(new THREE.RingGeometry(lk.r, lk.r + 1.4, 22), lambert(0xd9c9a0));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(p.x, 0.02, p.z);
    group.add(rim);
  }
}

// Volcanic boulders: solid roadside rocks that punish a wide line (added to
// track.bales), plus a scatter of smaller scenery rocks across the terrain.
function buildBoulders(group) {
  const rockMat = lambert(0x6b6258);
  const darkRock = lambert(0x4d463d);

  // Obstacle boulders close to the racing line.
  const spots = [
    { f: 0.10, s: 1 }, { f: 0.30, s: -1 }, { f: 0.38, s: 1 },
    { f: 0.55, s: -1 }, { f: 0.63, s: 1 }, { f: 0.84, s: -1 }, { f: 0.92, s: 1 },
  ];
  for (const sp of spots) {
    const idx = Math.floor(sp.f * N);
    // Keep boulders off the jump ramps so take-offs stay clean.
    if (track.jumps.some((jp) => idxInRange(idx, jp.startIdx - 3, jp.lipIdx + 3))) continue;
    const s = track.samples[idx];
    const r = 1.5;
    const pos = s.pos.clone().addScaledVector(s.normal, (track.roadHalf - 0.6) * sp.s);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(pos.x, r * 0.7, pos.z);
    rock.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    rock.castShadow = true;
    group.add(rock);
    track.bales.push({ pos: new THREE.Vector3(pos.x, 0, pos.z), r: r + 0.3 });
  }

  // Scenery rocks dotted across the ground, well clear of the track.
  const rng = mulberry32(57);
  let placed = 0, tries = 0;
  while (placed < 40 && tries < 600) {
    tries++;
    const x = (rng() - 0.5) * 380;
    const z = (rng() - 0.5) * 340;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 5) minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    if (minD < 15) continue;
    const r = 0.8 + rng() * 2.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rng() < 0.5 ? rockMat : darkRock);
    rock.position.set(x, r * 0.6, z);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.castShadow = true;
    group.add(rock);
    placed++;
  }
}

// Golden tussock clumps for the alpine-desert feel: little fans of grass blades.
function buildTussock(group) {
  const rng = mulberry32(88);
  const tussockMat = lambert(0xb89b4e);
  const bladeGeo = new THREE.ConeGeometry(0.5, 1.6, 5);
  const count = 90;
  const clumps = new THREE.InstancedMesh(bladeGeo, tussockMat, count);
  const dummy = new THREE.Object3D();
  let n = 0, tries = 0;
  while (n < count && tries < 1200) {
    tries++;
    const x = (rng() - 0.5) * 360;
    const z = (rng() - 0.5) * 320;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 6) minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    if (minD < 11) continue;
    dummy.position.set(x, 0.7, z);
    dummy.rotation.y = rng() * Math.PI;
    const sc = 0.7 + rng() * 0.9;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    clumps.setMatrixAt(n++, dummy.matrix);
  }
  clumps.count = n;
  clumps.castShadow = true;
  group.add(clumps);
}

/* ===================================================================== */
/* ======================  MT MAUNGANUI BEACH  ======================== */
/* ===================================================================== */

// Mauao (the Mount): the iconic green headland at the end of the beach. A single
// steep, tall cone placed past the start/finish line so it dominates the
// horizon as you cross the line. Seaward (+x), well beyond the racing line.
const MAUAO = { x: 120, z: 320, baseR: 92, height: 196 };

function buildBeach(group) {
  computeBeachJumps();
  buildBeachOcean(group);
  buildBeachGround(group);
  buildRoad(group, { color: 0xc8b07e, shadeAmt: 0.14, shadeBase: 0.9, seed: 31 }); // firm wet sand
  buildStartLine(group);
  buildRoadside(group, { offset: 11.5, postW: 0.22, postH: 0.9, rails: [0.5], color: 0xe8dcc0 });
  buildBeachJumps(group);
  buildMauao(group);
  buildDunes(group);
  buildDriftwood(group);
  buildBeachUmbrellas(group);
  buildBanner(group, 'MT MAUNGANUI BEACH', '#1f8ab0');
  buildClouds(group, 6);
  // Item box rows on the flatter stretches, kept clear of the dune jumps.
  setBoxSpots([0.07, 0.33, 0.58, 0.84]);
  track.specialBoxes = [
    { pos: track.samples[Math.floor(0.27 * N)].pos.clone() },
    { pos: track.samples[Math.floor(0.80 * N)].pos.clone() },
  ];
}

// Two dune jump ramps on the inland straight (the long west-side run between the
// dune hairpin and the bottom S). They reuse the shared jump machinery.
function computeBeachJumps() {
  const defs = [
    { lip: 0.62, height: 2.4 },
    { lip: 0.70, height: 2.7 },
  ];
  track.jumps = defs.map((d) => {
    const lipIdx = Math.floor(d.lip * N);
    return { startIdx: (lipIdx - 6 + N) % N, lipIdx, height: d.height };
  });
}

// The sea: a big water plane covering the whole seaward (east) side. It sits
// slightly below ground so the sand reads as the beach sloping into the water.
function buildBeachOcean(group) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshLambertMaterial({ color: 0x2f6f9c })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(SEA_EDGE + 800, -0.6, 0); // its near edge sits at x = SEA_EDGE
  group.add(water);

  // A foamy wet-sand strip right along the waterline for contrast.
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(6, 1200), lambert(0xeae0c8));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(SEA_EDGE - 2, 0.0, 0);
  group.add(foam);
}

// Warm dry sand for the beach ground (the inland half of the world).
function buildBeachGround(group) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), lambert(0xd6c08a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-200, -0.02, 0); // pushed inland so it does not cover the sea
  ground.receiveShadow = true;
  group.add(ground);
}

// Mauao: a single steep green cone (no snow), with a darker base band, standing
// proud on the seaward horizon past the start/finish line.
function buildMauao(group) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(MAUAO.baseR, MAUAO.height, 40), lambert(0x3f7d3a));
  cone.position.y = MAUAO.height / 2 - 3;
  cone.castShadow = true;
  g.add(cone);

  // Darker forested lower flanks: a short, wider cone skirting the base.
  const base = new THREE.Mesh(new THREE.ConeGeometry(MAUAO.baseR * 1.12, MAUAO.height * 0.32, 40), lambert(0x2f5f2c));
  base.position.y = MAUAO.height * 0.16 - 3;
  g.add(base);

  // A rocky crown notch at the very top.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(MAUAO.baseR * 0.08, MAUAO.baseR * 0.14, MAUAO.height * 0.04, 14), lambert(0x6b6258));
  crown.position.y = MAUAO.height - 4;
  g.add(crown);

  g.position.set(MAUAO.x, 0, MAUAO.z);
  group.add(g);
}

// Sand dunes on the inland (west, seaward-negative) side: raised sandy mounds,
// the ones on the jump straight doubling as the ramp support berms.
function buildDunes(group) {
  const sand = lambert(0xcdb87f);
  const marram = lambert(0x9fae5a); // dune grass tint on the larger mounds

  // Big scenic dune mounds dotted along the inland edge of the loop.
  const spots = [
    { f: 0.16, lat: -16, r: 7, h: 4 },
    { f: 0.46, lat: -18, r: 9, h: 5 },
    { f: 0.55, lat: -15, r: 6, h: 3.5 },
    { f: 0.78, lat: -17, r: 8, h: 4.5 },
    { f: 0.90, lat: -16, r: 7, h: 4 },
  ];
  for (const sp of spots) {
    const idx = Math.floor(sp.f * N);
    const s = track.samples[idx];
    // The sea is always at high +x, so the inland side is the one whose normal
    // points toward negative x. Place the dune there, sp.lat away from the road.
    const inland = s.normal.x < 0 ? 1 : -1;
    const p = latPoint(s, Math.abs(sp.lat) * inland);
    const dune = new THREE.Mesh(new THREE.SphereGeometry(sp.r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), sand);
    dune.scale.set(1.4, sp.h / sp.r, 1.0);
    dune.position.set(p.x, -0.2, p.z);
    dune.rotation.y = Math.atan2(s.tan.x, s.tan.z);
    dune.castShadow = true;
    dune.receiveShadow = true;
    group.add(dune);
    // A grassy cap tuft on top of the larger dunes.
    if (sp.r >= 7) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(sp.r * 0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), marram);
      cap.scale.set(1.2, (sp.h * 0.5) / (sp.r * 0.5), 0.9);
      cap.position.set(p.x, sp.h * 0.45 - 0.2, p.z);
      group.add(cap);
    }
  }

  // A low continuous dune ridge well inland, purely scenic on the horizon.
  const rng = mulberry32(64);
  for (let i = 0; i < N; i += 14) {
    const s = track.samples[i];
    const inland = s.normal.x < 0 ? 1 : -1;
    const p = latPoint(s, (42 + rng() * 14) * inland);
    const r = 6 + rng() * 6;
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), sand);
    ridge.scale.set(1.6, (3 + rng() * 3) / r, 1.0);
    ridge.position.set(p.x, -0.3, p.z);
    ridge.rotation.y = rng() * Math.PI;
    group.add(ridge);
  }
}

// Build the dune jump ramps: a chevron caution lip plank at each take-off,
// flanked by sandy support berms, sitting on the road that rises to meet it.
function buildBeachJumps(parent) {
  const g = new THREE.Group();
  const sand = lambert(0xcdb87f);
  for (const jp of track.jumps) {
    const lipS = track.samples[jp.lipIdx];
    const lp = latPoint(lipS, 0);
    lp.y = surfaceY(jp.lipIdx, 0);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(track.roadHalf * 2, 0.45, 1.0),
      makeChevronMaterial()
    );
    lip.position.copy(lp);
    lip.position.y += 0.18;
    lip.lookAt(lp.x + lipS.tan.x, lp.y + 0.18, lp.z + lipS.tan.z);
    lip.castShadow = true;
    g.add(lip);

    // Sandy berms either side of the take-off shaping the ramp.
    for (const side of [-1, 1]) {
      const bp = latPoint(lipS, side * (track.roadHalf + 0.9));
      bp.y = surfaceY(jp.lipIdx, 0) * 0.5;
      const mound = new THREE.Mesh(new THREE.ConeGeometry(2.0, jp.height + 1.2, 8), sand);
      mound.position.set(bp.x, bp.y, bp.z);
      mound.castShadow = true;
      g.add(mound);
    }
  }
  parent.add(g);
}

// Driftwood logs and rocks near the racing line: solid obstacles that punish a
// wide line (added to track.bales), plus a scatter of beach rocks for flavour.
function buildDriftwood(group) {
  const wood = lambert(0x9c8156);
  const paleWood = lambert(0xb6a079);
  const rockMat = lambert(0x807868);

  // Obstacle driftwood logs close to the racing line.
  const logSpots = [
    { f: 0.12, s: 1 }, { f: 0.24, s: -1 }, { f: 0.40, s: 1 },
    { f: 0.52, s: -1 }, { f: 0.66, s: 1 }, { f: 0.88, s: -1 },
  ];
  const logGeo = new THREE.CylinderGeometry(0.9, 1.0, 3.4, 10);
  for (const sp of logSpots) {
    const idx = Math.floor(sp.f * N);
    // Keep logs off the dune jumps so take-offs stay clean.
    if (track.jumps.some((jp) => idxInRange(idx, jp.startIdx - 3, jp.lipIdx + 3))) continue;
    const s = track.samples[idx];
    const pos = s.pos.clone().addScaledVector(s.normal, (track.roadHalf - 0.6) * sp.s);
    const log = new THREE.Mesh(logGeo, sp.s > 0 ? wood : paleWood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = Math.atan2(s.tan.x, s.tan.z) + 0.3;
    log.position.set(pos.x, 0.9, pos.z);
    log.castShadow = true;
    group.add(log);
    track.bales.push({ pos: new THREE.Vector3(pos.x, 0, pos.z), r: 1.7 });
  }

  // Obstacle rocks dotted at a couple of corners too.
  const rockSpots = [{ f: 0.34, s: 1 }, { f: 0.74, s: -1 } ];
  for (const sp of rockSpots) {
    const idx = Math.floor(sp.f * N);
    if (track.jumps.some((jp) => idxInRange(idx, jp.startIdx - 3, jp.lipIdx + 3))) continue;
    const s = track.samples[idx];
    const r = 1.5;
    const pos = s.pos.clone().addScaledVector(s.normal, (track.roadHalf - 0.5) * sp.s);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(pos.x, r * 0.7, pos.z);
    rock.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    rock.castShadow = true;
    group.add(rock);
    track.bales.push({ pos: new THREE.Vector3(pos.x, 0, pos.z), r: r + 0.3 });
  }

  // Scenery driftwood and shells scattered across the dry sand, well clear of
  // the racing line so they are decoration only.
  const rng = mulberry32(83);
  let placed = 0, tries = 0;
  while (placed < 26 && tries < 500) {
    tries++;
    const x = -40 - rng() * 220;
    const z = (rng() - 0.5) * 360;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 5) minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    if (minD < 13) continue;
    if (rng() < 0.6) {
      const stick = new THREE.Mesh(logGeo, rng() < 0.5 ? wood : paleWood);
      stick.rotation.z = Math.PI / 2;
      stick.rotation.y = rng() * Math.PI;
      const sc = 0.5 + rng() * 0.7;
      stick.scale.setScalar(sc);
      stick.position.set(x, 0.6 * sc, z);
      stick.castShadow = true;
      group.add(stick);
    } else {
      const r = 0.6 + rng() * 1.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      rock.position.set(x, r * 0.6, z);
      rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      rock.castShadow = true;
      group.add(rock);
    }
    placed++;
  }
}

// A few cheery beach umbrellas on the dry sand for seaside flavour (decorative,
// kept off the racing line).
function buildBeachUmbrellas(group) {
  const rng = mulberry32(101);
  const poleMat = lambert(0xece6d8);
  const colours = [0xe2483b, 0xf3b733, 0x2f9bd6, 0xe06aa6];
  let placed = 0, tries = 0;
  while (placed < 7 && tries < 200) {
    tries++;
    const x = -30 - rng() * 120;
    const z = (rng() - 0.5) * 300;
    const p = new THREE.Vector3(x, 0, z);
    let minD = Infinity;
    for (let i = 0; i < N; i += 6) minD = Math.min(minD, p.distanceTo(track.samples[i].pos));
    if (minD < 16) continue;
    const u = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), poleMat);
    pole.position.y = 1.5;
    u.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.0, 10), lambert(colours[Math.floor(rng() * colours.length)]));
    canopy.position.y = 3.1;
    canopy.castShadow = true;
    u.add(canopy);
    u.position.set(x, 0, z);
    u.rotation.y = rng() * Math.PI;
    group.add(u);
    placed++;
  }
}
