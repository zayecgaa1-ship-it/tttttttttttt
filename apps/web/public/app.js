const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
let state;
let me;
let roomFilter = 'all';
let roomSearch = '';
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
  const stream = new EventSource('/api/stream');
  let timer;
  stream.onmessage = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { state = await api('/api/state'); await renderPage(true); }, 120);
  };
}

function renderShell() {
  const links = [['home','/','الرئيسية'],['lfg','/lfg.html','LFG'],['games','/games.html','الألعاب'],['leaderboard','/leaderboard.html','التصنيف'],['profile','/profile.html','ملفي'],['reports','/reports.html','الدعم']];
  if (me?.isAdmin) links.push(['admin','/admin.html','الإدارة']);
  $('site-nav').innerHTML = `<nav class="site-nav shell"><a class="brand" href="/"><img class="brand-logo" src="/assets/zark-bot-avatar.png" alt="Zark LFG System"><span>ZARK LFG SYSTEM<small>PLAY. CONNECT. COMPETE.</small></span></a><div class="nav-links" id="nav-links">${links.map(([key,href,label]) => `<a class="${page===key?'active':''}" href="${href}">${label}</a>`).join('')}</div><div class="nav-user">${me ? `<a href="/profile.html">${me.avatarUrl?`<img src="${escapeHtml(me.avatarUrl)}" alt="">`:''}<span>${escapeHtml(me.displayName)}</span></a><a class="button ghost small" href="/auth/logout">خروج</a>` : `<a class="button primary small" href="/auth/discord">دخول Discord</a>`}<button class="mobile-menu" id="mobile-menu" aria-label="القائمة">☰</button></div></nav>`;
  $('site-footer').innerHTML = `<div class="site-footer"><div class="footer-inner shell"><span class="footer-brand">ZARK <b>LFG</b> SYSTEM</span><span>فريقك أقرب مما تتخيل.</span><div class="footer-links"><a href="/reports.html">الدعم</a>${me?.isAdmin?'<a href="/admin.html">الإدارة</a>':''}</div></div></div>`;
  $('mobile-menu').onclick = () => $('nav-links').classList.toggle('open');
  if(me&&!$('zark-ai-widget')){
    document.body.insertAdjacentHTML('beforeend',`<aside id="zark-ai-widget" class="zark-ai-widget"><button id="zark-ai-fab" class="zark-ai-fab" type="button" aria-label="مساعد Zark"><img src="/assets/zark-bot-avatar.png" alt=""><span>اسأل Zark</span></button><section id="zark-ai-panel" class="zark-ai-panel" hidden><header><img src="/assets/zark-bot-avatar.png" alt=""><div><b>مساعد Zark</b><small id="floating-ai-status">دعم ذكي</small></div><button id="zark-ai-close" type="button">×</button></header><div id="floating-ai-log" class="floating-ai-log"><article class="chat-message assistant">أهلًا ${escapeHtml(me.displayName)}! اسألني عن الغرف أو الألعاب المتاحة الآن.</article></div><form id="floating-ai-form"><input id="floating-ai-input" maxlength="500" placeholder="ماذا أستطيع أن ألعب الآن؟" required><button type="submit">إرسال</button></form></section></aside>`);
    bindFloatingSupport().catch(console.error);
  }
}

async function renderPage(realtime = false) {
  if (page === 'home') renderHome();
  if (page === 'lfg') await renderLfg(realtime);
  if (page === 'games') renderGames();
  if (page === 'profile') await renderProfile();
  if (page === 'leaderboard') await renderLeaderboard('game');
  if (page === 'reports') await renderReports();
  if (page === 'admin' && !realtime) await bindAdmin();
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
  await renderInterests(games);
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
  document.querySelectorAll('[data-join]').forEach(button => button.onclick = () => roomAction(button.dataset.join,'join'));
  document.querySelectorAll('[data-leave]').forEach(button => button.onclick = () => roomAction(button.dataset.leave,'leave'));
  document.querySelectorAll('[data-manage]').forEach(button => button.onclick = () => openRoomManager(button.dataset.manage));
}

function bindCreateRoom() {
  if (!me) { $('create-room-form').querySelectorAll('input,select,textarea,button').forEach(control=>control.disabled=true); return; }
  $('login-hint').hidden = true;
  const updateSchedule=()=>{const later=$('room-when').value==='later';$('room-schedule-label').hidden=!later;if(later){const date=nextScheduledDate(Number($('room-schedule-hour').value),$('room-schedule-period').value);$('room-schedule-preview').textContent=`الموعد تلقائيًا: ${date.toLocaleString('ar',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;}};
  $('room-when').onchange=updateSchedule;$('room-schedule-hour').onchange=updateSchedule;$('room-schedule-period').onchange=updateSchedule;updateSchedule();
  $('create-room-form').onsubmit = async event => {
    event.preventDefault();
    const result = $('create-room-result'); result.textContent='جارِ إنشاء التجمع...';
    try {
      const scheduledFor=$('room-when').value==='later'?nextScheduledDate(Number($('room-schedule-hour').value),$('room-schedule-period').value).toISOString():undefined;
      const room = await api('/api/me/lfg/rooms',{method:'POST',body:{gameSlug:$('room-game').value,maxPlayers:Number($('room-size').value),durationMinutes:Number($('room-duration').value),scheduledFor,mapName:$('room-game').value==='roblox'?$('room-map').value||undefined:undefined,gameMode:$('room-mode').value||undefined,description:$('room-description').value||undefined,needsVoice:$('room-voice').checked}});
      result.textContent=`تم إنشاء غرفة ${room.gameName} بنجاح.`; state.rooms.unshift(room); renderRoomList();
    } catch(error){result.textContent=error.message;}
  };
}

function nextScheduledDate(hour,period){let hours=hour%12;if(period==='PM')hours+=12;const date=new Date();date.setHours(hours,0,0,0);if(date.getTime()<Date.now()+2*60_000)date.setDate(date.getDate()+1);return date}

function updateRobloxMapField(){const roblox=$('room-game').value==='roblox';$('room-map-label').hidden=!roblox;$('room-map').required=roblox;if(!roblox)$('room-map').value='';}

async function roomAction(roomId, action) {
  if (!me) { location.href='/auth/discord'; return; }
  try { await api(`/api/me/lfg/${roomId}/${action}`,{method:'POST'}); state=await api('/api/state'); renderRoomList(); }
  catch(error){alert(error.message);}
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
  $('interest-games').innerHTML = games.map(game=>{const pref=map.get(game.slug);const interested=pref?.interestStatus==='INTERESTED';const sleeping=pref?.mutedUntil&&new Date(pref.mutedUntil)>new Date();return `<article class="interest-card"><header><span>${escapeHtml(game.icon||'🎮')}</span><h3>${escapeHtml(game.name)}</h3></header>${sleeping?`<small class="snooze-status">😴 غفوة حتى ${new Date(pref.mutedUntil).toLocaleString('ar',{timeStyle:'short',dateStyle:'short'})}</small>`:''}<div class="interest-actions"><button class="${interested?'on':''}" data-interest="${game.slug}" data-interested="${interested}">❤️ ${interested?'إلغاء الاهتمام':'مهتم'}</button><button class="${pref?.notificationsEnabled?'on':''}" data-notify="${game.slug}">${pref?.notificationsEnabled?'🔔 إيقاف الإشعار':'🔕 تشغيل الإشعار'}</button></div><div class="snooze-actions"><select data-snooze-select="${game.slug}"><option value="60">ساعة</option><option value="480">8 ساعات</option><option value="1440">يوم</option><option value="10080">أسبوع</option></select><button data-snooze="${game.slug}">😴 غفوة</button></div></article>`}).join('');
  document.querySelectorAll('[data-interest]').forEach(button=>button.onclick=()=>{const next=button.dataset.interested!=='true';setWebPreference(button.dataset.interest,next,next)});
  document.querySelectorAll('[data-notify]').forEach(button=>button.onclick=()=>setWebPreference(button.dataset.notify,true,!map.get(button.dataset.notify)?.notificationsEnabled));
  document.querySelectorAll('[data-snooze]').forEach(button=>button.onclick=()=>snoozeWebPreference(button.dataset.snooze,Number(document.querySelector(`[data-snooze-select="${button.dataset.snooze}"]`).value)));
}

async function setWebPreference(gameSlug,interested,notificationsEnabled){if(!me){location.href='/auth/discord';return;}await api(`/api/me/lfg-preferences/${gameSlug}`,{method:'PUT',body:{interested,notificationsEnabled}});await renderInterests(state.lfgGames||[]);}
async function snoozeWebPreference(gameSlug,minutes){if(!me){location.href='/auth/discord';return;}await api(`/api/me/lfg-preferences/${gameSlug}/snooze`,{method:'POST',body:{minutes}});await renderInterests(state.lfgGames||[]);}

function renderGames() {
  $('zark-games').innerHTML = (state.zarkGames||[]).map(game=>`<button class="game-tile" data-game="${escapeHtml(game.slug)}"><div class="game-cover"><span>${escapeHtml(game.icon||gameIcon(game.slug))}</span><small>أول إجابة تفوز</small></div><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description||'تحدٍ سريع داخل Discord')}</p><footer><span>5–15 XP</span><span>.${escapeHtml(game.aliases?.[0]||game.name)}</span></footer></button>`).join('');
  document.querySelectorAll('[data-game]').forEach(button=>button.onclick=()=>startRace(button.dataset.game));
  $('play-zark').onclick=()=>startRace();
}

async function startRace(gameSlug){try{const match=await api('/api/play/start',{method:'POST',body:{gameSlug}});$('race-title').textContent=match.gameName;$('race-prompt').textContent=match.prompt;$('race-note').textContent=match.mediaUrl?'تم تحميل الصورة — أجب داخل Discord.':'بدأت الجولة داخل النظام. أجب في قناة Discord.';}catch(error){$('race-note').textContent=error.message;}}

async function renderProfile(){
  if(!me)return;
  const [data,availability]=await Promise.all([api('/api/me/profile'),api('/api/me/availability')]);
  $('profile-guest').hidden=true;$('profile-content').hidden=false;
  $('profile-name').textContent=data.displayName;$('profile-level').textContent=`LV ${data.zark.level}`;$('profile-rating').textContent=data.lfg.rating.average?`${data.lfg.rating.average} ⭐ من ${data.lfg.rating.count} تقييم`:'لا يوجد تقييم بعد';$('profile-bio').textContent=data.settings.bio||'أضف نبذة قصيرة عن أسلوب لعبك.';
  $('profile-avatar').src=data.avatarUrl||'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23222"/%3E%3C/svg%3E';$('profile-head').style.setProperty('--profile-accent',data.settings.profileAccent);
  $('profile-stats').innerHTML=statCards([[data.zark.xp,'Zark XP'],[data.lfg.engagement,'Engagement'],[formatDuration(data.lfg.voiceSeconds),'وقت Voice'],[data.lfg.completedSessions,'جلسة مكتملة']]);
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
  $('weekly-availability').innerHTML=days.map((day,index)=>{const slot=slots.get(index);return `<label class="weekly-row"><input type="checkbox" data-weekly-enabled="${index}" ${slot?'checked':''}><b>${day}</b><input type="time" data-weekly-start="${index}" value="${minutesToTime(slot?.startMinute??1200)}"><span>إلى</span><input type="time" data-weekly-end="${index}" value="${minutesToTime(slot?.endMinute??1380)}"></label>`}).join('');
  $('availability-form').onsubmit=async event=>{event.preventDefault();const result=$('availability-result');result.textContent='جارِ حفظ وقت فراغك...';const weeklyAvailability=days.flatMap((_,dayOfWeek)=>{if(!document.querySelector(`[data-weekly-enabled="${dayOfWeek}"]`).checked)return[];return[{dayOfWeek,startMinute:timeToMinutes(document.querySelector(`[data-weekly-start="${dayOfWeek}"]`).value),endMinute:timeToMinutes(document.querySelector(`[data-weekly-end="${dayOfWeek}"]`).value),activity:'FREE'}]});try{const until=$('availability-until').value;const saved=await api('/api/me/availability',{method:'PUT',body:{currentActivity:$('availability-activity').value,activityUntil:until?new Date(until).toISOString():null,activityNote:$('availability-note').value||null,mentionPolicy:$('availability-mentions').value,weeklyAvailability}});bindAvailability(saved);result.textContent='✅ تم تحديث حالتك وجدولك الأسبوعي فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}};
}

async function renderLeaderboard(board){document.querySelectorAll('[data-board]').forEach(button=>{button.classList.toggle('active',button.dataset.board===board);button.onclick=()=>renderLeaderboard(button.dataset.board)});let rows,key,label;if(board==='game'||board==='engagement'){rows=await api(`/api/leaderboard?period=all&metric=${board}`);key=board==='game'?'gamePoints':'engagementPoints';label=board==='game'?'XP':'نقطة';}else{rows=await api(`/api/lfg/top?metric=${board}`);key=board==='sessions'?'completedSessions':'rating';label=board==='sessions'?'جلسة':'⭐';}const top=rows.slice(0,3);$('podium').innerHTML=[top[1],top[0],top[2]].map((row,index)=>row?`<article class="podium-card ${index===1?'first':''}">${avatar(row.avatarUrl,row.displayName,'podium')}<span>${index===1?'🥇':index===0?'🥈':'🥉'}</span><b>${escapeHtml(row.displayName)}</b><small>${formatValue(row[key])} ${label}</small></article>`:'').join('');$('full-leaderboard').innerHTML=rankingRows(rows,key,label);}

async function renderReports(){
  if(!me){['support-chat-form','bug-form','player-report-form'].forEach(id=>$(id).innerHTML='<div class="auth-gate compact"><p>سجّل عبر Discord لاستخدام الدعم.</p><a class="button primary" href="/auth/discord">تسجيل الدخول</a></div>');return;}
  const support=await api('/api/me/support/status');
  $('support-ai-status').textContent=supportTokenLabel(support);
  $('support-chat-form').onsubmit=async event=>{event.preventDefault();const input=$('support-chat-input');const message=input.value.trim();if(!message)return;appendChat(message,'user');input.value='';input.disabled=true;try{const reply=await api('/api/me/support/chat',{method:'POST',body:{message}});appendChat(reply.answer,'assistant');$('support-ai-status').textContent=supportTokenLabel(reply);$('support-suggestions').innerHTML=(reply.suggestions||[]).map(item=>`<button data-support-room="${item.roomId}">${escapeHtml(item.label)}</button>`).join('');document.querySelectorAll('[data-support-room]').forEach(button=>button.onclick=()=>location.href=`/lfg.html?room=${button.dataset.supportRoom}`);}catch(error){appendChat(error.message,'assistant error');}finally{input.disabled=false;input.focus();}};
  $('bug-form').onsubmit=async event=>{event.preventDefault();await submitForm('/api/me/reports/bug',{title:$('bug-title').value,description:$('bug-description').value,context:'Website'},$('bug-result'));};
  $('player-report-form').onsubmit=async event=>{event.preventDefault();await submitForm('/api/me/reports/player',{reportedId:$('reported-id').value,roomId:$('reported-room').value||undefined,reason:$('reported-reason').value,description:$('reported-description').value||undefined},$('report-result'));};
  const reports=await api('/api/me/reports');$('my-reports').innerHTML=[...reports.playerReports.map(report=>({title:`بلاغ لاعب: ${report.reason}`,status:report.status,date:report.createdAt})),...reports.bugReports.map(report=>({title:`خطأ: ${report.title}`,status:report.status,date:report.createdAt}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(report=>`<article class="report-item"><div><b>${escapeHtml(report.title)}</b><small>${new Date(report.date).toLocaleDateString('ar')}</small></div><span class="badge-red">${escapeHtml(report.status)}</span></article>`).join('')||empty('لا توجد بلاغات سابقة.');
}

function appendChat(message,type){const article=document.createElement('article');article.className=`chat-message ${type}`;article.textContent=message;$('support-chat-log').appendChild(article);$('support-chat-log').scrollTop=$('support-chat-log').scrollHeight;}

async function bindFloatingSupport(){
  const panel=$('zark-ai-panel'),fab=$('zark-ai-fab'),close=$('zark-ai-close'),form=$('floating-ai-form'),input=$('floating-ai-input'),log=$('floating-ai-log'),status=$('floating-ai-status');
  fab.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)input.focus()};close.onclick=()=>panel.hidden=true;
  try{const support=await api('/api/me/support/status');status.textContent=supportTokenLabel(support);}catch{status.textContent='الدعم متاح';}
  form.onsubmit=async event=>{event.preventDefault();const message=input.value.trim();if(!message)return;floatingChatMessage(log,message,'user');input.value='';input.disabled=true;try{const reply=await api('/api/me/support/chat',{method:'POST',body:{message}});floatingChatMessage(log,reply.answer,'assistant');status.textContent=supportTokenLabel(reply);}catch(error){floatingChatMessage(log,error.message,'assistant error');}finally{input.disabled=false;input.focus();}};
}
function floatingChatMessage(log,message,type){const article=document.createElement('article');article.className=`chat-message ${type}`;article.textContent=message;log.appendChild(article);log.scrollTop=log.scrollHeight;}

async function bindAdmin(){
  const gate=$('admin-gate');
  const content=$('admin-content');
  if(!me){gate.innerHTML='<span>🔐</span><h1>سجّل الدخول أولًا</h1><p>استخدم حساب Discord المرتبط بسيرفر Zark.</p><a class="button primary" href="/auth/discord">دخول Discord</a>';return;}
  if(!me.isAdmin){gate.innerHTML='<span>⛔</span><h1>لا تملك صلاحية الإدارة</h1><p>هذه اللوحة تظهر فقط لأعضاء رتب إدارة Zark المعتمدة.</p><a class="button ghost" href="/">العودة للرئيسية</a>';return;}
  try{
    const dashboard=await api('/api/web-admin/dashboard');
    gate.hidden=true;content.hidden=false;
    const stats=dashboard.stats;
    $('admin-stats').innerHTML=statCards([[stats.users,'مستخدم'],[stats.openRooms,'غرفة مفتوحة'],[stats.completedRooms,'جلسة مكتملة'],[stats.pendingReports+stats.openBugs,'بلاغ يحتاج مراجعة']]);
    $('admin-system-status').textContent=dashboard.system.botOnline?'● البوت Online':'● البوت Offline';$('admin-system-status').classList.toggle('offline',!dashboard.system.botOnline);
    $('admin-service-grid').innerHTML=[['API',dashboard.system.apiOnline],['PostgreSQL',dashboard.system.databaseOnline],['Discord Bot',dashboard.system.botOnline]].map(([name,online])=>`<article><span class="service-dot ${online?'online':'offline'}"></span><b>${name}</b><small>${online?'متصل':'غير متصل'}</small></article>`).join('');
    $('admin-active-rooms').innerHTML=dashboard.activeRooms.length?dashboard.activeRooms.map(room=>`<article class="admin-room"><div><b>${escapeHtml(room.gameIcon||'🎮')} ${escapeHtml(room.gameName)}</b><small class="host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')} ${escapeHtml(room.hostName)} · ${room.currentPlayers}/${room.maxPlayers} · ${escapeHtml(room.status)}</small><div class="room-players">${room.members.map(member=>`<span class="room-player">${avatar(member.avatarUrl,member.displayName,'mini')}${escapeHtml(member.displayName)}</span>`).join('')}</div></div><button class="button danger small" data-admin-close-room="${room.id}">إغلاق</button></article>`).join(''):empty('لا توجد غرف نشطة الآن.');
    document.querySelectorAll('[data-admin-close-room]').forEach(button=>button.onclick=async()=>{if(!confirm('إغلاق هذه الغرفة؟'))return;await api(`/api/web-admin/lfg/${button.dataset.adminCloseRoom}/close`,{method:'POST'});await bindAdmin();});
    fillAdminSettings(dashboard.settings);
  }catch(error){gate.innerHTML=`<span>⛔</span><h1>تعذر فتح اللوحة</h1><p>${escapeHtml(error.message)}</p>`;return;}

  $('admin-settings-form').onsubmit=async event=>{
    event.preventDefault();
    const body={
      botName:$('setting-bot-name').value.trim(),tagline:$('setting-tagline').value.trim(),
      lfgChannelId:channelValue('setting-lfg-channel'),lfgCategoryId:channelValue('setting-lfg-category'),publicChannelId:channelValue('setting-public-channel'),dailyChannelId:channelValue('setting-daily-channel'),leaderboardChannelId:channelValue('setting-leaderboard-channel'),
      dmNotificationsEnabled:$('setting-dm-enabled').checked,quickMatchEnabled:$('setting-quick-match').checked,ratingsEnabled:$('setting-ratings').checked,reportsEnabled:$('setting-reports').checked,autoCreateRoomChannels:$('setting-auto-channels').checked,aiChatEnabled:$('setting-ai-enabled').checked,
      maxDmPerDay:Number($('setting-dm-limit').value),notificationCooldownMinutes:Number($('setting-dm-cooldown').value),maxActiveRoomsPerUser:Number($('setting-room-limit').value),defaultRoomDurationMinutes:Number($('setting-room-duration').value),roomGraceMinutes:Number($('setting-room-grace').value),aiDailyMessagesPerUser:1000,aiGlobalDailyMessages:100000,aiDailyTokenBudgetPerUser:Number($('setting-ai-user-limit').value),aiGlobalDailyTokenBudget:Number($('setting-ai-global-limit').value),aiMaxOutputTokens:Number($('setting-ai-output').value),
    };
    const result=$('admin-settings-result');result.textContent='جارِ تطبيق الإعدادات...';
    try{const saved=await api('/api/web-admin/settings',{method:'PUT',body});fillAdminSettings(saved);result.textContent='✅ تم الحفظ والتطبيق على البوت فورًا.';}catch(error){result.textContent=`❌ ${error.message}`;}
  };
  $('admin-lfg-form').onsubmit=async event=>{event.preventDefault();await submitForm(`/api/web-admin/lfg/games/${$('admin-game-slug').value}` ,{name:$('admin-game-name').value,description:$('admin-game-description').value||undefined,icon:$('admin-game-icon').value||undefined,categorySlug:$('admin-game-category').value||undefined,minPlayers:Number($('admin-game-min').value),maxPlayers:Number($('admin-game-max').value),enabled:true},$('admin-game-result'),'PUT');};
  $('admin-question-form').onsubmit=async event=>{event.preventDefault();await submitForm(`/api/web-admin/zark-games/${$('admin-question-game').value}/questions`,{prompt:$('admin-question-prompt').value,acceptedAnswers:$('admin-question-answers').value.split(',').map(item=>item.trim()).filter(Boolean),mediaUrl:$('admin-question-media').value,difficulty:Number($('admin-question-difficulty').value)},$('admin-question-result'));};
}

function fillAdminSettings(settings){
  $('setting-bot-name').value=settings.botName||'';$('setting-tagline').value=settings.tagline||'';
  $('setting-lfg-channel').value=settings.lfgChannelId||'';$('setting-lfg-category').value=settings.lfgCategoryId||'';$('setting-public-channel').value=settings.publicChannelId||'';$('setting-daily-channel').value=settings.dailyChannelId||'';$('setting-leaderboard-channel').value=settings.leaderboardChannelId||'';
  $('setting-dm-enabled').checked=settings.dmNotificationsEnabled;$('setting-quick-match').checked=settings.quickMatchEnabled;$('setting-ratings').checked=settings.ratingsEnabled;$('setting-reports').checked=settings.reportsEnabled;$('setting-auto-channels').checked=settings.autoCreateRoomChannels;$('setting-ai-enabled').checked=settings.aiChatEnabled;
  $('setting-dm-limit').value=settings.maxDmPerDay;$('setting-dm-cooldown').value=settings.notificationCooldownMinutes;$('setting-room-limit').value=settings.maxActiveRoomsPerUser;$('setting-room-duration').value=settings.defaultRoomDurationMinutes;$('setting-room-grace').value=settings.roomGraceMinutes;$('setting-ai-user-limit').value=settings.aiDailyTokenBudgetPerUser||3000;$('setting-ai-global-limit').value=settings.aiGlobalDailyTokenBudget||100000;$('setting-ai-output').value=settings.aiMaxOutputTokens;
}

function channelValue(id){const value=$(id).value.trim();return value||null;}

async function submitForm(path,body,result,method='POST'){result.textContent='جارِ الإرسال...';try{await api(path,{method,body});result.textContent='✅ تم الحفظ بنجاح.';}catch(error){result.textContent=`❌ ${error.message}`;}}

function roomCard(room){return `<article class="room-card" style="--room-accent:${escapeHtml(room.accentColor||'#e50914')}"><div class="room-top"><span class="game-icon">${escapeHtml(room.roomEmoji||room.gameIcon||'🎮')}</span><span class="room-status">${room.status==='SCHEDULED'?'SCHEDULED':room.status==='ACTIVE'?'PLAYING':room.status==='COMPLETED'?'FINISHED':'LIVE'}</span></div><h3>${escapeHtml(room.title||room.gameName)}</h3><div class="room-meta host-meta">${avatar(room.hostAvatarUrl,room.hostName,'host')}<span>Host: ${escapeHtml(room.hostName)} · ${room.needsVoice?'🎙️ Voice':'💬 Text'}${room.mapName?` · 🗺️ ${escapeHtml(room.mapName)}`:''}</span></div><div class="room-players compact">${(room.members||[]).slice(0,4).map(member=>`<span class="room-player">${avatar(member.avatarUrl,member.displayName,'mini')}${escapeHtml(member.displayName)}</span>`).join('')}</div><div class="room-progress"><i style="width:${Math.min(100,room.currentPlayers/room.maxPlayers*100)}%"></i></div><div class="room-bottom"><span>${room.currentPlayers}/${room.maxPlayers} لاعبين</span><span>${formatRoomTiming(room)}</span></div></article>`}
function rankingRows(rows,key,label){return rows.length?rows.slice(0,10).map((row,index)=>`<div class="rank-row"><span class="rank">${index<3?['🥇','🥈','🥉'][index]:`#${index+1}`}</span><span class="rank-player">${avatar(row.avatarUrl,row.displayName,'rank')}<b>${escapeHtml(row.displayName)}</b></span><span>${formatValue(row[key])} ${label}</span></div>`).join(''):empty('لا توجد بيانات كافية بعد.');}
function statCards(items){return items.map(([value,label])=>`<article><b>${formatValue(value)}</b><span>${label}</span></article>`).join('')}
function dataRow(label,value){return `<div class="data-row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`}
function gameIcon(slug){return {'translate':'🌐','flags':'🚩','capitals':'🌍','fast-type':'⌨️','complete-word':'🧩','word-order':'🔤','math':'🧮','emoji-guess':'😀','car-logos':'🚘','company-logos':'🏢','anime-silhouette':'🎭','game-logos':'🎮','true-false':'✅','letter-order':'🔡','who-am-i':'👤','trivia':'❓'}[slug]||'🎮'}
function normalizeRoomSearch(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim()}
function smartRoomMatch(room,query){if(!query)return true;const canonical=Object.entries(roomSearchAliases).find(([,aliases])=>aliases.some(alias=>{const normalized=normalizeRoomSearch(alias);return query.includes(normalized)||normalized.includes(query)}))?.[0];const haystack=normalizeRoomSearch([room.id,room.gameName,room.gameSlug,room.hostName,room.title,room.gameMode,room.mapName,room.description,...(room.members||[]).map(member=>member.displayName)].filter(Boolean).join(' '));return haystack.includes(query)||(canonical&&room.gameSlug===canonical)}
function availabilityText(value){return{FREE:'🟢 فاضي للعب',PLAYING:'🎮 ألعب الآن',STUDYING:'📚 أدرس',WORKING:'💼 أعمل',BUSY:'⛔ مشغول',AWAY:'🌙 غير متاح'}[value]||'غير محدد'}
function supportTokenLabel(status){return status.mode==='AI'?`AI متصل · متبقي ${formatValue(status.remainingTokens)}/${formatValue(status.tokenBudget||status.dailyTokenBudget)} Token`:'دعم ذكي محلي مفتوح بلا تكلفة'}
function empty(message){return `<div class="empty-state">${escapeHtml(message)}</div>`}
function formatValue(value){return typeof value==='number'?new Intl.NumberFormat('ar').format(value):value??0}
function formatDuration(seconds){const value=Math.max(0,Number(seconds)||0);const hours=Math.floor(value/3600);const minutes=Math.floor((value%3600)/60);return hours?`${hours}س ${minutes}د`:`${minutes} دقيقة`}
function minutesToTime(minutes){const value=Math.max(0,Math.min(1439,Number(minutes)||0));return`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`}
function timeToMinutes(value){const[hours,minutes]=String(value||'00:00').split(':').map(Number);return hours*60+minutes}
function localDateTime(value){const date=new Date(value),pad=number=>String(number).padStart(2,'0');return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
function formatRoomTiming(room){if(room.status==='SCHEDULED'&&room.scheduledFor)return`موعد التجمع ${new Date(room.scheduledFor).toLocaleString('ar',{dateStyle:'short',timeStyle:'short'})}`;if(room.startedAt)return`بدأ اللعب ${new Date(room.startedAt).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`;return`بدأ التجمع ${new Date(room.createdAt).toLocaleTimeString('ar',{hour:'numeric',minute:'2-digit'})}`}
function countdown(date){const minutes=Math.max(0,Math.ceil((new Date(date).getTime()-Date.now())/60000));return minutes?`${minutes}د متبقية`:'ينتهي الآن'}
function countdownTo(date){const minutes=Math.ceil((new Date(date).getTime()-Date.now())/60000);if(minutes<=0)return'الآن';if(minutes<60)return`بعد ${minutes}د`;const hours=Math.floor(minutes/60),rest=minutes%60;return`بعد ${hours}س${rest?` ${rest}د`:''}`}
function timeAgo(date){const minutes=Math.max(1,Math.floor((Date.now()-new Date(date).getTime())/60000));return minutes<60?`منذ ${minutes}د`:`منذ ${Math.floor(minutes/60)}س`}
function avatar(url,name,size='mini'){const cls=`discord-avatar ${size}`;return url?`<img class="${cls}" src="${escapeHtml(url)}" alt="${escapeHtml(name||'Discord')}">`:`<span class="${cls} avatar-fallback">${escapeHtml(String(name||'Z').slice(0,1).toUpperCase())}</span>`}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
async function api(path,options={}){const response=await fetch(path,{method:options.method||'GET',credentials:'same-origin',headers:options.body?{'content-type':'application/json'}:undefined,body:options.body?JSON.stringify(options.body):undefined});const text=await response.text();let body;try{body=text?JSON.parse(text):null}catch{body={error:text}}if(!response.ok)throw new Error(body?.error||'تعذر تنفيذ الطلب');return body;}
function showFatal(error){console.error(error);const target=document.querySelector('main');if(target)target.insertAdjacentHTML('afterbegin',`<div class="shell"><div class="empty-state">تعذر الاتصال بـZark API: ${escapeHtml(error.message)}</div></div>`)}
