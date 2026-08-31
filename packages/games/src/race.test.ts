import assert from "node:assert/strict";
import test from "node:test";
import { calculateRacePoints, calculateWinnerPoints, evaluateAnswer, isCorrectAnswer, minimumRaceQuestionsPerGame, raceGames, seededRandom } from "./index.js";

test("normalizes Arabic hamza and diacritics", () => {
  assert.equal(isCorrectAnswer("الأُرْدُن", ["الاردن"]), true);
});

test("accepts optional Arabic definite article", () => {
  assert.equal(isCorrectAnswer("كوكب", ["الكوكب"]), true);
});

test("accepts one light typo in a long answer", () => {
  assert.equal(isCorrectAnswer("ماينكرفت", ["ماينكرافت"]), true);
});

test("does not fuzzy match short unrelated answers", () => {
  assert.equal(isCorrectAnswer("مصر", ["قطر"]), false);
});

test("exact mode rejects typing mistakes", () => {
  assert.equal(isCorrectAnswer("السرعه تصنع الفارق", ["السرعة تصنع الفارق"], { fuzzy: false }), false);
});

test("race points stay in a small logical 5 to 15 range", () => {
  assert.equal(calculateRacePoints({ basePoints: 100, elapsedMs: 60_000, durationMs: 60_000, rank: 1 }), 5);
  assert.equal(calculateRacePoints({ basePoints: 140, elapsedMs: 0, durationMs: 60_000, rank: 1 }), 14);
});

test("accepted typos reduce winner points", () => {
  const evaluation = evaluateAnswer("ماينكرفت", ["ماينكرافت"]);
  assert.equal(evaluation.correct, true);
  const exact = calculateWinnerPoints({ basePoints: 140, elapsedMs: 5_000, durationMs: 60_000, typoCount: 0 });
  const typo = calculateWinnerPoints({ basePoints: 140, elapsedMs: 5_000, durationMs: 60_000, typoCount: evaluation.typoCount });
  assert.ok(exact > typo);
});

test("seeded prompts are deterministic", () => {
  const game = raceGames.get("flags")!;
  assert.deepEqual(game.generate(seededRandom(42)), game.generate(seededRandom(42)));
});

test("legacy logo and anime banks work without database placeholders", () => {
  for (const slug of ["car-logos", "company-logos", "anime-silhouette", "game-logos"]) {
    const prompt = raceGames.get(slug)!.generate(seededRandom(17));
    assert.ok(prompt.prompt.length > 5);
    assert.ok(prompt.answers.length > 0);
  }
});

test("every Zark game keeps at least the configured question-bank minimum", () => {
  for (const game of raceGames.values()) assert.ok((game.questionCount ?? 0) >= minimumRaceQuestionsPerGame, `${game.slug} fell below ${minimumRaceQuestionsPerGame} prompts`);
});
