import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Isolated browser fixtures: no database writes, Discord requests or live sessions.
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({ reducedMotion:'reduce', permissions:['clipboard-read','clipboard-write'] });
const games = [
  {slug:'flags',name:'أعلام',description:'اعرف الدولة من علمها قبل الجميع.',icon:'🌍',category:'معرفة',aliases:['اعلام'],questionCount:24},
  {slug:'translate',name:'ترجم',description:'كلمة واحدة تفصلك عن الفوز.',icon:'💬',category:'لغة',aliases:['ترجم'],questionCount:80},
  {slug:'fast',name:'أسرع كتابة',description:'اختبر سرعتك ودقة كتابتك.',icon:'⚡',category:'سرعة',aliases:['اسرع']},
  {slug:'capitals',name:'عواصم',description:'رحلة حول عواصم العالم.',icon:'🏙️',category:'معرفة',aliases:['عواصم'],questionCount:120},
  {slug:'logos',name:'شعارات',description:'هل تعرف العلامة من شعارها؟',icon:'🎯',category:'معرفة',aliases:['شعارات']},
  {slug:'anime',name:'أنمي',description:'تحدَّ أصحابك في عالم الأنمي.',icon:'🎌',category:'ترفيه',aliases:['انمي']},
  {slug:'word',name:'أكمل الكلمة',description:'اكتشف الحروف الناقصة.',icon:'🧩',category:'لغة',aliases:['اكمل']},
  {slug:'quiz',name:'معلومات عامة',description:'معلومة جديدة مع كل جولة.',icon:'💡',category:'معرفة',aliases:['سؤال']}
];
let failApi = false;
let catalog = games;
await context.addInitScript(() => localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4})));
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/api/')) {
    if (failApi) return route.fulfill({status:503,json:{error:'الخدمة غير متاحة'}});
    if (url.pathname === '/api/stream') return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
    const data = url.pathname === '/api/me' ? {user:null} : url.pathname === '/api/state' ? {rooms:[],lfgGames:[],zarkGames:catalog,leaderboard:[]} : url.pathname.includes('leaderboard') ? [] : {};
    return route.fulfill({json:data});
  }
  const file = path.resolve('apps/web/public', '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(path.resolve('apps/web/public') + path.sep) || !existsSync(file)) return route.fulfill({status:404,body:''});
  const contentType = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)];
  await route.fulfill({body:readFileSync(file),contentType});
});
const page = await context.newPage();
const errors = [];
page.on('pageerror',error=>errors.push(error.message));
mkdirSync('artifacts/design',{recursive:true});
try {
  for (const width of process.argv.includes('--interactions-only') ? [] : [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:960});
    for (const route of ['/', '/games.html','/lfg.html','/leaderboard.html','/profile.html','/reports.html','/trade.html','/admin.html','/security.html','/status.html']) {
      await page.goto('https://zark.local'+route,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow: ${route} at ${width}`);
      if (['/','/games.html'].includes(route) && [1440,390].includes(width)) await page.screenshot({path:`artifacts/design/${route==='/'?'home':'games'}-${width}.png`,fullPage:true});
    }
    console.log(`Layout passed: ${width}px`);
  }
  await page.setViewportSize({width:390,height:960});
  await page.goto('https://zark.local/games.html',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.game-tile');
  assert.equal(await page.locator('.game-tile').count(),8);
  await page.locator('#game-search').fill('اعلام');
  assert.equal(await page.locator('.game-tile').count(),1);
  await page.locator('.game-tile').click();
  assert.equal(await page.locator('#race-command').innerText(),'.اعلام');
  await page.locator('#copy-game-command').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'.اعلام');
  await page.locator('#game-search').fill('لا يوجد');
  assert.equal(await page.locator('.game-tile').count(),0);
  await page.locator('#game-reset').click();
  await page.locator('#game-category').selectOption('لغة');
  assert.equal(await page.locator('.game-tile').count(),2);
  await page.locator('#play-zark').click();
  const pageCommand = await page.locator('#race-command').innerText();
  assert.ok(games.some(game=>'.'+game.aliases[0]===pageCommand));
  await page.locator('#mobile-menu').click();
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
  catalog = [];
  await page.reload();
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#play-zark').isDisabled());
  assert.ok(await page.locator('#zark-games .empty-state').isVisible());
  failApi = true;
  await page.reload();
  await page.waitForTimeout(150);
  assert.ok(await page.locator('.brand').isVisible(),'Navigation survives API failure');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: search, categories, selection, clipboard, random choice, mobile menu, empty catalog and API failure.');
} finally { await browser.close(); }
