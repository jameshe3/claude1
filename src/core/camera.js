// 斜俯视正交相机：拖动旋转、滚轮缩放、右键平移、平滑跟随角色、自动环绕与重置。
import * as THREE from 'three';
import { clamp, smoothstep } from './rng.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.az = 0.8; this.el = 0.66; this.zoom = 1;
    this.tAz = this.az; this.tEl = this.el; this.tZoom = 1;
    this.target = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.pan = new THREE.Vector3();
    this.tPan = new THREE.Vector3();
    this.baseH = 40;
    this.dist = 150;
    this.auto = false;
    this.preset = { az: 0.8, el: 0.66, zoom: 1 };
    this.bounds = null;
    this.dragging = false;
    this.lastInteract = 0;
    this._pointers = new Map();
    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
      this.dragging = true;
      this.lastInteract = performance.now();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (before > 0) this.tZoom = clamp(this.tZoom * (after / before), 0.75, 6);
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (p.b === 2 || p.shift) {
        const k = (this.baseH / this.zoom) / el.clientHeight;
        const right = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
        const fwd = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
        this.tPan.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k / Math.sin(this.el));
      } else {
        this.tAz -= dx * 0.0065;
        this.tEl = clamp(this.tEl + dy * 0.0045, 0.32, 1.3);
      }
      this.lastInteract = performance.now();
    });
    const up = (e) => { this._pointers.delete(e.pointerId); if (!this._pointers.size) this.dragging = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.tZoom = clamp(this.tZoom * Math.exp(-e.deltaY * 0.0013), 0.75, 6);
      this.lastInteract = performance.now();
    }, { passive: false });
  }

  // 设置地图默认构图，并根据地块包围盒计算正交视口高度
  setMap(preset, box) {
    this.preset = { ...preset };
    this.box = box;
    this.reset(true);
  }

  reset(immediate = false) {
    const p = this.preset;
    this.tAz = p.az; this.tEl = p.el; this.tZoom = p.zoom ?? 1;
    this.tPan.set(0, 0, 0);
    if (immediate) {
      this.az = this.tAz; this.el = this.tEl; this.zoom = this.tZoom; this.pan.set(0, 0, 0);
      this._fit();
      this.target.copy(this.center);
    }
  }

  _fit() {
    // 将包围盒 8 个角投影到相机平面，求出适配的视口高度与居中点
    const b = this.box;
    if (!b) return;
    const az = this.az, el = this.el;
    const fwd = new THREE.Vector3(-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const c = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    const corners = b.points || [];
    if (!corners.length) for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) corners.push(new THREE.Vector3(x, y, z));
    for (const p of corners) {
      const d = p.clone().sub(c);
      const r = d.dot(right), u = d.dot(up);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r); minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    }
    const aspect = this.dom.clientWidth / Math.max(1, this.dom.clientHeight);
    const margin = this.preset.margin ?? 1.14;
    this.baseH = Math.max(maxU - minU, (maxR - minR) / aspect) * margin;
    this.center.copy(c).addScaledVector(right, (minR + maxR) / 2).addScaledVector(up, (minU + maxU) / 2 + (this.preset.lift ?? 0) * this.baseH);
  }

  update(dt, player) {
    if (this.auto && !this.dragging) this.tAz += dt * 0.12;
    const k = 1 - Math.exp(-dt * 7);
    this.az += (this.tAz - this.az) * k;
    this.el += (this.tEl - this.el) * k;
    this.zoom += (this.tZoom - this.zoom) * k;
    this.pan.lerp(this.tPan, k);
    this._fit();
    // 缩放越近越紧跟角色
    const fw = 0.18 + 0.82 * smoothstep(1.05, 2.3, this.zoom);
    const goal = this.center.clone();
    if (player) goal.lerp(new THREE.Vector3(player.x, player.y + 0.6, player.z), fw);
    goal.add(this.pan);
    this.target.lerp(goal, 1 - Math.exp(-dt * 4.5));
    const cam = this.camera;
    const dir = new THREE.Vector3(Math.sin(this.az) * Math.cos(this.el), Math.sin(this.el), Math.cos(this.az) * Math.cos(this.el));
    cam.position.copy(this.target).addScaledVector(dir, this.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    const aspect = this.dom.clientWidth / Math.max(1, this.dom.clientHeight);
    const h = this.baseH;
    cam.left = -h * aspect / 2; cam.right = h * aspect / 2; cam.top = h / 2; cam.bottom = -h / 2;
    cam.zoom = this.zoom;
    cam.near = 1; cam.far = this.dist * 2.5;
    cam.updateProjectionMatrix();
  }

  pxPerUnit(heightPx) { return (heightPx / this.baseH) * this.zoom; }
}
