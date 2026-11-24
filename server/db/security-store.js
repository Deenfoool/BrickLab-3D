
import {ProjectError} from '../projects.js'
export function securityStore(sql,scope,lock){
 const missing=()=>new ProjectError(404,'not_found')
 const ensure=async tx=>{const [r]=await tx`select bricklab.is_admin() as allowed`;if(!r.allowed)throw new ProjectError(403,'admin_required')}
 return {
  async issueAccountToken(email,purpose,tokenHash){
   return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${email},123521))`
    const [u]=await tx`select u.id,u.blocked_at as blocked,exists(select 1 from bricklab.admin_accounts a where a.user_id=u.id) as admin from bricklab.users u where lower(u.email)=${email}`
    if(purpose==='register'?Boolean(u):!u||u.blocked||u.admin)return false
    const rows=await tx`insert into bricklab.account_tokens(email,purpose,token_hash,expires_at) values(${email},${purpose},${tokenHash},now()+interval '30 minutes')
      on conflict(email,purpose) do update set token_hash=excluded.token_hash,created_at=now(),expires_at=excluded.expires_at
      where account_tokens.created_at<now()-interval '2 minutes' returning email`
    return rows.length===1
   })
  },
  async discardAccountToken(email,purpose,tokenHash){await sql`delete from bricklab.account_tokens where email=${email} and purpose=${purpose} and token_hash=${tokenHash}`},
  async finishAccountToken(email,purpose,tokenHash,passwordHash,displayName){
   return sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtextextended(${email},123521))`
    const [u]=await tx`select u.id,u.blocked_at as blocked,exists(select 1 from bricklab.admin_accounts a where a.user_id=u.id) as admin from bricklab.users u where lower(u.email)=${email}`
    if(purpose==='register'?Boolean(u):!u||u.blocked||u.admin)return false
    if(u){await lock(tx,u.id);const [fresh]=await tx`select blocked_at as blocked from bricklab.users where id=${u.id}`;if(!fresh||fresh.blocked)return false}
    const rows=await tx`delete from bricklab.account_tokens where email=${email} and purpose=${purpose} and token_hash=${tokenHash} and expires_at>now() returning email`
    if(!rows.length)return false
    if(purpose==='register'){
     const inserted=await tx`insert into bricklab.users(email,display_name,password_hash) values(${email},${displayName},${passwordHash}) on conflict do nothing returning id`
     if(!inserted.length)return false
     await tx`update bricklab.users set email_verified_at=now() where id=${inserted[0].id}`
    }else{
     await tx`update bricklab.users set password_hash=${passwordHash},email_verified_at=coalesce(email_verified_at,now()) where id=${u.id}`
     await tx`delete from bricklab.sessions where user_id=${u.id}`
    }
    return true
   })
  },
  async revokeOtherSessions(uid,current){return sql.begin(async tx=>{await lock(tx,uid);await tx`delete from bricklab.sessions where user_id=${uid} and token_hash<>${current}`})},
  async adminOverview(uid){return scope(uid,async tx=>{await ensure(tx);const [r]=await tx`select (select count(id)::int from bricklab.users) as users,(select count(id)::int from bricklab.users where email_verified_at is not null) as verified,(select count(id)::int from bricklab.users where blocked_at is not null) as blocked,(select count(*)::int from bricklab.public_builds) as builds,(select count(*)::int from bricklab.public_profiles) as profiles,((select count(*)::int from bricklab.community_comment_reports where resolved_at is null)+(select count(*)::int from bricklab.community_build_reports where resolved_at is null)) as reports`;return r})},
  async adminUsers(uid,q,offset){return scope(uid,async tx=>{await ensure(tx);return tx`select u.id,u.email,u.display_name as "displayName",u.created_at as "createdAt",u.email_verified_at as "verifiedAt",u.blocked_at as "blockedAt",exists(select 1 from bricklab.admin_accounts a where a.user_id=u.id) as admin from bricklab.users u where (${q}='' or strpos(lower(u.email||' '||u.display_name),lower(${q}))>0) order by u.created_at desc,u.id limit 31 offset ${offset}`})},
  async adminReports(uid,offset){return scope(uid,async tx=>{await ensure(tx);return tx`select c.id,c.body,c.build_id as "buildId",p.display_name as author,count(*)::int as reports,array_agg(distinct r.reason) as reasons,max(r.created_at) as "reportedAt" from bricklab.community_comment_reports r join bricklab.community_comments c on c.id=r.comment_id join bricklab.public_profiles p on p.public_id=c.author_id where r.resolved_at is null group by c.id,p.display_name order by max(r.created_at) desc,c.id limit 31 offset ${offset}`})},
  async adminBuildReports(uid,offset){return scope(uid,async tx=>{await ensure(tx);return tx`select b.public_id as id,b.title,b.description,p.display_name as author,count(*)::int as reports,array_agg(distinct r.reason) as reasons,max(r.created_at) as "reportedAt" from bricklab.community_build_reports r join bricklab.public_builds b on b.public_id=r.build_id join bricklab.public_profiles p on p.public_id=b.author_id where r.resolved_at is null group by b.public_id,p.display_name order by max(r.created_at) desc,b.public_id limit 31 offset ${offset}`})},
  async adminAudit(uid,offset){return scope(uid,async tx=>{await ensure(tx);return tx`select id::text,actor_id as "actorId",action,target_id as "targetId",reason,created_at as "createdAt" from bricklab.admin_audit order by id desc limit 31 offset ${offset}`})},
  async adminAction(uid,action,id,reason){
   return scope(uid,async tx=>{
    await ensure(tx)
    if(['block','unblock','revoke_sessions'].includes(action)){
     const [r]=await tx`select bricklab.admin_account_action(${id},${action}) as ok`;if(!r.ok)throw new ProjectError(409,'admin_protected')
    }else if(['hide_comment','dismiss_reports'].includes(action)){
     const [c]=await tx`select id from bricklab.community_comments where id=${id}`;if(!c)throw missing()
     if(action==='hide_comment')await tx`update bricklab.community_comments set body=null where id=${id}`
     await tx`update bricklab.community_comment_reports set resolved_at=now() where comment_id=${id} and resolved_at is null`
    }else if(action==='dismiss_build_reports'){
     const [b]=await tx`select public_id from bricklab.public_builds where public_id=${id}`;if(!b)throw missing()
     await tx`update bricklab.community_build_reports set resolved_at=now() where build_id=${id} and resolved_at is null`
    }else if(action==='unpublish_build'){
     if(!(await tx`delete from bricklab.public_builds where public_id=${id} returning public_id`).length)throw missing()
    }else if(action==='unpublish_profile'){
     if(!(await tx`delete from bricklab.public_profiles where public_id=${id} returning public_id`).length)throw missing()
    }else throw new ProjectError(400,'invalid_admin_action')
    await tx`insert into bricklab.admin_audit(actor_id,action,target_id,reason) values(${uid},${action},${id},${reason})`
   })
  }
 }
}
