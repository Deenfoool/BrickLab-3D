export function boundedTask(task,signal,timeout=20000){
 return new Promise((resolve,reject)=>{
  let timer,finished=false
  const settle=(fn,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value)}
  const cancel=()=>settle(reject,signal.reason??new DOMException('Aborted','AbortError'))
  Promise.resolve(task).then(value=>settle(resolve,value),error=>settle(reject,error))
  if(signal?.aborted){cancel();return}
  signal?.addEventListener('abort',cancel,{once:true})
  timer=setTimeout(()=>settle(reject,new DOMException('Instruction analysis deadline','TimeoutError')),timeout)
 })
}
