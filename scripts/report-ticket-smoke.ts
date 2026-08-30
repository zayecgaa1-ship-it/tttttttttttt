import "dotenv/config";
import { db } from "../packages/db/src/client.js";
import { addReportMessage, getReportThreadForUser, reportPlayer, updateReportStatus } from "../apps/api/src/modules/feedback/service.js";

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
  await addReportMessage({ kind: "PLAYER", reportId, authorId: adminId, authorName: "Smoke Admin", authorRole: "ADMIN", message: "رد الإدارة" });
  await updateReportStatus({ kind: "PLAYER", reportId, adminId, adminName: "Smoke Admin", status: "RESOLVED" });
  const thread = await getReportThreadForUser("PLAYER", reportId, reporterId);
  if (thread.status !== "RESOLVED" || thread.messages.length !== 3) throw new Error("Report ticket lifecycle assertion failed");
  console.log(`Report ticket smoke passed: ${thread.status}, ${thread.messages.length} messages`);
} finally {
  if (reportId) {
    await db.auditLog.deleteMany({ where: { adminId, targetId: reportId } });
    await db.report.deleteMany({ where: { id: reportId } });
  }
  await db.user.deleteMany({ where: { id: { in: [reporterId, reportedId, adminId] } } });
  await db.$disconnect();
}
