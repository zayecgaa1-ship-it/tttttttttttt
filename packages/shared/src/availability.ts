export const AVAILABILITY_ACTIVITIES = ["FREE", "PLAYING", "STUDYING", "WORKING", "BUSY", "SLEEPING", "AWAY"] as const;
export type AvailabilityActivity = typeof AVAILABILITY_ACTIVITIES[number];
export type SchedulePeriod = { id?: string; dayOfWeek: number; startMinute: number; endMinute: number; activity: AvailabilityActivity };

export type AvailabilitySnapshot = {
  activity: AvailabilityActivity;
  source: "MANUAL" | "VOICE" | "SCHEDULE" | "NONE";
  currentPeriod?: SchedulePeriod;
  nextFree?: { startsAt: string; endsAt: string; startsInMinutes: number; period: SchedulePeriod };
  today: SchedulePeriod[];
  tomorrow: SchedulePeriod[];
  activeNow: boolean;
  lastActiveAt?: string;
  activityEndsAt?: string;
};

export function isValidTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function zonedDayMinute(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday);
  return { dayOfWeek, minute: Number(value.hour) * 60 + Number(value.minute) };
}

export function periodContains(period: SchedulePeriod, dayOfWeek: number, minute: number) {
  if (period.endMinute > period.startMinute) return period.dayOfWeek === dayOfWeek && minute >= period.startMinute && minute < period.endMinute;
  const nextDay = (period.dayOfWeek + 1) % 7;
  return (period.dayOfWeek === dayOfWeek && minute >= period.startMinute) || (nextDay === dayOfWeek && minute < period.endMinute);
}

export function validateSchedule(periods: SchedulePeriod[]) {
  for (const period of periods) {
    if (!Number.isInteger(period.dayOfWeek) || period.dayOfWeek < 0 || period.dayOfWeek > 6 || !Number.isInteger(period.startMinute) || !Number.isInteger(period.endMinute) || period.startMinute < 0 || period.startMinute > 1439 || period.endMinute < 0 || period.endMinute > 1439 || period.startMinute === period.endMinute) throw new Error("وقت الجدول غير صحيح");
  }
  const occupied = new Map<number, SchedulePeriod>();
  for (const period of periods) {
    const length = (period.endMinute - period.startMinute + 1440) % 1440;
    for (let offset = 0; offset < length; offset++) {
      const absolute = (period.dayOfWeek * 1440 + period.startMinute + offset) % (7 * 1440);
      if (occupied.has(absolute)) throw new Error("يوجد تعارض بين فترات الجدول الأسبوعي");
      occupied.set(absolute, period);
    }
  }
}

export function filterScheduleForPrivacy(periods: SchedulePeriod[], privacy: { showFreeTime: boolean; showStudyTime: boolean; showSleepTime: boolean }) {
  return periods.filter((period) => period.activity === "FREE" ? privacy.showFreeTime : period.activity === "STUDYING" ? privacy.showStudyTime : period.activity === "SLEEPING" ? privacy.showSleepTime : true);
}

export function shouldSuppressLfg(activity: AvailabilityActivity, dnd: { sleep: boolean; study: boolean; busy: boolean }) {
  return (activity === "SLEEPING" && dnd.sleep) || (activity === "STUDYING" && dnd.study) || (activity === "BUSY" && dnd.busy);
}

export function resolveAvailability(input: { now?: Date; timeZone: string; periods: SchedulePeriod[]; manualActivity?: AvailabilityActivity; manualUntil?: Date | null; voiceActive?: boolean; lastActiveAt?: Date | null; activeWindowMinutes?: number }): AvailabilitySnapshot {
  const now = input.now ?? new Date();
  const timeZone = isValidTimeZone(input.timeZone) ? input.timeZone : "Asia/Jerusalem";
  const local = zonedDayMinute(now, timeZone);
  const currentPeriod = input.periods.find((period) => periodContains(period, local.dayOfWeek, local.minute));
  const manual = input.manualActivity && input.manualActivity !== "AWAY" && (!input.manualUntil || input.manualUntil > now);
  const activity = input.voiceActive ? "PLAYING" : manual ? input.manualActivity! : currentPeriod?.activity ?? "AWAY";
  const source = input.voiceActive ? "VOICE" : manual ? "MANUAL" : currentPeriod ? "SCHEDULE" : "NONE";
  const lastActiveAt = input.lastActiveAt?.toISOString();
  const activeNow = Boolean(input.voiceActive || (input.lastActiveAt && now.getTime() - input.lastActiveAt.getTime() <= (input.activeWindowMinutes ?? 10) * 60_000));
  const nextFree = findNextFree(now, timeZone, input.periods);
  return {
    activity, source, currentPeriod, nextFree, activeNow, lastActiveAt,
    activityEndsAt: manual && input.manualUntil ? input.manualUntil.toISOString() : currentPeriod ? findPeriodEnd(now, timeZone, currentPeriod) : undefined,
    today: input.periods.filter((period) => period.dayOfWeek === local.dayOfWeek),
    tomorrow: input.periods.filter((period) => period.dayOfWeek === (local.dayOfWeek + 1) % 7),
  };
}

function findNextFree(now: Date, timeZone: string, periods: SchedulePeriod[]) {
  const local = zonedDayMinute(now, timeZone);
  const weekMinute = local.dayOfWeek * 1440 + local.minute;
  const candidates = periods.filter((period) => period.activity === "FREE").map((period) => {
    const active = periodContains(period, local.dayOfWeek, local.minute);
    const delta = active ? 0 : (period.dayOfWeek * 1440 + period.startMinute - weekMinute + 7 * 1440) % (7 * 1440);
    const startsAt = active ? now : resolveLocalMinute(now, timeZone, period.dayOfWeek, period.startMinute, delta);
    return startsAt ? { period, startsAt, delta: Math.max(0, Math.round((startsAt.getTime() - now.getTime()) / 60_000)) } : undefined;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const selected = candidates[0];
  if (!selected) return undefined;
  const duration = (selected.period.endMinute - selected.period.startMinute + 1440) % 1440;
  const endDay = (selected.period.dayOfWeek + (selected.period.endMinute <= selected.period.startMinute ? 1 : 0)) % 7;
  const currentPeriodEnd = selected.delta === 0 ? findPeriodEnd(now, timeZone, selected.period) : undefined;
  const endsAt = currentPeriodEnd
    ? new Date(currentPeriodEnd)
    : resolveLocalMinute(selected.startsAt, timeZone, endDay, selected.period.endMinute, duration) ?? new Date(selected.startsAt.getTime() + duration * 60_000);
  return { startsAt: selected.startsAt.toISOString(), endsAt: endsAt.toISOString(), startsInMinutes: selected.delta, period: selected.period };
}

function findPeriodEnd(now: Date, timeZone: string, period: SchedulePeriod) {
  const local = zonedDayMinute(now, timeZone);
  const remaining = period.endMinute > period.startMinute || local.dayOfWeek !== period.dayOfWeek ? period.endMinute - local.minute : 1440 - local.minute + period.endMinute;
  const endDay = period.endMinute <= period.startMinute ? (period.dayOfWeek + 1) % 7 : period.dayOfWeek;
  return resolveLocalMinute(now, timeZone, endDay, period.endMinute, Math.max(1, remaining))?.toISOString();
}

function resolveLocalMinute(anchor: Date, timeZone: string, targetDay: number, targetMinute: number, approximateDelta: number) {
  const approximate = new Date(anchor.getTime() + approximateDelta * 60_000);
  for (let correction = -180; correction <= 180; correction++) {
    const candidate = new Date(approximate.getTime() + correction * 60_000);
    if (candidate < anchor) continue;
    const local = zonedDayMinute(candidate, timeZone);
    if (local.dayOfWeek === targetDay && local.minute === targetMinute) return candidate;
  }
  return undefined;
}
