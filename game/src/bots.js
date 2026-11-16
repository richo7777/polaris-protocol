// Polaris Protocol — bot brains. One state machine per bot: patrol the lanes,
// hold the Reactor, rush it when the round is slipping away, engage anything
// it can see, and react to gunfire it hears. Allies and enemies share it.
import * as THREE from 'three';
import { WEAPONS, CAPTURE_RADIUS, AGENT_RADIUS, EYE_HEIGHT } from './state.js';
import { NODES, nearestNode, findPath, collideCircle, hasLOS } from './map.js';
import { fireShot, startReload } from './weapons.js';

export function makeBotBrain() {
  const skill = 0.55 + Math.random() * 0.3; // reaction + aim quality
  return {
    skill,
    state: 'patrol', // patrol | hold | rush | capture | engage
    target: null, lastSeen: null, lastSeenAt: -99,
    path: [], wp: 0, destNode: -1,
    thinkAt: 0, reactAt: 0, burstLeft: 0, burstAt: 0, pauseUntil: 0,
    strafeDir: Math.random() < 0.5 ? 1 : -1, strafeAt: 0,
    holdNode: -1, aimErr: 0,
  };
}

function eyeOf(a) { return { x: a.x, y: a.crouch ? 1.05 : EYE_HEIGHT, z: a.z }; }

function visibleEnemy(bot, world) {
  const eye = eyeOf(bot);
  let best = null, bestD = 46;
  for (const a of world.agents) {
    if (!a.alive || a.team === bot.team) continue;
    const d = Math.hypot(a.x - bot.x, a.z - bot.z);
    if (d > bestD) continue;
    const ae = eyeOf(a);
    if (hasLOS(eye.x, eye.y, eye.z, ae.x, ae.y, ae.z, world.match.smokes)) { best = a; bestD = d; }
  }
  return best;
}

function setPath(bot, destNode) {
  if (bot.ai.destNode === destNode && bot.ai.path.length) return;
  const from = nearestNode(bot.x, bot.z);
  bot.ai.path = findPath(from, destNode);
  bot.ai.wp = 0; bot.ai.destNode = destNode;
}

function moveAlongPath(bot, dt, speed) {
  const ai = bot.ai;
  if (!ai.path.length) return false;
  const node = NODES[ai.path[Math.min(ai.wp, ai.path.length - 1)]];
  const dx = node.x - bot.x, dz = node.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.9) {
    ai.wp++;
    if (ai.wp >= ai.path.length) { ai.path = []; return false; }
    return true;
  }
  bot.x += dx / d * speed * dt;
  bot.z += dz / d * speed * dt;
  bot.yaw = Math.atan2(-dx, -dz);
  bot.moving = true; bot.speed = speed;
  collideCircle(bot, AGENT_RADIUS);
  return true;
}

function aimAt(bot, tx, ty, tz, dt, errDeg) {
  const dx = tx - bot.x, dy = ty - (bot.crouch ? 1.05 : EYE_HEIGHT), dz = tz - bot.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
  const err = errDeg * Math.PI / 180;
  let dyaw = wantYaw - bot.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const k = Math.min(1, dt * 7);
  bot.yaw += dyaw * k + (Math.random() - 0.5) * err * k;
  bot.pitch += (wantPitch - bot.pitch) * k + (Math.random() - 0.5) * err * k * 0.5;
  bot.pitch = Math.max(-1.4, Math.min(1.4, bot.pitch));
}

export function updateBot(bot, dt, world) {
  const ai = bot.ai;
  if (!ai || !bot.alive) return;
  const now = world.time;
  bot.moving = false; bot.speed = 0;
  const blind = now < bot.blindUntil;
  // ---- think (4x a second) ----
  if (now >= ai.thinkAt) {
    ai.thinkAt = now + 0.25;
    const enemy = blind ? null : visibleEnemy(bot, world);
    if (enemy) {
      if (ai.target !== enemy) { ai.reactAt = now + (0.55 - ai.skill * 0.35); ai.burstLeft = 0; }
      ai.target = enemy; ai.lastSeen = { x: enemy.x, z: enemy.z }; ai.lastSeenAt = now;
      ai.state = 'engage';
    } else if (ai.target) {
      // Lost sight: investigate the last known spot briefly, then resume.
      ai.state = 'patrol';
      if (now - ai.lastSeenAt < 3 && ai.lastSeen) {
        const n = nearestNode(ai.lastSeen.x, ai.lastSeen.z);
        setPath(bot, n);
      }
      ai.target = null;
    }
    if (ai.state !== 'engage') {
      const cap = world.match.capture;
      const inZone = Math.hypot(bot.x, bot.z) < CAPTURE_RADIUS;
      const enemyInZone = world.agents.some(a => a.alive && a.team !== bot.team && Math.hypot(a.x, a.z) < CAPTURE_RADIUS);
      const myScore = world.match.score[bot.team], foeScore = world.match.score[bot.team === 'polaris' ? 'glacier' : 'polaris'];
      if (!enemyInZone && inZone && cap.team !== (bot.team === 'polaris' ? 'glacier' : 'polaris')) {
        ai.state = 'capture';
      } else if (world.match.timer < 30 || foeScore > myScore) {
        ai.state = 'rush'; setPath(bot, nearestNode(0, 0));
      } else if (ai.state === 'capture' || ai.state === 'hold' || ai.state === 'rush') {
        // keep the current job until the think step changes it
      } else if (!ai.path.length) {
        // patrol: pick a fresh lane node, biased toward the Reactor
        const picks = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23, 24, 25];
        setPath(bot, picks[Math.floor(Math.random() * picks.length)]);
        ai.state = 'patrol';
      }
    }
  }
  // ---- act ----
  const speed = 3.1 + ai.skill * 0.9;
  if (blind) {
    bot.yaw += dt * 1.5; // disoriented turn
    return;
  }
  if (ai.state === 'engage' && ai.target && ai.target.alive) {
    const t = ai.target;
    const d = Math.hypot(t.x - bot.x, t.z - bot.z);
    // Strafe to stay a hard target, keep a fighting distance.
    if (now >= ai.strafeAt) { ai.strafeAt = now + 0.7 + Math.random() * 0.8; ai.strafeDir *= -1; }
    const ex = t.x - bot.x, ez = t.z - bot.z;
    const px = -ez / (d || 1), pz = ex / (d || 1);
    let mx = px * ai.strafeDir * 0.8, mz = pz * ai.strafeDir * 0.8;
    if (d > 20) { mx += ex / d * 0.9; mz += ez / d * 0.9; }
    if (d < 6) { mx -= ex / d * 0.9; mz -= ez / d * 0.9; }
    bot.x += mx * speed * 0.7 * dt; bot.z += mz * speed * 0.7 * dt;
    bot.moving = true; bot.speed = speed * 0.7;
    collideCircle(bot, AGENT_RADIUS);
    aimAt(bot, t.x, 1.3, t.z, dt, (1.6 - ai.skill) * 3.2 + d * 0.045);
    // Fire in bursts once the reaction delay has passed.
    if (now >= ai.reactAt && now >= ai.pauseUntil) {
      if (ai.burstLeft <= 0) { ai.burstLeft = 3 + Math.floor(Math.random() * 4); ai.burstAt = now; }
      if (now >= ai.burstAt) {
        const w = WEAPONS[bot.weapon];
        const eye = eyeOf(bot);
        const dir = new THREE.Vector3(-Math.sin(bot.yaw) * Math.cos(bot.pitch), Math.sin(bot.pitch), -Math.cos(bot.yaw) * Math.cos(bot.pitch));
        if (fireShot(bot, new THREE.Vector3(eye.x, eye.y, eye.z), dir, world)) {
          ai.burstLeft--;
          ai.burstAt = now + 60 / w.rpm;
          if (ai.burstLeft <= 0) ai.pauseUntil = now + 0.5 + Math.random() * 0.7;
        }
      }
    }
    if (bot.ammo === 0) startReload(bot, world);
  } else if (ai.state === 'capture') {
    // Stand on the Reactor and hold still; looking outward.
    bot.yaw += dt * 0.4;
  } else {
    moveAlongPath(bot, dt, speed);
    if (!bot.moving && ai.state === 'patrol') {
      bot.yaw += dt * 0.25; // scan while idle
    }
  }
  // Reload when the mag is dry or low and no enemy is near.
  if (bot.ammo <= WEAPONS[bot.weapon].mag * 0.25 && !ai.target) startReload(bot, world);
}

// Bots spend their match money at the start of each round, like the player.
export function botBuy(bot, round, world) {
  const w = WEAPONS[bot.weapon];
  if (round === 1) return;
  const roll = Math.random();
  let want = null;
  if (bot.money >= 4750 && roll < 0.12) want = 'northstar';
  else if (bot.money >= 2700 && roll < 0.65) want = 'blizzard';
  else if (bot.money >= 1700 && roll < 0.8) want = 'avalanche';
  else if (bot.money >= 1500) want = 'hailstorm';
  if (want && want !== bot.weapon) {
    bot.money -= WEAPONS[want].price;
    bot.weapon = want; bot.ammo = WEAPONS[want].mag; bot.reserve = WEAPONS[want].reserve;
  }
  if (bot.money >= 650 && bot.armor < 50) { bot.money -= 650; bot.armor = 100; }
  if (bot.money >= 200 && Math.random() < 0.4) { bot.money -= 200; bot.flash++; }
  if (bot.money >= 300 && Math.random() < 0.3) { bot.money -= 300; bot.smoke++; }
}

// A bot hears a shot: if it is close and idle, go look.
export function hearShot(bot, x, z, world) {
  if (!bot.alive || !bot.ai || bot.ai.state === 'engage') return;
  const d = Math.hypot(bot.x - x, bot.z - z);
  if (d < 22 && Math.random() < 0.6) {
    setPath(bot, nearestNode(x, z));
    bot.ai.state = 'patrol';
  }
}
