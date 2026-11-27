import {AuthError,authOriginAllowed} from './auth-client.js?v=cloud-auth-1'
export function createProfileClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function call(body,kind=null,remove=false){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let r,d
  try{r=await fetcher('/api/profile'+(kind?'/'+kind:''),{method:remove?'DELETE':body===undefined?'GET':'PUT',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':kind?body.type:'application/json'})},...(body===undefined?{}:{body:kind?body:JSON.stringify(body)})});d=await r.json()}catch{throw new AuthError('profile_unavailable')}
  if(!r.ok)throw new AuthError(d?.error??'profile_unavailable',r.status)
  if(typeof d?.profile?.bio!=='string'||!['blueprint','graphite','amber'].includes(d.profile.cover)||!Number.isSafeInteger(d?.progress?.xp)||!Array.isArray(d.progress.awards))throw new AuthError('profile_unavailable')
  return d
 }
 async function verify(input){if(!authOriginAllowed(location))throw new AuthError('https_required');let r,d;try{r=await fetcher('/api/profile/verify',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(input)});d=await r.json()}catch{throw new AuthError('verification_unavailable')}if(!r.ok)throw new AuthError(d?.error??'verification_unavailable',r.status);return d}
 return {verify,get:()=>call(),save:({bio,cover,background,displayName,supportBadge,plusTheme,showcase,achievementStyle})=>call({bio,cover,...(achievementStyle===undefined?{}:{achievementStyle}),...(showcase===undefined?{}:{showcase}),...(plusTheme===undefined?{}:{plusTheme}),...(supportBadge===undefined?{}:{supportBadge}),...(displayName===undefined?{}:{displayName}),...(background===undefined?{}:{background})}),upload:(kind,file)=>call(file,kind),remove:kind=>call(undefined,kind,true)}
}
