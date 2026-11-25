import {themeIds} from '../src/menu/store-themes.js'
import {createHash,timingSafeEqual} from 'node:crypto'
import {ProjectError} from './projects.js'
import {instructionAccess} from './instruction-access.js'
import {canonicalInstructionUrl} from '../src/sets/instruction-url.js'
const checkout='https://auth.robokassa.ru/Merchant/Index.aspx'
export function paymentConfig(env=process.env){
 const login=env.BRICKLAB_ROBOKASSA_LOGIN??'',p1=env.BRICKLAB_ROBOKASSA_TEST_PASSWORD1??'',p2=env.BRICKLAB_ROBOKASSA_TEST_PASSWORD2??''
 // Intentionally no live mode in this release. Test and live credentials must differ.
 const enabled=env.BRICKLAB_PAYMENTS_ENABLED==='true'&&env.BRICKLAB_ROBOKASSA_TEST==='true'&&env.BRICKLAB_ROBOKASSA_HASH==='sha256'&&/^[A-Za-z0-9_-]{1,100}$/.test(login)&&p1.length>=8&&p2.length>=8&&p1!==p2&&!([env.BRICKLAB_ROBOKASSA_PASSWORD1,env.BRICKLAB_ROBOKASSA_PASSWORD2].filter(Boolean).some(p=>p===p1||p===p2))
 return {enabled,login,p1,p2}
}
export function amountKopecks(value){
 if(typeof value!=='string'||!/^\d{1,8}(?:\.\d{1,8})?$/.test(value))return null
 const [whole,frac='']=value.split('.')
 if(/[^0]/.test(frac.slice(2)))return null
 const n=Number(whole)*100+Number(frac.slice(0,2).padEnd(2,'0'))
 return Number.isSafeInteger(n)&&n>0&&n<=10000000?n:null
}
const digest=(s)=>createHash('sha256').update(s,'utf8').digest('hex')
const invoiceValid=id=>/^[1-9]\d{0,9}$/.test(id)&&Number(id)<=2147483647
export function makeTestCheckout(config,order,title){
 if(!config.enabled||order.status!=='pending'||!invoiceValid(String(order.invoice)))throw new ProjectError(409,'checkout_unavailable')
 const amount=(order.amountKopecks/100).toFixed(2)
 const url=new URL(checkout)
 url.search=new URLSearchParams({MerchantLogin:config.login,OutSum:amount,InvId:String(order.invoice),Description:title,IsTest:'1',SignatureValue:digest([config.login,amount,order.invoice,config.p1].join(':'))}).toString()
 return url.href
}
export function verifyTestResult(params,config){
 if(!config.enabled)return null
 for(const key of ['OutSum','InvId','SignatureValue'])if(params.getAll(key).length!==1)return null
 // This integration never sends Shp_ fields; reject them rather than accepting an unsigned variant.
 for(const key of params.keys())if(/^shp_/i.test(key))return null
 const sum=params.get('OutSum'),id=params.get('InvId'),sig=params.get('SignatureValue')
 if(!invoiceValid(id)||!(/^[a-f0-9]{64}$/i.test(sig)))return null
 const amount=amountKopecks(sum);if(amount===null)return null
 const expected=digest([sum,id,config.p2].join(':'))
 if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(sig,'hex')))return null
 return {invoice:Number(id),amount}
}
function reply(res,status,data,plain=false){
 const body=plain?String(data):JSON.stringify(data)
 res.writeHead(status,{'Content-Type':plain?'text/plain; charset=utf-8':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)})
 res.end(body)
}
async function body(req,type){
 if(req.headers['content-type']?.split(';')[0].trim()!==type)throw new ProjectError(415,'invalid_content_type')
 let size=0;const chunks=[]
 for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>8192){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
 return Buffer.concat(chunks).toString('utf8')
}
export function createPaymentsHandler({store,origin,config=paymentConfig(),logger=console,instructionRelease=false,instructionPolicy=null,yookassa=null,regions=null}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 async function session(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(token||'')?await store.getSession(digest(token)):null}
 return async(req,res,path)=>{
  if(!['/api/commerce/test-checkout','/api/commerce/test-status','/api/commerce/instruction-regions'].includes(path)&&path!=='/api/commerce/instruction-access'&&path!=='/api/commerce/account'&&path!=='/api/store/catalog'&&!path.startsWith('/api/payments/')&&path!=='/api/store/orders'&&path!=='/api/store/finance')return false
  if(active>=12){reply(res,429,{error:'too_many_attempts'});return true}
  active++
  try{
   if(path==='/api/store/catalog'&&req.method==='GET'){reply(res,200,{products:await store.storeCatalog(),mode:config.enabled?'test':'disabled',live:false});return true}
   if(path==='/api/payments/robokassa/result'){
    if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
    if(!config.enabled)throw new ProjectError(503,'payments_disabled')
    const data=verifyTestResult(new URLSearchParams(await body(req,'application/x-www-form-urlencoded')),config)
    if(!data)throw new ProjectError(400,'invalid_payment_signature')
    if(!await store.confirmTestOrder(data.invoice,data.amount))throw new ProjectError(409,'payment_mismatch')
    reply(res,200,'OK'+data.invoice,true);return true
   }
   if(path==='/api/payments/yookassa/test-result'){
    if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
    if(!yookassa?.enabled)throw new ProjectError(503,'yookassa_test_disabled')
    let event;try{event=JSON.parse(await body(req,'application/json'))}catch(e){if(e instanceof ProjectError)throw e;throw new ProjectError(400,'invalid_json')}
    reply(res,200,await yookassa.notification(event));return true
   }
   if(path==='/api/commerce/instruction-regions'){
    if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
    const q=new URL(req.url,'http://localhost').searchParams,setId=q.get('set'),pdfId=q.get('pdf'),page=Number(q.get('page'))
    if(!/^\d{3,7}-\d{1,2}$/.test(setId??'')||!/^\d{1,12}$/.test(pdfId??'')||!Number.isInteger(page)||page<1||page>5000||q.size!==3)throw new ProjectError(400,'invalid_instruction')
    const viewer=instructionRelease?await session(req):null,account=viewer?await store.commerceAccount(viewer.id):null
    const policy=(instructionPolicy?.access??instructionAccess)({setId,book:'https://www.lego.com/biassets/bi/'+pdfId+'.pdf',page,account,release:instructionRelease})
    if(!policy.interactive)throw new ProjectError(403,'interactive_locked')
    const audited=instructionPolicy?.regions(setId,pdfId,page);reply(res,200,{regions:policy.supported?(audited??[]):regions?await regions(setId,pdfId,page):[]});return true
   }
   if(path==='/api/commerce/instruction-access'){
    if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
    const q=new URL(req.url,'http://localhost').searchParams,setId=q.get('set'),book=canonicalInstructionUrl(q.get('book')),page=Number(q.get('page'))
    if(!/^\d{3,7}-\d{1,2}$/.test(setId??'')||!book||!Number.isInteger(page)||page<1||page>5000||q.size!==3)throw new ProjectError(400,'invalid_instruction')
    const viewer=instructionRelease?await session(req):null
    const account=viewer?await store.commerceAccount(viewer.id):null
    reply(res,200,(instructionPolicy?.access??instructionAccess)({setId,book,page,account,release:instructionRelease}));return true
   }
   const user=await session(req);if(!user)throw new ProjectError(401,'unauthenticated')
   if(path==='/api/commerce/account'){
    if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
    reply(res,200,await store.commerceAccount(user.id));return true
   }
   if(!user.admin)throw new ProjectError(403,'admin_required')
   if(path==='/api/commerce/test-status'&&req.method==='GET'){reply(res,200,{enabled:yookassa?.enabled===true,mode:'test'});return true}
   if(path==='/api/commerce/test-checkout'&&req.method==='POST'){
    if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
    if(!yookassa?.enabled)throw new ProjectError(503,'yookassa_test_disabled')
    let data;try{data=JSON.parse(await body(req,'application/json'))}catch(e){if(e instanceof ProjectError)throw e;throw new ProjectError(400,'invalid_json')}
    if(!data||typeof data.sku!=='string'||!(/^[a-z0-9-]{1,60}$/.test(data.sku))||data.testConsent!==true||Object.keys(data).some(k=>!['sku','testConsent'].includes(k)))throw new ProjectError(400,'invalid_order')
    reply(res,200,await yookassa.checkout(user.id,data.sku));return true
   }
   if(path==='/api/store/orders'&&req.method==='GET'){reply(res,200,{orders:await store.testOrders(user.id),mode:'test'});return true}
   if(path==='/api/store/finance'&&req.method==='GET'){reply(res,200,{...await store.testFinance(user.id),mode:'test'});return true}
   if(path==='/api/store/orders'&&req.method==='POST'){
    if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
    if(!config.enabled)throw new ProjectError(503,'payments_disabled')
    let data;try{data=JSON.parse(await body(req,'application/json'))}catch(e){if(e instanceof ProjectError)throw e;throw new ProjectError(400,'invalid_json')}
    if(!data||!themeIds.includes(data.sku)||data.testConsent!==true||Object.keys(data).some(k=>!['sku','testConsent'].includes(k)))throw new ProjectError(400,'invalid_order')
    const product=(await store.storeCatalog()).find(p=>p.sku===data.sku)
    if(!product)throw new ProjectError(404,'unknown_product')
    const order=await store.createTestOrder(user.id,product.sku)
    reply(res,200,{order,checkoutUrl:order.status==='pending'?makeTestCheckout(config,order,product.title):null,mode:'test'});return true
   }
   throw new ProjectError(405,'method_not_allowed')
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Store operation failed:',e.code||e.name);reply(res,503,{error:'store_unavailable'})}}
  finally{active--}
  return true
 }
}
