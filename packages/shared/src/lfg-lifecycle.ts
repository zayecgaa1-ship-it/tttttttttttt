export const LFG_GATHER_WINDOW_MINUTES = 30;
export const LFG_WARNING_GRACE_MINUTES = 15;

const minuteMs = 60_000;

export function lfgGatherDeadline(input: { createdAt: Date; scheduledFor?: Date | null }) {
  const gatheringStartsAt = input.scheduledFor ?? input.createdAt;
  return new Date(gatheringStartsAt.getTime() + LFG_GATHER_WINDOW_MINUTES * minuteMs);
}

export function lfgWarningCloseAt(warnedAt: Date) {
  return new Date(warnedAt.getTime() + LFG_WARNING_GRACE_MINUTES * minuteMs);
}

export function shouldWarnUnstartedLfgRoom(input: { createdAt: Date; scheduledFor?: Date | null; startedAt?: Date | null; attendanceWarningAt?: Date | null }, now: Date) {
  return !input.startedAt && !input.attendanceWarningAt && lfgGatherDeadline(input).getTime() <= now.getTime();
}
