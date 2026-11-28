import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
const source=readFileSync(new URL('../assets/seo-analytics.js',import.meta.url),'utf8')
function fixture({stored=null,search='',hash='',fail=false}={}){
 const children=[],scripts=[],events=[],calls=[]
 const node=()=>({children:[],append(...a){this.children.push(...a)},setAttribute(){},addEventListener(){}})
 const document={querySelector:()=>({content:'114747437'}),querySelectorAll:()=>[],documentElement:{lang:'ru'},title:'Public page',createElement:node,body:{append:n=>children.push(n)},head:{append:n=>scripts.push(n)}}
 const location={origin:'https://bricklab-3d.ru',pathname:'/editor',search,hash,reload:()=>events.push('reload'),replace:p=>events.push(p)}
 const localStorage={getItem:()=>stored,setItem:(k,v)=>{if(fail)throw Error('disabled');stored=v},removeItem:()=>{stored=null}}
 const window={addEventListener(){},ym:(...a)=>calls.push(a)}
 runInNewContext(source,{document,location,localStorage,window})
 return {children,scripts,events,calls,get stored(){return stored}}
}
test('analytics is off until explicit consent and can be withdrawn',()=>{
 const f=fixture()
 assert.equal(f.scripts.length,0)
 const [,policy,accept,decline]=f.children[0].children
 assert.equal(policy.href,'/assets/analytics-privacy.html')
 accept.onclick()
 assert.equal(f.scripts.length,1)
 assert.equal(f.stored,'yes')
 assert.equal(f.calls[0][2].webvisor,false)
 assert.equal(f.calls[0][2].clickmap,false)
 decline.onclick()
 assert.equal(f.stored,'no')
 assert.deepEqual(f.events,['reload'])
})
test('refusal and unavailable preference storage do not load analytics',()=>{
 const refused=fixture()
 refused.children[0].children[3].onclick()
 assert.equal(refused.scripts.length,0)
 assert.equal(refused.stored,'no')
 const denied=fixture({fail:true})
 denied.children[0].children[2].onclick()
 assert.equal(denied.scripts.length,0)
})
test('query and hash URLs never start analytics',()=>{
 assert.equal(fixture({stored:'yes',search:'?q=private'}).scripts.length,0)
 assert.equal(fixture({stored:'yes',hash:'#private'}).scripts.length,0)
 assert.equal(fixture({stored:'yes'}).scripts.length,1)
})
