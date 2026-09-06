import fs from "node:fs/promises";
import path from "node:path";
import {arabicHumor} from "../packages/fun/src/arabic-humor.ts";
import {layoutJokeText,renderJokeCard} from "../packages/fun/src/joke-card.ts";

const fontPath=path.resolve("apps/bot/src/fonts/NotoSansArabic.ttf");
const outputDir=path.resolve("artifacts/joke-card-qa");
const ordered=[...arabicHumor].sort((a,b)=>a.text.length-b.text.length);
const samples=[ordered[0],ordered[Math.floor(ordered.length*.25)],ordered[Math.floor(ordered.length*.6)],ordered[Math.floor(ordered.length*.9)],ordered.at(-1)];
await fs.mkdir(outputDir,{recursive:true});
for(const [index,entry] of samples.entries()){
  const layout=await layoutJokeText(entry.text,fontPath);
  const image=await renderJokeCard(entry.text,index,fontPath);
  await fs.writeFile(path.join(outputDir,`${index+1}-${entry.id}.png`),image);
  console.log({id:entry.id,characters:entry.text.length,fontSize:layout.fontSize,lines:layout.lineCount,textWidth:layout.textWidth,textHeight:layout.textHeight,canvasHeight:layout.canvasHeight});
}
