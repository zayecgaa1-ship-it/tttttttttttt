import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Usage: node scripts/import-legacy-games.mjs <games-folder>");

function loadData(filename) {
  const file = path.join(sourceDir, filename);
  const code = fs.readFileSync(file, "utf8");
  if (/\brequire\s*\(|\bprocess\b|\bglobal\b|\bfetch\s*\(/.test(code)) throw new Error(`Unsafe data module: ${filename}`);
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, sandbox, { filename, timeout: 1_000, contextCodeGeneration: { strings: false, wasm: false } });
  return sandbox.module.exports;
}

const flattenLevels = (data) => ["easy", "medium", "hard"].flatMap((level) => Array.isArray(data[level]) ? data[level] : []);
const unique = (items) => [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
const question = (prompt, answers, mediaUrl) => ({ prompt, answers: unique(answers), ...(mediaUrl ? { mediaUrl } : {}) });

const flags = loadData("flagData.js").flags;
const capitals = loadData("capitalsData.js").capitals;
const translations = flattenLevels(loadData("translateGameData.js"));
const typing = flattenLevels(loadData("typingGameData.js"));
const unscramble = flattenLevels(loadData("unscrambleGameData.js"));
const emojis = loadData("emojiData.js").emojis;
const quizzes = Object.values(loadData("quizGameData.js").categories).flat();
const riddles = Object.values(loadData("riddleGameData.js").categories).flat();
const logos = loadData("logoGameData.js").logos;
const gameLogos = loadData("gameLogoData.js").games;
const animeCharacters = loadData("animeCharacterData.js").characters;
const animeQuestions = loadData("animeQuizData.js").animeQuestions;
const countries = loadData("guessCountryData.js").countries;

const carNames = new Set(["Tesla", "Toyota", "Honda", "Ford", "BMW", "Mercedes", "Audi", "Hyundai", "Kia", "Nissan"]);
const bank = {
  translate: translations.map((item) => question(`🌍 ترجم كلمة: ${item.english}`, [item.arabic])),
  flags: flags.map((item) => question(`🚩 لأي دولة هذا العلم؟ ${item.flag}`, item.keywords ?? [item.name])),
  capitals: capitals.map((item) => question(`🌐 ما عاصمة ${item.country}؟`, [item.capital])),
  "fast-type": typing.map((item) => question(`⌨️ اكتب بسرعة وبدقة: **${item.word}**`, [item.word])),
  "letter-order": unscramble.map((item) => question(`🔡 رتب الحروف: **${item.scrambled}**`, [item.word])),
  "emoji-guess": emojis.map((item) => question(`😀 ما معنى هذا الإيموجي؟ ${item.emoji}`, item.keywords ?? [item.answer])),
  trivia: [...quizzes.map((item) => question(`❓ ${item.question}\n${item.options?.join(" · ") ?? ""}`, [item.answer])), ...animeQuestions.map((item) => question(`🎌 ${item.question}\n${item.options?.join(" · ") ?? ""}`, [item.answer]))],
  "who-am-i": [...riddles.map((item) => question(`👤 ${item.question}${item.hint ? `\nتلميح: ${item.hint}` : ""}`, [item.answer])), ...countries.map((item) => question(`🌍 خمن الدولة: ${item.hint} ${item.emoji ?? ""}`, item.keywords ?? [item.name]))],
  "company-logos": logos.map((item) => question(`🏢 ${item.logo ?? "🔰"} ${item.hint}`, item.keywords ?? [item.name])),
  "car-logos": logos.filter((item) => carNames.has(item.name) || /سيار/.test(item.hint ?? "")).map((item) => question(`🚘 ${item.logo ?? "🚗"} ${item.hint}`, item.keywords ?? [item.name])),
  "anime-silhouette": animeCharacters.map((item) => question(`🎭 من بطل الأنمي؟ ${item.emoji ?? ""}\n${item.hint}`, item.keywords ?? [item.name])),
  "game-logos": gameLogos.map((item) => question(`🎮 ${item.logo ?? ""} ${item.hint}`, item.keywords ?? [item.name])),
};

for (const [slug, entries] of Object.entries(bank)) {
  bank[slug] = entries.filter((entry) => entry.prompt && entry.answers.length);
}

const output = `// Generated from the user's legacy Zark game data. Re-run scripts/import-legacy-games.mjs to refresh.\nexport type ImportedRaceQuestion = { prompt: string; answers: string[]; mediaUrl?: string };\nexport const importedQuestionBank: Record<string, ImportedRaceQuestion[]> = ${JSON.stringify(bank, null, 2)};\n`;
const target = path.resolve("packages/games/src/imported-question-bank.ts");
fs.writeFileSync(target, output, "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(bank).map(([slug, entries]) => [slug, entries.length])), null, 2));
