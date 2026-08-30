import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "../packages/db/src/client.js";
import { addGameQuestion, claimBumpReminder, deleteGameQuestion, getZarkGameContent, recordBumpCompleted, updateGameQuestion } from "../apps/api/src/modules/admin/service.js";
import { ensureSystemData, startZarkRace } from "../apps/api/src/service.js";

const adminId = "zark-smoke-content-admin";
const bumpService = "bump-reminder:zark-smoke-guild";
let questionId: string | undefined;
let matchId: string | undefined;

try {
  await ensureSystemData();
  await db.user.upsert({ where: { id: adminId }, update: {}, create: { id: adminId, displayName: "Content Admin" } });
  await db.serviceHeartbeat.deleteMany({ where: { service: bumpService } });
  assert.equal((await claimBumpReminder("zark-smoke-guild")).claimed, true);
  assert.equal((await claimBumpReminder("zark-smoke-guild")).claimed, false);
  const bumped = await recordBumpCompleted("zark-smoke-guild", adminId);
  assert.equal(bumped.recorded, true);
  assert.ok(new Date(bumped.nextReminderAt).getTime() - new Date(bumped.completedAt).getTime() === 120 * 60_000);
  assert.equal((await claimBumpReminder("zark-smoke-guild")).claimed, false);
  const created = await addGameQuestion({ adminId, gameSlug: "flags", prompt: "علم أي دولة هذا؟", acceptedAnswers: ["فلسطين"], difficulty: 2, enabled: true });
  questionId = created.id;
  const listed = await getZarkGameContent();
  assert.ok(listed.find((game) => game.slug === "flags")?.questions.some((question) => question.id === created.id));
  const updated = await updateGameQuestion(adminId, "flags", created.id, { prompt: "ما اسم الدولة؟", acceptedAnswers: ["فلسطين", "دولة فلسطين"], difficulty: 3, enabled: false });
  assert.equal(updated.enabled, false);
  assert.equal(updated.acceptedAnswers.length, 2);
  await updateGameQuestion(adminId, "flags", created.id, { prompt: "اختبار بنك الأعلام الإداري", acceptedAnswers: ["فلسطين"], difficulty: 3, enabled: true });
  const match = await startZarkRace("flags");
  matchId = match.id;
  assert.equal(match.prompt, "اختبار بنك الأعلام الإداري");
  await db.zarkMatch.delete({ where: { id: match.id } });
  matchId = undefined;
  const deleted = await deleteGameQuestion(adminId, "flags", created.id);
  questionId = undefined;
  assert.equal(deleted.deleted, true);
  console.log("Admin Zark game content smoke passed: list, add, edit, disable, and delete.");
} finally {
  if (matchId) await db.zarkMatch.deleteMany({ where: { id: matchId } });
  if (questionId) await db.gameQuestion.deleteMany({ where: { id: questionId } });
  await db.auditLog.deleteMany({ where: { adminId } });
  await db.serviceHeartbeat.deleteMany({ where: { service: bumpService } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
}
