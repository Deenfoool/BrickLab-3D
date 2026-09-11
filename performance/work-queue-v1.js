export const FRAME_BUDGET_QUEUE_VERSION = 'frame-budget-queue-v1.0.0'

const defaultNow = () => globalThis.performance?.now?.() ?? Date.now()
const defaultSchedule = callback => {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return setTimeout(callback,0)
}

export class FrameBudgetScheduler {
  constructor({ budgetMs=4, now=defaultNow, scheduleFrame=defaultSchedule }={}) {
    this.budgetMs=Math.max(.25,Number(budgetMs)||4)
    this.now=now
    this.scheduleFrame=scheduleFrame
    this.jobs=new Map()
    this.generation=0
    this.scheduled=false
    this.frames=0
    this.completed=0
    this.aborted=0
  }

  schedule(items, worker, { key='default' }={}) {
    if(typeof worker!=='function')throw new TypeError('FrameBudgetScheduler worker must be a function')
    this.abort(key,'restarted')
    const list=Array.from(items ?? [])
    const generation=++this.generation
    let resolveJob,rejectJob
    const promise=new Promise((resolve,reject)=>{resolveJob=resolve;rejectJob=reject})
    const job={key:String(key),generation,list,index:0,worker,resolve:resolveJob,reject:rejectJob}
    this.jobs.set(job.key,job)
    this._ensurePump()
    return promise
  }

  abort(key='default', reason='aborted') {
    const job=this.jobs.get(String(key))
    if(!job)return false
    this.jobs.delete(String(key))
    this.aborted+=1
    job.resolve({aborted:true,reason,generation:job.generation,processed:job.index,total:job.list.length})
    return true
  }

  _ensurePump() {
    if(this.scheduled||!this.jobs.size)return
    this.scheduled=true
    this.scheduleFrame(()=>this._pump())
  }

  _pump() {
    this.scheduled=false
    if(!this.jobs.size)return
    this.frames+=1
    const started=this.now()
    const jobs=[...this.jobs.values()]
    let cursor=0
    while(this.jobs.size && (this.now()-started<this.budgetMs || cursor===0)){
      const job=jobs[cursor%jobs.length]
      cursor+=1
      if(!job || this.jobs.get(job.key)!==job)continue
      if(job.index>=job.list.length){this._finish(job);continue}
      try{
        job.worker(job.list[job.index],job.index,job.generation)
        job.index+=1
      }catch(error){
        this.jobs.delete(job.key)
        job.reject(error)
      }
      if(job.index>=job.list.length && this.jobs.get(job.key)===job)this._finish(job)
      if(cursor>jobs.length*4 && this.now()-started>=this.budgetMs)break
    }
    this._ensurePump()
  }

  _finish(job) {
    if(this.jobs.get(job.key)!==job)return
    this.jobs.delete(job.key)
    this.completed+=1
    job.resolve({aborted:false,generation:job.generation,processed:job.index,total:job.list.length})
  }

  stats() {
    return Object.freeze({
      version:FRAME_BUDGET_QUEUE_VERSION,
      budgetMs:this.budgetMs,
      activeJobs:this.jobs.size,
      frames:this.frames,
      completed:this.completed,
      aborted:this.aborted,
    })
  }
}
