// 地图三：日落河岸小镇 —— 蜜桃/紫粉/暖橙与蓝绿冷暖对比，台地上的沿岸房屋、河岸步道、推车摊位、
// 一串暖色路灯与灯串、栈桥与小船，前景是大面积流动河面。
import * as THREE from 'three';
import { RNG, fbm, vnoise, smoothstep } from '../core/rng.js';
import { createWorld, finishMap } from './common.js';
import { addTrees, addRocks } from '../world/vegetation.js';
import { house, lampPost, stringLights, cartStall, bench, boat } from '../world/props.js';
import { TEX } from '../core/textures.js';

const PI = Math.PI;

export function buildRiverside() {
  const bounds = { x0: -26, x1: 26, z0: -17, z1: 17 };
  const WL = -1.1;
  const RAMPS = [-13.8, 0.2, 13.2];
  const PIER = { x: 6.5, z0: 2.2, z1: 8.6 };
  const rampAt = (x, z) => {
    let m = 0;
    for (const rx of RAMPS) m = Math.max(m, 1 - smoothstep(0.85, 1.35, Math.abs(x - rx)));
    return m * (1 - smoothstep(-5.6, -5.0, z)) * smoothstep(-10.2, -9.4, z);
  };
  const spec = {
    id: 'riverside', name: '日落河岸小镇', seed: 303,
    bounds, shape: { type: 'rect', w: 52, d: 34 }, thickness: 4.2, waterLevel: WL,
    canopyTop: 8,
    defaults: { weather: 'clear', season: 'summer' },
    camera: { az: 0.2, el: 0.74, zoom: 1, margin: 1.05 },
    spawn: { x: -9.5, z: -2.6, yaw: PI / 2 },
    bankColor: true,
    height(x, z) {
      const n = (fbm(x * 0.08, z * 0.08, 3, 8) - 0.5);
      // 台地
      const terr = 1.45 + n * 0.12;
      const tw = 1 - smoothstep(-7.35, -6.85, z + (vnoise(x * 0.4, 1, 3) - 0.5) * 0.15);
      let h = n * 0.06 + 0.02;
      // 坡道
      const r = rampAt(x, z);
      const rampH = 1.45 * (1 - smoothstep(-9.6, -5.4, z));
      h = h * (1 - tw) + terr * tw;
      h = h * (1 - r) + rampH * r;
      // 河堤与河床
      const edge = 3.05 + (vnoise(x * 0.3, 7, 5) - 0.5) * 0.25;
      const t = smoothstep(edge, edge + 0.55, z);
      const bed = -2.55 - 0.35 * Math.sin(((z - 3.5) / 14) * PI) + (fbm(x * 0.12, z * 0.12, 2, 9) - 0.5) * 0.5;
      h = h * (1 - t) + bed * t;
      return h;
    },
    surface(x, z) {
      const prom = smoothstep(-7.0, -6.6, z) * (1 - smoothstep(-1.9, -1.4, z + (vnoise(x * 0.7, 2, 4) - 0.5) * 0.4));
      const r = rampAt(x, z);
      const back = (1 - smoothstep(-13.6, -12.6, z)) * smoothstep(-16.5, -15.5, z) * 0;
      return { path: Math.max(prom, r, back), cobble: 0.9 };
    },
    flow: (x, z) => (z > 2.5 ? [1, 0.08 * Math.sin(x * 0.2)] : [0, 0]),
    colors: () => ({ path: '#d9a48c', bank: '#8f8a7c', soilTop: '#57382c', soilMid: '#b87a55', rock: '#8a8094', wall: '#b7a3a0', lip: '#6f9055' }),
    waterSide: { top: '#5d8fae', bottom: '#2a4467' },
    env: {
      night: 0.5,
      sun: { color: '#ffb27c', intensity: 2.3, dir: [-0.76, 0.42, 0.5] },
      hemi: { sky: '#9a8ed0', ground: '#d69484', intensity: 1.45 },
      bg: { top: '#7470ad', bottom: '#f3ab90', glow: '#ffc38e' },
      sky: { stars: 0.15, moon: 0, clouds: 0 },
      fog: { color: '#d99ba0', density: 0.18 },
      bloom: { strength: 0.6, radius: 0.6, threshold: 0.8 },
      grade: { lift: [0.035, 0.015, 0.045], gain: [1.05, 0.97, 0.98], sat: 1.12, contrast: 1.04, vignette: 0.26 },
      water: { sky: 0.32, shallow: '#8cc0cc', deep: '#5a88b2', foam: '#ffeae2', fleckA: '#ffd9b0', fleckB: '#f7a3bb', glint: '#ffdca8', fleckAmt: 1.35, speed: 0.75 },
      lamps: 1, windows: 0.85, fireflies: 0.25, mist: 0, wind: 0.8, exposure: 1.0,
      smokeCol: '#ecc8c4', mistCol: '#f4c9c6', snowColor: '#f6eef2', rainCol: '#d6c9d4', leafLight: 0.95,
    },
  };

  const w = createWorld(spec);
  w.computeHeight();
  const rng = new RNG(303);
  const gb = w.gb;
  const T = 1.45;

  house(w, { x: -20.4, z: -11.8, y: T, w: 6.0, d: 5.0, wallH: 4.6, floors: 2, wall: '#ebb9a3', roof: '#5d6079', roofTex: TEX.slate, roofType: 'gable', roofH: 2.4, dormers: [-1.4, 1.4], chimneys: [[2.0, -0.8, 0.6]], trim: '#f6efe6', shutter: '#6c8fb3', doorColor: '#6c8fb3', planters: [-1.8, 1.8] });
  house(w, { x: -7.0, z: -12.0, y: T, w: 6.4, d: 5.0, wallH: 2.8, wall: '#80a7c8', roof: '#7a4f44', roofType: 'gable', roofH: 2.2, porch: { w: 2.6, d: 1.2, post: '#f3ece2' }, chimneys: [[-2.0, 0.6, 0.8]], trim: '#f6efe6', shutter: '#f6efe6', doorColor: '#c75a3f', dormers: [1.6], doorLamp: true });
  house(w, { x: 7.0, z: -12.2, y: T, w: 5.8, d: 5.2, wallH: 4.8, floors: 2, wall: '#f1e2c4', roof: '#4f5b70', roofTex: TEX.slate, roofType: 'hip', roofH: 2.3, ridge: 0.3, timber: '#6a4a3a', chimneys: [[1.5, 0.4, 0.8]], trim: '#6a4a3a', doorColor: '#4e6a52', planters: [1.6] });
  house(w, { x: 19.6, z: -11.8, y: T, w: 6.0, d: 4.8, wallH: 2.7, wall: '#b9cfe4', roof: '#5a4b45', roofType: 'gable', roofH: 2.0, dormers: [0], chimneys: [[-1.8, -0.5, 0.7]], trim: '#f6efe6', shutter: '#d0705a', doorColor: '#d0705a', porch: { w: 2.2, d: 1.1 } });
  // 屋后小屋
  house(w, { x: -13.8, z: -15.0, y: T, w: 3.2, d: 2.4, wallH: 2.0, wall: '#d79c86', roof: '#5d6079', roofTex: TEX.slate, roofType: 'gable', roofH: 1.2, over: 0.3, trim: '#f6efe6', windowSides: ['front'], doorSide: 'right' });

  // 台地前沿花箱
  for (const x of [-22.5, -17.8, -9.5, -4.2, 3.6, 9.6, 16.8, 22.4]) {
    const y = w.heightAt(x, -6.6);
    gb.box(1.4, 0.35, 0.5, { pos: [x, y + 0.17, -6.45], color: '#8f5f44', tex: TEX.planksH, tile: 0.6 });
    for (let k = 0; k < 6; k++) gb.sphere(0.15, { pos: [x - 0.55 + k * 0.22, y + 0.4, -6.45 + (k % 2) * 0.1], color: ['#f26d7d', '#ffd166', '#f7a8c4', '#ffffff'][k % 4], detail: 0 });
    w.addBox(x, -6.45, 0.75, 0.3, 0);
  }
  // 河堤石沿
  for (let x = -25.6; x < 25.6; x += 1.15) {
    if (Math.abs(x - PIER.x) < 1.0) continue;
    const z = 2.85 + (vnoise(x * 0.3, 7, 5) - 0.5) * 0.25;
    gb.box(1.05, 0.28, 0.5, { pos: [x + 0.55, w.heightAt(x + 0.55, z - 0.3) + 0.1, z], rot: [0, rng.range(-0.04, 0.04), 0], color: '#b9aeaa', tex: TEX.blocks, tile: 0.7 });
  }
  // 栈桥
  {
    const len = PIER.z1 - PIER.z0, cz = (PIER.z0 + PIER.z1) / 2;
    for (let i = 0; i < Math.ceil(len / 0.3); i++) {
      const z = PIER.z0 + i * 0.3 + 0.15;
      gb.box(1.5, 0.08, 0.27, { pos: [PIER.x, 0.12, z], color: i % 3 ? '#a2785a' : '#93694c', tex: TEX.planksH, tile: 0.5 });
    }
    for (let i = 0; i <= 3; i++) for (const sx of [-0.7, 0.7]) {
      const z = PIER.z0 + 1.2 + i * (len - 1.2) / 3;
      gb.cyl(0.09, 0.1, 2.9, 6, { pos: [PIER.x + sx, -1.25, z], color: '#5e4636' });
    }
    for (const sx of [-0.72, 0.72]) gb.box(0.07, 0.07, len - 1.4, { pos: [PIER.x + sx, 0.62, cz + 0.7], color: '#7a5a42' });
    w.addDeck(PIER.x, cz, len / 2, 0.68, PI / 2, () => 0.17);
    boat(w, { x: PIER.x + 1.9, z: 7.0, rot: PI / 2 - 0.12 });
  }
  // 路灯与灯串
  const lampX = [-21.6, -12.9, -4.3, 4.3, 13.0, 21.6];
  const lamps = lampX.map((x) => lampPost(w, { x, z: 1.55, h: 2.6 }));
  for (let i = 0; i < lampX.length - 1; i++) {
    const a = [lampX[i], w.heightAt(lampX[i], 1.55) + 2.45, 1.55], b = [lampX[i + 1], w.heightAt(lampX[i + 1], 1.55) + 2.45, 1.55];
    stringLights(w, a, b, { sag: 0.55, n: 11 });
  }
  const stall = cartStall(w, { x: -2.7, z: -3.7, rot: 0.08, awning: '#d65f4f' });
  lamps.push(w.addLamp({ x: stall.x, y: stall.y, z: stall.z, intensity: 3, distance: 4, glow: 1.0, light: false }));
  bench(w, { x: -17.2, z: 0.1, rot: 0 });
  bench(w, { x: 9.0, z: 0.1, rot: 0 });
  bench(w, { x: 17.6, z: -5.6, rot: PI });
  // 木桶与货箱
  for (const [x, z] of [[2.5, -5.7], [3.1, -6.1], [-24.0, -5.4], [24.0, -4.8], [-5.5, -5.5]]) {
    const y = w.heightAt(x, z);
    gb.cyl(0.3, 0.27, 0.7, 10, { pos: [x, y + 0.35, z], color: '#8d6143', tex: TEX.planksV, tile: 0.5 });
    gb.cyl(0.31, 0.31, 0.05, 10, { pos: [x, y + 0.55, z], color: '#3f3530' });
    gb.cyl(0.31, 0.31, 0.05, 10, { pos: [x, y + 0.15, z], color: '#3f3530' });
    w.addCircle(x, z, 0.35);
  }
  for (const [x, z, r] of [[-4.7, -5.9, 0.3], [-24.4, -3.8, 0.1]]) {
    const y = w.heightAt(x, z);
    gb.box(0.7, 0.55, 0.6, { pos: [x, y + 0.27, z], rot: [0, r, 0], color: '#c49a68', tex: TEX.planksH, tile: 0.4 });
    w.addBox(x, z, 0.4, 0.35, r);
  }

  // 树与灌木
  const trees = [];
  for (const f of [[-24.6, -15.4, 1.1], [-10.4, -16.0, 0.95], [1.0, -15.9, 1.0], [13.6, -15.6, 1.05], [24.6, -15.2, 1.15], [-24.8, -8.8, 0.9], [25.0, -8.6, 0.85, 'conifer'], [-24.6, -1.4, 0.95], [24.8, -1.8, 1.0]]) trees.push({ x: f[0], z: f[1], size: f[2], kind: f[3] || 'broad' });
  addTrees(w, trees, { variants: 3, seed: 51 });
  const bushes = [];
  for (let i = 0; i < 300 && bushes.length < 26; i++) {
    const x = rng.range(-25, 25);
    const zz = rng.chance(0.5) ? rng.range(-16.5, -13.5) : rng.range(-1.2, 2.2);
    if (RAMPS.some((r) => Math.abs(x - r) < 1.6)) continue;
    if (lampX.some((lx) => Math.abs(x - lx) < 0.9) && zz > 0) continue;
    if (Math.abs(x - PIER.x) < 1.5 && zz > 0) continue;
    if (bushes.some((b) => Math.hypot(b.x - x, b.z - zz) < 1.5)) continue;
    if (!w.isFree(x, zz, 0.6, { allowPath: false })) continue;
    bushes.push({ x, z: zz, size: rng.range(0.55, 0.9), kind: 'bush' });
  }
  addTrees(w, bushes, { variants: 3, seed: 53 });
  // 河中岩石
  const rocks = [];
  for (const [x, z, s] of [[-8.4, 9.6, 1.5], [-7.1, 10.7, 0.8], [-9.6, 10.4, 0.6], [13.6, 12.6, 1.0], [14.5, 13.3, 0.5], [-19.5, 14.5, 0.7]]) {
    rocks.push({ x, z, s, sy: 0.85, y: -2.0, tint: '#d8c9cc' });
    w.waterSpots.push({ x, z, r: s * 1.05, h: 0.2 });
  }
  for (let x = -25; x < 25; x += 2.2) if (rng.chance(0.45) && Math.abs(x - PIER.x) > 1.5) rocks.push({ x: x + rng.range(-0.5, 0.5), z: 3.7 + rng.range(0, 0.3), s: rng.range(0.3, 0.55), sy: 0.8, y: WL - 0.25 });
  addRocks(w, rocks, { seed: 13, collide: false });

  w.lampList = lamps;
  finishMap(w, {
    grass: { count: 2600, flowers: 1400, seed: 35, density: (x, z) => (z > -7.2 && z < -1.5 ? 0.04 : 0.6) },
    fireflies: { zones: [{ x: -14, z: 0.5, r: 6 }, { x: 4, z: 0.5, r: 6 }, { x: 18, z: 0.5, r: 6 }], count: 30 },
    leaves: 120,
  });
  void THREE;
  return w;
}
