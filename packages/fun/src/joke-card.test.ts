import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {arabicHumor} from "./arabic-humor.js";
import {JOKE_CARD,layoutJokeText,renderJokeCard} from "./joke-card.js";

const fontPath=path.resolve(process.cwd(),"apps/bot/src/fonts/NotoSansArabic.ttf");
const samples=[
  "مرة واحد نسي يضحك... رجع تذكّر وضحك.",
  "لما تفتح الكتاب حتى تدرس وتكتشف بعد عشر دقائق أنك ترتب المكتب وتشاهد الإشعارات وتفكر ماذا ستأكل بدل أن تبدأ أول صفحة.",
  Array.from({length:8},(_,index)=>`هذا سطر عربي طويل للاختبار رقم ${index+1} ويبقى داخل البطاقة من الجهتين`).join("\n"),
  `كلمة${"طويلة".repeat(100)}`,
  arabicHumor.reduce((longest,entry)=>entry.text.length>longest.text.length?entry:longest).text,
];

test("Arabic joke layout keeps every text pixel inside the padded card",async()=>{
 const layouts=[];
 for(const text of samples){
  const layout=await layoutJokeText(text,fontPath);
  layouts.push(layout);
  assert.ok(layout.fontSize>=JOKE_CARD.minFontSize&&layout.fontSize<=JOKE_CARD.maxFontSize);
  assert.ok(layout.textWidth<=JOKE_CARD.maxTextWidth);
  assert.ok(layout.textLeft>=JOKE_CARD.cardLeft+50);
  assert.ok(layout.textLeft+layout.textWidth<=JOKE_CARD.cardLeft+JOKE_CARD.cardWidth-50);
  assert.ok(layout.textTop>=JOKE_CARD.cardTop+JOKE_CARD.textTopPadding);
  assert.ok(layout.textTop+layout.textHeight<=layout.cardBottom-JOKE_CARD.textBottomPadding);
  assert.ok(layout.lineCount>=1);
 }
 assert.ok(layouts[0].fontSize>layouts[1].fontSize);
 assert.equal(layouts[2].canvasHeight,JOKE_CARD.baseHeight);
 assert.ok(layouts.at(-1)!.canvasHeight>JOKE_CARD.baseHeight);
});

test("production joke renderer preserves the requested canvas width",async()=>{
 for(const [index,text] of samples.entries()){
  const image=await renderJokeCard(text,index,fontPath);
  const metadata=await sharp(image).metadata();
  const layout=await layoutJokeText(text,fontPath);
  assert.equal(metadata.width,JOKE_CARD.width);
  assert.equal(metadata.height,layout.canvasHeight);
 }
});
