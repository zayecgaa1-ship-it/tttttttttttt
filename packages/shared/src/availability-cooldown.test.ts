import assert from "node:assert/strict";
import { test } from "node:test";
import { claimOnce } from "../../../apps/api/src/events.js";

test("mention status cooldown can be claimed only once during its TTL", async () => {
  const subject = `test-${Date.now()}-${Math.random()}`;
  assert.equal(await claimOnce("mention-status", subject, 1800), true);
  assert.equal(await claimOnce("mention-status", subject, 1800), false);
});
