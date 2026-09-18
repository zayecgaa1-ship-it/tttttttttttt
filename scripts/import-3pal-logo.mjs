// يجهّز شعار 3Pal games داخل الموقع من أي صورة مصدر.
//
// الاستخدام:
//   node scripts/import-3pal-logo.mjs "C:\Users\me\Downloads\3pal.png"
//   node scripts/import-3pal-logo.mjs            # يستخدم أحدث صورة في Downloads / Desktop / Pictures
//   npm run brand:logo -- "C:\path\logo.webp"
//
// ينتج ثلاثة ملفات داخل apps/web/public/assets:
//   3pal-logo.png  → 1024×1024 (الشريط العلوي، الفوتر، ساحة البطل)
//   3pal-icon.png  → 256×256   (favicon + apple-touch-icon)
//   3pal-og.png    → 1200×630  (og:image للسوشيال)
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".tiff", ".tif", ".gif", ".bmp"]);
const assetsDir = process.env.THREEPAL_LOGO_DIR
  ? path.resolve(process.env.THREEPAL_LOGO_DIR)
  : path.resolve(process.cwd(), "apps", "web", "public", "assets");

function newestImage(folder) {
  const dir = path.join(os.homedir(), folder);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => imageExtensions.has(path.extname(file).toLowerCase()))
    .map((file) => ({ file, modified: statSync(file).mtimeMs }))
    .filter((entry) => statSync(entry.file).isFile());
  if (!files.length) return null;
  return files.sort((a, b) => b.modified - a.modified)[0];
}

function resolveSource() {
  const argument = process.argv[2];
  if (argument) {
    const resolved = path.resolve(argument.replace(/^"|"$/g, ""));
    if (!existsSync(resolved)) throw new Error(`ملف الشعار غير موجود: ${resolved}`);
    return resolved;
  }
  const candidates = ["Downloads", "Desktop", "Pictures"].map(newestImage).filter(Boolean);
  if (!candidates.length) {
    throw new Error("ما لقيت صورة في Downloads أو Desktop أو Pictures. مرّر مسار الصورة كوسيط أول.");
  }
  return candidates.sort((a, b) => b.modified - a.modified)[0].file;
}

const source = resolveSource();
const metadata = await sharp(source).metadata();
mkdirSync(assetsDir, { recursive: true });

const square = sharp(source).rotate();
const logoBuffer = await square
  .clone()
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
const logoPath = path.join(assetsDir, "3pal-logo.png");
await sharp(logoBuffer).toFile(logoPath);

const iconPath = path.join(assetsDir, "3pal-icon.png");
await square
  .clone()
  .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(iconPath);

const ogLogo = await square
  .clone()
  .resize(560, 560, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const ogGlow = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><radialGradient id="g" cx="50%" cy="50%" r="62%">'
    + '<stop offset="0%" stop-color="#f0b429" stop-opacity="0.2"/><stop offset="100%" stop-color="#080705" stop-opacity="0"/>'
    + "</radialGradient></defs><rect width=\"1200\" height=\"630\" fill=\"url(#g)\"/></svg>",
);
const ogPath = path.join(assetsDir, "3pal-og.png");
await sharp({ create: { width: 1200, height: 630, channels: 4, background: { r: 8, g: 7, b: 5, alpha: 1 } } })
  .composite([{ input: ogGlow, gravity: "center" }, { input: ogLogo, gravity: "center" }])
  .png({ compressionLevel: 9 })
  .toFile(ogPath);

const size = (file) => `${(statSync(file).size / 1024).toFixed(1)} KB`;
console.log(`المصدر: ${source} (${metadata.width}×${metadata.height} ${metadata.format})`);
console.log(`✅ ${path.relative(process.cwd(), logoPath)} — 1024×1024 — ${size(logoPath)}`);
console.log(`✅ ${path.relative(process.cwd(), iconPath)} — 256×256 — ${size(iconPath)}`);
console.log(`✅ ${path.relative(process.cwd(), ogPath)} — 1200×630 — ${size(ogPath)}`);
console.log("تم. حدّث الصفحة (Ctrl+F5) لتظهر أيقونة 3Pal games في الموقع والفاتحة.");