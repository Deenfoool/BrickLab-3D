import * as THREE from 'three'
import { PhysicsSession } from '../physics.js'
import { PHYSICS_UNITS, SURFACES } from '../physical-parts.js'
import { normalizeTestProfile } from './core-v2.js?v=testlab-20260913-v1'

const STUD = PHYSICS_UNITS.studMeters
const WORLD_GROUP = (8 << 16) | 31
const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))
const vec = value => ({ x:value.x, y:value.y, z:value.z })
const quat = value => ({ x:value.x, y:value.y, z:value.z, w:value.w })
const rpmToRad = rpm => Number(rpm || 0) * TAU / 60
const bodyQuat = body => { const q=body.rotation(); return new THREE.Quaternion(q.x,q.y,q.z,q.w) }
const bodyZStud = session => (session.chassisMonitor?.body?.translation?.().z ?? 0) / STUD

const COLORS = Object.freeze({
  structure:0x4f5962, accent:0x74e6a6, checkpoint:0x74e6a6,
  concrete:0x626a70, asphalt:0x40464b, dirt:0x6d5940, gravel:0x77736a, mud:0x574635, ice:0x89b6c6,
})

function addBox(session, root, spec, { collide = true } = {}) {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.rx ?? 0, spec.ry ?? 0, spec.rz ?? 0))
  if (collide) {
    const desc = session.RAPIER.ColliderDesc.cuboid(spec.w * STUD / 2, spec.h * STUD / 2, spec.d * STUD / 2)
      .setTranslation((spec.x ?? 0) * STUD, (spec.y ?? 0) * STUD, (spec.z ?? 0) * STUD)
      .setRotation(quat(rotation)).setFriction(.02).setRestitution(0).setCollisionGroups(WORLD_GROUP)
    session.world.createCollider(desc)
  }
  if (!root) return null
  const material = new THREE.MeshStandardMaterial({ color:spec.color ?? COLORS.structure, roughness:.9, metalness:.02, transparent:Boolean(spec.opacity && spec.opacity < 1), opacity:spec.opacity ?? 1 })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), material)
  mesh.position.set(spec.x ?? 0, spec.y ?? 0, spec.z ?? 0)
  mesh.quaternion.copy(rotation)
  mesh.castShadow = collide; mesh.receiveShadow = true
  root.add(mesh)
  return mesh
}

function finishGate(root, zStud, label = 'CHECKPOINT', width = 7) {
  if (!root) return
  addBox(null, root, { w:.1,h:2.5,d:.1,x:-width/2,y:1.25,z:zStud,color:COLORS.checkpoint }, { collide:false })
  addBox(null, root, { w:.1,h:2.5,d:.1,x:width/2,y:1.25,z:zStud,color:COLORS.checkpoint }, { collide:false })
  addBox(null, root, { w:width+.1,h:.1,d:.1,y:2.45,z:zStud,color:COLORS.checkpoint }, { collide:false })
  root.userData.checkpoints ??= []
  root.userData.checkpoints.push({ zStud, label })
}

function installModule(session, root, module) {
  if (module.type === 'incline') {
    const angle = THREE.MathUtils.degToRad(module.angleDeg), length=module.lengthStud, thickness=.42
    const centerZ = module.startZStud + Math.cos(angle) * length / 2
    const centerY = thickness / 2 + Math.sin(angle) * length / 2
    addBox(session, root, { w:module.widthStud,h:thickness,d:length,y:centerY,z:centerZ,rx:-angle,color:0x3c4349 })
    return { finishZStud:module.startZStud + Math.cos(angle) * length * .92 }
  }
  if (module.type === 'step') {
    addBox(session, root, { w:module.widthStud,h:module.heightStud,d:module.depthStud,x:module.xStud,y:module.heightStud/2,z:module.zStud,color:0x59636c })
    return null
  }
  if (module.type === 'articulation') {
    const x = Math.max(.7, module.widthStud * .78)
    addBox(session, root, { w:module.widthStud,h:module.heightStud,d:module.depthStud,x:-x,y:module.heightStud/2,z:module.zStud-module.staggerStud/2,color:0x4c555d })
    addBox(session, root, { w:module.widthStud,h:module.heightStud,d:module.depthStud,x:x,y:module.heightStud/2,z:module.zStud+module.staggerStud/2,color:0x4c555d })
    return null
  }
  if (module.type === 'cross-bump') {
    const angle = THREE.MathUtils.degToRad(module.angleDeg)
    addBox(session, root, { w:module.widthStud,h:module.heightStud,d:module.depthStud,y:module.heightStud/2,z:module.zStud-.45,ry:angle,color:0x646e77 })
    addBox(session, root, { w:module.widthStud,h:module.heightStud,d:module.depthStud,y:module.heightStud/2,z:module.zStud+.45,ry:-angle,color:0x646e77 })
    return null
  }
  if (module.type === 'bridge') {
    const rampLength=Math.max(1,module.lengthStud*.34), deckLength=Math.max(.8,module.lengthStud-2*rampLength), angle=Math.atan2(module.heightStud,rampLength)
    const rampY=module.heightStud/2, offset=(deckLength+rampLength)/2
    addBox(session,root,{w:module.widthStud,h:.28,d:rampLength,y:rampY,z:module.zStud-offset,rx:-angle,color:0x515b64})
    addBox(session,root,{w:module.widthStud,h:.28,d:deckLength,y:module.heightStud,z:module.zStud,color:0x59636c})
    addBox(session,root,{w:module.widthStud,h:.28,d:rampLength,y:rampY,z:module.zStud+offset,rx:angle,color:0x515b64})
    return null
  }
  if (module.type === 'surface-zone') {
    const start=Math.min(module.startZStud,module.endZStud), end=Math.max(module.startZStud,module.endZStud), length=Math.max(.1,end-start)
    addBox(session,root,{w:module.widthStud,h:.018,d:length,y:.012,z:(start+end)/2,color:COLORS[module.surface]??COLORS.concrete,opacity:.72},{collide:false})
    return null
  }
  if (module.type === 'checkpoint') {
    finishGate(root,module.zStud,module.label)
    return { finishZStud:module.zStud }
  }
  return null
}

function installCustomWorld(session) {
  const profile = session.testLabProfile
  if (!profile || profile.builtin) return
  const root = session.scenarioVisualRoot ?? (()=>{ const scene=session.objects?.[0]?.parent?.parent; if(!scene?.add)return null; const value=new THREE.Group(); scene.add(value); session.scenarioVisualRoot=value; return value })()
  if (root) root.name = `BrickLab TEST Lab · ${profile.name}`
  const previous = session.scenarioData ?? {}
  const data = session.scenarioData = {
    ...previous, id:profile.id, name:profile.name, profileId:profile.id, profileName:profile.name,
    surface:profile.surface, bestKind:profile.metric, phase:previous.phase ?? 'SETTLE', countdown:previous.countdown ?? 3,
    elapsed:0, currentForceN:0, peakPowerW:0, finishZStud:null, maxDuration:null,
  }
  let inferredFinish = null
  for (const module of profile.modules) {
    const result = installModule(session, root, module)
    if (Number.isFinite(result?.finishZStud)) inferredFinish = result.finishZStud
    if (module.type === 'towing-load') Object.assign(data, module)
    if (module.type === 'dyno-brake') Object.assign(data, module)
  }
  const checkpoints = profile.modules.filter(module=>module.type==='checkpoint')
  if (checkpoints.length) data.finishZStud = checkpoints.at(-1).zStud
  else if (Number.isFinite(inferredFinish)) data.finishZStud = inferredFinish
  data.surfaceZones = profile.modules.filter(module=>module.type==='surface-zone')
  data.towing = profile.modules.find(module=>module.type==='towing-load') ?? null
  data.dyno = profile.modules.find(module=>module.type==='dyno-brake') ?? null
  if (data.dyno) data.maxDuration = data.dyno.maxDuration
}

const originalBuild = PhysicsSession.prototype.build
PhysicsSession.prototype.build = function buildTestLabProfile(...args) {
  const pending = globalThis.__bricklabNextTestProfile
  if (pending) {
    this.testLabProfile = normalizeTestProfile(pending, { id:pending.id, builtin:pending.builtin })
    globalThis.__bricklabNextTestProfile = null
  } else this.testLabProfile = null
  const result = originalBuild.apply(this,args)
  installCustomWorld(this)
  return result
}

const originalTireForces = PhysicsSession.prototype.applyTireForcesV2
if (originalTireForces) PhysicsSession.prototype.applyTireForcesV2 = function applyTestLabSurfaceZones(...args) {
  const zones=this.scenarioData?.surfaceZones
  if (!this.testLabProfile || !zones?.length || !this.scenarioData) return originalTireForces.apply(this,args)
  const z=bodyZStud(this),zone=zones.find(item=>z>=Math.min(item.startZStud,item.endZStud)&&z<=Math.max(item.startZStud,item.endZStud)),base=this.scenarioData.surface
  if (zone && SURFACES[zone.surface]) this.scenarioData.surface=zone.surface
  this.scenarioData.activeSurface=this.scenarioData.surface
  try { return originalTireForces.apply(this,args) } finally { this.scenarioData.surface=base }
}

const originalScenarioForces = PhysicsSession.prototype.applyScenarioForcesV2
if (originalScenarioForces) PhysicsSession.prototype.applyScenarioForcesV2 = function applyTestLabScenarioForces(...args) {
  const result=originalScenarioForces.apply(this,args),data=this.scenarioData
  if (!this.testLabProfile || this.testLabProfile.builtin || !data || data.phase!=='RUN' || !this.chassisMonitor) return result
  const elapsed=Number(this.testElapsed ?? data.elapsed ?? 0)
  if (data.towing) {
    const load=data.towing,f=Math.min(load.maxForceN,load.startForceN+elapsed*load.rampRateN)
    data.currentForceN=f;this.chassisMonitor.body.addForce({x:0,y:0,z:-f},true)
  }
  if (data.dyno) {
    const drive=this.motorDrives?.[0]
    if (drive) {
      const omega=rpmToRad(drive.actualRpm),brake=Math.min(data.dyno.maxBrakeTorqueNm,Math.abs(omega)*data.dyno.brakeGain)
      const axis=drive.localAxisA.clone().applyQuaternion(bodyQuat(drive.bodyB)).normalize()
      drive.bodyB.addTorque(vec(axis.multiplyScalar(-Math.sign(omega||1)*brake)),true)
      data.brakeTorqueNm=brake;data.dynoPowerW=Math.abs(brake*omega);data.peakPowerW=Math.max(data.peakPowerW||0,data.dynoPowerW)
    }
  }
  return result
}

const originalVehicleMetrics = PhysicsSession.prototype.updateVehicleMetrics
if (originalVehicleMetrics) PhysicsSession.prototype.updateVehicleMetrics = function updateTestLabMetrics(dt,...args) {
  const result=originalVehicleMetrics.call(this,dt,...args),data=this.scenarioData
  if (!this.testLabProfile || this.testLabProfile.builtin || !data || data.phase!=='RUN' || !this.chassisMonitor) return result
  data.elapsed=Number(this.testElapsed ?? 0)
  const start=this.chassisMonitor.startPosition.z/STUD,current=bodyZStud(this)
  if (Number.isFinite(data.finishZStud)) this.chassisMonitor.progress=clamp((current-start)/Math.max(1,data.finishZStud-start),0,1)
  else if (data.towing) this.chassisMonitor.progress=clamp((data.currentForceN-data.towing.startForceN)/Math.max(.001,data.towing.maxForceN-data.towing.startForceN),0,1)
  else if (data.dyno) this.chassisMonitor.progress=clamp(data.elapsed/Math.max(1,data.dyno.maxDuration),0,1)
  if (data.dyno && this.testStatus==='STALLED') this.testStatus='RUNNING'
  if (Number.isFinite(data.finishZStud) && this.chassisMonitor.progress>=.94) this.testStatus='PASSED'
  else if (data.towing && data.currentForceN>=data.towing.maxForceN) this.testStatus='PASSED'
  else if (data.dyno && data.elapsed>=data.dyno.maxDuration) this.testStatus='PASSED'
  return result
}

export function queueTestProfile(profile) {
  const normalized=normalizeTestProfile(profile,{id:profile?.id,builtin:profile?.builtin})
  globalThis.__bricklabNextTestProfile=normalized
  globalThis.__bricklabNextScenario=normalized.builtin?normalized.id:'testlab-custom'
  return normalized
}

export function currentTestProfile() {
  return globalThis.__bricklabPhysicsSession?.testLabProfile ?? null
}

globalThis.BrickLabTestLabRuntime=Object.freeze({ queue:queueTestProfile, current:currentTestProfile })
