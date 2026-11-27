import {Worker} from 'node:worker_threads'
import {ProjectError} from './projects.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const verificationMetrics=['lesson','gears','drive','engine','gearbox','tracks','suspension','belts']
export function validateVerification(input){
 if(!input||typeof input!=='object'||!uuid.test(input.projectId??'')||!Number.isSafeInteger(input.revision)||input.revision<1||!['mechanics','drive','lesson'].includes(input.kind))throw new ProjectError(400,'invalid_verification')
 if(input.kind==='lesson'&&(!['basic','mechanics','drive'].includes(input.lesson)||!['a','b','c'].includes(input.answer)))throw new ProjectError(400,'invalid_verification')
 if(input.driver!==undefined&&(typeof input.driver!=='string'||input.driver.length>128))throw new ProjectError(400,'invalid_verification')
 return {projectId:input.projectId,revision:input.revision,kind:input.kind,lesson:input.kind==='lesson'?input.lesson:null,answer:input.kind==='lesson'?input.answer:null,driver:input.driver??null}
}
export function runVerification(document,request,{timeout=20000,workerFactory=(url,options)=>new Worker(url,options)}={}){
 if(document.parts.length>600||document.connections.length>1800||(document.belts?.length??0)>100)throw new ProjectError(422,'verification_model_limit')
 return new Promise((resolve,reject)=>{
  const worker=workerFactory(new URL('./achievement-verifier-worker.js',import.meta.url),{workerData:{document,request},resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4}})
  let done=false
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate().catch(()=>{});if(error)reject(error);else resolve(result)}
  const timer=setTimeout(()=>finish(new ProjectError(503,'verification_timeout')),timeout)
  worker.once('error',()=>finish(new ProjectError(503,'verification_unavailable')))
  worker.once('exit',()=>finish(new ProjectError(503,'verification_unavailable')))
  worker.once('message',result=>{
   if(!result||!Array.isArray(result.metrics)||result.metrics.some(m=>!verificationMetrics.includes(m))||typeof result.reason!=='string')return finish(new ProjectError(503,'verification_unavailable'))
   finish(null,{metrics:[...new Set(result.metrics)],reason:result.reason})
  })
 })
}
export function createAchievementVerifier({store,run=runVerification}){
 const recent=new Map();let active=0
 return async(uid,input)=>{
  const request=validateVerification(input)
  const now=Date.now();for(const [id,until] of recent)if(until<=now)recent.delete(id)
  if(active>=2||recent.has(uid)||recent.size>=10000)throw new ProjectError(429,'verification_busy')
  recent.set(uid,now+10000);active++
  try{
   const saved=await store.getProject(uid,request.projectId,request.revision)
   if(!saved||saved.revision!==request.revision)throw new ProjectError(404,'not_found')
   const result=await run(saved.document,request)
   if(result.metrics.length)await store.recordAchievementEvidence(uid,request.projectId,request.revision,result.metrics)
   return result
  }finally{active--}
 }
}
