import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  buildColliderProfile,
  COLLIDER_PROFILE_VERSION,
  HOLE_CLEARANCE_STUD,
  PIN_COLLIDER_RADIUS_STUD,
} from '../collider-profiles-v3.js'

function boxObject(size = [3, 1, .8], center = [0, .45, 0]) {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial())
  mesh.position.fromArray(center)
  root.add(mesh)
  return root
}

function pointInsideBox(point, spec, eps = 1e-8) {
  if (spec.type !== 'box') return false
  return Math.abs(point.x - spec.center.x) < spec.size.x / 2 - eps &&
    Math.abs(point.y - spec.center.y) < spec.size.y / 2 - eps &&
    Math.abs(point.z - spec.center.z) < spec.size.z / 2 - eps
}

test('straight Technic hole rows stay physically open with nominal-safe clearance', () => {
  const definition = {
    connectors: [-1, 0, 1].map((x, index) => ({
      id:`hole-${index}`,
      type:'pin-hole',
      position:[x, .45, 0],
      axis:[0, 0, 1],
    })),
  }
  const profile = buildColliderProfile(boxObject(), definition)
  assert.equal(COLLIDER_PROFILE_VERSION, 'collider-profiles-v5')
  assert.equal(profile.kind, 'hole-aware')
  assert.ok(HOLE_CLEARANCE_STUD > .3, 'physics opening exceeds the nominal 4.8 mm bore radius')
  assert.ok(PIN_COLLIDER_RADIUS_STUD < HOLE_CLEARANCE_STUD)
  for (const connector of definition.connectors) {
    const point = new THREE.Vector3(...connector.position)
    assert.equal(profile.specs.some(spec => pointInsideBox(point, spec)), false, `${connector.id} remains empty in the proxy`)
  }
})

test('friction pin uses an axial cylinder instead of its wide visual bounding box', () => {
  const definition = {
    connectors: [-.35, .35].map((z, index) => ({
      id:`pin-${index}`,
      type:'pin',
      position:[0, .28, z],
      axis:[0, 0, 1],
    })),
  }
  const profile = buildColliderProfile(boxObject([.69, .69, 2], [0, .28, 0]), definition)
  assert.equal(profile.kind, 'pin-cylinder')
  assert.equal(profile.specs.length, 1)
  assert.equal(profile.specs[0].type, 'cylinder-z')
  assert.equal(profile.specs[0].radius, PIN_COLLIDER_RADIUS_STUD)
  assert.ok(profile.specs[0].radius < .3, 'contact proxy fits inside a nominal Technic bore')
})

test('verified Connector V4 connhole semantics drive LDraw hole clearance without legacy metadata', () => {
  const definition = {
    connectors: [],
    connectivityV4: {
      status:'ready',
      health:{ pass:true },
      connectors:[{
        schemaVersion:4,
        family:'cylinder',
        gender:'female',
        frame:{ positionStud:[0, .45, 0], axis:[0, 0, 1] },
        geometry:{
          sections:[
            { shape:'R', radiusLdu:8, lengthLdu:2, elastic:false },
            { shape:'R', radiusLdu:6, lengthLdu:16, elastic:false },
            { shape:'R', radiusLdu:8, lengthLdu:2, elastic:false },
          ],
          caps:'none',
          centered:true,
        },
        snap:{ slide:true },
      }],
    },
  }
  const profile = buildColliderProfile(boxObject([1, 1, .8], [0, .45, 0]), definition)
  assert.equal(profile.kind, 'v4-hole-aware')
  const center = new THREE.Vector3(0, .45, 0)
  assert.equal(profile.specs.some(spec => pointInsideBox(center, spec)), false, 'V4 connhole is not filled by a bounds collider')
})

test('explicit complex collider profiles remain authoritative', () => {
  const definition = {
    connectors:[{ id:'hole', type:'pin-hole', position:[0, .45, 0], axis:[0, 0, 1] }],
    physics:{
      colliderProfile:{
        version:'parts-5-explicit-v1',
        specs:[{ type:'box', center:[1, 2, 3], size:[.5, .6, .7] }],
      },
    },
  }
  const profile = buildColliderProfile(boxObject(), definition)
  assert.equal(profile.kind, 'explicit')
  assert.equal(profile.sourceVersion, 'parts-5-explicit-v1')
  assert.deepEqual(profile.specs[0].center.toArray(), [1, 2, 3])
})
