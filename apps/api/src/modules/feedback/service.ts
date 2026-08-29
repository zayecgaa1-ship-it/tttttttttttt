import { Prisma } from "@prisma/client";
import { db } from "../../../../../packages/db/src/client.js";
import { enforceRateLimit, publish } from "../../events.js";
import { serializable } from "../../db-transaction.js";
import { getGuildRuntimeSettings } from "../admin/service.js";

export const allowedRatingTags = ["تعاوني", "محترف", "ممتع", "تنافسي", "غير محترم", "غير ملتزم"] as const;

export async function rateLfgPlayer(input: { raterId: string; raterName: string; ratedId: string; roomId: string; stars: number; tags: string[] }) {
  if (!(await getGuildRuntimeSettings()).ratingsEnabled) throw new Error("نظام التقييمات معطّل مؤقتًا من الإدارة");
  if (input.raterId === input.ratedId) throw new Error("لا يمكنك تقييم نفسك");
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw new Error("التقييم يجب أن يكون من 1 إلى 5");
  const tags = [...new Set(input.tags)].filter((tag) => allowedRatingTags.includes(tag as typeof allowedRatingTags[number])).slice(0, 3);
  let rating;
  try {
    rating = await serializable(async (tx) => {
      const room = await tx.lfgRoom.findUnique({ where: { id: input.roomId } });
      if (!room || room.status !== "COMPLETED") throw new Error("التقييم متاح بعد إكمال جلسة LFG فقط");
      const members = await tx.lfgMember.findMany({ where: { roomId: input.roomId, userId: { in: [input.raterId, input.ratedId] }, status: "COMPLETED" } });
      if (members.length !== 2) throw new Error("يمكن تقييم المشاركين في الجلسة فقط");
      await tx.user.upsert({ where: { id: input.raterId }, update: { displayName: input.raterName }, create: { id: input.raterId, displayName: input.raterName } });
      const created = await tx.rating.create({ data: { raterId: input.raterId, ratedId: input.ratedId, sessionId: input.roomId, stars: input.stars, tags } });
      if (input.stars >= 4) await tx.engagementPoint.upsert({ where: { userId_source: { userId: input.ratedId, source: `positive_rating:${created.id}` } }, update: {}, create: { userId: input.ratedId, points: 3, source: `positive_rating:${created.id}` } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("سبق أن قيّمت هذا اللاعب في هذه الجلسة");
    throw error;
  }
  publish({ type: "rating.created", roomId: input.roomId, raterId: input.raterId, ratedId: input.ratedId, stars: input.stars });
  publish({ type: "leaderboard.updated" });
  return rating;
}

export async function rateLfgRoom(input: { raterId: string; raterName: string; roomId: string; stars: number }) {
  if (!(await getGuildRuntimeSettings()).ratingsEnabled) throw new Error("نظام التقييمات معطّل مؤقتًا من الإدارة");
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw new Error("تقييم الغرفة يجب أن يكون من 1 إلى 5");
  try {
    return await serializable(async (tx) => {
      const room = await tx.lfgRoom.findUnique({ where: { id: input.roomId } });
      if (!room || room.status !== "COMPLETED") throw new Error("يمكن تقييم الغرفة بعد اكتمال الجلسة فقط");
      const member = await tx.lfgMember.findUnique({ where: { roomId_userId: { roomId: input.roomId, userId: input.raterId } } });
      if (member?.status !== "COMPLETED") throw new Error("يمكن للمشاركين الذين أكملوا الجلسة فقط تقييم الغرفة");
      await tx.user.upsert({ where: { id: input.raterId }, update: { displayName: input.raterName }, create: { id: input.raterId, displayName: input.raterName } });
      return tx.lfgRoomRating.create({ data: { roomId: input.roomId, raterId: input.raterId, stars: input.stars } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("سبق أن قيّمت هذه الغرفة");
    throw error;
  }
}

export async function reportPlayer(input: { reporterId: string; reporterName: string; reportedId: string; roomId?: string; reason: string; description?: string }) {
  await enforceRateLimit("player-report", input.reporterId, 5, 60 * 60);
  if (!(await getGuildRuntimeSettings()).reportsEnabled) throw new Error("نظام البلاغات معطّل مؤقتًا من الإدارة");
  if (input.reporterId === input.reportedId) throw new Error("لا يمكنك الإبلاغ عن نفسك");
  const report = await serializable(async (tx) => {
    await tx.user.upsert({ where: { id: input.reporterId }, update: { displayName: input.reporterName }, create: { id: input.reporterId, displayName: input.reporterName } });
    if (!(await tx.user.findUnique({ where: { id: input.reportedId }, select: { id: true } }))) throw new Error("اللاعب المُبلّغ عنه غير موجود في Zark");
    const reportsToday = await tx.report.count({ where: { reporterId: input.reporterId, createdAt: { gte: startOfToday() } } });
    if (reportsToday >= 3) throw new Error("وصلت إلى الحد اليومي للبلاغات");
    if (input.roomId) {
      const members = await tx.lfgMember.count({ where: { roomId: input.roomId, userId: { in: [input.reporterId, input.reportedId] } } });
      if (members !== 2) throw new Error("البلاغ المرتبط بجلسة يجب أن يكون بين مشاركين فيها");
      const duplicate = await tx.report.findFirst({ where: { reporterId: input.reporterId, reportedId: input.reportedId, sessionId: input.roomId } });
      if (duplicate) throw new Error("سبق أن أرسلت بلاغًا عن هذا اللاعب في الجلسة");
    }
    return tx.report.create({ data: { reporterId: input.reporterId, reportedId: input.reportedId, sessionId: input.roomId, reason: input.reason, description: input.description } });
  });
  publish({ type: "report.created", reportId: report.id, reporterId: input.reporterId, reportedId: input.reportedId });
  return report;
}

export async function reportBug(input: { reporterId: string; reporterName: string; title: string; description: string; context?: string }) {
  await enforceRateLimit("bug-report", input.reporterId, 10, 60 * 60);
  if (!(await getGuildRuntimeSettings()).reportsEnabled) throw new Error("نظام البلاغات معطّل مؤقتًا من الإدارة");
  const report = await serializable(async (tx) => {
    await tx.user.upsert({ where: { id: input.reporterId }, update: { displayName: input.reporterName }, create: { id: input.reporterId, displayName: input.reporterName } });
    const reportsToday = await tx.bugReport.count({ where: { reporterId: input.reporterId, createdAt: { gte: startOfToday() } } });
    if (reportsToday >= 5) throw new Error("وصلت إلى الحد اليومي لتقارير الأخطاء");
    return tx.bugReport.create({ data: { reporterId: input.reporterId, title: input.title, description: input.description, context: input.context } });
  });
  publish({ type: "report.created", reportId: report.id, reporterId: input.reporterId });
  return report;
}

export async function getMyReports(userId: string) {
  const [playerReports, bugReports] = await Promise.all([
    db.report.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" } }),
    db.bugReport.findMany({ where: { reporterId: userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { playerReports, bugReports };
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
