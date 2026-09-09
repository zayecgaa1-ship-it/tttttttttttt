import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectProfanity,roleLimit,moderationSettingsSchema} from './moderation.js';

for(const text of ['fuck you','FUUUCK','f.u.c.k','f u c k','f*ck','sh*t','b1tch','sh!t','bullshit','كُس أُمّك','كــس امك','ك.س.م.ك','ياحمار','يا كلب','شَرْمُوطة','قحبه','يلعن ابوك','f\u200buck']){
  test(`moderation detects ${JSON.stringify(text)}`,()=>assert.ok(detectProfanity(text)));
}
for(const text of ['class assignment','Scunthorpe','hello friend','ممكن مساعدة في بلوكس فروت','عندي كلب صغير','نلعب الآن؟','حمار وحشي','Discord 12345','classic assistant']){
  test(`moderation preserves ${JSON.stringify(text)}`,()=>assert.equal(detectProfanity(text),null));
}
test('custom phrases match whole terms rather than unrelated substrings',()=>{
  assert.ok(detectProfanity('كلمة ممنوعة',['كلمة ممنوعة']));
  assert.equal(detectProfanity('class',['ass']),null);
});
test('role rules allow zero, inherit blank limits and use strictest matching role',()=>{
  const roles=[{roleId:'111111111111111111',bans:0},{roleId:'222222222222222222',bans:5,roles:7}];
  assert.equal(roleLimit(roles,roles.map(role=>role.roleId),'bans',2),0);
  assert.equal(roleLimit(roles,['222222222222222222'],'roles',8),7);
  assert.equal(roleLimit(roles,['111111111111111111'],'roles',8),8);
  assert.equal(roleLimit(roles,[],'bans',2),2);
});
test('duplicate role policies and negative limits are rejected',()=>{
  const settings={rolePolicies:[{roleId:'111111111111111111',bans:0}],profanityEnabled:true,profanityNotifyOwner:true,profanityLogEnabled:true,profanityCustomWords:[]};
  assert.equal(moderationSettingsSchema.safeParse(settings).success,true);
  assert.equal(moderationSettingsSchema.safeParse({...settings,rolePolicies:[...settings.rolePolicies,...settings.rolePolicies]}).success,false);
  assert.equal(moderationSettingsSchema.safeParse({...settings,rolePolicies:[{...settings.rolePolicies[0],bans:-1}]}).success,false);
});
