import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {bridgeIdentity} from '../server/telegram-hub.js'
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
