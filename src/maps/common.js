// 地图组装流程：高度场 → 道具与植被（登记碰撞/遮蔽）→ 地形与剖面 → 水面 → 草花 → 通行网格 → 粒子。
import * as THREE from 'three';
import { MapWorld } from '../world/world.js';
import { initBuilders, finalizeBuilders } from '../world/props.js';
import { buildWater } from '../world/water.js';
import { scatterGrass } from '../world/vegetation.js';
import { fireflies, smoke, mist, fallingLeaves } from '../world/effects.js';
import { flatten } from '../world/env.js';
import { Field } from '../world/field.js';
import { sampleSpline, smoothstep, vnoise } from '../core/rng.js';

export function createWorld(spec) {
  const w = new MapWorld(spec);
  initBuilders(w);
  return w;
}

// 折线字段（河道/小路），返回距离/弧长/高程采样器
export function lineField(bounds, points, maxR = 6, step = 0.2) {
  const poly = sampleSpline(points, step);
  const f = new Field({ x0: bounds.x0 - 2, x1: bounds.x1 + 2, z0: bounds.z0 - 2, z1: bounds.z1 + 2 }, 0.2);
  f.stamp(poly, maxR);
  f.poly = poly;
  f.length = poly[poly.length - 1][3];
  return f;
}

export function finishMap(w, opts = {}) {
  w.buildTerrain();
  finalizeBuilders(w);
  buildWater(w);
  const g = scatterGrass(w, opts.grass || {});
  w.stats = { grass: g.tuftCount, flowers: g.flowerCount };
  w.buildWalk();
  if (opts.fireflies) w.fx = { ...(w.fx || {}), fireflies: fireflies(w, opts.fireflies.zones, opts.fireflies.count) };
  w.fx = { ...(w.fx || {}), smoke: smoke(w), leaves: fallingLeaves(w, opts.leaves ?? 140) };
  if (opts.mist) w.fx.mist = mist(w, opts.mist);
  w.envBase = flatten(w.spec.env);
  // 相机包围盒：地块上下界 + 树高
  const b = w.bounds;
  let ymax = -Infinity, ymin = Infinity;
  for (let i = 0; i < w.H.a.length; i++) { const v = w.H.a[i]; if (v < 40) { ymax = Math.max(ymax, v); ymin = Math.min(ymin, v); } }
  const sh = w.spec.shape;
  const pts = [];
  const top = ymax + (w.spec.canopyTop ?? 5);
  const bot = ymin - (w.spec.thickness ?? 5);
  if (sh.type === 'rect') {
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) { pts.push(new THREE.Vector3(x, top, z), new THREE.Vector3(x, bot, z)); }
  } else {
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      const r = sh.radius(th);
      const x = (sh.cx || 0) + Math.cos(th) * r, z = (sh.cz || 0) + Math.sin(th) * r;
      pts.push(new THREE.Vector3(x, top * 0.55, z), new THREE.Vector3(x, Math.min(...w.skirtLoop.map((p) => p[1])) - 1, z));
    }
    pts.push(new THREE.Vector3(sh.cx || 0, top, sh.cz || 0), new THREE.Vector3(sh.cx || 0, bot, sh.cz || 0));
  }
  w.camBox = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: bot, y1: top, points: pts };
  w.yRange = [ymin - 1, ymax + 12];
  return w;
}

// 小路表面掩码（带噪声边缘）
export function pathMask(f, x, z, half, soft = 0.4) {
  const d = f.dist(x, z) + (vnoise(x * 1.3, z * 1.3, 4) - 0.5) * 0.35;
  return 1 - smoothstep(half - soft, half + soft * 0.5, d);
}
