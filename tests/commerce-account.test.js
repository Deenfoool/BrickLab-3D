import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPaymentsHandler} from '../server/payments.js';
import {commerceStore} from '../server/db/commerce-store.js';
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
   if(queries.at(-1).includes('instruction_welcome_grants'))return [{setId:'12345-1'}];
   if(queries.at(-1).includes('instruction_first_build'))return [];
   return [{id:'order',sku:'slots-30',status:'succeeded'}];
  });
 };
 const data=await commerceStore(scope).commerceAccount(uid);
 assert.equal(data.limits.projects,90);assert.equal(data.limits.storageMiB,288);
 assert.deepEqual(data.themes,['carbon']);assert.deepEqual(data.instructions,['42215-1','12345-1']);
 assert.deepEqual(data.welcomeInstructions,['12345-1']);assert.equal(data.welcomeRemaining,0);assert.equal(data.firstBuilder,false);
 assert.equal(data.orders.length,1);
 assert.match(queries[0],/environment='live'/);assert.match(queries[0],/status='succeeded'/);
 assert.match(queries[0],/revoked_at is null/);assert.match(queries[1],/instruction_welcome_grants/);assert.match(queries[2],/instruction_first_build/);assert.match(queries[3],/environment='live'/);assert.equal(queries.length,4);
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
