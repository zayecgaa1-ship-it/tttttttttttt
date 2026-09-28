const localApiUrl = `http://127.0.0.1:${process.env.PORT ?? process.env.API_PORT ?? "3000"}`;
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID);
const apiUrl = (process.env.INTERNAL_API_URL?.trim() || (isRailway ? localApiUrl : process.env.PUBLIC_API_URL?.trim()) || localApiUrl).replace(/\/+$/, "");
const serviceKey = process.env.INTERNAL_API_KEY ?? "";

const requestTimeoutMs = 15_000;
/** 3 محاولات كافية لتجاوز إعادة تشغيل الـAPI أو ضغط لحظي، دون تأخير غير مقبول للمستخدم. */
const maxAttempts = 3;
const baseBackoffMs = 300;
const maxBackoffMs = 4_000;

/** أعطال عابرة يُعاد المحاولة عليها لأن الخدمة لم تُنفّذ الطلب أو أنها مشغولة مؤقتًا. */
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
/**
 * أكواد تُثبت أن الخدمة رفضت الطلب قبل تنفيذه، لذا إعادة إرسال طلبات الكتابة بأمان.
 * ملاحظة: 500 مستثنى عمدًا لأن الطلب قد يكون نُفّذ جزئيًا، فلا نكرر الكتابة تلقائيًا.
 */
const replaySafeStatuses = new Set([408, 425, 429, 502, 503, 504]);
/** أعطال اتصال تعني أن الطلب لم يصل إلى الخدمة إطلاقًا، لذا تكراره آمن حتى لطلبات الكتابة. */
const unreachedConnectionCodes = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

type RequestMethod = "GET" | "POST" | "PUT";
type RequestSpec = { path: string; method: RequestMethod; body?: unknown; internal: boolean };

export async function apiGet<T>(path: string, internal = false): Promise<T> {
  return request<T>({ path, method: "GET", internal });
}

export async function apiSend<T>(path: string, method: "POST" | "PUT", body: unknown, internal = true): Promise<T> {
  return request<T>({ path, method, body, internal });
}

/**
 * ينفّذ الطلب مع إعادة محاولة متدرجة. القراءات (GET) تُعاد دائمًا عند العطل العابر،
 * أما الكتابة فلا تُعاد إلا إذا أكّدت الخدمة أنها لم تنفّذ الطلب (429/502/503/504 أو تعذر الوصول للسيرفر)
 * لأن تكرار الطلب بعد تنفيذه قد يُنشئ عمليات مزدوجة.
 */
async function request<T>(spec: RequestSpec): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response | undefined;
    let failure: unknown;
    try {
      response = await fetch(`${apiUrl}${spec.path}`, {
        method: spec.method,
        headers: requestHeaders(spec),
        body: spec.method === "GET" ? undefined : JSON.stringify(spec.body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      failure = error;
    }

    if (response) {
      const payload = await readPayload(response);
      if (response.ok) return validatePayload<T>(response.status, payload);
      const retryable = retryableStatuses.has(response.status) && (spec.method === "GET" || replaySafeStatuses.has(response.status));
      if (!retryable || attempt >= maxAttempts) throw statusError(response.status, payload);
      await backoff(response.status === 429 ? response : undefined, attempt, spec, String(response.status));
      continue;
    }

    const safeToReplay = spec.method === "GET" || isUnreached(failure);
    if (!safeToReplay || attempt >= maxAttempts) throw connectionError(failure);
    await backoff(undefined, attempt, spec, failureCode(failure) ?? "network");
  }
}

function requestHeaders(spec: RequestSpec): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (spec.method !== "GET") headers["content-type"] = "application/json";
  if (spec.internal) headers["x-zark-service-key"] = serviceKey;
  return Object.keys(headers).length ? headers : undefined;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try { return JSON.parse(text); }
  catch { return undefined; }
}

function validatePayload<T>(status: number, payload: unknown): T {
  if (status !== 204 && (payload === undefined || (payload !== null && typeof payload !== "object"))) throw new Error("وصلت استجابة غير صالحة من خدمة 3Pal. حاول مجدداً بعد قليل.");
  return payload as T;
}

function errorMessageFromPayload(payload: unknown) {
  if (typeof payload !== "object" || !payload) return undefined;
  const value = (payload as { error?: unknown }).error;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function statusError(status: number, payload: unknown) {
  return new Error(errorMessageFromPayload(payload) ?? `تعذر الاتصال بخدمة 3Pal (${status})`);
}

function failureCode(failure: unknown) {
  if (failure instanceof Error && failure.name === "TimeoutError") return "TIMEOUT";
  if (typeof failure !== "object" || !failure) return undefined;
  const cause = (failure as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause && "code" in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function isUnreached(failure: unknown) {
  const code = failureCode(failure);
  return code !== undefined && unreachedConnectionCodes.has(code);
}

function connectionError(failure: unknown) {
  const code = failureCode(failure);
  if (code === "TIMEOUT") return new Error("تأخر رد خدمة 3Pal أكثر من المتوقع. حاول مجدداً بعد لحظات.");
  if (code) return new Error(`تعذر الاتصال بخدمة 3Pal (${code}). حاول مجدداً بعد لحظات.`);
  return new Error("تعذر الاتصال بخدمة 3Pal. حاول مجدداً بعد لحظات.");
}

/** يحترم Retry-After عند تحديد 429، وإلا يستخدم backoff متدرجًا مع jitter بسيط لتوزيع المحاولات. */
function retryDelayMs(response: Response | undefined, attempt: number) {
  const header = response?.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, maxBackoffMs);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), maxBackoffMs);
  }
  return Math.min(baseBackoffMs * 2 ** (attempt - 1), maxBackoffMs) + Math.round(Math.random() * 100);
}

async function backoff(response: Response | undefined, attempt: number, spec: RequestSpec, reason: string) {
  const delay = retryDelayMs(response, attempt);
  console.warn(`3Pal API ${spec.method} ${spec.path} failed (${reason}); retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts}).`);
  await new Promise((resolve) => { setTimeout(resolve, delay).unref(); });
}

