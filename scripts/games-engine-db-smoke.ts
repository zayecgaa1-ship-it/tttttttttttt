import 'dotenv/config';
import assert from 'node:assert/strict';
import {db} from '../packages/db/src/client.js';
import {raceGames} from '../packages/games/src/index.js';
import {questionIdentity} from '../packages/games/src/question-pool.js';
import {startZarkRace,advanceZarkRace,expireZarkRace,listZarkGames,answerZarkRace} from '../apps/api/src/service.js';

assert.match(new URL(process.env.DATABASE_URL!).searchParams.get('schema')||'',/^lfg_platform_test_/,'Run only via isolated schema runner');
try{
  const catalog=await listZarkGames();assert.equal(catalog.length,raceGames.size);
  for(const game of raceGames.values()){
    const channelId='test-'+game.slug;
    let match=await startZarkRace(game.slug,{channelId,totalRounds:3});
    const seen=new Set<string>();
    for(let round=1;round<=3;round++){
      const stored=await db.zarkMatch.findUniqueOrThrow({where:{id:match.id}});
      const key=questionIdentity({prompt:stored.prompt,answers:stored.answer.split('|||'),mediaUrl:stored.mediaUrl??undefined},game.slug);
      assert.ok(!seen.has(key),game.slug+' repeated a question');seen.add(key);
      assert.equal(match.roundNumber,round);
      await db.zarkMatch.update({where:{id:match.id},data:{endsAt:new Date(Date.now()-1)}});
      await expireZarkRace(match.id);
      const next=await advanceZarkRace(match.id);
      if(round<3){assert.equal(next.completed,false);if(!next.completed)match=next.nextMatch;}
      else assert.equal(next.completed,true);
    }
    assert.equal(await db.zarkMatch.count({where:{activeChannelKey:channelId}}),0);
  }
  console.log('All '+raceGames.size+' games: start, 3 unique rounds, expiry, progression, channel unlock.');
  const game=await db.zarkGame.findUniqueOrThrow({where:{slug:'movies'}});
  const custom=await db.gameQuestion.create({data:{gameId:game.id,prompt:'صورة اختبار خاصة',acceptedAnswers:['اختبار'],mediaUrl:'https://example.test/custom.png'}});
  const expected=game.slug&&raceGames.get('movies')!.questionCount!+1;
  assert.equal((await listZarkGames()).find(item=>item.slug==='movies')!.questionCount,expected);
  const seen=new Set<string>();
  for(let index=0;index<expected;index++){
    const match=await startZarkRace('movies',{channelId:'custom-bank'});
    assert.ok(!seen.has(match.prompt));seen.add(match.prompt);
    await db.zarkMatch.update({where:{id:match.id},data:{endsAt:new Date(Date.now()-1)}});
    await expireZarkRace(match.id);await advanceZarkRace(match.id);
  }
  assert.ok(seen.has(custom.prompt),'custom questions participate in the same non-repeating pool');
  const attempts=await Promise.allSettled([startZarkRace('flags',{channelId:'concurrent'}),startZarkRace('math',{channelId:'concurrent'})]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1,'one game per channel');
  const typing=await startZarkRace('fast-type');
  const stored=await db.zarkMatch.findUniqueOrThrow({where:{id:typing.id}});
  const exact=stored.answer.split('|||')[0];
  assert.equal((await answerZarkRace(typing.id,{userId:'typing-test',displayName:'Test',answer:exact.slice(0,-1)})).correct,false);
  assert.equal((await answerZarkRace(typing.id,{userId:'typing-test',displayName:'Test',answer:exact})).correct,true);
  await db.zarkGame.update({where:{slug:'flags'},data:{enabled:false}});
  await assert.rejects(()=>startZarkRace('flags'),/معطّلة/);
  assert.ok(!(await listZarkGames()).some(item=>item.slug==='flags'));
  console.log('PASS: custom banks, honest counts, concurrent channel locking, strict typing, disabled games.');
}finally{await db.$disconnect();}
