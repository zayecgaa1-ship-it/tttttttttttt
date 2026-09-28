# 01 — قاعدة البيانات و Redis المستضافان

المشروع محليًا يستخدم Postgres وRedis على `localhost`، وكلاهما لا يمكن الوصول إليه من Vercel/Render/Wispbyte. لذلك أول خطوة هي إنشاء نسختين مستضافتين مجانيتين.

## 1) Postgres على Neon

### الطريقة الأسهل (موصى بها): إنشاؤه من داخل Vercel

1. Vercel → `Storage` (أو Marketplace) → **Neon** → `Create` → **Postgres** → المنطقة **Frankfurt** → `Create`.
2. اضغط `Connect` (أو تبويب `.env`) وانسخ `DATABASE_URL` — تكون بالشكل `postgresql://...?sslmode=require`.
3. نفس الشيء لـRedis: `Storage` → **Upstash** → `Create` → **Redis** → انسخ `REDIS_URL` (تبدأ بـ`rediss://`).

الميزة: القاعدة "من استضافة الموقع" كما تريد، والمتغيرات جاهزة للنسخ، وبدون فتح حسابات إضافية.

### الطريقة اليدوية (نفس النتيجة)

1. أنشئ حسابًا على <https://neon.tech> ثم `New Project` (اختر أقرب منطقة لك).
2. انسخ سلسلة الاتصال من `Connection string` بالشكل:

```text
postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
```

> Railway/Supabase يفيان بالغرض أيضًا؛ المهم أن تكون السلسلة تدعم `sslmode=require`.

3. من جهازك، أنشئ الجداول في قاعدة البيانات السحابية:

```powershell
$env:DATABASE_URL='postgresql://...'   # نفس السلسلة السحابية
npm run db:push
```

`db:push` ينفّذ `safe-zark-series.sql` ثم `prisma db push` ويطابق المخطط كاملًا.

4. (اختياري) استرجاع بياناتك الحالية إلى القاعدة السحابية بدل البدء فارغًا:

```powershell
# يحتاج أداة psql من عميل Postgres
psql "$env:DATABASE_URL" -f zark_database_backup.sql
npm run db:push
```

> تحذير: البوت والـAPI المحليان يستخدمان قاعدة `localhost`؛ لا تدمج عمليات كتابة من الجهاز والاستضافة على نفس القاعدة في نفس الوقت.

## 2) Redis على Upstash

Redis مطلوب؛ إن غاب يعمل النظام ببطء وبسلوك مختلف: مؤقتات الإشعارات، حد المعدل، وحدث البث بين النسخ (`zark:events`) كلها تعتمد عليه.

1. أنشئ قاعدة على <https://upstash.com> → `Create Database` (نوع Regional، تشفير TLS مفعّل).
2. انسخ `UPSTASH_REDIS_URL` بالشكل `rediss://default:<password>@<host>:<port>`.
3. الـAPI والبوت يستخدمان نفس القيمة في `REDIS_URL` — هذا ما يجعل البث المباشر في الموقع يرى أحداث البوت فورًا.

> حدود Upstash المجانية كافية: الـAPI يفتح اتصالين (نشر + اشتراك) والبوت اتصال اشتراك واحد.

## 3) ما يأتي بعد ذلك

| المتغير | القيمة |
| --- | --- |
| `DATABASE_URL` | سلسلة Neon (تُوضع في الـAPI فقط + جهازك للأوامر الإدارية) |
| `REDIS_URL` | سلسلة Upstash (`rediss://...`) في الـAPI **والبوت** |

- البوت لا يحتاج `DATABASE_URL` إلا لـ`npm run db:push`؛ حزمة البوت تستخدم Prisma Client نفسه المولّد وقت التثبيت (`postinstall`).
  عمليًا: ضع `DATABASE_URL` في حزمة البوت أيضًا حتى يعمل أي فحص سريع دون أخطاء.
- الـAPI هو من ينشئ البوتات ويقرأ القاعدة، لذا حرّص على تطابق المخطط مع المخطط السحابي: بعد أي تعديل على `packages/db/prisma/schema.prisma` شغّل `npm run db:push` على القاعدة السحابية.

## تحقق سريع

```powershell
$env:DATABASE_URL='...'; npx prisma db execute --stdin --schema packages/db/prisma/schema.prisma
# أو ببساطة: شغّل الـAPI المحلي بسلسلة Neon وافتح /api/status → database=true
```
