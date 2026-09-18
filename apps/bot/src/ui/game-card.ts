// رسم بطاقة الألعاب بثيم 3PAL (بنفسجي تقني) فوق خلفية 3pal-game-card-bg.png.
//
// هذا الملف مخصص للرسم فقط: تجهيز النصوص (قص/لف/إيموجي اللعبة) يبقى في apps/bot/src/index.ts.
import fs from "node:fs";
import sharp from "sharp";

/** مقاسات البطاقة: مطابقة للخلفية حتى لا يحصل إعادة تحجيم. */
export const GAME_CARD = {
  width: 1600,
  height: 900,
  badgeY: 78,
  badgeHeight: 60,
  badgeWidth: 420,
  titleY: 186,
  promptStart: 252,
  promptGap: 72,
  circleRadius: 140,
  footerY: 846,
} as const;

const PALETTE = {
  surface: "#080b1c",
  violet: "#8b5cf6",
  violetLight: "#c4b5fd",
  line: "#6d5cf6",
  text: "#f7f6ff",
  textSoft: "#d6d9fb",
} as const;

/** عائلة الخط داخل SVG: الخط العربي المضمّن أولًا ثم بدائل النظام. */
const CARD_FONT = "'NotoArabic','DejaVu Sans',sans-serif";
/** موضع شارة 3PAL في منتصف البطاقة. */
const BADGE_X = (GAME_CARD.width - GAME_CARD.badgeWidth) / 2;

export type GameCardInput = {
  /** مسار خلفية 3PAL، وعند غيابها ترسم خلفية مسطحة بديلة. */
  backgroundPath: string;
  fontPath: string;
  /** اسم اللعبة كما يظهر في البطاقة. */
  title: string;
  promptLines: string[];
  promptFontSize: number;
  instruction: string;
  footer: string;
  badge?: string;
  /** رمز اللعبة داخل دائرة الإجابة عندما لا توجد صورة. */
  glyph?: string;
  media?: Buffer;
  mediaSize?: { width: number; height: number };
};

const fontFaceCache = new Map<string, string>();

function escapeXml(value: string) {
  return value.replace(/[<>&"']/gu, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

function fontFaceCss(fontPath: string) {
  const cached = fontFaceCache.get(fontPath);
  if (cached !== undefined) return cached;
  const data = fs.existsSync(fontPath) ? fs.readFileSync(fontPath).toString("base64") : "";
  const css = data ? `@font-face{font-family:'NotoArabic';src:url('data:font/truetype;base64,${data}') format('truetype');font-weight:100 900;}` : "";
  fontFaceCache.set(fontPath, css);
  return css;
}

/** كلمة العنوان بكلمة بنفسجية واحدة، بنفس لمسة التصميم (صح «أو» خطأ). */
function titleMarkup(title: string) {
  const words = title.split(/\s+/u).filter(Boolean);
  if (words.length < 2) return escapeXml(title);
  const accentIndex = Math.floor(words.length / 2);
  return words
    .map((word, index) => (index === accentIndex ? `<tspan fill="${PALETTE.violetLight}">${escapeXml(word)}</tspan>` : escapeXml(word)))
    .join(" ");
}

/** علامة 3PAL الصغيرة (أذنان + رأس مستدير) التي تظهر داخل شارة البطاقة. */
function badgeMark(x: number, y: number) {
  return `<g transform="translate(${x} ${y})" fill="${PALETTE.violetLight}">
    <polygon points="3,-2 -11,-17 11,-15"/><polygon points="43,-2 57,-17 35,-15"/>
    <rect x="0" y="-9" width="46" height="32" rx="13"/></g>`;
}

export async function renderGameCard(input: GameCardInput) {
  const fontFace = fontFaceCss(input.fontPath);
  const badge = input.badge ?? "3PAL GAMES";
  const lines = input.promptLines.slice(0, 4);
  const lineMarkup = lines
    .map((line, index) => `<text x="800" y="${GAME_CARD.promptStart + index * GAME_CARD.promptGap}" text-anchor="middle" class="prompt">${escapeXml(line)}</text>`)
    .join("");
  const instructionY = GAME_CARD.promptStart + Math.max(1, lines.length) * GAME_CARD.promptGap + 8;
  const contentTop = instructionY + 44;
  const circleY = Math.min(620, contentTop + 168);

  // إطار الصورة (الأعلام/الشعارات) يتكيف مع المساحة المتاحة قبل الشريط السفلي.
  const frameWidth = 810;
  const frameX = Math.round((GAME_CARD.width - frameWidth) / 2);
  const frameY = Math.min(contentTop + 18, 500);
  const frameHeight = Math.max(200, Math.min(300, 752 - frameY));
  const mediaFrame = input.media
    ? `<rect x="${frameX - 16}" y="${frameY - 16}" width="${frameWidth + 32}" height="${frameHeight + 32}" rx="34" fill="#060914" fill-opacity=".9" stroke="url(#ringGrad)" stroke-width="6"/>
       <rect x="${frameX - 6}" y="${frameY - 6}" width="${frameWidth + 12}" height="${frameHeight + 12}" rx="24" fill="none" stroke="${PALETTE.violetLight}" stroke-opacity=".25" stroke-width="2"/>
       <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="20" fill="${PALETTE.surface}"/>`
    : `<circle cx="800" cy="${circleY}" r="${GAME_CARD.circleRadius + 30}" fill="url(#circleGlow)"/>
       <circle cx="800" cy="${circleY}" r="${GAME_CARD.circleRadius}" fill="#0e0b24" stroke="url(#ringGrad)" stroke-width="8"/>
       <circle cx="800" cy="${circleY}" r="${GAME_CARD.circleRadius - 16}" fill="#0a0820" stroke="${PALETTE.violetLight}" stroke-opacity=".22" stroke-width="2"/>
       <text x="800" y="${circleY + 18}" text-anchor="middle" class="glyph">${escapeXml(input.glyph ?? "")}</text>`;

  const shadowLines = lines
    .map((line, index) => `<text x="800" y="${GAME_CARD.promptStart + index * GAME_CARD.promptGap + 4}" text-anchor="middle" class="prompt" fill="#04060f" fill-opacity=".55">${escapeXml(line)}</text>`)
    .join("");

  const svg = Buffer.from(`<svg width="${GAME_CARD.width}" height="${GAME_CARD.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#3b2a86" stop-opacity=".95"/><stop offset=".5" stop-color="#5b21b6" stop-opacity=".95"/><stop offset="1" stop-color="#3b2a86" stop-opacity=".95"/>
    </linearGradient>
    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#c4b5fd"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6d28d9"/>
    </linearGradient>
    <radialGradient id="circleGlow"><stop stop-color="#8b5cf6" stop-opacity=".28"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
  </defs>
  <style>${fontFace}
    .title{font:700 64px ${CARD_FONT};fill:${PALETTE.text};direction:rtl;unicode-bidi:plaintext}
    .prompt{font:700 ${input.promptFontSize}px ${CARD_FONT};fill:${PALETTE.text};direction:rtl;unicode-bidi:plaintext}
    .instruction{font:700 34px ${CARD_FONT};fill:${PALETTE.textSoft};direction:rtl;unicode-bidi:plaintext}
    .badge{font:900 27px ${CARD_FONT};fill:#ffffff;letter-spacing:4px}
    .footer{font:700 38px ${CARD_FONT};fill:${PALETTE.text};direction:rtl;unicode-bidi:plaintext}
    .glyph{font:900 132px ${CARD_FONT};fill:#ffffff}
  </style>
  <rect x="${BADGE_X}" y="${GAME_CARD.badgeY - 30}" width="${GAME_CARD.badgeWidth}" height="${GAME_CARD.badgeHeight}" rx="30" fill="url(#badgeGrad)" stroke="${PALETTE.violetLight}" stroke-opacity=".5" stroke-width="2"/>
  ${badgeMark(BADGE_X + 30, GAME_CARD.badgeY - 2)}
  <text x="${BADGE_X + 30 + 46 + 18 + (GAME_CARD.badgeWidth - 94) / 2}" y="${GAME_CARD.badgeY + 10}" text-anchor="middle" class="badge">${escapeXml(badge)}</text>
  <text x="800" y="${GAME_CARD.titleY + 4}" text-anchor="middle" class="title" fill="#04060f" fill-opacity=".6">${titleMarkup(input.title)}</text>
  <text x="800" y="${GAME_CARD.titleY}" text-anchor="middle" class="title">${titleMarkup(input.title)}</text>
  ${shadowLines}${lineMarkup}
  <text x="800" y="${instructionY}" text-anchor="middle" class="instruction">${escapeXml(input.instruction)}</text>
  ${mediaFrame}
  <rect x="596" y="${GAME_CARD.footerY - 34}" width="408" height="52" rx="26" fill="#0b1030" fill-opacity=".55"/>
  <text x="800" y="${GAME_CARD.footerY}" text-anchor="middle" class="footer">${escapeXml(input.footer)}</text>
</svg>`);

  const base = fs.existsSync(input.backgroundPath)
    ? sharp(input.backgroundPath).resize(GAME_CARD.width, GAME_CARD.height, { fit: "cover" })
    : sharp({ create: { width: GAME_CARD.width, height: GAME_CARD.height, channels: 4, background: { r: 6, g: 8, b: 22, alpha: 1 } } });
  const layers: Array<{ input: Buffer; left?: number; top?: number }> = [{ input: svg }];
  if (input.media) {
    const size = input.mediaSize ?? { width: frameWidth, height: frameHeight };
    const framed = await sharp(input.media)
      .resize(size.width, size.height, { fit: "contain", background: PALETTE.surface })
      .png()
      .toBuffer();
    layers.push({ input: framed, left: frameX, top: frameY });
  }
  return base.composite(layers).png({ compressionLevel: 8 }).toBuffer();
}