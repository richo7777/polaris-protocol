// Polaris Protocol — visual effects: tracers, impact sparks, muzzle flashes,
// falling snow and the aurora. Hot paths reuse objects; nothing allocates
// per frame except short-lived tracer meshes, which are pooled.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_PARTICLES = 400;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tracerIdx = 0;
    // Particle pool (sparks / snow puffs / blood is a dark blue puff here).
    this.pGeo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pVel = new Float32Array(MAX_PARTICLES * 3);
    this.pLife = new Float32Array(MAX_PARTICLES);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pMat = new THREE.PointsMaterial({ color: 0xffd27a, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.pIdx = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) this.pPos[i * 3 + 1] = -100;
    this.flashLight = new THREE.PointLight(0xffc36b, 0, 9, 2);
    scene.add(this.flashLight);
    this.buildSky(scene);
  }
  buildSky(scene) {
    // Aurora: three wide ribbons of vertex-coloured plane, additive, swaying.
    this.aurora = [];
    const cols = [0x2affc4, 0x37a5ff, 0x9a5cff];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(120, 14, 48, 1);
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setZ(v, Math.sin(x * 0.06 + i * 2.1) * 6);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-20 + i * 20, 38 + i * 6, -75 - i * 10);
      mesh.rotation.x = 1.05;
      scene.add(mesh);
      this.aurora.push({ mesh, phase: i * 2.1, speed: 0.05 + i * 0.02 });
    }
    // Stars.
    const n = 500, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 60, y = 30 + Math.random() * 80;
      sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = y; sp[i * 3 + 2] = Math.sin(a) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 0.7, sizeAttenuation: false, fog: false })));
    // Snowfall around the origin; wraps in a 70 m box centred on the camera.
    const sn = 1400, spos = new Float32Array(sn * 3);
    for (let i = 0; i < sn; i++) { spos[i * 3] = (Math.random() - 0.5) * 70; spos[i * 3 + 1] = Math.random() * 24; spos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    this.snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({ color: 0xeaf2ff, size: 0.12, transparent: true, opacity: 0.85 }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    this.snowVel = new Float32Array(sn);
    for (let i = 0; i < sn; i++) this.snowVel[i] = 1.2 + Math.random() * 1.8;
  }
  tracer(from, to, color = 0xffe08a) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % MAX_TRACERS;
    const m = t.mesh;
    m.material.color.setHex(color);
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    m.position.copy(mid);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.visible = true; m.material.opacity = 0.9;
    t.life = 0.07;
  }
  burst(p, count, color, speed = 4, up = 2) {
    this.pMat.color.setHex(color);
    for (let i = 0; i < count; i++) {
      const k = this.pIdx; this.pIdx = (this.pIdx + 1) % MAX_PARTICLES;
      this.pPos[k * 3] = p.x; this.pPos[k * 3 + 1] = p.y; this.pPos[k * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pVel[k * 3] = Math.cos(a) * Math.cos(e) * s;
      this.pVel[k * 3 + 1] = Math.sin(e) * s + up;
      this.pVel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.pLife[k] = 0.4 + Math.random() * 0.4;
    }
  }
  muzzle(p) {
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 26;
  }
  update(dt, camX, camZ, time) {
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9; if (t.life <= 0) t.mesh.visible = false; }
    }
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        this.pPos[i * 3] += this.pVel[i * 3] * dt;
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
        this.pVel[i * 3 + 1] -= 9 * dt;
        if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -100;
      }
    }
    this.pGeo.attributes.position.needsUpdate = true;
    if (this.flashLight.intensity > 0) this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 320);
    for (const a of this.aurora) {
      a.mesh.material.opacity = 0.07 + 0.04 * Math.sin(time * a.speed + a.phase);
      a.mesh.position.x += Math.sin(time * 0.11 + a.phase) * dt * 0.6;
    }
    // Snow falls and wraps around the camera.
    const pos = this.snowGeo.attributes.position.array;
    for (let i = 0; i < this.snowVel.length; i++) {
      pos[i * 3 + 1] -= this.snowVel[i] * dt;
      pos[i * 3] += Math.sin(time * 0.7 + i) * dt * 0.4;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 22 + Math.random() * 2;
        pos[i * 3] = camX + (Math.random() - 0.5) * 70;
        pos[i * 3 + 2] = camZ + (Math.random() - 0.5) * 70;
      }
    }
    this.snowGeo.attributes.position.needsUpdate = true;
  }
}
