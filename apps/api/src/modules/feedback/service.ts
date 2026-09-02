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
    const created = await tx.report.create({ data: { reporterId: input.reporterId, reportedId: input.reportedId, sessionId: input.roomId, reason: input.reason, description: input.description } });
    if (input.description?.trim()) {
      await tx.reportMessage.create({ data: { playerReportId: created.id, authorId: input.reporterId, authorName: input.reporterName, authorRole: "USER", message: input.description.trim() } });
    }
    await tx.user.update({ where: { id: input.reporterId }, data: { submittedReportCount: { increment: 1 } } });
    return created;
  });
  publish({ type: "report.created", reportId: report.id, reportKind: "PLAYER", reporterId: input.reporterId, reportedId: input.reportedId });
  return report;
}

export async function reportBug(input: { reporterId: string; reporterName: string; title: string; description: string; context?: string }) {
  await enforceRateLimit("bug-report", input.reporterId, 10, 60 * 60);
  if (!(await getGuildRuntimeSettings()).reportsEnabled) throw new Error("نظام البلاغات معطّل مؤقتًا من الإدارة");
  const report = await serializable(async (tx) => {
    await tx.user.upsert({ where: { id: input.reporterId }, update: { displayName: input.reporterName }, create: { id: input.reporterId, displayName: input.reporterName } });
    const reportsToday = await tx.bugReport.count({ where: { reporterId: input.reporterId, createdAt: { gte: startOfToday() } } });
    if (reportsToday >= 5) throw new Error("وصلت إلى الحد اليومي لتقارير الأخطاء");
    const created = await tx.bugReport.create({ data: { reporterId: input.reporterId, title: input.title, description: input.description, context: input.context } });
    await tx.reportMessage.create({ data: { bugReportId: created.id, authorId: input.reporterId, authorName: input.reporterName, authorRole: "USER", message: input.description.trim() } });
    await tx.user.update({ where: { id: input.reporterId }, data: { submittedReportCount: { increment: 1 } } });
    return created;
  });
  publish({ type: "report.created", reportId: report.id, reportKind: "BUG", reporterId: input.reporterId });
  return report;
}

export async function getMyReports(userId: string) {
  const [playerReports, bugReports] = await Promise.all([
    db.report.findMany({ where: { reporterId: userId }, include: { reported: { select: { id: true, displayName: true, avatarUrl: true } }, _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.bugReport.findMany({ where: { reporterId: userId }, include: { _count: { select: { messages: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return { playerReports, bugReports };
}

export type ReportKind = "PLAYER" | "BUG";

export async function getReportThreadForUser(kind: ReportKind, reportId: string, userId: string) {
  const thread = await loadReportThread(kind, reportId);
  if (thread.reporter.id !== userId) throw forbidden("لا يمكنك فتح محادثة بلاغ لا يخصك");
  return thread;
}

export async function getReportThreadForAdmin(kind: ReportKind, reportId: string) {
  return loadReportThread(kind, reportId);
}

export async function setReportPresence(kind: ReportKind, reportId: string, userId: string, active: boolean) {
  const now = new Date();
  const data = active
    ? { reporterViewingUntil: new Date(now.getTime() + 45_000), reporterNotificationPending: false, reporterLastReadAt: now }
    : { reporterViewingUntil: null };
  if (kind === "PLAYER") {
    const report = await db.report.findUnique({ where: { id: reportId }, select: { reporterId: true } });
    if (!report) throw notFound("البلاغ غير موجود");
    if (report.reporterId !== userId) throw forbidden("لا يمكنك تحديث حضور تذكرة لا تخصك");
    await db.report.update({ where: { id: reportId }, data });
  } else {
    const report = await db.bugReport.findUnique({ where: { id: reportId }, select: { reporterId: true } });
    if (!report) throw notFound("تقرير الخطأ غير موجود");
    if (report.reporterId !== userId) throw forbidden("لا يمكنك تحديث حضور تذكرة لا تخصك");
    await db.bugReport.update({ where: { id: reportId }, data });
  }
  return { active, viewingUntil: active ? data.reporterViewingUntil : null };
}

export async function addReportMessage(input: { kind: ReportKind; reportId: string; authorId: string; authorName: string; authorRole: "USER" | "ADMIN"; message: string }) {
  if (input.authorRole === "USER") await enforceRateLimit("report-message", input.authorId, 20, 10 * 60);
  const message = input.message.trim().slice(0, 2000);
  if (message.length < 1) throw new Error("اكتب رسالة قبل الإرسال");
  const recipientId = await serializable(async (tx) => {
    await tx.user.upsert({ where: { id: input.authorId }, update: { displayName: input.authorName }, create: { id: input.authorId, displayName: input.authorName } });
    if (input.kind === "PLAYER") {
      const report = await tx.report.findUnique({ where: { id: input.reportId } });
      if (!report) throw notFound("البلاغ غير موجود");
      if (input.authorRole === "USER" && report.reporterId !== input.authorId) throw forbidden("لا يمكنك الرد على هذا البلاغ");
      if (["RESOLVED", "REJECTED", "DISMISSED"].includes(report.status)) throw new Error("هذه التذكرة مغلقة ولا تقبل رسائل جديدة");
      await tx.reportMessage.create({ data: { playerReportId: report.id, authorId: input.authorId, authorName: input.authorName, authorRole: input.authorRole, message } });
      const notifyOwner = input.authorRole === "ADMIN" && !(report.reporterViewingUntil && report.reporterViewingUntil.getTime() > Date.now()) && !report.reporterNotificationPending;
      if (input.authorRole === "ADMIN") await tx.report.update({ where: { id: report.id }, data: { status: report.status === "PENDING" ? "REVIEWED" : report.status, reporterNotificationPending: notifyOwner || report.reporterNotificationPending } });
      return notifyOwner ? report.reporterId : undefined;
    }
    const report = await tx.bugReport.findUnique({ where: { id: input.reportId } });
    if (!report) throw notFound("تقرير الخطأ غير موجود");
    if (input.authorRole === "USER" && report.reporterId !== input.authorId) throw forbidden("لا يمكنك الرد على هذا البلاغ");
    if (["RESOLVED", "CLOSED"].includes(report.status)) throw new Error("هذه التذكرة مغلقة ولا تقبل رسائل جديدة");
    await tx.reportMessage.create({ data: { bugReportId: report.id, authorId: input.authorId, authorName: input.authorName, authorRole: input.authorRole, message } });
    const notifyOwner = input.authorRole === "ADMIN" && !(report.reporterViewingUntil && report.reporterViewingUntil.getTime() > Date.now()) && !report.reporterNotificationPending;
    if (input.authorRole === "ADMIN") await tx.bugReport.update({ where: { id: report.id }, data: { status: report.status === "OPEN" ? "IN_PROGRESS" : report.status, reporterNotificationPending: notifyOwner || report.reporterNotificationPending } });
    return notifyOwner ? report.reporterId : undefined;
  });
  publish({ type: "report.message_created", reportId: input.reportId, reportKind: input.kind, authorId: input.authorId, recipientId, authorRole: input.authorRole });
  return input.authorRole === "ADMIN" ? getReportThreadForAdmin(input.kind, input.reportId) : getReportThreadForUser(input.kind, input.reportId, input.authorId);
}

export async function updateReportStatus(input: { kind: ReportKind; reportId: string; adminId: string; adminName: string; status: string }) {
  const notification = await serializable(async (tx) => {
    await tx.user.upsert({ where: { id: input.adminId }, update: { displayName: input.adminName }, create: { id: input.adminId, displayName: input.adminName } });
    if (input.kind === "PLAYER") {
      const report = await tx.report.findUniqueOrThrow({ where: { id: input.reportId } });
      const status = input.status as "PENDING" | "REVIEWED" | "RESOLVED" | "REJECTED" | "DISMISSED";
      const notifyOwner = !(report.reporterViewingUntil && report.reporterViewingUntil.getTime() > Date.now()) && !report.reporterNotificationPending;
      await tx.report.update({ where: { id: report.id }, data: { status, resolvedBy: ["RESOLVED", "REJECTED", "DISMISSED"].includes(status) ? input.adminId : null, resolvedAt: ["RESOLVED", "REJECTED", "DISMISSED"].includes(status) ? new Date() : null, reporterNotificationPending: notifyOwner || report.reporterNotificationPending } });
      await tx.auditLog.create({ data: { adminId: input.adminId, action: "report.status_changed", targetId: report.id, details: { kind: input.kind, status } } });
      return { reporterId: report.reporterId, notifyOwner };
    }
    const report = await tx.bugReport.findUniqueOrThrow({ where: { id: input.reportId } });
    const status = input.status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    const notifyOwner = !(report.reporterViewingUntil && report.reporterViewingUntil.getTime() > Date.now()) && !report.reporterNotificationPending;
    await tx.bugReport.update({ where: { id: report.id }, data: { status, resolvedBy: ["RESOLVED", "CLOSED"].includes(status) ? input.adminId : null, resolvedAt: ["RESOLVED", "CLOSED"].includes(status) ? new Date() : null, reporterNotificationPending: notifyOwner || report.reporterNotificationPending } });
    await tx.auditLog.create({ data: { adminId: input.adminId, action: "report.status_changed", targetId: report.id, details: { kind: input.kind, status } } });
    return { reporterId: report.reporterId, notifyOwner };
  });
  publish({ type: "report.status_changed", reportId: input.reportId, reportKind: input.kind, adminId: input.adminId, status: input.status, reporterId: notification.notifyOwner ? notification.reporterId : undefined });
  return getReportThreadForAdmin(input.kind, input.reportId);
}

export async function deleteReportTicket(kind: ReportKind, reportId: string, adminId: string) {
  const deleted = await serializable(async (tx) => {
    const ticket = kind === "PLAYER"
      ? await tx.report.findUnique({ where: { id: reportId }, select: { reporterId: true } })
      : await tx.bugReport.findUnique({ where: { id: reportId }, select: { reporterId: true } });
    if (!ticket) throw notFound("التذكرة غير موجودة أو حُذفت مسبقًا");
    const [playerReports, bugReports, reporter] = await Promise.all([
      tx.report.count({ where: { reporterId: ticket.reporterId } }),
      tx.bugReport.count({ where: { reporterId: ticket.reporterId } }),
      tx.user.findUniqueOrThrow({ where: { id: ticket.reporterId }, select: { submittedReportCount: true } }),
    ]);
    const submittedReportCount = Math.max(reporter.submittedReportCount, playerReports + bugReports);
    await tx.auditLog.deleteMany({ where: { targetId: reportId } });
    if (kind === "PLAYER") await tx.report.delete({ where: { id: reportId } });
    else await tx.bugReport.delete({ where: { id: reportId } });
    await tx.user.update({ where: { id: ticket.reporterId }, data: { submittedReportCount } });
    await tx.auditLog.create({ data: { adminId, action: "report.deleted", targetId: ticket.reporterId, details: { submittedReportCount } } });
    return { reporterId: ticket.reporterId, submittedReportCount };
  });
  publish({ type: "report.deleted", reportId, reportKind: kind, adminId });
  return { deleted: true, ...deleted };
}

async function loadReportThread(kind: ReportKind, reportId: string) {
  if (kind === "PLAYER") {
    const report = await db.report.findUnique({ where: { id: reportId }, include: { reporter: { select: { id: true, displayName: true, avatarUrl: true } }, reported: { select: { id: true, displayName: true, avatarUrl: true } }, messages: { orderBy: { createdAt: "desc" }, take: 500 } } });
    if (!report) throw notFound("البلاغ غير موجود");
    return { kind, ...report, messages: [...report.messages].reverse(), title: `بلاغ لاعب: ${report.reason}` };
  }
  const report = await db.bugReport.findUnique({ where: { id: reportId }, include: { reporter: { select: { id: true, displayName: true, avatarUrl: true } }, messages: { orderBy: { createdAt: "desc" }, take: 500 } } });
  if (!report) throw notFound("تقرير الخطأ غير موجود");
  return { kind, ...report, messages: [...report.messages].reverse(), title: `خطأ: ${report.title}` };
}

function forbidden(message: string) {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function notFound(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
