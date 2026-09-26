import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
const outputDir = join(process.cwd(), 'artifacts', 'site-tour');
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, `3pal-site-tour-${Date.now()}.webm`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
  colorScheme: 'dark',
});
await context.addInitScript(() => {
  localStorage.setItem('zark-tutorial-v4', JSON.stringify({ pausedVersion: 4 }));
  localStorage.setItem('zark-tutorial-center-v3', JSON.stringify({ dismissed: true, status: 'idle' }));
});

const page = await context.newPage();
const video = page.video();

async function caption(kicker, title, body, duration = 2300, centered = false) {
  await page.evaluate(({ kicker, title, body, centered }) => {
    document.querySelector('#__tour_overlay')?.remove();
    if (!document.querySelector('#__tour_styles')) {
      const style = document.createElement('style');
      style.id = '__tour_styles';
      style.textContent = `
        @keyframes tour-in{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes tour-pulse{50%{box-shadow:0 0 48px rgba(139,92,246,.4)}}
        #__tour_overlay{position:fixed;z-index:2147483647;right:28px;bottom:28px;width:min(440px,calc(100vw - 56px));padding:20px 22px;direction:rtl;text-align:right;border:1px solid rgba(182,136,255,.58);border-radius:18px;background:linear-gradient(135deg,rgba(8,16,31,.96),rgba(16,13,36,.96));color:#fff;box-shadow:0 22px 70px rgba(0,0,0,.65),0 0 34px rgba(139,92,246,.2);backdrop-filter:blur(18px);font-family:Arial,'Segoe UI',sans-serif;animation:tour-in .38s ease both}
        #__tour_overlay.centered{right:50%;bottom:50%;width:min(620px,calc(100vw - 60px));padding:32px;transform:translate(50%,50%);text-align:center;animation:tour-pulse 2s ease infinite}
        #__tour_overlay small{display:block;margin-bottom:7px;color:#bd8cff;font-size:10px;font-weight:900;letter-spacing:.18em}
        #__tour_overlay b{display:block;font-size:26px;line-height:1.25}
        #__tour_overlay p{margin:8px 0 0;color:#c5cce0;font-size:14px;line-height:1.8}
        #__tour_overlay i{position:absolute;inset-inline-start:18px;top:18px;width:9px;height:9px;border-radius:50%;background:#28e5a4;box-shadow:0 0 14px #28e5a4}
      `;
      document.head.append(style);
    }
    const overlay = document.createElement('aside');
    overlay.id = '__tour_overlay';
    if (centered) overlay.className = 'centered';
    overlay.innerHTML = `<i></i><small>${kicker}</small><b>${title}</b><p>${body}</p>`;
    document.body.append(overlay);
  }, { kicker, title, body, centered });
  await page.waitForTimeout(duration);
  await page.evaluate(() => document.querySelector('#__tour_overlay')?.remove());
  await page.waitForTimeout(250);
}

async function open(pathname) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(650);
}

async function smoothScroll(targetY, duration = 1300) {
  await page.evaluate(async ({ targetY, duration }) => {
    const start = scrollY;
    const distance = targetY - start;
    const started = performance.now();
    await new Promise(resolve => {
      function step(now) {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        scrollTo(0, start + distance * eased);
        if (progress < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { targetY, duration });
  await page.waitForTimeout(450);
}

try {
  await open('/');
  await caption('3Pal Community', 'جولة داخل مجتمع اللاعبين', 'الرئيسية تجمع هوية المجتمع، الغرف المباشرة، البوت والألعاب في تجربة عربية واحدة.', 3100, true);
  await smoothScroll(560);
  await caption('الرئيسية', 'كل ما تحتاجه في مكان واحد', 'إحصاءات حقيقية، مزايا المجتمع، ومعاينة مباشرة قبل دخول أي قسم.', 2200);
  await smoothScroll(1180);
  await page.waitForTimeout(900);

  await open('/lfg.html');
  await caption('LOOKING FOR GROUP', 'ابحث عن فريقك أو أنشئ غرفة', 'البحث والفلاتر والمطابقة الذكية موجودة أمامك، والغرف تتحدث مباشرة.', 2600);
  await page.locator('#open-create-room').click();
  await page.waitForTimeout(1300);
  await caption('إنشاء غرفة', 'كل إعدادات التجمع في لوحة واحدة', 'اختر اللعبة، عدد اللاعبين، الموعد وVoice، ثم افتح غرفتك للمجتمع.', 2300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  await smoothScroll(520);

  await open('/games.html');
  await caption('GAME CATALOG', 'مكتبة ألعاب وتحديات Discord', 'يمكنك البحث، التصفية، حفظ المفضلة ونسخ أمر اللعبة بسرعة.', 2400);
  await page.locator('#game-search').fill('أعلام');
  await page.waitForTimeout(1400);
  await page.locator('#game-search').fill('');
  await smoothScroll(790);
  await page.waitForTimeout(900);

  await open('/teams.html');
  await caption('3PAL SQUADS', 'كوّن فريقًا ونافس مع أصحابك', 'الدعوات، الأعضاء، الانتصارات ونقاط الفريق تظهر في لوحة موحّدة.', 2400);
  await page.waitForTimeout(800);

  await open('/trade.html');
  await caption('PLAYER TRADING', 'تبادل واضح وآمن داخل الموقع', 'العروض والاهتمامات والمحادثات تبقى منظمة، مع تنبيهات أمان واضحة.', 2500);
  await page.locator('[data-trade-tab="create"]').click();
  await page.waitForTimeout(1200);
  await caption('عرض جديد', 'نموذج مرتب لكل تفاصيل الصفقة', 'أضف اللعبة والصورة وما لديك وما تريده، ثم انشر العرض.', 2100);

  await open('/leaderboard.html');
  await caption('GLOBAL RANKINGS', 'تصنيف المجتمع لحظة بلحظة', 'بدّل بين XP الألعاب، تفاعل LFG، الجلسات والتقييم.', 2300);
  await page.locator('[data-board="sessions"]').click();
  await page.waitForTimeout(1100);

  await open('/reports.html');
  await caption('SUPPORT & SAFETY', 'الدعم والمساعدة في نفس الهوية', 'مساعد ذكي، بلاغات تقنية، وتواصل سري مع الإدارة.', 2400);
  await smoothScroll(420);

  await open('/status.html');
  await caption('SYSTEM STATUS', 'حالة الخدمات من مكان واحد', 'الموقع وواجهة API وقاعدة البيانات والتحديث المباشر تظهر بحالتها الحقيقية.', 2600);

  await open('/');
  await caption('PLAY · CONNECT · COMPETE', '3Pal Community — أكثر من مجرد ألعاب', 'مجتمع عربي يجمع اللاعبين، الفرق والمنافسة في تجربة واحدة.', 3300, true);
} finally {
  const saveRecording = video.saveAs(outputPath);
  await context.close();
  await saveRecording;
  await browser.close();
}

console.log(outputPath);
