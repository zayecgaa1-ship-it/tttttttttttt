// يبني خلفية بطاقة الألعاب بثيم 3PAL (بنفسجي تقني) بدل خلفية 3Pal الحمراء القديمة.
//
// الاستخدام:  node scripts/build-3pal-card-bg.mjs
// الناتج:     apps/web/public/assets/3pal-game-card-bg.png  (1600×900)
//
// نفس مقاس البطاقة الذي يستخدمه البوت، لذلك لا يوجد إعادة تحجيم عند الرسم.
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 1600;
const HEIGHT = 900;
const outputPath = path.resolve(process.cwd(), "apps/web/public/assets/3pal-game-card-bg.png");
// خطوط لاتينية فقط (؟ والعلامات) فتتوفر على ويندوز ولينكس بدون تضمين خط.
const latinFont = "Arial,'DejaVu Sans',sans-serif";

const plus = (x, y, size, opacity = 0.5) => `<g stroke="#7c6cf5" stroke-opacity="${opacity}" stroke-width="3" stroke-linecap="round">
  <path d="M ${x - size},${y} H ${x + size}"/><path d="M ${x},${y - size} V ${y + size}"/></g>`;

const dot = (x, y, r, opacity = 0.75) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#a78bfa" fill-opacity="${opacity}"/>`;

// شريطان مائلان مثل علامات الزاوية في الشريط السفلي.
const slantBars = (x, y, count, opacity = 0.75) => Array.from({ length: count }, (_, index) => {
  const left = x + index * 30;
  return `<polygon points="${left},${y - 24} ${left + 18},${y - 24} ${left + 6},${y + 24} ${left - 12},${y + 24}" fill="#6d5cf6" fill-opacity="${opacity}"/>`;
}).join("");

// بلاطات الجانب الأيمن: مستطيل مائل + رمز داخلي.
const tile = (cx, cy, size, angle, shape) => {
  const half = size / 2;
  const inner = shape === "check"
    ? `<path d="M ${cx - 44},${cy + 6} L ${cx - 12},${cy + 38} L ${cx + 48},${cy - 34}" fill="none" stroke="#8b9cf8" stroke-opacity=".82" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>`
    : shape === "cross"
      ? `<g stroke="#8b9cf8" stroke-opacity=".82" stroke-width="19" stroke-linecap="round"><path d="M ${cx - 36},${cy - 36} L ${cx + 36},${cy + 36}"/><path d="M ${cx + 36},${cy - 36} L ${cx - 36},${cy + 36}"/></g>`
      : `<text x="${cx}" y="${cy + 44}" text-anchor="middle" style="font:900 118px ${latinFont};fill:#7b6cf0;fill-opacity:.88">?</text>`;
  return `<g transform="rotate(${angle} ${cx} ${cy})">
    <rect x="${cx - half}" y="${cy - half}" width="${size}" height="${size}" rx="${Math.round(size * 0.24)}" fill="#16255f" fill-opacity=".55" stroke="#4a63e8" stroke-opacity=".68" stroke-width="3"/>
    <rect x="${cx - half + 12}" y="${cy - half + 12}" width="${size - 24}" height="${size - 24}" rx="${Math.round(size * 0.18)}" fill="none" stroke="#7b8cf0" stroke-opacity=".22" stroke-width="2"/>
    ${inner}</g>`;
};

// أرضية هولوغرافية: خطوط تتفرع من نقطة التلاشي + خطوط أفقية بمتباعد متزايد.
const floorGrid = () => {
  const radiating = [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]
    .map((step) => `<path d="M 800,690 L ${800 + step * 210},900" stroke="#3348a8" stroke-opacity="${step % 2 === 0 ? 0.3 : 0.16}" stroke-width="1.5"/>`)
    .join("");
  const horizontals = [[708, 0.3], [726, 0.26], [752, 0.22], [786, 0.18], [830, 0.14]]
    .map(([y, opacity]) => `<path d="M 40,${y} H 1560" stroke="#4459c9" stroke-opacity="${opacity}" stroke-width="1.5"/>`)
    .join("");
  const plates = [[420, 706], [700, 700], [980, 704], [1240, 710]]
    .map(([x, y]) => `<path d="M ${x},${y} L ${x + 96},${y} L ${x + 78},${y + 22} L ${x + 18},${y + 22} Z" fill="#1a2560" fill-opacity=".35" stroke="#5b6ee0" stroke-opacity=".35" stroke-width="1.5"/>`)
    .join("");
  return radiating + horizontals + plates;
};

const defs = `<defs>
    <linearGradient id="base" x1="0" y1="0" x2="0.35" y2="1">
      <stop stop-color="#04060f"/><stop offset=".55" stop-color="#060916"/><stop offset="1" stop-color="#080b1f"/>
    </linearGradient>
    <radialGradient id="leftGlow"><stop stop-color="#3a2fa8" stop-opacity=".22"/><stop offset="1" stop-color="#3a2fa8" stop-opacity="0"/></radialGradient>
    <radialGradient id="rightGlow"><stop stop-color="#2b39a8" stop-opacity=".16"/><stop offset="1" stop-color="#2b39a8" stop-opacity="0"/></radialGradient>
    <radialGradient id="centerShade"><stop stop-color="#02030c" stop-opacity=".62"/><stop offset=".58" stop-color="#02030c" stop-opacity=".3"/><stop offset="1" stop-color="#02030c" stop-opacity="0"/></radialGradient>
    <radialGradient id="vignette"><stop offset=".5" stop-color="#02030a" stop-opacity="0"/><stop offset="1" stop-color="#02030a" stop-opacity=".62"/></radialGradient>
    <linearGradient id="frameGrad" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#8b5cf6" stop-opacity=".9"/><stop offset=".5" stop-color="#4f46e5" stop-opacity=".55"/><stop offset="1" stop-color="#a78bfa" stop-opacity=".85"/>
    </linearGradient>
    <linearGradient id="mascotGrad" x1="0" y1="0" x2="0.6" y2="1">
      <stop stop-color="#5f4ede"/><stop offset="1" stop-color="#33268c"/>
    </linearGradient>
    <radialGradient id="horizonGlow"><stop stop-color="#6f7cf5" stop-opacity=".4"/><stop offset=".55" stop-color="#5b3fd6" stop-opacity=".18"/><stop offset="1" stop-color="#5b3fd6" stop-opacity="0"/></radialGradient>
    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#2b2f6e" stop-opacity=".3"/><stop offset=".18" stop-color="#c7d2fe" stop-opacity=".95"/>
      <stop offset=".42" stop-color="#8b5cf6" stop-opacity=".8"/><stop offset=".72" stop-color="#7dd3fc" stop-opacity=".55"/>
      <stop offset="1" stop-color="#2b2f6e" stop-opacity=".25"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#4f46e5" stop-opacity=".25"/><stop offset=".5" stop-color="#a78bfa" stop-opacity=".8"/><stop offset="1" stop-color="#4f46e5" stop-opacity=".25"/>
    </linearGradient>
  </defs>`;
// العلامة المائية: قناع 3PAL (رأس بأذنين + عظمة) على يسار البطاقة.
const mascot = `<g fill="none" stroke="#5a4bd0" stroke-opacity=".28" stroke-width="2">
    <circle cx="250" cy="452" r="300"/><circle cx="250" cy="452" r="392"/><circle cx="250" cy="452" r="484"/>
  </g>
  <path d="M 250,152 A 300,300 0 0 1 250,752" fill="none" stroke="#8b5cf6" stroke-opacity=".14" stroke-width="14"/>
  <path d="M 250,152 A 300,300 0 0 1 250,752" fill="none" stroke="#a78bfa" stroke-opacity=".55" stroke-width="3.5"/>
  <g transform="translate(252 452) rotate(-8)">
    <polygon points="-198,-96 -240,-268 -96,-178" fill="url(#mascotGrad)"/>
    <polygon points="198,-96 240,-268 96,-178" fill="url(#mascotGrad)"/>
    <rect x="-206" y="-152" width="412" height="306" rx="106" fill="url(#mascotGrad)"/>
    <g transform="rotate(-26 0 10)" fill="#080b20">
      <rect x="-72" y="-16" width="144" height="52" rx="26"/>
      <circle cx="-72" cy="-30" r="30"/><circle cx="-72" cy="50" r="30"/>
      <circle cx="72" cy="-30" r="30"/><circle cx="72" cy="50" r="30"/>
    </g>
    <path d="M -206,10 A 206,206 0 0 0 -120,-160" fill="none" stroke="#c4b5fd" stroke-opacity=".4" stroke-width="3"/>
  </g>`;

// بلاطات الجانب الأيمن + تفاصيل متناثرة.
const decoration = `<circle cx="1440" cy="470" r="312" fill="none" stroke="#3d4bb5" stroke-opacity=".26" stroke-width="2"/>
  <path d="M 1440,158 A 312,312 0 0 0 1440,782" fill="none" stroke="#7c5cf6" stroke-opacity=".35" stroke-width="3"/>
  ${tile(1452, 250, 170, -10, "question")}
  ${tile(1348, 470, 168, -6, "check")}
  ${tile(1482, 612, 168, 8, "cross")}
  ${plus(404, 156, 26)}${plus(458, 494, 22, 0.4)}${plus(1236, 104, 24)}${plus(1290, 332, 20, 0.42)}${plus(1214, 572, 24, 0.4)}
  ${dot(288, 152, 6)}${dot(760, 148, 4, 0.5)}${dot(1122, 268, 4, 0.4)}${dot(240, 700, 5, 0.6)}${dot(1330, 150, 4, 0.45)}${dot(1560, 430, 5, 0.5)}${dot(690, 640, 4, 0.35)}`;

// الشريط السفلي + الإطار + تعتيم الوسط ليبقى نص البطاقة واضحًا.
const chrome = `<path d="M 96,780 L 1504,780 L 1556,808 L 1556,874 L 44,874 L 44,808 Z" fill="#080c20" fill-opacity=".8"/>
  <path d="M 96,780 L 1504,780" stroke="url(#barGrad)" stroke-width="3"/>
  <path d="M 44,808 L 96,780 M 1504,780 L 1556,808" fill="none" stroke="#4c63e6" stroke-opacity=".55" stroke-width="2"/>
  <rect x="58" y="818" width="1484" height="52" rx="12" fill="#0b1030" fill-opacity=".4"/>
  <rect x="66" y="812" width="1468" height="46" rx="10" fill="none" stroke="#463f9c" stroke-opacity=".4" stroke-width="1.5"/>
  <path d="M 62,862 H 1538" stroke="#31358a" stroke-opacity=".45" stroke-width="1.5"/>
  ${slantBars(190, 840, 2)}${slantBars(1356, 840, 2)}
  <path d="M 44,874 L 96,900 L 1504,900 L 1556,874" fill="#05081a" fill-opacity=".9"/>
  <rect x="26" y="22" width="1548" height="856" rx="42" fill="none" stroke="#7c5cf6" stroke-opacity=".14" stroke-width="16"/>
  <rect x="26" y="22" width="1548" height="856" rx="42" fill="none" stroke="url(#frameGrad)" stroke-opacity=".6" stroke-width="4"/>
  <rect x="40" y="36" width="1520" height="828" rx="32" fill="none" stroke="#4c63e6" stroke-opacity=".3" stroke-width="1.5"/>
  <g stroke="#a78bfa" stroke-opacity=".3" stroke-width="2" fill="none">
    <path d="M 46,88 L 88,46"/><path d="M 1512,46 L 1554,88"/><path d="M 46,812 L 88,854"/><path d="M 1512,854 L 1554,812"/>
    <path d="M 26,438 L 62,462 L 26,486"/><path d="M 1574,438 L 1538,462 L 1574,486"/>
  </g>
  <ellipse cx="800" cy="320" rx="640" ry="340" fill="url(#centerShade)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)"/>`;

const backgroundSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#base)"/>
  <circle cx="210" cy="440" r="470" fill="url(#leftGlow)"/>
  <circle cx="1450" cy="450" r="430" fill="url(#rightGlow)"/>
  <ellipse cx="800" cy="694" rx="770" ry="90" fill="url(#horizonGlow)"/>
  <rect x="40" y="686" width="1520" height="5" fill="url(#lineGrad)"/>
  <rect x="40" y="691" width="1520" height="14" fill="url(#lineGrad)" opacity=".35"/>
  ${floorGrid()}
  ${mascot}
  ${decoration}
  ${chrome}
</svg>`;

mkdirSync(path.dirname(outputPath), { recursive: true });
await sharp(Buffer.from(backgroundSvg)).png({ compressionLevel: 9 }).toFile(outputPath);
console.log(`✅ ${path.relative(process.cwd(), outputPath)} — ${WIDTH}×${HEIGHT} — ${(statSync(outputPath).size / 1024).toFixed(1)} KB`);