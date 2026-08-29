import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import type { DomainEventEnvelope, ZarkEvent } from "../../../packages/shared/src/index.js";

const clients = new Set<ServerResponse>();
const channel = "zark:events";
const instanceId = randomUUID();
let publisher: RedisClientType | undefined;

export async function initEvents() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  publisher = createClient({ url });
  const subscriber = publisher.duplicate();
  publisher.on("error", (error) => console.error("Redis publisher error", error));
  subscriber.on("error", (error) => console.error("Redis subscriber error", error));
  await Promise.all([publisher.connect(), subscriber.connect()]);
  await subscriber.subscribe(channel, (raw) => {
    const message = JSON.parse(raw) as { origin: string; event: DomainEventEnvelope };
    if (message.origin !== instanceId) broadcast(message.event);
  });
}

export function subscribe(response: ServerResponse) {
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

export function publish(event: ZarkEvent) {
  const envelope = wrapEvent(event);
  broadcast(envelope);
  if (publisher?.isReady) void publisher.publish(channel, JSON.stringify({ origin: instanceId, event: envelope })).catch((error) => console.error("Redis publish error", error));
}

function broadcast(event: DomainEventEnvelope) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
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
    resourceId: stringValue(value.roomId ?? value.matchId ?? value.reportId ?? room?.id) ?? "global",
    payload: event,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
