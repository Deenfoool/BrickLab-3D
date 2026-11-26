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
  async checkout(uid,sku,quote){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
   const order=environment==='live'?await store.createCommerceLiveOrder(uid,sku,quote?.amountKopecks,quote?.offerVersion,quote?.beta):await store.createCommerceTestOrder(uid,sku)
   let payment
   if(order.paymentId)payment=await call('payments/'+order.paymentId)
   else{
    // YooKassa idempotency is time-limited. Never create a second payment
    // for an old order with an uncertain upstream outcome.
    if(Date.now()-new Date(order.createdAt).getTime()>23*3600000)throw new ProjectError(409,'order_reconciliation_required')
    payment=await call('payments',{amount:{value:(order.amountKopecks/100).toFixed(2),currency:'RUB'},capture:true,
     confirmation:{type:'redirect',return_url:new URL('/payment/success',origin).href},
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
  async reconcileTestPayment(order){
   if(!config.enabled||environment!=='test')throw new ProjectError(503,'yookassa_test_disabled')
   if(!uuid.test(order?.id??'')||!paymentId.test(order?.paymentId??'')||!Number.isSafeInteger(order.amountKopecks))throw new ProjectError(409,'invalid_order')
   const verified=await call('payments/'+order.paymentId)
   if(!validPayment(verified,order.paymentId,'test')||verified.metadata.order_id!==order.id||amountKopecks(verified.amount.value)!==order.amountKopecks)throw new ProjectError(409,'payment_mismatch')
   if(verified.status==='succeeded'){await settle(verified);return 'succeeded'}
   if(verified.status==='canceled'){
    if(!await store.cancelCommercePayment(order.id,order.paymentId,'test',order.amountKopecks))throw new ProjectError(409,'payment_mismatch')
    return 'canceled'
   }
   return 'pending'
  },
  async notification(event){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
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
