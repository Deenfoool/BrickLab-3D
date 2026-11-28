import { validActuatorExtension, validActuatorPhase } from '../mechanics/actuators.js'
// Shared public preview contract; no editor or physics dependencies.
export const previewLimits=Object.freeze({parts:20000,designs:2000,thumbnailParts:600,thumbnailDesigns:120})
export function isLargePreview(doc){
 return doc.parts.length>previewLimits.thumbnailParts||new Set(doc.parts.map(p=>p.design)).size>previewLimits.thumbnailDesigns
}
const valid=(v,n,max)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=max)
export function sanitizePreview(doc,{strict=false}={}){
 if(!Array.isArray(doc?.parts)||!doc.parts.length||doc.parts.length>previewLimits.parts)return null
 const parts=[],designs=new Set()
 for(const p of doc.parts){
  if(!p||!['string','number'].includes(typeof p.design)||!/^[a-zA-Z0-9_-]{1,40}$/.test(String(p.design))){if(strict)return null;continue}
  const design=String(p.design)
  designs.add(design);if(designs.size>previewLimits.designs)return null
  parts.push({id:'preview-'+parts.length,design,...(valid(p.position,3,1000000)?{position:p.position}:{}),...(valid(p.rotation,4,2)?{rotation:p.rotation}:{}),...(typeof p.color==='string'&&/^#[0-9a-f]{6}$/i.test(p.color)?{color:p.color}:{}),mirrored:p.mirrored===true,...(validActuatorExtension(design,p.actuatorExtension)&&{actuatorExtension:p.actuatorExtension}),...(validActuatorPhase(design,p.actuatorInputPhase)&&{actuatorInputPhase:p.actuatorInputPhase})})
 }
 if(!parts.length)return null
 return {format:'bricklab-3d',version:1,name:String(doc.name??'Model').slice(0,120),parts,connections:[],gears:[]}
}
// Group repeated geometry once per design, preserving independent part colors and handedness.
export function groupPreviewParts(parts){
 const groups=new Map()
 for(const [index,part] of parts.entries()){
  let list=groups.get(part.design)
  if(!list){list=[];groups.set(part.design,list)}
  list.push({part,index})
 }
 return [...groups].sort((a,b)=>b[1].length-a[1].length)
}
export function previewPose(part,index,defaultY=0){
 const position=part.position??[index*45,defaultY,0]
 const rotation=part.rotation
 const norm=rotation?Math.hypot(...rotation):0
 return {position,rotation:norm?rotation.map(n=>n/norm):[1,0,0,0]}
}
