import test from "node:test";
import assert from "node:assert/strict";
import { findMentionedGame } from "../../../apps/api/src/modules/support/service.js";

const games = [
  { slug: "minecraft", name: "Minecraft" },
  { slug: "warzone", name: "Call of Duty: Warzone" },
  { slug: "cs2", name: "Counter-Strike 2" },
];

test("support assistant recognizes common Arabic Minecraft spelling mistakes", () => {
  assert.equal(findMentionedGame("اعملي غرفة مابن كرافت", games)?.slug, "minecraft");
});

test("support assistant aliases point at the real catalog slugs", () => {
  assert.equal(findMentionedGame("افتح روم كول اوف ديوتي", games)?.slug, "warzone");
  assert.equal(findMentionedGame("سويلي تجمع كاونتر", games)?.slug, "cs2");
});
