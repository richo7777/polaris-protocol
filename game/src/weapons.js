// Polaris Protocol — hitscan gunplay shared by the player and the bots.
// One ray per pellet: walls first, then head/body spheres on every agent.
// Damage, spread bloom, recoil and reload all live here.
import * as THREE from 'three';
import { WEAPONS, ECON, EYE_HEIGHT } from './state.js';
import { rayWalls } from './map.js';

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxD) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  return t > 0 && t < maxD ? t : -1;
}

// Fire one trigger pull from `shooter` along `dir` (already includes aim).
// world: { agents, smokes, fx, sfx, match, time, onKill, onHit }.
export function fireShot(shooter, origin, dir, world) {
  const w = WEAPONS[shooter.weapon];
  const now = world.time;
  if (shooter.reloading || shooter.ammo <= 0 || now - shooter.lastShot < 60 / w.rpm) return false;
  shooter.lastShot = now;
  shooter.ammo--;
  // Spread: base + bloom + movement, in radians. Scoped sniper is nearly exact.
  const move = shooter.speed || 0;
  const spreadDeg = (w.spread + shooter.spread + move * 0.35 + (shooter.crouch ? -0.15 : 0)) * (shooter.scoped ? 0.15 : 1);
  const spreadRad = Math.max(0.02, spreadDeg) * Math.PI / 180;
  shooter.spread = Math.min(4, shooter.spread + w.bloom);
  shooter.recoilP = Math.min(3.2, shooter.recoilP + w.recoil);
  const muzzle = _origin.copy(origin);
  // Spread basis, computed once per trigger pull.
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-dir.x, -dir.z), 0)));
  const up = new THREE.Vector3().crossVectors(dir, right).normalize();
  for (let p = 0; p < w.pellets; p++) {
    _dir.copy(dir);
    const a = Math.random() * Math.PI * 2, r = Math.random() * spreadRad;
    _dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const wallD = rayWalls(muzzle.x, muzzle.y, muzzle.z, _dir.x, _dir.y, _dir.z, w.range);
    // Nearest agent hit: head sphere, then body sphere.
    let bestT = wallD, bestAgent = null, bestHead = false;
    for (const a of world.agents) {
      if (!a.alive || a === shooter) continue;
      const th = raySphere(muzzle.x, muzzle.y, muzzle.z, _dir.x, _dir.y, _dir.z, a.x, 1.52, a.z, 0.24, bestT);
      if (th > 0) { bestT = th; bestAgent = a; bestHead = true; continue; }
      const tb = raySphere(muzzle.x, muzzle.y, muzzle.z, _dir.x, _dir.y, _dir.z, a.x, 0.95, a.z, 0.44, bestT);
      if (tb > 0) { bestT = tb; bestAgent = a; bestHead = false; }
    }
    const end = new THREE.Vector3().copy(muzzle).addScaledVector(_dir, bestT);
    world.fx.tracer(muzzle, end, w.tracer);
    if (bestAgent) {
      let dmg = w.dmg * (bestHead ? w.hs : 1) * (bestT > w.range * 0.6 ? 0.6 : 1);
      damageAgent(bestAgent, dmg, shooter, bestHead, world);
      world.fx.burst(end, bestHead ? 10 : 6, bestHead ? 0xff5a4d : 0x9fd8ff, 3, 1);
      if (shooter.isPlayer) world.onHit(bestHead, bestAgent.hp <= 0);
    } else if (bestT < w.range) {
      world.fx.burst(end, 5, 0xcfe0f0, 2, 1);
    }
  }
  world.fx.muzzle(muzzle);
  const dist = shooter.isPlayer ? 0 : Math.hypot(shooter.x - world.player.x, shooter.z - world.player.z);
  world.sfx.shot(shooter.weapon, !shooter.isPlayer && dist > 18);
  if (world.onShot) world.onShot(shooter);
  return true;
}

export function damageAgent(target, dmg, attacker, head, world) {
  if (!target.alive) return;
  let rem = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, rem * 0.5);
    target.armor -= absorbed; rem -= absorbed;
  }
  target.hp -= rem;
  if (target.isPlayer) world.sfx.hurt();
  if (target.hp <= 0) {
    target.hp = 0; target.alive = false; target.deaths++;
    if (attacker && attacker !== target) {
      attacker.kills++;
      attacker.money += ECON.kill;
      world.match.killfeed.unshift({ killer: attacker.name, victim: target.name, head, killerTeam: attacker.team, victimTeam: target.team, t: world.time });
      if (world.match.killfeed.length > 6) world.match.killfeed.pop();
      if (attacker.isPlayer) world.sfx.kill();
    }
    world.onKill(target, attacker);
  }
}

export function startReload(a, world) {
  const w = WEAPONS[a.weapon];
  if (a.reloading || a.ammo >= w.mag || a.reserve <= 0) return false;
  a.reloading = true;
  a.reloadUntil = world.time + w.reload;
  if (a.isPlayer) world.sfx.reload();
  return true;
}

export function updateReload(a, world) {
  if (!a.reloading) return;
  if (world.time >= a.reloadUntil) {
    const w = WEAPONS[a.weapon];
    const need = w.mag - a.ammo;
    const take = Math.min(need, a.reserve);
    a.ammo += take; a.reserve -= take;
    a.reloading = false;
  }
}

export function buyWeapon(a, id, world) {
  const w = WEAPONS[id];
  if (!w || a.money < w.price) return false;
  a.money -= w.price;
  a.weapon = id; a.ammo = w.mag; a.reserve = w.reserve;
  a.reloading = false;
  if (a.isPlayer) world.sfx.buy();
  return true;
}

export function buyArmor(a, world) {
  if (a.money < ECON.armor || a.armor >= 100) return false;
  a.money -= ECON.armor; a.armor = 100;
  if (a.isPlayer) world.sfx.buy();
  return true;
}

export function buyGrenade(a, type, world) {
  const price = type === 'flash' ? ECON.flash : ECON.smoke;
  if (a.money < price) return false;
  a.money -= price;
  if (type === 'flash') a.flash++; else a.smoke++;
  if (a.isPlayer) world.sfx.buy();
  return true;
}

// Throw the selected grenade from the agent's eye, along its view direction.
export function throwGrenade(a, world) {
  const type = a.grenadeSel;
  if (type === 'flash' && a.flash <= 0) return false;
  if (type === 'smoke' && a.smoke <= 0) return false;
  if (type === 'flash') a.flash--; else a.smoke--;
  const dir = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch) + 0.25, -Math.cos(a.yaw) * Math.cos(a.pitch)).normalize();
  world.match.grenades.push({
    type, team: a.team, owner: a,
    x: a.x, y: EYE_HEIGHT, z: a.z,
    vx: dir.x * 13, vy: dir.y * 13 + 2, vz: dir.z * 13,
    t: 1.4,
  });
  return true;
}

export function detonateGrenade(g, world) {
  if (g.type === 'flash') {
    world.sfx.flash();
    for (const a of world.agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - g.x, a.z - g.z);
      if (d > 16) continue;
      // Only blinds agents that can see the pop.
      const blocked = rayWalls(g.x, g.y, g.z, (a.x - g.x) / (d || 1), 0, (a.z - g.z) / (d || 1), d) < d - 0.1;
      if (!blocked) a.blindUntil = world.time + 2.6 * (1 - d / 20);
      if (a.isPlayer) world.match.events.push({ kind: 'flash', t: world.time, strength: Math.max(0, 1 - d / 16) });
    }
    world.fx.burst(new THREE.Vector3(g.x, g.y, g.z), 24, 0xffffff, 6, 2);
  } else {
    world.match.smokes.push({ x: g.x, y: Math.max(1.2, g.y), z: g.z, r: 3.8, t: 14 });
    world.fx.burst(new THREE.Vector3(g.x, g.y, g.z), 30, 0x9aa8b8, 2, 2);
  }
}
