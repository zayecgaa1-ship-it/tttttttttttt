import {chromium} from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const game={slug:'minecraft',name:'Minecraft',platforms:['PC','MOBILE','PLAYSTATION'],minPlayers:2,maxPlayers:8};
const writes=[];
await context.addInitScript(()=>{
  if(!localStorage.getItem('zark-tutorial-v4'))localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));
  window.EventSource=class{constructor(){window.testStream=this}close(){}};
});
await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/')){
    if(route.request().method()!=='GET')writes.push(url.pathname);
    const json=url.pathname==='/api/me'?{user:null}:url.pathname==='/api/state'?{rooms:[],lfgGames:[game],lfgCatalog:[{slug:'sandbox',name:'بناء',games:[game]}],zarkGames:[],leaderboard:[]}:{};
    return route.fulfill({json});
  }
  const root=path.resolve('apps/web/public'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function title(text){await page.waitForFunction(value=>document.querySelector('.tour-tooltip h2')?.textContent===value,text)}
try{
  await page.goto('https://zark.local/commands.html');
  await page.locator('#tutorial-help-fab').click();
  await page.locator('[data-section="commands"]').click();await title('ابحث عن أمر');
  await page.locator('[data-next]').click();await title('صفّ الأوامر');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#tutorial-help-fab').evaluate(el=>el===document.activeElement),true);
  await page.locator('#tutorial-help-fab').click();
  await page.locator('[data-resume]').click();await title('صفّ الأوامر');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.tour-tooltip').evaluate(el=>el.contains(document.activeElement)),true,'focus stays inside tutorial');
  await page.keyboard.press('Escape');

  // A removed target gets a retryable, dismissible fallback.
  await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="commands"]').click();await title('ابحث عن أمر');
  await page.evaluate(()=>document.querySelector('#command-category').style.display='none');
  await page.locator('[data-next]').click();await page.waitForSelector('[data-retry]');
  await page.evaluate(()=>document.querySelector('#command-category').style.display='');
  await page.locator('[data-retry]').click();await title('صفّ الأوامر');
  await page.keyboard.press('Escape');

  await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="profile"]').click();
  await page.waitForURL('**/profile.html');await page.waitForSelector('.tutorial-v4-fallback');
  assert.match(await page.locator('.tutorial-v4-fallback').innerText(),/تحتاج تسجيل دخول/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#zark-tutorial-v4').count(),0);

  await page.goto('https://zark.local/');
  await page.locator('#tutorial-help-fab').click();await page.locator('[data-full]').click();await title('مرحبًا في Zark');
  await page.locator('[data-next]').click();await title('التنقل');
  assert.equal(await page.locator('#mobile-more-drawer').isVisible(),true);
  assert.equal(await page.locator('#mobile-more-drawer section').getAttribute('data-tour-active'),'true');
  assert.equal(await page.locator('#nav-links').evaluate(el=>el.classList.contains('open')),false);
  mkdirSync('artifacts/tutorial',{recursive:true});await page.screenshot({path:'artifacts/tutorial/new-drawer.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForSelector('#nav-links[data-tour-active]');
  assert.equal(await page.locator('#mobile-more-drawer').isVisible(),false);
  await page.setViewportSize({width:390,height:844});
  await page.waitForSelector('#mobile-more-drawer section[data-tour-active]');
  await page.locator('[data-next]').click();await page.waitForURL('**/lfg.html');await title('اختر اللعبة');
  assert.equal(await page.locator('#create-room-panel').evaluate(el=>el.classList.contains('open')),true);
  await page.locator('[data-back]').click();await page.waitForURL('https://zark.local/');await title('التنقل');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-menu').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#mobile-more-drawer').isVisible(),false);
  await page.locator('#mobile-menu').click();
  assert.equal(await page.locator('#mobile-more-drawer').isVisible(),true,'header menu opens the new drawer');
  assert.equal(await page.locator('#nav-links').evaluate(el=>el.classList.contains('open')),false);
  await page.locator('[data-close-more]').click();

  await page.goto('https://zark.local/lfg.html');
  await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="lfg"]').click();await title('اختر اللعبة');
  for(const expected of ['عدد اللاعبين','وقت اللعب','أنشئ التجمع','التصنيفات']){await page.locator('[data-next]').click();await title(expected)}
  assert.equal(await page.locator('#create-room-panel').evaluate(el=>el.classList.contains('open')),false,'category step closes the creation drawer');
  await page.setViewportSize({width:320,height:480});
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.tour-spotlight').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  mkdirSync('artifacts/tutorial',{recursive:true});await page.screenshot({path:'artifacts/tutorial/small-screen.png'});
  await page.keyboard.press('Escape');

  // Storage restrictions must not prevent opening or navigating the guide.
  const restricted=await context.newPage();restricted.on('pageerror',e=>errors.push(e.message));
  await restricted.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('Storage disabled')};Storage.prototype.getItem=()=>{throw new Error('Storage disabled')}});
  await restricted.goto('https://zark.local/commands.html');
  await restricted.waitForSelector('.tutorial-v4-center');await restricted.locator('[data-section="commands"]').click();await restricted.waitForSelector('.tour-tooltip');
  await restricted.keyboard.press('Escape');
  await context.route('**/api/me',route=>route.fulfill({json:{user:{userId:'tutorial-user',displayName:'لاعب التجربة'}}}));
  await context.route('**/api/me/profile',route=>route.fulfill({json:{displayName:'لاعب التجربة',settings:{profileAccent:'#e50914'},zark:{level:1,xp:0,games:[]},lfg:{rating:{count:0},voiceSeconds:0,completedSessions:0,favoriteGames:[],activeRooms:[],interests:[]}}}));
  await context.route('**/api/me/availability',route=>route.fulfill({json:{currentActivity:'AWAY',mentionPolicy:'INTERESTED_ONLY',timezone:'Asia/Jerusalem',weeklyAvailability:[]}}));
  await context.route('**/api/me/loyalty',route=>route.fulfill({json:{points:0,tier:{name:'مبتدئ'},shop:[]}}));
  await context.route('**/api/me/team',route=>route.fulfill({json:null}));
  await page.goto('https://zark.local/profile.html');await page.waitForSelector('#profile-content:not([hidden])');
  await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="profile"]').click();await title('ملفك الشخصي');
  for(const expected of ['إحصاءاتك','متجر الولاء وVIP','حالتك الآن','اختصارات الحالة','الجدول الأسبوعي','توقيتك المحلي','خصوصية حالتك','عدم الإزعاج','احفظ جدولك','تخصيص الملف']){
    await page.locator('[data-next]').click();await title(expected);
  }
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes.filter(url=>url!=='/api/me/activity'),[],'the tutorial must not create rooms or save profile fields');
  console.log('PASS: resume, focus, retry, guest guidance, cross-page back, drawer cleanup, small-screen bounds and disabled storage.');
}finally{await browser.close()}
