import test from "node:test";
import assert from "node:assert/strict";
import { canJoinGameSession, canStartWithPlayers, memberCanControlGame, nextJoinStatus, normalizeQuestionKey, requiredSkipVotes } from "./game-session.js";

test("skip vote requires a strict configured majority", () => {
  assert.equal(requiredSkipVotes(1, 51), 1);
  assert.equal(requiredSkipVotes(2, 51), 2);
  assert.equal(requiredSkipVotes(5, 51), 3);
});

test("late join is allowed only when configured", () => {
  assert.equal(canJoinGameSession("WAITING", false), true);
  assert.equal(canJoinGameSession("RUNNING", true), true);
  assert.equal(canJoinGameSession("RUNNING", false), false);
  assert.equal(canJoinGameSession("FINISHED", true), false);
});

test("only active players can control a round", () => {
  assert.equal(memberCanControlGame("JOINED"), true);
  assert.equal(memberCanControlGame("READY"), true);
  assert.equal(memberCanControlGame("WAITING_NEXT"), false);
  assert.equal(memberCanControlGame("JOINED", "SPECTATOR"), false);
});

test("question keys normalize harmless formatting differences", () => {
  assert.equal(normalizeQuestionKey("  سؤال   جديد "), normalizeQuestionKey("سؤال جديد"));
});

test("late join waits for the next round", () => {
  assert.equal(nextJoinStatus("RUNNING", true, false), "WAITING_NEXT");
  assert.equal(nextJoinStatus("RUNNING", false, false), undefined);
});

test("ready check blocks start until every joined player is ready", () => {
  assert.equal(canStartWithPlayers([{ status: "READY" }, { status: "JOINED" }], 2, true), false);
  assert.equal(canStartWithPlayers([{ status: "READY" }, { status: "READY" }], 2, true), true);
  assert.equal(canStartWithPlayers([{ status: "READY" }], 2, false), false);
});

test("duplicate votes cannot lower the majority threshold", () => {
  const uniqueVotes = new Set(["u1", "u1", "u2"]);
  assert.equal(uniqueVotes.size, requiredSkipVotes(3, 51));
});
