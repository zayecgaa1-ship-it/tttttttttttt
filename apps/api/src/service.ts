import { db } from "../../../packages/db/src/client.js";
import { calculateWinnerPoints, evaluateAnswer, raceGames, seededRandom } from "../../../packages/games/src/index.js";
import type { DailyChallenge, LeaderboardRow, LfgGameSummary, ZarkGameSummary } from "../../../packages/shared/src/index.js";
import { publish } from "./events.js";

const externalGames = [
  { slug: "minecraft", name: "Minecraft", icon: "⛏️", category: "Sandbox" },
  { slug: "valorant", name: "Valorant", icon: "🎯", category: "FPS" },
  { slug: "fortnite", name: "Fortnite", icon: "🏝️", category: "Battle Royale" },
  { slug: "gta-v", name: "GTA V", icon: "🚗", category: "Open World" },
  { slug: "rust", name: "Rust", icon: "🛠️", category: "Survival" },
] as const;

const dayKey = () => new Date().toISOString().slice(0, 10);
const splitAnswers = (answer: string) => answer.split("|||");

export async function ensureSystemData() {
  await Promise.all([
    ...Array.from(raceGames.values()).map((game) => db.zarkGame.upsert({
      where: { slug: game.slug },
      update: { name: game.name, description: game.description, kind: "RACE", basePoints: game.basePoints, category: game.category ?? "RACE", aliases: [...(game.aliases ?? [])] },
      create: { slug: game.slug, name: game.name, description: game.description, kind: "RACE", basePoints: game.basePoints, category: game.category ?? "RACE", aliases: [...(game.aliases ?? [])] },
    })),
    ...externalGames.map((game) => db.lfgGameCatalog.upsert({ where: { slug: game.slug }, update: game, create: game })),
  ]);
}

export async function listZarkGames(): Promise<ZarkGameSummary[]> {
  await ensureSystemData();
  const games = await db.zarkGame.findMany({ where: { enabled: true }, select: { slug: true, name: true, description: true, kind: true, enabled: true, icon: true, category: true, aliases: true }, orderBy: { name: "asc" } });
  return games.map((game) => ({ ...game, description: game.description ?? undefined, icon: game.icon ?? undefined }));
}

export async function listLfgGames(): Promise<LfgGameSummary[]> {
  await ensureSystemData();
  const games = await db.lfgGameCatalog.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });
  return games.map((game) => ({ id: game.id, slug: game.slug, name: game.name, icon: game.icon ?? undefined, category: game.category ?? undefined }));
}

export async function getOrCreateDaily(): Promise<DailyChallenge> {
  await ensureSystemData();
  const key = dayKey();
  const existing = await db.dailyChallenge.findUnique({ where: { dayKey: key }, include: { game: true } });
  if (existing) return publicDaily(existing);

  const available = Array.from(raceGames.values()).filter((game) => game.questionSource !== "DATABASE");
  const seed = Math.floor(Date.now() / 86_400_000);
  const module = available[seed % available.length];
  const prompt = module.generate(seededRandom(seed));
  const game = await db.zarkGame.findUniqueOrThrow({ where: { slug: module.slug } });
  const startedAt = new Date();
  const endsAt = new Date(startedAt);
  endsAt.setUTCHours(24, 0, 0, 0);
  const created = await db.dailyChallenge.create({
    data: { dayKey: key, gameId: game.id, prompt: prompt.prompt, answer: prompt.answers.join("|||"), basePoints: module.basePoints, durationMs: module.durationMs, startedAt, endsAt },
    include: { game: true },
  });
  return publicDaily(created);
}

export async function answerDaily(input: { userId: string; displayName: string; answer: string }) {
  await getOrCreateDaily();
  const challenge = await db.dailyChallenge.findUniqueOrThrow({ where: { dayKey: dayKey() }, include: { game: true } });
  const now = new Date();
  if (now > challenge.endsAt) return { correct: false as const, expired: true as const, points: 0 };
  const evaluation = evaluateAnswer(input.answer, splitAnswers(challenge.answer));
  if (!evaluation.correct) return { correct: false as const, points: 0 };

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.dailyAnswer.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } } });
    if (existing) return { duplicate: true as const, points: existing.points, rank: existing.rank };
    const winners = await tx.dailyAnswer.count({ where: { challengeId: challenge.id } });
    if (winners >= 1) return { capped: true as const, points: 0 };

    const rank = 1;
    const elapsedMs = Math.max(0, now.getTime() - challenge.startedAt.getTime());
    const points = calculateWinnerPoints({ basePoints: challenge.basePoints, elapsedMs, durationMs: challenge.durationMs, typoCount: evaluation.typoCount, daily: true });
    await tx.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName }, create: { id: input.userId, displayName: input.displayName } });
    await tx.dailyAnswer.create({ data: { challengeId: challenge.id, userId: input.userId, rank, elapsedMs, points } });
    await tx.user.update({ where: { id: input.userId }, data: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 } } });
    await tx.gameProfile.upsert({
      where: { userId_gameId: { userId: input.userId, gameId: challenge.gameId } },
      update: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 }, losses: { increment: rank === 1 ? 0 : 1 }, streak: rank === 1 ? { increment: 1 } : 0 },
      create: { userId: input.userId, gameId: challenge.gameId, xp: points, wins: rank === 1 ? 1 : 0, losses: rank === 1 ? 0 : 1, streak: rank === 1 ? 1 : 0 },
    });
    return { duplicate: false as const, points, rank, typoCount: evaluation.typoCount, elapsedMs };
  }, { isolationLevel: "Serializable" });

  if ("capped" in result) return { correct: true as const, ...result };
  if (!result.duplicate) {
    publish({ type: "daily.answer", userId: input.userId, displayName: input.displayName, points: result.points });
    publish({ type: "leaderboard.updated" });
  }
  return { correct: true as const, ...result };
}

export async function startZarkRace(gameSlug?: string) {
  await ensureSystemData();
  const modules = Array.from(raceGames.values());
  const module = gameSlug ? raceGames.get(gameSlug) : modules[Math.floor(Math.random() * modules.length)];
  if (!module) throw new Error("لعبة Zark غير موجودة");
  const game = await db.zarkGame.findUniqueOrThrow({ where: { slug: module.slug } });
  if (!game.enabled) throw new Error("اللعبة معطّلة حاليًا");
  let generated;
  if (module.questionSource === "DATABASE") {
    const count = await db.gameQuestion.count({ where: { gameId: game.id, enabled: true } });
    if (count) {
      const question = await db.gameQuestion.findFirstOrThrow({ where: { gameId: game.id, enabled: true }, skip: Math.floor(Math.random() * count) });
      generated = { prompt: question.prompt, answers: question.acceptedAnswers, mediaUrl: question.mediaUrl ?? undefined };
    } else {
      generated = module.generate(Math.random);
    }
  } else {
    generated = module.generate(Math.random);
  }
  const startedAt = new Date();
  const match = await db.zarkMatch.create({ data: { gameId: game.id, prompt: generated.prompt, answer: generated.answers.join("|||"), mediaUrl: generated.mediaUrl, durationMs: module.durationMs, startedAt, endsAt: new Date(startedAt.getTime() + module.durationMs) } });
  publish({ type: "zark.match_started", matchId: match.id, gameSlug: game.slug });
  return { id: match.id, gameSlug: game.slug, gameName: game.name, prompt: match.prompt, mediaUrl: match.mediaUrl, startedAt: match.startedAt.toISOString(), endsAt: match.endsAt.toISOString() };
}

export async function answerZarkRace(matchId: string, input: { userId: string; displayName: string; answer: string }) {
  const match = await db.zarkMatch.findUnique({ where: { id: matchId }, include: { game: true } });
  if (!match || new Date() > match.endsAt) return { correct: false as const, expired: true as const, points: 0 };
  if (match.status !== "OPEN") return { correct: false as const, capped: true as const, points: 0 };
  const evaluation = evaluateAnswer(input.answer, splitAnswers(match.answer));
  if (!evaluation.correct) return { correct: false as const, points: 0 };
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.zarkMatchResult.findUnique({ where: { matchId_userId: { matchId, userId: input.userId } } });
    if (existing) return { duplicate: true as const, rank: existing.rank, points: existing.points };
    const claimed = await tx.zarkMatch.updateMany({ where: { id: matchId, status: "OPEN", endsAt: { gte: now } }, data: { status: "COMPLETED" } });
    if (!claimed.count) return { capped: true as const, points: 0 };
    const rank = 1;
    const elapsedMs = Math.max(0, now.getTime() - match.startedAt.getTime());
    const points = calculateWinnerPoints({ basePoints: match.game.basePoints, elapsedMs, durationMs: match.durationMs, typoCount: evaluation.typoCount });
    await tx.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName }, create: { id: input.userId, displayName: input.displayName } });
    await tx.zarkMatchResult.create({ data: { matchId, userId: input.userId, rank, elapsedMs, points } });
    await tx.user.update({ where: { id: input.userId }, data: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 } } });
    await tx.gameProfile.upsert({ where: { userId_gameId: { userId: input.userId, gameId: match.gameId } }, update: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 }, losses: { increment: rank === 1 ? 0 : 1 } }, create: { userId: input.userId, gameId: match.gameId, xp: points, wins: rank === 1 ? 1 : 0, losses: rank === 1 ? 0 : 1 } });
    return { duplicate: false as const, rank, points, typoCount: evaluation.typoCount, elapsedMs };
  }, { isolationLevel: "Serializable" });
  if (!("capped" in result) && !result.duplicate) {
    publish({ type: "zark.match_answered", matchId, userId: input.userId, displayName: input.displayName, points: result.points, rank: result.rank });
    publish({ type: "leaderboard.updated" });
  }
  return { correct: true as const, ...result };
}

export async function expireZarkRace(matchId: string) {
  const match = await db.zarkMatch.findUnique({ where: { id: matchId }, include: { results: { include: { user: true }, orderBy: { rank: "asc" } } } });
  if (!match) throw new Error("الجولة غير موجودة");
  if (match.status === "OPEN") await db.zarkMatch.update({ where: { id: matchId }, data: { status: "EXPIRED" } });
  const winner = match.results[0];
  return {
    winner: winner ? { userId: winner.userId, displayName: winner.user.displayName, points: winner.points, elapsedMs: winner.elapsedMs } : undefined,
    acceptedAnswer: splitAnswers(match.answer)[0],
  };
}

export async function leaderboard(period: "daily" | "weekly" | "monthly" | "all" = "daily", metric: "game" | "engagement" = "game"): Promise<LeaderboardRow[]> {
  const from = periodStart(period);
  const users = await db.user.findMany({ include: {
    points: from ? { where: { createdAt: { gte: from } } } : true,
    answers: from ? { where: { answeredAt: { gte: from } } } : true,
    matchResults: from ? { where: { createdAt: { gte: from } } } : true,
  } });
  return users.map((user) => ({
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    gamePoints: [...user.answers, ...user.matchResults].reduce((sum, item) => sum + item.points, 0),
    engagementPoints: user.points.reduce((sum, item) => sum + item.points, 0),
    xp: user.xp,
    wins: user.wins,
  })).sort((a, b) => metric === "game" ? b.gamePoints - a.gamePoints : b.engagementPoints - a.engagementPoints).slice(0, 10);
}

function publicDaily(challenge: { id: string; prompt: string; basePoints: number; durationMs: number; startedAt: Date; endsAt: Date; game: { slug: string; name: string } }): DailyChallenge {
  return { id: challenge.id, gameSlug: challenge.game.slug, gameName: challenge.game.name, prompt: challenge.prompt, basePoints: challenge.basePoints, startedAt: challenge.startedAt.toISOString(), endsAt: challenge.endsAt.toISOString() };
}

function periodStart(period: "daily" | "weekly" | "monthly" | "all") {
  if (period === "all") return undefined;
  const from = new Date();
  if (period === "daily") from.setHours(0, 0, 0, 0);
  if (period === "weekly") from.setDate(from.getDate() - 7);
  if (period === "monthly") from.setMonth(from.getMonth() - 1);
  return from;
}
