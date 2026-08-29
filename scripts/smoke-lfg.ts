import assert from "node:assert/strict";
import { db } from "../packages/db/src/client.js";
import { createLfgRoom, getLfgRoom, snoozeGameNotifications, updateUserPreference } from "../apps/api/src/modules/lfg/service.js";

const userId = "zark-schedule-smoke";
let roomId: string | undefined;

try {
  const enabled = await updateUserPreference({ userId, displayName: "Zark Smoke", gameSlug: "minecraft", interested: true, notificationsEnabled: true });
  assert.equal(enabled.interestStatus, "INTERESTED");
  assert.equal(enabled.notificationsEnabled, true);

  const disabled = await updateUserPreference({ userId, displayName: "Zark Smoke", gameSlug: "minecraft", interested: false, notificationsEnabled: false });
  assert.equal(disabled.interestStatus, "NOT_INTERESTED");
  assert.equal(disabled.notificationsEnabled, false);

  const snoozed = await snoozeGameNotifications({ userId, displayName: "Zark Smoke", gameSlug: "roblox", minutes: 60 });
  assert.equal(snoozed.notificationsEnabled, true);
  assert.ok(snoozed.mutedUntil && snoozed.mutedUntil > new Date());

  await assert.rejects(() => createLfgRoom({ userId, displayName: "Zark Smoke", gameSlug: "roblox", maxPlayers: 4 }), /اسم ماب Roblox/);

  const scheduledFor = new Date(Date.now() + 60 * 60_000);
  const room = await createLfgRoom({ userId, displayName: "Zark Smoke", gameSlug: "roblox", mapName: "Blox Fruits", maxPlayers: 4, scheduledFor });
  roomId = room.id;
  assert.equal(room.status, "SCHEDULED");
  assert.ok(room.scheduledFor);
  assert.ok(room.autoDeleteAt);
  assert.equal(room.mapName, "Blox Fruits");
  assert.equal((await getLfgRoom(room.id)).members[0]?.displayName, "Zark Smoke");
  console.log("LFG smoke passed: preference toggle + timed snooze + required Roblox map + durable schedule");
} finally {
  if (roomId) await db.lfgRoom.deleteMany({ where: { id: roomId } });
  await db.notificationDelivery.deleteMany({ where: { userId } });
  await db.userGamePreference.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
}
