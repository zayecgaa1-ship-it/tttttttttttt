import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
const actor={userId:'fixture-user',displayName:'لاعب الصيانة'};
const profile={displayName:actor.displayName,settings:{bio:'نبذة محفوظة',profileAccent:'#e50914',activityVisible:true,rivalNotificationsEnabled:true},zark:{level:1,xp:0,games:[]},loyalty:{points:0},lfg:{rating:{average:null,count:0},voiceSeconds:0,completedSessions:0,favoriteGames:[],activeRooms:[],interests:[]}};
const availability={currentActivity:'AWAY',mentionPolicy:'INTERESTED_ONLY',timezone:'Asia/Jerusalem',weeklyAvailability:[],privacy:{},doNotDisturb:{}};
let failedPaths=new Set(['/api/state','/api/me/team','/api/me/loyalty']);
let settingsSaved=false;
await context.addInitScript(()=>{
  localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));
  window.EventSource=class{close(){}};
});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    if(failedPaths.has(url.pathname))return route.fulfill({status:503,json:{error:'الخدمة غير متاحة مؤقتاً'}});
    const responses={
      '/api/me':{user:actor},'/api/me/profile':profile,
      '/api/me/availability':availability,'/api/me/team':null,
      '/api/me/loyalty':{points:0,tier:{name:'مبتدئ'},shop:[]},
    };
    if(url.pathname==='/api/me/profile/settings'){
      settingsSaved=true;return route.fulfill({json:req.postDataJSON()});
    }
    return route.fulfill({json:responses[url.pathname]??{}});
  }
  const root=path.resolve('apps/web/public'),file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('https://zark.local/profile.html');
  await page.waitForSelector('[data-schedule-day]');
  assert.equal(await page.locator('#profile-name').innerText(),actor.displayName);
  assert.equal(await page.locator('#profile-guest').isVisible(),false);
  assert.match(await page.locator('#profile-team').innerText(),/تعذر تحميل/);
  assert.match(await page.locator('#profile-loyalty').innerText(),/تعذر تحميل/);
  assert.equal(await page.locator('.connection-error').count(),0);
  await page.locator('#profile-setting-bio').fill('الملف يعمل رغم تعطل خدمات أخرى');
  await page.locator('#profile-settings-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#profile-settings-result').textContent.includes('تم حفظ'));
  assert.equal(settingsSaved,true);
  failedPaths=new Set(['/api/state','/api/me/availability']);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#availability-result').textContent.includes('تعذر تحميل'));
  assert.equal(await page.locator('#availability-form button[type=submit]').isDisabled(),true);
  assert.equal(await page.locator('#profile-settings-form button[type=submit]').isEnabled(),true);
  assert.equal(await page.locator('#profile-guest').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: profile survives team/shop/state outages; unavailable schedule cannot overwrite saved data.');
}finally{await browser.close()}
