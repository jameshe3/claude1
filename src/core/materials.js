// 风格化材质系统：基于 MeshLambertMaterial 注入笔触噪声、风动、积雪、湿润与柔和明暗分区。
// 所有材质全局共享，地图切换时不重复编译着色器。
import * as THREE from 'three';
import { NOISE_GLSL, STYLIZED_LAMBERT } from './glsl.js';
import { getAtlas, getLeafTexture } from './textures.js';

// 全局共享 uniform（环境时间、风、雪、湿润、季节等）
export const G = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uSnowColor: { value: new THREE.Color(0.93, 0.95, 1.0) },
  uLeafAmount: { value: 1 },
  uFlowerA: { value: new THREE.Color('#ffffff') },
  uFlowerB: { value: new THREE.Color('#ffd84a') },
  uFlowerSpeck: { value: 0.12 },
  uWallColor: { value: new THREE.Color('#b9b4a6') },
  uPlayer: { value: new THREE.Vector3() },
  uSoilTop: { value: new THREE.Color('#5a3b24') },
  uSoilMid: { value: new THREE.Color('#b8863f') },
  uRock: { value: new THREE.Color('#8c8f96') },
  uLip: { value: new THREE.Color('#5d8f3a') },
  uAtlas: { value: null },
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
  uHiCol: { value: new THREE.Color('#ffffff') },
  uSkirtAmb: { value: 0.2 },
  uAmbScale: { value: 1 },
};

function injectCommon(shader, opts) {
  Object.assign(shader.uniforms, G, opts.uniforms || {});
  shader.uniforms.uBrush = { value: opts.brush ?? 0.14 };
  shader.uniforms.uSnowAff = { value: opts.snow ?? 1 };
  shader.uniforms.uWetAff = { value: opts.wet ?? 1 };
  shader.uniforms.uWindAmp = { value: opts.wind ?? 0 };
  shader.uniforms.uAmbBoost = { value: opts.amb ?? 0 };

  let vs = shader.vertexShader;
  let fs = shader.fragmentShader;

  vs = vs.replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWind; uniform float uWindAmp;
varying vec3 vWPos; varying vec3 vWNrm;
#ifdef USE_ATLAS
attribute vec4 aAtlas; varying vec4 vAtlas; varying vec2 vAUv;
#endif
#ifdef PAINT_TERRAIN
attribute vec4 aMask; varying vec4 vMask;
#endif
#ifdef PAINT_SKIRT
attribute vec2 aSide; varying vec2 vSide;
#endif
${opts.vertexHeader || ''}
`);

  vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_ATLAS
vAtlas = aAtlas; vAUv = uv;
#endif
#ifdef PAINT_TERRAIN
vMask = aMask;
#endif
#ifdef PAINT_SKIRT
vSide = aSide;
#endif
#ifdef PAINT_WIND
{
  vec3 ib = vec3(0.0);
  #ifdef USE_INSTANCING
  ib = instanceMatrix[3].xyz;
  #endif
  vec3 wb = (modelMatrix * vec4(ib, 1.0)).xyz;
  float hgt = max(transformed.y, 0.0);
  float ph = wb.x * 0.31 + wb.z * 0.47 + float(gl_InstanceID % 7) * 0.9;
  float sw = sin(uTime * 1.7 + ph) * 0.65 + sin(uTime * 2.9 + ph * 1.9) * 0.35;
  float sw2 = cos(uTime * 1.3 + ph * 1.3);
  transformed.xz += vec2(sw, sw2 * 0.5) * uWindAmp * uWind * hgt * hgt;
}
#endif
${opts.vertexBegin || ''}
`);

  if (opts.projectVertex) vs = vs.replace('#include <project_vertex>', opts.projectVertex);

  vs = vs.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
  #endif
  wp4 = modelMatrix * wp4;
  vWPos = wp4.xyz;
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
  wn = mat3(instanceMatrix) * wn;
  #endif
  vWNrm = normalize(mat3(modelMatrix) * wn);
}
`);

  fs = fs.replace('#include <common>', `#include <common>
uniform float uTime; uniform float uSnow; uniform float uWet; uniform vec3 uSnowColor;
uniform float uBrush; uniform float uSnowAff; uniform float uWetAff;
uniform vec3 uFlowerA; uniform vec3 uFlowerB; uniform float uFlowerSpeck; uniform vec3 uWallColor;
uniform vec3 uSoilTop; uniform vec3 uSoilMid; uniform vec3 uRock; uniform vec3 uLip; uniform float uSkirtAmb; uniform float uAmbBoost; uniform float uAmbScale;
varying vec3 vWPos; varying vec3 vWNrm;
#ifdef USE_ATLAS
uniform sampler2D uAtlas; varying vec4 vAtlas; varying vec2 vAUv;
#endif
#ifdef PAINT_TERRAIN
varying vec4 vMask;
#endif
#ifdef PAINT_SKIRT
varying vec2 vSide;
#endif
${NOISE_GLSL}
float paintNoise(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 q = an.y > 0.6 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  float w = vnoise(q * 0.9);
  float a = vnoise(vec2(q.x * 2.4 + w * 2.0, q.y * 7.5));
  float b = vnoise(q * 1.3 + 13.1);
  return mix(a, b, 0.45);
}
float snowMask(vec3 n, vec3 p) {
  float th = 1.25 - uSnow * 1.05;
  float v = n.y + (vnoise(p.xz * 1.7) - 0.5) * 0.45 + (vnoise(p.xz * 6.0 + 3.0) - 0.5) * 0.16;
  return smoothstep(th, th + 0.12, v) * step(0.001, uSnow);
}
${opts.fragmentHeader || ''}
`);

  fs = fs.replace('#include <lights_lambert_pars_fragment>', STYLIZED_LAMBERT);

  fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_ATLAS
{
  vec2 auv = vAtlas.xy + fract(vAUv) * vAtlas.zw;
  vec3 at = textureGrad(uAtlas, auv, dFdx(vAUv) * vAtlas.zw, dFdy(vAUv) * vAtlas.zw).rgb;
  diffuseColor.rgb *= at;
}
#endif
#ifdef PAINT_SKIRT
{
  float d = vSide.y;
  float wob = (vnoise(vec2(vSide.x * 0.35, 1.0)) - 0.5) * 0.9 + (vnoise(vec2(vSide.x * 1.7, 4.0)) - 0.5) * 0.3;
  vec3 col;
  float lip = 0.18 + wob * 0.12;
  float top = 0.55 + wob * 0.25;
  float mid = 1.9 + wob * 0.8;
  vec2 sq = vec2(vSide.x * 0.9, vWPos.y * 1.25);
  vec3 vr = voronoi(sq);
  float edge = 1.0 - smoothstep(0.03, 0.1, vr.y);
  vec3 rock = uRock * (0.82 + vr.z * 0.32);
  rock = mix(rock, uSoilMid * 0.9, smoothstep(0.55, 0.9, vnoise(sq * 0.35 + 7.0)) * 0.55);
  rock *= 1.0 - edge * 0.4;
  float strata = vnoise(vec2(vSide.x * 2.0, d * 9.0));
  vec3 soil = mix(uSoilMid, uSoilMid * 0.78, strata * 0.6);
  if (d < lip) col = uLip;
  else if (d < top) col = mix(uSoilTop, uSoilTop * 1.15, strata);
  else if (d < mid) col = soil;
  else col = rock;
  float deep = smoothstep(4.0, 16.0, d);
  col *= 1.0 - deep * 0.2;
  diffuseColor.rgb *= col;
  totalEmissiveRadiance += diffuseColor.rgb * uSkirtAmb * (0.6 + 0.4 * smoothstep(0.5, 6.0, d));
}
#endif
#ifdef PAINT_TERRAIN
{
  vec2 p = vWPos.xz;
  mat2 rr = mat2(0.8, -0.6, 0.6, 0.8);
  float gs = vnoise(rr * p * vec2(7.5, 2.0));
  float gs2 = vnoise(p * 3.1 + 5.0);
  diffuseColor.rgb *= 1.0 + ((gs * 0.6 + gs2 * 0.4) - 0.5) * 0.26 * vMask.x;
  // 花点
  vec2 fc = p * 2.7; vec2 fi = floor(fc); vec2 ff = fract(fc);
  float fh = hash12(fi);
  vec2 fpos = hash22(fi + 3.7) * 0.7 + 0.15;
  float fd = length(ff - fpos);
  float dens = uFlowerSpeck * vMask.x * clamp(1.0 - vMask.y * 2.5, 0.0, 1.0) * smoothstep(0.35, 0.65, vnoise(p * 0.35 + 11.0) + 0.25);
  float fl = (1.0 - smoothstep(0.07, 0.11, fd)) * step(1.0 - dens, fh);
  vec3 fcCol = mix(uFlowerA, uFlowerB, step(0.55, hash12(fi + 1.3)));
  diffuseColor.rgb = mix(diffuseColor.rgb, fcCol, fl * (1.0 - uSnow * 0.9));
  // 小路铺石
  if (vMask.z > 0.01) {
    vec3 vr = voronoi(p * 1.55);
    float isStone = step(0.3, vr.z);
    float stone = smoothstep(0.05, 0.14, vr.y) * isStone;
    vec3 stoneCol = diffuseColor.rgb * (1.12 + vr.z * 0.16) * vec3(0.97, 1.0, 1.04);
    diffuseColor.rgb = mix(diffuseColor.rgb, stoneCol, stone * vMask.z);
    diffuseColor.rgb *= mix(1.0, 0.78, (1.0 - smoothstep(0.02, 0.07, vr.y)) * vMask.z * isStone);
  }
  // 陡坡石墙
  if (vMask.w > 0.01) {
    vec2 wq = (abs(vWNrm.x) > abs(vWNrm.z) ? vWPos.zy : vWPos.xy) * vec2(1.25, 1.9);
    vec3 wv = voronoi(wq);
    float edge = 1.0 - smoothstep(0.03, 0.1, wv.y);
    vec3 wcol = uWallColor * (0.82 + wv.z * 0.32);
    wcol *= 1.0 - edge * 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, wcol, vMask.w);
  }
}
#endif
{
  float bn = paintNoise(vWPos, vWNrm);
  diffuseColor.rgb *= 1.0 + (bn - 0.5) * uBrush;
  float sm = snowMask(normalize(vWNrm), vWPos) * uSnowAff;
  #ifdef PAINT_TERRAIN
  sm *= 1.0 - vMask.y * 0.45;
  sm *= 1.0 - vMask.w;
  #endif
  diffuseColor.rgb *= 1.0 - 0.32 * uWet * uWetAff;
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor * (0.94 + bn * 0.08), sm);
}
${opts.fragmentColor || ''}
totalEmissiveRadiance += diffuseColor.rgb * uAmbBoost * uAmbScale;
`);

  if (opts.fragmentEnd) fs = fs.replace('#include <opaque_fragment>', opts.fragmentEnd + '\n#include <opaque_fragment>');

  shader.vertexShader = vs;
  shader.fragmentShader = fs;
}

export function paintMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: opts.vertexColors ?? true,
    map: opts.map ?? null,
    alphaTest: opts.alphaTest ?? 0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
    transparent: opts.transparent ?? false,
    emissive: opts.emissive ?? 0x000000,
    depthWrite: opts.depthWrite ?? true,
  });
  mat.defines = Object.assign({}, opts.defines || {});
  if (opts.wind) mat.defines.PAINT_WIND = '';
  if (opts.atlas) { mat.defines.USE_ATLAS = ''; G.uAtlas.value = getAtlas(); }
  if (opts.terrain) mat.defines.PAINT_TERRAIN = '';
  if (opts.skirt) mat.defines.PAINT_SKIRT = '';
  mat.onBeforeCompile = (shader) => {
    injectCommon(shader, opts);
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'paint:' + (opts.key || '') + JSON.stringify(Object.keys(mat.defines));
  mat.userData.shared = true;
  return mat;
}

// 树冠：面向相机的叶簇卡片（球面法线 + 透明裁剪），实例化 + 风动 + 季节落叶
const CANOPY_VERTEX_HEADER = /* glsl */ `
attribute vec2 aCorner; attribute float aRand; attribute float aSize;
uniform float uLeafAmount;
`;
const CANOPY_BEGIN = /* glsl */ `
{
  vec3 ib2 = vec3(0.0);
  #ifdef USE_INSTANCING
  ib2 = instanceMatrix[3].xyz;
  #endif
  float ph = ib2.x * 0.23 + ib2.z * 0.41 + aRand * 2.0;
  float hgt = max(transformed.y, 0.0);
  float sw = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
  transformed.x += sw * uWind * 0.018 * hgt;
  transformed.z += cos(uTime * 1.05 + ph * 1.2) * uWind * 0.012 * hgt;
}
`;
const CANOPY_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
float iscale = 1.0;
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
iscale = length(instanceMatrix[0].xyz);
#endif
mvPosition = modelViewMatrix * mvPosition;
float leafOn = 1.0 - step(uLeafAmount, aRand);
float ang = aRand * 6.2831 + sin(uTime * 0.9 + aRand * 20.0) * 0.06 * uWind;
vec2 cc = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * aCorner;
mvPosition.xy += cc * aSize * iscale * leafOn;
gl_Position = projectionMatrix * mvPosition;
`;

export function canopyMaterial() {
  const leaf = getLeafTexture();
  const opts = {
    brush: 0.1, snow: 1, wet: 0.6, key: 'canopy', amb: 0.16,
    fragmentHeader: 'uniform vec3 uSunDir; uniform vec3 uHiCol;',
    fragmentColor: `
#ifdef USE_MAP
{
  float lt = texture2D(map, vMapUv).g;
  float facing = dot(normalize(vWNrm), normalize(uSunDir));
  float hl = smoothstep(0.2, 0.85, facing) * smoothstep(0.72, 0.98, lt);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.55 + uHiCol * 0.06, hl * 0.75);
  diffuseColor.rgb *= mix(0.88, 1.0, smoothstep(-0.6, 0.3, facing));
}
#endif
`,
    vertexHeader: CANOPY_VERTEX_HEADER,
    vertexBegin: CANOPY_BEGIN,
    projectVertex: CANOPY_PROJECT,
  };
  const mat = paintMaterial({ ...opts, map: leaf, alphaTest: 0.5, vertexColors: true, side: THREE.DoubleSide });
  const depth = new THREE.MeshDepthMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;\n' + CANOPY_VERTEX_HEADER)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CANOPY_BEGIN)
      .replace('#include <project_vertex>', CANOPY_PROJECT);
  };
  depth.customProgramCacheKey = () => 'canopyDepth';
  depth.userData.shared = true;
  mat.userData.depth = depth;
  return mat;
}

// 风动植被的阴影深度材质（草丛/花朵）
export function windDepthMaterial(amp) {
  const depth = new THREE.MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G);
    shader.uniforms.uWindAmp = { value: amp };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform float uWindAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ib = vec3(0.0);
  #ifdef USE_INSTANCING
  ib = instanceMatrix[3].xyz;
  #endif
  float hgt = max(transformed.y, 0.0);
  float ph = ib.x * 0.31 + ib.z * 0.47 + float(gl_InstanceID % 7) * 0.9;
  float sw = sin(uTime * 1.7 + ph) * 0.65 + sin(uTime * 2.9 + ph * 1.9) * 0.35;
  transformed.xz += vec2(sw, cos(uTime * 1.3 + ph * 1.3) * 0.5) * uWindAmp * uWind * hgt * hgt;
}`);
  };
  depth.customProgramCacheKey = () => 'windDepth' + amp;
  depth.userData.shared = true;
  return depth;
}

// 全局材质库（惰性创建）
let LIB = null;
export function materials() {
  if (LIB) return LIB;
  LIB = {
    terrain: paintMaterial({ terrain: true, brush: 0.16, key: 'terrain' }),
    skirt: paintMaterial({ skirt: true, brush: 0.18, snow: 0.6, key: 'skirt' }),
    building: paintMaterial({ atlas: true, brush: 0.12, key: 'building', amb: 0.05, side: THREE.DoubleSide }),
    prop: paintMaterial({ brush: 0.14, key: 'prop' }),
    char: paintMaterial({ brush: 0.05, snow: 0, wet: 0.3, key: 'char' }),
    rock: paintMaterial({ brush: 0.2, flatShading: true, key: 'rock' }),
    grass: paintMaterial({ wind: 0.9, brush: 0.08, side: THREE.DoubleSide, snow: 0.7, key: 'grass' }),
    flower: paintMaterial({ wind: 0.7, brush: 0.04, side: THREE.DoubleSide, snow: 0.3, key: 'flower' }),
    trunk: paintMaterial({ atlas: true, brush: 0.12, key: 'trunk', amb: 0.12 }),
    canopy: canopyMaterial(),
    glass: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#ffb057'), emissiveIntensity: 0 }),
    bulb: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
  };
  LIB.grass.userData.depth = windDepthMaterial(0.9);
  LIB.flower.userData.depth = windDepthMaterial(0.7);
  LIB.glass.userData.shared = true;
  LIB.bulb.userData.shared = true;
  return LIB;
}
