// 后期：多重采样渲染 → 克制泛光 → 绘画滤镜（八扇区广义 Kuwahara）+ 调色/暗角/纸纹 → 色调映射输出。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export const OVERLAY_LAYER = 1;

// 在绘画滤镜之后直接叠加绘制第 1 层（雨、雪、互动光点），保持细节清晰
class OverlayPass extends Pass {
  constructor(scene, camera) { super(); this.scene = scene; this.camera = camera; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    cam.layers.set(OVERLAY_LAYER);
    const bg = this.scene.background; this.scene.background = null;
    renderer.setRenderTarget(readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, cam);
    this.scene.background = bg;
    cam.layers.set(0);
    renderer.autoClear = prevAuto;
  }
}

const PaintShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 3.0 },
    uPaint: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1.08 },
    uContrast: { value: 1.04 },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.035 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uRadius; uniform float uPaint;
    uniform vec3 uLift; uniform vec3 uGain; uniform float uSat; uniform float uContrast; uniform float uVignette; uniform float uGrain; uniform float uTime;
    varying vec2 vUv;
    float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 comp(vec3 c) { return c / (1.0 + c); }
    vec3 uncomp(vec3 c) { return c / max(vec3(1e-4), 1.0 - c); }
    vec3 kuwahara(vec2 uv) {
      vec2 px = 1.0 / uRes;
      vec3 m[8]; vec3 s[8]; float w[8];
      vec3 c0 = comp(texture2D(tDiffuse, uv).rgb);
      for (int k = 0; k < 8; k++) { m[k] = c0; s[k] = c0 * c0; w[k] = 1.0; }
      const int N = 24;
      for (int i = 0; i < N; i++) {
        float r = sqrt((float(i) + 0.5) / float(N));
        float a = float(i) * 2.39996323;
        vec2 off = vec2(cos(a), sin(a)) * r * uRadius;
        vec3 c = comp(texture2D(tDiffuse, uv + off * px).rgb);
        vec3 cc = c * c;
        for (int k = 0; k < 8; k++) {
          float cw = cos(a - float(k) * 0.78539816);
          float wt = cw > 0.0 ? cw * cw : 0.0;
          m[k] += c * wt; s[k] += cc * wt; w[k] += wt;
        }
      }
      vec3 acc = vec3(0.0); float wa = 0.0;
      for (int k = 0; k < 8; k++) {
        vec3 mk = m[k] / w[k];
        vec3 vk = abs(s[k] / w[k] - mk * mk);
        float sg = vk.r + vk.g + vk.b;
        float wt = 1.0 / (1.0 + pow(sg * 220.0, 2.0));
        acc += mk * wt; wa += wt;
      }
      return uncomp(acc / wa);
    }
    void main() {
      vec3 orig = texture2D(tDiffuse, vUv).rgb;
      vec3 col = orig;
      if (uPaint > 0.001) col = mix(orig, kuwahara(vUv), uPaint);
      col = max(col, 0.0);
      vec3 g = sqrt(col);
      g = (g - 0.45) * uContrast + 0.45;
      col = max(g, 0.0); col *= col;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = col * uGain + uLift * (1.0 - smoothstep(0.0, 0.6, l));
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      col *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
      float gr = h12(vUv * uRes + fract(uTime) * 91.0) - 0.5;
      float weave = sin(vUv.x * uRes.x * 1.3) * sin(vUv.y * uRes.y * 1.3);
      col *= 1.0 + gr * uGrain + weave * 0.006;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.paint = new ShaderPass(PaintShader);
    this.composer.addPass(this.paint);
    this.overlay = new OverlayPass(scene, camera);
    this.composer.addPass(this.overlay);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.paintEnabled = true;
  }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.paint.uniforms.uRes.value.set(w * pr, h * pr);
    this.paint.uniforms.uRadius.value = 2.4 * Math.max(1, (h * pr) / 1080) + 0.6;
  }
  apply(env, t) {
    const u = this.paint.uniforms;
    u.uLift.value.copy(env['grade.lift']);
    u.uGain.value.copy(env['grade.gain']);
    u.uSat.value = env['grade.sat'];
    u.uContrast.value = env['grade.contrast'];
    u.uVignette.value = env['grade.vignette'];
    u.uTime.value = t;
    u.uPaint.value = this.paintEnabled ? 1 : 0;
    this.bloom.strength = env['bloom.strength'];
    this.bloom.radius = env['bloom.radius'];
    this.bloom.threshold = env['bloom.threshold'];
  }
  renderFrame() { this.composer.render(); }
}
