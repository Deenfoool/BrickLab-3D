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
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64')
 const image=await normalizeImage(png,'image/png','avatar')
 assert.equal(imageFormat(image,'image/webp'),'webp')
 await assert.rejects(normalizeImage(Buffer.from([137,80,78,71,13,10,26,10]),'image/png','cover'),{message:'invalid_image'})
})
