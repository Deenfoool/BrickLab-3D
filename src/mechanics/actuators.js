// LDraw 43097/61927 f1/f2: the piston assembly is at Z=170/270 LDU.
// 26 input revolutions per full stroke is an engineering approximation, not a measured Type 2 calibration.
const large={stroke:100,turns:26,axis:[0,0,1],inputPort:'shadow-cfce509d66af'}
export const linearActuators=Object.freeze(Object.fromEntries(['43097','61927'].flatMap(id=>[1,2].map(n=>[id+'-f'+n,Object.freeze({...large,initial:n===1?0:100})]))))
export const actuatorMounts=new Set(['61904','61905'])
export const isRodPort=(design,port)=>Boolean(linearActuators[design]&&port?.start?.[2]>=170&&port.gender==='F')
export function actuatorTravel(design,angle){
 const spec=linearActuators[design]
 if(!spec||!Number.isFinite(angle))return null
 const displacement=Math.max(-spec.initial,Math.min(spec.stroke-spec.initial,angle*spec.stroke/(spec.turns*2*Math.PI)))
 return {displacement,extension:spec.initial+displacement,inputAngle:angle,atLimit:Math.abs(displacement-angle*spec.stroke/(spec.turns*2*Math.PI))>1e-8}
}
