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
