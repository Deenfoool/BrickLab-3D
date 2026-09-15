import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTechnicAssemblyV1 } from '../technic/assembly-analysis-v1.js'

const definitions = new Map([
  ['ldraw-3705', { id:'ldraw-3705', name:'Technic Axle 4L' }],
  ['ldraw-3648', { id:'ldraw-3648', name:'Technic Gear 24 Tooth' }],
  ['ldraw-3713', { id:'ldraw-3713', name:'Technic Bush' }],
  ['ldraw-beam', { id:'ldraw-beam', name:'Technic Beam 1 x 5' }],
  ['ldraw-frame', { id:'ldraw-frame', name:'Technic Frame 5 x 7' }],
])

const semantic = connection => {
  const family=connection.activation?.family
  if (family === 'technic-axle-keyed-hole') return { connectionId:connection.id, family, kind:'keyed-shaft-coupling', constraint:'prismatic', transmission:null, transmitsTorque:true, supportRole:false, group:null }
  if (family === 'technic-axle-round-hole') return { connectionId:connection.id, family, kind:'shaft-bearing', constraint:'cylindrical', transmission:null, transmitsTorque:false, supportRole:true, group:null }
  if (family === 'technic-pin-hole') return { connectionId:connection.id, family, kind:'pin-joint', constraint:'revolute', transmission:null, transmitsTorque:false, supportRole:'structural-joint', group:null }
  if (family === 'stud-anti-stud') return { connectionId:connection.id, family, kind:'stud-structural-contact', constraint:'fixed', transmission:null, transmitsTorque:false, supportRole:'structural-contact', group:null }
  return { connectionId:connection.id, family, kind:'other-compatible-interface', constraint:null, transmission:null, transmitsTorque:false, supportRole:false, group:null }
}

function object(instanceId, partId) { return { userData:{ instanceId, partId } } }
function connection(id, family, a, b) {
  return { id, activation:{family}, a:{instanceId:a,partId:definitions.has(a)?a:null,endpointId:`${id}-a`}, b:{instanceId:b,partId:definitions.has(b)?b:null,endpointId:`${id}-b`} }
}

test('Technic assembly analysis groups torque-coupled rotary parts and counts bearing support', () => {
  const objects = [
    object('axle','ldraw-3705'), object('gear','ldraw-3648'), object('bush','ldraw-3713'), object('beam','ldraw-beam'),
  ]
  const connections = [
    { id:'c1', activation:{family:'technic-axle-keyed-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'gear',partId:'ldraw-3648',endpointId:'h'} },
    { id:'c2', activation:{family:'technic-axle-keyed-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'bush',partId:'ldraw-3713',endpointId:'h'} },
    { id:'c3', activation:{family:'technic-axle-round-hole'}, a:{instanceId:'axle',partId:'ldraw-3705',endpointId:'a'}, b:{instanceId:'beam',partId:'ldraw-beam',endpointId:'r'} },
  ]
  const report = analyzeTechnicAssemblyV1({ objects, connections, getDefinition:id => definitions.get(id), classifyConnection:semantic })
  assert.equal(report.stats.shaftGroups, 1)
  assert.equal(report.stats.torqueCouplings, 2)
  assert.equal(report.stats.bearings, 1)
  assert.deepEqual(new Set(report.shafts[0].memberIds), new Set(['axle','gear','bush']))
  assert.deepEqual(report.shafts[0].retainers, ['bush'])
  assert.equal(report.diagnostics.some(item => item.code === 'shaft-axial-retention-unverified'), false)
  assert.equal(report.diagnostics.some(item => item.code === 'gear-shaft-single-bearing-support'), true)
})

test('one structural pin remains a hinge while two independent pin contacts make the pair effectively rigid', () => {
  const objects=[object('beam-a','ldraw-beam'),object('beam-b','ldraw-beam')]
  const one=analyzeTechnicAssemblyV1({
    objects,
    connections:[{id:'p1',activation:{family:'technic-pin-hole'},a:{instanceId:'beam-a'},b:{instanceId:'beam-b'}}],
    getDefinition:id=>definitions.get(id==='ldraw-beam'?'ldraw-beam':id),
    classifyConnection:semantic,
  })
  assert.equal(one.structuralPairs[0].effectiveRigid,false)
  assert.equal(one.structuralPairs[0].reason,'single-pin-revolute')
  assert.equal(one.diagnostics.some(item=>item.code==='structural-single-pin-hinge'),true)

  const two=analyzeTechnicAssemblyV1({
    objects,
    connections:[
      {id:'p1',activation:{family:'technic-pin-hole'},a:{instanceId:'beam-a'},b:{instanceId:'beam-b'}},
      {id:'p2',activation:{family:'technic-pin-hole'},a:{instanceId:'beam-a'},b:{instanceId:'beam-b'}},
    ],
    getDefinition:id=>definitions.get(id==='ldraw-beam'?'ldraw-beam':id),
    classifyConnection:semantic,
  })
  assert.equal(two.structuralPairs[0].effectiveRigid,true)
  assert.equal(two.structuralPairs[0].reason,'multi-pin-contact')
  assert.equal(two.diagnostics.some(item=>item.code==='structural-single-pin-hinge'),false)
})

test('two shaft bearings must belong to a verified rigid support frame', () => {
  const objects=[
    object('axle','ldraw-3705'), object('gear','ldraw-3648'), object('left','ldraw-beam'), object('right','ldraw-beam'),
  ]
  const baseConnections=[
    {id:'g',activation:{family:'technic-axle-keyed-hole'},a:{instanceId:'axle'},b:{instanceId:'gear'}},
    {id:'b1',activation:{family:'technic-axle-round-hole'},a:{instanceId:'axle'},b:{instanceId:'left'}},
    {id:'b2',activation:{family:'technic-axle-round-hole'},a:{instanceId:'axle'},b:{instanceId:'right'}},
  ]
  const open=analyzeTechnicAssemblyV1({ objects, connections:baseConnections, getDefinition:id=>definitions.get(id), classifyConnection:semantic })
  assert.equal(open.diagnostics.some(item=>item.code==='shaft-support-frame-open'),true)

  const braced=analyzeTechnicAssemblyV1({
    objects,
    connections:[
      ...baseConnections,
      {id:'p1',activation:{family:'technic-pin-hole'},a:{instanceId:'left'},b:{instanceId:'right'}},
      {id:'p2',activation:{family:'technic-pin-hole'},a:{instanceId:'left'},b:{instanceId:'right'}},
    ],
    getDefinition:id=>definitions.get(id),
    classifyConnection:semantic,
  })
  assert.equal(braced.structuralPairs.some(pair=>pair.effectiveRigid),true)
  assert.equal(braced.diagnostics.some(item=>item.code==='shaft-support-frame-open'),false)
})

test('detected gear meshes warn if one shaft is unsupported', () => {
  const objects=[object('gear-a','ldraw-3648'),object('gear-b','ldraw-3648'),object('beam','ldraw-beam')]
  const report=analyzeTechnicAssemblyV1({
    objects,
    connections:[{id:'b1',activation:{family:'technic-axle-round-hole'},a:{instanceId:'gear-a'},b:{instanceId:'beam'}}],
    getDefinition:id=>definitions.get(id),
    classifyConnection:semantic,
    drivetrain:{physicalGearMeshes:[{id:'mesh',kind:'gear',a:{instanceId:'gear-a',teeth:24},b:{instanceId:'gear-b',teeth:24},ratioAB:-1}]},
  })
  assert.equal(report.stats.gearMeshes,1)
  assert.equal(report.diagnostics.some(item=>item.code==='gear-mesh-unsupported-shaft'),true)
})
