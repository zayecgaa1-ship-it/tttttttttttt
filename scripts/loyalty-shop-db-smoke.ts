import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../packages/db/src/client.js";
import { awardLoyaltyPoints, getLoyaltyProfile, purchaseLoyaltyReward } from "../apps/api/src/modules/loyalty/service.js";
import { listLfgRooms } from "../apps/api/src/modules/lfg/service.js";

const prefix = `loyalty-shop-${randomUUID()}`;
try {
  const shopperId = `${prefix}-shopper`;
  const regularId = `${prefix}-regular`;
  await db.user.createMany({ data: [
    { id: shopperId, displayName: "Priority shopper", loyaltyPoints: 5_000, lifetimeLoyaltyPoints: 5_000 },
    { id: regularId, displayName: "Regular host", loyaltyPoints: 0 },
  ] });

  const firstDouble = await purchaseLoyaltyReward(shopperId, "double-24h");
  assert.equal(firstDouble.points, 4_550);
  const firstExpiry = new Date(firstDouble.shop.find((item) => item.key === "double-24h")?.activeUntil ?? 0).getTime();
  assert.ok(firstExpiry > Date.now() + 23 * 60 * 60_000);

  const secondDouble = await purchaseLoyaltyReward(shopperId, "double-24h");
  const secondExpiry = new Date(secondDouble.shop.find((item) => item.key === "double-24h")?.activeUntil ?? 0).getTime();
  assert.ok(secondExpiry > firstExpiry + 23 * 60 * 60_000, "a repeat purchase extends the active benefit");
  await awardLoyaltyPoints({ userId: shopperId, amount: 10, reason: "shop multiplier check", referenceKey: `${prefix}:award` });
  assert.equal((await getLoyaltyProfile(shopperId)).points, 4_120, "the personal multiplier doubles newly earned points");

  await purchaseLoyaltyReward(shopperId, "lfg-priority-7d");
  await purchaseLoyaltyReward(shopperId, "gold-badge");
  const owned = await getLoyaltyProfile(shopperId);
  assert.equal(owned.loyaltyBadge, "GOLD");
  assert.equal(owned.shop.find((item) => item.key === "lfg-priority-7d")?.active, true);
  await assert.rejects(() => purchaseLoyaltyReward(shopperId, "gold-badge"), /مملوكة/);

  const game = await db.lfgGameCatalog.create({ data: { slug: prefix, name: "Loyalty fixture" } });
  const regularRoom = await db.lfgRoom.create({ data: { hostId: regularId, lfgGameId: game.id, title: "Regular room" } });
  const priorityRoom = await db.lfgRoom.create({ data: { hostId: shopperId, lfgGameId: game.id, title: "Priority room" } });
  const rooms = await listLfgRooms();
  assert.equal(rooms[0]?.id, priorityRoom.id, "the active shop benefit moves the host room to the top");
  assert.equal(rooms[0]?.hostPriority, true);
  assert.equal(rooms.find((room) => room.id === regularRoom.id)?.hostPriority, false);

  const beforeVip = (await getLoyaltyProfile(shopperId)).points;
  await assert.rejects(() => purchaseLoyaltyReward(shopperId, "vip"), /تحتاج/);
  assert.equal((await getLoyaltyProfile(shopperId)).points, beforeVip, "failed purchases do not charge points");

  const transactionCount = await db.loyaltyTransaction.count({ where: { userId: shopperId, amount: { lt: 0 } } });
  assert.equal(transactionCount, 4);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: shopperId } })).lifetimeLoyaltyPoints, 5_020, "spending does not reduce lifetime rank progress");
} finally {
  await db.$disconnect();
}

console.log("PASS: loyalty purchases, timed extension, x2 earning, permanent ownership, room priority, ledger and insufficient balance.");
