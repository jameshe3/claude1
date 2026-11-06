// 环境粒子：萤火虫、烟囱烟、云雾、互动光点、飘落的花瓣/落叶。全部由着色器按时间驱动，数量有上限。
import * as THREE from 'three';
import { G } from '../core/materials.js';
import { NOISE_GLSL } from '../core/glsl.js';
import { RNG } from '../core/rng.js';

export const FX_U = {
  uPx: { value: 20 },
  uFirefly: { value: 0 },
  uSmokeCol: { value: new THREE.Color('#e8e4dc') },
  uSmokeAmt: { value: 1 },
  uMistCol: { value: new THREE.Color('#ffffff') },
  uMistAmt: { value: 0 },
  uLeafFall: { value: 0 },
  uLeafA: { value: new THREE.Color('#f3b6c9') },
  uLeafB: { value: new THREE.Color('#f8d6e0') },
  uLeafLight: { value: 1 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.3) },
  uHTex: { value: null },
  uHTB: { value: new THREE.Vector4() },
};

function sharedU() { return Object.assign({}, G, FX_U); }

// ---------- 萤火虫 ----------
export function fireflies(world, zones, count = 80) {
  const rng = new RNG(world.spec.seed + 50);
  const base = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = zones[i % zones.length];
    const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.random()) * z.r;
    const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r;
    base[i * 3] = x; base[i * 3 + 1] = world.heightAt(x, zz) + rng.range(0.4, 1.8); base[i * 3 + 2] = zz;
    seed[i] = rng.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: sharedU(),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uPx; uniform float uFirefly; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.31 + aSeed * 17.0) * 1.2 + sin(uTime * 0.77 + aSeed * 5.0) * 0.35,
                                 sin(uTime * 0.53 + aSeed * 9.0) * 0.4,
                                 cos(uTime * 0.29 + aSeed * 13.0) * 1.2);
        float blink = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed) + aSeed * 40.0), 3.0);
        vA = (0.25 + 0.75 * blink) * uFirefly;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(3.0, (0.22 + 0.14 * blink) * uPx);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.18, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.45) * (a * 1.2 + core * 2.5) * vA, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  pts.renderOrder = 6;
  world.group.add(pts);
  return pts;
}

// ---------- 烟 ----------
export function smoke(world, per = 18) {
  if (!world.smokes.length) return null;
  const n = world.smokes.length * per;
  const emit = new Float32Array(n * 3), seed = new Float32Array(n);
  const rng = new RNG(world.spec.seed + 60);
  world.smokes.forEach((s, e) => {
    for (let i = 0; i < per; i++) {
      const k = e * per + i;
      emit[k * 3] = s.x; emit[k * 3 + 1] = s.y; emit[k * 3 + 2] = s.z;
      seed[k] = i / per + rng.range(0, 0.02);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(emit, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: sharedU(),
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uPx; uniform float uWind; uniform vec2 uWindDir; uniform float uSmokeAmt;
      varying float vA; varying float vSeed; varying float vAge;
      void main() {
        float age = fract(uTime * 0.085 + aSeed);
        vec3 p = position;
        p.y += age * 3.6;
        p.xz += uWindDir * age * age * 2.6 * (0.4 + uWind * 0.6);
        p.x += sin(age * 5.0 + aSeed * 31.0) * 0.18 * age;
        p.z += cos(age * 4.0 + aSeed * 23.0) * 0.18 * age;
        vA = smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.5) * 0.6 * uSmokeAmt;
        vSeed = aSeed; vAge = age;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.45 + age * 1.6) * uPx;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSmokeCol; varying float vA; varying float vSeed; varying float vAge;
      ${NOISE_GLSL}
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float n = vnoise(gl_PointCoord * 3.0 + vSeed * 40.0);
        float d = length(q) + (n - 0.5) * 0.22;
        float a = smoothstep(0.5, 0.18, d) * vA;
        if (a < 0.01) discard;
        vec3 c = uSmokeCol * (0.88 + 0.2 * (0.5 - q.y));
        gl_FragColor = vec4(c, a);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  pts.name = 'smoke';
  world.group.add(pts);
  return pts;
}

// ---------- 云雾 ----------
export function mist(world, items) {
  const n = items.length;
  if (!n) return null;
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const base = new Float32Array(n * 3), size = new Float32Array(n * 2), spd = new Float32Array(n), sd = new Float32Array(n), al = new Float32Array(n);
  items.forEach((it, i) => {
    base.set([it.x, it.y, it.z], i * 3);
    size.set([it.w, it.h], i * 2);
    spd[i] = it.speed; sd[i] = it.seed; al[i] = it.a ?? 1;
  });
  g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
  g.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(spd, 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
  g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(al, 1));
  g.instanceCount = n;
  const b = world.bounds;
  const u = sharedU();
  u.uSpan = { value: new THREE.Vector2(b.x0 - 3, b.x1 - b.x0 + 6) };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aBase; attribute vec2 aSize; attribute float aSpeed; attribute float aSeed; attribute float aAlpha;
      uniform float uTime; uniform vec2 uSpan;
      varying vec2 vUv; varying vec3 vWPos; varying float vEdge; varying float vSeed; varying float vAlpha;
      void main() {
        float x = uSpan.x + mod(aBase.x - uSpan.x + uTime * aSpeed, uSpan.y);
        vec3 c = vec3(x, aBase.y + sin(uTime * 0.17 + aSeed * 6.0) * 0.35, aBase.z + sin(uTime * 0.11 + aSeed * 3.0) * 0.6);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = c + right * position.x * aSize.x + up * position.y * aSize.y;
        vWPos = wp; vUv = uv; vSeed = aSeed; vAlpha = aAlpha;
        float e = min(x - uSpan.x, uSpan.x + uSpan.y - x);
        vEdge = smoothstep(0.0, 6.0, e);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uMistCol; uniform float uMistAmt; uniform vec3 uPlayer;
      uniform sampler2D uHTex; uniform vec4 uHTB;
      varying vec2 vUv; varying vec3 vWPos; varying float vEdge; varying float vSeed; varying float vAlpha;
      ${NOISE_GLSL}
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        float n = fbm2(vUv * vec2(3.0, 2.0) + vSeed * 13.0 + vec2(uTime * 0.02, 0.0));
        float d = length(q * vec2(1.0, 1.15)) + (n - 0.5) * 0.75;
        float a = smoothstep(1.0, 0.05, d) * smoothstep(1.05, 0.55, d);
        vec2 tuv = (vWPos.xz - uHTB.xy) * uHTB.zw;
        float h = texture2D(uHTex, clamp(tuv, 0.0, 1.0)).r;
        float above = vWPos.y - h;
        a *= smoothstep(-0.2, 1.4, above);
        float pd = distance(vWPos, uPlayer + vec3(0.0, 0.6, 0.0));
        a *= mix(0.08, 1.0, smoothstep(1.4, 4.8, pd));
        a *= uMistAmt * vEdge * vAlpha * 0.5;
        if (a < 0.004) discard;
        vec3 col = uMistCol * (0.93 + 0.12 * n);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.name = 'mist';
  world.group.add(mesh);
  quad.dispose();
  return mesh;
}

// ---------- 飘落花瓣/落叶 ----------
export function fallingLeaves(world, count = 150) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  const rng = new RNG(world.spec.seed + 70);
  const b = world.bounds;
  const base = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) base.set([rng.range(b.x0, b.x1), rng.range(0, 1), rng.range(b.z0, b.z1), rng.random()], i * 4);
  g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
  g.instanceCount = count;
  const u = sharedU();
  u.uTop = { value: world.spec.leafTop ?? 9 };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aBase; uniform float uTime; uniform float uTop; uniform float uLeafFall; uniform float uWind; uniform vec2 uWindDir;
      varying vec2 vUv; varying float vSeed; varying float vA;
      void main() {
        float H = uTop + 1.0;
        float t = uTime * (0.55 + aBase.w * 0.4);
        float y = uTop - mod(aBase.y * H + t, H);
        vec3 c = vec3(aBase.x, y, aBase.z);
        c.x += sin(uTime * 1.1 + aBase.w * 30.0) * 0.6 + uWindDir.x * mod(aBase.y * H + t, H) * 0.35 * uWind;
        c.z += cos(uTime * 0.9 + aBase.w * 20.0) * 0.4 + uWindDir.y * mod(aBase.y * H + t, H) * 0.35 * uWind;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float ang = uTime * (1.5 + aBase.w * 2.0) + aBase.w * 10.0;
        vec2 pp = position.xy * vec2(0.16, 0.1 + 0.06 * abs(sin(ang)));
        pp = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * pp;
        mv.xy += pp;
        vUv = uv; vSeed = aBase.w;
        vA = step(aBase.w, uLeafFall) * smoothstep(0.0, 1.0, y + 0.5) * smoothstep(uTop, uTop - 1.0, y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLeafA; uniform vec3 uLeafB; uniform float uLeafLight;
      varying vec2 vUv; varying float vSeed; varying float vA;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        if (dot(q, q) > 1.0 || vA < 0.01) discard;
        vec3 c = mix(uLeafA, uLeafB, step(0.5, fract(vSeed * 7.0)));
        gl_FragColor = vec4(c * uLeafLight * (0.85 + 0.25 * (1.0 - q.y)), vA * 0.95);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'leaves';
  world.group.add(mesh);
  quad.dispose();
  return mesh;
}

// ---------- 互动光点（CPU 粒子池，全局常驻） ----------
export class Sparkles {
  constructor(scene, max = 96) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      uniforms: { uPx: FX_U.uPx },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aLife; attribute vec3 aCol; uniform float uPx; varying float vL; varying vec3 vC;
        void main() { vL = aLife; vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife > 0.0 ? max(2.5, (0.12 + 0.2 * aLife) * uPx) : 0.0; }`,
      fragmentShader: /* glsl */ `
        varying float vL; varying vec3 vC;
        void main() { if (vL <= 0.0) discard; float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) + smoothstep(0.12, 0.0, d) * 2.0;
          gl_FragColor = vec4(vC * a * min(1.0, vL * 2.0), 1.0); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.points.layers.set(1);
    scene.add(this.points);
    this.rng = new RNG(99);
    this.cursor = 0;
  }
  burst(x, y, z, n = 26, color = [2.2, 1.8, 0.9]) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const a = this.rng.range(0, Math.PI * 2), sp = this.rng.range(0.6, 1.8);
      this.pos.set([x + Math.cos(a) * 0.2, y + this.rng.range(0, 0.4), z + Math.sin(a) * 0.2], i * 3);
      this.vel.set([Math.cos(a) * sp, this.rng.range(1.2, 2.8), Math.sin(a) * sp], i * 3);
      this.life[i] = this.rng.range(0.9, 1.6);
      const t = this.rng.random();
      this.col.set([color[0] * (0.8 + t * 0.3), color[1] * (0.8 + t * 0.3), color[2] * (0.7 + t * 0.6)], i * 3);
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= dt * 1.6;
      this.vel[i * 3] *= 1 - dt * 1.2; this.vel[i * 3 + 2] *= 1 - dt * 1.2;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any || this._dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aLife.needsUpdate = true;
      this.geo.attributes.aCol.needsUpdate = true;
      this._dirty = any;
    }
  }
  clear() { this.life.fill(0); this._dirty = true; }
}
