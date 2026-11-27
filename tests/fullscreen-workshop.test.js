import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {recentWorkshopBuilds} from '../src/menu/workshop-overview.js'
import {renderCloudWorkshop} from '../src/menu/cloud-workshop.js'
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',remoteId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',other='cccccccc-cccc-cccc-cccc-cccccccccccc'
const remote={id:remoteId,name:'Cloud head',revision:2,updatedAt:'2026-11-25T10:00:00Z'}
const local={id:'local',document:{name:'Local build',parts:[]},modifiedAt:'2026-11-24T10:00:00Z',cloud:{ownerId:owner,id:remoteId,revision:2}}
test('recent builds preserve local copies, deduplicate matching heads and retain newer revisions',()=>{
 assert.equal(recentWorkshopBuilds([local],[remote],owner).length,1)
 const old={...local,cloud:{...local.cloud,revision:1}}
 const both=recentWorkshopBuilds([old],[remote],owner)
 assert.equal(both.length,2);assert.equal(both[0].cloud.id,remoteId);assert.equal(both[0].project,null)
 assert.equal(recentWorkshopBuilds([local],[remote],other).length,2)
 assert.equal(recentWorkshopBuilds([local],[remote],other,1).length,1)
 assert.deepEqual(recentWorkshopBuilds([],[],owner),[])
})
function node(tag){
 const n={tag,children:[],className:'',textContent:'',dataset:{},attrs:{},namespaceURI:'http://www.w3.org/2000/svg',append(...children){this.children.push(...children)},prepend(...children){this.children.unshift(...children)},replaceChildren(...children){this.children=children},setAttribute(k,v){this.attrs[k]=v}}
 n.classList={add(...items){n.className=[n.className,...items].filter(Boolean).join(' ')}}
 return n
}
const flatten=n=>[n,...n.children.flatMap(flatten)]
test('fullscreen workshop renders real cards and functional navigation without duplicate identity',()=>{
 const prior=globalThis.document;globalThis.document={createElement:node,createElementNS:(ns,tag)=>node(tag)}
 const events=[],ctrl=new AbortController()
 try{
  const props={lang:'ru',user:{id:owner,displayName:'Test constructor',admin:true},local:[local],remote:[remote],section:'workshop',busy:false,go:k=>events.push(k),logout:()=>events.push('logout'),createBuild:()=>events.push('create'),openLocal:id=>events.push(id),openFavorite:id=>events.push(id),signal:ctrl.signal,previewsEnabled:false,profileData:{profile:{background:'titanium',cover:'blueprint',bio:''},progress:{xp:30,awards:[{award:'firstCloudSave'}]}},activityData:{favorites:[],events:[],notifications:[]},publicLoaded:true,publicCard:null,publicBuilds:[]}
  const tree=renderCloudWorkshop(props),all=flatten(tree)
  assert.ok(tree.className.includes('signature-titanium'))
  assert.equal(all.filter(n=>n.textContent==='Test constructor').length,1)
  assert.equal(all.filter(n=>n.className==='workshop-recent-card').length,1)
  assert.ok(all.some(n=>n.className==='workshop-sidebar'))
  assert.ok(!all.some(n=>n.textContent==='Опубликовать профиль'))
  const visibility=all.find(n=>n.tag==='button'&&n.textContent==='Настройки видимости')
  assert.ok(visibility)
  visibility.onclick();assert.equal(events.pop(),'settings')
  assert.deepEqual(all.filter(n=>n.dataset.metric).map(n=>n.dataset.metric),['likes','builds','followers','xp','title','rank'])
  assert.ok(all.some(n=>n.tag==='button'&&n.textContent==='Настроить показатели'))
  assert.ok(!all.some(n=>n.textContent==='Ревизии'||n.textContent==='Локальные сборки'))
  assert.ok(!all.some(n=>n.tag==='button'&&n.textContent==='Публичный профиль'))
  assert.ok(all.some(n=>n.textContent==='Администрирование'))
  all.find(n=>n.tag==='button'&&n.textContent==='Новая сборка').onclick()
  all.find(n=>n.tag==='button'&&n.textContent==='Открыть').onclick()
  all.find(n=>n.tag==='button'&&n.textContent==='Сменить тему').onclick()
  all.find(n=>n.tag==='button'&&n.textContent==='Выйти из аккаунта').onclick()
  assert.deepEqual(events,['create','local','cosmetics','logout'])
  const entries=all.filter(n=>n.tag==='button'&&n.textContent==='Мои сборки')
  assert.equal(entries.length,2)
  entries.forEach(n=>n.onclick())
  all.find(n=>n.tag==='button'&&n.textContent==='Все сборки').onclick()
  assert.deepEqual(events.slice(-3),['cloud','cloud','cloud'])
  const gallery=flatten(renderCloudWorkshop({...props,section:'cloud'}))
  assert.ok(gallery.some(n=>n.className==='workshop-projects-slot'))
  assert.ok(gallery.some(n=>n.className==='workshop-sidebar'))
  assert.ok(gallery.some(n=>n.tag==='button'&&n.textContent==='Мои сборки'&&n.attrs['aria-pressed']==='true'))
  const ordinary=flatten(renderCloudWorkshop({...props,user:{id:owner,displayName:'Test constructor'},lang:'en'}))
  assert.ok(!ordinary.some(n=>n.textContent==='Administration'))
  assert.ok(ordinary.some(n=>n.textContent==='Recent builds'))
 }finally{ctrl.abort();if(prior===undefined)delete globalThis.document;else globalThis.document=prior}
})
test('fullscreen stylesheet is scoped to authenticated account route',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8')
 const css=readFileSync(new URL('../src/menu/fullscreen-workshop.css',import.meta.url),'utf8')
 assert.ok(html.includes('fullscreen-workshop.css?v=fullscreen-1'))
 assert.ok(css.includes('.main:has(#account-panel.fullscreen-workshop:not([hidden]))>.content'))
 assert.ok(css.includes('max-width:none'))
 assert.ok(css.includes('position:sticky'))
})
