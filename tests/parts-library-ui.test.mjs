import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import { mountPartsLibrary, LIBRARY_KEYS, hasNewPreview } from '../ldraw/library-view-v1.js'
import { libraryItems } from '../ldraw/library-model-v1.js'

const fixtures=libraryItems([
  {file:'32073.dat',code:'32073',description:'Technic Axle 5',category:'Technic'},
  {file:'3648.dat',code:'3648',description:'Technic Gear 24 Tooth',category:'Technic'},
  {file:'32270.dat',code:'32270',description:'Technic Gear 12 Tooth Bevel',category:'Technic'},
  {file:'3020.dat',code:'3020',description:'Plate 2 x 4',category:'Plate'},
],[])
test('Native preview observer ignores icon churn and only refreshes for images',async()=>{
  const window=new Window(),doc=window.document
  assert.equal(hasNewPreview([{addedNodes:[doc.createElement('svg'),doc.createTextNode('icon')]}]),false)
  assert.equal(hasNewPreview([{addedNodes:[doc.createElement('img')]}]),true)
  const card=doc.createElement('div');card.innerHTML='<span><img></span>'
  assert.equal(hasNewPreview([{addedNodes:[card]}]),true)
  await window.happyDOM.close()
})
function setup(options={}) {
  const window=new Window({url:'https://bricklab.test'}),root=window.document.createElement('div')
  window.document.body.append(root)
  const inserted=[]
  const view=mountPartsLibrary(root,{storage:window.localStorage,language:()=> 'en',insert:async item=>inserted.push(item.key),...options})
  view.setItems(fixtures)
  return {window,root,view,inserted,click:s=>{assert.ok(root.querySelector(s),s);root.querySelector(s).click()}}
}
test('First visit → Technic → nested categories → details → native insert callback',async()=>{
  const {window,root,view,click,inserted}=setup()
  assert.equal(root.querySelectorAll('[data-family]').length,7)
  click('[data-family="technic"]');assert.equal(root.querySelectorAll('.pl-card').length,3)
  assert.equal(root.querySelectorAll('.ld2-card[data-file]').length,3,'predictive loader sees every LDraw card')
  click('[data-expand="gears"]');assert.equal(root.querySelector('[data-category="gears/bevel"]'),null)
  click('[data-expand="gears"]');click('[data-category="gears/bevel"]')
  assert.equal(root.querySelectorAll('.pl-card').length,1)
  click('[data-select="ldraw-32270"]');assert.match(root.querySelector('.pl-detail').textContent,/32270/)
  click('[data-add="ldraw-32270"]');await new Promise(resolve=>setTimeout(resolve,0))
  assert.deepEqual(inserted,['ldraw-32270'])
  assert.deepEqual(JSON.parse(window.localStorage.getItem(LIBRARY_KEYS.recents)),['ldraw-32270'])
  view.destroy();await window.happyDOM.close()
})
test('Family survives a remount; change-family remains visible',async()=>{
  const {root,window,view,click}=setup();click('[data-family="technic"]');view.destroy()
  const next=mountPartsLibrary(root,{storage:window.localStorage,language:()=> 'en',insert:()=>true});next.setItems(fixtures)
  assert.equal(next.state().family,'technic');click('[data-change]');assert.equal(root.querySelectorAll('[data-family]').length,7)
  click('[data-family="system"]');assert.match(root.querySelector('.pl-results').textContent,/Plate/)
  next.destroy();await window.happyDOM.close()
})
test('Search input, favorites, sections and keyboard isolation',async()=>{
  const {root,window,view,click}=setup({context:()=>({project:['ldraw-32073'],compatible:['ldraw-3648']})});click('[data-family="technic"]')
  const input=root.querySelector('input');input.value='ось 5';input.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,130))
  assert.equal(root.querySelectorAll('.pl-card').length,1)
  click('[data-favorite="ldraw-32073"]');click('[data-tab="favorites"]');assert.equal(root.querySelectorAll('.pl-card').length,1)
  let sceneKeys=0;window.document.addEventListener('keydown',()=>sceneKeys++)
  input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert.equal(sceneKeys,0)
  input.value='';input.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,130))
  click('[data-tab="project"]');assert.match(root.querySelector('.pl-results').textContent,/Axle/)
  click('[data-tab="compatible"]');assert.match(root.querySelector('.pl-results').textContent,/Gear 24/)
  view.destroy();await window.happyDOM.close()
})
test('17000 metadata entries render no more than 48 cards',async()=>{
  const {root,window,view,click}=setup()
  view.setItems(libraryItems(Array.from({length:17000},(_,i)=>({file:`${i}.dat`,code:String(i),description:`Technic Axle ${i}`})),[]))
  click('[data-family="technic"]');assert.equal(root.querySelectorAll('.pl-card').length,48)
  click('[data-page="1"]');assert.equal(root.querySelectorAll('.pl-card').length,48)
  assert.equal(view.state().page,1);view.destroy();await window.happyDOM.close()
})
test('Failed insertion never records a recent part',async()=>{
  const {root,window,view,click}=setup({insert:async()=>{throw Error('BUILD required')}})
  click('[data-family="technic"]');click('[data-add="ldraw-32073"]');await new Promise(r=>setTimeout(r,0))
  assert.match(root.querySelector('[role="status"]').textContent,/BUILD required/)
  assert.equal(window.localStorage.getItem(LIBRARY_KEYS.recents),null)
  view.destroy();await window.happyDOM.close()
})
test('Failed thumbnails keep an explicit illustrated fallback',async()=>{
  const {root,window,view,click}=setup({preview:()=>'/missing-image.png'})
  click('[data-family="technic"]')
  const image=root.querySelector('.pl-thumb img');image.dispatchEvent(new window.Event('error'))
  assert.equal(image.hidden,true);assert.match(image.parentElement.textContent,/Preview unavailable/)
  assert.ok(image.parentElement.querySelector('svg'))
  view.destroy();await window.happyDOM.close()
})
test('Untrusted metadata is escaped and does not become markup',async()=>{
  const {root,window,view,click}=setup();view.setItems(libraryItems([{file:'1.dat',code:'1',description:'Technic <img src=x onerror=alert(1)>'}],[]))
  click('[data-family="technic"]');assert.equal(root.querySelector('[onerror]'),null)
  view.destroy();await window.happyDOM.close()
})
test('Production retains native insertion and does not write mechanics',async()=>{
  const code=await readFile(new URL('../ldraw/catalog-v3.js',import.meta.url),'utf8')
  assert.match(code,/registerLDrawPart\(\{\.\.\.item,category:item.sourceCategory\}\)/)
  assert.match(code,/card\.click\(\)/);assert.match(code,/BrickLabKinematics\?\.active/)
  assert.doesNotMatch(code,/new PhysicsSession|createRigidBody|insertPart\(/)
})
test('UI cache generation is coherent without changing unrelated import targets',async()=>{
  const index=await readFile(new URL('../index.html',import.meta.url),'utf8')
  const map=JSON.parse(index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports
  assert.equal(map['./bootstrap.js'],'./bootstrap.js?v=parts-library-20260912-v4')
  assert.equal(map['./ldraw/catalog-v3.js'],'./ldraw/catalog-v3.js?v=parts-library-20260912-v4')
  assert.equal(map['./app.js'],'./app.js?v=parts-6-20260911-editor-groups-v2')
  assert.match(map['./ldraw/runtime-v3.js?v=ldraw-catalog-20260910-v3'],/runtime-metadata-cache-v1/)
  for(const file of ['library-view-v1.js','catalog-v3.js']){
    const code=await readFile(new URL(`../ldraw/${file}`,import.meta.url),'utf8')
    for(const match of code.matchAll(/\.\/library-[^'" ]+/g))assert.match(match[0],/\?v=parts-library-20260912-v4$/)
  }
})
