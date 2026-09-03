export const ACTIVE_GAME_SESSION_STATUSES = ["WAITING", "READY", "RUNNING", "PAUSED"] as const;

export function requiredSkipVotes(activePlayers: number, votePercent: number) {
  if (!Number.isInteger(activePlayers) || activePlayers < 1) return 1;
  const boundedPercent = Math.min(100, Math.max(1, votePercent));
  return Math.max(1, Math.ceil(activePlayers * boundedPercent / 100));
}

export function canJoinGameSession(status: string, allowLateJoin: boolean) {
  return status === "WAITING" || status === "READY" || (status === "RUNNING" && allowLateJoin);
}

export function memberCanControlGame(status: string, role = "PLAYER") {
  return role === "PLAYER" && (status === "JOINED" || status === "READY");
}

export function nextJoinStatus(sessionStatus: string, allowLateJoin: boolean, readyCheckEnabled: boolean) {
  if (!canJoinGameSession(sessionStatus, allowLateJoin)) return undefined;
  if (sessionStatus === "RUNNING") return "WAITING_NEXT" as const;
  return readyCheckEnabled ? "JOINED" as const : "READY" as const;
}

export function canStartWithPlayers(players: Array<{ status: string; role?: string }>, minPlayers: number, readyCheckEnabled: boolean) {
  const active = players.filter((player) => (player.role ?? "PLAYER") === "PLAYER" && player.status !== "LEFT");
  return active.length >= minPlayers && (!readyCheckEnabled || active.every((player) => player.status === "READY"));
}

export function normalizeQuestionKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
