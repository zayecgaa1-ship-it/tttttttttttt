# Zark LFG System

نظام عربي موحّد لألعاب Discord والعثور على لاعبين، مبني حول قاعدة واحدة مشتركة بين البوت والموقع.

> Zark LFG System — فريقك أقرب مما تتخيل.

## ما يعمل في النسخة الحالية

### نظام LFG

- كتالوج 24 لعبة خارجية ضمن 9 تصنيفات، وقابل للإضافة من لوحة الإدارة.
- إنشاء الغرفة بعدد لاعبين ومدة وGame Mode ووصف وVoice اختياري.
- Text + Voice خاصان لكل غرفة مع حفظ IDs والاستعادة بعد Restart.
- عرض أسماء أعضاء الغرفة وحالة وجودهم في Voice بالموقع وDiscord.
- بدء اللعب عند اجتماع لاعبين في Voice، وإنهاء الجلسة حسب المدة أو بعد خروج الجميع ومهلة آمنة.
- تحكم Host من الموقع: العنوان والرمز واللون والوصف والعدد والمدة والقفل والبدء والإنهاء.
- دخول وخروج ذري باستخدام Serializable transactions وretry.
- منع تجاوز العدد والتكرار.
- نقل Host تلقائيًا إلى أقدم عضو عند خروجه.
- نقاط Engagement بعد إكمال جلسة فعلية فقط.
- اهتمامات وإشعارات منفصلة لكل لعبة.
- دعوات DM للمهتمين مع دخول، تجاهل، كتم وغير مهتم.
- تقييم لاعب بعد جلسة مكتملة.
- تذاكر بلاغات وأخطاء مع محادثة خاصة بين المشتكي والإدارة وتنبيه Discord عند الإنشاء.
- Presence للتذكرة: لا يرسل DM أثناء مشاهدة العضو، ويرسل تنبيهًا واحدًا فقط بعد خروجه حتى يقرأ الرد.
- تستطيع الإدارة حذف التذكرة ومحادثتها نهائيًا؛ يبقى فقط عداد تاريخي لعدد البلاغات التي قدّمها العضو.
- Profile موحد وأفضل لاعبي LFG، مع تخصيص الملف والخصوصية ووقت Voice.

### ألعاب Zark

- `/play` مع اختيار اللعبة وعدد اختياري من الجولات: 2 أو 3 أو 4 أو 5 أو 10.
- قفل PostgreSQL فريد لكل قناة يمنع تشغيل لعبة ثانية حتى تنتهي المباراة، مع انتقال تلقائي بين الجولات وترتيب نهائي.
- أوامر عربية مختصرة: `.اعلام` و`.اسرع` و`.ترجم` و`.عواصم` و`.ترتيب` و`.حساب` و`.ايموجي` و`.انمي`.
- ترجم، أعلام، عواصم، أسرع كتابة، إكمل الكلمة، ترتيب الجملة، حساب سريع، خمن الإيموجي، صح أو خطأ، ترتيب الحروف، من أنا ومعلومات عامة.
- ألعاب بصرية مدعومة من بنك أسئلة قاعدة البيانات: شعارات السيارات، شعارات الشركات وبطل الأنمي.
- مطابقة عربية مرنة تقبل التشكيل و«الـ» والخطأ الخفيف في الكلمات الطويلة.
- أسرع كتابة تستخدم تطابقًا حرفيًا حتى تبقى عادلة.

### الموقع

- هوية أحمر/أسود/أبيض باسم Zark LFG System.
- الرئيسية والنشاط الحي.
- مساعد مجاني متعدد المزودين: Gemini ثم Groq ثم OpenRouter، مع رد محلي احتياطي وزر فحص شامل.
- غرف LFG مع فلاتر التصنيف.
- إنشاء ودخول وخروج من الموقع.
- ألعاب Zark.
- Profile موحد.
- Leaderboards لألعاب Zark والتفاعل والجلسات والتقييم.
- صفحة دعم وشكاوى مع مساعد ذكي يعمل محليًا بلا تكلفة، وربط OpenAI اختياري محمي بحدود يومية وحد أقصى لطول الرد.
- لوحة إدارة تظهر فقط للرتب المعتمدة، مع إحصائيات وإعدادات البوت والقنوات والإشعارات والحدود.
- إضافة ألعاب LFG والأسئلة البصرية من لوحة الإدارة.
- Discord OAuth2 وجلسة HttpOnly موقعة.
- صلاحيات لوحة الإدارة مبنية على `ADMIN_ROLE_IDS`.
- تغييرات إعدادات البوت تُحفظ في `GuildSettings` و`AuditLog` وتصل للبوت لحظيًا عبر Redis.
- يكتشف Zark رسالة نجاح `/bump` من DISBOARD ثم يذكّر `ADMIN_ROLE_IDS` بعد ساعتين بالضبط، وقفل PostgreSQL يمنع التكرار بعد إعادة التشغيل.
- منشن العضو يعرض حالته الحالية باحترام خصوصيته، وتظهر الحالة أيضًا داخل صورة وأمر `/profile`.

## أوامر Discord

```text
/daily
/play [game]
/profile [user]
/leaderboard [type]
/lfg create
/lfg profile [user]
/lfg top [metric]
/lfg rooms
/lfg interests
/lfg report user
/lfg bug
/lfg rate user room stars
```

## المعمارية

```text
Discord Bot ─┐
             ├── Central Fastify API ── PostgreSQL
Website ─────┘             │
                           └── Redis Pub/Sub ── SSE
```

- PostgreSQL هي Source of Truth.
- البوت والموقع يمران عبر API.
- Redis للمزامنة اللحظية وليس لحفظ الحالة الأساسية.

## إعداد البيئة

انسخ `.env.example` إلى `.env` واضبط:

لشرح قيم شاشة Suggested Variables في Railway راجع [docs/railway-variables.md](docs/railway-variables.md).

```text
DATABASE_URL
REDIS_URL
PUBLIC_API_URL
INTERNAL_API_URL (optional private/internal bot-to-API URL)
PUBLIC_SITE_ORIGINS
DISCORD_TOKEN
DISCORD_GUILD_ID
DISCORD_LFG_CATEGORY_ID
DISCORD_REPORT_CHANNEL_ID (قناة تنبيهات البلاغات، ويمكن تعديلها من لوحة الإدارة)
DISCORD_MEDIA_ALLOWED_CHANNEL_IDS (معرّفات قنوات الصور المسموحة فقط، مفصولة بفاصلة؛ يحذف البوت الصور من بقية القنوات)
DISCORD_BUMP_CHANNEL_ID (قناة تذكير /bump؛ عند تركها فارغة تُستخدم القناة العامة)
PUBLIC_SITE_URL (مثل https://zark-ps.com ويظهر داخل أزرار البوت)
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI
SESSION_SECRET
INTERNAL_API_KEY
ADMIN_ROLE_IDS
GEMINI_API_KEY + GEMINI_MODEL=gemini-2.5-flash (اختياري)
GROQ_API_KEY + GROQ_MODEL=openai/gpt-oss-20b (اختياري)
OPENROUTER_API_KEY + OPENROUTER_MODEL=openrouter/free (اختياري)
```

يكفي ضبط مفتاح واحد. يستخدم مساعد Zark السلسلة المجانية بالترتيب:
Gemini ثم Groq ثم OpenRouter Free، وعند فشلها كلها يبقى المساعد المحلي متاحًا.
المحادثة محصورة في تحيات بسيطة وأسئلة الموقع والبوت وLFG. يستطيع المستخدم تنفيذ
أوامر صريحة وآمنة من الشات مثل: `اعمل روم Minecraft لأربعة لاعبين` أو
`ابلغ عن 123456789012345678 سبب الإساءة`. البلاغ يفتح تذكرة خاصة يمكن للمشتكي
والإدارة متابعة محادثتها من الموقع، ويرسل البوت تنبيهًا إلى قناة البلاغات.

في Discord Developer Portal أضف Redirect URI نفسه الموجود في `DISCORD_REDIRECT_URI`، وفعل scopes:

```text
identify
guilds.members.read
```

## التشغيل

```bash
docker compose up -d
npm install
npm run db:generate
npm run db:push
npm run dev:api
npm run dev:bot
```

## التحقق

```bash
npm run check
npm test
npm run build
npm audit --omit=dev
```

## المراحل التي ما زالت تحتاج تنفيذًا

- Scheduled LFG والتذكير قبل 10 دقائق.
- Anti-AFK متقدم؛ التتبع الحالي لا يمنح Engagement اعتمادًا على الوقت وحده.
- Smart Ready Checks والغرف التلقائية.
- Quiet Hours وRate limits موزعة على Redis (حد الإشعارات اليومي وCooldown اللعبة مطبقان حاليًا في PostgreSQL).
- المواسم والأدوار الأسبوعية والإنجازات الاجتماعية.
- Mafia والكراسي وParty وRival.
- Prisma migrations فعلية بدل `db push` قبل Production.

هذه الميزات يجب إضافتها تدريجيًا بعد اختبار PostgreSQL وRedis وDiscord فعليًا.
