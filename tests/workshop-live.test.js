import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaultPortfolio,validatePortfolio,filterPortfolio} from '../src/menu/portfolio-model.js'
import {toLiveBlocks,validateLiveBlocks,validateLiveRect,overlaps,resizeLiveRect,moveLiveRect,resolveLivePlacement,compactLiveBlocks,mobileLiveBlocks,livePreset,createLiveHistory} from '../src/menu/workshop-live-model.js'
import {renderWorkshopLive,createWorkshopLiveSession,liveSessionDirty} from '../src/menu/workshop-live.js'
import {renderWorkshopAwards} from '../src/menu/workshop-award-widgets.js'
import {renderAchievementMedal} from '../src/menu/achievement-hall.js'
import {achievementById} from '../src/menu/achievement-catalog.js'
import {renderPortfolio} from '../src/menu/unified-profile.js'
const base=()=>defaultPortfolio({publicByDefault:true}),initial=()=>toLiveBlocks(base().blocks)
test('all nine starting widgets are equal; prior explicit widths and visibility are preserved',()=>{
 const blocks=initial();assert.equal(blocks.length,9);assert.ok(blocks.every(b=>b.rect.w===6&&b.rect.h===2));assert.equal(blocks.find(b=>b.key==='activity').visible,false)
 assert.deepEqual(validateLiveBlocks(blocks),blocks)
 const p={...base(),blocks};assert.deepEqual(validatePortfolio(p),p);assert.deepEqual(filterPortfolio(p,[]),p)
 const old=base();old.blocks[0].span=8;assert.equal(toLiveBlocks(old.blocks).find(b=>b.key==='featured').rect.w,8)
 for(const id of ['classic','minimal','portfolio','engineering'])assert.deepEqual(validateLiveBlocks(livePreset(blocks,id)),livePreset(blocks,id))
 assert.throws(()=>validateLiveRect({x:10,y:0,w:6,h:2}),/invalid_portfolio/)
 assert.throws(()=>validatePortfolio({...p,blocks:blocks.map(b=>({...b,rect:{x:0,y:0,w:6,h:2}}))}),/invalid_portfolio/)
 assert.throws(()=>validatePortfolio({...p,blocks:blocks.map(b=>({...b,rect:{...b.rect,h:'2'}}))}),/invalid_portfolio/)
})
test('resize eight directions and move within bounds; resolve collisions without moving locks',()=>{
 const r={x:3,y:4,w:6,h:4}
 assert.deepEqual(resizeLiveRect(r,'nw',-2,-2),{x:1,y:2,w:8,h:6})
 assert.deepEqual(resizeLiveRect(r,'se',2,2),{x:3,y:4,w:8,h:6})
 assert.deepEqual(resizeLiveRect(r,'n',0,-2),{x:3,y:2,w:6,h:6})
 assert.deepEqual(resizeLiveRect(r,'s',0,2),{x:3,y:4,w:6,h:6})
 assert.deepEqual(resizeLiveRect(r,'e',2,0),{x:3,y:4,w:8,h:4})
 assert.deepEqual(resizeLiveRect(r,'w',-2,0),{x:1,y:4,w:8,h:4})
 assert.deepEqual(resizeLiveRect(r,'ne',2,-2),{x:3,y:2,w:8,h:6})
 assert.deepEqual(resizeLiveRect(r,'sw',-2,2),{x:1,y:4,w:8,h:6})
 assert.deepEqual(moveLiveRect(r,90,-90),{x:6,y:0,w:6,h:4})
 const source=initial(),key=source[0].key,other=source[1],next=resolveLivePlacement(source,key,other.rect)
 assert.ok(next);assert.deepEqual(next.find(b=>b.key===key).rect,other.rect)
 assert.ok(next.every((b,i)=>next.every((c,j)=>i===j||!overlaps(b.rect,c.rect))))
 const locked=source.map(b=>b.key===other.key?{...b,locked:true}:b)
 assert.equal(resolveLivePlacement(locked,key,other.rect),null)
 assert.equal(resolveLivePlacement(locked,other.key,{x:0,y:30,w:6,h:2}),null)
 const compact=compactLiveBlocks(locked);assert.deepEqual(compact.find(b=>b.key===other.key),locked.find(b=>b.key===other.key))
 const mobile=mobileLiveBlocks(compact);assert.ok(mobile.every(b=>b.visible&&b.rect.w===12&&b.rect.x===0));assert.ok(mobile.every((b,i)=>i===0||b.rect.y===mobile[i-1].rect.y+mobile[i-1].rect.h))
})
test('history retains independent snapshots and supports undo, redo and branch replacement',()=>{
 const a={portfolio:{...base(),blocks:initial()},showcase:[]},h=createLiveHistory(a),b=structuredClone(a);b.showcase=['firstCloudSave']
 assert.equal(h.commit(b),true);b.showcase.push('bad');assert.deepEqual(h.value.showcase,['firstCloudSave'])
 assert.equal(h.undo(),true);assert.deepEqual(h.value,a);assert.equal(h.redo(),true);assert.deepEqual(h.value.showcase,['firstCloudSave'])
 h.undo();const c=structuredClone(a);c.portfolio.blocks[0].visible=false;h.commit(c);assert.equal(h.canRedo,false)
})
function element(tag){
 const n={tag,children:[],className:'',textContent:'',attrs:{},dataset:{},namespaceURI:'http://www.w3.org/2000/svg',style:{setProperty(k,v){this[k]=v}},append(...nodes){this.children.push(...nodes)},prepend(...nodes){this.children.unshift(...nodes)},replaceChildren(...nodes){this.children=nodes},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]??null},addEventListener(){},showModal(){this.open=true},close(){this.open=false;this.onclose?.()},remove(){},focus(){}}
 n.classList={add(...items){n.className=[n.className,...items].filter(Boolean).join(' ')},remove(...items){n.className=n.className.split(' ').filter(x=>!items.includes(x)).join(' ')},toggle(item,enabled){if(enabled)this.add(item);else this.remove(item)}}
 return n
}
const flat=n=>[n,...n.children.flatMap(flat)]
test('real medal component appears in public showcase with only selected date and details',()=>{
 const old=globalThis.document;globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)}
 try{
  const a=achievementById('firstCloudSave'),medal=renderAchievementMedal(a)
  const root=renderWorkshopAwards({ids:['firstCloudSave','invalid'],dates:{firstCloudSave:'2026-11-27T00:00:00Z'},lang:'ru'})
  const tiles=flat(root).filter(n=>n.className.startsWith('workshop-award-item'));assert.equal(tiles.length,1);assert.equal(tiles[0].children[0].className,medal.className);assert.ok(tiles[0].title.includes(a.ru));assert.ok(tiles[0].title.includes('+30 XP'))
  tiles[0].onclick();assert.ok(flat(root).some(n=>n.tag==='dialog'&&n.open))
  const profile={portfolio:{...base(),blocks:initial()},awards:['firstCloudSave'],achievementDates:{firstCloudSave:'2026-11-27T00:00:00Z'}}
  const publicView=renderPortfolio({lang:'ru',profile,live:true});assert.ok(flat(publicView).some(n=>n.className===medal.className));assert.ok(!flat(publicView).some(n=>n.getAttribute('data-widget')==='activity'))
  assert.ok(!flat(publicView).some(n=>n.className==='workshop-live-cover-controls'))
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
})
test('cover controls enter live edit, expose eight handles, hide, undo and save atomic draft',()=>{
 const old=globalThis.document;globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)}
 try{
  const portfolio={...base(),blocks:initial()},progress={awards:[{award:'firstCloudSave',awardedAt:'2026-11-27T00:00:00Z'}],showcase:['firstCloudSave']},saved=[];let session
  const grid=(value,editing)=>renderPortfolio({lang:'ru',profile:{portfolio:value.portfolio,awards:value.showcase},owner:true,live:true,editing})
  const ui=renderWorkshopLive({lang:'ru',portfolio,progress,signal:new AbortController().signal,onSession:s=>session=s,onSave:(...args)=>saved.push(args),renderGrid:grid,renderPreview:s=>grid(s,false)})
  const find=(root,label)=>flat(root).find(n=>n.attrs['aria-label']===label)
  assert.equal(ui.controls.children.length,1);find(ui.controls,'Редактировать мастерскую').onclick()
  assert.equal(ui.controls.children.length,3);assert.equal(flat(ui.surface).filter(n=>n.attrs['data-edge']).length,72)
  const about=flat(ui.surface).find(n=>n.attrs['data-widget']==='about');find(about,'Скрыть блок').onclick();assert.equal(session.history.value.portfolio.blocks.find(b=>b.key==='about').visible,false);assert.equal(liveSessionDirty(session),true)
  find(ui.surface,'Отменить действие · Ctrl+Z').onclick();assert.equal(session.history.value.portfolio.blocks.find(b=>b.key==='about').visible,true)
  find(ui.surface,'Повторить · Ctrl+Shift+Z').onclick();assert.equal(session.history.value.portfolio.blocks.find(b=>b.key==='about').visible,false)
  const awards=flat(ui.surface).find(n=>n.attrs['data-widget']==='awards');find(awards,'Выбрать награды').onclick();assert.ok(flat(ui.surface).some(n=>n.tag==='dialog'&&n.open))
  find(ui.controls,'Сохранить компоновку').onclick();assert.equal(saved.length,1);assert.equal(saved[0][2],true);assert.deepEqual(saved[0][1],['firstCloudSave']);assert.equal(saved[0][0].blocks.find(b=>b.key==='about').visible,false)
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
})
