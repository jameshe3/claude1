// 几何构建器：把多个基础体（盒、柱、坡屋顶等）带上顶点色、图集坐标与世界尺度 UV 后合并为一个网格。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atlasRect, TEX } from './textures.js';
import { RNG } from './rng.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();

function ensureAttrs(geom) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  if (g !== geom) geom.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

export class GeoBuilder {
  constructor(seed = 1) {
    this.parts = [];
    this.rng = new RNG(seed);
  }

  // 通用添加：geom 会被转换到非索引形式，并写入颜色/图集属性
  add(geom, opts = {}) {
    const { color = '#ffffff', tex = TEX.white, jitter = 0.04, matrix = null, faceJitter = true, shade = null } = opts;
    let g = ensureAttrs(geom);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const atl = new Float32Array(n * 4);
    const rect = atlasRect(tex);
    let base;
    if (Array.isArray(color)) base = color;
    else { _c.set(color); base = [_c.r, _c.g, _c.b]; }
    const pos = g.attributes.position;
    // 每 6 个顶点（一个四边面）共享一个抖动，形成块面笔触感
    let jr = 1, jg = 1, jb = 1;
    for (let i = 0; i < n; i++) {
      if (i % (faceJitter ? 6 : 3) === 0) {
        const j = (this.rng.random() - 0.5) * 2 * jitter;
        const hj = (this.rng.random() - 0.5) * jitter * 0.6;
        jr = 1 + j + hj; jg = 1 + j; jb = 1 + j - hj;
      }
      let s = 1;
      if (shade) s = shade(pos.getX(i), pos.getY(i), pos.getZ(i));
      col[i * 3] = base[0] * jr * s; col[i * 3 + 1] = base[1] * jg * s; col[i * 3 + 2] = base[2] * jb * s;
      atl[i * 4] = rect[0]; atl[i * 4 + 1] = rect[1]; atl[i * 4 + 2] = rect[2]; atl[i * 4 + 3] = rect[3];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aAtlas'].includes(k)) g.deleteAttribute(k);
    this.parts.push(g);
    return g;
  }

  // 世界尺度 UV 的盒子
  box(w, h, d, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const tile = opts.tile ?? 1.5;
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
    return this.add(g, { ...opts, matrix: mat(opts) });
  }

  cyl(rt, rb, h, seg, opts = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, opts.hseg ?? 1, opts.open ?? false);
    const tile = opts.tile ?? 1.5;
    const uv = g.attributes.uv;
    const circ = Math.PI * (rt + rb);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
    return this.add(g, { ...opts, faceJitter: false, matrix: mat(opts) });
  }

  sphere(r, opts = {}) {
    const g = new THREE.IcosahedronGeometry(r, opts.detail ?? 1);
    return this.add(g, { ...opts, faceJitter: false, matrix: mat(opts) });
  }

  // 由平面多边形面片构成（每个面片顶点按外侧逆时针），UV 沿首边投影
  poly(faces, opts = {}) {
    const tile = opts.tile ?? 1.5;
    const P = [], N = [], U = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const t = new THREE.Vector3(), bt = new THREE.Vector3(), nrm = new THREE.Vector3();
    for (const f of faces) {
      a.fromArray(f[0]); b.fromArray(f[1]); c.fromArray(f[2]);
      nrm.subVectors(b, a).cross(_v.subVectors(c, a)).normalize();
      if (nrm.lengthSq() < 0.5 && f[3]) { c.fromArray(f[3]); nrm.subVectors(b, a).cross(_v.subVectors(c, a)).normalize(); }
      t.subVectors(b, a).normalize();
      bt.crossVectors(nrm, t).normalize();
      const tris = f.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
      for (const tr of tris) for (const k of tr) {
        const p = f[k];
        P.push(p[0], p[1], p[2]);
        N.push(nrm.x, nrm.y, nrm.z);
        _v.fromArray(p).sub(a);
        U.push(_v.dot(t) / tile, _v.dot(bt) / tile);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return this.add(g, { ...opts, matrix: mat(opts) });
  }

  // 双坡屋顶：屋脊沿 x 轴，宽 w（含出檐），进深 d，脊高 h，厚度 th
  gable(w, d, h, opts = {}) {
    const th = opts.th ?? 0.18;
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const faces = [
      // 前坡（朝 +z）
      [[x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0]],
      // 后坡（朝 -z）
      [[x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0]],
      // 下表面
      [[x1, -th, z1], [x0, -th, z1], [x0, h - th, 0], [x1, h - th, 0]],
      [[x0, -th, z0], [x1, -th, z0], [x1, h - th, 0], [x0, h - th, 0]],
      // 檐口厚度
      [[x0, -th, z1], [x1, -th, z1], [x1, 0, z1], [x0, 0, z1]],
      [[x1, -th, z0], [x0, -th, z0], [x0, 0, z0], [x1, 0, z0]],
      // 山墙边缘（人字形截面拆为两块四边形）
      [[x0, -th, z1], [x0, 0, z1], [x0, h, 0], [x0, h - th, 0]],
      [[x0, h - th, 0], [x0, h, 0], [x0, 0, z0], [x0, -th, z0]],
      [[x1, 0, z1], [x1, -th, z1], [x1, h - th, 0], [x1, h, 0]],
      [[x1, h, 0], [x1, h - th, 0], [x1, -th, z0], [x1, 0, z0]],
    ];
    const g = this.poly(faces, opts);
    return g;
  }

  // 四坡屋顶：w×d 檐口矩形，ridge 为屋脊长度比例（0=攒尖）
  hip(w, d, h, opts = {}) {
    const th = opts.th ?? 0.2;
    const rl = (opts.ridge ?? 0.4) * w / 2;
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const A = [x0, 0, z1], B = [x1, 0, z1], C = [x1, 0, z0], D = [x0, 0, z0];
    const R1 = [-rl, h, 0], R2 = [rl, h, 0];
    const faces = [
      [A, B, R2, R1],
      [C, D, R1, R2],
      [B, C, R2],
      [D, A, R1],
    ];
    const lo = (p) => [p[0], p[1] - th, p[2]];
    faces.push([lo(A), lo(D), lo(C), lo(B)]);
    faces.push([lo(A), lo(B), B, A], [lo(B), lo(C), C, B], [lo(C), lo(D), D, C], [lo(D), lo(A), A, D]);
    return this.poly(faces, opts);
  }

  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
export function mat(opts) {
  if (opts.matrix) return opts.matrix;
  const p = opts.pos || [0, 0, 0];
  const r = opts.rot || [0, 0, 0];
  const s = opts.scale || [1, 1, 1];
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  _p.set(p[0], p[1], p[2]);
  _s.set(s[0], s[1], s[2]);
  return _m.clone().compose(_p, _q, _s);
}

// 将局部变换叠加到父矩阵上（用于建筑整体旋转/平移）
export function withParent(parent, opts) {
  const local = mat(opts);
  return { ...opts, matrix: parent.clone().multiply(local), pos: undefined, rot: undefined, scale: undefined };
}
