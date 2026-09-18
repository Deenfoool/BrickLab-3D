import { mechanicalVariable } from '../core/model.js'
import { solveLinearSystem } from '../solver/linear-system.js'
import { remapEquationSetChannel } from '../solver/equation-channels.js'
import { driverEquation } from '../transmission/equations.js'

export const DRAG_DRIVER_VERSION='mechanics-drag-driver-0.1.0'
const MIN_RADIUS_PX=6
const DEFAULT_TANGENT_SCALE=.012

function point(value){
  if(Array.isArray(value)&&value.length>=2)return[Number(value[0]),Number(value[1])]
  if(value&&Number.isFinite(Number(value.x))&&Number.isFinite(Number(value.y)))return[Number(value.x),Number(value.y)]
  throw new TypeError('screen point requires x/y')
}
function wrapAngle(value){
  let angle=Number(value)||0
  while(angle>Math.PI)angle-=Math.PI*2
  while(angle<-Math.PI)angle+=Math.PI*2
  return angle
}

export function screenDragAngle(start,current,pivot,{
  axisScreenSign=1,
  tangentScale=DEFAULT_TANGENT_SCALE,
  minimumRadiusPx=MIN_RADIUS_PX,
  fallbackDirection=null,
}={}){
  const s=point(start),c=point(current),p=point(pivot)
  const a=[s[0]-p[0],s[1]-p[1]]
  const b=[c[0]-p[0],c[1]-p[1]]
  const ra=Math.hypot(...a),rb=Math.hypot(...b)
  const sign=Number(axisScreenSign)<0?-1:1

  if(ra>=minimumRadiusPx&&rb>=minimumRadiusPx){
    const cross=a[0]*b[1]-a[1]*b[0]
    const dot=a[0]*b[0]+a[1]*b[1]
    return Object.freeze({
      angleRad:wrapAngle(Math.atan2(cross,dot))*sign,
      mode:'angular',
      radiusPx:(ra+rb)/2,
      axisScreenSign:sign,
    })
  }

  let tangent
  if(Array.isArray(fallbackDirection)&&fallbackDirection.length>=2){
    const n=Math.hypot(Number(fallbackDirection[0]),Number(fallbackDirection[1]))
    tangent=n>1e-9
      ?[Number(fallbackDirection[0])/n,Number(fallbackDirection[1])/n]
      :[1,0]
  }else if(ra>=1e-6){
    tangent=[-a[1]/ra,a[0]/ra]
  }else{
    tangent=[1,0]
  }
  const drag=[c[0]-s[0],c[1]-s[1]]
  const projected=drag[0]*tangent[0]+drag[1]*tangent[1]
  return Object.freeze({
    angleRad:projected*Number(tangentScale||DEFAULT_TANGENT_SCALE)*sign,
    mode:'tangent-fallback',
    radiusPx:Math.max(ra,rb),
    axisScreenSign:sign,
  })
}

function displacementEquations(discovery,{balancedDifferentials=false}={}){
  const base=remapEquationSetChannel(
    discovery?.equations||[],
    'omega',
    'theta',
    {idSuffix:'theta',metadata:{solveDomain:'interaction-displacement'}},
  )
  if(!balancedDifferentials)return base
  const closures=remapEquationSetChannel(
    discovery?.balancedDifferentialClosures||[],
    'omega',
    'theta',
    {idSuffix:'theta-preview',metadata:{solveDomain:'interaction-preview'}},
  )
  return Object.freeze([...base,...closures])
}

export function solveRotationalDrag({
  bodyId,
  angleRad,
  discovery,
  balancedDifferentials=true,
  defaults={},
  tolerance,
}={}){
  if(!bodyId)throw new TypeError('rotational drag requires bodyId')
  if(!Number.isFinite(Number(angleRad)))throw new TypeError('rotational drag requires finite angleRad')

  const equations=[
    ...displacementEquations(discovery,{balancedDifferentials}),
    driverEquation({
      id:`drag-theta:${bodyId}`,
      bodyId,
      value:Number(angleRad),
      channel:'theta',
      source:'mouse-drag',
    }),
  ]

  const result=solveLinearSystem(equations,{defaults,tolerance})
  return Object.freeze({
    ...result,
    version:DRAG_DRIVER_VERSION,
    bodyId:String(bodyId),
    requestedAngleRad:Number(angleRad),
    balancedDifferentials:Boolean(balancedDifferentials),
    status:!result.valid
      ?'conflict'
      :result.freeVariables.length
        ?'underdetermined'
        :'solved',
    drivenVariable:mechanicalVariable(bodyId,'theta'),
    equationCount:equations.length,
  })
}

export function solveScreenRotationalDrag({
  bodyId,
  start,
  current,
  pivot,
  discovery,
  balancedDifferentials=true,
  axisScreenSign=1,
  defaults={},
  tolerance,
  tangentScale,
  minimumRadiusPx,
  fallbackDirection,
}={}){
  const drag=screenDragAngle(start,current,pivot,{
    axisScreenSign,
    tangentScale,
    minimumRadiusPx,
    fallbackDirection,
  })
  const solution=solveRotationalDrag({
    bodyId,
    angleRad:drag.angleRad,
    discovery,
    balancedDifferentials,
    defaults,
    tolerance,
  })
  return Object.freeze({drag,solution})
}
