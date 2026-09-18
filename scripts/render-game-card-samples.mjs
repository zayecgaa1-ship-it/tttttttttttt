// يعاين بطاقات الألعاب بثيم 3PAL داخل artifacts/game-card-qa لمراجعة الشكل قبل النشر.
// الاستخدام: node scripts/render-game-card-samples.mjs
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { GAME_CARD, renderGameCard } from "../apps/bot/src/ui/game-card.ts";

const backgroundPath = path.resolve("apps/web/public/assets/3pal-game-card-bg.png");
const fontPath = path.resolve("apps/bot/src/fonts/NotoSansArabic.ttf");
const outputDir = path.resolve("artifacts/game-card-qa");
await fs.mkdir(outputDir, { recursive: true });

// صورة بديلة للبطاقات التي تعرض علمًا/شعارًا (بدون شبكة).
const media = await sharp({ create: { width: 480, height: 300, channels: 4, background: { r: 20, g: 26, b: 74, alpha: 1 } } })
  .composite([{ input: Buffer.from(`<svg width="480" height="300"><rect x="40" y="40" width="400" height="220" rx="26" fill="#8b5cf6" fill-opacity=".35"/></svg>`), top: 0, left: 0 }])
  .png()
  .toBuffer();

const samples = [
  { file: "1-true-false.png", title: "صح أو خطأ", promptLines: ["صح أم خطأ: 17 + 5 = 22"], promptFontSize: 70, instruction: " أختار الخيار الصحيح للمتابعة", footer: "الجولة 1 / 1 • أول إجابة صحيحة تفوز", glyph: "✅" },
  { file: "2-quick-choice.png", title: "اختيارات سريعة", promptLines: ["أي مدينة تعرف باسم", "المدينة الوردية؟"], promptFontSize: 70, instruction: " طريق الفوز: اختر الإجابة الصحيحة", footer: "الجولة 3 / 5 • أول إجابة صحيحة تفوز", glyph: "" },
  { file: "3-flags.png", title: "أعلام", promptLines: ["اختر اسم الدولة"], promptFontSize: 70, instruction: "🏆 طريق الفوز: اختر اسم الدولة", footer: "تحدي اليوم • أول إجابة صحيحة تفوز", media },
  { file: "4-long-prompt.png", title: "من أنا ومعلومات عامة", promptLines: ["أنا الجهاز الذي يحوّل", "الطاقة الشمسية إلى كهرباء", "ويُثبَّت على أسطح المنازل", "من أنا؟"], promptFontSize: 58, instruction: "🏆 طريق الفوز: اختر الإجابة الصحيحة", footer: "الجولة 2 / 5 • أول إجابة صحيحة تفوز", glyph: "💡" },
];

const results = [];
for (const sample of samples) {
  const image = await renderGameCard({
    backgroundPath,
    fontPath,
    title: sample.title,
    promptLines: sample.promptLines,
    promptFontSize: sample.promptFontSize,
    instruction: sample.instruction,
    footer: sample.footer,
    glyph: sample.glyph,
    media: sample.media,
  });
  const metadata = await sharp(image).metadata();
  await fs.writeFile(path.join(outputDir, sample.file), image);
  results.push({ file: sample.file, width: metadata.width, height: metadata.height, bytes: image.length });
}
console.log(`✅ ${GAME_CARD.width}×${GAME_CARD.height} • ${results.length} بطاقات في ${path.relative(process.cwd(), outputDir)}`);
for (const result of results) console.log(`  ${result.file} — ${result.width}×${result.height} — ${(result.bytes / 1024).toFixed(0)} KB`);