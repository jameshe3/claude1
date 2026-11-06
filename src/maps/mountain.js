// 地图四：云雾山间小径 —— 悬浮山岛，层叠石砌梯田、盘山道路、峡谷木桥、山顶凉亭，云雾在地形间缓慢流动。
import * as THREE from 'three';
import { RNG, fbm, vnoise, smoothstep } from '../core/rng.js';
import { createWorld, lineField, finishMap, pathMask } from './common.js';
import { addTrees, addRocks } from '../world/vegetation.js';
import { pavilion, plankBridge, signPost, stoneMarker, stoneLantern } from '../world/props.js';

const PI = Math.PI;

export function buildMountain() {
  const C = [0, -1];
  const R = (th) => 21.2 + 1.5 * Math.sin(2 * th + 1.0) + 1.0 * Math.sin(5 * th + 2.0) + (vnoise(Math.cos(th) * 3 + 5, Math.sin(th) * 3 + 5, 12) - 0.5) * 1.6;
  const bounds = { x0: -26, x1: 26, z0: -27, z1: 25 };
  const PEAK = 12.6;
  const baseR = (r) => PEAK * Math.pow(1 - smoothstep(3.2, 20.8, r), 1.18);
  // 盘山道
  const TH0 = 2.15, TURNS = 1.33, R0 = 18.3, R1 = 2.9;
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const th = TH0 - t * TURNS * PI * 2;
    const r = R0 - (R0 - R1) * Math.pow(t, 0.92);
    pts.push([C[0] + Math.cos(th) * r, C[1] + Math.sin(th) * r, baseR(r) + 0.08]);
  }
  const bounds2 = bounds;
  const road = lineField(bounds2, pts, 5, 0.18);
  // 峡谷
  const TC = 1.05;
  const thC = TH0 - TC;
  const cdir = [Math.cos(thC), Math.sin(thC)];
  const chasm = (x, z) => {
    const dx = x - C[0], dz = z - C[1];
    const along = dx * cdir[0] + dz * cdir[1];
    const perp = Math.abs(-dx * cdir[1] + dz * cdir[0]) + (vnoise(along * 0.5, 3, 21) - 0.5) * 0.7;
    return (1 - smoothstep(1.35, 2.2, perp)) * smoothstep(8.5, 11.0, along);
  };
  const tC = TC / (TURNS * PI * 2);
  const rC = R0 - (R0 - R1) * Math.pow(tC, 0.92);
  const bridgeP = [C[0] + Math.cos(thC) * rC, C[1] + Math.sin(thC) * rC];
  const bridgeY = baseR(rC) + 0.08;

  const spec = {
    id: 'mountain', name: '云雾山间小径', seed: 404,
    bounds, shape: { type: 'blob', cx: C[0], cz: C[1], radius: R, maxR: 24 }, thickness: 12, meshStep: 0.24,
    canopyTop: 9,
    defaults: { weather: 'clear', season: 'summer' },
    camera: { az: -0.55, el: 0.54, zoom: 1, margin: 1.04, lift: 0.0 },
    maxSlope: 1.0,
    walkMargin: 0.8,
    height(x, z) {
      const dx = x - C[0], dz = z - C[1];
      const r = Math.hypot(dx, dz);
      const th = Math.atan2(dz, dx);
      let b = baseR(r) + (fbm(x * 0.08, z * 0.08, 3, 3) - 0.5) * 1.2;
      b += 0.6 * Math.sin(th * 3 + r * 0.2) * smoothstep(4, 10, r) * (1 - smoothstep(14, 20, r));
      // 梯田
      const step = 2.05;
      const v = (b + (vnoise(x * 0.35, z * 0.35, 8) - 0.5) * 0.5) / step;
      let h = (Math.floor(v) + smoothstep(0.74, 0.97, v - Math.floor(v))) * step;
      h = Math.max(h, b * 0.15);
      // 山顶平台
      h = h * smoothstep(2.6, 4.2, r) + PEAK * (1 - smoothstep(2.6, 4.2, r));
      // 边缘略垂
      const ed = R(th) - r;
      h -= (1 - smoothstep(0, 2.2, ed)) * 0.6;
      // 道路：切填成平缓坡道
      const pd = road.dist(x, z);
      const pw = 1 - smoothstep(1.05, 2.3, pd);
      if (pw > 0) h = h * (1 - pw) + road.elev(x, z) * pw;
      // 峡谷
      const ch = chasm(x, z);
      if (ch > 0) {
        const dxx = x - C[0], dzz = z - C[1];
        const along = dxx * cdir[0] + dzz * cdir[1];
        h = h * (1 - ch) + (-5.5 + along * 0.08 + (vnoise(x, z, 5) - 0.5) * 0.6) * ch;
      }
      return h;
    },
    surface(x, z) {
      const p = pathMask(road, x, z, 0.95, 0.35);
      const top = 1 - smoothstep(2.8, 3.6, Math.hypot(x - C[0], z - C[1]));
      return { path: Math.max(p, top * 0.9), cobble: 0.45 };
    },
    colors: () => ({ path: '#c79e6a', bank: '#8a8a70', soilTop: '#6b4a30', soilMid: '#c9964a', rock: '#a59d92', wall: '#ddd6c6', lip: '#5f9640' }),
    env: {
      night: 0,
      sun: { color: '#fff1da', intensity: 2.5, dir: [0.62, 0.7, -0.3] },
      hemi: { sky: '#bdd8f4', ground: '#b49a6e', intensity: 1.3 },
      bg: { top: '#8dbbe6', bottom: '#d9e8f3', glow: '#ffffff' },
      sky: { stars: 0, moon: 0, clouds: 1 },
      fog: { color: '#d2e2ef', density: 0.3 },
      bloom: { strength: 0.24, radius: 0.55, threshold: 1.25 },
      grade: { lift: [0.01, 0.015, 0.03], gain: [1.0, 1.0, 1.0], sat: 1.08, contrast: 1.04, vignette: 0.16 },
      water: { sky: 0.15, shallow: '#72bccb', deep: '#3a84a7', foam: '#f4fbff', fleckA: '#ffffff', fleckB: '#c4ecf7', glint: '#fffbe8', fleckAmt: 1.0, speed: 0.4 },
      lamps: 0, windows: 0, fireflies: 0, mist: 1, wind: 1.25, exposure: 1.0, skirtAmb: 0.3,
      smokeCol: '#ffffff', mistCol: '#fbfdff', snowColor: '#f6f9fc', rainCol: '#d4dee8', leafLight: 1.0,
    },
  };

  const w = createWorld(spec);
  w.computeHeight();
  const rng = new RNG(404);
  // 出生点
  const sp0 = road.poly[6];
  const sp1 = road.poly[12];
  spec.spawn = { x: sp0[0], z: sp0[1], yaw: Math.atan2(sp1[0] - sp0[0], sp1[1] - sp0[1]) };

  // 峡谷木桥（沿道路切线）
  {
    const n = road.poly;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n.length; i++) { const d = Math.hypot(n[i][0] - bridgeP[0], n[i][1] - bridgeP[1]); if (d < bd) { bd = d; bi = i; } }
    const a = n[Math.max(0, bi - 3)], b = n[Math.min(n.length - 1, bi + 3)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    plankBridge(w, { x: n[bi][0], z: n[bi][1], rot: -ang, len: 6.6, w: 1.5, y0: bridgeY + 0.12, y1: bridgeY + 0.12, sag: 0.25 });
    w.keepOut(n[bi][0], n[bi][1], 3.6);
    w.bridgeAt = { x: n[bi][0], z: n[bi][1] };
  }
  pavilion(w, { x: C[0] - 0.4, z: C[1] + 0.2, rot: 0.3 });
  w.addDeck(C[0] - 0.4, C[1] + 0.2, 1.55, 1.55, 0.3, () => PEAK + 0.28);
  const lamps = [stoneLantern(w, { x: C[0] + 2.4, z: C[1] - 1.6, intensity: 3 })];
  signPost(w, { x: sp0[0] + 1.6, z: sp0[1] - 0.6, rot: 0.7 });
  // 路旁石桩
  for (let i = 14; i < road.poly.length - 20; i += 34) {
    const p = road.poly[i];
    const ox = p[0] - C[0], oz = p[1] - C[1];
    const l = Math.hypot(ox, oz);
    const x = p[0] + (ox / l) * 1.45, z = p[1] + (oz / l) * 1.45;
    if (chasm(x, z) > 0.01 || !w.inside(x, z, 1)) continue;
    stoneMarker(w, { x, z, h: rng.range(0.55, 0.85) });
  }

  // 树（梯田上零星几棵）
  const trees = [{ x: C[0] - 2.7, z: C[1] + 2.5, size: 1.2, kind: 'broad' }];
  for (let i = 0; i < 400 && trees.length < 11; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(5, 19.5);
    const x = C[0] + Math.cos(a) * r, z = C[1] + Math.sin(a) * r;
    if (road.dist(x, z) < 3.0 || chasm(x, z) > 0 || !w.inside(x, z, 2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    // 只种在平台上
    const e = 0.5;
    const g = Math.hypot(w.heightAt(x + e, z) - w.heightAt(x - e, z), w.heightAt(x, z + e) - w.heightAt(x, z - e)) / (2 * e);
    if (g > 0.3 || !w.isFree(x, z, 1)) continue;
    trees.push({ x, z, size: rng.range(0.8, 1.15), kind: rng.chance(0.3) ? 'conifer' : 'broad' });
  }
  addTrees(w, trees, { variants: 3, seed: 61 });
  const bushes = [];
  for (let i = 0; i < 900 && bushes.length < 44; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(3.5, 21);
    const x = C[0] + Math.cos(a) * r, z = C[1] + Math.sin(a) * r;
    if (road.dist(x, z) < 1.7 || chasm(x, z) > 0 || !w.inside(x, z, 0.9)) continue;
    if (bushes.some((b) => Math.hypot(b.x - x, b.z - z) < 1.8)) continue;
    const e = 0.4;
    const g = Math.hypot(w.heightAt(x + e, z) - w.heightAt(x - e, z), w.heightAt(x, z + e) - w.heightAt(x, z - e)) / (2 * e);
    if (g > 0.45 || !w.isFree(x, z, 0.5)) continue;
    bushes.push({ x, z, size: rng.range(0.5, 0.85), kind: 'bush' });
  }
  addTrees(w, bushes, { variants: 3, seed: 63 });
  const rocks = [];
  for (let i = 0; i < 400 && rocks.length < 30; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(3, 21.5);
    const x = C[0] + Math.cos(a) * r, z = C[1] + Math.sin(a) * r;
    if (road.dist(x, z) < 1.5 || chasm(x, z) > 0.2 || !w.isFree(x, z, 0.4, { margin: 0.4 })) continue;
    rocks.push({ x, z, s: rng.range(0.3, 0.9), sy: rng.range(0.6, 0.9) });
  }
  addRocks(w, rocks, { seed: 15 });

  // 云雾
  const mistItems = [];
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, PI * 2), r = rng.range(5, 24);
    const x = C[0] + Math.cos(a) * r, z = C[1] + Math.sin(a) * r;
    mistItems.push({ x, y: baseR(Math.min(r, 21)) + rng.range(0.6, 2.6), z, w: rng.range(5.5, 9.5), h: rng.range(2.2, 3.6), speed: rng.range(0.22, 0.5), seed: rng.random(), a: rng.range(0.6, 1.0) });
  }
  for (let i = 0; i < 5; i++) {
    const along = rng.range(11, 21);
    mistItems.push({ x: C[0] + cdir[0] * along, y: rng.range(-3, 0.5), z: C[1] + cdir[1] * along, w: rng.range(4, 6), h: rng.range(2.5, 3.5), speed: rng.range(0.05, 0.12), seed: rng.random(), a: 0.9 });
  }
  for (let i = 0; i < 8; i++) mistItems.push({ x: rng.range(-30, 30), y: rng.range(-6, -1), z: rng.range(-26, 24), w: rng.range(8, 12), h: rng.range(3, 4.5), speed: rng.range(0.3, 0.5), seed: rng.random(), a: 0.8 });

  w.lampList = lamps;
  finishMap(w, {
    grass: { count: 4200, flowers: 1700, seed: 37, flowerDensity: (x, z) => 0.25 + Math.pow(vnoise(x * 0.2 + 9, z * 0.2, 8), 2) * 1.3 },
    mist: mistItems,
    leaves: 100,
  });
  void THREE;
  return w;
}
