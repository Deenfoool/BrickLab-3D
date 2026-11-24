import postgres from 'postgres'
import { ProjectError } from '../projects.js'
import { backgroundInventory } from '../profile-media.js'

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
    async ready() { await sql`select 1 from bricklab.sessions limit 1`; await sql`select 1 from bricklab.projects limit 1`; await sql`select 1 from bricklab.profiles limit 1`; await sql`select 1 from bricklab.workshop_awards limit 1`; await sql`select 1 from bricklab.profile_media limit 1`; await sql`select 1 from bricklab.cosmetic_entitlements limit 1`; await sql`select 1 from bricklab.project_favorites limit 1`; await sql`select 1 from bricklab.award_reads limit 1`; await sql`select 1 from bricklab.public_profiles limit 1`; await sql`select 1 from bricklab.public_builds limit 1` },
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
        const [p]=await tx`select bio,cover,background from bricklab.profiles where user_id=${uid}`
        const awards=await tx`select award,awarded_at as "awardedAt" from bricklab.workshop_awards where user_id=${uid} order by awarded_at`
        const media=await tx`select kind,version from bricklab.profile_media where user_id=${uid}`
        const entitlements=await tx`select item from bricklab.cosmetic_entitlements where user_id=${uid}`
        const inventory=backgroundInventory(awards,entitlements)
        const profile=p??{bio:'',cover:'blueprint',background:'default'}
        if(!inventory.some(i=>i.id===profile.background&&i.owned))profile.background='default'
        return {...profile,awards,inventory,avatarUrl:media.find(m=>m.kind==='avatar')?'/api/profile/avatar?v='+media.find(m=>m.kind==='avatar').version:null,coverUrl:media.find(m=>m.kind==='cover')?'/api/profile/cover?v='+media.find(m=>m.kind==='cover').version:null}
      })
    },
    async saveProfile(uid,p) {
      return scope(uid,async tx=>{
        await tx`insert into bricklab.profiles(user_id,bio,cover) values(${uid},${p.bio},${p.cover}) on conflict(user_id) do update set bio=excluded.bio,cover=excluded.cover,updated_at=now()`
        if(p.background!==undefined){
          const awards=await tx`select award from bricklab.workshop_awards where user_id=${uid}`
          const entitlements=await tx`select item from bricklab.cosmetic_entitlements where user_id=${uid}`
          if(!backgroundInventory(awards,entitlements).some(i=>i.id===p.background&&i.owned))throw new ProjectError(403,'background_locked')
          await tx`update bricklab.profiles set background=${p.background} where user_id=${uid}`
        }
      })
    },
    async getMedia(uid,kind){return scope(uid,async tx=>{const [r]=await tx`select image from bricklab.profile_media where user_id=${uid} and kind=${kind}`;return r?.image})},
    async saveMedia(uid,kind,image){return scope(uid,tx=>tx`insert into bricklab.profile_media(user_id,kind,image) values(${uid},${kind},${image}) on conflict(user_id,kind) do update set image=excluded.image,version=gen_random_uuid()`)},
    async deleteMedia(uid,kind){return scope(uid,tx=>tx`delete from bricklab.profile_media where user_id=${uid} and kind=${kind}`)},
    async getActivity(uid){
      return scope(uid,async tx=>{
        const favorites=await tx`select f.project_id as id,p.name,p.head_revision as revision from bricklab.project_favorites f join bricklab.projects p on p.id=f.project_id where f.user_id=${uid} order by f.created_at desc,p.id`
        const events=await tx`select r.project_id as "projectId",r.revision,r.document->>'name' as name,r.created_at as "at" from bricklab.project_revisions r join bricklab.projects p on p.id=r.project_id order by r.created_at desc,r.project_id,r.revision desc limit 100`
        const notifications=await tx`select a.award,a.awarded_at as "at",(r.award is not null) as read from bricklab.workshop_awards a left join bricklab.award_reads r on r.user_id=a.user_id and r.award=a.award where a.user_id=${uid} order by a.awarded_at desc,a.award`
        const [size]=await tx`select coalesce(sum(octet_length(document::text)),0)::bigint as bytes from bricklab.project_revisions`
        return {favorites,events,notifications,bytes:Number(size.bytes)}
      })
    },
    async setFavorite(uid,id,add){
      return scope(uid,async tx=>{
        const [p]=await tx`select id from bricklab.projects where id=${id}`
        if(!p)throw missing()
        if(add)await tx`insert into bricklab.project_favorites(user_id,project_id) values(${uid},${id}) on conflict do nothing`
        else await tx`delete from bricklab.project_favorites where user_id=${uid} and project_id=${id}`
      })
    },
    async readAwards(uid){
      return scope(uid,tx=>tx`insert into bricklab.award_reads(user_id,award) select user_id,award from bricklab.workshop_awards where user_id=${uid} on conflict do nothing`)
    },
    async getOwnCard(uid){return scope(uid,async tx=>{const [p]=await tx`select public_id as id,display_name as "displayName",bio,updated_at as "updatedAt" from bricklab.public_profiles where user_id=${uid}`;return p})},
    async publishCard(uid,p){return scope(uid,tx=>tx`insert into bricklab.public_profiles(user_id,display_name,bio) values(${uid},${p.displayName},${p.bio}) on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,updated_at=now()`)},
    async unpublishCard(uid){return scope(uid,tx=>tx`delete from bricklab.public_profiles where user_id=${uid}`)},
    async getPublicCard(id){const [p]=await sql`select public_id as id,display_name as "displayName",bio,updated_at as "updatedAt" from bricklab.public_profiles where public_id=${id}`;return p},
    async listPublicCards(){return sql`select public_id as id,display_name as "displayName",bio,updated_at as "updatedAt" from bricklab.public_profiles order by updated_at desc,public_id limit 30`},
    async listOwnBuilds(uid){return scope(uid,tx=>tx`select b.public_id as id,b.project_id as "projectId",b.revision,b.title,b.description,b.published_at as "publishedAt" from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where c.user_id=${uid} order by b.published_at desc`)},
    async publishBuild(uid,id,input){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        const [c]=await tx`select public_id from bricklab.public_profiles where user_id=${uid} for update`
        if(!c)throw new ProjectError(409,'public_profile_required')
        const [p]=await tx`select p.id,r.document from bricklab.projects p join bricklab.project_revisions r on r.project_id=p.id and r.revision=${input.revision} where p.id=${id} and p.owner_id=${uid}`
        if(!p)throw missing()
        await tx`insert into bricklab.public_builds(project_id,author_id,revision,title,description,document) values(${id},${c.public_id},${input.revision},${p.document.name},${input.description},${tx.json(p.document)}) on conflict(project_id) do update set revision=excluded.revision,title=excluded.title,description=excluded.description,document=excluded.document,published_at=now()`
      })
    },
    async unpublishBuild(uid,id){return scope(uid,async tx=>{const [p]=await tx`select id from bricklab.projects where id=${id} and owner_id=${uid}`;if(!p)throw missing();await tx`delete from bricklab.public_builds where project_id=${id} and author_id in (select public_id from bricklab.public_profiles where user_id=${uid})`})},
    async listPublicBuilds(author=null){return sql`select b.public_id as id,b.author_id as "authorId",c.display_name as author,b.title,b.description,b.revision,b.published_at as "publishedAt" from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where (${author}::uuid is null or b.author_id=${author}::uuid) order by b.published_at desc,b.public_id limit 30`},
    async getPublicBuild(id,download=false){
      if(download){const [p]=await sql`select document from bricklab.public_builds where public_id=${id}`;return p}
      const [p]=await sql`select b.public_id as id,b.author_id as "authorId",c.display_name as author,b.title,b.description,b.revision,b.published_at as "publishedAt" from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where b.public_id=${id}`;return p
    },
    async cleanup() { await sql`delete from bricklab.sessions where expires_at <= now()` },
    async close() { await sql.end({ timeout: 5 }) },
  }
}
