
import {ProjectError} from '../projects.js'
export function bureauStore(scope){
 const missing=()=>new ProjectError(404,'not_found')
 const denied=()=>new ProjectError(403,'bureau_forbidden')
 const limit=()=>new ProjectError(409,'bureau_limit')
 const lock=(tx,id)=>tx`select pg_advisory_xact_lock(hashtextextended(${id}::text,812731))`
 const role=async(tx,id)=>{const [r]=await tx`select bricklab.bureau_role(${id}) as role`;if(!r?.role)throw missing();return r.role}
 const writable=async(tx,id)=>{if(!['owner','editor'].includes(await role(tx,id)))throw denied()}
 const own=async(tx,id)=>{if(await role(tx,id)!=='owner')throw denied()}
 async function quota(tx,id,doc,create){
  const [n]=await tx`select count(*)::int as n from bricklab.bureau_projects where bureau_id=${id}`
  if(create&&n.n>=10)throw limit()
  const [size]=await tx`select coalesce(sum(octet_length(r.document::text)),0)::text as n from bricklab.bureau_revisions r join bricklab.bureau_projects p on p.id=r.project_id where p.bureau_id=${id}`
  if(Number(size.n)+Buffer.byteLength(JSON.stringify(doc))*2>64*1024*1024)throw new ProjectError(409,'storage_limit')
 }
 return {
  listBureaus:uid=>scope(uid,tx=>tx`select id,name,bricklab.bureau_role(id) as role from bricklab.bureaus order by created_at,id limit 50`),
  createBureau:(uid,name)=>scope(uid,async tx=>{
   await lock(tx,uid)
   const [n]=await tx`select count(*)::int as n from bricklab.bureaus where owner_id=${uid}`;if(n.n>=5)throw limit()
   const [b]=await tx`insert into bricklab.bureaus(owner_id,name) values(${uid},${name}) returning id,name`;return {...b,role:'owner'}
  }),
  getBureau:(uid,id)=>scope(uid,async tx=>{
   const [b]=await tx`select id,name,bricklab.bureau_role(id) as role from bricklab.bureaus where id=${id}`;if(!b)throw missing()
   const members=b.role==='owner'?await tx`select id,display_name as "displayName",role,status from bricklab.bureau_members where bureau_id=${id} order by display_name,id`:[]
   const projects=b.role==='pending'?[]:await tx`select id,name,head_revision as revision,updated_at as "updatedAt" from bricklab.bureau_projects where bureau_id=${id} order by updated_at desc,id`
   return {...b,members,projects}
  }),
  inviteBureau:(uid,id,profileId,memberRole)=>scope(uid,async tx=>{
   await lock(tx,id);await own(tx,id)
   const [p]=await tx`select user_id,display_name from bricklab.public_profiles where public_id=${profileId}`;if(!p)throw missing();if(p.user_id===uid)throw denied()
   const [n]=await tx`select count(*)::int as n from bricklab.bureau_members where bureau_id=${id}`;if(n.n>=10)throw limit()
   const [old]=await tx`select id from bricklab.bureau_members where bureau_id=${id} and user_id=${p.user_id}`;if(old)throw new ProjectError(409,'already_invited')
   await tx`insert into bricklab.bureau_members(bureau_id,user_id,display_name,role) values(${id},${p.user_id},${p.display_name},${memberRole})`
  }),
  respondBureau:(uid,id,accept)=>scope(uid,async tx=>{
   await lock(tx,id)
   if(await role(tx,id)!=='pending')throw denied()
   if(accept)await tx`update bricklab.bureau_members set status='active' where bureau_id=${id} and user_id=${uid} and status='pending'`
   else await tx`delete from bricklab.bureau_members where bureau_id=${id} and user_id=${uid} and status='pending'`
  }),
  manageBureauMember:(uid,id,memberId,memberRole)=>scope(uid,async tx=>{
   await lock(tx,id);await own(tx,id)
   const rows=memberRole===null?await tx`delete from bricklab.bureau_members where bureau_id=${id} and id=${memberId} returning id`:await tx`update bricklab.bureau_members set role=${memberRole} where bureau_id=${id} and id=${memberId} returning id`
   if(!rows.length)throw missing()
  }),
  leaveBureau:(uid,id)=>scope(uid,async tx=>{await lock(tx,id);if(await role(tx,id)==='owner')throw denied();await tx`delete from bricklab.bureau_members where bureau_id=${id} and user_id=${uid}`}),
  createBureauProject:(uid,id,doc,author)=>scope(uid,async tx=>{
   await lock(tx,id);await writable(tx,id);await quota(tx,id,doc,true)
   const [p]=await tx`insert into bricklab.bureau_projects(bureau_id,name) values(${id},${doc.name}) returning id,name,head_revision as revision`
   await tx`insert into bricklab.bureau_revisions(project_id,revision,author_id,author_name,document) values(${p.id},1,${uid},${author},${tx.json(doc)})`;return p
  }),
  getBureauProject:(uid,id,pid,revision=null)=>scope(uid,async tx=>{
   const [p]=await tx`select p.id,p.name,p.head_revision as "headRevision",r.revision,r.document from bricklab.bureau_projects p join bricklab.bureau_revisions r on r.project_id=p.id and r.revision=coalesce(${revision}::int,p.head_revision) where p.bureau_id=${id} and p.id=${pid}`;if(!p)throw missing();return p
  }),
  listBureauRevisions:(uid,id,pid)=>scope(uid,async tx=>{
   const [p]=await tx`select id from bricklab.bureau_projects where bureau_id=${id} and id=${pid}`;if(!p)throw missing()
   return tx`select revision,author_name as author,created_at as "createdAt" from bricklab.bureau_revisions where project_id=${pid} order by revision desc limit 50`
  }),
  saveBureauProject:(uid,id,pid,expected,doc,author)=>scope(uid,async tx=>{
   await lock(tx,id);await writable(tx,id)
   const [p]=await tx`select id,name,head_revision as revision from bricklab.bureau_projects where bureau_id=${id} and id=${pid} for update`;if(!p)throw missing()
   if(p.revision!==expected)throw new ProjectError(409,'revision_conflict',{currentRevision:p.revision})
   const [same]=await tx`select document=${tx.json(doc)}::jsonb as equal from bricklab.bureau_revisions where project_id=${pid} and revision=${expected}`;if(same?.equal)return p
   if(expected>=50)throw new ProjectError(409,'revision_limit')
   await quota(tx,id,doc,false)
   await tx`insert into bricklab.bureau_revisions(project_id,revision,author_id,author_name,document) values(${pid},${expected+1},${uid},${author},${tx.json(doc)})`
   const [saved]=await tx`update bricklab.bureau_projects set name=${doc.name},head_revision=${expected+1},updated_at=now() where id=${pid} returning id,name,head_revision as revision`;return saved
  })
 }
}
