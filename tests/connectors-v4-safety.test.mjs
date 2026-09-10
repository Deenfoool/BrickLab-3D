import test from 'node:test'
import assert from 'node:assert/strict'
import { hardenPhysicsPlanV4, physicsSafetyReasonV4 } from '../connectors-v4/physics-plan-safety-v4.js'
import { registerPhysicsOverrideV4, resolvePhysicsOverrideV4 } from '../connectors-v4/physics-overrides-v4.js'
import { physicsRulePreviewV4 } from '../connectors-v4/physics-policy-v4.js'

function endpoint(id, group = '') {
  return { endpointId:id, group }
}

function entry(family, { group = '', partA = 'ldraw-a', partB = 'ldraw-b', endpointA = 'a', endpointB = 'b' } = {}) {
  return {
    family,
    connectorA:endpoint(endpointA,group),
    connectorB:endpoint(endpointB,group),
    objectA:{userData:{partId:partA}},
    objectB:{userData:{partId:partB}},
  }
}

function item(family, kind, options = {}) {
  return {
    id:`joint:${family}:${options.endpointA || 'a'}`,
    family,
    connectionIds:[`connection:${family}:${options.endpointA || 'a'}`],
    entry:entry(family,options),
    rule:{supported:true,kind,retention:'captured',release:null},
  }
}

function plan(...joints) {
  return {version:'test-policy',pass:true,joints,blockers:[],stats:{connections:joints.length,joints:joints.length,blockers:0}}
}

test('axial and rigid certified families pass the additional safety gate unchanged',()=>{
  const source=plan(
    item('technic-axle-keyed-hole','prismatic'),
    item('technic-axle-round-hole','cylindrical'),
    item('technic-pin-hole','cylindrical'),
    item('stud-anti-stud','fixed'),
  )
  const hardened=hardenPhysicsPlanV4(source)
  assert.equal(hardened.pass,true)
  assert.equal(hardened.joints.length,4)
  assert.equal(hardened.blockers.length,0)
})

test('single stud keeps collider contacts while a multi-stud bundle becomes one fixed attachment',()=>{
  const single=physicsRulePreviewV4('stud-anti-stud',{studBundleSize:1})
  assert.equal(single.supported,true)
  assert.equal(single.kind,'revolute')
  assert.equal(single.contacts,'enabled')
  assert.equal(single.bundle,'single-stud-twist')

  const bundle=physicsRulePreviewV4('stud-anti-stud',{studBundleSize:2})
  assert.equal(bundle.supported,true)
  assert.equal(bundle.kind,'fixed')
  assert.equal(bundle.contacts,'disabled')
  assert.equal(bundle.bundle,'multi-stud-rigid')

  const hardened=hardenPhysicsPlanV4(plan({...item('stud-anti-stud','revolute'),rule:single}))
  assert.equal(hardened.pass,true)
  assert.equal(hardened.joints[0].rule.contacts,'enabled')
})

test('ball/socket stays hard-blocked until a bounded spherical model exists',()=>{
  assert.match(physicsSafetyReasonV4('ball-socket'),/not-implemented/)
  const hardened=hardenPhysicsPlanV4(plan(item('ball-socket','spherical')))
  assert.equal(hardened.pass,false)
  assert.equal(hardened.joints.length,0)
  assert.match(hardened.blockers[0].reason,/ball-socket-angular-envelope/)
})

test('hinge and generic captured revolute families require explicit evidence',()=>{
  for(const family of ['hinge-fingers','round-revolute-interface']) {
    const hardened=hardenPhysicsPlanV4(plan(item(family,'revolute',{group:`unproven-${family}`})))
    assert.equal(hardened.pass,false,family)
    assert.equal(hardened.joints.length,0,family)
    assert.ok(hardened.blockers[0].reason.includes('angular-envelope'),family)
  }
  const clip=hardenPhysicsPlanV4(plan(item('bar-clip','revolute',{group:'unproven-clip'})))
  assert.equal(clip.pass,false)
  assert.match(clip.blockers[0].reason,/clip-angular-envelope/)
})

test('exact revolute override with limits and evidence unlocks only its intended group',()=>{
  registerPhysicsOverrideV4({
    id:'test-hinge-limits-v1',
    match:{family:'hinge-fingers',group:'test-hinge-limited'},
    rule:{kind:'revolute',limits:{min:-0.75,max:0.9},contacts:'disabled',retention:'captured',evidence:'test fixture: deterministic hinge stop'},
  })
  const exact=item('hinge-fingers','revolute',{group:'test-hinge-limited'})
  const resolved=resolvePhysicsOverrideV4(exact.entry)
  assert.equal(resolved.id,'test-hinge-limits-v1')
  const hardened=hardenPhysicsPlanV4(plan(exact))
  assert.equal(hardened.pass,true)
  assert.equal(hardened.stats.overrides,1)
  assert.deepEqual(hardened.joints[0].rule.limits,{min:-0.75,max:0.9})
  assert.equal(hardened.joints[0].rule.override.id,'test-hinge-limits-v1')

  const other=hardenPhysicsPlanV4(plan(item('hinge-fingers','revolute',{group:'different-hinge'})))
  assert.equal(other.pass,false)
})

test('override registry rejects missing evidence, duplicate ids and non-revolute safety limits',()=>{
  assert.throws(()=>registerPhysicsOverrideV4({
    id:'missing-evidence-v1',match:{family:'hinge-fingers',group:'missing-evidence'},rule:{kind:'revolute',limits:{min:-1,max:1}},
  }),/evidence/)

  registerPhysicsOverrideV4({
    id:'duplicate-check-v1',match:{family:'round-revolute-interface',group:'duplicate-check'},rule:{kind:'revolute',limits:{min:-1,max:1},evidence:'test'},
  })
  assert.throws(()=>registerPhysicsOverrideV4({
    id:'duplicate-check-v1',match:{family:'round-revolute-interface',group:'other'},rule:{kind:'revolute',limits:{min:-1,max:1},evidence:'test'},
  }),/Duplicate/)

  registerPhysicsOverrideV4({
    id:'wrong-kind-v1',match:{family:'hinge-fingers',group:'wrong-kind'},rule:{kind:'spherical',evidence:'test'},
  })
  const wrongKind=hardenPhysicsPlanV4(plan(item('hinge-fingers','revolute',{group:'wrong-kind'})))
  assert.equal(wrongKind.pass,false)
  assert.match(wrongKind.blockers[0].reason,/kind-mismatch/)
})

test('groups matcher is set-like and does not fail when both endpoints share one group',()=>{
  registerPhysicsOverrideV4({
    id:'group-set-v1',
    match:{family:'round-revolute-interface',groups:['same-group']},
    rule:{kind:'revolute',limits:{min:-0.2,max:0.2},evidence:'test group normalization'},
  })
  const candidate=item('round-revolute-interface','revolute',{group:'same-group'})
  assert.equal(resolvePhysicsOverrideV4(candidate.entry)?.id,'group-set-v1')
  assert.equal(hardenPhysicsPlanV4(plan(candidate)).pass,true)
})

test('registered evidence is deeply immutable and resolved copies cannot mutate the registry',()=>{
  const registered=registerPhysicsOverrideV4({
    id:'deep-freeze-v1',
    match:{family:'hinge-fingers',groups:['immutable-group'],partIds:['ldraw-a','ldraw-b']},
    rule:{kind:'revolute',limits:{min:-0.4,max:0.4},resistance:{angularDamping:0.2},evidence:'immutability test'},
  })
  assert.equal(Object.isFrozen(registered),true)
  assert.equal(Object.isFrozen(registered.match.groups),true)
  assert.equal(Object.isFrozen(registered.rule.limits),true)
  assert.equal(Object.isFrozen(registered.rule.resistance),true)
  assert.throws(()=>{registered.rule.limits.min=-99},TypeError)

  const candidate=entry('hinge-fingers',{group:'immutable-group'})
  const copy=resolvePhysicsOverrideV4(candidate)
  assert.equal(copy.rule.limits.min,-0.4)
  copy.rule.limits.min=-9
  assert.equal(resolvePhysicsOverrideV4(candidate).rule.limits.min,-0.4)
})
