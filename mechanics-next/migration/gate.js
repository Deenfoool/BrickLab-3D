export const MECHANICS_MIGRATION_GATE_VERSION='mechanics-migration-gate-0.2.1'

function check(id,pass,detail=null,severity='blocker'){
  return Object.freeze({
    id,
    pass:Boolean(pass),
    severity,
    detail,
  })
}

export function evaluateMechanicsMigrationGate({
  runtimeStatus=null,
  physicsStatus=null,
  paritySummary=null,
  regression=null,
  persistence=null,
  nativeProjectAuthoritative=false,
  scope='production',
}={}){
  const checks=[]
  const gateScope=scope==='kinematics'?'kinematics':'production'
  const requirePhysics=gateScope==='production'

  checks.push(check(
    'runtime-present',
    Boolean(runtimeStatus?.version),
    runtimeStatus?.version??null,
  ))

  const productionOwnership=runtimeStatus?.productionOwnership??null
  const nativePhysicsOwner=String(productionOwnership?.physicsCreateOwner??'')
    .startsWith('mechanics-next-physics-owner')
  checks.push(check(
    'native-ownership-convergence',
    nativeProjectAuthoritative!==true||(
      productionOwnership?.build===true&&(!requirePhysics||nativePhysicsOwner)
    ),
    {
      scope:gateScope,
      nativeProjectAuthoritative:nativeProjectAuthoritative===true,
      productionOwnership,
      required:nativeProjectAuthoritative===true
        ?Object.freeze({
            build:true,
            physicsCreateOwner:requirePhysics?'mechanics-next-physics-owner*':'not-required-for-kinematics',
          })
        :null,
    },
  ))

  const sceneUnknown=Number(runtimeStatus?.scene?.roles?.unknown||0)
  const sceneSkipped=runtimeStatus?.lastSceneSync?.scene?.skipped??[]
  checks.push(check(
    'scene-part-intelligence',
    Array.isArray(sceneSkipped)&&sceneSkipped.length===0,
    {
      unknownParts:sceneUnknown,
      skipped:Object.freeze([...(Array.isArray(sceneSkipped)?sceneSkipped:[])]),
      scene:runtimeStatus?.scene??null,
      note:'unknown mechanical role is allowed when the part has a valid observed descriptor; role classification is not required for connector ownership',
    },
  ))

  const sceneInstances=Number(runtimeStatus?.scene?.instances||0)
  const observedRecords=Number(runtimeStatus?.lastSceneSync?.observedRecords??-1)
  const recordFailures=runtimeStatus?.mechanicalRecordFailures
    ??runtimeStatus?.lastSceneSync?.recordObservationFailures
    ??null
  checks.push(check(
    'mechanical-record-coverage',
    Array.isArray(recordFailures)&&
      recordFailures.length===0&&
      observedRecords===sceneInstances,
    {
      sceneInstances,
      observedRecords,
      failures:Object.freeze([...(Array.isArray(recordFailures)?recordFailures:[])]),
      diagnosticsAvailable:Array.isArray(recordFailures),
    },
  ))

  const unresolvedConnections=Number(runtimeStatus?.interpretedConnections?.unresolved||0)
  checks.push(check(
    'live-connections-resolved',
    unresolvedConnections===0,
    {unresolved:unresolvedConnections},
  ))

  const decomposition=runtimeStatus?.compoundDecompositions
  checks.push(check(
    'compound-decomposition-stable',
    Boolean(decomposition)&&
      Number(decomposition.pending||0)===0&&
      Number(decomposition.failures||0)===0,
    decomposition??{reason:'decomposition-registry-unavailable'},
  ))

  const compoundOwnership=runtimeStatus?.compoundEndpointOwnership
    ??runtimeStatus?.lastSceneSync?.compoundEndpointOwnership
  checks.push(check(
    'compound-endpoint-ownership',
    Boolean(compoundOwnership)&&Number(compoundOwnership.unresolvedCount||0)===0,
    compoundOwnership??{reason:'compound-endpoint-ownership-unavailable'},
  ))

  const transmissionDiagnostics=runtimeStatus?.lastSceneSync?.transmissions?.diagnostics
    ??runtimeStatus?.transmissionCompiler?.diagnostics
    ??{}
  const coverage=Array.isArray(transmissionDiagnostics?.coverage)
    ?transmissionDiagnostics.coverage
    :[]
  const unsupportedTransmissions=coverage.filter(item=>item?.supported===false)
  checks.push(check(
    'transmission-family-coverage',
    unsupportedTransmissions.length===0,
    {
      unsupported:Object.freeze(unsupportedTransmissions),
      scope:gateScope,
      note:gateScope==='kinematics'
        ?'unsupported families are isolated to their own transmission path; KINEMATICS may run supported mechanisms'
        :'all transmission-capable scene parts must have a production model',
    },
    gateScope==='kinematics'?'warning':'blocker',
  ))

  const ambiguousPackages=[
    ...(transmissionDiagnostics?.packaged||[]),
    ...(transmissionDiagnostics?.differentials||[]),
  ].filter(item=>item?.status==='ambiguous-port-binding')
  checks.push(check(
    'transmission-port-bindings',
    ambiguousPackages.length===0,
    {ambiguous:Object.freeze(ambiguousPackages)},
  ))

  const diffDiagnostics=transmissionDiagnostics?.differentials??[]
  const unresolvedDiffs=Array.isArray(diffDiagnostics)
    ?diffDiagnostics.filter(item=>
        item?.status&&
        !['resolved','awaiting-ports'].includes(item.status))
    :[]
  checks.push(check(
    'compound-differentials-resolved',
    unresolvedDiffs.length===0,
    {unresolved:Object.freeze(unresolvedDiffs)},
  ))

  const physicsBlockers=physicsStatus?.blockers??[]
  checks.push(check(
    'physics-preflight',
    !requirePhysics||(physicsStatus?.pass===true&&physicsBlockers.length===0),
    {
      scope:gateScope,
      required:requirePhysics,
      pass:physicsStatus?.pass===true,
      blockers:Object.freeze([...(physicsBlockers||[])]),
      note:requirePhysics?'required for production physics':'not required for deterministic KINEMATICS',
    },
  ))

  checks.push(check(
    'native-connectivity-parity',
    Boolean(paritySummary)&&
      Number(paritySummary.semanticFail||0)===0&&
      Number(paritySummary.geometryFail||0)===0&&
      (sceneInstances===0||Number(paritySummary.parts||0)>0),
    paritySummary??{reason:'native-parity-not-confirmed'},
  ))

  checks.push(check(
    'project-persistence-compatibility',
    persistence?.pass===true,
    persistence??{reason:'persistence-migration-not-confirmed'},
  ))

  checks.push(check(
    'regression-suite',
    regression?.status==='passed',
    regression??{reason:'regression-suite-not-confirmed'},
  ))

  const blockers=checks.filter(item=>!item.pass&&item.severity==='blocker')
  return Object.freeze({
    version:MECHANICS_MIGRATION_GATE_VERSION,
    scope:gateScope,
    pass:blockers.length===0,
    checks:Object.freeze(checks),
    blockers:Object.freeze(blockers),
    summary:Object.freeze({
      total:checks.length,
      passed:checks.filter(item=>item.pass).length,
      failed:checks.filter(item=>!item.pass).length,
      blockers:blockers.length,
    }),
  })
}

export function migrationGateReasons(result){
  return Object.freeze((result?.blockers||[]).map(item=>Object.freeze({
    id:item.id,
    detail:item.detail,
  })))
}
