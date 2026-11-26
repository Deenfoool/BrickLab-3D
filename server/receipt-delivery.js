import {sendPostbox} from './mail.js'

export const validNpdReceiptUrl=value=>typeof value==='string'&&/^https:\/\/lknpd\.nalog\.ru\/api\/v1\/receipt\/[0-9]{12}\/[A-Za-z0-9_-]{1,80}\/print$/.test(value)

export function createReceiptMailer(env=process.env,transport=sendPostbox){
 const username=env.BRICKLAB_MAIL_USER,password=env.BRICKLAB_MAIL_KEY,from=env.BRICKLAB_MAIL_FROM
 if(!username||!password||!from)return null
 return async(order)=>{
  if(!validNpdReceiptUrl(order.receipt_url))throw Error('invalid_receipt_url')
  const num='BL-'+String(order.order_number).padStart(6,'0')
  await transport({username,password,from,to:order.email,subject:'BrickLab 3D — чек НПД '+num,
   text:['Спасибо за покупку в BrickLab 3D!','Заказ: '+num,'Товар: '+order.title,'Сумма: '+(Number(order.amount_kopecks)/100).toFixed(2)+' ₽','Чек ФНС: '+order.receipt_url,'Чек сформирован в «Мой налог». Если у вас есть вопросы, обратитесь в поддержку через сайт.'].join('\n')})
 }
}

// The SQL queue contains only live, paid, externally issued receipts.
// Mail acceptance is not fiscal issuance or proof of inbox delivery.
export function startReceiptDelivery({store,mailer=createReceiptMailer(),logger=console,intervalMs=30000}){
 let active=null,stopped=false
 async function run(){
  for(const order of await store.claimCommerceReceiptDeliveries()){
   if(stopped)break
   try{
    if(!validNpdReceiptUrl(order.receipt_url))throw Error('invalid_receipt_url')
    await mailer(order)
    if(!await store.ackCommerceReceiptDelivery(order.id,order.receipt_url))logger.warn('Receipt mail accepted but acknowledgement not recorded')
   }catch{logger.warn('Receipt email delivery failed; will retry')}
  }
 }
 function tick(){
  if(stopped||active||!mailer)return
  active=run().catch(()=>logger.warn('Receipt delivery queue unavailable')).finally(()=>{active=null})
  return active
 }
 const timer=mailer?setInterval(tick,intervalMs).unref():null
 return {tick,async stop(){stopped=true;clearInterval(timer);await active}}
}
