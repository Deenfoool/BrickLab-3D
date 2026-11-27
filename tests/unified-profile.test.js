import {renderUnifiedEditor,renderPortfolio,renderUnifiedHero} from '../src/menu/unified-profile.js'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {calendarDays,defaultPortfolio,filterPortfolio,validatePortfolio} from '../src/menu/portfolio-model.js'
import {validatePublicCard,publicCard} from '../server/community.js'
import {validateProfile} from '../server/profile.js'
const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',c='cccccccc-cccc-cccc-cccc-cccccccccccc'
test('portfolio validates order, limits, collection membership and private field projection',()=>{
 const p=defaultPortfolio();p.featured=a;p.collections=[{title:'Engine builds',ids:[a,b,a],secret:'do not export'}]
 const filtered=filterPortfolio(p,[a])
 assert.equal(filtered.featured,a);assert.deepEqual(filtered.collections,[{title:'Engine builds',ids:[a]}])
 assert.equal(filterPortfolio(p,[b]).featured,null)
 assert.throws(()=>validatePortfolio({...p,blocks:Array(8).fill(p.blocks[0])}),{message:'invalid_portfolio'})
 assert.throws(()=>validatePortfolio({...p,featured:'https://example.invalid'}),{message:'invalid_portfolio'})
 assert.throws(()=>validatePortfolio({...p,collections:[{title:'',ids:[a]}]}),{message:'invalid_portfolio'})
 assert.deepEqual(validatePortfolio({...p,email:'secret@example.invalid'}),validatePortfolio(p))
})
test('unified profile requires explicit consent and projects only allowed public fields',()=>{
 const p=defaultPortfolio();p.featured=a;p.collections=[{title:'Hidden collection',ids:[a,b]}]
 p.blocks.find(x=>x.key==='awards').visible=false
 p.blocks.find(x=>x.key==='collections').visible=false
 p.blocks.find(x=>x.key==='about').visible=false
 p.blocks.find(x=>x.key==='featured').visible=false
 const input={displayName:'Builder',bio:'private text',cover:'amber',showAvatar:false,showCover:false,showBackground:true,unified:true,consent:true,portfolio:p}
 const valid=validatePublicCard(input)
 assert.equal(valid.unified,true);assert.equal(valid.cover,'amber')
 assert.throws(()=>validatePublicCard({...input,consent:false}),{message:'invalid_public_profile'})
 assert.throws(()=>validatePublicCard({...input,showAvatar:'true'}),{message:'invalid_public_profile'})
 const row={...valid,id:c,publicIds:[a],unified:true,showAward:true,email:'private@example.invalid',shareAvatar:false,shareCover:false}
 const visitor=publicCard(row),owner=publicCard(row,{owner:true})
 assert.equal(visitor.bio,'');assert.equal(visitor.portfolio.featured,null);assert.deepEqual(visitor.portfolio.collections,[]);assert.deepEqual(visitor.awards,[])
 assert.equal(visitor.email,undefined);assert.equal(visitor.showAvatar,undefined)
 assert.equal(owner.bio,'private text');assert.deepEqual(owner.portfolio.collections,[{title:'Hidden collection',ids:[a]}]);assert.equal(owner.showAvatar,false)
 assert.deepEqual(validateProfile({displayName:' Builder ',bio:'hi',cover:'amber'}),{displayName:'Builder',bio:'hi',cover:'amber'})
})
test('calendar uses real UTC dates and sums only retained counts',()=>{
 const days=calendarDays([{day:'2026-11-25',count:2},{day:'2026-11-25',count:1},{day:'2026-11-23',count:4},{day:'bad',count:999}],new Date('2026-11-25T10:00:00Z'),3)
 assert.deepEqual(days,[{day:'2026-11-23',count:4},{day:'2026-11-24',count:0},{day:'2026-11-25',count:3}])
})

function element(tag){
 const n={tag,children:[],className:'',textContent:'',attrs:{},namespaceURI:'http://www.w3.org/2000/svg',
 append(...c){this.children.push(...c)},prepend(...c){this.children.unshift(...c)},replaceChildren(...c){this.children=c},setAttribute(k,v){this.attrs[k]=v}}
 n.classList={add(...v){n.className=[n.className,...v].filter(Boolean).join(' ')}}
 return n
}
const flatten=n=>[n,...n.children.flatMap(flatten)]
test('owner controls publish only after consent and block order is persisted; visitor sees public blocks only',()=>{
 const prior=globalThis.document;globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)}
 try{
  const saved=[],published=[],base={lang:'ru',user:{displayName:'Builder'},profile:{bio:'private',cover:'amber'},publicCard:null,publicLoaded:true,publicBuilds:[{id:a,title:'Model'}],busy:false,saveProfile:v=>saved.push(v),publishPublic:v=>published.push(v)}
  const root=renderUnifiedEditor(base),all=flatten(root),form=all.find(n=>n.tag==='form'),enable=all.find(n=>n.tag==='label'&&n.children.some(c=>c.textContent==='Публичная мастерская')).children[0],consent=all.find(n=>n.tag==='label'&&n.children.some(c=>c.textContent.startsWith('Разрешаю публиковать'))).children[0]
  form.onsubmit({preventDefault(){}});assert.equal(saved.length,1);assert.equal(published.length,0)
  enable.checked=true;enable.onchange();form.onsubmit({preventDefault(){}});assert.equal(published.length,0)
  const move=all.find(n=>n.tag==='button'&&n.attrs['aria-label']==='Перетащить: Закреплённая работа');move.onkeydown({key:'ArrowDown',preventDefault(){}})
  consent.checked=true;form.onsubmit({preventDefault(){}});assert.equal(published.length,1);assert.equal(published[0].portfolio.blocks[0].key,'publications')
  const pending=flatten(renderUnifiedEditor({...base,publicLoaded:false}));assert.ok(!pending.some(n=>n.tag==='button'&&n.type==='submit'))
  const p=defaultPortfolio();p.featured=a;p.blocks.find(b=>b.key==='about').visible=false
  const visitor=flatten(renderPortfolio({lang:'ru',profile:{portfolio:p,bio:'hidden'},builds:[{id:a,title:'Public build',partCount:32}],owner:false}))
  assert.ok(visitor.some(n=>n.className==='portfolio-block portfolio-featured'));assert.ok(!visitor.some(n=>n.textContent==='hidden'))
  const hero=flatten(renderUnifiedHero({lang:'ru',identity:{id:b,displayName:'Builder',avatarUrl:'/api/profile/avatar?v='+a},owner:false}))
  assert.ok(!hero.some(n=>n.tag==='img'))
 }finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior}
})
