import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../packages/db/src/client.js';
import {getNotificationCandidates} from '../apps/api/src/modules/lfg/service.js';

// Exercise the real candidate service and PostgreSQL query inside a rolled-back
// transaction. No fixture becomes visible to the bot and no Discord API is used.
const prefix=`platform-smoke-${randomUUID()}`;
const rollback=new Error('intentional fixture rollback');
const originalGuild=process.env.DISCORD_GUILD_ID;
process.env.DISCORD_GUILD_ID=prefix;
try {
  await db.$transaction(async tx=>{
    await tx.guildSettings.create({data:{guildId:prefix,dmNotificationsEnabled:true,maxDmPerDay:10,autoRoomDmInterestedUsers:true}});
    const game=await tx.lfgGameCatalog.create({data:{slug:prefix,name:'Minecraft platform fixture'}});
    const users=['host','PC','MOBILE','PLAYSTATION','unknown','muted','disabled'];
    await tx.user.createMany({data:users.map(name=>({id:`${prefix}-${name}`,displayName:name}))});
    for(const name of users){
      await tx.userGamePreference.create({data:{userId:`${prefix}-${name}`,lfgGameId:game.id,platform:name==='PC'?'PC':name==='PLAYSTATION'?'PLAYSTATION':name==='unknown'?null:'MOBILE',notificationsEnabled:name!=='disabled',mutedUntil:name==='muted'?new Date(Date.now()+3600000):null}});
    }
    const room=await tx.lfgRoom.create({data:{hostId:`${prefix}-host`,lfgGameId:game.id,platform:'MOBILE'}});
    const restore:Array<()=>void>=[];
    for(const [model,methods] of Object.entries({botIdentity:['upsert'],guildSettings:['upsert','update'],lfgRoom:['findUniqueOrThrow'],userGamePreference:['findMany'],notificationDelivery:['findUnique','create','updateMany']})){
      for(const method of methods){
        const delegate=(db as any)[model];
        const original=delegate[method];
        const transactional=(tx as any)[model][method];
        delegate[method]=(...args:any[])=>transactional(...args);
        restore.push(()=>{delegate[method]=original;});
      }
    }
    try {
      const recipients=await getNotificationCandidates(room.id);
      assert.deepEqual(recipients.map(row=>row.userId),[`${prefix}-MOBILE`]);
      assert.equal(await tx.notificationDelivery.count({where:{roomId:room.id}}),1);
      assert.equal(await tx.notificationDelivery.count({where:{roomId:room.id,userId:`${prefix}-PC`}}),0);
      assert.deepEqual(await getNotificationCandidates(room.id),[],'reserved invitations remain deduplicated');
      const preference=await tx.userGamePreference.findUniqueOrThrow({where:{userId_lfgGameId:{userId:`${prefix}-PC`,lfgGameId:game.id}}});
      assert.equal(preference.platform,'PC');
    }finally{restore.reverse().forEach(fn=>fn());}
    throw rollback;
  },{timeout:20000});
}catch(error){if(error!==rollback)throw error;}
finally{if(originalGuild===undefined)delete process.env.DISCORD_GUILD_ID;else process.env.DISCORD_GUILD_ID=originalGuild;await db.$disconnect();}
console.log('PASS: real PostgreSQL platform persistence and DM selection; PC, PlayStation, unknown, host, muted and disabled excluded from mobile room. Fixtures rolled back.');
