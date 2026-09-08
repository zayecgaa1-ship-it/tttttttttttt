import { chromium } from 'playwright';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
const actor={userId:'111111111111111111',displayName:'لاعب التجربة'};
let team=null,createdBody,deleteFails=true;
const makeTeam=body=>({id:'team-1',slug:'zark-legends',name:body.name,description:body.description,accentColor:body.accentColor||'#e50914',ownerId:actor.userId,maxMembers:20,memberCount:1,createdAt:new Date().toISOString(),owner:{id:actor.userId,displayName:actor.displayName},totals:{xp:1200,wins:4,sessions:9},score:2050,myRole:'OWNER',members:[{id:actor.userId,displayName:actor.displayName,role:'OWNER',xp:1200,wins:4,completedSessions:9,joinedAt:new Date().toISOString()}]});
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class{constructor(){window.testStream=this}close(){}}});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/me'&&req.method()==='GET')return route.fulfill({json:{user:actor}});
    if(url.pathname==='/api/state')return route.fulfill({json:{}});
    if(url.pathname==='/api/me/team'&&req.method()==='GET')return route.fulfill({json:team});
    if(url.pathname==='/api/me/team-invites')return route.fulfill({json:[]});
    if(url.pathname==='/api/teams')return route.fulfill({json:team?[team]:[]});
    if(url.pathname==='/api/me/teams/team-1'&&req.method()==='DELETE'){
      if(deleteFails)return route.fulfill({status:503,json:{error:'تعذر حذف الفريق الآن'}});
      team=null;return route.fulfill({json:{deleted:true}});
    }
    if(url.pathname==='/api/me/teams'&&req.method()==='POST'){createdBody=req.postDataJSON();team=makeTeam(createdBody);return route.fulfill({json:team});}
    return route.fulfill({json:{}});
  }
  const relative=url.pathname==='/'?'/index.html':url.pathname,file=path.resolve('apps/web/public','.'+relative);
  if(!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('https://zark.local/teams.html');
  await page.waitForSelector('#team-create-form');
  await page.locator('#team-name').fill('Zark Legends');
  await page.locator('#team-description').fill('فريق عربي للمنافسة');
  await page.locator('#team-search').fill('Zark');
  await page.waitForResponse(response=>response.url().includes('/api/teams?search=Zark'));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#team-name').inputValue(),'Zark Legends','search must preserve the team draft');
  await page.evaluate(()=>window.testStream.onmessage({data:JSON.stringify({type:'lfg.updated'})}));
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#team-description').inputValue(),'فريق عربي للمنافسة','realtime must preserve unsaved fields');
  await page.locator('#team-create-form button[type=submit]').click();
  await page.waitForSelector('.team-dashboard');
  assert.equal(createdBody.name,'Zark Legends');
  assert.equal(await page.locator('.team-card').count(),1);
  assert.equal(await page.locator('.team-member-list article').count(),1);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#team-delete').click();
  await page.waitForFunction(()=>document.querySelector('#team-action-result').textContent.includes('تعذر حذف'));
  assert.equal(await page.locator('#team-delete').isEnabled(),true,'failed action must allow retry');
  deleteFails=false;
  await page.locator('#team-delete').click();
  await page.waitForSelector('#team-create-form');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  mkdirSync('artifacts/teams',{recursive:true});
  await page.screenshot({path:'artifacts/teams/teams-mobile.png',fullPage:true});
  console.log('PASS: team creation, draft preservation, realtime, delete failure/retry and RTL mobile layout.');
}finally{await browser.close()}
