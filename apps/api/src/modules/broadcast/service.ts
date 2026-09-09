import { db } from "../../../../../packages/db/src/client.js";
import type { WebUser } from "../../auth.js";
import { HttpError } from "../../auth.js";
import { publish } from "../../events.js";
import { serializable } from "../../db-transaction.js";

const BROADCAST_COOLDOWN_MS = 30 * 60_000;

export function cleanBroadcastText(value: string, maxLength: number) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, maxLength);
}

export async function listBroadcasts() {
  return db.adminBroadcast.findMany({ include:{helpRegistrations:{orderBy:{createdAt:'asc'}}}, orderBy: { createdAt: "desc" }, take: 30 });
}

export async function createGameHelp(admin:WebUser,input:{channelId:string;gameSlug:string;mapName?:string;dailyCapacity:number;days:number}){
  const game=await db.lfgGameCatalog.findUnique({where:{slug:input.gameSlug}});
  if(!game?.enabled)throw new HttpError('اللعبة غير متاحة',400);
  const map=game.slug==='roblox'&&input.mapName?` — ${input.mapName}`:'';
  const total=input.dailyCapacity*input.days;
  const startsAt=new Date();
  const campaign=await serializable(async tx=>{
    const recent=await tx.adminBroadcast.findFirst({where:{adminId:admin.userId,targetChannelId:input.channelId,createdAt:{gte:new Date(Date.now()-30_000)}}});
    if(recent)throw new HttpError('انتظر 30 ثانية قبل إرسال طلب مساعدة آخر لنفس الروم',429);
    const created=await tx.adminBroadcast.create({data:{adminId:admin.userId,targetChannelId:input.channelId,helpGameSlug:game.slug,helpMapName:input.mapName,helpDailyCapacity:input.dailyCapacity,helpDays:input.days,helpTotalCapacity:total,helpStartsAt:startsAt,title:`مساعدة في ${game.name}${map}`.slice(0,80),content:`🎮 مين بدو مساعدة في ${game.name}${map}؟\nسنساعد **${input.dailyCapacity}** لاعب يوميًا لمدة **${input.days}** أيام — المجموع **${total}** لاعب.\nاضغط زر التسجيل وسيعطيك البوت يومك حسب ترتيبك.`}});
    await tx.auditLog.create({data:{adminId:admin.userId,action:'game-help.created',targetId:created.id,details:{channelId:input.channelId,gameSlug:game.slug,mapName:input.mapName??null,dailyCapacity:input.dailyCapacity,days:input.days,total}}});
    return created;
  });
  publish({type:'broadcast.created',broadcastId:campaign.id,adminId:admin.userId});
  return campaign;
}

export async function joinGameHelp(campaignId:string,user:{userId:string;displayName:string}){
  return serializable(async tx=>{
    const campaign=await tx.adminBroadcast.findUnique({where:{id:campaignId},include:{_count:{select:{helpRegistrations:true}}}});
    if(!campaign?.helpGameSlug||!campaign.helpDailyCapacity||!campaign.helpDays||!campaign.helpTotalCapacity||!campaign.helpStartsAt)throw new HttpError('حملة المساعدة غير متاحة',404);
    if(!['RUNNING','COMPLETED'].includes(campaign.status))throw new HttpError('رسالة التسجيل لم تصبح جاهزة بعد',409);
    const endsAt=new Date(campaign.helpStartsAt.getTime()+campaign.helpDays*86_400_000);
    if(new Date()>=endsAt)throw new HttpError('انتهت مدة التسجيل لهذه الحملة',409);
    const duplicate=await tx.gameHelpRegistration.findFirst({where:{campaignId,userId:user.userId},orderBy:{createdAt:'desc'}});
    if(duplicate?.status==='WAITING')throw new HttpError('أنت مسجل بالفعل في هذه الحملة',409);
    if(duplicate?.status==='HELPED'&&!duplicate.rejoinAllowed)throw new HttpError('تمت مساعدتك في هذه الحملة. يجب أن تسمح لك الإدارة بالتسجيل مرة أخرى',403);
    const blocked=await tx.gameHelpRegistration.findFirst({where:{userId:user.userId,status:'HELPED',rejoinAllowed:false,campaign:{helpGameSlug:campaign.helpGameSlug}}});
    if(blocked)throw new HttpError('تمت مساعدتك سابقًا. يجب أن تسمح لك الإدارة بالتسجيل مرة أخرى',403);
    if(campaign._count.helpRegistrations>=campaign.helpTotalCapacity)throw new HttpError('اكتمل العدد في حملة المساعدة',409);
    const assignedDay=Math.floor(campaign._count.helpRegistrations/campaign.helpDailyCapacity)+1;
    const registration=await tx.gameHelpRegistration.create({data:{campaignId,userId:user.userId,displayName:user.displayName.slice(0,100),assignedDay}});
    const count=campaign._count.helpRegistrations+1;
    await tx.auditLog.create({data:{adminId:user.userId,action:'game-help.joined',targetId:campaignId,details:{registrationId:registration.id,assignedDay}}});
    return {registration,count,full:count>=campaign.helpTotalCapacity,campaign};
  });
}

export async function markGameHelpCompleted(admin:WebUser,registrationId:string){
  const registration=await db.gameHelpRegistration.findUnique({where:{id:registrationId}});
  if(!registration)throw new HttpError('التسجيل غير موجود',404);
  const updated=await db.gameHelpRegistration.update({where:{id:registrationId},data:{status:'HELPED',helpedAt:new Date(),helpedBy:admin.userId,rejoinAllowed:false}});
  await db.auditLog.create({data:{adminId:admin.userId,action:'game-help.completed',targetId:registrationId,details:{userId:registration.userId,campaignId:registration.campaignId}}});
  return updated;
}

export async function allowGameHelpRejoin(admin:WebUser,registrationId:string){
  const registration=await db.gameHelpRegistration.findUnique({where:{id:registrationId},include:{campaign:true}});
  if(!registration?.campaign.helpGameSlug)throw new HttpError('التسجيل غير موجود',404);
  await db.gameHelpRegistration.updateMany({where:{userId:registration.userId,status:'HELPED',rejoinAllowed:false,campaign:{helpGameSlug:registration.campaign.helpGameSlug}},data:{rejoinAllowed:true}});
  await db.auditLog.create({data:{adminId:admin.userId,action:'game-help.rejoin_allowed',targetId:registrationId,details:{userId:registration.userId,gameSlug:registration.campaign.helpGameSlug}}});
  return {allowed:true,userId:registration.userId};
}

export async function setGameHelpDiscordMessage(campaignId:string,messageId:string){
  return db.adminBroadcast.update({where:{id:campaignId},data:{discordMessageId:messageId}});
}

export async function createBroadcast(admin: WebUser, input: { title: string; content: string; confirmation: string }) {
  if (input.confirmation.trim() !== "إرسال") throw new HttpError("اكتب كلمة إرسال للتأكيد", 400);
  const title = cleanBroadcastText(input.title, 80);
  const content = cleanBroadcastText(input.content, 1500);
  if (title.length < 2 || content.length < 2) throw new HttpError("اكتب عنوانًا ومحتوى واضحين", 400);

  const campaign = await serializable(async (tx) => {
    const active = await tx.adminBroadcast.findFirst({ where: { targetChannelId:null, status: { in: ["PENDING", "RUNNING"] } } });
    if (active) throw new HttpError("توجد رسالة جماعية قيد الإرسال؛ انتظر حتى تنتهي", 409);
    const recent = await tx.adminBroadcast.findFirst({ where: { targetChannelId:null, createdAt: { gte: new Date(Date.now() - BROADCAST_COOLDOWN_MS) }, status: { in: ["PENDING", "RUNNING", "COMPLETED"] } }, orderBy: { createdAt: "desc" } });
    if (recent) throw new HttpError("لحماية الأعضاء من الإزعاج، يمكن بدء حملة واحدة كل 30 دقيقة", 429);
    const created = await tx.adminBroadcast.create({ data: { adminId: admin.userId, title, content } });
    await tx.auditLog.create({ data: { adminId: admin.userId, action: "broadcast.created", targetId: created.id, details: { title } } });
    return created;
  });
  publish({ type: "broadcast.created", broadcastId: campaign.id, adminId: admin.userId });
  return campaign;
}

export async function getPendingBroadcast() {
  await db.adminBroadcast.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    data: { status: "PENDING", startedAt: null, lastError: "أعيدت للمحاولة بعد توقف سابق للبوت" },
  });
  return db.adminBroadcast.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
}

export async function claimBroadcast(id: string) {
  const claimed = await db.adminBroadcast.updateMany({ where: { id, status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date(), lastError: null } });
  return { claimed: claimed.count === 1, campaign: claimed.count === 1 ? await db.adminBroadcast.findUnique({ where: { id } }) : null };
}

export async function updateBroadcastProgress(id: string, input: { status: "RUNNING" | "COMPLETED" | "FAILED"; totalMembers: number; sentCount: number; failedCount: number; skippedCount: number; lastError?: string }) {
  const campaign = await db.adminBroadcast.update({
    where: { id },
    data: { ...input, lastError: input.lastError?.slice(0, 500) || null, completedAt: input.status === "RUNNING" ? null : new Date() },
  });
  if (input.status !== "RUNNING") await db.auditLog.create({ data: { adminId: campaign.adminId, action: `broadcast.${input.status.toLowerCase()}`, targetId: id, details: { totalMembers: input.totalMembers, sentCount: input.sentCount, failedCount: input.failedCount, skippedCount: input.skippedCount } } });
  return campaign;
}
