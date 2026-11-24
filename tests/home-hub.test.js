import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chooseHubBuilds} from '../src/menu/home-hub.js'
const now=Date.parse('2026-11-24T12:00:00Z')
const b=(n,days=0)=>({id:'aaaaaaaa-aaaa-aaaa-aaaa-'+String(n).padStart(12,'0'),title:'Model '+n,publishedAt:new Date(now-days*86400000).toISOString()})
test('home hub keeps popular models, selects a distinct weekly feature and deduplicates recent cards',()=>{
 const items=[b(1,10),b(2),b(3),b(4),b(5),b(6)]
 const r=chooseHubBuilds(items,[b(6),b(5),b(4),b(2)],now,[b(2),b(4)])
 assert.deepEqual(r.popular.map(p=>p.id),items.slice(0,3).map(p=>p.id))
 assert.equal(r.feature.id,b(4).id)
 assert.deepEqual(r.recent.map(p=>p.id),[b(6).id,b(5).id])
 assert.equal(chooseHubBuilds([b(1)],[b(1)],now).popular.length,1)
 assert.equal(chooseHubBuilds([],[],now).feature,null)
 assert.equal(chooseHubBuilds([],[b(1)],now,[b(2,10)]).feature,null)
})
