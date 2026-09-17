import * as THREE from 'three'
import {
  ENGINE_CRANK_RIM_OFFSET_LDU_V4,
  ENGINE_PISTON_FIXTURE_GROUP_V4,
} from '../connector-discovery/engine-piston-fixtures-v4.js?v=connector-engine-4368-4369-20260917-v1'

export const ENGINE_CAM_KINEMATICS_VERSION='engine-cam-kinematics-v1.0.0'
export const ENGINE_CAM_ECCENTRICITY_STUD=ENGINE_CRANK_RIM_OFFSET_LDU_V4/20

const CRANK_ROLE='technic-engine-crank-rim-site'
const FOLLOWER_ROLE='technic-engine-piston-follower'

function role(connector){return connector?.discovery?.role||null}

export function engineCamPairV1(a,b){
  if(!a||!b)return null
  if(a.group!==ENGINE_PISTON_FIXTURE_GROUP_V4||b.group!==ENGINE_PISTON_FIXTURE_GROUP_V4)return null
  if(role(a)===CRANK_ROLE&&role(b)===FOLLOWER_ROLE)return{crank:a,follower:b,crankSide:'a'}
  if(role(b)===CRANK_ROLE&&role(a)===FOLLOWER_ROLE)return{crank:b,follower:a,crankSide:'b'}
  return null
}

function worldDirectionFromLocal(matrix,vector){
  const origin=new THREE.Vector3().setFromMatrixPosition(matrix)
  return vector.clone().applyMatrix4(matrix).sub(origin)
}

export function engineCamFollowerDisplacementV1({diskBaselineMatrix,diskCurrentMatrix,pistonBaselineMatrix}={}){
  if(!diskBaselineMatrix?.isMatrix4||!diskCurrentMatrix?.isMatrix4||!pistonBaselineMatrix?.isMatrix4){
    return{valid:false,displacementStud:0,slideAxisWorld:null,reason:'missing-matrix'}
  }

  // LDraw Y points down in BrickLab conversion, so the documented -4 LDU crank
  // centre offset becomes +0.2 stud in the disk's local BrickLab Y direction.
  const eccentricLocal=new THREE.Vector3(0,ENGINE_CAM_ECCENTRICITY_STUD,0)
  const baselineEccentric=worldDirectionFromLocal(diskBaselineMatrix,eccentricLocal)
  const currentEccentric=worldDirectionFromLocal(diskCurrentMatrix,eccentricLocal)
  const slideAxisWorld=worldDirectionFromLocal(pistonBaselineMatrix,new THREE.Vector3(1,0,0)).normalize()
  if(slideAxisWorld.lengthSq()<1e-10)return{valid:false,displacementStud:0,slideAxisWorld:null,reason:'invalid-piston-axis'}

  const displacementStud=currentEccentric.sub(baselineEccentric).dot(slideAxisWorld)
  return{
    valid:Number.isFinite(displacementStud),
    displacementStud:Number.isFinite(displacementStud)?displacementStud:0,
    slideAxisWorld,
    eccentricityStud:ENGINE_CAM_ECCENTRICITY_STUD,
    strokeStud:ENGINE_CAM_ECCENTRICITY_STUD*2,
  }
}
