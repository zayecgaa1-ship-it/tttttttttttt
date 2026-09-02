import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import type { DomainEventEnvelope, ZarkEvent } from "../../../packages/shared/src/index.js";

const clients = new Set<ServerResponse>();
const channel = "zark:events";
const instanceId = randomUUID();
let publisher: RedisClientType | undefined;
let subscriber: RedisClientType | undefined;
const localRateLimits = new Map<string, { count: number; resetAt: number }>();
const maxEventClients = Math.max(50, Math.min(5_000, Number(process.env.MAX_SSE_CLIENTS) || 500));

export async function initEvents() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  publisher = createClient({ url, socket: { connectTimeout: 5_000 } });
  subscriber = publisher.duplicate();
  publisher.on("error", (error) => console.error("Redis publisher error", error));
  subscriber.on("error", (error) => console.error("Redis subscriber error", error));
  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
  } catch (error) {
    console.error("Redis unavailable; continuing without cross-instance realtime", error);
    const failedPublisher = publisher;
    publisher = undefined;
    await Promise.allSettled([subscriber.close(), failedPublisher.close()]);
    subscriber = undefined;
    return;
  }
  await subscriber.subscribe(channel, (raw) => {
    try {
      const message = JSON.parse(raw) as { origin: string; event: DomainEventEnvelope };
      if (message.origin !== instanceId) broadcast(message.event);
    } catch (error) {
      console.error("Invalid Redis event ignored", error);
    }
  });
}

export async function closeEvents() {
  for (const client of clients) if (!client.writableEnded) client.end();
  clients.clear();
  const active = [subscriber, publisher].filter((client): client is RedisClientType => Boolean(client?.isOpen));
  subscriber = undefined;
  publisher = undefined;
  await Promise.allSettled(active.map((client) => client.close()));
}

export function subscribe(response: ServerResponse) {
  clients.add(response);
  const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 25_000);
  heartbeat.unref();
  response.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
  });
}

export function hasEventCapacity() {
  return clients.size < maxEventClients;
}

export function publish(event: ZarkEvent) {
  const envelope = wrapEvent(event);
  broadcast(envelope);
  if (publisher?.isReady) void publisher.publish(channel, JSON.stringify({ origin: instanceId, event: envelope })).catch((error) => console.error("Redis publish error", error));
}

export async function enforceRateLimit(scope: string, subject: string, limit: number, windowSeconds: number) {
  const key = `zark:rate:${scope}:${subject}`;
  let count: number | undefined;
  if (publisher?.isReady) {
    try {
      count = Number(await publisher.eval(
        "local value=redis.call('INCR',KEYS[1]);if value==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]);end;return value",
        { keys: [key], arguments: [String(windowSeconds)] },
      ));
    } catch (error) {
      console.error("Redis rate limit failed; using local fallback", error);
    }
  }
  if (count === undefined) {
    const now = Date.now();
    const current = localRateLimits.get(key);
    const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowSeconds * 1000 } : current;
    window.count += 1;
    localRateLimits.set(key, window);
    count = window.count;
    if (localRateLimits.size > 10_000) {
      for (const [itemKey, item] of localRateLimits) if (item.resetAt <= now) localRateLimits.delete(itemKey);
    }
  }
  if (count > limit) {
    const error = new Error("طلبات كثيرة خلال وقت قصير؛ انتظر قليلًا ثم حاول مجددًا") as Error & { statusCode: number };
    error.statusCode = 429;
    throw error;
  }
}

function broadcast(event: DomainEventEnvelope) {
  const publicEvent = { eventId: event.eventId, eventType: event.eventType, version: event.version, timestamp: event.timestamp, resourceId: event.resourceId };
  const payload = `data: ${JSON.stringify(publicEvent)}\n\n`;
  for (const client of clients) {
    if (!client.destroyed && !client.writableEnded) client.write(payload);
  }
}

function wrapEvent(event: ZarkEvent): DomainEventEnvelope {
  const value = event as unknown as Record<string, unknown>;
  const room = value.room as { id?: string } | undefined;
  return {
    eventId: randomUUID(),
    eventType: event.type,
    version: 1,
    timestamp: new Date().toISOString(),
    guildId: process.env.DISCORD_GUILD_ID ?? "default",
    actorId: stringValue(value.userId ?? value.raterId ?? value.reporterId ?? value.actorId),
    resourceId: stringValue(value.roomId ?? value.matchId ?? value.reportId ?? value.tradeId ?? room?.id) ?? "global",
    payload: event,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
