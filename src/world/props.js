// 程序化建筑与道具：房屋（屋檐/窗框/门/台阶/烟囱/老虎窗/门廊）、神社、鸟居、石灯笼、
// 纸灯笼、小桥、栅栏、推车摊位、路灯与灯串、长椅、水井、亭子等。
import * as THREE from 'three';
import { GeoBuilder, mat } from '../core/geo.js';
import { TEX } from '../core/textures.js';

const UP = new THREE.Vector3(0, 1, 0);

export function initBuilders(world) {
  world.gb = new GeoBuilder(world.spec.seed + 1);
  world.glass = new GeoBuilder(world.spec.seed + 2);
  world.bulb = new GeoBuilder(world.spec.seed + 3);
}

export function finalizeBuilders(world) {
  const m = world.mats;
  const g1 = world.gb.build();
  if (g1) {
    const mesh = new THREE.Mesh(g1, m.building);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'buildings';
    world.group.add(mesh);
  }
  const g2 = world.glass.build();
  if (g2) {
    const mesh = new THREE.Mesh(g2, m.glass);
    mesh.name = 'glass'; mesh.receiveShadow = true;
    world.group.add(mesh);
  }
  const g3 = world.bulb.build();
  if (g3) {
    const mesh = new THREE.Mesh(g3, m.bulb);
    mesh.name = 'bulbs';
    world.group.add(mesh);
  }
}

// 父矩阵：位置 + 绕 Y 旋转
export function frame(x, y, z, rot = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1));
}
const L = (parent, pos, rot = [0, 0, 0], scale) => parent.clone().multiply(mat({ pos, rot, scale }));

function onFace(parent, w, d, side, u, y) {
  switch (side) {
    case 'front': return L(parent, [u, y, d / 2]);
    case 'back': return L(parent, [-u, y, -d / 2], [0, Math.PI, 0]);
    case 'right': return L(parent, [w / 2, y, -u], [0, Math.PI / 2, 0]);
    default: return L(parent, [-w / 2, y, u], [0, -Math.PI / 2, 0]);
  }
}

// 窗：外框、玻璃（夜间发光）、十字窗棂、窗台、可选百叶
export function windowAt(world, F, { w = 0.8, h = 1.0, frame: fc = '#f3ead8', shutter = null, cross = true, glass = '#3f5a6e', arch = false } = {}) {
  const gb = world.gb;
  gb.box(w + 0.16, h + 0.16, 0.08, { matrix: L(F, [0, 0, 0.03]), color: fc });
  world.glass.box(w, h, 0.04, { matrix: L(F, [0, 0, 0.07]), color: glass, jitter: 0.12 });
  if (cross) {
    gb.box(0.05, h, 0.05, { matrix: L(F, [0, 0, 0.1]), color: fc });
    gb.box(w, 0.05, 0.05, { matrix: L(F, [0, h * 0.1, 0.1]), color: fc });
  }
  gb.box(w + 0.26, 0.07, 0.18, { matrix: L(F, [0, -h / 2 - 0.08, 0.09]), color: fc });
  gb.box(w + 0.22, 0.08, 0.12, { matrix: L(F, [0, h / 2 + 0.1, 0.07]), color: fc });
  if (arch) gb.box(w * 0.7, 0.12, 0.1, { matrix: L(F, [0, h / 2 + 0.2, 0.06]), color: fc });
  if (shutter) {
    for (const s of [-1, 1]) gb.box(w * 0.48, h + 0.06, 0.05, { matrix: L(F, [s * (w / 2 + w * 0.26 + 0.08), 0, 0.06]), color: shutter, tex: TEX.planksV, tile: 0.5 });
  }
}

export function doorAt(world, F, { w = 0.9, h = 1.65, color = '#7a4b33', frame: fc = '#efe4cf', steps = 1, stepColor = '#a8a39a', lamp = false, base = 0.45 } = {}) {
  const gb = world.gb;
  gb.box(w + 0.2, h + 0.12, 0.08, { matrix: L(F, [0, h / 2, 0.03]), color: fc });
  gb.box(w, h, 0.06, { matrix: L(F, [0, h / 2 - 0.02, 0.07]), color, tex: TEX.planksV, tile: 0.6 });
  world.glass.box(w * 0.5, 0.25, 0.03, { matrix: L(F, [0, h - 0.28, 0.11]), color: '#4a6070' });
  gb.box(0.08, 0.08, 0.06, { matrix: L(F, [w * 0.32, h * 0.48, 0.12]), color: '#d8b45a' });
  if (steps && base > 0.05) {
    const sh = base / 2;
    gb.box(w + 0.7, sh, 0.75, { matrix: L(F, [0, -base + sh / 2, 0.38]), color: stepColor, tex: TEX.blocks, tile: 0.8 });
    gb.box(w + 0.45, sh, 0.42, { matrix: L(F, [0, -base + sh * 1.5, 0.22]), color: stepColor, tex: TEX.blocks, tile: 0.8 });
  }
  if (lamp) {
    gb.box(0.06, 0.25, 0.06, { matrix: L(F, [w / 2 + 0.25, h + 0.05, 0.12]), color: '#3b3632' });
    world.bulb.box(0.14, 0.18, 0.14, { matrix: L(F, [w / 2 + 0.25, h - 0.1, 0.2]), color: [2.2, 1.5, 0.75] });
  }
}

// 房屋
// o: {x,z,rot,w,d,wallH,wall,roof,roofType,roofH,over,chimneys,dormers,porch,base,trim,shutter,wallTex,roofTex,door,windows}
export function house(world, o) {
  const gb = world.gb;
  const y0 = o.y ?? minGround(world, o.x, o.z, o.w, o.d, o.rot || 0);
  const F = frame(o.x, y0, o.z, o.rot || 0);
  const w = o.w, d = o.d, H = o.wallH ?? 2.4;
  const roofH = o.roofH ?? d * 0.42;
  const over = o.over ?? 0.45;
  const base = o.baseH ?? 0.45;
  const trim = o.trim || '#efe6d2';
  // 石基
  gb.box(w + 0.24, base + 0.6, d + 0.24, { matrix: L(F, [0, base / 2 - 0.3, 0]), color: o.baseColor || '#a09a90', tex: TEX.cobble, tile: 1.1 });
  // 墙体（略高以封住檐下缝隙）
  const fill = o.roofType === 'gable' || !o.roofType ? roofH * over / (d / 2 + over) + 0.05 : 0.15;
  gb.box(w, H + fill, d, { matrix: L(F, [0, base + (H + fill) / 2, 0]), color: o.wall || '#e9dcc0', tex: o.wallTex ?? TEX.plaster, tile: 1.6 });
  // 转角与腰线木构
  if (o.timber) {
    const tc = o.timber;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.16, H, 0.16, { matrix: L(F, [sx * (w / 2 + 0.02), base + H / 2, sz * (d / 2 + 0.02)]), color: tc, tex: TEX.planksV, tile: 0.6 });
    gb.box(w + 0.1, 0.14, d + 0.1, { matrix: L(F, [0, base + H * 0.52, 0]), color: tc, tex: TEX.planksH });
    gb.box(w + 0.12, 0.16, d + 0.12, { matrix: L(F, [0, base + H, 0]), color: tc, tex: TEX.planksH });
  }
  // 楼层分隔
  if (o.floors && o.floors > 1) {
    for (let f = 1; f < o.floors; f++) gb.box(w + 0.12, 0.12, d + 0.12, { matrix: L(F, [0, base + (H / o.floors) * f, 0]), color: trim });
  }
  // 屋顶
  const ry = base + H;
  const roofCol = o.roof || '#8b5a44';
  const roofTex = o.roofTex ?? TEX.shingles;
  if (!o.roofType || o.roofType === 'gable') {
    gb.gable(w + over * 2 * (o.gableOver ?? 0.6), d + over * 2, roofH, { matrix: L(F, [0, ry, 0]), color: roofCol, tex: roofTex, tile: 1.4, th: o.roofTh ?? 0.16 });
    // 山墙三角
    const th = (o.roofTh ?? 0.16) * 1.3;
    for (const sx of [-1, 1]) {
      gb.poly([[[sx * w / 2, ry, sx * d / 2], [sx * w / 2, ry, -sx * d / 2], [sx * w / 2, ry + roofH - th, 0]]], { matrix: F, color: o.gableColor || o.wall || '#e9dcc0', tex: o.gableTex ?? o.wallTex ?? TEX.plaster, tile: 1.6 });
    }
    gb.box(w + over * 1.3, 0.14, 0.2, { matrix: L(F, [0, ry + roofH + 0.02, 0]), color: shade(roofCol, 0.75) });
  } else if (o.roofType === 'hip' || o.roofType === 'thatch') {
    const thatch = o.roofType === 'thatch';
    gb.hip(w + over * 2, d + over * 2, roofH, { matrix: L(F, [0, ry + (thatch ? 0.1 : 0), 0]), color: roofCol, tex: thatch ? TEX.thatch : roofTex, tile: thatch ? 1.3 : 1.4, th: thatch ? 0.5 : 0.18, ridge: o.ridge ?? (thatch ? 0.45 : 0.35) });
    if (thatch) {
      const rl = (o.ridge ?? 0.45) * (w + over * 2) / 2;
      gb.box(rl * 2 + 0.4, 0.28, 0.5, { matrix: L(F, [0, ry + roofH + 0.12, 0]), color: shade(roofCol, 0.55), tex: TEX.thatch, tile: 1 });
      gb.box(rl * 2 + 0.2, 0.18, 0.22, { matrix: L(F, [0, ry + roofH + 0.32, 0]), color: '#5a4a3a', tex: TEX.planksH });
    } else gb.box((o.ridge ?? 0.35) * (w + over * 2) + 0.1, 0.12, 0.18, { matrix: L(F, [0, ry + roofH + 0.03, 0]), color: shade(roofCol, 0.75) });
  }
  // 门
  const doorSide = o.doorSide || 'front';
  const doorU = o.doorU ?? 0;
  const faceW = doorSide === 'front' || doorSide === 'back' ? w : d;
  doorAt(world, onFace(F, w, d, doorSide, doorU, base), { color: o.doorColor || '#7a4b33', frame: trim, lamp: o.doorLamp, steps: 1, base });
  // 窗
  const floors = o.floors || 1;
  const fh = H / floors;
  const sides = o.windowSides || ['front', 'right', 'left', 'back'];
  for (const side of sides) {
    const fw = side === 'front' || side === 'back' ? w : d;
    const n = Math.max(1, Math.floor((fw - 0.6) / (o.winSpacing ?? 1.6)));
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const u = -fw / 2 + (fw / n) * (i + 0.5);
        if (side === doorSide && f === 0 && Math.abs(u - doorU) < 0.9) continue;
        const wy = base + fh * f + fh * 0.55;
        windowAt(world, onFace(F, w, d, side, u, wy), { w: o.winW ?? 0.7, h: Math.min(o.winH ?? 0.9, fh * 0.55), frame: trim, shutter: o.shutter, glass: o.glass });
      }
    }
  }
  void faceW;
  // 烟囱
  for (const c of o.chimneys || []) {
    const cx = c[0], cz = c[1];
    const roofAt = !o.roofType || o.roofType === 'gable' ? ry + roofH * (1 - Math.abs(cz) / (d / 2 + over)) : ry + roofH * 0.7;
    const ch = (c[2] ?? 1.0) + roofH * 0.35;
    const top = roofAt + ch;
    gb.box(0.55, top - ry, 0.55, { matrix: L(F, [cx, ry + (top - ry) / 2, cz]), color: o.chimneyColor || '#b06a4e', tex: TEX.blocks, tile: 0.7 });
    gb.box(0.72, 0.14, 0.72, { matrix: L(F, [cx, top, cz]), color: '#6e6660' });
    gb.box(0.3, 0.16, 0.3, { matrix: L(F, [cx, top + 0.14, cz]), color: '#4e4844' });
    const wp = new THREE.Vector3(cx, top + 0.3, cz).applyMatrix4(F);
    world.smokes.push({ x: wp.x, y: wp.y, z: wp.z });
  }
  // 老虎窗
  for (const u of o.dormers || []) {
    const dz = d / 2 + over;
    const zz = dz * 0.45;
    const yy = ry + roofH * (1 - zz / dz) - 0.2;
    const DF = L(F, [u, yy, zz]);
    gb.box(1.0, 0.95, 0.9, { matrix: L(DF, [0, 0.45, 0]), color: o.wall || '#e9dcc0', tex: o.wallTex ?? TEX.plaster });
    gb.gable(0.7 * 1.0 + 0.1, 1.25, 0.55, { matrix: L(DF, [0, 0.92, 0.05], [0, Math.PI / 2, 0]), color: roofCol, tex: roofTex, tile: 1.0, th: 0.1 });
    windowAt(world, L(DF, [0, 0.48, 0.45]), { w: 0.5, h: 0.5, frame: trim });
  }
  // 门廊
  if (o.porch) {
    const pw = o.porch.w ?? 2.4, pd = o.porch.d ?? 1.3;
    const PF = onFace(F, w, d, doorSide, doorU, 0);
    const ph = base + 2.0;
    gb.box(pw, 0.14, pd, { matrix: L(PF, [0, base - 0.05, pd / 2]), color: '#8c6a4e', tex: TEX.planksH, tile: 0.8 });
    for (const sx of [-1, 1]) gb.box(0.14, ph - base, 0.14, { matrix: L(PF, [sx * (pw / 2 - 0.12), base + (ph - base) / 2, pd - 0.1]), color: o.porch.post || '#6a4c38', tex: TEX.planksV });
    gb.box(pw + 0.4, 0.12, pd + 0.4, { matrix: L(PF, [0, ph + 0.05, pd / 2], [-0.22, 0, 0]), color: roofCol, tex: roofTex, tile: 1.0 });
    gb.box(pw + 0.1, 0.12, 0.12, { matrix: L(PF, [0, ph - 0.05, pd - 0.1]), color: o.porch.post || '#6a4c38' });
  }
  // 屋前花箱
  if (o.planters) {
    for (const u of o.planters) {
      const PF = onFace(F, w, d, doorSide, u, base);
      gb.box(0.8, 0.3, 0.35, { matrix: L(PF, [0, 0.0, 0.3]), color: '#8a5c40', tex: TEX.planksH, tile: 0.6 });
      for (let k = 0; k < 4; k++) gb.sphere(0.13, { matrix: L(PF, [-0.27 + k * 0.18, 0.22, 0.3]), color: k % 2 ? '#e86d6d' : '#f3c74a', detail: 0 });
    }
  }
  world.addBox(o.x, o.z, w / 2 + 0.3, d / 2 + 0.3, o.rot || 0);
  world.occluders.push({ x: o.x, z: o.z, hw: w / 2 + 0.2, hd: d / 2 + 0.2, r: 1.6, k: 0.42 });
  world.keepOut(o.x, o.z, Math.max(w, d) * 0.55);
  return { F, y0, top: ry + roofH };
}

// 鸟居
export function torii(world, { x, z, rot = 0, s = 1, y }) {
  const gb = world.gb;
  const y0 = y ?? world.heightAt(x, z);
  const F = frame(x, y0, z, rot);
  const red = '#c8452f', black = '#2b2422';
  const span = 1.45 * s, h = 3.1 * s;
  for (const sx of [-1, 1]) {
    gb.cyl(0.15 * s, 0.18 * s, h, 10, { matrix: L(F, [sx * span, h / 2, 0], [0, 0, sx * 0.03]), color: red });
    gb.cyl(0.22 * s, 0.24 * s, 0.3 * s, 10, { matrix: L(F, [sx * span, 0.12 * s, 0]), color: black });
    world.addCircle(...rotXZ(x, z, rot, sx * span, 0), 0.28 * s);
  }
  gb.box(span * 2 + 0.7 * s, 0.2 * s, 0.24 * s, { matrix: L(F, [0, h * 0.75, 0]), color: red });
  gb.box(span * 2 + 1.3 * s, 0.22 * s, 0.36 * s, { matrix: L(F, [0, h - 0.02, 0]), color: red });
  gb.box(span * 2 + 1.6 * s, 0.2 * s, 0.42 * s, { matrix: L(F, [0, h + 0.18 * s, 0]), color: black });
  for (const sx of [-1, 1]) gb.box(0.5 * s, 0.2 * s, 0.42 * s, { matrix: L(F, [sx * (span + 0.95 * s), h + 0.26 * s, 0], [0, 0, sx * 0.25]), color: black });
  gb.box(0.18 * s, h * 0.22, 0.2 * s, { matrix: L(F, [0, h * 0.86, 0]), color: red });
  // 注连绳
  gb.cyl(0.07 * s, 0.07 * s, span * 2 - 0.2, 8, { matrix: L(F, [0, h * 0.68, 0.05], [0, 0, Math.PI / 2]), color: '#e6d6a3' });
  for (let i = -2; i <= 2; i++) gb.box(0.08 * s, 0.32 * s, 0.02, { matrix: L(F, [i * 0.45 * s, h * 0.6, 0.1]), color: '#ffffff' });
}

// 神社本殿
export function shrine(world, { x, z, rot = 0, roof = '#8b6a3e', roofTex = TEX.thatch, y }) {
  const gb = world.gb;
  const y0 = y ?? world.heightAt(x, z);
  const F = frame(x, y0, z, rot);
  const wood = '#8a5a3c', dark = '#4b3428';
  // 石台
  gb.box(4.2, 0.7, 4.0, { matrix: L(F, [0, 0.1, 0]), color: '#a9a59c', tex: TEX.blocks, tile: 0.9 });
  gb.box(3.6, 0.3, 3.4, { matrix: L(F, [0, 0.6, 0]), color: '#b8b3a8', tex: TEX.blocks, tile: 0.9 });
  for (let i = 0; i < 3; i++) gb.box(1.6, 0.22, 0.45, { matrix: L(F, [0, 0.1 + i * 0.2, 2.2 - i * 0.18 + 0.4]), color: '#b4afa4', tex: TEX.blocks, tile: 0.8 });
  // 回廊
  gb.box(3.2, 0.14, 3.0, { matrix: L(F, [0, 0.95, 0]), color: '#9c7552', tex: TEX.planksH, tile: 0.7 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.16, 1.9, 0.16, { matrix: L(F, [sx * 1.45, 1.9, sz * 1.35]), color: dark, tex: TEX.planksV });
  // 主体
  gb.box(2.4, 1.7, 2.2, { matrix: L(F, [0, 1.85, -0.1]), color: wood, tex: TEX.planksV, tile: 0.8 });
  // 正面格子门
  for (const sx of [-0.55, 0.55]) {
    gb.box(1.0, 1.25, 0.06, { matrix: L(F, [sx, 1.75, 1.02]), color: '#f2ead8', tex: TEX.shoji, tile: 1.0 });
    world.glass.box(0.9, 1.1, 0.02, { matrix: L(F, [sx, 1.75, 0.98]), color: '#6d5a44' });
  }
  // 屋顶
  gb.gable(3.9, 4.0, 1.5, { matrix: L(F, [0, 2.75, -0.05]), color: roof, tex: roofTex, tile: 1.1, th: 0.4 });
  gb.poly([[[1.2, 2.7, 1.0], [1.2, 2.7, -1.2], [1.2, 4.0, -0.05]]], { matrix: F, color: dark, tex: TEX.planksV });
  gb.poly([[[-1.2, 2.7, -1.2], [-1.2, 2.7, 1.0], [-1.2, 4.0, -0.05]]], { matrix: F, color: dark, tex: TEX.planksV });
  gb.box(4.1, 0.22, 0.4, { matrix: L(F, [0, 4.3, -0.05]), color: shade(roof, 0.55), tex: TEX.planksH });
  for (let i = -1; i <= 1; i++) gb.cyl(0.1, 0.1, 0.55, 8, { matrix: L(F, [i * 1.1, 4.5, -0.05], [Math.PI / 2, 0, 0]), color: '#d9b04a' });
  for (const sx of [-1, 1]) {
    gb.box(0.12, 0.9, 0.1, { matrix: L(F, [sx * 1.95, 4.45, -0.05 + 0.25], [0.5, 0, 0]), color: dark });
    gb.box(0.12, 0.9, 0.1, { matrix: L(F, [sx * 1.95, 4.45, -0.05 - 0.25], [-0.5, 0, 0]), color: dark });
  }
  // 赛钱箱与铃
  gb.box(0.9, 0.5, 0.5, { matrix: L(F, [0, 1.25, 1.55]), color: '#6b4630', tex: TEX.planksH, tile: 0.5 });
  gb.cyl(0.03, 0.03, 1.3, 6, { matrix: L(F, [0, 2.0, 1.4]), color: '#e8d4a0' });
  gb.sphere(0.16, { matrix: L(F, [0, 2.7, 1.4]), color: '#e0b84e', detail: 1 });
  world.addBox(x, z, 2.2, 2.1, rot);
  world.occluders.push({ x, z, hw: 2.2, hd: 2.1, r: 1.8, k: 0.45 });
  world.keepOut(x, z, 3.2);
}

// 石灯笼（返回灯光位置）
export function stoneLantern(world, { x, z, s = 1, lit = true, intensity = 5, y }) {
  const gb = world.gb;
  const y0 = y ?? world.heightAt(x, z);
  const F = frame(x, y0, z, 0.3);
  const stone = '#9c9a92';
  gb.cyl(0.32 * s, 0.38 * s, 0.25 * s, 6, { matrix: L(F, [0, 0.12 * s, 0]), color: stone, tex: TEX.blocks });
  gb.cyl(0.12 * s, 0.15 * s, 0.75 * s, 8, { matrix: L(F, [0, 0.6 * s, 0]), color: stone });
  gb.box(0.5 * s, 0.14 * s, 0.5 * s, { matrix: L(F, [0, 1.02 * s, 0]), color: stone });
  gb.box(0.36 * s, 0.34 * s, 0.36 * s, { matrix: L(F, [0, 1.26 * s, 0]), color: stone });
  world.bulb.box(0.38 * s, 0.2 * s, 0.24 * s, { matrix: L(F, [0, 1.27 * s, 0]), color: [2.4, 1.6, 0.8] });
  world.bulb.box(0.24 * s, 0.2 * s, 0.38 * s, { matrix: L(F, [0, 1.27 * s, 0]), color: [2.4, 1.6, 0.8] });
  gb.cyl(0.02, 0.5 * s, 0.32 * s, 4, { matrix: L(F, [0, 1.58 * s, 0], [0, Math.PI / 4, 0]), color: stone });
  gb.sphere(0.08 * s, { matrix: L(F, [0, 1.8 * s, 0]), color: stone, detail: 0 });
  world.addCircle(x, z, 0.4 * s);
  world.keepOut(x, z, 0.6);
  if (lit) return world.addLamp({ x, y: y0 + 1.3 * s, z, intensity, distance: 6.5, glow: 1.8 * s, kind: 'stone' });
  return null;
}

// 木杆纸灯笼
export function postLantern(world, { x, z, rot = 0, intensity = 7, color = '#ffad5a', y }) {
  const gb = world.gb;
  const y0 = y ?? world.heightAt(x, z);
  const F = frame(x, y0, z, rot);
  gb.box(0.14, 2.4, 0.14, { matrix: L(F, [0, 1.2, 0]), color: '#4a3a30', tex: TEX.planksV });
  gb.box(0.7, 0.1, 0.1, { matrix: L(F, [0.28, 2.32, 0]), color: '#4a3a30' });
  gb.cyl(0.015, 0.015, 0.22, 4, { matrix: L(F, [0.55, 2.18, 0]), color: '#222' });
  world.bulb.cyl(0.2, 0.2, 0.42, 10, { matrix: L(F, [0.55, 1.86, 0]), color: [2.6, 1.45, 0.65] });
  gb.cyl(0.13, 0.13, 0.06, 10, { matrix: L(F, [0.55, 2.08, 0]), color: '#2c2522' });
  gb.cyl(0.13, 0.13, 0.06, 10, { matrix: L(F, [0.55, 1.64, 0]), color: '#2c2522' });
  world.addCircle(x, z, 0.25);
  world.keepOut(x, z, 0.5);
  const p = new THREE.Vector3(0.55, 1.86, 0).applyMatrix4(F);
  return world.addLamp({ x: p.x, y: p.y, z: p.z, color, intensity, distance: 7, glow: 2.2, kind: 'paper' });
}

// 拱形木桥：沿局部 x 轴跨越，注册可行走桥面
export function archBridge(world, { x, z, rot = 0, len = 5, w = 1.6, arch = 0.6, y, rail = '#b8432e', deck = '#9a7354' }) {
  const gb = world.gb;
  const y0 = y ?? Math.max(world.heightAt(...rotXZ(x, z, rot, -len / 2, 0)), world.heightAt(...rotXZ(x, z, rot, len / 2, 0)));
  const F = frame(x, y0, z, rot);
  const n = Math.ceil(len / 0.32);
  const hAt = (lx) => arch * (1 - Math.pow((2 * lx) / len, 2));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n);
    const slope = (-8 * arch * lx) / (len * len);
    gb.box(len / n - 0.03, 0.1, w, { matrix: L(F, [lx, hAt(lx) + 0.05, 0], [0, 0, Math.atan(slope)]), color: deck, tex: TEX.planksH, tile: 0.6 });
  }
  // 桥梁与桥墩
  for (const sz of [-1, 1]) {
    const pts = 8;
    for (let i = 0; i <= pts; i++) {
      const lx = -len / 2 + (len * i) / pts;
      gb.box(0.12, 0.75, 0.12, { matrix: L(F, [lx, hAt(lx) + 0.4, sz * (w / 2 - 0.05)]), color: rail });
      if (i < pts) {
        const lx2 = -len / 2 + (len * (i + 1)) / pts;
        const mx = (lx + lx2) / 2, my = (hAt(lx) + hAt(lx2)) / 2;
        const ang = Math.atan2(hAt(lx2) - hAt(lx), lx2 - lx);
        gb.box(len / pts + 0.05, 0.09, 0.1, { matrix: L(F, [mx, my + 0.76, sz * (w / 2 - 0.05)], [0, 0, ang]), color: rail });
        gb.box(len / pts, 0.06, 0.07, { matrix: L(F, [mx, my + 0.42, sz * (w / 2 - 0.05)], [0, 0, ang]), color: rail });
      }
    }
    gb.box(0.2, 1.2, 0.2, { matrix: L(F, [-len * 0.3, -0.3, sz * (w / 2 - 0.2)]), color: '#5b4a3c' });
    gb.box(0.2, 1.2, 0.2, { matrix: L(F, [len * 0.3, -0.3, sz * (w / 2 - 0.2)]), color: '#5b4a3c' });
  }
  world.addDeck(x, z, len / 2, w / 2 - 0.12, rot, (lx) => y0 + hAt(lx) + 0.1);
  world.keepOut(x, z, len * 0.5);
  return { y0 };
}

// 平直/微垂木桥（山间）
export function plankBridge(world, { x, z, rot = 0, len = 6, w = 1.4, y0, y1, sag = 0.35 }) {
  const gb = world.gb;
  const F = frame(x, 0, z, rot);
  const n = Math.ceil(len / 0.28);
  const hAt = (lx) => { const t = (lx + len / 2) / len; return y0 + (y1 - y0) * t - sag * Math.sin(Math.PI * t); };
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n);
    const slope = (hAt(lx + 0.05) - hAt(lx - 0.05)) / 0.1;
    gb.box(len / n - 0.04, 0.09, w * (0.95 + ((i * 37) % 7) * 0.012), { matrix: L(F, [lx, hAt(lx), 0], [((i * 13) % 5 - 2) * 0.01, 0, Math.atan(slope)]), color: i % 3 ? '#9b7a58' : '#8a6a4c', tex: TEX.planksH, tile: 0.5 });
  }
  for (const sz of [-1, 1]) {
    for (const ex of [-1, 1]) {
      const lx = ex * len / 2;
      gb.box(0.16, 1.5, 0.16, { matrix: L(F, [lx, hAt(lx) + 0.45, sz * (w / 2 + 0.05)]), color: '#6a5039', tex: TEX.planksV });
    }
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const a = -len / 2 + (len * i) / segs, b = -len / 2 + (len * (i + 1)) / segs;
      const ha = hAt(a) + 0.9 + 0.12 * Math.sin(Math.PI * (i / segs)), hb = hAt(b) + 0.9 + 0.12 * Math.sin(Math.PI * ((i + 1) / segs));
      gb.box(b - a + 0.02, 0.04, 0.04, { matrix: L(F, [(a + b) / 2, (ha + hb) / 2, sz * (w / 2 + 0.05)], [0, 0, Math.atan2(hb - ha, b - a)]), color: '#d8c7a0' });
      if (i % 2 === 0) gb.box(0.03, 0.8, 0.03, { matrix: L(F, [a, (hAt(a) + ha) / 2, sz * (w / 2 + 0.05)]), color: '#d8c7a0' });
    }
  }
  world.addDeck(x, z, len / 2 + 0.2, w / 2 - 0.1, rot, (lx) => hAt(Math.max(-len / 2, Math.min(len / 2, lx))) + 0.05);
}

// 栅栏：从 a 到 b
export function fence(world, a, b, { color = '#e6dcc6', picket = true, h = 0.75, collide = true } = {}) {
  const gb = world.gb;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const rot = -Math.atan2(dz, dx);
  const n = Math.max(1, Math.round(len / 1.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + dx * t, z = a[1] + dz * t;
    const y = world.heightAt(x, z);
    gb.box(0.12, h + 0.15, 0.12, { pos: [x, y + (h + 0.15) / 2 - 0.05, z], rot: [0, rot, 0], color: shade(color, 0.85) });
  }
  const ym = (world.heightAt(...a) + world.heightAt(...b)) / 2;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const ang = Math.atan2(world.heightAt(...b) - world.heightAt(...a), len);
  for (const ry of [h * 0.35, h * 0.75]) gb.box(len, 0.06, 0.05, { pos: [mx, ym + ry, mz], rot: [0, rot, ang], color });
  if (picket) {
    const m = Math.floor(len / 0.24);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m, x = a[0] + dx * t, z = a[1] + dz * t;
      const y = world.heightAt(x, z);
      gb.box(0.08, h * 0.9, 0.03, { pos: [x, y + h * 0.45, z], rot: [0, rot, 0], color });
    }
  }
  if (collide) world.addBox(mx, mz, len / 2, 0.12, -rot);
}

// 路灯 + 灯串
export function lampPost(world, { x, z, h = 2.6, intensity = 6, color = '#ffb35a' }) {
  const gb = world.gb;
  const y0 = world.heightAt(x, z);
  gb.cyl(0.07, 0.1, h, 8, { pos: [x, y0 + h / 2, z], color: '#3a3533' });
  gb.cyl(0.16, 0.2, 0.2, 8, { pos: [x, y0 + 0.1, z], color: '#3a3533' });
  world.bulb.sphere(0.17, { pos: [x, y0 + h + 0.15, z], color: [2.5, 1.7, 0.85], detail: 1 });
  gb.cyl(0.02, 0.2, 0.16, 8, { pos: [x, y0 + h + 0.38, z], color: '#3a3533' });
  world.addCircle(x, z, 0.22);
  world.keepOut(x, z, 0.5);
  return world.addLamp({ x, y: y0 + h + 0.15, z, color, intensity, distance: 7.5, glow: 2.0, kind: 'street' });
}

export function stringLights(world, a, b, { sag = 0.45, n = 9 } = {}) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t));
  }
  for (let i = 0; i < 16; i++) {
    const p = pts[i], q = pts[i + 1];
    const d = new THREE.Vector3().subVectors(q, p);
    const m = new THREE.Matrix4().compose(p.clone().add(q).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), new THREE.Vector3(1, 1, 1));
    world.gb.cyl(0.012, 0.012, d.length(), 4, { matrix: m, color: '#2e2a28' });
  }
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * Math.sin(Math.PI * t) - 0.08;
    const hue = [[2.6, 1.6, 0.7], [2.4, 1.2, 0.8], [2.6, 2.0, 1.0]][i % 3];
    world.bulb.sphere(0.07, { pos: [x, y, z], color: hue, detail: 0 });
  }
}

export function bench(world, { x, z, rot = 0 }) {
  const gb = world.gb;
  const F = frame(x, world.heightAt(x, z), z, rot);
  for (let i = 0; i < 3; i++) gb.box(1.5, 0.05, 0.12, { matrix: L(F, [0, 0.45, -0.15 + i * 0.15]), color: '#9a6a46', tex: TEX.planksH });
  for (let i = 0; i < 2; i++) gb.box(1.5, 0.12, 0.05, { matrix: L(F, [0, 0.65 + i * 0.16, -0.26], [-0.15, 0, 0]), color: '#9a6a46', tex: TEX.planksH });
  for (const sx of [-0.65, 0.65]) gb.box(0.07, 0.48, 0.4, { matrix: L(F, [sx, 0.22, -0.02]), color: '#3a3533' });
  world.addBox(x, z, 0.8, 0.3, rot);
}

// 木推车摊位（遮阳棚、货箱、水果）
export function cartStall(world, { x, z, rot = 0, awning = '#d9654a' }) {
  const gb = world.gb;
  const F = frame(x, world.heightAt(x, z), z, rot);
  gb.box(2.2, 0.16, 1.2, { matrix: L(F, [0, 0.72, 0]), color: '#94673f', tex: TEX.planksH, tile: 0.7 });
  for (const sz of [-1, 1]) gb.box(2.2, 0.4, 0.07, { matrix: L(F, [0, 0.95, sz * 0.58]), color: '#a0704a', tex: TEX.planksH, tile: 0.6 });
  for (const sx of [-1, 1]) gb.box(0.07, 0.4, 1.2, { matrix: L(F, [sx * 1.08, 0.95, 0]), color: '#a0704a', tex: TEX.planksH, tile: 0.6 });
  for (const sz of [-1, 1]) {
    gb.cyl(0.4, 0.4, 0.08, 14, { matrix: L(F, [0.3, 0.4, sz * 0.68], [Math.PI / 2, 0, 0]), color: '#6a4a32' });
    gb.cyl(0.12, 0.12, 0.12, 8, { matrix: L(F, [0.3, 0.4, sz * 0.7], [Math.PI / 2, 0, 0]), color: '#3e2d22' });
    for (let k = 0; k < 4; k++) gb.box(0.05, 0.72, 0.03, { matrix: L(F, [0.3, 0.4, sz * 0.72], [0, 0, (k * Math.PI) / 4]), color: '#5a3f2b' });
  }
  for (const sz of [-1, 1]) gb.box(1.0, 0.06, 0.06, { matrix: L(F, [-1.55, 0.6, sz * 0.4], [0, 0, 0.25]), color: '#7a5638' });
  gb.box(0.06, 0.65, 0.06, { matrix: L(F, [-0.9, 0.35, 0]), color: '#7a5638' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.07, 1.5, 0.07, { matrix: L(F, [sx * 1.0, 1.55, sz * 0.5]), color: '#6a4c35' });
  gb.gable(2.6, 1.7, 0.45, { matrix: L(F, [0, 2.28, 0]), color: awning, tex: TEX.stripes, tile: 1.4, th: 0.05 });
  for (const sz of [-1, 1]) for (let k = 0; k < 7; k++) gb.box(0.36, 0.18, 0.02, { matrix: L(F, [-1.08 + k * 0.36, 2.2, sz * 0.86]), color: k % 2 ? '#f4ead8' : awning, tex: TEX.cloth });
  const fruit = ['#e8553f', '#f2a33a', '#9ccf4a', '#f2d34a', '#c9404f'];
  for (let i = 0; i < 3; i++) {
    gb.box(0.6, 0.28, 0.5, { matrix: L(F, [-0.7 + i * 0.7, 0.94, 0]), color: '#c49a68', tex: TEX.planksH, tile: 0.4 });
    for (let k = 0; k < 6; k++) gb.sphere(0.09, { matrix: L(F, [-0.88 + i * 0.7 + (k % 3) * 0.17, 1.12, -0.1 + Math.floor(k / 3) * 0.2]), color: fruit[(i * 2 + k) % fruit.length], detail: 0 });
  }
  world.bulb.sphere(0.1, { matrix: L(F, [0.95, 1.9, 0.5]), color: [2.6, 1.7, 0.8], detail: 0 });
  world.addBox(x, z, 1.4, 0.8, rot);
  world.occluders.push({ x, z, hw: 1.2, hd: 0.7, r: 1.0, k: 0.3 });
  world.keepOut(x, z, 1.8);
  const p = new THREE.Vector3(0.95, 1.9, 0.5).applyMatrix4(F);
  return p;
}

export function well(world, { x, z }) {
  const gb = world.gb;
  const y0 = world.heightAt(x, z);
  const F = frame(x, y0, z, 0.4);
  gb.cyl(0.62, 0.66, 0.75, 14, { matrix: L(F, [0, 0.37, 0]), color: '#a7a39b', tex: TEX.cobble, tile: 0.8 });
  gb.cyl(0.5, 0.5, 0.05, 14, { matrix: L(F, [0, 0.7, 0]), color: '#2f4c5c' });
  for (const sx of [-1, 1]) gb.box(0.1, 1.6, 0.1, { matrix: L(F, [sx * 0.62, 1.05, 0]), color: '#6a4c38' });
  gb.gable(1.7, 1.3, 0.5, { matrix: L(F, [0, 1.85, 0], [0, Math.PI / 2, 0]), color: '#7a5a42', tex: TEX.shingles, tile: 0.9, th: 0.08 });
  gb.cyl(0.06, 0.06, 1.2, 6, { matrix: L(F, [0, 1.55, 0], [0, 0, Math.PI / 2]), color: '#5a4030' });
  gb.cyl(0.14, 0.12, 0.2, 8, { matrix: L(F, [0, 1.1, 0]), color: '#8a6040' });
  world.addCircle(x, z, 0.8);
  world.occluders.push({ x, z, r: 1.0, k: 0.3 });
  world.keepOut(x, z, 1.2);
}

export function pavilion(world, { x, z, rot = 0, roof = '#7c4a3a' }) {
  const gb = world.gb;
  const y0 = world.heightAt(x, z);
  const F = frame(x, y0, z, rot);
  gb.box(3.2, 0.35, 3.2, { matrix: L(F, [0, 0.1, 0]), color: '#a7a297', tex: TEX.blocks });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl(0.11, 0.12, 2.3, 8, { matrix: L(F, [sx * 1.3, 1.4, sz * 1.3]), color: '#8a3a2c' });
  gb.hip(3.9, 3.9, 1.2, { matrix: L(F, [0, 2.55, 0]), color: roof, tex: TEX.kawara, tile: 0.9, ridge: 0.0, th: 0.2 });
  gb.sphere(0.16, { matrix: L(F, [0, 3.8, 0]), color: '#d8b04a', detail: 0 });
  for (const sx of [-1, 1]) gb.box(2.0, 0.08, 0.4, { matrix: L(F, [0, 0.62, sx * 1.05]), color: '#946a48', tex: TEX.planksH });
  for (const sx of [-1, 1]) for (const k of [-0.8, 0.8]) gb.box(0.08, 0.35, 0.3, { matrix: L(F, [k, 0.42, sx * 1.05]), color: '#5a4030' });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) world.addCircle(...rotXZ(x, z, rot, sx * 1.3, sz * 1.3), 0.22);
  world.occluders.push({ x, z, hw: 1.6, hd: 1.6, r: 1.2, k: 0.3 });
  world.keepOut(x, z, 2.4);
}

export function signPost(world, { x, z, rot = 0 }) {
  const gb = world.gb;
  const F = frame(x, world.heightAt(x, z), z, rot);
  gb.box(0.1, 1.3, 0.1, { matrix: L(F, [0, 0.65, 0]), color: '#6a4c38', tex: TEX.planksV });
  gb.box(0.8, 0.22, 0.05, { matrix: L(F, [0.25, 1.1, 0], [0, 0, 0.05]), color: '#c9a77a', tex: TEX.planksH });
  gb.box(0.7, 0.2, 0.05, { matrix: L(F, [-0.2, 0.82, 0.02], [0, 0.4, -0.06]), color: '#bf9b70', tex: TEX.planksH });
  world.addCircle(x, z, 0.15);
}

export function stoneMarker(world, { x, z, h = 0.7 }) {
  const gb = world.gb;
  const y0 = world.heightAt(x, z);
  gb.box(0.26, h, 0.22, { pos: [x, y0 + h / 2, z], rot: [0, x * 3.1, 0], color: '#a5a196', tex: TEX.blocks, tile: 0.6 });
  gb.cyl(0.02, 0.2, 0.14, 4, { pos: [x, y0 + h + 0.07, z], rot: [0, x * 3.1 + 0.78, 0], color: '#8f8b82' });
  world.addCircle(x, z, 0.2);
}

// 地藏/小石像
export function statue(world, { x, z, rot = 0, bib = '#c8452f' }) {
  const gb = world.gb;
  const F = frame(x, world.heightAt(x, z), z, rot);
  gb.box(0.5, 0.2, 0.45, { matrix: L(F, [0, 0.1, 0]), color: '#9d998f', tex: TEX.blocks });
  gb.cyl(0.18, 0.22, 0.5, 8, { matrix: L(F, [0, 0.45, 0]), color: '#a8a49a' });
  gb.sphere(0.16, { matrix: L(F, [0, 0.82, 0]), color: '#aaa69c', detail: 1 });
  gb.cyl(0.19, 0.24, 0.16, 8, { matrix: L(F, [0, 0.6, 0.02]), color: bib, tex: TEX.cloth });
  world.addCircle(x, z, 0.3);
}

export function boat(world, { x, z, rot = 0 }) {
  const gb = new GeoBuilder(77);
  const hull = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  gb.add(hull, { matrix: mat({ pos: [0, 0.28, 0], scale: [1.5, 0.42, 0.62] }), color: '#8a5a3c', faceJitter: false });
  const rim = new THREE.TorusGeometry(1, 0.05, 6, 20);
  gb.add(rim, { matrix: mat({ pos: [0, 0.29, 0], rot: [Math.PI / 2, 0, 0], scale: [1.5, 0.62, 1] }), color: '#5a3a28', faceJitter: false });
  gb.box(0.25, 0.06, 1.1, { pos: [0.2, 0.22, 0], color: '#b08a62', tex: TEX.planksH });
  gb.box(0.25, 0.06, 1.0, { pos: [-0.6, 0.22, 0], color: '#b08a62', tex: TEX.planksH });
  gb.cyl(0.03, 0.03, 1.6, 5, { pos: [0.1, 0.38, 0.3], rot: [0, 0, 1.3], color: '#c9a070' });
  const g = gb.build();
  const m = new THREE.Mesh(g, world.mats.building);
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, world.waterLevel - 0.1, z);
  m.rotation.y = rot;
  m.name = 'boat';
  world.group.add(m);
  const ph = world.rng.range(0, 6);
  world.updaters.push((t) => {
    m.position.y = world.waterLevel - 0.12 + Math.sin(t * 1.3 + ph) * 0.04;
    m.rotation.z = Math.sin(t * 1.1 + ph) * 0.04;
    m.rotation.x = Math.sin(t * 0.9 + ph * 2) * 0.03;
  });
  world.addBox(x, z, 1.6, 0.7, rot);
  return m;
}

// ---------- 工具 ----------
export function rotXZ(x, z, rot, lx, lz) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}
export function minGround(world, x, z, w, d, rot) {
  let m = Infinity;
  for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) m = Math.min(m, world.heightAt(...rotXZ(x, z, rot, a, b)));
  return m;
}
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}
