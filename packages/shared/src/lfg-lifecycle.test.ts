import test from "node:test";
import assert from "node:assert/strict";
import { LFG_GATHER_WINDOW_MINUTES, LFG_WARNING_GRACE_MINUTES, lfgGatherDeadline, lfgWarningCloseAt, shouldWarnUnstartedLfgRoom } from "./lfg-lifecycle.js";

test("immediate LFG rooms get a full 30 minute gathering window", () => {
  const createdAt = new Date("2026-09-03T12:00:00.000Z");
  assert.equal(LFG_GATHER_WINDOW_MINUTES, 30);
  assert.equal(lfgGatherDeadline({ createdAt }).toISOString(), "2026-09-03T12:30:00.000Z");
  assert.equal(shouldWarnUnstartedLfgRoom({ createdAt }, new Date("2026-09-03T12:29:59.999Z")), false);
  assert.equal(shouldWarnUnstartedLfgRoom({ createdAt }, new Date("2026-09-03T12:30:00.000Z")), true);
});

test("scheduled LFG rooms count the gathering window from their scheduled time", () => {
  const createdAt = new Date("2026-09-03T10:00:00.000Z");
  const scheduledFor = new Date("2026-09-03T18:00:00.000Z");
  assert.equal(lfgGatherDeadline({ createdAt, scheduledFor }).toISOString(), "2026-09-03T18:30:00.000Z");
});

test("an attendance warning grants exactly 15 additional minutes", () => {
  const warnedAt = new Date("2026-09-03T12:30:00.000Z");
  assert.equal(LFG_WARNING_GRACE_MINUTES, 15);
  assert.equal(lfgWarningCloseAt(warnedAt).toISOString(), "2026-09-03T12:45:00.000Z");
});

test("started or already warned rooms never receive a second gathering warning", () => {
  const createdAt = new Date("2026-09-03T12:00:00.000Z");
  const now = new Date("2026-09-03T13:00:00.000Z");
  assert.equal(shouldWarnUnstartedLfgRoom({ createdAt, startedAt: new Date("2026-09-03T12:10:00.000Z") }, now), false);
  assert.equal(shouldWarnUnstartedLfgRoom({ createdAt, attendanceWarningAt: new Date("2026-09-03T12:30:00.000Z") }, now), false);
});
