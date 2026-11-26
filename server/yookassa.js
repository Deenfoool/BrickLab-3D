import {ProjectError} from './projects.js'
import {amountKopecks} from './payments.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const paymentId=uuid
const apiBase='https://api.yookassa.ru/v3/'
export function yookassaConfig(env=process.env){
 const shopId=env.BRICKLAB_YOOKASSA_TEST_SHOP_ID??'',secret=env.BRICKLAB_YOOKASSA_TEST_SECRET??''
 return {enabled:env.BRICKLAB_YOOKASSA_TEST_ENABLED==='true'&&/^\d{1,20}$/.test(shopId)&&secret.startsWith('test_')&&secret.length>=16,shopId,secret}
}
function validPayment(p,id,environment='test'){
 return p&&paymentId.test(p.id??'')&&(!id||p.id===id)&&p.test===(environment==='test')&&p.amount?.currency==='RUB'&&amountKopecks(p.amount.value)!==null&&uuid.test(p.metadata?.order_id??'')
}
function checkoutUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname)?u.href:null}catch{return null}
}
export function createYookassaAdapter({store,origin,config=yookassaConfig(),fetcher=fetch}){
 const environment=config.environment==='live'?'live':'test'
 async function call(path,body,key){
  if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
  const res=await fetcher(apiBase+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Basic '+Buffer.from(config.shopId+':'+config.secret).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json','Idempotence-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(!res.ok)throw new ProjectError(503,'yookassa_unavailable')
  return res.json()
 }
 async function settle(p){
  if(!validPayment(p,undefined,environment)||p.status!=='succeeded'||p.paid!==true)throw new ProjectError(409,'payment_unverified')
  const ok=await store.fulfillCommercePayment(p.metadata.order_id,p.id,environment,amountKopecks(p.amount.value))
  if(!ok)throw new ProjectError(409,'payment_mismatch')
 }
 return {
  enabled:config.enabled,
  environment,
  async checkout(uid,sku,quote){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
   if(quote?.sandboxPack&&environment!=='test')throw new ProjectError(403,'bundle_unavailable')
   const order=quote?.sandboxPack?await store.createSandboxPack(uid,quote.sandboxPack.setIds,quote.sandboxPack.products,quote.amountKopecks,quote.offerVersion):quote?.unified===true?await store.createCommerceOrder(uid,sku,quote.amountKopecks,quote.offerVersion,quote.beta,environment,...(quote.instructionProduct?[quote.instructionProduct]:[])):environment==='live'?await store.createCommerceLiveOrder(uid,sku,quote?.amountKopecks,quote?.offerVersion,quote?.beta,...(quote?.instructionProduct?[quote.instructionProduct]:[])):await store.createCommerceTestOrder(uid,sku)
   let payment
   if(order.paymentId)payment=await call('payments/'+order.paymentId)
   else{
    // YooKassa idempotency is time-limited. Never create a second payment
    // for an old order with an uncertain upstream outcome.
    if(Date.now()-new Date(order.createdAt).getTime()>23*3600000)throw new ProjectError(409,'order_reconciliation_required')
    payment=await call('payments',{amount:{value:(order.amountKopecks/100).toFixed(2),currency:'RUB'},capture:true,
     confirmation:{type:'redirect',return_url:new URL(/^instruction-\d{3,7}-\d{1,2}$/.test(sku)||quote?.sandboxPack||quote?.returnToSets===true?'/payment/success?kind=instruction':'/payment/success',origin).href},
     description:order.title,metadata:{order_id:order.id}},order.idempotencyKey)
   }
   if(!validPayment(payment,order.paymentId,environment)||payment.metadata.order_id!==order.id||amountKopecks(payment.amount.value)!==order.amountKopecks)throw new ProjectError(409,'payment_mismatch')
   if(!await store.attachCommercePayment(order.id,payment.id,environment))throw new ProjectError(409,'payment_mismatch')
   if(payment.status==='canceled'){await store.cancelCommercePayment(order.id,payment.id,environment,order.amountKopecks);return {orderId:order.id,status:'canceled',checkoutUrl:null,mode:environment}}
   if(payment.status==='succeeded'){await settle(payment);return {orderId:order.id,status:'succeeded',checkoutUrl:null,mode:environment}}
   const url=checkoutUrl(payment.confirmation?.confirmation_url)
   if(payment.status!=='pending'||!url)throw new ProjectError(409,'checkout_unavailable')
   return {orderId:order.id,status:'pending',checkoutUrl:url,mode:environment}
  },
  async reconcilePayment(order){
   if(!config.enabled)throw new ProjectError(503,'payments_disabled')
   if(!uuid.test(order?.id??'')||!paymentId.test(order?.paymentId??'')||!Number.isSafeInteger(order.amountKopecks))throw new ProjectError(409,'invalid_order')
   const verified=await call('payments/'+order.paymentId)
   if(!validPayment(verified,order.paymentId,environment)||verified.metadata.order_id!==order.id||amountKopecks(verified.amount.value)!==order.amountKopecks)throw new ProjectError(409,'payment_mismatch')
   if(verified.status==='succeeded'){await settle(verified);return 'succeeded'}
   if(verified.status==='canceled'){
    if(!await store.cancelCommercePayment(order.id,order.paymentId,environment,order.amountKopecks))throw new ProjectError(409,'payment_mismatch')
    return 'canceled'
   }
   return 'pending'
  },
  async reconcileTestPayment(order){
   if(environment!=='test')throw new ProjectError(503,'yookassa_test_disabled')
   return this.reconcilePayment(order)
  },
  async requestRefund(uid,orderId,{legacy=false}={}){
   if(!config.enabled||!uuid.test(orderId??''))throw new ProjectError(400,'invalid_refund')
   const order=await (legacy?store.requestCommerceTestRefund(uid,orderId):store.requestCommerceRefund(uid,orderId,environment))
   if(!order)throw new ProjectError(404,'refundable_order_not_found')
   let refund
   if(order.refundId)refund=await call('refunds/'+order.refundId)
   else{
    if(Date.now()-new Date(order.requestedAt).getTime()>23*3600000)throw new ProjectError(409,'refund_reconciliation_required')
    const paid=await call('payments/'+order.paymentId)
    if(!validPayment(paid,order.paymentId,environment)||paid.metadata.order_id!==order.id||paid.status!=='succeeded'||paid.paid!==true||amountKopecks(paid.amount.value)!==order.amountKopecks)throw new ProjectError(409,'payment_mismatch')
    const alreadyRefunded=paid.refunded_amount?.currency==='RUB'?amountKopecks(paid.refunded_amount.value):null
    if(alreadyRefunded===order.amountKopecks){
     if(!await store.refundCommercePayment(order.paymentId,environment,order.amountKopecks))throw new ProjectError(409,'refund_mismatch')
     return {status:'succeeded',mode:environment}
    }
    if(alreadyRefunded!==null&&alreadyRefunded>0)throw new ProjectError(409,'partial_refund_requires_review')
    // A previous refund may have succeeded before its response reached us.
    // Replay only the same idempotency key, never generate a new refund key.
    refund=await call('refunds',{payment_id:order.paymentId,amount:{currency:'RUB',value:(order.amountKopecks/100).toFixed(2)}},order.id)
   }
   if(!uuid.test(refund?.id??'')||refund.payment_id!==order.paymentId||refund.amount?.currency!=='RUB'||amountKopecks(refund.amount.value)!==order.amountKopecks||order.refundId&&refund.id!==order.refundId)throw new ProjectError(409,'refund_mismatch')
   if(!await (legacy?store.attachCommerceTestRefund(order.id,refund.id):store.attachCommerceRefund(order.id,refund.id,environment)))throw new ProjectError(409,'refund_mismatch')
   if(refund.status==='succeeded')await this.reconcileRefund(refund.id)
   return {status:refund.status,mode:environment}
  },
  async pollRefund(order){
   if(!config.enabled||environment!=='test'||!uuid.test(order?.refundId??''))throw new ProjectError(400,'invalid_refund')
   const refund=await call('refunds/'+order.refundId)
   if(refund?.id!==order.refundId||refund.payment_id!==order.paymentId||refund.amount?.currency!=='RUB'||amountKopecks(refund.amount.value)!==order.amountKopecks)throw new ProjectError(409,'refund_mismatch')
   if(refund.status==='succeeded')await this.reconcileRefund(refund.id)
   return refund.status
  },
  async requestTestRefund(uid,id){
   if(environment!=='test')throw new ProjectError(503,'yookassa_test_disabled')
   return this.requestRefund(uid,id,{legacy:true})
  },
  async pollTestRefund(order){
   if(environment!=='test')throw new ProjectError(503,'yookassa_test_disabled')
   return this.pollRefund(order)
  },
  async reconcileRefund(refundId){
   if(!config.enabled||!uuid.test(refundId??''))throw new ProjectError(400,'invalid_refund')
   const refund=await call('refunds/'+refundId)
   if(refund?.id!==refundId||refund.status!=='succeeded'||!paymentId.test(refund.payment_id??'')||refund.amount?.currency!=='RUB'||amountKopecks(refund.amount.value)===null)throw new ProjectError(409,'refund_unverified')
   const paid=await call('payments/'+refund.payment_id)
   if(!validPayment(paid,refund.payment_id,environment)||paid.status!=='succeeded'||paid.paid!==true)throw new ProjectError(409,'refund_unverified')
   const amount=amountKopecks(paid.amount.value)
   if(paid.refunded_amount?.currency!=='RUB'||amountKopecks(paid.refunded_amount.value)!==amount)throw new ProjectError(409,'partial_refund_requires_review')
   if(!await store.refundCommercePayment(paid.id,environment,amount))throw new ProjectError(409,'refund_mismatch')
   return {ok:true}
  },
  async reconcileTestRefund(refundId){
   if(environment!=='test')throw new ProjectError(503,'yookassa_test_disabled')
   return this.reconcileRefund(refundId)
  },
  async notification(event){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
   if(event?.event==='refund.succeeded')return this.reconcileRefund(event.object?.id)
   if(!['payment.succeeded','payment.canceled'].includes(event?.event)||!paymentId.test(event.object?.id??''))throw new ProjectError(400,'invalid_notification')
   // Do not trust any notification fields other than the lookup identifier.
   const verified=await call('payments/'+event.object.id)
   if(!validPayment(verified,event.object.id,environment))throw new ProjectError(409,'payment_unverified')
   if(event.event==='payment.canceled'){
    if(verified.status!=='canceled'||!await store.cancelCommercePayment(verified.metadata.order_id,verified.id,environment,amountKopecks(verified.amount.value)))throw new ProjectError(409,'payment_mismatch')
   }else await settle(verified)
   return {ok:true}
  }
 }
}
