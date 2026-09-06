import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedJokes,curatedMemes,pickFresh} from './curated-fun.js';
import {sourceMemes} from './source-memes.js';
test('curated content cycles without repeats even with a stuck random source',()=>{
 for(const bank of [curatedJokes,curatedMemes,sourceMemes] as readonly (readonly {id:string}[])[]){
  const recent:string[]=[];
  for(let i=0;i<bank.length;i++){const item=pickFresh(bank,recent,()=>0);assert.ok(!recent.includes(item.id));recent.unshift(item.id);}
  assert.equal(pickFresh(bank,recent,()=>0).id,recent.at(-1));
 }
});
test('every meme has an explicit image pairing and every joke fits the card bank limits',()=>{
 for(const meme of curatedMemes){assert.ok(meme.template);assert.ok(meme.caption.top.length<85);assert.ok(meme.caption.bottom.length<85);}
 for(const joke of curatedJokes)assert.ok(joke.text.length<230);
 assert.equal(new Set(curatedJokes.map(j=>j.text)).size,curatedJokes.length);
});
