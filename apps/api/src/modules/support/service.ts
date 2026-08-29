import { db } from "../../../../../packages/db/src/client.js";
import { serializable } from "../../db-transaction.js";
import { enforceRateLimit } from "../../events.js";
import { getGuildRuntimeSettings } from "../admin/service.js";

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

export async function getSupportStatus(userId: string) {
  const settings = await getGuildRuntimeSettings();
  const usage = await db.aiUsageDaily.findUnique({ where: { userId_dayKey: { userId, dayKey: dayKey() } } });
  const usedTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) + (usage?.reservedTokens ?? 0);
  const provider = configuredAiProvider();
  const aiConnected = Boolean(provider);
  return {
    enabled: settings.aiChatEnabled,
    mode: aiConnected ? "AI" : "SMART_LOCAL",
    provider,
    dailyTokenBudget: settings.aiDailyTokenBudgetPerUser,
    usedTokens: aiConnected ? usedTokens : 0,
    remainingTokens: aiConnected ? Math.max(0, settings.aiDailyTokenBudgetPerUser - usedTokens) : settings.aiDailyTokenBudgetPerUser,
    requestsToday: usage?.requestCount ?? 0,
    remainingMessages: Math.max(0, settings.aiDailyMessagesPerUser - (usage?.requestCount ?? 0)),
  };
}

export async function askSupport(input: { userId: string; displayName: string; message: string }) {
  await enforceRateLimit("support-chat", input.userId, 15, 60);
  const settings = await getGuildRuntimeSettings();
  if (!settings.aiChatEnabled) throw new Error("مساعد Zark متوقف مؤقتًا من الإدارة");
  const message = input.message.trim().slice(0, 500);
  if (message.length < 2) throw new Error("اكتب سؤالك بشكل أوضح");
  await db.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName }, create: { id: input.userId, displayName: input.displayName } });
  await reserveDailyRequest(input.userId, settings.aiDailyMessagesPerUser, settings.aiGlobalDailyMessages);
  const context = await liveContext(message);
  const localAnswer = smartLocalAnswer(message, context);
  const provider = configuredAiProvider();
  if (!provider) return { answer: localAnswer, mode: "SMART_LOCAL", provider: null, remainingTokens: settings.aiDailyTokenBudgetPerUser, tokenBudget: settings.aiDailyTokenBudgetPerUser, suggestions: context.suggestions };

  let reservation: Awaited<ReturnType<typeof reserveDailyTokens>>;
  try {
    reservation = await reserveDailyTokens(input.userId, settings.aiDailyTokenBudgetPerUser, settings.aiGlobalDailyTokenBudget, settings.aiMaxOutputTokens, message);
  } catch (error) {
    if (!(error instanceof AiBudgetError)) throw error;
    const status = await getSupportStatus(input.userId);
    return { answer: localAnswer, mode: "SMART_LOCAL", provider, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget, suggestions: context.suggestions };
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
    return { answer: localAnswer, mode: "SMART_LOCAL", provider, remainingTokens: status.remainingTokens, tokenBudget: status.dailyTokenBudget, suggestions: context.suggestions };
  }
}

const supportInstructions = "أنت مساعد دعم عربي مختصر لنظام Zark LFG System. أجب فقط عن استخدام البوت والموقع والعثور على اللاعبين. لا تطلب أسرارًا أو Tokens، ولا تخترع خصائص غير موجودة. إذا كان السؤال شكوى، وجّه المستخدم لنموذج البلاغ.";

function configuredAiProvider(): "GEMINI" | "OPENAI" | undefined {
  if (process.env.GEMINI_API_KEY?.trim()) return "GEMINI";
  if (process.env.OPENAI_API_KEY?.trim()) return "OPENAI";
  return undefined;
}

async function askGemini(message: string, summary: string, localAnswer: string, maxOutputTokens: number) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!.trim(), "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      store: false,
      system_instruction: supportInstructions,
      input: supportPrompt(message, summary, localAnswer),
      generation_config: { max_output_tokens: maxOutputTokens, thinking_level: "minimal" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
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

async function askOpenAi(message: string, summary: string, localAnswer: string, maxOutputTokens: number) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions: supportInstructions,
      input: supportPrompt(message, summary, localAnswer),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const body = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const answer = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text?.trim();
  return { answer, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };
}

function supportPrompt(message: string, summary: string, localAnswer: string) {
  return `السؤال: ${message}\n\nالحالة الحية الآمنة:\n${summary}\n\nإجابة الدعم المحلية المقترحة:\n${localAnswer}`;
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
    db.lfgGameCatalog.findMany({ where: { enabled: true }, select: { id: true, slug: true, name: true, icon: true } }),
    db.lfgRoom.findMany({ where: { status: { in: ["SCHEDULED", "OPEN", "FULL", "ACTIVE"] } }, include: { lfgGame: true }, orderBy: [{ memberCount: "desc" }, { scheduledFor: "asc" }], take: 12 }),
  ]);
  const normalized = normalize(message);
  const mentioned = games.find((game) => normalized.includes(normalize(game.name)) || normalized.includes(normalize(game.slug)));
  const matching = mentioned ? rooms.filter((room) => room.lfgGameId === mentioned.id) : rooms.slice(0, 4);
  const suggestions = matching.slice(0, 4).map((room) => ({ roomId: room.id, label: `${room.lfgGame.icon ?? "🎮"} ${room.lfgGame.name} — ${room.memberCount}/${room.maxPlayers}`, gameSlug: room.lfgGame.slug }));
  const summary = matching.length
    ? matching.map((room) => `${room.lfgGame.name}: ${room.memberCount}/${room.maxPlayers}, الحالة ${room.status}`).join("\n")
    : "لا توجد غرفة مطابقة مفتوحة الآن.";
  return { mentioned, matching, suggestions, summary };
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
