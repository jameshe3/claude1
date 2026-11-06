// 场景截图：node tools/capture.mjs <scenarios.json> [width] [height]
// scenarios: [{ out, map, weather?, season?, zoom?, az?, el?, player?:[x,z], steps?, settle?, js? }]
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [file, W = 1920, H = 1080] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:4173/?manual&capture');
await page.waitForFunction(() => window.__app && window.__app.ready, null, { timeout: 180000 });
await page.addStyleTag({ content: '.title-card,.toast,.loading{display:none!important}' });
const results = [];
for (const sc of list) {
  const snap = await page.evaluate(async (sc) => {
    const a = window.__app;
    if (a.state.map !== sc.map || sc.reload) a.loadMap(sc.map);
    if (sc.season) a.setSeason(sc.season);
    if (sc.weather) a.setWeather(sc.weather);
    if (sc.player) { a.party.spawn(a.world, sc.player[0], sc.player[1], sc.yaw ?? a.party.player.yaw); }
    if (sc.zoom) a.rig.tZoom = a.rig.zoom = sc.zoom;
    if (sc.az !== undefined) a.rig.tAz = a.rig.az = sc.az;
    if (sc.el !== undefined) a.rig.tEl = a.rig.el = sc.el;
    if (sc.hideUI) document.getElementById('ui').style.display = 'none'; else document.getElementById('ui').style.display = '';
    if (sc.js) eval(sc.js);
    // 先按较大步长推进以完成天气/季节过渡与积雪
    if (sc.settle) a.step(sc.settle, 1 / 10);
    return a.step(sc.steps ?? 30, 1 / 30);
  }, sc);
  await page.screenshot({ path: sc.out });
  results.push({ out: sc.out, map: snap.map, weather: snap.weather, season: snap.season, snow: +snap.snow.toFixed(2), wet: +snap.wet.toFixed(2), player: snap.player, memory: snap.memory });
  console.log(sc.out, snap.map, snap.weather, snap.season, 'snow', snap.snow.toFixed(2));
}
console.log('errors:', JSON.stringify(errors.slice(0, 10)));
fs.writeFileSync(file.replace('.json', '.result.json'), JSON.stringify({ results, errors }, null, 2));
await browser.close();
