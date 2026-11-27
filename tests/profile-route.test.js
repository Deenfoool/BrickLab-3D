import {test} from 'node:test'
import assert from 'node:assert/strict'
import {profileHref,workshopRoute,validNewUsername,reservedProfileNames} from '../src/menu/profile-route.js'
import {defaultPortfolio} from '../src/menu/portfolio-model.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
test('canonical username routes and legacy UUID links',()=>{
 assert.equal(profileHref('Deenfoool',id),'#deenfoool')
 assert.equal(workshopRoute('Deenfoool'),'deenfoool')
 assert.equal(workshopRoute('community/profile/'+id),id)
 assert.equal(profileHref('admin',id),'#community/profile/'+id)
 assert.equal(workshopRoute('community/build/'+id),null)
 for(const name of reservedProfileNames){assert.equal(validNewUsername(name),false);assert.equal(workshopRoute(name),null)}
 assert.equal(workshopRoute('id_'+ 'a'.repeat(32)),'id_'+ 'a'.repeat(32))
 assert.equal(validNewUsername('id_example'),false)
 assert.equal(validNewUsername('technic_master'),true)
 assert.equal(workshopRoute('foo/bar'),null)
})
test('new workshop shows awards but not activity by default',()=>{
 const p=defaultPortfolio()
 assert.equal(p.blocks.find(b=>b.key==='awards').visible,true)
 assert.equal(p.blocks.find(b=>b.key==='activity').visible,false)
})
