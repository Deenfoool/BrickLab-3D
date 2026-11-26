// Run only for attached sandbox payments. Never create payments or expose this queue via HTTP.
export function startTestPaymentReconciliation({store,adapter,logger=console,intervalMs=60000}){
 let active=null,stopped=false
 async function run(){
  const orders=await store.claimCommerceTestPayments()
  for(const order of orders){
   if(stopped)break
   try{
    const status=await adapter.reconcileTestPayment(order)
    if(status!=='pending')logger.info('YooKassa test reconciliation:',status)
   }catch(e){logger.warn('YooKassa test reconciliation failed:',e.code||e.name)}
  }
 }
 function tick(){
  if(stopped||active||!adapter.enabled)return
  active=run().catch(e=>logger.warn('YooKassa test reconciliation queue failed:',e.code||e.name)).finally(()=>{active=null})
 }
 const timer=adapter.enabled?setInterval(tick,intervalMs).unref():null
 return {tick,async stop(){stopped=true;clearInterval(timer);await active}}
}
