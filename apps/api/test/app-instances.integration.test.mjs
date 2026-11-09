import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import Fastify from 'fastify';
import { getPool, closeDatabase } from '../dist/db/client.js';
import { registerAppInstanceRoutes } from '../dist/app-instance-routes.js';

// Must run only on CI's isolated PostgreSQL; never use production data.
const dbUrl = new URL(process.env.DATABASE_URL || 'http://missing');
assert.ok(['localhost','127.0.0.1','postgres'].includes(dbUrl.hostname),
  'Use temporary PostgreSQL for instance lease tests');
const app=Fastify();
const alice=randomUUID(),bob=randomUUID();
const aDesktop=randomUUID(),bDesktop=randomUUID(),aMobile=randomUUID(),bMobile=randomUUID();
registerAppInstanceRoutes(app,async request=>request.headers['x-test-user']
  ? {user:{id:request.headers['x-test-user']}}:null);
function send(path,body,{user=alice,origin='http://localhost:5173'}={}){
  return app.inject({method:'POST',url:'/api/v1/instances/'+path,
    headers:{...(user?{'x-test-user':user}:{}),...(origin?{origin}:{})},
    payload:body});
}
before(async()=>{
  await getPool().query('INSERT INTO users(id,handle) VALUES ($1,$2),($3,$4)',
    [alice,'lease_'+alice.slice(0,8),bob,'lease_'+bob.slice(0,8)]);
  await app.ready();
});
after(async()=>{
  await getPool().query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[alice,bob]]);
  await app.close();await closeDatabase();
});

test('instance ownership is atomic, separately scoped and never revokes auth sessions',async()=>{
  assert.equal((await send('claim',{kind:'desktop',instanceId:aDesktop},{user:null})).statusCode,401);
  assert.equal((await send('claim',{kind:'desktop',instanceId:aDesktop},{origin:null})).statusCode,403);
  assert.equal((await send('claim',{kind:'watch',instanceId:aDesktop})).statusCode,400);
  assert.equal((await send('claim',{kind:'desktop',instanceId:'not-an-id'})).statusCode,400);

  const first=await send('claim',{kind:'desktop',instanceId:aDesktop});
  assert.equal(first.statusCode,200);
  assert.equal(first.json().active,true);
  assert.equal(first.json().managed,true);
  assert.equal((await send('claim',{kind:'desktop',instanceId:aDesktop})).statusCode,200,
    'same tab can renew without takeover');

  const second=await send('claim',{kind:'desktop',instanceId:bDesktop});
  assert.equal(second.statusCode,409,'second desktop tab is blocked');
  assert.equal(second.json().error,'INSTANCE_IN_USE');
  assert.equal((await send('claim',{kind:'mobile',instanceId:aMobile})).statusCode,200,
    'one mobile and one desktop can coexist');
  assert.equal((await send('claim',{kind:'mobile',instanceId:bMobile})).statusCode,409,
    'second mobile instance is blocked');
  assert.equal((await send('claim',{kind:'desktop',instanceId:bDesktop},{user:bob})).statusCode,200,
    'different users have independent desktop slots');

  const take=await send('claim',{kind:'desktop',instanceId:bDesktop,takeover:true});
  assert.equal(take.statusCode,200,'explicit takeover succeeds');
  assert.equal((await send('claim',{kind:'desktop',instanceId:aDesktop})).statusCode,409,
    'old tab heartbeat cannot reclaim the slot');
  const staleRelease=await send('release',{kind:'desktop',instanceId:aDesktop});
  assert.equal(staleRelease.statusCode,200);
  assert.equal(staleRelease.json().released,false,'old tab cannot release the new owner');
  assert.equal((await send('claim',{kind:'desktop',instanceId:bDesktop})).statusCode,200);
  const currentRelease=await send('release',{kind:'desktop',instanceId:bDesktop});
  assert.equal(currentRelease.json().released,true);
  assert.equal((await send('claim',{kind:'desktop',instanceId:aDesktop})).statusCode,200,
    'free slot can be claimed without takeover');

  await getPool().query('UPDATE app_instance_leases SET expires_at=now()-interval \'1 second\' WHERE user_id=$1 AND kind=$2',
    [alice,'mobile']);
  assert.equal((await send('claim',{kind:'mobile',instanceId:bMobile})).statusCode,200,
    'an expired mobile tab can be replaced without pressing takeover');
  assert.equal((await send('claim',{kind:'mobile',instanceId:aMobile})).statusCode,409,
    'the expired original must not reactivate over its replacement');
});
