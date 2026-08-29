import assert from "node:assert/strict";
import { db } from "../packages/db/src/client.js";
import { completeLfgRoom, createLfgRoom, joinLfgRoom, listPendingRatingRooms, markRatingRequestsDelivered } from "../apps/api/src/modules/lfg/service.js";
import { rateLfgPlayer, rateLfgRoom } from "../apps/api/src/modules/feedback/service.js";

const hostId = "zark-rating-host-smoke";
const playerId = "zark-rating-player-smoke";
let roomId: string | undefined;

try {
  const created = await createLfgRoom({ userId: hostId, displayName: "Rating Host", gameSlug: "minecraft", maxPlayers: 2, needsVoice: false });
  roomId = created.id;
  await joinLfgRoom(roomId, { userId: playerId, displayName: "Rating Player" });
  const completed = await completeLfgRoom(roomId, hostId);
  assert.equal(completed.status, "COMPLETED");
  assert.ok((await listPendingRatingRooms()).some((room) => room.id === roomId));

  const playerRating = await rateLfgPlayer({ roomId, raterId: hostId, raterName: "Rating Host", ratedId: playerId, stars: 5, tags: ["تعاوني"] });
  assert.equal(playerRating.stars, 5);
  const roomRating = await rateLfgRoom({ roomId, raterId: hostId, raterName: "Rating Host", stars: 4 });
  assert.equal(roomRating.stars, 4);
  await assert.rejects(() => rateLfgRoom({ roomId: roomId!, raterId: hostId, raterName: "Rating Host", stars: 3 }));

  await markRatingRequestsDelivered(roomId);
  assert.ok(!(await listPendingRatingRooms()).some((room) => room.id === roomId));
  console.log("LFG rating smoke passed: player + room rating + durable DM request state");
} finally {
  if (roomId) {
    await db.rating.deleteMany({ where: { sessionId: roomId } });
    await db.lfgRoom.deleteMany({ where: { id: roomId } });
  }
  await db.user.deleteMany({ where: { id: { in: [hostId, playerId] } } });
  await db.$disconnect();
}
