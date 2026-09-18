import * as THREE from 'three'

export const VIEW_PROJECTION_VERSION='mechanics-view-projection-0.1.0'
const EPS=1e-7

function rectValues(rect){
  const width=Number(rect?.width)
  const height=Number(rect?.height)
  if(!(width>0&&height>0))throw new TypeError('viewport rect requires positive width/height')
  return{
    left:Number(rect?.left)||0,
    top:Number(rect?.top)||0,
    width,
    height,
  }
}

export function projectWorldPoint(camera,worldPoint,rect){
  if(!camera?.isCamera)throw new TypeError('camera is required')
  const r=rectValues(rect)
  camera.updateMatrixWorld?.(true)
  const v=new THREE.Vector3(...worldPoint).project(camera)
  return Object.freeze({
    x:r.left+(v.x*.5+.5)*r.width,
    y:r.top+(-v.y*.5+.5)*r.height,
    ndcZ:v.z,
    visible:v.z>=-1&&v.z<=1&&v.x>=-1.2&&v.x<=1.2&&v.y>=-1.2&&v.y<=1.2,
  })
}

function perpendicularBasis(axis,camera,pivot){
  const a=new THREE.Vector3(...axis).normalize()
  const p=new THREE.Vector3(...pivot)
  const cameraPosition=new THREE.Vector3()
  camera.getWorldPosition?.(cameraPosition)
  const view=cameraPosition.sub(p).normalize()

  let radial=new THREE.Vector3().crossVectors(a,view)
  if(radial.lengthSq()<1e-8){
    const fallback=Math.abs(a.x)<.8
      ?new THREE.Vector3(1,0,0)
      :new THREE.Vector3(0,0,1)
    radial.crossVectors(a,fallback)
  }
  radial.normalize()
  const tangent=new THREE.Vector3().crossVectors(a,radial).normalize()
  return{radial,tangent}
}

export function rotationalDragProjection(camera,pivotWorld,axisWorld,rect,{
  probeStud=.35,
}={}){
  if(!camera?.isCamera)throw new TypeError('camera is required')
  const r=rectValues(rect)
  const pivot=[...pivotWorld]
  const axis=new THREE.Vector3(...axisWorld).normalize()
  const {radial,tangent}=perpendicularBasis(axisWorld,camera,pivotWorld)
  const p=new THREE.Vector3(...pivotWorld)
  const radialWorld=p.clone().addScaledVector(radial,probeStud)
  const tangentWorld=p.clone().addScaledVector(tangent,probeStud)

  const center=projectWorldPoint(camera,pivot,r)
  const radialScreen=projectWorldPoint(camera,radialWorld.toArray(),r)
  const tangentScreen=projectWorldPoint(camera,tangentWorld.toArray(),r)

  const rx=radialScreen.x-center.x
  const ry=radialScreen.y-center.y
  const tx=tangentScreen.x-center.x
  const ty=tangentScreen.y-center.y
  const radialLen=Math.hypot(rx,ry)
  const tangentLen=Math.hypot(tx,ty)

  let axisScreenSign=1
  let confidence='strong'
  if(radialLen>EPS&&tangentLen>EPS){
    const cross=rx*ty-ry*tx
    if(Math.abs(cross)>EPS)axisScreenSign=cross<0?-1:1
    else confidence='weak'
  }else{
    confidence='weak'
    const cameraPosition=new THREE.Vector3()
    camera.getWorldPosition?.(cameraPosition)
    const view=cameraPosition.sub(p).normalize()
    axisScreenSign=axis.dot(view)>=0?1:-1
  }

  const tangentDirection=tangentLen>EPS
    ?Object.freeze([tx/tangentLen,ty/tangentLen])
    :Object.freeze([1,0])

  return Object.freeze({
    version:VIEW_PROJECTION_VERSION,
    pivot:Object.freeze({x:center.x,y:center.y,visible:center.visible}),
    axisScreenSign,
    fallbackDirection:tangentDirection,
    confidence,
    radialProbePixels:radialLen,
    tangentProbePixels:tangentLen,
  })
}
