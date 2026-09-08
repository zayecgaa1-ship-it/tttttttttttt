import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { db } from '../../db/src/client.js';
import { respondToTeamInvite } from '../../../apps/api/src/modules/teams/service.js';

function stub(t: TestContext, target: object, name: string, implementation: (...args: any[]) => any) {
  const delegate=target as Record<string, unknown>,original=delegate[name];
  delegate[name]=implementation;
  t.after(()=>{delegate[name]=original;});
}

// Model commit/rollback explicitly: EXPIRED must survive the error returned
// to the caller, while rejected callers must leave the invitation untouched.
function invitationStore(t: TestContext, expiresAt: Date, status='PENDING') {
  let saved={id:'invite',invitedUserId:'recipient',status,expiresAt,teamId:'team',team:{maxMembers:20,_count:{members:1}}};
  stub(t,db,'$transaction',async (operation: (tx: any)=>Promise<unknown>)=>{
    const draft=structuredClone(saved);
    const value=await operation({teamInvite:{
      findUnique:async()=>draft,
      update:async (args: any)=>Object.assign(draft,args.data),
    }});
    saved=draft;
    return value;
  });
  return ()=>saved;
}

test('expired team invitation remains EXPIRED after returning its error',async t=>{
  const read=invitationStore(t,new Date(Date.now()-1000));
  await assert.rejects(respondToTeamInvite('invite','recipient',true),/انتهت صلاحية/);
  assert.equal(read().status,'EXPIRED');
});

test('only the recipient can answer a team invitation',async t=>{
  const read=invitationStore(t,new Date(Date.now()+60_000));
  await assert.rejects(respondToTeamInvite('invite','another-user',false),/غير متاحة/);
  assert.equal(read().status,'PENDING');
});

test('declining a team invite does not return an existing team as a successful join',async t=>{
  const read=invitationStore(t,new Date(Date.now()+60_000));
  stub(t,db.teamMember,'findUnique',async()=>assert.fail('declining must not load or change membership'));
  assert.equal(await respondToTeamInvite('invite','recipient',false),null);
  assert.equal(read().status,'DECLINED');
});

test('a previously answered invitation cannot be answered twice',async t=>{
  const read=invitationStore(t,new Date(Date.now()+60_000),'ACCEPTED');
  await assert.rejects(respondToTeamInvite('invite','recipient',false),/غير متاحة/);
  assert.equal(read().status,'ACCEPTED');
});
