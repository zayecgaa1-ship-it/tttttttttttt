import assert from "node:assert/strict";
import { db } from "../packages/db/src/client.js";
import { answerZarkRace, expireZarkRace, startZarkRace } from "../apps/api/src/service.js";
import { getAvailability, updateAvailability } from "../apps/api/src/modules/profiles/service.js";

const firstUser = "zark-smoke-first-winner";
const secondUser = "zark-smoke-second-winner";
const createdMatches: string[] = [];

try {
  await Promise.all([
    db.user.upsert({ where: { id: firstUser }, update: { displayName: "Smoke Winner" }, create: { id: firstUser, displayName: "Smoke Winner" } }),
    db.user.upsert({ where: { id: secondUser }, update: { displayName: "Smoke Second" }, create: { id: secondUser, displayName: "Smoke Second" } }),
  ]);

  const availability = await updateAvailability(firstUser, {
    currentActivity: "FREE",
    activityUntil: new Date(Date.now() + 60_000),
    activityNote: "اختبار آمن",
    mentionPolicy: "INTERESTED_ONLY",
    weeklyAvailability: [{ dayOfWeek: 5, startMinute: 1200, endMinute: 1380, activity: "FREE" }],
  });
  assert.equal(availability.currentActivity, "FREE");
  assert.equal((await getAvailability(firstUser)).weeklyAvailability.length, 1);

  const match = await startZarkRace("translate");
  createdMatches.push(match.id);
  const stored = await db.zarkMatch.findUniqueOrThrow({ where: { id: match.id } });
  const answer = stored.answer.split("|||")[0];
  const first = await answerZarkRace(match.id, { userId: firstUser, displayName: "Smoke Winner", answer });
  const second = await answerZarkRace(match.id, { userId: secondUser, displayName: "Smoke Second", answer });
  assert.equal(first.correct, true);
  assert.ok(first.points >= 5 && first.points <= 15);
  assert.equal("capped" in second && second.capped, true);

  const expiring = await startZarkRace("flags");
  createdMatches.push(expiring.id);
  const expired = await expireZarkRace(expiring.id);
  assert.ok(expired.acceptedAnswer.length > 0);
  console.log("Zark game winner, scoring, expiry, and availability smoke checks passed.");
} finally {
  await db.zarkMatch.deleteMany({ where: { id: { in: createdMatches } } });
  await db.user.deleteMany({ where: { id: { in: [firstUser, secondUser] } } });
  await db.$disconnect();
}
