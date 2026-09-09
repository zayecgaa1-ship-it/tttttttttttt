import { z } from 'zod';

export const roleLimitKeys=['bans','timeouts','kicks','roles','channels','webhooks'] as const;
const limit=z.number().int().min(0).max(1000).optional();
export const rolePolicySchema=z.object({roleId:z.string().regex(/^\d{17,20}$/),bans:limit,timeouts:limit,kicks:limit,roles:limit,channels:limit,webhooks:limit});
export const moderationSettingsSchema=z.object({
  rolePolicies:z.array(rolePolicySchema).max(50).refine(rows=>new Set(rows.map(row=>row.roleId)).size===rows.length,'لا تكرر الرتبة'),
  profanityEnabled:z.boolean(),profanityNotifyOwner:z.boolean(),profanityLogEnabled:z.boolean(),
  profanityCustomWords:z.array(z.string().trim().min(2).max(60)).max(200),
});
export function roleLimit(policies: unknown,roleIds:string[],key:typeof roleLimitKeys[number],fallback:number){
  const parsed=z.array(rolePolicySchema).safeParse(policies);
  const values=parsed.success?parsed.data.filter(row=>roleIds.includes(row.roleId)).map(row=>row[key]).filter((value):value is number=>value!==undefined):[];
  return values.length?Math.min(...values):fallback;
}

const words=[
  'fuck','fucker','fucking','fck','fuk','motherfucker','shit','sht','bullshit','bitch','btch','bitches','asshole','bastard','cunt','dickhead','dumbass','idiot',
  'كس امك','كسمك','كس اختك','كسم','كسمين','كسختك','نيك','نيكك','انيكك','انيك امك','منيوك','منيوكة','متناك','متناكة','شرموط','شرموطة','شراميط','قحبة','قحاب','عاهرة','عاهرات','عرص','معرص','خرا','خرا عليك','خراء','زبي','زبك','زب','طيز','طيزك','كحبة','كحاب','ولد القحبة','ابن القحبة','يلعن امك','يلعن ابوك','يلعن دينك','يا كلب','يا حمار','يا حقير','يا زبالة','يا وسخ','يا واطي','يا ابن الكلب',
];
function normalize(value:string){
  return value.normalize('NFKC').toLowerCase().replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').replace(/[أإآٱ]/g,'ا').replace(/[ىی]/g,'ي').replace(/ک/g,'ك').replace(/ة/g,'ه')
    .replace(/([a-z])!([a-z])/g,'$1i$2').replace(/[a-z0-9@$]+/g,token=>/[a-z]/.test(token)?token.replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'}[c]!)):token);
}
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function compile(word:string){
  const normalized=normalize(word).trim();
  const chars=[...normalized].filter(c=>/[\p{L}\p{N}]/u.test(c));
  if(chars.length<2)return null;
  const gap='[\\p{P}\\p{S}\\s_]*';
  // Merge identical consecutive letters to avoid ambiguous repeated groups
  // when an administrator supplies a long custom word.
  const runs:{char:string;count:number}[]=[];
  for(const char of chars){const previous=runs.at(-1);if(previous?.char===char)previous.count++;else runs.push({char,count:1})}
  const pattern=runs.map(({char,count})=>`${escape(char)}(?:${gap}${escape(char)}){${count-1},}`).join(gap);
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`,'u');
}
const base=words.map(word=>({word,pattern:compile(word)!}));
export function detectProfanity(content:string,customWords:string[]=[]){
  const normalized=normalize(content.slice(0,5000));
  for(const entry of [...base,...customWords.map(word=>({word,pattern:compile(word)}))]){
    if(entry.pattern?.test(normalized))return {matched:entry.word};
  }
  return null;
}
