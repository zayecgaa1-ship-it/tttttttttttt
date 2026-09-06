import { mkdirSync, writeFileSync } from 'node:fs';

// CC0 structured facts; the saved bank is used offline at runtime.
// Only Arabic-labelled subjects and answers are admitted.
const jobs = [
  ['movies','?item wdt:P31 wd:Q11424; wdt:P57 ?answer.','من أخرج فيلم «{name}»؟'],
  ['series','?item wdt:P31 wd:Q5398426; wdt:P364 ?answer.','ما اللغة الأصلية لمسلسل «{name}»؟'],
  ['music','?item wdt:P31 wd:Q134556; wdt:P175 ?answer.','من يؤدي أغنية «{name}»؟'],
  ['books','?item wdt:P31 wd:Q571; wdt:P50 ?answer.','من ألّف كتاب «{name}»؟'],
  ['history','?item wdt:P31 wd:Q178561; wdt:P361 ?answer.','إلى أي حرب أو صراع تنتمي معركة «{name}»؟'],
  ['inventions','?item wdt:P61 ?answer. ?answer wdt:P31 wd:Q5.','اذكر أحد من يُنسب إليهم اختراع أو اكتشاف «{name}»؟'],
  ['technology','?item wdt:P31 wd:Q9143; wdt:P178 ?answer.','من طوّر لغة البرمجة «{name}»؟'],
  ['internet','?item wdt:P31 wd:Q35127; wdt:P407 ?answer.','بأي لغة يتوفر موقع «{name}» وفق بياناته؟'],
  ['food','?item wdt:P31/wdt:P279* wd:Q746549; wdt:P495 ?answer.','ما بلد منشأ طبق «{name}»؟'],
  ['space','?item wdt:P31 wd:Q523; wdt:P59 ?answer.','في أي كوكبة يقع النجم «{name}»؟'],
  ['nature','?item wdt:P31 wd:Q8502; wdt:P17 ?answer.','في أي دولة يقع جبل «{name}»؟'],
  ['football','?item wdt:P31 wd:Q476028; wdt:P159 ?answer.','في أي مدينة يقع مقر نادي كرة القدم «{name}»؟'],
  ['sports','?item wdt:P31 wd:Q483110; wdt:P17 ?answer.','في أي دولة يقع ملعب «{name}»؟'],
  ['countries','?item wdt:P31 wd:Q6256; wdt:P36 ?answer.','ما عاصمة دولة «{name}»؟'],
  ['languages','?item wdt:P31 wd:Q6256; wdt:P37 ?answer.','اذكر لغة رسمية في دولة «{name}»؟'],
  ['geography','?item wdt:P31 wd:Q4022; wdt:P17 ?answer.','اذكر دولة يمر فيها نهر «{name}»؟'],
  ['car-logos','?item wdt:P31 wd:Q3231690; wdt:P176 ?answer.','أي شركة تصنّع السيارة «{name}»؟'],
  ['company-logos','?item wdt:P31 wd:Q4830453; wdt:P159 ?answer.','في أي مدينة يقع المقر الرئيسي لشركة «{name}»؟'],
  ['game-logos','?item wdt:P31 wd:Q7889; wdt:P178 ?answer.','من طوّر لعبة «{name}»؟'],
];

mkdirSync('artifacts/question-data',{recursive:true});
const selected = process.argv.slice(2);
for (const [slug,pattern,template] of jobs.filter(([slug])=>!selected.length||selected.includes(slug))) {
  const query = `SELECT DISTINCT ?item ?name ?answer ?answerName ?english WHERE {
    hint:Query hint:optimizer "None".
    { SELECT DISTINCT ?item ?name WHERE { ${pattern} ?item rdfs:label ?name. FILTER(LANG(?name)="ar") ?answer rdfs:label ?a. FILTER(LANG(?a)="ar") } LIMIT 220 }
    ${pattern}
    ?answer rdfs:label ?answerName. FILTER(LANG(?answerName)="ar")
    OPTIONAL { ?answer rdfs:label ?english. FILTER(LANG(?english)="en") }
  }`;
  try {
    const response=await fetch('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(query),{headers:{'User-Agent':'ZarkQuestionBank/1.0 (educational CC0 data snapshot)'},signal:AbortSignal.timeout(55000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const result=await response.json();
    const groups=new Map();
    for(const row of result.results.bindings){
      const id=row.item.value, name=row.name.value;
      const q=groups.get(id)||{prompt:template.replace('{name}',name),answers:[],source:id};
      for(const a of [row.answerName.value,row.english?.value].filter(Boolean))if(!q.answers.includes(a))q.answers.push(a);
      groups.set(id,q);
    }
    const questions=[...groups.values()];
    writeFileSync(`artifacts/question-data/${slug}.json`,JSON.stringify({query,questions},null,2));
    console.log(slug,questions.length);
  }catch(error){console.log(slug,'FAILED',error.message);process.exitCode=1;}
}
