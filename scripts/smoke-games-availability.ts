import assert from "node:assert/strict";
import { db } from "../packages/db/src/client.js";
import { advanceZarkRace, answerZarkRace, expireZarkRace, startZarkRace } from "../apps/api/src/service.js";
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
  const sleeping = await updateAvailability(firstUser, { currentActivity: "SLEEPING", activityUntil: new Date(Date.now() + 8 * 60 * 60_000), activityNote: "نائم", mentionPolicy: "NOBODY" });
  assert.equal(sleeping.currentActivity, "SLEEPING");

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

  const channelId = "zark-smoke-series-channel";
  const firstRound = await startZarkRace("translate", { channelId, totalRounds: 2 });
  createdMatches.push(firstRound.id);
  assert.equal(firstRound.roundNumber, 1);
  assert.equal(firstRound.totalRounds, 2);
  await assert.rejects(() => startZarkRace("flags", { channelId, totalRounds: 1 }), /توجد لعبة/);
  const firstRoundStored = await db.zarkMatch.findUniqueOrThrow({ where: { id: firstRound.id } });
  await answerZarkRace(firstRound.id, { userId: firstUser, displayName: "Smoke Winner", answer: firstRoundStored.answer.split("|||")[0] });
  const roundProgress = await advanceZarkRace(firstRound.id);
  assert.equal(roundProgress.completed, false);
  if (roundProgress.completed) throw new Error("Expected a second round");
  createdMatches.push(roundProgress.nextMatch.id);
  assert.equal(roundProgress.nextMatch.roundNumber, 2);
  await assert.rejects(() => startZarkRace("flags", { channelId, totalRounds: 1 }), /توجد لعبة/);
  const secondRoundStored = await db.zarkMatch.findUniqueOrThrow({ where: { id: roundProgress.nextMatch.id } });
  await answerZarkRace(roundProgress.nextMatch.id, { userId: secondUser, displayName: "Smoke Second", answer: secondRoundStored.answer.split("|||")[0] });
  const completedSeries = await advanceZarkRace(roundProgress.nextMatch.id);
  assert.equal(completedSeries.completed, true);
  assert.equal(completedSeries.standings.length, 2);

  const unlocked = await startZarkRace("flags", { channelId, totalRounds: 1 });
  createdMatches.push(unlocked.id);
  await expireZarkRace(unlocked.id);
  await advanceZarkRace(unlocked.id);

  const concurrentChannel = "zark-smoke-concurrent-channel";
  const attempts = await Promise.allSettled([
    startZarkRace("translate", { channelId: concurrentChannel, totalRounds: 1 }),
    startZarkRace("flags", { channelId: concurrentChannel, totalRounds: 1 }),
  ]);
  const started = attempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof startZarkRace>>> => attempt.status === "fulfilled");
  assert.equal(started.length, 1);
  createdMatches.push(started[0].value.id);
  await expireZarkRace(started[0].value.id);
  await advanceZarkRace(started[0].value.id);
  console.log("Zark rounds, channel lock, concurrency, scoring, expiry, and availability smoke checks passed.");
} finally {
  await db.zarkMatch.deleteMany({ where: { id: { in: createdMatches } } });
  await db.user.deleteMany({ where: { id: { in: [firstUser, secondUser] } } });
  await db.$disconnect();
}
