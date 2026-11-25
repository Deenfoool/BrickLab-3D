import {test} from 'node:test'
import assert from 'node:assert/strict'
import {imageFormat,backgroundInventory,normalizeImage} from '../server/profile-media.js'
import {validateProfile} from '../server/profile.js'
test('image format requires matching allowlisted signature',()=>{
 assert.equal(imageFormat(Buffer.from([137,80,78,71,13,10,26,10]),'image/png'),'png')
 assert.throws(()=>imageFormat(Buffer.from('<svg/>'),'image/png'),{message:'invalid_image'})
 assert.throws(()=>imageFormat(Buffer.from([255,216,255]),'image/png'),{message:'invalid_image'})
})
test('cosmetic ownership is server-derived and checkout disabled',()=>{
 const locked=backgroundInventory([],[])
 assert.equal(locked.find(x=>x.id==='first-build').owned,false)
 const unlocked=backgroundInventory([{award:'firstCloudSave'}],[{item:'carbon'}])
 assert.equal(unlocked.find(x=>x.id==='first-build').owned,true)
 assert.equal(unlocked.find(x=>x.id==='carbon').owned,true)
 assert.equal(unlocked.find(x=>x.id==='neon').owned,false)
 assert.ok(unlocked.every(x=>!x.purchaseEnabled))
 assert.throws(()=>validateProfile({bio:'',cover:'amber',background:'fake'}),{message:'invalid_profile'})
})
test('real decoder produces a normalized WebP and rejects invalid PNG',{skip:process.env.BRICKLAB_TEST_IMAGE!=='true'},async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP8z4AATAxEcQAz0QEHOoQ+uAAAAABJRU5ErkJggg==','base64')
 const image=await normalizeImage(png,'image/png','avatar')
 assert.equal(imageFormat(image,'image/webp'),'webp')
 await assert.rejects(normalizeImage(Buffer.from([137,80,78,71,13,10,26,10]),'image/png','cover'),{message:'invalid_image'})
})

test('admin access unlocks purchase themes without granting achievements or purchased entitlements',()=>{
 const normal=backgroundInventory([],[]),admin=backgroundInventory([],[],{admin:true})
 assert.equal(normal.filter(i=>i.source==='purchase'&&i.owned).length,0)
 assert.equal(admin.filter(i=>i.source==='purchase'&&i.adminAccess===true&&i.owned).length,6)
 assert.equal(admin.find(i=>i.id==='first-build').owned,false)
 assert.equal(backgroundInventory([],[],{admin:'true'}).filter(i=>i.source==='purchase'&&i.owned).length,0)
 assert.ok(admin.every(i=>!i.purchaseEnabled))
})
