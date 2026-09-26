import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommandCooldown } from "./command-cooldown.js";

test("first use is accepted and an immediate repeat is blocked", () => {
  const cooldown = createCommandCooldown({ windowMs: 2_000 });
  const now = 1_000_000;
  assert.deepEqual(cooldown.check("user:play", now), { allowed: true, retryAfterMs: 0 });
  const blocked = cooldown.check("user:play", now + 500);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.allowed === false && blocked.retryAfterMs > 0, true);
  assert.equal(blocked.allowed === false && blocked.retryAfterMs <= 2_000, true);
});

test("the window opens again once it elapses", () => {
  const cooldown = createCommandCooldown({ windowMs: 2_000 });
  const now = 1_000_000;
  assert.equal(cooldown.check("user:daily", now).allowed, true);
  assert.equal(cooldown.check("user:daily", now + 1_999).allowed, false);
  assert.equal(cooldown.check("user:daily", now + 2_000).allowed, true);
});

test("keys are independent per user and per command", () => {
  const cooldown = createCommandCooldown({ windowMs: 2_000 });
  const now = 1_000_000;
  assert.equal(cooldown.check("user1:play", now).allowed, true);
  assert.equal(cooldown.check("user2:play", now).allowed, true);
  assert.equal(cooldown.check("user1:lobby", now).allowed, true);
  assert.equal(cooldown.check("user1:play", now + 10).allowed, false);
});

test("blocked attempts never extend the window", () => {
  const cooldown = createCommandCooldown({ windowMs: 1_000 });
  const now = 1_000_000;
  assert.equal(cooldown.check("user:joke", now).allowed, true);
  assert.equal(cooldown.check("user:joke", now + 900).allowed, false);
  assert.equal(cooldown.check("user:joke", now + 999).allowed, false);
  // Still opens at exactly now + window, even though 900ms/999ms retries were blocked.
  assert.equal(cooldown.check("user:joke", now + 1_000).allowed, true);
});

test("the tracked key count stays bounded", () => {
  const cooldown = createCommandCooldown({ windowMs: 60_000, maxEntries: 100 });
  const now = 1_000_000;
  for (let index = 0; index < 250; index += 1) cooldown.check(`user${index}:play`, now + index);
  assert.equal(cooldown.size <= 100 + 1, true);
});
