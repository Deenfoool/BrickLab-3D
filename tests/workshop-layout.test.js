import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaultPortfolio,validatePortfolio,filterPortfolio} from '../src/menu/portfolio-model.js'
import {planPortfolioGrid,portfolioSpan,nearestPortfolioSpan,movePortfolioBlock,applyPortfolioPreset,portfolioPresetIds} from '../src/menu/portfolio-layout-model.js'
import {renderWorkshopLayoutEditor,layoutResizeHandle} from '../src/menu/workshop-layout-editor.js'
import {renderPortfolio,renderUnifiedEditor} from '../src/menu/unified-profile.js'
import {publicCard} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const base=()=>defaultPortfolio({publicByDefault:true})
test('legacy portfolios retain existing widths; custom sizes and row breaks survive validation',()=>{
 const p=base();assert.deepEqual(validatePortfolio(p),p)
 assert.equal(portfolioSpan(p.blocks.find(b=>b.key==='featured')),12);assert.equal(portfolioSpan(p.blocks.find(b=>b.key==='followers')),6)
 p.blocks[0].span=8;p.blocks[1].span=4;p.blocks[2].span=6;p.blocks[2].newRow=true
 assert.deepEqual(validatePortfolio(p),p)
 assert.deepEqual(filterPortfolio(p,[]).blocks,p.blocks)
 assert.deepEqual(publicCard({id,displayName:'Builder',bio:'',unified:true,portfolio:p,publicIds:[]}).portfolio.blocks,p.blocks)
 for(const span of [0,5,13,'6',null,{},'1; color:red'])assert.throws(()=>validatePortfolio({...p,blocks:p.blocks.map((b,i)=>i===0?{...b,span}:b)}),/invalid_portfolio/)
 assert.throws(()=>validatePortfolio({...p,blocks:p.blocks.map((b,i)=>i===0?{...b,newRow:'yes'}:b)}),/invalid_portfolio/)
})
test('grid fills rows without overlaps; hidden widgets and mobile layout retain canonical order',()=>{
 const blocks=[{key:'featured',visible:true,span:8},{key:'awards',visible:true,span:4},{key:'about',visible:false,span:3},{key:'statistics',visible:true,span:6},{key:'followers',visible:true,span:3,newRow:true},{key:'publications',visible:true,span:9}]
 assert.deepEqual(planPortfolioGrid(blocks),[{key:'featured',row:1,column:1,span:8},{key:'awards',row:1,column:9,span:4},{key:'statistics',row:2,column:1,span:6},{key:'followers',row:3,column:1,span:3},{key:'publications',row:3,column:4,span:9}])
 assert.deepEqual(planPortfolioGrid(blocks,{mobile:true}).map(b=>[b.row,b.column,b.span]),[[1,1,12],[2,1,12],[3,1,12],[4,1,12],[5,1,12]])
 assert.equal(nearestPortfolioSpan(7.7),8);assert.equal(nearestPortfolioSpan(-1),3);assert.equal(nearestPortfolioSpan(20),12)
 const moved=movePortfolioBlock(blocks,'publications','featured');assert.equal(moved[0].key,'publications');assert.equal(blocks[0].key,'featured')
 for(const preset of portfolioPresetIds){const p=base(),next=applyPortfolioPreset(p.blocks,preset);assert.equal(next.length,8);assert.equal(new Set(next.map(b=>b.key)).size,8);assert.deepEqual(validatePortfolio({...p,blocks:next}).blocks,next);assert.ok(next.every(b=>b.span>=3&&b.span<=12))}
})
function element(tag){
 const n={tag,children:[],className:'',textContent:'',attrs:{},namespaceURI:'http://www.w3.org/2000/svg',style:{setProperty(k,v){this[k]=v}},append(...nodes){this.children.push(...nodes)},prepend(...nodes){this.children.unshift(...nodes)},replaceChildren(...nodes){this.children=nodes},setAttribute(k,v){this.attrs[k]=v},setPointerCapture(){}}
 n.classList={add(...items){n.className=[n.className,...items].filter(Boolean).join(' ')},remove(){},toggle(){}}
 return n
}
const flatten=n=>[n,...n.children.flatMap(flatten)]
test('studio edits grid with pointer and keyboard, restores blocks and previews only draft layout',()=>{
 const old=globalThis.document,confirm=globalThis.confirm
 globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)};globalThis.confirm=()=>true
 try{
  const p=base(),labels=Object.fromEntries(p.blocks.map(b=>[b.key,b.key]));let draft,previewed
  const root=renderWorkshopLayoutEditor({blocks:p.blocks,labels,lang:'ru',onChange:b=>draft=b,renderPreview:b=>{previewed=b;return element('div')}})
  const find=(attr,value)=>flatten(root).find(n=>n.attrs[attr]===value)
  const select=find('aria-label','Ширина · featured');select.value='8';select.onchange();assert.equal(draft.find(b=>b.key==='featured').span,8)
  const resize=find('aria-label','Изменить ширину: featured');resize.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(draft.find(b=>b.key==='featured').span,9)
  find('aria-label','Перетащить: publications').onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(draft[0].key,'publications')
  find('aria-label','Скрыть · featured').onclick();assert.equal(draft.find(b=>b.key==='featured').visible,false)
  find('aria-label','Добавить блок · featured').onclick();assert.equal(draft.find(b=>b.key==='featured').visible,true)
  const template=find('aria-label','Шаблоны');template.value='minimal';template.onchange();assert.equal(draft.find(b=>b.key==='awards').visible,false)
  flatten(root).find(n=>n.tag==='button'&&n.textContent==='Телефон').onclick();assert.deepEqual(previewed,draft)
  assert.ok(flatten(root).some(n=>n.className==='studio-preview is-mobile'))
  flatten(root).find(n=>n.tag==='button'&&n.textContent==='Отменить изменения компоновки').onclick();assert.deepEqual(draft,p.blocks)
  const row=element('article'),grid={getBoundingClientRect:()=>({width:1200})},changes=[],previews=[]
  const {grip}=layoutResizeHandle({key:'featured',span:6,grid,row,label:'Resize',resize:(...a)=>changes.push(a),previewResize:(...a)=>previews.push(a)})
  const e={button:0,pointerId:1,clientX:0,preventDefault(){}}
  grip.onpointerdown(e);grip.onpointermove({...e,clientX:205});assert.deepEqual(previews.at(-1),['featured',8]);grip.onpointerup(e);assert.deepEqual(changes,[['featured',8]])
  grip.onpointerdown(e);grip.onpointermove({...e,clientX:600});grip.onpointercancel(e);assert.deepEqual(previews.at(-1),['featured',6]);assert.equal(changes.length,1)
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;if(confirm===undefined)delete globalThis.confirm;else globalThis.confirm=confirm}
})
test('owner and public renderer use saved dimensions; editor saves only portfolio and keeps hidden status',()=>{
 const old=globalThis.document
 globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)}
 try{
  const p=base();p.featured=id;p.blocks[0].span=8;p.blocks[1].span=4;p.blocks.find(b=>b.key==='about').visible=false
  const card={id,displayName:'Builder',bio:'Do not display',visible:false,unified:true,portfolio:p,awards:[],followers:0}
  const builds=[{id,title:'Public model',partCount:32}]
  for(const owner of [false,true]){const rendered=flatten(renderPortfolio({lang:'ru',profile:card,builds,owner}));const featured=rendered.find(n=>n.className==='portfolio-block portfolio-featured'),publications=rendered.find(n=>n.className==='portfolio-block portfolio-publications');assert.equal(featured.attrs['data-layout-span'],'8');assert.equal(publications.attrs['data-layout-column'],'9');assert.ok(!rendered.some(n=>n.textContent==='Do not display'))}
  let saved,draft
  const editor=renderUnifiedEditor({lang:'ru',user:{displayName:'Builder'},profile:{bio:'private',cover:'blueprint'},publicCard:card,publicLoaded:true,publicBuilds:builds,busy:false,mode:'layout',savePortfolio:p=>saved=p,onPortfolioDraft:p=>draft=p,publishPublic:()=>assert.fail('layout must not publish identity')})
  const width=flatten(editor).find(n=>n.attrs['aria-label']==='Ширина · Закреплённая работа');width.value='6';width.onchange();assert.equal(draft.blocks[0].span,6)
  flatten(editor).find(n=>n.tag==='form').onsubmit({preventDefault(){}});assert.deepEqual(saved,draft);assert.equal(card.visible,false);assert.equal(p.blocks[0].span,8)
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
})
