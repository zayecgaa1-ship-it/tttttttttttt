const apiUrl = process.env.PUBLIC_API_URL ?? "http://localhost:3000";
const serviceKey = process.env.INTERNAL_API_KEY ?? "";

export async function apiGet<T>(path: string, internal = false): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { headers: internal ? { "x-zark-service-key": serviceKey } : undefined, signal: AbortSignal.timeout(15_000) });
  return parse<T>(response);
}

export async function apiSend<T>(path: string, method: "POST" | "PUT", body: unknown, internal = true): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(internal ? { "x-zark-service-key": serviceKey } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return parse<T>(response);
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : undefined; }
  catch { body = undefined; }
  if (!response.ok) throw new Error(body?.error ?? `API ${response.status}`);
  return body as T;
}
