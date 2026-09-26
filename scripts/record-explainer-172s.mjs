import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
const outDir = join(process.cwd(), 'artifacts', 'site-explainer');
mkdirSync(outDir, { recursive: true });
const webm = join(outDir, '3pal-explainer-2m52s.webm');
const mp4 = join(outDir, '3pal-explainer-2m52s.mp4');
const TARGET = 172000;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: outDir, size: { width: 1280, height: 720 } }, colorScheme: 'dark' });
await context.addInitScript(() => { localStorage.setItem('zark-tutorial-v4', JSON.stringify({ pausedVersion: 4 })); localStorage.setItem('zark-tutorial-center-v3', JSON.stringify({ dismissed: true, status: 'idle' })); });
const page = await context.newPage();
const video = page.video();
const started = Date.now();

async function installCursor() {
  await page.evaluate(() => {
    if (document.querySelector('#__demo_cursor')) return;
    const s = document.createElement('style'); s.id = '__demo_cursor_style'; s.textContent = `#\u005f\u005fdemo_cursor{position:fixed;z-index:2147483647;width:22px;height:22px;border:3px solid #fff;border-radius:50%;background:#7c3aed;box-shadow:0 0 0 3px #7c3aed,0 0 24px #a78bfa;pointer-events:none;transform:translate(-50%,-50%);transition:left .38s ease,top .38s ease} .__demo_click{position:fixed;z-index:2147483646;width:70px;height:70px;border:4px solid #a78bfa;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);animation:__demo_click .65s ease-out forwards}@keyframes __demo_click{from{opacity:1;transform:translate(-50%,-50%) scale(.25)}to{opacity:0;transform:translate(-50%,-50%) scale(1)}}`; document.head.append(s);
    const c = document.createElement('div'); c.id = '__demo_cursor'; document.body.append(c);
  });
}
async function moveTo(locator) { const box = await locator.boundingBox(); if (!box) return; await page.evaluate(({x,y}) => { const c=document.querySelector('#__demo_cursor'); if(c){c.style.left=x+'px';c.style.top=y+'px';} }, {x:box.x+box.width/2,y:box.y+box.height/2}); await page.waitForTimeout(450); }
async function click(locator) { await moveTo(locator); const box=await locator.boundingBox(); if(box) await page.evaluate(({x,y})=>{const r=document.createElement('div');r.className='__demo_click';r.style.left=x+'px';r.style.top=y+'px';document.body.append(r);setTimeout(()=>r.remove(),700)},{x:box.x+box.width/2,y:box.y+box.height/2}); await locator.click(); await page.waitForTimeout(550); }
async function caption(title, body, ms) { await page.evaluate(({title,body})=>{document.querySelector('#__tour_overlay')?.remove();const o=document.createElement('aside');o.id='__tour_overlay';o.dir='rtl';o.innerHTML=`<small>3PAL COMMUNITY</small><b>${title}</b><p>${body}</p>`;Object.assign(o.style,{position:'fixed',zIndex:2147483645,right:'28px',bottom:'28px',width:'430px',padding:'20px 22px',border:'1px solid rgba(182,136,255,.6)',borderRadius:'18px',background:'rgba(8,16,31,.96)',color:'#fff',fontFamily:'Arial',boxShadow:'0 22px 70px rgba(0,0,0,.65)',textAlign:'right'});o.querySelector('small').style.cssText='display:block;color:#bd8cff;font-size:11px;font-weight:900;letter-spacing:.15em;margin-bottom:8px';o.querySelector('b').style.cssText='display:block;font-size:25px;line-height:1.25';o.querySelector('p').style.cssText='margin:9px 0 0;color:#c5cce0;font-size:14px;line-height:1.8';document.body.append(o)}, {title,body}); await page.waitForTimeout(ms); }
async function open(path) { await page.goto(baseUrl+path,{waitUntil:'networkidle',timeout:30000}); await installCursor(); await page.waitForTimeout(1100); }

try {
  await open('/'); await caption('مرحبًا بك في 3Pal','منصة عربية تجمع اللاعبين، الغرف المباشرة، الألعاب، والتحديات في تجربة واحدة.',12500);
  const lfg=page.locator('a[href*="lfg"], a:has-text("LFG")').first(); await click(lfg); await caption('ابدأ من LFG','ابحث عن غرفة مناسبة أو أنشئ تجمعك الخاص بسرعة.',11000);
  const create=page.locator('#open-create-room').first(); await click(create); await caption('إنشاء غرفة','اختر اللعبة، عدد اللاعبين، الموعد، وVoice ثم افتح الغرفة للمجتمع.',12500); await page.keyboard.press('Escape');
  await open('/games.html'); await caption('مكتبة الألعاب','ابحث، صفِّ النتائج، واحفظ الألعاب المفضلة أو انسخ أمر اللعبة مباشرة.',12500);
  const search=page.locator('#game-search').first(); await click(search); await search.fill('Valorant'); await page.waitForTimeout(4500); await search.fill('');
  await open('/teams.html'); await caption('كوّن فريقك','أرسل الدعوات، تابع الأعضاء والانتصارات، ونافس مع أصدقائك.',11500);
  await open('/trade.html'); await caption('تبادل آمن وواضح','أنشئ عرضًا، أضف التفاصيل، وتابع الاهتمامات والمحادثات من مكان واحد.',11500); const tab=page.locator('[data-trade-tab="create"]').first(); if(await tab.count()) await click(tab);
  await open('/leaderboard.html'); await caption('لوحة المتصدرين','تابع XP، جلسات اللعب، تفاعل LFG، والتقييمات لحظة بلحظة.',11500); const sessions=page.locator('[data-board="sessions"]').first(); if(await sessions.count()) await click(sessions);
  await open('/reports.html'); await caption('الدعم والسلامة','قدّم بلاغًا أو اطلب المساعدة، وتابع رد الإدارة من نفس الصفحة.',11500);
  await open('/status.html'); await caption('حالة الخدمات','تحقق من حالة الموقع وواجهة API وقاعدة البيانات مباشرة.',9500);
  await open('/'); await caption('جاهز للانضمام؟','سجّل عبر Discord، أنشئ أول غرفة، وابدأ اللعب مع مجتمع 3Pal.',9000);
  await page.evaluate(()=>document.querySelector('#__tour_overlay')?.remove());
} finally {
  const remaining = Math.max(0, TARGET - (Date.now()-started));
  await page.waitForTimeout(remaining);
  const save = video.saveAs(webm); await context.close(); await save; await browser.close();
}
console.log(JSON.stringify({webm, mp4, durationMs: TARGET}));
