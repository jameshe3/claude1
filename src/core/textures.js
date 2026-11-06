// 程序化 Canvas 纹理：建筑图集（灰度细节）、叶簇、柔光点。全部在运行时绘制，不依赖外部图片。
import * as THREE from 'three';
import { RNG } from './rng.js';

const CELL = 256;
const GRID = 4;
export const ATLAS_SIZE = CELL * GRID;

// 图集单元编号
export const TEX = {
  plaster: 0, planksV: 1, thatch: 2, shingles: 3,
  cobble: 4, blocks: 5, planksH: 6, bark: 7,
  white: 8, shoji: 9, kawara: 10, stucco: 11,
  slate: 12, lattice: 13, cloth: 14, stripes: 15,
};

export function atlasRect(id) {
  const cx = id % GRID, cy = Math.floor(id / GRID);
  const pad = 3 / ATLAS_SIZE;
  const s = 1 / GRID;
  // 纹理 v 轴向上：第 0 行位于顶部
  return [cx * s + pad, 1 - (cy + 1) * s + pad, s - 2 * pad, s - 2 * pad];
}

function g(v, a = 1) {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
}

function stroke(ctx, x, y, len, w, ang, col) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, len / 2, w / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintCell(ctx, id, rng) {
  const S = CELL;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
  switch (id) {
    case TEX.plaster: case TEX.stucco: {
      ctx.fillStyle = g(id === TEX.plaster ? 0.93 : 0.88); ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i++) stroke(ctx, rng.range(0, S), rng.range(0, S), rng.range(14, 46), rng.range(4, 9), rng.range(-0.25, 0.25), g(rng.range(0.78, 1.0), 0.22));
      if (id === TEX.stucco) for (let i = 0; i < 40; i++) stroke(ctx, rng.range(0, S), rng.range(0, S), rng.range(10, 22), rng.range(6, 12), rng.range(0, 3), g(0.7, 0.18));
      break;
    }
    case TEX.planksV: case TEX.planksH: {
      ctx.fillStyle = g(0.8); ctx.fillRect(0, 0, S, S);
      if (id === TEX.planksH) { ctx.translate(S, 0); ctx.rotate(Math.PI / 2); }
      const n = 5, w = S / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = g(rng.range(0.72, 0.92)); ctx.fillRect(i * w, 0, w, S);
        for (let k = 0; k < 18; k++) {
          ctx.fillStyle = g(rng.range(0.55, 1.0), 0.18);
          ctx.fillRect(i * w + rng.range(3, w - 6), rng.range(-20, S), rng.range(1, 3), rng.range(30, 120));
        }
        ctx.fillStyle = g(0.42, 0.9); ctx.fillRect(i * w, 0, 3, S);
        ctx.fillStyle = g(1.0, 0.25); ctx.fillRect(i * w + 3, 0, 2, S);
        if (rng.chance(0.5)) { ctx.fillStyle = g(0.4, 0.6); ctx.fillRect(i * w, rng.range(0, S), w, 2); }
      }
      break;
    }
    case TEX.thatch: {
      ctx.fillStyle = g(0.72); ctx.fillRect(0, 0, S, S);
      const rows = 4, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < 260; i++) {
          const x = rng.range(-5, S + 5), y = r * rh + rng.range(-6, rh);
          ctx.strokeStyle = g(rng.range(0.45, 1.0), 0.75);
          ctx.lineWidth = rng.range(1.2, 3);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-5, 5), y + rng.range(rh * 0.6, rh * 1.15)); ctx.stroke();
        }
        const grd = ctx.createLinearGradient(0, r * rh + rh * 0.75, 0, (r + 1) * rh);
        grd.addColorStop(0, g(0.5, 0)); grd.addColorStop(1, g(0.3, 0.8));
        ctx.fillStyle = grd; ctx.fillRect(0, r * rh, S, rh);
      }
      break;
    }
    case TEX.shingles: case TEX.slate: {
      ctx.fillStyle = g(0.55); ctx.fillRect(0, 0, S, S);
      const rows = 8, rh = S / rows, tw = id === TEX.slate ? 42 : 32;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * tw * 0.5;
        for (let x = -tw; x < S + tw; x += tw) {
          const v = rng.range(0.72, 0.98);
          ctx.fillStyle = g(v);
          ctx.beginPath();
          const x0 = x + off + 1.5, y0 = r * rh;
          if (id === TEX.slate) ctx.rect(x0, y0, tw - 3, rh - 2);
          else {
            ctx.moveTo(x0, y0); ctx.lineTo(x0 + tw - 3, y0); ctx.lineTo(x0 + tw - 3, y0 + rh * 0.7);
            ctx.quadraticCurveTo(x0 + (tw - 3) / 2, y0 + rh * 1.15, x0, y0 + rh * 0.7); ctx.closePath();
          }
          ctx.fill();
          ctx.fillStyle = g(1, 0.25); ctx.fillRect(x0 + 2, y0 + 2, tw - 8, 3);
          for (let k = 0; k < 3; k++) stroke(ctx, x0 + rng.range(4, tw - 6), y0 + rng.range(4, rh - 4), rng.range(6, 14), 3, rng.range(-0.3, 0.3), g(rng.range(0.6, 1), 0.3));
        }
        ctx.fillStyle = g(0.35, 0.5); ctx.fillRect(0, (r + 1) * rh - 2, S, 2);
      }
      break;
    }
    case TEX.cobble: {
      ctx.fillStyle = g(0.42); ctx.fillRect(0, 0, S, S);
      const rows = 6, rh = S / rows;
      for (let r = 0; r < rows + 1; r++) {
        let x = rng.range(-30, 0);
        while (x < S + 10) {
          const w = rng.range(28, 54);
          const y = r * rh + rng.range(-5, 5);
          ctx.fillStyle = g(rng.range(0.7, 0.98));
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + rh / 2, w / 2 - 2, rh / 2 - 2.5, rng.range(-0.15, 0.15), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = g(1, 0.3);
          ctx.beginPath(); ctx.ellipse(x + w / 2 - 3, y + rh / 2 - 5, w / 2 - 9, rh / 5, 0, 0, Math.PI * 2); ctx.fill();
          x += w;
        }
      }
      break;
    }
    case TEX.blocks: {
      ctx.fillStyle = g(0.5); ctx.fillRect(0, 0, S, S);
      const rows = 4, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * 40;
        for (let x = -80; x < S + 80; x += 80) {
          ctx.fillStyle = g(rng.range(0.74, 0.95));
          ctx.fillRect(x + off + 2, r * rh + 2, 76, rh - 4);
          for (let k = 0; k < 6; k++) stroke(ctx, x + off + rng.range(8, 70), r * rh + rng.range(8, rh - 8), rng.range(10, 30), 4, rng.range(-0.2, 0.2), g(rng.range(0.6, 1), 0.25));
        }
      }
      break;
    }
    case TEX.bark: {
      ctx.fillStyle = g(0.72); ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = g(rng.range(0.45, 1.0), 0.35);
        ctx.fillRect(rng.range(0, S), rng.range(-30, S), rng.range(2, 7), rng.range(30, 110));
      }
      break;
    }
    case TEX.shoji: {
      ctx.fillStyle = g(0.97); ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = g(0.45);
      for (let i = 0; i <= 4; i++) ctx.fillRect(i * S / 4 - 3, 0, 6, S);
      for (let i = 0; i <= 6; i++) ctx.fillRect(0, i * S / 6 - 3, S, 6);
      break;
    }
    case TEX.kawara: {
      ctx.fillStyle = g(0.5); ctx.fillRect(0, 0, S, S);
      const cols = 8, cw = S / cols;
      for (let c = 0; c < cols; c++) {
        const grd = ctx.createLinearGradient(c * cw, 0, (c + 1) * cw, 0);
        grd.addColorStop(0, g(0.62)); grd.addColorStop(0.45, g(0.98)); grd.addColorStop(1, g(0.55));
        ctx.fillStyle = grd; ctx.fillRect(c * cw, 0, cw, S);
      }
      for (let r = 0; r < 6; r++) { ctx.fillStyle = g(0.35, 0.55); ctx.fillRect(0, r * S / 6, S, 3); }
      break;
    }
    case TEX.lattice: {
      ctx.fillStyle = g(0.9); ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = g(0.45); ctx.lineWidth = 7;
      for (let i = -S; i < S * 2; i += 42) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, S); ctx.lineTo(i + S, 0); ctx.stroke();
      }
      break;
    }
    case TEX.cloth: {
      ctx.fillStyle = g(0.9); ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 120; i++) stroke(ctx, rng.range(0, S), rng.range(0, S), rng.range(20, 60), rng.range(3, 6), rng.range(1.3, 1.8), g(rng.range(0.75, 1), 0.25));
      break;
    }
    case TEX.stripes: {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = g(i % 2 ? 0.98 : 0.62); ctx.fillRect(i * S / 8, 0, S / 8, S); }
      for (let i = 0; i < 60; i++) stroke(ctx, rng.range(0, S), rng.range(0, S), rng.range(20, 50), 4, Math.PI / 2, g(rng.range(0.8, 1), 0.2));
      break;
    }
    default: {
      ctx.fillStyle = g(1); ctx.fillRect(0, 0, S, S);
    }
  }
  ctx.restore();
}

let atlasTex = null;
export function getAtlas() {
  if (atlasTex) return atlasTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_SIZE;
  const ctx = cv.getContext('2d');
  const rng = new RNG(9001);
  for (let id = 0; id < 16; id++) {
    const cx = id % GRID, cy = Math.floor(id / GRID);
    ctx.save();
    ctx.translate(cx * CELL, cy * CELL);
    paintCell(ctx, id, rng);
    ctx.restore();
  }
  atlasTex = new THREE.CanvasTexture(cv);
  atlasTex.colorSpace = THREE.NoColorSpace; // 灰度细节，按线性乘子使用
  atlasTex.anisotropy = 4;
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex.userData.shared = true;
  return atlasTex;
}

// 叶簇贴图：由几十片小叶组成的不规则团块，带受光边缘
let leafTex = null;
export function getLeafTexture() {
  if (leafTex) return leafTex;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const rng = new RNG(4242);
  ctx.clearRect(0, 0, S, S);
  // 若干圆润叶团组成扇贝状外轮廓，每团内有几片受光小叶
  const lobes = [];
  for (let i = 0; i < 15; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.random()) * S * 0.27;
    lobes.push({ x: S / 2 + Math.cos(a) * r, y: S / 2 + Math.sin(a) * r * 0.9, r: rng.range(26, 40) });
  }
  lobes.sort((p, q) => p.y - q.y);
  for (const lb of lobes) {
    const lit = 1 - ((lb.y - S * 0.2) / (S * 0.6)) * 0.45;
    ctx.fillStyle = g(0.66 * (0.85 + 0.2 * lit));
    ctx.beginPath();
    // 扇贝边缘：沿圆周的小凸起
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * Math.PI * 2;
      const rr = lb.r * (0.86 + 0.14 * Math.cos(t * 3 + lb.x));
      const x = lb.x + Math.cos(t) * rr, y = lb.y + Math.sin(t) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(lb.x + Math.cos(t - Math.PI / n) * rr * 1.18, lb.y + Math.sin(t - Math.PI / n) * rr * 1.18, x, y);
    }
    ctx.fill();
    for (let k = 0; k < 7; k++) {
      const a = rng.range(-2.6, -0.5), d = rng.range(0.3, 0.85) * lb.r;
      ctx.save();
      ctx.translate(lb.x + Math.cos(a) * d, lb.y + Math.sin(a) * d);
      ctx.rotate(a + rng.range(-0.5, 0.5));
      ctx.fillStyle = g(rng.range(0.82, 1.0), rng.range(0.55, 0.9) * lit);
      ctx.beginPath(); ctx.ellipse(0, 0, rng.range(7, 12), rng.range(4, 6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = g(0.45, 0.35); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(lb.x, lb.y + lb.r * 0.2, lb.r * 0.75, 0.3, Math.PI - 0.3); ctx.stroke();
  }
  leafTex = new THREE.CanvasTexture(cv);
  leafTex.colorSpace = THREE.NoColorSpace;
  leafTex.userData.shared = true;
  return leafTex;
}

// 柔和圆点（光晕、粒子）
let softTex = null;
export function getSoftTexture() {
  if (softTex) return softTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const grd = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
  softTex = new THREE.CanvasTexture(cv);
  softTex.userData.shared = true;
  return softTex;
}
