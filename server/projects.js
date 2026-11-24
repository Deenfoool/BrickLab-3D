import { createHash } from 'node:crypto'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const maxBody = 2 * 1024 * 1024
export class ProjectError extends Error {
  constructor(status, code, details = {}) { super(code); this.status=status; this.details=details }
}
export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.format !== 'bricklab-3d' || doc.version !== 1 ||
      typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 120 ||
      !Array.isArray(doc.parts) || !Array.isArray(doc.connections) ||
      doc.parts.length > 50000 || doc.connections.length > 150000)
    throw new ProjectError(400, 'invalid_document')
  const encoded=JSON.stringify(doc)
  if (Buffer.byteLength(encoded)>maxBody-1024) throw new ProjectError(413,'body_too_large')
  // PostgreSQL jsonb rejects NUL and unpaired surrogates, even in nested strings/keys.
  for (let i=0;i<encoded.length;i++) {
    if(encoded[i]!=='\\')continue
    if(encoded[i+1]==='\\'){i++;continue}
    if(encoded[i+1]!=='u')continue
    const n=parseInt(encoded.slice(i+2,i+6),16)
    if(n===0 || (n>=0xd800&&n<=0xdfff))throw new ProjectError(400,'invalid_document')
    i+=5
  }
  return doc
}
async function body(req) {
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
  if(Number(req.headers['content-length'])>maxBody)throw new ProjectError(413,'body_too_large')
  const chunks=[];let size=0
  for await(const chunk of req.iterator({destroyOnReturn:false})){
    size+=chunk.length
    if(size>maxBody){req.resume();throw new ProjectError(413,'body_too_large')}
    chunks.push(chunk)
  }
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value}
  catch{throw new ProjectError(400,'invalid_json')}
}
function reply(res,status,data){
 const value=JSON.stringify(data)
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(value)})
 res.end(value)
}
export function createProjectsHandler({store,origin,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let activeWrites=0
 return async function projects(req,res,path){
  if(path!=='/api/projects'&&!path.startsWith('/api/projects/'))return false
  try{
   const segments=path.split('/').slice(3)
   const [id,action,revision]=segments
   if((segments.length&&!uuid.test(id))||segments.length>3||(action&&action!=='revisions')||(segments.length===3&&(!/^[1-9]\d{0,8}$/.test(revision)))||(segments.length===2&&!action))throw new ProjectError(404,'not_found')
   const allowed=!id?['GET','POST']:action?['GET']:['GET','PUT']
   if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));throw new ProjectError(405,'method_not_allowed')}
   const write=req.method!=='GET'
   if(write&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
   const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
   if(!user)throw new ProjectError(401,'unauthenticated')
   if(write){
    if(activeWrites>=4)throw new ProjectError(429,'too_many_attempts')
    activeWrites++
    try{
      const data=await body(req),doc=validateDocument(data.document)
      if(req.method==='POST')reply(res,201,{project:await store.createProject(user.id,doc)})
      else{
        if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<1)throw new ProjectError(400,'invalid_revision')
        reply(res,200,{project:await store.saveProject(user.id,id,data.expectedRevision,doc)})
      }
    }finally{activeWrites--}
   }else if(!id)reply(res,200,{projects:await store.listProjects(user.id)})
   else if(action==='revisions'&&!revision)reply(res,200,{revisions:await store.listRevisions(user.id,id)})
   else reply(res,200,{project:await store.getProject(user.id,id,revision?Number(revision):null)})
  }catch(e){
    if(e instanceof ProjectError)reply(res,e.status,{error:e.message,...e.details})
    else {logger.error('Project operation failed:',e.code||e.name);reply(res,503,{error:'projects_unavailable'})}
  }
  return true
 }
}
