import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../packages/db/src/client.js';
import {startZarkRace,answerZarkRace} from '../apps/api/src/service.js';
assert.match(new URL(process.env.DATABASE_URL!).searchParams.get('schema')||'',/^lfg_platform_test_/);
try{
  const match=await startZarkRace('true-false');
  await db.zarkMatch.update({where:{id:match.id},data:{answer:'صح',endsAt:new Date(Date.now()+60000)}});
  const player={userId:'one-attempt',displayName:'Test'};
  assert.equal((await answerZarkRace(match.id,{...player,answer:'خطأ'})).correct,false);
  const retry=await answerZarkRace(match.id,{...player,answer:'صح'});
  assert.ok('alreadyAnswered' in retry&&retry.alreadyAnswered);
  assert.equal(await db.zarkMatchResult.count({where:{matchId:match.id}}),0);
  assert.equal((await db.zarkMatch.findUniqueOrThrow({where:{id:match.id}})).status,'OPEN');
  assert.equal((await answerZarkRace(match.id,{userId:'other-player',displayName:'Other',answer:'صح'})).correct,true);
  const next=await startZarkRace('true-false');
  await db.zarkMatch.update({where:{id:next.id},data:{answer:'صح',endsAt:new Date(Date.now()+60000)}});
  assert.equal((await answerZarkRace(next.id,{...player,answer:'صح'})).correct,true);
  const concurrent=await startZarkRace('true-false');
  await db.zarkMatch.update({where:{id:concurrent.id},data:{answer:'صح',endsAt:new Date(Date.now()+60000)}});
  const responses=await Promise.all(Array.from({length:5},()=>answerZarkRace(concurrent.id,{...player,answer:'خطأ'})));
  assert.equal(responses.filter(result=>'alreadyAnswered' in result).length,4);
  console.log('PASS: wrong then right blocked; other players unaffected; next question allowed; concurrent clicks get one attempt.');
}finally{await db.$disconnect();}
