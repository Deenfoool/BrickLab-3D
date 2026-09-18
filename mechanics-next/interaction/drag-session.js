import { buildMotionPlan, rotaryFrameForRecord } from './motion-plan.js'
import { solveScreenRotationalDrag } from './drag-driver.js'
import {
  applyMotionPlanToBaseline,
  captureMotionBaseline,
  restoreMotionBaseline,
} from './scene-motion-adapter.js'

export const DRAG_SESSION_VERSION='mechanics-drag-session-0.1.0'

function recordForInstance(records,instanceId){
  return records.find(record=>String(record?.instance?.body?.instanceId)===String(instanceId))??null
}

export class MechanicsDragSession{
  #records
  #discovery
  #selected
  #baseline
  #start
  #pivot
  #axisScreenSign
  #options
  #last=null
  #active=true

  constructor({
    records,
    discovery,
    instanceId,
    start,
    pivot,
    axisScreenSign=1,
    balancedDifferentials='auto',
    defaults={},
    tolerance,
    tangentScale,
    minimumRadiusPx,
    fallbackDirection,
  }={}){
    if(!Array.isArray(records)||!records.length)throw new TypeError('drag session requires records')
    this.#selected=recordForInstance(records,instanceId)
    if(!this.#selected)throw new Error(`mechanical instance not found: ${instanceId}`)
    const frame=rotaryFrameForRecord(this.#selected)
    if(!frame)throw new Error(`selected part has no rotary frame: ${instanceId}`)

    this.#records=records
    this.#discovery=discovery
    this.#baseline=captureMotionBaseline(records)
    this.#start=Object.freeze({x:Number(start?.x??start?.[0]),y:Number(start?.y??start?.[1])})
    this.#pivot=Object.freeze({x:Number(pivot?.x??pivot?.[0]),y:Number(pivot?.y??pivot?.[1])})
    if(![this.#start.x,this.#start.y,this.#pivot.x,this.#pivot.y].every(Number.isFinite)){
      throw new TypeError('drag session requires finite start/pivot screen coordinates')
    }
    this.#axisScreenSign=Number(axisScreenSign)<0?-1:1
    this.#options={
      balancedDifferentials,
      defaults,
      tolerance,
      tangentScale,
      minimumRadiusPx,
      fallbackDirection,
    }
  }

  get active(){return this.#active}
  get selected(){return this.#selected}
  get baseline(){return this.#baseline}
  get last(){return this.#last}

  update(current,{apply=true}={}){
    if(!this.#active)throw new Error('drag session is closed')

    const solved=solveScreenRotationalDrag({
      bodyId:this.#selected.instance.body.id,
      start:this.#start,
      current,
      pivot:this.#pivot,
      discovery:this.#discovery,
      axisScreenSign:this.#axisScreenSign,
      ...this.#options,
    })

    const plan=buildMotionPlan({
      records:this.#records,
      discovery:this.#discovery,
      displacementResult:solved.solution,
    })

    const application=apply&&solved.solution.valid
      ?applyMotionPlanToBaseline(plan,this.#baseline)
      :Object.freeze({applied:0,missing:Object.freeze([]),invalid:Object.freeze([])})

    this.#last=Object.freeze({
      version:DRAG_SESSION_VERSION,
      drag:solved.drag,
      solution:solved.solution,
      plan,
      application,
    })
    return this.#last
  }

  cancel(){
    if(!this.#active)return false
    restoreMotionBaseline(this.#baseline)
    this.#active=false
    return true
  }

  close({restore=false}={}){
    if(!this.#active)return this.#last
    if(restore)restoreMotionBaseline(this.#baseline)
    this.#active=false
    return this.#last
  }
}

export function createMechanicsDragSession(options){
  return new MechanicsDragSession(options)
}
