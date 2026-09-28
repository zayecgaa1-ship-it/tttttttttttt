# ابدأ من هنا — الخطة المختارة والخطوات بالترتيب

**القرار (كله مجاني):**

```text
الموقع + قاعدة البيانات + Redis  →  Vercel   (Neon + Upstash من داخل Vercel)
الـAPI (المخ)                    →  Render   (مجاني، ونبضة البوت كل 25 ث تُبقيه صاحيًا)
البوت                            →  Discloud (خطة مجانية)
```

السبب باختصار: Vercel لا يستطيع تشغيل الـAPI (البث الحي + مؤقتات الغرف تحتاج عملية مستمرة)، وRender مجاني ويبقى يعمل ما دام البوت يرسل نبضته كل 25 ثانية. البيانات مع ذلك تبقى "من استضافة الموقع" كما أردت.

## الحالة الحالية

| الخطوة | الحالة | التفاصيل |
| --- | --- | --- |
| 1. الحسابات | 🟡 ناقص Render + Discloud | Vercel جاهز أصلًا (لأن Neon/Upstash أُنشئا منه) |
| 2. البيانات من Vercel | ✅ تم | Neon Postgres (Frankfurt) + Upstash Redis |
| 3. الجداول ونقل البيانات | ✅ تم | 51 جدولًا • 42 لعبة • 19 مستخدمًا • 15 غرفة • 17 عضوًا • 9 تحديات |
| 4. الـAPI على Render | ⏳ التالي | ملف `.env.deploy-api` جاهز بكل الأسرار |
| 5. الموقع على Vercel | ⏳ | ينتظر عنوان الـAPI |
| 6. البوت على Discloud | ⏳ | ملف `.env.deploy-bot` جاهز (ينتظر عنوان الـAPI النهائي) |
| 7. الربط والتحقق | ⏳ | |

> كل الأسرار موجودة محليًا في `.env.deploy-api` و`.env.deploy-bot` (مستثناة من Git) — لا تشاركها مع أحد.


---

## الخطوة 1 — أنشئ الحسابات الثلاثة (٥ دقائق)

| المكان | الرابط | كيف تسجّل |
| --- | --- | --- |
| Vercel | <https://vercel.com/signup> | Continue with GitHub |
| Render | <https://render.com/register> | Continue with GitHub |
| Discloud | <https://discloudbot.com> | دخول بحساب Discord |

بعد هذا أرسل لي: "الحسابات جاهزة".

## الخطوة 2 — أنشئ قاعدة البيانات و Redis من Vercel

1. من لوحة Vercel: `Storage` (أو Marketplace) → اختر **Neon** → `Create` → **Postgres** → المنطقة **Frankfurt** → `Create`.
2. مرة أخرى من `Storage` → اختر **Upstash** → `Create` → **Redis** → المنطقة **Frankfurt**.
3. لكل واحدة اضغط `Connect` (أو `.env` / `Copy connection string`) وانسخ:
   - `DATABASE_URL` (تبدأ بـ`postgresql://` وتنتهي بـ`sslmode=require`)
   - `REDIS_URL` (تبدأ بـ`rediss://` أو `redis://`)

**أرسل لي القيمتين** أو ضعهما في ملف `.env.deploy-api` في جذر المشروع (الملف مستثنى من Git ولا يُرفع لأي مستودع).

## الخطوة 3 — أنا أنشئ الجداول وأنقل بياناتك

سأشغّل على جهازك:

```powershell
$env:DATABASE_URL='<سلسلة Neon>'; npm run db:push
```

وإن أردت نقل بياناتك الحالية (الأعضاء، النقاط، الغرف...) أستعيد لك `zark_database_backup.sql` إلى القاعدة السحابية.

## الخطوة 4 — الـAPI على Render (أنت + أنا)

1. Render → `New` → **Blueprint** → اختر مستودع المشروع (سيقرأ `render.yaml` تلقائيًا).
2. سيفتح لك حقول المتغيرات المعلَّمة `sync: false` — **انسخ القيم من ملف `.env.deploy-api`** كما هي (وسأعطيك القائمة الجاهزة في المحادثة).
3. `Apply` → انتظر انتهاء البناء (أول بناء ~4–6 دقائق لأن `npm ci` يثبّت الاعتماديات).
4. **أرسل لي الرابط الظاهر** (مثل `https://3pal-api.onrender.com`) — سأضعه في `.env.deploy-bot` وأجهّز حزمة الموقع عليه.
5. تحقّق بنفسك من `https://<الرابط>/health` وتكون النتيجة:

```json
{"ok":true,"service":"zark-api"}
```

> البناء يستخدم `npm ci --include=dev && npm run build` لأن `NODE_ENV=production` يجعل npm يتجاهل أدوات البناء (`typescript`, `prisma`) بدون `--include=dev`.

> أول زيارة بعد خمول قد تأخذ 30–60 ثانية (الخدمة المجانية "تنام" بعد 15 دقيقة بلا زيارات، ونبضة البوت تُبقيها صاحية).
> ⚠️ لا تضبط `PORT` في Render إطلاقًا — Render يعطيه تلقائيًا. (ملف `.env.deploy-api.example` فيه `PORT=8080` لأنه للـDiscloud، احذفه قبل النسخ إلى Render.)

## الخطوة 5 — الموقع على Vercel

1. أنا أجهّز الحزمة بعنوان الـAPI:

```powershell
npm run pack:site -- --api-url https://3pal-api.onrender.com
```

2. Vercel → `Add New` → `Project` → اختر المستودع → Framework = **Other** → `Deploy` (إعدادات البناء موجودة في `vercel.json`).
3. بعد النشر: Vercel → Settings → Domains → أضف نطاقك (إن كان عندك) واتبع التعليمات.
4. أرسل لي رابط Vercel النهائي لأضبطه في الـAPI:

```text
PUBLIC_SITE_ORIGINS=https://<vercel-domain>,https://<your-domain>,https://*.vercel.app
PUBLIC_SITE_URL=https://<your-domain>
DISCORD_REDIRECT_URI=https://<vercel-domain>/auth/discord/callback
```

> يمكنك وضع `https://*.vercel.app` في `PUBLIC_SITE_ORIGINS` من الآن (قبل معرفة الرابط النهائي): الـAPI يدعم النجمة، فيبقى الموقع يعمل حتى لو تغيّر نطاق Vercel أو نطاقات المعاينة. أضف نطاقك المخصص بالضبط لاحقًا.

## الخطوة 6 — البوت على Discloud

1. انسخ القالب: `Copy-Item .env.deploy-bot.example .env.deploy-bot` واملأ القيم (التوكن، معرّفات القنوات، `INTERNAL_API_URL=https://3pal-api.onrender.com`، و`INTERNAL_API_KEY` نفس قيمة Render).
2. أنا أشغّل `npm run pack:bot` → ينتج `deploy/3pal-bot.zip`.
3. Discloud → Applications → `Upload` → اختر الملف → انتظر حتى تظهر الحالة `Running`.

## الخطوة 7 — الربط الأخير والتحقق

1. [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects → أضف:
   `https://<vercel-domain>/auth/discord/callback`
2. تحقق أن كل شي متصل:

```powershell
curl.exe -s https://3pal-api.onrender.com/api/status
```

يجب أن يظهر `"database":true` و`"realtime":{"redisOnline":true}` و`"bot":{"online":true}`.

3. تجربة يدوية: افتح الموقع → سجّل الدخول بـDiscord → افتح صفحة الغرف → أرسل `@3Pal` في قناة عامة (يجب أن تُنشر بطاقة الحالة تلقائيًا).

---

## ما أحتاجه منك الآن (فقط هذا)

1. تأكيد إنشاء الحسابات الثلاثة.
2. قيمتان: `DATABASE_URL` و`REDIS_URL` من Vercel.
3. معرّف السيرفر `DISCORD_GUILD_ID` (موجود أصلًا في `.env` عندك).

وكل ما بعده أرشّدك فيه خطوة بخطوة، والملفات كلها جاهزة في `docs/deploy/` للتفاصيل التقنية إن احتجت.
