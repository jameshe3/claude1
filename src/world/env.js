// 环境系统：每张地图的默认光照 + 天气/季节叠加，平滑过渡到灯光、雾、背景、水色、泛光与调色参数。
import * as THREE from 'three';
import { NOISE_GLSL } from '../core/glsl.js';

const isCol = (v) => typeof v === 'string' && v.startsWith('#');

// 将嵌套配置拍平成 key -> number | Color | Vector3
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + '.' + k : k;
    if (isCol(v)) out[key] = new THREE.Color(v);
    else if (v && v.isColor) out[key] = v.clone();
    else if (Array.isArray(v) && v.length === 3 && typeof v[0] === 'number') out[key] = new THREE.Vector3(...v);
    else if (typeof v === 'number') out[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}

const GREY = new THREE.Color('#8f98a3');
const SNOWSKY = new THREE.Color('#dfe6ee');

export function targetEnv(base, weather, season) {
  const e = {};
  for (const [k, v] of Object.entries(base)) e[k] = typeof v === 'number' ? v : v.clone();
  const night = e['night'] ?? 0;
  // 季节色偏
  if (season === 'autumn') { e['sun.color'].lerp(new THREE.Color('#ffc07a'), 0.25); e['grade.sat'] *= 1.04; }
  if (season === 'winter') { e['sun.color'].lerp(new THREE.Color('#dfe9ff'), 0.35); e['hemi.sky'].lerp(new THREE.Color('#cfdcec'), 0.25 * (1 - night)); e['grade.sat'] *= 0.92; }
  if (season === 'spring') { e['grade.sat'] *= 1.03; }
  if (season !== 'summer') e['fireflies'] *= 0.35;
  if (weather === 'rain') {
    e['sun.intensity'] *= 0.28;
    e['hemi.intensity'] *= 0.85;
    e['hemi.sky'].lerp(GREY, 0.55);
    e['hemi.ground'].lerp(GREY, 0.3);
    for (const k of ['bg.top', 'bg.bottom', 'bg.glow']) e[k].lerp(GREY, night > 0.5 ? 0.25 : 0.6).multiplyScalar(night > 0.5 ? 0.9 : 0.85);
    e['fog.color'].lerp(GREY, 0.5);
    e['fog.density'] = (e['fog.density'] || 0) + 0.45;
    e['grade.sat'] *= 0.78; e['grade.contrast'] *= 0.95;
    e['water.fleckAmt'] *= 0.45;
    e['lamps'] = Math.max(e['lamps'], 0.55);
    e['windows'] = Math.max(e['windows'], 0.45);
    e['fireflies'] = 0;
    e['mist'] = Math.min(1, (e['mist'] || 0) + 0.3);
    e['wind'] = 1.9;
    e['bloom.strength'] *= 0.85;
    e['rain'] = 1; e['snowfall'] = 0; e['wet'] = 1;
  } else if (weather === 'snow') {
    e['sun.intensity'] *= 0.55;
    e['hemi.sky'].lerp(SNOWSKY, 0.45 * (1 - night * 0.6));
    e['hemi.intensity'] *= 1.1;
    for (const k of ['bg.top', 'bg.bottom', 'bg.glow']) e[k].lerp(night > 0.5 ? new THREE.Color('#33405a') : SNOWSKY, 0.5);
    e['fog.color'].lerp(night > 0.5 ? new THREE.Color('#3c4a63') : SNOWSKY, 0.5);
    e['fog.density'] = (e['fog.density'] || 0) + 0.35;
    e['grade.sat'] *= 0.85;
    e['fireflies'] = 0;
    e['lamps'] = Math.max(e['lamps'], 0.35);
    e['windows'] = Math.max(e['windows'], 0.3);
    e['wind'] = 0.6;
    e['rain'] = 0; e['snowfall'] = 1; e['wet'] = 0;
    e['water.fleckAmt'] *= 0.7;
  } else {
    e['rain'] = 0; e['snowfall'] = 0; e['wet'] = 0;
  }
  return e;
}

export function lerpEnv(cur, tgt, k) {
  for (const [key, v] of Object.entries(tgt)) {
    const c = cur[key];
    if (c === undefined) { cur[key] = typeof v === 'number' ? v : v.clone(); continue; }
    if (typeof v === 'number') cur[key] = c + (v - c) * k;
    else if (v.isColor) c.lerp(v, k);
    else c.lerp(v, k);
  }
}

export function cloneEnv(e) {
  const o = {};
  for (const [k, v] of Object.entries(e)) o[k] = typeof v === 'number' ? v : v.clone();
  return o;
}

// 全屏背景：渐变 + 地平光 + 星空/月亮 + 云海
export function createBackground() {
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uGlowPos: { value: new THREE.Vector2(0.3, 0.8) }, uStars: { value: 0 }, uMoon: { value: 0 }, uClouds: { value: 0 },
      uCloudCol: { value: new THREE.Color('#ffffff') }, uTime: { value: 0 }, uAspect: { value: 1 }, uAz: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform vec2 uGlowPos; uniform float uStars; uniform float uMoon;
      uniform float uClouds; uniform vec3 uCloudCol; uniform float uTime; uniform float uAspect; uniform float uAz;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        vec2 uv = vUv;
        vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, uv.y));
        vec2 gp = (uv - uGlowPos) * vec2(uAspect, 1.0);
        col += uGlow * exp(-dot(gp, gp) * 3.5) * 0.6;
        // 纸面笔触
        float br = vnoise(vec2(uv.x * 3.0 * uAspect, uv.y * 14.0) + vnoise(uv * 4.0) * 2.0);
        col *= 0.97 + 0.06 * br;
        col = min(col, vec3(0.9));
        // 星空
        if (uStars > 0.0) {
          vec2 sp = uv * vec2(uAspect, 1.0) * 90.0 + vec2(uAz * 12.0, 0.0);
          vec2 c = floor(sp); vec2 f = fract(sp);
          float h = hash12(c);
          vec2 o = hash22(c) * 0.8 + 0.1;
          float s = step(0.965, h) * smoothstep(0.09, 0.0, length(f - o)) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 50.0));
          col += vec3(0.9, 0.95, 1.0) * s * uStars * smoothstep(0.25, 0.8, uv.y);
        }
        // 月牙
        if (uMoon > 0.0) {
          vec2 mp = (uv - vec2(0.8, 0.83)) * vec2(uAspect, 1.0);
          float d = length(mp);
          float disc = smoothstep(0.034, 0.03, d);
          float cut = smoothstep(0.03, 0.034, length(mp - vec2(0.015, 0.008)));
          col += vec3(1.0, 0.97, 0.86) * disc * cut * uMoon * 1.6;
          col += vec3(0.55, 0.65, 0.85) * exp(-d * d * 120.0) * 0.18 * uMoon;
        }
        // 云海
        if (uClouds > 0.0) {
          vec2 cp = vec2(uv.x * uAspect * 2.2 + uTime * 0.004 + uAz * 0.3, uv.y * 3.2);
          float n = fbm2(cp * 1.4);
          float band = smoothstep(0.42, 0.05, uv.y + (n - 0.5) * 0.25);
          float puffs = smoothstep(0.58, 0.72, fbm2(cp * 1.1 + 7.0)) * smoothstep(0.95, 0.55, uv.y) * 0.65;
          float c = clamp(band + puffs, 0.0, 1.0) * uClouds;
          vec3 cc = uCloudCol * (0.9 + 0.12 * n);
          col = mix(col, cc, c * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'background';
  return mesh;
}
