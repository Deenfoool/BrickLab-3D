import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import RAPIER from '@dimforge/rapier3d-compat'
const dom=new Window()
for(const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS']) globalThis[key]=key==='window'?dom:dom[key]
globalThis.requestAnimationFrame=()=>0;globalThis.setInterval=()=>0
await import('../runtime-extensions.js')
const {runAxleCase}=await import('./axle-fixtures.js')
await RAPIER.init()
const norm=v=>Math.hypot(v.x,v.y,v.z)
for(const length of [3,5,7,9,12]) for(const brickId of ['technic-brick-1x6','technic-brick-1x4']) {
  test(`${length}L / ${brickId}: real Rapier A–F, 60 steps, rotated and reversed bodies`,()=>{
    for(const variant of ['brick','axle','joint','no-joints','no-contacts','supports','frame','frame-no-axle']) for(const reverse of [false,true]) {
      const r=runAxleCase(RAPIER,{length,brickId,variant,reverse,rotation:reverse?.73:0})
      assert.equal(r.failedJointCount,0)
      const expected={brick:[1,0],axle:[1,0],joint:[2,1],'no-joints':[2,0],'no-contacts':[2,1],supports:[4,3],frame:[2,1],'frame-no-axle':[1,0]}[variant]
      assert.deepEqual([r.bodyCount,r.jointCount],expected,JSON.stringify({variant,length,brickId,actual:[r.bodyCount,r.jointCount]}))
      for(const j of r.joints){assert.ok(j.anchorMismatch<1e-6);assert.ok(j.axisMismatchRadians<1e-6)}
      const e0=r.before.reduce((sum,b)=>sum+b.energy,0)
      for(const frame of r.frames) {
        assert.ok(frame.bodies.reduce((sum,b)=>sum+b.energy,0)<=e0*1.0001,'no injected energy')
        for(const b of frame.bodies) {
          assert.ok(norm(b.angularVelocity)<.001,JSON.stringify({length,brickId,variant,reverse,step:frame.step,w:b.angularVelocity}))
          assert.ok(Math.hypot(b.linearVelocity.x,b.linearVelocity.z)<1e-5)
          assert.ok(Math.abs(b.linearVelocity.y+9.81*frame.step/120)<1e-4)
          assert.equal(norm(b.force),0);assert.equal(norm(b.torque),0)
        }
      }
    }
  })
}
test('positive control isolates the old axis error from contacts and motors',()=>{
  const joint=runAxleCase(RAPIER,{height:10,legacyAxis:true})
  const withoutContacts=runAxleCase(RAPIER,{height:10,legacyAxis:true,variant:'no-contacts'})
  assert.equal(joint.penetration.count,0)
  assert.ok(Math.abs(joint.joints[0].axisMismatchRadians-Math.PI/2)<1e-6)
  assert.ok(joint.frames[0].bodies.some(b=>norm(b.angularVelocity)>30))
  assert.deepEqual(joint.frames[0].bodies,withoutContacts.frames[0].bodies)
  assert.ok(joint.frames[0].bodies.reduce((s,b)=>s+b.energy,0)>1.3*joint.before.reduce((s,b)=>s+b.energy,0))
})
after(() => dom.happyDOM.close())
