import * as THREE from 'three'
import { ENGINE_PISTON_FIXTURE_GROUP_V4 } from '../connector-discovery/engine-piston-fixtures-v4.js?v=connector-engine-continuous-rim-20260917-v2'

export const ENGINE_CAM_TRACK_VERSION_V4='engine-cam-track-v4.1.0'
const TRACK_ROLE='technic-engine-crank-rim-track'
const FOLLOWER_ROLE='technic-engine-piston-follower'

const role=connector=>connector?.discovery?.role||null

export function continuousCircularTrackV4(connector){
  return Boolean(
    connector?.group===ENGINE_PISTON_FIXTURE_GROUP_V4 &&
    role(connector)===TRACK_ROLE &&
    connector?.path?.kind==='circle' &&
    connector?.path?.continuous===true &&
    Number(connector?.path?.radiusLdu)>0
  )
}

export function engineCamTrackPairV4(a,b){
  if(!a||!b||a.group!==ENGINE_PISTON_FIXTURE_GROUP_V4||b.group!==ENGINE_PISTON_FIXTURE_GROUP_V4)return null
  if(continuousCircularTrackV4(a)&&role(b)===FOLLOWER_ROLE)return{track:a,follower:b,trackSide:'a',followerSide:'b'}
  if(continuousCircularTrackV4(b)&&role(a)===FOLLOWER_ROLE)return{track:b,follower:a,trackSide:'b',followerSide:'a'}
  return null
}

export function circularTrackRadiusStudV4(track){
  const radiusLdu=Number(track?.path?.radiusLdu)
  return Number.isFinite(radiusLdu)&&radiusLdu>0?radiusLdu/20:null
}

export function projectCircularTrackPointV4(trackFrame,point,{fallbackDirection=null,radiusStud=null}={}){
  const radius=Number.isFinite(radiusStud)?radiusStud:null
  if(!trackFrame?.position?.isVector3||!trackFrame?.axis?.isVector3||!point?.isVector3||!(radius>0)){
    return{valid:false,reason:'invalid-track-frame'}
  }
  const normal=trackFrame.axis.clone().normalize()
  const delta=point.clone().sub(trackFrame.position)
  const normalOffsetStud=delta.dot(normal)
  const planar=delta.clone().addScaledVector(normal,-normalOffsetStud)
  let radial=planar.clone()
  if(radial.lengthSq()<1e-12){
    radial=(fallbackDirection?.isVector3?fallbackDirection:trackFrame.reference)?.clone?.()??new THREE.Vector3(1,0,0)
    radial.addScaledVector(normal,-radial.dot(normal))
  }
  if(radial.lengthSq()<1e-12)radial=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x)
  if(radial.lengthSq()<1e-12)radial=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y)
  radial.normalize()
  const radialDistanceStud=planar.length()
  const nearest=trackFrame.position.clone().addScaledVector(radial,radius)
  const radialErrorStud=radialDistanceStud-radius
  const captureErrorStud=Math.hypot(radialErrorStud,normalOffsetStud)
  return{
    valid:true,
    nearest,
    radial,
    normal,
    radiusStud:radius,
    radialDistanceStud,
    radialErrorStud,
    normalOffsetStud,
    captureErrorStud,
  }
}

export const ENGINE_CAM_TRACK_ROLES_V4=Object.freeze({track:TRACK_ROLE,follower:FOLLOWER_ROLE})
