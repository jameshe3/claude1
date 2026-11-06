// 植被与岩石：分层叶簇树冠（实例化 + 面向相机卡片）、灌木、草丛、花朵、苔石。
import * as THREE from 'three';
import { GeoBuilder } from '../core/geo.js';
import { TEX } from '../core/textures.js';
import { RNG, vnoise } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ---------- 树冠几何 ----------
function canopyGeometry(blobs, rng, { density = 7, sizeMul = 1, conifer = false } = {}) {
  const P = [], N = [], UV = [], CO = [], RA = [], SZ = [], COL = [];
  const center = new THREE.Vector3();
  let wsum = 0;
  for (const b of blobs) { center.addScaledVector(b.c, b.r); wsum += b.r; }
  center.multiplyScalar(1 / wsum);
  let minY = Infinity, maxY = -Infinity;
  for (const b of blobs) { minY = Math.min(minY, b.c.y - b.r); maxY = Math.max(maxY, b.c.y + b.r); }
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const tri = [0, 1, 2, 0, 2, 3];
  const v = new THREE.Vector3(), nrm = new THREE.Vector3(), n2 = new THREE.Vector3();
  for (const b of blobs) {
    const cnt = Math.max(5, Math.round(b.r * b.r * density));
    for (let i = 0; i < cnt; i++) {
      // 斐波那契球面分布 + 抖动，略偏上半球
      const t = (i + 0.5) / cnt;
      const yy = 1 - 2 * Math.pow(t, conifer ? 1.0 : 0.85);
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const ph = i * 2.39996 + rng.range(-0.3, 0.3);
      v.set(Math.cos(ph) * rr, yy, Math.sin(ph) * rr);
      const inner = rng.chance(0.18);
      const rad = b.r * (inner ? rng.range(0.2, 0.5) : rng.range(0.62, 0.86));
      const pos = b.c.clone().addScaledVector(v, rad);
      nrm.copy(v);
      n2.subVectors(pos, center).normalize();
      nrm.multiplyScalar(0.65).addScaledVector(n2, 0.35).normalize();
      const size = b.r * rng.range(0.62, 0.9) * sizeMul;
      const hgtT = (pos.y - minY) / Math.max(0.01, maxY - minY);
      const ao = (0.62 + 0.38 * (nrm.y * 0.5 + 0.5)) * (inner ? 0.8 : 1) * (0.82 + 0.18 * hgtT);
      const rand = conifer ? 0 : rng.random();
      for (const k of tri) {
        P.push(pos.x, pos.y, pos.z);
        N.push(nrm.x, nrm.y, nrm.z);
        const c = corners[k];
        UV.push(c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5);
        CO.push(c[0], c[1]);
        RA.push(rand);
        SZ.push(size);
        COL.push(ao, ao, ao);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(CO, 2));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(RA, 1));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(SZ, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(COL, 3));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 2.5;
  return g;
}

// 生成一个树种变体（树干 + 树冠）
export function treeVariant(seed, kind = 'broad', size = 1) {
  const rng = new RNG(seed);
  const gb = new GeoBuilder(seed);
  const blobs = [];
  let height, crownR;
  if (kind === 'conifer') {
    height = rng.range(6.5, 8.5) * size;
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = (1 - t * 0.78) * 1.9 * size;
      blobs.push({ c: new THREE.Vector3(rng.range(-0.15, 0.15), height * (0.28 + t * 0.66), rng.range(-0.15, 0.15)), r });
    }
    crownR = 1.9 * size;
    gb.cyl(0.16 * size, 0.3 * size, height * 0.8, 7, { pos: [0, height * 0.4, 0], color: '#6e5444', tex: TEX.bark, tile: 1.2 });
  } else if (kind === 'bush') {
    height = 1.2 * size;
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), d = i === 0 ? 0 : rng.range(0.35, 0.7) * size;
      blobs.push({ c: new THREE.Vector3(Math.cos(a) * d, rng.range(0.45, 0.7) * size, Math.sin(a) * d), r: rng.range(0.55, 0.8) * size });
    }
    crownR = 1.0 * size;
  } else {
    // 阔叶树：弯曲树干 + 分枝 + 4~8 个叶团
    height = rng.range(4.8, 6.4) * size;
    crownR = rng.range(2.0, 2.6) * size;
    const lean = new THREE.Vector3(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5)).multiplyScalar(size);
    const trunkH = height * 0.62;
    const segs = 4;
    let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < segs; i++) {
      const t1 = (i + 1) / segs;
      const next = new THREE.Vector3(lean.x * t1 * t1, trunkH * t1, lean.z * t1 * t1);
      const r0 = (0.42 - 0.24 * (i / segs)) * size, r1 = (0.42 - 0.24 * t1) * size;
      addLimb(gb, prev, next, r1, r0, '#6b5547');
      prev = next;
    }
    // 根部张开
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.range(-0.3, 0.3);
      addLimb(gb, new THREE.Vector3(Math.cos(a) * 0.55 * size, 0.02, Math.sin(a) * 0.55 * size), new THREE.Vector3(Math.cos(a) * 0.1, 0.7 * size, Math.sin(a) * 0.1), 0.12 * size, 0.2 * size, '#6b5547');
    }
    const top = prev.clone();
    const nb = rng.int(3, 4);
    const crownC = new THREE.Vector3(top.x, height * 0.78, top.z);
    blobs.push({ c: crownC.clone().add(new THREE.Vector3(0, 0.35 * size, 0)), r: crownR * 0.82 });
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = crownR * rng.range(0.55, 0.8);
      const end = new THREE.Vector3(crownC.x + Math.cos(a) * d, crownC.y + rng.range(-0.9, 0.3) * size, crownC.z + Math.sin(a) * d);
      const from = top.clone().lerp(new THREE.Vector3(0, top.y * 0.8, 0), 0.3);
      addLimb(gb, from, end.clone().lerp(from, 0.25), 0.07 * size, 0.17 * size, '#6b5547');
      blobs.push({ c: end, r: crownR * rng.range(0.5, 0.68) });
    }
    const extra = rng.int(1, 3);
    for (let i = 0; i < extra; i++) {
      const a = rng.range(0, Math.PI * 2);
      blobs.push({ c: new THREE.Vector3(crownC.x + Math.cos(a) * crownR * 0.4, crownC.y + crownR * rng.range(0.3, 0.6), crownC.z + Math.sin(a) * crownR * 0.4), r: crownR * rng.range(0.45, 0.6) });
    }
  }
  const trunk = kind === 'bush' ? null : gb.build();
  const canopy = canopyGeometry(blobs, rng, { density: kind === 'bush' ? 9 : kind === 'conifer' ? 8 : 5.2, sizeMul: kind === 'conifer' ? 0.85 : 1, conifer: kind === 'conifer' });
  return { trunk, canopy, height, crownR, kind };
}

function addLimb(gb, a, b, rTop, rBot, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  gb.cyl(rTop, rBot, len, 7, { matrix: m, color, tex: TEX.bark, tile: 1.1 });
}

// 在世界中放置一批树（按变体分组实例化）
// items: [{x,z,kind,size,rot,palette:'leaf'|'blossom'|'conifer'|'bush', tint}]
export function addTrees(world, items, { variants = 3, seed = 1, collide = true } = {}) {
  const groups = new Map();
  const vrng = new RNG(seed);
  for (const it of items) {
    const kind = it.kind || 'broad';
    const vi = it.variant ?? vrng.int(0, variants - 1);
    const key = kind + ':' + vi;
    if (!groups.has(key)) groups.set(key, { kind, vi, list: [] });
    groups.get(key).list.push(it);
  }
  const mats = world.mats;
  const all = [];
  for (const { kind, vi, list } of groups.values()) {
    const v = treeVariant(seed * 31 + vi * 7 + (kind === 'conifer' ? 1000 : kind === 'bush' ? 2000 : 0), kind, 1);
    const canopy = new THREE.InstancedMesh(v.canopy, mats.canopy, list.length);
    canopy.customDepthMaterial = mats.canopy.userData.depth;
    canopy.castShadow = true; canopy.receiveShadow = true;
    canopy.name = 'canopy:' + kind;
    let trunk = null;
    if (v.trunk) {
      trunk = new THREE.InstancedMesh(v.trunk, mats.trunk, list.length);
      trunk.castShadow = true; trunk.receiveShadow = true;
      trunk.name = 'trunk:' + kind;
    }
    list.forEach((it, i) => {
      const s = it.size ?? 1;
      const y = (it.y ?? world.heightAt(it.x, it.z)) - 0.05;
      _q.setFromAxisAngle(UP, it.rot ?? vrng.range(0, Math.PI * 2));
      _m.compose(_p.set(it.x, y, it.z), _q, _s.set(s, s * (it.squash ?? 1), s));
      canopy.setMatrixAt(i, _m);
      if (trunk) trunk.setMatrixAt(i, _m);
      canopy.setColorAt(i, _c.set('#ffffff'));
      it._index = i;
      it._mesh = canopy;
      it._var = vrng.random();
      if (collide && kind !== 'bush') world.addCircle(it.x, it.z, 0.45 * s);
      if (collide && kind === 'bush') world.addCircle(it.x, it.z, 0.7 * s);
      world.occluders.push({ x: it.x, z: it.z, r: v.crownR * s * (kind === 'bush' ? 0.9 : 1.0), k: kind === 'bush' ? 0.35 : 0.28 });
      all.push(it);
    });
    canopy.instanceMatrix.needsUpdate = true;
    world.group.add(canopy);
    if (trunk) world.group.add(trunk);
  }
  // 季节着色
  world.seasonHooks.push((pal, season) => {
    const touched = new Set();
    for (const it of all) {
      let arr;
      if (it.kind === 'conifer') arr = pal.conifer;
      else if (it.kind === 'bush') arr = pal.bush;
      else if (it.palette === 'blossom' && season === 'spring') arr = pal.blossom;
      else arr = pal.leaf;
      const base = arr[Math.floor(it._var * arr.length) % arr.length];
      _c.copy(base);
      if (it.tint) _c.multiply(it.tint);
      if (world.spec.leafMul) _c.multiply(world.spec.leafMul);
      it._mesh.setColorAt(it._index, _c);
      touched.add(it._mesh);
    }
    for (const m of touched) m.instanceColor.needsUpdate = true;
  });
  return all;
}

// ---------- 草丛 ----------
let tuftGeo = null;
function getTuftGeometry() {
  if (tuftGeo) return tuftGeo;
  const P = [], C = [];
  const rng = new RNG(77);
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const r = rng.range(0.02, 0.12);
    const h = rng.range(0.28, 0.5);
    const w = rng.range(0.045, 0.07);
    const lean = rng.range(0.08, 0.2);
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
    P.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    const d = 0.55, l = 1.08;
    C.push(d, d, d, d, d, d, l, l, l);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(P.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
  g.userData.shared = true;
  tuftGeo = g;
  return g;
}

let flowerGeo = null;
function getFlowerGeometry() {
  if (flowerGeo) return flowerGeo;
  const P = [], C = [], Nn = [];
  const push = (p, c, n) => { P.push(...p); C.push(...c); Nn.push(...n); };
  // 茎
  const sc = [0.55, 0.75, 0.45];
  push([-0.012, 0, 0], sc, [0, 0, 1]); push([0.012, 0, 0], sc, [0, 0, 1]); push([0, 0.2, 0], sc, [0, 0, 1]);
  // 五瓣花冠（朝上的星形）
  const petals = 5, R = 0.07, y = 0.2;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2, a1 = a0 + Math.PI / petals, a2 = a0 + (2 * Math.PI) / petals;
    const w = [1, 1, 1];
    push([0, y + 0.01, 0], [1.1, 1.1, 1.1], [0, 1, 0]);
    push([Math.cos(a1) * R, y, Math.sin(a1) * R], w, [0, 1, 0]);
    push([Math.cos(a0) * R * 0.45, y + 0.005, Math.sin(a0) * R * 0.45], w, [0, 1, 0]);
    push([0, y + 0.01, 0], [1.1, 1.1, 1.1], [0, 1, 0]);
    push([Math.cos(a2) * R * 0.45, y + 0.005, Math.sin(a2) * R * 0.45], w, [0, 1, 0]);
    push([Math.cos(a1) * R, y, Math.sin(a1) * R], w, [0, 1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
  g.userData.shared = true;
  flowerGeo = g;
  return g;
}

// 按密度函数散布草丛与花朵
export function scatterGrass(world, { count = 3000, flowers = 1200, density = null, seed = 5, flowerDensity = null } = {}) {
  const rng = new RNG(seed);
  const pts = [];
  let tries = 0;
  const b = world.bounds;
  while (pts.length < count && tries < count * 8) {
    tries++;
    const x = rng.range(b.x0, b.x1), z = rng.range(b.z0, b.z1);
    if (!world.inside(x, z, 0.35)) continue;
    if (world.waterDepth(x, z) > -0.06) continue;
    const s = world.spec.surface ? world.spec.surface(x, z, world) : {};
    if ((s.path || 0) > 0.3 || (s.soil || 0) > 0.5 || (s.sand || 0) > 0.5) continue;
    if (world.blocked(x, z, 0.05)) continue;
    const w = density ? density(x, z) : 0.35 + 0.65 * vnoise(x * 0.3, z * 0.3, 3);
    if (rng.random() > w) continue;
    const e = 0.3;
    const gx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const gz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    if (Math.hypot(gx, gz) / (2 * e) > 1.1) continue;
    pts.push([x, z, rng.random(), rng.range(0.7, 1.35)]);
  }
  const mats = world.mats;
  const tufts = new THREE.InstancedMesh(getTuftGeometry(), mats.grass, pts.length);
  tufts.customDepthMaterial = mats.grass.userData.depth;
  tufts.castShadow = false; tufts.receiveShadow = true;
  tufts.name = 'grass';
  pts.forEach((p, i) => {
    _q.setFromAxisAngle(UP, p[2] * 6.28);
    _m.compose(_p.set(p[0], world.heightAt(p[0], p[1]) - 0.02, p[1]), _q, _s.set(p[3], p[3] * (0.8 + p[2] * 0.5), p[3]));
    tufts.setMatrixAt(i, _m);
    tufts.setColorAt(i, _c.set('#ffffff'));
  });
  world.group.add(tufts);

  // 花朵
  const fl = [];
  tries = 0;
  while (fl.length < flowers && tries < flowers * 10) {
    tries++;
    const x = rng.range(b.x0, b.x1), z = rng.range(b.z0, b.z1);
    if (!world.inside(x, z, 0.4)) continue;
    if (world.waterDepth(x, z) > -0.08) continue;
    const s = world.spec.surface ? world.spec.surface(x, z, world) : {};
    if ((s.path || 0) > 0.2 || (s.soil || 0) > 0.3) continue;
    if (world.blocked(x, z, 0.05)) continue;
    const w = flowerDensity ? flowerDensity(x, z) : Math.pow(vnoise(x * 0.22 + 9, z * 0.22, 8), 2) * 1.6;
    if (rng.random() > w) continue;
    // 成簇
    const n = rng.int(2, 5);
    for (let k = 0; k < n && fl.length < flowers; k++) {
      const fx = x + rng.range(-0.35, 0.35), fz = z + rng.range(-0.35, 0.35);
      if (!world.inside(fx, fz, 0.4) || world.blocked(fx, fz, 0.05)) continue;
      fl.push([fx, fz, rng.random(), rng.range(0.8, 1.3), rng.random()]);
    }
  }
  const flowersMesh = new THREE.InstancedMesh(getFlowerGeometry(), mats.flower, Math.max(1, fl.length));
  flowersMesh.count = fl.length;
  flowersMesh.customDepthMaterial = mats.flower.userData.depth;
  flowersMesh.castShadow = false; flowersMesh.receiveShadow = true;
  flowersMesh.name = 'flowers';
  world.group.add(flowersMesh);

  world.seasonHooks.push((pal) => {
    const ta = pal.tuftA, tb = pal.tuftB;
    for (let i = 0; i < pts.length; i++) {
      _c.copy(ta).lerp(tb, pts[i][2]);
      if (world.spec.grassMul) _c.multiply(world.spec.grassMul);
      tufts.setColorAt(i, _c);
    }
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    const dens = pal.flowerDensity;
    for (let i = 0; i < fl.length; i++) {
      const p = fl[i];
      const on = p[4] < dens;
      const sc = on ? p[3] : 0.0001;
      _q.setFromAxisAngle(UP, p[2] * 6.28);
      _m.compose(_p.set(p[0], world.heightAt(p[0], p[1]) - 0.01, p[1]), _q, _s.set(sc, sc, sc));
      flowersMesh.setMatrixAt(i, _m);
      _c.copy(pal.flowers[Math.floor(p[2] * 97) % pal.flowers.length]);
      flowersMesh.setColorAt(i, _c);
    }
    flowersMesh.instanceMatrix.needsUpdate = true;
    if (flowersMesh.instanceColor) flowersMesh.instanceColor.needsUpdate = true;
  });
  return { tufts, flowers: flowersMesh, tuftCount: pts.length, flowerCount: fl.length };
}

// ---------- 岩石 ----------
const rockGeos = [];
function rockGeometry(i) {
  if (rockGeos[i]) return rockGeos[i];
  const rng = new RNG(300 + i * 17);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const offs = new Map();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const kk = key(x, y, z);
    if (!offs.has(kk)) offs.set(kk, 0.78 + rng.random() * 0.36);
    const f = offs.get(kk);
    pos.setXYZ(k, x * f * 1.15, Math.max(y * f * 0.72, -0.25), z * f);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const C = [];
  for (let k = 0; k < pos.count; k++) {
    const ny = nrm.getY(k);
    const moss = Math.max(0, Math.min(1, (ny - 0.45) * 2.2));
    const s = 0.85 + 0.2 * rng.random();
    const r = (0.68 * (1 - moss) + 0.52 * moss) * s;
    const gg = (0.7 * (1 - moss) + 0.68 * moss) * s;
    const b = (0.74 * (1 - moss) + 0.38 * moss) * s;
    C.push(r, gg, b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.translate(0, 0.12, 0);
  g.userData.shared = true;
  rockGeos[i] = g;
  return g;
}

// items: [{x,z,s,sy?,rot?,tint?,y?}]
export function addRocks(world, items, { collide = true, seed = 3 } = {}) {
  const rng = new RNG(seed);
  const buckets = [[], [], []];
  for (const it of items) buckets[it.v ?? rng.int(0, 2)].push(it);
  buckets.forEach((list, vi) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(rockGeometry(vi), world.mats.rock, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'rocks';
    list.forEach((it, i) => {
      const s = it.s ?? 1;
      const y = it.y ?? world.heightAt(it.x, it.z) - 0.1 * s;
      _q.setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), it.rot ?? rng.range(0, 6.28), rng.range(-0.1, 0.1)));
      _m.compose(_p.set(it.x, y, it.z), _q, _s.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1)));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(it.tint || '#ffffff'));
      if (world.spec.rockMul) _c.multiply(world.spec.rockMul), mesh.setColorAt(i, _c);
      if (collide && s > 0.35) world.addCircle(it.x, it.z, s * 0.95);
      world.occluders.push({ x: it.x, z: it.z, r: s * 1.4, k: 0.3 });
    });
    world.group.add(mesh);
  });
}
