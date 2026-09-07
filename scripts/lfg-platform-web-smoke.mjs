import { chromium } from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Local fixtures only. All requests are intercepted, including writes.
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({reducedMotion:'reduce'});
const game={id:'gta-v',slug:'gta-v',name:'GTA V',icon:'🚗',platforms:['PC','PLAYSTATION']};
const actor={userId:'fixture-user',displayName:'لاعب التجربة'};
let prefs=[{game,platform:null,interestStatus:'INTERESTED',notificationsEnabled:true,autoInvitesEnabled:true}];
const makeRoom=(id)=>({id,platform:null,gamePlatforms:game.platforms,gameSlug:game.slug,gameName:game.name,gameIcon:game.icon,hostId:actor.userId,hostName:actor.displayName,status:'OPEN',currentPlayers:1,maxPlayers:4,durationMinutes:60,createdAt:new Date().toISOString(),accentColor:'#ff5964',needsVoice:true,members:[{id:actor.userId,displayName:actor.displayName}],source:'MANUAL'});
const rooms=[makeRoom('one'),makeRoom('two')];
const writes=[];
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class {close(){}};});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    let data={};
    if(req.method()!=='GET'){
      const body=req.postDataJSON();writes.push({path:url.pathname,body});
      if(url.pathname==='/api/me/lfg-preferences/gta-v'){prefs=[{...prefs[0],...body}];data=prefs[0];}
      if(url.pathname==='/api/me/lfg/rooms'){data=makeRoom('created');rooms.unshift(data);}
      if(url.pathname==='/api/me/lfg/created'){Object.assign(rooms[0],body);data=rooms[0];}
    }else if(url.pathname==='/api/me')data={user:actor};
    else if(url.pathname==='/api/state')data={rooms:[...rooms],lfgGames:[game],lfgCatalog:[{slug:'sandbox',name:'بناء',games:[game]}]};
    else if(url.pathname==='/api/me/lfg-preferences')data=prefs;
    return route.fulfill({json:data});
  }
  const file=url.pathname==='/assets/fonts/zark-arabic.ttf'?path.resolve('apps/bot/src/fonts/NotoSansArabic.ttf'):path.resolve('apps/web/public','.'+url.pathname);
  if(!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ttf':'font/ttf'}[path.extname(file)]});
});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('https://zark.local/lfg.html');
  await page.waitForSelector('[data-interest="gta-v"]');
  assert.equal(await page.locator('#room-platform').count(),0);
  assert.equal(await page.locator('#manage-room-platform').count(),0);
  assert.equal(await page.locator('[data-preference-platform]').count(),0);
  assert.equal(await page.locator('#rooms .room-card').count(),2);
  await page.locator('#room-platform-filter').selectOption('MOBILE');assert.equal(await page.locator('#rooms .room-card').count(),0);
  for(const platform of ['PC','PLAYSTATION']){await page.locator('#room-platform-filter').selectOption(platform);assert.equal(await page.locator('#rooms .room-card').count(),2);}
  await page.locator('#room-platform-filter').selectOption('all');
  assert.match(await page.locator('#rooms .platform-badge').first().textContent(),/كمبيوتر.*بلايستيشن/);
  await page.locator('[data-notify="gta-v"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-notify="gta-v"]').disabled);
  assert.equal('platform' in writes.at(-1).body,false);
  await page.locator('#open-create-room').click();
  assert.match(await page.locator('#room-game-platforms').textContent(),/كمبيوتر.*بلايستيشن/);
  await page.locator('#create-room-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#create-room-result').textContent.includes('بنجاح'));
  assert.equal('platform' in writes.at(-1).body,false);
  assert.equal(writes.at(-1).body.gameSlug,'gta-v');
  await page.locator('[data-manage=created]').click();
  await page.locator('#room-manager-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#room-manager-result').textContent.includes('تم تحديث'));
  assert.equal('platform' in writes.at(-1).body,false);
  await page.locator('#close-room-manager').click();
  mkdirSync('artifacts/lfg-platform',{recursive:true});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
    if(width!==320)await page.screenshot({path:`artifacts/lfg-platform/lfg-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: game-owned device classification, filters, no room/preference selector, payloads, desktop/mobile layout.');
}finally{await browser.close();}
