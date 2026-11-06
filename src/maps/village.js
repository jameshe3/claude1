// 地图二：晴日田园村庄 —— 草绿/米黄/天蓝，茅草农舍、蓝色小屋、门廊小屋、钟楼客栈，土路、池塘、菜圃、栅栏与炊烟。
import * as THREE from 'three';
import { RNG, fbm, vnoise, smoothstep } from '../core/rng.js';
import { createWorld, lineField, finishMap, pathMask } from './common.js';
import { addTrees, addRocks } from '../world/vegetation.js';
import { house, well, fence, postLantern, signPost, bench, frame, windowAt } from '../world/props.js';
import { TEX } from '../core/textures.js';
import { mat } from '../core/geo.js';

const PI = Math.PI;

export function buildVillage() {
  const bounds = { x0: -24, x1: 24, z0: -19, z1: 19 };
  const WL = -0.32;
  const road = lineField(bounds, [[4.6, 21], [3.4, 13.5], [0.6, 7.5], [-0.8, 2.2], [0.8, -3.8], [0.2, -10], [-1.8, -15], [-2.8, -21]], 5);
  const branches = [
    [[-0.8, 2.2], [-5.5, 0.3], [-9.6, -1.9], [-12.9, -3.9]],
    [[0.8, -3.8], [4.6, -4.8], [9.4, -6.1]],
    [[0.6, 5.4], [3.6, 4.9], [6.0, 4.5]],
    [[0.2, -11.2], [4.4, -13.2], [8.4, -14.1]],
    [[-5.5, 0.3], [-6.0, -3.4], [-5.8, -5.0]],
  ].map((pts) => lineField(bounds, pts, 4));
  const POND = { x: -9.6, z: 10.2, a: 4.7, b: 3.3, r: 0.25 };
  const GARDEN = { x0: -20.2, x1: -13.4, z0: 0.6, z1: 5.6 };
  const pads = [];
  const base = (x, z) => 0.3 + (fbm(x * 0.05 + 7, z * 0.05, 3, 2) - 0.5) * 0.8 + 0.75 * smoothstep(-6, -19, z) * (0.6 + 0.4 * fbm(x * 0.1, z * 0.1, 2, 5));
  const pondE = (x, z) => {
    const dx = x - POND.x, dz = z - POND.z;
    const c = Math.cos(POND.r), s = Math.sin(POND.r);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.hypot(lx / POND.a, lz / POND.b) + (vnoise(x * 0.6, z * 0.6, 3) - 0.5) * 0.12;
  };
  const gardenMask = (x, z) => {
    const m = Math.min(x - GARDEN.x0, GARDEN.x1 - x, z - GARDEN.z0, GARDEN.z1 - z);
    return smoothstep(-0.1, 0.35, m);
  };
  const pathAll = (x, z) => {
    let m = pathMask(road, x, z, 1.05, 0.4);
    for (const b of branches) m = Math.max(m, pathMask(b, x, z, 0.7, 0.35) * 0.95);
    return m;
  };

  const spec = {
    id: 'village', name: '晴日田园村庄', seed: 202,
    bounds, shape: { type: 'rect', w: 48, d: 38 }, thickness: 4.5, waterLevel: WL,
    canopyTop: 9,
    defaults: { weather: 'clear', season: 'spring' },
    camera: { az: 0.6, el: 0.68, zoom: 1, margin: 1.06 },
    spawn: { x: 3.6, z: 15.2, yaw: PI },
    speckMul: 1.1,
    height(x, z) {
      let h = base(x, z);
      for (const p of pads) {
        const dx = x - p.x, dz = z - p.z;
        const lx = Math.abs(dx * p.c - dz * p.s), lz = Math.abs(dx * p.s + dz * p.c);
        const m = 1 - smoothstep(0, 1.6, Math.max(lx - p.hw, lz - p.hd, 0));
        h = h * (1 - m) + p.h * m;
      }
      h -= 0.07 * pathAll(x, z);
      const e = pondE(x, z);
      const t = 1 - smoothstep(0.78, 1.08, e);
      h = h * (1 - t) + (-1.1 + e * e * 0.55) * t;
      const g = gardenMask(x, z);
      if (g > 0) h += g * (0.08 * Math.sin((z - GARDEN.z0) * PI * 2) + 0.05);
      return h;
    },
    surface(x, z) {
      const g = gardenMask(x, z);
      return { path: pathAll(x, z), cobble: 0.55, soil: g * (0.75 + 0.25 * Math.sin((z - GARDEN.z0) * PI * 2)) };
    },
    flow: () => [0.15, 0.06],
    colors: () => ({ path: '#c9a56f', bank: '#a29567', soil: '#7b5134', soilTop: '#5a3b27', soilMid: '#c6913f', rock: '#9a9c9e', wall: '#b7b0a1' }),
    waterSide: { top: '#7ec0d0', bottom: '#3b7a98' },
    env: {
      night: 0,
      sun: { color: '#fff0d2', intensity: 2.7, dir: [0.62, 0.7, -0.18] },
      hemi: { sky: '#c3e0fb', ground: '#8f9c5c', intensity: 1.15 },
      bg: { top: '#eee9dc', bottom: '#e4dfcf', glow: '#fff9ea' },
      sky: { stars: 0, moon: 0, clouds: 0 },
      fog: { color: '#ece5d3', density: 0.12 },
      bloom: { strength: 0.22, radius: 0.5, threshold: 1.25 },
      grade: { lift: [0.01, 0.01, 0.02], gain: [1.02, 1.0, 0.97], sat: 1.1, contrast: 1.05, vignette: 0.16 },
      water: { sky: 0.15, shallow: '#72bccb', deep: '#3a84a7', foam: '#f4fbff', fleckA: '#ffffff', fleckB: '#c4ecf7', glint: '#fffbe8', fleckAmt: 1.0, speed: 0.25 },
      lamps: 0, windows: 0, fireflies: 0, mist: 0, wind: 1.0, exposure: 1.0,
      smokeCol: '#f3f0ea', mistCol: '#ffffff', snowColor: '#f4f7fb', rainCol: '#d0dbe4', leafLight: 1.0,
    },
  };

  // 房屋地基平台（先于高度场登记）
  const H0 = { farm: [-13.4, -7.6, 4.4, 3.4, 0.1], shed: [-19.2, -13.2, 1.9, 1.7, 0.35], brown: [8.6, 4.6, 2.9, 2.6, -PI / 2 - 0.1], blue: [12.8, -6.6, 3.4, 2.6, -PI / 2 + 0.12], tower: [11.4, -14.4, 2.9, 2.8, -PI / 2 + 0.05] };
  for (const [x, z, hw, hd, rot] of Object.values(H0)) pads.push({ x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), h: base(x, z) + 0.02 });

  const w = createWorld(spec);
  w.computeHeight();
  const rng = new RNG(202);
  const gb = w.gb;

  house(w, { x: -13.4, z: -7.6, rot: 0.1, w: 8, d: 6, wallH: 2.3, wall: '#efe7d3', roofType: 'thatch', roof: '#cfa64e', roofH: 3.1, over: 0.75, timber: '#5b4636', baseH: 0.5, baseColor: '#9d978c', winSpacing: 2.2, trim: '#5b4636', doorColor: '#5a3f2e', glass: '#4b5a5e', ridge: 0.42 });
  house(w, { x: -19.2, z: -13.2, rot: 0.35, w: 3.2, d: 2.8, wallH: 2.0, wall: '#a8805c', wallTex: TEX.planksV, roofType: 'gable', roof: '#7d5a44', roofH: 1.1, over: 0.3, trim: '#6e5240', windowSides: ['right'], baseH: 0.25, gableTex: TEX.planksV });
  house(w, { x: 8.6, z: 4.6, rot: -PI / 2 - 0.1, w: 5.2, d: 4.6, wallH: 2.4, wall: '#ead7b2', roofType: 'gable', roof: '#6b4a3a', roofH: 2.0, over: 0.45, chimneys: [[1.4, -0.7, 0.6]], porch: { w: 2.4, d: 1.3 }, trim: '#f2e8d6', shutter: '#5d7f9c', planters: [-1.7, 1.7], doorLamp: true });
  house(w, { x: 12.8, z: -6.6, rot: -PI / 2 + 0.12, w: 6.2, d: 4.6, wallH: 2.5, wall: '#80a9ca', roofType: 'gable', roof: '#5e4639', roofH: 2.2, over: 0.5, chimneys: [[-1.9, 0.6, 0.7], [1.7, 0.6, 0.95]], dormers: [-1.3, 1.3], trim: '#f3eee4', shutter: '#f3eee4', doorColor: '#c85a43', porch: { w: 2.0, d: 1.1, post: '#f3eee4' }, chimneyColor: '#b9573f' });
  const tw = house(w, { x: 11.4, z: -14.4, rot: -PI / 2 + 0.05, w: 5.4, d: 5.2, wallH: 7.6, floors: 3, wall: '#88b3d4', roofType: 'hip', roof: '#c4553f', roofH: 2.4, over: 0.5, trim: '#f2ede2', ridge: 0.2, baseH: 0.6, winW: 0.8, winH: 1.0, winSpacing: 1.5, shutter: '#f2ede2', doorColor: '#7a4b33', chimneys: [[1.6, 1.2, 0.4]] });
  // 钟楼：石砌底层、阳台与钟面
  {
    const F = frame(11.4, tw.y0, -14.4, -PI / 2 + 0.05);
    const Lm = (p, r = [0, 0, 0]) => F.clone().multiply(mat({ pos: p, rot: r }));
    gb.box(5.48, 2.4, 5.28, { matrix: Lm([0, 0.6 + 1.2, 0]), color: '#b3ada2', tex: TEX.cobble, tile: 1.0 });
    gb.box(5.9, 0.12, 1.1, { matrix: Lm([0, 0.6 + 5.1, 3.1]), color: '#efe7da' });
    for (let i = 0; i <= 8; i++) gb.box(0.06, 0.6, 0.06, { matrix: Lm([-2.85 + i * 0.71, 0.6 + 5.45, 3.6]), color: '#efe7da' });
    gb.box(5.9, 0.07, 0.08, { matrix: Lm([0, 0.6 + 5.75, 3.6]), color: '#efe7da' });
    gb.cyl(0.62, 0.62, 0.1, 20, { matrix: Lm([0, 0.6 + 7.0, 2.66], [PI / 2, 0, 0]), color: '#f6f1e4' });
    gb.cyl(0.68, 0.68, 0.06, 20, { matrix: Lm([0, 0.6 + 7.0, 2.62], [PI / 2, 0, 0]), color: '#5b4a3c' });
    gb.box(0.06, 0.42, 0.04, { matrix: Lm([0, 0.6 + 7.15, 2.73]), color: '#2e2a28' });
    gb.box(0.32, 0.05, 0.04, { matrix: Lm([0.13, 0.6 + 7.0, 2.73]), color: '#2e2a28' });
  }
  // 农舍旁的小廊与草垛
  for (const [x, z, r] of [[-17.8, -3.2, 0.3], [-18.9, -2.0, 1.2], [-8.4, -11.6, 0.6]]) {
    gb.cyl(0.6, 0.6, 1.1, 14, { pos: [x, w.heightAt(x, z) + 0.55, z], rot: [0, r, PI / 2], color: '#d9b65a', tex: TEX.thatch, tile: 0.8 });
    w.addCircle(x, z, 0.7);
    w.occluders.push({ x, z, r: 0.9, k: 0.3 });
  }
  well(w, { x: -5.8, z: -6.4 });
  signPost(w, { x: -1.9, z: 4.0, rot: 0.6 });
  bench(w, { x: -5.6, z: 6.4, rot: PI - 0.6 });
  const lamps = [postLantern(w, { x: 2.5, z: -0.6, rot: PI }), postLantern(w, { x: -2.4, z: 9.6, rot: 0 })];
  // 菜圃
  for (let r = 0; r < 5; r++) {
    const z = GARDEN.z0 + 0.5 + r;
    for (let i = 0; i < 9; i++) {
      const x = GARDEN.x0 + 0.5 + i * 0.72 + rng.range(-0.06, 0.06);
      const y = w.heightAt(x, z) + 0.05;
      if (r % 2 === 0) {
        gb.sphere(0.22, { pos: [x, y + 0.12, z], color: r === 2 ? '#8fbf5a' : '#79ad4c', detail: 1, scale: [1, 0.75, 1] });
        gb.sphere(0.13, { pos: [x, y + 0.22, z], color: '#b6d47a', detail: 0 });
      } else {
        for (let k = 0; k < 3; k++) gb.cyl(0.0, 0.07, 0.34, 4, { pos: [x + (k - 1) * 0.08, y + 0.17, z], rot: [0.2 * (k - 1), 0, 0.25 * (k - 1)], color: '#5f9a3e' });
        if (r === 3) gb.sphere(0.07, { pos: [x, y + 0.02, z + 0.06], color: '#e8823a', detail: 0 });
      }
    }
  }
  fence(w, [GARDEN.x0 - 0.3, GARDEN.z0 - 0.4], [GARDEN.x1 + 0.4, GARDEN.z0 - 0.4]);
  fence(w, [GARDEN.x0 - 0.3, GARDEN.z1 + 0.4], [GARDEN.x1 + 0.4, GARDEN.z1 + 0.4]);
  fence(w, [GARDEN.x0 - 0.3, GARDEN.z0 - 0.4], [GARDEN.x0 - 0.3, GARDEN.z1 + 0.4]);
  fence(w, [GARDEN.x1 + 0.4, GARDEN.z0 - 0.4], [GARDEN.x1 + 0.4, 2.6]);
  fence(w, [GARDEN.x1 + 0.4, 3.8], [GARDEN.x1 + 0.4, GARDEN.z1 + 0.4]);
  // 路边栅栏
  fence(w, [5.6, 9.2], [5.0, 13.8], { color: '#d9cdb4' });
  fence(w, [-3.0, -8.0], [-3.4, -13.0], { color: '#d9cdb4' });
  w.keepOut((GARDEN.x0 + GARDEN.x1) / 2, (GARDEN.z0 + GARDEN.z1) / 2, 3.6);

  // 池塘：石头、睡莲、芦苇
  const prk = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * PI * 2 + rng.range(-0.1, 0.1);
    if (a > 4.2 && a < 5.0) continue;
    const c = Math.cos(POND.r), s = Math.sin(POND.r);
    const lx = Math.cos(a) * POND.a * 1.02, lz = Math.sin(a) * POND.b * 1.02;
    const x = POND.x + lx * c + lz * s, z = POND.z - lx * s + lz * c;
    prk.push({ x, z, s: rng.range(0.25, 0.5), sy: 0.7, tint: '#d8d4cc' });
  }
  addRocks(w, prk, { seed: 5, collide: false });
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(0.2, 0.7);
    const x = POND.x + Math.cos(a) * POND.a * r, z = POND.z + Math.sin(a) * POND.b * r;
    gb.cyl(0.32, 0.32, 0.02, 10, { pos: [x, WL + 0.02, z], rot: [0, a, 0], color: '#5f9a48' });
    if (i % 3 === 0) gb.sphere(0.08, { pos: [x + 0.1, WL + 0.08, z], color: '#f6c6d6', detail: 0 });
  }
  for (let i = 0; i < 14; i++) {
    const a = rng.range(3.6, 5.6);
    const x = POND.x + Math.cos(a) * POND.a * 0.95 + rng.range(-0.3, 0.3), z = POND.z + Math.sin(a) * POND.b * 0.95;
    for (let k = 0; k < 3; k++) gb.cyl(0.01, 0.025, rng.range(0.7, 1.1), 4, { pos: [x + k * 0.08, WL + 0.4, z], rot: [rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)], color: '#7f9a4a' });
  }

  // 树
  const trees = [];
  for (const f of [
    [-21, -16.6, 1.4], [-17.4, -17.6, 1.2], [-22, -9.6, 1.3], [-21.6, -3.2, 1.15], [-21.6, 9.8, 1.3], [-20.6, 16.2, 1.45], [-14.6, 16.8, 1.2],
    [11.2, 16.4, 1.3], [17.2, 15.6, 1.45], [21.6, 8.8, 1.2], [21.6, 1.2, 1.3], [21.2, -11.6, 1.2], [19.4, -17.4, 1.3], [-8.8, -13.6, 1.2], [-5.4, -17.0, 1.35],
    [13.4, 10.2, 1.15], [-23, -14.5, 1.0, 'conifer'], [16.2, -17.8, 1.0, 'conifer'], [5.8, -9.8, 1.05],
    [-13.9, 13.8, 1.1, 'broad', 'blossom'], [-4.6, 14.2, 1.0, 'broad', 'blossom'], [-1.0, 18.0, 0.9, 'broad', 'blossom'],
  ]) trees.push({ x: f[0], z: f[1], size: f[2], kind: f[3] || 'broad', palette: f[4] || 'leaf' });
  addTrees(w, trees, { variants: 4, seed: 41 });
  const bushes = [];
  for (let i = 0; i < 400 && bushes.length < 40; i++) {
    const x = rng.range(-23, 23), z = rng.range(-18, 18);
    if (pathAll(x, z) > 0.05 || road.dist(x, z) < 2.0) continue;
    if (pondE(x, z) < 1.25 || gardenMask(x, z) > 0 && x < -13) continue;
    if (bushes.some((b) => Math.hypot(b.x - x, b.z - z) < 1.8)) continue;
    if (!w.isFree(x, z, 0.7)) continue;
    const nearHouse = w.colliders.some((c) => c.t === 'b' && Math.hypot(c.x - x, c.z - z) < 6.5);
    const edge = Math.max(Math.abs(x) / 24, Math.abs(z) / 19) > 0.82;
    if (!nearHouse && !edge && rng.chance(0.7)) continue;
    bushes.push({ x, z, size: rng.range(0.7, 1.15), kind: 'bush' });
  }
  addTrees(w, bushes, { variants: 3, seed: 43 });
  // 零散石块
  const rocks = [];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-23, 23), z = rng.range(-18, 18);
    if (pathAll(x, z) > 0.1 || !w.isFree(x, z, 0.4)) continue;
    rocks.push({ x, z, s: rng.range(0.2, 0.45), sy: 0.7 });
  }
  addRocks(w, rocks, { seed: 9 });

  w.lampList = lamps;
  finishMap(w, {
    grass: { count: 3800, flowers: 1500, seed: 33 },
    leaves: 140,
  });
  void THREE; void windowAt;
  return w;
}
