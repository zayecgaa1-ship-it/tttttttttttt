# نشر 3PAL — موقع على Vercel + بوت على Discloud

تم تقصيم المشروع إلى ثلاث حزم مستقلة يبنيها سكربت واحد، وترتبط ببعضها عبر متغيرات البيئة فقط.

## المعمارية

```text
┌───────────────────────────────┐
│ Vercel: الموقع الثابت          │  apps/web/public (HTML/CSS/JS)
│ https://<project>.vercel.app  │
└──────┬───────────────┬────────┘
       │ rewrites      │ SSE مباشر (/api/stream)
       │ /api /auth /trade /health
       ▼               ▼
┌───────────────────────────────┐      ┌──────────────────────────────┐
│ API (Fastify) — استضافة مستمرة │◄─────┤ Discloud: البوت (TYPE=bot)    │
│ منفذ 8080 + Prisma + Redis     │      │ discord.js يعمل 24/7          │
└──────┬───────────────┬────────┘      └──────────────────────────────┘
       │               │
  Postgres (Neon)   Redis (Upstash)
```

- **الموقع (Vercel):** ملفات ثابتة فقط — بدون بناء ولا اعتماديات.
- **الـAPI:** خدمة Fastify مستمرة (Prisma + Redis + صور `sharp` + مؤقتات دورة حياة الغرف + بث SSE).
- **البوت (Discloud):** discord.js يعمل 24/7 ويخاطب الـAPI في كل عملية (بطاقة الحالة، الغرف، LFG، الحماية...).
- **الربط:** كل طرف يعرف الآخر بمتغيرات بيئة فقط: `PUBLIC_SITE_ORIGINS` (CORS)، `INTERNAL_API_URL` + `INTERNAL_API_KEY` (البوت ← الـAPI)، `DISCORD_REDIRECT_URI` (تسجيل الدخول)، وعنوان الـAPI داخل `config.js` (الموقع ← البث المباشر).

## لماذا الـAPI ليس على Vercel؟

Vercel لا يصلح لهذه الخدمة: بروكسي Vercel لا يمرّر `text/event-stream` (والبث المباشر موجود في `/api/stream`)، وحدّ زمن تنفيذ الدوال يقطع الاتصالات الطويلة، ومؤقتات الـAPI (دورة حياة غرف LFG كل 30 ثانية، الغرف الذكية كل 5 دقائق، انتهاء التبادلات وخلفياتها، تنظيف السجلات) تحتاج عملية مستمرة. لذلك: **الموقع وحده على Vercel**، والـAPI على استضافة مستمرة (Discloud `TYPE=site` أو Render/Koyeb).

## الحزم الثلاث

| الحزمة | الأمر | مكان النشر | المحتوى |
| --- | --- | --- | --- |
| `deploy/3pal-bot.zip` | `npm run pack:bot` | Discloud (`TYPE=bot`) | `dist/apps/bot` + `dist/packages` + الخط العربي + خلفية البطاقة + `schema.prisma` |
| `deploy/3pal-api.zip` | `npm run pack:api` | Discloud (`TYPE=site`) أو Render/Koyeb | `dist/apps/api` + `dist/packages` + الموقع الثابت + `schema.prisma` |
| `deploy/build/3pal-site/` | `npm run pack:site` | Vercel | ملفات الموقع + `config.js` + `vercel.json` مضبوط على عنوان الـAPI |
| الثلاثة معًا | `npm run pack:deploy` | — | — |

`pack:bot` و`pack:api` يشغّلان `npm run build` تلقائيًا قبل التغليف، ويقبلان:

```bash
npm run pack:api -- --env .env.deploy-api            # ملف أسرار النشر (اختياري)
npm run pack:site -- --api-url https://3pal-api.discloud.app
```

## ترتيب الإطلاق

1. Postgres + Redis مستضافان → [01-databases.md](01-databases.md)
2. الـAPI على استضافة مستمرة → [04-api-hosting.md](04-api-hosting.md)
3. الموقع على Vercel وربطه بعنوان الـAPI → [02-vercel-site.md](02-vercel-site.md)
4. البوت على Discloud وربطه بعنوان الـAPI → [03-discloud-bot.md](03-discloud-bot.md)
5. جدول متغيرات الربط لكل طرف → [05-linking-env.md](05-linking-env.md)
6. تحقق نهائي قبل الإعلان → [06-checklist.md](06-checklist.md)

> `apps/web/public/config.js` هو ملف إعدادات الواجهة الذي يحمل عنوان الـAPI للبث المباشر، ويُحقن تلقائيًا في الحزمة عبر `npm run pack:site`.
