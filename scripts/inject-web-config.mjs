#!/usr/bin/env node
/**
 * يضيف وسم <script defer src="/config.js"></script> قبل وسم app.js في كل صفحات apps/web/public.
 * العملية آمنة ومتكرّرة (idempotent): لا تضيف الوسم إذا كان موجودًا مسبقًا.
 * الاستخدام: npm run web:inject-config
 */
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(process.cwd(), "apps/web/public");
const tag = '<script defer src="/config.js"></script>';
const appScript = /<script[^>]*src="\/app\.js[^"]*"[^>]*><\/script>/i;

const pages = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"));
let updated = 0;
let alreadyDone = 0;
let withoutApp = 0;

for (const page of pages) {
  const filePath = path.join(publicDir, page);
  const html = fs.readFileSync(filePath, "utf8");
  if (html.includes('src="/config.js"')) {
    alreadyDone += 1;
    continue;
  }
  const match = html.match(appScript);
  if (!match) {
    withoutApp += 1;
    console.warn(`تخطي ${page}: لا يستخدم app.js`);
    continue;
  }
  fs.writeFileSync(filePath, html.replace(match[0], `${tag}${match[0]}`), "utf8");
  updated += 1;
}

console.log(`تم تحديث ${updated} صفحة، ${alreadyDone} صفحة كانت محدّثة، ${withoutApp} صفحة بدون app.js.`);
