import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { db } from '../../db/src/client.js';
import { allowGameHelpRejoin, createGameHelp, joinGameHelp, markGameHelpCompleted } from '../../../apps/api/src/modules/broadcast/service.js';

function stub(t:TestContext,target:object,key:string,fn:(...args:any[])=>any){
  const delegate=target as Record<string,unknown>,original=delegate[key];
  delegate[key]=fn;t.after(()=>{delegate[key]=original});
}
const admin={userId:'111111111111111111'} as Parameters<typeof createGameHelp>[0];
const input={channelId:'222222222222222222',gameSlug:'roblox',mapName:'Blox Fruits',dailyCapacity:3,days:7};
test('game help queues only the selected channel and includes the Roblox map',async t=>{
  stub(t,db.lfgGameCatalog,'findUnique',async()=>({slug:'roblox',name:'Roblox',enabled:true}));
  let audit:any;
  stub(t,db,'$transaction',async fn=>fn({adminBroadcast:{findFirst:async()=>null,create:async({data}:any)=>({id:'campaign',...data})},auditLog:{create:async({data}:any)=>{audit=data}}}));
  const result=await createGameHelp(admin,input);
  assert.equal(result.targetChannelId,input.channelId);
  assert.match(result.content,/Roblox — Blox Fruits/);
  assert.equal(result.helpTotalCapacity,21);
  assert.match(result.content,/21/);
  assert.equal(audit.action,'game-help.created');
});
test('game help rejects disabled games before queuing',async t=>{
  stub(t,db.lfgGameCatalog,'findUnique',async()=>({enabled:false}));
  stub(t,db,'$transaction',async()=>assert.fail('must not queue disabled games'));
  await assert.rejects(createGameHelp(admin,input),/غير متاحة/);
});
test('game help rejects repeated announcements to the same channel within cooldown',async t=>{
  stub(t,db.lfgGameCatalog,'findUnique',async()=>({slug:'roblox',name:'Roblox',enabled:true}));
  stub(t,db,'$transaction',async fn=>fn({adminBroadcast:{findFirst:async({where}:any)=>{assert.equal(where.targetChannelId,input.channelId);assert.equal(where.adminId,admin.userId);return {id:'recent'}},create:async()=>assert.fail('must not queue duplicate')}}));
  await assert.rejects(createGameHelp(admin,input),/30/);
});

function joinStore(t:TestContext,count:number,options:{duplicate?:boolean;duplicateAllowed?:boolean;blocked?:boolean}={}){
  const campaign={id:'campaign',status:'COMPLETED',helpGameSlug:'roblox',helpDailyCapacity:3,helpDays:7,helpTotalCapacity:21,helpStartsAt:new Date(),_count:{helpRegistrations:count}};
  let created:any;
  stub(t,db,'$transaction',async fn=>fn({
    adminBroadcast:{findUnique:async()=>campaign},
    gameHelpRegistration:{
      findFirst:async(args:any)=>args.where.campaignId?options.duplicate?{status:'WAITING',rejoinAllowed:false}:options.duplicateAllowed?{status:'HELPED',rejoinAllowed:true}:null:options.blocked?{id:'previous-help'}:null,
      create:async({data}:any)=>(created={id:'registration',status:'WAITING',...data}),
    },
    auditLog:{create:async()=>({})},
  }));
  return ()=>created;
}

test('the fourth signup is assigned to day two when daily capacity is three',async t=>{
  const read=joinStore(t,3);
  const result=await joinGameHelp('campaign',{userId:'333333333333333333',displayName:'Player'});
  assert.equal(result.registration.assignedDay,2);
  assert.equal(result.count,4);
  assert.equal(read().userId,'333333333333333333');
});

test('a previously helped player stays blocked until an administrator allows rejoining',async t=>{
  joinStore(t,2,{blocked:true});
  await assert.rejects(joinGameHelp('campaign',{userId:'333333333333333333',displayName:'Player'}),/تسمح لك الإدارة/);
});

test('an administrator allowance lets a helped player register again in the same campaign',async t=>{
  joinStore(t,5,{duplicateAllowed:true});
  const result=await joinGameHelp('campaign',{userId:'333333333333333333',displayName:'Player'});
  assert.equal(result.count,6);
  assert.equal(result.registration.assignedDay,2);
});

test('admin completion blocks rejoin, then explicit allowance releases every prior help for that game',async t=>{
  const registration={id:'registration',userId:'333333333333333333',campaignId:'campaign'};
  stub(t,db.gameHelpRegistration,'findUnique',async({include}:any)=>include?{...registration,campaign:{helpGameSlug:'roblox'}}:registration);
  let completed:any,allowed:any;
  stub(t,db.gameHelpRegistration,'update',async({data}:any)=>(completed=data));
  stub(t,db.gameHelpRegistration,'updateMany',async(args:any)=>{allowed=args;return {count:2}});
  stub(t,db.auditLog,'create',async()=>({}));
  await markGameHelpCompleted(admin,'registration');
  assert.equal(completed.status,'HELPED');assert.equal(completed.rejoinAllowed,false);
  await allowGameHelpRejoin(admin,'registration');
  assert.equal(allowed.where.userId,registration.userId);assert.equal(allowed.where.campaign.helpGameSlug,'roblox');assert.equal(allowed.data.rejoinAllowed,true);
});

test('a full assistance campaign never accepts more than its calculated total',async t=>{
  joinStore(t,21);
  await assert.rejects(joinGameHelp('campaign',{userId:'333333333333333333',displayName:'Player'}),/اكتمل العدد/);
});
