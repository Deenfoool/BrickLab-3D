import { mechanicalVariable } from '../core/model.js'
import {
  differentialEquation,
  driverEquation,
  packagedDifferentialEquation,
  rackPinionEquation,
  rotationCouplingEquation,
  screwLinearEquation,
} from '../transmission/equations.js'
import { createKinematicSolver } from '../solver/kinematic-solver.js'
import {
  createUniversalJointRelation,
} from '../compounds/universal-joint.js'
import { solveLinearWithNonlinearRelations } from '../solver/nonlinear-relations.js'
import { validateMechanicsProjectState } from './project-state.js'

export const MIGRATION_REGRESSION_VERSION='mechanics-migration-regression-0.2.0'
const EPS=1e-8

function result(id,fn){
  try{
    const detail=fn()
    return Object.freeze({id,pass:true,detail:detail??null})
  }catch(error){
    return Object.freeze({
      id,
      pass:false,
      detail:String(error?.message||error),
    })
  }
}

function assert(condition,message){
  if(!condition)throw new Error(message)
}

export function runMechanicsMigrationRegressionSuite(){
  const checks=[]

  checks.push(result('differential-forward-and-reverse',()=>{
    const solver=createKinematicSolver()
    solver.addEquation(differentialEquation({
      id:'regression-diff',
      carrier:'carrier',
      left:'left',
      right:'right',
    }))
    solver.setDriver({id:'carrier-drive',bodyId:'carrier',value:10})
    solver.setDriver({id:'left-load',bodyId:'left',value:4})
    let solved=solver.solve()
    assert(solved.status==='solved','forward differential solve failed')
    assert(Math.abs(solved.values[mechanicalVariable('right','omega')]-16)<EPS,'forward differential ratio wrong')

    const reverse=createKinematicSolver()
    reverse.addEquation(differentialEquation({
      id:'regression-diff-reverse',
      carrier:'carrier',
      left:'left',
      right:'right',
    }))
    reverse.setDriver({id:'left-drive',bodyId:'left',value:6})
    reverse.setDriver({id:'right-drive',bodyId:'right',value:10})
    solved=reverse.solve()
    assert(solved.status==='solved','reverse differential solve failed')
    assert(Math.abs(solved.values[mechanicalVariable('carrier','omega')]-8)<EPS,'reverse carrier solve wrong')
    return{right:16,carrier:8}
  }))

  checks.push(result('universal-joint-exact-inverse',()=>{
    const relation=createUniversalJointRelation({
      id:'regression-u-joint',
      inputBody:'input',
      outputBody:'output',
      bendAngleRad:Math.PI/5,
      inputPhaseRad:.31,
      directionSign:1,
    })
    const input=.83
    const output=relation.forward(input)
    const recovered=relation.inverse(output)
    assert(Number.isFinite(output),'Cardan forward result not finite')
    assert(Math.abs(recovered-input)<EPS,'Cardan inverse did not recover input')

    const reverse=solveLinearWithNonlinearRelations({
      equations:[driverEquation({
        id:'output-driver',
        bodyId:'output',
        value:output,
        channel:'theta',
      })],
      relations:[relation],
    })
    assert(reverse.status==='solved','nonlinear reverse solve failed')
    assert(Math.abs(reverse.values[mechanicalVariable('input','theta')]-input)<EPS,'nonlinear reverse propagation wrong')
    return{input,output,recovered}
  }))

  checks.push(result('screw-linear-units',()=>{
    const solver=createKinematicSolver()
    solver.addEquation(screwLinearEquation({
      id:'regression-screw',
      rotaryBody:'screw',
      sliderBody:'rod',
      leadStudPerTurn:.25,
      angularChannel:'omega',
      linearChannel:'slide',
    }))
    solver.setDriver({
      id:'screw-driver',
      bodyId:'screw',
      value:Math.PI*2,
      channel:'omega',
    })
    const solved=solver.solve()
    assert(solved.status==='solved','screw solve failed')
    const slide=solved.values[mechanicalVariable('rod','slide')]
    assert(Math.abs(slide-.25)<EPS,`screw unit mismatch: ${slide}`)
    return{slideStud:slide}
  }))

  checks.push(result('shaft-axis-polarity',()=>{
    const solver=createKinematicSolver()
    solver.addEquation(rotationCouplingEquation({
      id:'regression-shaft-polarity',
      bodyA:'shaft-a',
      bodyB:'shaft-b',
      ratioAB:-1,
      kind:'shaft-coupling',
    }))
    solver.setDriver({id:'shaft-a-driver',bodyId:'shaft-a',value:5})
    const solved=solver.solve()
    assert(solved.status==='solved','opposite-axis shaft solve failed')
    assert(Math.abs(solved.values[mechanicalVariable('shaft-b','omega')]+5)<EPS,'shaft polarity sign wrong')
    return{shaftB:solved.values[mechanicalVariable('shaft-b','omega')]}
  }))

  checks.push(result('rack-pinion-units-and-direction',()=>{
    const solver=createKinematicSolver()
    solver.addEquation(rackPinionEquation({
      id:'regression-rack',
      gearBody:'pinion',
      rackBody:'rack',
      pitchRadius:.75,
      direction:-1,
    }))
    solver.setDriver({id:'pinion-driver',bodyId:'pinion',value:2})
    const solved=solver.solve()
    assert(solved.status==='solved','rack/pinion solve failed')
    const slide=solved.values[mechanicalVariable('rack','slide')]
    assert(Math.abs(slide+1.5)<EPS,`rack/pinion unit or sign mismatch: ${slide}`)
    return{slideStudPerSecond:slide}
  }))

  checks.push(result('packaged-differential-port-polarity',()=>{
    const solver=createKinematicSolver()
    solver.addEquation(packagedDifferentialEquation({
      id:'regression-packaged-diff',
      input:'input',
      left:'left',
      right:'right',
      ratio:1,
      inputSign:1,
      leftSign:1,
      rightSign:-1,
    }))
    solver.setDriver({id:'input-drive',bodyId:'input',value:10})
    solver.setDriver({id:'left-load',bodyId:'left',value:4})
    const solved=solver.solve()
    assert(solved.status==='solved','packaged differential solve failed')
    const right=solved.values[mechanicalVariable('right','omega')]
    assert(Math.abs(right+16)<EPS,`packaged differential polarity wrong: ${right}`)
    return{right}
  }))

  checks.push(result('native-project-schema',()=>{
    const state={
      schemaVersion:1,
      engine:'mechanics-next',
      connections:[{
        id:'regression-connection',
        kind:'fixed',
        a:{instanceId:'a',endpointId:'ea',semantic:'stud'},
        b:{instanceId:'b',endpointId:'eb',semantic:'anti-stud'},
        dof:null,
        interfacePair:['stud','anti-stud'],
      }],
      relations:[],
      compoundState:null,
    }
    const validation=validateMechanicsProjectState(state)
    assert(validation.pass,'native project schema rejected valid state')
    return{connections:state.connections.length}
  }))

  const failed=checks.filter(item=>!item.pass)
  return Object.freeze({
    version:MIGRATION_REGRESSION_VERSION,
    status:failed.length?'failed':'passed',
    checks:Object.freeze(checks),
    passed:checks.length-failed.length,
    failed:failed.length,
  })
}
