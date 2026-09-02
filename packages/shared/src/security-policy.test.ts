import test from "node:test";
import assert from "node:assert/strict";
import { securityPolicy } from "../../../apps/api/src/modules/security/service.js";

const exemptId = "111111111111111111";
const regularId = "222222222222222222";
const settings = { operationalExemptUserIds: [exemptId] };

test("operational exemptions cover timeout, role and channel maintenance", () => {
  for (const actionType of ["MEMBER_TIMEOUT", "ROLE_UPDATED", "CHANNEL_DELETED", "WEBHOOK_UPDATED"] as const) {
    const result = securityPolicy({ guildId: "guild", executorId: exemptId, actionType }, settings);
    assert.equal(result.exempt, true);
    assert.equal(result.enforce, false);
  }
});

test("operational exemptions never cover bans or kicks", () => {
  for (const actionType of ["MEMBER_BAN", "MEMBER_KICK"] as const) {
    const result = securityPolicy({ guildId: "guild", executorId: exemptId, actionType }, settings);
    assert.equal(result.exempt, false);
    assert.equal(result.enforce, true);
  }
});

test("bot audit actions are logged but never enforced", () => {
  const result = securityPolicy({ guildId: "guild", executorId: regularId, executorIsBot: true, actionType: "MEMBER_BAN" }, settings);
  assert.equal(result.executorType, "BOT");
  assert.equal(result.enforce, false);
});

test("regular human administrators remain protected by enforcement", () => {
  const result = securityPolicy({ guildId: "guild", executorId: regularId, actionType: "MEMBER_TIMEOUT" }, settings);
  assert.equal(result.exempt, false);
  assert.equal(result.enforce, true);
});
