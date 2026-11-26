import {projectAccount,plusLoyalty} from '../../src/menu/commerce-catalog.js'
import {commerceQuote} from '../commerce-quote.js'
import {ProjectError} from '../projects.js'

export async function commerceEntitlements(tx,uid,environment='live'){
    const rows=await tx`select g.id,g.kind,g.sku,g.target,g.granted_at as "grantedAt",g.expires_at as "expiresAt"
     from bricklab.commerce_grants g
     join bricklab.commerce_orders o on o.id=g.order_id and o.user_id=g.user_id
     where g.user_id=${uid} and o.environment=${environment} and o.status='succeeded'
       and g.revoked_at is null and (g.kind='subscription' or g.granted_at<=now())
       and (g.kind='subscription' or g.expires_at is null or g.expires_at>now())
     order by g.granted_at,g.id`;
    const grants=rows.map(g=>({id:g.id,kind:g.kind,sku:g.sku,
     ...(g.kind==='theme'?{themeId:g.target}:{}),
     ...(g.kind==='instruction'?{setId:g.target}:{}),
     ...(g.grantedAt?{grantedAt:new Date(g.grantedAt).getTime()}:{}),
     ...(g.expiresAt?{expiresAt:new Date(g.expiresAt).getTime()}:{})}));
    return {...projectAccount(grants),loyalty:plusLoyalty(grants)};
}

// Only trusted server adapters may invoke the security-definer write functions.
// Direct app-role INSERT/UPDATE/DELETE on the ledger remains denied.
async function liveQuote(tx,uid,sku,offerVersion,beta){
 const [pending]=await tx`select id,sku,title,amount_kopecks as "amountKopecks",offer_version as "offerVersion" from bricklab.commerce_orders where user_id=${uid} and environment='live' and status='pending' limit 1`
 if(pending){if(pending.sku!==sku||pending.offerVersion!==offerVersion)throw new ProjectError(409,'checkout_pending');return pending}
 const account=await commerceEntitlements(tx,uid)
 const payments=await tx`select o.sku,o.amount_kopecks as "amountKopecks" from bricklab.commerce_orders o join bricklab.commerce_grants g on g.order_id=o.id and g.user_id=o.user_id where o.user_id=${uid} and o.environment='live' and o.status='succeeded' and g.kind='badge' and g.revoked_at is null`
 return {...commerceQuote(sku,account,payments,{beta}),offerVersion}
}
export function commerceStore(scope){
 return {
  async claimCommerceEvents(){return scope('',tx=>tx`select * from bricklab.commerce_claim_events()`)},
  async ackCommerceEvent(id){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_ack_event(${id}::bigint) as ok`;return r.ok})},
  async refundCommercePayment(payment,environment,amount){return scope('',async tx=>{const [r]=await tx`select bricklab.commerce_refund_full(${payment},${environment},${amount}::integer) as ok`;return r.ok})},
  async commerceTestAccount(uid){return scope(uid,async tx=>{
   const account=await commerceEntitlements(tx,uid,'test')
   const orders=await tx`select id,sku,title,amount_kopecks as "amountKopecks",status,payment_id as "paymentId",created_at as "createdAt",paid_at as "paidAt" from bricklab.commerce_orders where user_id=${uid} and environment='test' order by created_at desc limit 50`
   return {...account,orders}
  })},
  async claimCommerceTestPayments(){return scope('',tx=>tx`select id,payment_id as "paymentId",amount_kopecks as "amountKopecks" from bricklab.commerce_claim_test_payments()`)},
  async quoteCommerceLive(uid,sku,offerVersion,beta=true){return scope(uid,tx=>liveQuote(tx,uid,sku,offerVersion,beta))},
  async createCommerceLiveOrder(uid,sku,expectedAmount,offerVersion,beta=true){return scope(uid,async tx=>{
   await tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text,312042))`
   const quote=await liveQuote(tx,uid,sku,offerVersion,beta)
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
    const orders=await tx`select id,sku,title,amount_kopecks as "amountKopecks",status,
     created_at as "createdAt",paid_at as "paidAt",refunded_at as "refundedAt"
     from bricklab.commerce_orders where user_id=${uid} and environment='live'
     order by created_at desc,id limit 50`;
    return {...account,orders};
   });
  }
 };
}
