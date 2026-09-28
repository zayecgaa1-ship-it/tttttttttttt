# 04 — استضافة الـAPI (خدمة مستمرة)

الـAPI هو قلب النظام: يخدم الموقع، يتحدث مع Postgres/Redis، يولّد الصور، ويرسل أحداث البث. يحتاج **عملية مستمرة** لا دوال متقطعة.

حزمة الـAPI: `npm run pack:api` → `deploy/3pal-api.zip` (تحتوي الموقع الثابت أيضًا، فيمكن للـAPI أن يخدم الموقع بنفسه إن أردت).

## الخيار A: Discloud `TYPE=site`

يشترط خطة Platinum فأعلى + نطاقًا فرعيًا، ويشترط الاستماع على المنفذ 8080.

1. من لوحة Discloud: احجز نطاقًا فرعيًا (مثل `3pal-api`) → سيكون العنوان `https://3pal-api.discloud.app`.
2. جهّز الحزمة: `npm run pack:api -- --env .env.deploy-api`.
3. `Upload` → اختر `deploy/3pal-api.zip` → أضف متغيرات البيئة.
4. تأكد أن `PORT=8080` داخل متغيرات الـAPI (الإعداد في `deploy/discloud/api/discloud.config` يضبط `TYPE` و`ID` و`MAIN`).
5. Discloud يعرض السجلات وحالة التطبيق من اللوحة مباشرة.

## الخيار B: Render (خطة Free)

1. Render → `New` → `Web Service` → اربط المستودع.
2. الإعدادات:
   - **Environment:** Node
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node dist/apps/api/src/index.js`
   - **Health Check Path:** `/health`
3. متغيرات البيئة الأساسية:

```text
DATABASE_URL=postgresql://...            # Neon
REDIS_URL=rediss://...                   # Upstash
PUBLIC_SITE_ORIGINS=https://<site-domain>
PUBLIC_SITE_URL=https://<site-domain>
INTERNAL_API_KEY=<نفس قيمة البوت>
SESSION_SECRET=<32 حرفًا عشوائيًا على الأقل>
NODE_ENV=production
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1       # يمنع تنزيل متصفحات الفحص المحلية
PRISMA_HIDE_UPDATE_MESSAGE=1
```

> الخطة المجانية في Render تُنيم الخدمة بعد ~15 دقيقة خمول. نبضة البوت كل 25 ثانية (`/api/bot/heartbeat`) تُبقي الخدمة صاحية عمليًا، لكن أضف خدمة `UptimeRobot` على `/health` كل 5 دقائق إن أردت ضمانًا إضافيًا.

## الخيار C: Koyeb أو Fly.io

نفس فكرة Render: أمر البناء `npm ci && npm run build`، وأمر التشغيل `node dist/apps/api/src/index.js`، مع تمرير `PORT` إن كانت المنصة تفرضه.

## الخيار D: Docker محليًا

`Dockerfile` الجذري يشغّل الـAPI والبوت معًا (`npm start` عبر `scripts/start-services.mjs`) وهو مناسب للتجربة المحلية وليس للنشر المجزّأ.

## ما يجب ألّا تفعله

- ❌ نشر الـAPI على Vercel (serverless): البث `text/event-stream` لا يعبر بروكسي Vercel، والمؤقتات الدورية (30 ثانية / 5 دقائق) لا تعمل في دوال متقطعة.
- ❌ الاعتماد على منفذ ثابت غير مُصرّح به: Discloud `TYPE=site` يفرض 8080، و Render/Koyeb يمرران `PORT` تلقائيًا (الكود يقرأ `PORT` ثم `API_PORT` ثم 3000).

## التحقق

```powershell
curl.exe -s https://<API-DOMAIN>/health            # {"ok":true,"service":"zark-api"}
curl.exe -s https://<API-DOMAIN>/api/status        # database + bot + realtime
curl.exe -s -o NUL -w "%{http_code}" https://<API-DOMAIN>/index.html   # 200 (الـAPI يخدم الموقع)
```

في `/api/status` يجب أن ترى:

```json
{"api":true,"database":true,"realtime":{"redisConfigured":true,"redisOnline":true},"bot":{"online":true}}
```
