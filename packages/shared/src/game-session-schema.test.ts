import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve("packages/db/prisma/schema.prisma"), "utf8");

test("database prevents two active game sessions in one channel", () => {
  assert.match(schema, /model ZarkGameSession[\s\S]*activeChannelKey\s+String\?\s+@unique/);
});

test("database makes repeated join and skip clicks idempotent", () => {
  assert.match(schema, /model ZarkGameSessionMember[\s\S]*@@unique\(\[sessionId, userId\]\)/);
  assert.match(schema, /model ZarkSkipVote[\s\S]*@@unique\(\[sessionId, matchId, userId\]\)/);
});

test("session state is durable enough for restart recovery", () => {
  for (const field of ["currentMatchId", "messageId", "expiresAt", "recentQuestionKeys"]) assert.match(schema, new RegExp(`model ZarkGameSession[\\s\\S]*${field}`));
});
