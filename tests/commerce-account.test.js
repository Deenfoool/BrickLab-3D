import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPaymentsHandler} from '../server/payments.js';
import {commerceStore,commerceEntitlements,commerceEnvironment} from '../server/db/commerce-store.js';
import {BASE_LIMITS} from '../src/menu/commerce-catalog.js';

test('account projection receives live scoped grants and safe order history',async()=>{
 const uid='account-a',queries=[];
 const scope=async (owner,fn)=>{
  assert.equal(owner,uid);
  return fn(async (parts,...values)=>{
   queries.push(parts.join('?'));assert.deepEqual(values,[uid]);
   if(queries.length===1)return [
    {id:'a',kind:'storage',sku:'slots-30',target:''},
    {id:'b',kind:'subscription',sku:'plus-1',target:'',expiresAt:new Date(Date.now()+60000)},
    {id:'c',kind:'theme',sku:'carbon',target:'carbon'},
    {id:'d',kind:'instruction',sku:'instruction-42215-1',target:'42215-1'}
   ];
   if(queries.at(-1).includes('hub_promo_grants'))return [];
   if(queries.at(-1).includes('instruction_welcome_grants'))return [{setId:'12345-1'}];
   if(queries.at(-1).includes('instruction_first_build'))return [];
   if(queries.at(-1).includes('from bricklab.commerce_orders'))return [{id:'order',sku:'slots-30',status:'succeeded'}];
   assert.fail('Unexpected account query: '+queries.at(-1));
  });
 };
 const data=await commerceStore(scope).commerceAccount(uid);
 assert.equal(data.limits.projects,90);assert.equal(data.limits.storageMiB,288);
 assert.deepEqual(data.themes,['carbon']);assert.deepEqual(data.instructions,['42215-1','12345-1']);
 assert.deepEqual(data.welcomeInstructions,['12345-1']);assert.equal(data.welcomeRemaining,0);assert.equal(data.firstBuilder,false);
 assert.equal(data.orders.length,1);
 assert.match(queries[0],/environment='live'/);assert.match(queries[0],/status='succeeded'/);
 assert.match(queries[0],/revoked_at is null/);assert.match(queries[1],/hub_promo_grants/);assert.match(queries[2],/instruction_welcome_grants/);assert.match(queries[3],/instruction_first_build/);assert.match(queries[4],/environment='live'/);assert.equal(queries.length,5);
});

test('ordinary account can read only its own commerce projection, no writes',async t=>{
 const calls=[];
 const store={getSession:async()=>({id:'actual-user'}),commerceAccount:async uid=>{calls.push(uid);return {limits:BASE_LIMITS,orders:[]}}};
 const handler=createPaymentsHandler({store,origin:'https://bricklab.test',config:{enabled:false}});
 const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const url='http://127.0.0.1:'+server.address().port;
 const headers={cookie:'__Host-bricklab_session='+'a'.repeat(64)};
 assert.equal((await fetch(url+'/api/commerce/account')).status,401);
 const response=await fetch(url+'/api/commerce/account?user=other',{headers});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual((await response.json()).limits,BASE_LIMITS);
 assert.equal((await fetch(url+'/api/commerce/account',{method:'POST',headers})).status,405);
 assert.equal((await fetch(url+'/api/store/orders',{headers})).status,403);
 assert.deepEqual(calls,['actual-user']);
});

test('live promo access extends paid Plus without inventing orders or paid loyalty',async()=>{
 const uid='account-a',now=Date.now(),day=86400000;
 const paidEnd=now+3*day,promoEnd=paidEnd+7*day;
 const tx=async(parts,...values)=>{
  const query=parts.join('?');
  assert.deepEqual(values,[uid]);
  if(query.includes('from bricklab.commerce_grants'))return [{id:'paid',kind:'subscription',sku:'plus-1',grantedAt:new Date(now-day),expiresAt:new Date(paidEnd)}];
  if(query.includes('hub_promo_grants'))return [{id:'reward',grantedAt:new Date(paidEnd),expiresAt:new Date(promoEnd)}];
  if(query.includes('instruction_welcome_grants')||query.includes('instruction_first_build')||query.includes('from bricklab.commerce_orders'))return [];
  assert.fail('Unexpected query: '+query);
 };
 const data=await commerceStore(async(owner,fn)=>{assert.equal(owner,uid);return fn(tx)}).commerceAccount(uid);
 assert.equal(data.plus,true);
 assert.equal(data.plusUntil,promoEnd);
 assert.equal(data.limits.projects,BASE_LIMITS.projects+40);
 assert.equal(data.loyalty.days,1);
 assert.deepEqual(data.orders,[]);
});

test('active promo alone enables live Plus, never sandbox Plus',async()=>{
 const uid='account-a',now=Date.now(),end=now+7*86400000;
 const queries=[];
 const tx=async(parts,...values)=>{
  const query=parts.join('?');queries.push(query);
  assert.deepEqual(values,[uid]);
  if(query.includes('from bricklab.commerce_grants'))return [];
  if(query.includes('hub_promo_grants'))return [{id:'reward',grantedAt:new Date(now-60000),expiresAt:new Date(end)}];
  if(query.includes('instruction_welcome_grants')||query.includes('instruction_first_build'))return [];
  assert.fail('Unexpected query: '+query);
 };
 const live=await commerceEntitlements(tx,uid,'live');
 assert.equal(live.plus,true);
 assert.equal(live.plusUntil,end);
 assert.equal(live.loyalty.days,0);
 queries.length=0;
 const sandbox=await commerceEntitlements(tx,uid,'test');
 assert.equal(sandbox.plus,false);
 assert.equal(sandbox.plusUntil,0);
 assert.equal(queries.length,1);
 assert.match(queries[0],/environment='test'/);
});

test('private profile and Hub sandbox selection is admin only',async()=>{
 const env={BRICKLAB_COMMERCE_MODE:'test',BRICKLAB_YOOKASSA_TEST_ENABLED:'true'};
 const tx=admin=>async parts=>{assert.match(parts.join('?'),/bricklab.is_admin/);return [{admin}]};
 assert.equal(await commerceEnvironment(tx(true),env),'test');
 assert.equal(await commerceEnvironment(tx(false),env),'live');
 const noQuery=()=>assert.fail('live must not query sandbox');
 assert.equal(await commerceEnvironment(noQuery,{...env,BRICKLAB_COMMERCE_MODE:'live'}),'live');
 assert.equal(await commerceEnvironment(noQuery,{...env,BRICKLAB_YOOKASSA_TEST_ENABLED:'false'}),'live');
});
