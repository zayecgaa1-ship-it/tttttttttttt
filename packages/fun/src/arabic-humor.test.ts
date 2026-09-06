import assert from "node:assert/strict";
import test from "node:test";
import { arabicHumor } from "./arabic-humor.js";

test("Arabic humor bank contains every source row labelled humorous",()=>{
  assert.equal(arabicHumor.length,4455);
  assert.equal(new Set(arabicHumor.map(entry=>entry.id)).size,arabicHumor.length);
  for(const entry of arabicHumor){
    assert.match(entry.text,/[\u0600-\u06ff]/u);
    assert.ok(entry.text.length>=8);
  }
});
