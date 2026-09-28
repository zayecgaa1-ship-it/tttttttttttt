/**
 * اختبار دقة طبقة الاتصال بالـAPI في البوت:
 * يتحقق من إعادة المحاولة للقراءات، ومن عدم تكرار طلبات الكتابة عند 500،
 * ومن احترام Retry-After عند 429، ومن رسائل الأخطاء العربية.
 */
import http from "node:http";
import assert from "node:assert/strict";

const attempts = new Map<string, number>();
const receivedHeaders: Record<string, http.IncomingHttpHeaders> = {};
const keepAlive = setInterval(() => undefined, 1_000);

const server = http.createServer((request, response) => {
  const route = request.url ?? "/";
  const count = (attempts.get(route) ?? 0) + 1;
  attempts.set(route, count);
  receivedHeaders[route] = request.headers;

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    response.writeHead(status, { "content-type": "application/json", ...headers });
    response.end(JSON.stringify(body));
  };

  if (route === "/flaky-get") return count <= 2 ? json(503, { error: "busy" }) : json(200, { ok: true });
  if (route === "/bad-get") return json(500, { error: "boom-500" });
  if (route === "/bad-write") return json(500, { error: "boom-500" });
  if (route === "/limited") return count === 1 ? json(429, { error: "slow down" }, { "retry-after": "0" }) : json(200, { ok: "retried" });
  if (route === "/payload") { response.writeHead(200, { "content-type": "application/json" }); return response.end("not-json"); }
  if (route === "/no-content") { response.writeHead(204); return response.end(); }
  return json(404, { error: "not found" });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Mock server did not bind to a TCP port");

process.env.INTERNAL_API_URL = `http://127.0.0.1:${address.port}`;
process.env.INTERNAL_API_KEY = "smoke-key";
const { apiGet, apiSend } = await import("../apps/bot/src/api/client.js");

const ok: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  await run();
  ok.push(name);
  console.log(`PASS · ${name}`);
};

await check("GET يُعاد بعد 503 وينجح", async () => {
  const body = await apiGet<{ ok: boolean }>("/flaky-get", true);
  assert.deepEqual(body, { ok: true });
  assert.equal(attempts.get("/flaky-get"), 3, "expected exactly 3 attempts");
  assert.equal(receivedHeaders["/flaky-get"]["x-zark-service-key"], "smoke-key", "internal service key must be forwarded");
});

await check("GET يفشل بعد 3 محاولات على 500 مع رسالة الخدمة", async () => {
  await assert.rejects(() => apiGet("/bad-get"), (error: Error) => error.message === "boom-500");
  assert.equal(attempts.get("/bad-get"), 3, "reads must be retried up to maxAttempts");
});

await check("POST لا يُعاد أبدًا على 500 (حماية من العمليات المزدوجة)", async () => {
  await assert.rejects(() => apiSend("/bad-write", "POST", { hello: "world" }), (error: Error) => error.message === "boom-500");
  assert.equal(attempts.get("/bad-write"), 1, "writes must not replay an ambiguous server error");
});

await check("POST يُعاد على 429 مع احترام Retry-After", async () => {
  const body = await apiSend<{ ok: string }>("/limited", "POST", { hello: "world" });
  assert.deepEqual(body, { ok: "retried" });
  assert.equal(attempts.get("/limited"), 2, "429 must be retried once");
  assert.equal(receivedHeaders["/limited"]["content-type"], "application/json");
});

await check("الحمولة غير الصالحة تُرفض برسالة عربية بلا إعادة محاولة", async () => {
  await assert.rejects(() => apiGet("/payload"), (error: Error) => error.message.includes("استجابة غير صالحة"));
  assert.equal(attempts.get("/payload"), 1, "an invalid payload must not be retried");
});

await check("204 بلا جسم لا يُعد خطأ", async () => {
  assert.equal(await apiGet("/no-content"), undefined);
});

await check("تعذر الوصول للسيرفر يعطي رسالة عربية مع رمز العطل", async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(() => apiGet("/flaky-get"), (error: Error) => {
    console.log(`     ↳ ${error.message}`);
    return error.message.includes("تعذر الاتصال بخدمة 3Pal") && error.message.includes("ECONNREFUSED");
  });
});

clearInterval(keepAlive);
console.log(`\nSMOKE PASSED · ${ok.length} حالات`);
