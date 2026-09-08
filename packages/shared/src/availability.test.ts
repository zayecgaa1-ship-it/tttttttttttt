import assert from "node:assert/strict";
import { test } from "node:test";
import { filterScheduleForPrivacy, periodContains, resolveAvailability, shouldSuppressLfg, validateSchedule } from "./availability.js";

test("overnight periods apply before and after midnight", () => {
  const sleep = { dayOfWeek: 0, startMinute: 23 * 60, endMinute: 7 * 60, activity: "SLEEPING" as const };
  assert.equal(periodContains(sleep, 0, 23 * 60 + 30), true);
  assert.equal(periodContains(sleep, 1, 6 * 60 + 59), true);
  assert.equal(periodContains(sleep, 1, 7 * 60), false);
});

test("schedule rejects overlap including the next day part of overnight periods", () => {
  assert.throws(() => validateSchedule([
    { dayOfWeek: 0, startMinute: 23 * 60, endMinute: 7 * 60, activity: "SLEEPING" },
    { dayOfWeek: 1, startMinute: 6 * 60, endMinute: 8 * 60, activity: "FREE" },
  ]), /تعارض/);
});

test("timezone and DST use the user's real local clock", () => {
  const periods = [{ dayOfWeek: 0, startMinute: 3 * 60, endMinute: 4 * 60, activity: "FREE" as const }];
  const snapshot = resolveAvailability({ now: new Date("2026-03-29T01:30:00Z"), timeZone: "Europe/Berlin", periods });
  assert.equal(snapshot.activity, "FREE");
  assert.equal(snapshot.currentPeriod?.startMinute, 180);
});

test("an active overnight free period ends at its real local end time", () => {
  const snapshot = resolveAvailability({
    now: new Date("2026-09-07T03:50:00Z"),
    timeZone: "UTC",
    periods: [{ dayOfWeek: 0, startMinute: 23 * 60, endMinute: 7 * 60, activity: "FREE" }],
  });
  assert.equal(snapshot.nextFree?.startsInMinutes, 0);
  assert.equal(snapshot.nextFree?.endsAt, "2026-09-07T07:00:00.000Z");
});

test("manual and voice states override the weekly schedule", () => {
  const periods = [{ dayOfWeek: 0, startMinute: 0, endMinute: 1439, activity: "STUDYING" as const }];
  const now = new Date("2026-09-06T10:00:00Z");
  assert.equal(resolveAvailability({ now, timeZone: "UTC", periods, manualActivity: "FREE", manualUntil: new Date(now.getTime() + 60_000) }).activity, "FREE");
  assert.equal(resolveAvailability({ now, timeZone: "UTC", periods, voiceActive: true }).activity, "PLAYING");
});

test("privacy hides study and sleep without hiding allowed free periods", () => {
  const periods = [
    { dayOfWeek: 0, startMinute: 100, endMinute: 200, activity: "FREE" as const },
    { dayOfWeek: 0, startMinute: 200, endMinute: 300, activity: "STUDYING" as const },
    { dayOfWeek: 0, startMinute: 300, endMinute: 400, activity: "SLEEPING" as const },
  ];
  assert.deepEqual(filterScheduleForPrivacy(periods, { showFreeTime: true, showStudyTime: false, showSleepTime: false }).map((item) => item.activity), ["FREE"]);
});

test("LFG quiet hours follow each selected activity", () => {
  assert.equal(shouldSuppressLfg("SLEEPING", { sleep: true, study: true, busy: false }), true);
  assert.equal(shouldSuppressLfg("BUSY", { sleep: true, study: true, busy: false }), false);
});
