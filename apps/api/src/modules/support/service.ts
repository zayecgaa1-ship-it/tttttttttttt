import { db } from "../../../../../packages/db/src/client.js";
import { serializable } from "../../db-transaction.js";
import { enforceRateLimit } from "../../events.js";
import { getGuildRuntimeSettings } from "../admin/service.js";
import { createLfgRoom } from "../lfg/service.js";
import { reportPlayer } from "../feedback/service.js";

type AiProvider = "GEMINI" | "GROQ" | "OPENROUTER";
type AiAnswer = { answer?: string; inputTokens: number; outputTokens: number };
type PendingRoomRequest = { gameSlug: string; expiresAt: number };

// The site chat is intentionally stateless in the UI.  Keep a very short,
// server-side continuation so "اعملها من الموقع" can complete the game named
// in the immediately preceding message without guessing a different game.
const pendingRoomRequests = new Map<string, PendingRoomRequest>();

const knowledge = [
  { keywords: ["اوفلاين", "offline", "البوت", "متصل"], answer: "إذا ظهر Zark أوفلاين فتأكد أن PostgreSQL وRedis والـAPI شغالة، ثم شغّل البوت. لوحة الإدارة تعرض حالة البوت وآخر Heartbeat تلقائيًا." },
  { keywords: ["انضمام", "دخول", "join", "غرفه", "غرفة"], answer: "افتح صفحة LFG واختر غرفة ثم اضغط دخول. سيضيفك Zark للغرفة ويمنحك وصولًا إلى Text وVoice الخاصين بها فورًا." },
  { keywords: ["خروج", "leave", "الغاء", "إلغاء"], answer: "اضغط خروج من بطاقة الغرفة أو من لوحة Discord. إذا خرج المضيف تنتقل الإدارة تلقائيًا لأقدم عضو موجود." },
  { keywords: ["فويز", "فويس", "voice", "وقت"], answer: "يبدأ احتساب اللعب فقط داخل Voice التابع لغرفة Zark. عند وجود لاعبين اثنين يبدأ وضع Playing، وعند خروج الجميع تبدأ مهلة إغلاق آمنة." },
  { keywords: ["اشعار", "إشعار", "dm", "خاص", "مهتم"], answer: "من قسم الاهتمامات تستطيع تفعيل أو كتم إشعارات كل لعبة بشكل منفصل. زر تجاهل يتجاهل الدعوة الحالية فقط ولا يلغي اهتمامك." },
  { keywords: ["بلاغ", "شكوى", "report", "اساءه", "إساءة"], answer: "استخدم نموذج بلاغ لاعب واربطه برقم الغرفة إن أمكن. البلاغات سرية وتظهر للإدارة فقط، ويمكنك متابعة حالتها من صفحة الدعم." },
  { keywords: ["تقييم", "نجوم", "rating"], answer: "التقييم متاح فقط بعد جلسة مكتملة وبين لاعبين شاركا في نفس الجلسة. لا يمكن التقييم الذاتي أو تكرار التقييم لنفس الجلسة." },
  { keywords: ["ملف", "بروفايل", "profile", "خصوصيه", "خصوصية"], answer: "من صفحة ملفي تستطيع تعديل النبذة واللون وإخفاء نشاطك العام وإيقاف إشعارات المنافسة، بينما يبقى حساب Discord هو الهوية الأساسية." },
  { keywords: ["لعبه", "لعبة", "العاب", "ألعاب", "بحث"], answer: "استخدم البحث الذكي في صفحة LFG باسم اللعبة أو المضيف أو اللاعب أو Game Mode. ويمكن للإدارة إضافة ألعاب جديدة من لوحة التحكم دون تعديل الكود." },
];

const gameAliases: Record<string, string[]> = {
  minecraft: ["ماينكرافت", "ماين كرافت", "مينكرافت", "مابن كرافت", "مابنكرافت"],
  roblox: ["روبلوكس", "روب لوكس"],
  valorant: ["فالورانت", "فلورانت"],
  fortnite: ["فورتنايت", "فورت نايت"],
  rust: ["رست"],
  "gta-v": ["gta", "gta 5", "قراند", "جراند", "جراند ثفت اوتو"],
  "counter-strike-2": ["cs2", "كاونتر", "كاونتر سترايك"],
  "rocket-league": ["روكيت ليق", "روكيت ليج"],
  "league-of-legends": ["lol", "ليج اوف ليجندز"],
  "call-of-duty-warzone": ["وارزون", "كول اوف ديوتي"],
  "rainbow-six-siege": ["رينبو", "رينبو سكس"],
  "overwatch-2": ["اوفر واتش", "اوفر واتش 2"],
  "apex-legends": ["ايبكس", "ابكس ليجندز"],
};

export async function getSupportStatus(userId: string) {
  const settings = await getGuildRuntimeSettings();
  const usage = await db.aiUsageDaily.findUnique({ where: { userId_dayKey: { userId, dayKey: dayKey() } } });
  const providers = configuredAiProviders();
  const provider = providers[0];
  const aiConnected = providers.length > 0;
  return {
    enabled: settings.aiChatEnabled,
    mode: aiConnected ? "CONFIGURED" : "SMART_LOCAL",
    provider,
    providers,
    model: provider ? providerModel(provider) : null,
    setupRequired: providers.length === 0,
    requestsToday: usage?.requestCount ?? 0,
    messageLimit: settings.aiDailyMessagesPerUser,
    remainingMessages: Math.max(0, settings.aiDailyMessagesPerUser - (usage?.requestCount ?? 0)),
  };
}

export async function diagnoseSupportAi(adminId: string) {
  await enforceRateLimit("support-diagnostic", adminId, 5, 5 * 60);
  const providers = configuredAiProviders();
  if (!providers.length) return { configured: false, connected: false, provider: null, providers: [], code: "MISSING_KEYS", message: "أضف مفتاحًا واحدًا على الأقل: GEMINI_API_KEY أو GROQ_API_KEY أو OPENROUTER_API_KEY" };
  const results = [] as Array<{ provider: AiProvider; connected: boolean; code: string; message: string }>;
  for (const provider of providers) {
    try {
      const result = await askProvider(provider, "اختبار اتصال فقط. أجب بكلمة: متصل", "لا توجد حاجة لبيانات حية.", "متصل", 40);
      if (!result.answer) throw new Error("empty provider response");
      results.push({ provider, connected: true, code: "OK", message: `${provider} متصل` });
    } catch (error) {
      console.error(`Zark AI diagnostic failed for ${provider}`, error);
      const failure = aiFailure(error, provider);
      results.push({ provider, connected: false, code: failure.code, message: failure.message });
    }
  }
  const connected = results.some((result) => result.connected);
  return { configured: true, connected, provider: results.find((result) => result.connected)?.provider ?? providers[0], providers: results, code: connected ? "OK" : "ALL_PROVIDERS_FAILED", message: results.map((result) => `${result.connected ? "✅" : "❌"} ${result.provider}: ${result.connected ? "متصل" : result.message}`).join("\n") };
}

export async function askSupport(input: { userId: string; displayName: string; avatarUrl?: string; message: string }) {
  await enforceRateLimit("support-chat", input.userId, 15, 60);
  const settings = await getGuildRuntimeSettings();
  if (!settings.aiChatEnabled) throw new Error("مساعد Zark متوقف مؤقتًا من الإدارة");
  const message = input.message.trim().slice(0, 500);
  if (message.length < 2) throw new Error("اكتب سؤالك بشكل أوضح");
  await db.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName, avatarUrl: input.avatarUrl }, create: { id: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl } });
  await reserveDailyRequest(input.userId, settings.aiDailyMessagesPerUser, settings.aiGlobalDailyMessages);
  const context = await liveContext(message);
  const localAnswer = smartLocalAnswer(message, context);
  const action = await executeSupportAction(input, message, context);
  if (action) {
    const status = await getSupportStatus(input.userId);
    return { ...action, mode: "ACTION", provider: configuredAiProviders()[0] ?? null, remainingMessages: status.remainingMessages, messageLimit: status.messageLimit };
  }
  const scope = supportScope(message);
  if (scope === "CASUAL" || scope === "OUT_OF_SCOPE") {
    const status = await getSupportStatus(input.userId);
    return { answer: scope === "CASUAL" ? casualAnswer(input.displayName, message) : "أنا مساعد Zark المخصص للموقع والبوت وLFG فقط. اسألني عن الغرف، الألعاب، الأوامر، الإشعارات، الملف، التقييم أو البلاغات.", mode: "SMART_LOCAL", provider: null, setupRequired: configuredAiProviders().length === 0, aiError: false, remainingMessages: status.remainingMessages, messageLimit: status.messageLimit, suggestions: context.suggestions };
  }
  const providers = configuredAiProviders();
  if (!providers.length) {
    const status = await getSupportStatus(input.userId);
    return { answer: localAnswer, mode: "SMART_LOCAL", provider: null, setupRequired: true, aiError: false, remainingMessages: status.remainingMessages, messageLimit: status.messageLimit, suggestions: context.suggestions };
  }

  let reservation: Awaited<ReturnType<typeof reserveDailyTokens>>;
  try {
    reservation = await reserveDailyTokens(input.userId, settings.aiDailyTokenBudgetPerUser, settings.aiGlobalDailyTokenBudget, settings.aiMaxOutputTokens, message);
  } catch (error) {
    if (!(error instanceof AiBudgetError)) throw error;
    const status = await getSupportStatus(input.userId);
    return { answer: localAnswer, mode: "SMART_LOCAL", provider: providers[0], setupRequired: false, aiError: false, remainingMessages: status.remainingMessages, messageLimit: status.messageLimit, suggestions: context.suggestions };
  }

  try {
    const result = await askWithProviderFallback(providers, message, context.summary, localAnswer, reservation.maxOutputTokens);
    const answer = result.answer;
    if (!answer) throw new Error("empty AI response");
    await settleReservedTokens(input.userId, reservation.reservedTokens, result.inputTokens, result.outputTokens);
    const status = await getSupportStatus(input.userId);
    return { answer, mode: "AI", provider: result.provider, providersTried: result.providersTried, remainingMessages: status.remainingMessages, messageLimit: status.messageLimit, suggestions: context.suggestions };
  } catch (error) {
    await settleReservedTokens(input.userId, reservation.reservedTokens, 0, 0).catch(() => undefined);
    console.error("Zark AI support fallback", error);
    const status = await getSupportStatus(input.userId);
    return { answer: `${localAnswer}\n\n⚠️ مزودات AI المجانية غير متاحة الآن؛ استخدمت مساعد Zark المحلي تلقائيًا.`, mode: "SMART_LOCAL", provider: providers[0], setupRequired: false, aiError: true, aiErrorCode: "ALL_PROVIDERS_FAILED", remainingMessages: status.remainingMessages, messageLimit: status.messageLimit, suggestions: context.suggestions };
  }
}

const supportInstructions = "أنت مساعد Zark LFG System العربي. نطاقك الوحيد هو موقع Zark وبوت Discord وLFG والألعاب والغرف والأوامر والاهتمامات والإشعارات والملف والتقييم والبلاغات، مع السماح بتحية ودية قصيرة. ارفض باختصار أي سؤال خارج هذا النطاق. أجب بوضوح وباختصار واعتمد فقط على دليل Zark والسياق المرفقين، ولا تطلب أسرارًا أو Tokens. عند وجود نتيجة إجراء من النظام، أكّد ما نُفّذ فقط ولا تقل إنك نفّذت شيئًا من نفسك؛ الإنشاء والإبلاغ ينفذهما نظام Zark الآمن.";

function configuredAiProviders(): AiProvider[] {
  return ([
    cleanEnvValue("GEMINI_API_KEY") ? "GEMINI" : undefined,
    cleanEnvValue("GROQ_API_KEY") ? "GROQ" : undefined,
    cleanEnvValue("OPENROUTER_API_KEY") ? "OPENROUTER" : undefined,
  ] satisfies Array<AiProvider | undefined>).filter((provider): provider is AiProvider => Boolean(provider));
}

async function askWithProviderFallback(providers: AiProvider[], message: string, summary: string, localAnswer: string, maxOutputTokens: number) {
  const providersTried: AiProvider[] = [];
  let lastError: unknown;
  for (const provider of providers) {
    providersTried.push(provider);
    try {
      const result = await askProvider(provider, message, summary, localAnswer, maxOutputTokens);
      if (!result.answer) throw new Error(`${provider} returned an empty answer`);
      return { ...result, provider, providersTried };
    } catch (error) {
      lastError = error;
      console.warn(`Zark AI provider ${provider} failed; trying the next provider`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError ?? new Error("No AI provider returned an answer");
}

function askProvider(provider: AiProvider, message: string, summary: string, localAnswer: string, maxOutputTokens: number): Promise<AiAnswer> {
  if (provider === "GEMINI") return askGemini(message, summary, localAnswer, maxOutputTokens);
  if (provider === "GROQ") return askOpenAiCompatible("Groq", "https://api.groq.com/openai/v1/chat/completions", cleanEnvValue("GROQ_API_KEY")!, groqModel(), message, summary, localAnswer, maxOutputTokens);
  return askOpenAiCompatible("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", cleanEnvValue("OPENROUTER_API_KEY")!, openRouterModel(), message, summary, localAnswer, maxOutputTokens, { "HTTP-Referer": cleanEnvValue("PUBLIC_SITE_URL") || "https://zark-ps.com", "X-Title": "Zark LFG System" });
}

async function askGemini(message: string, summary: string, localAnswer: string, maxOutputTokens: number) {
  const configuredModel = geminiModel();
  try {
    return await askGeminiGenerateContent(message, summary, localAnswer, maxOutputTokens, configuredModel);
  } catch (error) {
    if (error instanceof AiProviderError && [401, 403, 429].includes(error.status)) throw error;
    if (configuredModel !== "gemini-2.5-flash" && error instanceof AiProviderError && [400, 404].includes(error.status)) {
      console.warn(`Gemini model ${configuredModel} failed; retrying gemini-2.5-flash`);
      return askGeminiGenerateContent(message, summary, localAnswer, maxOutputTokens, "gemini-2.5-flash");
    }
    console.warn("Gemini generateContent unavailable; trying Interactions", error instanceof Error ? error.message : error);
    return askGeminiInteractions(message, summary, localAnswer, maxOutputTokens, configuredModel);
  }
}

async function askGeminiInteractions(message: string, summary: string, localAnswer: string, maxOutputTokens: number, model = geminiModel()) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": cleanEnvValue("GEMINI_API_KEY")!, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      system_instruction: supportInstructions,
      input: supportPrompt(message, summary, localAnswer),
      generation_config: { max_output_tokens: maxOutputTokens, thinking_level: "minimal" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw await aiHttpError("Gemini Interactions", response);
  const body = await response.json() as {
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: { total_input_tokens?: number; total_output_tokens?: number };
  };
  const answer = body.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return { answer, inputTokens: body.usage?.total_input_tokens ?? 0, outputTokens: body.usage?.total_output_tokens ?? 0 };
}

async function askGeminiGenerateContent(message: string, summary: string, localAnswer: string, maxOutputTokens: number, model = geminiModel()) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": cleanEnvValue("GEMINI_API_KEY")!, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: supportInstructions }] },
      contents: [{ role: "user", parts: [{ text: supportPrompt(message, summary, localAnswer) }] }],
      generationConfig: { maxOutputTokens, temperature: 0.3, ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw await aiHttpError("Gemini generateContent", response);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text?.trim()).filter(Boolean).join("\n").trim();
  return { answer, inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 };
}

async function askOpenAiCompatible(provider: string, url: string, apiKey: string, model: string, message: string, summary: string, localAnswer: string, maxOutputTokens: number, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      temperature: 0.3,
      messages: [
        { role: "system", content: supportInstructions },
        { role: "user", content: supportPrompt(message, summary, localAnswer) },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw await aiHttpError(provider, response);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const answer = body.choices?.[0]?.message?.content?.trim();
  return { answer, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
}

function supportPrompt(message: string, summary: string, localAnswer: string) {
  return `دليل Zark المختصر:\n${siteKnowledge}\n\nالسؤال: ${message}\n\nالحالة الحية الآمنة:\n${summary}\n\nإجابة الدعم المحلية المقترحة:\n${localAnswer}`;
}

const siteKnowledge = [
  "صفحة LFG تعرض الغرف الحية وتسمح بإنشاء غرفة الآن أو بموعد، والانضمام والخروج والبحث باسم اللعبة أو المضيف.",
  "الاهتمامات منفصلة عن الإشعارات: مهتم مع إشعارات يستقبل DM، مهتم بدون إشعارات يبقى مهتمًا بلا DM، وغير مهتم لا يستقبل اقتراحات اللعبة.",
  "ملف اللاعب يعرض Zark XP وEngagement ووقت Voice والجلسات والتقييم والاهتمامات، مع إعدادات الخصوصية.",
  "أوامر Discord الأساسية: /help و/play و/daily و/profile و/leaderboard و/lfg create و/lfg rooms و/lfg interests و/lfg report و/lfg bug و/وقت-فراغي.",
  "التقييم متاح بعد اكتمال جلسة LFG، والبلاغات سرية وتتحول إلى تذكرة محادثة مع الإدارة.",
  "لوحة الإدارة مخصصة لرتب Discord المعتمدة وتدير إعدادات البوت والقنوات والغرف والمحتوى والبلاغات.",
].join("\n");

async function aiHttpError(provider: string, response: Response) {
  const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 350);
  return new AiProviderError(provider, response.status, detail);
}

class AiProviderError extends Error {
  constructor(public readonly provider: string, public readonly status: number, detail: string) {
    super(`${provider} ${status}${detail ? `: ${detail}` : ""}`);
  }
}

function aiFailure(error: unknown, provider: AiProvider) {
  const keyName = provider === "GEMINI" ? "GEMINI_API_KEY" : provider === "GROQ" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY";
  if (error instanceof AiProviderError) {
    if (error.status === 429) return { code: "QUOTA_EXCEEDED", message: "انتهت الحصة المجانية أو وصل المزوّد إلى حد الطلبات؛ سيحوّل Zark تلقائيًا إلى المزوّد التالي." };
    if ([400, 401, 403].includes(error.status)) return { code: "INVALID_KEY", message: `المفتاح مرفوض. راجع ${keyName} وتأكد أنه بلا علامات اقتباس أو مسافات.` };
    if (error.status === 404) return { code: "MODEL_NOT_FOUND", message: `الموديل ${providerModel(provider)} غير متاح لهذا الحساب.` };
    if (error.status >= 500) return { code: "PROVIDER_UNAVAILABLE", message: `${provider} غير متاح مؤقتًا؛ الرد المحلي يعمل لحين عودة الخدمة.` };
  }
  return { code: "CONNECTION_FAILED", message: `تعذر الاتصال بـ${provider}. تحقق من شبكة Railway ثم استخدم زر اختبار الاتصال في لوحة الإدارة.` };
}

function geminiModel() {
  return (cleanEnvValue("GEMINI_MODEL") || "gemini-2.5-flash").replace(/^models\//, "");
}

function groqModel() {
  return cleanEnvValue("GROQ_MODEL") || "openai/gpt-oss-20b";
}

function openRouterModel() {
  return cleanEnvValue("OPENROUTER_MODEL") || "openrouter/free";
}

function providerModel(provider: AiProvider) {
  if (provider === "GEMINI") return geminiModel();
  if (provider === "GROQ") return groqModel();
  return openRouterModel();
}

function cleanEnvValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const quoted = value.match(/^(["'])([\s\S]*)\1$/);
  return (quoted?.[2] ?? value).trim();
}

async function reserveDailyTokens(userId: string, userLimit: number, globalLimit: number, maxOutputTokens: number, message: string) {
  return serializable(async (tx) => {
    const key = dayKey();
    const usage = await tx.aiUsageDaily.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
    const inputEstimate = Math.max(250, Math.ceil(message.length / 3) + 350);
    const reservedTokens = inputEstimate + maxOutputTokens;
    const used = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) + (usage?.reservedTokens ?? 0);
    if (used + reservedTokens > userLimit) throw new AiBudgetError(`رصيد مساعد Zark اليومي غير كافٍ لهذا الرد. المتبقي ${Math.max(0, userLimit - used)} Token.`);
    const global = await tx.aiUsageDaily.aggregate({ where: { dayKey: key }, _sum: { inputTokens: true, outputTokens: true, reservedTokens: true } });
    const globalUsed = (global._sum.inputTokens ?? 0) + (global._sum.outputTokens ?? 0) + (global._sum.reservedTokens ?? 0);
    if (globalUsed + reservedTokens > globalLimit) throw new AiBudgetError("وصل مساعد Zark إلى ميزانية Tokens العامة اليوم. الدعم المحلي ما زال متاحًا.");
    await tx.aiUsageDaily.update({ where: { userId_dayKey: { userId, dayKey: key } }, data: { reservedTokens: { increment: reservedTokens } } });
    return { reservedTokens, maxOutputTokens };
  });
}

class AiBudgetError extends Error {}

async function reserveDailyRequest(userId: string, userLimit: number, globalLimit: number) {
  await serializable(async (tx) => {
    const key = dayKey();
    const usage = await tx.aiUsageDaily.findUnique({ where: { userId_dayKey: { userId, dayKey: key } } });
    if ((usage?.requestCount ?? 0) >= userLimit) throw new Error("وصلت إلى الحد اليومي لرسائل مساعد Zark");
    const global = await tx.aiUsageDaily.aggregate({ where: { dayKey: key }, _sum: { requestCount: true } });
    if ((global._sum.requestCount ?? 0) >= globalLimit) throw new Error("وصل مساعد Zark إلى الحد العام اليوم؛ حاول غدًا");
    await tx.aiUsageDaily.upsert({
      where: { userId_dayKey: { userId, dayKey: key } },
      update: { requestCount: { increment: 1 } },
      create: { userId, dayKey: key, requestCount: 1 },
    });
  });
}

async function settleReservedTokens(userId: string, reservedTokens: number, inputTokens: number, outputTokens: number) {
  await db.aiUsageDaily.update({
    where: { userId_dayKey: { userId, dayKey: dayKey() } },
    data: { reservedTokens: { decrement: reservedTokens }, inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
  });
}

async function liveContext(message: string) {
  const [games, rooms] = await Promise.all([
    db.lfgGameCatalog.findMany({ where: { enabled: true }, select: { id: true, slug: true, name: true, icon: true, minPlayers: true, maxPlayers: true } }),
    db.lfgRoom.findMany({ where: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } }, include: { lfgGame: true }, orderBy: [{ memberCount: "desc" }, { scheduledFor: "asc" }], take: 12 }),
  ]);
  const normalized = normalize(message);
  const mentioned = findMentionedGame(normalized, games);
  const matching = mentioned ? rooms.filter((room) => room.lfgGameId === mentioned.id) : rooms.slice(0, 4);
  const suggestions = matching.slice(0, 4).map((room) => ({ roomId: room.id, label: `${room.lfgGame.icon ?? "🎮"} ${room.lfgGame.name} — ${room.memberCount}/${room.maxPlayers}`, gameSlug: room.lfgGame.slug }));
  const summary = matching.length
    ? matching.map((room) => `${room.lfgGame.name}: ${room.memberCount}/${room.maxPlayers}, الحالة ${room.status}`).join("\n")
    : "لا توجد غرفة مطابقة مفتوحة الآن.";
  return { mentioned, matching, suggestions, summary };
}

async function executeSupportAction(input: { userId: string; displayName: string; avatarUrl?: string }, message: string, context: Awaited<ReturnType<typeof liveContext>>) {
  const normalized = normalize(message);
  const reportCommand = /^(?:بدي\s+)?(?:ابلغ|بلغ|اشتكي|اعمل\s+بلاغ|ارسل\s+بلاغ|اقدم\s+بلاغ|تقديم\s+بلاغ|report)\s+(?:عن\s+)?/.test(normalized);
  const targetId = message.match(/(?:<@!?)?(\d{17,20})>?/)?.[1];
  if (reportCommand && targetId) {
    const reasonMatch = message.match(/(?:السبب|سبب)\s*[:：-]?\s*(.{2,80})/iu);
    const reason = (reasonMatch?.[1] ?? "بلاغ أُرسل عبر مساعد Zark").trim().slice(0, 80);
    const report = await reportPlayer({ reporterId: input.userId, reporterName: input.displayName, reportedId: targetId, reason, description: message });
    return {
      answer: `✅ تم إرسال البلاغ بسرية وفتح تذكرة رقم ${report.id}. ستجدها في قسم «بلاغاتي السابقة» ويمكنك متابعة محادثة الإدارة منها.`,
      action: { type: "REPORT_CREATED", reportId: report.id, reportKind: "PLAYER" },
      suggestions: [],
    };
  }

  const hasCreateVerb = /(?:^|\s)(?:اعمل(?:ي|لي)?|سوي(?:لي)?|انشئ(?:لي)?|افتح(?:لي)?|create|make)(?:\s|$)/.test(normalized);
  const hasRoomNoun = /(?:^|\s)(?:غرفه|روم|تجمع|lfg)(?:\s|$)/.test(normalized);
  const continuation = /(?:^|\s)(?:انت|إنت|انتو)?\s*(?:اعمل(?:ها|ه|لي)?|سوي(?:ها|ه|لي)?|نفذ(?:ها|ه)?|ابدأ(?:ها|ه)?)(?:\s|$)/.test(normalized);
  if (context.mentioned && hasCreateVerb) {
    pendingRoomRequests.set(input.userId, { gameSlug: context.mentioned.slug, expiresAt: Date.now() + 10 * 60_000 });
  }
  const pending = pendingRoomRequests.get(input.userId);
  if (pending && pending.expiresAt <= Date.now()) pendingRoomRequests.delete(input.userId);
  const pendingGame = pending && pending.expiresAt > Date.now()
    ? await db.lfgGameCatalog.findUnique({ where: { slug: pending.gameSlug }, select: { id: true, slug: true, name: true, icon: true, minPlayers: true, maxPlayers: true } })
    : undefined;
  const game = context.mentioned ?? pendingGame;
  // A user may simply say "اعملي ماينكرافت"; naming the game is enough, the
  // room word is optional.  A continuation is only honoured for the same user
  // and for ten minutes, using the previously named game.
  const roomCommand = (hasCreateVerb || continuation) && (hasRoomNoun || Boolean(game));
  if (!roomCommand) return undefined;
  if (!game) {
    return { answer: "حدد اسم اللعبة أيضًا، مثل: «اعمل روم Minecraft لأربعة لاعبين مع فويس». لن أنشئ غرفة قبل معرفة اللعبة.", action: { type: "NEEDS_GAME" }, suggestions: context.suggestions };
  }
  if (game.slug === "roblox") {
    const mapMatch = message.match(/(?:ماب|map)\s*[:：-]?\s*([^،,]{2,60})/iu);
    if (!mapMatch) return { answer: "اكتب اسم ماب Roblox أولًا، مثل: «اعملي غرفة Roblox ماب Blox Fruits». لن أنشئ الغرفة بدون اسم الماب.", action: { type: "NEEDS_MAP" }, suggestions: context.suggestions };
  }
  const playerMatch = normalized.match(/(?:عدد\s*)?(\d{1,2})\s*(?:لاعب|لاعبين|players?)/) ?? normalized.match(/(?:لاعبين|players?)\s*(\d{1,2})/);
  const requestedPlayers = playerMatch ? Number(playerMatch[1]) : 4;
  const maxPlayers = Math.min(game.maxPlayers, Math.max(game.minPlayers, requestedPlayers));
  const minuteMatch = normalized.match(/(\d{1,3})\s*(?:دقيقه|دقائق|minute|minutes)/);
  const hourMatch = normalized.match(/(\d{1,2})\s*(?:ساعه|ساعات|hour|hours)/);
  const durationMinutes = Math.min(360, Math.max(15, minuteMatch ? Number(minuteMatch[1]) : hourMatch ? Number(hourMatch[1]) * 60 : 60));
  const needsVoice = !/(?:بدون|بلا)\s*(?:فويس|voice)/.test(normalized);
  const mapName = game.slug === "roblox" ? message.match(/(?:ماب|map)\s*[:：-]?\s*([^،,]{2,60})/iu)?.[1].trim() : undefined;
  const room = await createLfgRoom({ userId: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl, gameSlug: game.slug, maxPlayers, durationMinutes, needsVoice, mapName, description: "أنشئت عبر مساعد Zark" });
  pendingRoomRequests.delete(input.userId);
  return {
    answer: `✅ أنشأت غرفة ${game.name} بنجاح: ${room.currentPlayers}/${room.maxPlayers}${needsVoice ? " مع Voice" : " بدون Voice"}. سيقوم Zark بإشعار المهتمين وتظهر الغرفة الآن في الموقع وDiscord.`,
    action: { type: "LFG_CREATED", roomId: room.id, gameSlug: room.gameSlug },
    suggestions: [{ roomId: room.id, label: `${room.gameIcon ?? "🎮"} فتح غرفة ${room.gameName}`, gameSlug: room.gameSlug }],
  };
}

function findMentionedGame<T extends { slug: string; name: string }>(message: string, games: T[]) {
  const exact = games.find((game) => [game.name, game.slug, ...(gameAliases[game.slug] ?? [])].some((alias) => message.includes(normalize(alias))));
  if (exact) return exact;
  const words = message.split(" ");
  let best: { game: T; score: number } | undefined;
  for (const game of games) {
    for (const alias of [game.name, game.slug, ...(gameAliases[game.slug] ?? [])]) {
      const target = normalize(alias);
      if (target.replace(/\s/g, "").length < 5) continue;
      const width = target.split(" ").length;
      for (let start = 0; start < words.length; start += 1) {
        for (const size of new Set([Math.max(1, width - 1), width, width + 1])) {
          const candidate = words.slice(start, start + size).join(" ");
          if (!candidate) continue;
          const score = similarity(candidate.replace(/\s/g, ""), target.replace(/\s/g, ""));
          if (score >= 0.72 && (!best || score > best.score)) best = { game, score };
        }
      }
    }
  }
  return best?.game;
}

function similarity(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / longest;
}

function smartLocalAnswer(message: string, context: Awaited<ReturnType<typeof liveContext>>) {
  const normalized = normalize(message);
  const ranked = knowledge.map((item) => ({ item, score: item.keywords.reduce((score, keyword) => score + (normalized.includes(normalize(keyword)) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  let answer = ranked[0]?.score ? ranked[0].item.answer : "أقدر أساعدك في إنشاء غرف LFG، الدخول والخروج، Voice، الإشعارات، الملف الشخصي، التقييم والبلاغات. اكتب اسم الميزة أو اللعبة التي تريدها.";
  if (context.mentioned) answer += context.matching.length ? `\n\nوجدت ${context.matching.length} غرفة ${context.mentioned.name} متاحة الآن؛ اختر واحدة من الاقتراحات بالأسفل.` : `\n\nلا توجد غرفة ${context.mentioned.name} مفتوحة الآن، لكن تستطيع إنشاء واحدة من صفحة LFG وسيتم إشعار المهتمين.`;
  return answer;
}

function supportScope(message: string): "CASUAL" | "SITE" | "OUT_OF_SCOPE" {
  const normalized = normalize(message);
  const casual = ["مرحبا", "اهلا", "السلام عليكم", "صباح الخير", "مساء الخير", "كيف حالك", "شو اخبارك", "شلونك", "هاي", "hello", "hi"];
  if (casual.some((phrase) => normalized === normalize(phrase) || normalized.startsWith(`${normalize(phrase)} `))) return "CASUAL";
  const siteTerms = [
    "zark", "زارك", "lfg", "الموقع", "البوت", "ديسكورد", "discord", "روم", "غرفه", "غرفة", "لاعب", "لعبه", "لعبة", "العاب", "ألعاب", "فويس", "voice", "اشعار", "إشعار", "مهتم", "بروفايل", "ملف", "تقييم", "بلاغ", "شكوى", "تذكره", "تذكرة", "امر", "أمر", "اوامر", "أوامر", "نقاط", "xp", "leaderboard", "اهتمامات", "دخول", "خروج", "انضمام", "موعد", "وقت فراغ", "اداره", "إدارة", "دعم", "مساعد",
    ...Object.keys(gameAliases), ...Object.values(gameAliases).flat(),
  ];
  return siteTerms.some((term) => normalized.includes(normalize(term))) ? "SITE" : "OUT_OF_SCOPE";
}

function casualAnswer(displayName: string, message: string) {
  const normalized = normalize(message);
  if (normalized.includes("صباح الخير")) return `صباح النور يا ${displayName} ☀️ كيف أساعدك في Zark اليوم؟`;
  if (normalized.includes("مساء الخير")) return `مساء النور يا ${displayName} 🌙 شو حاب تعمل في Zark؟`;
  if (normalized.includes("كيف حالك") || normalized.includes("شو اخبارك") || normalized.includes("شلونك")) return `تمام يا ${displayName}، وجاهز أساعدك في غرف LFG وأوامر Zark 😊`;
  return `أهلًا يا ${displayName} 👋 اسألني عن غرف LFG أو ألعاب وأوامر Zark.`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}
