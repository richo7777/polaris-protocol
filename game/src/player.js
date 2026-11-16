// Polaris Protocol — the human player: WASD + mouse look, acceleration-based
// movement, crouch, scope, reload, grenades and weapon switching. Shooting
// goes through weapons.fireShot so the player and the bots share one model.
import * as THREE from 'three';
import { WEAPONS, PLAYER_SPEED, WALK_SPEED, CROUCH_SPEED, AGENT_RADIUS, EYE_HEIGHT, CROUCH_EYE } from './state.js';
import { collideCircle } from './map.js';
import { fireShot, startReload, throwGrenade } from './weapons.js';

export class PlayerController {
  constructor(agent, dom, world) {
    this.a = agent; this.dom = dom; this.world = world;
    this.keys = {};
    this.locked = false;
    this.sens = 0.0022;
    this.eyeY = EYE_HEIGHT;
    this.stepAcc = 0;
    this.onBuyKey = null; this.onPauseKey = null; this.onGrenadeKey = null;
    this._bind();
  }
  _bind() {
    const d = this.dom;
    d.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyR') startReload(this.a, this.world);
      if (e.code === 'KeyB' && this.onBuyKey) this.onBuyKey();
      if (e.code === 'KeyG') throwGrenade(this.a, this.world);
      if (e.code === 'Digit1') this.switchWeapon('primary');
      if (e.code === 'Digit2') this.switchWeapon('frostbite');
      if (e.code === 'Digit4') { this.a.grenadeSel = 'flash'; }
      if (e.code === 'Digit5') { this.a.grenadeSel = 'smoke'; }
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.onPauseKey) this.onPauseKey(); }
      if (e.code === 'Space') e.preventDefault();
    });
    d.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    d.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.keys.Mouse0 = true;
      if (e.button === 2) { this.a.scoped = WEAPONS[this.a.weapon].zoom > 1; }
    });
    d.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.keys.Mouse0 = false;
      if (e.button === 2) this.a.scoped = false;
    });
    d.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.a.yaw -= e.movementX * this.sens;
      this.a.pitch -= e.movementY * this.sens;
      this.a.pitch = Math.max(-1.45, Math.min(1.45, this.a.pitch));
    });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.a.scoped = false;
    });
  }
  switchWeapon(which) {
    const a = this.a;
    if (which === 'frostbite') {
      if (a.weapon !== 'frostbite') { a.weapon = 'frostbite'; a.ammo = a.sideAmmo ?? WEAPONS.frostbite.mag; a.reserve = a.sideReserve ?? WEAPONS.frostbite.reserve; a.reloading = false; }
      return;
    }
    if (a.primary && a.weapon !== a.primary) {
      a.sideAmmo = a.ammo; a.sideReserve = a.reserve;
      a.weapon = a.primary; a.ammo = a.primaryAmmo ?? WEAPONS[a.primary].mag; a.reserve = a.primaryReserve ?? WEAPONS[a.primary].reserve;
      a.reloading = false;
    }
  }
  rememberPrimary() {
    const a = this.a;
    if (a.weapon !== 'frostbite') {
      a.primary = a.weapon; a.primaryAmmo = a.ammo; a.primaryReserve = a.reserve;
    }
  }
  update(dt) {
    const a = this.a, w = this.world;
    if (!a.alive || w.match.phase !== 'live' || w.match.freeze) return;
    const k = this.keys;
    // Movement: acceleration toward the wish direction, friction on release.
    const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    a.crouch = !!k.ControlLeft || !!k.KeyC;
    const walking = !!k.ShiftLeft;
    const top = a.crouch ? CROUCH_SPEED : walking ? WALK_SPEED : PLAYER_SPEED;
    const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
    let wx = -sin * fwd + cos * str;
    let wz = -cos * fwd - sin * str;
    const wl = Math.hypot(wx, wz) || 1;
    wx /= wl; wz /= wl;
    const accel = 42;
    a.vx += wx * accel * dt * (fwd || str ? 1 : 0);
    a.vz += wz * accel * dt * (fwd || str ? 1 : 0);
    const fr = Math.exp(-9 * dt);
    if (!fwd && !str) { a.vx *= fr; a.vz *= fr; }
    const sp = Math.hypot(a.vx, a.vz);
    if (sp > top) { a.vx *= top / sp; a.vz *= top / sp; }
    a.x += a.vx * dt; a.z += a.vz * dt;
    collideCircle(a, AGENT_RADIUS);
    a.x = Math.max(-31, Math.min(31, a.x));
    a.z = Math.max(-31, Math.min(31, a.z));
    a.speed = Math.hypot(a.vx, a.vz);
    a.moving = a.speed > 0.4;
    // Footsteps.
    this.stepAcc += a.speed * dt;
    if (this.stepAcc > 2.4 && a.moving) { this.stepAcc = 0; w.sfx.step(); }
    // Eye height eases between stand and crouch.
    const targetEye = a.crouch ? CROUCH_EYE : EYE_HEIGHT;
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 10);
    // Recoil recovery + spread decay.
    a.recoilP = Math.max(0, a.recoilP - dt * 2.4);
    a.spread = Math.max(0, a.spread - dt * 2.2);
    a.pitch += a.recoilP * dt * 0.12; // kick climbs while firing
    a.pitch = Math.max(-1.45, Math.min(1.45, a.pitch));
    // Trigger.
    if (k.Mouse0 && a.alive) {
      const wdef = WEAPONS[a.weapon];
      if (a.ammo <= 0) {
        if (w.time - a.lastShot > 0.3) { w.sfx.dry(); a.lastShot = w.time; startReload(a, w); }
      } else {
        const dir = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
        const origin = new THREE.Vector3(a.x, this.eyeY, a.z);
        const before = a.ammo;
        if (fireShot(a, origin, dir, w)) {
          if (before !== a.ammo && !wdef.auto) this.keys.Mouse0 = false; // semi-auto needs a fresh click
        }
      }
    }
  }
}
