import {readFileSync,writeFileSync} from 'node:fs';
const topics=['movies','series','music','books','history','inventions','technology','internet','food','space','nature','football','sports','countries','geography','car-logos','company-logos','game-logos','languages','flags'];
const bank={};
const sources={license:'CC0-1.0',retrievedAt:new Date().toISOString(),endpoint:'https://query.wikidata.org/sparql',queries:{}};
for(const slug of topics){
  const {questions,query}=JSON.parse(readFileSync(`artifacts/question-data/${slug}.json`,'utf8'));
  if(!Array.isArray(questions)||!questions.length)throw new Error('Missing questions: '+slug);
  bank[slug]=slug==='flags'?questions.filter(question=>{
    const flag=question.prompt.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
    const code=flag?[...flag].map(char=>String.fromCharCode(char.codePointAt(0)-0x1F1E6+65)).join(''):'';
    return code&&!['AN','BU','CS','DD','FX','NT','SU','TP','YD','YU','ZR','PC'].includes(code);
  }):questions;
  sources.queries[slug]=query;
}
// These modes intentionally share facts; each still tracks its own history.
bank.capitals=bank.countries;
bank['gaming-quiz']=bank['game-logos'];
writeFileSync('packages/games/src/expanded-fact-bank.ts','// Offline snapshot of CC0 Wikidata statements. See docs/question-bank-sources.json.\nexport const expandedFactBank: Record<string, Array<{prompt:string;answers:string[];source:string}>> = '+JSON.stringify(bank,null,2)+';\n');
writeFileSync('docs/question-bank-sources.json',JSON.stringify(sources,null,2)+'\n');
console.log(Object.fromEntries(Object.entries(bank).map(([slug,rows])=>[slug,rows.length])));
