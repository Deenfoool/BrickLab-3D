import { axialSpanV4 } from './schema-v4.js'

export const AXLE_CONTACT_VERSION_V4='axle-contact-v4.1.0'
const RADIUS_EPS_LDU=.12
const EPS=1e-8

const rigidShape=section=>['L_','_L'].includes(section?.shape)?'R':section?.shape
const near=(a,b,eps=RADIUS_EPS_LDU)=>Number.isFinite(Number(a))&&Math.abs(Number(a)-b)<=eps

/**
 * Returns only the physical A6 axle material as continuous axial intervals.
 * Stops/shoulders/pin bands are deliberately excluded, so a 55013 axle exposes
 * its full 158 LDU A-profile but never treats the terminal R8 stop as axle rail.
 */
export function technicAxleContactIntervalsV4(connector){
  if(connector?.family!=='cylinder'||connector?.gender!=='male')return[]
  const sections=connector.geometry?.sections??[]
  if(!sections.length)return[]
  let cursor=axialSpanV4(connector)[0]
  const raw=[]
  for(const section of sections){
    const length=Math.max(0,Number(section?.lengthLdu)||0)
    const start=cursor,end=cursor+length
    cursor=end
    if(length>EPS&&rigidShape(section)==='A'&&near(section?.radiusLdu,6))raw.push([start,end])
  }
  const merged=[]
  for(const interval of raw){
    const last=merged.at(-1)
    if(last&&Math.abs(last[1]-interval[0])<=1e-6)last[1]=interval[1]
    else merged.push([...interval])
  }
  return merged
}

export function hasContinuousTechnicAxleContactV4(connector){
  return technicAxleContactIntervalsV4(connector).some(([a,b])=>b-a>EPS)
}

export function technicAxleContactReachStudV4(connector){
  const intervals=technicAxleContactIntervalsV4(connector)
  if(!intervals.length)return 0
  return Math.max(...intervals.flatMap(([a,b])=>[Math.abs(a),Math.abs(b)]))/20
}

function pointSegmentDistance(point,a,b){
  const ab=b.clone().sub(a)
  const lengthSq=ab.lengthSq()
  if(lengthSq<=EPS)return point.distanceTo(a)
  const t=Math.max(0,Math.min(1,point.clone().sub(a).dot(ab)/lengthSq))
  return point.distanceTo(a.addScaledVector(ab,t))
}

/**
 * World-space distance from a point (normally a receiver centre) to the nearest
 * usable place on the axle rail. This is the actual SNAP capture distance for an
 * axle: every position along every A6 interval is contactable, not just frame.position.
 */
export function technicAxleContactDistanceStudV4(connector,worldFrame,worldPoint){
  if(!worldFrame?.position?.isVector3||!worldFrame?.axis?.isVector3||!worldPoint?.isVector3)return null
  const intervals=technicAxleContactIntervalsV4(connector)
  if(!intervals.length)return null
  const axis=worldFrame.axis.clone().normalize()
  let best=Infinity
  for(const [startLdu,endLdu] of intervals){
    const a=worldFrame.position.clone().addScaledVector(axis,startLdu/20)
    const b=worldFrame.position.clone().addScaledVector(axis,endLdu/20)
    best=Math.min(best,pointSegmentDistance(worldPoint,a,b))
  }
  return Number.isFinite(best)?best:null
}

export function axlePairContactDistanceStudV4(source,target,sourceFrame,targetFrame,match=null){
  if(match?.family&&match.family!=='cylinder')return null
  if(source?.gender==='male'&&target?.gender==='female'){
    return technicAxleContactDistanceStudV4(source,sourceFrame,targetFrame?.position)
  }
  if(target?.gender==='male'&&source?.gender==='female'){
    return technicAxleContactDistanceStudV4(target,targetFrame,sourceFrame?.position)
  }
  return null
}
