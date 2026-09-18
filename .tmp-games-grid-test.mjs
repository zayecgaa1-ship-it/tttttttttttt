import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto('http://127.0.0.1:3000/games.html', { waitUntil: 'networkidle' });
  await p.locator('#zark-games .game-tile').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(600);

  const arts = await p.locator('#zark-games .game-cover .interest-art').count();
  const imgs = await p.locator('#zark-games .game-cover img').evaluateAll(xs => xs.map(x => ({ src: x.src.split('/').pop(), ok: x.complete && x.naturalWidth > 0 })));
  const bad = imgs.filter(i => !i.ok);
  assert.equal(bad.length, 0, 'broken cover images: ' + JSON.stringify(bad));
  assert.ok(arts >= 10, 'expected art covers, got ' + arts);

  const urls = imgs.slice(0, 4).map(i => i.src);
  for (const u of urls) {
    const r = await p.request.get('http://127.0.0.1:3000/assets/lfg/' + u);
    assert.equal(r.status(), 200, 'HTTP ' + r.status() + ' for ' + u);
  }

  await p.locator('#zark-games').screenshot({ path: 'artifacts/lfg-art/games-grid-violet.png' });
  assert.deepEqual(errors, [], 'console errors: ' + JSON.stringify(errors));
  console.log(JSON.stringify({ artCovers: arts, coverImages: imgs.length, allLoaded: true, httpChecked: urls }, null, 2));
} finally { await b.close(); }
