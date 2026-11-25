import {ProjectError} from './projects.js'
import {amountKopecks} from './payments.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const paymentId=/^[0-9a-f-]{36}$/i
const apiBase='https://api.yookassa.ru/v3/'
export function yookassaConfig(env=process.env){
 const shopId=env.BRICKLAB_YOOKASSA_TEST_SHOP_ID??'',secret=env.BRICKLAB_YOOKASSA_TEST_SECRET??''
 return {enabled:env.BRICKLAB_YOOKASSA_TEST_ENABLED==='true'&&/^\d{1,20}$/.test(shopId)&&secret.startsWith('test_')&&secret.length>=16,shopId,secret}
}
function validPayment(p,id){
 return p&&paymentId.test(p.id??'')&&(!id||p.id===id)&&p.test===true&&p.amount?.currency==='RUB'&&amountKopecks(p.amount.value)!==null&&uuid.test(p.metadata?.order_id??'')
}
function checkoutUrl(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['yoomoney.ru','yookassa.ru','www.yoomoney.ru','www.yookassa.ru'].includes(u.hostname)?u.href:null}catch{return null}
}
export function createYookassaAdapter({store,origin,config=yookassaConfig(),fetcher=fetch}){
 async function call(path,body,key){
  if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
  const res=await fetcher(apiBase+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Basic '+Buffer.from(config.shopId+':'+config.secret).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json','Idempotence-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(!res.ok)throw new ProjectError(503,'yookassa_unavailable')
  return res.json()
 }
 async function settle(p){
  if(!validPayment(p)||p.status!=='succeeded'||p.paid!==true)throw new ProjectError(409,'payment_unverified')
  const ok=await store.fulfillCommercePayment(p.metadata.order_id,p.id,'test',amountKopecks(p.amount.value))
  if(!ok)throw new ProjectError(409,'payment_mismatch')
 }
 return {
  enabled:config.enabled,
  async checkout(uid,sku){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
   const order=await store.createCommerceTestOrder(uid,sku)
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
   if(!validPayment(payment,order.paymentId)||payment.metadata.order_id!==order.id||amountKopecks(payment.amount.value)!==order.amountKopecks)throw new ProjectError(409,'payment_mismatch')
   if(!await store.attachCommercePayment(order.id,payment.id,'test'))throw new ProjectError(409,'payment_mismatch')
   if(payment.status==='succeeded'){await settle(payment);return {orderId:order.id,status:'succeeded',checkoutUrl:null,mode:'test'}}
   const url=checkoutUrl(payment.confirmation?.confirmation_url)
   if(payment.status!=='pending'||!url)throw new ProjectError(409,'checkout_unavailable')
   return {orderId:order.id,status:'pending',checkoutUrl:url,mode:'test'}
  },
  async notification(event){
   if(!config.enabled)throw new ProjectError(503,'yookassa_test_disabled')
   if(event?.event!=='payment.succeeded'||!paymentId.test(event.object?.id??''))throw new ProjectError(400,'invalid_notification')
   // Do not trust any notification fields other than the lookup identifier.
   const verified=await call('payments/'+event.object.id)
   if(!validPayment(verified,event.object.id))throw new ProjectError(409,'payment_unverified')
   await settle(verified)
   return {ok:true}
  }
 }
}
