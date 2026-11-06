// 入口：渲染器、场景、灯光、相机、后期、角色、天气、地图加载与主循环。
import * as THREE from 'three';
import './style.css';
import { G, materials } from './core/materials.js';
import { CameraRig } from './core/camera.js';
import { Post } from './core/post.js';
import { Party } from './world/characters.js';
import { Weather, WEATHER_U } from './world/weather.js';
import { Sparkles, FX_U } from './world/effects.js';
import { WATER_U } from './world/water.js';
import { targetEnv, lerpEnv, cloneEnv, createBackground } from './world/env.js';
import { buildShrine } from './maps/shrine.js';
import { buildVillage } from './maps/village.js';
import { buildRiverside } from './maps/riverside.js';
import { buildMountain } from './maps/mountain.js';
import { UI } from './ui.js';
import { smoothstep } from './core/rng.js';

const BUILDERS = [buildShrine, buildVillage, buildRiverside, buildMountain];
const params = new URLSearchParams(location.search);

class App {
  constructor() {
    const canvas = document.getElementById('scene');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
    this.pr = Math.min(window.devicePixelRatio || 1, params.has('pr') ? +params.get('pr') : 1.5);
    renderer.setPixelRatio(this.pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 100, 300);
    this.scene = scene;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 400);
    this.rig = new CameraRig(this.camera, canvas);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.bg = createBackground();
    scene.add(this.bg);

    materials();
    this.party = new Party(scene);
    this.weather = new Weather(scene);
    this.sparkles = new Sparkles(scene);
    this.post = new Post(renderer, scene, this.camera);
    this.post.setSize(window.innerWidth, window.innerHeight, this.pr);

    this.state = { map: 0, weather: 'clear', season: 'summer', paused: false, orbit: false, paint: true };
    this.envTime = 0;
    this.realTime = 0;
    this.keys = new Set();
    this.ripples = 0;
    this.frames = 0;
    this.fps = 60;
    this.loadCount = 0;
    this.ui = new UI(this);
    this._bindKeys();
    window.addEventListener('resize', () => this.resize());
    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    const startMap = Math.max(0, Math.min(3, +(params.get('map') ?? 0)));
    this.loadMap(startMap);
    this.manual = params.has('manual');
    if (this.manual) document.body.classList.add('capture');
    if (!this.manual) this.renderer.setAnimationLoop(() => this.frame());
    else this.frame(1 / 60);
  }

  // 手动步进（自动化截图/验证用）：以固定步长推进 n 帧，只渲染最后一帧
  step(n = 1, dt = 1 / 60, renderAll = false) {
    for (let i = 0; i < n; i++) this.frame(dt, !renderAll && i < n - 1);
    return this.snapshot();
  }

  _bindKeys() {
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', (e) => {
      if (block.includes(e.code)) e.preventDefault();
      if (e.repeat && (e.code === 'KeyE' || e.code === 'Space')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Space') this.interact();
      if (e.code === 'KeyR') this.resetView();
      if (e.code === 'KeyP') this.togglePause();
      if (e.code === 'KeyO') this.toggleOrbit();
      if (/^Digit[1-4]$/.test(e.code)) this.requestMap(+e.code.slice(5) - 1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  input() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    return { x, y, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  requestMap(i) {
    if (this._loading) return;
    this._loading = true;
    this.ui.loading(true);
    // 让加载提示先绘制一帧
    requestAnimationFrame(() => setTimeout(() => { this.loadMap(i); this._loading = false; this.ui.loading(false); }, 30));
  }

  loadMap(i) {
    const t0 = performance.now();
    if (this.world) { this.world.dispose(); this.world = null; }
    const w = BUILDERS[i]();
    this.world = w;
    this.scene.add(w.group);
    this.state.map = i;
    this.loadCount++;
    const b = w.bounds;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const R = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 3;
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 220;
    sc.updateProjectionMatrix();
    this.sun.target.position.set(cx, 0, cz);
    this.mapCenter = new THREE.Vector3(cx, 0, cz);
    WATER_U.uHeightTex.value = w.waterTex;
    WATER_U.uTB.value.set(b.x0, b.z0, 1 / (b.x1 - b.x0), 1 / (b.z1 - b.z0));
    WATER_U.uWaterLevel.value = w.waterLevel;
    for (const r of WATER_U.uRipples.value) r.set(0, 0, -100, 0);
    FX_U.uHTex.value = w.waterTex;
    FX_U.uHTB.value.copy(WATER_U.uTB.value);
    this.weather.setVolume(b, w.yRange[0], w.yRange[1]);
    this.rig.setMap(w.spec.camera, w.camBox);
    const sp = w.spec.spawn;
    this.party.spawn(w, sp.x, sp.z, sp.yaw);
    this.sparkles.clear();
    this.state.weather = w.spec.defaults.weather;
    this.state.season = w.spec.defaults.season;
    w.applySeason(this.state.season);
    this._applySeasonGlobals(true);
    this.envTarget = targetEnv(w.envBase, this.state.weather, this.state.season);
    this.env = cloneEnv(this.envTarget);
    G.uSnow.value = this._snowTarget();
    G.uWet.value = this.env['wet'];
    this.rig.update(0.016, this.party.player);
    this.ui.sync();
    this.ui.showTitle(i);
    this.lastLoadMs = performance.now() - t0;
    this.ready = true;
  }

  _snowTarget() {
    const pal = this.world.palette;
    let s = pal.snowBase;
    if (this.state.weather === 'snow') s = 1;
    if (this.state.weather === 'rain') s *= 0.5;
    return s;
  }

  _applySeasonGlobals(immediate) {
    const pal = this.world.palette;
    this.leafTarget = pal.leafAmount;
    if (immediate) G.uLeafAmount.value = pal.leafAmount;
    this.leafFallTarget = pal.petals === 'blossom' ? 0.45 : pal.petals === 'leaves' ? 0.85 : 0;
    if (pal.petals === 'blossom') { FX_U.uLeafA.value.copy(pal.blossom[0]); FX_U.uLeafB.value.copy(pal.blossom[1]); }
    else if (pal.petals === 'leaves') { FX_U.uLeafA.value.copy(pal.leaf[0]); FX_U.uLeafB.value.copy(pal.leaf[1]); }
    if (immediate) FX_U.uLeafFall.value = this.leafFallTarget;
  }

  setWeather(k) {
    this.state.weather = k;
    this.envTarget = targetEnv(this.world.envBase, k, this.state.season);
    this.ui.sync();
    this.ui.toast({ clear: '天气：晴天', rain: '天气：下雨 —— 水面涟漪增多，地面变湿', snow: '天气：下雪 —— 积雪会慢慢覆盖地表' }[k]);
  }

  setSeason(k) {
    this.state.season = k;
    this.world.applySeason(k);
    this._applySeasonGlobals(false);
    this.envTarget = targetEnv(this.world.envBase, this.state.weather, k);
    this.ui.sync();
    this.ui.toast({ spring: '季节：春 —— 新绿与樱花', summer: '季节：夏 —— 浓绿与繁花', autumn: '季节：秋 —— 红叶与落叶', winter: '季节：冬 —— 枯枝与积雪' }[k]);
  }

  togglePause() { this.state.paused = !this.state.paused; this.ui.sync(); this.ui.toast(this.state.paused ? '环境动画已暂停（角色仍可移动）' : '环境动画已继续'); }
  toggleOrbit() { this.state.orbit = !this.state.orbit; this.rig.auto = this.state.orbit; this.ui.sync(); }
  togglePaint() { this.state.paint = !this.state.paint; this.post.paintEnabled = this.state.paint; this.ui.sync(); }
  resetView() { this.rig.reset(false); this.ui.toast('视角已重置'); }

  addRipple(x, z, s = 1) {
    const r = WATER_U.uRipples.value[this.ripples % 10];
    r.set(x, z, this.envTime, s);
    this.ripples++;
  }

  interact() {
    const w = this.world, p = this.party.player;
    if (!w) return;
    this.sparkles.burst(p.x, p.y + 0.7, p.z, 22);
    let msg = '你挥了挥手，光点在空中飘散';
    // 最近的灯
    let best = null, bd = 3.6;
    for (const l of w.lamps) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = l; } }
    if (best) { best.flash = 1; this.sparkles.burst(best.x, best.y, best.z, 30, [2.6, 1.6, 0.7]); msg = '灯火被点亮，暖光一闪'; }
    // 最近的水面
    let wbest = null, wd = 3.2;
    for (let a = 0; a < 16; a++) for (const r of [0.4, 1.0, 1.7, 2.5]) {
      const x = p.x + Math.cos((a / 16) * Math.PI * 2) * r, z = p.z + Math.sin((a / 16) * Math.PI * 2) * r;
      if (w.waterDepth(x, z) > 0.05 && r < wd) { wd = r; wbest = [x, z]; }
    }
    if (wbest) { this.addRipple(wbest[0], wbest[1], 1.6); this.addRipple(wbest[0] + 0.3, wbest[1] - 0.2, 1.0); msg = best ? '灯火与水面一同回应了你' : '水面荡开一圈圈涟漪'; }
    this.ui.toast(msg);
    this.lastInteract = { lamp: !!best, water: !!wbest, t: this.realTime };
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight, this.pr);
  }

  applyEnv(dt) {
    const e = this.env;
    lerpEnv(e, this.envTarget, 1 - Math.exp(-dt * 2.0));
    const w = this.world;
    const sunDir = e['sun.dir'].clone().normalize();
    this.sun.color.copy(e['sun.color']);
    this.sun.intensity = e['sun.intensity'];
    this.sun.position.copy(this.mapCenter).addScaledVector(sunDir, 80);
    this.hemi.color.copy(e['hemi.sky']);
    this.hemi.groundColor.copy(e['hemi.ground']);
    this.hemi.intensity = e['hemi.intensity'];
    const bu = this.bg.material.uniforms;
    bu.uTop.value.copy(e['bg.top']); bu.uBottom.value.copy(e['bg.bottom']); bu.uGlow.value.copy(e['bg.glow']);
    bu.uStars.value = e['sky.stars'] * (1 - e['rain']); bu.uMoon.value = e['sky.moon'] * (1 - e['rain'] * 0.8) * (1 - e['snowfall'] * 0.6);
    bu.uClouds.value = e['sky.clouds']; bu.uCloudCol.value.copy(e['hemi.sky']).lerp(new THREE.Color(1, 1, 1), 0.75);
    bu.uTime.value = this.envTime; bu.uAspect.value = window.innerWidth / window.innerHeight; bu.uAz.value = this.rig.az;
    bu.uGlowPos.value.set(w.spec.id === 'riverside' ? 0.22 : 0.3, w.spec.id === 'riverside' ? 0.62 : 0.85);
    const fog = this.scene.fog;
    fog.color.copy(e['fog.color']);
    const span = 34;
    fog.near = this.rig.dist + 4;
    fog.far = this.rig.dist + span * (5.2 - 3.6 * Math.min(1, e['fog.density']));
    this.renderer.toneMappingExposure = e['exposure'];
    this.post.apply(e, this.realTime);
    // 水
    const wu = WATER_U;
    wu.uShallow.value.copy(e['water.shallow']); wu.uDeep.value.copy(e['water.deep']); wu.uFoam.value.copy(e['water.foam']);
    wu.uFleckA.value.copy(e['water.fleckA']); wu.uFleckB.value.copy(e['water.fleckB']); wu.uGlintCol.value.copy(e['water.glint']);
    wu.uFleckAmt.value = e['water.fleckAmt']; wu.uFlowSpeed.value = e['water.speed'];
    wu.uRain.value = e['rain'];
    wu.uSkyAmt.value = e['water.sky'] ?? 0.15;
    wu.uSkyCol.value.copy(e['bg.top']).lerp(e['hemi.sky'], 0.5);
    wu.uSunDir.value.copy(sunDir);
    G.uSunDir.value.copy(sunDir);
    G.uHiCol.value.copy(e['sun.color']);
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
    wu.uViewDir.value.copy(fwd);
    wu.uToCam.value.set(-fwd.x, -fwd.z).normalize();
    wu.uTanElev.value = Math.tan(this.rig.el);
    // 灯
    const lampLv = e['lamps'];
    const p = this.party.player;
    let li = 0;
    for (const l of w.lamps) {
      const d = Math.hypot(l.x - p.x, l.z - p.z);
      l.boost += ((1 - smoothstep(1.2, 3.8, d)) - l.boost) * (1 - Math.exp(-dt * 4));
      l.flash = Math.max(0, l.flash - dt * 0.8);
      const flick = 1 + 0.06 * Math.sin(this.envTime * 9.1 + l.phase) + 0.04 * Math.sin(this.envTime * 23.7 + l.phase * 2);
      const lv = lampLv * (1 + 0.65 * l.boost + 1.6 * l.flash) * flick;
      if (l.light) l.light.intensity = l.base * lv;
      l.sprite.material.opacity = Math.min(1, 0.75 * lampLv * (1 + 0.4 * l.boost + l.flash));
      l.sprite.scale.setScalar(l.glowBase * (1 + 0.25 * l.boost + 0.6 * l.flash));
      l.sprite.visible = lampLv > 0.02;
      if (l.light) l.light.visible = lampLv > 0.02;
      if (li < 8 && l.light) { wu.uLamps.value[li].set(l.x, l.y, l.z, Math.min(2, lv)); li++; }
    }
    for (; li < 8; li++) wu.uLamps.value[li].w = 0;
    wu.uLampOn.value = lampLv;
    const m = materials();
    m.bulb.color.setScalar(0.3 + 0.7 * Math.min(1, lampLv * 1.2));
    m.glass.emissiveIntensity = e['windows'] * 0.95;
    FX_U.uFirefly.value = e['fireflies'];
    FX_U.uSmokeCol.value.copy(e['smokeCol']);
    FX_U.uMistCol.value.copy(e['mistCol']);
    FX_U.uMistAmt.value = e['mist'];
    FX_U.uLeafLight.value = e['leafLight'];
    G.uWind.value = e['wind'];
    G.uSkirtAmb.value = e['skirtAmb'] ?? 0.18;
    G.uAmbScale.value = 1 - 0.6 * e['night'];
    G.uSnowColor.value.copy(e['snowColor']);
    WEATHER_U.uRainCol.value.copy(e['rainCol']);
    WEATHER_U.uSnowLight.value = 0.55 + 0.45 * (1 - e['night'] * 0.6);
    this.weather.update(e['rain'], e['snowfall']);
    WEATHER_U.uCamTarget.value.copy(this.rig.target);
    WEATHER_U.uDepthSpan.value = Math.max(20, this.rig.baseH / this.rig.zoom);
    this.party.setNight(e['night']);
  }

  frame(fixedDt, skipRender = false) {
    if (fixedDt === undefined) this.timer.update();
    const rdt = fixedDt ?? Math.min(0.05, this.timer.getDelta());
    this.realTime += rdt;
    const dt = this.state.paused ? 0 : rdt;
    this.envTime += dt;
    G.uTime.value = this.envTime;
    const w = this.world;
    if (!w) return;
    // 角色与相机（不受环境暂停影响）
    this.party.update(rdt, this.input(), this.rig.az, this.realTime, (x, z, s) => this.addRipple(x, z, s));
    G.uPlayer.value.set(this.party.player.x, this.party.player.y, this.party.player.z);
    this.rig.update(rdt, this.party.player);
    FX_U.uPx.value = this.rig.pxPerUnit(this.renderer.domElement.height);
    // 环境
    this.applyEnv(rdt);
    w.tickSeason(rdt);
    G.uLeafAmount.value += (this.leafTarget - G.uLeafAmount.value) * (1 - Math.exp(-rdt * 2));
    FX_U.uLeafFall.value += (this.leafFallTarget - FX_U.uLeafFall.value) * (1 - Math.exp(-rdt * 1.5));
    const st = this._snowTarget();
    const sv = G.uSnow.value;
    G.uSnow.value = st > sv ? Math.min(st, sv + dt * 0.07) : Math.max(st, sv - dt * 0.12);
    G.uWet.value += (this.env['wet'] - G.uWet.value) * Math.min(1, dt * 0.35);
    for (const u of w.updaters) u(this.envTime, dt);
    this.sparkles.update(rdt);
    if (!skipRender) {
      this.renderer.info.reset();
      this.post.renderFrame();
      this.lastRender = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    }
    this.frames++;
    this.fps += (1 / Math.max(rdt, 1e-3) - this.fps) * 0.05;
    if (this.frames % 20 === 0) {
      const lr = this.lastRender || { calls: 0, triangles: 0 };
      this.ui.stat(`${Math.round(this.fps)} FPS · ${lr.calls} 次绘制 · ${(lr.triangles / 1000).toFixed(0)}k 三角形`);
    }
  }

  // 供自动化验证使用的只读状态
  snapshot() {
    const p = this.party.player;
    const info = this.renderer.info;
    return {
      map: this.world.id, weather: this.state.weather, season: this.state.season, paused: this.state.paused, orbit: this.state.orbit,
      envTime: this.envTime, realTime: this.realTime,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, moving: this.party.moving },
      companions: this.party.companions.map((c) => ({ x: c.x, y: c.y, z: c.z, kind: c.kind })),
      camera: { az: this.rig.az, el: this.rig.el, zoom: this.rig.zoom, target: this.rig.target.toArray() },
      snow: G.uSnow.value, wet: G.uWet.value, leafAmount: G.uLeafAmount.value,
      memory: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 },
      render: this.lastRender || null,
      sceneChildren: this.scene.children.length,
      lamps: this.world.lamps.map((l) => ({ x: l.x, z: l.z, boost: +l.boost.toFixed(3), flash: +l.flash.toFixed(3), intensity: l.light ? +l.light.intensity.toFixed(3) : null })),
      loadMs: this.lastLoadMs, loadCount: this.loadCount, frames: this.frames, stats: this.world.stats,
    };
  }
}

const app = new App();
window.__app = app;
