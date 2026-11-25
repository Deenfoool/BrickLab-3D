export function storeOrders(sql,scope){
 return {
  async storeCatalog(){return sql`select sku,title,amount_kopecks as "amountKopecks" from bricklab.store_products where active order by amount_kopecks,sku`},
  async createTestOrder(uid,sku){return scope(uid,async tx=>{const [r]=await tx`select invoice,sku,amount_kopecks as "amountKopecks",status from bricklab.create_test_order(${sku})`;return r})},
  async confirmTestOrder(invoice,amount){const [r]=await sql`select bricklab.confirm_test_order(${invoice}::integer,${amount}::integer) as ok`;return r.ok===true},
  async testOrders(uid){return scope(uid,tx=>tx`select invoice,sku,amount_kopecks as "amountKopecks",status,created_at as "createdAt",paid_at as "paidAt" from bricklab.store_test_orders where user_id=${uid} order by invoice desc limit 50`)},
  async testFinance(uid){return scope(uid,async tx=>{
   const [stats]=await tx`select count(*)::int as total,count(*) filter(where status='paid')::int as paid,coalesce(sum(amount_kopecks) filter(where status='paid'),0)::text as "testKopecks" from bricklab.store_test_orders where bricklab.is_admin()`
   const orders=await tx`select invoice,sku,amount_kopecks as "amountKopecks",status,created_at as "createdAt",paid_at as "paidAt" from bricklab.store_test_orders where bricklab.is_admin() order by invoice desc limit 50`
   return {stats,orders}
  })}
 }
}
