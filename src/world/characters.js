// 小角色：可控旅人 + 三名伙伴（橡果精、红兜帽、灯笼精灵）。简单步态、朝向平滑、沿足迹跟随。
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { materials } from '../core/materials.js';
import { getSoftTexture } from '../core/textures.js';

function part(build) {
  const gb = new GeoBuilder(11);
  build(gb);
  const g = gb.build();
  g.userData.shared = true;
  const m = new THREE.Mesh(g, materials().char);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function blobShadow() {
  const g = new THREE.CircleGeometry(0.32, 20);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0a1020, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.renderOrder = 1;
  return m;
}

function makeCharacter(kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [], arms = [];
  let height = 1.0, float = 0;
  const eyes = (gb, y, z, sp = 0.055) => {
    gb.sphere(0.025, { pos: [-sp, y, z], color: '#1d1a1a', detail: 0 });
    gb.sphere(0.025, { pos: [sp, y, z], color: '#1d1a1a', detail: 0 });
  };
  if (kind === 'traveler') {
    for (const sx of [-1, 1]) {
      const leg = part((gb) => {
        gb.cyl(0.055, 0.06, 0.28, 6, { pos: [0, -0.14, 0], color: '#4a3a32' });
        gb.box(0.1, 0.06, 0.16, { pos: [0, -0.28, 0.03], color: '#3a2c26' });
      });
      leg.position.set(sx * 0.075, 0.3, 0);
      body.add(leg); legs.push(leg);
    }
    body.add(part((gb) => {
      gb.cyl(0.13, 0.22, 0.44, 10, { pos: [0, 0.5, 0], color: '#2f6f86' });
      gb.cyl(0.15, 0.15, 0.06, 10, { pos: [0, 0.52, 0], color: '#e7d3a0' });
      gb.box(0.2, 0.22, 0.1, { pos: [0, 0.56, -0.16], color: '#8a5a3c' });
      gb.sphere(0.145, { pos: [0, 0.84, 0], color: '#f1c9a5', detail: 2 });
      gb.sphere(0.15, { pos: [0, 0.87, -0.03], color: '#3b2a24', detail: 1, scale: [1, 0.9, 1] });
      eyes(gb, 0.85, 0.135);
      gb.cyl(0.02, 0.36, 0.2, 14, { pos: [0, 1.04, 0], color: '#d9b25a' });
      gb.cyl(0.37, 0.37, 0.025, 14, { pos: [0, 0.95, 0], color: '#c9a04a' });
      gb.cyl(0.155, 0.155, 0.04, 10, { pos: [0, 0.97, 0], color: '#a8433a' });
    }));
    for (const sx of [-1, 1]) {
      const arm = part((gb) => {
        gb.cyl(0.05, 0.065, 0.3, 6, { pos: [0, -0.14, 0], color: '#2a6278' });
        gb.sphere(0.045, { pos: [0, -0.3, 0], color: '#f1c9a5', detail: 0 });
      });
      arm.position.set(sx * 0.19, 0.68, 0);
      arm.rotation.z = sx * 0.12;
      body.add(arm); arms.push(arm);
    }
  } else if (kind === 'acorn') {
    height = 0.62;
    for (const sx of [-1, 1]) {
      const leg = part((gb) => gb.cyl(0.045, 0.05, 0.16, 6, { pos: [0, -0.08, 0], color: '#5a3d2a' }));
      leg.position.set(sx * 0.08, 0.17, 0);
      body.add(leg); legs.push(leg);
    }
    body.add(part((gb) => {
      gb.sphere(0.22, { pos: [0, 0.36, 0], color: '#d9a35e', detail: 2, scale: [1, 1.08, 1] });
      gb.sphere(0.235, { pos: [0, 0.48, 0], color: '#7a4f30', detail: 2, scale: [1, 0.62, 1] });
      gb.cyl(0.02, 0.03, 0.1, 5, { pos: [0, 0.66, 0], color: '#5a3a24' });
      eyes(gb, 0.38, 0.2, 0.07);
      gb.sphere(0.03, { pos: [-0.12, 0.32, 0.17], color: '#f08a7a', detail: 0 });
      gb.sphere(0.03, { pos: [0.12, 0.32, 0.17], color: '#f08a7a', detail: 0 });
    }));
  } else if (kind === 'hood') {
    height = 0.86;
    for (const sx of [-1, 1]) {
      const leg = part((gb) => gb.cyl(0.045, 0.05, 0.24, 6, { pos: [0, -0.12, 0], color: '#3d2e2a' }));
      leg.position.set(sx * 0.065, 0.25, 0);
      body.add(leg); legs.push(leg);
    }
    body.add(part((gb) => {
      gb.cyl(0.1, 0.22, 0.4, 10, { pos: [0, 0.42, 0], color: '#c84e3a' });
      gb.cyl(0.18, 0.23, 0.08, 10, { pos: [0, 0.25, 0], color: '#f0e2c2' });
      gb.sphere(0.13, { pos: [0, 0.73, 0], color: '#f3cfae', detail: 2 });
      gb.sphere(0.155, { pos: [0, 0.76, -0.03], color: '#b83f30', detail: 1, scale: [1, 1.05, 1] });
      gb.cyl(0.01, 0.07, 0.14, 6, { pos: [0, 0.94, -0.06], rot: [-0.5, 0, 0], color: '#b83f30' });
      eyes(gb, 0.74, 0.12, 0.048);
      gb.box(0.18, 0.12, 0.12, { pos: [0.18, 0.4, 0.06], color: '#c9a064' });
    }));
    for (const sx of [-1, 1]) {
      const arm = part((gb) => gb.cyl(0.04, 0.05, 0.24, 6, { pos: [0, -0.11, 0], color: '#b84634' }));
      arm.position.set(sx * 0.15, 0.58, 0);
      body.add(arm); arms.push(arm);
    }
  } else if (kind === 'spirit') {
    height = 0.6; float = 0.45;
    body.add(part((gb) => {
      gb.cyl(0.03, 0.03, 0.08, 6, { pos: [0, 0.33, 0], color: '#3a302c' });
    }));
    const lantern = new GeoBuilder(5);
    lantern.cyl(0.2, 0.2, 0.36, 12, { pos: [0, 0.12, 0], color: [1.9, 1.5, 0.95] });
    lantern.sphere(0.2, { pos: [0, 0.18, 0], color: [1.9, 1.5, 0.95], detail: 1, scale: [1, 0.55, 1] });
    lantern.sphere(0.2, { pos: [0, 0.06, 0], color: [1.9, 1.5, 0.95], detail: 1, scale: [1, 0.55, 1] });
    const lg = lantern.build(); lg.userData.shared = true;
    const lm = new THREE.Mesh(lg, materials().bulb);
    body.add(lm);
    body.add(part((gb) => {
      gb.cyl(0.14, 0.14, 0.04, 12, { pos: [0, 0.31, 0], color: '#3a302c' });
      gb.cyl(0.12, 0.12, 0.04, 12, { pos: [0, -0.07, 0], color: '#3a302c' });
      eyes(gb, 0.15, 0.2, 0.06);
      gb.box(0.06, 0.02, 0.01, { pos: [0, 0.08, 0.2], color: '#5a2a2a' });
    }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSoftTexture(), color: '#ffd38a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    glow.material.userData.shared = true;
    glow.scale.setScalar(1.3);
    glow.position.y = 0.12;
    body.add(glow);
    root.userData.glow = glow;
  }
  const sh = blobShadow();
  sh.material.userData.shared = true;
  sh.geometry.userData.shared = true;
  root.add(sh);
  return { root, body, legs, arms, height, float, shadow: sh, kind, phase: 0, yaw: 0, x: 0, y: 0, z: 0, speed: 0, idle: 0 };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Party {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'party';
    scene.add(this.group);
    this.player = makeCharacter('traveler');
    this.companions = [makeCharacter('acorn'), makeCharacter('hood'), makeCharacter('spirit')];
    for (const c of [this.player, ...this.companions]) this.group.add(c.root);
    this.trail = [];
    this.vel = new THREE.Vector2();
    this.rippleTimer = 0;
    this.light = new THREE.PointLight('#ffd7a0', 0, 4.5, 1.5);
    this.group.add(this.light);
    this.spiritLight = new THREE.PointLight('#ffc878', 0, 3.5, 1.6);
    this.group.add(this.spiritLight);
    this.moving = false;
  }

  spawn(world, sx, sz, yaw = 0) {
    this.world = world;
    const p = this.player;
    [sx, sz] = world.nearestWalkable(sx, sz);
    p.x = sx; p.z = sz; p.y = world.groundAt(sx, sz); p.yaw = yaw; p.speed = 0;
    this.vel.set(0, 0);
    // 预先沿出生朝向的反方向铺一段足迹，让伙伴排在身后
    this.trail = [];
    const bx = -Math.sin(yaw), bz = -Math.cos(yaw);
    let lx = sx, lz = sz;
    this.trail.push([sx, sz]);
    for (let i = 1; i < 40; i++) {
      const nx = sx + bx * i * 0.12, nz = sz + bz * i * 0.12;
      if (world.canWalk(nx, nz)) { lx = nx; lz = nz; }
      this.trail.push([lx, lz]);
    }
    this.companions.forEach((c, i) => {
      const t = this.trailPoint((i + 1) * 0.8);
      c.x = t[0]; c.z = t[1]; c.y = world.groundAt(c.x, c.z); c.yaw = yaw; c.speed = 0;
    });
    this.sync(0);
  }

  trailPoint(dist) {
    let acc = 0;
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + d >= dist) { const t = (dist - acc) / (d || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
      acc += d;
    }
    return this.trail[this.trail.length - 1];
  }

  tryMove(c, nx, nz) {
    const w = this.world;
    if (!w.canWalk(nx, nz)) return false;
    const gy = w.groundAt(nx, nz);
    if (Math.abs(gy - c.y) > 0.55) return false;
    return true;
  }

  update(dt, input, camAz, envTime, onRipple) {
    const w = this.world;
    if (!w) return;
    const p = this.player;
    // 输入相对相机方向
    const fx = -Math.sin(camAz), fz = -Math.cos(camAz);
    const rx = Math.cos(camAz), rz = -Math.sin(camAz);
    let dx = rx * input.x + fx * input.y, dz = rz * input.x + fz * input.y;
    const dl = Math.hypot(dx, dz);
    const maxSp = input.run ? 4.6 : 2.9;
    if (dl > 0.01) { dx /= dl; dz /= dl; }
    const k = 1 - Math.exp(-dt * (dl > 0.01 ? 9 : 12));
    this.vel.x += (dx * maxSp * Math.min(dl, 1) - this.vel.x) * k;
    this.vel.y += (dz * maxSp * Math.min(dl, 1) - this.vel.y) * k;
    let mx = this.vel.x * dt, mz = this.vel.y * dt;
    const ox = p.x, oz = p.z;
    if (Math.hypot(mx, mz) > 1e-5) {
      if (this.tryMove(p, p.x + mx, p.z + mz)) { p.x += mx; p.z += mz; }
      else if (Math.abs(mx) > 1e-5 && this.tryMove(p, p.x + mx, p.z)) { p.x += mx; this.vel.y *= 0.5; }
      else if (Math.abs(mz) > 1e-5 && this.tryMove(p, p.x, p.z + mz)) { p.z += mz; this.vel.x *= 0.5; }
      else { this.vel.multiplyScalar(0.2); }
    }
    const moved = Math.hypot(p.x - ox, p.z - oz);
    p.speed = moved / Math.max(dt, 1e-4);
    if (p.speed > 0.15) p.yaw = lerpAngle(p.yaw, Math.atan2(this.vel.x, this.vel.y), 1 - Math.exp(-dt * 12));
    p.phase += moved * 4.2;
    p.y += (w.groundAt(p.x, p.z) - p.y) * (1 - Math.exp(-dt * 18));
    this.moving = p.speed > 0.15;

    // 足迹
    const last = this.trail[0];
    if (Math.hypot(p.x - last[0], p.z - last[1]) > 0.1) {
      this.trail.unshift([p.x, p.z]);
      if (this.trail.length > 260) this.trail.pop();
    }
    // 伙伴
    this.companions.forEach((c, i) => {
      const t = this.trailPoint((i + 1) * 0.85);
      const ddx = t[0] - c.x, ddz = t[1] - c.z;
      const d = Math.hypot(ddx, ddz);
      let sp = 0;
      if (d > 0.04) {
        sp = Math.min(5.5, d * 4.0 + 0.5);
        const step = Math.min(d, sp * dt);
        c.x += (ddx / d) * step; c.z += (ddz / d) * step;
        sp = step / Math.max(dt, 1e-4);
        if (sp > 0.2) c.yaw = lerpAngle(c.yaw, Math.atan2(ddx, ddz), 1 - Math.exp(-dt * 9));
        c.phase += step * (c.kind === 'acorn' ? 6.5 : 4.8);
      }
      c.speed = sp;
      if (sp < 0.1) {
        c.idle += dt;
        if (c.idle > 0.8) c.yaw = lerpAngle(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 1 - Math.exp(-dt * 2.5));
      } else c.idle = 0;
      c.y += (w.groundAt(c.x, c.z) - c.y) * (1 - Math.exp(-dt * 16));
    });

    // 涉水涟漪
    this.rippleTimer -= dt;
    if (this.rippleTimer <= 0) {
      for (const c of [p, ...this.companions]) {
        if (c.kind === 'spirit') continue;
        const depth = w.waterLevel - w.heightAt(c.x, c.z);
        const onDeck = !!w.deckAt(c.x, c.z);
        if (!onDeck && depth > -0.06 && c.speed > 0.2) onRipple(c.x, c.z, 0.9);
      }
      this.rippleTimer = 0.32;
    }
    this.sync(envTime);
  }

  sync(t) {
    for (const c of [this.player, ...this.companions]) {
      const walk = Math.min(1, c.speed / 2.5);
      const s = Math.sin(c.phase);
      c.root.position.set(c.x, c.y, c.z);
      c.root.rotation.y = c.yaw;
      c.legs.forEach((l, i) => { l.rotation.x = (i ? -s : s) * 0.75 * walk; });
      c.arms.forEach((a, i) => { a.rotation.x = (i ? s : -s) * 0.6 * walk; });
      const bob = Math.abs(Math.cos(c.phase)) * 0.045 * walk;
      if (c.float) {
        c.body.position.y = c.float + Math.sin(t * 2.2) * 0.07;
        c.body.rotation.z = Math.sin(t * 1.7) * 0.08;
        c.body.rotation.x = -walk * 0.25;
      } else {
        c.body.position.y = bob;
        c.body.rotation.x = walk * 0.1;
      }
      c.shadow.position.y = 0.03;
      c.shadow.scale.setScalar(c.kind === 'acorn' ? 0.8 : c.kind === 'spirit' ? 0.6 : 1);
    }
    const p = this.player;
    this.light.position.set(p.x, p.y + 1.4, p.z);
    const sp = this.companions[2];
    this.spiritLight.position.set(sp.x, sp.y + sp.float + 0.2, sp.z);
  }

  setNight(level) {
    this.light.intensity = 2.2 * level;
    this.spiritLight.intensity = 2.5 * level;
    const glow = this.companions[2].root.userData.glow;
    if (glow) glow.material.opacity = 0.25 + 0.5 * level;
  }

  get position() { return this.player; }
}
