import * as THREE from 'three'
import { findPart } from '../parts.js'
import { gearMetrics } from '../parts5/part-geometry-metrics-v1.js'

export const HERO_PART_IDS = Object.freeze(['beam-9','beam-5','axle-7','half-bush','bush','pin','gear-12','gear-20','gear-36','axle-coupler'])
export const HERO_LAYOUT = Object.freeze({
  // Integer shaft centres follow from the same module as the production gears.
  centres: [-gearMetrics(12).pitchRadius-gearMetrics(20).pitchRadius, 0, gearMetrics(12).pitchRadius+gearMetrics(36).pitchRadius],
  bearingPlanes: [-1.5, 1.5], gearPlanes: [2.2, 0], reduction: 5,
})
const Z = new THREE.Vector3(0,0,1)
const palette = { frame:0x246e7c, hardware:0x343b43, collars:0xaab4b8, input:0xe9ac42, output:0xe2e8e7 }

// Position by actual connector centre/axis, never by a render bounding box.
function place(parent, makePart, id, color, portId, point, axis=Z, twist=0) {
  const definition=findPart(id), port=definition?.connectors.find(c=>c.id===portId)
  if(!port) throw new Error(`Hero connector missing: ${id}/${portId}`)
  const part=makePart(id,color)
  if(!part) throw new Error(`Hero part unavailable: ${id}`)
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...port.axis).normalize(),axis)
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,twist))
  part.quaternion.copy(q)
  part.position.copy(new THREE.Vector3(...point).sub(new THREE.Vector3(...port.position).applyQuaternion(q)))
  part.userData.heroPort=portId
  parent.add(part)
  return part
}
function crank() {
  // Purpose-built keyed crank: one connected shell, a genuine cross bore and grip bore.
  const shape=new THREE.Shape()
  shape.moveTo(0,-.36);shape.lineTo(1.6,-.29);shape.absarc(1.6,0,.29,-Math.PI/2,Math.PI/2,false)
  shape.lineTo(0,.36);shape.absarc(0,0,.36,Math.PI/2,Math.PI*1.5,false)
  const bore=new THREE.Path(),r=.185,a=.077
  const points=[[-a,r],[a,r],[a,a],[r,a],[r,-a],[a,-a],[a,-r],[-a,-r],[-a,-a],[-r,-a],[-r,a],[-a,a]]
  bore.moveTo(...points[0]);for(const p of points.slice(1))bore.lineTo(...p);bore.closePath();shape.holes.push(bore)
  const gripHole=new THREE.Path();gripHole.absarc(1.6,0,.13,0,Math.PI*2,true);shape.holes.push(gripHole)
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.25,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,curveSegments:24})
  geometry.translate(0,0,-.125)
  const arm=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:palette.input,roughness:.35,metalness:.015}))
  const group=new THREE.Group();group.name='keyed-hand-crank';group.add(arm)
  const spindle=new THREE.Mesh(new THREE.CylinderGeometry(.125,.125,.78,20),new THREE.MeshStandardMaterial({color:0x8b969e,metalness:.75,roughness:.27}))
  spindle.rotation.x=Math.PI/2;spindle.position.set(1.6,0,.29);group.add(spindle)
  const profile=[new THREE.Vector2(0,0),new THREE.Vector2(.19,0),new THREE.Vector2(.235,.07),new THREE.Vector2(.235,.47),new THREE.Vector2(.19,.54),new THREE.Vector2(0,.54)]
  const grip=new THREE.Mesh(new THREE.LatheGeometry(profile,24),new THREE.MeshStandardMaterial({color:palette.hardware,roughness:.48}))
  grip.rotation.x=Math.PI/2;grip.position.set(1.6,0,.2);group.add(grip)
  group.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true}})
  return group
}
export function buildHeroReducer(root, makePart) {
  const [x0,x1,x2]=HERO_LAYOUT.centres
  const moving=[], shafts=[], gearRecords=[]
  // A closed ladder chassis: two bearing rails, four uprights and two transverse axle ties.
  for(const z of HERO_LAYOUT.bearingPlanes) {
    place(root,makePart,'beam-9',palette.frame,'hole-4',[0,0,z])
    for(const x of [-4,4]) {
      place(root,makePart,'beam-5',palette.frame,'hole-4',[x,0,z+(z>0?.8:-.8)],Z,Math.PI/2)
      for(const y of [0]) place(root,makePart,'pin',palette.hardware,'pin-1',[x,y,z+(z>0?.4:-.4)])
    }
    place(root,makePart,'beam-9',palette.frame,'hole-4',[0,-4,z])
  }
  for(const x of [-4,4]) {
    // Through-axle cross ties pass through all four aligned lower bores.
    place(root,makePart,'axle-7',palette.hardware,'axle-3',[x,-4,0])
    for(const z of [-2.94,2.94]) place(root,makePart,'bush',palette.collars,'axle-hole',[x,-4,z])
  }
  // Every rotating piece belongs to one shaft pivot. Bearings remain stationary.
  for(const [i,x] of [x0,x1,x2].entries()) {
    const pivot=new THREE.Group();pivot.name=['input-shaft','compound-shaft','output-shaft'][i];pivot.position.set(x,0,0);root.add(pivot);shafts.push(pivot)
    place(pivot,makePart,'axle-7',palette.hardware,'axle-3',[0,0,0])
    pivot.rotation.z=[0,Math.PI/20,Math.PI/90][i]
    for(const z of [-2.05,i===2?2.05:2.65]) place(pivot,makePart,'half-bush',palette.collars,'axle-hole',[0,0,z])
    moving.push({object:pivot,axis:'z',speed:[.6,-.36,.12][i]})
  }
  function gear(shaft,teeth,z,color,phase) {
    // Production spur gear native outline is in X/Z, with its normal along -Y.
    const part=place(shafts[shaft],makePart,`gear-${teeth}`,color,'axle-hole',[0,0,z],Z,phase)
    gearRecords.push({part,shaft,teeth,z,phase});return part
  }
  // Teeth face spaces at the contact line: phase sum nA*thetaA+nB*thetaB=pi.
  gear(0,12,HERO_LAYOUT.gearPlanes[0],palette.input,0)
  gear(1,20,HERO_LAYOUT.gearPlanes[0],palette.output,0)
  gear(1,12,HERO_LAYOUT.gearPlanes[1],palette.input,0)
  gear(2,36,HERO_LAYOUT.gearPlanes[1],palette.output,0)
  const handle=crank();handle.position.z=3.14;shafts[0].add(handle)
  place(shafts[0],makePart,'half-bush',palette.collars,'axle-hole',[0,0,3.42])
  place(shafts[2],makePart,'axle-coupler',palette.hardware,'hole-left',[0,0,2.2])
  root.userData.hero={name:'Workbench reducer',ratio:'5:1',shafts:3,gearPairs:[[12,20],[12,36]],connectorPlacement:true}
  return {moving,shafts,gears:gearRecords}
}
