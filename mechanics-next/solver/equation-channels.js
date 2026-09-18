import { linearEquation } from '../transmission/equations.js'

export function remapMechanicalVariableChannel(variable,fromChannel,toChannel){
  const suffix=`::${fromChannel}`
  return String(variable).endsWith(suffix)
    ?`${String(variable).slice(0,-suffix.length)}::${toChannel}`
    :String(variable)
}

export function remapEquationChannel(equation,fromChannel='omega',toChannel='theta',{
  idSuffix=null,
  metadata=null,
}={}){
  if(!equation?.id)throw new TypeError('Equation is required')
  const coefficients={}
  for(const[variable,coefficient]of Object.entries(equation.coefficients||{})){
    coefficients[remapMechanicalVariableChannel(variable,fromChannel,toChannel)]=coefficient
  }
  return linearEquation(
    idSuffix?`${equation.id}:${idSuffix}`:equation.id,
    coefficients,
    equation.constant,
    {
      ...(equation.metadata||{}),
      ...(metadata||{}),
      remappedFrom:fromChannel,
      remappedTo:toChannel,
    },
  )
}

export function remapEquationSetChannel(equations,fromChannel='omega',toChannel='theta',options={}){
  return Object.freeze((equations||[]).map(equation=>
    remapEquationChannel(equation,fromChannel,toChannel,options)))
}
