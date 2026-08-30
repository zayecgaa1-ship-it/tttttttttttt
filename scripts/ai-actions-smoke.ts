import "dotenv/config";
import { db } from "../packages/db/src/client.js";
import { askSupport } from "../apps/api/src/modules/support/service.js";

const userId = "900000000000000011";
const reportedId = "900000000000000012";
let roomId: string | undefined;
let reportId: string | undefined;

try {
  await db.user.createMany({ data: [{ id: userId, displayName: "AI Smoke User" }, { id: reportedId, displayName: "AI Smoke Target" }], skipDuplicates: true });
  const roomReply = await askSupport({ userId, displayName: "AI Smoke User", message: "اعمل روم ماينكرافت لـ 4 لاعبين مع فويس" });
  roomId = roomReply.action?.type === "LFG_CREATED" ? roomReply.action.roomId : undefined;
  if (!roomId) throw new Error("AI room action was not executed");
  const reportReply = await askSupport({ userId, displayName: "AI Smoke User", message: `ابلغ عن ${reportedId} سبب إساءة في اللعب` });
  reportId = reportReply.action?.type === "REPORT_CREATED" ? reportReply.action.reportId : undefined;
  if (!reportId) throw new Error("AI report action was not executed");
  console.log(`AI actions smoke passed: room ${roomId.slice(-6)}, report ${reportId.slice(-6)}`);
} finally {
  if (reportId) await db.report.deleteMany({ where: { id: reportId } });
  if (roomId) await db.lfgRoom.deleteMany({ where: { id: roomId } });
  await db.aiUsageDaily.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: { in: [userId, reportedId] } } });
  await db.$disconnect();
}
