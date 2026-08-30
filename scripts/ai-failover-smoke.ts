import "dotenv/config";
import { db } from "../packages/db/src/client.js";
import { askSupport, diagnoseSupportAi } from "../apps/api/src/modules/support/service.js";

const userId = "900000000000000021";
const originalFetch = globalThis.fetch;

process.env.GEMINI_API_KEY = "smoke-gemini";
process.env.GROQ_API_KEY = "smoke-groq";
delete process.env.OPENROUTER_API_KEY;

globalThis.fetch = (async (input) => {
  const url = String(input);
  if (url.includes("generativelanguage.googleapis.com")) {
    return new Response(JSON.stringify({ error: { message: "quota exhausted" } }), { status: 429, headers: { "content-type": "application/json" } });
  }
  if (url.includes("api.groq.com")) {
    return new Response(JSON.stringify({ choices: [{ message: { content: "افتح صفحة LFG واختر الغرفة ثم اضغط دخول." } }], usage: { prompt_tokens: 40, completion_tokens: 12 } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`Unexpected AI URL in smoke test: ${url}`);
}) as typeof fetch;

try {
  await db.user.upsert({ where: { id: userId }, update: { displayName: "Failover User" }, create: { id: userId, displayName: "Failover User" } });
  const reply = await askSupport({ userId, displayName: "Failover User", message: "كيف أدخل غرفة LFG في موقع Zark؟" });
  if (reply.mode !== "AI" || reply.provider !== "GROQ" || reply.providersTried?.join(",") !== "GEMINI,GROQ") throw new Error("AI provider failover assertion failed");
  const diagnosis = await diagnoseSupportAi(userId);
  if (!diagnosis.connected || diagnosis.provider !== "GROQ" || diagnosis.providers.length !== 2) throw new Error("AI diagnostics assertion failed");
  console.log("AI failover/diagnostics smoke passed: Gemini quota -> Groq");
} finally {
  globalThis.fetch = originalFetch;
  await db.aiUsageDaily.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
}
