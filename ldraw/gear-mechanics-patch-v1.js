import { PARTS } from '../parts.js'

export const LDRAW_GEAR_MECHANICS_PATCH_VERSION = 'ldraw-gear-mechanics-patch-v1.0.0'

const EXACT = new Map([
  ['62821', { teeth:28, kind:'bevel', pitchRadius:28/16, efficiency:.90, differentialHousing:true }],
  ['18575', { teeth:20, kind:'bevel', pitchRadius:20/16, efficiency:.92, doubleBevel:true, reinforced:true }],
])

function codeOf(definition) {
  return String(definition?.ldraw?.code || definition?.ldraw?.file || definition?.id || '')
    .replace(/^ldraw-/i,'')
    .replace(/^parts[\\/]/i,'')
    .replace(/\\/g,'/')
    .split('/').pop()
    ?.replace(/\.dat$/i,'')
    .trim().toLowerCase() || ''
}

function textOf(definition) {
  return [definition?.name,definition?.description,definition?.category,...(definition?.tags || [])]
    .filter(Boolean).join(' ')
}

export function gearMechanicsForLDrawDefinition(definition) {
  const code=codeOf(definition)
  const exact=EXACT.get(code)
  if(exact)return { ...exact }

  const text=textOf(definition)
  const match=text.match(/\bgear\s+(\d{1,3})\s*(?:tooth|teeth)\b/i)
  if(!match)return null
  const teeth=Number(match[1])
  if(!Number.isFinite(teeth)||teeth<6||teeth>80)return null

  const lower=text.toLowerCase()
  if(/\b(?:worm|rack|crown|clutch|knob|turntable)\b/.test(lower))return null
  if(/\bbevel\b/.test(lower)){
    return {
      teeth,
      kind:'bevel',
      pitchRadius:teeth/16,
      efficiency:.92,
      ...(lower.includes('double bevel')?{doubleBevel:true}:{}),
      ...(lower.includes('reinforced')?{reinforced:true}:{}),
    }
  }
  if(/\bdifferential\b/.test(lower)&&teeth===28){
    return { teeth,kind:'bevel',pitchRadius:teeth/16,efficiency:.90,differentialHousing:true }
  }
  return { teeth,kind:'spur',pitchRadius:teeth/16,efficiency:.92 }
}

export function applyLDrawGearMechanics(definition) {
  if(!definition?.id?.startsWith?.('ldraw-'))return false
  const gear=gearMechanicsForLDrawDefinition(definition)
  if(!gear)return false
  definition.mechanics={ ...(definition.mechanics || {}), gear:{ ...(definition.mechanics?.gear || {}), ...gear } }
  definition.ldraw={ ...(definition.ldraw || {}), gearMechanicsVersion:LDRAW_GEAR_MECHANICS_PATCH_VERSION }
  return true
}

export function syncLDrawGearMechanics(parts=PARTS) {
  let patched=0
  for(const definition of parts)if(applyLDrawGearMechanics(definition))patched+=1
  return patched
}

syncLDrawGearMechanics()

for(const type of ['bricklab:ldrawloaded','bricklab:ldrawlegacyready','bricklab:connectorv4']){
  globalThis.addEventListener?.(type,event=>{
    const partId=event.detail?.id || event.detail?.partId
    if(partId){
      const definition=PARTS.find(part=>part.id===partId)
      if(definition)applyLDrawGearMechanics(definition)
    }else syncLDrawGearMechanics()
  })
}

export const BrickLabLDrawGearMechanics=Object.freeze({
  version:LDRAW_GEAR_MECHANICS_PATCH_VERSION,
  classify:gearMechanicsForLDrawDefinition,
  apply:applyLDrawGearMechanics,
  sync:syncLDrawGearMechanics,
})

globalThis.BrickLabLDrawGearMechanics=BrickLabLDrawGearMechanics
