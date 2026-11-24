import { AuthError, authOriginAllowed } from './auth-client.js?v=cloud-auth-1'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function route(id){if(!uuid.test(id))throw new AuthError('invalid_project');return '/'+id}
function revision(n){if(!Number.isSafeInteger(n)||n<1)throw new AuthError('invalid_revision');return n}
export function cloudLink(record,ownerId){
 const c=record?.cloud
 return c&&ownerId&&c.kind!=='bureau'&&c.ownerId===ownerId&&uuid.test(c.id)&&Number.isSafeInteger(c.revision)&&c.revision>0?c:null
}
// Keep independent local copies, but display each matching cloud head only once.
export function mergeProjectGallery(local,remote,ownerId) {
 const pending=new Map(ownerId?remote.map(p=>[p.id,p]):[])
 const entries=local.map(project=>{
   const link=cloudLink(project,ownerId)
   const cloud=link?pending.get(link.id):undefined
   if(cloud)pending.delete(cloud.id)
   return {project,cloud}
 })
 return [...entries,...Array.from(pending.values(),cloud=>({cloud}))]
}
export function createProjectsClient({fetcher=globalThis.fetch,location=globalThis.location}={}){
 async function request(path='',method='GET',body,signal){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  let res,data
  try{
   res=await fetcher('/api/projects'+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal,headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
   data=await res.json()
  }catch{throw new AuthError('projects_unavailable')}
  if(!res.ok){const e=new AuthError(typeof data?.error==='string'?data.error:'projects_unavailable',res.status);e.currentRevision=data?.currentRevision;throw e}
  return data
 }
 const project=async promise=>{const p=(await promise)?.project;if(!uuid.test(p?.id)||!Number.isSafeInteger(p.revision)||p.revision<1)throw new AuthError('projects_unavailable');return p}
 return {
  async list(){const a=(await request())?.projects;if(!Array.isArray(a))throw new AuthError('projects_unavailable');return a},
  create:document=>project(request('','POST',{document})),
  save:(id,expectedRevision,document)=>project(request(route(id),'PUT',{expectedRevision:revision(expectedRevision),document})),
  get:(id,n,signal)=>project(request(route(id)+(n===undefined?'':'/revisions/'+revision(n)),'GET',undefined,signal)),
  async revisions(id){const a=(await request(route(id)+'/revisions'))?.revisions;if(!Array.isArray(a))throw new AuthError('projects_unavailable');return a}
 }
}
