import {AuthError,authOriginAllowed} from './auth-client.js?v=cloud-auth-1'
export function createProfileClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function call(body){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let r,d
  try{r=await fetcher('/api/profile',{method:body===undefined?'GET':'PUT',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});d=await r.json()}catch{throw new AuthError('profile_unavailable')}
  if(!r.ok)throw new AuthError(d?.error??'profile_unavailable',r.status)
  if(typeof d?.profile?.bio!=='string'||!['blueprint','graphite','amber'].includes(d.profile.cover)||!Number.isSafeInteger(d?.progress?.xp)||!Array.isArray(d.progress.awards))throw new AuthError('profile_unavailable')
  return d
 }
 return {get:()=>call(),save:({bio,cover})=>call({bio,cover})}
}
