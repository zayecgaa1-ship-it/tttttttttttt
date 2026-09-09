import {chromium} from 'playwright';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const actor={userId:'buyer',displayName:'المهتم'},owner={id:'seller',displayName:'صاحب العرض'};
let interest=null,sends=0;
const trade=()=>({code:'ZARK-1',itemName:'غرض تجريبي',owner,game:{name:'Minecraft',slug:'minecraft'},haveText:'غرض',wantText:'بديل',imageData:'/assets/zark-og.png',isOwner:false,status:interest?.status==='ACCEPTED'?'PENDING':'OPEN',interests:interest?[interest]:[]});
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class{close(){}}});
await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/api/')){
    let data={};
    if(url.pathname==='/api/me')data={user:actor};
    else if(url.pathname==='/api/state')data={lfgGames:[]};
    else if(url.pathname==='/api/trades')data=[trade()];
    else if(url.pathname==='/api/trades/ZARK-1')data=trade();
    else if(url.pathname==='/api/me/trades/ZARK-1/interest'){
      sends++;interest={id:'interest',userId:actor.userId,user:{id:actor.userId,displayName:actor.displayName},status:'PENDING'};data=interest;
    }
    else if(url.pathname==='/api/me/trades')data=[];
    else if(url.pathname==='/api/me/trade-notifications')data={unread:0,notifications:[]};
    else if(url.pathname==='/api/me/trade-inbox')data=interest?.conversation?[{id:'chat',trade:trade(),messages:[],lastMessageAt:new Date().toISOString()}]:[];
    else if(url.pathname==='/api/me/trade-conversations/chat')data={id:'chat',ownerId:owner.id,owner,interestedUserId:actor.userId,interestedUser:{id:actor.userId,displayName:actor.displayName},trade:trade(),messages:[]};
    return route.fulfill({json:data});
  }
  const root=path.resolve('apps/web/public'),file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('https://zark.local/trade.html');
  await page.locator('.trade-card footer [data-open-trade]').click();
  await page.locator('[data-trade-interest]').click();
  await page.waitForFunction(()=>document.querySelector('#trade-detail [role="status"]')?.textContent.includes('بانتظار'));
  assert.equal(sends,1);assert.equal(await page.locator('[data-trade-interest]').count(),0);
  interest={...interest,status:'ACCEPTED',conversation:{id:'chat'}};
  await page.reload();await page.locator('.trade-card footer [data-open-trade]').click();
  await page.locator('[data-open-conversation="chat"]').click();
  await page.waitForSelector('#trade-message-form');
  assert.equal(await page.locator('[data-trade-panel="inbox"]').isVisible(),true);
  await page.locator('[data-trade-tab="market"]').click();
  await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="trade"]').click();
  for(const title of ['سوق Trade','البحث والفلترة','أبدي اهتمامك بعرض','قبول طلبات الاهتمام','المحادثات الخاصة','متابعة الرد على طلبك']){
    await page.waitForFunction(expected=>document.querySelector('.tour-tooltip h2')?.textContent===expected,title);
    await page.locator('[data-next]').click();
  }
  await page.keyboard.press('Escape');
  assert.equal(sends,1,'the tutorial must not submit interest requests');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS: interest submission, pending status, accepted conversation access and Trade tutorial.');
}finally{await browser.close()}
