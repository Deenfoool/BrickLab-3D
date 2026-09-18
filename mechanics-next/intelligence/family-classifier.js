import { evidence } from '../core/model.js'
import { endpointSemanticKind } from './endpoint-semantics.js'

const ROTARY = new Set([
  'axle','axle-coupler','bush','spur-gear','bevel-gear','crown-gear','clutch-gear',
  'worm','pulley','sprocket','rim','wheel-hub','driving-ring','differential',
])
const TRANSMISSION = new Set([
  'spur-gear','bevel-gear','crown-gear','clutch-gear','worm','rack','pulley','sprocket',
  'differential','packaged-differential','gearbox','driving-ring','universal-joint','cv-joint','linear-actuator',
])
const STRUCTURAL = new Set(['beam','technic-brick','technic-frame','connector','brick','plate','steering-link','suspension-arm'])

function textOf(observation) {
  return [
    observation?.name,
    observation?.description,
    observation?.category,
    ...(observation?.tags || []),
  ].filter(Boolean).join(' | ')
}

function toothCount(text) {
  for (const pattern of [
    /\bgear\s+(\d{1,3})\s*(?:tooth|teeth|t)\b/i,
    /\b(\d{1,3})\s*(?:tooth|teeth|t)\b[^|]{0,36}\bgear\b/i,
  ]) {
    const match = String(text).match(pattern)
    const value = Number(match?.[1])
    if (Number.isFinite(value) && value >= 4 && value <= 168) return value
  }
  return null
}

function axleLength(text) {
  const match = String(text).match(/\b(?:technic\s+)?axle\s+(\d+(?:\.5)?)\s*l?\b/i)
  const value = Number(match?.[1])
  return Number.isFinite(value) && value > 0 && value <= 64 ? value : null
}

function roleFromText(raw) {
  const value = String(raw).toLowerCase()
  if (/\bwheel\s+(?:assembly|with\s+(?:tyre|tire))\b/.test(value)) return 'wheel-assembly'
  if (/\b(?:universal\s+joint|cardan\s+joint)\b/.test(value)) return 'universal-joint'
  if (/\b(?:cv\s+joint|constant\s+velocity)\b/.test(value)) return 'cv-joint'
  if (/\b(?:flex(?:ible)?\s+axle|axle\s+flexible)\b/.test(value)) return 'flex-axle'
  if (/\b(?:gearbox|transmission)\b/.test(value)) return 'gearbox'
  if (/\bdifferential\b/.test(value)) return 'differential'
  if (/\blinear\s+actuator\b/.test(value)) return 'linear-actuator'
  if (/\b(?:shock\s+absorber|spring\s+damper)\b/.test(value)) return 'shock-absorber'
  if (/\b(?:turntable|turn\s*table)\b/.test(value)) return 'turntable'
  if (/\bdriving\s+ring\b|\bclutch\s+ring\b/.test(value)) return 'driving-ring'
  if (/\b(?:gear\s*rack|rack\s+gear|rack\s+and\s+pinion)\b/.test(value)) return 'rack'
  if (/\bworm\b/.test(value) && /\b(?:gear|wheel|screw)\b/.test(value)) return 'worm'
  if (/\bcrown\b/.test(value) && /\bgear\b/.test(value)) return 'crown-gear'
  if (/\bclutch\s+gear\b/.test(value)) return 'clutch-gear'
  if (/\bbevel\b/.test(value) && /\bgear\b/.test(value)) return 'bevel-gear'
  if (/\bgear\b/.test(value) && !/\b(?:gearbox|rack|worm|differential|clutch|driving\s+ring)\b/.test(value)) return 'spur-gear'
  if (/\b(?:sprocket|chain\s+wheel)\b/.test(value)) return 'sprocket'
  if (/\b(?:pulley|belt\s+wheel)\b/.test(value)) return 'pulley'
  if (/\b(?:half\s+)?bush(?:ing)?\b|\baxle\s+stop(?:per)?\b/.test(value)) return 'bush'
  if (/\baxle\s+(?:joiner|connector|coupler)\b/.test(value)) return 'axle-coupler'
  if (/\b(?:technic\s+)?axle\b/.test(value) && !/\b(?:hole|connector|joiner|gear|rack)\b/.test(value)) return 'axle'
  if (/\b(?:technic\s+)?pin\b/.test(value) && !/\bhole\b/.test(value)) return 'pin'
  if (/\b(?:technic\s+frame|frame\s+technic)\b/.test(value)) return 'technic-frame'
  if (/\b(?:liftarm|technic\s+beam)\b/.test(value)) return 'beam'
  if (/\btechnic\s+brick\b/.test(value)) return 'technic-brick'
  if (/\b(?:ball\s+joint|ball\s+socket)\b/.test(value)) return 'ball-joint'
  if (/\bhinge\b/.test(value)) return 'hinge'
  if (/\bsuspension\s+arm\b/.test(value)) return 'suspension-arm'
  if (/\b(?:steering\s+tie\s*rod|tie\s*rod)\b/.test(value)) return 'steering-link'
  if (/\b(?:wheel\s+hub|hub\s+carrier|steering\s+hub|steering\s+knuckle)\b/.test(value)) return 'wheel-hub'
  if (/\b(?:tyre|tire)\b/.test(value)) return 'tire'
  if (/\b(?:wheel|rim)\b/.test(value) && !/\b(?:gear|pulley)\b/.test(value)) return 'rim'
  if (/\bmotor\b/.test(value)) return 'motor'
  if (/\bconnector\b/.test(value)) return 'connector'
  if (/\bbrick\b/.test(value)) return 'brick'
  if (/\bplate\b/.test(value)) return 'plate'
  return 'unknown'
}

function roleFromEndpointEvidence(endpoints) {
  const kinds = endpoints.map(endpointSemanticKind)
  const groups = new Set(kinds)

  if (groups.has('differential-internal-interface')) return 'differential'
  if (groups.has('universal-joint-port')) return 'universal-joint'
  if (groups.has('linear-actuator-guide')) return 'linear-actuator'
  if (groups.has('turntable-bearing')) return 'turntable'
  if (groups.has('wheel-axle-interface') || groups.has('wheel-retainer')) return 'wheel-hub'
  if (groups.has('rack-guide')) return 'rack'
  if (groups.has('engine-slider')) return 'engine'
  if (groups.has('flex-system-end')) return 'flex-system'
  return null
}

function existingEvidence(observation) {
  const existing = observation?.legacyMechanicalIntelligence
  if (!existing?.class) return null
  const map = {
    tire:'tire',
    rim:'rim',
    'wheel-assembly':'wheel-assembly',
    axle:'axle',
    bush:'bush',
    'spur-gear':'spur-gear',
    'bevel-gear':'bevel-gear',
    rack:'rack',
    'universal-joint':'universal-joint',
    'shock-absorber':'shock-absorber',
    'differential-like':'differential',
    'gearbox-like':'gearbox',
    'power-unit':'motor',
    'flex-axle':'flex-axle',
    'ball-joint':'ball-joint',
    'hinge-joint':'hinge',
  }
  return map[existing.class] || null
}

function bodyPolicy(role, observation) {
  if (['flex-axle','flex-system'].includes(role)) return 'deformable'
  if (['wheel-assembly','universal-joint','cv-joint','shock-absorber','linear-actuator'].includes(role)) {
    return 'compound-candidate'
  }

  const description = `${observation?.name || ''} ${observation?.description || ''}`.toLowerCase()
  if (/\b(?:complete|assembly|shortcut)\b/.test(description) &&
      ['turntable','hinge','ball-joint'].includes(role)) return 'compound-candidate'

  return 'rigid-atomic'
}

export function classifyPartFamily(observation, endpoints = []) {
  if (!observation?.id) throw new TypeError('Part classification requires an observation with id')

  const raw = textOf(observation)
  const endpointRole = roleFromEndpointEvidence(endpoints)
  const textRole = roleFromText(raw)
  const oldRole = existingEvidence(observation)

  let role = 'unknown'
  let confidence = 'unknown'
  let source = 'none'
  let reason = null

  if (observation?.legacyMechanics?.differential) {
    role = 'packaged-differential'
    confidence = 'strong'
    source = 'bricklab-explicit-differential-metadata'
    reason = 'explicit differential port metadata'
  } else if (textRole !== 'unknown') {
    role = textRole
    confidence = endpointRole === textRole ? 'strong' : 'inferred'
    source = endpointRole === textRole
      ? 'mechanics-next:catalog+endpoint-evidence'
      : 'mechanics-next:catalog-metadata'
    reason = endpointRole && endpointRole !== textRole
      ? 'physical role from metadata; endpoint role retained as mechanism context'
      : 'part name/category metadata'
  } else if (endpointRole) {
    role = endpointRole
    confidence = 'strong'
    source = 'mechanics-next:endpoint-evidence'
    reason = 'special connector group/profile'
  } else if (oldRole) {
    role = oldRole
    confidence = observation.legacyMechanicalIntelligence?.confidence === 'verified' ? 'strong' : 'inferred'
    source = 'catalog-existing-mechanical-intelligence'
    reason = 'temporary migration evidence'
  }

  const teeth = toothCount(raw) ??
    (Number(observation?.legacyMechanicalIntelligence?.properties?.toothCount) ||
      Number(observation?.legacyMechanics?.gear?.teeth) ||
      null)

  const lengthL = axleLength(raw) ??
    (Number(observation?.legacyMechanicalIntelligence?.properties?.lengthL) || null)

  const legacyGear=observation?.legacyMechanics?.gear
  const legacyWheel=observation?.legacyMechanics?.wheel
  const legacyMotor=observation?.legacyMechanics?.motor
  const legacyTransmission=observation?.legacyMechanics?.transmission
  const legacyDifferential=observation?.legacyMechanics?.differential
  const legacyWormDrive=observation?.legacyMechanics?.wormDrive
  const legacyRackGear=observation?.legacyMechanics?.rackGear
  const legacySteeringRack=observation?.legacyMechanics?.steeringRack
  const legacySteeringKnuckle=observation?.legacyMechanics?.steeringKnuckle
  const legacySteeringBase=observation?.legacyMechanics?.steeringBase
  const legacyShockBody=observation?.legacyMechanics?.shockBody
  const legacyShockRod=observation?.legacyMechanics?.shockRod
  const legacySuspensionArm=observation?.legacyMechanics?.suspensionArm
  const legacyArticulatedCoupler=observation?.legacyMechanics?.articulatedCoupler
  const gearGeometry=legacyGear && typeof legacyGear==='object'
    ?Object.freeze({
        pitchRadius:Number.isFinite(Number(legacyGear.pitchRadius))?Number(legacyGear.pitchRadius):null,
        moduleStud:Number.isFinite(Number(legacyGear.moduleStud))?Number(legacyGear.moduleStud):null,
        kind:legacyGear.kind??null,
        meshAnchorLdu:Array.isArray(legacyGear.meshAnchorLdu)?legacyGear.meshAnchorLdu.slice(0,3).map(Number):null,
        meshAxisLdu:Array.isArray(legacyGear.meshAxisLdu)?legacyGear.meshAxisLdu.slice(0,3).map(Number):null,
        bevelApexSigns:Array.isArray(legacyGear.bevelApexSigns)?legacyGear.bevelApexSigns.map(Number).filter(value=>value===-1||value===1):null,
        meshApexToleranceStud:Number.isFinite(Number(legacyGear.meshApexToleranceStud))?Number(legacyGear.meshApexToleranceStud):null,
        meshCaptureDistanceStud:Number.isFinite(Number(legacyGear.meshCaptureDistanceStud))?Number(legacyGear.meshCaptureDistanceStud):null,
        source:legacyGear.source??'legacy-migration-evidence',
      })
    :null

  const legacyProps=observation?.legacyMechanicalIntelligence?.properties || {}
  const legacyParameterConfidence=String(observation?.legacyMechanicalIntelligence?.confidence||'unknown')
  const legacyParameterSource=observation?.legacyMechanicalIntelligence?.source||'catalog-existing-mechanical-intelligence'
  const finiteProp=(...names)=>{
    for(const name of names){
      const value=Number(legacyProps?.[name])
      if(Number.isFinite(value))return value
    }
    return null
  }
  const screwLeadStudPerTurn=finiteProp('screwLeadStudPerTurn','leadStudPerTurn')
  const travelStud=finiteProp('travelStud','strokeStud')
  const restLengthStud=finiteProp('restLengthStud')
  const springStiffness=finiteProp('springStiffness')
  const damping=finiteProp('damping','springDamping')
  const maxBendAngleRad=finiteProp('maxBendAngleRad')

  const packagedTransmission=legacyTransmission&&
    legacyTransmission.inputConnectorId&&legacyTransmission.outputConnectorId
    ?Object.freeze({
        inputConnectorId:String(legacyTransmission.inputConnectorId),
        outputConnectorId:String(legacyTransmission.outputConnectorId),
        rigidConnectorId:legacyTransmission.rigidConnectorId==null?null:String(legacyTransmission.rigidConnectorId),
        modes:Object.freeze(Object.fromEntries(
          Object.entries(legacyTransmission.modes||{})
            .filter(([,value])=>Number.isFinite(Number(value)))
            .map(([key,value])=>[String(key),Number(value)]),
        )),
        efficiency:Number.isFinite(Number(legacyTransmission.efficiency))
          ?Number(legacyTransmission.efficiency):null,
        wormDrive:legacyWormDrive?Object.freeze({
          reduction:Number.isFinite(Number(legacyWormDrive.reduction))?Number(legacyWormDrive.reduction):null,
          backdriveEfficiency:Number.isFinite(Number(legacyWormDrive.backdriveEfficiency))
            ?Number(legacyWormDrive.backdriveEfficiency):null,
        }):null,
        articulated:legacyArticulatedCoupler?Object.freeze({...legacyArticulatedCoupler}):null,
      })
    :null

  const packagedDifferential=legacyDifferential&&
    legacyDifferential.inputConnectorId&&
    legacyDifferential.leftConnectorId&&
    legacyDifferential.rightConnectorId
    ?Object.freeze({
        inputConnectorId:String(legacyDifferential.inputConnectorId),
        leftConnectorId:String(legacyDifferential.leftConnectorId),
        rightConnectorId:String(legacyDifferential.rightConnectorId),
        ratio:Number.isFinite(Number(legacyDifferential.ratio))?Number(legacyDifferential.ratio):1,
        efficiency:Number.isFinite(Number(legacyDifferential.efficiency))
          ?Number(legacyDifferential.efficiency):null,
        torqueSplit:Number.isFinite(Number(legacyDifferential.torqueSplit))
          ?Number(legacyDifferential.torqueSplit):null,
      })
    :null

  const rackMetrics=observation?.rackVisualMetrics
  const rackGeometry=legacyRackGear
    ?Object.freeze({
        moduleStud:Number(legacyRackGear.moduleStud),
        pressureAngleDeg:Number(legacyRackGear.pressureAngleDeg),
        linearPitchStud:Number(legacyRackGear.linearPitchStud),
        pitchLinePoint:Array.isArray(legacyRackGear.pitchLinePoint)
          ?legacyRackGear.pitchLinePoint.slice(0,3).map(Number):null,
        travelAxis:Array.isArray(legacyRackGear.travelAxis)
          ?legacyRackGear.travelAxis.slice(0,3).map(Number):null,
        toothNormal:Array.isArray(legacyRackGear.toothNormal)
          ?legacyRackGear.toothNormal.slice(0,3).map(Number):null,
        widthAxis:Array.isArray(legacyRackGear.widthAxis)
          ?legacyRackGear.widthAxis.slice(0,3).map(Number):null,
        phaseOriginStud:Number.isFinite(Number(legacyRackGear.phaseOriginStud))
          ?Number(legacyRackGear.phaseOriginStud):null,
        toothCount:Number.isFinite(Number(legacyRackGear.toothCount))
          ?Number(legacyRackGear.toothCount):null,
        maxTravelStud:Number.isFinite(Number(legacyRackGear.maxTravelStud))
          ?Number(legacyRackGear.maxTravelStud):null,
        source:legacyRackGear.source??'catalog-rack-gear',
      })
    :rackMetrics&&legacySteeringRack
      ?Object.freeze({
          moduleStud:Number(rackMetrics.moduleStud),
          pressureAngleDeg:Number(rackMetrics.pressureAngleDeg),
          linearPitchStud:Number(rackMetrics.linearPitchStud),
          pitchLinePoint:null,
          travelAxis:Object.freeze([1,0,0]),
          toothNormal:Object.freeze([0,1,0]),
          widthAxis:Object.freeze([0,0,1]),
          phaseOriginStud:null,
          toothCount:null,
          maxTravelStud:Number.isFinite(Number(legacySteeringRack.maxTravelStud))
            ?Number(legacySteeringRack.maxTravelStud):null,
          source:'catalog-rack-visual-metrics',
        })
      :null

  const properties = {
    ...(Number.isFinite(teeth) && teeth > 0 ? { toothCount:teeth } : {}),
    ...(Number.isFinite(lengthL) && lengthL > 0 ? { lengthL } : {}),
    ...(gearGeometry ? { gearGeometry } : {}),
    ...(legacyWheel&&typeof legacyWheel==='object'&&Number.isFinite(Number(legacyWheel.radius))
      ?{wheel:Object.freeze({
          radiusStud:Number(legacyWheel.radius),
          widthStud:Number.isFinite(Number(legacyWheel.width))?Number(legacyWheel.width):null,
          tire:legacyWheel.tire&&typeof legacyWheel.tire==='object'
            ?Object.freeze({...legacyWheel.tire})
            :null,
          source:'bricklab-explicit-wheel-metadata',
        })}
      :{}),
    ...(packagedTransmission ? { packagedTransmission } : {}),
    ...(packagedDifferential ? { packagedDifferential } : {}),
    ...(rackGeometry ? { rackGeometry } : {}),
    ...(legacySteeringRack&&typeof legacySteeringRack==='object'
      ?{steeringRack:Object.freeze({...legacySteeringRack})}
      :{}),
    ...(legacySteeringKnuckle&&typeof legacySteeringKnuckle==='object'
      ?{steeringKnuckle:Object.freeze({...legacySteeringKnuckle})}
      :{}),
    ...(legacySteeringBase&&typeof legacySteeringBase==='object'
      ?{steeringBase:Object.freeze({...legacySteeringBase})}
      :{}),
    ...(legacyShockBody&&typeof legacyShockBody==='object'
      ?{shockBody:Object.freeze({
          railConnectorId:legacyShockBody.railConnectorId??'rail',
          minTravelStud:Number.isFinite(Number(legacyShockBody.minTravelStud))
            ?Number(legacyShockBody.minTravelStud):-1.25,
          maxTravelStud:Number.isFinite(Number(legacyShockBody.maxTravelStud))
            ?Number(legacyShockBody.maxTravelStud):.25,
          springStiffness:Number.isFinite(Number(legacyShockBody.springStiffness))
            ?Number(legacyShockBody.springStiffness):3.2,
          damping:Number.isFinite(Number(legacyShockBody.damping))
            ?Number(legacyShockBody.damping):.38,
          restTravelStud:Number.isFinite(Number(legacyShockBody.restTravelStud))
            ?Number(legacyShockBody.restTravelStud):0,
        })}
      :{}),
    ...(legacyShockRod&&typeof legacyShockRod==='object'
      ?{shockRod:Object.freeze({
          sliderConnectorId:legacyShockRod.sliderConnectorId??'slider',
        })}
      :{}),
    ...(legacySuspensionArm&&typeof legacySuspensionArm==='object'
      ?{suspensionArm:Object.freeze({
          pivotConnectorId:legacySuspensionArm.pivotConnectorId??'pivot',
          restAngle:Number.isFinite(Number(legacySuspensionArm.restAngle))
            ?Number(legacySuspensionArm.restAngle):0,
          stiffness:Number.isFinite(Number(legacySuspensionArm.stiffness))
            ?Math.max(0,Number(legacySuspensionArm.stiffness)):.12,
          damping:Number.isFinite(Number(legacySuspensionArm.damping))
            ?Math.max(0,Number(legacySuspensionArm.damping)):.01,
          springRate:Number.isFinite(Number(legacySuspensionArm.springRate))
            ?Math.max(0,Number(legacySuspensionArm.springRate)):null,
          compressionDamping:Number.isFinite(Number(legacySuspensionArm.compressionDamping))
            ?Math.max(0,Number(legacySuspensionArm.compressionDamping)):null,
          reboundDamping:Number.isFinite(Number(legacySuspensionArm.reboundDamping))
            ?Math.max(0,Number(legacySuspensionArm.reboundDamping)):null,
          preload:Number.isFinite(Number(legacySuspensionArm.preload))
            ?Number(legacySuspensionArm.preload):0,
          bumpStop:Number.isFinite(Number(legacySuspensionArm.bumpStop))
            ?Math.min(.999,Math.max(0,Number(legacySuspensionArm.bumpStop))):.88,
          minAngle:Number.isFinite(Number(legacySuspensionArm.minAngle))
            ?Number(legacySuspensionArm.minAngle):null,
          maxAngle:Number.isFinite(Number(legacySuspensionArm.maxAngle))
            ?Number(legacySuspensionArm.maxAngle):Math.PI*55/180,
        })}
      :{}),
    ...(role==='motor'&&legacyMotor&&typeof legacyMotor==='object'?{
      motor:Object.freeze({
        connectorId:legacyMotor.connectorId??null,
        rpm:Number.isFinite(Number(legacyMotor.rpm))?Number(legacyMotor.rpm):120,
        direction:Number(legacyMotor.direction)<0?-1:1,
        damping:Number.isFinite(Number(legacyMotor.damping))?Number(legacyMotor.damping):1,
        stallTorque:Number.isFinite(Number(legacyMotor.stallTorque))?Number(legacyMotor.stallTorque):5.5,
        freeCurrent:Number.isFinite(Number(legacyMotor.freeCurrent))?Number(legacyMotor.freeCurrent):.15,
        stallCurrent:Number.isFinite(Number(legacyMotor.stallCurrent))?Number(legacyMotor.stallCurrent):2.2,
      })
    }:{}),
    ...(Number.isFinite(screwLeadStudPerTurn) && screwLeadStudPerTurn !== 0 ? { screwLeadStudPerTurn } : {}),
    ...(Number.isFinite(travelStud) && travelStud > 0 ? { travelStud } : {}),
    ...(Number.isFinite(restLengthStud) && restLengthStud > 0 ? { restLengthStud } : {}),
    ...(Number.isFinite(springStiffness) && springStiffness >= 0 ? { springStiffness } : {}),
    ...(Number.isFinite(damping) && damping >= 0 ? { damping } : {}),
    ...(Number.isFinite(maxBendAngleRad) && maxBendAngleRad > 0 ? { maxBendAngleRad } : {}),
    ...([screwLeadStudPerTurn,travelStud,restLengthStud,springStiffness,damping,maxBendAngleRad].some(Number.isFinite)
      ?{compoundParameterEvidence:Object.freeze({
          confidence:legacyParameterConfidence,
          source:legacyParameterSource,
        })}
      :{}),
    ...(role === 'axle' ? { keyed:true } : {}),
    ...(role === 'bush' ? { retainer:true } : {}),
  }

  return Object.freeze({
    role,
    family:role === 'unknown' ? 'unknown' : role,
    confidence,
    bodyPolicy:bodyPolicy(role, observation),
    contexts:Object.freeze(endpointRole && endpointRole !== role ? [endpointRole] : []),
    capabilities:Object.freeze({
      rotary:ROTARY.has(role)&&!packagedTransmission&&!packagedDifferential,
      transmission:TRANSMISSION.has(role)||Boolean(packagedTransmission)||Boolean(packagedDifferential),
      structural:STRUCTURAL.has(role),
      flexible:['flex-axle','flex-system'].includes(role),
      retainer:role === 'bush',
    }),
    properties:Object.freeze(properties),
    evidence:evidence({ source, confidence, reason, detail:{ endpointRole, textRole, migratedRole:oldRole } }),
  })
}
