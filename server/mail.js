import {createHash,createHmac} from 'node:crypto'

const host='postbox.cloud.yandex.net'
const path='/v2/email/outbound-emails'
const sha256=value=>createHash('sha256').update(value).digest('hex')
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest()

// Fixed endpoint, region and service. Sign the exact bytes sent over HTTPS.
export function postboxHeaders(username,password,body,now=new Date()){
 const date=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
 const day=date.slice(0,8),scope=day+'/ru-central1/ses/aws4_request'
 const signed='content-type;host;x-amz-date'
 const canonical=['POST',path,'','content-type:application/json\nhost:'+host+'\nx-amz-date:'+date+'\n',signed,sha256(body)].join('\n')
 const toSign=['AWS4-HMAC-SHA256',date,scope,sha256(canonical)].join('\n')
 const key=hmac(hmac(hmac(hmac('AWS4'+password,day),'ru-central1'),'ses'),'aws4_request')
 const signature=hmac(key,toSign).toString('hex')
 return {'content-type':'application/json','host':host,'x-amz-date':date,authorization:'AWS4-HMAC-SHA256 Credential='+username+'/'+scope+', SignedHeaders='+signed+', Signature='+signature}
}

export async function sendPostbox(message,fetcher=globalThis.fetch){
 const body=JSON.stringify({
  FromEmailAddress:message.from,
  Destination:{ToAddresses:[message.to]},
  Content:{Simple:{Subject:{Data:message.subject,Charset:'UTF-8'},Body:{Text:{Data:message.text,Charset:'UTF-8'}}}}
 })
 let response
 try{
  response=await fetcher('https://'+host+path,{
   method:'POST',headers:postboxHeaders(message.username,message.password,body),
   body,redirect:'error',signal:AbortSignal.timeout(12000)
  })
 }catch(error){
  throw Error(error.name==='TimeoutError'?'postbox_timeout':'postbox_connection')
 }
 if(!response.ok){
  // Do not log response content: it may contain personal data or request details.
  await response.body?.cancel().catch(()=>{})
  throw Error('postbox_http_'+response.status)
 }
 const result=await response.json().catch(()=>null)
 if(typeof result?.MessageId!=='string'||!result.MessageId)throw Error('postbox_invalid_response')
 return result.MessageId
}

export function createMailer(env=process.env,transport=sendPostbox){
 const username=env.BRICKLAB_MAIL_USER,password=env.BRICKLAB_MAIL_KEY,from=env.BRICKLAB_MAIL_FROM
 if(!username||!password||!from)return null
 return async({email,purpose,code})=>{
  if(!['register','reset','test'].includes(purpose))throw Error('invalid_mail_purpose')
  const subject=purpose==='test'?'BrickLab — проверка почты':purpose==='register'?'BrickLab — подтверждение регистрации':'BrickLab — восстановление пароля'
  const text=purpose==='test'?'Почтовый сервис BrickLab 3D подключён. Это тестовое письмо, код не требуется.':subject+'\n\nКод / Code: '+code+'\n\nДействует 30 минут. Введите код на сайте BrickLab. Если вы не запрашивали код, проигнорируйте письмо. / Expires in 30 minutes. Enter the code on BrickLab. Ignore this email if you did not request it.'
  await transport({username,password,from,to:email,subject,text})
 }
}
