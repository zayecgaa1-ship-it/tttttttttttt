import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedJokes,curatedMemes,pickFresh} from './curated-fun.js';
import {sourceMemes,trustedSourceMemes} from './source-memes.js';
import {prop2HateMemes} from './prop2hate-memes.js';
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
test('AHA meme library contains the complete public sample and its sensitive labels',()=>{
 assert.equal(sourceMemes.length,100);
 assert.equal(sourceMemes.filter(meme=>meme.sensitive).length,35);
 assert.equal(new Set(sourceMemes.map(meme=>meme.id)).size,100);
 for(const meme of sourceMemes)assert.match(meme.url,/^https:\/\/raw\.githubusercontent\.com\/MohamedBayan\/AHA-MEMES-sample\/main\/data\/img\//u);
 assert.equal(trustedSourceMemes.length,24);
 assert.ok(trustedSourceMemes.every(meme=>!meme.sensitive));
});
test('primary meme library contains only the labelled safe-humor selection',()=>{
 assert.equal(prop2HateMemes.length,1957);
 assert.equal(new Set(prop2HateMemes.map(meme=>meme.id)).size,prop2HateMemes.length);
 for(const meme of prop2HateMemes){
  assert.match(meme.id,/^prop2hate-(?:train|dev|test)-\d+$/u);
  assert.ok(Number.isInteger(meme.rowIndex)&&meme.rowIndex>=0);
 }
});
