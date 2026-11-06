// 水面：基于 Lambert 的透明水体（可接收阴影），着色器内完成深浅色、流动笔触高光、岸线泡沫、
// 视角相关闪光、雨滴涟漪、角色涟漪与灯光倒影。高度/流向数据来自地形 DataTexture。
import * as THREE from 'three';
import { G } from '../core/materials.js';
import { NOISE_GLSL } from '../core/glsl.js';

export const WATER_U = {
  uHeightTex: { value: null },
  uTB: { value: new THREE.Vector4() },
  uWaterLevel: { value: 0 },
  uShallow: { value: new THREE.Color('#5fa7a8') },
  uDeep: { value: new THREE.Color('#22566e') },
  uFoam: { value: new THREE.Color('#eaf6f2') },
  uFleckA: { value: new THREE.Color('#ffffff') },
  uFleckB: { value: new THREE.Color('#9fe0e0') },
  uGlintCol: { value: new THREE.Color('#fff4d8') },
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
  uViewDir: { value: new THREE.Vector3(0, -1, 0) },
  uToCam: { value: new THREE.Vector2(0, 1) },
  uTanElev: { value: 1 },
  uFlowSpeed: { value: 0.6 },
  uRain: { value: 0 },
  uFleckAmt: { value: 1 },
  uRipples: { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, -100, 0)) },
  uLamps: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLampCol: { value: new THREE.Color('#ffb860') },
  uLampOn: { value: 0 },
  uSkyCol: { value: new THREE.Color('#ffffff') },
  uSkyAmt: { value: 0.15 },
};

let waterMat = null;
export function waterMaterial() {
  if (waterMat) return waterMat;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G, WATER_U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime; uniform float uWind;
uniform sampler2D uHeightTex; uniform vec4 uTB; uniform float uWaterLevel;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uFleckA; uniform vec3 uFleckB; uniform vec3 uGlintCol;
uniform vec3 uSunDir; uniform vec3 uViewDir; uniform vec2 uToCam; uniform float uTanElev;
uniform float uFlowSpeed; uniform float uRain; uniform float uFleckAmt; uniform float uSnow;
uniform vec4 uRipples[10]; uniform vec4 uLamps[8]; uniform vec3 uLampCol; uniform float uLampOn; uniform vec3 uSkyCol; uniform float uSkyAmt;
${NOISE_GLSL}
float dashes(vec2 q, vec2 cell, float len, float wid, float seed, out float hid) {
  vec2 c = floor(q / cell); vec2 f = fract(q / cell) * cell;
  float h = hash12(c + seed);
  hid = hash12(c + seed + 7.1);
  vec2 o = (hash22(c + seed * 1.3) * 0.6 + 0.2) * cell;
  vec2 d = f - o;
  float e = (d.x * d.x) / (len * len) + (d.y * d.y) / (wid * wid);
  return (1.0 - smoothstep(0.55, 1.0, e)) * step(0.35, h);
}
vec3 waterAdd = vec3(0.0);
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 tuv = (vWPos.xz - uTB.xy) * uTB.zw;
  vec4 hd = texture2D(uHeightTex, tuv);
  float depth = uWaterLevel - hd.r;
  if (depth < -0.01) discard;
  vec2 flow = hd.gb;
  float fmag = length(flow);
  vec2 fdir = fmag > 0.05 ? flow / fmag : vec2(1.0, 0.0);
  float spd = mix(0.08, 1.0, clamp(fmag, 0.0, 1.0)) * uFlowSpeed;
  vec2 p = vWPos.xz;
  vec2 q = vec2(dot(p, fdir), dot(p, vec2(-fdir.y, fdir.x)));
  vec2 qf = q - vec2(uTime * spd, 0.0);
  float dk = smoothstep(0.0, 1.3, depth);
  vec3 base = mix(uShallow, uDeep, dk);
  float n1 = vnoise(qf * vec2(0.5, 1.2));
  float n2 = vnoise(qf * vec2(1.4, 3.2) + 4.0);
  base *= 0.95 + 0.07 * n1 + 0.025 * n2;
  base = mix(base, uSkyCol, uSkyAmt * (0.55 + 0.45 * n1));
  // 岸线泡沫
  float fn = vnoise(qf * vec2(2.0, 4.0) + uTime * 0.25);
  float shore = 1.0 - smoothstep(0.0, 0.16 + fn * 0.14, depth);
  float foam = smoothstep(0.35, 0.75, shore + fn * 0.35) * shore;
  float foam2 = (1.0 - smoothstep(0.03, 0.06, abs(depth - 0.2 - 0.06 * sin(uTime * 1.3 + q.x * 1.7)))) * step(0.5, vnoise(qf * vec2(1.5, 5.0))) * 0.6;
  // 视角相关闪光
  vec3 N = normalize(vec3((n2 - 0.5) * 0.5, 1.0, (vnoise(qf * 2.3 + 9.0) - 0.5) * 0.5));
  vec3 R = reflect(uViewDir, N);
  float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 10.0);
  // 流动笔触高光
  float hid1, hid2, hid3;
  float d1 = dashes(qf, vec2(1.9, 0.62), 0.62, 0.075, 1.0, hid1);
  float d2 = dashes(qf * 1.3 + vec2(0.0, 3.0), vec2(1.6, 0.55), 0.5, 0.065, 5.0, hid2);
  float d3 = dashes(qf * 0.8 + vec2(13.0, 0.5), vec2(2.4, 0.8), 0.8, 0.09, 9.0, hid3);
  float flick1 = 0.5 + 0.5 * sin(uTime * 2.2 + hid1 * 40.0);
  float flick2 = 0.5 + 0.5 * sin(uTime * 2.9 + hid2 * 30.0);
  float flick3 = 0.5 + 0.5 * sin(uTime * 1.7 + hid3 * 50.0);
  vec3 fc1 = mix(uFleckA, uFleckB, step(0.5, hid1));
  vec3 fc2 = mix(uFleckB, uFleckA, step(0.6, hid2));
  vec3 fc3 = mix(uFleckA, uGlintCol, step(0.4, hid3));
  float fleckVis = smoothstep(0.05, 0.4, depth) * uFleckAmt * (1.0 - uSnow * 0.3);
  vec3 flecks = (fc1 * d1 * flick1 + fc2 * d2 * flick2 * 0.8 + fc3 * d3 * flick3 * 0.9) * fleckVis;
  waterAdd += flecks * (0.22 + 1.1 * glint);
  base += uGlintCol * glint * 0.18;
  // 雨滴涟漪
  if (uRain > 0.01) {
    for (int L = 0; L < 2; L++) {
      vec2 rp = p * (1.6 + float(L) * 0.7) + float(L) * 3.7;
      vec2 c = floor(rp); vec2 f = fract(rp);
      float h = hash12(c + float(L) * 11.0);
      float t = fract(uTime * (0.9 + h * 0.6) + h);
      vec2 o = hash22(c + 2.0) * 0.6 + 0.2;
      float d = length(f - o);
      float ring = (1.0 - smoothstep(0.0, 0.035, abs(d - t * 0.42))) * (1.0 - t) * step(0.25, h);
      waterAdd += uFoam * ring * 0.35 * uRain;
      foam += ring * 0.4 * uRain;
    }
  }
  // 角色/互动涟漪
  for (int i = 0; i < 10; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age > 0.0 && age < 2.6) {
      float d = distance(p, r.xy);
      float k = 1.0 - age / 2.6;
      float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - age * 0.85))) + 0.6 * (1.0 - smoothstep(0.0, 0.06, abs(d - age * 0.55)));
      foam += ring * k * r.w;
      waterAdd += uFoam * ring * k * r.w * 0.25;
    }
  }
  // 灯光倒影（沿朝向相机方向拉长）
  if (uLampOn > 0.01) {
    for (int i = 0; i < 8; i++) {
      vec4 L = uLamps[i];
      if (L.w <= 0.0) continue;
      float hh = max(L.y - uWaterLevel, 0.1);
      vec2 c = L.xz + uToCam * hh / max(uTanElev, 0.2);
      vec2 dp = p - c;
      float a = dot(dp, uToCam), b = dot(dp, vec2(-uToCam.y, uToCam.x));
      float e = (a * a) / 2.2 + (b * b) / 0.09;
      float gl = exp(-e) * L.w;
      float br = 0.35 + 0.9 * (d1 + d2 + d3) + 0.3 * n2;
      waterAdd += uLampCol * gl * br * uLampOn * 0.9;
    }
  }
  foam = clamp(foam + foam2 * (1.0 - dk), 0.0, 1.0);
  diffuseColor.rgb = mix(base, uFoam, foam * 0.85);
  diffuseColor.a = clamp(mix(0.62, 0.94, smoothstep(0.0, 0.9, depth)) + foam * 0.4, 0.0, 1.0);
}
`)
      .replace('#include <opaque_fragment>', 'outgoingLight += waterAdd;\n#include <opaque_fragment>');
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'water-v1';
  mat.userData.shared = true;
  waterMat = mat;
  return mat;
}

// 生成高度+流向数据纹理，并创建水面网格与边缘水体剖面
export function buildWater(world) {
  const sp = world.spec;
  const b = world.bounds;
  const W = sp.waterTexRes ?? 256;
  const aspect = (b.z1 - b.z0) / (b.x1 - b.x0);
  const NX = W, NZ = Math.max(32, Math.round(W * aspect));
  const data = new Uint16Array(NX * NZ * 4);
  const toH = THREE.DataUtils.toHalfFloat;
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = b.x0 + (i + 0.5) / NX * (b.x1 - b.x0);
    const z = b.z0 + (j + 0.5) / NZ * (b.z1 - b.z0);
    let h = world.heightAt(x, z);
    if (!world.inside(x, z, 0.02)) h = 50;
    for (const s of world.waterSpots) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) h = Math.max(h, world.waterLevel + s.h);
    }
    const fl = sp.flow ? sp.flow(x, z, world) : [0, 0];
    const k = (j * NX + i) * 4;
    data[k] = toH(h); data[k + 1] = toH(fl[0]); data[k + 2] = toH(fl[1]); data[k + 3] = toH(1);
    if (world.waterLevel - h > -0.05) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  }
  const tex = new THREE.DataTexture(data, NX, NZ, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  world.extraTextures = [...(world.extraTextures || []), tex];
  world.waterTex = tex;
  if (!isFinite(minx)) return null;
  const pad = 0.6;
  minx = Math.max(b.x0, minx - pad); maxx = Math.min(b.x1, maxx + pad);
  minz = Math.max(b.z0, minz - pad); maxz = Math.min(b.z1, maxz + pad);
  const geo = new THREE.PlaneGeometry(maxx - minx, maxz - minz, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minx + maxx) / 2, world.waterLevel, (minz + maxz) / 2);
  const mesh = new THREE.Mesh(geo, waterMaterial());
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  world.group.add(mesh);
  world.water = { mesh, texBounds: new THREE.Vector4(b.x0, b.z0, 1 / (b.x1 - b.x0), 1 / (b.z1 - b.z0)) };
  buildWaterSides(world);
  return mesh;
}

// 河道穿出地块边缘时，补出可见的水体横截面
function buildWaterSides(world) {
  const loop = world.skirtLoop;
  if (!loop) return;
  const wl = world.waterLevel;
  const P = [], C = [];
  const top = new THREE.Color(world.spec.waterSide?.top || '#5aa6b0');
  const bot = new THREE.Color(world.spec.waterSide?.bottom || '#1d4a63');
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], c = loop[(i + 1) % loop.length];
    if (a[1] >= wl - 0.01 && c[1] >= wl - 0.01) continue;
    const ya = Math.min(a[1], wl), yc = Math.min(c[1], wl);
    const quad = [[a[0], wl, a[2]], [c[0], wl, c[2]], [c[0], yc, c[2]], [a[0], ya, a[2]]];
    const cols = [top, top, bot, bot];
    for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...quad[k]); C.push(cols[k].r, cols[k].g, cols[k].b); }
  }
  if (!P.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, sideMat());
  m.name = 'waterSide';
  world.group.add(m);
}

let _side = null;
function sideMat() {
  if (_side) return _side;
  _side = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  _side.userData.shared = true;
  return _side;
}
