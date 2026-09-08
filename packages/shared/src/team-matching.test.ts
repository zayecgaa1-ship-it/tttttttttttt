import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSmartRoomScore, calculateTeamScore } from "./team-matching.js";

test("team score rewards XP, wins and completed LFG sessions", () => {
  assert.equal(calculateTeamScore({ xp: 1200, wins: 4, sessions: 9 }), 2050);
});

test("smart matching prefers a teammate room when fill levels are close", () => {
  const teammateRoom = calculateSmartRoomScore({ memberCount: 2, maxPlayers: 4, teammates: 1, ageMs: 60_000 });
  const strangerRoom = calculateSmartRoomScore({ memberCount: 3, maxPlayers: 4, teammates: 0, ageMs: 60_000 });
  assert.ok(teammateRoom > strangerRoom);
});

test("smart matching still prioritizes a nearly full room without teammates", () => {
  const nearlyFull = calculateSmartRoomScore({ memberCount: 9, maxPlayers: 10, teammates: 0, ageMs: 0 });
  const emptyWithFriend = calculateSmartRoomScore({ memberCount: 1, maxPlayers: 10, teammates: 1, ageMs: 0 });
  assert.ok(nearlyFull > emptyWithFriend);
});
