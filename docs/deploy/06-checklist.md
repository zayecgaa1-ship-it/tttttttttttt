# 06 — قائمة التحقق قبل الإعلان

## أ) قبل النشر (محليًا)

```powershell
npm run check          # فحص TypeScript
npm test               # 117 اختبارًا
npm run pack:deploy    # يبني ويجهّز الحزم الثلاث
```

- [ ] `db:push` نُفّذ على القاعدة السحابية وبدون أخطاء.
- [ ] `deploy/3pal-bot.zip` و`deploy/3pal-api.zip` جديدان (تاريخ اليوم).
- [ ] `deploy/build/3pal-site/config.js` يحتوي عنوان الـAPI الصحيح.
- [ ] `vercel.json` محدّث بعنوان الـAPI في `rewrites` و`connect-src`.

## ب) الـAPI

- [ ] `GET /health` → `{"ok":true,"service":"zark-api"}`.
- [ ] `GET /api/status` → `"database":true`.
- [ ] `GET /api/status` → `"realtime":{"redisConfigured":true,"redisOnline":true}`.
- [ ] `GET /index.html` يعيد 200 (الـAPI يخدم الموقع).
- [ ] `POST` محمي من مصدر غير مسجّل يعيد 403 (فحص الأصل).

## ج) Vercel

- [ ] `/index.html` يعيد 200 من نطاق Vercel.
- [ ] `/health` من نطاق Vercel يعيد `{"ok":true}` (يعني `rewrites` تعمل).
- [ ] `/auth/discord/login` يفتح صفحة Discord.
- [ ] تسجيل الدخول يعود إلى `/auth/discord/callback` ثم للموقع وهو مسجّل (الكوكي يعمل).
- [ ] فتح صفحة الغرف يعرض بيانات حقيقية، ولا أخطاء CORS في Console.

## د) البوت

- [ ] حالة التطبيق في Discloud `Running` دون إعادة تشغيل متكرر.
- [ ] `/api/status` → `"bot":{"online":true}`.
- [ ] `@3Pal` في قناة عامة ينشر بطاقة الحالة تلقائيًا.
- [ ] `/modo` أو `/lfg rooms` يعمل (يعني الوصول للـAPI والقنوات سليم).
- [ ] سجل Discloud بلا `401` ولا `ECONNREFUSED`.

## هـ) البث المباشر

- [ ] في Console المتصفح: `new EventSource("<API-DOMAIN>/api/stream")` يفتح بحالة OPEN ولا يظهر خطأ CORS.
- [ ] إنشاء غرفة من الموقع يحدّث الصفحة فورًا في متصفح آخر (بلا تحديث يدوي).

## و) ما بعد الإطلاق

- [ ] نسخة احتياطية دورية من Postgres السحابي.
- [ ] تبديل `INTERNAL_API_KEY`/`SESSION_SECRET` قبل الإعلان الرسمي إن كانت تجريبية.
- [ ] مراقبة `/health` من خدمة خارجية (UptimeRobot) على الأقل كل 5 دقائق.
- [ ] تحديث Discord Portal بـ`Redirect URI` النهائي للنطاق الرسمي.
