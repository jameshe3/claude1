// 可通行网格可视化：node tools/walkmap.mjs <outDir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [outDir] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto('http://127.0.0.1:4173/?manual&capture');
await page.waitForFunction(() => window.__app && window.__app.ready);
for (let i = 0; i < 4; i++) {
  const info = await page.evaluate((i) => {
    const a = window.__app; a.loadMap(i);
    const w = a.world, W = w.W;
    let cv = document.getElementById('wm');
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'wm'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#000;image-rendering:pixelated;width:880px'; document.body.appendChild(cv); }
    cv.width = W.nx; cv.height = W.nz;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(W.nx, W.nz);
    let walk = 0;
    for (let j = 0; j < W.nz; j++) for (let k = 0; k < W.nx; k++) {
      const x = W.x0 + k * W.res, z = W.z0 + j * W.res, o = (j * W.nx + k) * 4;
      const ok = W.a[j * W.nx + k] > 0.5; if (ok) walk++;
      const deck = !!w.deckAt(x, z); const wd = w.waterDepth(x, z) > 0; const ins = w.inside(x, z);
      let c = [20, 20, 20];
      if (ins) c = ok ? (deck ? [250, 200, 60] : wd ? [80, 200, 255] : [90, 170, 90]) : wd ? [20, 60, 140] : (w.blocked(x, z, 0) ? [200, 60, 60] : [110, 80, 70]);
      img.data.set([...c, 255], o);
    }
    ctx.putImageData(img, 0, 0);
    const sp = w.spec.spawn;
    return { map: w.id, walkCells: walk, total: W.nx * W.nz, spawnWalk: w.canWalk(sp.x, sp.z), colliders: w.colliders.length, decks: w.decks.length };
  }, i);
  await page.screenshot({ path: `${outDir}/walk${i}.png` });
  console.log(JSON.stringify(info));
}
await browser.close();
