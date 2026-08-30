import { db } from "../../../../../packages/db/src/client.js";
import { serializable } from "../../db-transaction.js";
import { enforceRateLimit } from "../../events.js";
import { getGuildRuntimeSettings } from "../admin/service.js";
import { createLfgRoom } from "../lfg/service.js";
import { reportPlayer } from "../feedback/service.js";

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
  minecraft: ["ماينكرافت", "ماين كرافت", "مينكرافت"],
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
  const usedTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) + (usage?.reservedTokens ?? 0);
  const provider = configuredAiProvider();
  const aiConnected = Boolean(provider);
  return {
    enabled: settings.aiChatEnabled,
    mode: aiConnected ? "CONFIGURED" : "SMART_LOCAL",
    provider,
    model: provider === "GEMINI" ? geminiModel() : provider === "OPENAI" ? cleanEnvValue("OPENAI_MODEL") || "gpt-5-mini" : null,
    setupRequired: !provider,
    dailyTokenBudget: settings.aiDailyTokenBudgetPerUser,
    usedTokens: aiConnected ? usedTokens : 0,
    remainingTokens: aiConnected ? Math.max(0, settings.aiDailyTokenBudgetPerUser - usedTokens) : settings.aiDailyTokenBudgetPerUser,
    requestsToday: usage?.requestCount ?? 0,
    remainingMessages: Math.max(0, settings.aiDailyMessagesPerUser - (usage?.requestCount ?? 0)),
  };
}

export async function diagnoseSupportAi(adminId: string) {
  await enforceRateLimit("support-diagnostic", adminId, 3, 5 * 60);
  const provider = configuredAiProvider();
  if (!provider) return { configured: false, connected: false, provider: null, code: "MISSING_KEY", message: "GEMINI_API_KEY غير موجود في Railway Variables" };
  try {
    const result = provider === "GEMINI"
      ? await askGemini("اختبار اتصال فقط. أجب بكلمة: متصل", "لا توجد حاجة لبيانات حية.", "متصل", 40)
      : await askOpenAi("اختبار اتصال فقط. أجب بكلمة: متصل", "لا توجد حاجة لبيانات حية.", "متصل", 40);
    if (!result.answer) throw new Error("empty provider response");
    return { configured: true, connected: true, provider, code: "OK", message: `${provider} متصل ويرد بشكل صحيح` };
  } catch (error) {
    console.error("Zark AI diagnostic failed", error);
    const failure = aiFailure(error, provider);
    return { configured: true, connected: false, provider, code: failure.code, message: failure.message };
  }
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
    return { ...action, mode: "ACTION", provider: configuredAiProvider() ?? null, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget };
  }
  const provider = configuredAiProvider();
  if (!provider) return { answer: `${localAnswer}\n\n⚠️ Gemini غير مربوط حاليًا. أضف GEMINI_API_KEY داخل Variables في Railway ثم أعد نشر الخدمة.`, mode: "SMART_LOCAL", provider: null, setupRequired: true, aiError: false, remainingTokens: settings.aiDailyTokenBudgetPerUser, tokenBudget: settings.aiDailyTokenBudgetPerUser, suggestions: context.suggestions };

  let reservation: Awaited<ReturnType<typeof reserveDailyTokens>>;
  try {
    reservation = await reserveDailyTokens(input.userId, settings.aiDailyTokenBudgetPerUser, settings.aiGlobalDailyTokenBudget, settings.aiMaxOutputTokens, message);
  } catch (error) {
    if (!(error instanceof AiBudgetError)) throw error;
    const status = await getSupportStatus(input.userId);
    return { answer: localAnswer, mode: "SMART_LOCAL", provider, setupRequired: false, aiError: false, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget, suggestions: context.suggestions };
  }

  try {
    const result = provider === "GEMINI"
      ? await askGemini(message, context.summary, localAnswer, reservation.maxOutputTokens)
      : await askOpenAi(message, context.summary, localAnswer, reservation.maxOutputTokens);
    const answer = result.answer;
    if (!answer) throw new Error("empty AI response");
    await settleReservedTokens(input.userId, reservation.reservedTokens, result.inputTokens, result.outputTokens);
    const status = await getSupportStatus(input.userId);
    return { answer, mode: "AI", provider, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget, suggestions: context.suggestions };
  } catch (error) {
    await settleReservedTokens(input.userId, reservation.reservedTokens, 0, 0).catch(() => undefined);
    console.error("Zark AI support fallback", error);
    const status = await getSupportStatus(input.userId);
    const failure = aiFailure(error, provider);
    return { answer: `${localAnswer}\n\n⚠️ ${failure.message}`, mode: "SMART_LOCAL", provider, setupRequired: false, aiError: true, aiErrorCode: failure.code, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget, suggestions: context.suggestions };
  }
}

const supportInstructions = "أنت مساعد Zark LFG System العربي. أجب باختصار ووضوح عن كل صفحات الموقع وأوامر البوت والعثور على اللاعبين والغرف والاهتمامات والإشعارات والملف والتقييم والبلاغات. اعتمد فقط على المعلومات والسياق المرفقين، ولا تطلب أسرارًا أو Tokens ولا تدّعي تنفيذ إجراء؛ الإجراءات ينفذها النظام بشكل مستقل وآمن.";

function configuredAiProvider(): "GEMINI" | "OPENAI" | undefined {
  if (cleanEnvValue("GEMINI_API_KEY")) return "GEMINI";
  if (cleanEnvValue("OPENAI_API_KEY")) return "OPENAI";
  return undefined;
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

async function askOpenAi(message: string, summary: string, localAnswer: string, maxOutputTokens: number) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${cleanEnvValue("OPENAI_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: cleanEnvValue("OPENAI_MODEL") ?? "gpt-5-mini",
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions: supportInstructions,
      input: supportPrompt(message, summary, localAnswer),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw await aiHttpError("OpenAI", response);
  const body = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const answer = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text?.trim();
  return { answer, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
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

function aiFailure(error: unknown, provider: "GEMINI" | "OPENAI") {
  if (error instanceof AiProviderError) {
    if (error.status === 429) return { code: "QUOTA_EXCEEDED", message: `${provider} وصل إلى حد الـQuota. افتح Google AI Studio وتحقق من Usage أو انتظر تجدد الحصة.` };
    if ([400, 401, 403].includes(error.status)) return { code: "INVALID_KEY", message: `${provider} رفض المفتاح أو أن Generative Language API غير مفعّلة. انسخ المفتاح من Google AI Studio إلى GEMINI_API_KEY بدون علامات اقتباس أو مسافات.` };
    if (error.status === 404) return { code: "MODEL_NOT_FOUND", message: `موديل Gemini غير متاح لهذا المفتاح. اضبط GEMINI_MODEL على gemini-2.5-flash.` };
    if (error.status >= 500) return { code: "PROVIDER_UNAVAILABLE", message: `${provider} غير متاح مؤقتًا؛ الرد المحلي يعمل لحين عودة الخدمة.` };
  }
  return { code: "CONNECTION_FAILED", message: `تعذر الاتصال بـ${provider}. تحقق من شبكة Railway ثم استخدم زر اختبار الاتصال في لوحة الإدارة.` };
}

function geminiModel() {
  return (cleanEnvValue("GEMINI_MODEL") || "gemini-2.5-flash").replace(/^models\//, "");
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
  const mentioned = games.find((game) => [game.name, game.slug, ...(gameAliases[game.slug] ?? [])].some((alias) => normalized.includes(normalize(alias))));
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

  const roomCommand = /^(?:بدي\s+)?(?:اعمل|سوي|انشئ|افتح|create)\s+(?:لي\s+)?(?:غرفه|روم|lfg)(?:\s|$)/.test(normalized);
  if (!roomCommand) return undefined;
  if (!context.mentioned) {
    return { answer: "حدد اسم اللعبة أيضًا، مثل: «اعمل روم Minecraft لأربعة لاعبين مع فويس». لن أنشئ غرفة قبل معرفة اللعبة.", action: { type: "NEEDS_GAME" }, suggestions: context.suggestions };
  }
  const playerMatch = normalized.match(/(?:عدد\s*)?(\d{1,2})\s*(?:لاعب|لاعبين|players?)/) ?? normalized.match(/(?:لاعبين|players?)\s*(\d{1,2})/);
  const requestedPlayers = playerMatch ? Number(playerMatch[1]) : 4;
  const maxPlayers = Math.min(context.mentioned.maxPlayers, Math.max(context.mentioned.minPlayers, requestedPlayers));
  const minuteMatch = normalized.match(/(\d{1,3})\s*(?:دقيقه|دقائق|minute|minutes)/);
  const hourMatch = normalized.match(/(\d{1,2})\s*(?:ساعه|ساعات|hour|hours)/);
  const durationMinutes = Math.min(360, Math.max(15, minuteMatch ? Number(minuteMatch[1]) : hourMatch ? Number(hourMatch[1]) * 60 : 60));
  const needsVoice = !/(?:بدون|بلا)\s*(?:فويس|voice)/.test(normalized);
  const room = await createLfgRoom({ userId: input.userId, displayName: input.displayName, avatarUrl: input.avatarUrl, gameSlug: context.mentioned.slug, maxPlayers, durationMinutes, needsVoice, description: "أنشئت عبر مساعد Zark" });
  return {
    answer: `✅ أنشأت غرفة ${context.mentioned.name} بنجاح: ${room.currentPlayers}/${room.maxPlayers}${needsVoice ? " مع Voice" : " بدون Voice"}. سيقوم Zark بإشعار المهتمين وتظهر الغرفة الآن في الموقع وDiscord.`,
    action: { type: "LFG_CREATED", roomId: room.id, gameSlug: room.gameSlug },
    suggestions: [{ roomId: room.id, label: `${room.gameIcon ?? "🎮"} فتح غرفة ${room.gameName}`, gameSlug: room.gameSlug }],
  };
}

function smartLocalAnswer(message: string, context: Awaited<ReturnType<typeof liveContext>>) {
  const normalized = normalize(message);
  const ranked = knowledge.map((item) => ({ item, score: item.keywords.reduce((score, keyword) => score + (normalized.includes(normalize(keyword)) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  let answer = ranked[0]?.score ? ranked[0].item.answer : "أقدر أساعدك في إنشاء غرف LFG، الدخول والخروج، Voice، الإشعارات، الملف الشخصي، التقييم والبلاغات. اكتب اسم الميزة أو اللعبة التي تريدها.";
  if (context.mentioned) answer += context.matching.length ? `\n\nوجدت ${context.matching.length} غرفة ${context.mentioned.name} متاحة الآن؛ اختر واحدة من الاقتراحات بالأسفل.` : `\n\nلا توجد غرفة ${context.mentioned.name} مفتوحة الآن، لكن تستطيع إنشاء واحدة من صفحة LFG وسيتم إشعار المهتمين.`;
  return answer;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}
