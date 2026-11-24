import {AuthError,authOriginAllowed} from './auth-client.js?v=cloud-auth-1'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function bureauLink(record,uid){const c=record?.cloud;return c?.kind==='bureau'&&c.ownerId===uid&&uuid.test(c.bureauId)&&uuid.test(c.id)&&Number.isInteger(c.revision)&&c.revision>0?c:null}
export function profileId(value){const s=String(value).trim(),m=/(?:^|[#/])community\/profile\/([0-9a-f-]{36})\/?$/i.exec(s);const id=m?.[1]??s;return uuid.test(id)?id:null}
export function createBureauClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function request(path='',method='GET',body,signal){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let r,d
  try{r=await fetcher('/api/bureaus'+path,{method,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});d=await r.json()}catch(e){if(signal?.aborted)throw e;throw new AuthError('bureau_unavailable')}
  if(!r.ok){const e=new AuthError(d?.error??'bureau_unavailable',r.status);e.currentRevision=d?.currentRevision;throw e}
  return d
 }
 return {request}
}
