import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('artifacts/question-data',{recursive:true});
const query='SELECT DISTINCT ?item ?name ?code ?english WHERE { ?item wdt:P297 ?code; rdfs:label ?name. FILTER(LANG(?name)="ar") OPTIONAL { ?item rdfs:label ?english. FILTER(LANG(?english)="en") } }';
const response=await fetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(query),{headers:{'User-Agent':'ZarkQuestionBank/1.0 (educational CC0 data snapshot)'},signal:AbortSignal.timeout(55000)});
if(!response.ok)throw new Error(String(response.status));
const data=await response.json();
const seen=new Set();
const questions=[];
for(const row of data.results.bindings){
  const code=row.code.value;
  if(!/^[A-Z]{2}$/.test(code)||seen.has(code))continue;
  seen.add(code);
  const emoji=[...code].map(letter=>String.fromCodePoint(0x1F1E6+letter.charCodeAt(0)-65)).join('');
  questions.push({prompt:'🚩 لأي دولة أو إقليم هذا العلم؟ '+emoji,answers:[row.name.value,row.english?.value].filter(Boolean),source:row.item.value});
}
writeFileSync('artifacts/question-data/flags.json',JSON.stringify({query,questions},null,2));
console.log('flags',questions.length);
