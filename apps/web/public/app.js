const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
let state;
let me;
let roomFilter = 'all';
let roomSearch = '';
const platformLabels = {MOBILE:'📱 جوال',PC:'💻 كمبيوتر',PLAYSTATION:'🎮 بلايستيشن'};
let favoriteGames = readFavoriteGames();
function readFavoriteGames(){try{const saved=JSON.parse(localStorage.getItem('zark-favorite-games')||'[]');return new Set(Array.isArray(saved)?saved.filter(value=>typeof value==='string'):[]);}catch{return new Set();}}
function platformLabel(value){return platformLabels[value] || 'منصة غير محددة';}
function gamePlatforms(gameOrRoom){const values=gameOrRoom?.gamePlatforms||gameOrRoom?.platforms||(gameOrRoom?.platform?[gameOrRoom.platform]:[]);return values.length?values:Object.keys(platformLabels);}
function gamePlatformsLabel(gameOrRoom){return gamePlatforms(gameOrRoom).map(value=>platformLabels[value]).filter(Boolean).join(' · ');}
let activeUserTicket;
let activeAdminTicket;
let reportPresenceTimer;
let reportPresenceBound=false;
let adminZarkContent=[];
let adminBroadcastTimer;
let activeTradeConversationId;
const roomSearchAliases={
  minecraft:['minecraft','ماينكرافت','ماين كرافت','माइनक्राफ्ट','майнкрафт'],
  roblox:['roblox','روبلوكس','روب لوكس','रोब्लॉक्स'],
  valorant:['valorant','فالورانت','فلورانت','वैलोरेंट'],
  fortnite:['fortnite','فورتنايت','فورت نايت','फोर्टनाइट'],
  'gta-v':['gta','gta v','جراند','قراند','جراند ثفت اوتو','grand theft auto'],
  rust:['rust','رست','रस्ट'],
  'counter-strike-2':['counter strike','counter-strike','cs2','كاونتر','काउंटर स्ट्राइक'],
  'rocket-league':['rocket league','روكيت ليق','روكيت ليج','रॉकेट लीग'],
  'league-of-legends':['league of legends','lol','ليج اوف ليجندز','लीग ऑफ लीजेंड्स'],
  'call-of-duty-warzone':['warzone','call of duty','كول اوف ديوتي','وارزون','कॉल ऑफ ड्यूटी'],
};

boot().catch(showFatal);

async function boot() {
  renderShell();
  me = (await api('/api/me')).user;
  if(me)void api('/api/me/activity',{method:'POST'}).catch(()=>undefined);
  renderShell();
  if (page === "commands") { $('realtime-status').hidden=true; await tutorialManager.autoStart(); return; }
  state = ['profile','teams'].includes(page) ? {} : await api('/api/state');
  await renderPage();
  await tutorialManager.autoStart();
  const stream = new EventSource('/api/stream');
  let timer,refreshRunning=false,refreshPending=false;
  const refresh=async()=>{
    if(document.hidden||$('zark-tutorial-v4'))return;
    if(refreshRunning){refreshPending=true;return;}
    refreshRunning=true;
    try{
      if(page==='reports'){if(me)await loadMyReports();return;}
      // Editing a profile must never lose unsaved fields to a background event.
      if(['profile','games','status','admin','security','teams'].includes(page))return;
      if(page==='trade'&&activeTradeConversationId){
        await loadTradeInbox();
        if(!document.querySelector('#trade-conversation input:focus, #trade-conversation textarea:focus'))await openTradeConversation(activeTradeConversationId);
        return;
      }
      state=await api('/api/state');await renderPage(true);
    }catch(error){console.error('Realtime refresh failed',error)}
    finally{refreshRunning=false;if(refreshPending){refreshPending=false;clearTimeout(timer);timer=setTimeout(refresh,1000)}}
  };
  stream.onopen=()=>setRealtimeStatus(true);
  stream.onerror=()=>setRealtimeStatus(false);
  stream.onmessage = (message) => {
    let event;try{event=JSON.parse(message.data)}catch{}
    // Do not rebuild the whole Trade page while a desktop user is typing.
    // Re-rendering was sending them back to the market after every message.
    if(!event||['profile','games','status','admin','security','teams'].includes(page))return;
    clearTimeout(timer);
    timer = setTimeout(refresh,1000);
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('pagehide',()=>{clearTimeout(timer);stream.close()},{once:true});
}

function renderShell() {
const links = [['home','/','الرئيسية'],['lfg','/lfg.html','LFG'],['games','/games.html','الألعاب'],['teams','/teams.html','الفرق'],['trade','/trade.html','Trade'],['leaderboard','/leaderboard.html','التصنيف'],['profile','/profile.html','جدولي وحالتي'],['reports','/reports.html','الدعم'],['commands','/commands.html','البوت']];
  if (me?.isAdmin) links.push(['admin','/admin.html','الإدارة']);
  if (me?.isOwner) links.push(['security','/security.html','الحماية']);
  const desktopLinks=links.filter(([key])=>!['commands'].includes(key));
  const moreLinks=links.filter(([key])=>['teams','commands','reports','leaderboard','admin','security'].includes(key));
  const mobileLinks=[['home','/','⌂','الرئيسية'],['lfg','/lfg.html','⚔','LFG'],['games','/games.html','◈','الألعاب'],['trade','/trade.html','⇄','Trade'],['profile','/profile.html','●','حالتي']];
  $('site-nav').innerHTML = `<nav class="site-nav shell"><a class="brand" data-tour-id="brand" href="/"><img class="brand-logo" src="/assets/zark-bot-avatar.png" alt="Zark"><span>ZARK<small>PLAY · CONNECT · COMPETE</small></span></a><div class="nav-links" id="nav-links">${desktopLinks.map(([key,href,label]) => `<a data-tour-id="${key==='lfg'?'lfg-button':key==='profile'?'profile-link':''}" class="${page===key?'active':''}" href="${href}">${label}</a>`).join('')}</div><div class="nav-user"><button class="nav-alerts" type="button" aria-label="الإشعارات" title="الإشعارات">●</button>${me ? `<a class="nav-account" href="/profile.html">${me.avatarUrl?`<img src="${escapeHtml(me.avatarUrl)}" alt="">`:'<span class="avatar-fallback">Z</span>'}<span>${escapeHtml(me.displayName)}</span></a><a class="button ghost small logout-link" href="/auth/logout">خروج</a>` : `<a class="button primary small" href="/auth/discord">دخول Discord</a>`}<button class="mobile-menu" id="mobile-menu" aria-label="المزيد">•••</button></div></nav><nav class="mobile-bottom-nav" aria-label="التنقل المحمول">${mobileLinks.map(([key,href,icon,label])=>`<a class="${page===key?'active':''}" href="${href}" ${page===key?'aria-current="page"':''}><i>${icon}</i><span>${label}</span></a>`).join('')}<button id="mobile-more" type="button" aria-label="المزيد" aria-expanded="false"><i>•••</i><span>المزيد</span></button></nav><div id="mobile-more-drawer" class="mobile-more-drawer" hidden><button class="drawer-backdrop" type="button" aria-label="إغلاق"></button><section role="dialog" aria-modal="true" aria-label="روابط إضافية"><header><b>استكشف Zark</b><button type="button" data-close-more aria-label="إغلاق">×</button></header>${moreLinks.map(([key,href,label])=>`<a class="${page===key?'active':''}" href="${href}">${label}<span>←</span></a>`).join('')}<a href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">مجتمع Discord <span>↗</span></a></section></div>`;
  document.querySelectorAll('body > .mobile-bottom-nav, body > .mobile-more-drawer').forEach(node=>node.remove());
  document.body.append(document.querySelector('.mobile-bottom-nav'),$('mobile-more-drawer'));
  $('site-footer').innerHTML = `<div class="site-footer"><div class="footer-inner shell"><div><span class="footer-brand">ZARK</span><p>مساحتك العربية للعب والتنافس وتكوين الفريق.</p></div><div class="footer-links"><a href="/">الرئيسية</a><a href="/lfg.html">LFG</a><a href="/games.html">الألعاب</a><a href="/teams.html">الفرق</a><a href="/trade.html">Trade</a><a href="/leaderboard.html">التصنيف</a><a href="/reports.html">الدعم</a>${me?.isAdmin?'<a href="/admin.html">الإدارة</a>':''}${me?.isOwner?'<a href="/security.html">الحماية</a>':''}</div><div class="footer-community"><b>PLAY · CONNECT · COMPETE</b><a href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">انضم إلى Discord ↗</a></div></div></div>`;
  $('nav-links').insertAdjacentHTML('beforeend', '<a class="discord-nav-link" href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">Discord ↗</a>');
  $('mobile-menu').insertAdjacentHTML('beforebegin', '<button class="nav-tutorial-button" id="open-onboarding" type="button">؟ كيف أستخدمه</button>');
  if (!$('tutorial-help-fab')) document.body.insertAdjacentHTML('beforeend','<button id="tutorial-help-fab" class="tutorial-help-fab" type="button" aria-label="فتح مركز الشرح">؟<span>الشرح</span></button><span id="realtime-status" class="realtime-status offline" title="حالة التحديث المباشر">● جارِ الاتصال</span>');
  document.querySelector('.footer-links')?.insertAdjacentHTML('beforeend', '<a href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">انضم إلى Discord ↗</a>');
  document.querySelector('.footer-links')?.insertAdjacentHTML('beforeend', '<a href="/status.html">حالة النظام</a>');
  const menu = $('mobile-menu');
  document.querySelector('.nav-alerts').onclick=()=>me?location.href='/trade.html?tab=notifications':showToast('سجّل أولًا','اربط حساب Discord لعرض تنبيهاتك.');
  menu.setAttribute('aria-controls', matchMedia('(max-width:900px)').matches?'mobile-more-drawer':'nav-links');
  menu.setAttribute('aria-expanded', 'false');
  const closeMenu = () => { $('nav-links').classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  const mobileMore=$('mobile-more'),moreDrawer=$('mobile-more-drawer');
  mobileMore.setAttribute('aria-controls','mobile-more-drawer');
  const closeMore=()=>{moreDrawer.hidden=true;mobileMore?.setAttribute('aria-expanded','false');menu.setAttribute('aria-expanded','false');document.body.classList.remove('drawer-open')};
  const openMore=()=>{closeMenu();moreDrawer.hidden=false;mobileMore.setAttribute('aria-expanded','true');menu.setAttribute('aria-controls','mobile-more-drawer');menu.setAttribute('aria-expanded','true');document.body.classList.add('drawer-open');moreDrawer.querySelector('[data-close-more]')?.focus()};
  mobileMore.onclick=openMore;
  menu.onclick=()=>{if(matchMedia('(max-width:900px)').matches){menu.setAttribute('aria-controls','mobile-more-drawer');moreDrawer.hidden?openMore():closeMore()}else{menu.setAttribute('aria-controls','nav-links');menu.setAttribute('aria-expanded',String($('nav-links').classList.toggle('open')))}};
  moreDrawer.querySelector('[data-close-more]').onclick=closeMore;moreDrawer.querySelector('.drawer-backdrop').onclick=closeMore;
  moreDrawer.onkeydown=event=>{if(event.key==='Escape'){closeMore();mobileMore.focus()}else trapDialogFocus(event,moreDrawer.querySelector('section'))};
  $('site-nav').onkeydown = event => { if (event.key === 'Escape') { closeMenu(); closeMore(); menu.focus(); } };
  document.querySelector('main').onclick = closeMenu;
  document.querySelector('.nav-links a.active')?.setAttribute('aria-current', 'page');
  if (!$('skip-content')) { document.body.insertAdjacentHTML('afterbegin', '<a id="skip-content" class="skip-link" href="#main-content">انتقل إلى المحتوى</a>'); document.querySelector('main').id = 'main-content'; document.querySelector('main').tabIndex = -1; }
  $('open-onboarding').onclick = () => tutorialManager.openCenter();
  $('tutorial-help-fab').onclick = () => tutorialManager.openCenter();
  if(me&&!$('zark-ai-widget')){
    document.body.insertAdjacentHTML('beforeend',`<aside id="zark-ai-widget" class="zark-ai-widget"><button id="zark-ai-fab" class="zark-ai-fab" type="button" aria-label="مساعد Zark"><img src="/assets/zark-bot-avatar.png" alt=""><span>اسأل Zark</span></button><section id="zark-ai-panel" class="zark-ai-panel" hidden><header><img src="/assets/zark-bot-avatar.png" alt=""><div><b>مساعد Zark</b><small id="floating-ai-status">دعم ذكي</small></div><button id="floating-ai-clear" type="button" title="حذف المحادثة">🗑️</button><button id="zark-ai-close" type="button">×</button></header><div id="floating-ai-log" class="floating-ai-log"><article class="chat-message assistant">أهلًا ${escapeHtml(me.displayName)}! اسألني عن الغرف أو الألعاب المتاحة الآن.</article></div><form id="floating-ai-form"><input id="floating-ai-input" maxlength="500" placeholder="ماذا أستطيع أن ألعب الآن؟" required><button type="submit">إرسال</button></form></section></aside>`);
    bindFloatingSupport().catch(console.error);
  }
}

function renderOnboarding(force=false) {
  const key='zark-onboarding-v1';
  if (!force && localStorage.getItem(key)) return;
  document.getElementById('zark-onboarding')?.remove();
  const steps = [
    {icon:'🔐',title:'سجّل دخولك عبر Discord',text:'اضغط «دخول Discord» لربط حسابك بأمان. هذا يفتح ملفك، الإشعارات، إنشاء الغرف والتقييم.',link:'/auth/discord',cta:'تسجيل الدخول'},
    {icon:'👤',title:'جهّز ملفك ووقت فراغك',text:'من «ملفي» اختر حالتك الآن وحدد الأيام والساعات التي تكون فيها متفرغًا. هذا يساعد Zark على ترشيح التجمعات المناسبة.',link:'/profile.html',cta:'فتح ملفي'},
    {icon:'❤️',title:'اختر الألعاب التي تهمك',text:'من صفحة LFG اضغط «مهتم» بجانب ألعابك. فعّل الإشعارات أو الغفوة، واختر إن كنت تريد دعوات Zark التلقائية.',link:'/lfg.html#interests',cta:'اختيار الاهتمامات'},
    {icon:'⚡',title:'أنشئ غرفة أو ادخل غرفة',text:'في LFG اختر اللعبة وعدد اللاعبين ووقت البدء. «الآن» لا يحتاج وقتًا، و«لاحقًا» يطلب موعد التجمع. بعدها يرسل البوت الدعوات ويجهز Voice عند الحاجة.',link:'/lfg.html',cta:'فتح LFG'},
    {icon:'🏆',title:'العب، قيّم، واطلب الدعم',text:'بعد الجلسة يصل التقييم في الخاص. استخدم الدعم أو البلاغات عند أي مشكلة، ويمكنك سؤال مساعد Zark من الزر أسفل الصفحة.',link:'/reports.html',cta:'فتح الدعم'},
  ];
  let index=0;
  const modal=document.createElement('section');
  modal.id='zark-onboarding';
  modal.className='onboarding-backdrop';
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  const close=()=>{localStorage.setItem(key,'1');modal.remove();};
  const paint=()=>{
    const step=steps[index];
    modal.innerHTML=`<article class="onboarding-card"><button class="onboarding-skip" type="button">تخطي ×</button><div class="onboarding-progress">${steps.map((_,i)=>`<i class="${i===index?'active':i<index?'done':''}"></i>`).join('')}</div><span class="onboarding-icon">${step.icon}</span><small>دليل البداية السريع · ${index+1}/${steps.length}</small><h2>${step.title}</h2><p>${step.text}</p><div class="onboarding-actions"><button class="button ghost" type="button" ${index===0?'disabled':''} data-tour-prev>السابق</button><a class="button primary" href="${step.link}">${step.cta}</a><button class="button light" type="button" data-tour-next>${index===steps.length-1?'إنهاء':'التالي'}</button></div></article>`;
    modal.querySelector('.onboarding-skip').onclick=close;
    modal.querySelector('[data-tour-prev]')?.addEventListener('click',()=>{index-=1;paint();});
    modal.querySelector('[data-tour-next]').onclick=()=>{if(index===steps.length-1)close();else{index+=1;paint();}};
  };
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  paint();document.body.appendChild(modal);
}

const productTourKey='zark-tutorial-center-v3';
const tourSections={
  basics:{icon:'✨',title:'الأساسيات',route:'/',steps:[{id:'brand',target:'.brand',title:'مرحبًا في Zark',text:'الشعار يعيدك دائمًا إلى الصفحة الرئيسية.'},{id:'navigation',target:'#nav-links',title:'التنقل الرئيسي',text:'من هذه القائمة تصل إلى LFG وTrade والألعاب وملفك والدعم.'}]},
  lfg:{icon:'🎮',title:'إنشاء غرفة LFG',route:'/lfg.html',steps:[{id:'game',target:'[data-tour-id="game-selector"]',title:'اختر اللعبة',text:'اختر اللعبة من الكتالوج الحقيقي.'},{id:'players',target:'[data-tour-id="players-count"]',title:'عدد اللاعبين',text:'حدد العدد المطلوب للتجمع.'},{id:'when',target:'[data-tour-id="play-when"]',title:'الآن أو لاحقًا',text:'الآن لا يطلب رقمًا. لاحقًا يفتح الساعة وAM صباحًا أو PM مساءً.'},{id:'create',target:'#create-room-form button[type="submit"]',title:'أنشئ التجمع',text:'بعد المراجعة اضغط هنا، وسيتولى Zark إنشاء التجمع وربطه بـDiscord.'}]},
  categories:{icon:'🗂️',title:'التصنيفات والغرف',route:'/lfg.html',steps:[{id:'categories',target:'[data-tour-id="categories"]',title:'فلترة التصنيفات',text:'هذه أزرار التصنيفات الفعلية، وتعرض الغرف المطابقة فقط.'},{id:'rooms',target:'#rooms .room-card, #rooms .empty-state',title:'بطاقات الغرف',text:'من البطاقة تدخل أو تخرج أو تفتح Voice، وصاحب الغرفة يرى أدوات الإدارة.'}]},
  interests:{icon:'❤️',title:'الاهتمامات والتنبيهات',route:'/lfg.html',steps:[{id:'interests',target:'.interest-section .section-heading',title:'اختر اهتماماتك مرة واحدة',text:'هذا قسم اهتماماتك. فعّل الألعاب التي تهمك ليقترح Zark تجمعات مناسبة.'},{id:'notifications',target:'#interest-games .interest-card:first-child',title:'التنبيهات والغفوة',text:'داخل كل بطاقة تستطيع تشغيل التنبيه، إيقافه، أو عمل غفوة بدون تغيير اهتمامك.'}]},
  profile:{icon:'👤',title:'الملف ووقت الفراغ',route:'/profile.html',steps:[{id:'profile',target:'#profile-head',title:'ملفك الشخصي',text:'يعرض الحالة والتقييم والفوز وXP ونشاط LFG.'},{id:'availability',target:'#availability-form',title:'وقت فراغك',text:'اختر حالتك بسرعة أو حدد ساعات أسبوعية حتى تتحسن اقتراحات الغرف.'}]},
  trade:{icon:'🔄',title:'Zark Player Trading',route:'/trade.html',steps:[{id:'trade-overview',target:'[data-tour-id="trade-overview"]',title:'سوق Trade',text:'كل صفقة لها رقم واضح، حالة، وصاحب موثّق بحساب Discord.'},{id:'trade-search',target:'[data-tour-id="trade-search"]',title:'ابحث وصفِّ النتائج',text:'ابحث بالغرض أو اللعبة ورتب حسب الأحدث أو النشاط.'},{id:'trade-create',target:'[data-tour-tab="create"]',title:'أنشئ عرضًا',text:'ارفع صورة من جهازك وحدد I HAVE وI WANT. المحادثة تفتح فقط بعد قبول المهتم.'}]},
  others:{icon:'🧭',title:'الألعاب والدعم',route:'/games.html',steps:[{id:'games',target:'.page-hero',title:'ألعاب Zark',text:'هنا تجد ألعاب البوت واختصاراتها؛ وقت الإجابة يختاره اللاعب من 10 إلى 60 ثانية.'},{id:'commands',target:'.command-strip',title:'اختصارات سريعة',text:'استخدم /play أو الاختصارات العربية الظاهرة لتبدأ بسرعة.'}]},
};
function readProductTour(){try{return JSON.parse(localStorage.getItem(productTourKey)||'{}')}catch{return {}}}
function writeProductTour(value){localStorage.setItem(productTourKey,JSON.stringify({...readProductTour(),...value}));}
function renderProductTour(openCenter=false){const saved=readProductTour();if(openCenter)return renderTourCenter();if(saved.status==='active'&&saved.section)return renderTourStep(saved.section,Number(saved.step)||0);if(!saved.dismissed)renderTourCenter(true);}
function renderTourCenter(firstVisit=false){
  cleanupTour();const saved=readProductTour(),completed=saved.completedSections||{};const currentSection=Object.entries(tourSections).find(([,section])=>section.route===location.pathname)?.[0];
  const modal=document.createElement('section');modal.id='zark-product-tour';modal.className='tour-invite tutorial-center';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.innerHTML=`<article><button class="onboarding-skip" data-tour-close type="button">إغلاق ×</button><span>📚</span><h2>مركز شرح Zark</h2><p>ابدأ بشرح الموقع كاملًا وبالترتيب. بعد انتهائه تستطيع اختيار أي قسم وإعادته وحده.</p><button class="tutorial-full-start" type="button" data-tour-full><i>🚀</i><span><b>شرح الموقع كاملًا</b><small>جولة مرتبة تشمل LFG والاهتمامات والملف وTrade والألعاب</small></span></button><div class="tutorial-section-title">أو اختر قسمًا محددًا</div><div class="tutorial-section-grid">${Object.entries(tourSections).map(([key,section])=>`<button type="button" data-tour-section="${key}"><i>${section.icon}</i><b>${section.title}</b><small>${completed[key]?'✅ مكتمل':`${section.steps.length} خطوات`}</small></button>`).join('')}</div><div class="tutorial-center-actions">${currentSection?`<button class="button primary" data-explain-page>اشرح هذه الصفحة</button>`:''}<button class="button ghost" data-tour-dismiss>${firstVisit?'لاحقًا':'إغلاق'}</button></div></article>`;
  modal.querySelector('[data-tour-full]').onclick=startFullTour;modal.querySelectorAll('[data-tour-section]').forEach(button=>button.onclick=()=>startTourSection(button.dataset.tourSection));modal.querySelector('[data-explain-page]')?.addEventListener('click',()=>startTourSection(currentSection));modal.querySelector('[data-tour-close]').onclick=()=>modal.remove();modal.querySelector('[data-tour-dismiss]').onclick=()=>{writeProductTour({dismissed:true,status:'idle'});modal.remove();};document.body.appendChild(modal);
}
function startTourSection(sectionKey,keepFullTour=false){const section=tourSections[sectionKey];if(!section)return;writeProductTour({status:'active',section:sectionKey,step:0,dismissed:true,...(keepFullTour?{}:{fullTour:false,fullIndex:0})});cleanupTour();if(location.pathname!==section.route){location.href=section.route;return;}renderTourStep(sectionKey,0);}
function startFullTour(){const first=Object.keys(tourSections)[0];writeProductTour({status:'active',section:first,step:0,dismissed:true,fullTour:true,fullIndex:0,completedSections:{}});cleanupTour();startTourSection(first,true);}
async function renderTourStep(sectionKey,index){
  const section=tourSections[sectionKey],step=section?.steps[index];if(!section||!step)return finishTourSection(sectionKey);
  if(location.pathname!==section.route){writeProductTour({status:'active',section:sectionKey,step:index});location.href=section.route;return;}
  if(sectionKey==='trade'&&step.id==='trade-create')showTradeTab('create');
  cleanupTour();const target=await waitForTourTarget(step.target);if(!target){console.warn('tutorial_target_missing',step.id,step.target);return nextTourStep(sectionKey,index);}
  if(window.innerWidth<=950&&target.closest('#nav-links'))$('nav-links')?.classList.add('open');target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});await waitForStableTarget(target);paintTourSpotlight(sectionKey,index,target);
}
function paintTourSpotlight(sectionKey,index,target){
  cleanupTour();const section=tourSections[sectionKey],step=section.steps[index];target.closest('.site-nav')?.setAttribute('data-tour-nav','true');target.setAttribute('data-tour-active','true');const rect=target.getBoundingClientRect(),padding=9,vw=window.innerWidth,vh=window.innerHeight,spotTop=Math.max(6,rect.top-padding),spotLeft=Math.max(6,rect.left-padding),spotRight=Math.min(vw-6,rect.right+padding),spotBottom=Math.min(vh-6,rect.bottom+padding);
  const overlay=document.createElement('section');overlay.id='zark-product-tour';overlay.className='product-tour-layer';overlay.innerHTML=`<div class="tour-spotlight" style="top:${spotTop}px;left:${spotLeft}px;width:${Math.max(20,spotRight-spotLeft)}px;height:${Math.max(20,spotBottom-spotTop)}px"></div><aside class="tour-tooltip" style="visibility:hidden"><span class="tour-arrow">➜</span><small>${section.title} · ${index+1}/${section.steps.length}</small><h2>${step.title}</h2><p>${step.text}</p><div><button class="button ghost small" data-tour-back ${index===0?'disabled':''}>السابق</button><button class="button ghost small" data-tour-center>الأقسام</button><button class="button primary small" data-tour-next>${index===section.steps.length-1?'إنهاء القسم':'التالي'}</button></div></aside>`;
  const tooltip=overlay.querySelector('.tour-tooltip');tooltip.style.width=`${Math.min(360,vw-24)}px`;
  overlay.querySelector('[data-tour-back]').onclick=()=>renderTourStep(sectionKey,index-1);overlay.querySelector('[data-tour-center]').onclick=()=>{writeProductTour({status:'idle',fullTour:false,fullIndex:0});renderTourCenter();};overlay.querySelector('[data-tour-next]').onclick=()=>nextTourStep(sectionKey,index);window.addEventListener('keydown',tourEscape,{once:true});document.body.appendChild(overlay);requestAnimationFrame(()=>positionTourTooltip(tooltip,rect));console.info('tutorial_step_viewed',sectionKey,step.id);
}
function positionTourTooltip(tooltip,targetRect){const margin=12,gap=16,vw=window.innerWidth,vh=window.innerHeight,box=tooltip.getBoundingClientRect();let top;if(vh-targetRect.bottom-gap>=box.height)top=targetRect.bottom+gap;else if(targetRect.top-gap>=box.height)top=targetRect.top-gap-box.height;else top=Math.max(margin,Math.min(vh-box.height-margin,targetRect.top));const centered=targetRect.left+(targetRect.width-box.width)/2,left=Math.max(margin,Math.min(vw-box.width-margin,centered));tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;tooltip.style.visibility='visible';tooltip.classList.toggle('tour-tooltip-above',top<targetRect.top);}
function nextTourStep(sectionKey,index){cleanupTour();const next=index+1;writeProductTour({status:'active',section:sectionKey,step:next});renderTourStep(sectionKey,next);}
function finishTourSection(sectionKey){const saved=readProductTour(),completed={...(saved.completedSections||{}),[sectionKey]:true},keys=Object.keys(tourSections);if(saved.fullTour){const nextIndex=(Number(saved.fullIndex)||0)+1;if(nextIndex<keys.length){const next=keys[nextIndex];writeProductTour({status:'active',section:next,step:0,completedSections:completed,fullTour:true,fullIndex:nextIndex});cleanupTour();const section=tourSections[next];if(location.pathname!==section.route)location.href=section.route;else renderTourStep(next,0);return;}writeProductTour({status:'idle',section:null,step:0,completedSections:completed,fullTour:false,fullIndex:0});cleanupTour();return renderTourComplete(sectionKey,true);}writeProductTour({status:'idle',section:null,step:0,completedSections:completed});cleanupTour();renderTourComplete(sectionKey,false);}
function waitForTourTarget(selector){return new Promise(resolve=>{let frames=0;const inspect=()=>{const node=document.querySelector(selector);if(node&&node.getClientRects().length)return resolve(node);if(++frames>300)return resolve(null);requestAnimationFrame(inspect);};inspect();});}
function waitForStableTarget(target){return new Promise(resolve=>{let previous='',stable=0,frames=0;const inspect=()=>{const rect=target.getBoundingClientRect(),current=`${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;stable=current===previous?stable+1:0;previous=current;if(stable>=3||++frames>120)return resolve();requestAnimationFrame(inspect);};inspect();});}
function cleanupTour(){document.getElementById('zark-product-tour')?.remove();document.querySelectorAll('[data-tour-active]').forEach(node=>node.removeAttribute('data-tour-active'));document.querySelectorAll('[data-tour-nav]').forEach(node=>node.removeAttribute('data-tour-nav'));}
function tourEscape(event){if(event.key==='Escape'){writeProductTour({status:'idle',fullTour:false,fullIndex:0});cleanupTour();}}
function renderTourComplete(sectionKey,fullCompleted=false){cleanupTour();const done=document.createElement('section');done.id='zark-product-tour';done.className='tour-invite';done.innerHTML=`<article><span>🎉</span><h2>${fullCompleted?'اكتمل شرح موقع Zark كاملًا':`اكتمل قسم ${escapeHtml(tourSections[sectionKey]?.title||'الشرح')}`}</h2><p>${fullCompleted?'أصبحت تعرف إنشاء الغرف والاهتمامات والملف وTrade والألعاب. اختر الآن أي قسم إذا أردت مراجعته.':'تم حفظ تقدمك. تستطيع فتح أي قسم آخر من مركز الشرح.'}</p><div><button class="button ghost" data-tour-close>إغلاق</button><button class="button primary" data-tour-center>اختيارات الشرح</button></div></article>`;done.querySelector('[data-tour-close]').onclick=()=>done.remove();done.querySelector('[data-tour-center]').onclick=renderTourCenter;document.body.appendChild(done);}

// v4 replaces the old static spotlight.  It is intentionally the only manager
// used by boot/navigation; old helpers are retained only for backward-compatible
// pages that may still call them from cached HTML.
const tutorialManager=(()=>{
  const version=4,key='zark-tutorial-v4';
  const sections={
    basics:{icon:'✨',title:'الأساسيات',route:'/',steps:[['.brand','مرحبًا في Zark','من الشعار تعود للصفحة الرئيسية.'],['#nav-links','التنقل','على الجوال تصل للغرف والألعاب وملفك من الشريط السفلي، وتفتح «المزيد» للفرق والدعم وباقي الصفحات. على الكمبيوتر استخدم القائمة العلوية.']]},
    lfg:{icon:'🎮',title:'إنشاء غرفة LFG',route:'/lfg.html',steps:[['[data-tour="game-selector"]','اختر اللعبة','اختر اللعبة التي تريد التجمع لها؛ أجهزتها تظهر تلقائيًا.'],['[data-tour="players-count"]','عدد اللاعبين','حدد عدد اللاعبين المطلوبين.'],['[data-tour="play-when"]','وقت اللعب','اختر الآن أو لاحقًا؛ اللاحق يفتح الموعد.'],['#create-room-form button[type="submit"]','أنشئ التجمع','اضغط هنا بعد مراجعة الخيارات لإنشاء الغرفة.'],['[data-tour="categories"]','التصنيفات','صفّ الغرف حسب النوع.'],['#rooms .room-card, #rooms .empty-state','الغرف المباشرة','ادخل للغرفة أو اخرج منها وافتح Voice.'],['[data-tour="interests"]','الاهتمامات','فعّل ألعابك لتصلك اقتراحات مناسبة.']]},
    games:{icon:'🏆',title:'ألعاب Zark',route:'/games.html',steps:[['.page-hero','ألعاب البوت','هنا أوامر ألعاب Zark واختصاراتها.'],['.game-stage','ابدأ لعبة','هذا الزر يختار لعبة فقط. انسخ أمرها وشغّله داخل Discord لبدء الجولة.'],['.catalog-toolbar','ابحث واحفظ','فلتر حسب التصنيف وابحث باسم اللعبة، واستخدم النجمة لحفظ المفضلة على هذا الجهاز.'],['#zark-games','كتالوج الألعاب','اختر اللعبة التي تريدها ثم ابدأ من Discord.']]},
    teams:{icon:'👥',title:'فرق Zark',route:'/teams.html',steps:[['#team-account','فريقك','أنشئ فريقاً أو راجع التشكيلة والدعوات والصلاحيات.'],['#team-list','ترتيب الفرق','تتغير نقاط الفريق مع XP والانتصارات وجلسات LFG المكتملة.'],['#team-search','البحث عن فريق','ابحث باسم الفريق أو وصفه.']]},
    profile:{icon:'👤',title:'جدولي وحالتي',route:'/profile.html',steps:[['[data-tour="profile-head"]','ملفك الشخصي','يعرض التقييم وXP ونشاطك.'],['[data-tour="profile-stats"]','إحصاءاتك','هنا نقاط الولاء والجلسات ووقت Voice.'],['#profile-loyalty','متجر الولاء وVIP','تكسب الولاء من الفوز والتحدي اليومي والجلسات. VIP يعطي ×1.5 للولاء وXP لمدة 3 أيام؛ الشراء مجددًا يمدد المدة المتبقية.'],['[data-tour="availability-status"]','حالتك الآن','يعرض حالة الجدول وآخر نشاط ووقت الفراغ القادم.'],['[data-tour="availability-quick"]','اختصارات الحالة','اختر فاضي أو ألعب الآن أو مشغول.'],['[data-tour="availability-weekly"]','الجدول الأسبوعي','أضف عدة فترات لكل يوم، بما فيها الفترات التي تتجاوز منتصف الليل.']]},
    commands:{icon:'⌘',title:'النكت والميمز وأوامر البوت',route:'/commands.html',steps:[['#command-search','ابحث عن أمر','اكتب نكت أو ميمز أو لوبي للعثور على الأمر المناسب.'],['#command-category','صفّ الأوامر','اختر الترفيه أو الألعاب أو الغرف أو الملف والولاء.'],['#command-grid','انسخ وشغّل في Discord','زر النسخ ينسخ الأمر فقط. افتح Discord والصقه لتشغيله. النكت داخل صور، والميمز بتعليقات مرتبطة بقوالبها.']]},
    trade:{icon:'🔄',title:'Trade',route:'/trade.html',steps:[['[data-tour-id="trade-overview"]','سوق Trade','تصفح عروض اللاعبين بأمان.'],['[data-tour-id="trade-search"]','البحث والفلترة','ابحث باسم الغرض أو اللعبة.'],['[data-tour-tab="create"]','أنشئ عرضًا','ارفع صورة وحدد ما لديك وما تريد.','createTrade']]},
    leaderboard:{icon:'🥇',title:'التصنيف',route:'/leaderboard.html',steps:[['.page-hero','لوحة التصنيف','تابع أفضل اللاعبين.'],['#leader-tabs','أنواع التصنيف','بدّل بين الألعاب والتفاعل والجلسات والتقييم.']]},
    support:{icon:'🛟',title:'الدعم والبلاغات',route:'/reports.html',steps:[['.support-chat','مساعد Zark','اسأل عن ميزات الموقع والغرف.'],['.feedback-grid','إرسال بلاغ','أرسل بلاغ لاعب أو تقرير خطأ بشكل سري.']]}
  };
  sections.lfg.steps.push(['#smart-match','المطابقة الذكية','يقترح Zark غرفة حسب اهتماماتك والزملاء المتاحين. إذا لم يجد غرفة مناسبة، يمكنه إنشاء تجمع جديد.']);
  sections.trade.steps.splice(2,0,
    ['#trade-how-it-works','أبدي اهتمامك بعرض','افتح تفاصيل عرض لاعب آخر واضغط «أنا مهتم». ستظهر حالة الطلب داخل تفاصيل العرض؛ لا يمكنك إرسال اهتمام لعرضك أنت.'],
    ['[data-trade-tab="mine"]','قبول طلبات الاهتمام','من «عروضي» افتح عرضك لمراجعة المهتمين. زر «قبول وفتح محادثة» يتيح المحادثة بينك وبين صاحب الطلب.'],
    ['[data-trade-tab="inbox"]','المحادثات الخاصة','بعد قبول الاهتمام، افتح المحادثة من هذا التبويب أو من تفاصيل العرض. قبل القبول لن تظهر محادثة جديدة.'],
    ['[data-trade-tab="notifications"]','متابعة الرد على طلبك','تظهر هنا إشعارات الاهتمام والقبول والرسائل حتى تتابع ما حصل على عروضك وطلباتك.']
  );
  sections.profile.steps.push(
    ['#availability-timezone','توقيتك المحلي','تأكد من المنطقة الزمنية حتى تُحسب فترات اللعب بمواعيدك الصحيحة.'],
    ['.availability-privacy','خصوصية حالتك','اختر ما يظهر للآخرين: حالتك وآخر نشاطك وأوقات الفراغ والدراسة والنوم.'],
    ['.toggle-grid:has(#dnd-sleep)','عدم الإزعاج','أوقف دعوات الغرف أثناء النوم أو الدراسة أو الانشغال حسب تفضيلك.'],
    ['#availability-form button[type="submit"]','احفظ جدولك','اضغط حفظ الحالة والجدول لتطبيق الفترات والخصوصية. تعديل الحقول وحده لا يحفظها.'],
    ['#profile-settings-form','تخصيص الملف','عدّل النبذة واللون وظهور النشاط، ثم استخدم زر حفظ الملف المستقل عن حفظ الجدول.']
  );
  let cleanupFns=[],activeTarget=null,raf=0,tourEpoch=0,memory=null,returnFocus=null,restorePage=null;
  const read=()=>{if(memory)return memory;try{const saved=JSON.parse(localStorage.getItem(key)||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}}catch{return {}}};
  const write=patch=>{const value={...read(),...patch,version};memory=value;try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value};
  function rememberPage(){if(restorePage)return;returnFocus=document.activeElement;const menuOpen=$('nav-links')?.classList.contains('open'),drawerOpen=$('mobile-more-drawer')&&!$('mobile-more-drawer').hidden,createOpen=$('create-room-panel')?.classList.contains('open');restorePage=()=>{if(!menuOpen){$('nav-links')?.classList.remove('open');$('mobile-menu')?.setAttribute('aria-expanded','false')}if(!drawerOpen)$('mobile-more-drawer')?.querySelector('[data-close-more]')?.click();if(!createOpen)$('close-create-room')?.click();restorePage=null;returnFocus?.isConnected&&returnFocus.focus()};}
  function pause(){write({status:'paused',pausedVersion:version});clean();restorePage?.();}
  function dialogKeys(layer){layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','دليل استخدام Zark');layer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();pause()}else if(event.key==='Tab')trapDialogFocus(event,layer)});}
  const clean=()=>{tourEpoch++;cancelAnimationFrame(raf);cleanupFns.splice(0).forEach(fn=>fn());document.getElementById('zark-tutorial-v4')?.remove();document.querySelectorAll('[data-tour-active]').forEach(n=>n.removeAttribute('data-tour-active'));document.querySelectorAll('[data-tour-nav]').forEach(n=>n.removeAttribute('data-tour-nav'));activeTarget=null};
  const account=async completed=>{if(!me)return;try{await api('/api/me/tutorial',{method:'PUT',body:{completed,version}})}catch(error){console.warn('tutorial_account_save_failed',error)}};
  const completed=async()=>{const remote=me?await api('/api/me/tutorial').catch(()=>null):null,saved=read();return Boolean((remote?.tutorialCompleted&&remote.tutorialVersion>=version)||(saved.completed&&saved.version>=version))};
  async function autoStart(){const epoch=tourEpoch,saved=read();if(saved.status==='active'&&sections[saved.section])return show(saved.section,saved.step||0);if(saved.pausedVersion===version||(saved.completed&&saved.version>=version))return;if(await completed())return;if(epoch!==tourEpoch||$('zark-tutorial-v4'))return;openCenter(true)}
  async function restart(){clean();write({completed:false,status:'idle',pausedVersion:0,completedSections:{}});await account(false);openCenter(false)}
  function openCenter(first=false){
    clean();restorePage?.();rememberPage();
    const saved=read(),done=saved.completedSections||{},current=Object.entries(sections).find(([,s])=>s.route===location.pathname)?.[0];
    const resume=sections[saved.section]&&['paused','active'].includes(saved.status);
    const layer=document.createElement('section');layer.id='zark-tutorial-v4';layer.className='tour-invite tutorial-center tutorial-v4-center';
    layer.innerHTML=`<article><button class="onboarding-skip" data-close>إغلاق ×</button><span>📚</span><h2>دليل استخدام Zark</h2><p>شرح عملي داخل الموقع. اختر قسماً، أو اتبع الجولة الكاملة. يُحفظ تقدمك على هذا الجهاز.</p><div class="tutorial-progress-label">${Object.keys(sections).filter(id=>done[id]).length} من ${Object.keys(sections).length} أقسام مكتملة</div>${resume?`<button class="button primary tutorial-resume" data-resume>أكمل من حيث توقفت · ${sections[saved.section].title}</button>`:''}<button class="tutorial-full-start" data-full><i>🚀</i><span><b>ابدأ الشرح الكامل</b><small>السابق والتالي للتنقل · Escape للإيقاف</small></span></button><div class="tutorial-section-title">الأقسام</div><div class="tutorial-section-grid">${Object.entries(sections).map(([id,s])=>`<button data-section="${id}"><i>${s.icon}</i><b>${s.title}</b><small>${done[id]?'✅ مكتمل':`${s.steps.length} خطوات`}${!me&&['profile','trade'].includes(id)?' · يحتاج دخول':''}</small></button>`).join('')}</div><div class="tutorial-center-actions">${current?'<button class="button primary" data-page>اشرح هذه الصفحة</button>':''}<button class="button ghost" data-later>${first?'لاحقًا':'إلغاء'}</button></div></article>`;
    layer.querySelector('[data-close]').onclick=pause;layer.querySelector('[data-later]').onclick=pause;
    layer.querySelector('[data-full]').onclick=()=>start('basics',0,true,0);
    layer.querySelector('[data-resume]')?.addEventListener('click',()=>start(saved.section,saved.step||0,Boolean(saved.full),saved.fullIndex||0));
    layer.querySelector('[data-page]')?.addEventListener('click',()=>start(current));
    layer.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>start(b.dataset.section));
    dialogKeys(layer);document.body.append(layer);(layer.querySelector('[data-resume]')||layer.querySelector('[data-full]')).focus();
  }
  function start(section,index=0,full=false,fullIndex=0){const s=sections[section];if(!s)return;rememberPage();write({status:'active',section,step:index,full,fullIndex,pausedVersion:0});clean();if(location.pathname!==s.route){location.assign(s.route);return}show(section,index)}
  async function show(section,index){
    rememberPage();const epoch=tourEpoch,s=sections[section],step=s?.steps[index];
    if(!s)return openCenter();if(!step)return finishSection(section);
    if(location.pathname!==s.route)return start(section,index,read().full,read().fullIndex||0);
    if(!me&&(section==='profile'||step[3]==='createTrade'))return fallback(section,index,true);
    if(step[3]==='createTrade')showTradeTab('create');
    if(section==='lfg'&&index<4)$('open-create-room')?.click();else if(section==='lfg')$('close-create-room')?.click();
    let selector=step[0];
    if(selector==='#nav-links'&&matchMedia('(max-width:900px)').matches){
      $('nav-links')?.classList.remove('open');
      if($('mobile-more-drawer')?.hidden)$('mobile-more')?.click();
      selector='#mobile-more-drawer section';
    }else if(section==='basics')$('mobile-more-drawer')?.querySelector('[data-close-more]')?.click();
    const target=await waitFor(selector,epoch);if(epoch!==tourEpoch)return;if(!target)return fallback(section,index);
    target.closest('.site-nav')?.setAttribute('data-tour-nav','true');
    target.scrollIntoView({block:'center',behavior:'auto'});
    if(!visible(target))return fallback(section,index);paint(section,index,target);
  }
  function visible(node){const r=node?.getBoundingClientRect(),style=node&&getComputedStyle(node);return !!(r&&r.width>2&&r.height>2&&style.display!=='none'&&style.visibility!=='hidden')}
  function waitFor(selector,epoch){return new Promise(resolve=>{const until=Date.now()+3000;const check=()=>{if(epoch!==tourEpoch)return resolve(null);const node=document.querySelector(selector);if(visible(node))return resolve(node);if(Date.now()>until)return resolve(null);setTimeout(check,80)};check()})}
  function paint(section,index,target){
    clean();activeTarget=target;target.closest('.site-nav')?.setAttribute('data-tour-nav','true');target.setAttribute('data-tour-active','true');
    const s=sections[section],step=s.steps[index],layer=document.createElement('section');
    layer.id='zark-tutorial-v4';layer.className='product-tour-layer tutorial-v4-layer';
    layer.innerHTML=`<div class="tour-spotlight"></div><aside class="tour-tooltip"><button class="tour-close" aria-label="إيقاف الشرح" data-pause>×</button><small>${s.title} · ${index+1}/${s.steps.length}</small><progress class="tutorial-progress" max="${s.steps.length}" value="${index+1}" aria-label="تقدم القسم"></progress><h2>${step[1]}</h2><p>${step[2]}</p><div><button class="button ghost small" data-back ${index===0&&!(read().full&&Object.keys(sections).indexOf(section)>0)?'disabled':''}>السابق</button><button class="button ghost small" data-center>الأقسام</button><button class="button primary small" data-next>${index===s.steps.length-1?'إنهاء القسم':'التالي'}</button></div></aside>`;
    document.body.append(layer);dialogKeys(layer.querySelector('.tour-tooltip'));
    const move=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(step[0]==='#nav-links'&&matchMedia('(max-width:900px)').matches!==Boolean(target.closest('#mobile-more-drawer')))return start(section,index,read().full,read().fullIndex||0);position(layer,target)})};
    const keyboard=e=>{if(e.defaultPrevented||e.target.matches('input,textarea,select,[contenteditable="true"]'))return;if(e.key==='Escape'){e.preventDefault();pause()}else if(e.key==='ArrowLeft'){e.preventDefault();next(section,index)}else if(e.key==='ArrowRight'){e.preventDefault();previous(section,index)}};
    addEventListener('resize',move,{passive:true});addEventListener('scroll',move,true);document.addEventListener('keydown',keyboard);
    const observer=new ResizeObserver(move);observer.observe(target);
    cleanupFns.push(()=>removeEventListener('resize',move),()=>removeEventListener('scroll',move,true),()=>document.removeEventListener('keydown',keyboard),()=>observer.disconnect());
    layer.querySelector('[data-pause]').onclick=pause;layer.querySelector('[data-back]').onclick=()=>previous(section,index);
    layer.querySelector('[data-center]').onclick=()=>openCenter();layer.querySelector('[data-next]').onclick=()=>next(section,index);
    move();layer.querySelector('[data-next]').focus();
  }
  function position(layer,target){if(!visible(target))return fallback(read().section,read().step||0);const r=target.getBoundingClientRect(),spot=layer.querySelector('.tour-spotlight'),tip=layer.querySelector('.tour-tooltip'),pad=8,vw=innerWidth,vh=innerHeight;const left=Math.max(4,Math.min(vw-4,r.left-pad)),top=Math.max(4,Math.min(vh-4,r.top-pad));spot.style.cssText=`top:${top}px;left:${left}px;width:${Math.max(0,Math.min(vw-4,r.right+pad)-left)}px;height:${Math.max(0,Math.min(vh-4,r.bottom+pad)-top)}px`;if(vw<=700){tip.classList.add('tour-tooltip-mobile');tip.classList.toggle('tour-tooltip-mobile-top',r.top+r.height/2>vh/2);return}tip.classList.remove('tour-tooltip-mobile');const box=tip.getBoundingClientRect(),gap=16,candidates=[[r.left+(r.width-box.width)/2,r.bottom+gap],[r.left+(r.width-box.width)/2,r.top-gap-box.height],[r.right+gap,r.top],[r.left-gap-box.width,r.top]];const found=candidates.find(([x,y])=>x>=12&&y>=12&&x+box.width<=vw-12&&y+box.height<=vh-12)||candidates[0];tip.style.left=`${Math.max(12,Math.min(vw-box.width-12,found[0]))}px`;tip.style.top=`${Math.max(12,Math.min(vh-box.height-12,found[1]))}px`}
  function previous(section,index){const saved=read();if(index>0)return start(section,index-1,saved.full,saved.fullIndex||0);const keys=Object.keys(sections),previousIndex=keys.indexOf(section)-1;if(saved.full&&previousIndex>=0){const previousSection=keys[previousIndex];start(previousSection,sections[previousSection].steps.length-1,true,previousIndex)}}
  function next(section,index){const state=read();if(index+1<sections[section].steps.length)return start(section,index+1,state.full,state.fullIndex||0);finishSection(section)}
  async function finishSection(section,skipped=false){const state=read(),done={...(state.completedSections||{}),...(skipped?{}:{[section]:true})};if(state.full){const keys=Object.keys(sections),nextIndex=(state.fullIndex||0)+1;if(nextIndex<keys.length){write({completedSections:done,fullIndex:nextIndex});return start(keys[nextIndex],0,true,nextIndex)}write({completed:true,status:'completed',completedSections:done,full:false});await account(true);return completeDialog()}write({status:'idle',completedSections:done});openCenter()}
  function fallback(section,index,requiresLogin=false){
    clean();const layer=document.createElement('section');layer.id='zark-tutorial-v4';layer.className='tour-invite tutorial-v4-fallback';
    layer.innerHTML=`<article><button class="onboarding-skip" data-close>إغلاق ×</button><span>${requiresLogin?'🔐':'📍'}</span><h2>${requiresLogin?'هذه الخطوة تحتاج تسجيل دخول':'العنصر غير متاح حالياً'}</h2><p>${requiresLogin?'سجّل عبر Discord لاستخدام هذه الميزة، أو تخطّ القسم وتابع شرح الموقع.':'يمكنك إعادة المحاولة أو تجاوز هذه الخطوة ومتابعة الشرح.'}</p><div class="tutorial-center-actions">${requiresLogin?'<a class="button primary" href="/auth/discord">تسجيل الدخول</a>':'<button class="button ghost" data-retry>إعادة المحاولة</button>'}<button class="button primary" data-next>${requiresLogin?'تخطي القسم':'تخطي الخطوة'}</button><button class="button ghost" data-center>الأقسام</button></div></article>`;
    layer.querySelector('[data-next]').onclick=()=>requiresLogin?finishSection(section,true):next(section,index);
    layer.querySelector('[data-retry]')?.addEventListener('click',()=>start(section,index,read().full,read().fullIndex||0));
    layer.querySelector('[data-center]').onclick=()=>openCenter();layer.querySelector('[data-close]').onclick=pause;
    dialogKeys(layer);document.body.append(layer);layer.querySelector('[data-next]').focus();
  }
  function completeDialog(){clean();const layer=document.createElement('section');layer.id='zark-tutorial-v4';layer.className='tour-invite tutorial-v4-fallback';layer.innerHTML='<article><span>🎉</span><h2>انتهت الجولة</h2><p>تستطيع مراجعة الأقسام التي تخطيتها أو إعادة الشرح من زر الشرح في أي وقت.</p><button class="button primary" data-close>تم</button></article>';layer.querySelector('[data-close]').onclick=pause;dialogKeys(layer);document.body.append(layer);layer.querySelector('[data-close]').focus()}
  return {autoStart,openCenter,restart};
})();

async function renderPage(realtime = false) {
  if (page === 'home') renderHome();
  if (page === 'lfg') await renderLfg(realtime);
  if (page === 'games') renderGames();
  if (page === 'teams') await renderTeams();
  if (page === 'profile') await renderProfile();
  if (page === 'leaderboard') await renderLeaderboard(document.querySelector('[data-board].active')?.dataset.board||'game');
  if (page === 'reports') await renderReports();
  if (page === 'trade') await renderTrade(realtime);
  if (page === 'status') await renderStatus();
  if (page === 'admin' && !realtime) await bindAdmin();
  if (page === 'security' && !realtime) await bindSecurity();
}

async function bindSecurity(){
  const gate=$('security-gate'),content=$('security-content');
  try{
    const dashboard=await api('/api/security/dashboard');
    gate.hidden=true;content.hidden=false;
    const c=dashboard.counts;
    const runtime=dashboard.botRuntime,metadata=runtime?.metadata||{},heartbeatFresh=runtime&&Date.now()-new Date(runtime.lastSeenAt).getTime()<90000,securityReady=heartbeatFresh&&metadata.securityReady===true;
    $('security-stats').innerHTML=statCards([[dashboard.protection.active?'ACTIVE':'OFF','الحماية'],[securityReady?'READY':'CHECK','جاهزية البوت'],[dashboard.suspensions.filter(item=>item.status==='SUSPENDED').length,'إدمن معلّق'],[c.bans||0,'Ban آخر 60 دقيقة'],[c.timeouts||0,'Timeout آخر 60 دقيقة'],[dashboard.alerts.filter(item=>item.severity==='CRITICAL').length,'تنبيه خطير']]);
    const missing=Array.isArray(metadata.securityMissingPermissions)?metadata.securityMissingPermissions:[],blocked=Array.isArray(metadata.securityBlockedRoles)?metadata.securityBlockedRoles:[];
    $('security-readiness').className=`surface security-readiness ${securityReady?'ready':'warning'}`;$('security-readiness').innerHTML=securityReady?'<b>✅ حماية Discord جاهزة</b><p>البوت متصل، يقرأ Audit Log، ويستطيع إزالة الرتب الخطرة عند تجاوز الحدود.</p>':`<b>⚠️ الحماية تحتاج تدخّلًا</b><p>${!heartbeatFresh?'Heartbeat البوت غير متصل أو أقدم من 90 ثانية. ':''}${missing.length?`الصلاحيات الناقصة: ${escapeHtml(missing.join('، '))}. `:''}${blocked.length?`رتب أعلى من البوت: ${escapeHtml(blocked.map(role=>role.name||role.id).join('، '))}.`:''}</p>`;
    $('security-events').innerHTML=dashboard.actions.length?dashboard.actions.map(item=>`<article class="admin-room"><div><b>${escapeHtml(item.severity)} · ${escapeHtml(item.actionType)}</b><small>${escapeHtml(item.executorId||'غير مؤكد')} ← ${escapeHtml(item.targetId||'-')} · ${new Date(item.timestamp).toLocaleString('ar')}</small><small>${escapeHtml(item.reason||'بدون سبب')}</small></div></article>`).join(''):empty('لا توجد أحداث حماية بعد.');
    $('security-suspensions').innerHTML=dashboard.suspensions.length?dashboard.suspensions.map(item=>`<article class="admin-room"><div><b>${escapeHtml(item.userId)} · ${escapeHtml(item.status)}</b><small>${escapeHtml(item.reason)} · ${new Date(item.suspendedAt).toLocaleString('ar')}</small><small>الرتب المحفوظة: ${item.roleSnapshots.map(role=>escapeHtml(role.roleName||role.roleId)).join('، ')||'لا توجد'}</small></div>${item.status==='SUSPENDED'?`<button class="button primary small" data-security-restore="${item.userId}">استرجاع الرتب</button>`:'<span class="live-chip">تم الاسترجاع</span>'}</article>`).join(''):empty('لا توجد إدارات معلّقة.');
    const s=dashboard.settings;['enabled','maxBansPerHour','maxTimeoutsPerHour','maxKicksPerHour','maxRoleChangesPerHour','maxChannelDeletesPerHour','maxWebhookChangesPerHour','ownerDmAlertsEnabled','securityLogChannelId'].forEach(key=>{const input=$(`security-${key}`);if(!input)return;input.type==='checkbox'?input.checked=Boolean(s[key]):input.value=s[key]??''});$('security-operationalExemptUserIds').value=(s.operationalExemptUserIds||[]).join(', ');
    void bindSecurityModeration(s).catch(error=>{$('security-moderation-result').textContent=error.message});
    dashboard.actions.forEach((item,index)=>{if(item.metadata?.kind==='PROFANITY')$('security-events').children[index]?.insertAdjacentHTML('beforeend',`<details><summary>نص الرسالة — ${escapeHtml(item.metadata.displayName)} في ${escapeHtml(item.metadata.channelId)}</summary><p dir="auto">${escapeHtml(item.metadata.content)}</p></details>`)});
    $('security-settings-form').onsubmit=async event=>{event.preventDefault();const body={enabled:$('security-enabled').checked,maxBansPerHour:Number($('security-maxBansPerHour').value),maxTimeoutsPerHour:Number($('security-maxTimeoutsPerHour').value),maxKicksPerHour:Number($('security-maxKicksPerHour').value),maxRoleChangesPerHour:Number($('security-maxRoleChangesPerHour').value),maxChannelDeletesPerHour:Number($('security-maxChannelDeletesPerHour').value),maxWebhookChangesPerHour:Number($('security-maxWebhookChangesPerHour').value),ownerDmAlertsEnabled:$('security-ownerDmAlertsEnabled').checked,securityLogChannelId:$('security-securityLogChannelId').value.trim()||null,operationalExemptUserIds:$('security-operationalExemptUserIds').value.split(/[\s,،]+/).filter(Boolean)};try{await api('/api/security/settings',{method:'PUT',body});$('security-result').textContent='✅ تم حفظ إعدادات الحماية.';}catch(error){$('security-result').textContent=`❌ ${error.message}`;}};
    document.querySelectorAll('[data-security-restore]').forEach(button=>button.onclick=async()=>{if(!confirm('استرجاع الرتب الأصلية القابلة للإدارة فقط؟'))return;await api(`/api/security/suspensions/${button.dataset.securityRestore}/restore`,{method:'POST'});await bindSecurity();});
  }catch(error){gate.innerHTML=`<span>🔒</span><h1>الحماية للمالك فقط</h1><p>${escapeHtml(error.message)}</p>`;}
}

async function renderStatus(){
  const target=$('public-status');
  try{
    const status=await api('/api/status');
    const fresh=status.bot?.lastSeenAt?new Date(status.bot.lastSeenAt).toLocaleString('ar'):'لا توجد إشارة بعد';
    const services=[['الموقع وAPI',status.api],['قاعدة البيانات',status.database],['بوت Discord',status.bot?.online],['Redis والتحديث المباشر',status.realtime?.redisOnline]];
    target.innerHTML=`<div class="service-grid public-status-grid">${services.map(([name,online])=>`<article><span class="service-dot ${online?'online':'offline'}"></span><b>${escapeHtml(name)}</b><small>${online?'يعمل بشكل طبيعي':'يحتاج متابعة'}</small></article>`).join('')}</div><div class="status-details"><article><b>آخر اتصال للبوت</b><span>${escapeHtml(fresh)}</span></article><article><b>إشعارات آخر 24 ساعة</b><span>✅ ${status.notifications?.sent||0} وصلت · ⚠️ ${status.notifications?.failed||0} فشلت · ⏳ ${status.notifications?.pending||0} قيد الإرسال</span></article><article><b>التحديث المباشر</b><span>${status.realtime?.redisConfigured?'Redis مهيأ':'Redis غير مهيأ — الموقع يعمل لكن التحديث بين النسخ محدود'} · ${status.realtime?.realtimeClients||0} زائر متصل</span></article></div><small class="status-refresh">آخر فحص: ${new Date(status.checkedAt).toLocaleTimeString('ar')} · تتحدث الصفحة تلقائيًا كل 30 ثانية.</small>`;
  }catch(error){target.innerHTML=empty(`تعذر جلب الحالة الآن: ${error.message}`);}
  clearTimeout(window.zarkStatusTimer);window.zarkStatusTimer=setTimeout(()=>renderStatus().catch(()=>undefined),30000);
}

function renderHome() {
  const homeAction=document.querySelector('.cta a');
  if(homeAction){homeAction.href=me?'/lfg.html':'/auth/discord';homeAction.textContent=me?'افتح غرف اللعب':'سجّل عبر Discord';}
  const rooms = state.rooms || [];
  const active = rooms.reduce((sum, room) => sum + room.currentPlayers, 0);
  $('hero-active').textContent = `${active} لاعب نشط`;
  $('stat-active').textContent = active;
  $('stat-rooms').textContent = rooms.length;
  $('stat-games').textContent = state.lfgGames?.length || 0;
  $('stat-zark').textContent = state.zarkGames?.length || 0;
  $('home-rooms').innerHTML = rooms.length ? rooms.slice(0,3).map(roomCard).join('') : empty('لا توجد غرف الآن — كن أول من يبدأ تجمعًا.');
  $('home-leaderboard').innerHTML = rankingRows(state.leaderboard || [], 'gamePoints', 'XP');
}

async function renderLfg(realtime) {
  const catalog = state.lfgCatalog || [];
  const games = catalog.flatMap(category => category.games);
  if (!realtime) {
    $('room-game').dataset.tourId='game-selector';$('room-game').dataset.tour='game-selector';$('room-size').dataset.tourId='players-count';$('room-size').dataset.tour='players-count';$('room-when').dataset.tourId='play-when';$('room-when').dataset.tour='play-when';$('room-schedule-label').dataset.tourId='schedule-time';$('lfg-filters').dataset.tourId='categories';$('lfg-filters').dataset.tour='categories';$('interest-games').dataset.tourId='interests';$('interest-games').dataset.tour='interests';
    $('room-game').innerHTML = games.map(game => `<option value="${escapeHtml(game.slug)}">${escapeHtml(game.icon||'🎮')} ${escapeHtml(game.name)} — ${escapeHtml(gamePlatformsLabel(game))}</option>`).join('');
    const updateSelectedGame=()=>{updateRobloxMapField();const game=games.find(item=>item.slug===$('room-game').value);$('room-game-platforms').textContent=gamePlatformsLabel(game);};$('room-game').onchange=updateSelectedGame;updateSelectedGame();
    $('room-platform-filter').onchange=renderRoomList;

    $('room-mic-filter').onchange=renderRoomList;
    $('lfg-filters').innerHTML = `<button class="active" data-filter="all">الكل</button>${catalog.map(category => `<button data-filter="${escapeHtml(category.slug)}">${escapeHtml(category.icon||'🎮')} ${escapeHtml(category.name)}</button>`).join('')}`;
    document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { roomFilter=button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button)); renderRoomList(); });
    const initialSearch=new URLSearchParams(location.search).get('room')||new URLSearchParams(location.search).get('q')||'';$('room-search').value=initialSearch;roomSearch=normalizeRoomSearch(initialSearch);
    $('room-search').oninput = () => { roomSearch=normalizeRoomSearch($('room-search').value); renderRoomList(); };
    $('close-room-manager').onclick = () => $('room-manager').hidden=true;
    const createPanel=$('create-room-panel'),createBackdrop=$('create-room-backdrop');
    const closeCreate=()=>{createPanel.classList.remove('open');createBackdrop.hidden=true;document.body.classList.remove('drawer-open');$('open-create-room').setAttribute('aria-expanded','false')};
    $('open-create-room').setAttribute('aria-controls','create-room-panel');$('open-create-room').setAttribute('aria-expanded','false');
    $('open-create-room').onclick=()=>{createPanel.classList.add('open');createBackdrop.hidden=false;document.body.classList.add('drawer-open');$('open-create-room').setAttribute('aria-expanded','true');createPanel.querySelector('select,input,button')?.focus()};
    $('smart-match').onclick=async()=>{if(!me){location.href='/auth/discord';return}const button=$('smart-match'),result=$('smart-match-result');button.disabled=true;result.textContent='يحلل Zark اهتماماتك واللاعبين المتاحين والغرف الآن...';try{const matched=await api('/api/me/lfg/smart-match',{method:'POST',body:{}});state=await api('/api/state');renderRoomList();result.textContent=`✅ ${matched.recommendation?.reason||`تم اختيار ${matched.room.gameName}`}`;showToast(matched.joinedExisting?'انضممت إلى أفضل غرفة':'أنشأ Zark غرفة مناسبة',matched.recommendation?.reason||matched.room.gameName,'success');}catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
    $('close-create-room').onclick=closeCreate;createBackdrop.onclick=closeCreate;
    createPanel.setAttribute('role','dialog');createPanel.setAttribute('aria-modal','true');
    createPanel.onkeydown=event=>{if(event.key==='Escape'){closeCreate();$('open-create-room').focus()}else trapDialogFocus(event,createPanel)};
    bindCreateRoom();
  }
  renderRoomList();
  if(!realtime)await renderInterests(games);
}

function renderRoomList() {
  const categories = new Map((state.lfgCatalog||[]).flatMap(category => category.games.map(game => [game.slug, category.slug])));
  const rooms = (state.rooms||[]).filter(room => {
    if (roomFilter!=='all' && categories.get(room.gameSlug)!==roomFilter) return false;
    const platformFilter=$('room-platform-filter').value;
    if(platformFilter!=='all' && !gamePlatforms(room).includes(platformFilter))return false;
    const micFilter=$('room-mic-filter')?.value||'all';
    if(micFilter==='voice'&&!room.needsVoice)return false;
    if(micFilter==='text'&&room.needsVoice)return false;
    if (!roomSearch) return true;
    return smartRoomMatch(room,roomSearch);
  });
  $('room-count').textContent = `${rooms.length} LIVE`;
  $('rooms').innerHTML = rooms.length ? rooms.map(room => {
    const finished=['COMPLETED','CLOSED'].includes(room.status);
    const status=room.status==='SCHEDULED'?'مجدولة':room.status==='ACTIVE'?'يلعبون الآن':room.status==='COMPLETED'?'انتهت':room.status==='CLOSED'?'مغلقة':room.status==='FULL'?'مكتملة':'تجمع';
    const players=(room.members||[]).map(member=>`<span class="room-player ${member.voiceActive?'voice':''}">${avatar(member.avatarUrl,member.displayName,'mini')}${member.id===room.hostId?'👑':member.voiceActive?'🎙️':'●'} ${escapeHtml(member.displayName)}</span>`).join('')||'<span class="room-player muted">بانتظار اللاعبين</span>';
    const remaining=formatRoomTiming(room);
    return `<article class="room-card detailed" style="--room-accent:${escapeHtml(room.accentColor||'#e50914')}"><div><div class="room-top"><span class="game-icon">${escapeHtml(room.roomEmoji||room.gameIcon||'🎮')}</span><span class="room-status status-${room.status.toLowerCase()}">${status}</span></div><h3>${escapeHtml(room.title||room.gameName)}</h3>${room.hostPriority?'<span class="priority-badge">🚀 أولوية</span>':''}<span class="platform-badge">${escapeHtml(gamePlatformsLabel(room))}</span><div class="room-meta host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')}<span>${escapeHtml(room.gameName)} · Host: <b>${escapeHtml(room.hostName)}</b> · ${room.needsVoice?'🎙️ Voice':'💬 Text'} ${room.mapName?`· 🗺️ ${escapeHtml(room.mapName)}`:''} ${room.gameMode?`· ${escapeHtml(room.gameMode)}`:''}</span></div><div class="room-players">${players}</div><div class="room-progress"><i style="width:${Math.min(100,room.currentPlayers/room.maxPlayers*100)}%"></i></div><div class="room-bottom"><span>${room.currentPlayers}/${room.maxPlayers} لاعبين</span><span>⏱️ ${remaining}</span></div></div><div class="room-actions"><button class="button primary small" data-join="${room.id}" ${finished||room.locked||room.currentPlayers>=room.maxPlayers?'disabled':''}>${room.status==='SCHEDULED'?'تسجيل':'دخول'}</button><button class="button ghost small" data-leave="${room.id}" ${finished?'disabled':''}>${room.status==='SCHEDULED'?'إلغاء التسجيل':'خروج'}</button>${room.voiceChannelId&&state.guildId?`<a class="button ghost small" href="https://discord.com/channels/${escapeHtml(state.guildId)}/${escapeHtml(room.voiceChannelId)}" target="_blank" rel="noreferrer">Voice</a>`:''}${me?.userId===room.hostId&&!finished?`<button class="button ghost small" data-manage="${room.id}">إدارة</button>`:''}</div></article>`;
  }).join('') : empty(roomSearch?'لا توجد نتيجة مطابقة للبحث.':'لا توجد غرف ضمن هذا التصنيف.');
  document.querySelectorAll('[data-join]').forEach(button => button.onclick = () => roomAction(button.dataset.join,'join',button));
  document.querySelectorAll('[data-leave]').forEach(button => button.onclick = () => roomAction(button.dataset.leave,'leave',button));
  document.querySelectorAll('[data-manage]').forEach(button => button.onclick = () => openRoomManager(button.dataset.manage));
}

function bindCreateRoom() {
  if (!me) { $('create-room-form').querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=true); return; }
  $('login-hint').hidden = true;
  const updateSchedule=()=>{const later=$('room-when').value==='later';$('room-schedule-label').hidden=!later;if(later){const date=nextScheduledDate(Number($('room-schedule-hour').value),$('room-schedule-period').value);$('room-schedule-preview').textContent=`الموعد تلقائيًا: ${date.toLocaleString('ar',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;}};
  $('room-when').onchange=updateSchedule;$('room-schedule-hour').onchange=updateSchedule;$('room-schedule-period').onchange=updateSchedule;updateSchedule();
  $('create-room-form').onsubmit = async event => {
    event.preventDefault();
    const submit=event.submitter||$('create-room-form').querySelector('button[type="submit"]');if(submit?.disabled)return;if(submit)submit.disabled=true;
    const result = $('create-room-result'); result.textContent='جارِ إنشاء التجمع...';
    try {
      const scheduledFor=$('room-when').value==='later'?nextScheduledDate(Number($('room-schedule-hour').value),$('room-schedule-period').value).toISOString():undefined;
      const room = await api('/api/me/lfg/rooms',{method:'POST',body:{gameSlug:$('room-game').value,maxPlayers:Number($('room-size').value),durationMinutes:Number($('room-duration').value),scheduledFor,mapName:$('room-game').value==='roblox'?$('room-map').value||undefined:undefined,gameMode:$('room-mode').value||undefined,description:$('room-description').value||undefined,needsVoice:$('room-voice').checked}});
      result.textContent=`تم إنشاء غرفة ${room.gameName} بنجاح.`; state.rooms.unshift(room); renderRoomList();showToast('تم إنشاء الغرفة','صار تجمعك مباشرًا ويمكن للاعبين الانضمام الآن.','success');$('close-create-room')?.click();
    } catch(error){result.textContent=error.message;}finally{if(submit)submit.disabled=false;}
  };
}

function nextScheduledDate(hour,period){let hours=hour%12;if(period==='PM')hours+=12;const date=new Date();date.setHours(hours,0,0,0);if(date.getTime()<Date.now()+2*60_000)date.setDate(date.getDate()+1);return date}

function updateRobloxMapField(){const roblox=$('room-game').value==='roblox';$('room-map-label').hidden=!roblox;$('room-map').required=roblox;if(!roblox)$('room-map').value='';}

async function roomAction(roomId, action, button) {
  if (!me) { location.href='/auth/discord'; return; }
  if(button?.disabled)return;const original=button?.textContent;if(button){button.disabled=true;button.textContent='جارِ التنفيذ...';}
  try { await api(`/api/me/lfg/${roomId}/${action}`,{method:'POST'}); state=await api('/api/state'); renderRoomList(); }
  catch(error){alert(error.message);if(button){button.disabled=false;button.textContent=original;}}
}

function openRoomManager(roomId) {
  const room=(state.rooms||[]).find(item=>item.id===roomId);
  if(!room||room.hostId!==me?.userId)return;
  $('manage-room-id').value=room.id;$('manage-room-title').value=room.title||'';$('manage-room-emoji').value=room.roomEmoji||room.gameIcon||'🎮';$('manage-room-color').value=room.accentColor||'#e50914';$('manage-room-mode').value=room.gameMode||'';$('manage-room-map-label').hidden=room.gameSlug!=='roblox';$('manage-room-map').required=room.gameSlug==='roblox';$('manage-room-map').value=room.mapName||'';$('manage-room-size').value=room.maxPlayers;$('manage-room-duration').value=room.durationMinutes;$('manage-room-description').value=room.description||'';$('manage-room-voice').checked=room.needsVoice;$('manage-room-locked').checked=room.locked;
  $('room-manager').hidden=false;$('room-manager').scrollIntoView({behavior:'smooth',block:'start'});
  $('room-manager-form').onsubmit=saveRoomManager;
  document.querySelectorAll('[data-host-action]').forEach(button=>button.onclick=()=>hostRoomAction(button.dataset.hostAction));
}

async function saveRoomManager(event){event.preventDefault();const id=$('manage-room-id').value;const result=$('room-manager-result');result.textContent='جارِ حفظ إعدادات الغرفة...';try{await api(`/api/me/lfg/${id}`,{method:'PUT',body:{title:$('manage-room-title').value||null,roomEmoji:$('manage-room-emoji').value||null,accentColor:$('manage-room-color').value,gameMode:$('manage-room-mode').value||null,mapName:$('manage-room-map-label').hidden?null:$('manage-room-map').value||null,maxPlayers:Number($('manage-room-size').value),durationMinutes:Number($('manage-room-duration').value),description:$('manage-room-description').value||null,needsVoice:$('manage-room-voice').checked,locked:$('manage-room-locked').checked}});state=await api('/api/state');renderRoomList();result.textContent='✅ تم تحديث الموقع وDiscord فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}}

async function hostRoomAction(action){const id=$('manage-room-id').value;const result=$('room-manager-result');result.textContent='جارِ تنفيذ الإجراء...';try{await api(`/api/me/lfg/${id}/${action}`,{method:'POST'});state=await api('/api/state');renderRoomList();if(['complete','close'].includes(action))$('room-manager').hidden=true;result.textContent='✅ تم تنفيذ الإجراء.';}catch(error){result.textContent=`❌ ${error.message}`;}}

async function renderInterests(games) {
  const prefs = me ? await api('/api/me/lfg-preferences') : [];
  const map = new Map(prefs.map(pref=>[pref.game.slug,pref]));
  $('interest-games').innerHTML = games.map(game=>{const pref=map.get(game.slug);const interested=pref?.interestStatus==='INTERESTED';const sleeping=pref?.mutedUntil&&new Date(pref.mutedUntil)>new Date();const autoInvites=pref?.autoInvitesEnabled!==false;return `<article class="interest-card"><header><span>${escapeHtml(game.icon||'🎮')}</span><h3>${escapeHtml(game.name)}</h3></header><span class="platform-badge">${escapeHtml(gamePlatformsLabel(game))}</span>${sleeping?`<small class="snooze-status">😴 غفوة حتى ${new Date(pref.mutedUntil).toLocaleString('ar',{timeStyle:'short',dateStyle:'short'})}</small>`:''}<div class="interest-actions"><button class="${interested?'on':''}" data-interest="${game.slug}" data-interested="${interested}">❤️ ${interested?'إلغاء الاهتمام':'مهتم'}</button><button class="${pref?.notificationsEnabled?'on':''}" data-notify="${game.slug}">${pref?.notificationsEnabled?'🔔 إيقاف الإشعار':'🔕 تشغيل الإشعار'}</button></div><div class="interest-actions"><button class="${autoInvites?'on':''}" data-auto-invite="${game.slug}">🤖 ${autoInvites?'دعوات Zark مفعلة':'دعوات Zark متوقفة'}</button></div><div class="snooze-actions"><select data-snooze-select="${game.slug}"><option value="60">ساعة</option><option value="480">8 ساعات</option><option value="1440">يوم</option><option value="10080">أسبوع</option></select><button data-snooze="${game.slug}">😴 غفوة</button></div></article>`}).join('');
  document.querySelectorAll('[data-interest]').forEach(button=>button.onclick=()=>{const next=button.dataset.interested!=='true';setWebPreference(button.dataset.interest,next,next,button)});
  document.querySelectorAll('[data-notify]').forEach(button=>button.onclick=()=>setWebPreference(button.dataset.notify,true,!map.get(button.dataset.notify)?.notificationsEnabled,button));
  document.querySelectorAll('[data-auto-invite]').forEach(button=>button.onclick=()=>setWebPreference(button.dataset.autoInvite,true,Boolean(map.get(button.dataset.autoInvite)?.notificationsEnabled),button,!Boolean(map.get(button.dataset.autoInvite)?.autoInvitesEnabled)));
  document.querySelectorAll('[data-snooze]').forEach(button=>button.onclick=()=>snoozeWebPreference(button.dataset.snooze,Number(document.querySelector(`[data-snooze-select="${button.dataset.snooze}"]`).value),button));
}

async function setWebPreference(gameSlug,interested,notificationsEnabled,button,autoInvitesEnabled){if(!me){location.href='/auth/discord';return;}if(button?.disabled)return;if(button)button.disabled=true;try{await api(`/api/me/lfg-preferences/${gameSlug}`,{method:'PUT',body:{interested,notificationsEnabled,...(autoInvitesEnabled===undefined?{}:{autoInvitesEnabled})}});await renderInterests(state.lfgGames||[]);}catch(error){alert(error.message);if(button)button.disabled=false;}}
async function snoozeWebPreference(gameSlug,minutes,button){if(!me){location.href='/auth/discord';return;}if(button?.disabled)return;if(button)button.disabled=true;try{await api(`/api/me/lfg-preferences/${gameSlug}/snooze`,{method:'POST',body:{minutes}});await renderInterests(state.lfgGames||[]);}catch(error){alert(error.message);if(button)button.disabled=false;}}

function renderGames() {
  const games = state.zarkGames || [];
  const normalize = value => String(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').toLowerCase().trim();
  const query = normalize($('game-search')?.value || '');
  const category = $('game-category')?.value || 'all';
  if ($('game-category')) {
    const categories = [...new Set(games.map(game => game.category).filter(Boolean))];
    $('game-category').innerHTML = '<option value="all">كل التصنيفات</option>' + categories.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    $('game-category').value = categories.includes(category) ? category : 'all';
  }
  const favoritesOnly=$('game-favorites')?.getAttribute('aria-pressed')==='true';
  const filtered = games.filter(game => (!favoritesOnly||favoriteGames.has(game.slug)) && ($('game-category')?.value === 'all' || game.category === category) && normalize([game.name, game.description, game.slug, ...(game.aliases || [])].join(' ')).includes(query));
  filtered.sort((a,b)=>$('game-sort')?.value==='questions' ? (b.questionCount||0)-(a.questionCount||0) : a.name.localeCompare(b.name,'ar'));
  if($('catalog-total'))$('catalog-total').textContent=games.length;
  if($('catalog-questions'))$('catalog-questions').textContent=games.reduce((sum,game)=>sum+(Number(game.questionCount)||0),0).toLocaleString('ar');
  if($('catalog-categories'))$('catalog-categories').textContent=new Set(games.map(game=>game.category)).size;
  $('zark-games').innerHTML = filtered.map((game,index)=>`<article class="game-entry"><button type="button" class="game-save" data-save-game="${escapeHtml(game.slug)}" aria-label="حفظ ${escapeHtml(game.name)} في المفضلة" aria-pressed="${favoriteGames.has(game.slug)}">${favoriteGames.has(game.slug)?'★':'☆'}</button><button type="button" class="game-tile" data-tone="${index%4}" data-game="${escapeHtml(game.slug)}" aria-pressed="${$('race-command')?.dataset.game === game.slug}"><div class="game-cover"><span>${escapeHtml(game.icon||gameIcon(game.slug))}</span><small>${escapeHtml(game.category || 'تحدي جماعي')}</small></div><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description||'تحدٍ سريع داخل Discord')}</p><footer><span>${Number.isFinite(Number(game.questionCount)) && Number(game.questionCount)>0 ? `${Number(game.questionCount).toLocaleString('ar')} سؤال` : 'تحدٍ داخل Discord'}</span><span>اختر اللعبة ↖</span></footer></button></article>`).join('') || empty(games.length ? 'ما لقينا لعبة بهذه الفلاتر. جرّب بحثًا ثانيًا أو احفظ ألعابًا في المفضلة.' : 'لا توجد ألعاب متاحة حاليًا. ارجع قريبًا.');
  if ($('game-count')) $('game-count').textContent = `${filtered.length} لعبة متاحة`;
  if ($('game-search')) $('game-search').oninput = renderGames;
  if ($('game-sort')) $('game-sort').onchange = renderGames;
  if ($('game-favorites')) $('game-favorites').onclick = () => {$('game-favorites').setAttribute('aria-pressed',String(!favoritesOnly));renderGames();};
  if ($('game-category')) $('game-category').onchange = renderGames;
  if ($('game-reset')) $('game-reset').onclick = () => { $('game-search').value = ''; $('game-category').value = 'all'; $('game-favorites')?.setAttribute('aria-pressed','false');renderGames(); $('game-search').focus(); };
  document.querySelectorAll('.game-tile[data-game]').forEach(button=>button.onclick=()=>startRace(button.dataset.game));
  $('play-zark').disabled = !games.length;
  $('play-zark').onclick=()=>startRace();
  document.querySelectorAll('[data-save-game]').forEach(button=>button.onclick=()=>{
    const slug=button.dataset.saveGame;
    favoriteGames.has(slug)?favoriteGames.delete(slug):favoriteGames.add(slug);
    try{localStorage.setItem('zark-favorite-games',JSON.stringify([...favoriteGames]));}catch{}
    renderGames();
    document.querySelector(`[data-save-game="${CSS.escape(slug)}"]`)?.focus();
  });
  const linked=new URLSearchParams(location.search).get('game');
  if($('save-selected-game'))$('save-selected-game').textContent=favoriteGames.has($('race-command').dataset.game)?'★ محفوظة بالمفضلة':'☆ أضف للمفضلة';
  if(linked&&!$('race-command').dataset.game&&games.some(game=>game.slug===linked))startRace(linked);
}

async function startRace(gameSlug){
  const games = state.zarkGames || [];
  const game = gameSlug ? games.find(item=>item.slug===gameSlug) : games[Math.floor(Math.random()*games.length)];
  if (!game) return;
  $('race-title').textContent = `${game.icon || gameIcon(game.slug)} ${game.name}`;
  $('race-prompt').textContent = game.description || 'تحدٍ سريع داخل Discord';
  if($('race-details'))$('race-details').textContent=`${game.category||'تحدي'} · ${Math.round((game.durationMs||15000)/1000)} ثانية افتراضيًا · ${game.questionCount||0} سؤال`;
  $('race-note').textContent = 'انسخ الأمر وأرسله في قناة الألعاب داخل Discord لبدء الجولة واحتساب النقاط.';
  const command = game.aliases?.[0] ? `.${game.aliases[0]}` : '/play';
  $('race-command').textContent = command;
  $('race-command').dataset.game = game.slug;
  $('race-actions').hidden = false;
  if($('save-selected-game')){
    $('save-selected-game').textContent=favoriteGames.has(game.slug)?'★ محفوظة بالمفضلة':'☆ أضف للمفضلة';
    $('save-selected-game').onclick=()=>{favoriteGames.has(game.slug)?favoriteGames.delete(game.slug):favoriteGames.add(game.slug);try{localStorage.setItem('zark-favorite-games',JSON.stringify([...favoriteGames]));}catch{}renderGames();$('save-selected-game').textContent=favoriteGames.has(game.slug)?'★ محفوظة بالمفضلة':'☆ أضف للمفضلة';};
  }
  $('copy-game-command').textContent = 'نسخ الأمر';
  $('copy-game-command').onclick = async () => {
    try { await navigator.clipboard.writeText($('race-command').textContent); $('copy-game-command').textContent = 'تم النسخ ✓'; }
    catch { $('copy-game-command').textContent = 'حدد الأمر لنسخه يدويًا'; }
  };
  document.querySelectorAll('.game-tile').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.game === game.slug)));
  document.querySelector('.game-stage').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'center'});
}

function renderLoyaltyShop(loyalty){
  const next=loyalty.nextTier;
  const progress=next?Math.min(100,Math.round(loyalty.lifetimePoints/next.threshold*100)):100;
  const rewardState=reward=>{
    if(reward.owned)return 'مملوكة';
    if(reward.active&&reward.activeUntil)return `مفعلة حتى ${new Date(reward.activeUntil).toLocaleString('ar')}`;
    return reward.kind==='TIMED'?'يمكن شراؤها أكثر من مرة':'مكافأة دائمة';
  };
  const shop=(loyalty.shop||[]).map(reward=>`<article class="loyalty-reward ${reward.active||reward.owned?'is-active':''}">
    <div class="loyalty-reward-icon">${escapeHtml(reward.icon)}</div>
    <div class="loyalty-reward-copy"><h3>${escapeHtml(reward.name)}</h3><p>${escapeHtml(reward.description)}</p><small>${escapeHtml(rewardState(reward))}</small></div>
    <button class="button ${reward.owned?'ghost':'primary'} loyalty-buy" data-loyalty-reward="${escapeHtml(reward.key)}" ${(reward.owned||loyalty.points<reward.price)?'disabled':''}>${reward.owned?'تمت الملكية':`${reward.price.toLocaleString('ar')} نقطة`}</button>
  </article>`).join('');
  const recent=(loyalty.recent||[]).slice(0,8).map(item=>`<li><span>${item.amount>0?'+':''}${item.amount.toLocaleString('ar')} · ${escapeHtml(item.reason)}</span><time>${new Date(item.createdAt).toLocaleString('ar')}</time></li>`).join('');
  $('profile-loyalty').innerHTML=`<div class="loyalty-wallet"><div><span>رصيد المتجر</span><strong>${loyalty.points.toLocaleString('ar')}</strong><small>نقطة متاحة</small></div><div><span>رتبة الولاء</span><strong>${escapeHtml(loyalty.tier.name)}</strong><small>${next?`${loyalty.lifetimePoints.toLocaleString('ar')} / ${next.threshold.toLocaleString('ar')}`:'أعلى رتبة'}</small></div></div>
    <div class="loyalty-progress" aria-label="تقدم رتبة الولاء"><i style="width:${progress}%"></i></div>
    <div class="loyalty-shop-head"><div><span class="eyebrow">LOYALTY SHOP</span><h3>حوّل نقاطك إلى مزايا حقيقية</h3></div><span>${(loyalty.shop||[]).filter(item=>item.active||item.owned).length} مزايا مفعلة</span></div>
    <div class="loyalty-shop-grid">${shop}</div>
    <details class="loyalty-history"><summary>آخر حركات النقاط</summary><ul>${recent||'<li>لا توجد حركات بعد</li>'}</ul></details>`;
  document.querySelectorAll('.loyalty-buy').forEach(button=>button.onclick=async()=>{
    const result=$('loyalty-shop-result');
    button.disabled=true;result.textContent='جاري تفعيل المكافأة...';
    try{
      const updated=await api(`/api/me/loyalty/shop/${encodeURIComponent(button.dataset.loyaltyReward)}`,{method:'POST'});
      renderLoyaltyShop(updated);
      result.textContent='✅ تم شراء المكافأة وتفعيلها مباشرة.';
    }catch(error){result.textContent=`❌ ${error.message}`;button.disabled=false;}
  });
}

async function renderProfile(){
  if(!me)return;
  const [profileResult,availabilityResult,teamResult,loyaltyResult]=await Promise.allSettled([api('/api/me/profile'),api('/api/me/availability'),api('/api/me/team'),api('/api/me/loyalty')]);
  if(profileResult.status==='rejected')throw profileResult.reason;
  const data=profileResult.value,availability=availabilityResult.value,team=teamResult.value;
  $('profile-guest').hidden=true;$('profile-content').hidden=false;
  $('profile-name').textContent=data.displayName+(data.loyalty?.badge==='GOLD'?' 🏅':'');$('profile-level').textContent=`LV ${data.zark.level}`;$('profile-rating').textContent=data.lfg.rating.average?`${data.lfg.rating.average} ⭐ من ${data.lfg.rating.count} تقييم`:'لا يوجد تقييم بعد';$('profile-bio').textContent=data.settings.bio||'أضف نبذة قصيرة عن أسلوب لعبك.';
  $('profile-avatar').src=data.avatarUrl||'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23222"/%3E%3C/svg%3E';$('profile-head').style.setProperty('--profile-accent',data.settings.profileAccent);
  $('profile-stats').innerHTML=statCards([[data.zark.xp,'Zark XP'],[data.loyalty?.points||0,'نقاط الولاء'],[formatDuration(data.lfg.voiceSeconds),'وقت Voice'],[data.lfg.completedSessions,'جلسة مكتملة']]);
  if(loyaltyResult.status==='fulfilled')renderLoyaltyShop(loyaltyResult.value);
  else $('profile-loyalty').innerHTML=empty('تعذر تحميل متجر الولاء مؤقتاً. أعد تحميل الصفحة للمحاولة.');
  $('profile-zark-games').innerHTML=data.zark.games.length?data.zark.games.slice(0,8).map(game=>dataRow(game.name,`${game.xp} XP · ${game.wins}W`)).join(''):empty('لا توجد مباريات بعد');
  $('profile-favorites').innerHTML=data.lfg.favoriteGames.length?data.lfg.favoriteGames.map(game=>dataRow(`${game.icon||'🎮'} ${game.name}`,`${game.sessions} جلسة`)).join(''):empty('لا توجد جلسات بعد');
  $('profile-active-rooms').innerHTML=data.lfg.activeRooms.length?data.lfg.activeRooms.map(room=>dataRow(`${room.gameIcon||'🎮'} ${room.gameName}`,`${room.isHost?'Host · ':''}${room.status}`)).join(''):empty('لست داخل غرفة الآن');
  $('profile-interests').innerHTML=data.lfg.interests.length?data.lfg.interests.map(game=>`<span class="chip">${escapeHtml(game.icon||'🎮')} ${escapeHtml(game.name)} ${game.notificationsEnabled?'🔔':'🔕'}</span>`).join(''):empty('لم تحدد اهتماماتك بعد');
  $('profile-team').innerHTML=team?`<div class="profile-team-summary" style="--team-accent:${escapeHtml(team.accentColor)}"><b>${escapeHtml(team.name)}</b><span>${team.memberCount} عضو · ${formatValue(team.score)} نقطة</span><a href="/teams.html">فتح الفريق ←</a></div>`:'<div class="profile-team-summary empty-team"><b>لا يوجد فريق بعد</b><span>أنشئ فريقاً أو اقبل دعوة من لاعب.</span><a href="/teams.html">استكشف الفرق ←</a></div>';
  if(teamResult.status==='rejected')$('profile-team').innerHTML=empty('تعذر تحميل بيانات الفريق مؤقتاً.');
  $('profile-setting-bio').value=data.settings.bio||'';$('profile-setting-accent').value=data.settings.profileAccent;$('profile-setting-visible').checked=data.settings.activityVisible;$('profile-setting-rival').checked=data.settings.rivalNotificationsEnabled;
  $('profile-settings-form').onsubmit=async event=>{event.preventDefault();const result=$('profile-settings-result');result.textContent='جارِ الحفظ...';try{const saved=await api('/api/me/profile/settings',{method:'PUT',body:{bio:$('profile-setting-bio').value||null,profileAccent:$('profile-setting-accent').value,activityVisible:$('profile-setting-visible').checked,rivalNotificationsEnabled:$('profile-setting-rival').checked}});$('profile-head').style.setProperty('--profile-accent',saved.profileAccent);$('profile-bio').textContent=saved.bio||'أضف نبذة قصيرة عن أسلوب لعبك.';result.textContent='✅ تم حفظ ملفك وخصوصيتك.';}catch(error){result.textContent=`❌ ${error.message}`;}};
  if(!$('restart-product-tour'))$('profile-settings-form').insertAdjacentHTML('beforeend','<button id="restart-product-tour" class="button ghost" type="button">✨ إعادة تشغيل الجولة التعليمية</button>');
  $('restart-product-tour').onclick=()=>tutorialManager.restart();
  if(availabilityResult.status==='fulfilled')bindAvailability(availability);
  else{
    $('availability-result').textContent='تعذر تحميل جدولك. أعد تحميل الصفحة قبل تعديل الحالة أو الجدول.';
    document.querySelectorAll('#availability-form input, #availability-form select, #availability-form button, [data-availability-quick]').forEach(control=>control.disabled=true);
  }
}

function bindAvailability(availability){
  const days=[{id:6,name:'السبت'},{id:0,name:'الأحد'},{id:1,name:'الاثنين'},{id:2,name:'الثلاثاء'},{id:3,name:'الأربعاء'},{id:4,name:'الخميس'},{id:5,name:'الجمعة'}];
  $('availability-activity').value=availability.currentActivity;$('availability-mentions').value=availability.mentionPolicy;$('availability-note').value=availability.activityNote||'';$('availability-until').value=availability.activityUntil?localDateTime(availability.activityUntil):'';
  $('availability-timezone').value=availability.timezoneConfigured?availability.timezone:(Intl.DateTimeFormat().resolvedOptions().timeZone||availability.timezone||'Asia/Jerusalem');
  const snapshot=availability.snapshot;$('availability-current').textContent=`الحالة الآن: ${availabilityText(snapshot?.activity||availability.currentActivity)}${snapshot?.activeNow?' · نشط الآن':snapshot?.lastActiveAt?` · آخر نشاط ${relativeTime(snapshot.lastActiveAt)}`:''}${snapshot?.nextFree&&snapshot.activity!=='FREE'?` · الفراغ القادم ${relativeTime(snapshot.nextFree.startsAt)}`:''}`;
  const privacy=availability.privacy||{};$('privacy-current').checked=privacy.showCurrentStatus!==false;$('privacy-mention').checked=privacy.mentionStatusEnabled!==false;$('privacy-last-active').checked=privacy.showLastActive!==false;$('privacy-free').checked=privacy.showFreeTime!==false;$('privacy-study').checked=Boolean(privacy.showStudyTime);$('privacy-sleep').checked=Boolean(privacy.showSleepTime);
  const dnd=availability.doNotDisturb||{};$('dnd-sleep').checked=dnd.sleep!==false;$('dnd-study').checked=dnd.study!==false;$('dnd-busy').checked=Boolean(dnd.busy);
  document.querySelectorAll('[data-availability-quick]').forEach(button=>button.onclick=async()=>{const[activity,minutesText]=button.dataset.availabilityQuick.split(':'),minutes=Number(minutesText);const result=$('availability-result');result.textContent='جارِ تحديث حالتك...';try{const saved=await api('/api/me/availability',{method:'PUT',body:{currentActivity:activity,activityUntil:minutes?new Date(Date.now()+minutes*60_000).toISOString():null,activityNote:null,mentionPolicy:availability.mentionPolicy}});bindAvailability(saved);result.textContent='✅ تم تحديث حالتك فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}});
  const slots=availability.weeklyAvailability||[];
  $('weekly-availability').innerHTML=days.map(day=>`<section class="schedule-day" data-schedule-day="${day.id}"><header><b>${day.name}</b><button type="button" data-add-period="${day.id}">＋ إضافة فترة</button></header><div class="schedule-periods">${slots.filter(slot=>slot.dayOfWeek===day.id).map(schedulePeriodRow).join('')||'<p class="schedule-empty">لا توجد فترات</p>'}</div></section>`).join('');
  document.querySelectorAll('[data-add-period]').forEach(button=>button.onclick=()=>{const list=button.closest('.schedule-day').querySelector('.schedule-periods');list.querySelector('.schedule-empty')?.remove();list.insertAdjacentHTML('beforeend',schedulePeriodRow({startMinute:900,endMinute:1080,activity:'FREE'}));bindPeriodRemoveButtons();});bindPeriodRemoveButtons();
  $('availability-form').onsubmit=async event=>{event.preventDefault();const result=$('availability-result');result.textContent='جارِ حفظ جدولك وحالتك...';const weeklyAvailability=[...document.querySelectorAll('[data-schedule-period]')].map(row=>({dayOfWeek:Number(row.closest('[data-schedule-day]').dataset.scheduleDay),startMinute:timeToMinutes(row.querySelector('[data-period-start]').value),endMinute:timeToMinutes(row.querySelector('[data-period-end]').value),activity:row.querySelector('[data-period-activity]').value}));try{const until=$('availability-until').value;const saved=await api('/api/me/availability',{method:'PUT',body:{currentActivity:$('availability-activity').value,activityUntil:until?new Date(until).toISOString():null,activityNote:$('availability-note').value||null,mentionPolicy:$('availability-mentions').value,timezone:$('availability-timezone').value.trim(),weeklyAvailability,privacy:{showCurrentStatus:$('privacy-current').checked,mentionStatusEnabled:$('privacy-mention').checked,showLastActive:$('privacy-last-active').checked,showFreeTime:$('privacy-free').checked,showStudyTime:$('privacy-study').checked,showSleepTime:$('privacy-sleep').checked},doNotDisturb:{sleep:$('dnd-sleep').checked,study:$('dnd-study').checked,busy:$('dnd-busy').checked}}});bindAvailability(saved);result.textContent='✅ تم حفظ الحالة والجدول والخصوصية.';}catch(error){result.textContent=`❌ ${error.message}`;}};
}

function schedulePeriodRow(slot){return `<div class="schedule-period" data-schedule-period><select data-period-activity aria-label="نوع الفترة"><option value="FREE" ${slot.activity==='FREE'?'selected':''}>🟢 فراغ</option><option value="STUDYING" ${slot.activity==='STUDYING'?'selected':''}>📚 دراسة</option><option value="SLEEPING" ${slot.activity==='SLEEPING'?'selected':''}>😴 نوم</option><option value="BUSY" ${slot.activity==='BUSY'?'selected':''}>🔴 مشغول</option><option value="PLAYING" ${slot.activity==='PLAYING'?'selected':''}>🎮 لعب</option></select><input data-period-start type="time" value="${minutesToTime(slot.startMinute)}" aria-label="من"><span>←</span><input data-period-end type="time" value="${minutesToTime(slot.endMinute)}" aria-label="إلى"><button type="button" data-remove-period aria-label="حذف الفترة">×</button></div>`}
function bindPeriodRemoveButtons(){document.querySelectorAll('[data-remove-period]').forEach(button=>button.onclick=()=>{const list=button.closest('.schedule-periods');button.closest('[data-schedule-period]').remove();if(!list.children.length)list.innerHTML='<p class="schedule-empty">لا توجد فترات</p>';})}
function relativeTime(value){const minutes=Math.round((new Date(value).getTime()-Date.now())/60000);if(Math.abs(minutes)<1)return'الآن';const formatter=new Intl.RelativeTimeFormat('ar',{numeric:'auto'});return Math.abs(minutes)<60?formatter.format(minutes,'minute'):formatter.format(Math.round(minutes/60),'hour')}
function channelIdList(value){return [...new Set(String(value||'').split(/[\s,]+/).map(item=>item.trim()).filter(item=>/^\d{17,20}$/.test(item)))]}

let teamSearchVersion=0;
async function renderTeamList(){
  const version=++teamSearchVersion;
  const query=$('team-search')?.value.trim()||'';
  try{
    const teams=await api(`/api/teams${query?`?search=${encodeURIComponent(query)}`:''}`);
    if(version!==teamSearchVersion)return;
    $('team-list').innerHTML=teams.length?teams.map((team,index)=>teamCard(team,index+1)).join(''):empty('لا توجد فرق مطابقة. أنشئ أول فريق في Zark.');
  }catch(error){
    if(version===teamSearchVersion)$('team-list').innerHTML=empty(`تعذر تحميل الفرق: ${error.message}`);
  }
}
async function renderTeams(){
  const [,myTeam,invites]=await Promise.all([renderTeamList(),me?api('/api/me/team'):null,me?api('/api/me/team-invites'):[]]);
  const account=$('team-account');
  if(!me){account.innerHTML='<div class="auth-gate compact"><span>👥</span><h2>ادخل إلى مجتمع الفرق</h2><p>سجّل بحساب Discord لإنشاء فريق أو قبول دعوة.</p><a class="button primary" href="/auth/discord">دخول Discord</a></div>';}
  else if(myTeam){account.innerHTML=teamDashboard(myTeam);bindTeamDashboard(myTeam);}
  else{
    account.innerHTML=`<div class="team-start"><div><span class="eyebrow">YOUR SQUAD</span><h2>أنشئ فريقك الأول</h2><p>يمكنك الانضمام إلى فريق واحد، وتصل الدعوة لمدة 7 أيام.</p></div><form id="team-create-form"><label>اسم الفريق<input id="team-name" minlength="2" maxlength="32" required placeholder="مثال: Zark Legends"></label><label>وصف مختصر<input id="team-description" maxlength="240" placeholder="الألعاب وأسلوب الفريق"></label><label>لون الفريق<input id="team-accent" type="color" value="#e50914"></label><button class="button primary" type="submit">إنشاء الفريق</button></form></div>${invites.length?`<div class="team-invites"><h3>دعواتك</h3>${invites.map(teamInviteCard).join('')}</div>`:''}<p id="team-action-result" class="form-result" aria-live="polite"></p>`;
    $('team-create-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api('/api/me/teams',{method:'POST',body:{name:$('team-name').value,description:$('team-description').value||undefined,accentColor:$('team-accent').value}});showToast('تم إنشاء الفريق','أصبحت مالك الفريق ويمكنك دعوة اللاعبين.','success');await renderTeams();}catch(error){$('team-action-result').textContent=`❌ ${error.message}`;button.disabled=false;}};
    document.querySelectorAll('[data-team-invite-response]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/me/team-invites/${button.dataset.inviteId}/respond`,{method:'POST',body:{accept:button.dataset.teamInviteResponse==='accept'}});await renderTeams();}catch(error){$('team-action-result').textContent=`❌ ${error.message}`;button.disabled=false;}});
  }
  if($('team-search')&&!$('team-search').dataset.bound){$('team-search').dataset.bound='true';let timer;$('team-search').oninput=()=>{++teamSearchVersion;clearTimeout(timer);timer=setTimeout(renderTeamList,280)}}
}

function teamCard(team,rank){return `<article class="team-card" style="--team-accent:${escapeHtml(team.accentColor)}"><header><span class="team-rank">#${rank}</span>${team.logoUrl?`<img src="${escapeHtml(team.logoUrl)}" alt="">`:`<i>${escapeHtml(team.name.slice(0,2).toUpperCase())}</i>`}<div><h3>${escapeHtml(team.name)}</h3><small>بقيادة ${escapeHtml(team.owner.displayName)}</small></div></header><p>${escapeHtml(team.description||'فريق جديد يستعد للمنافسة في Zark.')}</p><div class="team-numbers"><span><b>${formatValue(team.memberCount)}</b> عضو</span><span><b>${formatValue(team.totals.wins)}</b> فوز</span><span><b>${formatValue(team.totals.sessions)}</b> جلسة</span><span><b>${formatValue(team.score)}</b> نقطة فريق</span></div><footer>${team.members.slice(0,5).map(member=>avatar(member.avatarUrl,member.displayName,'mini')).join('')}<span>${team.memberCount}/${team.maxMembers}</span></footer></article>`}
function teamInviteCard(invite){return `<article class="team-invite"><div><b>${escapeHtml(invite.team.name)}</b><small>دعوة من ${escapeHtml(invite.inviter.displayName)} · تنتهي ${relativeTime(invite.expiresAt)}</small></div><button class="button primary small" data-team-invite-response="accept" data-invite-id="${invite.id}">قبول</button><button class="button ghost small" data-team-invite-response="decline" data-invite-id="${invite.id}">رفض</button></article>`}
function teamDashboard(team){const canManage=['OWNER','CAPTAIN'].includes(team.myRole);return `<div class="team-dashboard" style="--team-accent:${escapeHtml(team.accentColor)}"><header><div class="team-logo">${team.logoUrl?`<img src="${escapeHtml(team.logoUrl)}" alt="">`:escapeHtml(team.name.slice(0,2).toUpperCase())}</div><div><span class="eyebrow">MY TEAM · ${escapeHtml(team.myRole)}</span><h2>${escapeHtml(team.name)}</h2><p>${escapeHtml(team.description||'فريقك جاهز للمنافسة.')}</p></div><strong>${formatValue(team.score)}<small>نقطة فريق</small></strong></header>${canManage?`<form id="team-invite-form" class="team-invite-form"><label>Discord ID للاعب<input id="team-invite-user" inputmode="numeric" pattern="[0-9]{17,20}" maxlength="20" required placeholder="123456789012345678"></label><button class="button primary" type="submit">إرسال دعوة</button></form>`:''}<div class="team-member-list">${team.members.map(member=>`<article>${avatar(member.avatarUrl,member.displayName,'mini')}<div><b>${escapeHtml(member.displayName)}</b><small>${teamRole(member.role)} · ${member.xp} XP · ${member.completedSessions} جلسة</small></div>${team.myRole==='OWNER'&&member.role!=='OWNER'?`<button class="button ghost small" data-team-role="${member.id}" data-next-role="${member.role==='CAPTAIN'?'MEMBER':'CAPTAIN'}">${member.role==='CAPTAIN'?'إلغاء القيادة':'تعيين قائد'}</button>`:''}${canManage&&member.role==='MEMBER'&&member.id!==me.userId?`<button class="button danger small" data-team-remove="${member.id}">إزالة</button>`:''}</article>`).join('')}</div><footer>${team.myRole==='OWNER'?'<button id="team-delete" class="button danger" type="button">حذف الفريق</button>':'<button id="team-leave" class="button danger" type="button">مغادرة الفريق</button>'}<a class="button ghost" href="/lfg.html">ابحث عن غرفة للفريق</a></footer><p id="team-action-result" class="form-result" aria-live="polite"></p></div>`}
function teamRole(role){return role==='OWNER'?'المالك':role==='CAPTAIN'?'قائد':'عضو'}
function bindTeamDashboard(team){
  if($('team-invite-form'))$('team-invite-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await api(`/api/me/teams/${team.id}/invites`,{method:'POST',body:{userId:$('team-invite-user').value.trim()}});$('team-action-result').textContent='✅ تم إرسال الدعوة لمدة 7 أيام.';event.target.reset();}catch(error){$('team-action-result').textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
  document.querySelectorAll('[data-team-role]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/me/teams/${team.id}/members/${button.dataset.teamRole}`,{method:'PATCH',body:{role:button.dataset.nextRole}});await renderTeams();}catch(error){$('team-action-result').textContent=`❌ ${error.message}`;button.disabled=false;}});
  document.querySelectorAll('[data-team-remove]').forEach(button=>button.onclick=async()=>{if(!confirm('إزالة هذا اللاعب من الفريق؟'))return;button.disabled=true;try{await api(`/api/me/teams/${team.id}/members/${button.dataset.teamRemove}`,{method:'DELETE'});await renderTeams();}catch(error){$('team-action-result').textContent=`❌ ${error.message}`;button.disabled=false;}});
  if($('team-leave'))$('team-leave').onclick=()=>runTeamAction($('team-leave'),'مغادرة الفريق؟','/api/me/team/leave','POST');
  if($('team-delete'))$('team-delete').onclick=()=>runTeamAction($('team-delete'),`حذف فريق ${team.name} نهائياً؟`,`/api/me/teams/${team.id}`,'DELETE');
}
async function runTeamAction(button,message,path,method){
  if(button.disabled||!confirm(message))return;
  button.disabled=true;
  try{await api(path,{method});await renderTeams();}
  catch(error){$('team-action-result').textContent=`❌ ${error.message}`;}
  finally{button.disabled=false;}
}

async function renderLeaderboard(board){document.querySelectorAll('[data-board]').forEach(button=>{button.classList.toggle('active',button.dataset.board===board);button.onclick=()=>renderLeaderboard(button.dataset.board)});let rows,key,label;if(board==='game'||board==='engagement'){rows=await api(`/api/leaderboard?period=all&metric=${board}`);key=board==='game'?'gamePoints':'engagementPoints';label=board==='game'?'XP':'نقطة';}else{rows=await api(`/api/lfg/top?metric=${board}`);key=board==='sessions'?'completedSessions':'rating';label=board==='sessions'?'جلسة':'⭐';}const top=rows.slice(0,3);$('podium').innerHTML=[top[1],top[0],top[2]].map((row,index)=>row?`<article class="podium-card ${index===1?'first':''}">${avatar(row.avatarUrl,row.displayName,'podium')}<span>${index===1?'🥇':index===0?'🥈':'🥉'}</span><b>${escapeHtml(row.displayName)}</b><small>${formatValue(row[key])} ${label}</small></article>`:'').join('');$('full-leaderboard').innerHTML=rankingRows(rows,key,label);}

async function renderReports(){
  if(!me){['support-chat-form','bug-form','player-report-form'].forEach(id=>$(id).innerHTML='<div class="auth-gate compact"><p>سجّل عبر Discord لاستخدام الدعم.</p><a class="button primary" href="/auth/discord">تسجيل الدخول</a></div>');return;}
  const support=await api('/api/me/support/status');
  $('support-ai-status').textContent=supportTokenLabel(support);
  $('support-ai-clear').onclick=()=>{if(!confirm('حذف محادثة مساعد Zark من هذه الصفحة؟'))return;$('support-chat-log').innerHTML='<article class="chat-message assistant">تم مسح المحادثة. كيف أقدر أساعدك الآن؟</article>';$('support-suggestions').innerHTML='';};
  $('support-chat-form').onsubmit=async event=>{event.preventDefault();const input=$('support-chat-input');const message=input.value.trim();if(!message)return;appendChat(message,'user');input.value='';input.disabled=true;try{const reply=await api('/api/me/support/chat',{method:'POST',body:{message}});appendChat(reply.answer,'assistant');$('support-ai-status').textContent=supportTokenLabel(reply);$('support-suggestions').innerHTML=(reply.suggestions||[]).map(item=>`<button data-support-room="${item.roomId}">${escapeHtml(item.label)}</button>`).join('');document.querySelectorAll('[data-support-room]').forEach(button=>button.onclick=()=>location.href=`/lfg.html?room=${button.dataset.supportRoom}`);}catch(error){appendChat(error.message,'assistant error');}finally{input.disabled=false;input.focus();}};
  $('bug-form').onsubmit=async event=>{event.preventDefault();const result=$('bug-result');result.textContent='جارِ فتح التذكرة...';try{const report=await api('/api/me/reports/bug',{method:'POST',body:{title:$('bug-title').value,description:$('bug-description').value,context:'Website'}});event.target.reset();result.textContent='✅ تم فتح تذكرة الخطأ وإرسالها للإدارة.';await loadMyReports();await openMyReport('BUG',report.id);}catch(error){result.textContent=`❌ ${error.message}`;}};
  $('player-report-form').onsubmit=async event=>{event.preventDefault();const result=$('report-result');result.textContent='جارِ فتح التذكرة...';try{const report=await api('/api/me/reports/player',{method:'POST',body:{reportedId:$('reported-id').value,roomId:$('reported-room').value||undefined,reason:$('reported-reason').value,description:$('reported-description').value||undefined}});event.target.reset();result.textContent='✅ تم فتح البلاغ بسرية وإرسال تنبيه للإدارة.';await loadMyReports();await openMyReport('PLAYER',report.id);}catch(error){result.textContent=`❌ ${error.message}`;}};
  await loadMyReports();
  bindReportPresenceLifecycle();
  const query=new URLSearchParams(location.search),kind=query.get('reportKind'),id=query.get('reportId');
  if((kind==='PLAYER'||kind==='BUG')&&id)await openMyReport(kind,id).catch(()=>undefined);
}

async function loadMyReports(){
  const reports=await api('/api/me/reports');
  const items=[...reports.playerReports.map(report=>({kind:'PLAYER',id:report.id,title:`بلاغ لاعب: ${report.reason}`,subtitle:report.reported?.displayName?`ضد ${report.reported.displayName}`:'بلاغ لاعب',status:report.status,date:report.updatedAt||report.createdAt,messages:report._count?.messages||0})),...reports.bugReports.map(report=>({kind:'BUG',id:report.id,title:`خطأ: ${report.title}`,subtitle:'تقرير تقني',status:report.status,date:report.updatedAt||report.createdAt,messages:report._count?.messages||0}))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('my-reports').innerHTML=items.length?items.map(report=>ticketListItem(report,'my')).join(''):empty('لا توجد بلاغات سابقة.');
  if(activeUserTicket&&!items.some(item=>item.kind===activeUserTicket.kind&&item.id===activeUserTicket.id)){activeUserTicket=undefined;clearInterval(reportPresenceTimer);$('my-report-thread').hidden=true;history.replaceState(null,'',location.pathname);}
  document.querySelectorAll('[data-my-ticket]').forEach(button=>button.onclick=()=>openMyReport(button.dataset.kind,button.dataset.myTicket));
}

async function openMyReport(kind,id){
  if(activeUserTicket&&(activeUserTicket.kind!==kind||activeUserTicket.id!==id))await setMyReportPresence(false,activeUserTicket);
  const thread=await api(`/api/me/reports/${kind}/${id}`);activeUserTicket={kind,id};renderTicketThread(thread,'my');
  history.replaceState(null,'',`${location.pathname}?reportKind=${kind}&reportId=${encodeURIComponent(id)}`);
  await setMyReportPresence(true);
  clearInterval(reportPresenceTimer);reportPresenceTimer=setInterval(()=>{if(activeUserTicket&&document.visibilityState==='visible')setMyReportPresence(true).catch(()=>undefined);},25000);
  const closed=kind==='PLAYER'?['RESOLVED','REJECTED','DISMISSED'].includes(thread.status):['RESOLVED','CLOSED'].includes(thread.status);
  $('my-report-reply').hidden=closed;$('my-report-result').textContent=closed?'هذه التذكرة مغلقة.':'';
  $('my-report-reply').onsubmit=async event=>{event.preventDefault();const input=$('my-report-message'),result=$('my-report-result');result.textContent='جارِ إرسال الرسالة...';try{const updated=await api(`/api/me/reports/${kind}/${id}/messages`,{method:'POST',body:{message:input.value}});input.value='';renderTicketThread(updated,'my');result.textContent='✅ وصلت رسالتك إلى الإدارة.';await loadMyReports();}catch(error){result.textContent=`❌ ${error.message}`;}};
}

function appendChat(message,type){const article=document.createElement('article');article.className=`chat-message ${type}`;article.textContent=message;$('support-chat-log').appendChild(article);$('support-chat-log').scrollTop=$('support-chat-log').scrollHeight;}

async function bindFloatingSupport(){
  const panel=$('zark-ai-panel'),fab=$('zark-ai-fab'),close=$('zark-ai-close'),clear=$('floating-ai-clear'),form=$('floating-ai-form'),input=$('floating-ai-input'),log=$('floating-ai-log'),status=$('floating-ai-status');
  fab.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus()};close.onclick=()=>panel.hidden=true;
  clear.onclick=()=>{if(!confirm('حذف محادثة مساعد Zark؟'))return;log.innerHTML=`<article class="chat-message assistant">تم مسح المحادثة. كيف أقدر أساعدك يا ${escapeHtml(me.displayName)}؟</article>`;};
  try{const support=await api('/api/me/support/status');status.textContent=supportTokenLabel(support);}catch{status.textContent='الدعم متاح';}
  form.onsubmit=async event=>{event.preventDefault();const message=input.value.trim();if(!message)return;floatingChatMessage(log,message,'user');input.value='';input.disabled=true;try{const reply=await api('/api/me/support/chat',{method:'POST',body:{message}});floatingChatMessage(log,reply.answer,'assistant');if(reply.action?.type==='LFG_CREATED')floatingChatAction(log,`فتح غرفة ${reply.action.gameSlug}`,`/lfg.html?room=${encodeURIComponent(reply.action.roomId)}`);if(reply.action?.type==='REPORT_CREATED')floatingChatAction(log,'فتح التذكرة',`/reports.html?reportKind=${reply.action.reportKind}&reportId=${encodeURIComponent(reply.action.reportId)}`);status.textContent=supportTokenLabel(reply);}catch(error){floatingChatMessage(log,error.message,'assistant error');}finally{input.disabled=false;input.focus();}};
}
function floatingChatMessage(log,message,type){const article=document.createElement('article');article.className=`chat-message ${type}`;article.textContent=message;log.appendChild(article);log.scrollTop=log.scrollHeight;}
function floatingChatAction(log,label,href){const link=document.createElement('a');link.className='chat-action';link.textContent=`⚡ ${label}`;link.href=href;log.appendChild(link);log.scrollTop=log.scrollHeight;}

async function bindAdmin(){
  const gate=$('admin-gate');
  const content=$('admin-content');
  if(!me){gate.innerHTML='<span>🔐</span><h1>سجّل الدخول أولًا</h1><p>استخدم حساب Discord المرتبط بسيرفر Zark.</p><a class="button primary" href="/auth/discord">دخول Discord</a>';return;}
  if(!me.isAdmin){gate.innerHTML='<span>⛔</span><h1>لا تملك صلاحية الإدارة</h1><p>هذه اللوحة تظهر فقط لأعضاء رتب إدارة Zark المعتمدة.</p><a class="button ghost" href="/">العودة للرئيسية</a>';return;}
  try{
    const [dashboard,smartRooms,smartHistory,audit]=await Promise.all([api('/api/web-admin/dashboard'),api('/api/web-admin/smart-rooms'),api('/api/web-admin/smart-rooms/history'),api('/api/web-admin/audit')]);
    gate.hidden=true;content.hidden=false;
    const stats=dashboard.stats;
    $('admin-stats').innerHTML=statCards([[stats.users,'مستخدم'],[stats.openRooms,'غرفة مفتوحة'],[stats.completedRooms,'جلسة مكتملة'],[stats.pendingReports+stats.openBugs,'بلاغ يحتاج مراجعة'],[stats.failedDeliveries||0,'DM فاشلة / 24س']]);
    $('admin-system-status').textContent=dashboard.system.botOnline?'● البوت Online':'● البوت Offline';$('admin-system-status').classList.toggle('offline',!dashboard.system.botOnline);
    $('admin-service-grid').innerHTML=[['API',dashboard.system.apiOnline,'متصل'],['PostgreSQL',dashboard.system.databaseOnline,'متصل'],['Discord Bot',dashboard.system.botOnline,'متصل'],['Redis',dashboard.system.realtime?.redisOnline,dashboard.system.realtime?.redisOnline?'التحديث المباشر جاهز':'غير متصل أو غير مهيأ'],[dashboard.system.aiProvider||'AI مجاني',dashboard.system.aiConfigured,dashboard.system.aiConfigured?'تحويل تلقائي مفعّل':'أضف مفتاح Gemini أو Groq أو OpenRouter']].map(([name,online,label])=>`<article><span class="service-dot ${online?'online':'offline'}"></span><b>${name}</b><small>${online?label:label||'غير متصل'}</small></article>`).join('');
    $('admin-audit-log').innerHTML=audit.length?audit.map(item=>`<article class="admin-room"><div><b>${escapeHtml(auditActionLabel(item.action))}</b><small>بواسطة: ${escapeHtml(item.adminName)} · ${new Date(item.createdAt).toLocaleString('ar')}</small>${item.targetId?`<small>${escapeHtml(auditTargetLabel(item.action))}: ${escapeHtml(item.targetId)}</small>`:''}</div><span class="trade-code">${escapeHtml(item.id.slice(-6).toUpperCase())}</span></article>`).join(''):empty('لا توجد عمليات مسجلة بعد.');
    const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const recommendations=smartRooms.recommendations.map(item=>`<article class="admin-room"><div><b>${escapeHtml(item.gameIcon||'🎮')} ${escapeHtml(item.gameName)}</b><small>${item.availableNowCount} متفرغ الآن · ${item.interestedCount} مهتم · حد الإنشاء ${item.autoMinAvailable} · ${item.interestPercent}%</small></div><span class="live-chip ${item.availableNowCount>=item.autoMinAvailable?'':'offline'}">${item.availableNowCount>=item.autoMinAvailable?'جاهزة للتجمع':'بانتظار لاعبين'}</span></article>`).join('');
    const peaks=smartRooms.peakTimes.map(slot=>`<span class="chip">🕒 ${days[slot.dayOfWeek]} ${String(slot.hour).padStart(2,'0')}:00 · ${slot.players} متفرغ</span>`).join('');
    $('admin-smart-rooms').innerHTML=`${recommendations||empty('لا توجد اهتمامات كافية بعد.')}<div class="room-players">${peaks||'<span class="subtle">لا توجد جداول فراغ محفوظة بعد.</span>'}</div>`;
    $('admin-smart-history').innerHTML=smartHistory.length?smartHistory.map(room=>`<article class="admin-room"><div><b>${escapeHtml(room.gameIcon||'🎮')} ${escapeHtml(room.gameName)}</b><small>${escapeHtml(room.description||'تجمع تلقائي')} · ${new Date(room.createdAt).toLocaleString('ar')}</small><div class="room-players"><span class="chip">📨 ${room.invited} دعوة</span><span class="chip">✅ ${room.sent} وصلت</span><span class="chip">🙈 ${room.ignored} تجاهل</span></div></div><span class="live-chip">${escapeHtml(room.status)}</span></article>`).join(''):empty('لم ينشئ Zark تجمعات تلقائية بعد.');
    $('admin-active-rooms').innerHTML=dashboard.activeRooms.length?dashboard.activeRooms.map(room=>`<article class="admin-room"><div><b>${escapeHtml(room.gameIcon||'🎮')} ${escapeHtml(room.gameName)}</b><small class="host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')} ${escapeHtml(room.hostName)} · ${room.currentPlayers}/${room.maxPlayers} · ${escapeHtml(room.status)}</small><div class="room-players">${room.members.map(member=>`<span class="room-player">${avatar(member.avatarUrl,member.displayName,'mini')}${escapeHtml(member.displayName)}</span>`).join('')}</div></div><button class="button danger small" data-admin-close-room="${room.id}">إغلاق</button></article>`).join(''):empty('لا توجد غرف نشطة الآن.');
    document.querySelectorAll('[data-admin-close-room]').forEach(button=>button.onclick=async()=>{if(!confirm('إغلاق هذه الغرفة؟'))return;await api(`/api/web-admin/lfg/${button.dataset.adminCloseRoom}/close`,{method:'POST'});await bindAdmin();});
    fillAdminSettings(dashboard.settings);
    bindAdminTabs();
    await loadAdminZarkContent();
    await loadAdminReports();
    await loadAdminTradeModeration();
    await loadAdminTeams();
    await loadAdminBroadcasts();
    const query=new URLSearchParams(location.search),kind=query.get('reportKind'),id=query.get('reportId');
    if((kind==='PLAYER'||kind==='BUG')&&id){showAdminTab('reports');await openAdminReport(kind,id).catch(()=>undefined);}
  }catch(error){gate.innerHTML=`<span>⛔</span><h1>تعذر فتح اللوحة</h1><p>${escapeHtml(error.message)}</p>`;return;}

  $('admin-settings-form').onsubmit=async event=>{
    event.preventDefault();
    const body={
      botName:$('setting-bot-name').value.trim(),tagline:$('setting-tagline').value.trim(),
      lfgChannelId:channelValue('setting-lfg-channel'),lfgCategoryId:channelValue('setting-lfg-category'),publicChannelId:channelValue('setting-public-channel'),dailyChannelId:channelValue('setting-daily-channel'),leaderboardChannelId:channelValue('setting-leaderboard-channel'),reportChannelId:channelValue('setting-report-channel'),websiteUrl:$('setting-website-url').value.trim(),
      dmNotificationsEnabled:$('setting-dm-enabled').checked,quickMatchEnabled:$('setting-quick-match').checked,autoSmartRoomsEnabled:$('setting-auto-smart-rooms').checked,autoRoomIntervalMinutes:Number($('setting-auto-room-interval').value),autoRoomMinimumInterested:Number($('setting-auto-room-minimum').value),autoRoomLifetimeMinutes:Number($('setting-auto-room-lifetime').value),maxAutoRoomsPerGame:Number($('setting-auto-room-max').value),autoRoomDmInterestedUsers:$('setting-auto-room-dm').checked,deleteExpiredAutoRooms:$('setting-auto-room-delete').checked,voiceEmptyGraceMinutes:Number($('setting-voice-empty-grace').value),singlePlayerIdleMinutes:Number($('setting-single-player-idle').value),waitingSessionTimeoutMinutes:Number($('setting-auto-room-lifetime').value),ratingsEnabled:$('setting-ratings').checked,reportsEnabled:$('setting-reports').checked,autoCreateRoomChannels:$('setting-auto-channels').checked,aiChatEnabled:$('setting-ai-enabled').checked,
      autoMentionStatusEnabled:$('setting-mention-status').checked,mentionStatusCooldownMinutes:Number($('setting-mention-cooldown').value),activityActiveMinutes:Number($('setting-active-minutes').value),mentionStatusChannelIds:channelIdList($('setting-mention-channels').value),mentionStatusExcludedIds:channelIdList($('setting-mention-excluded').value),activityTrackingEnabled:$('setting-activity-tracking').checked,availabilityLfgIntegration:$('setting-availability-lfg').checked,
      maxDmPerDay:Number($('setting-dm-limit').value),notificationCooldownMinutes:Number($('setting-dm-cooldown').value),maxActiveRoomsPerUser:Number($('setting-room-limit').value),defaultRoomDurationMinutes:Number($('setting-room-duration').value),roomGraceMinutes:Number($('setting-room-grace').value),aiDailyMessagesPerUser:Number($('setting-ai-message-limit').value),aiGlobalDailyMessages:Number($('setting-ai-global-message-limit').value),aiDailyTokenBudgetPerUser:Number($('setting-ai-user-limit').value),aiGlobalDailyTokenBudget:Number($('setting-ai-global-limit').value),aiMaxOutputTokens:Number($('setting-ai-output').value),
    };
    const result=$('admin-settings-result');result.textContent='جارِ تطبيق الإعدادات...';
    try{const saved=await api('/api/web-admin/settings',{method:'PUT',body});fillAdminSettings(saved);result.textContent='✅ تم الحفظ والتطبيق على البوت فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}
  };
  $('admin-ai-test').onclick=async()=>{const button=$('admin-ai-test'),result=$('admin-ai-test-result');button.disabled=true;result.textContent='جارِ فحص مزودي AI المجانيين...';try{const status=await api('/api/web-admin/ai/diagnostics',{method:'POST'});result.textContent=status.message;}catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
  $('admin-loyalty-event').onclick=async()=>{const button=$('admin-loyalty-event'),result=$('admin-loyalty-event-result');button.disabled=true;result.textContent='جارِ تشغيل الفعالية...';try{const event=await api('/api/web-admin/loyalty/boost',{method:'POST',body:{minutes:60}});result.textContent=`✅ ×${event.multiplier} حتى ${new Date(event.until).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`;}catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
  bindAdminBroadcastForm();
  $('admin-lfg-form').onsubmit=async event=>{event.preventDefault();const threshold=$('admin-game-auto-min').value;const platforms=[...document.querySelectorAll('[data-admin-game-platform]:checked')].map(input=>input.value);if(!platforms.length){$('admin-game-result').textContent='❌ اختر جهازًا واحدًا على الأقل.';return;}await submitForm(`/api/web-admin/lfg/games/${$('admin-game-slug').value}` ,{name:$('admin-game-name').value,description:$('admin-game-description').value||undefined,icon:$('admin-game-icon').value||undefined,categorySlug:$('admin-game-category').value||undefined,platforms,minPlayers:Number($('admin-game-min').value),maxPlayers:Number($('admin-game-max').value),autoMinAvailable:threshold?Number(threshold):null,enabled:true},$('admin-game-result'),'PUT');};
  $('admin-question-form').onsubmit=saveAdminQuestion;
  $('admin-question-cancel').onclick=resetAdminQuestionForm;
}

async function bindGameHelpForm(){
  const options=await api('/api/web-admin/discord-options'),games=state.lfgGames||[];
  $('game-help-channel').innerHTML='<option value="">اختر الروم</option>'+options.channels.map(item=>`<option value="${escapeHtml(item.id)}">#${escapeHtml(item.name)}</option>`).join('');
  $('game-help-game').innerHTML=games.map(game=>`<option value="${escapeHtml(game.slug)}">${escapeHtml(game.name)}</option>`).join('');
  const preview=()=>{const slug=$('game-help-game').value,daily=Number($('game-help-daily').value)||0,days=Number($('game-help-days').value)||0;$('game-help-map-label').hidden=slug!=='roblox';$('game-help-preview').textContent=daily&&days?`مين بدو مساعدة في ${$('game-help-game').selectedOptions[0]?.textContent||'لعبة'}${slug==='roblox'&&$('game-help-map').value?' — '+$('game-help-map').value:''}؟ ${daily} يوميًا × ${days} أيام = ${daily*days} لاعب كحد أقصى.`:'اختر العدد اليومي وعدد الأيام ليظهر الحد الإجمالي.'};
  $('game-help-game').onchange=preview;$('game-help-map').onchange=preview;$('game-help-daily').oninput=preview;$('game-help-days').oninput=preview;preview();$('game-help-send').disabled=!games.length||!options.channels.length;
  $('admin-game-help-form').onsubmit=async event=>{event.preventDefault();const button=$('game-help-send'),result=$('game-help-result');if(button.disabled)return;button.disabled=true;try{await api('/api/web-admin/game-help',{method:'POST',body:{channelId:$('game-help-channel').value,gameSlug:$('game-help-game').value,mapName:$('game-help-game').value==='roblox'?$('game-help-map').value||undefined:undefined,dailyCapacity:Number($('game-help-daily').value),days:Number($('game-help-days').value)}});result.textContent='✅ تم إرسال الحملة وفتح التسجيل. تابع الأسماء من سجل الحملات.';await loadAdminBroadcasts();}catch(error){result.textContent=`❌ ${error.message}`}finally{button.disabled=false}};
}
async function bindSecurityModeration(settings){
  const options=await api('/api/web-admin/discord-options');
  const keys={bans:'Ban',timeouts:'Timeout',kicks:'Kick',roles:'تعديلات الرتب',channels:'تعديلات القنوات',webhooks:'Webhook'};
  const list=$('security-role-policies');list.innerHTML='';
  function addRow(policy={}){
    const row=document.createElement('fieldset');row.className='surface security-role-policy';
    const roles=options.roles.some(role=>role.id===policy.roleId)||!policy.roleId?options.roles:[...options.roles,{id:policy.roleId,name:'رتبة محفوظة غير متاحة'}];
    row.innerHTML=`<label>الرتبة<select data-policy-role required><option value="">اختر رتبة</option>${roles.map(role=>`<option value="${escapeHtml(role.id)}" ${policy.roleId===role.id?'selected':''}>${escapeHtml(role.name)}</option>`).join('')}</select></label><div class="settings-grid three">${Object.entries(keys).map(([key,label])=>`<label>${label} / ساعة<input data-policy-limit="${key}" type="number" min="0" max="1000" placeholder="الحد العام" value="${escapeHtml(policy[key]??'')}"></label>`).join('')}</div><button class="button danger small" type="button" data-remove-policy>حذف القاعدة</button>`;
    row.querySelector('[data-remove-policy]').onclick=()=>row.remove();list.append(row);
  }
  (Array.isArray(settings.rolePolicies)?settings.rolePolicies:[]).forEach(addRow);
  $('security-add-role').onclick=()=>addRow();
  $('profanity-enabled').checked=settings.profanityEnabled!==false;$('profanity-owner').checked=settings.profanityNotifyOwner!==false;$('profanity-log').checked=settings.profanityLogEnabled!==false;$('profanity-custom').value=(settings.profanityCustomWords||[]).join('\n');
  $('security-save-moderation').disabled=false;
  $('security-moderation-form').onsubmit=async event=>{event.preventDefault();const button=$('security-save-moderation'),result=$('security-moderation-result');button.disabled=true;try{const rolePolicies=[...list.children].map(row=>({roleId:row.querySelector('[data-policy-role]').value,...Object.fromEntries([...row.querySelectorAll('[data-policy-limit]')].filter(input=>input.value!=='').map(input=>[input.dataset.policyLimit,Number(input.value)]))}));await api('/api/security/moderation-settings',{method:'PUT',body:{rolePolicies,profanityEnabled:$('profanity-enabled').checked,profanityNotifyOwner:$('profanity-owner').checked,profanityLogEnabled:$('profanity-log').checked,profanityCustomWords:$('profanity-custom').value.split(/\r?\n/).map(word=>word.trim()).filter(Boolean)}});result.textContent='✅ حُفظت القواعد. يلتقط البوت إعدادات الفلترة خلال 30 ثانية.'}catch(error){result.textContent=`❌ ${error.message}`}finally{button.disabled=false}};
}
function bindAdminBroadcastForm(){
  void bindGameHelpForm().catch(error=>{$('game-help-result').textContent=error.message});
  const form=$('admin-broadcast-form'),title=$('admin-broadcast-title'),content=$('admin-broadcast-content'),button=$('admin-broadcast-submit'),result=$('admin-broadcast-result');
  const preview=()=>{$('admin-broadcast-preview-title').textContent=title.value.trim()||'عنوان الرسالة';$('admin-broadcast-preview-content').textContent=content.value.trim()||'سيظهر محتوى الإعلان هنا.';};
  title.oninput=preview;content.oninput=preview;
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!$('admin-broadcast-confirm-check').checked){result.textContent='❌ فعّل خيار مراجعة الرسالة أولًا.';return;}
    if($('admin-broadcast-confirm-text').value.trim()!=='إرسال'){result.textContent='❌ اكتب كلمة إرسال كما هي للتأكيد.';return;}
    if(!confirm('سيُرسل هذا الإعلان بالخاص لكل أعضاء السيرفر الحقيقيين. هل تريد المتابعة؟'))return;
    button.disabled=true;result.textContent='جارِ إنشاء الحملة وتسليمها للبوت...';
    try{
      await api('/api/web-admin/broadcasts',{method:'POST',body:{title:title.value.trim(),content:content.value.trim(),confirmation:$('admin-broadcast-confirm-text').value.trim()}});
      result.textContent='✅ بدأت الحملة. يمكنك متابعة أرقام الوصول من السجل.';form.reset();preview();await loadAdminBroadcasts();
    }catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}
  };
}

async function loadAdminBroadcasts(){
  clearTimeout(adminBroadcastTimer);
  const openHelp=new Set([...document.querySelectorAll('.game-help-admin[open]')].map(node=>node.dataset.campaign));
  const campaigns=await api('/api/web-admin/broadcasts');
  const labels={PENDING:'بانتظار البوت',RUNNING:'جارِ الإرسال',COMPLETED:'مكتملة',FAILED:'فشلت'};
  $('admin-broadcast-list').innerHTML=campaigns.length?campaigns.map(item=>{
    const delivered=item.sentCount+item.failedCount,percent=item.totalMembers?Math.min(100,Math.round(delivered/item.totalMembers*100)):0;
    const registrations=item.helpRegistrations||[],help=item.helpTotalCapacity?`<details class="game-help-admin" data-campaign="${escapeHtml(item.id)}" ${openHelp.has(item.id)?'open':''}><summary>المسجلون ${registrations.length}/${item.helpTotalCapacity} · ${item.helpDailyCapacity} يوميًا لمدة ${item.helpDays} أيام</summary>${registrations.length?registrations.map(reg=>{const dayDate=new Date(new Date(item.helpStartsAt).getTime()+(reg.assignedDay-1)*86400000).toLocaleDateString('ar',{weekday:'long',day:'numeric',month:'long'});return `<div class="game-help-player"><span><b>${escapeHtml(reg.displayName)}</b><small>${escapeHtml(reg.userId)} · اليوم ${reg.assignedDay} (${escapeHtml(dayDate)}) · ${reg.status==='HELPED'?'تمت مساعدته':'بانتظار المساعدة'}</small></span>${reg.status==='WAITING'?`<button class="button primary small" data-help-complete="${escapeHtml(reg.id)}">تمت مساعدته</button>`:reg.rejoinAllowed?'<small>✅ مسموح له التسجيل مجددًا</small>':`<button class="button ghost small" data-help-rejoin="${escapeHtml(reg.id)}">السماح مجددًا</button>`}</div>`}).join(''):'<p class="section-note">لم يسجل أحد بعد.</p>'}</details>`:'';
    return `<article class="admin-room admin-broadcast-card"><div><b>📣 ${escapeHtml(item.title)}</b><small>${new Date(item.createdAt).toLocaleString('ar')} · ${escapeHtml(labels[item.status]||item.status)}</small>${item.lastError?`<small class="error-text">${escapeHtml(item.lastError)}</small>`:''}${help}</div><div class="broadcast-progress"><small>✅ ${item.sentCount} وصلت · ❌ ${item.failedCount} تعذرت · 🤖 ${item.skippedCount} بوت</small><progress value="${percent}" max="100"></progress></div></article>`;
  }).join(''):empty('لم يتم إرسال رسائل جماعية بعد.');
  document.querySelectorAll('[data-help-complete]').forEach(button=>button.onclick=()=>updateGameHelpRegistration(button,'complete'));
  document.querySelectorAll('[data-help-rejoin]').forEach(button=>button.onclick=()=>updateGameHelpRegistration(button,'allow-rejoin'));
  const activeHelp=campaigns.some(item=>item.helpStartsAt&&Date.now()<new Date(item.helpStartsAt).getTime()+(item.helpDays||0)*86400000);
  if(campaigns.some(item=>item.status==='PENDING'||item.status==='RUNNING')||activeHelp)adminBroadcastTimer=setTimeout(()=>loadAdminBroadcasts().catch(()=>undefined),activeHelp?8000:4000);
}

async function loadAdminTradeModeration(){
  try{
    const data=await api('/api/web-admin/trade');const counts=Object.fromEntries(data.byStatus.map(item=>[item.status,item._count._all]));
    $('admin-trade-stats').innerHTML=statCards([[counts.OPEN||0,'عرض مفتوح'],[counts.PENDING||0,'قيد التفاوض'],[counts.COMPLETED||0,'مكتمل'],[counts.DISPUTED||0,'نزاع'],[data.openReports.length,'بلاغ مفتوح']]);
    $('admin-trade-offers').innerHTML=data.recentTrades.length?data.recentTrades.map(trade=>`<article class="admin-room"><div><b>${escapeHtml(trade.code)} · ${escapeHtml(trade.itemName)}</b><small>${escapeHtml(trade.owner.displayName)} · ${escapeHtml(trade.game.name)} · ${escapeHtml(tradeStatusLabel(trade.status))}</small><small>${escapeHtml(trade.haveText)} ⇄ ${escapeHtml(trade.wantText)}</small></div><div class="room-manager-actions"><a class="button ghost small" href="/trade/${encodeURIComponent(trade.code)}" target="_blank" rel="noopener">عرض</a><button class="button danger small" data-admin-trade-purge="${trade.code}">حذف نهائي</button></div></article>`).join(''):empty('لا توجد عروض Trade بعد.');
    $('admin-trade-reports').innerHTML=data.openReports.length?data.openReports.map(report=>`<article class="admin-room"><div><b>${escapeHtml(report.trade.code)} · ${escapeHtml(report.trade.itemName)}</b><small>${escapeHtml(report.reason)} · المبلّغ: ${escapeHtml(report.reporter.displayName)}</small><small>${escapeHtml(report.details||'بدون تفاصيل')}</small><details class="trade-evidence"><summary>عرض لقطة الأدلة المحفوظة</summary><pre>${escapeHtml(JSON.stringify(report.evidence,null,2))}</pre></details></div><div class="room-manager-actions"><button class="button ghost small" data-trade-report-review="${report.id}">قيد المراجعة</button><button class="button ghost small" data-trade-report-warn="${report.id}">تحذير</button><button class="button ghost small" data-trade-report-close="${report.id}">إغلاق العرض</button><button class="button ghost small" data-trade-report-dismiss="${report.id}">رفض البلاغ</button><button class="button danger small" data-trade-report-remove="${report.id}">حذف العرض</button></div></article>`).join(''):empty('لا توجد بلاغات Trade مفتوحة.');
    $('admin-trade-audit').innerHTML=data.recentAudit.length?data.recentAudit.map(item=>`<article class="admin-room"><div><b>${escapeHtml(auditActionLabel(item.action))}</b><small>بواسطة: ${escapeHtml(item.actor.displayName)} · ${new Date(item.createdAt).toLocaleString('ar')}</small></div><span class="trade-code">${escapeHtml(item.tradeId||'-')}</span></article>`).join(''):empty('لا توجد إجراءات مسجلة بعد.');
    document.querySelectorAll('[data-trade-report-review]').forEach(button=>button.onclick=()=>adminTradeReportAction(button.dataset.tradeReportReview,{status:'REVIEWING',tradeAction:'NONE'}));
    document.querySelectorAll('[data-trade-report-dismiss]').forEach(button=>button.onclick=()=>adminTradeReportAction(button.dataset.tradeReportDismiss,{status:'DISMISSED',tradeAction:'NONE',resolution:'تمت المراجعة ولم يثبت المخالفة.'}));
    document.querySelectorAll('[data-trade-report-warn]').forEach(button=>button.onclick=()=>adminTradeReportAction(button.dataset.tradeReportWarn,{status:'ACTIONED',tradeAction:'NONE',resolution:'تحذير إداري: التزم بقواعد الأمان والسلوك في Trade.'}));
    document.querySelectorAll('[data-trade-report-close]').forEach(button=>button.onclick=async()=>{if(confirm('إغلاق العرض مع إبقاء السجل والأدلة؟'))await adminTradeReportAction(button.dataset.tradeReportClose,{status:'ACTIONED',tradeAction:'CLOSE',resolution:'تم إغلاق العرض إداريًا.'});});
    document.querySelectorAll('[data-trade-report-remove]').forEach(button=>button.onclick=async()=>{if(confirm('حذف العرض وإغلاق البلاغ مع حفظ الأدلة؟'))await adminTradeReportAction(button.dataset.tradeReportRemove,{status:'ACTIONED',tradeAction:'REMOVE',resolution:'تم حذف العرض بعد المراجعة.'});});
    document.querySelectorAll('[data-admin-trade-purge]').forEach(button=>button.onclick=()=>adminDeleteTrade(button.dataset.adminTradePurge));
  }catch(error){const tab=document.querySelector('[data-admin-tab="trade"]');if(tab)tab.title=error.message;if($('admin-trade-reports'))$('admin-trade-reports').innerHTML=empty(`قسم Trade غير متاح لهذا الحساب: ${error.message}`);}
}
async function adminTradeReportAction(id,body){try{await api(`/api/web-admin/trade/reports/${id}`,{method:'PATCH',body});await loadAdminTradeModeration();}catch(error){alert(error.message);}}
async function adminDeleteTrade(code){
  if(!confirm(`سيُحذف ${code} نهائيًا من الموقع وقاعدة البيانات، بما فيه المحادثات والاهتمامات والصورة. هل تريد المتابعة؟`))return;
  if(prompt('اكتب حذف لتأكيد الحذف النهائي:')!=='حذف')return;
  try{await api(`/api/web-admin/trades/${encodeURIComponent(code)}`,{method:'DELETE',body:{confirmation:'حذف'}});await loadAdminTradeModeration();alert('✅ تم الحذف النهائي من الموقع وقاعدة البيانات.');}catch(error){alert(error.message);}
}

function bindAdminTabs(){
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.onclick=()=>showAdminTab(button.dataset.adminTab));
  showAdminTab(location.hash.replace('#','')||'overview');
}

function showAdminTab(tab){
  const selected=document.querySelector(`[data-admin-tab="${CSS.escape(tab)}"]`)?tab:'overview';
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.classList.toggle('active',button.dataset.adminTab===selected));
  document.querySelectorAll('[data-admin-panel]').forEach(panel=>panel.hidden=panel.dataset.adminPanel!==selected);
  history.replaceState(null,'',`${location.pathname}${location.search}#${selected}`);
}

async function loadAdminZarkContent(selectedSlug){
  adminZarkContent=await api('/api/web-admin/zark-games');
  const manageable=adminZarkContent;
  const select=$('admin-zark-game-filter'),formSelect=$('admin-question-game');
  const current=selectedSlug||select.value||manageable[0]?.slug;
  const options=manageable.map(game=>`<option value="${escapeHtml(game.slug)}">${escapeHtml(game.icon||gameIcon(game.slug))} ${escapeHtml(game.name)} (${game.questionCount}+)</option>`).join('');
  select.innerHTML=options;formSelect.innerHTML=options;
  select.value=manageable.some(game=>game.slug===current)?current:manageable[0]?.slug||'';
  formSelect.value=select.value;
  select.onchange=()=>{formSelect.value=select.value;resetAdminQuestionForm(false);renderAdminQuestions();};
  formSelect.onchange=()=>{select.value=formSelect.value;renderAdminQuestions();};
  renderAdminQuestions();
}

function renderAdminQuestions(){
  const game=adminZarkContent.find(item=>item.slug===$('admin-zark-game-filter').value);
  if(!game){$('admin-question-list').innerHTML=empty('لا توجد ألعاب قابلة للإدارة.');return;}
  $('admin-zark-game-summary').innerHTML=`<b>${escapeHtml(game.icon||gameIcon(game.slug))} ${escapeHtml(game.name)}</b><small>${game.builtInQuestionCount||0} سؤال داخلي · ${game.enabledCustomQuestionCount||0}/${game.customQuestionCount||0} سؤال إداري مفعّل</small><p>${escapeHtml(game.description||'لعبة تحدي داخل Discord')}</p>`;
  $('admin-question-count').textContent=`${game.questionCount}+ سؤال`;
  $('admin-question-list').innerHTML=game.questions.length?game.questions.map(question=>`<article class="question-item ${question.enabled?'':'disabled'}"><div class="question-preview">${question.mediaUrl?`<img src="${escapeHtml(question.mediaUrl)}" alt="">`:`<span>${escapeHtml(game.icon||gameIcon(game.slug))}</span>`}</div><div class="question-copy"><header><b>${escapeHtml(question.prompt)}</b><span>${question.enabled?'مفعّل':'معطّل'} · صعوبة ${question.difficulty}/5</span></header><p>الإجابات: ${question.acceptedAnswers.map(escapeHtml).join('، ')}</p><small>${new Date(question.updatedAt).toLocaleString('ar')}</small></div><div class="question-actions"><button class="button ghost small" type="button" data-edit-question="${question.id}">تعديل</button><button class="button danger small" type="button" data-delete-question="${question.id}">حذف</button></div></article>`).join(''):empty('لا توجد أسئلة لهذه اللعبة بعد. أضف أول سؤال من النموذج أعلاه.');
  document.querySelectorAll('[data-edit-question]').forEach(button=>button.onclick=()=>editAdminQuestion(button.dataset.editQuestion));
  document.querySelectorAll('[data-delete-question]').forEach(button=>button.onclick=()=>deleteAdminQuestion(button.dataset.deleteQuestion));
}

function editAdminQuestion(id){
  const game=adminZarkContent.find(item=>item.slug===$('admin-zark-game-filter').value),question=game?.questions.find(item=>item.id===id);if(!question)return;
  $('admin-question-id').value=question.id;$('admin-question-game').value=game.slug;$('admin-question-prompt').value=question.prompt;$('admin-question-answers').value=question.acceptedAnswers.join(', ');$('admin-question-media').value='';$('admin-question-difficulty').value=question.difficulty;$('admin-question-enabled').checked=question.enabled;
  $('admin-question-form-title').textContent=`✏️ تعديل سؤال ${game.name}`;$('admin-question-submit').textContent='حفظ التعديلات';$('admin-question-cancel').hidden=false;$('admin-question-form').scrollIntoView({behavior:'smooth',block:'start'});
}

function resetAdminQuestionForm(keepGame=true){
  const slug=keepGame?$('admin-question-game').value:$('admin-zark-game-filter').value;$('admin-question-form').reset();$('admin-question-id').value='';$('admin-question-game').value=slug;$('admin-question-enabled').checked=true;$('admin-question-difficulty').value=1;$('admin-question-form-title').textContent='➕ إضافة سؤال';$('admin-question-submit').textContent='إضافة السؤال';$('admin-question-cancel').hidden=true;$('admin-question-result').textContent='';
}

async function saveAdminQuestion(event){
  event.preventDefault();const id=$('admin-question-id').value,slug=$('admin-question-game').value,result=$('admin-question-result');
  const file=$('admin-question-media').files?.[0];let mediaUrl;
  try{mediaUrl=file?await imageFileToDataUrl(file):(id?undefined:undefined);}catch(error){result.textContent=`❌ ${error.message}`;return;}
  const body={prompt:$('admin-question-prompt').value.trim(),acceptedAnswers:$('admin-question-answers').value.split(/[,،]/).map(item=>item.trim()).filter(Boolean),mediaUrl,difficulty:Number($('admin-question-difficulty').value),enabled:$('admin-question-enabled').checked};
  result.textContent=id?'جارِ حفظ التعديلات...':'جارِ إضافة السؤال...';
  try{await api(`/api/web-admin/zark-games/${slug}/questions${id?`/${id}`:''}`,{method:id?'PUT':'POST',body});await loadAdminZarkContent(slug);resetAdminQuestionForm();result.textContent=id?'✅ تم تعديل السؤال.':'✅ تمت إضافة السؤال.';}catch(error){result.textContent=`❌ ${error.message}`;}
}

async function deleteAdminQuestion(id){
  const slug=$('admin-zark-game-filter').value;if(!confirm('حذف هذا السؤال نهائيًا من قاعدة البيانات؟'))return;
  try{await api(`/api/web-admin/zark-games/${slug}/questions/${id}`,{method:'DELETE'});await loadAdminZarkContent(slug);resetAdminQuestionForm();}catch(error){alert(`تعذر حذف السؤال: ${error.message}`);}
}

async function loadAdminReports(){
  const reports=await api('/api/web-admin/feedback');
  const items=[...reports.playerReports.map(report=>({kind:'PLAYER',id:report.id,title:`بلاغ: ${report.reason}`,subtitle:`${report.reporter.displayName} ضد ${report.reported.displayName} · قدّم ${report.reporter.submittedReportCount||1} بلاغ`,status:report.status,date:report.updatedAt||report.createdAt,messages:report._count?.messages||0})),...reports.bugReports.map(report=>({kind:'BUG',id:report.id,title:`خطأ: ${report.title}`,subtitle:`أرسله ${report.reporter.displayName} · قدّم ${report.reporter.submittedReportCount||1} بلاغ`,status:report.status,date:report.updatedAt||report.createdAt,messages:report._count?.messages||0}))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('admin-report-list').innerHTML=items.length?items.map(report=>ticketListItem(report,'admin')).join(''):empty('لا توجد بلاغات أو أخطاء حاليًا.');
  document.querySelectorAll('[data-admin-ticket]').forEach(button=>button.onclick=()=>openAdminReport(button.dataset.kind,button.dataset.adminTicket));
}

async function openAdminReport(kind,id){
  const thread=await api(`/api/web-admin/reports/${kind}/${id}`);activeAdminTicket={kind,id};renderTicketThread(thread,'admin');
  const statuses=kind==='PLAYER'?['PENDING','REVIEWED','RESOLVED','REJECTED','DISMISSED']:['OPEN','IN_PROGRESS','RESOLVED','CLOSED'];
  $('admin-report-status').innerHTML=statuses.map(status=>`<option value="${status}" ${status===thread.status?'selected':''}>${reportStatusLabel(status)}</option>`).join('');
  $('admin-report-reply').onsubmit=async event=>{event.preventDefault();const input=$('admin-report-message'),result=$('admin-report-result');result.textContent='جارِ إرسال الرد...';try{const updated=await api(`/api/web-admin/reports/${kind}/${id}/messages`,{method:'POST',body:{message:input.value}});input.value='';renderTicketThread(updated,'admin');result.textContent='✅ تم إرسال الرد للمشتكي وسيصله DM.';await loadAdminReports();}catch(error){result.textContent=`❌ ${error.message}`;}};
  $('admin-report-status-save').onclick=async()=>{const result=$('admin-report-result');result.textContent='جارِ تحديث الحالة...';try{const updated=await api(`/api/web-admin/reports/${kind}/${id}/status`,{method:'PUT',body:{status:$('admin-report-status').value}});renderTicketThread(updated,'admin');result.textContent='✅ تم تحديث الحالة وإشعار المشتكي.';await loadAdminReports();}catch(error){result.textContent=`❌ ${error.message}`;}};
  $('admin-report-delete').onclick=async()=>{if(!confirm('حذف التذكرة وكل رسائلها نهائيًا من قاعدة البيانات؟ سيبقى فقط عداد بلاغات العضو.'))return;const button=$('admin-report-delete'),result=$('admin-report-result');button.disabled=true;result.textContent='جارِ الحذف النهائي...';try{const deleted=await api(`/api/web-admin/reports/${kind}/${id}`,{method:'DELETE'});activeAdminTicket=undefined;$('admin-report-thread').hidden=true;history.replaceState(null,'',location.pathname);await loadAdminReports();alert(`✅ تم حذف التذكرة نهائيًا. إجمالي بلاغات العضو المحفوظ: ${deleted.submittedReportCount}`);}catch(error){result.textContent=`❌ تعذر حذف التذكرة: ${error.message}`;button.disabled=false;}};
}

function ticketListItem(report,prefix){
  return `<button type="button" class="report-item ticket-list-item" data-${prefix}-ticket="${escapeHtml(report.id)}" data-kind="${report.kind}"><div><b>${escapeHtml(report.title)}</b><small>${escapeHtml(report.subtitle)} · ${new Date(report.date).toLocaleString('ar')} · 💬 ${report.messages}</small></div><span class="badge-red">${escapeHtml(reportStatusLabel(report.status))}</span></button>`;
}

function renderTicketThread(thread,prefix){
  const section=$(prefix==='admin'?'admin-report-thread':'my-report-thread');section.hidden=false;
  const target=thread.reported?`<span>${avatar(thread.reported.avatarUrl,thread.reported.displayName,'mini')} ضد ${escapeHtml(thread.reported.displayName)}</span>`:'';
  $(prefix==='admin'?'admin-report-head':'my-report-head').innerHTML=`<div><span class="eyebrow">${thread.kind==='PLAYER'?'PLAYER REPORT':'BUG REPORT'} · #${escapeHtml(thread.id.slice(-8).toUpperCase())}</span><h2>${escapeHtml(thread.title)}</h2><p>${avatar(thread.reporter.avatarUrl,thread.reporter.displayName,'mini')} المشتكي: ${escapeHtml(thread.reporter.displayName)} ${target}</p>${thread.description?`<small>${escapeHtml(thread.description)}</small>`:''}</div><div class="ticket-head-actions"><span class="badge-red">${escapeHtml(reportStatusLabel(thread.status))}</span>${prefix==='my'?'<button id="my-report-close" class="icon-button" type="button" title="الخروج من التذكرة">×</button>':''}</div>`;
  const container=$(prefix==='admin'?'admin-report-messages':'my-report-messages');
  container.innerHTML=thread.messages?.length?thread.messages.map(message=>`<article class="ticket-message ${message.authorRole.toLowerCase()}"><header><b>${message.authorRole==='ADMIN'?'🛡️ الإدارة':'👤 '+escapeHtml(message.authorName)}</b><time>${new Date(message.createdAt).toLocaleString('ar')}</time></header><p>${escapeHtml(message.message)}</p></article>`).join(''):empty('لا توجد رسائل بعد. اكتب أول رسالة في التذكرة.');
  container.scrollTop=container.scrollHeight;
  if(prefix==='my')bindMyTicketClose();
}

function reportStatusLabel(status){return({PENDING:'بانتظار المراجعة',REVIEWED:'قيد المراجعة',OPEN:'مفتوح',IN_PROGRESS:'جارِ العمل',RESOLVED:'تم الحل',REJECTED:'مرفوض',DISMISSED:'مغلق',CLOSED:'مغلق'})[status]||status;}

async function setMyReportPresence(active,ticket=activeUserTicket){if(!ticket)return;await api(`/api/me/reports/${ticket.kind}/${ticket.id}/presence`,{method:'POST',body:{active},keepalive:!active});}
function bindReportPresenceLifecycle(){if(reportPresenceBound)return;reportPresenceBound=true;document.addEventListener('visibilitychange',()=>{if(activeUserTicket)setMyReportPresence(document.visibilityState==='visible').catch(()=>undefined);});window.addEventListener('pagehide',()=>{if(activeUserTicket)setMyReportPresence(false).catch(()=>undefined);});}
function bindMyTicketClose(){const button=$('my-report-close');if(!button)return;button.onclick=async()=>{await setMyReportPresence(false).catch(()=>undefined);activeUserTicket=undefined;clearInterval(reportPresenceTimer);$('my-report-thread').hidden=true;history.replaceState(null,'',location.pathname);};}

function fillAdminSettings(settings){
  $('setting-bot-name').value=settings.botName||'';$('setting-tagline').value=settings.tagline||'';
  $('setting-lfg-channel').value=settings.lfgChannelId||'';$('setting-lfg-category').value=settings.lfgCategoryId||'';$('setting-public-channel').value=settings.publicChannelId||'';$('setting-daily-channel').value=settings.dailyChannelId||'';$('setting-leaderboard-channel').value=settings.leaderboardChannelId||'';$('setting-report-channel').value=settings.reportChannelId||'';$('setting-website-url').value=settings.websiteUrl||'https://zark-ps.com';
  $('setting-dm-enabled').checked=settings.dmNotificationsEnabled;$('setting-quick-match').checked=settings.quickMatchEnabled;$('setting-auto-smart-rooms').checked=settings.autoSmartRoomsEnabled;$('setting-ratings').checked=settings.ratingsEnabled;$('setting-reports').checked=settings.reportsEnabled;$('setting-auto-channels').checked=settings.autoCreateRoomChannels;$('setting-ai-enabled').checked=settings.aiChatEnabled;$('setting-mention-status').checked=settings.autoMentionStatusEnabled!==false;$('setting-activity-tracking').checked=settings.activityTrackingEnabled!==false;$('setting-availability-lfg').checked=settings.availabilityLfgIntegration!==false;
  $('setting-mention-cooldown').value=settings.mentionStatusCooldownMinutes??30;$('setting-active-minutes').value=settings.activityActiveMinutes??10;$('setting-mention-channels').value=(settings.mentionStatusChannelIds||[]).join(', ');$('setting-mention-excluded').value=(settings.mentionStatusExcludedIds||[]).join(', ');
  $('setting-auto-room-interval').value=settings.autoRoomIntervalMinutes||120;$('setting-auto-room-minimum').value=settings.autoRoomMinimumInterested||2;$('setting-auto-room-lifetime').value=settings.autoRoomLifetimeMinutes||120;$('setting-auto-room-max').value=settings.maxAutoRoomsPerGame||1;$('setting-auto-room-dm').checked=settings.autoRoomDmInterestedUsers!==false;$('setting-auto-room-delete').checked=settings.deleteExpiredAutoRooms!==false;$('setting-voice-empty-grace').value=settings.voiceEmptyGraceMinutes||10;$('setting-single-player-idle').value=settings.singlePlayerIdleMinutes||15;
  $('setting-dm-limit').value=settings.maxDmPerDay;$('setting-dm-cooldown').value=settings.notificationCooldownMinutes;$('setting-room-limit').value=settings.maxActiveRoomsPerUser;$('setting-room-duration').value=settings.defaultRoomDurationMinutes;$('setting-room-grace').value=settings.roomGraceMinutes;$('setting-ai-message-limit').value=settings.aiDailyMessagesPerUser||60;$('setting-ai-global-message-limit').value=settings.aiGlobalDailyMessages||5000;$('setting-ai-user-limit').value=settings.aiDailyTokenBudgetPerUser||50000;$('setting-ai-global-limit').value=settings.aiGlobalDailyTokenBudget||1000000;$('setting-ai-output').value=settings.aiMaxOutputTokens||250;
}

function channelValue(id){const value=$(id).value.trim();return value||null;}
function imageFileToDataUrl(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(new Error('اختر ملف صورة فقط.'));if(file.size>1_500_000)return reject(new Error('الصورة أكبر من 1.5MB.'));const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});}

async function submitForm(path,body,result,method='POST'){result.textContent='جارِ الإرسال...';try{await api(path,{method,body});result.textContent='✅ تم الحفظ بنجاح.';}catch(error){result.textContent=`❌ ${error.message}`;}}

function roomCard(room){return `<article class="room-card" style="--room-accent:${escapeHtml(room.accentColor||'#e50914')}"><div class="room-top"><span class="game-icon">${escapeHtml(room.roomEmoji||room.gameIcon||'🎮')}</span><span class="room-status">${room.status==='SCHEDULED'?'SCHEDULED':room.status==='ACTIVE'?'PLAYING':room.status==='COMPLETED'?'FINISHED':'LIVE'}</span></div><h3>${escapeHtml(room.title||room.gameName)}</h3>${room.hostPriority?'<span class="priority-badge">🚀 أولوية</span>':''}<span class="platform-badge">${escapeHtml(gamePlatformsLabel(room))}</span><div class="room-meta host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')}<span>Host: ${escapeHtml(room.hostName)} · ${room.needsVoice?'🎙️ Voice':'💬 Text'}${room.mapName?` · 🗺️ ${escapeHtml(room.mapName)}`:''}</span></div><div class="room-players compact">${(room.members||[]).slice(0,4).map(member=>`<span class="room-player">${avatar(member.avatarUrl,member.displayName,'mini')}${escapeHtml(member.displayName)}</span>`).join('')}</div><div class="room-progress"><i style="width:${Math.min(100,room.currentPlayers/room.maxPlayers*100)}%"></i></div><div class="room-bottom"><span>${room.currentPlayers}/${room.maxPlayers} لاعبين</span><span>${formatRoomTiming(room)}</span></div></article>`}
function rankingRows(rows,key,label){return rows.length?rows.slice(0,10).map((row,index)=>`<div class="rank-row"><span class="rank">${index<3?['🥇','🥈','🥉'][index]:`#${index+1}`}</span><span class="rank-player">${avatar(row.avatarUrl,row.displayName,'rank')}<b>${escapeHtml(row.displayName)}</b></span><span>${formatValue(row[key])} ${label}</span></div>`).join(''):empty('لا توجد بيانات كافية بعد.');}
function statCards(items){return items.map(([value,label])=>`<article><b>${formatValue(value)}</b><span>${label}</span></article>`).join('')}
function dataRow(label,value){return `<div class="data-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`}
function gameIcon(slug){return {'translate':'🌐','flags':'🚩','capitals':'🌍','fast-type':'⌨️','complete-word':'🧩','word-order':'🔤','math':'🧮','quick-choice':'🔘','logos':'🏢','anime-silhouette':'🎭','game-logos':'🎮','true-false':'✅','letter-order':'🔡','who-am-i':'👤','trivia':'❓','riddles':'🧠','gaming-quiz':'🎯','animals':'🐾','science':'🔬','space':'🪐','football':'⚽','technology':'💻','food':'🍕','nature':'🌿','colors':'🎨','languages':'🗣️','history':'🏛️','inventions':'💡','internet':'🌐','logic':'🧩','synonyms':'📝','antonyms':'↔️','countries':'🗺️','sports':'🏅','geography':'🌍','books':'📚'}[slug]||'🎮'}
function normalizeRoomSearch(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim()}
function smartRoomMatch(room,query){if(!query)return true;const canonical=Object.entries(roomSearchAliases).find(([,aliases])=>aliases.some(alias=>{const normalized=normalizeRoomSearch(alias);return query.includes(normalized)||normalized.includes(query)}))?.[0];const haystack=normalizeRoomSearch([room.id,room.gameName,room.gameSlug,room.hostName,room.title,room.gameMode,room.mapName,room.description,...(room.members||[]).map(member=>member.displayName)].filter(Boolean).join(' '));return haystack.includes(query)||(canonical&&room.gameSlug===canonical)}
function availabilityText(value){return{FREE:'🟢 فاضي للعب',PLAYING:'🎮 ألعب الآن',STUDYING:'📚 أدرس',WORKING:'💼 أعمل',BUSY:'⛔ مشغول',SLEEPING:'😴 نايم',AWAY:'🌙 غير متاح'}[value]||'غير محدد'}
function auditActionLabel(action){return({
  'loyalty.boost_started':'بدأ تعزيز نقاط الولاء','loyalty.vip_purchased':'تم شراء رتبة VIP','guild.settings_updated':'تم تعديل إعدادات السيرفر','guild.auto_smart_rooms_changed':'تم تغيير الإنشاء التلقائي للغرف','lfg.admin_closed':'أغلقت الإدارة غرفة LFG','report.status_changed':'تم تحديث حالة بلاغ','report.deleted':'تم حذف بلاغ','trade.created':'تم إنشاء عرض Trade','trade.deleted':'تم حذف عرض Trade','trade.message_sent':'تم إرسال رسالة Trade','trade.completed':'تم إكمال Trade','trade.disputed':'تم فتح نزاع Trade','trade.report_created':'تم تقديم بلاغ Trade','trade.report_resolved':'تمت معالجة بلاغ Trade'
  ,'team.deleted':'تم حذف فريق'
})[action]||`عملية إدارية: ${String(action||'غير معروفة').replace(/[._]/g,' ')}`}
function auditTargetLabel(action){return action?.startsWith('loyalty.')||action?.startsWith('report.')?'معرّف العضو أو البلاغ':action?.startsWith('lfg.')?'معرّف الغرفة':action?.startsWith('trade.')?'معرّف العرض':'المعرّف المرتبط'}
function supportTokenLabel(status){const names={GEMINI:'Gemini',GROQ:'Groq',OPENROUTER:'OpenRouter'},provider=names[status.provider]||'مساعد Zark',remaining=Number.isFinite(status.remainingMessages)?` · ${formatValue(status.remainingMessages)} رسالة متبقية اليوم`:'';if(status.mode==='AI')return`${provider} متصل${remaining}`;if(status.mode==='ACTION')return`نفّذ Zark الطلب${remaining}`;if(status.aiError)return`تحويل تلقائي للمساعد المحلي${remaining}`;if(status.setupRequired||!status.provider)return`المساعد المحلي متاح${remaining}`;return`${provider} جاهز${remaining}`}
function empty(message){return `<div class="empty-state"><span aria-hidden="true">✦</span><b>${escapeHtml(message)}</b><small>جرّب تغيير الفلاتر أو ارجع بعد قليل.</small></div>`}
function trapDialogFocus(event,container){
  if(event.key!=='Tab')return;
  const controls=[...container.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(node=>!node.disabled&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
  const first=controls[0],last=controls.at(-1);if(!first)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
async function updateGameHelpRegistration(button,action){
  const id=button.dataset.helpComplete||button.dataset.helpRejoin;button.disabled=true;
  try{await api(`/api/web-admin/game-help/registrations/${encodeURIComponent(id)}/${action}`,{method:'POST'});await loadAdminBroadcasts()}catch(error){button.disabled=false;alert(error.message)}
}
async function loadAdminTeams(){
  const teams=await api('/api/web-admin/teams');
  $('admin-team-list').innerHTML=teams.length?teams.map(team=>`<article class="admin-room"><div><b>👥 ${escapeHtml(team.name)}</b><small>${team.memberCount}/${team.maxMembers} عضو · ${team.score.toLocaleString('ar')} نقطة · المالك: ${escapeHtml(team.owner.displayName)}</small><small>${escapeHtml(team.description||'بدون وصف')}</small></div><div class="room-manager-actions"><a class="button ghost small" href="/teams.html" target="_blank">عرض</a><button class="button danger small" data-admin-team-delete="${team.id}" data-team-name="${escapeHtml(team.name)}">حذف الفريق</button></div></article>`).join(''):empty('لا توجد فرق مسجلة بعد.');
  document.querySelectorAll('[data-admin-team-delete]').forEach(button=>button.onclick=async()=>{if(!confirm(`حذف فريق ${button.dataset.teamName} وكل عضوياته ودعواته؟`))return;button.disabled=true;try{await api(`/api/web-admin/teams/${button.dataset.adminTeamDelete}`,{method:'DELETE'});await loadAdminTeams();}catch(error){alert(error.message);button.disabled=false;}});
}
function showToast(title,message='',type='info'){
  let region=$('toast-region');if(!region){document.body.insertAdjacentHTML('beforeend','<div id="toast-region" class="toast-region" role="status" aria-live="polite"></div>');region=$('toast-region')}
  const toast=document.createElement('article');toast.className=`toast ${type}`;toast.innerHTML=`<span>${type==='success'?'✓':'✦'}</span><div><b>${escapeHtml(title)}</b>${message?`<small>${escapeHtml(message)}</small>`:''}</div><button type="button" aria-label="إغلاق">×</button>`;toast.querySelector('button').onclick=()=>toast.remove();region.appendChild(toast);setTimeout(()=>toast.remove(),4200);
}
function setRealtimeStatus(connected){const node=$('realtime-status');if(!node)return;node.textContent=connected?'● مباشر':'● يعيد الاتصال';node.classList.toggle('offline',!connected);node.title=connected?'التحديث المباشر متصل':'جارِ إعادة اتصال التحديث المباشر';}
function formatValue(value){return typeof value==='number'?new Intl.NumberFormat('ar').format(value):value??0}
function formatDuration(seconds){const value=Math.max(0,Number(seconds)||0);const hours=Math.floor(value/3600);const minutes=Math.floor((value%3600)/60);return hours?`${hours}س ${minutes}د`:`${minutes} دقيقة`}
function minutesToTime(minutes){const value=Math.max(0,Math.min(1439,Number(minutes)||0));return`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}
function timeToMinutes(value){const[hours,minutes]=String(value||'00:00').split(':').map(Number);return hours*60+minutes}
function localDateTime(value){const date=new Date(value),pad=number=>String(number).padStart(2,'0');return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
function formatRoomTiming(room){if(room.attendanceWarningAt&&room.autoDeleteAt)return`⚠️ يلزم لاعبين قبل ${new Date(room.autoDeleteAt).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`;if(room.status==='SCHEDULED'&&room.scheduledFor)return`موعد التجمع ${new Date(room.scheduledFor).toLocaleString('ar',{dateStyle:'short',timeStyle:'short'})}`;if(room.startedAt)return`بدأ اللعب ${new Date(room.startedAt).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`;return`بدأ التجمع ${new Date(room.createdAt).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`}
function countdown(date){const minutes=Math.max(0,Math.ceil((new Date(date).getTime()-Date.now())/60000));return minutes?`${minutes}د متبقية`:'ينتهي الآن'}
function countdownTo(date){const minutes=Math.ceil((new Date(date).getTime()-Date.now())/60000);if(minutes<=0)return'الآن';if(minutes<60)return`بعد ${minutes}د`;const hours=Math.floor(minutes/60),rest=minutes%60;return`بعد ${hours}س${rest?` ${rest}د`:''}`}
function timeAgo(date){const minutes=Math.max(1,Math.floor((Date.now()-new Date(date).getTime())/60000));return minutes<60?`منذ ${minutes}د`:`منذ ${Math.floor(minutes/60)}س`}
function avatar(url,name,size='mini'){const cls=`discord-avatar ${size}`;return url?`<img class="${cls}" src="${escapeHtml(url)}" alt="${escapeHtml(name||'Discord')}">`:`<span class="${cls} avatar-fallback">${escapeHtml(String(name||'Z').slice(0,1).toUpperCase())}</span>`}
let tradeImageData='';
async function renderTrade(realtime=false){
  if(!realtime){
    const games=state.lfgGames||[];
    $('trade-game').innerHTML=games.map(game=>`<option value="${escapeHtml(game.slug)}">${escapeHtml(game.icon||'🎮')} ${escapeHtml(game.name)}</option>`).join('');
    $('trade-game-filter').insertAdjacentHTML('beforeend',games.map(game=>`<option value="${escapeHtml(game.slug)}">${escapeHtml(game.name)}</option>`).join(''));
    document.querySelectorAll('[data-trade-tab]').forEach(button=>button.onclick=()=>showTradeTab(button.dataset.tradeTab));
    $('trade-search-button').onclick=loadTradeMarket;$('trade-search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();loadTradeMarket();}};
    $('trade-image').onchange=async()=>{const file=$('trade-image').files[0];if(!file)return;const status=$('trade-image-status');status.textContent='جارِ تجهيز وضغط الصورة...';try{const prepared=await imageFileToDataUrlStrict(file);tradeImageData=prepared.dataUrl;$('trade-image-preview').src=tradeImageData;$('trade-image-preview').hidden=false;status.textContent=prepared.compressed?`✅ تم ضغط الصورة من ${formatFileSize(file.size)} إلى ${formatFileSize(prepared.size)} وأصبحت جاهزة.`:`✅ الصورة جاهزة (${formatFileSize(prepared.size)}).`;}catch(error){tradeImageData='';$('trade-image').value='';$('trade-image-preview').hidden=true;status.textContent=`❌ ${error.message}`;}};
    $('trade-create-form').onsubmit=createTradeFromWeb;
  }
  await Promise.all([loadTradeMarket(),loadTradeInbox(),loadTradeNotifications()]);
  if(me)await loadMyTrades();
  if(realtime&&activeTradeConversationId){showTradeTab('inbox');await openTradeConversation(activeTradeConversationId).catch(error=>{console.warn('trade_conversation_refresh_failed',error);activeTradeConversationId=undefined;});}
  if(!realtime){const requestedTab=new URLSearchParams(location.search).get('tab');if(['market','mine','inbox','notifications','create'].includes(requestedTab))showTradeTab(requestedTab);}
  const pathMatch=location.pathname.match(/^\/trade\/([^/]+)$/);const queryId=new URLSearchParams(location.search).get('id');const identifier=pathMatch?.[1]||queryId;if(identifier)await openTrade(identifier);
}

function showTradeTab(tab){
  if(!me&&tab!=='market'){location.href='/auth/discord';return;}
  document.querySelectorAll('[data-trade-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tradeTab===tab));
  document.querySelectorAll('[data-trade-panel]').forEach(panel=>panel.hidden=panel.dataset.tradePanel!==tab);
  $('trade-detail').hidden=true;
  if(tab!=='inbox')activeTradeConversationId=undefined;
  if(tab==='notifications')loadTradeNotifications(true).catch(console.error);
}

async function loadTradeMarket(){
  const params=new URLSearchParams();const search=$('trade-search')?.value.trim(),game=$('trade-game-filter')?.value,sort=$('trade-sort')?.value;if(search)params.set('search',search);if(game)params.set('game',game);if(sort)params.set('sort',sort);
  const trades=await api(`/api/trades?${params}`);$('trade-list').innerHTML=trades.length?trades.map(tradeCard).join(''):empty('لا توجد عروض مطابقة الآن. أنشئ أول عرض.');bindTradeCards();
}

async function loadMyTrades(){if(!me)return;$('my-trade-list').innerHTML=(await api('/api/me/trades')).map(tradeCard).join('')||empty('لم تنشر أي عرض بعد.');bindTradeCards();}
function tradeCard(trade){const image=trade.imageData||'/assets/zark-og.png';return `<article class="trade-card"><button class="trade-image-button" type="button" data-open-trade="${trade.code}"><img src="${escapeHtml(image)}" alt="${escapeHtml(trade.itemName)}" loading="lazy" decoding="async"></button><div class="trade-card-copy"><header><span class="trade-code">${escapeHtml(trade.code)}</span><span class="trade-status status-${trade.status.toLowerCase()}">${tradeStatusLabel(trade.status)}</span></header><h3>${escapeHtml(trade.itemName)}</h3><small>${escapeHtml(trade.game.icon||'🎮')} ${escapeHtml(trade.game.name)} · ${escapeHtml(trade.owner.displayName)}</small><div class="trade-exchange"><p><b>I HAVE</b>${escapeHtml(trade.haveText)}</p><span>⇄</span><p><b>I WANT</b>${escapeHtml(trade.wantText)}</p></div><footer><span>👥 ${trade._count?.interests||0} مهتم</span><button class="button primary small" type="button" data-open-trade="${trade.code}">التفاصيل</button></footer></div></article>`}
function bindTradeCards(){document.querySelectorAll('[data-open-trade]').forEach(button=>button.onclick=()=>openTrade(button.dataset.openTrade));}

async function createTradeFromWeb(event){event.preventDefault();if(!me){location.href='/auth/discord';return;}const result=$('trade-create-result');const submit=event.submitter;submit.disabled=true;result.textContent='جارِ رفع العرض...';try{if(!tradeImageData)throw new Error('اختر صورة الغرض وانتظر حتى ينتهي تجهيزها.');const trade=await api('/api/me/trades',{method:'POST',body:{gameSlug:$('trade-game').value,itemName:$('trade-item').value,imageData:tradeImageData,haveText:$('trade-have').value,wantText:$('trade-want').value,description:$('trade-description').value||undefined,acceptedTerms:$('trade-terms').checked}});result.textContent=`✅ تم نشر ${trade.code} وإرسال تنبيه Discord.`;$('trade-create-form').reset();tradeImageData='';$('trade-image-preview').hidden=true;$('trade-image-status').textContent='PNG / JPG / WEBP. الصور الكبيرة تُضغط تلقائيًا قبل الرفع.';await loadTradeMarket();await loadMyTrades();requestAnimationFrame(()=>openTrade(trade.code));}catch(error){result.textContent=`❌ ${error.message}`;}finally{submit.disabled=false;}}

async function openTrade(identifier){
  const trade=await api(`/api/trades/${encodeURIComponent(identifier)}`);const detail=$('trade-detail');document.querySelectorAll('[data-trade-panel]').forEach(panel=>panel.hidden=true);detail.hidden=false;
  const ownerActions=trade.isOwner&&['OPEN','PENDING'].includes(trade.status)?`<button class="button ghost small" data-trade-edit="${trade.code}">تعديل العرض</button><button class="button danger small" data-trade-close="${trade.code}">إغلاق العرض</button>`:'';
  const myInterest=!trade.isOwner&&me?trade.interests?.find(item=>item.userId===me.userId||item.user?.id===me.userId):null;
  const interestAction=trade.isOwner?'':myInterest?.conversation?`<button class="button primary" data-open-conversation="${escapeHtml(myInterest.conversation.id)}">فتح المحادثة</button>`:myInterest?`<p role="status">${myInterest.status==='PENDING'?'✅ تم إرسال اهتمامك. بانتظار قبول صاحب العرض لفتح المحادثة.':tradeInterestLabel(myInterest.status)}</p>`:trade.status==='OPEN'?`<button class="button primary" data-trade-interest="${trade.code}">أنا مهتم</button>`:'<p class="subtle">هذا العرض لا يستقبل طلبات اهتمام جديدة حالياً.</p>';
  const interests=trade.isOwner&&trade.interests?.length?`<section class="trade-interest-list"><h3>طلبات الاهتمام</h3>${trade.interests.map(item=>`<article>${avatar(item.user.avatarUrl,item.user.displayName,'mini')}<b>${escapeHtml(item.user.displayName)}</b><span>${tradeInterestLabel(item.status)}</span>${item.status==='PENDING'?`<button class="button primary small" data-interest-decision="${item.id}" data-decision="ACCEPTED">قبول وفتح محادثة</button><button class="button ghost small" data-interest-decision="${item.id}" data-decision="DECLINED">رفض</button>`:item.conversation?`<button class="button ghost small" data-open-conversation="${item.conversation.id}">فتح المحادثة</button>`:''}</article>`).join('')}</section>`:'';
  detail.innerHTML=`<button class="icon-button trade-detail-close" type="button" aria-label="إغلاق">×</button><div class="trade-detail-grid"><img src="${escapeHtml(trade.imageData)}" alt="${escapeHtml(trade.itemName)}"><div><span class="trade-code">${escapeHtml(trade.code)}</span><span class="trade-status status-${trade.status.toLowerCase()}">${tradeStatusLabel(trade.status)}</span><h2>${escapeHtml(trade.itemName)}</h2><p class="host-meta">${avatar(trade.owner.avatarUrl,trade.owner.displayName,'host')} ${escapeHtml(trade.owner.displayName)} · ${escapeHtml(trade.game.icon||'🎮')} ${escapeHtml(trade.game.name)}</p><div class="trade-exchange large"><p><b>I HAVE</b>${escapeHtml(trade.haveText)}</p><span>⇄</span><p><b>I WANT</b>${escapeHtml(trade.wantText)}</p></div>${trade.description?`<p class="trade-description">${escapeHtml(trade.description)}</p>`:''}<div class="room-manager-actions">${interestAction}${ownerActions}<button class="button ghost small" data-trade-report="${trade.code}">⚑ بلاغ</button></div></div></div>${interests}`;
  detail.scrollIntoView({behavior:'smooth',block:'start'});detail.querySelector('.trade-detail-close').onclick=()=>{detail.hidden=true;document.querySelector('[data-trade-panel="market"]').hidden=false;};
  detail.querySelector('[data-trade-interest]')?.addEventListener('click',async event=>{await tradeButtonAction(event.currentTarget,`/api/me/trades/${trade.code}/interest`,{},()=>openTrade(trade.code));});
  detail.querySelector('[data-trade-close]')?.addEventListener('click',async event=>{if(confirm('إغلاق العرض؟'))await tradeButtonAction(event.currentTarget,`/api/me/trades/${trade.code}/close`,{},()=>openTrade(trade.code));});
  detail.querySelector('[data-trade-edit]')?.addEventListener('click',()=>editTradeFromWeb(trade));
  detail.querySelectorAll('[data-interest-decision]').forEach(button=>button.onclick=()=>tradeButtonAction(button,`/api/me/trade-interests/${button.dataset.interestDecision}/decision`,{decision:button.dataset.decision},()=>openTrade(trade.code)));
  detail.querySelectorAll('[data-open-conversation]').forEach(button=>button.onclick=()=>{showTradeTab('inbox');openTradeConversation(button.dataset.openConversation);});
  detail.querySelector('[data-trade-report]').onclick=()=>submitTradeReport(trade);
}

async function editTradeFromWeb(trade){const itemName=prompt('اسم الغرض:',trade.itemName);if(itemName===null)return;const haveText=prompt('I HAVE — ما الذي تعرضه؟',trade.haveText);if(haveText===null)return;const wantText=prompt('I WANT — ماذا تريد؟',trade.wantText);if(wantText===null)return;const description=prompt('الوصف الإضافي:',trade.description||'');if(description===null)return;try{await api(`/api/me/trades/${trade.code}`,{method:'PATCH',body:{itemName,haveText,wantText,description}});await Promise.all([loadTradeMarket(),loadMyTrades()]);await openTrade(trade.code);}catch(error){alert(error.message);}}

async function tradeButtonAction(button,path,body,done){if(!me){location.href='/auth/discord';return;}button.disabled=true;try{await api(path,{method:'POST',body});await Promise.all([loadTradeMarket(),loadMyTrades(),loadTradeInbox(),loadTradeNotifications()]);if(done)await done();}catch(error){alert(error.message);}finally{button.disabled=false;}}

async function loadTradeInbox(){if(!me)return;const conversations=await api('/api/me/trade-inbox');const unread=conversations.filter(item=>item.unread).length;$('trade-unread').hidden=!unread;$('trade-unread').textContent=unread;$('trade-inbox-list').innerHTML=conversations.length?conversations.map(item=>`<button class="trade-conversation-item ${item.unread?'unread':''}" data-inbox-id="${item.id}" type="button"><b>${escapeHtml(item.trade.code)} · ${escapeHtml(item.trade.itemName)}</b><span>${escapeHtml((item.messages[0]?.deletedAt?'رسالة محذوفة':item.messages[0]?.content)||'بدأت المحادثة')}</span><small>${new Date(item.lastMessageAt).toLocaleString('ar')}</small></button>`).join(''):empty('لا توجد محادثات بعد.');document.querySelectorAll('[data-inbox-id]').forEach(button=>button.onclick=()=>openTradeConversation(button.dataset.inboxId));}

async function openTradeConversation(id){
  activeTradeConversationId=id;
  const item=await api(`/api/me/trade-conversations/${id}`),panel=$('trade-conversation');panel.hidden=false;const other=item.ownerId===me.userId?item.interestedUser:item.owner;
  panel.innerHTML=`<header><div><span class="trade-code">${escapeHtml(item.trade.code)}</span><h2>${escapeHtml(item.trade.itemName)}</h2><small>محادثة خاصة مع ${escapeHtml(other.displayName)}${item.moderatorView?' · وضع إشراف للقراءة':''}</small></div><a class="button ghost small" href="/trade/${encodeURIComponent(item.trade.code)}">فتح العرض</a></header><div class="trade-chat-log">${item.messages.map(message=>tradeMessageHtml(message,me.userId)).join('')||empty('ابدأ المحادثة برسالة واضحة، ولا تشارك بيانات حسابك.')}</div>${item.moderatorView?'':`<form id="trade-message-form"><input id="trade-message-input" maxlength="1500" required placeholder="اكتب رسالتك..."><button class="button primary" type="submit">إرسال</button></form><div class="trade-conversation-actions">${item.trade.status==='PENDING'&&item.ownerId===me.userId?'<button class="button primary small" data-completion-request>طلب تأكيد الإكمال من هذا اللاعب</button>':''}${item.trade.status==='COMPLETION_PENDING'&&item.trade.completionConversationId===id&&item.interestedUserId===me.userId?'<button class="button primary small" data-completion-answer="CONFIRM">تأكيد نجاح الصفقة</button><button class="button danger small" data-completion-answer="DISPUTE">فتح نزاع</button>':''}${item.trade.status==='COMPLETED'?`<span class="trade-review-label">قيّم ${escapeHtml(other.displayName)}:</span>${[1,2,3,4,5].map(stars=>`<button class="button ghost small" data-trade-review="${stars}">${stars}⭐</button>`).join('')}`:''}<button class="button ghost small" data-conversation-report>⚑ بلاغ</button></div>`}`;
  panel.querySelector('#trade-message-form')?.addEventListener('submit',async event=>{event.preventDefault();const input=$('trade-message-input'),content=input.value;input.disabled=true;try{await api(`/api/me/trade-conversations/${id}/messages`,{method:'POST',body:{content}});input.value='';await openTradeConversation(id);await loadTradeInbox();}catch(error){alert(error.message);}finally{input.disabled=false;input.focus();}});
  panel.querySelectorAll('[data-message-delete]').forEach(button=>button.onclick=async()=>{if(confirm('حذف رسالتك؟ ستبقى نسخة تدقيق للإدارة.')){await api(`/api/me/trade-messages/${button.dataset.messageDelete}`,{method:'PATCH',body:{delete:true}});await openTradeConversation(id);}});
  panel.querySelectorAll('[data-message-edit]').forEach(button=>button.onclick=async()=>{const current=button.closest('.trade-chat-message').querySelector('p').textContent,next=prompt('عدّل رسالتك:',current);if(next===null||next.trim()===current.trim())return;try{await api(`/api/me/trade-messages/${button.dataset.messageEdit}`,{method:'PATCH',body:{content:next}});await openTradeConversation(id);}catch(error){alert(error.message);}});
  panel.querySelectorAll('[data-completion-answer]').forEach(button=>button.onclick=()=>tradeButtonAction(button,`/api/me/trades/${item.trade.code}/completion-answer`,{conversationId:id,answer:button.dataset.completionAnswer},()=>openTradeConversation(id)));
  panel.querySelector('[data-completion-request]')?.addEventListener('click',event=>tradeButtonAction(event.currentTarget,`/api/me/trades/${item.trade.code}/completion`,{conversationId:id},()=>openTradeConversation(id)));
  panel.querySelectorAll('[data-trade-review]').forEach(button=>button.onclick=async()=>{const comment=prompt('تعليق اختياري على الصفقة:','');if(comment===null)return;try{await api(`/api/me/trades/${item.trade.code}/reviews`,{method:'POST',body:{conversationId:id,rating:Number(button.dataset.tradeReview),comment:comment||undefined}});alert('✅ تم حفظ تقييمك.');}catch(error){alert(error.message);}});
  panel.querySelector('[data-conversation-report]')?.addEventListener('click',()=>submitTradeReport(item.trade,id,other.id));
  panel.querySelector('.trade-chat-log').scrollTop=panel.querySelector('.trade-chat-log').scrollHeight;
}
function tradeMessageHtml(message,userId){return `<article class="trade-chat-message ${message.senderId===userId?'mine':'theirs'}"><header><b>${escapeHtml(message.sender.displayName)}</b><time>${new Date(message.createdAt).toLocaleString('ar')}</time></header><p>${message.deletedAt?'<i>تم حذف الرسالة</i>':escapeHtml(message.content)}</p>${message.editedAt&&!message.deletedAt?'<small>معدلة</small>':''}${message.senderId===userId&&!message.deletedAt?`<button data-message-edit="${message.id}" type="button">تعديل</button><button data-message-delete="${message.id}" type="button">حذف</button>`:''}</article>`}

async function loadTradeNotifications(markRead=false){if(!me)return;const data=await api('/api/me/trade-notifications');$('trade-notification-count').hidden=!data.unread;$('trade-notification-count').textContent=data.unread;$('trade-notifications').innerHTML=data.notifications.length?data.notifications.map(item=>`<article class="admin-room ${item.readAt?'':'notification-unread'}"><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.body)} · ${new Date(item.createdAt).toLocaleString('ar')}</small></div>${item.tradeId?'<span class="trade-code">Trade</span>':''}</article>`).join(''):empty('لا توجد إشعارات Trade.');if(markRead&&data.unread){await api('/api/me/trade-notifications/read',{method:'POST'});$('trade-notification-count').hidden=true;}}

async function submitTradeReport(trade,conversationId,reportedUserId){if(!me){location.href='/auth/discord';return;}const details=prompt('اشرح المشكلة باختصار. ستُحفظ لقطة من المحادثة كدليل:');if(details===null)return;const reason=prompt('السبب: SCAM_FRAUD / HARASSMENT / MISLEADING_TRADE / SPAM / PROHIBITED_CONTENT / OTHER','OTHER');if(!reason)return;try{await api(`/api/me/trades/${trade.code}/reports`,{method:'POST',body:{conversationId,reportedUserId,reason,details}});alert('✅ تم إرسال البلاغ للإدارة مع حفظ الأدلة.');}catch(error){alert(error.message);}}
function tradeStatusLabel(status){return{OPEN:'مفتوح',PENDING:'قيد التفاوض',COMPLETION_PENDING:'بانتظار التأكيد',COMPLETED:'مكتمل',CANCELLED:'ملغي',EXPIRED:'منتهي',DISPUTED:'نزاع',REMOVED:'محذوف إداريًا'}[status]||status}
function tradeInterestLabel(status){return{PENDING:'بانتظارك',ACCEPTED:'مقبول',DECLINED:'مرفوض',CANCELLED:'ملغي'}[status]||status}
async function imageFileToDataUrlStrict(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('المسموح PNG أو JPG أو WEBP فقط.');
  if(file.size>25_000_000)throw new Error('الصورة أكبر من 25MB. اختر صورة أصغر حتى لا يتوقف المتصفح.');
  const targetBytes=950_000;
  if(file.size<=targetBytes)return{dataUrl:await readFileAsDataUrl(file),size:file.size,compressed:false};
  const bitmap=await loadImageBitmap(file);let width=bitmap.width,height=bitmap.height;const maxSide=1800;if(Math.max(width,height)>maxSide){const scale=maxSide/Math.max(width,height);width=Math.round(width*scale);height=Math.round(height*scale);}
  const canvas=document.createElement('canvas');const context=canvas.getContext('2d',{alpha:false});if(!context){bitmap.close?.();throw new Error('متصفحك لا يدعم ضغط الصور.');}
  let blob=null,quality=.88;
  for(let attempt=0;attempt<10;attempt+=1){canvas.width=Math.max(320,Math.round(width));canvas.height=Math.max(320,Math.round(height));context.fillStyle='#111';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);blob=await canvasToBlob(canvas,'image/webp',quality)||await canvasToBlob(canvas,'image/jpeg',quality);if(blob&&blob.size<=targetBytes)break;quality=Math.max(.42,quality-.09);if(attempt>=4){width*=.84;height*=.84;}}
  bitmap.close?.();if(!blob||blob.size>1_200_000)throw new Error('تعذر ضغط هذه الصورة. جرّب صورة أوضح أو أصغر.');return{dataUrl:await readFileAsDataUrl(blob),size:blob.size,compressed:true};
}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});}
async function loadImageBitmap(file){if('createImageBitmap'in window)return createImageBitmap(file);const url=URL.createObjectURL(file);try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('ملف الصورة تالف أو غير مدعوم.'));image.src=url;});}finally{URL.revokeObjectURL(url);}}
function canvasToBlob(canvas,type,quality){return new Promise(resolve=>canvas.toBlob(resolve,type,quality));}
function formatFileSize(bytes){return bytes>=1_000_000?`${(bytes/1_000_000).toFixed(1)}MB`:`${Math.max(1,Math.round(bytes/1000))}KB`;}

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
async function api(path,options={}){
  const response=await fetch(path,{method:options.method||'GET',credentials:'same-origin',headers:options.body?{'content-type':'application/json'}:undefined,body:options.body?JSON.stringify(options.body):undefined,keepalive:Boolean(options.keepalive)});
  const text=await response.text();let body;
  try{body=text?JSON.parse(text):undefined}catch{}
  if(!response.ok)throw new Error(typeof body?.error==='string'?body.error:`تعذر تنفيذ الطلب (${response.status})`);
  if(response.status!==204&&(body===undefined||(body!==null&&typeof body!=='object')))throw new Error('وصلت استجابة غير صالحة من الخادم. حاول مجدداً بعد قليل.');
  return body;
}
function showFatal(error){
  console.error(error);
  const target=document.querySelector('main');
  if(!target)return;
  target.querySelector('.connection-error')?.remove();
  document.querySelectorAll('.loading-card').forEach(node=>{node.className='empty-state';node.textContent='تعذر تحميل المحتوى حاليًا.';});
  if($('play-zark'))$('play-zark').disabled=true;
  if($('game-count'))$('game-count').textContent='غير متصل';
  target.insertAdjacentHTML('afterbegin','<div class="connection-error" role="alert"><div><b>تعذر تحميل البيانات</b><p>تحقق من اتصالك وحاول مرة ثانية.</p></div><button class="button ghost small" id="retry-page" type="button">إعادة المحاولة ↻</button></div>');
  $('retry-page').onclick=()=>location.reload();
}
