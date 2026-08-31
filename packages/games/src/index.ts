export type RacePrompt = {
  prompt: string;
  answers: string[];
  mediaUrl?: string;
};

export interface RaceGame {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly basePoints: number;
  readonly durationMs: number;
  readonly category?: string;
  readonly aliases?: readonly string[];
  readonly questionSource?: "MODULE" | "DATABASE";
  generate(random: () => number): RacePrompt;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

const translate: RaceGame = {
  slug: "translate",
  name: "ترجم",
  description: "أول ترجمة صحيحة تخطف أعلى نقاط.",
  basePoints: 100,
  durationMs: 60_000,
  generate: (random) => {
    const item = pick([
      ["sunrise", "شروق"], ["brave", "شجاع"], ["journey", "رحلة"], ["victory", "انتصار"],
    ] as const, random);
    return { prompt: `🌍 ترجم كلمة: ${item[0]}`, answers: [item[1]] };
  },
};

const completeWord: RaceGame = {
  slug: "complete-word",
  name: "إكمل الكلمة",
  description: "اكتشف الحروف الناقصة قبل الجميع.",
  basePoints: 100,
  durationMs: 45_000,
  generate: (random) => {
    const item = pick([
      ["بر_م_ج", "برمجة"], ["م_ا_س", "منافس"], ["ا_ت_ار", "انتصار"], ["مغ_م_ة", "مغامرة"],
    ] as const, random);
    return { prompt: `🧩 أكمل الكلمة: ${item[0]}`, answers: [item[1]] };
  },
};

const flags: RaceGame = {
  slug: "flags",
  name: "أعلام",
  description: "اعرف الدولة من علمها بأسرع وقت.",
  basePoints: 100,
  durationMs: 45_000,
  generate: (random) => {
    const item = pick([
      ["🇯🇴", ["الأردن", "الاردن"]], ["🇵🇸", ["فلسطين"]], ["🇸🇦", ["السعودية", "المملكة العربية السعودية"]], ["🇲🇦", ["المغرب"]], ["🇪🇬", ["مصر"]],
    ] as const, random);
    return { prompt: `🚩 لأي دولة هذا العلم؟ ${item[0]}`, answers: [...item[1]] };
  },
};

const math: RaceGame = {
  slug: "math",
  name: "تحدي الحساب",
  description: "سباق حساب سريع لمدة أقل من دقيقة.",
  basePoints: 120,
  durationMs: 40_000,
  generate: (random) => {
    const a = 4 + Math.floor(random() * 9);
    const b = 3 + Math.floor(random() * 8);
    const c = 1 + Math.floor(random() * 9);
    return { prompt: `🎯 ما ناتج: ${a} × ${b} + ${c}؟`, answers: [String(a * b + c)] };
  },
};

const capitals: RaceGame = {
  slug: "capitals",
  name: "عواصم ودول",
  description: "اعرف العاصمة أو الدولة قبل الجميع.",
  basePoints: 110,
  durationMs: 45_000,
  aliases: ["عواصم", "دول"],
  generate: (random) => {
    const item = pick([
      ["ما عاصمة الأردن؟", ["عمان", "عمّان"]], ["ما عاصمة فلسطين؟", ["القدس", "قدس"]], ["ما عاصمة المغرب؟", ["الرباط", "رباط"]], ["القاهرة عاصمة أي دولة؟", ["مصر"]], ["الرياض عاصمة أي دولة؟", ["السعودية", "المملكة العربية السعودية"]],
    ] as const, random);
    return { prompt: `🌍 ${item[0]}`, answers: [...item[1]] };
  },
};

const fastType: RaceGame = {
  slug: "fast-type",
  name: "أسرع كتابة",
  description: "انسخ الجملة بأسرع وقت وبدون أخطاء.",
  basePoints: 100,
  durationMs: 35_000,
  aliases: ["اسرع", "أسرع", "كتابة"],
  generate: (random) => {
    const sentence = pick(["Zark يجمع اللاعبين بسرعة", "المنافسة تبدأ بخطوة واحدة", "فريقك ينتظرك الآن", "السرعة تصنع الفارق"], random);
    return { prompt: `⌨️ اكتب بالضبط: **${sentence}**`, answers: [sentence] };
  },
};

const emojiGuess: RaceGame = {
  slug: "emoji-guess",
  name: "خمن الإيموجي",
  description: "فك الشفرة واعرف الكلمة أو اللعبة.",
  basePoints: 100,
  durationMs: 45_000,
  aliases: ["ايموجي", "إيموجي"],
  generate: (random) => {
    const item = pick([["⛏️🧱🌲", ["ماينكرافت", "minecraft"]], ["🚗⚽🥅", ["روكيت ليق", "rocket league"]], ["🕷️🧑", ["سبايدرمان", "سبايدر مان"]], ["🌍🚀🪐", ["فضاء", "الفضاء"]]] as const, random);
    return { prompt: `😀 ماذا تمثل؟ ${item[0]}`, answers: [...item[1]] };
  },
};

const wordOrder: RaceGame = {
  slug: "word-order",
  name: "ترتيب الجملة",
  description: "رتب الكلمات واكتب الجملة الصحيحة.",
  basePoints: 105,
  durationMs: 50_000,
  aliases: ["ترتيب", "جملة"],
  generate: (random) => {
    const sentence = pick(["فريقك جاهز للعب الآن", "المنافسة تزيد حماس السيرفر", "Zark يجمع أفضل اللاعبين"], random);
    const words = sentence.split(" ");
    const shuffled = [...words].sort(() => random() - 0.5);
    return { prompt: `🔤 رتب الكلمات: **${shuffled.join(" — ")}**`, answers: [sentence] };
  },
};

const trueFalse: RaceGame = {
  slug: "true-false",
  name: "صح أو خطأ",
  description: "احسم العبارة بسرعة قبل بقية اللاعبين.",
  basePoints: 95,
  durationMs: 35_000,
  aliases: ["صح", "خطأ", "صح خطأ"],
  generate: (random) => {
    const item = pick([
      ["الشمس نجم", ["صح", "صحيح"]],
      ["عاصمة اليابان هي سيول", ["خطأ", "غلط"]],
      ["الماء يتكون من الهيدروجين والأكسجين", ["صح", "صحيح"]],
      ["عدد قارات العالم ثماني قارات", ["خطأ", "غلط"]],
    ] as const, random);
    return { prompt: `✅❌ صح أم خطأ: **${item[0]}**`, answers: [...item[1]] };
  },
};

const letterOrder: RaceGame = {
  slug: "letter-order",
  name: "ترتيب الحروف",
  description: "رتب الحروف واكتشف الكلمة المخفية.",
  basePoints: 105,
  durationMs: 40_000,
  aliases: ["حروف"],
  generate: (random) => {
    const word = pick(["منافسة", "مغامرة", "برمجة", "انتصار", "تعاون"], random);
    const shuffled = [...word].sort(() => random() - 0.5).join(" ـ ");
    return { prompt: `🔡 رتب الحروف: **${shuffled}**`, answers: [word] };
  },
};

const whoAmI: RaceGame = {
  slug: "who-am-i",
  name: "من أنا؟",
  description: "ثلاث تلميحات تقودك إلى الشخصية أو الشيء.",
  basePoints: 115,
  durationMs: 50_000,
  aliases: ["من انا", "من أنا"],
  generate: (random) => {
    const item = pick([
      ["كوكب أحمر، رابع كواكب الشمس، اسمي يبدأ بحرف الميم", ["المريخ", "مريخ"]],
      ["بطل خارق، يتسلق الجدران، شعاره عنكبوت", ["سبايدرمان", "سبايدر مان"]],
      ["لغة برمجة، تعمل في المتصفح، اسمي يبدأ بـJava", ["جافاسكربت", "javascript", "java script"]],
    ] as const, random);
    return { prompt: `👤 من أنا؟ **${item[0]}**`, answers: [...item[1]] };
  },
};

const trivia: RaceGame = {
  slug: "trivia",
  name: "معلومات عامة",
  description: "أسئلة متنوعة في العلوم والألعاب والثقافة.",
  basePoints: 110,
  durationMs: 45_000,
  aliases: ["تريفيا", "معلومات"],
  generate: (random) => {
    const item = pick([
      ["ما أكبر محيط على الأرض؟", ["المحيط الهادئ", "الهادئ"]],
      ["كم ضلعًا للشكل السداسي؟", ["6", "ستة"]],
      ["ما العنصر الذي رمزه O؟", ["الأكسجين", "اكسجين", "أكسجين"]],
      ["في أي لعبة نجد Creeper؟", ["ماينكرافت", "minecraft"]],
    ] as const, random);
    return { prompt: `❓ ${item[0]}`, answers: [...item[1]] };
  },
};

const riddles: RaceGame = {
  slug: "riddles",
  name: "ألغاز سريعة",
  description: "حل اللغز قبل الجميع وخذ نقاط الجولة.",
  basePoints: 115,
  durationMs: 50_000,
  aliases: ["ألغاز", "الغاز", "لغز"],
  generate: (random) => {
    const item = pick([
      ["ما الشيء الذي كلما أخذت منه كبر؟", ["الحفرة", "حفرة"]],
      ["ما الشيء الذي له أسنان ولا يعض؟", ["المشط", "مشط"]],
      ["ما الشيء الذي يكتب ولا يقرأ؟", ["القلم", "قلم"]],
      ["ما الشيء الذي له رقبة بلا رأس؟", ["الزجاجة", "زجاجة"]],
      ["ما الشيء الذي يمشي بلا أرجل ويدخل الأذنين؟", ["الصوت", "صوت"]],
      ["ما الشيء الذي إذا زاد نقص؟", ["العمر", "عمر"]],
      ["ما الشيء الذي له وجه ويدان بلا جسم؟", ["الساعة", "ساعة"]],
      ["ما الشيء الذي يجففك وهو مبلل؟", ["المنشفة", "منشفة"]],
      ["ما الشيء الذي يرى كل شيء بلا عيون؟", ["المرآة", "مرآة"]],
      ["ما الشيء الذي لا يتحرك إلا بالضرب؟", ["المسمار", "مسمار"]],
      ["ما الشيء الذي يولد كبيرًا ثم يصغر؟", ["الشمعة", "شمعة"]],
      ["ما الشيء الذي يملأ الغرفة ولا يشغل حيزًا؟", ["الضوء", "ضوء"]],
    ] as const, random);
    return { prompt: `🧠 لغز: **${item[0]}**`, answers: [...item[1]] };
  },
};

const gamingQuiz: RaceGame = {
  slug: "gaming-quiz",
  name: "اختبار اللاعبين",
  description: "أسئلة سريعة من عالم الألعاب.",
  basePoints: 115,
  durationMs: 45_000,
  aliases: ["قيمنق", "gaming", "ألعاب"],
  generate: (random) => {
    const item = pick([
      ["في أي لعبة تظهر شخصية Steve؟", ["ماينكرافت", "minecraft"]],
      ["ما اسم اللعبة التي فيها Battle Royale وبناء؟", ["فورتنايت", "fortnite"]],
      ["أي لعبة فيها سيارات تلعب كرة قدم؟", ["روكيت ليق", "rocket league"]],
      ["في أي لعبة توجد خريطة San Andreas؟", ["جي تي اي", "gta", "gta v", "جراند ثفت اوتو"]],
      ["ما اسم لعبة البقاء مع Creeper؟", ["ماينكرافت", "minecraft"]],
      ["أي لعبة تنافسية مشهورة تضع قنبلة Spike؟", ["فالورانت", "valorant"]],
      ["أي لعبة تحتوي على Impostor؟", ["امونق اس", "among us", "amongus"]],
      ["أي لعبة Battle Royale فيها Erangel؟", ["ببجي", "pubg", "playerunknowns battlegrounds"]],
      ["ما اسم منصة الألعاب التي تضم Brookhaven؟", ["روبلوكس", "roblox"]],
      ["في أي لعبة نجد Poké Ball؟", ["بوكيمون", "pokemon"]],
      ["أي لعبة سباق سيارات من تطوير Psyonix؟", ["روكيت ليق", "rocket league"]],
      ["أي لعبة تصويب فيها Dust II؟", ["كاونتر سترايك", "counter strike", "cs2", "cs go"]],
    ] as const, random);
    return { prompt: `🎮 اختبار اللاعبين: **${item[0]}**`, answers: [...item[1]] };
  },
};

const databaseGames: RaceGame[] = [
  { slug: "car-logos", name: "شعارات السيارات", description: "اعرف شركة السيارة من الشعار.", basePoints: 120, durationMs: 45_000, aliases: ["سيارات", "لوجو سيارات"], questionSource: "DATABASE", generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة"); } },
  { slug: "company-logos", name: "شعارات الشركات", description: "تعرف على الشركة من شعارها.", basePoints: 120, durationMs: 45_000, aliases: ["شركات", "لوجو شركات"], questionSource: "DATABASE", generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة"); } },
  { slug: "anime-silhouette", name: "بطل الأنمي", description: "اعرف الشخصية من الظل أو الصورة المخفية.", basePoints: 140, durationMs: 50_000, aliases: ["انمي", "أنمي", "بطل الانمي"], questionSource: "DATABASE", generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة"); } },
  { slug: "game-logos", name: "خمن اللعبة", description: "اعرف اللعبة من رمزها وتلميح سريع.", basePoints: 120, durationMs: 45_000, aliases: ["لعبة", "العاب", "شعار لعبة"], generate: () => { throw new Error("هذه اللعبة تستخدم بنك الأسئلة المستورد"); } },
];

export const raceGames: ReadonlyMap<string, RaceGame> = new Map(
  [translate, completeWord, flags, math, capitals, fastType, emojiGuess, wordOrder, trueFalse, letterOrder, whoAmI, trivia, riddles, gamingQuiz, ...databaseGames].map(withImportedQuestions).map((game) => [game.slug, game]),
);

function withImportedQuestions(game: RaceGame): RaceGame {
  // بعض الألعاب (خصوصاً الشعارات) لها صور جاهزة وبنك نصي أكبر. لا نسمح
  // لبنك الصور أن يلغي الأسئلة النصية؛ ندمج البنكين حتى تبقى الجولة متنوعة.
  const questions = [...(visualLogoQuestionBank[game.slug] ?? []), ...(importedQuestionBank[game.slug] ?? [])];
  if (!questions?.length) return game;
  const uniqueQuestions = questions.filter((question, index, all) => all.findIndex((item) => item.prompt === question.prompt) === index);
  return { ...game, generate: (random) => { const selected = pick(uniqueQuestions, random); return { ...selected, answers: [...selected.answers] }; } };
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ـ/g, "").replace(/[ًٌٍَُِّْ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function isCorrectAnswer(value: string, answers: readonly string[], options: { fuzzy?: boolean } = {}): boolean {
  return evaluateAnswer(value, answers, options).correct;
}

export function evaluateAnswer(value: string, answers: readonly string[], options: { fuzzy?: boolean } = {}) {
  if (options.fuzzy === false) {
    const exact = answers.some((answer) => value.trim() === answer.trim());
    return { correct: exact, typoCount: exact ? 0 : Number.POSITIVE_INFINITY, accuracy: exact ? 1 : 0 };
  }
  const candidateForms = answerForms(value);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLength = 1;
  for (const answer of answers) {
    for (const candidate of candidateForms) {
      for (const expected of answerForms(answer)) {
        const distance = levenshtein(candidate, expected);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestLength = Math.max(candidate.length, expected.length, 1);
        }
      }
    }
  }
  const exact = bestDistance === 0;
  const correct = exact || fuzzyEquivalentByDistance(bestDistance, bestLength);
  return { correct, typoCount: correct ? bestDistance : Number.POSITIVE_INFINITY, accuracy: correct ? Math.max(0, 1 - bestDistance / bestLength) : 0 };
}

function answerForms(value: string) {
  const normalized = normalizeAnswer(value);
  const withoutArticle = normalized.split(" ").map((token) => token.startsWith("ال") && token.length > 4 ? token.slice(2) : token).join(" ");
  return [...new Set([normalized, withoutArticle])];
}

function fuzzyEquivalent(left: string, right: string) {
  const longest = Math.max(left.length, right.length);
  const distance = levenshtein(left, right);
  if (Math.abs(left.length - right.length) > 2) return false;
  return fuzzyEquivalentByDistance(distance, longest);
}

function fuzzyEquivalentByDistance(distance: number, longest: number) {
  if (longest < 4) return false;
  const allowed = longest >= 8 ? 2 : 1;
  return distance <= allowed && 1 - distance / longest >= 0.78;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export function calculateRacePoints(input: { basePoints: number; elapsedMs: number; durationMs: number; rank: number; daily?: boolean; combo?: number }): number {
  const elapsedRatio = Math.min(1, Math.max(0, input.elapsedMs) / input.durationMs);
  const maximum = Math.max(10, Math.min(15, Math.round(input.basePoints / 10))) + (input.daily ? 1 : 0);
  const minimum = 5;
  return Math.max(minimum, Math.min(15, Math.round(maximum - (maximum - minimum) * elapsedRatio)));
}

export function calculateWinnerPoints(input: { basePoints: number; elapsedMs: number; durationMs: number; typoCount: number; daily?: boolean }) {
  const speedPoints = calculateRacePoints({ ...input, rank: 1 });
  const typoPenalty = Math.min(3, Math.max(0, input.typoCount) * 2);
  return Math.max(5, speedPoints - typoPenalty);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
import { importedQuestionBank } from "./imported-question-bank.js";
import { visualLogoQuestionBank } from "./visual-logo-bank.js";
