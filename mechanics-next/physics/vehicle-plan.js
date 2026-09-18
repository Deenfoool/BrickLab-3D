import { mechanicalVariable } from '../core/model.js'
import { createKinematicSolver } from '../solver/kinematic-solver.js'
import { rotaryFrameForRecord } from '../interaction/motion-plan.js'

export const MECHANICS_VEHICLE_PLAN_VERSION='mechanics-vehicle-plan-0.1.0'
const EPS=1e-9

function topologyEquations(discovery){
  const byId=new Map()
  for(const equation of discovery?.equations||[])byId.set(equation.id,equation)
  for(const equation of discovery?.velocityEquations||[])byId.set(equation.id,equation)
  for(const transmission of discovery?.transmissions||[]){
    for(const equation of transmission?.equations||[])byId.set(equation.id,equation)
  }
  for(const equation of discovery?.balancedDifferentialClosures||[])byId.set(equation.id,equation)
  return [...byId.values()].filter(equation=>
    Math.abs(Number(equation?.constant)||0)<=EPS)
}

function solveRatios(equations,driverBodyId,wheelBodyIds){
  const solver=createKinematicSolver()
  for(const equation of equations)solver.addEquation(equation)
  solver.setDriver({
    id:`vehicle-plan:${driverBodyId}`,
    bodyId:driverBodyId,
    value:1,
    source:'mechanics-next-vehicle-plan',
  })
  const result=solver.solve()
  const ratios=new Map()
  for(const bodyId of wheelBodyIds){
    const value=Number(result?.values?.[mechanicalVariable(bodyId,'omega')])
    if(Number.isFinite(value)&&Math.abs(value)>EPS)ratios.set(bodyId,value)
  }
  return{result,ratios}
}

export function buildMechanicsVehiclePlan({
  records=[],
  discovery=null,
  motorPlan=null,
}={}){
  const wheels=[]
  const blockers=[]
  for(const record of records){
    const wheel=record?.instance?.descriptor?.classification?.properties?.wheel
    if(!wheel)continue
    const frame=rotaryFrameForRecord(record)
    if(!frame||!Number.isFinite(Number(wheel.radiusStud))||Number(wheel.radiusStud)<=0){
      blockers.push(Object.freeze({
        code:'wheel-frame-or-radius-missing',
        bodyId:record?.instance?.body?.id??null,
        instanceId:record?.instance?.body?.instanceId??null,
      }))
      continue
    }
    wheels.push({
      id:`mechanics-next-wheel:${record.instance.body.id}`,
      bodyId:String(record.instance.body.id),
      instanceId:String(record.instance.body.instanceId),
      partId:String(record.instance.body.partId),
      radiusStud:Number(wheel.radiusStud),
      widthStud:Number.isFinite(Number(wheel.widthStud))?Number(wheel.widthStud):null,
      tire:wheel.tire??null,
      centerWorldStud:Object.freeze([...frame.pivot]),
      axisWorld:Object.freeze([...frame.axis]),
      source:frame.source,
      sourceMotors:[],
    })
  }

  const equations=topologyEquations(discovery)
  const wheelBodyIds=wheels.map(wheel=>wheel.bodyId)
  const motorRatios=new Map()
  for(const drive of motorPlan?.drives||[]){
    const solved=solveRatios(equations,drive.drivenBodyId,wheelBodyIds)
    motorRatios.set(drive.controlId,Object.freeze({
      controlId:drive.controlId,
      motorBodyId:drive.motorBodyId,
      drivenBodyId:drive.drivenBodyId,
      solveStatus:solved.result?.status??'unknown',
      ratios:solved.ratios,
    }))
    for(const wheel of wheels){
      const ratio=solved.ratios.get(wheel.bodyId)
      if(!Number.isFinite(ratio)||Math.abs(ratio)<=EPS)continue
      wheel.sourceMotors.push(Object.freeze({
        controlId:String(drive.controlId),
        ratioFromMotor:ratio,
      }))
    }
  }

  const finalized=wheels.map(wheel=>Object.freeze({
    ...wheel,
    sourceMotors:Object.freeze([...wheel.sourceMotors]),
    sourceMotorId:wheel.sourceMotors.length===1?wheel.sourceMotors[0].controlId:null,
    ratioFromMotor:wheel.sourceMotors.length===1?wheel.sourceMotors[0].ratioFromMotor:null,
  }))

  const ambiguous=finalized.filter(wheel=>wheel.sourceMotors.length>1)
  return Object.freeze({
    version:MECHANICS_VEHICLE_PLAN_VERSION,
    pass:blockers.length===0,
    wheels:Object.freeze(finalized),
    motors:Object.freeze([...(motorPlan?.drives||[])].map(drive=>Object.freeze({
      controlId:String(drive.controlId),
      motorBodyId:String(drive.motorBodyId),
      drivenBodyId:String(drive.drivenBodyId),
    }))),
    blockers:Object.freeze(blockers),
    diagnostics:Object.freeze({
      ambiguousDrivenWheels:Object.freeze(ambiguous.map(wheel=>Object.freeze({
        wheelInstanceId:wheel.instanceId,
        sourceMotorIds:Object.freeze(wheel.sourceMotors.map(item=>item.controlId)),
      }))),
      wheelCount:finalized.length,
      drivenWheelCount:finalized.filter(wheel=>wheel.sourceMotors.length>0).length,
      motorCount:motorRatios.size,
    }),
  })
}
