import {test} from 'node:test'
import assert from 'node:assert/strict'
import {notificationSummary} from '../src/menu/notifications.js'
test('badge counts every unread notification, preview is bounded and newest first',()=>{
 const items=Array.from({length:12},(_,i)=>({read:i%3===0,at:new Date(2026,0,i+1).toISOString(),award:'firstCloudSave'}))
 const s=notificationSummary(items)
 assert.equal(s.unread,8);assert.equal(s.recent.length,8);assert.equal(s.recent[0],items[11]);assert.equal(items.length,12)
 assert.deepEqual(notificationSummary(null),{unread:0,recent:[]})
})
test('read state comes from server and is not inferred by opening popover',()=>{
 const items=[{read:true,at:'2026-01-01T00:00:00Z'},{read:false,at:'2026-01-02T00:00:00Z'}]
 assert.equal(notificationSummary(items).unread,1)
 assert.equal(items[1].read,false)
})
