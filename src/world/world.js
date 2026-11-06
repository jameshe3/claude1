// 地图世界：高度场、地形网格与岩土剖面、可通行网格、碰撞体、灯光与资源管理。
import * as THREE from 'three';
import { RNG, fbm, vnoise, smoothstep, clamp, lerp } from '../core/rng.js';
import { Grid } from './field.js';
import { materials, G } from '../core/materials.js';
import { getSoftTexture } from '../core/textures.js';
import { seasonPalette } from './palette.js';

const _c = new THREE.Color();

export class MapWorld {
  constructor(spec) {
    this.spec = spec;
    this.id = spec.id;
    this.group = new THREE.Group();
    this.group.name = 'map:' + spec.id;
    this.rng = new RNG(spec.seed);
    this.bounds = spec.bounds;
    this.waterLevel = spec.waterLevel ?? -100;
    this.colliders = [];
    this.decks = [];
    this.lamps = [];
    this.smokes = [];
    this.occluders = [];
    this.keep = [];
    this.updaters = [];
    this.seasonHooks = [];
    this.waterSpots = [];
    this.fireflyZones = [];
    this.mistZones = [];
    this.season = null;
    this.mats = materials();
  }

  // ---------- 形状 ----------
  edgeDist(x, z) {
    const sh = this.spec.shape;
    if (sh.type === 'rect') return Math.min(sh.w / 2 - Math.abs(x - (sh.cx || 0)), sh.d / 2 - Math.abs(z - (sh.cz || 0)));
    const dx = x - (sh.cx || 0), dz = z - (sh.cz || 0);
    const th = Math.atan2(dz, dx);
    return sh.radius(th) - Math.hypot(dx, dz);
  }
  inside(x, z, m = 0) { return this.edgeDist(x, z) > m; }

  // ---------- 高度 ----------
  computeHeight() {
    const b = this.bounds;
    const eb = { x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1 };
    this.H = new Grid(eb, 0.2);
    this.H.fill((x, z) => this.spec.height(x, z, this));
  }
  heightAt(x, z) { return this.H.get(x, z); }
  deckAt(x, z) {
    for (const d of this.decks) if (d.contains(x, z)) return d;
    return null;
  }
  groundAt(x, z) {
    const d = this.deckAt(x, z);
    if (d) return d.height(x, z);
    return this.heightAt(x, z);
  }
  waterDepth(x, z) { return this.waterLevel - this.heightAt(x, z); }

  // ---------- 碰撞与占位 ----------
  addCircle(x, z, r) { this.colliders.push({ t: 'c', x, z, r }); }
  addBox(x, z, hw, hd, rot = 0) { this.colliders.push({ t: 'b', x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot) }); }
  keepOut(x, z, r) { this.keep.push({ x, z, r }); }
  addDeck(x, z, hw, hd, rot, heightFn) {
    const c = Math.cos(rot), s = Math.sin(rot);
    this.decks.push({
      contains: (px, pz) => {
        const dx = px - x, dz = pz - z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        return Math.abs(lx) <= hw && Math.abs(lz) <= hd;
      },
      height: (px, pz) => {
        const dx = px - x, dz = pz - z;
        return heightFn(dx * c - dz * s, dx * s + dz * c);
      },
    });
  }
  blocked(x, z, pad = 0) {
    for (const o of this.colliders) {
      if (o.t === 'c') { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < (o.r + pad) * (o.r + pad)) return true; }
      else {
        const dx = x - o.x, dz = z - o.z;
        const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return true;
      }
    }
    return false;
  }
  // 用于散布植被/石头：避开路、水、建筑与保留区
  isFree(x, z, r = 0.5, { allowPath = false, allowWater = false, margin = 0.6 } = {}) {
    if (!this.inside(x, z, margin)) return false;
    if (!allowWater && this.waterDepth(x, z) > -0.05) return false;
    if (!allowPath && this.spec.surface && (this.spec.surface(x, z, this).path || 0) > 0.15) return false;
    for (const k of this.keep) { const dx = x - k.x, dz = z - k.z; if (dx * dx + dz * dz < (k.r + r) * (k.r + r)) return false; }
    return !this.blocked(x, z, r);
  }

  // ---------- 地形网格 ----------
  buildTerrain() {
    const sp = this.spec, sh = sp.shape;
    const step = sp.meshStep ?? 0.25;
    let NU, NV, map;
    if (sh.type === 'rect') {
      NU = Math.ceil(sh.w / step); NV = Math.ceil(sh.d / step);
      map = (u, v) => [(sh.cx || 0) + u * sh.w / 2, (sh.cz || 0) + v * sh.d / 2];
    } else {
      const R = sh.maxR;
      NU = NV = Math.ceil((2 * R) / step);
      map = (u, v) => {
        const x = u * Math.sqrt(1 - v * v / 2), z = v * Math.sqrt(1 - u * u / 2);
        const th = Math.atan2(z, x);
        const r = sh.radius(th);
        return [(sh.cx || 0) + x * r, (sh.cz || 0) + z * r];
      };
    }
    const cols = NU + 1, rows = NV + 1, n = cols * rows;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u = -1 + (2 * i) / NU, v = -1 + (2 * j) / NV;
      const [x, z] = map(u, v);
      const k = j * cols + i;
      pos[k * 3] = x; pos[k * 3 + 1] = this.heightAt(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
    }
    const idx = [];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;

    // 预计算每个顶点的材质权重与噪声，季节切换时只需重新混色
    const cache = {
      gv: new Float32Array(n), pv: new Float32Array(n), dry: new Float32Array(n),
      path: new Float32Array(n), bank: new Float32Array(n), soil: new Float32Array(n),
      wall: new Float32Array(n), ao: new Float32Array(n), sand: new Float32Array(n), moss: new Float32Array(n),
    };
    const mask = new Float32Array(n * 4);
    const aoGrid = this.buildAO();
    for (let k = 0; k < n; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const s = sp.surface ? sp.surface(x, z, this) : {};
      const ny = nrm.getY(k);
      cache.gv[k] = clamp(fbm(x * 0.09, z * 0.09, 3, 11) * 1.6 - 0.3, 0, 1);
      cache.pv[k] = vnoise(x * 0.55, z * 0.55, 5);
      cache.dry[k] = smoothstep(0.55, 0.8, fbm(x * 0.05 + 30, z * 0.05, 3, 23));
      const wall = sp.walls === false ? 0 : smoothstep(0.78, 0.6, ny);
      const depth = this.waterLevel - y;
      const bank = Math.max(s.bank || 0, smoothstep(-0.55, -0.05, depth) * (sp.bankColor === false ? 0 : 1));
      cache.path[k] = clamp(s.path || 0, 0, 1) * (1 - wall);
      cache.bank[k] = clamp(bank, 0, 1) * (1 - wall);
      cache.soil[k] = clamp(s.soil || 0, 0, 1);
      cache.sand[k] = clamp(s.sand || 0, 0, 1);
      cache.wall[k] = wall;
      cache.moss[k] = s.moss || 0;
      // 环境遮蔽：物体接触阴影 + 低洼处
      let ao = aoGrid.get(x, z);
      const lap = (this.heightAt(x + 0.8, z) + this.heightAt(x - 0.8, z) + this.heightAt(x, z + 0.8) + this.heightAt(x, z - 0.8)) / 4 - y;
      ao *= 1 - clamp(lap * 0.35, 0, 0.3);
      if (depth > 0) ao *= 1 - clamp(depth * 0.25, 0, 0.35);
      cache.ao[k] = ao;
      const grass = clamp(1 - cache.path[k] - cache.bank[k] - cache.soil[k] - cache.sand[k] - wall, 0, 1);
      mask[k * 4] = grass;
      mask[k * 4 + 1] = cache.path[k];
      mask[k * 4 + 2] = (s.cobble || 0) * cache.path[k];
      mask[k * 4 + 3] = wall * (sp.wallStones === false ? 0 : 1);
    }
    geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mesh = new THREE.Mesh(geo, this.mats.terrain);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    this.group.add(mesh);
    this.terrain = { mesh, cache, n };

    // 剖面：沿网格外圈
    const ring = [];
    for (let i = 0; i < NU; i++) ring.push([i, 0]);
    for (let j = 0; j < NV; j++) ring.push([NU, j]);
    for (let i = NU; i > 0; i--) ring.push([i, NV]);
    for (let j = NV; j > 0; j--) ring.push([0, j]);
    const loop = ring.map(([i, j]) => { const k = j * cols + i; return [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]; });
    this.buildSkirt(loop);
  }

  buildSkirt(loop) {
    const sp = this.spec, sh = sp.shape;
    const cx = sh.cx || 0, cz = sh.cz || 0;
    const L = loop.length;
    const floating = sh.type !== 'rect';
    const bottom = -(sp.thickness ?? 5);
    const depthsRect = [0, 0.1, 0.3, 0.7, 1.3, 2.2, 3.2, 4.4];
    const rowsN = floating ? 14 : depthsRect.length + 1;
    const cols = L + 1;
    const P = new Float32Array(rowsN * cols * 3);
    const S = new Float32Array(rowsN * cols * 2);
    let acc = 0;
    const sArr = [0];
    for (let i = 1; i <= L; i++) {
      const a = loop[i - 1], b = loop[i % L];
      acc += Math.hypot(b[0] - a[0], b[2] - a[2]);
      sArr.push(acc);
    }
    const minTop = Math.min(...loop.map((p) => p[1]));
    for (let i = 0; i < cols; i++) {
      const p = loop[i % L];
      const s = sArr[i];
      const ox = p[0] - cx, oz = p[2] - cz;
      const ol = Math.hypot(ox, oz) || 1;
      const nx = ox / ol, nz = oz / ol;
      for (let r = 0; r < rowsN; r++) {
        let x, y, z, depth;
        if (!floating) {
          if (r < depthsRect.length) {
            depth = depthsRect[r];
            y = Math.max(p[1] - depth, bottom + (depthsRect.length - r) * 0.02);
          } else y = bottom;
          if (r === rowsN - 1) y = bottom;
          const j = r === 0 ? 0 : (vnoise(s * 0.6, r * 1.7, 77) - 0.5) * 0.28 + (r === 1 ? 0.06 : 0);
          const ex = sh.type === 'rect' ? edgeNormalRect(p[0] - cx, p[2] - cz, sh) : [nx, nz];
          x = p[0] + ex[0] * j; z = p[2] + ex[1] * j;
        } else {
          const t = r / (rowsN - 1);
          const depthMax = sp.thickness ?? 10;
          const prof = Math.pow(t, 1.25);
          y = lerp(p[1], minTop - depthMax * (0.8 + 0.25 * vnoise(s * 0.08, 3, 91)), prof);
          if (r === 1) y = p[1] - 0.12;
          let shrink = 1 - Math.pow(t, 1.6) * 0.97 + (vnoise(s * 0.25, r * 0.9, 31) - 0.5) * 0.12 * Math.sin(t * Math.PI);
          const bulge = r === 1 ? 0.1 : 0;
          if (r === rowsN - 1) { shrink = 0; y = minTop - depthMax * 0.95; }
          x = cx + ox * shrink + nx * bulge; z = cz + oz * shrink + nz * bulge;
        }
        depth = p[1] - y;
        const k = r * cols + i;
        P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z;
        S[k * 2] = s; S[k * 2 + 1] = depth;
      }
    }
    const idx = [];
    for (let r = 0; r < rowsN - 1; r++) for (let i = 0; i < cols - 1; i++) {
      const a = r * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(S, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rowsN * cols * 2), 2));
    const col = new Float32Array(rowsN * cols * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.mats.skirt);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'skirt';
    this.group.add(mesh);
    // 底面
    if (!floating) {
      const shape = new THREE.Shape(loop.map((p) => new THREE.Vector2(p[0], -p[2])));
      const bg = new THREE.ShapeGeometry(shape);
      bg.rotateX(-Math.PI / 2);
      bg.translate(0, bottom, 0);
      const bc = new Float32Array(bg.attributes.position.count * 3).fill(0.25);
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
      const bs = new Float32Array(bg.attributes.position.count * 2).fill(20);
      bg.setAttribute('aSide', new THREE.BufferAttribute(bs, 2));
      const bm = new THREE.Mesh(bg, this.mats.skirt);
      bm.name = 'bottom';
      this.group.add(bm);
    }
    this.skirtLoop = loop;
  }

  buildAO() {
    const b = this.bounds;
    const g = new Grid({ x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1 }, 0.4, 1);
    for (const o of this.occluders) {
      const R = o.r * 1.6;
      const i0 = Math.max(0, Math.floor((o.x - R - g.x0) / g.res)), i1 = Math.min(g.nx - 1, Math.ceil((o.x + R - g.x0) / g.res));
      const j0 = Math.max(0, Math.floor((o.z - R - g.z0) / g.res)), j1 = Math.min(g.nz - 1, Math.ceil((o.z + R - g.z0) / g.res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = g.x0 + i * g.res, z = g.z0 + j * g.res;
        let d;
        if (o.hw) {
          const dx = Math.max(0, Math.abs(x - o.x) - o.hw), dz = Math.max(0, Math.abs(z - o.z) - o.hd);
          d = Math.hypot(dx, dz) / (o.r * 0.6);
        } else d = Math.hypot(x - o.x, z - o.z) / R;
        if (d < 1) g.a[j * g.nx + i] *= 1 - o.k * (1 - d) * (1 - d);
      }
    }
    return g;
  }

  // ---------- 季节着色 ----------
  applySeason(season) {
    this.season = season;
    const pal = seasonPalette(season, this.spec.tint);
    this.palette = pal;
    const sp = this.spec;
    const sc = sp.colors ? sp.colors(pal, season) : {};
    const path = new THREE.Color(sc.path || '#b48d5e');
    const bank = new THREE.Color(sc.bank || '#8a8466');
    const soil = new THREE.Color(sc.soil || '#7a5236');
    const sand = new THREE.Color(sc.sand || '#d8c49a');
    const moss = new THREE.Color(sc.moss || '#6f8f4c');
    const gA = sc.grassA || pal.grassA, gB = sc.grassB || pal.grassB, gD = sc.grassDry || pal.grassDry;
    const { cache, n, mesh } = this.terrain;
    const col = mesh.geometry.attributes.color.array;
    const target = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      _c.copy(gA).lerp(gB, cache.gv[k]).lerp(gD, cache.dry[k] * pal.dryAmt * 2);
      const pv = 0.9 + 0.2 * cache.pv[k];
      let r = _c.r * pv, g = _c.g * pv, b = _c.b * pv;
      const mix = (c, w) => { r += (c.r - r) * w; g += (c.g - g) * w; b += (c.b - b) * w; };
      if (cache.moss[k] > 0) mix(moss, cache.moss[k]);
      if (cache.bank[k] > 0) mix(bank, cache.bank[k]);
      if (cache.sand[k] > 0) mix(sand, cache.sand[k]);
      if (cache.soil[k] > 0) mix(soil, cache.soil[k]);
      if (cache.path[k] > 0) { const pv2 = 0.94 + 0.12 * cache.pv[k]; mix({ r: path.r * pv2, g: path.g * pv2, b: path.b * pv2 }, cache.path[k]); }
      const ao = cache.ao[k];
      target[k * 3] = r * ao; target[k * 3 + 1] = g * ao; target[k * 3 + 2] = b * ao;
    }
    this._seasonFrom = this._seasonTo ? col.slice() : null;
    this._seasonTo = target;
    this._seasonT = this._seasonFrom ? 0 : 1;
    if (!this._seasonFrom) { col.set(target); mesh.geometry.attributes.color.needsUpdate = true; }

    // 全局 uniform
    G.uFlowerA.value.copy(pal.flowerA);
    G.uFlowerB.value.copy(pal.flowerB);
    G.uFlowerSpeck.value = pal.flowerSpeck * (sp.speckMul ?? 1);
    G.uWallColor.value.set(sc.wall || '#b5b0a3');
    G.uLip.value.copy(sc.lip ? new THREE.Color(sc.lip) : _c.copy(gA).multiplyScalar(0.85));
    G.uSoilTop.value.set(sc.soilTop || '#5b3c26');
    G.uSoilMid.value.set(sc.soilMid || '#b88a45');
    G.uRock.value.set(sc.rock || '#8d9198');
    for (const h of this.seasonHooks) h(pal, season);
  }

  tickSeason(dt) {
    if (this._seasonT >= 1 || !this._seasonFrom) return;
    this._seasonT = Math.min(1, this._seasonT + dt / 0.9);
    const t = smoothstep(0, 1, this._seasonT);
    const col = this.terrain.mesh.geometry.attributes.color.array;
    const a = this._seasonFrom, b = this._seasonTo;
    for (let i = 0; i < col.length; i++) col[i] = a[i] + (b[i] - a[i]) * t;
    this.terrain.mesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- 可通行网格 ----------
  buildWalk() {
    const b = this.bounds, sp = this.spec;
    this.W = new Grid(b, 0.25, 0);
    const W = this.W;
    const ford = sp.fordDepth ?? 0.3;
    const maxSlope = sp.maxSlope ?? 0.95;
    for (let j = 0; j < W.nz; j++) for (let i = 0; i < W.nx; i++) {
      const x = W.x0 + i * W.res, z = W.z0 + j * W.res;
      let ok = 0;
      if (this.inside(x, z, sp.walkMargin ?? 0.7)) {
        if (this.deckAt(x, z)) ok = 1;
        else if (!this.blocked(x, z, 0.18)) {
          const h = this.heightAt(x, z);
          const depth = this.waterLevel - h;
          if (depth < ford) {
            const e = 0.3;
            const gx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
            const gz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
            if (Math.hypot(gx, gz) < maxSlope) ok = 1;
          }
          if (ok && sp.walkFilter && !sp.walkFilter(x, z, this)) ok = 0;
        }
      }
      W.a[j * W.nx + i] = ok;
    }
  }
  // 最近的可通行点（螺旋搜索）
  nearestWalkable(x, z, maxR = 6) {
    if (this.canWalk(x, z)) return [x, z];
    for (let r = 0.25; r <= maxR; r += 0.25) {
      const n = Math.max(8, Math.round((r * Math.PI * 2) / 0.25));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.canWalk(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }
  canWalk(x, z) {
    const c = this.W.cell(x, z);
    return c >= 0 && this.W.a[c] > 0.5;
  }

  // ---------- 灯 ----------
  addLamp({ x, y, z, color = '#ffb35c', intensity = 6, distance = 7, glow = 1.6, light = true, night = 1, kind = 'lantern' }) {
    const lamp = { x, y, z, base: intensity, glowBase: glow, boost: 0, flash: 0, kind, night, phase: this.rng.range(0, 10) };
    if (light) {
      const pl = new THREE.PointLight(color, intensity, distance, 1.6);
      pl.position.set(x, y, z);
      this.group.add(pl);
      lamp.light = pl;
    }
    const sm = new THREE.SpriteMaterial({ map: getSoftTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
    const sp = new THREE.Sprite(sm);
    sp.position.set(x, y, z);
    sp.scale.setScalar(glow);
    sp.renderOrder = 5;
    this.group.add(sp);
    lamp.sprite = sp;
    this.lamps.push(lamp);
    return lamp;
  }

  // ---------- 释放 ----------
  dispose() {
    const geos = new Set(), mats = new Set(), texs = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) geos.add(o.geometry);
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!m.userData?.shared) mats.add(m);
      if (o.isInstancedMesh) o.dispose?.();
    });
    for (const m of mats) { for (const v of Object.values(m)) if (v && v.isTexture && !v.userData?.shared) texs.add(v); m.dispose(); }
    for (const g of geos) g.dispose();
    for (const t of texs) t.dispose();
    for (const t of this.extraTextures || []) t.dispose();
    this.group.removeFromParent();
  }
}

function edgeNormalRect(x, z, sh) {
  const dx = sh.w / 2 - Math.abs(x), dz = sh.d / 2 - Math.abs(z);
  if (Math.abs(dx - dz) < 0.3) return [Math.sign(x) * 0.7, Math.sign(z) * 0.7];
  return dx < dz ? [Math.sign(x), 0] : [0, Math.sign(z)];
}
