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
  Content:{Simple:{Subject:{Data:message.subject,Charset:'UTF-8'},Body:{Text:{Data:message.text,Charset:'UTF-8'},...(message.html?{Html:{Data:message.html,Charset:'UTF-8'}}:{})}}}
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
  const formatted=/^\d{6}$/.test(code??'')?code.slice(0,3)+'-'+code.slice(3):String(code??'').replace(/[^a-f0-9]/gi,'')
  const heading=purpose==='test'?'Почтовый сервис подключён':purpose==='register'?'Подтверди регистрацию':'Восстановление пароля'
  const html='<!doctype html><html lang="ru"><body style="margin:0;background:#eff2f6;font-family:Arial,sans-serif;color:#182332"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eff2f6"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:18px;overflow:hidden" cellspacing="0" cellpadding="0"><tr><td style="background:#19212d;padding:24px 30px;color:#fff;font-size:22px;font-weight:bold"><span style="color:#ffb33e">▦</span> BrickLab 3D</td></tr><tr><td style="padding:30px"><h1 style="margin:0 0 14px;font-size:24px">'+heading+'</h1><p style="font-size:15px;line-height:1.6">'+(purpose==='test'?'Письма BrickLab отправляются успешно.':'Введи этот код на сайте BrickLab, чтобы продолжить.')+'</p>'+(purpose==='test'?'':'<div style="background:#f0f3f7;border:1px solid #dce3ed;border-radius:12px;padding:22px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:4px;color:#19212d">'+formatted+'</div><p style="font-size:13px;line-height:1.6;color:#58677b">Код действителен 30 минут. Не передавай его другим. Если ты не запрашивал код, проигнорируй это письмо.</p>')+'</td></tr><tr><td style="padding:20px 30px;background:#f6f8fa;color:#667487;font-size:12px">BrickLab 3D · <a href="https://bricklab-3d.ru/" style="color:#344963">bricklab-3d.ru</a></td></tr></table></td></tr></table></body></html>'
  await transport({username,password,from,to:email,subject,text:/^\d{6}$/.test(code??'')?text.replace(code,formatted):text,html})
 }
}
