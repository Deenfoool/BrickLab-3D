import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {bridgeIdentity,createTelegramHubHandler} from '../server/telegram-hub.js'
test('Hub bridge binds identity, route, body, method and freshness',()=>{
 const key=Buffer.alloc(32,42),body=Buffer.from('{"code":"PROMO"}'),path='/api/telegram/redeem',method='POST',id='12345',stamp='1780000000'
 const sig=createHmac('sha256',key).update([method,path,id,stamp,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex')
 const headers={'x-bricklab-hub-id':id,'x-bricklab-hub-time':stamp,'x-bricklab-hub-signature':sig}
 const input={method,path,body,headers,key,now:Number(stamp)}
 assert.equal(bridgeIdentity(input),id)
 assert.equal(bridgeIdentity({...input,path:'/api/telegram/campaigns'}),null)
 assert.equal(bridgeIdentity({...input,method:'GET'}),null)
 assert.equal(bridgeIdentity({...input,body:Buffer.from('{}')}),null)
 assert.equal(bridgeIdentity({...input,now:Number(stamp)+31}),null)
 assert.equal(bridgeIdentity({...input,headers:{...headers,'x-bricklab-hub-id':'12346'}}),null)
})

import {createServer} from 'node:http'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

test('private Hub media requires signed linked identity and rejects target overrides',async t=>{
 const key=Buffer.alloc(32,42),dir=mkdtempSync(join(tmpdir(),'bricklab-hub-media-')),file=join(dir,'key');
 writeFileSync(file,key.toString('hex'),{mode:0o600});
 const image=Buffer.from('524946460400000057454250','hex'),calls=[];
 const store={telegramIdentity:async id=>id==='42'?'account-a':id==='43'?'account-b':null,
  getMedia:async(uid,kind)=>{calls.push([uid,kind]);return uid==='account-a'?image:null}};
 const handler=createTelegramHubHandler({store,origin:'https://bricklab.test',keyFile:file});
 const server=createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true})});
 const base='http://127.0.0.1:'+server.address().port;
 function headers(id,path){const stamp=String(Math.floor(Date.now()/1000)),sig=createHmac('sha256',key).update(['GET',path,id,stamp,createHash('sha256').update('').digest('hex')].join('\n')).digest('hex');return {'x-bricklab-hub-id':id,'x-bricklab-hub-time':stamp,'x-bricklab-hub-signature':sig}}
 const path='/api/telegram/avatar';
 assert.equal((await fetch(base+path)).status,403);
 assert.equal((await fetch(base+path,{headers:headers('99',path)})).status,403);
 assert.equal((await fetch(base+path+'?user=account-a',{headers:headers('43',path)})).status,400);
 assert.equal((await fetch(base+path,{headers:headers('43',path)})).status,404);
 const response=await fetch(base+path,{headers:headers('42',path)});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
 assert.equal((await fetch(base+'/api/telegram/cover',{headers:headers('42',path)})).status,403);
 assert.equal((await fetch(base+'/api/telegram/cover',{headers:headers('42','/api/telegram/cover')})).status,200);
 assert.deepEqual(calls,[['account-b','avatar'],['account-a','avatar'],['account-a','cover']]);
});
