// Run only for attached sandbox payments. Never create payments or expose this queue via HTTP.
export function startTestPaymentReconciliation({store,adapter,logger=console,intervalMs=60000,environment='test'}){
 let active=null,stopped=false
 async function run(){
  const orders=await (environment==='live'?store.claimCommerceLivePayments():store.claimCommerceTestPayments())
  for(const order of orders){
   if(stopped)break
   try{
    const status=environment==='live'?await adapter.reconcilePayment(order):await adapter.reconcileTestPayment(order)
    if(status!=='pending')logger.info(`YooKassa ${environment} reconciliation:`,status)
   }catch(e){logger.warn(`YooKassa ${environment} reconciliation failed:`,e.code||e.name)}
  }
  if(!stopped){
   for(const order of await store.claimCommerceRefunds(environment)){
    if(stopped)break
    try{const status=await adapter.pollRefund(order);if(status!=='pending')logger.info(`YooKassa ${environment} refund reconciliation:`,status)}
    catch(e){logger.warn(`YooKassa ${environment} refund reconciliation failed:`,e.code||e.name)}
   }
  }
 }
 function tick(){
  if(stopped||active||!adapter.enabled)return
  active=run().catch(e=>logger.warn(`YooKassa ${environment} reconciliation queue failed:`,e.code||e.name)).finally(()=>{active=null})
 }
 const timer=adapter.enabled?setInterval(tick,intervalMs).unref():null
 return {tick,async stop(){stopped=true;clearInterval(timer);await active}}
}
