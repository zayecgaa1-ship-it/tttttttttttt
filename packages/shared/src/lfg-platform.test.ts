import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { LFG_PLATFORMS, matchesLfgPlatform } from './lfg-platform.js';
import { db } from '../../db/src/client.js';
import { getNotificationCandidates } from '../../../apps/api/src/modules/lfg/service.js';

// Prisma delegates are proxies, so Node's descriptor-based mock.method cannot
// replace them. Restore every stub automatically at the end of each test.
function stub(t: TestContext, target: object, name: string, implementation: (...args: any[]) => any) {
  const delegate = target as Record<string, unknown>;
  const original = delegate[name];
  delegate[name] = implementation;
  t.after(() => { delegate[name] = original; });
}

test('platform compatibility supports explicit platforms and all-device games', () => {
  for (const room of LFG_PLATFORMS) {
    for (const player of LFG_PLATFORMS) assert.equal(matchesLfgPlatform(room, player), room === player);
    assert.equal(matchesLfgPlatform(room, null), true);
    assert.equal(matchesLfgPlatform(undefined, room), true);
  }
  assert.equal(matchesLfgPlatform(null, undefined), true);
});

for (const source of ['MANUAL', 'AUTO']) {
    test(`${source} room sends DMs to every interest for the classified game`, async t => {
      stub(t, db.botIdentity, 'upsert', async () => ({ name:'Test',tagline:'Test' }));
      stub(t, db.guildSettings, 'upsert', async () => ({ dmNotificationsEnabled:true,maxDmPerDay:10,autoRoomDmInterestedUsers:true }));
      stub(t, db.lfgRoom, 'findUniqueOrThrow', async () => ({ id:'room',lfgGameId:'minecraft',platform:null,hostId:'host',source }));
      stub(t, db.userGamePreference, 'findMany', async (args: any) => {
        assert.equal(args.where.lfgGameId, 'minecraft');
        assert.equal(JSON.stringify(args.where).includes('platform'), false, 'device is classified on the game, not the player preference');
        assert.equal(args.where.interestStatus, 'INTERESTED');
        assert.equal(args.where.notificationsEnabled, true);
        assert.equal(args.where.userId.not, 'host');
        assert.equal(args.where.autoInvitesEnabled, source==='AUTO'?true:undefined);
        assert.ok(args.where.AND.some((entry: any) => entry.OR?.some((part: any) => part.mutedUntil === null)));
        return [...LFG_PLATFORMS,null].map(value => ({ userId:String(value),platform:value }));
      });
      stub(t, db.notificationDelivery, 'findUnique', async () => null);
      const reservations: string[] = [];
      stub(t, db.notificationDelivery, 'create', async (args: any) => {reservations.push(args.data.userId);return {};});
      const recipients = await getNotificationCandidates('room');
      assert.deepEqual(recipients.map(item=>item.userId), [...LFG_PLATFORMS.map(String),'null']);
      assert.deepEqual(reservations, [...LFG_PLATFORMS.map(String),'null'], 'all subscribers to the game receive the room');
    });
}

test('a successful game invitation remains deduplicated', async t => {
  stub(t, db.botIdentity, 'upsert', async () => ({name:'Test',tagline:'Test'}));
  stub(t, db.guildSettings, 'upsert', async () => ({dmNotificationsEnabled:true,maxDmPerDay:10}));
  stub(t, db.lfgRoom, 'findUniqueOrThrow', async () => ({id:'room',lfgGameId:'minecraft',platform:'PC',hostId:'host',source:'MANUAL'}));
  stub(t, db.userGamePreference, 'findMany', async () => [{userId:'pc-player',platform:'PC'}]);
  stub(t, db.notificationDelivery, 'findUnique', async () => ({status:'SENT'}));
  stub(t, db.notificationDelivery, 'create', async () => {assert.fail('must not reserve an already delivered DM');});
  assert.deepEqual(await getNotificationCandidates('room'), []);
});
