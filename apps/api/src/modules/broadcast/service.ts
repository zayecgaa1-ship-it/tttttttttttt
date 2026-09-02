import { db } from "../../../../../packages/db/src/client.js";
import type { WebUser } from "../../auth.js";
import { HttpError } from "../../auth.js";
import { publish } from "../../events.js";

const BROADCAST_COOLDOWN_MS = 30 * 60_000;

export function cleanBroadcastText(value: string, maxLength: number) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, maxLength);
}

export async function listBroadcasts() {
  return db.adminBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
}

export async function createBroadcast(admin: WebUser, input: { title: string; content: string; confirmation: string }) {
  if (input.confirmation.trim() !== "إرسال") throw new HttpError("اكتب كلمة إرسال للتأكيد", 400);
  const title = cleanBroadcastText(input.title, 80);
  const content = cleanBroadcastText(input.content, 1500);
  if (title.length < 2 || content.length < 2) throw new HttpError("اكتب عنوانًا ومحتوى واضحين", 400);

  const active = await db.adminBroadcast.findFirst({ where: { status: { in: ["PENDING", "RUNNING"] } } });
  if (active) throw new HttpError("توجد رسالة جماعية قيد الإرسال؛ انتظر حتى تنتهي", 409);
  const recent = await db.adminBroadcast.findFirst({ where: { createdAt: { gte: new Date(Date.now() - BROADCAST_COOLDOWN_MS) }, status: { in: ["PENDING", "RUNNING", "COMPLETED"] } }, orderBy: { createdAt: "desc" } });
  if (recent) throw new HttpError("لحماية الأعضاء من الإزعاج، يمكن بدء حملة واحدة كل 30 دقيقة", 429);

  const campaign = await db.adminBroadcast.create({ data: { adminId: admin.userId, title, content } });
  await db.auditLog.create({ data: { adminId: admin.userId, action: "broadcast.created", targetId: campaign.id, details: { title } } });
  publish({ type: "broadcast.created", broadcastId: campaign.id, adminId: admin.userId });
  return campaign;
}

export async function getPendingBroadcast() {
  await db.adminBroadcast.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    data: { status: "PENDING", startedAt: null, lastError: "أعيدت للمحاولة بعد توقف سابق للبوت" },
  });
  return db.adminBroadcast.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
}

export async function claimBroadcast(id: string) {
  const claimed = await db.adminBroadcast.updateMany({ where: { id, status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date(), lastError: null } });
  return { claimed: claimed.count === 1, campaign: claimed.count === 1 ? await db.adminBroadcast.findUnique({ where: { id } }) : null };
}

export async function updateBroadcastProgress(id: string, input: { status: "RUNNING" | "COMPLETED" | "FAILED"; totalMembers: number; sentCount: number; failedCount: number; skippedCount: number; lastError?: string }) {
  const campaign = await db.adminBroadcast.update({
    where: { id },
    data: { ...input, lastError: input.lastError?.slice(0, 500) || null, completedAt: input.status === "RUNNING" ? null : new Date() },
  });
  if (input.status !== "RUNNING") await db.auditLog.create({ data: { adminId: campaign.adminId, action: `broadcast.${input.status.toLowerCase()}`, targetId: id, details: { totalMembers: input.totalMembers, sentCount: input.sentCount, failedCount: input.failedCount, skippedCount: input.skippedCount } } });
  return campaign;
}
