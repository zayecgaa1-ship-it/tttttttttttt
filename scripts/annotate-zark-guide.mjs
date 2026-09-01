import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "docs", "assets", "zark-usage-guide");
const outputDir = path.join(root, "docs", "assets", "zark-video-guide");
const fontPath = path.join(root, "apps", "bot", "src", "fonts", "NotoSansArabic.ttf");
if (!existsSync(fontPath)) throw new Error("Arabic guide font is missing.");
mkdirSync(outputDir, { recursive: true });
const fontBase64 = readFileSync(fontPath).toString("base64");

const scenes = [
  { source: "01-home.png", output: "01-open-lfg.png", target: [738, 22, 68, 55], box: [330, 275, 520, 142], arrow: [600, 275, 770, 82], text: ["1. من الصفحة الرئيسية", "اضغط على كلمة LFG"] },
  { source: "02-lfg.png", output: "02-create-room.png", target: [1000, 360, 335, 595], box: [295, 275, 545, 152], arrow: [810, 360, 1005, 465], text: ["2. اختر اللعبة وعدد اللاعبين", "ثم اضغط أنشئ التجمع"] },
  { source: "02-lfg.png", output: "03-interests.png", target: [1050, 990, 310, 1060], box: [260, 785, 590, 152], arrow: [820, 875, 1090, 1060], text: ["3. فعّل مهتم + إشعار", "لتصلك دعوات اللعبة في الخاص"] },
  { source: "04-support.png", output: "04-report.png", target: [100, 270, 1220, 780], box: [420, 105, 570, 152], arrow: [710, 255, 710, 355], text: ["4. عند وجود مشكلة أو مخالفة", "افتح الدعم وقدّم بلاغًا واضحًا"] },
  { source: "05-lfg-mobile.png", output: "05-mobile.png", target: [30, 180, 330, 490], box: [20, 20, 350, 126], arrow: [205, 145, 205, 250], text: ["5. من الهاتف افتح LFG", "وابحث أو أنشئ تجمعك"] },
];

function escapeXml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[character]);
}

function overlay(width, height, scene) {
  const [x, y, w, h] = scene.target;
  const [bx, by, bw, bh] = scene.box;
  const [x1, y1, x2, y2] = scene.arrow;
  const [firstLine, secondLine] = scene.text;
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>@font-face{font-family:NotoArabic;src:url(data:font/truetype;base64,${fontBase64}) format('truetype')}.copy{font-family:NotoArabic,Arial,sans-serif;fill:#fff600;font-weight:900}</style>
      <filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000" flood-opacity=".8"/></filter>
      <marker id="arrow" markerWidth="18" markerHeight="18" refX="14" refY="7" orient="auto"><path d="M0,0 L15,7 L0,14 Z" fill="#fff600"/></marker>
    </defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#fff600" stroke-width="8" filter="url(#shadow)"/>
    <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#fff600" stroke-width="11" fill="none" marker-end="url(#arrow)" filter="url(#shadow)"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="18" fill="#111111" fill-opacity=".96" stroke="#fff600" stroke-width="5" filter="url(#shadow)"/>
    <text x="${bx + bw / 2}" y="${by + 63}" text-anchor="middle" class="copy" font-size="34">${escapeXml(firstLine)}</text>
    <text x="${bx + bw / 2}" y="${by + 117}" text-anchor="middle" class="copy" font-size="42">${escapeXml(secondLine)}</text>
  </svg>`);
}

for (const scene of scenes) {
  const input = path.join(sourceDir, scene.source);
  const image = sharp(input);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Unable to read ${scene.source}`);
  await image.composite([{ input: overlay(metadata.width, metadata.height, scene), top: 0, left: 0 }]).png().toFile(path.join(outputDir, scene.output));
}
console.log(JSON.stringify({ outputDir, scenes: scenes.map((scene) => scene.output) }, null, 2));
