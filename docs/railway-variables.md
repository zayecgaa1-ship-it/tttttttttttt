# متغيرات Railway لمشروع Zark

## المتغيرات المقترحة في شاشة Railway

| المتغير | ماذا تضع؟ |
| --- | --- |
| `RAILWAY_ENVIRONMENT_ID` | لا تضفه يدويًا؛ Railway ينشئه تلقائيًا. |
| `RAILWAY_PROJECT_ID` | لا تضفه يدويًا؛ Railway ينشئه تلقائيًا. |
| `DISCORD_DAILY_CHANNEL_ID` | اختياري: ID قناة تحدي اليوم والإعلانات اليومية. اتركه فارغًا إن لم تنشئ القناة. |
| `DISCORD_LFG_CATEGORY_ID` | اختياري: ID الـCategory التي ستحتوي غرف Text وVoice المؤقتة. يجب أن يكون Category ID وليس Channel ID. |
| `DISCORD_PUBLIC_CHANNEL_ID` | اختياري: ID قناة الإعلانات العامة وZark Live. |
| `INTERNAL_API_URL` | اتركه فارغًا ما دام البوت والـAPI في نفس Railway Service؛ النظام يستخدم `127.0.0.1` تلقائيًا. |
| `OPENAI_API_KEY` | احذفه من Suggested Variables؛ النظام المجاني لا يستخدم OpenAI المدفوع. |
| `OPENAI_MODEL` | احذفه من Suggested Variables. |
| `PRISMA_HIDE_UPDATE_MESSAGE` | ضع `1`. |

## AI المجاني مع التحويل التلقائي

يكفي مفتاح واحد، والأفضل إضافة الثلاثة لرفع الاستمرارية:

```text
GEMINI_API_KEY=ضع_مفتاح_Google_AI_Studio
GEMINI_MODEL=gemini-2.5-flash

GROQ_API_KEY=ضع_مفتاح_Groq
GROQ_MODEL=openai/gpt-oss-20b

OPENROUTER_API_KEY=ضع_مفتاح_OpenRouter
OPENROUTER_MODEL=openrouter/free
```

لا تضع علامات اقتباس حول المفاتيح، ولا تضف مسافة قبل المفتاح أو بعده. بعد الحفظ أعد نشر الخدمة، ثم افتح لوحة الإدارة واضغط **فحص جميع مزودي AI**.

ترتيب التحويل: Gemini ثم Groq ثم OpenRouter Free ثم مساعد Zark المحلي.
