// سكربت تحويل ثيم 3Pal Community من الذهبي/الأحمر إلى البنفسجي المطابق للتصميم
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const files = [
  "apps/web/public/styles.css",
  "apps/web/public/modern.css",
  "apps/web/public/experience.css",
  "apps/web/public/platform.css",
  "apps/web/public/premium.css",
];

// (نمط، بديل) — الأحمر والذهبي القديم -> بنفسجي بنفس الشفافيات
const rules = [
  // درجات حمراء قديمة
  [/#[eE][dD]1[cC]24([0-9a-fA-F]{0,2})/g, "#8b5cf6$1"],
  [/#[eE]52636([0-9a-fA-F]{0,2})/g, "#8b5cf6$1"],
  [/#[cC]91525([0-9a-fA-F]{0,2})/g, "#7c3aed$1"],
  [/#[fF]{2}3038([0-9a-fA-F]{0,2})/g, "#a78bfa$1"],
  [/#[cC]20[dD]14([0-9a-fA-F]{0,2})/g, "#6d28d9$1"],
  [/^#710408$/gim, "#312e81"],
  [/#[fF]45[bB]68([0-9a-fA-F]{0,2})/g, "#a78bfa$1"],
  [/#[cC]20[dD]14/g, "#6d28d9"],
  [/710408/g, "312e81"],
  [/5c0b10/gi, "312e81"],
  [/450508/gi, "1e1b3a"],
  [/260204/gi, "14122a"],
  // ذهبي -> بنفسجي
  [/[fF]5[bB]51[bB]/g, "8b5cf6"],
  [/#[fF]0[bB]429([0-9a-fA-F]{0,2})/g, "#8b5cf6$1"],
  [/[fF]{2}[dD]866/gi, "c4b5fd"],
  [/#[fF]4[cC]14[fF]([0-9a-fA-F]{0,2})/g, "#c4b5fd$1"],
  [/[fF]{2}[eE]9[aA]8/gi, "ddd6fe"],
  [/[fF]9[dD]{2}7[eE]/gi, "c4b5fd"],
  [/[fF]8[cC]95[cC]/gi, "b4a2fb"],
  [/[fF]7[cC]042/gi, "a78bfa"],
  [/[fF]{2}[dD]97[aA]/gi, "cbb9fe"],
  [/[eE]8[aA]10[eE]/gi, "7c3aed"],
  [/[fF]1[bB]218/gi, "7c3aed"],
  [/[dD]99[aA]0[eE]/gi, "7c3aed"],
  [/[cC]98[dD]0[cC]/gi, "5b21b6"],
  [/9[aA]6[bB]06/g, "5b21b6"],
  [/[aA]76[cC]00/g, "5b21b6"],
  [/[bB]97[eE]0[eE]/gi, "6d28d9"],
  [/rgba\(\s*245\s*,\s*181\s*,\s*27/g, "rgba(139,92,246"],
  [/rgba\(\s*170\s*,\s*106\s*,\s*4/g, "rgba(124,58,237"],
  // أسطح ذهبية دافئة -> أسطح بنفسجية داكنة
  [/080705/gi, "07070d"],
  [/0[bB]0[aA]07(?=[0-9a-fA-F]{0,2}[^0-9a-zA-Z]|$)/g, "0a0913"],
  [/0[aA]0806/g, "090813"],
  [/0[aA]0906/g, "090812"],
  [/100[eE]09/g, "0f0d1a"],
  [/12100[aA]/g, "110f1e"],
  [/15120[cC]/g, "141226"],
  [/1[bB]1710/g, "1a1730"],
  [/171208/g, "161327"],
  [/1[dD]1708/g, "1c1734"],
  [/2[aA]1[fF]08/g, "2a2150"],
  [/241[fF]14/g, "251f3c"],
  [/3[aA]3120/g, "3a3256"],
  [/17130[bB]/g, "161229"],
  [/2[eE]2717/g, "2e2650"],
  [/55481[fF]/g, "4a3f7a"],
  [/2[bB]2510/g, "261f45"],
  [/1[aA]1204/g, "1d1245"],
  [/1[cC]1404/g, "1d1245"],
  [/1[dD]1208/g, "1d1245"],
  [/1[aA]1307/g, "1d1245"],
  // نصوص ذهبية دافئة -> بنفسجية باردة
  [/[fF]6[fF]1[eE]6/gi, "f4f2fb"],
  [/[fF]8[fF]5[eE][dD]/gi, "f4f2fb"],
  [/[fF]9[fF]6[fF]0/gi, "f4f2fb"],
  [/[aA]89[eE]8[cC]/g, "a8a2c0"],
  [/[bB]3[aA]98[fF]/g, "b1abc8"],
  [/[cC]{2}[cC]6[bB]4/g, "ccc6df"],
  [/[eE]8[dD]9[bB]0/g, "dcd6ee"],
  [/[dD]9[cC]9[aA]0/g, "d5cfe9"],
  [/[dD]6[cC]8[aA]0/g, "d2cbe9"],
  [/[eE]7[dD]9[aA]{2}/g, "e2d8f4"],
  [/6[fF]6759/g, "6f6a86"],
  [/999185/g, "9a94b4"],
  [/[bB]7[aA]892/g, "b4aecc"],
  [/9[dD]9075/g, "9d97b6"],
  [/[dD]2[cC]6[bB]0/g, "d1cbdf"],
  [/[fF]4[dD]77[aA]/g, "c4b5fd"],
  [/[fF]0[dD]98[fF]/g, "c4b5fd"],
  [/[eE]4[cC]7[cC]{2}/g, "ddd7f0"],
  // تمريرة إضافية: بقايا دافئة متناثرة
  [/[dD]7[aA]{2}33/g, "8b5cf6"],
  [/211[aA]09/g, "171331"],
  [/[eE][bB][cC][eE]76/g, "c4b5fd"],
  [/[cC]9[bB][cC]96/g, "b1abc8"],
  [/250708/g, "1b1030"],
  [/3[bB]0[bB]0[eE]/g, "231a4a"],
  [/8[aA]1[bB]20/g, "5b21b6"],
  [/1[cC]0809/g, "170f2b"],
  [/240[bB]0[dD]/g, "241a45"],
  [/1[fF]0[aA]0[cC]/g, "1a1233"],
  [/3[aA]0709/g, "291d4d"],
  [/19090[aA]/g, "171030"],
  [/18090[aA]/g, "170f2e"],
  [/[bB]10[eE]15/g, "6d28d9"],
];

let total = 0;
for (const rel of files) {
  const path = join(root, rel);
  let css = readFileSync(path, "utf8");
  const before = css;
  for (const [pattern, replacement] of rules) css = css.replace(pattern, replacement);
  if (css !== before) {
    writeFileSync(path, css, "utf8");
    const count = [...before.matchAll(/f0b429|ed1c24|F5B51B|f4c14f|e52636|245,181,27/gi)].length;
    total++;
    console.log(`✅ ${rel} — تم التحويل`);
  } else {
    console.log(`ℹ️ ${rel} — لا تغيير`);
  }
}
console.log(total ? `تم تحويل ${total} ملف إلى الثيم البنفسجي` : "لا تغييرات");