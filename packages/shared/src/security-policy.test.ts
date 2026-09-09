import test from "node:test";
import assert from "node:assert/strict";
import { securityPolicy,reachedThreshold } from "../../../apps/api/src/modules/security/service.js";

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

test('an explicit role prohibition overrides operational human exemptions',()=>{
  const result=securityPolicy({guildId:'guild',executorId:exemptId,executorRoleIds:[regularId],actionType:'ROLE_UPDATED'},{...settings,rolePolicies:[{roleId:regularId,roles:0}]});
  assert.equal(result.enforce,true);
});
test('a configured ban allowance is usable in full; the next ban triggers enforcement',()=>{
  const config={maxBansPerHour:2,maxTimeoutsPerHour:2,maxKicksPerHour:5,maxRoleChangesPerHour:8,maxChannelDeletesPerHour:3,maxWebhookChangesPerHour:3,rolePolicies:[{roleId:regularId,bans:5,roles:0}]} as Parameters<typeof reachedThreshold>[0];
  const counts={bans:5,timeouts:0,kicks:0,roles:0,channels:0,webhooks:0};
  assert.equal(reachedThreshold(config,'MEMBER_BAN',counts,[regularId]),undefined);
  assert.ok(reachedThreshold(config,'MEMBER_BAN',{...counts,bans:6},[regularId]));
  assert.ok(reachedThreshold(config,'ROLE_UPDATED',{...counts,roles:1},[regularId]));
});
