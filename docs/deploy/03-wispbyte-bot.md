# 03 — نشر البوت على Wispbyte

[Wispbyte](https://wispbyte.com) استضافة مجانية بدون بطاقة تشغّل حاويات Node.js على مدار الساعة، والخطة المجانية تعطي **512MB ذاكرة** لكل سيرفر. البوت هنا مستقل تمامًا: لا يحتوي الموقع ولا `apps/api`، و`playwright` غير مضمّن (أداة فحص محلية فقط).

> هذه هي الوجهة المختارة للبوت. البديل (Discloud) في [07-discloud-bot.md](07-discloud-bot.md).

## 1) تجهيز الحزمة

```powershell
Copy-Item .env.deploy-bot.example .env.deploy-bot   # ثم عدّل القيم
npm run pack:bot
```

الناتج: `deploy/3pal-bot.zip` بمحتوى:

```text
.env                   # نسخة من .env.deploy-bot (تُنشأ أثناء التغليف)
package.json           # اعتماديات التشغيل فقط: discord.js, redis, sharp, dotenv, zod
dist/apps/bot/**       # كود البوت مترجمًا
dist/packages/**       # الحزم المشتركة (shared/games/fun) — بدون db وبدون ملفات فحص
apps/bot/src/fonts/NotoSansArabic.ttf          # تُقرأ من process.cwd()
apps/web/public/assets/3pal-game-card-bg.png   # خلفية بطاقة الحالة
discloud.config + .discloudignore              # ملفان خاصان بـDiscloud — تجاهلهما على Wispbyte
```

- **لا Prisma في حزمة البوت:** كل نداءات البوت تمر عبر الـAPI (`INTERNAL_API_URL` + `INTERNAL_API_KEY`)، فهو لا يلمس قاعدة البيانات أصلًا. حذف Prisma يوفّر مساحة، والأهم **ذاكرة** على حاوية 512MB.
- **لا `node_modules` في الحزمة:** Wispbyte يثبّت الاعتماديات تلقائيًا في كل إقلاع عند وجود `package.json` (و`package.json` المولّد بلا `devDependencies`).

## 2) إنشاء السيرفر

1. <https://wispbyte.com/client> → سجّل (بريد إلكتروني، أو Discord/Google/GitHub).
2. `Create Server` → اكتب الاسم والوصف → اختر **Free Plan** → **Docker image = Node.js** → `Submit`.
3. انتظر دقيقة حتى يظهر السيرفر في اللوحة.

> حساب مجاني واحد لكل شخص، وبوت Discord واحد لكل سيرفر — تعدد الحسابات أو تشغيل أكثر من بوت على نفس السيرفر مخالف لسياسة الاستخدام.

## 3) رفع الحزمة

لا يوجد SSH في الخطة المجانية: كل شي من **Files** في اللوحة.

1. افتح السيرفر → `Files`.
2. `Upload` → اختر `deploy/3pal-bot.zip`.
3. بعد اكتمال الرفع اضغط زر **Unarchive** (فك الضغط) **في جذر السيرفر**.
4. تأكد أن الجذر يحتوي: `package.json`، `dist/`، `apps/`، و`.env`. إن فُكّ الضغط داخل مجلد فرعي، انقل محتواه إلى الجذر (تحديد الكل → `Move`).
5. إن لم يظهر `.env` (بعض اللوحات تُخفي الملفات النقطية) لا مشكلة — أضف المتغيرات من `Startup` كما في القسم التالي.

> بديل متقدم عند فشل الرفع/الفك: `GitHub` في الشريط الجانبي → اربط المستودع والفرع → `Clone`. هذا الوضع يجلب الكود المصدري TypeScript، لذا يجب أن يبني أولًا داخل أمر التشغيل (انظر البديل في القسم 4) ويحتاج ذاكرة أكبر.

## 4) إعداد Startup

من الشريط الجانبي: `Startup`.

| الحقل | القيمة |
| --- | --- |
| `Docker Image` | Node.js |
| `JS_FILE` | `dist/apps/bot/src/index.js` |
| `Startup Command` | اتركه **الافتراضي** |
| `Additional Node.js Packages` | اتركه **فارغًا** |

أمر Wispbyte الافتراضي (للمرجع — لا تحتاج تعديله):

```bash
if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/node /home/container/{{JS_FILE}}
```

هذا الأمر يشرح لماذا لا تحتاج أي شي إضافي: `npm install` يعمل تلقائيًا (الأسطر الوسطى) ثم يشغّل `node` على ملف `JS_FILE` (اضغط `Ctrl+S` بعد أي تعديل، و`Reset to Default` يعيد الأمر الأصلي).

**البديل الصريح** (تثبيت أخف بسقف ذاكرة مناسب لـ512MB — وبه لا تحتاج ضبط `JS_FILE`):

```bash
if [ -f /home/container/package.json ]; then /usr/local/bin/npm install --omit=dev; fi; /usr/local/bin/node --max-old-space-size=384 /home/container/dist/apps/bot/src/index.js
```

> `--max-old-space-size=384` يمنع قتل العملية (OOM kill) لأن Node لا يقرأ حدود الحاوية تلقائيًا.

**متغيرات البيئة:** مُضمّنة أصلًا في `.env` داخل الحزمة فلا تفعل شيئًا. لتبديل قيمة سريعة دون إعادة رفع الحزمة، أضفها في `Startup → Server Configuration` — **متغيرات اللوحة تتقدّم على `.env`** (dotenv لا يستبدل متغيرًا موجودًا في البيئة). الحد الأدنى:

```text
DISCORD_TOKEN=<توكن البوت>
DISCORD_GUILD_ID=<معرّف السيرفر>
DISCORD_CLIENT_ID=<معرّف التطبيق>
INTERNAL_API_URL=https://<API-DOMAIN>      # نفس عنوان Render
INTERNAL_API_KEY=<نفس قيمة الـAPI>
PUBLIC_API_URL=https://<API-DOMAIN>
REDIS_URL=rediss://...                     # Upstash: البوت يشترك بأحداث الـAPI
PUBLIC_SITE_URL=https://<SITE-DOMAIN>      # يظهر في الروابط داخل الرسائل
ADMIN_ROLE_IDS=<رتب الإدارة مفصولة بفواصل>
```

لا تضبط `PORT` ولا أي منفذ: البوت لا يفتح منفذًا (لا سيرفر HTTP فيه).

## 5) الإقلاع والتحقق

1. `Console` → `Start`.
2. في السجل: تثبيت الاعتماديات ثم رسالة تسجيل الدخول، بلا `Cannot find module`.
3. من جهازك: `curl.exe -s https://<API-DOMAIN>/api/status` → يجب أن يظهر `"bot":{"online":true}` أي أن نبضة البوت (`POST /api/bot/heartbeat` كل 25 ثانية) تصل، وهي نفسها تمنع خدمة Render المجانية من النوم.
4. في Discord: أرسل `@3Pal` في قناة عامة → بطاقة الحالة تُنشر تلقائيًا.

## 6) التحديثات

بعد أي تعديل على كود البوت أو الحزم: `npm run pack:bot` → `Stop` السيرفر → ارفع الـZIP الجديد → `Unarchive` (يستبدل الملفات) → `Start`.

## 7) عند الأعطال

| العرض | السبب الأرجح | الحل |
| --- | --- | --- |
| `Missing main file` | `JS_FILE` غير مضبوط | ضعه `dist/apps/bot/src/index.js`، أو استخدم **Use on startup** على ملف الـentry من `Files` |
| `Cannot find module ...` | الرفع ناقص أو الملفات داخل مجلد فرعي | تأكد أن `package.json` و`dist/` في الجذر ثم `Start` |
| إعادة تشغيل متكررة أو قتل العملية | 512MB ضيقة (sharp + discord.js) | استخدم أمر التشغيل البديل بـ`--max-old-space-size=384`، أو خطة مدفوعة |
| `401` في نداءات الـAPI من البوت | `INTERNAL_API_KEY` مختلف بين الطرفين | نفس القيمة تمامًا في الـAPI والبوت |
| `ECONNREFUSED` / `ENOTFOUND` | `INTERNAL_API_URL` خطأ أو الـAPI نائم | صحّح العنوان؛ أول نداء بعد خمول يستغرق 30–60 ث ثم يعمل |
| البوت توقّف بعد أسابيع بلا دخول | السيرفرات المجانية تُؤرشف بعد شهر بلا دخول للوحة | ادخل للوحة — يعود السيرفر مباشرة |
| تحذيرات rate limit من Discord | الخطة المجانية على عنوان IP مشترك | تنبيه من Wispbyte نفسها؛ التخفيف: خطة مدفوعة (IPv4 خاص) |
| لا تحديث فوري في الموقع | `REDIS_URL` ناقص في البوت | أضف نفس `REDIS_URL` (Upstash) |

## 8) الفرق عن Discloud في سطر واحد

Discloud يقرأ `discloud.config` ويثبّت الاعتماديات عند الرفع، أما Wispbyte فيشغّل `npm install` من `package.json` في كل إقلاع ويأخذ ملف التشغيل من `JS_FILE` — نفس الحزمة تعمل على الاثنين.

