import {chromium} from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(()=>{localStorage.setItem('zark-tutorial-v4',JSON.stringify({pausedVersion:4}));window.EventSource=class{close(){}};});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/me'?{user:null}:{rooms:[],lfgGames:[],zarkGames:[],leaderboard:[]}});
  const root=path.resolve('apps/web/public');const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:readFileSync(file),contentType:{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'}[path.extname(file)]});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 mkdirSync('artifacts',{recursive:true});
 for(const route of ['/','/commands.html','/games.html']){
  await page.goto('https://zark.local'+route);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:960});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflow ${width}`);
  }
  if(route==='/commands.html'){
   assert.equal(await page.locator('.command-card').count(),15);
   await page.locator('#command-search').fill('ميمز');assert.equal(await page.locator('.command-card').count(),1);
   await page.locator('.command-card button').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'/ميمز');
   await page.locator('#command-search').fill('zzzz');assert.equal(await page.locator('.command-card').count(),0);
   await page.locator('#command-search').fill('');await page.locator('#command-category').selectOption('fun');assert.equal(await page.locator('.command-card').count(),2);
   await page.locator('#tutorial-help-fab').click();
   assert.equal(await page.locator('.tutorial-section-grid [data-section]').count(),8);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:'artifacts/tutorial-mobile.png',fullPage:true});
   await page.keyboard.press('Escape');assert.equal(await page.locator('.tutorial-v4-center').count(),0);
   await page.locator('#tutorial-help-fab').click();await page.locator('[data-section="commands"]').click();
   await page.waitForSelector('.tour-tooltip');assert.match(await page.locator('.tour-tooltip').innerText(),/ابحث عن أمر/);
   await page.locator('[data-center]').focus();await page.keyboard.press('Enter');
   await page.waitForSelector('.tutorial-v4-center');await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1440,height:960});await page.screenshot({path:'artifacts/experience-'+(route==='/'?'home':route.slice(1,-5))+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS: home, games and command hub at 1440/390/320; search, categories, clipboard and JavaScript.');
}finally{await browser.close();}
