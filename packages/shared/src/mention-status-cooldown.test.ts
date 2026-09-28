import assert from "node:assert/strict";
import { test } from "node:test";
import { claimOnce } from "../../../apps/api/src/events.js";
import { mentionStatusCooldownKey } from "../../../apps/api/src/modules/profiles/service.js";

test("mention status cooldown key keeps guild, channel, requester and target apart", () => {
  const base = { guildId: "g1", channelId: "c1", userId: "target" };
  assert.equal(mentionStatusCooldownKey({ ...base, requesterId: "asker-a" }), "g1:c1:asker-a:target");
  assert.notEqual(mentionStatusCooldownKey({ ...base, requesterId: "asker-a" }), mentionStatusCooldownKey({ ...base, requesterId: "asker-b" }));
  assert.notEqual(mentionStatusCooldownKey({ ...base, requesterId: "asker-a" }), mentionStatusCooldownKey({ ...base, channelId: "c2", requesterId: "asker-a" }));
});

test("a missing requester still throttles through a shared fallback key", () => {
  assert.equal(mentionStatusCooldownKey({ guildId: "g1", channelId: "c1", userId: "target" }), "g1:c1:unknown:target");
});

test("two members can each request the same target once per window", async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const base = { guildId: `g-${suffix}`, channelId: `c-${suffix}`, userId: "target" };
  const askerA = mentionStatusCooldownKey({ ...base, requesterId: "asker-a" });
  const askerB = mentionStatusCooldownKey({ ...base, requesterId: "asker-b" });
  assert.equal(await claimOnce("mention-status", askerA, 60), true);
  assert.equal(await claimOnce("mention-status", askerA, 60), false);
  assert.equal(await claimOnce("mention-status", askerB, 60), true);
});
