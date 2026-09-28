# 07 — نشر البوت على Discloud (بديل)

> الوجهة المختارة للبوت حاليًا هي **Wispbyte** → [03-wispbyte-bot.md](03-wispbyte-bot.md). يبقى هذا الملف للرجوع إليه إن أردت Discloud.

حزمة البوت مستقلة تمامًا: لا تحتوي الموقع ولا `apps/api`، ولا تشمل `playwright` (أداة فحص محلية فقط).

## 1) تجهيز الحزمة

```powershell
Copy-Item .env.deploy-bot.example .env.deploy-bot   # ثم عدّل القيم
npm run pack:bot
```

الناتج: `deploy/3pal-bot.zip` بمحتوى:

```text
discloud.config        # إعدادات Discloud
.discloudignore        # ما لا يُرفع
.env                   # نسخة من .env.deploy-bot (تُنشأ أثناء التغليف)
package.json           # اعتماديات التشغيل فقط: discord.js, redis, sharp, dotenv, zod
dist/apps/bot/**       # كود البوت مترجمًا
dist/packages/**       # الحزم المشتركة (shared/games/fun) — بدون db وبدون ملفات فحص
apps/bot/src/fonts/NotoSansArabic.ttf          # تُقرأ من process.cwd()
apps/web/public/assets/3pal-game-card-bg.png   # خلفية بطاقة الحالة
```

لا Prisma في حزمة البوت: كل نداءاته للـAPI عبر HTTP، فلا يحتاج قاعدة البيانات ولا محرّك الاستعلامات (أخف وأقل ذاكرة — المهم على Wispbyte بذاكرة 512MB).

`discloud.config` المضمّن:

```ini
NAME=3PAL Bot
TYPE=bot
MAIN=dist/apps/bot/src/index.js
RAM=1024
VERSION=latest
START=npm run start
```

- `RAM=1024` كافية لـ`sharp` أثناء توليد البطاقات؛ إن واجهت إعادة تشغيل متكررة ارفعها إلى 2048.
- `AUTORESTART=true` متاح لخطة Platinum فأعلى؛ يمكن إضافته يدويًا بعد الرفع.

## 2) الرفع

- **من لوحة Discloud:** Applications → Upload → اختر `3pal-bot.zip`، وأضف الأسرار في خطوة Environment variables إن لم تكن داخل الحزمة.
- **من GitHub Integration:** اربط المستودع والفرع، وأضف نفس الأسرار من الواجهة (Discloud يولّد `.env` وقت التشغيل). ملاحظة: هذا الوضع يرفع المستودع كاملًا ويقرأ `discloud.config` من الجذر — وهو ملف خاص بالـAPI هنا، لذا الأفضل الرفع بالـZIP أو استخدام حزمة البوت مع رفعها يدويًا.

## 3) الربط بالـAPI (أهم خطوة)

| المتغير | القيمة | لماذا |
| --- | --- | --- |
| `INTERNAL_API_URL` | `https://<API-DOMAIN>` | كل نداءات البوت للـAPI (بطاقة الحالة، الغرف، الحماية، heartbeat). |
| `INTERNAL_API_KEY` | نفس قيمة الـAPI | ترويسة `x-zark-service-key` للعمليات الداخلية. |
| `PUBLIC_API_URL` | `https://<API-DOMAIN>` | تستخدمه الوظائف التي تحتاج عنوانًا عامًا. |
| `REDIS_URL` | `rediss://...` (Upstash) | اشتراك البوت بأحداث `zark:events` القادمة من الـAPI. |
| `DATABASE_URL` | ❌ غير مطلوب | البوت لا يلمس قاعدة البيانات؛ كل عملياته عبر الـAPI. |
| `DISCORD_TOKEN` | توكن البوت | الدخول. |
| `DISCORD_GUILD_ID` | سيرفرك | كل عمليات السيرفر. |

معظم متغيرات `DISCORD_*` الأخرى اختيارية (قنوات الإعلانات، LFG، التبليغات). القائمة أشمل في [05-linking-env.md](05-linking-env.md).

## 4) التحقق

1. من لوحة Discloud: حالة التطبيق `Running` وقراءة السجلات مباشرة (Discloud يعرض stdout تلقائيًا).
2. `curl.exe -s https://<API-DOMAIN>/api/status` → يجب أن يظهر:

```json
{"api":true,"database":true,"bot":{"online":true,"lastSeenAt":"..."}}
```

3. `online=true` تعني أن البوت يرسل `POST /api/bot/heartbeat` بنجاح كل 25 ثانية.
4. في Discord: أرسل `@3Pal` في قناة عامة → بطاقة الحالة تُنشر تلقائيًا.

## 5) التحديثات

- بعد أي تعديل على كود البوت/الحزم: `npm run pack:bot` ثم أعد رفع الـZIP الجديد من لوحة Discloud (`Restart`/`Update`).
- لا حاجة لإعادة تغليف البوت عند تعديل `packages/db/prisma/schema.prisma`: البوت لا يستخدم Prisma — المخطط يخصّ الـAPI وحده (`npm run db:push` على القاعدة السحابية).

## 6) عند الأعطال

| العرض | السبب الأرجح |
| --- | --- |
| `401` في نداءات الـAPI من البوت | `INTERNAL_API_KEY` مختلف بين الطرفين. |
| `ECONNREFUSED`/`ENOTFOUND` | `INTERNAL_API_URL` فارغ أو الـAPI متوقف. |
| لا تحديث فوري في الموقع | `REDIS_URL` غير مضبوط في البوت أو في الـAPI. |
| `Missing Access`/`Unknown Channel` | تأكد أن البوت في السيرفر الصحيح وأن معرّفات القنوات من نفس السيرفر. |

> في حزمة البوت لا يوجد `tsx` ولا `typescript` ولا `prisma`: التشغيل يتم على `node dist/...` مباشرة، وهذا ما يجعل الإقلاع أسرع وأكثر ثباتًا على استضافة البوت.
