import postgres from 'postgres'
import { ProjectError } from '../projects.js'

export function connectAuthStore(env = process.env) {
  const sql = postgres({
    host: env.PGHOST || '127.0.0.1',
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || 'bricklab',
    username: env.PGUSER || 'bricklab_app',
    password: env.PGPASSWORD,
    max: 10, connect_timeout: 5, idle_timeout: 30,
    ssl: env.PGSSL === 'require' ? 'verify-full' : false,
  })
  // The transaction-local owner context cannot leak across pooled requests.
  const scope = (uid, fn) => sql.begin(async tx => {
    await tx`select set_config('bricklab.user_id', ${uid}, true)`
    return fn(tx)
  })
  const lock = (tx, uid) => tx`select pg_advisory_xact_lock(hashtextextended(${uid}::text, 312042))`
  async function quota(tx, doc, creating) {
    const [count] = await tx`select count(*)::int as n from bricklab.projects`
    if (creating && count.n >= 20) throw new ProjectError(409,'project_limit')
    const [size] = await tx`select coalesce(sum(octet_length(document::text)),0)::text as n from bricklab.project_revisions`
    if (Number(size.n) + Buffer.byteLength(JSON.stringify(doc)) * 2 > 64 * 1024 * 1024) throw new ProjectError(409,'storage_limit')
  }
  const missing = () => new ProjectError(404,'not_found')
  return {
    async ready() { await sql`select 1 from bricklab.sessions limit 1`; await sql`select 1 from bricklab.projects limit 1`; await sql`select 1 from bricklab.profiles limit 1`; await sql`select 1 from bricklab.workshop_awards limit 1` },
    async register({ email, displayName, passwordHash, tokenHash, expiresAt }) {
      return sql.begin(async tx => {
        const [user] = await tx`insert into bricklab.users (email, display_name, password_hash)
          values (${email}, ${displayName}, ${passwordHash})
          returning id, email, display_name as "displayName"`
        await tx`insert into bricklab.sessions (token_hash, user_id, expires_at)
          values (${tokenHash}, ${user.id}, ${expiresAt})`
        return user
      })
    },
    async findUser(email) {
      const [user] = await sql`select id, email, display_name as "displayName", password_hash as "passwordHash"
        from bricklab.users where lower(email) = ${email}`
      return user
    },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      await sql.begin(async tx => {
        if (previousHash) await tx`delete from bricklab.sessions where token_hash = ${previousHash}`
        await tx`insert into bricklab.sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`
      })
    },
    async getSession(tokenHash) {
      const [user] = await sql`select u.id, u.email, u.display_name as "displayName"
        from bricklab.sessions s join bricklab.users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.expires_at > now()`
      return user
    },
    async deleteSession(tokenHash) {
      await sql`delete from bricklab.sessions where token_hash = ${tokenHash}`
    },
    async listProjects(uid) {
      return scope(uid, tx => tx`select id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt" from bricklab.projects order by updated_at desc,id limit 20`)
    },
    async createProject(uid,doc) {
      return scope(uid, async tx => {
        await lock(tx,uid); await quota(tx,doc,true)
        const [p]=await tx`insert into bricklab.projects (owner_id,name) values (${uid},${doc.name}) returning id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt"`
        await tx`insert into bricklab.project_revisions (project_id,revision,author_id,document) values (${p.id},1,${uid},${tx.json(doc)})`
        await tx`insert into bricklab.workshop_awards(user_id,award) values(${uid},'firstCloudSave') on conflict do nothing`
        return p
      })
    },
    async saveProject(uid,id,expected,doc) {
      return scope(uid, async tx => {
        await lock(tx,uid)
        const [p]=await tx`select id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt" from bricklab.projects where id=${id} for update`
        if(!p)throw missing()
        if(p.revision!==expected)throw new ProjectError(409,'revision_conflict',{currentRevision:p.revision})
        const [same]=await tx`select document=${tx.json(doc)}::jsonb as equal from bricklab.project_revisions where project_id=${id} and revision=${expected}`
        if(same?.equal)return p
        if(p.revision>=20)throw new ProjectError(409,'revision_limit')
        await quota(tx,doc,false)
        const next=p.revision+1
        await tx`insert into bricklab.project_revisions (project_id,revision,author_id,document) values (${id},${next},${uid},${tx.json(doc)})`
        const [saved]=await tx`update bricklab.projects set name=${doc.name},head_revision=${next},updated_at=now() where id=${id} returning id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt"`
        return saved
      })
    },
    async getProject(uid,id,revision) {
      return scope(uid,async tx=>{
        const [p]=await tx`select p.id,p.name,p.head_revision as "headRevision",r.revision,r.document,r.created_at as "savedAt",p.updated_at as "updatedAt" from bricklab.projects p join bricklab.project_revisions r on r.project_id=p.id and r.revision=coalesce(${revision}::integer,p.head_revision) where p.id=${id}`
        if(!p)throw missing()
        return p
      })
    },
    async listRevisions(uid,id) {
      return scope(uid,async tx=>{
        const [p]=await tx`select id from bricklab.projects where id=${id}`
        if(!p)throw missing()
        return tx`select revision,created_at as "savedAt" from bricklab.project_revisions where project_id=${id} order by revision desc limit 20`
      })
    },
    async getProfile(uid) {
      return scope(uid,async tx=>{
        const [p]=await tx`select bio,cover from bricklab.profiles where user_id=${uid}`
        const awards=await tx`select award,awarded_at as "awardedAt" from bricklab.workshop_awards where user_id=${uid} order by awarded_at`
        return {...(p??{bio:'',cover:'blueprint'}),awards}
      })
    },
    async saveProfile(uid,p) {
      return scope(uid,tx=>tx`insert into bricklab.profiles(user_id,bio,cover) values(${uid},${p.bio},${p.cover})
        on conflict(user_id) do update set bio=excluded.bio,cover=excluded.cover,updated_at=now()`)
    },
    async cleanup() { await sql`delete from bricklab.sessions where expires_at <= now()` },
    async close() { await sql.end({ timeout: 5 }) },
  }
}
