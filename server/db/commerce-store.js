import {projectAccount} from '../../src/menu/commerce-catalog.js'

// This is the read side only. No app-role INSERT/UPDATE/DELETE grants and no
// payment acceptance. Test orders can never confer real entitlements.
export function commerceStore(scope){
 return {
  async commerceAccount(uid){
   return scope(uid,async tx=>{
    const rows=await tx`select g.id,g.kind,g.sku,g.target,g.expires_at as "expiresAt"
     from bricklab.commerce_grants g
     join bricklab.commerce_orders o on o.id=g.order_id and o.user_id=g.user_id
     where g.user_id=${uid} and o.environment='live' and o.status='succeeded'
       and g.revoked_at is null and g.granted_at<=now()
       and (g.expires_at is null or g.expires_at>now())
     order by g.granted_at,g.id`;
    const grants=rows.map(g=>({id:g.id,kind:g.kind,sku:g.sku,
     ...(g.kind==='theme'?{themeId:g.target}:{}),
     ...(g.kind==='instruction'?{setId:g.target}:{}),
     ...(g.expiresAt?{expiresAt:new Date(g.expiresAt).getTime()}:{})}));
    const orders=await tx`select id,sku,title,amount_kopecks as "amountKopecks",status,
     created_at as "createdAt",paid_at as "paidAt",refunded_at as "refundedAt"
     from bricklab.commerce_orders where user_id=${uid} and environment='live'
     order by created_at desc,id limit 50`;
    return {...projectAccount(grants),orders};
   });
  }
 };
}
