import { PhysicsSession } from '../../physics.js'
import { createRapierBaseSession } from '../../rapier-loader-v2.js'
import { auditMechanicsNextPhysicsIsolation } from '../diagnostics/physics-isolation-audit.js'

export const MECHANICS_NEXT_PHYSICS_OWNER_VERSION='mechanics-next-physics-owner-0.1.0'

const marker=Symbol.for('bricklab.mechanicsNext.physicsOwner.0.1.0')
const mechanics=globalThis.BrickLabMechanicsNext

if(!mechanics){
  throw new Error('Mechanics Next physics owner requires Mechanics Next runtime')
}

let lastAttempt=null
let nextSessions=0
let fallbackSessions=0

function fixedCompatibilityConnections(plan,availableInstanceIds=null){
  const allowed=availableInstanceIds instanceof Set?availableInstanceIds:null
  const result=[]
  for(const component of plan?.components||[]){
    const ids=[...(component.instanceIds||[])]
      .filter(Boolean)
      .filter(id=>!allowed||allowed.has(String(id)))
    if(ids.length<2)continue
    const root=ids[0]
    for(let index=1;index<ids.length;index+=1){
      result.push(Object.freeze({
        id:`mechanics-next-rigid:${component.id}:${index}`,
        kind:'fixed',
        a:Object.freeze({instanceId:root,connectorId:'mechanics-next-rigid'}),
        b:Object.freeze({instanceId:ids[index],connectorId:'mechanics-next-rigid'}),
        mechanicsNextCompatibility:true,
      }))
    }
  }
  return result
}

function migrationBlockers(gate,physics){
  const blockers=[]
  if(!gate?.pass){
    blockers.push(...(gate?.blockers||[]).map(item=>Object.freeze({
      code:`migration-gate:${item.id}`,
      detail:item.detail??null,
    })))
  }
  if(!physics?.pass){
    blockers.push(...(physics?.blockers||[]))
  }
  return Object.freeze(blockers)
}

function disableLegacyDrivetrainOwners(session){
  // The base session may discover gear geometry on its own. Mechanics Next owns all
  // transmission equations and motor torque in a migrated session, so legacy torque
  // writers must have empty worklists rather than competing with Next impulses.
  session.gearCouplers=[]
  session.motorDrives=[]
  session.connectorV4Physics=null
  session.connectorV4Drivetrain=null
}

function installDisposeBridge(session,physics){
  const original=session.dispose?.bind(session)
  let disposed=false
  session.dispose=function disposeMechanicsNextSession(){
    if(disposed)return
    disposed=true
    try{physics.dispose?.()}catch(error){
      console.warn('[BrickLab Mechanics Next] Could not dispose physics runtime cleanly.',error)
    }
    return original?.()
  }
}

function rejectNativeSession(reason){
  const error=new Error('Mechanics Next physics entry blocked: '+reason.reason)
  error.code='BRICKLAB_MECHANICS_NEXT_PHYSICS_BLOCKED'
  error.mechanicsNext=reason
  throw error
}

if(!PhysicsSession[marker]){

  PhysicsSession.create=async function createWithMechanicsNextOwnership(objects,connections,...rest){
    let gate=null
    let physics=null
    try{
      gate=await mechanics.prepareMigration()
      physics=mechanics.physicsPreview?.()
    }catch(error){
      lastAttempt=Object.freeze({
        owner:'blocked',
        reason:'migration-preparation-error',
        error:String(error?.message||error),
      })
      return rejectNativeSession(lastAttempt)
    }

    const blockers=migrationBlockers(gate,physics)
    if(blockers.length){
      lastAttempt=Object.freeze({
        owner:'blocked',
        reason:'migration-gate-blocked',
        blockers,
        gate:gate?.summary??null,
      })
      return rejectNativeSession(lastAttempt)
    }

    let buildOwnership=null
    if(mechanics.nativeProjectAuthoritative?.()!==true){
      buildOwnership=mechanics.adoptNativeProjectOwnership?.()??null
      if(!buildOwnership?.accepted){
        lastAttempt=Object.freeze({
          owner:'blocked',
          reason:'native-build-ownership-required',
          gate:gate?.summary??null,
          buildOwnership,
        })
        return rejectNativeSession(lastAttempt)
      }
    }
    const buildOwner=globalThis.BrickLabMechanicsNextBuildOwner
    if(buildOwner?.active!==true||buildOwner?.authoritative?.()!==true){
      lastAttempt=Object.freeze({
        owner:'blocked',
        reason:'native-build-owner-not-published',
        gate:gate?.summary??null,
        buildOwnership,
      })
      return rejectNativeSession(lastAttempt)
    }

    const excludedRoots=new Set(
      (physics.compoundGraphExpansion?.materializedRootInstanceIds||[]).map(String),
    )
    const baseObjects=(objects||[]).filter(object=>
      !excludedRoots.has(String(object?.userData?.instanceId||'')))
    const baseIds=new Set(baseObjects.map(object=>String(object?.userData?.instanceId||'')).filter(Boolean))
    const compatibility=fixedCompatibilityConnections(physics.structuralPlan,baseIds)
    let session=null
    let physicsInstalled=false
    let isolation=null
    try{
      const requestedOptions=
        rest.length===1&&rest[0]&&typeof rest[0]==='object'&&!Array.isArray(rest[0])
          ?rest[0]
          :{}
      session=await createRapierBaseSession(
        baseObjects,
        compatibility,
        {
          ...requestedOptions,
          mechanicsNextOwned:true,
          mechanicsNextOwnerVersion:MECHANICS_NEXT_PHYSICS_OWNER_VERSION,
          mechanicsNextVehiclePlan:physics.vehiclePlan,
        },
      )
      const preflight=physics.preflightSession(session)
      if(!preflight.pass){
        const error=new Error('Mechanics Next production session preflight failed')
        error.failures=preflight.failures
        throw error
      }

      disableLegacyDrivetrainOwners(session)
      isolation=auditMechanicsNextPhysicsIsolation({PhysicsSession,session})
      if(!isolation.pass){
        const error=new Error('Mechanics Next physics isolation audit failed')
        error.failures=isolation.failures
        throw error
      }
      physics.install(session,{
        stabilization:1,
        contactsEnabled:false,
      })
      physicsInstalled=true
      const steeringBridge=physics.vehicleSteeringBridge?.()??Object.freeze({
        bindings:Object.freeze([]),
        rackBindings:Object.freeze([]),
      })
      const steeringInstaller=globalThis.BrickLabVehicle?.installMechanicsNextSteering
      const steeringCount=
        (steeringBridge.bindings?.length??0)+(steeringBridge.rackBindings?.length??0)
      if(steeringCount&&typeof steeringInstaller!=='function'){
        throw new Error('Mechanics Next steering bindings exist but Vehicle System bridge is unavailable')
      }
      const steeringIntegration=typeof steeringInstaller==='function'
        ?steeringInstaller(session,steeringBridge)
        :Object.freeze({installed:0,racks:0,skipped:0})
      if(steeringIntegration.skipped>0){
        const error=new Error('Mechanics Next vehicle steering integration skipped native bindings')
        error.failures=[Object.freeze({
          code:'vehicle-steering-binding-skipped',
          ...steeringIntegration,
        })]
        throw error
      }
      mechanics.handoffDomains?.(['physics-constraints'],'validated Mechanics Next SIMULATE session')
      session.mechanicsNextPhysics=physics
      session.mechanicsNextOwnership=Object.freeze({
        owner:'mechanics-next',
        version:MECHANICS_NEXT_PHYSICS_OWNER_VERSION,
        compatibilityConnections:compatibility.length,
        excludedCompoundRoots:excludedRoots.size,
        steeringBindings:steeringBridge.bindings?.length??0,
        steeringRacks:steeringBridge.rackBindings?.length??0,
        isolation:isolation.summary,
        gate:gate.summary??null,
      })
      installDisposeBridge(session,physics)
      nextSessions+=1
      lastAttempt=Object.freeze({
        owner:'mechanics-next',
        gate:gate.summary??null,
        physics:physics.status(),
        isolation,
      })
      globalThis.dispatchEvent?.(new CustomEvent('bricklab:mechanicsnextphysicsowner',{
        detail:{
          version:MECHANICS_NEXT_PHYSICS_OWNER_VERSION,
          owner:'mechanics-next',
          gate:gate.summary??null,
        },
      }))
      return session
    }catch(error){
      if(physicsInstalled){
        try{physics?.dispose?.()}catch(disposeError){
          console.warn('[BrickLab Mechanics Next] Could not rollback failed native physics install.',disposeError)
        }
      }
      try{session?.dispose?.()}catch{}
      lastAttempt=Object.freeze({
        owner:'blocked',
        reason:'next-session-install-error',
        error:String(error?.message||error),
        failures:Object.freeze([...(error?.failures||[])]),
      })
      console.warn('[BrickLab Mechanics Next] SIMULATE migration failed; native BUILD requires fail-closed recovery.',lastAttempt)
      return rejectNativeSession(lastAttempt)
    }
  }

  Object.defineProperty(PhysicsSession.create,'__bricklabOwner',{
    value:MECHANICS_NEXT_PHYSICS_OWNER_VERSION,
    enumerable:false,
    configurable:false,
    writable:false,
  })
  Object.defineProperty(PhysicsSession,marker,{
    value:true,
    enumerable:false,
    configurable:false,
    writable:false,
  })
}

export const BrickLabMechanicsNextPhysicsOwner=Object.freeze({
  version:MECHANICS_NEXT_PHYSICS_OWNER_VERSION,
  active:true,
  createOwner:PhysicsSession.create?.__bricklabOwner??null,
  lastAttempt:()=>lastAttempt,
  stats:()=>Object.freeze({
    nextSessions,
    fallbackSessions,
    lastAttempt,
  }),
})

globalThis.BrickLabMechanicsNextPhysicsOwner=BrickLabMechanicsNextPhysicsOwner
