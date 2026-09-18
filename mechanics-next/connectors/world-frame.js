import {
  add3,
  matrix3Multiply,
  matrix3Vector,
  norm3,
  quatFromRotationMatrix,
  rotate3,
  rotationMatrixFromQuaternion,
} from '../math/rigid.js'

export function endpointFrameInBrickLab(endpoint,{visualOffsetStud=[0,0,0]}={}){
  const frame=endpoint?.frame||{}
  if(Array.isArray(frame.positionStud)&&Array.isArray(frame.orientationBrickLab)){
    const orientation=[...frame.orientationBrickLab]
    return Object.freeze({
      position:Object.freeze([...frame.positionStud]),
      orientation:Object.freeze(orientation),
      axis:Object.freeze(norm3(matrix3Vector(orientation,[0,-1,0]))),
      reference:Object.freeze(norm3(matrix3Vector(orientation,[1,0,0]),[1,0,0])),
      source:'bricklab-frame',
    })
  }
  if(!Array.isArray(frame.positionLdu)||!Array.isArray(frame.orientation)){
    throw new TypeError('Endpoint lacks a usable local frame')
  }
  const[x,y,z]=frame.positionLdu
  const o=frame.orientation
  const orientation=[o[0],o[1],o[2],-o[3],-o[4],-o[5],-o[6],-o[7],-o[8]]
  return Object.freeze({
    position:Object.freeze([
      x/20+(visualOffsetStud[0]||0),
      -y/20+(visualOffsetStud[1]||0),
      -z/20+(visualOffsetStud[2]||0),
    ]),
    orientation:Object.freeze(orientation),
    axis:Object.freeze(norm3(matrix3Vector(orientation,[0,-1,0]))),
    reference:Object.freeze(norm3(matrix3Vector(orientation,[1,0,0]),[1,0,0])),
    source:'ldraw-frame',
  })
}

export function worldConnectorFrame(objectPose,endpoint,options={}){
  if(!objectPose?.position||!objectPose?.quaternion)throw new TypeError('Object pose is required')
  const local=endpointFrameInBrickLab(endpoint,options)
  const position=add3(objectPose.position,rotate3(objectPose.quaternion,local.position))
  const axis=norm3(rotate3(objectPose.quaternion,local.axis))
  const reference=norm3(rotate3(objectPose.quaternion,local.reference),[1,0,0])
  const objectRotation=rotationMatrixFromQuaternion(objectPose.quaternion)
  const orientation=matrix3Multiply(objectRotation,local.orientation)
  return Object.freeze({
    position:Object.freeze(position),
    axis:Object.freeze(axis),
    reference:Object.freeze(reference),
    orientation:Object.freeze(orientation),
    quaternion:Object.freeze(quatFromRotationMatrix(orientation)),
    local,
  })
}
