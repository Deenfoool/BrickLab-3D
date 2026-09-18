import { solveLinearSystem } from './linear-system.js'
import { linearEquation } from '../transmission/equations.js'

export const NONLINEAR_RELATION_SOLVER_VERSION='mechanics-nonlinear-relations-0.1.0'
const DEFAULT_TOLERANCE=1e-8
const MAX_ITERATIONS=32

function eqForValue(id,variable,value,metadata){
  return linearEquation(
    id,
    { [String(variable)]:1 },
    Number(value),
    metadata,
  )
}

function solveWithDefaults(equations,defaults,tolerance){
  return solveLinearSystem(equations,{defaults,tolerance})
}

function variableDetermined(equations,result,variable,tolerance){
  if(!result.valid||!Object.hasOwn(result.values,variable))return false
  if(!result.freeVariables.length)return true

  const baseline=Number(result.values[variable])
  for(const free of result.freeVariables){
    const defaults=Object.fromEntries(result.freeVariables.map(name=>[name,0]))
    defaults[free]=1
    const probe=solveWithDefaults(equations,defaults,tolerance)
    if(!probe.valid)return false
    if(Math.abs(Number(probe.values[variable])-baseline)>tolerance*10)return false
  }
  return true
}

function relationResidual(relation,inputValue,outputValue){
  const expected=Number(relation.forward(inputValue))
  return Number(outputValue)-expected
}

export function solveLinearWithNonlinearRelations({
  equations=[],
  relations=[],
  defaults={},
  tolerance=DEFAULT_TOLERANCE,
  maxIterations=MAX_ITERATIONS,
}={}){
  const eps=Math.max(DEFAULT_TOLERANCE,Math.abs(Number(tolerance)||0))
  const working=[...(equations||[])]
  const derived=[]
  const diagnostics=[]
  const conflicts=[]
  let iteration=0

  for(;iteration<Math.max(1,Math.floor(maxIterations));iteration+=1){
    const result=solveLinearSystem(working,{defaults,tolerance:eps})
    if(!result.valid){
      return Object.freeze({
        ...result,
        version:NONLINEAR_RELATION_SOLVER_VERSION,
        status:'conflict',
        nonlinearConflicts:Object.freeze(conflicts),
        nonlinearDiagnostics:Object.freeze(diagnostics),
        derivedEquations:Object.freeze(derived),
        iterations:iteration+1,
      })
    }

    let changed=false

    for(const relation of relations||[]){
      const input=relation?.inputVariable
      const output=relation?.outputVariable
      if(!input||!output||typeof relation.forward!=='function'||typeof relation.inverse!=='function'){
        diagnostics.push(Object.freeze({
          relationId:relation?.id??null,
          status:'unsupported-relation-contract',
        }))
        continue
      }

      const inputKnown=variableDetermined(working,result,input,eps)
      const outputKnown=variableDetermined(working,result,output,eps)
      const inputValue=Number(result.values[input]??0)
      const outputValue=Number(result.values[output]??0)

      if(inputKnown&&outputKnown){
        const residual=relationResidual(relation,inputValue,outputValue)
        diagnostics.push(Object.freeze({
          relationId:relation.id,
          status:Math.abs(residual)<=eps*10?'satisfied':'conflict',
          inputKnown:true,
          outputKnown:true,
          residual,
        }))
        if(Math.abs(residual)>eps*10){
          conflicts.push(Object.freeze({
            reason:'nonlinear-relation-conflict',
            relationId:relation.id,
            inputVariable:input,
            outputVariable:output,
            inputValue,
            outputValue,
            expectedOutput:Number(relation.forward(inputValue)),
            residual,
          }))
        }
        continue
      }

      if(inputKnown&&!outputKnown){
        const value=Number(relation.forward(inputValue))
        if(!Number.isFinite(value)){
          conflicts.push(Object.freeze({
            reason:'nonlinear-forward-nonfinite',
            relationId:relation.id,
            inputValue,
          }))
          continue
        }
        const equation=eqForValue(
          `nonlinear:${relation.id}:forward`,
          output,
          value,
          {kind:'nonlinear-derived',relationId:relation.id,direction:'forward'},
        )
        if(!working.some(item=>item.id===equation.id)){
          working.push(equation)
          derived.push(equation)
          changed=true
        }
        diagnostics.push(Object.freeze({
          relationId:relation.id,
          status:'derived-forward',
          inputKnown:true,
          outputKnown:false,
          value,
        }))
        continue
      }

      if(outputKnown&&!inputKnown){
        const value=Number(relation.inverse(outputValue))
        if(!Number.isFinite(value)){
          conflicts.push(Object.freeze({
            reason:'nonlinear-inverse-nonfinite',
            relationId:relation.id,
            outputValue,
          }))
          continue
        }
        const equation=eqForValue(
          `nonlinear:${relation.id}:inverse`,
          input,
          value,
          {kind:'nonlinear-derived',relationId:relation.id,direction:'inverse'},
        )
        if(!working.some(item=>item.id===equation.id)){
          working.push(equation)
          derived.push(equation)
          changed=true
        }
        diagnostics.push(Object.freeze({
          relationId:relation.id,
          status:'derived-inverse',
          inputKnown:false,
          outputKnown:true,
          value,
        }))
        continue
      }

      diagnostics.push(Object.freeze({
        relationId:relation.id,
        status:'underdetermined',
        inputKnown:false,
        outputKnown:false,
      }))
    }

    if(conflicts.length){
      return Object.freeze({
        ...result,
        valid:false,
        status:'conflict',
        version:NONLINEAR_RELATION_SOLVER_VERSION,
        conflicts:Object.freeze([...(result.conflicts||[]),...conflicts]),
        nonlinearConflicts:Object.freeze(conflicts),
        nonlinearDiagnostics:Object.freeze(diagnostics),
        derivedEquations:Object.freeze(derived),
        iterations:iteration+1,
      })
    }

    if(!changed){
      return Object.freeze({
        ...result,
        version:NONLINEAR_RELATION_SOLVER_VERSION,
        status:result.freeVariables.length?'underdetermined':'solved',
        nonlinearConflicts:Object.freeze([]),
        nonlinearDiagnostics:Object.freeze(diagnostics),
        derivedEquations:Object.freeze(derived),
        iterations:iteration+1,
      })
    }
  }

  const finalResult=solveLinearSystem(working,{defaults,tolerance:eps})
  return Object.freeze({
    ...finalResult,
    version:NONLINEAR_RELATION_SOLVER_VERSION,
    status:'iteration-limit',
    nonlinearConflicts:Object.freeze(conflicts),
    nonlinearDiagnostics:Object.freeze(diagnostics),
    derivedEquations:Object.freeze(derived),
    iterations:iteration,
  })
}
