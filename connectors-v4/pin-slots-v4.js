import { cylinderAxialWindowsV4 } from './axial-fit-v4.js'
import { classifyTechnicAxlePinInterfaceV4, classifyTechnicPinInterfaceV4, technicPinPairV4 } from './pin-semantics-v4.js'
import { axialSpanV4 } from './schema-v4.js'

export const PIN_SLOTS_VERSION_V4 = 'pin-slots-v4.1.0'
export const TECHNIC_MODULE_LDU_V4 = 20
const EPS = 1e-4

// LDCad describes a pin as one continuous axial profile. LEGO parts, however,
// settle on 1-module centres. Enumerating those centres lets the runtime retry a
// neighbouring free band instead of treating the whole long pin as occupied.
export function technicPinSlotOffsetsV4(moving, target) {
  const semantic = technicPinPairV4(moving, target)
  const male = moving?.gender === 'male' ? moving : target?.gender === 'male' ? target : null
  const female = moving?.gender === 'female' ? moving : target?.gender === 'female' ? target : null
  const hybrid = classifyTechnicAxlePinInterfaceV4(male)
  const femalePin = classifyTechnicPinInterfaceV4(female)?.role === 'technic-pin-hole'
  const femaleSections=female?.geometry?.sections ?? []
  const femaleAxle=femaleSections.length>0 && femaleSections.every(section=>section?.shape==='A')
  if (!semantic && !(hybrid && (femalePin || femaleAxle))) return []
  const fit = cylinderAxialWindowsV4(moving, target)
  if (!fit.valid) return []

  const [maleStart] = axialSpanV4(male)
  const sections=male?.geometry?.sections ?? []
  let cursor=maleStart
  const selected=[]
  for(const section of sections){
    const start=cursor,end=start+Math.max(0,Number(section?.lengthLdu)||0)
    cursor=end
    const shape=['L_','_L'].includes(section?.shape)?'R':section?.shape
    if(!hybrid || (femaleAxle?shape==='A':shape==='R')) selected.push([start,end])
  }
  const runs=[]
  for(const interval of selected){
    const last=runs.at(-1)
    if(last && Math.abs(last[1]-interval[0])<=EPS)last[1]=interval[1]
    else runs.push([...interval])
  }
  return runs.flatMap(([start,end])=>{
    const length=end-start
    const slotCount=Math.max(1,Math.round(length/TECHNIC_MODULE_LDU_V4))
    if(Math.abs(length-slotCount*TECHNIC_MODULE_LDU_V4)>1)return[]
    return Array.from({length:slotCount},(_,index)=>start+(index+0.5)*TECHNIC_MODULE_LDU_V4)
  })
    .map(offset => fit.movingIsMale ? -offset : offset)
    .filter(offset => fit.movingWindows.some(([start,end]) => offset >= start - EPS && offset <= end + EPS))
    .sort((a,b) => a-b)
}

export function nearestTechnicPinSlotOffsetsV4(moving, target, requestedOffsetLdu = 0) {
  const requested = Number.isFinite(requestedOffsetLdu) ? requestedOffsetLdu : 0
  return technicPinSlotOffsetsV4(moving, target)
    .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested) || a - b)
}
