import {AuthError,authOriginAllowed} from './auth-client.js?v=cloud-auth-1'
export function createCommunityClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function call(method='GET',body,path='/me'){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let r,d;try{r=await fetcher('/api/community'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});d=await r.json()}catch{throw new AuthError('community_unavailable')}
  if(!r.ok)throw new AuthError(d?.error??'community_unavailable',r.status)
  if(path!=='/me'){if(!Array.isArray(d?.builds))throw new AuthError('community_unavailable');return d.builds}
  if(d?.profile!==null&&(!/^[0-9a-f-]{36}$/i.test(d?.profile?.id)||typeof d.profile.displayName!=='string'||typeof d.profile.bio!=='string'))throw new AuthError('community_unavailable')
  return d.profile
 }
 return {get:()=>call(),publish:({displayName,bio,showAvatar,showCover,showBackground})=>call('PUT',{displayName,bio,showAvatar,showCover,showBackground}),unpublish:()=>call('DELETE'),builds:()=>call('GET',undefined,'/me/builds'),publishBuild:(id,{revision,description,consent,category})=>call('PUT',{revision,description,consent,category},'/me/builds/'+encodeURIComponent(id)),unpublishBuild:id=>call('DELETE',undefined,'/me/builds/'+encodeURIComponent(id))}
}
