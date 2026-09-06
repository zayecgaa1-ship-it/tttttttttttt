import assert from "node:assert/strict";
import test from "node:test";
import { arabicHumor } from "./arabic-humor.js";

test("Arabic humor bank is large, unique, local, and Arabic",()=>{
  assert.ok(arabicHumor.length>=600);
  assert.equal(new Set(arabicHumor.map(entry=>entry.id)).size,arabicHumor.length);
  assert.equal(new Set(arabicHumor.map(entry=>entry.text)).size,arabicHumor.length);
  for(const entry of arabicHumor){
    assert.match(entry.text,/[\u0600-\u06ff]/u);
    assert.doesNotMatch(entry.text,/(?:https?:\/\/|www\.|@\w)/iu);
    assert.ok(entry.text.length>=38&&entry.text.length<=230);
  }
});
