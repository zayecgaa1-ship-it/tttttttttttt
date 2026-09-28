# 02 — نشر الموقع على Vercel

الموقع ملفات ثابتة في `apps/web/public`، وكل ما يحتاجه هو أن تُوجَّه طلبات `/api/*`, `/auth/*`, `/trade/*`, `/health` إلى الـAPI.

## الطريقة A (موصى بها): رفع حزمة الموقع الجاهزة

`npm run pack:site -- --api-url https://<API-DOMAIN>` ينتج مجلدًا مستقلًا فيه الموقع + `config.js` مضبوطًا + `vercel.json`:

```powershell
npm run pack:site -- --api-url https://3pal-api.discloud.app
npx vercel --prod --cwd "deploy\build\3pal-site"
```

أو اربط المجلد بمشروع Vercel من لوحة التحكم (Framework = Other، بدون Build Command، Output Directory = الجذر).

## الطريقة B: النشر من نفس المستودع

1. Vercel → `Add New Project` → اختر مستودع GitHub.
2. الإعدادات:
   - **Framework Preset:** Other
   - **Root Directory:** الجذر (بدون تغيير)
   - **Build Command / Output Directory:** اتركهما كما في `vercel.json` (`apps/web/public`، بدون بناء ولا تثبيت اعتماديات).
3. قبل أول نشر، اضبط عنوان الـAPI في مكانين:
   - `vercel.json`: استبدل `https://3pal-api.discloud.app` في `rewrites` وفي ترويسة `Content-Security-Policy` (`connect-src`) بعنوان الـAPI الحقيقي.
   - `apps/web/public/config.js`: اجعل `window.__3PAL_STREAM_BASE__ = "https://<API-DOMAIN>"` (البث المباشر لا يعبر بروكسي Vercel).
4. كل `git push` على الفرع المرتبط يعيد النشر تلقائيًا.

## ماذا يفعل `vercel.json`؟

| الجزء | الغرض |
| --- | --- |
| `outputDirectory: apps/web/public` | تقديم الموقع كما هو، مع تجاوز `npm install` و`npm run build`. |
| `rewrites` | العبور بالـAPI: `/api/*` و`/auth/*` و`/trade/<id>` و`/health` → عنوان الـAPI (نفس الأصل ⇒ كوكيز الجلسة تبقى first-party). |
| `headers` (CSP…) | تكرار ترويسات الأمان التي يرسلها الـAPI عند خدمته للموقع، مع `connect-src` يتضمن عنوان الـAPI. |
| `headers /assets/*` | كاش سنة كاملة للأصول (مطابق لسلوك `@fastify/static`). |

## البث المباشر (SSE) — مهم

بروكسي Vercel لا يمرّر `text/event-stream`، لذلك:

- الطلبات العادية (البيانات، تسجيل الدخول، الغرف) تمر عبر `rewrites` بنفس الأصل.
- البث `/api/stream` يتصل مباشرة بالـAPI عبر القيمة في `config.js`، والـAPI يرد بترويسة CORS عندما يكون أصل الموقع ضمن `PUBLIC_SITE_ORIGINS`.

لو نسيت ضبط `PUBLIC_SITE_ORIGINS` في الـAPI، سيعمل الموقع كاملًا لكن التحديث الفوري (الغرف/اللوحة) لن يصل.

## النطاق وتسجيل الدخول

1. Vercel → Settings → Domains: أضف نطاقك (مثل `3pal.example`) ووجه CNAME/A حسب التعليمات.
2. في [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2 → Redirects أضف:

```text
https://<your-domain>/auth/discord/callback
https://<project>.vercel.app/auth/discord/callback
```

3. في الـAPI اضبط:

```text
PUBLIC_SITE_ORIGINS=https://<your-domain>,https://<project>.vercel.app
PUBLIC_SITE_URL=https://<your-domain>
DISCORD_REDIRECT_URI=https://<your-domain>/auth/discord/callback
```

> المسار `/auth/discord/callback` موجود في الـAPI، لكن Discord يعيد التوجيه إلى نطاق Vercel، والـ`rewrites` تمرّره إلى الـAPI — لذلك يجب أن تتطابق القيمة في `DISCORD_REDIRECT_URI` مع ما سجّلته في Discord بالحرف.

## فحوصات سريعة بعد النشر

```powershell
curl.exe -s https://<vercel-domain>/health                 # {"ok":true,"service":"zark-api"} عبر البروكسي
curl.exe -s -o NUL -w "%{http_code}" https://<vercel-domain>/index.html   # 200
```
