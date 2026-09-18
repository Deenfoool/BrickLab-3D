import { buildMechanicsPhysicsPlan } from './plan.js'
import { buildCompoundMemberPhysicsPlan } from './compound-member-plan.js'
import { expandCompoundPhysicsGraph } from './compound-graph-expansion.js'
import {
  disposeCompoundMemberPhysics,
  materializeCompoundMemberPhysics,
  preflightCompoundMemberMaterialization,
} from './compound-member-materializer.js'
import { buildMechanicsCouplingPlan } from './coupling-plan.js'
import {
  disposeRapierMechanicsPlan,
  materializeRapierMechanicsPlan,
  preflightRapierMechanicsPlan,
} from './rapier-adapter.js'
import { createMechanicsCouplingRuntime } from './coupling-runtime.js'
import { buildMechanicsMotorPlan, createMechanicsMotorRuntime } from './motor-runtime.js'
import { buildMechanicsVehiclePlan } from './vehicle-plan.js'
import { buildMechanicsSteeringPlan, materializeMechanicsSteeringBindings } from './steering-bridge.js'
import { createMechanicsSuspensionRuntime } from './suspension-runtime.js'
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
  worldUnitsPerStud=.008,
  controlState=null,
}={}){
  const compoundMemberPlan=buildCompoundMemberPhysicsPlan({records,discovery})
  const compoundGraphExpansion=expandCompoundPhysicsGraph({
    graph,
    compoundMemberPlan,
  })
  const structuralGraph=compoundGraphExpansion.graph
  const structuralPlan=buildMechanicsPhysicsPlan({
    graph:structuralGraph,
    discovery,
    materializedCompoundRootIds:compoundGraphExpansion.materializedRootIds,
    excludeRigidMergeBodyIds:compoundGraphExpansion.memberBodyIds,
  })
  const couplingPlan=buildMechanicsCouplingPlan({
    graph,
    discovery,
    records,
    worldUnitsPerStud,
  })
  const steeringPlan=buildMechanicsSteeringPlan({
    records,
    graph:structuralGraph,
    structuralPlan,
    discovery,
  })
  const motorPlan=buildMechanicsMotorPlan({graph,records})
  const vehiclePlan=buildMechanicsVehiclePlan({
    records,
    discovery,
    motorPlan,
  })
  const blockers=Object.freeze([
    ...(structuralPlan.blockers||[]),
    ...(compoundMemberPlan.blockers||[]),
    ...(compoundGraphExpansion.blockers||[]),
    ...(couplingPlan.blockers||[]),
    ...(steeringPlan.blockers||[]),
    ...(motorPlan.blockers||[]),
    ...(vehiclePlan.blockers||[]),
  ])

  let installed=null

  const api={
    version:MECHANICS_PHYSICS_RUNTIME_VERSION,
    structuralPlan,
    structuralGraph,
    compoundMemberPlan,
    compoundGraphExpansion,
    couplingPlan,
    steeringPlan,
    motorPlan,
    vehiclePlan,
    blockers,
    pass:blockers.length===0&&
      structuralPlan.pass&&
      compoundMemberPlan.pass&&
      couplingPlan.pass&&
      steeringPlan.pass&&
      motorPlan.pass&&
      vehiclePlan.pass,
    preflightSession(session){
      if(compoundMemberPlan.replacements.length){
        const compound=preflightCompoundMemberMaterialization(session,compoundMemberPlan)
        return Object.freeze({
          pass:api.pass&&compound.pass,
          bridge:null,
          rapier:null,
          compound,
          deferredRapier:true,
          failures:Object.freeze([
            ...(api.pass?[]:blockers),
            ...compound.failures,
          ]),
        })
      }

      const bridge=buildPhysicsSessionBridge({
        session,
        graph:structuralGraph,
        plan:structuralPlan,
      })
      if(!bridge.pass){
        return Object.freeze({
          pass:false,
          bridge,
          rapier:null,
          compound:null,
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
        compound:null,
        deferredRapier:false,
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

      let compoundMembers=null
      let joints=null
      let bridge=null
      let couplings=null
      let motors=null
      let steering=null
      let suspension=null

      try{
        if(compoundMemberPlan.replacements.length){
          compoundMembers=materializeCompoundMemberPhysics(session,compoundMemberPlan,{
            worldUnitsPerStud,
          })
        }

        bridge=buildPhysicsSessionBridge({
          session,
          graph:structuralGraph,
          plan:structuralPlan,
        })
        if(!bridge.pass){
          const error=new Error('Production Rapier body topology does not match Mechanics Next rigid islands')
          error.failures=bridge.failures
          throw error
        }

        const rapierPreflight=preflightRapierMechanicsPlan(structuralPlan,{
          resolveMember:bridge.resolveMember,
          worldUnitsPerStud,
        })
        if(!rapierPreflight.pass){
          const error=new Error('Mechanics Next Rapier preflight failed after compound materialization')
          error.failures=rapierPreflight.failures
          throw error
        }

        joints=materializeRapierMechanicsPlan(session,structuralPlan,{
          resolveMember:bridge.resolveMember,
          worldUnitsPerStud,
          contactsEnabled,
        })

        const resolveRuntimeMember=bodyId=>
          bridge.resolveMember(bodyId) ??
          compoundMembers?.replacements?.get?.(String(bodyId))?.preferredMember ??
          null

        couplings=createMechanicsCouplingRuntime(couplingPlan,{
          resolveMember:resolveRuntimeMember,
          stabilization,
          controlState,
        })
        motors=createMechanicsMotorRuntime(motorPlan,{
          resolveMember:resolveRuntimeMember,
          controlState,
          isDriveEnabled:()=>!session.scenarioData||session.scenarioData.phase==='RUN',
        })
        steering=materializeMechanicsSteeringBindings(steeringPlan,joints)
        if(!steering.pass){
          const error=new Error('Mechanics Next steering bridge materialization failed')
          error.failures=steering.failures
          throw error
        }
        suspension=createMechanicsSuspensionRuntime(joints,{session})
        if(!suspension.pass){
          const error=new Error('Mechanics Next suspension runtime materialization failed')
          error.failures=suspension.failures
          throw error
        }
      }catch(error){
        if(joints)disposeRapierMechanicsPlan(session,joints)
        if(compoundMembers)disposeCompoundMemberPhysics(session,compoundMembers)
        throw error
      }

      installed={
        session,
        bridge,
        compoundMembers,
        joints,
        couplings,
        motors,
        steering,
        suspension,
        disposed:false,
        lastCouplingStep:null,
        lastResistanceStep:null,
        releaseEvents:[],
      }
      return api.status()
    },
    vehicleSteeringBindings(){
      return Object.freeze([...(installed?.steering?.bindings||[])])
    },
    vehicleSteeringBridge(){
      return Object.freeze({
        bindings:Object.freeze([...(installed?.steering?.bindings||[])]),
        rackBindings:Object.freeze([...(installed?.steering?.rackBindings||[])]),
      })
    },
    beforeStep(dt){
      if(!installed||installed.disposed)return Object.freeze({installed:false})
      const motors=installed.motors.step(dt)
      const suspension=installed.suspension.step(dt)
      installed.lastResistanceStep=applyMechanicsJointResistance(installed.joints,dt)
      installed.lastCouplingStep=installed.couplings.step(dt)
      return Object.freeze({
        installed:true,
        motors,
        suspension,
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
      let removed=disposeRapierMechanicsPlan(installed.session,installed.joints)
      if(installed.compoundMembers){
        removed+=disposeCompoundMemberPhysics(installed.session,installed.compoundMembers)
      }
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
        compoundGraph:compoundGraphExpansion.stats,
        couplings:couplingPlan.stats,
        motors:motorPlan.stats,
        steering:steeringPlan.stats,
        vehicle:Object.freeze({
          wheels:vehiclePlan.wheels.length,
          motors:vehiclePlan.motors.length,
          drivenWheels:vehiclePlan.diagnostics.drivenWheelCount,
          ambiguousDrivenWheels:vehiclePlan.diagnostics.ambiguousDrivenWheels.length,
        }),
        blockers,
        bridge:installed?.bridge?.stats??null,
        compoundMaterialized:installed?.compoundMembers?.members?.length??0,
        joints:installed?.joints?.active??0,
        couplingState:installed?.couplings?.snapshot?.()??Object.freeze([]),
        motorState:installed?.motors?.snapshot?.()??Object.freeze([]),
        steeringBindings:installed?.steering?.bindings?.length??0,
        steeringRacks:installed?.steering?.rackBindings?.length??0,
        suspension:Object.freeze({
          count:installed?.suspension?.entries?.length??0,
          state:installed?.suspension?.snapshot?.()??Object.freeze([]),
        }),
        lastCouplingStep:installed?.lastCouplingStep??null,
        lastResistanceStep:installed?.lastResistanceStep??null,
        releaseEvents:Object.freeze([...(installed?.releaseEvents||[])]),
      })
    },
  }

  return Object.freeze(api)
}
