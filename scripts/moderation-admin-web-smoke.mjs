import {chromium} from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const roleId='111111111111111111',channelId='222222222222222222';
const games=[{slug:'roblox',name:'Roblox'},{slug:'minecraft',name:'Minecraft'}];
const settings={enabled:true,maxBansPerHour:2,maxTimeoutsPerHour:2,maxKicksPerHour:5,maxRoleChangesPerHour:8,maxChannelDeletesPerHour:3,maxWebhookChangesPerHour:3,ownerDmAlertsEnabled:true,rolePolicies:[],profanityEnabled:true,profanityNotifyOwner:true,profanityLogEnabled:true,profanityCustomWords:[]};
let saved,help,helpAction;
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class{close(){}}});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    let data={};
    if(url.pathname==='/api/me')data={user:{userId:'owner',displayName:'المالك',isOwner:true,isAdmin:true}};
    else if(url.pathname==='/api/state')data={lfgGames:games};
    else if(url.pathname==='/api/security/dashboard')data={protection:{active:true},settings,counts:{},actions:[],suspensions:[],alerts:[]};
    else if(url.pathname==='/api/web-admin/discord-options')data={roles:[{id:roleId,name:'مشرف'}],channels:[{id:channelId,name:'مساعدة-الألعاب'}]};
    else if(url.pathname==='/api/security/moderation-settings'){saved=req.postDataJSON();data=saved;}
    else if(url.pathname==='/api/web-admin/game-help'){help=req.postDataJSON();data={id:'queued-help'};}
    else if(url.pathname.includes('/api/web-admin/game-help/registrations/')){helpAction=url.pathname;data={ok:true};}
    else if(url.pathname==='/api/web-admin/broadcasts')data=[{id:'campaign',title:'مساعدة في Roblox — Blox Fruits',status:'COMPLETED',createdAt:new Date().toISOString(),sentCount:1,failedCount:0,skippedCount:0,totalMembers:1,helpStartsAt:new Date().toISOString(),helpDays:7,helpDailyCapacity:3,helpTotalCapacity:21,helpRegistrations:[{id:'registration',userId:'333333333333333333',displayName:'لاعب تجريبي',assignedDay:1,status:'WAITING',rejoinAllowed:false}]}];
    return route.fulfill({json:data});
  }
  const root=path.resolve('apps/web/public'),file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('https://zark.local/security.html');
  await page.waitForSelector('#security-save-moderation:not([disabled])');
  await page.locator('#security-add-role').click();await page.locator('[data-policy-role]').selectOption(roleId);
  await page.locator('[data-policy-limit="bans"]').fill('4');await page.locator('[data-policy-limit="roles"]').fill('0');
  await page.locator('#profanity-owner').uncheck();await page.locator('#profanity-custom').fill('كلمة إضافية\nعبارة أخرى');
  await page.locator('#security-save-moderation').click();
  await page.waitForFunction(()=>document.querySelector('#security-moderation-result').textContent.includes('حُفظت'));
  assert.deepEqual(saved.rolePolicies,[{roleId,bans:4,roles:0}]);
  assert.equal(saved.profanityNotifyOwner,false);assert.equal(saved.profanityLogEnabled,true);
  assert.deepEqual(saved.profanityCustomWords,['كلمة إضافية','عبارة أخرى']);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  mkdirSync('artifacts/moderation',{recursive:true});await page.locator('#security-moderation-form').screenshot({path:'artifacts/moderation/security.png'});

  // Exercise the real admin form and binder independently of unrelated admin dashboard endpoints.
  await page.goto('https://zark.local/commands.html');
  await page.waitForFunction(()=>document.querySelector('.nav-account'));
  await page.evaluate(async ({html,games})=>{
    const source=new DOMParser().parseFromString(html,'text/html');
    document.querySelector('main').append(source.querySelector('#admin-game-help-form'),source.querySelector('#admin-broadcast-list'));
    state={lfgGames:games};await bindGameHelpForm();
  },{html:readFileSync('apps/web/public/admin.html','utf8'),games});
  await page.locator('#game-help-channel').selectOption(channelId);
  await page.locator('#game-help-game').selectOption('roblox');await page.locator('#game-help-map').selectOption('Blox Fruits');
  assert.match(await page.locator('#game-help-preview').innerText(),/Blox Fruits/);
  await page.locator('#game-help-daily').fill('3');await page.locator('#game-help-days').fill('7');
  assert.match(await page.locator('#game-help-preview').innerText(),/21/);
  await page.locator('#game-help-send').click();await page.waitForFunction(()=>document.querySelector('#game-help-result').textContent.includes('تم إرسال'));
  assert.deepEqual(help,{channelId,gameSlug:'roblox',mapName:'Blox Fruits',dailyCapacity:3,days:7});
  await page.locator('.game-help-admin summary').click();await page.locator('[data-help-complete="registration"]').click();await page.waitForTimeout(100);
  assert.match(helpAction,/registrations\/registration\/complete$/);
  await page.locator('#game-help-game').selectOption('minecraft');assert.equal(await page.locator('#game-help-map-label').isVisible(),false);
  await page.locator('#game-help-send').click();await page.waitForTimeout(100);
  assert.deepEqual(help,{channelId,gameSlug:'minecraft',dailyCapacity:3,days:7});
  assert.deepEqual(errors,[]);
  console.log('PASS: role selection and limits, profanity destinations, custom words, channel help and Blox Fruits payload.');
}finally{await browser.close()}
