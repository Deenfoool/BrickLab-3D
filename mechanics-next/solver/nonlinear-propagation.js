import { mechanicalVariable } from '../core/model.js'

export const NONLINEAR_PROPAGATION_VERSION='mechanics-nonlinear-propagation-0.1.0'
const EPS=1e-8

function thetaVariable(bodyId){return mechanicalVariable(bodyId,'theta')}

function relationBodies(relation){
  return [String(relation?.inputBody||''),String(relation?.outputBody||'')].filter(Boolean)
}

export function propagateNonlinearDisplacements({
  relations=[],
  known={},
  maxPasses=64,
  tolerance=EPS,
}={}){
  const values=new Map()
  const sources=new Map()
  const conflicts=[]
  const steps=[]

  for(const[bodyId,value]of Object.entries(known||{})){
    if(!Number.isFinite(Number(value)))continue
    values.set(String(bodyId),Number(value))
    sources.set(String(bodyId),'seed')
  }

  const setValue=(bodyId,value,source)=>{
    if(!Number.isFinite(Number(value))){
      conflicts.push(Object.freeze({
        bodyId:String(bodyId),
        reason:'non-finite-propagation',
        source,
      }))
      return false
    }
    const id=String(bodyId)
    if(values.has(id)){
      const existing=values.get(id)
      if(Math.abs(existing-Number(value))>tolerance){
        conflicts.push(Object.freeze({
          bodyId:id,
          reason:'nonlinear-value-conflict',
          existing,
          proposed:Number(value),
          existingSource:sources.get(id)??null,
          proposedSource:source,
        }))
      }
      return false
    }
    values.set(id,Number(value))
    sources.set(id,source)
    return true
  }

  const usable=(relations||[]).filter(relation=>
    relation?.bidirectional===true &&
    typeof relation.forward==='function' &&
    typeof relation.inverse==='function' &&
    relationBodies(relation).length===2)

  let changed=true
  let pass=0
  while(changed&&pass<maxPasses){
    changed=false
    pass+=1
    for(const relation of usable){
      const input=String(relation.inputBody)
      const output=String(relation.outputBody)
      const hasInput=values.has(input)
      const hasOutput=values.has(output)

      if(hasInput&&!hasOutput){
        const value=relation.forward(values.get(input))
        if(setValue(output,value,relation.id)){
          changed=true
          steps.push(Object.freeze({
            relationId:relation.id,
            direction:'forward',
            fromBody:input,
            toBody:output,
            value,
          }))
        }
      }else if(hasOutput&&!hasInput){
        const value=relation.inverse(values.get(output))
        if(setValue(input,value,relation.id)){
          changed=true
          steps.push(Object.freeze({
            relationId:relation.id,
            direction:'inverse',
            fromBody:output,
            toBody:input,
            value,
          }))
        }
      }else if(hasInput&&hasOutput){
        const expected=relation.forward(values.get(input))
        if(!Number.isFinite(expected)||Math.abs(expected-values.get(output))>tolerance){
          conflicts.push(Object.freeze({
            relationId:relation.id,
            reason:'nonlinear-relation-conflict',
            inputBody:input,
            outputBody:output,
            inputValue:values.get(input),
            outputValue:values.get(output),
            expectedOutput:expected,
          }))
        }
      }
    }
  }

  if(pass>=maxPasses&&changed){
    conflicts.push(Object.freeze({
      reason:'nonlinear-propagation-pass-limit',
      maxPasses,
    }))
  }

  const byBody=Object.freeze(Object.fromEntries(values))
  const byVariable=Object.freeze(Object.fromEntries(
    [...values].map(([bodyId,value])=>[thetaVariable(bodyId),value]),
  ))

  return Object.freeze({
    version:NONLINEAR_PROPAGATION_VERSION,
    valid:conflicts.length===0,
    values:byBody,
    variables:byVariable,
    steps:Object.freeze(steps),
    conflicts:Object.freeze(conflicts),
    passes:pass,
  })
}
