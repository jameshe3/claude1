// 自动化验证：在真实页面中驱动角色、相机、暂停、互动、天气季节与地图切换，输出实测结果 JSON。
// 用法：先 `npm run build && npm run preview`，再 `node tools/verify.mjs [输出路径]`（需要本机可用的 Playwright + Chromium）。
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || 'verification/verify_result.json';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { startedAt: new Date().toISOString(), renderer: null, viewports: {}, maps: {}, camera: {}, pause: {}, interaction: {}, weather: {}, season: {}, switching: {}, keyboard: {}, console: { errors: [], warnings: [] } };

async function openPage(w, h, query = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') report.console.errors.push(m.text().slice(0, 300));
    if (m.type() === 'warning') report.console.warnings.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => report.console.errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '?manual&capture' + query);
  await page.waitForFunction(() => window.__app && window.__app.ready, null, { timeout: 180000 });
  await page.evaluate(() => {
    // 自动驾驶：沿航点生成与相机相对的输入，调用真实的移动/碰撞逻辑
    const a = window.__app;
    a._auto = null;
    const orig = a.input.bind(a);
    a.input = () => {
      if (!a._auto) return orig();
      const p = a.party.player, t = a._auto;
      const dx = t[0] - p.x, dz = t[1] - p.z, l = Math.hypot(dx, dz) || 1;
      const az = a.rig.az;
      const fx = -Math.sin(az), fz = -Math.cos(az), rx = Math.cos(az), rz = -Math.sin(az);
      return { x: (dx * rx + dz * rz) / l, y: (dx * fx + dz * fz) / l, run: false };
    };
    window.__walk = (pts, opts = {}) => {
      const w = a.world, p = a.party.player;
      const log = { reached: [], maxGroundErr: 0, enteredCollider: 0, minEdge: 99, deepWater: 0, steps: 0 };
      for (const pt of pts) {
        a._auto = pt;
        const budget = Math.ceil((Math.hypot(pt[0] - p.x, pt[1] - p.z) / 2.9 + 2.5) * 30);
        let ok = false;
        for (let i = 0; i < budget; i++) {
          a.frame(1 / 30, true);
          log.steps++;
          log.maxGroundErr = Math.max(log.maxGroundErr, Math.abs(p.y - w.groundAt(p.x, p.z)));
          if (w.blocked(p.x, p.z, 0)) log.enteredCollider++;
          log.minEdge = Math.min(log.minEdge, w.edgeDist(p.x, p.z));
          if (!w.deckAt(p.x, p.z) && w.waterDepth(p.x, p.z) > (w.spec.fordDepth ?? 0.3) + 0.02) log.deepWater++;
          if (Math.hypot(pt[0] - p.x, pt[1] - p.z) < (opts.tol ?? 0.55)) { ok = true; break; }
        }
        log.reached.push(ok);
      }
      a._auto = null;
      for (let i = 0; i < 75; i++) a.frame(1 / 30, true);
      const c = a.party.companions;
      log.final = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.y.toFixed(2) };
      log.companionDist = c.map((q) => +Math.hypot(q.x - p.x, q.z - p.z).toFixed(2));
      log.companionGap = c.map((q, i) => +Math.hypot(q.x - (i ? c[i - 1].x : p.x), q.z - (i ? c[i - 1].z : p.z)).toFixed(2));
      log.companionsStill = c.every((q) => q.speed < 0.05);
      return log;
    };
    window.__push = (target, secs) => {
      // 朝目标持续推进（用于碰撞/边界/深水测试）
      const w = a.world, p = a.party.player;
      const r = { enteredCollider: 0, minEdge: 99, deepWater: 0, maxClimb: 0, start: [p.x, p.z, p.y] };
      a._auto = target;
      for (let i = 0; i < secs * 30; i++) {
        a.frame(1 / 30, true);
        if (w.blocked(p.x, p.z, 0)) r.enteredCollider++;
        r.minEdge = Math.min(r.minEdge, w.edgeDist(p.x, p.z));
        if (!w.deckAt(p.x, p.z) && w.waterDepth(p.x, p.z) > (w.spec.fordDepth ?? 0.3) + 0.02) r.deepWater++;
        r.maxClimb = Math.max(r.maxClimb, p.y - r.start[2]);
      }
      a._auto = null;
      r.end = [+p.x.toFixed(2), +p.z.toFixed(2), +p.y.toFixed(2)];
      r.distToTarget = +Math.hypot(target[0] - p.x, target[1] - p.z).toFixed(2);
      return r;
    };
  });
  return page;
}

// ---------- 1920×1080：地图加载、路线、碰撞、完整地块入镜 ----------
const page = await openPage(1920, 1080);
report.renderer = await page.evaluate(() => {
  const gl = window.__app.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

const routes = {
  0: { walk: [[3.2, 10], [1.8, 5.6], [0.9, 2.3], [0.1, -1.0], [-1.9, -3.3], [-4.0, -4.4], [-6.3, -6.3], [-8.2, -8.2]],
       ford: { from: [7.2, 5.8], pts: [[10.4, 1.6], [12.1, -2.3], [13.6, -6.6]] },
       push: [{ name: '走向神社本殿', from: [-8.2, -8.2], to: [-10.6, -10.6] }, { name: '走向深水溪流', from: [-6, 6.8], to: [-6, 3.9] }, { name: '走向地块边缘', from: [5, 16], to: [5, 25] }] },
  1: { walk: [[3.4, 13.5], [0.6, 7.5], [-0.8, 2.2], [0.8, -3.8], [0.2, -10], [-1.8, -15]],
       push: [{ name: '走向蓝色小屋墙体', from: [4.6, -4.8], to: [12.8, -6.6] }, { name: '走向池塘中心', from: [-5.5, 6.5], to: [-9.6, 10.2] }, { name: '走向地块边缘', from: [-20, 12], to: [-30, 12] }] },
  2: { walk: [[-4.6, -2.2], [-0.8, -2.2], [0.2, -4.8], [0.2, -8.4], [0.6, -4.8], [5.6, -1.6], [6.5, 1.8], [6.5, 4.5], [6.5, 7.8]],
       push: [{ name: '走向河中央', from: [3, 0.5], to: [3, 10] }, { name: '走向房屋', from: [7.0, -9.0], to: [7.0, -12.2] }, { name: '攀爬台地挡墙', from: [-9, -5.8], to: [-9, -9.5] }] },
  3: { walk: null,
       push: [{ name: '走出浮岛边缘', from: null, to: null }, { name: '攀爬梯田挡墙', from: [-5.6, 13.6], to: [0, -1] }] },
};

for (let i = 0; i < 4; i++) {
  const res = await page.evaluate(async ([i, route]) => {
    const a = window.__app;
    a.loadMap(i);
    a.step(2, 1 / 30);
    const w = a.world, sp = w.spec.spawn;
    // 地块完整入镜：投影包围盒到屏幕
    const cam = a.camera; const V = cam.position.constructor;
    let inView = 0, total = 0, minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const p of w.camBox.points) {
      const v = new V(p.x, p.y, p.z).project(cam);
      total++; if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) inView++;
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const r = { name: w.spec.name, loadMs: +a.lastLoadMs.toFixed(1), spawnWalkable: w.canWalk(sp.x, sp.z), stats: w.stats, colliders: w.colliders.length, decks: w.decks.length, lamps: w.lamps.length, smokeEmitters: w.smokes.length,
      tileInView: `${inView}/${total}`, ndcExtent: [minX, maxX, minY, maxY].map((v) => +v.toFixed(3)) };
    let pts = route.walk;
    if (!pts) {
      const C = [0, -1], TH0 = 2.15, TURNS = 1.33, R0 = 18.3, R1 = 2.9;
      pts = [];
      for (let k = 1; k <= 30; k++) { const t = k / 30, th = TH0 - t * TURNS * Math.PI * 2, rr = R0 - (R0 - R1) * Math.pow(t, 0.92); pts.push([C[0] + Math.cos(th) * rr, C[1] + Math.sin(th) * rr]); }
      r.routeNote = '沿盘山道 30 个航点（含峡谷木桥）登顶';
    }
    const y0 = a.party.player.y;
    r.route = window.__walk(pts);
    r.route.climb = +(a.party.player.y - y0).toFixed(2);
    if (route.ford) {
      a.party.spawn(w, route.ford.from[0], route.ford.from[1], 0);
      const before = a.ripples;
      r.ford = window.__walk(route.ford.pts);
      r.ford.ripplesSpawned = a.ripples - before;
    }
    r.push = [];
    for (const t of route.push) {
      let from = t.from, to = t.to;
      if (!from) { from = [sp.x, sp.z]; const dx = sp.x - 0, dz = sp.z + 1, l = Math.hypot(dx, dz); to = [sp.x + dx / l * 12, sp.z + dz / l * 12]; }
      a.party.spawn(w, from[0], from[1], 0);
      const pr = window.__push(to, 5);
      pr.name = t.name;
      r.push.push(pr);
    }
    return r;
  }, [i, routes[i]]);
  report.maps[res.name] = res;
  console.log('map', i, res.name, 'route reached', res.route.reached.filter(Boolean).length + '/' + res.route.reached.length, 'push', res.push.map((p) => p.enteredCollider + '/' + p.deepWater + '/' + p.minEdge.toFixed(2)).join(' '));
}

// ---------- 相机：真实鼠标拖动 / 滚轮 / 重置 / 自动环绕 ----------
report.camera = await (async () => {
  await page.evaluate(() => { window.__app.loadMap(1); window.__app.step(5, 1 / 30); });
  const c0 = await page.evaluate(() => ({ az: window.__app.rig.az, el: window.__app.rig.el, zoom: window.__app.rig.zoom }));
  await page.mouse.move(960, 540); await page.mouse.down(); await page.mouse.move(1160, 600, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -600);
  const c1 = await page.evaluate(() => { window.__app.step(60, 1 / 30); return { az: window.__app.rig.az, el: window.__app.rig.el, zoom: window.__app.rig.zoom }; });
  // 放大后相机应跟随角色
  const follow = await page.evaluate(() => {
    const a = window.__app; const p = a.party.player;
    a._auto = [p.x - 4, p.z - 6];
    for (let i = 0; i < 60; i++) a.frame(1 / 30, true);
    a._auto = null;
    for (let i = 0; i < 60; i++) a.frame(1 / 30, true);
    const t = a.rig.target;
    return { targetToPlayer: +Math.hypot(t.x - p.x, t.z - p.z).toFixed(2), zoom: +a.rig.zoom.toFixed(2) };
  });
  await page.keyboard.press('KeyR');
  const c2 = await page.evaluate(() => { window.__app.step(90, 1 / 30); return { az: window.__app.rig.az, el: window.__app.rig.el, zoom: window.__app.rig.zoom }; });
  await page.click('#btn-orbit');
  const orbit = await page.evaluate(() => { const a = window.__app; const s = a.rig.az; a.step(60, 1 / 30); const e = a.rig.az; return { orbitOn: a.state.orbit, azDelta: +(e - s).toFixed(3) }; });
  await page.click('#btn-orbit');
  return { initial: c0, afterDragWheel: c1, follow, afterReset: c2, autoOrbit: orbit,
    dragChangedAz: Math.abs(c1.az - c0.az) > 0.3, wheelZoomed: c1.zoom > c0.zoom * 1.5, resetRestored: Math.abs(c2.az - c0.az) < 0.02 && Math.abs(c2.zoom - c0.zoom) < 0.03 };
})();
console.log('camera', JSON.stringify(report.camera));

// ---------- 暂停 / 恢复 ----------
report.pause = await (async () => {
  await page.evaluate(() => window.__app.step(10, 1 / 30));
  const t0 = await page.evaluate(() => window.__app.envTime);
  await page.click('#btn-pause');
  const during = await page.evaluate(() => {
    const a = window.__app; const p = a.party.player; const x0 = p.x, z0 = p.z;
    const e0 = a.envTime; a.step(45, 1 / 30); const e1 = a.envTime;
    return { paused: a.state.paused, envFrozen: e1 === e0, envTime: e1, uTime: a.renderer && window.__app.world ? e1 : null, btn: document.getElementById('btn-pause').textContent, x0, z0 };
  });
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.__app.step(30, 1 / 30));
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(([x0, z0]) => { const p = window.__app.party.player; return +Math.hypot(p.x - x0, p.z - z0).toFixed(2); }, [during.x0, during.z0]);
  await page.click('#btn-pause');
  const after = await page.evaluate(() => { const a = window.__app; const e0 = a.envTime; a.step(30, 1 / 30); return { paused: a.state.paused, envBefore: e0, envAfter: a.envTime }; });
  return { envAtPause: t0, during, playerMovedWhilePaused: moved, after, resumedContinuously: Math.abs(after.envBefore - during.envTime) < 1e-6 && after.envAfter > after.envBefore };
})();
console.log('pause', JSON.stringify(report.pause));

// ---------- 互动：灯笼增强 / E 键闪光 / 水边涟漪 ----------
report.interaction = await (async () => {
  await page.evaluate(() => { const a = window.__app; a.loadMap(0); a.step(3, 1 / 30); });
  const far = await page.evaluate(() => { const a = window.__app; const l = a.world.lamps[0]; a.party.spawn(a.world, l.x + 6, l.z + 3, 0); a.step(45, 1 / 30); return { boost: l.boost, intensity: l.light.intensity }; });
  const near = await page.evaluate(() => { const a = window.__app; const l = a.world.lamps[0]; a.party.spawn(a.world, l.x - 1.1, l.z + 0.4, 0); a.step(45, 1 / 30); return { boost: l.boost, intensity: l.light.intensity }; });
  await page.keyboard.press('KeyE');
  const flash = await page.evaluate(() => { const a = window.__app; const l = a.world.lamps[0]; const alive = Array.from(a.sparkles.life).filter((v) => v > 0).length; const f = l.flash; a.step(5, 1 / 30); return { flash: +f.toFixed(2), intensityAfterFlash: +l.light.intensity.toFixed(2), sparklesAlive: alive, toast: document.getElementById('toast').textContent, lampFlag: a.lastInteract?.lamp }; });
  const water = await page.evaluate(() => { const a = window.__app; a.party.spawn(a.world, -6, 6.6, Math.PI); a.step(10, 1 / 30); const r0 = a.ripples; a.interact(); return { ripplesAdded: a.ripples - r0, waterFlag: a.lastInteract?.water, toast: document.getElementById('toast').textContent }; });
  return { lampFar: far, lampNear: near, lampBoosted: near.boost > 0.5 && near.intensity > far.intensity * 1.2, keyE: flash, waterRipple: water };
})();
console.log('interaction', JSON.stringify(report.interaction));

// ---------- 天气与季节（通过真实按钮点击） ----------
report.weather = await (async () => {
  await page.evaluate(() => { window.__app.loadMap(1); window.__app.step(3, 1 / 30); });
  const base = await page.evaluate(() => { const a = window.__app; return { sun: a.sun.intensity, sat: a.env['grade.sat'], snow: a.snow }; });
  await page.click('#weather button[data-k="rain"]');
  const rain = await page.evaluate(() => { const a = window.__app; a.step(40, 1 / 10); return { state: a.state.weather, rainAmt: +a.env['rain'].toFixed(2), wet: +window.__app.snapshot().wet.toFixed(2), sun: +a.sun.intensity.toFixed(2), rainVisible: a.weather.rain.visible, splashVisible: a.weather.splash.visible }; });
  await page.click('#weather button[data-k="snow"]');
  const snow = await page.evaluate(() => { const a = window.__app; const s = []; for (let k = 0; k < 4; k++) { a.step(50, 1 / 10); s.push(+a.snapshot().snow.toFixed(2)); } return { state: a.state.weather, snowCoverOverTime: s, snowVisible: a.weather.snow.visible, rainVisible: a.weather.rain.visible }; });
  await page.click('#weather button[data-k="clear"]');
  const clear = await page.evaluate(() => { const a = window.__app; a.step(60, 1 / 10); return { state: a.state.weather, snowCover: +a.snapshot().snow.toFixed(2), sun: +a.sun.intensity.toFixed(2) }; });
  return { baseSun: +base.sun.toFixed(2), rain, snow, clear, rainDimmedSun: rain.sun < base.sun * 0.5, snowAccumulated: snow.snowCoverOverTime[3] > snow.snowCoverOverTime[0] && snow.snowCoverOverTime[3] > 0.6, meltedAfterClear: clear.snowCover < snow.snowCoverOverTime[3] };
})();
console.log('weather', JSON.stringify(report.weather));
report.season = await (async () => {
  const avg = () => page.evaluate(() => { const c = window.__app.world.terrain.mesh.geometry.attributes.color.array; let r = 0, g = 0, b = 0; for (let i = 0; i < c.length; i += 3) { r += c[i]; g += c[i + 1]; b += c[i + 2]; } const n = c.length / 3; return [r / n, g / n, b / n].map((v) => +v.toFixed(3)); });
  const res = {};
  for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    await page.click(`#season button[data-k="${s}"]`);
    res[s] = await page.evaluate(() => { const a = window.__app; a.step(30, 1 / 10); const snap = a.snapshot(); return { state: a.state.season, leafAmount: +snap.leafAmount.toFixed(2), snowCover: +snap.snow.toFixed(2), leafFall: +window.__app.world.fx.leaves.material.uniforms.uLeafFall.value.toFixed(2) }; });
    res[s].terrainAvgColor = await avg();
  }
  return res;
})();
console.log('season', JSON.stringify(report.season));

// ---------- 地图反复切换：资源与事件监听 ----------
report.switching = await page.evaluate(() => {
  const a = window.__app;
  let listenerAdds = 0;
  const wrap = (t) => { const o = t.addEventListener; t.addEventListener = function (...args) { listenerAdds++; return o.apply(this, args); }; };
  wrap(window); wrap(document); wrap(a.canvas);
  const samples = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 4; i++) {
      a.loadMap(i);
      a.step(1, 1 / 30, true);
      const m = a.renderer.info.memory;
      samples.push({ cycle, map: a.world.id, geometries: m.geometries, textures: m.textures, programs: a.renderer.info.programs.length, sceneChildren: a.scene.children.length, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null });
    }
  }
  const first = samples.slice(4, 8), last = samples.slice(8, 12);
  const stable = first.every((s, k) => s.geometries === last[k].geometries && s.textures === last[k].textures && s.sceneChildren === last[k].sceneChildren);
  return { samples, stableAcrossCycles: stable, listenerAddsDuringSwitching: listenerAdds };
});
console.log('switching stable', report.switching.stableAcrossCycles, 'listeners', report.switching.listenerAddsDuringSwitching);

// ---------- 键盘：方向键 / WASD 驱动与朝向 ----------
report.keyboard = await (async () => {
  await page.evaluate(() => { const a = window.__app; a.loadMap(1); a.step(3, 1 / 30); });
  const res = {};
  for (const k of ['KeyW', 'ArrowLeft', 'KeyS', 'ArrowRight']) {
    const before = await page.evaluate(() => { const p = window.__app.party.player; return [p.x, p.z]; });
    await page.keyboard.down(k);
    await page.evaluate(() => window.__app.step(20, 1 / 30));
    await page.keyboard.up(k);
    const after = await page.evaluate(() => { const a = window.__app; a.step(10, 1 / 30); const p = a.party.player; return [p.x, p.z, p.yaw]; });
    const dx = after[0] - before[0], dz = after[1] - before[1];
    res[k] = { moved: +Math.hypot(dx, dz).toFixed(2), moveDir: +Math.atan2(dx, dz).toFixed(2), yaw: +(((after[2] % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI).toFixed(2) };
  }
  return res;
})();
console.log('keyboard', JSON.stringify(report.keyboard));
await page.close();

// ---------- 1366×768：控件可用 ----------
const small = await openPage(1366, 768, '&map=2');
report.viewports['1366x768'] = await small.evaluate(() => {
  const panel = document.getElementById('panel').getBoundingClientRect();
  const hint = document.getElementById('hint').getBoundingClientRect();
  const btns = [...document.querySelectorAll('#ui button')];
  const visible = btns.filter((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.bottom <= innerHeight && r.right <= innerWidth && (e === b || b.contains(e)); }).length;
  return { panel: [panel.x, panel.y, panel.width, panel.height].map(Math.round), hint: [hint.x, hint.y, hint.width, hint.height].map(Math.round), buttons: btns.length, buttonsVisibleAndClickable: visible, overlapPanelHint: !(panel.bottom < hint.top || panel.right < hint.left) };
});
await small.click('.map-btn[data-i="3"]');
await small.waitForFunction(() => window.__app.state.map === 3, null, { timeout: 60000 });
report.viewports['1366x768'].mapSwitchByClick = await small.evaluate(() => window.__app.world.id);
await small.close();

report.finishedAt = new Date().toISOString();
report.console.errors = [...new Set(report.console.errors)];
report.console.warnings = [...new Set(report.console.warnings)];
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log('errors:', report.console.errors.length, 'warnings:', report.console.warnings.length, '->', out);
await browser.close();
