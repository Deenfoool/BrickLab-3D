import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createAuthClient,authOriginAllowed} from '../src/menu/auth-client.js'
const loc={protocol:'https:',hostname:'bricklab-3d.ru'}
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data})
const user={id:'abc',email:'a@example.invalid',displayName:'Builder'}
test('allows only secure or local development origins',()=>{
 assert.equal(authOriginAllowed(loc),true)
 assert.equal(authOriginAllowed({protocol:'http:',hostname:'localhost'}),true)
 assert.equal(authOriginAllowed({protocol:'http:',hostname:'191.44.50.192'}),false)
})
test('never transmits credentials over public HTTP',async()=>{
 let calls=0
 const api=createAuthClient({location:{protocol:'http:',hostname:'example.com'},fetcher:()=>{calls++}})
 await assert.rejects(api.login({email:'a',password:'secret'}),{code:'https_required'})
 assert.equal(calls,0)
})
test('session, login and logout use same-origin cookies and no storage',async()=>{
 const calls=[],api=createAuthClient({location:loc,fetcher:async(url,opts)=>{
 calls.push({url,opts})
 return url.endsWith('/me')?response(401,{error:'unauthenticated'}):url.endsWith('/logout')?response(200,{ok:true}):response(200,{user:{...user,passwordHash:'not returned'}})
 }})
 assert.equal(await api.me(),null)
 assert.deepEqual(await api.login({email:user.email,password:'pass'}),user)
 assert.equal(await api.logout(),null)
 assert.deepEqual(calls.map(x=>x.opts.method),['GET','POST','POST'])
 assert.ok(calls.every(x=>x.opts.credentials==='same-origin'&&x.opts.redirect==='error'&&x.opts.cache==='no-store'))
 assert.deepEqual(JSON.parse(calls[1].opts.body),{email:user.email,password:'pass'})
})
test('registration error and malformed server responses stay errors',async()=>{
 const api=createAuthClient({location:loc,fetcher:async()=>response(403,{error:'registration_disabled'})})
 await assert.rejects(api.register({email:'x',password:'pass',displayName:'X'}),{code:'registration_disabled',status:403})
 const broken=createAuthClient({location:loc,fetcher:async()=>response(200,{ok:true})})
 await assert.rejects(broken.me(),{code:'auth_unavailable'})
})
