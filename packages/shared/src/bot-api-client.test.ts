import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiGet, apiSend } from '../../../apps/bot/src/api/client.js';

test('bot API accepts JSON null for a player without a team',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('null',{status:200}));
  assert.equal(await apiGet('/api/users/player/team',true),null);
});

test('bot API reports malformed upstream responses before command handlers use them',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('<html>Proxy page</html>',{status:200}));
  await assert.rejects(apiGet('/api/state'),/استجابة غير صالحة/);
});

test('bot API preserves a service error without retrying a mutation',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'الغرفة ممتلئة'}),{status:409}));
  await assert.rejects(apiSend('/api/rooms/room/join','POST',{userId:'player'}),/الغرفة ممتلئة/);
  assert.equal(fetch.mock.callCount(),1);
});

test('bot API accepts explicit no-content responses',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
  assert.equal(await apiSend('/api/action','POST',{}),undefined);
});
