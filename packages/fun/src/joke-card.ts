import fs from "node:fs";
import sharp from "sharp";

export const JOKE_CARD = {
  width: 1200,
  baseHeight: 675,
  cardLeft: 54,
  cardTop: 135,
  cardWidth: 1092,
  cardBottomGap: 110,
  textTopPadding: 30,
  textBottomPadding: 30,
  maxTextWidth: Math.floor(1092 * 0.84),
  minFontSize: 24,
  maxFontSize: 60,
} as const;

export type JokeTextLayout = {
  image: Buffer;
  fontSize: number;
  lineCount: number;
  textWidth: number;
  textHeight: number;
  textLeft: number;
  textTop: number;
  canvasHeight: number;
  cardBottom: number;
};

const fontFaceCache=new Map<string,string>();

function escapeMarkup(value:string){
  return value.replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;");
}

function startingFontSize(length:number){
  if(length<=70)return 60;
  if(length<=160)return 52;
  if(length<=300)return 46;
  if(length<=520)return 40;
  return 34;
}

async function renderText(text:string,fontPath:string,fontSize:number){
  const normalized=text.normalize("NFKC").replace(/\r\n?/gu,"\n").trim();
  const image=await sharp({text:{
    text:`<span lang="ar" foreground="#ffffff" weight="900">\u202B${escapeMarkup(normalized)}\u202C</span>`,
    font:`Noto Sans Arabic ${fontSize}`,
    fontfile:fontPath,
    width:JOKE_CARD.maxTextWidth,
    align:"centre",
    rgba:true,
    spacing:Math.max(2,Math.round(fontSize*.14)),
    wrap:"word-char",
  }}).png().toBuffer();
  const metadata=await sharp(image).metadata();
  if(!metadata.width||!metadata.height)throw new Error("Failed to measure joke text");
  return {image,width:metadata.width,height:metadata.height};
}

export async function layoutJokeText(text:string,fontPath:string):Promise<JokeTextLayout>{
  if(!text.trim())throw new Error("Joke text is empty");
  const fixedAvailableHeight=JOKE_CARD.baseHeight-JOKE_CARD.cardTop-JOKE_CARD.cardBottomGap-JOKE_CARD.textTopPadding-JOKE_CARD.textBottomPadding;
  let fontSize=startingFontSize(text.length);
  let rendered=await renderText(text,fontPath,fontSize);
  while(rendered.height>fixedAvailableHeight&&fontSize>JOKE_CARD.minFontSize){
    fontSize=Math.max(JOKE_CARD.minFontSize,fontSize-2);
    rendered=await renderText(text,fontPath,fontSize);
  }
  const canvasHeight=JOKE_CARD.baseHeight+Math.max(0,rendered.height-fixedAvailableHeight);
  const cardBottom=canvasHeight-JOKE_CARD.cardBottomGap;
  const availableHeight=cardBottom-JOKE_CARD.textBottomPadding-(JOKE_CARD.cardTop+JOKE_CARD.textTopPadding);
  const textTop=Math.round(JOKE_CARD.cardTop+JOKE_CARD.textTopPadding+(availableHeight-rendered.height)/2);
  const textLeft=Math.round((JOKE_CARD.width-rendered.width)/2);
  const estimatedLineHeight=fontSize*1.18+Math.max(2,Math.round(fontSize*.14));
  return {
    image:rendered.image,
    fontSize,
    lineCount:Math.max(1,Math.round(rendered.height/estimatedLineHeight)),
    textWidth:rendered.width,
    textHeight:rendered.height,
    textLeft,
    textTop,
    canvasHeight,
    cardBottom,
  };
}

export async function renderJokeCard(text:string,seed:number,fontPath:string){
  const palettes=[["#18070a","#e50914"],["#071529","#1677ff"],["#1d1202","#f59e0b"],["#170725","#8b5cf6"],["#03201b","#10b981"]] as const;
  const palette=palettes[Math.abs(seed)%palettes.length];
  const layout=await layoutJokeText(text,fontPath);
  let fontFace=fontFaceCache.get(fontPath);
  if(!fontFace){
    const fontData=fs.readFileSync(fontPath).toString("base64");
    fontFace=`@font-face{font-family:'NotoArabic';src:url('data:font/truetype;base64,${fontData}') format('truetype');font-weight:100 900;}`;
    fontFaceCache.set(fontPath,fontFace);
  }
  const height=layout.canvasHeight;
  const svg=Buffer.from(`<svg width="1200" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect width="1200" height="${height}" fill="url(#bg)"/><circle cx="1080" cy="80" r="230" fill="#fff" opacity=".06"/><circle cx="90" cy="${height-25}" r="260" fill="#000" opacity=".16"/><rect x="54" y="135" width="1092" height="${height-245}" rx="42" fill="#050505" opacity=".42" stroke="#fff" stroke-opacity=".13" stroke-width="2"/><style>${fontFace}.brand{font:900 23px 'NotoArabic',sans-serif;fill:#fff;letter-spacing:4px}.footer{font:800 23px 'NotoArabic',sans-serif;fill:#fff;opacity:.8;direction:rtl;unicode-bidi:plaintext}</style><rect x="435" y="48" width="330" height="58" rx="29" fill="#050505" opacity=".72"/><text x="600" y="88" text-anchor="middle" class="brand">ZARK JOKES</text><text x="600" y="${height-48}" text-anchor="middle" class="footer">اضغط «نكتة ثانية» للمزيد</text></svg>`);
  const shadow=await sharp(layout.image).tint("#000000").blur(3).png().toBuffer();
  return sharp(svg).composite([
    {input:shadow,left:layout.textLeft+3,top:layout.textTop+5},
    {input:layout.image,left:layout.textLeft,top:layout.textTop},
  ]).png({compressionLevel:8}).toBuffer();
}
