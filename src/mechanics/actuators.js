// LDraw 43097/61927 f1/f2: the piston assembly is at Z=170/270 LDU.
// 26 input revolutions per full stroke is an engineering approximation, not a measured Type 2 calibration.
const large={stroke:100,turns:26,axis:[0,0,1],inputPort:'shadow-cfce509d66af'}
export const linearActuators=Object.freeze(Object.assign(Object.create(null),Object.fromEntries(['43097','61927'].flatMap(id=>[1,2].map(n=>[id+'-f'+n,Object.freeze({...large,initial:n===1?0:100})])))))
export const actuatorMounts=new Set(['61904','61905'])
export const isRodPort=(design,port)=>Boolean(linearActuators[design]&&port?.start?.[2]>=170&&port.gender==='F')
export const validActuatorExtension=(design,value)=>typeof design==='string'&&!!linearActuators[design]&&Number.isFinite(value)&&value>=0&&value<=linearActuators[design].stroke
export const validActuatorPhase=(design,value)=>typeof design==='string'&&!!linearActuators[design]&&Number.isFinite(value)&&value>=0&&value<2*Math.PI
export function currentActuatorSpec(part){
 const spec=typeof part?.design==='string'?linearActuators[part.design]:null
 return spec&&{...spec,initial:validActuatorExtension(part.design,part.actuatorExtension)?part.actuatorExtension:spec.initial}
}
export function actuatorOffset(part){return (currentActuatorSpec(part)?.initial??0)-(linearActuators[part?.design]?.initial??0)}
export const actuatorPhase=part=>validActuatorPhase(part?.design,part?.actuatorInputPhase)?part.actuatorInputPhase:0
export function actuatorTravel(design,angle,initial){
 const spec=currentActuatorSpec({design,actuatorExtension:initial})
 if(!spec||!Number.isFinite(angle))return null
 const displacement=Math.max(-spec.initial,Math.min(spec.stroke-spec.initial,angle*spec.stroke/(spec.turns*2*Math.PI)))
 return {displacement,extension:spec.initial+displacement,inputAngle:angle,atLimit:Math.abs(displacement-angle*spec.stroke/(spec.turns*2*Math.PI))>1e-8}
}

export function commitActuatorPose(part){
 const {previewActuatorRod,previewActuatorInput,...record}=part
 const spec=currentActuatorSpec(part)
 if(!spec||!Number.isFinite(previewActuatorRod))return record
 const turn=2*Math.PI,phase=actuatorPhase(part)+(Number.isFinite(previewActuatorInput)?previewActuatorInput:0)
 return {...record,actuatorExtension:Math.max(0,Math.min(spec.stroke,spec.initial+previewActuatorRod)),actuatorInputPhase:((phase%turn)+turn)%turn}
}
