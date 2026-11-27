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
