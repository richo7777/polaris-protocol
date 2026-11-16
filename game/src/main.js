// Polaris Protocol — boot, fixed-step simulation, round flow, rendering.
// State lives in one place (state.js); this file wires the modules together
// and owns the loop: menu -> buy -> live -> round end -> ... -> match end.
import * as THREE from 'three';
import { createMatch, newAgent, resetAgentForRound, WEAPONS, ECON, TEAMS, ALLY_NAMES, ENEMY_NAMES, WIN_SCORE, MAX_ROUNDS, BUY_TIME, ROUND_TIME, CAPTURE_TIME, CAPTURE_RADIUS, EYE_HEIGHT, AGENT_RADIUS } from './state.js';
import { buildMap, SPAWNS, collideCircle } from './map.js';
import { FX } from './fx.js';
import { SFX } from './audio.js';
import { HUD } from './hud.js';
import { PlayerController } from './player.js';
import { updateBot, botBuy, makeBotBrain, hearShot } from './bots.js';
import { updateReload, detonateGrenade, buyWeapon, buyArmor, buyGrenade } from './weapons.js';

const params = new URLSearchParams(location.search);

export class Game {
  constructor() {
    this.time = 0;
    this.match = createMatch();
    this.sfx = new SFX();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1420);
    this.scene.fog = new THREE.Fog(0x0d1a28, 25, 95);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 320);
    this.camera.rotation.order = 'YXZ';

    // Night arctic light: cold moon + warm floodlights (the map adds points).
    this.scene.add(new THREE.HemisphereLight(0x8fb4d8, 0x1a2432, 0.55));
    const moon = new THREE.DirectionalLight(0xbfd8ff, 0.9);
    moon.position.set(-30, 45, -20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
    this.scene.add(moon);

    const mapRefs = buildMap(this.scene);
    this.core = mapRefs.core;
    this.fx = new FX(this.scene);

    // Agents: the player + 4 allies vs 5 enemies.
    this.player = newAgent('polaris', 'You', true, SPAWNS.polaris[0]);
    this.agents = [this.player];
    ALLY_NAMES.forEach((n, i) => this.agents.push(newAgent('polaris', n, false, SPAWNS.polaris[i + 1])));
    ENEMY_NAMES.forEach((n, i) => this.agents.push(newAgent('glacier', n, false, SPAWNS.glacier[i])));
    for (const a of this.agents) {
      if (!a.isPlayer) a.ai = makeBotBrain();
      a.mesh = this.buildAgentMesh(a);
      a.mesh.visible = !a.isPlayer;
      this.scene.add(a.mesh);
    }

    // World object handed to the modules that need it.
    this.world = {
      match: this.match, player: this.player, agents: this.agents,
      sfx: this.sfx, fx: this.fx,
      get time() { return game.time; },
      onHit: (head) => { this.hud.hitmark(head); this.sfx.hit(head); },
      onKill: (target) => { this.syncMesh(target); this.checkRoundEnd(); },
      onShot: (shooter) => {
        for (const b of this.agents) if (b.ai && b !== shooter) hearShot(b, shooter.x, shooter.z, this.world);
      },
      buyAction: (what) => this.buyAction(what),
    };
    const game = this;

    this.hud = new HUD(this.world);
    this.controller = new PlayerController(this.player, document.body, this.world);
    this.controller.onBuyKey = () => {
      if (this.match.phase === 'buy') this.hud.showBuy(this.hud.el.buyMenu.classList.contains('hidden'));
    };
    this.controller.onPauseKey = () => {
      if (this.match.phase === 'live') this.setPaused(!this.paused);
    };

    this.paused = false;
    this.acc = 0;
    this.lastTick = -1;
    this.grenadeMeshes = [];
    this.smokeGroups = new Map();
    this._bindUI();
    this.hud.showStart();

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    if (params.get('auto') === '1') setTimeout(() => this.startMatch(), 400);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  buildAgentMesh(a) {
    const team = TEAMS[a.team];
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c222b, roughness: 0.85 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0a0f14, emissive: team.color, emissiveIntensity: 0.7, roughness: 0.2 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.85, 10), suit);
    torso.position.y = 0.95; torso.castShadow = true; g.add(torso);
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.7, 10), dark);
    legs.position.y = 0.35; g.add(legs);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), dark);
    head.position.y = 1.55; head.castShadow = true; g.add(head);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), visor);
    vis.position.set(0, 1.56, -0.17); g.add(vis);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.14), dark);
    pack.position.set(0, 1.0, 0.26); g.add(pack);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.72), new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.4, metalness: 0.6 }));
    gun.position.set(0.22, 1.15, -0.35); g.add(gun);
    // Small team beacon so squads read at a glance.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: team.color }));
    beacon.position.y = 1.85; g.add(beacon);
    a.gunMesh = gun;
    return g;
  }

  syncMesh(a) {
    const m = a.mesh;
    if (!m) return;
    m.position.set(a.x, a.alive ? 0 : 0.3, a.z);
    m.rotation.set(a.alive ? 0 : -Math.PI / 2, a.yaw, 0);
    m.visible = !a.isPlayer; // first person never sees their own body; corpses stay
  }

  _bindUI() {
    document.getElementById('deployBtn').addEventListener('click', () => {
      this.sfx.ensure();
      this.startMatch();
      this.renderer.domElement.requestPointerLock();
    });
    document.getElementById('resumeBtn').addEventListener('click', () => {
      this.setPaused(false);
      this.renderer.domElement.requestPointerLock();
    });
    document.getElementById('againBtn').addEventListener('click', () => {
      this.hud.hideEnd();
      this.startMatch();
      this.renderer.domElement.requestPointerLock();
    });
    document.getElementById('closeBuyBtn').addEventListener('click', () => this.hud.showBuy(false));
  }

  setPaused(p) {
    this.paused = p;
    this.hud.showPause(p);
    if (p && document.pointerLockElement) document.exitPointerLock();
  }

  startMatch() {
    this.match = createMatch();
    this.world.match = this.match;
    this.match.phase = 'buy';
    for (const a of this.agents) {
      a.money = ECON.start; a.kills = 0; a.deaths = 0;
      a.weapon = 'frostbite'; a.ammo = WEAPONS.frostbite.mag; a.reserve = WEAPONS.frostbite.reserve;
      a.armor = 0; a.flash = 0; a.smoke = 0; a.primary = null;
    }
    this.hud.hideStart();
    this.hud.hideEnd();
    this.startRound();
  }

  startRound() {
    const m = this.match;
    m.phase = 'buy';
    m.timer = BUY_TIME;
    m.capture = { team: null, progress: 0 };
    m.killfeed = [];
    m.grenades = [];
    m.smokes = [];
    m.roundWinner = null; m.roundReason = '';
    m.freeze = true;
    const spawns = { polaris: [...SPAWNS.polaris], glacier: [...SPAWNS.glacier] };
    for (const a of this.agents) {
      const s = spawns[a.team].shift() || SPAWNS[a.team][0];
      resetAgentForRound(a, s, true);
      if (a.ai) botBuy(a, m.round, this.world);
      this.syncMesh(a);
    }
    this.clearGrenadeMeshes();
    this.hud.showBuy(true);
    this.hud.showBanner('ROUND ' + m.round, m.round === 1 ? 'Buy your kit — B opens the shop' : 'Buy phase — B opens the shop', 2600);
  }

  endBuyPhase() {
    this.match.phase = 'live';
    this.match.timer = ROUND_TIME;
    this.match.freeze = false;
    this.hud.showBuy(false);
  }

  endRound(winner, reason) {
    const m = this.match;
    if (m.phase !== 'live' && m.phase !== 'buy') return;
    m.phase = 'roundEnd';
    m.roundWinner = winner;
    m.roundReason = reason;
    m.timer = 4;
    m.freeze = true;
    if (winner) {
      m.score[winner]++;
      for (const a of this.agents) a.money += a.team === winner ? ECON.win : ECON.loss;
      if (winner === 'polaris') this.sfx.roundWin(); else this.sfx.roundLose();
      this.hud.showBanner(winner === 'polaris' ? 'POLARIS TAKES THE ROUND' : 'GLACIER TAKES THE ROUND', reason + `  ·  $${ECON.win} to the winners`, 3600);
    } else {
      for (const a of this.agents) a.money += ECON.loss;
      this.hud.showBanner('STALEMATE', reason, 3600);
    }
    if (this.player.weapon !== 'frostbite') this.controller.rememberPrimary();
  }

  endMatch() {
    const m = this.match;
    m.phase = 'matchEnd';
    m.matchWinner = m.score.polaris > m.score.glacier ? 'polaris' : 'glacier';
    if (document.pointerLockElement) document.exitPointerLock();
    const won = m.matchWinner === 'polaris';
    this.hud.showEnd(
      won ? 'POLARIS WINS THE MATCH' : 'GLACIER WINS THE MATCH',
      `Final score ${m.score.polaris} — ${m.score.glacier}  ·  You: ${this.player.kills} kills, ${this.player.deaths} deaths`
    );
    if (won) this.sfx.roundWin(); else this.sfx.roundLose();
  }

  checkRoundEnd() {
    const m = this.match;
    if (m.phase !== 'live') return;
    const pAlive = this.agents.some(a => a.alive && a.team === 'polaris');
    const gAlive = this.agents.some(a => a.alive && a.team === 'glacier');
    if (!pAlive) this.endRound('glacier', 'Polaris eliminated');
    else if (!gAlive) this.endRound('polaris', 'Glacier eliminated');
  }

  buyAction(what) {
    const m = this.match, p = this.player;
    if (m.phase !== 'buy') { this.sfx.deny(); return; }
    const [kind, id] = what.split(':');
    let ok = false;
    if (kind === 'weapon') { ok = buyWeapon(p, id, this.world); if (ok) this.controller.rememberPrimary(); }
    else if (kind === 'armor') ok = buyArmor(p, this.world);
    else if (kind === 'flash' || kind === 'smoke') ok = buyGrenade(p, kind, this.world);
    if (!ok) this.sfx.deny();
    this.hud.showBuy(true); // refresh the money shown
  }

  clearGrenadeMeshes() {
    for (const g of this.grenadeMeshes) this.scene.remove(g);
    this.grenadeMeshes = [];
    for (const [, grp] of this.smokeGroups) this.scene.remove(grp);
    this.smokeGroups.clear();
  }

  step(dt) {
    const m = this.match;
    this.time += dt;
    // Capture progress.
    if (m.phase === 'live') {
      const inP = [], inG = [];
      for (const a of this.agents) {
        if (!a.alive) continue;
        if (Math.hypot(a.x, a.z) < CAPTURE_RADIUS) (a.team === 'polaris' ? inP : inG).push(a);
      }
      if (inP.length && !inG.length) {
        if (m.capture.team !== 'polaris') { m.capture.team = 'polaris'; m.capture.progress = 0; }
        m.capture.progress += dt / CAPTURE_TIME;
        const sec = Math.floor(m.capture.progress * CAPTURE_TIME);
        if (sec !== this.lastTick) { this.lastTick = sec; this.sfx.captureTick(); }
      } else if (inG.length && !inP.length) {
        if (m.capture.team !== 'glacier') { m.capture.team = 'glacier'; m.capture.progress = 0; }
        m.capture.progress += dt / CAPTURE_TIME;
      } else {
        m.capture.progress = Math.max(0, m.capture.progress - dt / 6);
        if (m.capture.progress === 0) m.capture.team = null;
      }
      if (m.capture.progress >= 1) {
        this.sfx.captureDone();
        this.endRound(m.capture.team, 'Reactor captured');
      }
    }
    // Round timer.
    if (m.phase === 'buy' || m.phase === 'live' || m.phase === 'roundEnd') {
      m.timer -= dt;
      if (m.timer <= 0) {
        if (m.phase === 'buy') this.endBuyPhase();
        else if (m.phase === 'live') {
          const pAlive = this.agents.filter(a => a.alive && a.team === 'polaris');
          const gAlive = this.agents.filter(a => a.alive && a.team === 'glacier');
          const pHp = pAlive.reduce((s, a) => s + a.hp, 0), gHp = gAlive.reduce((s, a) => s + a.hp, 0);
          if (pAlive.length !== gAlive.length) this.endRound(pAlive.length > gAlive.length ? 'polaris' : 'glacier', 'Time — more agents standing');
          else if (pHp !== gHp) this.endRound(pHp > gHp ? 'polaris' : 'glacier', 'Time — more health standing');
          else if (m.capture.team) this.endRound(m.capture.team, 'Time — Reactor held');
          else this.endRound(null, 'Time — nobody held the Reactor');
        } else if (m.phase === 'roundEnd') {
          if (m.score.polaris >= WIN_SCORE || m.score.glacier >= WIN_SCORE || m.round >= MAX_ROUNDS) this.endMatch();
          else { m.round++; this.startRound(); }
        }
      }
    }
    // Agents.
    if (m.phase === 'live' && !m.freeze) {
      this.controller.update(dt);
      for (const a of this.agents) {
        if (a.ai && a.alive) updateBot(a, dt, this.world);
        updateReload(a, this.world);
        this.syncMesh(a);
      }
      // Keep bodies out of each other so a camera never ends up inside a
      // teammate (the non-player agent yields).
      for (let i = 0; i < this.agents.length; i++) {
        for (let j = i + 1; j < this.agents.length; j++) {
          const a = this.agents[i], b = this.agents[j];
          if (!a.alive || !b.alive) continue;
          const dx = b.x - a.x, dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.85 && d > 1e-4) {
            const push = (0.85 - d) / 2;
            const nx = dx / d, nz = dz / d;
            if (a.isPlayer) { b.x += nx * push * 2; b.z += nz * push * 2; }
            else if (b.isPlayer) { a.x -= nx * push * 2; a.z -= nz * push * 2; }
            else { a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push; }
          }
        }
      }
    } else {
      for (const a of this.agents) this.syncMesh(a);
    }
    // Grenades: gravity, bounce, detonate.
    for (let i = m.grenades.length - 1; i >= 0; i--) {
      const g = m.grenades[i];
      g.t -= dt;
      g.vy -= 12 * dt;
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      if (g.y < 0.15) { g.y = 0.15; g.vy *= -0.35; g.vx *= 0.6; g.vz *= 0.6; }
      const gp = { x: g.x, z: g.z };
      if (collideCircle(gp, 0.15)) { g.x = gp.x; g.z = gp.z; g.vx *= -0.4; g.vz *= -0.4; }
      if (g.t <= 0) {
        detonateGrenade(g, this.world);
        m.grenades.splice(i, 1);
        const mesh = this.grenadeMeshes[i];
        if (mesh) { this.scene.remove(mesh); this.grenadeMeshes.splice(i, 1); }
      }
    }
    // Smoke expiry.
    for (let i = m.smokes.length - 1; i >= 0; i--) {
      m.smokes[i].t -= dt;
      if (m.smokes[i].t <= 0) {
        const grp = this.smokeGroups.get(m.smokes[i]);
        if (grp) { this.scene.remove(grp); this.smokeGroups.delete(m.smokes[i]); }
        m.smokes.splice(i, 1);
      }
    }
    this.syncGrenadeMeshes();
    this.syncSmokeMeshes();
    // Reactor pulse.
    const pulse = 1.4 + Math.sin(this.time * 2.2) * 0.5;
    this.core.material.emissiveIntensity = pulse;
  }

  syncGrenadeMeshes() {
    while (this.grenadeMeshes.length < this.match.grenades.length) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.5, metalness: 0.5 }));
      this.scene.add(mesh);
      this.grenadeMeshes.push(mesh);
    }
    this.match.grenades.forEach((g, i) => this.grenadeMeshes[i].position.set(g.x, g.y, g.z));
  }

  syncSmokeMeshes() {
    for (const s of this.match.smokes) {
      if (!this.smokeGroups.has(s)) {
        const grp = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0x9aa8b8, transparent: true, opacity: 0.32, depthWrite: false });
        for (let i = 0; i < 6; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(1.5 + Math.random(), 10, 8), mat);
          b.position.set((Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 3);
          grp.add(b);
        }
        grp.position.set(s.x, s.y, s.z);
        this.scene.add(grp);
        this.smokeGroups.set(s, grp);
      }
      const grp = this.smokeGroups.get(s);
      grp.scale.setScalar(0.7 + Math.min(0.5, (14 - s.t) * 0.08));
    }
  }

  frame() {
    const dt = 1 / 60;
    const now = performance.now();
    const elapsed = this.lastT ? Math.min((now - this.lastT) / 1000, 0.1) : 0.016;
    this.lastT = now;
    if (!this.paused) {
      this.acc = Math.min(this.acc + elapsed, 0.25);
      // Fixed-step simulation, decoupled from rendering.
      let n = 0;
      while (this.acc >= dt && n < 30) { this.step(dt); this.acc -= dt; n++; }
      this.fx.update(elapsed, this.player.x, this.player.z, this.time);
    }
    // Camera.
    const p = this.player;
    if (this.match.phase === 'menu') {
      const a = this.time * 0.07;
      this.camera.position.set(Math.cos(a) * 20, 9, Math.sin(a) * 20);
      this.camera.lookAt(0, 2.5, 0);
    } else if (!p.alive && this.match.phase === 'live') {
      // Death cam: hold the death spot, slow orbit.
      this.camera.position.set(p.x, this.controller.eyeY + 0.4, p.z);
      this.camera.rotation.set(0, this.time * 0.15, 0);
    } else {
      const bob = p.moving ? Math.sin(this.time * 11) * 0.03 * Math.min(1, p.speed / 4) : 0;
      this.camera.position.set(p.x, this.controller.eyeY + bob, p.z);
      this.camera.rotation.set(p.pitch, p.yaw, 0);
      const targetFov = p.scoped ? 75 / WEAPONS[p.weapon].zoom : 75;
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov += (targetFov - this.camera.fov) * 0.2;
        this.camera.updateProjectionMatrix();
      }
    }
    this.hud.update();
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();

// Debug / screenshot hooks: drive the game without pointer lock.
window.POLARIS = {
  game,
  start: () => { game.sfx.ensure(); game.startMatch(); },
  openBuy: () => { if (game.match.phase === 'buy') game.hud.showBuy(true); },
  endRound: (team) => game.endRound(team, 'Reactor captured'),
  endMatch: () => game.endMatch(),
  teleport: (x, z, yaw) => { game.player.x = x; game.player.z = z; if (yaw !== undefined) game.player.yaw = yaw; },
  stageCombat: () => {
    // Put two enemies in the open near the Reactor, player looking at them
    // from the south-east lane so the Reactor sits off-centre.
    const foes = game.agents.filter(a => a.team === 'glacier' && a.alive).slice(0, 2);
    if (foes[0]) { foes[0].x = 4; foes[0].z = -7; foes[0].yaw = Math.PI; game.syncMesh(foes[0]); }
    if (foes[1]) { foes[1].x = -5; foes[1].z = -4; foes[1].yaw = Math.PI; game.syncMesh(foes[1]); }
    game.player.x = 10; game.player.z = 14; game.player.yaw = 0.55; game.player.pitch = 0;
  },
  state: () => ({ phase: game.match.phase, round: game.match.round, score: game.match.score, timer: game.match.timer, player: { hp: game.player.hp, x: game.player.x, z: game.player.z, alive: game.player.alive, weapon: game.player.weapon, ammo: game.player.ammo, money: game.player.money } }),
};
