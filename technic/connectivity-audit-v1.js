import { classifyConnectorV4, activationForMatchV4 } from '../connectors-v4/activation-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { bidirectionalCylinderReceiverV4, explicitOneSidedCylinderReceiverV4, symmetricCylinderProfileV4 } from '../connectors-v4/through-hole-v4.js'

export const TECHNIC_CONNECTIVITY_AUDIT_VERSION = 'technic-connectivity-audit-v1.0.0'

function section(shape,radiusLdu,lengthLdu){return{shape,radiusLdu,lengthLdu,elastic:shape==='_L'||shape==='L_'}}
function cylinder(gender,sections,{caps='none',centered=true,slide=true,id=null}={}){
  return{
    schemaVersion:4,id,family:'cylinder',gender,group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections,caps,centered},snap:{slide},inheritance:{scale:'none',mirror:'cor'},source:{kind:'technic-audit-probe'},
  }
}

export const TECHNIC_MATING_PROBES_V1=Object.freeze({
  axle:cylinder('male',[section('A',6,80)],{caps:'none',centered:true,slide:true,id:'auditAxle'}),
  axleHole:cylinder('female',[section('A',6,20)],{caps:'none',centered:true,slide:true,id:'auditAxleHole'}),
  pin:cylinder('male',[section('R',8,2),section('R',6,16),section('_L',6.25,2)],{caps:'one',centered:false,slide:false,id:'auditPin'}),
  pinHole:cylinder('female',[section('R',8,2),section('R',6,16),section('R',8,2)],{caps:'none',centered:true,slide:true,id:'auditPinHole'}),
  roundHole:cylinder('female',[section('R',6,20)],{caps:'none',centered:true,slide:true,id:'auditRoundHole'}),
  axlePin:cylinder('male',[section('A',6,20),section('R',6,16),section('_L',6.25,2)],{caps:'none',centered:true,slide:true,id:'auditAxlePin'}),
})

const REQUIRED_ACTIVE=Object.freeze({
  'technic-axle':['axleHole','roundHole','pinHole'],
  'technic-axle-hole':['axle'],
  'technic-pin':['pinHole','roundHole'],
  'technic-axle-pin':['axleHole','pinHole','roundHole'],
  'technic-pin-hole':['pin','axle','axlePin'],
  'technic-round-hole':['pin','axle','axlePin'],
})
const FORBIDDEN_ACTIVE=Object.freeze({
  'technic-axle-hole':['pin'],
  'technic-pin':['axleHole'],
})

function evaluatePair(connector,probeName){
  const probe=TECHNIC_MATING_PROBES_V1[probeName]
  const match=matchConnectorV4(connector,probe)
  const activation=match?.compatible?activationForMatchV4(connector,probe,match):null
  return{
    probe:probeName,
    compatible:match?.compatible===true,
    active:activation?.active===true,
    matchReason:match?.reason||null,
    activationFamily:activation?.family||null,
  }
}

export function auditTechnicConnectorV1(connector){
  const role=classifyConnectorV4(connector)
  const findings=[]
  const required=(REQUIRED_ACTIVE[role]||[]).map(probe=>evaluatePair(connector,probe))
  const forbidden=(FORBIDDEN_ACTIVE[role]||[]).map(probe=>evaluatePair(connector,probe))

  for(const pair of required){
    if(!pair.compatible)findings.push(`missing-compatible-mate:${pair.probe}`)
    else if(!pair.active)findings.push(`missing-certified-mate:${pair.probe}`)
  }
  for(const pair of forbidden){
    if(pair.active)findings.push(`unexpected-certified-mate:${pair.probe}`)
  }

  let entryPolicy=null
  if(connector?.family==='cylinder'&&connector?.gender==='female'&&String(connector.geometry?.caps||'one').toLowerCase()==='none'){
    const symmetric=symmetricCylinderProfileV4(connector)
    const explicitOneSided=explicitOneSidedCylinderReceiverV4(connector)
    const bidirectional=bidirectionalCylinderReceiverV4(connector)
    entryPolicy=bidirectional?'both-sides':'canonical-side'
    if(explicitOneSided&&bidirectional)findings.push('one-sided-receiver-marked-bidirectional')
    if(!explicitOneSided&&symmetric&&!bidirectional)findings.push('symmetric-through-receiver-not-bidirectional')
    if(['technic-axle-hole','technic-round-hole'].includes(role)&&!symmetric)findings.push('unexpected-asymmetric-technic-through-profile')
  }

  return Object.freeze({
    version:TECHNIC_CONNECTIVITY_AUDIT_VERSION,
    endpointId:connector?.endpointId||null,
    role,
    entryPolicy,
    required,
    forbidden,
    pass:findings.length===0,
    findings:Object.freeze(findings),
  })
}

export function auditTechnicPartConnectorsV1(connectors){
  const endpoints=(connectors||[]).map(auditTechnicConnectorV1)
  const findings=[]
  for(const endpoint of endpoints){
    for(const finding of endpoint.findings)findings.push({endpointId:endpoint.endpointId,role:endpoint.role,finding})
  }
  return Object.freeze({
    version:TECHNIC_CONNECTIVITY_AUDIT_VERSION,
    endpoints:Object.freeze(endpoints),
    checked:endpoints.filter(endpoint=>endpoint.required.length||endpoint.forbidden.length||endpoint.entryPolicy).length,
    bidirectionalReceivers:endpoints.filter(endpoint=>endpoint.entryPolicy==='both-sides').length,
    directionalReceivers:endpoints.filter(endpoint=>endpoint.entryPolicy==='canonical-side').length,
    pass:findings.length===0,
    findings:Object.freeze(findings),
  })
}
