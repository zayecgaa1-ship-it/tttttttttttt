import { chromium } from 'playwright';
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Mobile layout regression sweep: every route at every width, checking for text that
// wraps one glyph per line (a narrow-but-tall text box) and for horizontal overflow.
const widths = [320, 360, 390, 412, 480, 620, 621, 700, 768, 900, 1024, 1280];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ reducedMotion: 'reduce' });
await context.addInitScript(() => {
  localStorage.setItem('zark-tutorial-v4', JSON.stringify({ pausedVersion: 4 }));
  window.EventSource = class { close() {} };
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/api/')) {
    return route.fulfill({ json: url.pathname === '/api/me' ? { user: null } : { rooms: [], lfgGames: [], zarkGames: [], leaderboard: [] } });
  }
  const root = path.resolve('apps/web/public');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({
    body: readFileSync(file),
    contentType: {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
    }[path.extname(file)] || 'application/octet-stream',
  });
});

const page = await context.newPage();
const measure = () => page.evaluate(() => ({
  stacked: [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.width < 80 && r.height > 100 && (el.textContent || '').trim().length > 10;
  }).map(el => el.tagName.toLowerCase() + '.' + (el.className || '').toString().trim().split(/\s+/)[0]),
  overflow: document.documentElement.scrollWidth - innerWidth,
  widest: [...document.querySelectorAll('body *')].map(el => {
    const r = el.getBoundingClientRect();
    return { sel: el.tagName.toLowerCase() + '.' + (el.className || '').toString().trim().split(/\s+/)[0], x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
  }).filter(e => e.w > 0 && (e.x < -0.5 || e.right > innerWidth + 0.5)).slice(0, 3),
}));

const routes = readdirSync('apps/web/public').filter(f => f.endsWith('.html')).sort();
const lines = [];
for (const route of routes) {
  await page.goto('https://zark.local/' + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(600);
  const issues = [];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const m = await measure();
    if (m.stacked.length || m.overflow > 0) {
      issues.push(`w=${w} overflow=${m.overflow} stacked=${m.stacked.length}${m.stacked.length ? ' [' + m.stacked.slice(0, 3).join(',') + ']' : ''}${m.widest.length ? ' ' + JSON.stringify(m.widest) : ''}`);
    }
  }
  lines.push(`${route.padEnd(18)} ${issues.length ? 'ISSUES: ' + issues.join(' | ') : 'clean at all ' + widths.length + ' widths'}`);
  console.log(lines[lines.length - 1]);
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/diag-sweep.txt', lines.join('\n') + '\n');
await browser.close();
