(() => {
  const entries = [
    ['games','الألعاب','جولة سريعة','/play','اختر اللعبة وعدد الجولات ووقت الإجابة. أول إجابة صحيحة تفوز.'],
    ['games','الألعاب','لوبي مع أصحابك','/lobby','اجمع اللاعبين، اضغط جاهز وابدؤوا المنافسة معًا.'],
    ['games','الألعاب','تحدي اليوم','/daily','سؤال يومي للفوز بنقاط الخبرة والولاء.'],
    ['games','الألعاب','التصنيف','/leaderboard','شاهد المتصدرين في ألعاب Zark وتفاعل الغرف.'],
    ['fun','الترفيه','نكتة داخل صورة','/نكت','نكت عربية في بطاقات ملونة مع زر للنكتة التالية.'],
    ['fun','الترفيه','ميمز عربية','/ميمز','قوالب صور بتعليقات عربية عن الألعاب والمواقف اليومية.'],
    ['rooms','الغرف','أنشئ غرفة','/lfg create','حدد اللعبة والمنصة واجمع فريقًا يناسبك.'],
    ['rooms','الغرف','الغرف المفتوحة','/lfg rooms','استعرض الغرف المتاحة وانضم من أزرار البوت.'],
    ['rooms','الغرف','تجمع ذكي','/lfg smart','ابحث عن تجمع حسب اهتماماتك وتفرغك.'],
    ['rooms','الغرف','اهتماماتي','/lfg interests','حدد الألعاب والمنصة التي تريد استقبال دعواتها.'],
    ['profile','الملف والولاء','متجر الولاء وVIP','/loyalty','اشترِ VIP لمدة 3 أيام لتحصل على ×1.5 للولاء وXP.'],
    ['profile','الملف والولاء','ملفي','/profile','اعرض مستواك وفوزك ونشاطك في غرف اللعب.'],
    ['profile','الملف والولاء','أنا متفرغ','/وقت-فراغي','حدّث حالتك حتى تصل الدعوات في الوقت المناسب.'],
    ['profile','الملف والولاء','أبطال الأسبوع','/weekly','تعرف على أصحاب أعلى نقاط الولاء الأسبوعية.'],
    ['profile','الملف والولاء','لوحتي السريعة','/pulse','تابع حالتك وفرص اللعب ونقاطك من مكان واحد.'],
  ];
  const grid=document.getElementById('command-grid');
  const search=document.getElementById('command-search');
  const category=document.getElementById('command-category');
  const normalize=value=>value.toLowerCase().replace(/[أإآ]/g,'ا').replace(/[ً-ْـ]/g,'');
  function render(){
    const query=normalize(search.value.trim());
    const filtered=entries.filter(entry=>(category.value==='all'||entry[0]===category.value)&&normalize(entry.join(' ')).includes(query));
    grid.replaceChildren();
    for(const [,label,title,command,description] of filtered){
      const card=document.createElement('article');card.className='command-card';
      for(const [tag,text] of [['span',label],['h2',title],['p',description],['code',command]]){const el=document.createElement(tag);el.textContent=text;card.append(el);}
      const button=document.createElement('button');button.type='button';button.className='button ghost';button.textContent='نسخ الأمر';button.setAttribute('aria-label',`نسخ ${command}`);
      button.onclick=async()=>{try{await navigator.clipboard.writeText(command);button.textContent='تم النسخ ✓';}catch{button.textContent='حدد الأمر أعلاه وانسخه';}};
      card.append(button);grid.append(card);
    }
    document.getElementById('command-count').textContent=`${filtered.length} أمر`;
    if(!filtered.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='لا يوجد أمر مطابق. جرّب اسمًا آخر أو غيّر التصنيف.';grid.append(empty);}
  }
  search.addEventListener('input',render);category.addEventListener('change',render);render();
})();
