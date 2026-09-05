export type PoolQuestion = { prompt: string; answers: readonly string[]; mediaUrl?: string; choices?: readonly string[] };

/** Ignore old decorative headers, but preserve mathematical operators. */
export function questionIdentity(question: PoolQuestion, slug = ''): string {
  const lines=question.prompt.split('\n');
  while(lines.length>1 && /^[^\p{L}\p{N}]*(?:تحدي|جولة|سؤال المنافسة|اختبار سريع|سباق|انطلق|وقت الحسم|قبل الجميع|فرصة الفوز|اختبر سرعتك|فكّر بسرعة|من يسبق|لحظة الحسم|ركّز الآن|لا تكرر الإجابة|وضع السرعة|انتبه للسؤال|سؤال مباشر|لا تتأخر|طريق الفوز|رحلة المعرفة|إصابة مباشرة)/u.test(lines[0]) && lines[0].includes(':'))lines.shift();
  const text=lines.join('\n');
  const normalize = (value: string) => value.normalize('NFKC').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\*\*/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim().toLowerCase();
  const content = ['letter-order','word-order'].includes(slug) ? normalize(question.answers[0] || text) : normalize(text);
  return `${content}|${question.mediaUrl || ''}`;
}

export function uniqueQuestions<T extends PoolQuestion>(questions: readonly T[], slug = ''): T[] {
  const seen=new Set<string>();
  return questions.filter(question=>{
    if(!question.prompt.trim() || !question.answers.some(answer=>answer.trim())) return false;
    const key=questionIdentity(question,slug);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

/** History is newest first. Exhaust unseen questions, then use least-recently played. */
export function selectFreshQuestion<T extends PoolQuestion>(pool: readonly T[], history: readonly PoolQuestion[], slug: string, random = Math.random): T {
  if(!pool.length)throw new Error('لا توجد أسئلة صالحة لهذه اللعبة.');
  const seen=new Map<string,number>();
  history.forEach((question,index)=>{const key=questionIdentity(question,slug);if(!seen.has(key))seen.set(key,index);});
  let choices=pool.filter(question=>!seen.has(questionIdentity(question,slug)));
  if(!choices.length){const oldest=Math.max(...pool.map(question=>seen.get(questionIdentity(question,slug)) ?? -1));choices=pool.filter(question=>seen.get(questionIdentity(question,slug))===oldest);}
  return choices[Math.min(choices.length-1,Math.max(0,Math.floor(random()*choices.length)))];
}

export function shuffled<T>(values: readonly T[], random = Math.random): T[] {
  const result=[...values];
  for(let index=result.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[result[index],result[other]]=[result[other],result[index]];}
  return result;
}
