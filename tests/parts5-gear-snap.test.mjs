import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

await import('../technic-parts-pack-v2.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts5/visual-overhaul-v1.js')

const { findPart } = await import('../parts.js')
const { findGearSnapCandidate, findSnapCandidate, applySnap, connectorWorldPosition } = await import('../snapping-v3.js')
const { isEndpointOccupied, createConnection } = await import('../connections-v3.js')
const { evaluateSpurMesh } = await import('../parts5/gear-mesh-math-v1.js')
const { createAssemblyGraph } = await import('../mechanics-next/topology/assembly-graph.js')
const { discoverMechanicalTransmissions } = await import('../mechanics-next/transmission/discovery.js')

function makeGear(partId, instanceId) {
  const part = findPart(partId)
  const object = part.create(part.defaultColor)
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  return object
}

function descriptor(object) {
  const part = findPart(object.userData.partId)
  const connector = part.connectors.find(item => item.type === 'axle-hole')
  return {
    center: connectorWorldPosition(object, connector),
    axis: new THREE.Vector3(...connector.axis).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    pitchRadius: part.mechanics.gear.pitchRadius,
  }
}

test('12T dragged near 20T gets exact placement snap and a persistent non-rigid transmission relation', () => {
  const fixed = makeGear('gear-20', 'fixed-20')
  const moving = makeGear('gear-12', 'moving-12')
  fixed.position.set(0, 0, 0)
  moving.position.set(2.18, 0.04, 0.04)
  fixed.updateMatrixWorld(true)
  moving.updateMatrixWorld(true)

  const candidate = findSnapCandidate(moving, [fixed, moving], { isAvailable: () => true })
  assert.ok(candidate)
  assert.equal(candidate.kind, 'gear-mesh')
  assert.equal(candidate.placementOnly, false)
  assert.equal(candidate.movingGear.teeth, 12)
  assert.equal(candidate.fixedGear.teeth, 20)

  applySnap(moving, candidate)
  moving.updateMatrixWorld(true)
  const result = evaluateSpurMesh(descriptor(moving), descriptor(fixed), {
    minAlignment: 0.999999,
    axialTolerance: 1e-8,
    distanceTolerance: 1e-8,
  })
  assert.equal(result.valid, true)
  assert.ok(result.distanceError < 1e-8)
  assert.ok(result.axialOffset < 1e-8)

  // A gear mesh persists as a transmission relation without reserving the
  // axle interface or creating a rigid Rapier joint.
  const relation=createConnection(moving,candidate.source,fixed,candidate.target)
  assert.equal(relation.kind,'gear-mesh')
  assert.equal(relation.a.connectorType,'gear-mesh')
  assert.equal(relation.b.connectorType,'gear-mesh')
  assert.equal(isEndpointOccupied([], moving.userData.instanceId, candidate.source.id), false)
})

test('native Mechanics Next gear records drive BUILD gear placement without legacy mechanics.gear metadata', () => {
  const fixed=new THREE.Object3D()
  fixed.userData={partId:'ldraw-native-20',instanceId:'native-fixed-20'}
  fixed.position.set(0,0,0)
  fixed.updateMatrixWorld(true)

  const moving=new THREE.Object3D()
  moving.userData={partId:'ldraw-native-12',instanceId:'native-moving-12'}
  moving.position.set(2.2,0,0)
  moving.updateMatrixWorld(true)

  const endpoint=(bodyId)=>({
    id:`${bodyId}:axle-hole`,
    bodyId,
    family:'cylinder',
    gender:'female',
    frame:{positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1]},
    profile:{centered:true,caps:'none',sections:[{shape:'A',radiusLdu:6,lengthLdu:20}]},
    capabilities:['slide'],
    metadata:{semantics:{semanticKind:'technic-axle-hole'}},
  })
  const record=(object,teeth)=>({
    instance:{
      body:{id:`${object.userData.instanceId}:body`,instanceId:object.userData.instanceId,partId:object.userData.partId},
      endpoints:[endpoint(`${object.userData.instanceId}:body`)],
      transmissions:[{kind:'spur-gear',equationFamily:'gear-mesh',toothCount:teeth,pitchRadius:teeth/16}],
    },
    pose:{position:object.position.toArray(),quaternion:object.quaternion.toArray()},
    visualOffsetStud:[0,0,0],
    object,
  })
  const previous=globalThis.BrickLabMechanicsNext
  globalThis.BrickLabMechanicsNext={
    records:()=>[record(fixed,20),record(moving,12)],
  }
  try{
    const candidate=findGearSnapCandidate(moving,[fixed,moving])
    assert.ok(candidate)
    assert.equal(candidate.kind,'gear-mesh')
    assert.equal(candidate.movingGear.teeth,12)
    assert.equal(candidate.fixedGear.teeth,20)
    assert.equal(candidate.movingGear.gearFrameSource,'rotary-endpoint')
    applySnap(moving,candidate)
    moving.updateMatrixWorld(true)
    assert.ok(Math.abs(moving.position.x-2.018)<1e-6)

    const records=[record(fixed,20),record(moving,12)]
    const discovery=discoverMechanicalTransmissions({
      records,
      graph:createAssemblyGraph(),
      relations:[],
    })
    const mesh=discovery.transmissions.find(item=>item.kind==='spur-gear-mesh')
    assert.ok(mesh,'native transmission discovery should see the snapped gear mesh')
    assert.deepEqual(new Set(mesh.bodies),new Set(records.map(item=>item.instance.body.id)))
    assert.equal(mesh.parameters.teethA+mesh.parameters.teethB,32)
  }finally{
    if(previous===undefined)delete globalThis.BrickLabMechanicsNext
    else globalThis.BrickLabMechanicsNext=previous
  }
})

await dom.happyDOM.close()
