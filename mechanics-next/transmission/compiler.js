export const TRANSMISSION_COMPILER_VERSION='mechanics-transmission-compiler-0.1.0'

export class TransmissionCompiler{
  #solver
  #graph
  #equationIds=new Set()
  #edgeIds=new Set()
  #discovery=null
  #revision=0

  constructor({solver,graph}={}){
    if(!solver?.addEquation||!solver?.removeEquation)throw new TypeError('Transmission compiler requires kinematic solver')
    if(!graph?.addTransmission||!graph?.removeEdge)throw new TypeError('Transmission compiler requires assembly graph')
    this.#solver=solver
    this.#graph=graph
  }

  get revision(){return this.#revision}
  get discovery(){return this.#discovery}

  clear(){
    for(const id of this.#equationIds)this.#solver.removeEquation(id)
    for(const id of this.#edgeIds)this.#graph.removeEdge(id)
    this.#equationIds.clear()
    this.#edgeIds.clear()
    this.#discovery=null
    this.#revision+=1
  }

  sync(discovery){
    if(!discovery?.equations||!discovery?.transmissions)throw new TypeError('Transmission discovery result required')
    this.clear()

    for(const equation of discovery.equations){
      this.#solver.addEquation(equation)
      this.#equationIds.add(equation.id)
    }
    for(const transmission of discovery.transmissions){
      this.#graph.addTransmission(transmission)
      this.#edgeIds.add(transmission.id)
    }
    this.#discovery=discovery
    this.#revision+=1
    return this.snapshot()
  }

  solve({balancedDifferentials=false,...options}={}){
    const temporary=balancedDifferentials
      ?this.#discovery?.balancedDifferentialClosures||[]
      :[]
    return temporary.length
      ?this.#solver.solveWithTemporaryEquations(temporary,options)
      :this.#solver.solve(options)
  }

  snapshot(){
    return Object.freeze({
      version:TRANSMISSION_COMPILER_VERSION,
      revision:this.#revision,
      equations:Object.freeze([...this.#equationIds]),
      transmissions:Object.freeze([...this.#edgeIds]),
      balancedDifferentialClosures:this.#discovery?.balancedDifferentialClosures?.length||0,
      diagnostics:this.#discovery?.diagnostics??null,
    })
  }
}

export function createTransmissionCompiler(options){
  return new TransmissionCompiler(options)
}
