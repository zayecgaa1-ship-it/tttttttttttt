import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const routes = [
  ['home', '/'],
  ['lfg', '/lfg.html'],
  ['games', '/games.html'],
  ['teams', '/teams.html'],
  ['trade', '/trade.html'],
  ['leaderboard', '/leaderboard.html'],
  ['profile', '/profile.html'],
  ['support', '/reports.html'],
  ['commands', '/commands.html'],
  ['status', '/status.html'],
  ['admin', '/admin.html'],
  ['security', '/security.html'],
];
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 960 },
  { width: 1366, height: 900 },
  { width: 1280, height: 900 },
  { width: 1024, height: 900 },
  { width: 768, height: 900 },
  { width: 430, height: 900 },
  { width: 390, height: 900 },
  { width: 360, height: 900 },
];

mkdirSync('artifacts/unified-routes', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ reducedMotion: 'reduce' });
await context.addInitScript(() => {
  localStorage.setItem('zark-tutorial-v4', JSON.stringify({ pausedVersion: 4 }));
  localStorage.setItem('zark-tutorial-center-v3', JSON.stringify({ dismissed: true, status: 'idle' }));
});

const findings = [];
try {
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  for (const [name, pathname] of routes) {
    await page.setViewportSize(viewports[0]);
    const response = await page.goto(`http://localhost:3000${pathname}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    assert.ok(response && response.status() < 400, `${pathname} returned ${response?.status()}`);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#site-nav .site-nav').count(), 1, `${pathname} must have one header`);
    assert.equal(await page.locator('#site-nav .brand').count(), 1, `${pathname} must have one brand`);
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl', `${pathname} must use RTL`);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(35);
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0 && !image.hidden).map(image => image.src),
        overflow: [...document.querySelectorAll('body *')].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).slice(0, 8).map(element => ({ selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''}`, rect: element.getBoundingClientRect().toJSON() })),
      }));
      assert.ok(layout.scrollWidth <= layout.width + 1, `${pathname} horizontal overflow at ${viewport.width}: ${layout.scrollWidth}\n${JSON.stringify(layout.overflow)}`);
      assert.deepEqual(layout.brokenImages, [], `${pathname} has broken images at ${viewport.width}`);
    }
    await page.setViewportSize(name === 'home' ? viewports[1] : viewports[3]);
    await page.screenshot({ path: `artifacts/unified-routes/${name}-desktop.png`, fullPage: true });
    if (name === 'lfg') {
      await page.locator('#open-create-room').click();
      assert.equal(await page.locator('#create-room-panel').isVisible(), true, 'LFG create drawer must open');
      assert.equal(await page.locator('#open-create-room').getAttribute('aria-expanded'), 'true');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'LFG drawer must not create horizontal overflow');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#create-room-panel').isVisible(), false, 'LFG create drawer must close with Escape');
    }
    await page.setViewportSize(viewports[7]);
    if (name === 'games') {
      await page.locator('#mobile-more').click();
      assert.equal(await page.locator('#mobile-more-drawer').isVisible(), true, 'mobile navigation drawer must open');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#mobile-more-drawer').isVisible(), false, 'mobile navigation drawer must close with Escape');
    }
    await page.screenshot({ path: `artifacts/unified-routes/${name}-mobile.png`, fullPage: true });
    findings.push(`${name}: ok`);
  }
  assert.deepEqual(runtimeErrors, [], `Browser errors:\n${runtimeErrors.join('\n')}`);
  console.log(`PASS: ${routes.length} routes, ${viewports.length} viewports, RTL, one shared header, no overflow, missing images, or browser errors.`);
  console.log(findings.join('\n'));
} finally {
  await browser.close();
}
