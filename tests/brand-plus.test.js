import {test} from 'node:test'
import assert from 'node:assert/strict'
import {subscriptionRemaining,remainingText} from '../src/menu/brand-plus.js'
const day=86400000,now=1000000,active={signedIn:true,plus:true,plusUntil:now+day*21}
test('header Plus only shows valid active server subscription and rounds remaining days up',()=>{
 assert.equal(subscriptionRemaining({...active,signedIn:false},now),null)
 assert.equal(subscriptionRemaining({...active,plus:false},now),null)
 assert.equal(subscriptionRemaining({...active,plusUntil:now},now),null)
 assert.equal(subscriptionRemaining({...active,plusUntil:'invalid'},now),null)
 assert.deepEqual(subscriptionRemaining(active,now),{days:21,underDay:false,until:active.plusUntil})
 assert.equal(subscriptionRemaining({...active,plusUntil:now+day+1},now).days,2)
 const last=subscriptionRemaining({...active,plusUntil:now+1},now)
 assert.equal(remainingText(last,'ru'),'Осталось меньше суток')
 assert.equal(remainingText(last,'en'),'Less than 1 day left')
})
test('remaining days use Russian plurals and English singular',()=>{
 for(const [days,word] of [[1,'день'],[2,'дня'],[5,'дней'],[11,'дней'],[21,'день'],[24,'дня'],[114,'дней']])assert.equal(remainingText({days,underDay:false},'ru'),'Осталось '+days+' '+word)
 assert.equal(remainingText({days:1},'en'),'1 day left')
})
