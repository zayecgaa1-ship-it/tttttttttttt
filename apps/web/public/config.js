/**
 * إعدادات الواجهة لكل بيئة نشر (Vercel / استضافة الـAPI).
 *
 * __3PAL_API_BASE__:
 *   "" (الافتراضي) = الواجهة تتكلم مع نفس الأصل الذي يخدمها.
 *     - محليًا: الـAPI على localhost يخدم apps/web/public.
 *     - على Vercel: الـ`rewrites` في vercel.json تمرر /api/* و /auth/* و /trade/* إلى الـAPI.
 *   أصل الـAPI (مثال: "https://3pal-api.discloud.app") = كل طلبات الـAPI والبث المباشر تذهب
 *     مباشرة إلى الـAPI بدون وسيط. هذا الوضع يتطلب:
 *       1) إضافة أصل الموقع إلى PUBLIC_SITE_ORIGINS في الـAPI.
 *       2) تعيين COOKIE_SAME_SITE=none و NODE_ENV=production في الـAPI حتى تُرسل كوكيز الجلسة.
 *       3) إضافة أصل الـAPI إلى connect-src في ترويسة CSP الخاصة بالموقع.
 *
 * __3PAL_STREAM_BASE__:
 *   أصل بث SSE فقط (/api/stream). اتركه "" لاستخدام __3PAL_API_BASE__.
 *   استخدمه عندما تعمل الواجهة خلف وسيط (Vercel) لأن بروكسي Vercel لا يمرر text/event-stream،
 *   فيُوجَّه البث مباشرة إلى الـAPI مع بقاء بقية الطلبات على نفس الأصل (الكوكيز تبقى first-party).
 */
window.__3PAL_API_BASE__ = "";
window.__3PAL_STREAM_BASE__ = "";
