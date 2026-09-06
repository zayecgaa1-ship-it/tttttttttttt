import assert from "node:assert/strict";
import test from "node:test";
import {memeCaptions,memeTemplates} from "./arabic-memes.js";

test("Arabic meme catalogue has curated online templates and many combinations",()=>{
  assert.ok(memeTemplates.length>=12);
  assert.ok(memeCaptions.length>=60);
  assert.ok(memeTemplates.length*memeCaptions.length>=700);
  assert.equal(new Set(memeTemplates.map(item=>item.id)).size,memeTemplates.length);
  for(const template of memeTemplates){
    const url=new URL(template.url);
    assert.equal(url.protocol,"https:");
    assert.equal(url.hostname,"i.imgflip.com");
  }
  for(const caption of memeCaptions){
    assert.match(caption.top+caption.bottom,/[\u0600-\u06ff]/u);
    assert.ok(caption.top.length<=80&&caption.bottom.length<=80);
  }
});
