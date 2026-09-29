#!/usr/bin/env node
/**
 * تجهيز حزم النشر للتقصيم الثلاثي: موقع Vercel + بوت (Wispbyte/Discloud) + API مستمر.
 *
 * أمثلة:
 *   npm run pack:bot
 *   npm run pack:api  -- --env .env.deploy-api
 *   npm run pack:site -- --api-url https://3pal-api.discloud.app
 *   npm run pack:deploy
 *
 * النواتج:
 *   deploy/build/3pal-bot/ + deploy/3pal-bot.zip   (Wispbyte Node.js أو Discloud TYPE=bot)
 *   deploy/build/3pal-api/ + deploy/3pal-api.zip   (Discloud TYPE=site)
 *   deploy/build/3pal-site/                        (مشروع Vercel جاهز للرفع)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const root = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const positional = argv.filter((item, index) => !item.startsWith("--") && !(index > 0 && argv[index - 1].startsWith("--")));
const target = (positional[0] ?? "all").toLowerCase();
const apiUrl = (flag("--api-url") ?? "https://3pal-api.discloud.app").replace(/\/+$/, "");
const buildRoot = path.join(root, "deploy", "build");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

/** الاعتماديات التي يحتاجها كل تطبيق وقت التشغيل فقط (بدون أدوات التطوير والفحوصات). */
/** البوت لا يلمس قاعدة البيانات (كل نداءاته عبر الـAPI)، فلا نضمّن Prisma في حزمته: أخف وأقل ذاكرة على Wispbyte (512MB). */
/** `zod` مطلوبة فعليًا: `packages/shared/src/moderation.ts` يبني بها مخطط الفحص، والبوت يستوردها. */
const BOT_DEPS = ["discord.js", "redis", "sharp", "dotenv", "zod"];
const API_DEPS = ["fastify", "@fastify/compress", "@fastify/cookie", "@fastify/cors", "@fastify/static", "@prisma/client", "dotenv", "jose", "redis", "sharp", "zod", "prisma"];

function stage(name) {
  const dir = path.join(buildRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function copyFile(from, to) {
  if (!fs.existsSync(from)) throw new Error(`مسار مفقود: ${path.relative(root, from)}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to, filter) {
  if (!fs.existsSync(from)) throw new Error(`مسار مفقود: ${path.relative(root, from)}`);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, destination, filter);
    else if (!filter || filter(source)) copyFile(source, destination);
  }
}

/** تشغيل أمر مع طباعة مخرجه مباشرة. نستخدم execSync لتفادي تحذير Node عند تمرير وسائط مع shell. */
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`);
  execSync([command, ...args].join(" "), { cwd: root, stdio: "inherit", ...options });
}

function build() {
  run("npm", ["run", "build"]);
  for (const entry of ["dist/apps/bot/src/index.js", "dist/apps/api/src/index.js", "dist/packages/db/src/client.js"]) {
    if (!fs.existsSync(path.join(root, entry))) throw new Error(`فشل البناء: ${entry} غير موجود`);
  }
}

function writeRuntimePackage(dir, name, deps, entry, options = {}) {
  const dependencies = Object.fromEntries(deps.map((dependency) => [dependency, rootPackage.dependencies[dependency] ?? "*"]));
  const manifest = {
    name,
    private: true,
    type: "module",
    version: rootPackage.version ?? "0.1.0",
    scripts: {
      start: `node ${entry}`,
      ...(options.prisma ? { postinstall: "prisma generate --schema prisma/schema.prisma" } : {}),
    },
    dependencies,
  };
  fs.writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function copyEnv(dir, fallbackName) {
  const provided = flag("--env");
  const source = provided ? path.resolve(root, provided) : path.join(root, fallbackName);
  if (!fs.existsSync(source)) {
    console.warn(`تنبيه: لم يُعثر على ملف بيئة (${provided ?? fallbackName}) — اضبط المتغيرات من لوحة الاستضافة (Wispbyte/Discloud).`);
    return;
  }
  copyFile(source, path.join(dir, ".env"));
  console.log(`أُضيف ملف البيئة: ${path.relative(root, source)}`);
}

function zip(dir, name) {
  // لا نرفع node_modules ولا package-lock.json أبدًا: لو وُجدت من تجربة محلية نحذفها قبل الضغط.
  // (القفل المولَّد على Windows يحمل حزم sharp الخاصة بـwin32 وقد يُفسد التثبيت على Linux.)
  fs.rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
  fs.rmSync(path.join(dir, "package-lock.json"), { force: true });
  const zipPath = path.join(root, "deploy", `${name}.zip`);
  fs.rmSync(zipPath, { force: true });
  if (process.platform === "win32") {
    // Windows: نستخدم bsdtar (مضمّن مع Win10+) بدل ZipFile::CreateFromDirectory،
    // لأن الأخير يكتب فواصل `\` داخل أسماء المدخلات وهي تخالف معيار ZIP
    // وتُفسد فك الضغط على لوحات Linux (Wispbyte/Discloud تستدعي `unzip`).
    // نمرّر أسماء الملفات العليا بدل `.` حتى لا يُخزَّن مدخل جذر `./` — بعض أدوات فك الضغط
    // تبني `الوجهة\.` منه وتتعثّر بـ"الملف موجود بالفعل".
    const entries = fs.readdirSync(dir);
    execFileSync("tar", ["-a", "-c", "-f", zipPath, "-C", dir, ...entries], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-rq", zipPath, "."], { cwd: dir, stdio: "inherit" });
  }
  console.log(`حزمة جاهزة: ${path.relative(root, zipPath)}`);
}

/** البوت لا يحتاج ملفات الفحص (`*.test.js`) ولا كود Prisma (`dist/packages/db`) وقت التشغيل. */
const runtimeOnly = (file) => !file.endsWith(".test.js") && !file.startsWith(path.join(root, "dist/packages/db") + path.sep);
/** الـAPI يحتاج `dist/packages/db` ولا Prisma، لكن ملفات الفحص لا داعي لرفعها. */
const apiRuntimeOnly = (file) => !file.endsWith(".test.js");

/** خطوات التشغيل على Wispbyte — لا يوجد SSH هناك: كل شي من لوحة التحكم. */
function printHostNotes() {
  console.log("");
  console.log("خطوات Wispbyte:");
  console.log("  1) Files → Upload → deploy/3pal-bot.zip → Unarchive في جذر السيرفر.");
  console.log("  2) Startup → JS_FILE = dist/apps/bot/src/index.js");
  console.log("  3) Console → Start (تثبيت الاعتماديات تلقائيًا لأن package.json موجود).");
  console.log("  التفاصيل الكاملة: docs/deploy/03-wispbyte-bot.md");
}

function packBot() {
  const dir = stage("3pal-bot");
  build();
  copyDir(path.join(root, "dist/apps/bot"), path.join(dir, "dist/apps/bot"), runtimeOnly);
  copyDir(path.join(root, "dist/packages"), path.join(dir, "dist/packages"), runtimeOnly);
  // المجلد يُنشأ فارغًا أثناء النسخ لأن مرشّح الملفات لا يمنع إنشاء المجلدات — نحذفه ليخرج الـZIP نظيفًا.
  fs.rmSync(path.join(dir, "dist/packages/db"), { recursive: true, force: true });
  // ملفات تُقرأ من process.cwd() وقت التشغيل: خط عربي + خلفية بطاقة اللعبة.
  copyDir(path.join(root, "apps/bot/src/fonts"), path.join(dir, "apps/bot/src/fonts"));
  copyFile(path.join(root, "apps/web/public/assets/3pal-game-card-bg.png"), path.join(dir, "apps/web/public/assets/3pal-game-card-bg.png"));
  copyDir(path.join(root, "deploy/discloud/bot"), dir);
  writeRuntimePackage(dir, "3pal-bot", BOT_DEPS, "dist/apps/bot/src/index.js");
  copyEnv(dir, ".env.deploy-bot");
  zip(dir, "3pal-bot");
  printHostNotes();
}

function packApi() {
  const dir = stage("3pal-api");
  build();
  copyDir(path.join(root, "dist/apps/api"), path.join(dir, "dist/apps/api"), apiRuntimeOnly);
  copyDir(path.join(root, "dist/packages"), path.join(dir, "dist/packages"), apiRuntimeOnly);
  // الـAPI يخدم الموقع الثابت من apps/web/public عبر @fastify/static.
  copyDir(path.join(root, "apps/web/public"), path.join(dir, "apps/web/public"));
  copyFile(path.join(root, "packages/db/prisma/schema.prisma"), path.join(dir, "prisma/schema.prisma"));
  copyDir(path.join(root, "deploy/discloud/api"), dir);
  writeRuntimePackage(dir, "3pal-api", API_DEPS, "dist/apps/api/src/index.js", { prisma: true });
  copyEnv(dir, ".env.deploy-api");
  zip(dir, "3pal-api");
}

function packSite() {
  const dir = stage("3pal-site");
  copyDir(path.join(root, "apps/web/public"), dir);
  // الواجهة الخلفية تُخدَم عبر بروكسي Vercel (نفس الأصل ⇒ الكوكيز تبقى first-party)،
  // والبث المباشر SSE يذهب مباشرة إلى أصل الـAPI لأن بروكسي Vercel لا يمرر text/event-stream.
  fs.writeFileSync(path.join(dir, "config.js"), `window.__3PAL_API_BASE__ = "";\nwindow.__3PAL_STREAM_BASE__ = "${apiUrl}";\n`, "utf8");
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  // نهجر أي نطاق موجود في vercel.json إلى عنوان الـAPI الحقيقي (في rewrites وفي ترويسة connect-src).
  const sourceOrigin = new URL(vercelConfig.rewrites[0].destination).origin;
  vercelConfig.outputDirectory = ".";
  vercelConfig.rewrites = vercelConfig.rewrites.map((rule) => ({ ...rule, destination: rule.destination.replace(sourceOrigin, apiUrl) }));
  vercelConfig.headers = vercelConfig.headers.map((rule) => ({
    ...rule,
    headers: rule.headers.map((header) => ({ ...header, value: header.value.replaceAll(sourceOrigin, apiUrl) })),
  }));
  fs.writeFileSync(path.join(dir, "vercel.json"), `${JSON.stringify(vercelConfig, null, 2)}\n`, "utf8");
  console.log(`مشروع Vercel جاهز في ${path.relative(root, dir)}`);
  console.log(`ارفع الموقع بالأمر: npx vercel --prod --cwd "${dir}"  (أو اربط المجلد بمشروع Vercel من لوحة التحكم)`);
}

const actions = {
  bot: packBot,
  api: packApi,
  site: packSite,
  all: () => {
    packBot();
    packApi();
    packSite();
  },
};

const action = actions[target];
if (!action) {
  console.error("استخدم: node scripts/pack-deploy.mjs [bot|api|site|all] [--api-url https://...] [--env .env.deploy-bot]");
  process.exit(1);
}
action();

