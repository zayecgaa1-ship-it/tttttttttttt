import "dotenv/config";
import { db } from "../packages/db/src/client.js";
import { addReportMessage, deleteReportTicket, getReportThreadForUser, reportPlayer, setReportPresence, updateReportStatus } from "../apps/api/src/modules/feedback/service.js";

const reporterId = "900000000000000001";
const reportedId = "900000000000000002";
const adminId = "900000000000000003";
let reportId: string | undefined;

try {
  await db.user.createMany({
    data: [
      { id: reporterId, displayName: "Smoke Reporter" },
      { id: reportedId, displayName: "Smoke Target" },
      { id: adminId, displayName: "Smoke Admin" },
    ],
    skipDuplicates: true,
  });
  const report = await reportPlayer({ reporterId, reporterName: "Smoke Reporter", reportedId, reason: "اختبار تكاملي", description: "تفاصيل أولية" });
  reportId = report.id;
  await addReportMessage({ kind: "PLAYER", reportId, authorId: reporterId, authorName: "Smoke Reporter", authorRole: "USER", message: "رسالة المشتكي" });
  await setReportPresence("PLAYER", reportId, reporterId, true);
  await addReportMessage({ kind: "PLAYER", reportId, authorId: adminId, authorName: "Smoke Admin", authorRole: "ADMIN", message: "رد أثناء مشاهدة التذكرة" });
  let notificationState = await db.report.findUniqueOrThrow({ where: { id: reportId }, select: { reporterNotificationPending: true } });
  if (notificationState.reporterNotificationPending) throw new Error("Viewing reporter must not receive a DM notification");
  await setReportPresence("PLAYER", reportId, reporterId, false);
  await addReportMessage({ kind: "PLAYER", reportId, authorId: adminId, authorName: "Smoke Admin", authorRole: "ADMIN", message: "أول رد بعد الخروج" });
  await addReportMessage({ kind: "PLAYER", reportId, authorId: adminId, authorName: "Smoke Admin", authorRole: "ADMIN", message: "رد إضافي بلا Spam" });
  notificationState = await db.report.findUniqueOrThrow({ where: { id: reportId }, select: { reporterNotificationPending: true } });
  if (!notificationState.reporterNotificationPending) throw new Error("First unread admin reply must reserve one notification");
  await setReportPresence("PLAYER", reportId, reporterId, true);
  await updateReportStatus({ kind: "PLAYER", reportId, adminId, adminName: "Smoke Admin", status: "RESOLVED" });
  const thread = await getReportThreadForUser("PLAYER", reportId, reporterId);
  if (thread.status !== "RESOLVED" || thread.messages.length !== 5 || thread.reporterNotificationPending) throw new Error("Report ticket lifecycle assertion failed");
  const deletion = await deleteReportTicket("PLAYER", reportId, adminId);
  const [deletedTicket, deletedMessages, reporter] = await Promise.all([
    db.report.findUnique({ where: { id: reportId } }),
    db.reportMessage.count({ where: { playerReportId: reportId } }),
    db.user.findUniqueOrThrow({ where: { id: reporterId }, select: { submittedReportCount: true } }),
  ]);
  if (deletedTicket || deletedMessages !== 0 || deletion.submittedReportCount !== 1 || reporter.submittedReportCount !== 1) throw new Error("Report deletion/count assertion failed");
  console.log(`Report ticket smoke passed: deleted permanently, ${reporter.submittedReportCount} historical report`);
} finally {
  if (reportId) {
    await db.auditLog.deleteMany({ where: { adminId, targetId: { in: [reportId, reporterId] } } });
    await db.report.deleteMany({ where: { id: reportId } });
  }
  await db.user.deleteMany({ where: { id: { in: [reporterId, reportedId, adminId] } } });
  await db.$disconnect();
}
