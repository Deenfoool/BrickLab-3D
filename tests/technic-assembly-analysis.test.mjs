import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTechnicAssemblyV1 } from '../technic/assembly-analysis-v1.js'

function axle(gender, shape = 'A') {
  return {
    family:'cylinder', gender,
    snap:{ slide:true },
    geometry:{ centered:true, caps:'none', sections:[{ shape, radiusLdu:6, lengthLdu:20 }] },
  }
}

const definitions = new Map([
  ['ldraw-3705', { id:'ldraw-3705', name:'Technic Axle 4L' }],
  ['ldraw-3648', { id:'ldraw-3648', name:'Technic Gear 24 Tooth' }],
  ['ldraw-3713', { id:'ldraw-3713', name:'Technic Bush' }],
  ['ldraw-beam', { id:'ldraw-beam', name:'Technic Beam 1 x 5' }],
])
const objects = [
  { userData:{ instanceId:'axle', partId:'ldraw-3705' } },
  { userData:{ instanceId:'gear', partId:'ldraw-3648' } },
  { userData:{ instanceId:'bush', partId:'ldraw-3713' } },
  { userData:{ instanceId:'beam', partId:'ldraw-beam' } },
]
const connections = [
  { id:'c1', activation:{family:'technic-axle-keyed-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'gear',partId:'ldraw-3648',endpointId:'h'} },
  { id:'c2', activation:{family:'technic-axle-keyed-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'bush',partId:'ldraw-3713',endpointId:'h'} },
  { id:'c3', activation:{family:'technic-axle-round-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'beam',partId:'ldraw-beam',endpointId:'r'} },
]

test('Technic assembly analysis groups torque-coupled rotary parts and counts bearing support', () => {
  const report = analyzeTechnicAssemblyV1({
    objects,
    connections,
    getDefinition:id => definitions.get(id),
    classifyConnection:connection => {
      const family=connection.activation?.family
      if (family === 'technic-axle-keyed-hole') return { connectionId:connection.id, family, kind:'keyed-shaft-coupling', constraint:'prismatic', transmission:null, transmitsTorque:true, supportRole:false, group:null }
      if (family === 'technic-axle-round-hole') return { connectionId:connection.id, family, kind:'shaft-bearing', constraint:'cylindrical', transmission:null, transmitsTorque:false, supportRole:true, group:null }
      return { connectionId:connection.id, family, kind:'other-compatible-interface', constraint:null, transmission:null, transmitsTorque:false, supportRole:false, group:null }
    },
  })
  assert.equal(report.stats.shaftGroups, 1)
  assert.equal(report.stats.torqueCouplings, 2)
  assert.equal(report.stats.bearings, 1)
  assert.deepEqual(new Set(report.shafts[0].memberIds), new Set(['axle','gear','bush']))
  assert.deepEqual(report.shafts[0].retainers, ['bush'])
  assert.equal(report.diagnostics.some(item => item.code === 'shaft-axial-retention-unverified'), false)
  assert.equal(report.diagnostics.some(item => item.code === 'shaft-single-bearing-support'), true)
})
