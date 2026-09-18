import {chromium} from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const root=path.resolve('apps/web/public');
const context=await browser.newContext({reducedMotion:'reduce'});
await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class{close(){}}});
let mode='empty';
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='home.local')return route.abort();
 if(url.pathname.startsWith('/api/')){
  if(mode==='error')return route.fulfill({status:503,json:{error:'Unavailable'}});
  if(url.pathname==='/api/me')return route.fulfill({json:{user:null}});
  if(url.pathname==='/api/public/stats')return route.fulfill({json:{members:123,activeLfgRooms:0,games:6,completedSessions:0,botOnline:false}});
  return route.fulfill({json:{rooms:mode==='populated'?[{id:'test',status:'OPEN',hostName:'اختبار <script>',gameName:'Valorant',currentPlayers:2,maxPlayers:5,needsVoice:true}]:[],lfgGames:mode==='populated'?['valorant','apex-legends','minecraft','league-of-legends','call-of-duty-warzone','fc'].map(slug=>({slug,name:slug})):[],zarkGames:[],leaderboard:[]}});
 }
 const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'}[path.extname(file)]});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));mkdirSync('artifacts',{recursive:true});
try{
 for(mode of ['empty','populated','error']){
  await page.goto('https://home.local/');
  await page.waitForTimeout(300);
  for(const width of [1672,1440,1024,950,768,390,320]){
   await page.setViewportSize({width,height:941});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${mode} overflow ${width}`);
   if((width===1672||width===390)&&mode!=='error')await page.screenshot({path:`artifacts/home-${mode}-${width}.png`,fullPage:true});
  }
  if(mode==='empty'){assert.equal(await page.locator('[data-stat="activeLfgRooms"]').innerText(),'٠');assert.equal(await page.locator('.preview-room').count(),0)}
  if(mode==='populated'){assert.equal(await page.locator('.preview-room').count(),1);assert.equal(await page.locator('.popular-game').count(),6);assert.match(await page.locator('.preview-host').innerText(),/<script>/)}
  if(mode==='error'){assert.equal(await page.locator('.connection-error').count(),1);assert.equal(await page.locator('[data-stat="members"]').innerText(),'—')}
 }
 await page.locator('#mobile-more').click();assert.equal(await page.locator('#mobile-more-drawer').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#mobile-more-drawer').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: home empty/populated/failure, real zero statistics, escaping, seven viewport sizes, mobile menu, no JavaScript errors.');
}finally{await browser.close()}
