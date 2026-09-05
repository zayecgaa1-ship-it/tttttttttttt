import { chromium } from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Local fixtures only. All requests are intercepted, including writes.
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({reducedMotion:'reduce'});
const game={id:'minecraft',slug:'minecraft',name:'ماينكرافت',icon:'🧱'};
const actor={userId:'fixture-user',displayName:'لاعب التجربة'};
const platforms=['MOBILE','PC','PLAYSTATION'];
let prefs=[{game,platform:'PC',interestStatus:'INTERESTED',notificationsEnabled:true,autoInvitesEnabled:true}];
const makeRoom=(platform,id=platform)=>({id,platform,gameSlug:game.slug,gameName:game.name,gameIcon:game.icon,hostId:actor.userId,hostName:actor.displayName,status:'OPEN',currentPlayers:1,maxPlayers:4,durationMinutes:60,createdAt:new Date().toISOString(),accentColor:'#ff5964',needsVoice:true,members:[{id:actor.userId,displayName:actor.displayName}],source:'MANUAL'});
const rooms=platforms.map(value=>makeRoom(value));
const writes=[];
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class {close(){}};});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    let data={};
    if(req.method()!=='GET'){
      const body=req.postDataJSON();writes.push({path:url.pathname,body});
      if(url.pathname==='/api/me/lfg-preferences/minecraft'){prefs=[{...prefs[0],...body}];data=prefs[0];}
      if(url.pathname==='/api/me/lfg/rooms'){data=makeRoom(body.platform,'created');rooms.unshift(data);}
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
  await page.waitForSelector('[data-preference-platform]');
  assert.equal(await page.locator('#room-platform').inputValue(),'PC');
  assert.equal(await page.locator('#rooms .room-card').count(),3);
  for(const platform of platforms){await page.locator('#room-platform-filter').selectOption(platform);assert.equal(await page.locator('#rooms .room-card').count(),1);}
  await page.locator('#room-platform-filter').selectOption('all');
  await page.locator('[data-preference-platform]').selectOption('PLAYSTATION');
  await page.waitForFunction(()=>!document.querySelector('[data-preference-platform]').disabled);
  assert.equal(writes.at(-1).body.platform,'PLAYSTATION');
  assert.equal(writes.at(-1).body.notificationsEnabled,true);
  await page.reload();await page.waitForSelector('[data-preference-platform]');
  assert.equal(await page.locator('[data-preference-platform]').inputValue(),'PLAYSTATION');
  await page.locator('#room-platform').selectOption('');
  assert.equal(await page.locator('#room-platform').evaluate(node=>node.checkValidity()),false);
  await page.locator('#room-platform').selectOption('MOBILE');
  await page.locator('#create-room-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#create-room-result').textContent.includes('بنجاح'));
  assert.equal(writes.at(-1).body.platform,'MOBILE');
  assert.equal(writes.at(-1).body.gameSlug,'minecraft');
  await page.locator('[data-manage=created]').click();
  assert.equal(await page.locator('#manage-room-platform').inputValue(),'MOBILE');
  await page.locator('#manage-room-platform').selectOption('PC');
  await page.locator('#room-manager-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#room-manager-result').textContent.includes('تم تحديث'));
  assert.equal(writes.at(-1).body.platform,'PC');
  await page.locator('#close-room-manager').click();
  mkdirSync('artifacts/lfg-platform',{recursive:true});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:960});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
    if(width!==320)await page.screenshot({path:`artifacts/lfg-platform/lfg-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: platform filter, saved preferences, required room platform, creation payload, room edits, desktop/mobile layout.');
}finally{await browser.close();}
