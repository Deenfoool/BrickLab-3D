import {projectAccount,plusLoyalty,instructionProduct,discountedPrice} from '../../src/menu/commerce-catalog.js'
import {commerceQuote} from '../commerce-quote.js'
import {ProjectError} from '../projects.js'

export async function commerceEntitlements(tx,uid,environment='live'){
    const rows=environment==='test'?await tx`select g.id,g.kind,g.sku,g.target,g.granted_at as "grantedAt",g.expires_at as "expiresAt"
     from bricklab.commerce_grants g join bricklab.commerce_orders o on o.id=g.order_id and o.user_id=g.user_id
     where g.user_id=${uid} and o.environment='test' and o.status='succeeded'
       and g.revoked_at is null and (g.kind='subscription' or g.granted_at<=now())
       and (g.kind='subscription' or g.expires_at is null or g.expires_at>now())
     order by g.granted_at,g.id`:await tx`select g.id,g.kind,g.sku,g.target,g.granted_at as "grantedAt",g.expires_at as "expiresAt"
     from bricklab.commerce_grants g
     join bricklab.commerce_orders o on o.id=g.order_id and o.user_id=g.user_id
     where g.user_id=${uid} and o.environment='live' and o.status='succeeded'
       and g.revoked_at is null and (g.kind='subscription' or g.granted_at<=now())
       and (g.kind='subscription' or g.expires_at is null or g.expires_at>now())
     order by g.granted_at,g.id`;
    const grants=rows.map(g=>({id:g.id,kind:g.kind,sku:g.sku,
     ...(g.kind==='theme'?{themeId:g.target}:{}),
     ...(g.kind==='instruction'?{setId:g.target}:{}),
     ...(g.grantedAt?{grantedAt:new Date(g.grantedAt).getTime()}:{}),
     ...(g.expiresAt?{expiresAt:new Date(g.expiresAt).getTime()}:{})}));
    const account=projectAccount(grants)
    const welcome=environment==='live'?await tx`select set_id as "setId" from bricklab.instruction_welcome_grants where user_id=${uid} order by slot`:[]
    if(environment==='live')account.instructions=[...new Set([...account.instructions,...welcome.map(g=>g.setId)])]
    const first=environment==='live'?(await tx`select set_id as "setId" from bricklab.instruction_first_build where user_id=${uid}`)[0]:null
    return {...account,loyalty:plusLoyalty(grants),welcomeInstructions:welcome.map(g=>g.setId),firstBuilder:!!first,welcomeRemaining:environment==='live'?Math.max(0,(first?2:1)-welcome.length):0};
}

// Only trusted server adapters may invoke the security-definer write functions.
// Direct app-role INSERT/UPDATE/DELETE on the ledger remains denied.
// The optional merchandise record is resolved by the server, never supplied by the browser.
export function instructionOrderQuote(sku,account,product){
 const p=product&&instructionProduct(product.setId,product.title,product.partCount);
 if(!p||p.id!==sku)throw new ProjectError(404,'unknown_product');
 if(account.instructions.includes(p.setId))throw new ProjectError(409,'already_owned');
 return {sku,title:'BrickLab · '+p.setId+' · '+p.title,amountKopecks:discountedPrice(p.priceKopecks,account.plus)};
}
async function liveQuote(tx,uid,sku,offerVersion,beta,product){
 const [pending]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",offer_version as "offerVersion" from bricklab.commerce_orders where user_id=${uid} and environment='live' and status='pending' limit 1`
 if(pending){if(pending.sku!==sku||pending.offerVersion!==offerVersion)throw new ProjectError(409,'checkout_pending');return pending}
 const account=await commerceEntitlements(tx,uid)
 if(product&&!beta)return {...instructionOrderQuote(sku,account,product),offerVersion}
 const payments=await tx`select o.sku,o.amount_kopecks as "amountKopecks" from bricklab.commerce_orders o join bricklab.commerce_grants g on g.order_id=o.id and g.user_id=o.user_id where o.user_id=${uid} and o.environment='live' and o.status='succeeded' and g.kind='badge' and g.revoked_at is null`
 return {...commerceQuote(sku,account,payments,{beta}),offerVersion}
}
async function orderQuote(tx,uid,sku,offerVersion,beta,environment,product){
 if(environment==='live')return liveQuote(tx,uid,sku,offerVersion,beta,product)
 if(environment!=='test')throw new ProjectError(400,'invalid_environment')
 const [admin]=await tx`select bricklab.is_admin() as ok`
 if(!admin.ok)throw new ProjectError(403,'admin_required')
 const [pending]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",offer_version as "offerVersion" from bricklab.commerce_orders where user_id=${uid} and environment='test' and status='pending' and sku=${sku} order by created_at desc limit 1`
 if(pending){if(pending.offerVersion&&pending.offerVersion!==offerVersion)throw new ProjectError(409,'checkout_pending');return {...pending,offerVersion}}
 const account=await commerceEntitlements(tx,uid,'test')
 if(product)return {...instructionOrderQuote(sku,account,product),offerVersion}
 if(sku==='instruction-42215-1'){
  if(account.instructions.includes('42215-1'))throw new ProjectError(409,'already_owned')
  return {sku,title:'Интерактивные инструкции · Volvo 42215',amountKopecks:17900,offerVersion}
 }
 const payments=await tx`select o.sku,o.amount_kopecks as "amountKopecks" from bricklab.commerce_orders o join bricklab.commerce_grants g on g.order_id=o.id and g.user_id=o.user_id where o.user_id=${uid} and o.environment='test' and o.status='succeeded' and g.kind='badge' and g.revoked_at is null`
 return {...commerceQuote(sku,account,payments,{beta}),offerVersion}
}
export function commerceStore(scope){
 return {
  async recordInstructionActivity(uid,set,event){return scope(uid,tx=>tx`select bricklab.record_instruction_activity(${set},${event})`)},
  async instructionAnalytics(uid){return scope(uid,async tx=>{const [r]=await tx`select bricklab.instruction_analytics() as data`;return r.data})},
  async earnFirstBuilder(uid,projectId,checkCompletion){return scope(uid,async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text,312042))`
   const account=await commerceEntitlements(tx,uid)
   if(account.firstBuilder)return account
   const [p]=await tx`select r.document from bricklab.projects p join bricklab.project_revisions r on r.project_id=p.id and r.revision=p.head_revision where p.id=${projectId}::uuid and p.owner_id=${uid}`
   const setId=p&&checkCompletion(p.document)
   if(!setId||!account.welcomeInstructions.includes(setId))throw new ProjectError(409,'build_not_complete')
   const [r]=await tx`select bricklab.earn_instruction_first_build(${setId}) as ok`
   if(!r.ok)throw new ProjectError(409,'build_not_complete')
   return commerceEntitlements(tx,uid)
  })},
  async claimInstructionWelcome(uid,setId){return scope(uid,async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text,312042))`
   const before=await commerceEntitlements(tx,uid)
   if(before.plus||before.instructions.includes(setId))return before
   const [r]=await tx`select bricklab.claim_instruction_welcome(${setId}) as ok`
   if(!r.ok)throw new ProjectError(409,'welcome_exhausted')
   return commerceEntitlements(tx,uid)
  })},
  async quoteCommerce(uid,sku,offerVersion,beta,environment,product){return scope(uid,tx=>orderQuote(tx,uid,sku,offerVersion,beta,environment,product))},
  async createCommerceOrder(uid,sku,amount,offerVersion,beta,environment,product){return scope(uid,async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text,312042))`
   const quote=await orderQuote(tx,uid,sku,offerVersion,beta,environment,product)
   if(quote.amountKopecks!==amount)throw new ProjectError(409,'quote_changed')
   const [row]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",idempotency_key as "idempotencyKey",payment_id as "paymentId",created_at as "createdAt" from bricklab.commerce_create_order(${sku},${quote.title},${amount}::integer,${offerVersion},${environment})`
   return row
  })},
  async requestCommerceRefund(uid,id,environment){return scope(uid,async tx=>{const [r]=await tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks",refund_requested_at as "requestedAt",provider_refund_id as "refundId" from bricklab.commerce_request_refund(${id}::uuid,${environment})`;return r})},
  async attachCommerceRefund(id,refund,environment){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_attach_refund(${id}::uuid,${refund},${environment}) as ok`;return r.ok})},
  async claimCommerceRefunds(environment){return scope('',tx=>tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks",provider_refund_id as "refundId" from bricklab.commerce_claim_refunds(${environment})`)},
  async commerceAdminDayTotals(uid,environment){return scope(uid,async tx=>{const [r]=await tx`select * from bricklab.commerce_admin_day_totals(${environment})`;return r})},
  async registerCommerceReceipt(uid,id,url){return scope(uid,async tx=>{const [r]=await tx`select bricklab.commerce_register_receipt(${id}::uuid,${url}) as ok`;return r.ok})},
  async claimCommerceReceiptDeliveries(){return scope('',tx=>tx`select * from bricklab.commerce_claim_receipt_deliveries()`)},
  async ackCommerceReceiptDelivery(id,url){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_ack_receipt_delivery(${id}::uuid,${url}) as ok`;return r.ok})},
  async commerceAdminLedger(uid,environment){return scope(uid,tx=>tx`select * from bricklab.commerce_admin_ledger(${environment})`)},
  async confirmCommerceReceiptCorrection(uid,id,reference){return scope(uid,async tx=>{const [r]=await tx`select bricklab.commerce_confirm_receipt_correction(${id}::uuid,${reference}) as ok`;return r.ok})},
  async confirmCommerceReceipt(uid,id,reference){return scope(uid,async tx=>{const [r]=await tx`select bricklab.commerce_confirm_receipt(${id}::uuid,${reference}) as ok`;return r.ok})},
  async requestCommerceTestRefund(uid,id){return scope(uid,async tx=>{const [r]=await tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks",refund_requested_at as "requestedAt",provider_refund_id as "refundId" from bricklab.commerce_request_test_refund(${id}::uuid)`;return r})},
  async attachCommerceTestRefund(id,refund){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_attach_test_refund(${id}::uuid,${refund}) as ok`;return r.ok})},
  async claimCommerceTestRefunds(){return scope('',tx=>tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks",provider_refund_id as "refundId" from bricklab.commerce_claim_test_refunds()`)},
  async claimCommerceEvents(){return scope('',tx=>tx`select * from bricklab.commerce_claim_events()`)},
  async ackCommerceEvent(id){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_ack_event(${id}::bigint) as ok`;return r.ok})},
  async refundCommercePayment(payment,environment,amount){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_refund_full(${payment},${environment},${amount}::integer) as ok`;return r.ok})},
  async commerceTestAccount(uid){return scope(uid,async tx=>{
   const account=await commerceEntitlements(tx,uid,'test')
   const orders=await tx`select id,order_number as "orderNumber",sku,title,amount_kopecks as "amountKopecks",status,payment_id as "paymentId",refund_requested_at as "refundRequestedAt",provider_refund_id as "refundId",created_at as "createdAt",paid_at as "paidAt" from bricklab.commerce_orders where user_id=${uid} and environment='test' order by created_at desc limit 50`
   return {...account,orders}
  })},
  async claimCommerceLivePayments(){return scope('',tx=>tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks" from bricklab.commerce_claim_live_payments()`)},
  async claimCommerceTestPayments(){return scope('',tx=>tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks" from bricklab.commerce_claim_test_payments()`)},
  async quoteCommerceLive(uid,sku,offerVersion,beta=true,product){return scope(uid,tx=>liveQuote(tx,uid,sku,offerVersion,beta,product))},
  async createCommerceLiveOrder(uid,sku,expectedAmount,offerVersion,beta=true,product){return scope(uid,async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text,312042))`
   const quote=await liveQuote(tx,uid,sku,offerVersion,beta,product)
   if(quote.amountKopecks!==expectedAmount)throw new ProjectError(409,'quote_changed')
   const [row]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",idempotency_key as "idempotencyKey",payment_id as "paymentId",created_at as "createdAt" from bricklab.commerce_create_live_order(${sku},${quote.title},${quote.amountKopecks}::integer,${offerVersion})`;return row
  })},
  async cancelCommercePayment(id,paymentId,environment,amount){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_cancel_payment(${id}::uuid,${paymentId},${environment},${amount}::integer) as ok`;return r.ok})},
  async createCommerceTestOrder(uid,sku){return scope(uid,async tx=>{const [row]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",idempotency_key as "idempotencyKey",payment_id as "paymentId",created_at as "createdAt" from bricklab.commerce_create_test_order(${sku})`;return row})},
  async attachCommercePayment(id,paymentId,environment){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_attach_payment(${id}::uuid,${paymentId},${environment}) as ok`;return r.ok})},
  async fulfillCommercePayment(id,paymentId,environment,amount){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_fulfill(${id}::uuid,${paymentId},${environment},${amount}::integer) as ok`;return r.ok})},
  async commerceAccount(uid){
   return scope(uid,async tx=>{
    const account=await commerceEntitlements(tx,uid);
    const orders=await tx`select id,order_number as "orderNumber",sku,title,amount_kopecks as "amountKopecks",status,
     created_at as "createdAt",paid_at as "paidAt",refunded_at as "refundedAt",receipt_status as "receiptStatus",case when status='succeeded' then receipt_delivery_url else null end as "receiptUrl",receipt_delivery_sent_at as "receiptSentAt",payment_id as "paymentId",refund_requested_at as "refundRequestedAt"
     from bricklab.commerce_orders where user_id=${uid} and environment='live'
     order by created_at desc,id limit 50`;
    return {...account,orders};
   });
  }
 };
}
