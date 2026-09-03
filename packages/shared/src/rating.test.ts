import test from "node:test";
import assert from "node:assert/strict";
import { ratingRoomIdFromCustomId } from "./rating.js";

test("player rating menu keeps the complete room id", () => {
  assert.equal(ratingRoomIdFromCustomId("lfg:rating-player:room_123"), "room_123");
  assert.equal(ratingRoomIdFromCustomId("lfg:rating-player"), undefined);
});
