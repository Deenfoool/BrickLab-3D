import { buildMechanicsPhysicsPlan } from './plan.js'
import { buildCompoundMemberPhysicsPlan } from './compound-member-plan.js'
import { buildMechanicsCouplingPlan } from './coupling-plan.js'
import {
  disposeRapierMechanicsPlan,
  materializeRapierMechanicsPlan,
  preflightRapierMechanicsPlan,
} from './rapier-adapter.js'
import { createMechanicsCouplingRuntime } from './coupling-runtime.js'
import {
  applyMechanicsJointResistance,
  validateAndReleaseMechanicsJoints,
} from './joint-dynamics.js'
import { buildPhysicsSessionBridge } from './session-bridge.js'

export const MECHANICS_PHYSICS_RUNTIME_VERSION='mechanics-physics-runtime-0.1.0'

export function createMechanicsPhysicsRuntime({
  graph,
  discovery,
  records=[],
  worldUnitsPerStud=1,
}={}){
  const structuralPlan=buildMechanicsPhysicsPlan({graph,discovery})
  const compoundMemberPlan=buildCompoundMemberPhysicsPlan({records,discovery})
  const couplingPlan=buildMechanicsCouplingPlan({
    graph,
    discovery,
    records,
    worldUnitsPerStud,
  })
  const blockers=Object.freeze([
    ...(structuralPlan.blockers||[]),
    ...(compoundMemberPlan.blockers||[]),
    ...(couplingPlan.blockers||[]),
  ])

  let installed=null

  const api={
    version:MECHANICS_PHYSICS_RUNTIME_VERSION,
    structuralPlan,
    compoundMemberPlan,
    couplingPlan,
    blockers,
    pass:structuralPlan.pass&&compoundMemberPlan.pass&&couplingPlan.pass,
    preflightSession(session){
      const bridge=buildPhysicsSessionBridge({session,graph,plan:structuralPlan})
      if(!bridge.pass){
        return Object.freeze({
          pass:false,
          bridge,
          rapier:null,
          failures:bridge.failures,
        })
      }
      const rapier=preflightRapierMechanicsPlan(structuralPlan,{
        resolveMember:bridge.resolveMember,
        worldUnitsPerStud,
      })
      return Object.freeze({
        pass:rapier.pass,
        bridge,
        rapier,
        failures:Object.freeze([
          ...bridge.failures,
          ...rapier.failures,
        ]),
      })
    },
    install(session,{
      stabilization=1,
      contactsEnabled=false,
    }={}){
      if(installed)throw new Error('Mechanics physics runtime is already installed')
      if(!api.pass){
        const error=new Error(`Mechanics physics plan has ${blockers.length} blocker(s)`)
        error.blockers=blockers
        throw error
      }

      const bridge=buildPhysicsSessionBridge({session,graph,plan:structuralPlan})
      if(!bridge.pass){
        const error=new Error('Production Rapier body topology does not match Mechanics Next rigid islands')
        error.failures=bridge.failures
        throw error
      }

      const joints=materializeRapierMechanicsPlan(session,structuralPlan,{
        resolveMember:bridge.resolveMember,
        studMeters,
        contactsEnabled,
      })
      let couplings
      try{
        couplings=createMechanicsCouplingRuntime(couplingPlan,{
          resolveMember:bridge.resolveMember,
          stabilization,
        })
      }catch(error){
        disposeRapierMechanicsPlan(session,joints)
        throw error
      }

      installed={
        session,
        bridge,
        joints,
        couplings,
        disposed:false,
        lastCouplingStep:null,
        lastResistanceStep:null,
        releaseEvents:[],
      }
      return api.status()
    },
    beforeStep(dt){
      if(!installed||installed.disposed)return Object.freeze({installed:false})
      installed.lastResistanceStep=applyMechanicsJointResistance(installed.joints,dt)
      installed.lastCouplingStep=installed.couplings.step(dt)
      return Object.freeze({
        installed:true,
        resistance:installed.lastResistanceStep,
        couplings:installed.lastCouplingStep,
      })
    },
    afterSync({
      validateJoint=null,
      confirmReleaseFrames=2,
    }={}){
      if(!installed||installed.disposed)return Object.freeze({installed:false})
      const release=validateAndReleaseMechanicsJoints(
        installed.session,
        installed.joints,
        {validateJoint,confirmFrames:confirmReleaseFrames},
      )
      if(release.events.length)installed.releaseEvents.push(...release.events)
      return Object.freeze({
        installed:true,
        release,
      })
    },
    dispose(){
      if(!installed||installed.disposed)return 0
      const removed=disposeRapierMechanicsPlan(installed.session,installed.joints)
      installed.disposed=true
      return removed
    },
    status(){
      return Object.freeze({
        version:MECHANICS_PHYSICS_RUNTIME_VERSION,
        pass:api.pass,
        installed:Boolean(installed&&!installed.disposed),
        structural:structuralPlan.stats,
        compoundMembers:compoundMemberPlan.stats,
        couplings:couplingPlan.stats,
        blockers,
        bridge:installed?.bridge?.stats??null,
        joints:installed?.joints?.active??0,
        couplingState:installed?.couplings?.snapshot?.()??Object.freeze([]),
        lastCouplingStep:installed?.lastCouplingStep??null,
        lastResistanceStep:installed?.lastResistanceStep??null,
        releaseEvents:Object.freeze([...(installed?.releaseEvents||[])]),
      })
    },
  }

  return Object.freeze(api)
}
