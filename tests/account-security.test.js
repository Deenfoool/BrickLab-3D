
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {createAccountSecurityHandler} from '../server/account-security.js'
import {createMailer,postboxHeaders,sendPostbox} from '../server/mail.js'
import {verifyPassword} from '../server/auth.js'
import {createAuthClient} from '../src/menu/auth-client.js'
import {adminTarget} from '../src/menu/admin-panel.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',origin='https://bricklab-3d.ru',email='builder@example.invalid',password='long-test-password'
const digest=x=>createHash('sha256').update(x).digest('hex')
async function fixture(t,{store={},registrationEnabled=true,mail=null}={}){
 const handler=createAccountSecurityHandler({store,origin,registrationEnabled,mail})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url.split('?')[0])){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 return (path,{method='POST',body,token,from=origin}={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/'+path,{method,headers:{Origin:from,...(token?{Cookie:'__Host-bricklab_session='+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
test('registration creates no session, code is hashed and one-use; recovery uses separate purpose',async t=>{
 const codes=[],tokens=new Map(),finished=[]
 const store={issueAccountToken:async(e,p,h)=>{tokens.set(e+':'+p,h);return true},finishAccountToken:async(e,p,h,hash,name)=>{const k=e+':'+p;if(tokens.get(k)!==h)return false;tokens.delete(k);finished.push({p,hash,name});return true}}
 const api=await fixture(t,{store,mail:async data=>codes.push(data)})
 const r=await api('auth/register',{body:{email,password,admin:true}})
 assert.equal(r.status,202);assert.equal(r.headers.get('set-cookie'),null);assert.deepEqual(await r.json(),{pending:true});assert.equal(finished.length,0)
 assert.equal(codes.length,1);assert.match(codes[0].code,/^\d{6}$/);assert.match(tokens.get(email+':register'),/^[a-f0-9]{64}$/);assert.notEqual(tokens.get(email+':register'),digest(codes[0].code));assert.notEqual(tokens.get(email+':register'),codes[0].code)
 assert.equal((await api('auth/verify',{body:{email,code:'0'.repeat(48),password,displayName:'Builder'}})).status,400)
 const valid={email,code:codes[0].code,password,displayName:'Builder'}
 assert.equal((await api('auth/verify',{body:valid})).status,200)
 assert.equal((await api('auth/verify',{body:valid})).status,400)
 assert.equal(finished[0].name,'Builder');assert.equal(await verifyPassword(password,finished[0].hash),true)
 assert.equal((await api('auth/reset-request',{body:{email}})).status,202)
 assert.equal(codes[1].purpose,'reset')
 assert.equal((await api('auth/reset-confirm',{body:{email,code:codes[1].code,password:'different-long-password'}})).status,200)
 assert.equal(finished[1].p,'reset')
})
test('production registration fails closed without email provider',async t=>{
 const api=await fixture(t)
 const r=await api('auth/config',{method:'GET'});assert.deepEqual(await r.json(),{registrationEnabled:false,emailVerification:true,resetEnabled:false})
 assert.equal((await api('auth/register',{body:{email}})).status,503)
})
test('administrator endpoints enforce session, privilege, origin and action allowlist',async t=>{
 const actions=[],normal='a'.repeat(64),admin='b'.repeat(64)
 const store={getSession:async h=>h===digest(admin)?{id,admin:true}:h===digest(normal)?{id}:null,adminOverview:async()=>({users:4}),adminAction:async(...args)=>actions.push(args)}
 const api=await fixture(t,{store})
 assert.equal((await api('admin',{method:'GET'})).status,401)
 assert.equal((await api('admin',{method:'GET',token:normal})).status,403)
 assert.equal((await api('admin',{method:'GET',token:admin})).status,200)
 const body={action:'block',id,reason:'Spam'}
 assert.equal((await api('admin/action',{token:admin,from:'https://evil.invalid',body})).status,403)
 assert.equal((await api('admin/action',{token:admin,body:{...body,action:'grant_admin'}})).status,400)
 assert.equal((await api('admin/action',{token:admin,body:{...body,reason:''}})).status,400)
 assert.equal((await api('admin/action',{token:admin,body})).status,200)
 assert.deepEqual(actions,[[id,'block',id,'Spam']])
 assert.equal(adminTarget(origin+'/#community/build/'+id),id)
})
test('client retains only explicit admin flag and supports pending responses',async()=>{
 const location={protocol:'https:',hostname:'bricklab-3d.ru'}
 const client=createAuthClient({location,fetcher:async(url)=>({ok:true,status:200,json:async()=>url.endsWith('/register')?{pending:true}:{user:{id,email,displayName:'Admin',admin:true,passwordHash:'secret'}}})})
 assert.deepEqual(await client.register({email}),{pending:true})
 assert.deepEqual(await client.me(),{id,email,displayName:'Admin',admin:true})
})
test('Postbox adapter passes credentials only to transport and uses dedicated test message',async()=>{
 let call
 const mail=createMailer({BRICKLAB_MAIL_USER:'test-id',BRICKLAB_MAIL_KEY:'test-key',BRICKLAB_MAIL_FROM:'noreply@bricklab-3d.ru'},async(message)=>{call=message})
 await mail({email,purpose:'register',code:'054751'})
 assert.equal(call.username,'test-id');assert.equal(call.password,'test-key')
 assert.equal(call.to,email);assert.equal(call.from,'noreply@bricklab-3d.ru');assert.ok(!call.text.includes('test-key'))
 assert.ok(call.text.includes('054-751'));assert.ok(call.html.includes('054-751'));assert.ok(call.html.includes('BrickLab 3D'))
 await mail({email,purpose:'test'})
 assert.ok(!call.text.includes('undefined'))
 assert.equal(createMailer({}),null)
 assert.equal(createMailer({BRICKLAB_MAIL_KEY:'key',BRICKLAB_MAIL_FROM:'noreply@bricklab-3d.ru'}),null)
})

test('Postbox SigV4 fixed reference signature',()=>{
 const headers=postboxHeaders('test-id','test-secret','{"test":true}',new Date('2026-11-24T14:25:00Z'))
 assert.equal(headers['x-amz-date'],'20261124T142500Z')
 assert.equal(headers.authorization,'AWS4-HMAC-SHA256 Credential=test-id/20261124/ru-central1/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=c2045ab405f34675720a3919672956a26d4797f56630d1dd43a8c4397f2f8fd1')
})
test('Postbox HTTPS transport signs the exact UTF-8 request and requires acceptance',async()=>{
 const msg={username:'test-id',password:'test-secret',from:'noreply@bricklab-3d.ru',to:email,subject:'Тест',text:'Код'}
 const id=await sendPostbox(msg,async(url,opts)=>{
  assert.equal(url,'https://postbox.cloud.yandex.net/v2/email/outbound-emails')
  assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error')
  const body=JSON.parse(opts.body)
  assert.equal(body.FromEmailAddress,msg.from)
  assert.deepEqual(body.Destination.ToAddresses,[email])
  assert.equal(body.Content.Simple.Body.Text.Data,'Код')
  assert.ok(!opts.body.includes(msg.password))
  const date=opts.headers['x-amz-date']
  const now=new Date(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+'T'+date.slice(9,11)+':'+date.slice(11,13)+':'+date.slice(13,15)+'Z')
  assert.deepEqual(opts.headers,postboxHeaders(msg.username,msg.password,opts.body,now))
  return new Response(JSON.stringify({MessageId:'accepted-id'}),{status:200})
 })
 assert.equal(id,'accepted-id')
 await assert.rejects(sendPostbox(msg,async()=>new Response('private response',{status:403})),{message:'postbox_http_403'})
 await assert.rejects(sendPostbox(msg,async()=>new Response('{}',{status:200})),{message:'postbox_invalid_response'})
 await assert.rejects(sendPostbox(msg,async()=>{throw Error('private error')}),{message:'postbox_connection'})
})
