import { createLiveJointValidator } from './live-joint-validator.js'

export const SCENE_CONNECTION_REVALIDATOR_VERSION='mechanics-scene-connection-revalidator-0.1.0'

function eligibleConstraint(edge){
  const metadata=edge?.metadata||{}
  return Boolean(
    metadata.observedConnectionId&&
    metadata.instanceAId&&metadata.instanceBId&&
    metadata.endpointAId&&metadata.endpointBId
  )
}

export function revalidateSceneConnections({
  graph,
  records=[],
  releaseConstraint=()=>null,
}={}){
  const eligible=(graph?.edges?.('constraint')||[]).filter(eligibleConstraint)
  if(!eligible.length)return Object.freeze({
    version:SCENE_CONNECTION_REVALIDATOR_VERSION,
    checked:0,
    released:0,
    failures:Object.freeze([]),
  })

  const validator=createLiveJointValidator({graph,records})
  const failures=[]
  for(const edge of eligible){
    const result=validator.validateConstraint(edge.id)
    if(result.valid)continue
    const detail=releaseConstraint({
      jointId:`scene-revalidation:${edge.id}`,
      reason:result.reason??'scene-connection-invalid',
      constraintIds:[edge.id],
    })
    failures.push(Object.freeze({
      constraintId:edge.id,
      observedConnectionId:edge.metadata?.observedConnectionId??null,
      reason:result.reason??'scene-connection-invalid',
      validation:result,
      release:detail??null,
    }))
  }

  return Object.freeze({
    version:SCENE_CONNECTION_REVALIDATOR_VERSION,
    checked:eligible.length,
    released:failures.length,
    failures:Object.freeze(failures),
  })
}
