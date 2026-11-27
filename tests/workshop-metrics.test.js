import {test} from 'node:test'
import assert from 'node:assert/strict'
import {defaultMetricIds,metricItems,moveMetric,readMetricLayout,validateMetricLayout} from '../src/menu/workshop-metrics-model.js'
import {validateProfile} from '../server/profile.js'
import {publicWorkshopSummary} from '../server/community.js'
test('metric defaults, hide all, reorder, reject duplicate and unknown keys',()=>{
 assert.deepEqual(readMetricLayout(null),defaultMetricIds)
 assert.deepEqual(readMetricLayout([]),[])
 assert.deepEqual(moveMetric(['likes','xp','rank'],2,0),['rank','likes','xp'])
 for(const bad of [null,['xp','xp'],['email'],[{}],'xp'])assert.throws(()=>validateMetricLayout(bad),{message:'invalid_metric_layout'})
 assert.deepEqual(validateProfile({bio:'',cover:'amber',metricLayout:['rank','likes'],xp:999}).metricLayout,['rank','likes'])
 assert.throws(()=>validateProfile({bio:'',cover:'amber',metricLayout:['email']}),{message:'invalid_metric_layout'})
})
test('public layout respects awards and followers visibility, and uses public build label',()=>{
 const portfolio={blocks:[{key:'awards',visible:false},{key:'followers',visible:false}]}
 assert.deepEqual(metricItems({portfolio,values:{likes:2,builds:4},owner:false}).map(x=>[x.id,x.label,x.value]),[['likes','Кол-во лайков','2'],['builds','Опубликованные сборки','4']])
 assert.deepEqual(metricItems({owner:true,layout:[],values:{xp:99}}),[])
 assert.equal(metricItems({owner:true,layout:['rank'],values:{}})[0].value,'—')
 assert.deepEqual(publicWorkshopSummary({layout:['rank'],rank:7,awards:3,email:'secret'}),{metricLayout:['rank'],globalRank:7,achievementCount:3})
})

test('metric editor adds, moves, removes and saves cards without sending values',async()=>{
 const {renderMetricEditor,workshopMetricValues}=await import('../src/menu/workshop-metrics.js')
 const old=globalThis.document
 const element=tag=>({tag,children:[],dataset:{},attrs:{},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=nodes},setAttribute(k,v){this.attrs[k]=v}})
 globalThis.document={createElement:element,createElementNS:(_ns,tag)=>element(tag)}
 const flatten=n=>[n,...n.children.flatMap(flatten)]
 try{
  let saved;const values=workshopMetricValues({owner:true,remoteCount:4,progress:{xp:30,awards:[{}]},card:{reputation:{likes:6,builds:2,downloads:7},followers:3,globalRank:5}})
  assert.equal(values.builds,4);assert.equal(values.rank,'#5');assert.equal(values.likes,6)
  const root=renderMetricEditor({lang:'ru',layout:['likes','rank'],values,busy:false,save:ids=>saved=ids})
  root.children[0].onclick()
  flatten(root).find(n=>n.attrs['aria-label']==='Перетащить: Место в глобальном рейтинге').onkeydown({key:'ArrowUp',preventDefault(){}})
  flatten(root).find(n=>n.attrs['aria-label']==='Убрать Кол-во лайков').onclick()
  flatten(root).find(n=>n.tag==='select').value='downloads'
  flatten(root).find(n=>n.tag==='button'&&n.textContent==='+ Добавить блок').onclick()
  flatten(root).find(n=>n.tag==='button'&&n.textContent==='Сохранить').onclick()
  assert.deepEqual(saved,['rank','downloads'])
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
})
