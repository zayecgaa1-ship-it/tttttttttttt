import assert from "node:assert/strict";
import test from "node:test";
import { applyVipXpMultiplier,isVipActive } from "../../../apps/api/src/modules/loyalty/service.js";

test("VIP applies x1.5 XP only before expiry",()=>{
  const now=Date.UTC(2026,8,6);
  const active=new Date(now+1_000);
  const expired=new Date(now-1_000);
  assert.equal(isVipActive(active,now),true);
  assert.equal(isVipActive(expired,now),false);
  assert.equal(applyVipXpMultiplier(11,active,now),17);
  assert.equal(applyVipXpMultiplier(11,expired,now),11);
  assert.equal(applyVipXpMultiplier(11,null,now),11);
});
