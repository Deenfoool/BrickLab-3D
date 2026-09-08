// Shared by Node and the browser acceptance page; these are real catalog parts.
import * as THREE from 'three'
import { PhysicsSession } from '../physics.js'
import { findPart } from '../parts.js'
import { resetPhysicsClock } from '../simulation-time.js'
const vector = value => new THREE.Vector3().copy(value)
function part(partId, instanceId) {
  const object = findPart(partId).create(0xabcdef)
  Object.assign(object.userData, { partId, instanceId })
  return object
}
export function axleScene(RAPIER, {length=12, brickId='technic-brick-1x6', variant='joint', height=200, rotation=0, reverse=false, legacyAxis=false}={}) {
  const brick = part(brickId, 'brick')
  brick.position.y = height
  const axle = part(`axle-${length}`, 'axle')
  axle.rotation.y = -Math.PI / 2
  const holes = findPart(brickId).connectors.filter(c => c.type === 'pin-hole')
  const hole = holes[Math.floor((holes.length-1)/2)]
  const ports = findPart(`axle-${length}`).connectors
  const port = ports[Math.floor((length-1)/2)]
  axle.position.copy(new THREE.Vector3(...hole.position).add(brick.position).sub(new THREE.Vector3(...port.position).applyQuaternion(axle.quaternion)))
  const bearing = (id, connectorId) => ({id:`bearing-${id}`,kind:'bearing',a:{instanceId:'axle',connectorId},b:{instanceId:id,connectorId:hole.id}})
  let objects = variant === 'brick' ? [brick] : variant === 'axle' ? [axle] : [brick, axle]
  const connected = ['joint','no-contacts','supports','frame'].includes(variant)
  let connections = connected ? [bearing('brick', port.id)] : []
  if (['supports','frame','frame-no-axle'].includes(variant)) {
    for (const offset of [-1,1]) {
      const support = part(brickId, `support-${offset}`)
      support.position.copy(brick.position); support.position.z += offset
      objects.push(support)
      if (connected) connections.push(bearing(support.userData.instanceId, ports[ports.indexOf(port)+offset].id))
    }
    if (variant !== 'supports') {
      const bridge = part('plate-2x6','bridge')
      bridge.rotation.y = Math.PI/2
      bridge.position.set(-Number(brickId.split('x')[1])/2+1, height+1.2, .5)
      objects.push(bridge)
      // Production structural inference welds the real stud/tube contacts.
    }
    if (variant === 'frame-no-axle') objects = objects.filter(o=>o!==axle)
  }
  if (reverse) { objects.reverse(); connections = connections.map(c=>({...c,a:c.b,b:c.a})) }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation)
  for (const object of objects) { object.position.applyQuaternion(q); object.quaternion.premultiply(q) }
  const session = new PhysicsSession(RAPIER, objects, connections)
  if (legacyAxis) {
    // Positive control: reproduce PHYSICS-8's exact three-argument joint descriptor.
    // Only test sessions opt in; no production prototype or source is patched.
    session.revoluteJointData = (a,b,anchorA,anchorB,axisA) => RAPIER.JointData.revolute(anchorA,anchorB,axisA)
  }
  session.build(); resetPhysicsClock(session,0)
  if (variant === 'no-contacts') {
    // Diagnostic experiment ONLY. Production collision filtering is untouched.
    for (const c of session.components) for (const m of c.members) for (const collider of m.colliders) collider.setCollisionGroups((1<<16)|8)
  }
  return session
}
function colliderState(c) {
  const p=vector(c.translation()), q=new THREE.Quaternion().copy(c.rotation())
  const half=c.halfExtents() || {x:c.radius(), y:c.halfHeight(), z:c.radius()}
  // Bounds of the oriented local shape box (conservative for cylinders).
  const box=new THREE.Box3()
  for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) box.expandByPoint(new THREE.Vector3(x*half.x,y*half.y,z*half.z).applyQuaternion(q).add(p))
  return {handle:c.handle,shape:c.shapeType(),halfExtents:half,position:p,rotation:q,aabb:box}
}
export function bodyState(s, colliders=false) {
  return s.components.map(c=>{
    const b=c.body, v=b.linvel(), w=b.angvel()
    const inertia=b.principalInertia()
    const inertiaRotation=new THREE.Quaternion().copy(b.rotation()).multiply(new THREE.Quaternion().copy(b.principalInertiaLocalFrame()))
    const localW=vector(w).applyQuaternion(inertiaRotation.invert())
    const kinetic=.5*b.mass()*vector(v).lengthSq()+.5*(localW.x**2*inertia.x+localW.y**2*inertia.y+localW.z**2*inertia.z)
    return {id:c.id,parts:c.members.map(m=>m.object.userData.partId),position:b.translation(),rotation:b.rotation(),linearVelocity:v,angularVelocity:w,mass:b.mass(),com:b.worldCom(),inertia,inertiaFrame:b.principalInertiaLocalFrame(),force:b.userForce(),torque:b.userTorque(),kinetic,energy:kinetic+b.mass()*9.81*b.worldCom().y,...(colliders?{colliders:c.members.flatMap(m=>m.colliders.map(colliderState))}:{})}
  })
}
export function jointState(s) {
  const rows=[]
  s.world.impulseJoints.forEach(j=>{
    const a=j.body1(),b=j.body2(),qa=new THREE.Quaternion().copy(a.rotation()),qb=new THREE.Quaternion().copy(b.rotation())
    const anchorA=j.anchor1(),anchorB=j.anchor2()
    const worldAnchorA=vector(anchorA).applyQuaternion(qa).add(vector(a.translation()))
    const worldAnchorB=vector(anchorB).applyQuaternion(qb).add(vector(b.translation()))
    // Rapier joint frame X is the free revolute axis.
    const axisA=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().copy(j.frameX1()))
    const axisB=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().copy(j.frameX2()))
    const worldAxisA=axisA.clone().applyQuaternion(qa),worldAxisB=axisB.clone().applyQuaternion(qb)
    rows.push({anchorA,anchorB,worldAnchorA,worldAnchorB,anchorMismatch:worldAnchorA.distanceTo(worldAnchorB),axisA,axisB,worldAxisA,worldAxisB,axisMismatchRadians:worldAxisA.angleTo(worldAxisB)})
  })
  return rows
}
export function penetrationState(s) {
  let count=0,maxDepth=0
  for(let i=0;i<s.components.length;i++) for(let j=i+1;j<s.components.length;j++) {
    for(const a of s.components[i].members.flatMap(m=>m.colliders)) for(const b of s.components[j].members.flatMap(m=>m.colliders)) {
      const contact=a.contactCollider(b,0)
      if(contact?.distance < -1e-7){count++;maxDepth=Math.max(maxDepth,-contact.distance)}
    }
  }
  return {count,maxDepth}
}
export function runAxleCase(RAPIER, options) {
  const s=axleScene(RAPIER,options)
  try {
    const before=bodyState(s,true),joints=jointState(s),penetration=penetrationState(s),frames=[]
    for(let n=1;n<=60;n++) { s.step(n/120); if([1,2,3,5,10,30,60].includes(n)) frames.push({step:n,bodies:bodyState(s)}) }
    return {options,bodyCount:s.components.length,jointCount:s.jointCount,failedJointCount:s.failedJointCount,before,joints,penetration,frames}
  } finally {s.dispose()}
}
