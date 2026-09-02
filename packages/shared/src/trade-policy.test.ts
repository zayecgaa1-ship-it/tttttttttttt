import test from "node:test";
import assert from "node:assert/strict";
import { isTradeModerator, tradeCode, validateTradeImage } from "../../../apps/api/src/modules/trade/service.js";

test("trade public IDs use a stable readable code", () => {
  assert.equal(tradeCode(1), "TR-000001");
  assert.equal(tradeCode(1234567), "TR-1234567");
});

test("the configured owner is always a trade moderator", () => {
  const previous = process.env.DISCORD_OWNER_ID;
  process.env.DISCORD_OWNER_ID = "492368135144603658";
  assert.equal(isTradeModerator({ userId: "492368135144603658", displayName: "Owner", roles: [] }), true);
  process.env.DISCORD_OWNER_ID = previous;
});

test("trade moderator user IDs are checked independently from normal admins", () => {
  const previous = process.env.TRADE_MODERATOR_IDS;
  process.env.TRADE_MODERATOR_IDS = "111111111111111111,222222222222222222";
  assert.equal(isTradeModerator({ userId: "222222222222222222", displayName: "Moderator", roles: [] }), true);
  assert.equal(isTradeModerator({ userId: "333333333333333333", displayName: "Admin", roles: [] }), false);
  process.env.TRADE_MODERATOR_IDS = previous;
});

test("trade moderator roles grant only the explicit trade permission", () => {
  const previous = process.env.TRADE_MODERATOR_ROLE_IDS;
  process.env.TRADE_MODERATOR_ROLE_IDS = "777777777777777777";
  assert.equal(isTradeModerator({ userId: "333333333333333333", displayName: "Moderator", roles: ["777777777777777777"] }), true);
  assert.equal(isTradeModerator({ userId: "333333333333333333", displayName: "Admin", roles: ["888888888888888888"] }), false);
  process.env.TRADE_MODERATOR_ROLE_IDS = previous;
});

test("trade images accept uploaded PNG, JPEG and WEBP data only", () => {
  for (const type of ["png", "jpeg", "webp"]) assert.doesNotThrow(() => validateTradeImage(`data:image/${type};base64,AAAA`));
});

test("trade images reject GIFs, external URLs and malformed data", () => {
  for (const value of ["data:image/gif;base64,AAAA", "https://example.com/item.png", "not-an-image"]) {
    assert.throws(() => validateTradeImage(value), /PNG|JPG|WEBP/);
  }
});

test("trade images reject decoded files over 1.5 MB", () => {
  assert.throws(() => validateTradeImage(`data:image/png;base64,${"A".repeat(2_100_000)}`), /1.5MB/);
});
