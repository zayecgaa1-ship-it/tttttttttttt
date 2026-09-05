import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const url=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'This test only bootstraps a local database.');
const schema='lfg_platform_test_'+randomUUID().replaceAll('-','');
assert.match(schema,/^lfg_platform_test_[a-f0-9]{32}$/);
const control=new PrismaClient();
let created=false;
try {
  await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);created=true;
  url.searchParams.set('schema',schema);
  const env={...process.env,DATABASE_URL:url.toString()};
  for(const args of [
    ['node_modules/prisma/build/index.js','db','push','--skip-generate','--schema','packages/db/prisma/schema.prisma'],
    ['node_modules/tsx/dist/cli.mjs',process.argv[2] || 'scripts/lfg-platform-db-smoke.ts']
  ]){
    const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});
    assert.equal(result.status,0,'isolated database check failed');
  }
}finally{
  // Only this randomly named schema created by this process is removed.
  if(created)await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await control.$disconnect();
}
