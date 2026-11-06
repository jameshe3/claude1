// 地图一：月夜林间神社 —— 冷蓝/青绿夜色，暖黄灯笼，石径、溪流、拱桥与浅滩、鸟居、本殿、密林与萤火虫。
import { RNG, fbm, vnoise, smoothstep, clamp } from '../core/rng.js';
import { createWorld, lineField, finishMap, pathMask } from './common.js';
import { addTrees, addRocks } from '../world/vegetation.js';
import { shrine, torii, stoneLantern, postLantern, archBridge, statue } from '../world/props.js';
import { TEX } from '../core/textures.js';
import * as THREE from 'three';

export function buildShrine() {
  const S = 40;
  const bounds = { x0: -S / 2, x1: S / 2, z0: -S / 2, z1: S / 2 };
  const WL = -0.45;
  const river = lineField(bounds, [[-22, 7.2], [-15, 5.6], [-9, 4.9], [-4, 3.7], [0, 1.7], [3.5, -1.3], [7.5, -2.6], [12, -2.3], [16, -3.9], [22, -6.8]], 7);
  const path = lineField(bounds, [[6.5, 21, 0], [5.6, 15, 0], [3.2, 10, 0], [1.8, 5.6, 0], [0.9, 2.2, 0], [0.1, -1.0, 0], [-1.9, -3.3, 0], [-4.0, -4.4, 0.02], [-6.4, -6.4, 1.15], [-8.9, -8.9, 1.15]], 6);
  const trail = lineField(bounds, [[3.2, 9.6], [7, 6], [10.4, 1.6], [12.1, -2.3], [13.6, -6.6], [15.6, -10.5]], 5);
  const FORD = [12.1, -2.3];
  const PLAT = [-10.4, -10.4];

  const riverHalf = (x, z) => 1.25 + 0.3 * vnoise(x * 0.25, z * 0.25, 9);
  const spec = {
    id: 'shrine', name: '月夜林间神社', seed: 101,
    bounds, shape: { type: 'rect', w: S, d: S }, thickness: 5.5, waterLevel: WL,
    tint: { toward: '#4a8296', amt: 0.6, mul: [0.72, 0.84, 0.95] },
    speckMul: 0.45,
    rockMul: new THREE.Color('#8aa3bd'),
    grassMul: new THREE.Color('#7f92a6'),
    canopyTop: 7,
    defaults: { weather: 'clear', season: 'summer' },
    camera: { az: Math.PI / 4, el: 0.7, zoom: 1, margin: 1.08 },
    spawn: { x: 5.4, z: 16.5, yaw: Math.PI + 0.2 },
    fordDepth: 0.32,
    height(x, z) {
      let h = (fbm(x * 0.07 + 3, z * 0.07, 3, 1) - 0.5) * 0.7;
      h += 0.45 * smoothstep(13, 19.5, Math.max(Math.abs(x), Math.abs(z))) * fbm(x * 0.1, z * 0.1, 2, 4);
      // 神社高台（石砌挡墙）
      const dp = Math.hypot(x - PLAT[0], z - PLAT[1]) + (vnoise(x * 0.5, z * 0.5, 2) - 0.5) * 0.7;
      const plat = 1 - smoothstep(6.0, 6.45, dp);
      h = h * (1 - plat) + (1.15 + h * 0.15) * plat;
      // 小路：顺应路面高程
      const pd = path.dist(x, z);
      const pw = 1 - smoothstep(1.1, 2.4, pd);
      h = h * (1 - pw) + (path.elev(x, z) + h * 0.15) * pw;
      // 溪流（远岸为陡峭石岸）
      const rd = river.dist(x, z);
      const side = river.side(x, z);
      const half = riverHalf(x, z);
      const fd = Math.hypot(x - FORD[0], z - FORD[1]);
      const ford = 1 - smoothstep(2.6, 5.0, fd);
      const bankW = side < 0 ? 0.35 + ford * 2.0 : 1.6;
      if (side < 0) h += 0.28 * (1 - ford) * (1 - smoothstep(half + 0.6, half + 3.0, rd));
      const bed = -1.05 + (rd / half) * (rd / half) * 0.25 + (vnoise(x * 0.8, z * 0.8, 6) - 0.5) * 0.12;
      const bedF = bed * (1 - ford) + (-0.64 + (vnoise(x * 2, z * 2, 7) - 0.5) * 0.05) * ford;
      const t = 1 - smoothstep(half * 0.7, half + bankW * (1 - ford * 0.5) + ford * 1.2, rd);
      h = h * (1 - t) + bedF * t;
      return h;
    },
    surface(x, z) {
      const p = pathMask(path, x, z, 0.85, 0.35);
      const tr = pathMask(trail, x, z, 0.55, 0.3) * 0.85;
      const pl = 1 - smoothstep(1.6, 2.6, Math.hypot(x + 8.4, z + 8.4));
      const rd = river.dist(x, z);
      const bank = (1 - smoothstep(riverHalf(x, z) + 0.1, riverHalf(x, z) + 0.9, rd)) * 0.85;
      return { path: Math.max(p, tr, pl), cobble: Math.max(p, pl) > tr ? 1 : 0.35, bank };
    },
    flow(x, z) {
      const rd = river.dist(x, z);
      if (rd > 4) return [0, 0];
      const [tx, tz] = river.tangent(x, z);
      const f = 1 - smoothstep(2.0, 4.0, rd);
      return [tx * f, tz * f];
    },
    leafMul: new THREE.Color(1.3, 1.28, 1.22),
    colors: (pal) => ({
      grassA: pal.grassA.clone().multiplyScalar(0.6), grassB: pal.grassB.clone().multiplyScalar(0.58), grassDry: pal.grassDry.clone().multiplyScalar(0.6),
      path: '#c2a47a', bank: '#647571', soilTop: '#4a3a30', soilMid: '#a8804f', rock: '#93a0b2', wall: '#a3adb3', lip: '#3f6f6a',
    }),
    waterSide: { top: '#3f8090', bottom: '#14304a' },
    env: {
      night: 1,
      sun: { color: '#b3c9ff', intensity: 2.1, dir: [-0.55, 0.72, 0.42] },
      hemi: { sky: '#3d5d8e', ground: '#16222f', intensity: 1.0 },
      bg: { top: '#16202f', bottom: '#2b3a52', glow: '#3a5076' },
      sky: { stars: 1, moon: 1, clouds: 0 },
      fog: { color: '#1f2d44', density: 0.25 },
      bloom: { strength: 0.75, radius: 0.62, threshold: 0.72 },
      grade: { lift: [0.015, 0.03, 0.055], gain: [0.96, 1.0, 1.07], sat: 1.06, contrast: 1.06, vignette: 0.32 },
      water: { sky: 0.12, shallow: '#4a8a96', deep: '#1d4560', foam: '#cfe6ee', fleckA: '#e6f6ff', fleckB: '#86cede', glint: '#d8e6ff', fleckAmt: 0.9, speed: 0.55 },
      lamps: 1, windows: 1, fireflies: 1, mist: 0.35, wind: 0.6, exposure: 1.0, skirtAmb: 0.12,
      smokeCol: '#8a98b4', mistCol: '#6c84a8', snowColor: '#e8efff', rainCol: '#9fb3cc', leafLight: 0.6,
    },
  };

  const w = createWorld(spec);
  w.computeHeight();
  const rng = new RNG(101);
  const H = (x, z) => w.heightAt(x, z);

  // ---- 建筑与道具 ----
  shrine(w, { x: -10.6, z: -10.6, rot: Math.PI / 4, y: H(-10.6, -10.6), roof: '#b3893f', roofTex: TEX.thatch });
  torii(w, { x: -6.95, z: -6.95, rot: Math.PI / 4, s: 1.0 });
  archBridge(w, { x: 0.42, z: 1.05, rot: 1.82, len: 5.4, w: 1.7, arch: 0.55, rail: '#b8432e' });
  // 浅滩踏石
  const stones = [];
  for (let i = -3; i <= 3; i++) {
    const t = i / 3;
    const x = FORD[0] + t * 0.6 + rng.range(-0.15, 0.15), z = FORD[1] + t * 2.3;
    stones.push({ x, z, s: rng.range(0.42, 0.55), sy: 0.45, y: WL - 0.14, tint: '#c9d0cf' });
  }
  addRocks(w, stones, { collide: false, seed: 7 });

  const lamps = [];
  lamps.push(stoneLantern(w, { x: 6.2, z: 12.4 }));
  lamps.push(stoneLantern(w, { x: -0.3, z: -3.7 }));
  lamps.push(stoneLantern(w, { x: -5.5, z: -8.3, y: H(-5.5, -8.3) }));
  lamps.push(stoneLantern(w, { x: -8.3, z: -5.5, y: H(-8.3, -5.5) }));
  lamps.push(postLantern(w, { x: 2.9, z: 4.4, rot: -0.4 }));
  lamps.push(postLantern(w, { x: -13.6, z: -6.4, rot: 2.2 }));
  statue(w, { x: -8.2, z: -10.3, rot: Math.PI / 4 });
  statue(w, { x: -10.3, z: -8.2, rot: Math.PI / 4 });
  statue(w, { x: 15.2, z: -8.4, rot: 0.9, bib: '#d9573b' });
  statue(w, { x: 3.6, z: 15.2, rot: -2.4 });

  // ---- 岩石 ----
  const rocks = [];
  for (let i = 4; i < river.poly.length - 4; i += 9) {
    const p = river.poly[i];
    const [tx, tz] = river.tangent(p[0], p[1]);
    for (const sd of [-1, 1]) {
      if (rng.chance(0.35)) continue;
      const off = riverHalf(p[0], p[1]) + rng.range(0.1, 0.6);
      const x = p[0] - tz * off * sd, z = p[1] + tx * off * sd;
      if (path.dist(x, z) < 1.6 || trail.dist(x, z) < 1.2 || Math.hypot(x - FORD[0], z - FORD[1]) < 3) continue;
      rocks.push({ x, z, s: rng.range(0.35, 0.8), sy: rng.range(0.6, 1.0) });
    }
  }
  // 溪中卵石（带泡沫）
  for (const [x, z, s] of [[-12.5, 5.4, 0.55], [-6.5, 4.3, 0.45], [5.4, -2.1, 0.6], [17.5, -4.6, 0.5]]) {
    rocks.push({ x, z, s, sy: 0.8, y: WL - 0.35 });
    w.waterSpots.push({ x, z, r: s * 0.95, h: 0.15 });
  }
  // 巨石群
  for (const [x, z, s] of [[8.2, -8.6, 1.5], [9.9, -7.4, 1.0], [7.0, -10.0, 1.1], [10.4, -9.6, 0.8], [-12.5, 9.5, 1.2], [-11.2, 10.6, 0.8], [13.8, 6.5, 1.0], [-2.4, -7.6, 0.9], [-1.3, -8.4, 0.6], [16.5, 13.5, 0.9]]) {
    rocks.push({ x, z, s, sy: rng.range(0.75, 1.0) });
  }
  addRocks(w, rocks, { seed: 11 });

  // ---- 树木 ----
  const trees = [];
  const fixed = [
    [-16.5, -15.8, 1.15, 'conifer'], [-13.6, -17.6, 1.05, 'conifer'], [-17.8, -12.0, 1.0, 'conifer'], [-14.8, -13.6, 0.95, 'conifer'],
    [-17.2, -5.6, 1.3], [-11.8, -17.8, 1.25], [-6.0, -17.2, 1.4], [0.2, -17.5, 1.3], [5.8, -16.2, 1.45], [11.5, -16.8, 1.25], [17.2, -14.8, 1.4], [17.8, -9.0, 1.2],
    [17.6, 4.0, 1.2], [18.2, 10.4, 1.15], [12.6, 17.2, 1.2], [17.6, 17.2, 1.0],
    [-2.8, 16.6, 1.2], [-8.6, 18.0, 1.3], [-14.2, 15.4, 1.45], [-18.2, 11.6, 1.2], [-18.0, 0.0, 1.3], [-17.8, -2.6, 0.9, 'conifer'],
    [-7.6, 11.6, 1.25], [4.6, -9.6, 0.9, 'conifer'],
  ];
  for (const f of fixed) trees.push({ x: f[0], z: f[1], size: f[2], kind: f[3] || 'broad' });
  // 边缘补种
  for (let i = 0; i < 90 && trees.length < 31; i++) {
    const x = rng.range(-18.5, 18.5), z = rng.range(-18.5, 18.5);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge < 14.5) continue;
    if (path.dist(x, z) < 3.4 || trail.dist(x, z) < 2.8 || river.dist(x, z) < 4.2) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.6)) continue;
    if (!w.isFree(x, z, 0.8)) continue;
    trees.push({ x, z, size: rng.range(0.9, 1.3), kind: rng.chance(0.25) ? 'conifer' : 'broad' });
  }
  addTrees(w, trees, { variants: 4, seed: 17 });
  // 灌木
  const bushes = [];
  for (let i = 0; i < 260 && bushes.length < 46; i++) {
    const x = rng.range(-19, 19), z = rng.range(-19, 19);
    const nearRiver = river.dist(x, z);
    const nearPath = Math.min(path.dist(x, z), trail.dist(x, z));
    if (nearPath < 1.6 || nearRiver < riverHalf(x, z) + 0.6) continue;
    const want = (nearRiver < 4.5 ? 0.6 : 0) + (nearPath < 3.5 ? 0.35 : 0) + (Math.max(Math.abs(x), Math.abs(z)) > 14 ? 0.4 : 0);
    if (rng.random() > want) continue;
    if (bushes.some((b) => Math.hypot(b.x - x, b.z - z) < 1.6)) continue;
    if (!w.isFree(x, z, 0.6)) continue;
    bushes.push({ x, z, size: rng.range(0.7, 1.2), kind: 'bush' });
  }
  addTrees(w, bushes, { variants: 3, seed: 23 });

  w.lampList = lamps.filter(Boolean);
  const ffZones = [];
  for (let i = 0; i < river.poly.length; i += 18) ffZones.push({ x: river.poly[i][0], z: river.poly[i][1], r: 3.5 });
  ffZones.push({ x: -6, z: 10, r: 5 }, { x: 9, z: 8, r: 4 }, { x: -8, z: -8, r: 4 }, { x: 10, z: -12, r: 5 });
  const mistItems = [];
  for (let i = 0; i < 10; i++) {
    const p = river.poly[Math.floor((i / 10) * river.poly.length)];
    mistItems.push({ x: p[0], y: 0.35, z: p[1], w: rng.range(5, 8), h: rng.range(1.4, 2.2), speed: rng.range(0.12, 0.25), seed: rng.random(), a: 0.75 });
  }
  for (let i = 0; i < 6; i++) mistItems.push({ x: rng.range(-18, 18), y: rng.range(0.4, 1.2), z: rng.range(-18, 18), w: rng.range(6, 9), h: rng.range(1.5, 2.5), speed: rng.range(0.1, 0.2), seed: rng.random(), a: 0.5 });

  finishMap(w, {
    grass: { count: 3400, flowers: 1100, seed: 31 },
    fireflies: { zones: ffZones, count: 90 },
    mist: mistItems,
  });
  w.interestPoints = [{ x: -10.6, z: -10.6, label: '神社' }];
  void clamp; void THREE;
  return w;
}
