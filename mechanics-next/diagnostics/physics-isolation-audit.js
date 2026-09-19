export const PHYSICS_ISOLATION_AUDIT_VERSION='mechanics-physics-isolation-audit-0.1.0'

function check(id,pass,detail=null){
  return Object.freeze({id,pass:Boolean(pass),detail})
}

const RETIRED_WRITER_OWNERS=new Set([
  'joint-stability-v5',
  'articulated-driveline-physics-v1',
  'steering-suspension-physics-v1',
])

function retiredWriterCheck(PhysicsSession,name){
  const fn=PhysicsSession?.prototype?.[name]
  const owner=fn?.__bricklabOwner??null
  return check(
    `retired-writer:${name}`,
    fn?.__mechanicsNextBypass!==true&&!RETIRED_WRITER_OWNERS.has(owner),
    Object.freeze({
      present:typeof fn==='function',
      owner,
      mechanicsNextBypass:fn?.__mechanicsNextBypass===true,
    }),
  )
}

export function auditMechanicsNextPhysicsIsolation({
  PhysicsSession,
  session,
}={}){
  const checks=[]
  checks.push(check(
    'bootstrap-marker',
    session?.mechanicsNextBootstrap===true,
    session?.creationOptions??null,
  ))

  const connections=Array.isArray(session?.connections)?session.connections:[]
  const foreignConnections=connections.filter(connection=>
    connection?.kind!=='fixed'||connection?.mechanicsNextCompatibility!==true)
  checks.push(check(
    'compatibility-connections-only',
    foreignConnections.length===0,
    Object.freeze({
      total:connections.length,
      foreign:Object.freeze(foreignConnections.map(connection=>Object.freeze({
        id:connection?.id??null,
        kind:connection?.kind??null,
        mechanicsNextCompatibility:connection?.mechanicsNextCompatibility===true,
      }))),
    }),
  ))

  checks.push(check(
    'legacy-auto-weld-bypassed',
    (session?.mechanicsNextBaseInfrastructure===true||session?.autoWeldStats?.mechanicsNextBypass===true)&&
      Number(session?.autoWeldStats?.inferredFixedLinks||0)===0,
    session?.autoWeldStats??null,
  ))
  checks.push(check(
    'legacy-axle-recovery-bypassed',
    (session?.mechanicsNextBaseInfrastructure===true||session?.mechanicalRecoveryStats?.mechanicsNextBypass===true)&&
      Number(session?.mechanicalRecoveryStats?.recoveredAxleLinks||0)===0,
    session?.mechanicalRecoveryStats??null,
  ))

  checks.push(check(
    'legacy-motor-worklist-empty',
    Array.isArray(session?.motorDrives)&&session.motorDrives.length===0,
    {count:session?.motorDrives?.length??null},
  ))
  checks.push(check(
    'legacy-drivetrain-worklist-empty',
    Array.isArray(session?.gearCouplers)&&session.gearCouplers.length===0,
    {count:session?.gearCouplers?.length??null},
  ))
  checks.push(check(
    'legacy-suspension-worklist-empty',
    !session?.suspensionJoints?.length,
    {count:session?.suspensionJoints?.length??0},
  ))

  for(const name of [
    'createJoint',
    'applyMotorTorques',
    'applyGearCouplingTorques',
    'initializeSuspensionJointsV1',
    'initializeParts4LinearMechanisms',
    'updateSuspensionV2',
    'updateVehicleControlsV1',
  ])checks.push(retiredWriterCheck(PhysicsSession,name))

  const failures=checks.filter(item=>!item.pass)
  return Object.freeze({
    version:PHYSICS_ISOLATION_AUDIT_VERSION,
    pass:failures.length===0,
    checks:Object.freeze(checks),
    failures:Object.freeze(failures),
    summary:Object.freeze({
      total:checks.length,
      passed:checks.length-failures.length,
      failed:failures.length,
    }),
  })
}
