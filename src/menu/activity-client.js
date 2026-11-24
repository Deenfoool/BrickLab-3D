import {AuthError,authOriginAllowed} from './auth-client.js?v=cloud-auth-1'
export function createActivityClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function call(path='',method='GET'){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let r,d;try{r=await fetcher('/api/activity'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});d=await r.json()}catch{throw new AuthError('activity_unavailable')}
  if(!r.ok)throw new AuthError(d?.error??'activity_unavailable',r.status)
  if(!Array.isArray(d?.favorites)||!Array.isArray(d.events)||!Array.isArray(d.notifications)||!Number.isSafeInteger(d.bytes)||d.bytes<0)throw new AuthError('activity_unavailable')
  return d
 }
 return {get:()=>call(),read:()=>call('/read','POST'),favorite:(id,add)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new AuthError('invalid_project');return call('/favorites/'+id,add?'PUT':'DELETE')}}
}
