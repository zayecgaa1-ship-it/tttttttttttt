# 05 — متغيرات البيئة والربط بين الأطراف

كل الربط بين الموقع والـAPI والبوت يحدث عبر متغيرات البيئة. هذا الجدول هو المرجع الوحيد المطلوب عند النشر.

## الجدول الكامل

| المتغير | الـAPI | البوت | Vercel | الوصف |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✅ إلزامي | ⚪ اختياري | ❌ | سلسلة Postgres السحابية (Neon/Supabase). |
| `REDIS_URL` | ✅ إلزامي عمليًا | ✅ إلزامي عمليًا | ❌ | `rediss://` من Upstash؛ يجعل أحداث البوت تصل للموقع فورًا. |
| `INTERNAL_API_KEY` | ✅ إلزامي | ✅ إلزامي | ❌ | سر طويل عشوائي، **نفس القيمة** في الطرفين (ترويسة `x-zark-service-key`). |
| `INTERNAL_API_URL` | ❌ | ✅ إلزامي | ❌ | عنوان الـAPI العام الذي يخاطبه البوت. |
| `PUBLIC_API_URL` | ⚪ | ⚪ | ❌ | عنوان الـAPI العام (روابط عامة). |
| `PUBLIC_SITE_URL` | ✅ | ⚪ | ❌ | نطاق الموقع، يُستخدم في المشاركات والروابط. |
| `PUBLIC_SITE_ORIGINS` | ✅ إلزامي | ❌ | ❌ | قائمة أصول الموقع مفصولة بفواصل (CORS + فحص الأصل + CORS للبث). |
| `DISCORD_REDIRECT_URI` | ✅ إلزامي | ❌ | ❌ | `https://<site-domain>/auth/discord/callback` ويجب أن يطابق Discord Portal. |
| `SESSION_SECRET` | ✅ إلزامي | ❌ | ❌ | ≥ 32 حرفًا عشوائيًا (توقيع جلسات Discord). |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | ✅ إلزامي | ❌ | ❌ | من Discord Developer Portal (تسجيل الدخول بالموقع). |
| `DISCORD_TOKEN` | ⚪ (إحصاء الأعضاء) | ✅ إلزامي | ❌ | توكن البوت. |
| `DISCORD_GUILD_ID` | ✅ إلزامي | ✅ إلزامي | ❌ | معرّف السيرفر. |
| `DISCORD_*_CHANNEL_ID` | ⚪ | ⚪ | ❌ | قنوات الإعلانات/LFG/التبليغات (اختيارية). |
| `ADMIN_ROLE_IDS` | ✅ | ✅ | ❌ | رتب الإدارة (مفصولة بفواصل). |
| `DISCORD_OWNER_ID` | ✅ | ✅ | ❌ | المالك الفائق (تحقق من الخادم). |
| `ZARK_TAGLINE` | ⚪ | ⚪ | ❌ | شعار النصوص/البطاقات. |
| `MAX_SSE_CLIENTS` | ⚪ | ❌ | ❌ | حد اتصالات البث (افتراضي 500). |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | ⚪ | ❌ | ❌ | مساعد 3Pal الذكي (اختياري مع تحويل تلقائي). |
| `NODE_ENV` | ✅ `production` | ⚪ | ❌ | يجعل كوكي الجلسة `Secure`. |
| `COOKIE_SAME_SITE` | ⚪ | ❌ | ❌ | `lax` افتراضيًا؛ `none` فقط عند ربط الواجهة بالـAPI مباشرة بدون بروكسي. |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | ⚪ `1` | ❌ | ❌ | يمنع تنزيل متصفحات الفحص في الاستضافة. |
| `PRISMA_HIDE_UPDATE_MESSAGE` | ⚪ `1` | ⚪ `1` | ❌ | تقليل ضجيج السجلات. |

## كيف يترابطون فعليًا؟

```text
المتصفح ──(rewrites: نفس الأصل)──▶ API ──(Postgres/Redis)──▶ البيانات
   │                                 ▲
   └──(config.js: SSE مباشر)─────────┘
                                     │
                             البوت ──┘  INTERNAL_API_URL + INTERNAL_API_KEY
```

1. **Vercel ← API:** `rewrites` في `vercel.json` + عنوان البث في `config.js`. لا يحتاج الموقع أي متغير بيئة.
2. **API ← البوت:** `PUBLIC_SITE_ORIGINS` + `DISCORD_REDIRECT_URI`.
3. **البوت ← API:** `INTERNAL_API_URL` + `INTERNAL_API_KEY` (نفس القيمة تمامًا).
4. **الاثنان ← البيانات:** نفس `DATABASE_URL` ونفس `REDIS_URL` → بث فوري + عدم تكرار الإشعارات.

## نصائح أمنية

- `.env` و`.env.deploy-*` مستثناة من Git؛ لا ترفعها إلى مستودع عام.
- ولّد `INTERNAL_API_KEY` و`SESSION_SECRET` بأمر واحد:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

- بدّل التوكن/الأسرار فورًا إن ظهرت في سجل أو لقطة شاشة.
