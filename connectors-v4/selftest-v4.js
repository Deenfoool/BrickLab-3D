import * as THREE from 'three'
import { parseShadowTextV4 } from './ldcad-parser-v4.js'
import { matchConnectorV4 } from './matcher-v4.js'
import { connectorToBrickLabV4 } from './shadow-resolver-v4.js'
import { solvePlacementV4 } from './placement-solver-v4.js'
import { activationForMatchV4, classifyConnectorV4, connectorFrameHealthV4 } from './activation-v4.js'
import { hardenPhysicsPlanV4 } from './physics-plan-safety-v4.js'
import { physicsRulePreviewV4 } from './physics-policy-v4.js'

export const SELF_TEST_VERSION_V4 = 'connector-selftest-v4.3.0'

function connector(line, file) {
  const parsed = parseShadowTextV4(`0 self-test\n${line}`, { file })
  if (parsed.warnings.length) throw new Error(`parse warnings for ${file}: ${JSON.stringify(parsed.warnings)}`)
  const value = parsed.operations.find(item => item.type === 'connector')?.connector
  if (!value) throw new Error(`connector missing for ${file}`)
  value.endpointId = `self:${file}`
  return connectorToBrickLabV4(value, [0,0,0])
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

export function runConnectorV4SelfTest() {
  const checks = []
  const run = (name, fn) => {
    try {
      fn()
      checks.push({ name, pass:true })
    } catch (error) {
      checks.push({ name, pass:false, error:String(error?.message || error) })
    }
  }

  run('exact axle/axle-hole activation', () => {
    const axle = connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]', 'parts/3705.dat')
    const hole = connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]', 'p/axlehole-test.dat')
    invariant(classifyConnectorV4(axle) === 'technic-axle', 'axle role mismatch')
    invariant(classifyConnectorV4(hole) === 'technic-axle-hole', 'axle-hole role mismatch')
    const match = matchConnectorV4(axle, hole)
    invariant(match.compatible && match.keyed && match.rotationalSymmetry === 4, 'keyed axle match mismatch')
    const activation = activationForMatchV4(axle, hole, match)
    invariant(activation.active && activation.editor && activation.graph, 'pilot activation rejected')
    invariant(activation.physics === false, 'saved BUILD activation must not self-certify physics')
  })

  run('round shaft cannot enter keyed axle hole by inference', () => {
    const round = connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 6 80] [center=true] [slide=true]', 'parts/round-test.dat')
    const hole = connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]', 'p/axlehole-test.dat')
    invariant(matchConnectorV4(round, hole).compatible === false, 'round shaft was accepted by keyed hole')
  })

  run('converted connector frame is right-handed orthonormal', () => {
    const axle = connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]', 'parts/3705.dat')
    invariant(connectorFrameHealthV4(axle).pass, 'converted axle frame is not orthonormal')
  })

  run('placement solver removes lateral error without inventing twist', () => {
    const axle = connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]', 'parts/3705.dat')
    const hole = connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]', 'parts/hole.dat')
    const moving = new THREE.Group()
    const target = new THREE.Group()
    moving.position.set(0.3, 0, 0.2)
    target.position.set(0, 0, 0)
    moving.updateMatrixWorld(true)
    target.updateMatrixWorld(true)
    const solution = solvePlacementV4(moving, axle, target, hole)
    invariant(solution.valid, `placement rejected: ${solution.reason}`)
    invariant(Number.isFinite(solution.diagnostics.translationStud), 'placement distance is not finite')
    invariant(solution.diagnostics.translationStud <= 0.37, 'placement moved farther than expected')
  })

  run('group-less SNAP_GEN remains valid shape-matched metadata', () => {
    const parsed = parseShadowTextV4('0 !LDCAD SNAP_GEN [gender=M] [bounding=sph 8] [match=size] [placement=free]', { file:'parts/ball.dat' })
    invariant(parsed.warnings.length === 0, 'group-less SNAP_GEN emitted warning')
    invariant(parsed.operations[0]?.connector?.family === 'generic', 'group-less SNAP_GEN missing')
  })

  run('physics safety keeps proven axial joints and blocks unbounded ball joints', () => {
    const axial = hardenPhysicsPlanV4({
      version:'selftest',pass:true,blockers:[],stats:{connections:1,joints:1,blockers:0},
      joints:[{id:'self:axial',family:'technic-axle-round-hole',connectionIds:['self:axial'],rule:{kind:'cylindrical'},entry:{family:'technic-axle-round-hole'}}],
    })
    invariant(axial.pass && axial.joints.length === 1, 'proven axial physics was rejected')

    const ball = hardenPhysicsPlanV4({
      version:'selftest',pass:true,blockers:[],stats:{connections:1,joints:1,blockers:0},
      joints:[{id:'self:ball',family:'ball-socket',connectionIds:['self:ball'],rule:{kind:'spherical'},entry:{family:'ball-socket'}}],
    })
    invariant(!ball.pass && ball.joints.length === 0, 'unbounded ball/socket physics escaped safety gate')
    invariant(ball.blockers.some(item => item.reason === 'ball-socket-angular-envelope-not-implemented'), 'ball/socket block reason mismatch')
  })

  run('single stud remains BUILD-only until collider envelope is proven', () => {
    const single = physicsRulePreviewV4('stud-anti-stud', { studBundleSize:1 })
    invariant(single.supported === false, 'single stud unexpectedly self-certified physics')
    invariant(single.reason === 'single-stud-collider-envelope-not-proven', 'single-stud block reason mismatch')
    const bundle = physicsRulePreviewV4('stud-anti-stud', { studBundleSize:2 })
    invariant(bundle.supported === true && bundle.kind === 'fixed', 'multi-stud rigid policy was lost')
  })

  const failed = checks.filter(check => !check.pass)
  return Object.freeze({
    version: SELF_TEST_VERSION_V4,
    pass: failed.length === 0,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks: checks.map(check => Object.freeze({...check})),
  })
}
