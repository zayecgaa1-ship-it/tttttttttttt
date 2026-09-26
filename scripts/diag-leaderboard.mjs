import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// Leaderboard geometry probe: the podium overlays absolutely positioned slots on a
// single background artwork, so the slot boxes must stay inside the art frame.
const base = process.env.LB_BASE || 'http://localhost:3000';
const widths = [360, 390, 480, 620, 700, 768, 900, 1024, 1280, 1440];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('zark-tutorial-v4', JSON.stringify({ pausedVersion: 4 }));
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(base + '/leaderboard.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#podium .podium-art', { timeout: 15000 });
await page.waitForTimeout(800);

const measure = () => page.evaluate(() => {
  const round = value => Math.round(value * 10) / 10;
  const box = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  };
  const art = document.querySelector('#podium .podium-art');
  const style = art ? getComputedStyle(art) : null;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    overflow: document.documentElement.scrollWidth - innerWidth,
    art: box(art),
    artStyle: style ? { minHeight: style.minHeight, aspectRatio: style.aspectRatio, backgroundSize: style.backgroundSize, backgroundImage: style.backgroundImage.slice(0, 60) } : null,
    slots: [...document.querySelectorAll('#podium .podium-slot')].map(slot => ({
      cls: slot.className,
      box: box(slot),
      avatar: box(slot.querySelector('.discord-avatar')),
      name: box(slot.querySelector('b')),
      value: box(slot.querySelector('small')),
      nameText: (slot.querySelector('b')?.textContent || '').trim(),
      valueText: (slot.querySelector('small')?.textContent || '').trim(),
    })),
    rankingRows: document.querySelectorAll('#full-leaderboard .rank-row').length,
    podiumExists: !!art,
  };
});

mkdirSync('artifacts', { recursive: true });
const lines = [];
for (const width of widths) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(300);
  const m = await measure();
  const art = m.art || { w: 0, h: 0 };
  lines.push(`--- width ${width} (overflow ${m.overflow}) art ${art.w}x${art.h} ratio=${(art.w / art.h).toFixed(2)} bg=${m.artStyle?.backgroundSize} minH=${m.artStyle?.minHeight} rows=${m.rankingRows}`);
  for (const slot of m.slots) {
    const inside = slot.box && slot.box.y >= art.y - 0.5 && slot.box.y + slot.box.h <= art.y + art.h + 0.5 ? 'in' : 'OUT';
    lines.push(`    ${slot.cls.padEnd(28)} box=${JSON.stringify(slot.box)} ${inside} avatar=${JSON.stringify(slot.avatar)} name="${slot.nameText}"@${JSON.stringify(slot.name)} value="${slot.valueText}"@${JSON.stringify(slot.value)}`);
  }
  await page.screenshot({ path: `artifacts/lb-${width}.png`, fullPage: false });
  console.log(lines[lines.length - 1]);
}
lines.push('pageerrors: ' + (errors.length ? errors.join(' | ') : 'none'));
writeFileSync('artifacts/diag-leaderboard.txt', lines.join('\n') + '\n');
await browser.close();
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
