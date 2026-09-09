import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { db } from '../../db/src/client.js';
import { createGameHelp } from '../../../apps/api/src/modules/broadcast/service.js';

function stub(t:TestContext,target:object,key:string,fn:(...args:any[])=>any){
  const delegate=target as Record<string,unknown>,original=delegate[key];
  delegate[key]=fn;t.after(()=>{delegate[key]=original});
}
const admin={userId:'111111111111111111'} as Parameters<typeof createGameHelp>[0];
const input={channelId:'222222222222222222',gameSlug:'roblox',mapName:'Blox Fruits'};
test('game help queues only the selected channel and includes the Roblox map',async t=>{
  stub(t,db.lfgGameCatalog,'findUnique',async()=>({slug:'roblox',name:'Roblox',enabled:true}));
  let audit:any;
  stub(t,db,'$transaction',async fn=>fn({adminBroadcast:{findFirst:async()=>null,create:async({data}:any)=>({id:'campaign',...data})},auditLog:{create:async({data}:any)=>{audit=data}}}));
  const result=await createGameHelp(admin,input);
  assert.equal(result.targetChannelId,input.channelId);
  assert.match(result.content,/Roblox — Blox Fruits/);
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
