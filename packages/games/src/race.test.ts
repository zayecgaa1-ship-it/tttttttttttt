import assert from "node:assert/strict";
import test from "node:test";
import { calculateRacePoints, calculateWinnerPoints, evaluateAnswer, isCorrectAnswer, minimumRaceQuestionsPerGame, raceAnswerDurationMs, raceGames, seededRandom } from "./index.js";
import {questionIdentity,selectFreshQuestion,uniqueQuestions} from './question-pool.js';

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

test("merged logo and anime banks work without database placeholders", () => {
  for (const slug of ["logos", "anime-silhouette", "game-logos"]) {
    const prompt = raceGames.get(slug)!.generate(seededRandom(17));
    assert.ok(prompt.prompt.length > 5);
    assert.ok(prompt.answers.length > 0);
  }
});

test("quick choice prompts expose three distinct options including the right answer", () => {
  const prompt = raceGames.get("quick-choice")!.generate(seededRandom(23));
  assert.equal(prompt.choices?.length, 3);
  assert.equal(new Set(prompt.choices).size, 3);
  assert.ok(prompt.choices?.some((choice) => prompt.answers.includes(choice)));
});

test("catalogue counts real questions, including all restored games", () => {
  for(const slug of ['emoji-guess','movies','series','music','car-logos','company-logos'])assert.ok(raceGames.has(slug));
  for (const game of raceGames.values()) {
    assert.ok((game.questionCount ?? 0) >= minimumRaceQuestionsPerGame);
    assert.equal(game.questionCount,game.questions?.length);
    assert.equal(new Set(game.questions?.map(question=>questionIdentity(question,game.slug))).size,game.questionCount);
    for(const question of game.questions || []){
      assert.ok(question.prompt.trim());
      assert.ok(question.answers.length);
      assert.ok(evaluateAnswer(question.answers[0],question.answers).correct,game.slug+' must accept its own answer');
    }
  }
});

test("every Zark game gives exactly fifteen seconds to answer", () => {
  assert.equal(raceAnswerDurationMs, 15_000);
  for (const game of raceGames.values()) assert.equal(game.durationMs, 15_000, `${game.slug} must keep the shared fifteen-second answer window`);
});

test('all games draw unseen questions before recycling, even with a stuck RNG',()=>{
  for(const game of raceGames.values()){
    const history: Array<(NonNullable<typeof game.questions>)[number]>=[];
    for(let index=0;index<Math.min(25,game.questionCount!);index++){
      const question=selectFreshQuestion(game.questions!,history,game.slug,()=>0);
      assert.ok(!history.some(item=>questionIdentity(item,game.slug)===questionIdentity(question,game.slug)),game.slug);
      history.unshift(question);
    }
  }
});

test('old decorative headers do not bypass deduplication; images remain distinct',()=>{
  const base={prompt:'ما اسم الشركة؟',answers:['شركة'],mediaUrl:'https://example.test/a.png'};
  assert.equal(questionIdentity(base),questionIdentity({...base,prompt:'⚡ تحدي السرعة:\n'+base.prompt}));
  assert.equal(uniqueQuestions([base,{...base,mediaUrl:'https://example.test/b.png'}]).length,2);
  assert.ok(raceGames.get('car-logos')!.questions!.filter(question=>question.mediaUrl).length>10);
});

test('an exhausted bank uses the oldest question, not the last question again',()=>{
  const pool=['A','B','C'].map(prompt=>({prompt,answers:[prompt]}));
  assert.equal(selectFreshQuestion(pool,[pool[2],pool[1],pool[0]],'test',()=>0).prompt,'A');
});

test('numeric answers are exact and accept Arabic digits without accepting a wrong sign',()=>{
  assert.equal(isCorrectAnswer('١٢',['12']),true);
  assert.equal(isCorrectAnswer('12346',['12345']),false);
  assert.equal(isCorrectAnswer('-12',['12']),false);
  assert.equal(isCorrectAnswer('',['@']),false);
  assert.equal(isCorrectAnswer('!!!',['@']),false);
  assert.equal(isCorrectAnswer('@',['@']),true);
});
