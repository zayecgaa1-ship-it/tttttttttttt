const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
let state;
let me;
let roomFilter = 'all';
let roomSearch = '';
let activeUserTicket;
let activeAdminTicket;
let reportPresenceTimer;
let reportPresenceBound=false;
let adminZarkContent=[];
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
  me = (await api('/api/me')).user;
  renderShell();
  state = await api('/api/state');
  await renderPage();
  renderOnboarding();
  const stream = new EventSource('/api/stream');
  let timer;
  stream.onmessage = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { try{state = await api('/api/state');await renderPage(true);}catch(error){console.error('Realtime refresh failed',error)} }, 500);
  };
}

function renderShell() {
  const links = [['home','/','الرئيسية'],['lfg','/lfg.html','LFG'],['games','/games.html','الألعاب'],['leaderboard','/leaderboard.html','التصنيف'],['profile','/profile.html','ملفي'],['reports','/reports.html','الدعم']];
  if (me?.isAdmin) links.push(['admin','/admin.html','الإدارة']);
  if (me?.isOwner) links.push(['security','/security.html','الحماية']);
  $('site-nav').innerHTML = `<nav class="site-nav shell"><a class="brand" href="/"><img class="brand-logo" src="/assets/zark-bot-avatar.png" alt="Zark LFG System"><span>ZARK LFG SYSTEM<small>PLAY. CONNECT. COMPETE.</small></span></a><div class="nav-links" id="nav-links">${links.map(([key,href,label]) => `<a class="${page===key?'active':''}" href="${href}">${label}</a>`).join('')}</div><div class="nav-user">${me ? `<a href="/profile.html">${me.avatarUrl?`<img src="${escapeHtml(me.avatarUrl)}" alt="">`:''}<span>${escapeHtml(me.displayName)}</span></a><a class="button ghost small" href="/auth/logout">خروج</a>` : `<a class="button primary small" href="/auth/discord">دخول Discord</a>`}<button class="mobile-menu" id="mobile-menu" aria-label="القائمة">☰</button></div></nav>`;
  $('site-footer').innerHTML = `<div class="site-footer"><div class="footer-inner shell"><span class="footer-brand">ZARK <b>LFG</b> SYSTEM</span><span>فريقك أقرب مما تتخيل.</span><div class="footer-links"><a href="/reports.html">الدعم</a>${me?.isAdmin?'<a href="/admin.html">الإدارة</a>':''}${me?.isOwner?'<a href="/security.html">الحماية</a>':''}</div></div></div>`;
  $('nav-links').insertAdjacentHTML('beforeend', '<a class="discord-nav-link" href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">Discord ↗</a>');
  $('mobile-menu').insertAdjacentHTML('beforebegin', '<button class="nav-tutorial-button" id="open-onboarding" type="button">؟ كيف أستخدمه</button>');
  document.querySelector('.footer-links')?.insertAdjacentHTML('beforeend', '<a href="https://discord.gg/jXpQDhhdaB" target="_blank" rel="noopener noreferrer">انضم إلى Discord ↗</a>');
  $('mobile-menu').onclick = () => $('nav-links').classList.toggle('open');
  $('open-onboarding').onclick = () => renderOnboarding(true);
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

async function renderPage(realtime = false) {
  if (page === 'home') renderHome();
  if (page === 'lfg') await renderLfg(realtime);
  if (page === 'games') renderGames();
  if (page === 'profile') await renderProfile();
  if (page === 'leaderboard') await renderLeaderboard('game');
  if (page === 'reports') await renderReports();
  if (page === 'admin' && !realtime) await bindAdmin();
  if (page === 'security' && !realtime) await bindSecurity();
}

async function bindSecurity(){
  const gate=$('security-gate'),content=$('security-content');
  try{
    const dashboard=await api('/api/security/dashboard');
    gate.hidden=true;content.hidden=false;
    const c=dashboard.counts;
    $('security-stats').innerHTML=statCards([[dashboard.protection.active?'ACTIVE':'OFF','الحماية'],[dashboard.suspensions.filter(item=>item.status==='SUSPENDED').length,'إدمن معلّق'],[c.bans||0,'Ban آخر 60 دقيقة'],[c.timeouts||0,'Timeout آخر 60 دقيقة'],[dashboard.alerts.filter(item=>item.severity==='CRITICAL').length,'تنبيه خطير']]);
    $('security-events').innerHTML=dashboard.actions.length?dashboard.actions.map(item=>`<article class="admin-room"><div><b>${escapeHtml(item.severity)} · ${escapeHtml(item.actionType)}</b><small>${escapeHtml(item.executorId||'غير مؤكد')} ← ${escapeHtml(item.targetId||'-')} · ${new Date(item.timestamp).toLocaleString('ar')}</small><small>${escapeHtml(item.reason||'بدون سبب')}</small></div></article>`).join(''):empty('لا توجد أحداث حماية بعد.');
    $('security-suspensions').innerHTML=dashboard.suspensions.length?dashboard.suspensions.map(item=>`<article class="admin-room"><div><b>${escapeHtml(item.userId)} · ${escapeHtml(item.status)}</b><small>${escapeHtml(item.reason)} · ${new Date(item.suspendedAt).toLocaleString('ar')}</small><small>الرتب المحفوظة: ${item.roleSnapshots.map(role=>escapeHtml(role.roleName||role.roleId)).join('، ')||'لا توجد'}</small></div>${item.status==='SUSPENDED'?`<button class="button primary small" data-security-restore="${item.userId}">استرجاع الرتب</button>`:'<span class="live-chip">تم الاسترجاع</span>'}</article>`).join(''):empty('لا توجد إدارات معلّقة.');
    const s=dashboard.settings;['enabled','maxBansPerHour','maxTimeoutsPerHour','maxKicksPerHour','maxRoleChangesPerHour','maxChannelDeletesPerHour','maxWebhookChangesPerHour','ownerDmAlertsEnabled','securityLogChannelId'].forEach(key=>{const input=$(`security-${key}`);if(!input)return;input.type==='checkbox'?input.checked=Boolean(s[key]):input.value=s[key]??''});$('security-operationalExemptUserIds').value=(s.operationalExemptUserIds||[]).join(', ');
    $('security-settings-form').onsubmit=async event=>{event.preventDefault();const body={enabled:$('security-enabled').checked,maxBansPerHour:Number($('security-maxBansPerHour').value),maxTimeoutsPerHour:Number($('security-maxTimeoutsPerHour').value),maxKicksPerHour:Number($('security-maxKicksPerHour').value),maxRoleChangesPerHour:Number($('security-maxRoleChangesPerHour').value),maxChannelDeletesPerHour:Number($('security-maxChannelDeletesPerHour').value),maxWebhookChangesPerHour:Number($('security-maxWebhookChangesPerHour').value),ownerDmAlertsEnabled:$('security-ownerDmAlertsEnabled').checked,securityLogChannelId:$('security-securityLogChannelId').value.trim()||null,operationalExemptUserIds:$('security-operationalExemptUserIds').value.split(/[\s,،]+/).filter(Boolean)};try{await api('/api/security/settings',{method:'PUT',body});$('security-result').textContent='✅ تم حفظ إعدادات الحماية.';}catch(error){$('security-result').textContent=`❌ ${error.message}`;}};
    document.querySelectorAll('[data-security-restore]').forEach(button=>button.onclick=async()=>{if(!confirm('استرجاع الرتب الأصلية القابلة للإدارة فقط؟'))return;await api(`/api/security/suspensions/${button.dataset.securityRestore}/restore`,{method:'POST'});await bindSecurity();});
  }catch(error){gate.innerHTML=`<span>🔒</span><h1>الحماية للمالك فقط</h1><p>${escapeHtml(error.message)}</p>`;}
}

function renderHome() {
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
    $('room-game').innerHTML = games.map(game => `<option value="${escapeHtml(game.slug)}">${escapeHtml(game.icon||'🎮')} ${escapeHtml(game.name)}</option>`).join('');
    $('room-game').onchange=updateRobloxMapField;updateRobloxMapField();
    $('lfg-filters').innerHTML = `<button class="active" data-filter="all">الكل</button>${catalog.map(category => `<button data-filter="${escapeHtml(category.slug)}">${escapeHtml(category.icon||'🎮')} ${escapeHtml(category.name)}</button>`).join('')}`;
    document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { roomFilter=button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button)); renderRoomList(); });
    const initialSearch=new URLSearchParams(location.search).get('room')||new URLSearchParams(location.search).get('q')||'';$('room-search').value=initialSearch;roomSearch=normalizeRoomSearch(initialSearch);
    $('room-search').oninput = () => { roomSearch=normalizeRoomSearch($('room-search').value); renderRoomList(); };
    $('close-room-manager').onclick = () => $('room-manager').hidden=true;
    bindCreateRoom();
  }
  renderRoomList();
  if(!realtime)await renderInterests(games);
}

function renderRoomList() {
  const categories = new Map((state.lfgCatalog||[]).flatMap(category => category.games.map(game => [game.slug, category.slug])));
  const rooms = (state.rooms||[]).filter(room => {
    if (roomFilter!=='all' && categories.get(room.gameSlug)!==roomFilter) return false;
    if (!roomSearch) return true;
    return smartRoomMatch(room,roomSearch);
  });
  $('room-count').textContent = `${rooms.length} LIVE`;
  $('rooms').innerHTML = rooms.length ? rooms.map(room => {
    const finished=['COMPLETED','CLOSED'].includes(room.status);
    const status=room.status==='SCHEDULED'?'مجدولة':room.status==='ACTIVE'?'يلعبون الآن':room.status==='COMPLETED'?'انتهت':room.status==='CLOSED'?'مغلقة':room.status==='FULL'?'مكتملة':'تجمع';
    const players=(room.members||[]).map(member=>`<span class="room-player ${member.voiceActive?'voice':''}">${avatar(member.avatarUrl,member.displayName,'mini')}${member.id===room.hostId?'👑':member.voiceActive?'🎙️':'●'} ${escapeHtml(member.displayName)}</span>`).join('')||'<span class="room-player muted">بانتظار اللاعبين</span>';
    const remaining=formatRoomTiming(room);
    return `<article class="room-card detailed" style="--room-accent:${escapeHtml(room.accentColor||'#e50914')}"><div><div class="room-top"><span class="game-icon">${escapeHtml(room.roomEmoji||room.gameIcon||'🎮')}</span><span class="room-status status-${room.status.toLowerCase()}">${status}</span></div><h3>${escapeHtml(room.title||room.gameName)}</h3><div class="room-meta host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')}<span>${escapeHtml(room.gameName)} · Host: <b>${escapeHtml(room.hostName)}</b> · ${room.needsVoice?'🎙️ Voice':'💬 Text'} ${room.mapName?`· 🗺️ ${escapeHtml(room.mapName)}`:''} ${room.gameMode?`· ${escapeHtml(room.gameMode)}`:''}</span></div><div class="room-players">${players}</div><div class="room-progress"><i style="width:${Math.min(100,room.currentPlayers/room.maxPlayers*100)}%"></i></div><div class="room-bottom"><span>${room.currentPlayers}/${room.maxPlayers} لاعبين</span><span>⏱️ ${remaining}</span></div></div><div class="room-actions"><button class="button primary small" data-join="${room.id}" ${finished||room.locked||room.currentPlayers>=room.maxPlayers?'disabled':''}>${room.status==='SCHEDULED'?'تسجيل':'دخول'}</button><button class="button ghost small" data-leave="${room.id}" ${finished?'disabled':''}>${room.status==='SCHEDULED'?'إلغاء التسجيل':'خروج'}</button>${room.voiceChannelId&&state.guildId?`<a class="button ghost small" href="https://discord.com/channels/${escapeHtml(state.guildId)}/${escapeHtml(room.voiceChannelId)}" target="_blank" rel="noreferrer">Voice</a>`:''}${me?.userId===room.hostId&&!finished?`<button class="button ghost small" data-manage="${room.id}">إدارة</button>`:''}</div></article>`;
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
      result.textContent=`تم إنشاء غرفة ${room.gameName} بنجاح.`; state.rooms.unshift(room); renderRoomList();
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
  $('interest-games').innerHTML = games.map(game=>{const pref=map.get(game.slug);const interested=pref?.interestStatus==='INTERESTED';const sleeping=pref?.mutedUntil&&new Date(pref.mutedUntil)>new Date();const autoInvites=pref?.autoInvitesEnabled!==false;return `<article class="interest-card"><header><span>${escapeHtml(game.icon||'🎮')}</span><h3>${escapeHtml(game.name)}</h3></header>${sleeping?`<small class="snooze-status">😴 غفوة حتى ${new Date(pref.mutedUntil).toLocaleString('ar',{timeStyle:'short',dateStyle:'short'})}</small>`:''}<div class="interest-actions"><button class="${interested?'on':''}" data-interest="${game.slug}" data-interested="${interested}">❤️ ${interested?'إلغاء الاهتمام':'مهتم'}</button><button class="${pref?.notificationsEnabled?'on':''}" data-notify="${game.slug}">${pref?.notificationsEnabled?'🔔 إيقاف الإشعار':'🔕 تشغيل الإشعار'}</button></div><div class="interest-actions"><button class="${autoInvites?'on':''}" data-auto-invite="${game.slug}">🤖 ${autoInvites?'دعوات Zark مفعلة':'دعوات Zark متوقفة'}</button></div><div class="snooze-actions"><select data-snooze-select="${game.slug}"><option value="60">ساعة</option><option value="480">8 ساعات</option><option value="1440">يوم</option><option value="10080">أسبوع</option></select><button data-snooze="${game.slug}">😴 غفوة</button></div></article>`}).join('');
  document.querySelectorAll('[data-interest]').forEach(button=>button.onclick=()=>{const next=button.dataset.interested!=='true';setWebPreference(button.dataset.interest,next,next,button)});
  document.querySelectorAll('[data-notify]').forEach(button=>button.onclick=()=>setWebPreference(button.dataset.notify,true,!map.get(button.dataset.notify)?.notificationsEnabled,button));
  document.querySelectorAll('[data-auto-invite]').forEach(button=>button.onclick=()=>setWebPreference(button.dataset.autoInvite,true,Boolean(map.get(button.dataset.autoInvite)?.notificationsEnabled),button,!Boolean(map.get(button.dataset.autoInvite)?.autoInvitesEnabled)));
  document.querySelectorAll('[data-snooze]').forEach(button=>button.onclick=()=>snoozeWebPreference(button.dataset.snooze,Number(document.querySelector(`[data-snooze-select="${button.dataset.snooze}"]`).value),button));
}

async function setWebPreference(gameSlug,interested,notificationsEnabled,button,autoInvitesEnabled){if(!me){location.href='/auth/discord';return;}if(button?.disabled)return;if(button)button.disabled=true;try{await api(`/api/me/lfg-preferences/${gameSlug}`,{method:'PUT',body:{interested,notificationsEnabled,...(autoInvitesEnabled===undefined?{}:{autoInvitesEnabled})}});await renderInterests(state.lfgGames||[]);}catch(error){alert(error.message);if(button)button.disabled=false;}}
async function snoozeWebPreference(gameSlug,minutes,button){if(!me){location.href='/auth/discord';return;}if(button?.disabled)return;if(button)button.disabled=true;try{await api(`/api/me/lfg-preferences/${gameSlug}/snooze`,{method:'POST',body:{minutes}});await renderInterests(state.lfgGames||[]);}catch(error){alert(error.message);if(button)button.disabled=false;}}

function renderGames() {
  $('zark-games').innerHTML = (state.zarkGames||[]).map(game=>`<button class="game-tile" data-game="${escapeHtml(game.slug)}"><div class="game-cover"><span>${escapeHtml(game.icon||gameIcon(game.slug))}</span><small>أول إجابة تفوز</small></div><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description||'تحدٍ سريع داخل Discord')}</p><footer><span>${Math.max(400,Number(game.questionCount)||0)}+ سؤال</span><span>.${escapeHtml(game.aliases?.[0]||game.name)}</span></footer></button>`).join('');
  document.querySelectorAll('[data-game]').forEach(button=>button.onclick=()=>startRace(button.dataset.game));
  $('play-zark').onclick=()=>startRace();
}

async function startRace(gameSlug){const game=(state.zarkGames||[]).find(item=>item.slug===gameSlug);$('race-title').textContent=game?.name||'لعبة Zark سريعة';$('race-prompt').textContent='ابدأ الجولة داخل Discord حتى تظهر للجميع ويستطيع Zark احتساب أول فائز.';$('race-note').textContent='استخدم /play أو الأمر العربي المختصر داخل قناة الألعاب.';}

async function renderProfile(){
  if(!me)return;
  const [data,availability]=await Promise.all([api('/api/me/profile'),api('/api/me/availability')]);
  $('profile-guest').hidden=true;$('profile-content').hidden=false;
  $('profile-name').textContent=data.displayName;$('profile-level').textContent=`LV ${data.zark.level}`;$('profile-rating').textContent=data.lfg.rating.average?`${data.lfg.rating.average} ⭐ من ${data.lfg.rating.count} تقييم`:'لا يوجد تقييم بعد';$('profile-bio').textContent=data.settings.bio||'أضف نبذة قصيرة عن أسلوب لعبك.';
  $('profile-avatar').src=data.avatarUrl||'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23222"/%3E%3C/svg%3E';$('profile-head').style.setProperty('--profile-accent',data.settings.profileAccent);
  $('profile-stats').innerHTML=statCards([[data.zark.xp,'Zark XP'],[data.loyalty?.points||0,'نقاط الولاء'],[formatDuration(data.lfg.voiceSeconds),'وقت Voice'],[data.lfg.completedSessions,'جلسة مكتملة']]);
  const loyalty=await api('/api/me/loyalty');const next=loyalty.nextTier?`التالي: ${loyalty.nextTier.name} عند ${loyalty.nextTier.threshold}`:'وصلت أعلى رتبة ولاء';$('profile-loyalty').innerHTML=`<p><b>${loyalty.points} نقطة</b> · ${loyalty.tier.name}</p><small>${next}</small><p>${loyalty.vipUnlocked?'✅ رتبة VIP مفعلة':'VIP مقابل '+loyalty.vipPrice+' نقطة'}</p>${loyalty.vipUnlocked?'':`<button id="buy-vip" class="button primary" ${loyalty.points<loyalty.vipPrice?'disabled':''}>شراء VIP</button>`}`;const buy=$('buy-vip');if(buy)buy.onclick=async()=>{buy.disabled=true;try{await api('/api/me/loyalty/buy-vip',{method:'POST'});await renderProfile();}catch(error){alert(error.message);buy.disabled=false;}};
  $('profile-zark-games').innerHTML=data.zark.games.length?data.zark.games.slice(0,8).map(game=>dataRow(game.name,`${game.xp} XP · ${game.wins}W`)).join(''):empty('لا توجد مباريات بعد');
  $('profile-favorites').innerHTML=data.lfg.favoriteGames.length?data.lfg.favoriteGames.map(game=>dataRow(`${game.icon||'🎮'} ${game.name}`,`${game.sessions} جلسة`)).join(''):empty('لا توجد جلسات بعد');
  $('profile-active-rooms').innerHTML=data.lfg.activeRooms.length?data.lfg.activeRooms.map(room=>dataRow(`${room.gameIcon||'🎮'} ${room.gameName}`,`${room.isHost?'Host · ':''}${room.status}`)).join(''):empty('لست داخل غرفة الآن');
  $('profile-interests').innerHTML=data.lfg.interests.length?data.lfg.interests.map(game=>`<span class="chip">${escapeHtml(game.icon||'🎮')} ${escapeHtml(game.name)} ${game.notificationsEnabled?'🔔':'🔕'}</span>`).join(''):empty('لم تحدد اهتماماتك بعد');
  $('profile-setting-bio').value=data.settings.bio||'';$('profile-setting-accent').value=data.settings.profileAccent;$('profile-setting-visible').checked=data.settings.activityVisible;$('profile-setting-rival').checked=data.settings.rivalNotificationsEnabled;
  $('profile-settings-form').onsubmit=async event=>{event.preventDefault();const result=$('profile-settings-result');result.textContent='جارِ الحفظ...';try{const saved=await api('/api/me/profile/settings',{method:'PUT',body:{bio:$('profile-setting-bio').value||null,profileAccent:$('profile-setting-accent').value,activityVisible:$('profile-setting-visible').checked,rivalNotificationsEnabled:$('profile-setting-rival').checked}});$('profile-head').style.setProperty('--profile-accent',saved.profileAccent);$('profile-bio').textContent=saved.bio||'أضف نبذة قصيرة عن أسلوب لعبك.';result.textContent='✅ تم حفظ ملفك وخصوصيتك.';}catch(error){result.textContent=`❌ ${error.message}`;}};
  bindAvailability(availability);
}

function bindAvailability(availability){
  const days=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  $('availability-activity').value=availability.currentActivity;$('availability-mentions').value=availability.mentionPolicy;$('availability-note').value=availability.activityNote||'';$('availability-until').value=availability.activityUntil?localDateTime(availability.activityUntil):'';
  $('availability-current').textContent=`الحالة الآن: ${availabilityText(availability.currentActivity)}${availability.activityUntil?` · حتى ${new Date(availability.activityUntil).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`:''}`;
  document.querySelectorAll('[data-availability-quick]').forEach(button=>button.onclick=async()=>{const[activity,minutesText]=button.dataset.availabilityQuick.split(':'),minutes=Number(minutesText);const result=$('availability-result');result.textContent='جارِ تحديث حالتك...';try{const saved=await api('/api/me/availability',{method:'PUT',body:{currentActivity:activity,activityUntil:minutes?new Date(Date.now()+minutes*60_000).toISOString():null,activityNote:null,mentionPolicy:availability.mentionPolicy}});bindAvailability(saved);result.textContent='✅ تم تحديث حالتك فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}});
  const slots=new Map((availability.weeklyAvailability||[]).map(slot=>[slot.dayOfWeek,slot]));
  $('weekly-availability').innerHTML=days.map((day,index)=>{const slot=slots.get(index);return `<label class="weekly-row"><input type="checkbox" data-weekly-enabled="${index}" ${slot?'checked':''}><b>${day}</b><span class="weekly-time-label">فاضي من</span><input type="time" data-weekly-start="${index}" value="${minutesToTime(slot?.startMinute??1200)}"><span>حتى</span><input type="time" data-weekly-end="${index}" value="${minutesToTime(slot?.endMinute??1380)}"></label>`}).join('');
  $('availability-form').onsubmit=async event=>{event.preventDefault();const result=$('availability-result');result.textContent='جارِ حفظ وقت فراغك...';const weeklyAvailability=days.flatMap((_,dayOfWeek)=>{if(!document.querySelector(`[data-weekly-enabled="${dayOfWeek}"]`).checked)return[];return[{dayOfWeek,startMinute:timeToMinutes(document.querySelector(`[data-weekly-start="${dayOfWeek}"]`).value),endMinute:timeToMinutes(document.querySelector(`[data-weekly-end="${dayOfWeek}"]`).value),activity:'FREE'}]});try{const until=$('availability-until').value;const saved=await api('/api/me/availability',{method:'PUT',body:{currentActivity:$('availability-activity').value,activityUntil:until?new Date(until).toISOString():null,activityNote:$('availability-note').value||null,mentionPolicy:$('availability-mentions').value,weeklyAvailability}});bindAvailability(saved);result.textContent='✅ تم تحديث حالتك وجدولك الأسبوعي فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}};
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
    const [dashboard,smartRooms,smartHistory]=await Promise.all([api('/api/web-admin/dashboard'),api('/api/web-admin/smart-rooms'),api('/api/web-admin/smart-rooms/history')]);
    gate.hidden=true;content.hidden=false;
    const stats=dashboard.stats;
    $('admin-stats').innerHTML=statCards([[stats.users,'مستخدم'],[stats.openRooms,'غرفة مفتوحة'],[stats.completedRooms,'جلسة مكتملة'],[stats.pendingReports+stats.openBugs,'بلاغ يحتاج مراجعة']]);
    $('admin-system-status').textContent=dashboard.system.botOnline?'● البوت Online':'● البوت Offline';$('admin-system-status').classList.toggle('offline',!dashboard.system.botOnline);
    $('admin-service-grid').innerHTML=[['API',dashboard.system.apiOnline,'متصل'],['PostgreSQL',dashboard.system.databaseOnline,'متصل'],['Discord Bot',dashboard.system.botOnline,'متصل'],[dashboard.system.aiProvider||'AI مجاني',dashboard.system.aiConfigured,dashboard.system.aiConfigured?'تحويل تلقائي مفعّل':'أضف مفتاح Gemini أو Groq أو OpenRouter']].map(([name,online,label])=>`<article><span class="service-dot ${online?'online':'offline'}"></span><b>${name}</b><small>${online?label:label||'غير متصل'}</small></article>`).join('');
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
    const query=new URLSearchParams(location.search),kind=query.get('reportKind'),id=query.get('reportId');
    if((kind==='PLAYER'||kind==='BUG')&&id){showAdminTab('reports');await openAdminReport(kind,id).catch(()=>undefined);}
  }catch(error){gate.innerHTML=`<span>⛔</span><h1>تعذر فتح اللوحة</h1><p>${escapeHtml(error.message)}</p>`;return;}

  $('admin-settings-form').onsubmit=async event=>{
    event.preventDefault();
    const body={
      botName:$('setting-bot-name').value.trim(),tagline:$('setting-tagline').value.trim(),
      lfgChannelId:channelValue('setting-lfg-channel'),lfgCategoryId:channelValue('setting-lfg-category'),publicChannelId:channelValue('setting-public-channel'),dailyChannelId:channelValue('setting-daily-channel'),leaderboardChannelId:channelValue('setting-leaderboard-channel'),reportChannelId:channelValue('setting-report-channel'),websiteUrl:$('setting-website-url').value.trim(),
      dmNotificationsEnabled:$('setting-dm-enabled').checked,quickMatchEnabled:$('setting-quick-match').checked,autoSmartRoomsEnabled:$('setting-auto-smart-rooms').checked,autoRoomIntervalMinutes:Number($('setting-auto-room-interval').value),autoRoomMinimumInterested:Number($('setting-auto-room-minimum').value),autoRoomLifetimeMinutes:Number($('setting-auto-room-lifetime').value),maxAutoRoomsPerGame:Number($('setting-auto-room-max').value),autoRoomDmInterestedUsers:$('setting-auto-room-dm').checked,deleteExpiredAutoRooms:$('setting-auto-room-delete').checked,voiceEmptyGraceMinutes:Number($('setting-voice-empty-grace').value),singlePlayerIdleMinutes:Number($('setting-single-player-idle').value),waitingSessionTimeoutMinutes:Number($('setting-auto-room-lifetime').value),ratingsEnabled:$('setting-ratings').checked,reportsEnabled:$('setting-reports').checked,autoCreateRoomChannels:$('setting-auto-channels').checked,aiChatEnabled:$('setting-ai-enabled').checked,
      maxDmPerDay:Number($('setting-dm-limit').value),notificationCooldownMinutes:Number($('setting-dm-cooldown').value),maxActiveRoomsPerUser:Number($('setting-room-limit').value),defaultRoomDurationMinutes:Number($('setting-room-duration').value),roomGraceMinutes:Number($('setting-room-grace').value),aiDailyMessagesPerUser:Number($('setting-ai-message-limit').value),aiGlobalDailyMessages:Number($('setting-ai-global-message-limit').value),aiDailyTokenBudgetPerUser:Number($('setting-ai-user-limit').value),aiGlobalDailyTokenBudget:Number($('setting-ai-global-limit').value),aiMaxOutputTokens:Number($('setting-ai-output').value),
    };
    const result=$('admin-settings-result');result.textContent='جارِ تطبيق الإعدادات...';
    try{const saved=await api('/api/web-admin/settings',{method:'PUT',body});fillAdminSettings(saved);result.textContent='✅ تم الحفظ والتطبيق على البوت فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}
  };
  $('admin-ai-test').onclick=async()=>{const button=$('admin-ai-test'),result=$('admin-ai-test-result');button.disabled=true;result.textContent='جارِ فحص مزودي AI المجانيين...';try{const status=await api('/api/web-admin/ai/diagnostics',{method:'POST'});result.textContent=status.message;}catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
  $('admin-loyalty-event').onclick=async()=>{const button=$('admin-loyalty-event'),result=$('admin-loyalty-event-result');button.disabled=true;result.textContent='جارِ تشغيل الفعالية...';try{const event=await api('/api/web-admin/loyalty/boost',{method:'POST',body:{minutes:60}});result.textContent=`✅ ×${event.multiplier} حتى ${new Date(event.until).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`;}catch(error){result.textContent=`❌ ${error.message}`;}finally{button.disabled=false;}};
  $('admin-lfg-form').onsubmit=async event=>{event.preventDefault();const threshold=$('admin-game-auto-min').value;await submitForm(`/api/web-admin/lfg/games/${$('admin-game-slug').value}` ,{name:$('admin-game-name').value,description:$('admin-game-description').value||undefined,icon:$('admin-game-icon').value||undefined,categorySlug:$('admin-game-category').value||undefined,minPlayers:Number($('admin-game-min').value),maxPlayers:Number($('admin-game-max').value),autoMinAvailable:threshold?Number(threshold):null,enabled:true},$('admin-game-result'),'PUT');};
  $('admin-question-form').onsubmit=saveAdminQuestion;
  $('admin-question-cancel').onclick=resetAdminQuestionForm;
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
  $('admin-zark-game-summary').innerHTML=`<b>${escapeHtml(game.icon||gameIcon(game.slug))} ${escapeHtml(game.name)}</b><small>${game.builtInQuestionCount||400}+ سؤال داخلي · ${game.enabledCustomQuestionCount||0}/${game.customQuestionCount||0} سؤال إداري مفعّل</small><p>${escapeHtml(game.description||'لعبة تحدي داخل Discord')}</p>`;
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
  $('setting-dm-enabled').checked=settings.dmNotificationsEnabled;$('setting-quick-match').checked=settings.quickMatchEnabled;$('setting-auto-smart-rooms').checked=settings.autoSmartRoomsEnabled;$('setting-ratings').checked=settings.ratingsEnabled;$('setting-reports').checked=settings.reportsEnabled;$('setting-auto-channels').checked=settings.autoCreateRoomChannels;$('setting-ai-enabled').checked=settings.aiChatEnabled;
  $('setting-auto-room-interval').value=settings.autoRoomIntervalMinutes||120;$('setting-auto-room-minimum').value=settings.autoRoomMinimumInterested||2;$('setting-auto-room-lifetime').value=settings.autoRoomLifetimeMinutes||120;$('setting-auto-room-max').value=settings.maxAutoRoomsPerGame||1;$('setting-auto-room-dm').checked=settings.autoRoomDmInterestedUsers!==false;$('setting-auto-room-delete').checked=settings.deleteExpiredAutoRooms!==false;$('setting-voice-empty-grace').value=settings.voiceEmptyGraceMinutes||5;$('setting-single-player-idle').value=settings.singlePlayerIdleMinutes||15;
  $('setting-dm-limit').value=settings.maxDmPerDay;$('setting-dm-cooldown').value=settings.notificationCooldownMinutes;$('setting-room-limit').value=settings.maxActiveRoomsPerUser;$('setting-room-duration').value=settings.defaultRoomDurationMinutes;$('setting-room-grace').value=settings.roomGraceMinutes;$('setting-ai-message-limit').value=settings.aiDailyMessagesPerUser||60;$('setting-ai-global-message-limit').value=settings.aiGlobalDailyMessages||5000;$('setting-ai-user-limit').value=settings.aiDailyTokenBudgetPerUser||50000;$('setting-ai-global-limit').value=settings.aiGlobalDailyTokenBudget||1000000;$('setting-ai-output').value=settings.aiMaxOutputTokens||250;
}

function channelValue(id){const value=$(id).value.trim();return value||null;}
function imageFileToDataUrl(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(new Error('اختر ملف صورة فقط.'));if(file.size>1_500_000)return reject(new Error('الصورة أكبر من 1.5MB.'));const reader=new FileReader();reader.onerror=()=>reject(new Error('تعذر قراءة الصورة.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});}

async function submitForm(path,body,result,method='POST'){result.textContent='جارِ الإرسال...';try{await api(path,{method,body});result.textContent='✅ تم الحفظ بنجاح.';}catch(error){result.textContent=`❌ ${error.message}`;}}

function roomCard(room){return `<article class="room-card" style="--room-accent:${escapeHtml(room.accentColor||'#e50914')}"><div class="room-top"><span class="game-icon">${escapeHtml(room.roomEmoji||room.gameIcon||'🎮')}</span><span class="room-status">${room.status==='SCHEDULED'?'SCHEDULED':room.status==='ACTIVE'?'PLAYING':room.status==='COMPLETED'?'FINISHED':'LIVE'}</span></div><h3>${escapeHtml(room.title||room.gameName)}</h3><div class="room-meta host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')}<span>Host: ${escapeHtml(room.hostName)} · ${room.needsVoice?'🎙️ Voice':'💬 Text'}${room.mapName?` · 🗺️ ${escapeHtml(room.mapName)}`:''}</span></div><div class="room-players compact">${(room.members||[]).slice(0,4).map(member=>`<span class="room-player">${avatar(member.avatarUrl,member.displayName,'mini')}${escapeHtml(member.displayName)}</span>`).join('')}</div><div class="room-progress"><i style="width:${Math.min(100,room.currentPlayers/room.maxPlayers*100)}%"></i></div><div class="room-bottom"><span>${room.currentPlayers}/${room.maxPlayers} لاعبين</span><span>${formatRoomTiming(room)}</span></div></article>`}
function rankingRows(rows,key,label){return rows.length?rows.slice(0,10).map((row,index)=>`<div class="rank-row"><span class="rank">${index<3?['🥇','🥈','🥉'][index]:`#${index+1}`}</span><span class="rank-player">${avatar(row.avatarUrl,row.displayName,'rank')}<b>${escapeHtml(row.displayName)}</b></span><span>${formatValue(row[key])} ${label}</span></div>`).join(''):empty('لا توجد بيانات كافية بعد.');}
function statCards(items){return items.map(([value,label])=>`<article><b>${formatValue(value)}</b><span>${label}</span></article>`).join('')}
function dataRow(label,value){return `<div class="data-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`}
function gameIcon(slug){return {'translate':'🌐','flags':'🚩','capitals':'🌍','fast-type':'⌨️','complete-word':'🧩','word-order':'🔤','math':'🧮','emoji-guess':'😀','car-logos':'🚘','company-logos':'🏢','anime-silhouette':'🎭','game-logos':'🎮','true-false':'✅','letter-order':'🔡','who-am-i':'👤','trivia':'❓','riddles':'🧠','gaming-quiz':'🎯','animals':'🐾','science':'🔬','space':'🪐','football':'⚽','technology':'💻','movies':'🎬','series':'📺','music':'🎵','food':'🍕','nature':'🌿','colors':'🎨','languages':'🗣️','history':'🏛️','inventions':'💡','internet':'🌐','logic':'🧩','synonyms':'📝','antonyms':'↔️','countries':'🗺️','sports':'🏅','geography':'🌍','books':'📚'}[slug]||'🎮'}
function normalizeRoomSearch(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim()}
function smartRoomMatch(room,query){if(!query)return true;const canonical=Object.entries(roomSearchAliases).find(([,aliases])=>aliases.some(alias=>{const normalized=normalizeRoomSearch(alias);return query.includes(normalized)||normalized.includes(query)}))?.[0];const haystack=normalizeRoomSearch([room.id,room.gameName,room.gameSlug,room.hostName,room.title,room.gameMode,room.mapName,room.description,...(room.members||[]).map(member=>member.displayName)].filter(Boolean).join(' '));return haystack.includes(query)||(canonical&&room.gameSlug===canonical)}
function availabilityText(value){return{FREE:'🟢 فاضي للعب',PLAYING:'🎮 ألعب الآن',STUDYING:'📚 أدرس',WORKING:'💼 أعمل',BUSY:'⛔ مشغول',SLEEPING:'😴 نايم',AWAY:'🌙 غير متاح'}[value]||'غير محدد'}
function supportTokenLabel(status){const names={GEMINI:'Gemini',GROQ:'Groq',OPENROUTER:'OpenRouter'},provider=names[status.provider]||'مساعد Zark',remaining=Number.isFinite(status.remainingMessages)?` · ${formatValue(status.remainingMessages)} رسالة متبقية اليوم`:'';if(status.mode==='AI')return`${provider} متصل${remaining}`;if(status.mode==='ACTION')return`نفّذ Zark الطلب${remaining}`;if(status.aiError)return`تحويل تلقائي للمساعد المحلي${remaining}`;if(status.setupRequired||!status.provider)return`المساعد المحلي متاح${remaining}`;return`${provider} جاهز${remaining}`}
function empty(message){return `<div class="empty-state">${escapeHtml(message)}</div>`}
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
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
async function api(path,options={}){const response=await fetch(path,{method:options.method||'GET',credentials:'same-origin',headers:options.body?{'content-type':'application/json'}:undefined,body:options.body?JSON.stringify(options.body):undefined,keepalive:Boolean(options.keepalive)});const text=await response.text();let body;try{body=text?JSON.parse(text):null}catch{body={error:text}}if(!response.ok)throw new Error(body?.error||'تعذر تنفيذ الطلب');return body;}
function showFatal(error){console.error(error);const target=document.querySelector('main');if(target)target.insertAdjacentHTML('afterbegin',`<div class="shell"><div class="empty-state">تعذر الاتصال بـZark API: ${escapeHtml(error.message)}</div></div>`)}
