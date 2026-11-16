// Polaris Protocol — the map: an Arctic research station at night.
// One courtyard with the Reactor at its heart, four halls around it, lanes
// between them. Walls are axis-aligned boxes; collision and raycasts run on
// the same list, so what you see is what blocks you.
import * as THREE from 'three';

// A wall: {x1,z1,x2,z2,h,top} — top is the visible top height (crates are low).
export const WALLS = [];
export const CRATES = [];
function wall(x1, z1, x2, z2, h = 4.5) { WALLS.push({ x1, z1, x2, z2, h }); }
function crate(x, z, w = 2, d = 2, h = 1.2) {
  WALLS.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2, h });
  CRATES.push({ x, z, w, d, h });
}

// Perimeter, 64 x 64 arena.
wall(-32, -32, 32, -31, 5); wall(-32, 31, 32, 32, 5);
wall(-32, -32, -31, 32, 5); wall(31, -32, 32, 32, 5);

// Hall helper: rectangular hall with one door gap on the given side.
function hall(cx, cz, w, d, side, doorW = 3) {
  const x1 = cx - w / 2, x2 = cx + w / 2, z1 = cz - d / 2, z2 = cz + d / 2, t = 0.8;
  wall(x1, z1, x2, z1 + t); wall(x1, z2 - t, x2, z2); // north + south
  wall(x1, z1, x1 + t, z2); wall(x2 - t, z1, x2, z2); // west + east
  // carve the door: cover it back with two segments, leaving the gap open
  if (side === 's') { // door on the south wall (z2)
    wall(x1, z2 - t, cx - doorW / 2, z2); wall(cx + doorW / 2, z2 - t, x2, z2);
    // remove the solid south wall segment behind the gap by splitting it
    WALLS.splice(WALLS.findIndex(w => w.x1 === x1 && w.z1 === z2 - t && w.x2 === x2 && w.z2 === z2), 1);
  } else if (side === 'n') {
    wall(x1, z1, cx - doorW / 2, z1 + t); wall(cx + doorW / 2, z1, x2, z1 + t);
    WALLS.splice(WALLS.findIndex(w => w.x1 === x1 && w.z1 === z1 && w.x2 === x2 && w.z2 === z1 + t), 1);
  } else if (side === 'e') {
    wall(x2 - t, z1, x2, cz - doorW / 2); wall(x2 - t, cz + doorW / 2, x2, z2);
    WALLS.splice(WALLS.findIndex(w => w.x1 === x2 - t && w.z1 === z1 && w.x2 === x2 && w.z2 === z2), 1);
  } else { // 'w'
    wall(x1, z1, x1 + t, cz - doorW / 2); wall(x1, cz + doorW / 2, x1 + t, z2);
    WALLS.splice(WALLS.findIndex(w => w.x1 === x1 && w.z1 === z1 && w.x2 === x1 + t && w.z2 === z2), 1);
  }
}

hall(0, -22, 16, 10, 's');   // North Lab — door faces the courtyard
hall(0, 22, 18, 11, 'n');    // South Hangar — door faces the courtyard
hall(-22, 0, 10, 16, 'e');   // West Dorm
hall(22, 0, 10, 16, 'w');    // East Comms

// Courtyard cover: crates and pillars that make the mid lanes worth playing.
crate(-8, -8, 2.4, 2.4, 1.3); crate(8, -8, 2.4, 2.4, 1.3);
crate(-8, 8, 2.4, 2.4, 1.3); crate(8, 8, 2.4, 2.4, 1.3);
crate(-14, 0, 2, 3, 1.1); crate(14, 0, 2, 3, 1.1);
crate(0, -12, 3, 1.4, 1.0); crate(0, 12, 3, 1.4, 1.0);
crate(-4, -14, 1.6, 1.6, 2.2); crate(5, 14, 1.6, 1.6, 2.2);
// Interior crates inside the halls.
crate(-4, -22, 2, 2, 1.2); crate(4, -22, 2, 2, 1.2);
crate(-5, 22, 2.4, 2, 1.2); crate(5, 22, 2.4, 2, 1.2);
crate(-22, -5, 2, 2, 1.2); crate(-22, 5, 2, 2, 1.2);
crate(22, -5, 2, 2, 1.2); crate(22, 5, 2, 2, 1.2);

// Spawns: inside each team's hall, facing the door to the courtyard
// (yaw 0 = -z for Polaris south, yaw PI = +z for Glacier north).
export const SPAWNS = {
  polaris: [{ x: -6, z: 24, yaw: 0 }, { x: -2, z: 24, yaw: 0 }, { x: 2, z: 24, yaw: 0 }, { x: 6, z: 24, yaw: 0 }, { x: 0, z: 20, yaw: 0 }],
  glacier: [{ x: -6, z: -24, yaw: Math.PI }, { x: -2, z: -24, yaw: Math.PI }, { x: 2, z: -24, yaw: Math.PI }, { x: 6, z: -24, yaw: Math.PI }, { x: 0, z: -20, yaw: Math.PI }],
};

// Waypoint graph for bot routes: nodes at spawns, courtyard ring, hall doors
// and hall interiors. Edges link nodes whose straight path is wall-free.
export const NODES = [
  { x: 0, z: 24 }, { x: -6, z: 24 }, { x: 6, z: 24 },
  { x: 0, z: -24 }, { x: -6, z: -24 }, { x: 6, z: -24 },
  { x: 0, z: 10 }, { x: 0, z: -10 }, { x: -10, z: 0 }, { x: 10, z: 0 },
  { x: -8, z: -8 }, { x: 8, z: -8 }, { x: -8, z: 8 }, { x: 8, z: 8 },
  { x: 0, z: -16 }, { x: 0, z: 16 }, { x: -16, z: 0 }, { x: 16, z: 0 },
  { x: 0, z: -22 }, { x: 0, z: 22 }, { x: -22, z: 0 }, { x: 22, z: 0 },
  { x: -22, z: -8 }, { x: 22, z: 8 }, { x: -14, z: 14 }, { x: 14, z: -14 },
];
export const EDGES = [];
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const a = NODES[i], b = NODES[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 15 || d < 0.1) continue;
    if (!segmentBlocked(a.x, a.z, b.x, b.z)) { EDGES.push([i, j]); }
  }
}
const ADJ = NODES.map(() => []);
for (const [i, j] of EDGES) { ADJ[i].push(j); ADJ[j].push(i); }

export function nearestNode(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < NODES.length; i++) {
    const d = (NODES[i].x - x) ** 2 + (NODES[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Breadth-first route between nodes; returns a list of node indices.
export function findPath(a, b) {
  if (a === b) return [a];
  const prev = new Array(NODES.length).fill(-1);
  const q = [a]; prev[a] = a;
  while (q.length) {
    const n = q.shift();
    if (n === b) break;
    for (const m of ADJ[n]) if (prev[m] < 0) { prev[m] = n; q.push(m); }
  }
  if (prev[b] < 0) return [b];
  const path = []; let n = b;
  while (n !== a) { path.unshift(n); n = prev[n]; }
  path.unshift(a);
  return path;
}

// ---- collision & raycasts (2D in XZ, heights on Y) ----
// Circle (agent) vs wall boxes: push the circle out. Returns true if it hit.
export function collideCircle(p, r) {
  let hit = false;
  for (const w of WALLS) {
    const cx = Math.max(w.x1, Math.min(p.x, w.x2));
    const cz = Math.max(w.z1, Math.min(p.z, w.z2));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + dx / d * r; p.z = cz + dz / d * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = p.x - w.x1, pr = w.x2 - p.x, pt = p.z - w.z1, pb = w.z2 - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = w.x1 - r; else if (m === pr) p.x = w.x2 + r;
        else if (m === pt) p.z = w.z1 - r; else p.z = w.z2 + r;
      }
    }
  }
  return hit;
}

// Ray vs wall boxes (slab test). Returns nearest hit distance or Infinity.
export function rayWalls(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const w of WALLS) {
    let t0 = 0, t1 = best, ok = true;
    const axes = [[ox, dx, w.x1, w.x2], [oy, dy, 0, w.h], [oz, dz, w.z1, w.z2]];
    for (const [o, d, mn, mx] of axes) {
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } continue; }
      let ta = (mn - o) / d, tb = (mx - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best && t0 >= 0) best = t0;
  }
  return best;
}

export function segmentBlocked(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  return rayWalls(x1, 1.0, z1, dx / len, 0, dz / len, len - 0.05) < len - 0.05;
}

// Line of sight between two eye positions, optionally blocked by smoke puffs.
export function hasLOS(ax, ay, az, bx, by, bz, smokes) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  if (rayWalls(ax, ay, az, dx / len, dy / len, dz / len, len) < len - 0.01) return false;
  if (smokes) {
    for (const s of smokes) {
      // segment-sphere test against the smoke cloud
      const cx = s.x - ax, cy = s.y - ay, cz = s.z - az;
      const t = Math.max(0, Math.min(1, (cx * dx + cy * dy + cz * dz) / (len * len)));
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return false;
    }
  }
  return true;
}

// ---- visuals: procedural canvas textures + the station geometry ----
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function snowTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cdd8e6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 190 + Math.random() * 55;
      g.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(140,160,190,0.35)';
    for (let i = 0; i < 24; i++) {
      g.beginPath(); const y = Math.random() * h;
      g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 8); g.stroke();
    }
  });
}
function panelTexture(base, line) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 8, 3);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, h - 14, w, 14);
  });
}
function hazardTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8a419'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#15181d';
    for (let i = -2; i < 4; i++) {
      g.beginPath();
      g.moveTo(i * 32, h); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, h);
      g.fill();
    }
  });
}

export function buildMap(scene) {
  const snow = snowTexture();
  snow.repeat.set(16, 16);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ map: snow, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallTex = panelTexture('#3a4552', '#232b36');
  const hallTex = panelTexture('#4a3f35', '#2c251e');
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.15 });
  const hallMat = new THREE.MeshStandardMaterial({ map: hallTex, roughness: 0.9, metalness: 0.1 });
  const crateMat = new THREE.MeshStandardMaterial({ map: panelTexture('#5a4a33', '#33291a'), roughness: 0.9 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const w of WALLS) {
    const isCrate = w.h <= 2.2 && (w.x2 - w.x1) <= 3 && (w.z2 - w.z1) <= 3;
    const mesh = new THREE.Mesh(boxGeo, isCrate ? crateMat : wallMat);
    mesh.position.set((w.x1 + w.x2) / 2, w.h / 2, (w.z1 + w.z2) / 2);
    mesh.scale.set(w.x2 - w.x1, w.h, w.z2 - w.z1);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Reactor platform: dark steel deck with a hazard ring, glowing core.
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.9, 0.35, 40),
    new THREE.MeshStandardMaterial({ color: 0x2b333d, roughness: 0.6, metalness: 0.5 })
  );
  platform.position.set(0, 0.17, 0);
  platform.receiveShadow = true;
  scene.add(platform);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.7, 5.55, 40),
    new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.36, 0);
  scene.add(ring);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.4, 3.6, 24),
    new THREE.MeshStandardMaterial({ color: 0x0b2a33, emissive: 0x18c8e8, emissiveIntensity: 1.6, roughness: 0.3 })
  );
  core.position.set(0, 2.0, 0);
  scene.add(core);
  const coreTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x66eaff, emissive: 0x33d5ff, emissiveIntensity: 2.4 })
  );
  coreTop.position.set(0, 4.0, 0);
  scene.add(coreTop);
  const coreLight = new THREE.PointLight(0x35d5ff, 60, 26, 1.8);
  coreLight.position.set(0, 4.4, 0);
  scene.add(coreLight);

  // Floodlight poles at the courtyard corners.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a8, emissiveIntensity: 2.2 });
  for (const [px, pz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 8), poleMat);
    pole.position.set(px, 3, pz);
    scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), lampMat);
    lamp.position.set(px, 6.1, pz);
    scene.add(lamp);
    const pl = new THREE.PointLight(0xffe2a0, 55, 30, 1.7);
    pl.position.set(px, 5.8, pz);
    scene.add(pl);
  }

  // Hall roof trims + door lintels so the halls read as buildings.
  for (const [cx, cz, w, d] of [[0, -22, 16, 10], [0, 22, 18, 11], [-22, 0, 10, 16], [22, 0, 10, 16]]) {
    const roof = new THREE.Mesh(boxGeo, hallMat);
    roof.position.set(cx, 4.9, cz);
    roof.scale.set(w + 1, 0.7, d + 1);
    scene.add(roof);
    // Warm interior light so the halls are playable, not caves.
    const hl = new THREE.PointLight(0xffd9a0, 26, 20, 1.7);
    hl.position.set(cx, 3.4, cz);
    scene.add(hl);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 })
    );
    sign.position.set(cx, 4.4, cz + (cz < 0 ? d / 2 + 0.05 : -(d / 2 + 0.05)));
    if (cz > 0) sign.rotation.y = Math.PI;
    scene.add(sign);
  }

  // Distant ridge silhouettes so the horizon is not empty.
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const r = 95 + (i % 3) * 12;
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(22 + (i % 4) * 8, 26 + (i % 5) * 9, 4), ridgeMat);
    ridge.position.set(Math.cos(a) * r, 6, Math.sin(a) * r);
    ridge.rotation.y = a;
    scene.add(ridge);
  }
  return { core, coreLight };
}
