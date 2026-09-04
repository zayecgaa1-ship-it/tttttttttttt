import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../../../packages/db/src/client.js";
import { calculateWinnerPoints, evaluateAnswer, raceGames, retiredRaceGameSlugs, seededRandom } from "../../../packages/games/src/index.js";
import type { RaceGame } from "../../../packages/games/src/index.js";
import type { DailyChallenge, LeaderboardRow, ZarkGameSummary } from "../../../packages/shared/src/index.js";
import { enforceRateLimit, publish } from "./events.js";
import { serializable } from "./db-transaction.js";
import { awardLoyaltyPoints } from "./modules/loyalty/service.js";

const dayKey = () => new Date().toISOString().slice(0, 10);
const splitAnswers = (answer: string) => answer.split("|||");
const hintForAnswer = (answer: string) => answer.split(/\s+/).map((word) => {
  if (word.length <= 2) return `${word[0] ?? ""}…`;
  return `${word[0]}…${word.at(-1)}`;
}).join(" ");
const minimumRoundCount = 1;
const maximumRoundCount = 20;
let systemDataPromise: Promise<void> | undefined;

export async function ensureSystemData() {
  if (!systemDataPromise) systemDataPromise = Promise.all([
    ...Array.from(raceGames.values()).map((game) => db.zarkGame.upsert({
      where: { slug: game.slug },
      update: { name: game.name, description: game.description, kind: "RACE", enabled: true, basePoints: game.basePoints, category: game.category ?? "RACE", aliases: [...(game.aliases ?? [])] },
      create: { slug: game.slug, name: game.name, description: game.description, kind: "RACE", basePoints: game.basePoints, category: game.category ?? "RACE", aliases: [...(game.aliases ?? [])] },
    })),
    db.zarkGame.updateMany({ where: { slug: { in: [...retiredRaceGameSlugs] } }, data: { enabled: false } }),
  ]).then(async () => {
    const legacyMatches = await db.zarkMatch.findMany({ where: { seriesId: null }, select: { id: true } });
    if (legacyMatches.length) await db.$transaction(legacyMatches.map((match) => db.zarkMatch.update({ where: { id: match.id }, data: { seriesId: match.id } })));
  }).catch((error) => { systemDataPromise = undefined; throw error; });
  return systemDataPromise;
}

export async function listZarkGames(): Promise<ZarkGameSummary[]> {
  await ensureSystemData();
  const games = await db.zarkGame.findMany({ where: { enabled: true }, select: { slug: true, name: true, description: true, kind: true, enabled: true, icon: true, category: true, aliases: true }, orderBy: { name: "asc" } });
  return games.map((game) => ({ ...game, description: game.description ?? undefined, icon: game.icon ?? undefined, questionCount: raceGames.get(game.slug)?.questionCount ?? 0 }));
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
  try {
    const created = await db.dailyChallenge.create({
      data: { dayKey: key, gameId: game.id, prompt: prompt.prompt, answer: prompt.answers.join("|||"), basePoints: module.basePoints, durationMs: module.durationMs, startedAt, endsAt },
      include: { game: true },
    });
    return publicDaily(created);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    return publicDaily(await db.dailyChallenge.findUniqueOrThrow({ where: { dayKey: key }, include: { game: true } }));
  }
}

export async function answerDaily(input: { userId: string; displayName: string; answer: string }) {
  await enforceRateLimit("daily-answer", input.userId, 30, 10);
  await getOrCreateDaily();
  const challenge = await db.dailyChallenge.findUniqueOrThrow({ where: { dayKey: dayKey() }, include: { game: true } });
  const now = new Date();
  if (now > challenge.endsAt) return { correct: false as const, expired: true as const, points: 0 };
  const evaluation = evaluateAnswer(input.answer, splitAnswers(challenge.answer));
  if (!evaluation.correct) return { correct: false as const, points: 0 };

  let result;
  try {
    result = await serializable(async (tx) => {
      const existing = await tx.dailyAnswer.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } } });
      if (existing) return { duplicate: true as const, points: existing.points, rank: existing.rank };
      const winners = await tx.dailyAnswer.count({ where: { challengeId: challenge.id } });
      if (winners >= 1) return { capped: true as const, points: 0 };

      const rank = 1;
      const elapsedMs = Math.max(0, now.getTime() - challenge.startedAt.getTime());
      const points = calculateWinnerPoints({ basePoints: challenge.basePoints, elapsedMs, durationMs: challenge.durationMs, typoCount: evaluation.typoCount, daily: true });
      await tx.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName }, create: { id: input.userId, displayName: input.displayName } });
      await tx.dailyAnswer.create({ data: { challengeId: challenge.id, userId: input.userId, rank, elapsedMs, points } });
      await tx.user.update({ where: { id: input.userId }, data: { xp: { increment: points }, wins: { increment: 1 } } });
      await tx.gameProfile.upsert({
        where: { userId_gameId: { userId: input.userId, gameId: challenge.gameId } },
        update: { xp: { increment: points }, wins: { increment: 1 }, streak: { increment: 1 } },
        create: { userId: input.userId, gameId: challenge.gameId, xp: points, wins: 1, streak: 1 },
      });
      return { duplicate: false as const, points, rank, typoCount: evaluation.typoCount, elapsedMs };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await db.dailyAnswer.findUnique({ where: { challengeId_userId: { challengeId: challenge.id, userId: input.userId } } });
    result = existing ? { duplicate: true as const, points: existing.points, rank: existing.rank } : { capped: true as const, points: 0 };
  }

  if ("capped" in result) return { correct: true as const, ...result };
  if (!result.duplicate) {
    await awardLoyaltyPoints({ userId: input.userId, amount: 10, reason: "إجابة تحدي اليوم", referenceKey: `daily:${challenge.id}:${input.userId}` });
    await awardLoyaltyPoints({ userId: input.userId, amount: 15, reason: "مهمة يومية: تحدي اليوم", referenceKey: `mission:daily:${dayKey()}:${input.userId}` });
    publish({ type: "daily.answer", userId: input.userId, displayName: input.displayName, points: result.points });
    publish({ type: "leaderboard.updated" });
  }
  return { correct: true as const, ...result };
}

export async function startZarkRace(gameSlug?: string, options: { channelId?: string; totalRounds?: number; durationSeconds?: number } = {}) {
  await ensureSystemData();
  const modules = Array.from(raceGames.values());
  const module = gameSlug ? raceGames.get(gameSlug) : modules[Math.floor(Math.random() * modules.length)];
  if (!module) throw new Error("لعبة Zark غير موجودة");
  const game = await db.zarkGame.findUniqueOrThrow({ where: { slug: module.slug } });
  if (!game.enabled) throw new Error("اللعبة معطّلة حاليًا");
  const totalRounds = options.totalRounds ?? 1;
  if (!Number.isInteger(totalRounds) || totalRounds < minimumRoundCount || totalRounds > maximumRoundCount) throw new Error("عدد الجولات يجب أن يكون من 1 إلى 20");
  const durationSeconds = options.durationSeconds;
  if (durationSeconds !== undefined && (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 60)) throw new Error("وقت الإجابة يجب أن يكون من 10 إلى 60 ثانية");
  const durationMs = durationSeconds === undefined ? module.durationMs : durationSeconds * 1_000;
  const generated = await generateRacePrompt(module, game.id, options.channelId);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationMs);
  const seriesId = randomUUID();
  let match;
  try {
    match = await serializable(async (tx) => {
      if (options.channelId) {
        const activeLobby = await tx.zarkGameSession.findUnique({ where: { activeChannelKey: options.channelId }, select: { status: true } });
        if (activeLobby && ["WAITING", "READY"].includes(activeLobby.status)) throw new Error("يوجد لوبي شغال في هذه القناة. ادخل اللوبي أو ابدأه أولًا.");
        await tx.zarkMatch.updateMany({ where: { activeChannelKey: options.channelId, lockExpiresAt: { lte: startedAt }, status: "OPEN" }, data: { activeChannelKey: null, status: "EXPIRED" } });
        await tx.zarkMatch.updateMany({ where: { activeChannelKey: options.channelId, lockExpiresAt: { lte: startedAt } }, data: { activeChannelKey: null } });
        const active = await tx.zarkMatch.findUnique({ where: { activeChannelKey: options.channelId }, select: { game: { select: { name: true } }, roundNumber: true, totalRounds: true } });
        if (active) throw gameChannelBusy(active.game.name, active.roundNumber, active.totalRounds);
      }
      return tx.zarkMatch.create({
        data: {
          gameId: game.id,
          seriesId,
          channelId: options.channelId,
          activeChannelKey: options.channelId,
          roundNumber: 1,
          totalRounds,
          prompt: generated.prompt,
          answer: generated.answers.join("|||"),
          choices: generated.choices ?? [],
          mediaUrl: generated.mediaUrl,
          durationMs,
          startedAt,
          endsAt,
          lockExpiresAt: options.channelId ? new Date(endsAt.getTime() + 90_000) : undefined,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && options.channelId) throw gameChannelBusy();
    throw error;
  }
  publish({ type: "zark.match_started", matchId: match.id, seriesId, gameSlug: game.slug, channelId: options.channelId, roundNumber: 1, totalRounds });
  return publicZarkMatch(match, game);
}

type LobbyActor = { userId: string; displayName: string };

function publicLobby(session: any) {
  const members = session.members.filter((member: any) => member.status !== "LEFT");
  return {
    id: session.id, gameSlug: session.game.slug, gameName: session.game.name, channelId: session.channelId,
    hostId: session.hostId, status: session.status, totalRounds: session.totalRounds,
    durationSeconds: Math.round(session.durationMs / 1_000), minPlayers: session.minPlayers, maxPlayers: session.maxPlayers,
    members: members.map((member: any) => ({ userId: member.userId, displayName: member.displayName, ready: member.status === "READY" })),
    allReady: members.length >= session.minPlayers && members.every((member: any) => member.status === "READY"),
  };
}

export async function createZarkLobby(gameSlug: string, input: LobbyActor & { channelId: string; rounds?: number; seconds?: number }) {
  await ensureSystemData();
  const game = await db.zarkGame.findUnique({ where: { slug: gameSlug } });
  if (!game?.enabled || !raceGames.has(gameSlug)) throw new Error("اللعبة غير متاحة حاليًا.");
  const totalRounds = input.rounds ?? 5;
  const durationSeconds = input.seconds ?? 15;
  if (!Number.isInteger(totalRounds) || totalRounds < minimumRoundCount || totalRounds > maximumRoundCount) throw new Error("عدد الجولات يجب أن يكون من 1 إلى 20.");
  if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 60) throw new Error("وقت الإجابة يجب أن يكون من 10 إلى 60 ثانية.");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.zarkGameSession.updateMany({ where: { activeChannelKey: input.channelId, status: { in: ["WAITING", "READY"] }, expiresAt: { lte: new Date() } }, data: { status: "CANCELLED", activeChannelKey: null, endedAt: new Date() } });
  try {
    const session = await db.zarkGameSession.create({ data: {
      gameId: game.id, guildId: "discord", channelId: input.channelId, activeChannelKey: input.channelId, hostId: input.userId,
      totalRounds, durationMs: durationSeconds * 1_000, lobbyEnabled: true, readyCheckEnabled: true, minPlayers: 2, maxPlayers: 8, expiresAt,
      members: { create: { userId: input.userId, displayName: input.displayName } },
    }, include: { game: true, members: true } });
    return publicLobby(session);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("يوجد لوبي أو لعبة شغالة في هذه القناة.");
    throw error;
  }
}

export async function updateZarkLobby(lobbyId: string, actor: LobbyActor, action: "JOIN" | "LEAVE" | "READY") {
  const session = await db.zarkGameSession.findUnique({ where: { id: lobbyId }, include: { game: true, members: true } });
  if (!session || !["WAITING", "READY"].includes(session.status) || new Date() > session.expiresAt) throw new Error("انتهى هذا اللوبي.");
  if (action === "JOIN") {
    if (session.members.filter((member) => member.status !== "LEFT").length >= session.maxPlayers) throw new Error("اللوبي مكتمل.");
    await db.zarkGameSessionMember.upsert({ where: { sessionId_userId: { sessionId: lobbyId, userId: actor.userId } }, update: { displayName: actor.displayName, status: "JOINED", leftAt: null, readyAt: null }, create: { sessionId: lobbyId, userId: actor.userId, displayName: actor.displayName } });
  } else if (action === "LEAVE") {
    if (actor.userId === session.hostId) throw new Error("المضيف لا يستطيع الخروج؛ ابدأ اللوبي أو ألغِه ثم أنشئ واحدًا جديدًا.");
    await db.zarkGameSessionMember.updateMany({ where: { sessionId: lobbyId, userId: actor.userId, status: { not: "LEFT" } }, data: { status: "LEFT", leftAt: new Date(), readyAt: null } });
  } else {
    const member = session.members.find((item) => item.userId === actor.userId && item.status !== "LEFT");
    if (!member) throw new Error("ادخل اللوبي أولًا.");
    await db.zarkGameSessionMember.update({ where: { sessionId_userId: { sessionId: lobbyId, userId: actor.userId } }, data: { status: member.status === "READY" ? "JOINED" : "READY", readyAt: member.status === "READY" ? null : new Date() } });
  }
  const updated = await db.zarkGameSession.findUniqueOrThrow({ where: { id: lobbyId }, include: { game: true, members: true } });
  const lobby = publicLobby(updated);
  if (lobby.allReady) await db.zarkGameSession.update({ where: { id: lobbyId }, data: { status: "READY" } });
  return { ...lobby, autoStart: lobby.allReady };
}

export async function startZarkLobby(lobbyId: string, actorId: string, autoStart = false) {
  const session = await db.zarkGameSession.findUnique({ where: { id: lobbyId }, include: { game: true, members: true } });
  if (!session || !["WAITING", "READY"].includes(session.status) || new Date() > session.expiresAt) throw new Error("انتهى هذا اللوبي.");
  const members = session.members.filter((member) => member.status !== "LEFT");
  const allReady = members.length >= session.minPlayers && members.every((member) => member.status === "READY");
  if (autoStart ? !allReady : actorId !== session.hostId) throw new Error("بدء اللوبي للمضيف فقط، أو يتم تلقائيًا عند جاهزية الجميع.");
  if (members.length < session.minPlayers) throw new Error(`يلزم ${session.minPlayers} لاعبين على الأقل.`);
  await db.zarkGameSession.update({ where: { id: lobbyId }, data: { status: "RUNNING", activeChannelKey: null, startedAt: new Date() } });
  return startZarkRace(session.game.slug, { channelId: session.channelId, totalRounds: session.totalRounds, durationSeconds: Math.round(session.durationMs / 1_000) });
}

export async function cancelZarkLobby(lobbyId: string, actorId: string) {
  const session = await db.zarkGameSession.findUnique({ where: { id: lobbyId }, include: { game: true, members: true } });
  if (!session || !["WAITING", "READY"].includes(session.status)) throw new Error("هذا اللوبي غير متاح للإلغاء.");
  if (session.hostId !== actorId) throw new Error("إلغاء اللوبي للمضيف فقط.");
  const cancelled = await db.zarkGameSession.update({ where: { id: lobbyId }, data: { status: "CANCELLED", activeChannelKey: null, endedAt: new Date() }, include: { game: true, members: true } });
  return publicLobby(cancelled);
}

export async function advanceZarkRace(matchId: string) {
  const current = await db.zarkMatch.findUnique({ where: { id: matchId }, include: { game: true } });
  if (!current) throw new Error("الجولة غير موجودة");
  const seriesId = current.seriesId ?? current.id;
  if (!current.seriesId) await db.zarkMatch.update({ where: { id: current.id }, data: { seriesId } });
  if (current.status === "OPEN") throw new Error("الجولة الحالية ما زالت مفتوحة");
  if (current.roundNumber >= current.totalRounds) {
    await db.zarkMatch.updateMany({ where: { id: current.id, activeChannelKey: current.activeChannelKey }, data: { activeChannelKey: null, lockExpiresAt: null } });
    publish({ type: "zark.series_completed", seriesId, channelId: current.channelId ?? undefined, totalRounds: current.totalRounds });
    return { completed: true as const, seriesId, totalRounds: current.totalRounds, standings: await zarkSeriesStandings(seriesId) };
  }
  const existingNext = await db.zarkMatch.findFirst({ where: { seriesId, roundNumber: current.roundNumber + 1 }, include: { game: true } });
  if (existingNext) return { completed: false as const, nextMatch: publicZarkMatch(existingNext, existingNext.game), standings: await zarkSeriesStandings(seriesId) };
  const module = raceGames.get(current.game.slug);
  if (!module) throw new Error("تعذر تحميل اللعبة للجولة التالية");
  const generated = await generateRacePrompt(module, current.gameId, current.channelId ?? undefined);
  const startedAt = new Date();
  // Every round in one match series keeps the time chosen by its starter.
  const endsAt = new Date(startedAt.getTime() + current.durationMs);
  let next;
  try {
    next = await serializable(async (tx) => {
      const locked = await tx.zarkMatch.findUniqueOrThrow({ where: { id: current.id } });
      if (locked.status === "OPEN") throw new Error("الجولة الحالية ما زالت مفتوحة");
      const lockedSeriesId = locked.seriesId ?? locked.id;
      const duplicate = await tx.zarkMatch.findFirst({ where: { seriesId: lockedSeriesId, roundNumber: locked.roundNumber + 1 } });
      if (duplicate) return duplicate;
      if (locked.channelId && locked.activeChannelKey !== locked.channelId) throw new Error("تم نقل المباراة أو انتهت مسبقًا");
      await tx.zarkMatch.update({ where: { id: locked.id }, data: { activeChannelKey: null, lockExpiresAt: null } });
      return tx.zarkMatch.create({
        data: {
          gameId: locked.gameId,
          seriesId: lockedSeriesId,
          channelId: locked.channelId,
          activeChannelKey: locked.channelId,
          roundNumber: locked.roundNumber + 1,
          totalRounds: locked.totalRounds,
          prompt: generated.prompt,
          answer: generated.answers.join("|||"),
          choices: generated.choices ?? [],
          mediaUrl: generated.mediaUrl,
          durationMs: locked.durationMs,
          startedAt,
          endsAt,
          lockExpiresAt: locked.channelId ? new Date(endsAt.getTime() + 90_000) : undefined,
        },
      });
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    next = await db.zarkMatch.findFirstOrThrow({ where: { seriesId, roundNumber: current.roundNumber + 1 } });
  }
  publish({ type: "zark.match_started", matchId: next.id, seriesId, gameSlug: current.game.slug, channelId: current.channelId ?? undefined, roundNumber: next.roundNumber, totalRounds: next.totalRounds });
  return { completed: false as const, nextMatch: publicZarkMatch(next, current.game), standings: await zarkSeriesStandings(seriesId) };
}

export async function answerZarkRace(matchId: string, input: { userId: string; displayName: string; answer: string }) {
  await enforceRateLimit("race-answer", input.userId, 30, 10);
  const match = await db.zarkMatch.findUnique({ where: { id: matchId }, include: { game: true } });
  if (!match || new Date() > match.endsAt) return { correct: false as const, expired: true as const, points: 0 };
  if (match.status !== "OPEN") return { correct: false as const, capped: true as const, points: 0 };
  const evaluation = evaluateAnswer(input.answer, splitAnswers(match.answer));
  if (!evaluation.correct) return { correct: false as const, points: 0 };
  const now = new Date();
  const result = await serializable(async (tx) => {
    const existing = await tx.zarkMatchResult.findUnique({ where: { matchId_userId: { matchId, userId: input.userId } } });
    if (existing) return { duplicate: true as const, rank: existing.rank, points: existing.points };
    const claimed = await tx.zarkMatch.updateMany({ where: { id: matchId, status: "OPEN", endsAt: { gte: now } }, data: { status: "COMPLETED" } });
    if (!claimed.count) return { capped: true as const, points: 0 };
    const rank = 1;
    const elapsedMs = Math.max(0, now.getTime() - match.startedAt.getTime());
    const rawPoints = calculateWinnerPoints({ basePoints: match.game.basePoints, elapsedMs, durationMs: match.durationMs, typoCount: evaluation.typoCount });
    const hintUsed = match.hintUserIds.includes(input.userId);
    const points = hintUsed ? Math.max(3, Math.floor(rawPoints * 0.7)) : rawPoints;
    await tx.user.upsert({ where: { id: input.userId }, update: { displayName: input.displayName }, create: { id: input.userId, displayName: input.displayName } });
    await tx.zarkMatchResult.create({ data: { matchId, userId: input.userId, rank, elapsedMs, points } });
    await tx.user.update({ where: { id: input.userId }, data: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 } } });
    await tx.gameProfile.upsert({ where: { userId_gameId: { userId: input.userId, gameId: match.gameId } }, update: { xp: { increment: points }, wins: { increment: rank === 1 ? 1 : 0 }, losses: { increment: rank === 1 ? 0 : 1 } }, create: { userId: input.userId, gameId: match.gameId, xp: points, wins: rank === 1 ? 1 : 0, losses: rank === 1 ? 0 : 1 } });
    return { duplicate: false as const, rank, points, typoCount: evaluation.typoCount, elapsedMs, hintUsed };
  });
  if (!("capped" in result) && !result.duplicate) {
    await awardLoyaltyPoints({ userId: input.userId, amount: 20, reason: "فوز في لعبة Zark", referenceKey: `zark-win:${matchId}:${input.userId}` });
    await awardLoyaltyPoints({ userId: input.userId, amount: 15, reason: "مهمة يومية: فوز Zark", referenceKey: `mission:win:${dayKey()}:${input.userId}` });
    publish({ type: "zark.match_answered", matchId, userId: input.userId, displayName: input.displayName, points: result.points, rank: result.rank });
    publish({ type: "leaderboard.updated" });
  }
  return { correct: true as const, ...result };
}

export async function getZarkRaceHint(matchId: string, userId: string) {
  await enforceRateLimit("race-hint", userId, 6, 30);
  const match = await db.zarkMatch.findUnique({ where: { id: matchId } });
  const now = new Date();
  if (!match || match.status !== "OPEN" || now > match.endsAt) throw new Error("انتهت هذه الجولة.");
  // الجولات القصيرة لا يمكن أن تنتظر 30 ثانية؛ لذلك يفتح التلميح بعد نصف
  // الوقت على الأقل، وبحد أدنى خمس ثوانٍ وحد أقصى ثلاثين ثانية.
  const unlockAfterMs = Math.min(30_000, Math.max(5_000, Math.floor(match.durationMs / 2)));
  const waitMs = unlockAfterMs - (now.getTime() - match.startedAt.getTime());
  if (waitMs > 0) throw new Error(`التلميح يفتح بعد ${Math.ceil(waitMs / 1000)} ثوانٍ.`);
  const alreadyUsed = match.hintUserIds.includes(userId);
  if (!alreadyUsed) {
    const marked = await db.zarkMatch.updateMany({
      where: { id: matchId, status: "OPEN", endsAt: { gte: now }, NOT: { hintUserIds: { has: userId } } },
      data: { hintUserIds: { push: userId } },
    });
    if (!marked.count) throw new Error("انتهت هذه الجولة أو استُخدم التلميح بالفعل.");
  }
  return { hint: hintForAnswer(splitAnswers(match.answer)[0]), alreadyUsed, pointsPenaltyPercent: 30 };
}

export async function expireZarkRace(matchId: string) {
  const match = await db.zarkMatch.findUnique({ where: { id: matchId }, include: { results: { include: { user: true }, orderBy: { rank: "asc" } } } });
  if (!match) throw new Error("الجولة غير موجودة");
  // The server is the authority for the deadline. A stale/duplicated bot timer
  // must never move a round forward before its persisted end time.
  if (match.status === "OPEN" && Date.now() < match.endsAt.getTime()) throw new Error("Race timer has not finished yet");
  if (match.status === "OPEN") await db.zarkMatch.update({ where: { id: matchId }, data: { status: "EXPIRED" } });
  const winner = match.results[0];
  return {
    winner: winner ? { userId: winner.userId, displayName: winner.user.displayName, points: winner.points, elapsedMs: winner.elapsedMs } : undefined,
    acceptedAnswer: splitAnswers(match.answer)[0],
  };
}

export async function leaderboard(period: "daily" | "weekly" | "monthly" | "all" = "daily", metric: "game" | "engagement" = "game"): Promise<LeaderboardRow[]> {
  const from = periodStart(period);
  const [engagementRows, dailyRows, matchRows] = await Promise.all([
    db.engagementPoint.groupBy({ by: ["userId"], where: from ? { createdAt: { gte: from } } : undefined, _sum: { points: true } }),
    db.dailyAnswer.groupBy({ by: ["userId"], where: from ? { answeredAt: { gte: from } } : undefined, _sum: { points: true } }),
    db.zarkMatchResult.groupBy({ by: ["userId"], where: from ? { createdAt: { gte: from } } : undefined, _sum: { points: true } }),
  ]);
  const scores = new Map<string, { gamePoints: number; engagementPoints: number }>();
  const scoreFor = (userId: string) => {
    const current = scores.get(userId) ?? { gamePoints: 0, engagementPoints: 0 };
    scores.set(userId, current);
    return current;
  };
  for (const row of engagementRows) scoreFor(row.userId).engagementPoints = row._sum.points ?? 0;
  for (const row of dailyRows) scoreFor(row.userId).gamePoints += row._sum.points ?? 0;
  for (const row of matchRows) scoreFor(row.userId).gamePoints += row._sum.points ?? 0;
  const ranked = [...scores.entries()].sort(([, a], [, b]) => metric === "game" ? b.gamePoints - a.gamePoints : b.engagementPoints - a.engagementPoints).slice(0, 10);
  if (!ranked.length) return [];
  const users = await db.user.findMany({ where: { id: { in: ranked.map(([userId]) => userId) } }, select: { id: true, displayName: true, avatarUrl: true, xp: true, wins: true } });
  const usersById = new Map(users.map((user) => [user.id, user]));
  return ranked.flatMap(([userId, score]) => {
    const user = usersById.get(userId);
    return user ? [{ userId, displayName: user.displayName, avatarUrl: user.avatarUrl ?? undefined, ...score, xp: user.xp, wins: user.wins }] : [];
  });
}

async function generateRacePrompt(module: RaceGame, gameId: string, channelId?: string) {
  // لا نعيد السؤال نفسه في الجولات القريبة في القناة نفسها. نحتفظ بآخر 30
  // سؤالاً، وهي أكثر من الحد الأقصى للجولات المتاحة، مع رجوع آمن إن صغر البنك.
  const recent = channelId ? await db.zarkMatch.findMany({
    where: { gameId, channelId }, orderBy: { startedAt: "desc" }, take: 30, select: { prompt: true },
  }) : [];
  const recentPrompts = recent.map((match) => match.prompt);
  const questionWhere = { gameId, enabled: true, ...(recentPrompts.length ? { prompt: { notIn: recentPrompts } } : {}) };
  const count = await db.gameQuestion.count({ where: questionWhere });
  // أسئلة الإدارة (خصوصاً الصور) تُضاف إلى البنك ولا تحجبه؛ هذا يبقي حد
  // 400 سؤال لكل لعبة متاحاً حتى لو أضافت الإدارة سؤالاً واحداً فقط.
  if (count && Math.random() < 0.45) {
    const question = await db.gameQuestion.findFirstOrThrow({ where: questionWhere, skip: Math.floor(Math.random() * count) });
    return { prompt: question.prompt, answers: question.acceptedAnswers, mediaUrl: question.mediaUrl ?? undefined };
  }
  // يمكن أن تكون الأسئلة في ملفات المشروع (أكثر من 1100 سؤال). نعيد السحب
  // عدة مرات قبل السماح بالعودة إلى سؤال قديم.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const prompt = module.generate(Math.random);
    if (!recentPrompts.includes(prompt.prompt)) return prompt;
  }
  const fallbackCount = await db.gameQuestion.count({ where: { gameId, enabled: true } });
  if (!fallbackCount) return module.generate(Math.random);
  const question = await db.gameQuestion.findFirstOrThrow({ where: { gameId, enabled: true }, skip: Math.floor(Math.random() * fallbackCount) });
  return { prompt: question.prompt, answers: question.acceptedAnswers, mediaUrl: question.mediaUrl ?? undefined };
}

function publicZarkMatch(match: { id: string; seriesId: string | null; roundNumber: number; totalRounds: number; prompt: string; choices: string[]; mediaUrl: string | null; durationMs: number; startedAt: Date; endsAt: Date }, game: { slug: string; name: string }) {
  return {
    id: match.id,
    seriesId: match.seriesId ?? match.id,
    gameSlug: game.slug,
    gameName: game.name,
    roundNumber: match.roundNumber,
    totalRounds: match.totalRounds,
    durationMs: match.durationMs,
    prompt: match.prompt,
    choices: match.choices,
    mediaUrl: match.mediaUrl ?? undefined,
    startedAt: match.startedAt.toISOString(),
    endsAt: match.endsAt.toISOString(),
  };
}

async function zarkSeriesStandings(seriesId: string) {
  const results = await db.zarkMatchResult.findMany({ where: { match: { seriesId } }, include: { user: { select: { id: true, displayName: true } } } });
  const totals = new Map<string, { userId: string; displayName: string; points: number; wins: number }>();
  for (const result of results) {
    const row = totals.get(result.userId) ?? { userId: result.userId, displayName: result.user.displayName, points: 0, wins: 0 };
    row.points += result.points;
    if (result.rank === 1) row.wins += 1;
    totals.set(result.userId, row);
  }
  return [...totals.values()].sort((a, b) => b.wins - a.wins || b.points - a.points || a.displayName.localeCompare(b.displayName, "ar"));
}

function gameChannelBusy(gameName = "Zark", roundNumber?: number, totalRounds?: number) {
  return Object.assign(new Error(`توجد لعبة ${gameName} شغالة في هذه القناة${roundNumber && totalRounds ? ` — الجولة ${roundNumber}/${totalRounds}` : ""}. انتظر حتى تنتهي المباراة.`), { statusCode: 409 });
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
