// 天气粒子：雨丝（沿速度方向拉长的面片）、地面溅落环、雪花。全部 GPU 驱动，覆盖整个地块体积，具有深度分布。
import * as THREE from 'three';
import { G } from '../core/materials.js';
import { FX_U } from './effects.js';
import { RNG } from '../core/rng.js';

export const WEATHER_U = {
  uBoxMin: { value: new THREE.Vector3(-25, -6, -25) },
  uBoxSize: { value: new THREE.Vector3(50, 24, 50) },
  uRainAmt: { value: 0 },
  uSnowAmt: { value: 0 },
  uRainCol: { value: new THREE.Color('#c9d6e0') },
  uSnowLight: { value: 1 },
  uCamTarget: { value: new THREE.Vector3() },
  uDepthSpan: { value: 30 },
};

function quadGeo(count, attrs) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, new THREE.InstancedBufferAttribute(v.data, v.size));
  g.instanceCount = count;
  return g;
}

export class Weather {
  constructor(scene) {
    const U = Object.assign({}, G, FX_U, WEATHER_U);
    const rng = new RNG(2024);
    // 雨
    const RN = 4200;
    const ro = new Float32Array(RN * 4);
    for (let i = 0; i < RN; i++) ro.set([rng.random(), rng.random(), rng.random(), rng.random()], i * 4);
    this.rain = new THREE.Mesh(quadGeo(RN, { aO: { data: ro, size: 4 } }), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aO; uniform float uTime; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform float uRainAmt; uniform float uPx; uniform float uWind; uniform vec2 uWindDir;
        uniform sampler2D uHTex; uniform vec4 uHTB; uniform vec3 uCamTarget; uniform float uDepthSpan;
        varying vec2 vUv; varying float vA;
        void main() {
          vec3 vel = vec3(uWindDir.x * 2.5 * uWind, -15.0 - aO.w * 5.0, uWindDir.y * 2.5 * uWind);
          vec3 p = aO.xyz * uBoxSize + vel * uTime;
          p = uBoxMin + mod(p, uBoxSize);
          vec2 tuv = (p.xz - uHTB.xy) * uHTB.zw;
          float h = texture2D(uHTex, clamp(tuv, 0.0, 1.0)).r;
          float above = step(min(h, 40.0) - 0.05, p.y);
          vec4 a = viewMatrix * vec4(p, 1.0);
          vec4 c = viewMatrix * vec4(uCamTarget, 1.0);
          float df = clamp((c.z - a.z) / uDepthSpan * 0.5 + 0.5, 0.0, 1.0);
          float len = (0.5 + aO.w * 0.35) * mix(1.35, 0.75, df);
          vec4 b = viewMatrix * vec4(p - normalize(vel) * len, 1.0);
          vec2 dir = normalize(b.xy - a.xy + 1e-5);
          vec2 nrm = vec2(-dir.y, dir.x);
          float w = max(mix(2.2, 1.1, df) / uPx, 0.02);
          vec4 mv = mix(a, b, position.y + 0.5);
          mv.xy += nrm * position.x * w;
          vUv = uv;
          vA = step(aO.w, uRainAmt) * above * (0.3 + 0.3 * aO.z) * mix(1.25, 0.55, df);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRainCol; varying vec2 vUv; varying float vA;
        void main() { if (vA < 0.01) discard; float e = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(uRainCol, vA * e * smoothstep(0.0, 0.3, vUv.y)); }`,
    }));
    // 溅落
    const SN = 700;
    const so = new Float32Array(SN * 4);
    for (let i = 0; i < SN; i++) so.set([rng.random(), rng.random(), rng.random(), rng.random()], i * 4);
    this.splash = new THREE.Mesh(quadGeo(SN, { aO: { data: so, size: 4 } }), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aO; uniform float uTime; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform float uRainAmt;
        uniform sampler2D uHTex; uniform vec4 uHTB;
        varying vec2 vUv; varying float vT; varying float vA;
        float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          float per = 0.6 + aO.z * 0.4;
          float tt = uTime / per + aO.w * 10.0;
          float cyc = floor(tt); vT = fract(tt);
          vec2 r = vec2(h12(vec2(cyc, aO.x * 91.0)), h12(vec2(aO.y * 57.0, cyc)));
          vec2 xz = uBoxMin.xz + r * uBoxSize.xz;
          vec2 tuv = (xz - uHTB.xy) * uHTB.zw;
          float h = texture2D(uHTex, clamp(tuv, 0.0, 1.0)).r;
          float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0) * step(h, 40.0);
          vec3 p = vec3(xz.x, h + 0.04, xz.y);
          float s = 0.1 + vT * 0.3;
          p.x += position.x * s; p.z += position.y * s;
          vUv = uv;
          vA = step(aO.w, uRainAmt) * inside;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRainCol; varying vec2 vUv; varying float vT; varying float vA;
        void main() { float d = length(vUv - 0.5) * 2.0; float ring = 1.0 - smoothstep(0.0, 0.25, abs(d - 0.75));
          float a = ring * (1.0 - vT) * vA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(uRainCol, a); }`,
    }));
    // 雪
    const NN = 3200;
    const no = new Float32Array(NN * 4);
    for (let i = 0; i < NN; i++) no.set([rng.random(), rng.random(), rng.random(), rng.random()], i * 4);
    this.snow = new THREE.Mesh(quadGeo(NN, { aO: { data: no, size: 4 } }), new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aO; uniform float uTime; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform float uSnowAmt; uniform float uPx; uniform float uWind; uniform vec2 uWindDir;
        uniform sampler2D uHTex; uniform vec4 uHTB; uniform vec3 uCamTarget; uniform float uDepthSpan;
        varying vec2 vUv; varying float vA;
        void main() {
          float sp = 0.9 + aO.w * 0.7;
          vec3 p = aO.xyz * uBoxSize + vec3(uWindDir.x * 0.6 * uWind, -sp, uWindDir.y * 0.6 * uWind) * uTime;
          p.x += sin(uTime * (0.6 + aO.w) + aO.y * 40.0) * 0.5;
          p.z += cos(uTime * (0.5 + aO.z) + aO.x * 30.0) * 0.5;
          p = uBoxMin + mod(p, uBoxSize);
          vec2 tuv = (p.xz - uHTB.xy) * uHTB.zw;
          float h = texture2D(uHTex, clamp(tuv, 0.0, 1.0)).r;
          float above = step(min(h, 40.0), p.y);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vec4 c = viewMatrix * vec4(uCamTarget, 1.0);
          float df = clamp((c.z - mv.z) / uDepthSpan * 0.5 + 0.5, 0.0, 1.0);
          float s = max(mix(4.6, 2.4, df) / uPx, (0.07 + aO.z * 0.07) * mix(1.4, 0.8, df));
          mv.xy += position.xy * s;
          vUv = uv;
          vA = step(aO.w, uSnowAmt) * above * (0.6 + 0.4 * aO.y) * mix(1.0, 0.6, df);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uSnowLight; varying vec2 vUv; varying float vA;
        void main() { float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.45, d) * vA; if (a < 0.01) discard;
          vec3 c = mix(vec3(0.78, 0.82, 0.9), vec3(1.0, 1.0, 1.02), smoothstep(0.9, 0.2, d));
          gl_FragColor = vec4(c * uSnowLight, a); }`,
    }));
    for (const m of [this.rain, this.splash, this.snow]) {
      m.frustumCulled = false;
      m.renderOrder = 10;
      scene.add(m);
    }
    this.rain.layers.set(1);
    this.snow.layers.set(1);
    this.rain.name = 'rain'; this.splash.name = 'splash'; this.snow.name = 'snow';
  }

  setVolume(bounds, yMin, yMax) {
    const pad = 4;
    WEATHER_U.uBoxMin.value.set(bounds.x0 - pad, yMin, bounds.z0 - pad);
    WEATHER_U.uBoxSize.value.set(bounds.x1 - bounds.x0 + pad * 2, yMax - yMin, bounds.z1 - bounds.z0 + pad * 2);
  }

  update(rainAmt, snowAmt) {
    WEATHER_U.uRainAmt.value = rainAmt;
    WEATHER_U.uSnowAmt.value = snowAmt;
    this.rain.visible = rainAmt > 0.01;
    this.splash.visible = rainAmt > 0.01;
    this.snow.visible = snowAmt > 0.01;
  }
}
