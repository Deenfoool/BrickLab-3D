import {filterPortfolio} from '../../src/menu/portfolio-model.js'
import postgres from 'postgres'
import {securityStore} from './security-store.js'
import {storeOrders} from './store-orders.js'
import {commerceStore,commerceEntitlements} from './commerce-store.js'
import {plusThemeState} from '../../src/menu/commerce-catalog.js'
import {bureauStore} from './bureau-store.js'
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
  async function quota(tx, doc, creating, limits) {
    const [count] = await tx`select count(*)::int as n from bricklab.projects`
    if (creating && count.n >= limits.projects) throw new ProjectError(409,'project_limit')
    const [size] = await tx`select coalesce(sum(octet_length(document::text)),0)::text as n from bricklab.project_revisions`
    if (Number(size.n) + Buffer.byteLength(JSON.stringify(doc)) * 2 > limits.storageMiB * 1024 * 1024) throw new ProjectError(409,'storage_limit')
  }
  const missing = () => new ProjectError(404,'not_found')
  return {
    ...bureauStore(scope),
    ...storeOrders(sql,scope),
    ...commerceStore(scope),
    ...securityStore(sql,scope,lock),
    async ready() { await sql`select 1 from bricklab.commerce_plus_theme limit 1`; await sql`select 1 from bricklab.commerce_badge_selection limit 1`;await sql`select 1 from bricklab.commerce_orders limit 1`;await sql`select 1 from bricklab.commerce_grants limit 1`; await sql`select 1 from bricklab.store_products limit 1`;await sql`select 1 from bricklab.store_test_orders limit 1`;await sql`select 1 from bricklab.store_test_entitlements limit 1`; await sql`select 1 from bricklab.sessions limit 1`; await sql`select 1 from bricklab.projects limit 1`; await sql`select 1 from bricklab.profiles limit 1`; await sql`select 1 from bricklab.workshop_awards limit 1`; await sql`select 1 from bricklab.profile_media limit 1`; await sql`select 1 from bricklab.cosmetic_entitlements limit 1`; await sql`select 1 from bricklab.project_favorites limit 1`; await sql`select 1 from bricklab.award_reads limit 1`; await sql`select cover_theme,background_theme,portfolio,unified from bricklab.public_profiles limit 1`; await sql`select category,part_count,allow_download,allow_comments,images from bricklab.public_builds limit 1`;await sql`select 1 from bricklab.community_bookmarks limit 1`;await sql`select 1 from bricklab.community_build_reports limit 1`;await sql`select 1 from bricklab.community_like_counts limit 1`;await sql`select 1 from bricklab.community_follow_counts limit 1`;await sql`select 1 from bricklab.community_event_counts limit 1`;await sql`select 1 from bricklab.community_comments limit 1`;await sql`select 1 from bricklab.community_comment_reports limit 1`;await sql`select 1 from bricklab.community_reputation limit 1`;await sql`select 1 from bricklab.bureaus limit 1`;await sql`select 1 from bricklab.bureau_members limit 1`;await sql`select 1 from bricklab.bureau_projects limit 1`;await sql`select 1 from bricklab.bureau_revisions limit 1`;await sql`select email_verified_at,blocked_at from bricklab.users limit 1`;await sql`select 1 from bricklab.account_tokens limit 1`;await sql`select 1 from bricklab.admin_accounts limit 1`;await sql`select 1 from bricklab.admin_audit limit 1` },
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
      const [user] = await sql`select u.id,u.email,u.display_name as "displayName",u.password_hash as "passwordHash",exists(select 1 from bricklab.admin_accounts a where a.user_id=u.id) as admin
        from bricklab.users u where lower(u.email) = ${email} and u.blocked_at is null`
      return user
    },
    async createSession(userId, tokenHash, expiresAt, previousHash,expectedHash) {
      return sql.begin(async tx => {
        await lock(tx,userId)
        const [u]=await tx`select password_hash as hash,blocked_at as blocked from bricklab.users where id=${userId}`
        if(!u||u.blocked||(expectedHash!==undefined&&u.hash!==expectedHash))return false
        if (previousHash) await tx`delete from bricklab.sessions where token_hash = ${previousHash}`
        await tx`insert into bricklab.sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`
        return true
      })
    },
    async getSession(tokenHash) {
      const [user] = await sql`select u.id,u.email,u.display_name as "displayName",exists(select 1 from bricklab.admin_accounts a where a.user_id=u.id) as admin
        from bricklab.sessions s join bricklab.users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.expires_at > now() and u.blocked_at is null`
      if(!user)return user
      const {admin,...safe}=user;return admin?{...safe,admin:true}:safe
    },
    async deleteSession(tokenHash) {
      await sql`delete from bricklab.sessions where token_hash = ${tokenHash}`
    },
    async listProjects(uid) {
      return scope(uid, tx => tx`select id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt" from bricklab.projects order by updated_at desc,id`)
    },
    async createProject(uid,doc) {
      return scope(uid, async tx => {
        await lock(tx,uid); const {limits}=await commerceEntitlements(tx,uid); await quota(tx,doc,true,limits)
        const [p]=await tx`insert into bricklab.projects (owner_id,name) values (${uid},${doc.name}) returning id,name,head_revision as revision,created_at as "createdAt",updated_at as "updatedAt"`
        await tx`insert into bricklab.project_revisions (project_id,revision,author_id,document) values (${p.id},1,${uid},${tx.json(doc)})`
        await tx`insert into bricklab.workshop_awards(user_id,award) values(${uid},'firstCloudSave') on conflict do nothing`
        await tx`update bricklab.public_profiles set show_award=true where user_id=${uid} and unified and portfolio->'blocks' @> '[{"key":"awards","visible":true}]'::jsonb`
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
        const {limits}=await commerceEntitlements(tx,uid)
        if(p.revision>=limits.versions)throw new ProjectError(409,'revision_limit')
        await quota(tx,doc,false,limits)
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
        return tx`select revision,created_at as "savedAt" from bricklab.project_revisions where project_id=${id} order by revision desc`
      })
    },
    async getProfile(uid) {
      return scope(uid,async tx=>{
        const [p]=await tx`select bio,cover,background,display_name as "displayName" from bricklab.profiles where user_id=${uid}`
        const awards=await tx`select award,awarded_at as "awardedAt" from bricklab.workshop_awards where user_id=${uid} order by awarded_at`
        const media=await tx`select kind,version from bricklab.profile_media where user_id=${uid}`
        const legacyEntitlements=await tx`select item from bricklab.cosmetic_entitlements where user_id=${uid}`
        const commerce=await commerceEntitlements(tx,uid)
        const [plusChoice]=await tx`select theme,changed_at as "changedAt" from bricklab.commerce_plus_theme where user_id=${uid}`
        const plusTheme=plusThemeState(commerce,plusChoice)
        const entitlements=[...legacyEntitlements,...commerce.themes.map(item=>({item})),...(plusTheme.chosen?[{item:plusTheme.chosen}]:[])]
          const [{admin}]=await tx`select bricklab.is_admin() as admin`
        const inventory=backgroundInventory(awards,entitlements,{admin:admin===true})
        const profile=p??{bio:'',cover:'blueprint',background:'default'}
        const [selection]=await tx`select badge from bricklab.commerce_badge_selection where user_id=${uid}`
        const supportBadge=commerce.badges.includes(selection?.badge)?selection.badge:null
        if(!inventory.some(i=>i.id===profile.background&&i.owned))profile.background='default'
        return {...profile,awards,inventory,plus:commerce.plus,plusUntil:commerce.plusUntil,plusTheme,loyalty:commerce.loyalty,supportBadges:commerce.badges,supportBadge,avatarUrl:media.find(m=>m.kind==='avatar')?'/api/profile/avatar?v='+media.find(m=>m.kind==='avatar').version:null,coverUrl:media.find(m=>m.kind==='cover')?'/api/profile/cover?v='+media.find(m=>m.kind==='cover').version:null}
      })
    },
    async saveProfile(uid,p) {
      return scope(uid,async tx=>{
        await lock(tx,uid)
        if(p.plusTheme!==undefined){
          const commerce=await commerceEntitlements(tx,uid)
          if(!commerce.plus)throw new ProjectError(403,'plus_required')
          const [choice]=await tx`select theme,changed_at as "changedAt" from bricklab.commerce_plus_theme where user_id=${uid}`
          const state=plusThemeState(commerce,choice)
          if(state.chosen!==p.plusTheme){
            if(state.nextChangeAt>Date.now())throw new ProjectError(409,'plus_theme_cooldown')
            await tx`insert into bricklab.commerce_plus_theme(user_id,theme) values(${uid},${p.plusTheme}) on conflict(user_id) do update set theme=excluded.theme,changed_at=now()`
          }
        }
        if(p.supportBadge!==undefined){
          const commerce=await commerceEntitlements(tx,uid)
          if(p.supportBadge!==null&&!commerce.badges.includes(p.supportBadge))throw new ProjectError(403,'badge_locked')
          await tx`insert into bricklab.commerce_badge_selection(user_id,badge) values(${uid},${p.supportBadge}) on conflict(user_id) do update set badge=excluded.badge`
        }
        await tx`insert into bricklab.profiles(user_id,bio,cover) values(${uid},${p.bio},${p.cover}) on conflict(user_id) do update set bio=excluded.bio,cover=excluded.cover,updated_at=now()`
        if(p.displayName!==undefined)await tx`update bricklab.profiles set display_name=${p.displayName} where user_id=${uid}`
        await tx`update bricklab.public_profiles set display_name=coalesce(${p.displayName??null},display_name),bio=${p.bio},cover_theme=case when share_cover then ${p.cover} else null end,updated_at=now() where user_id=${uid} and unified`
        if(p.background!==undefined){
          const awards=await tx`select award from bricklab.workshop_awards where user_id=${uid}`
          const legacyEntitlements=await tx`select item from bricklab.cosmetic_entitlements where user_id=${uid}`
        const commerce=await commerceEntitlements(tx,uid)
        const [plusChoice]=await tx`select theme,changed_at as "changedAt" from bricklab.commerce_plus_theme where user_id=${uid}`
        const plusTheme=plusThemeState(commerce,plusChoice)
        const entitlements=[...legacyEntitlements,...commerce.themes.map(item=>({item})),...(plusTheme.chosen?[{item:plusTheme.chosen}]:[])]
          const [{admin}]=await tx`select bricklab.is_admin() as admin`
          if(!backgroundInventory(awards,entitlements,{admin:admin===true}).some(i=>i.id===p.background&&i.owned))throw new ProjectError(403,'background_locked')
          await tx`update bricklab.profiles set background=${p.background} where user_id=${uid}`
          // Only profiles that explicitly opted in to public appearance are synchronized.
          await tx`update bricklab.public_profiles set background_theme=${p.background},updated_at=now() where user_id=${uid} and background_theme is not null`
        }
      })
    },
    async getMedia(uid,kind){return scope(uid,async tx=>{const [r]=await tx`select image from bricklab.profile_media where user_id=${uid} and kind=${kind}`;return r?.image})},
    async saveMedia(uid,kind,image){return scope(uid,async tx=>{await lock(tx,uid);await tx`insert into bricklab.profile_media(user_id,kind,image) values(${uid},${kind},${image}) on conflict(user_id,kind) do update set image=excluded.image,version=gen_random_uuid()`;if(kind==='avatar')await tx`update bricklab.public_profiles set avatar_image=${image},updated_at=now() where user_id=${uid} and unified and share_avatar`;if(kind==='cover')await tx`update bricklab.public_profiles set cover_image=${image},updated_at=now() where user_id=${uid} and unified and share_cover`})},
    async deleteMedia(uid,kind){return scope(uid,async tx=>{await lock(tx,uid);await tx`delete from bricklab.profile_media where user_id=${uid} and kind=${kind}`;if(kind==='avatar')await tx`update bricklab.public_profiles set avatar_image=null,updated_at=now() where user_id=${uid} and unified and share_avatar`;if(kind==='cover')await tx`update bricklab.public_profiles set cover_image=null,updated_at=now() where user_id=${uid} and unified and share_cover`})},
    async getActivity(uid){
      return scope(uid,async tx=>{
        const favorites=await tx`select f.project_id as id,p.name,p.head_revision as revision from bricklab.project_favorites f join bricklab.projects p on p.id=f.project_id where f.user_id=${uid} order by f.created_at desc,p.id`
        const events=await tx`select r.project_id as "projectId",r.revision,r.document->>'name' as name,r.created_at as "at" from bricklab.project_revisions r join bricklab.projects p on p.id=r.project_id order by r.created_at desc,r.project_id,r.revision desc limit 100`
        const notifications=await tx`select a.award,a.awarded_at as "at",(r.award is not null) as read from bricklab.workshop_awards a left join bricklab.award_reads r on r.user_id=a.user_id and r.award=a.award where a.user_id=${uid} order by a.awarded_at desc,a.award`
        const [size]=await tx`select coalesce(sum(octet_length(document::text)),0)::bigint as bytes from bricklab.project_revisions`
        const calendar=await tx`select (r.created_at at time zone 'UTC')::date::text as day,count(*)::int as count from bricklab.project_revisions r join bricklab.projects p on p.id=r.project_id where p.owner_id=${uid} and r.created_at>=now()-interval '365 days' group by 1 order by 1`
        const {limits,plus,plusUntil}=await commerceEntitlements(tx,uid)
        return {favorites,events,notifications,calendar,bytes:Number(size.bytes),limits,plus,plusUntil}
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
    async getOwnCard(uid){return scope(uid,async tx=>{const [p]=await tx`select public_id as id,bricklab.public_support_badge(public_id) as "supportBadge",bricklab.public_plus(public_id) as plus,display_name as "displayName",bio,updated_at as "updatedAt",avatar_image is not null as "hasAvatar",cover_image is not null as "hasCover",cover_theme as "coverTheme",bricklab.public_active_theme(public_id) as "backgroundTheme",unified,share_avatar as "shareAvatar",share_cover as "shareCover",portfolio,show_award as "showAward",array(select b.public_id from bricklab.public_builds b where b.author_id=public_profiles.public_id) as "publicIds",coalesce((select followers from bricklab.community_follow_counts f where f.author_id=public_profiles.public_id),0) as followers from bricklab.public_profiles where user_id=${uid}`;return p})},
    async publishCard(uid,p){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        if(p.unified===true)await tx`insert into bricklab.profiles(user_id,display_name,bio,cover) values(${uid},${p.displayName},${p.bio},${p.cover}) on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,cover=excluded.cover,updated_at=now()`
        const [profile]=await tx`select cover,background from bricklab.profiles where user_id=${uid}`
        const [avatar]=p.showAvatar?await tx`select image from bricklab.profile_media where user_id=${uid} and kind='avatar'`:[]
        const [cover]=p.showCover?await tx`select image from bricklab.profile_media where user_id=${uid} and kind='cover'`:[]
        let background=null
        if(p.showBackground){
          const awards=await tx`select award from bricklab.workshop_awards where user_id=${uid}`
          const legacyEntitlements=await tx`select item from bricklab.cosmetic_entitlements where user_id=${uid}`
        const commerce=await commerceEntitlements(tx,uid)
        const [plusChoice]=await tx`select theme,changed_at as "changedAt" from bricklab.commerce_plus_theme where user_id=${uid}`
        const plusTheme=plusThemeState(commerce,plusChoice)
        const entitlements=[...legacyEntitlements,...commerce.themes.map(item=>({item})),...(plusTheme.chosen?[{item:plusTheme.chosen}]:[])]
          const [{admin}]=await tx`select bricklab.is_admin() as admin`
          const chosen=profile?.background??'default'
          background=backgroundInventory(awards,entitlements,{admin:admin===true}).some(b=>b.id===chosen&&b.owned)?chosen:'default'
        }
        await tx`insert into bricklab.public_profiles(user_id,display_name,bio,avatar_image,cover_image,cover_theme,background_theme)
          values(${uid},${p.displayName},${p.bio},${avatar?.image??null},${cover?.image??null},${p.showCover?profile?.cover??'blueprint':null},${background})
          on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,avatar_image=excluded.avatar_image,cover_image=excluded.cover_image,cover_theme=excluded.cover_theme,background_theme=excluded.background_theme,updated_at=now()`
        if(p.unified===true){
          const rows=await tx`select b.public_id as id from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where c.user_id=${uid}`
          const portfolio=filterPortfolio(p.portfolio,rows.map(r=>r.id))
          const [earned]=await tx`select exists(select 1 from bricklab.workshop_awards where user_id=${uid} and award='firstCloudSave') as earned`
          await tx`update bricklab.public_profiles set unified=true,share_avatar=${p.showAvatar},share_cover=${p.showCover},portfolio=${tx.json(portfolio)},show_award=${earned.earned===true&&portfolio.blocks.some(b=>b.key==='awards'&&b.visible)} where user_id=${uid}`
        }else await tx`update bricklab.public_profiles set unified=false,share_avatar=false,share_cover=false,portfolio=null,show_award=false where user_id=${uid}`
      })
    },
    async getPublicMedia(id,kind){
      const [r]=kind==='avatar'?await sql`select avatar_image as image from bricklab.public_profiles where public_id=${id}`:
        kind==='cover'?await sql`select cover_image as image from bricklab.public_profiles where public_id=${id}`:[]
      return r?.image
    },
    async unpublishCard(uid){return scope(uid,tx=>tx`delete from bricklab.public_profiles where user_id=${uid}`)},
    async getPublicCard(id){const [p]=await sql`select public_id as id,bricklab.public_support_badge(public_id) as "supportBadge",bricklab.public_plus(public_id) as plus,display_name as "displayName",bio,updated_at as "updatedAt",avatar_image is not null as "hasAvatar",cover_image is not null as "hasCover",cover_theme as "coverTheme",bricklab.public_active_theme(public_id) as "backgroundTheme",unified,share_avatar as "shareAvatar",share_cover as "shareCover",portfolio,show_award as "showAward",array(select b.public_id from bricklab.public_builds b where b.author_id=public_profiles.public_id) as "publicIds",coalesce((select followers from bricklab.community_follow_counts f where f.author_id=public_profiles.public_id),0) as followers from bricklab.public_profiles where public_id=${id}`;return p},
    async listPublicCards(q=''){return sql`select public_id as id,bricklab.public_support_badge(public_id) as "supportBadge",bricklab.public_plus(public_id) as plus,display_name as "displayName",bio,updated_at as "updatedAt",avatar_image is not null as "hasAvatar",cover_image is not null as "hasCover",cover_theme as "coverTheme",bricklab.public_active_theme(public_id) as "backgroundTheme",unified,share_avatar as "shareAvatar",share_cover as "shareCover",portfolio,show_award as "showAward",array(select b.public_id from bricklab.public_builds b where b.author_id=public_profiles.public_id) as "publicIds",coalesce((select followers from bricklab.community_follow_counts f where f.author_id=public_profiles.public_id),0) as followers from bricklab.public_profiles where (${q}='' or strpos(lower(display_name),lower(${q}))>0) order by updated_at desc,public_id limit 30`},
    async listOwnBuilds(uid){return scope(uid,tx=>tx`select b.public_id as id,b.project_id as "projectId",b.revision,b.title,b.description,b.category,b.allow_download as "allowDownload",b.allow_comments as "allowComments",b.allow_remix as "allowRemix",b.difficulty,b.tags,b.work_type as "workType",b.attribution,b.origin_id as "originId",cardinality(b.images) as "imageCount",b.part_count as "partCount",b.published_at as "publishedAt" from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where c.user_id=${uid} order by b.published_at desc`)},
    async publishBuild(uid,id,input){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        const [c]=await tx`select public_id from bricklab.public_profiles where user_id=${uid} for update`
        if(!c)throw new ProjectError(409,'public_profile_required')
        const [p]=await tx`select p.id,r.document from bricklab.projects p join bricklab.project_revisions r on r.project_id=p.id and r.revision=${input.revision} where p.id=${id} and p.owner_id=${uid}`
        if(!p)throw missing()
        const [old]=await tx`select public_id,allow_download,allow_comments,allow_remix,difficulty,tags,work_type,attribution,origin_id from bricklab.public_builds where project_id=${id}`
        const allowDownload=input.allowDownload??old?.allow_download??true,allowComments=input.allowComments??old?.allow_comments??true,allowRemix=input.allowRemix??old?.allow_remix??false
        if(allowRemix&&!allowDownload)throw new ProjectError(400,'invalid_publication')
        let workType=input.workType??old?.work_type??'original',attribution=input.attribution??old?.attribution??'',originId=old?.origin_id??null
        const requested=originId??p.document.communityOrigin?.id
        if(originId&&p.document.communityOrigin?.id&&p.document.communityOrigin.id!==originId)throw new ProjectError(400,'invalid_publication')
        if(requested){
          if(typeof requested!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested)||requested===old?.public_id)throw new ProjectError(400,'invalid_publication')
          const [source]=await tx`select b.public_id,b.title,b.allow_remix,b.allow_download,c.display_name,c.user_id from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id where b.public_id=${requested}`
          if(!source||(!source.allow_remix||!source.allow_download)&&source.user_id!==uid)throw new ProjectError(403,'remix_disabled')
          originId=source.public_id;workType='remix';attribution=(source.display_name+' — '+source.title).slice(0,250)
        }
        if(workType!=='original'&&!attribution)throw new ProjectError(400,'invalid_publication')
        const images=input.images?.map(bytes=>bytes.toString('base64'))??[]
        await tx`insert into bricklab.public_builds(project_id,author_id,revision,title,description,document,category,allow_download,allow_comments,allow_remix,difficulty,tags,work_type,attribution,origin_id,images)
          values(${id},${c.public_id},${input.revision},${p.document.name},${input.description},${tx.json(p.document)},${input.category??'other'},${allowDownload},${allowComments},${allowRemix},${input.difficulty??old?.difficulty??'unspecified'},ARRAY(SELECT jsonb_array_elements_text(${tx.json(input.tags??old?.tags??[])}::jsonb)),${workType},${attribution},${originId},ARRAY(SELECT decode(value,'base64') FROM jsonb_array_elements_text(${tx.json(images)}::jsonb)))
          on conflict(project_id) do update set revision=excluded.revision,title=excluded.title,description=excluded.description,document=excluded.document,category=excluded.category,published_at=now(),allow_download=excluded.allow_download,allow_comments=excluded.allow_comments,allow_remix=excluded.allow_remix,difficulty=excluded.difficulty,tags=excluded.tags,work_type=excluded.work_type,attribution=excluded.attribution,origin_id=excluded.origin_id,images=case when ${input.images!==undefined} then excluded.images else public_builds.images end`
      })
    },
    async unpublishBuild(uid,id){return scope(uid,async tx=>{const [p]=await tx`select id from bricklab.projects where id=${id} and owner_id=${uid}`;if(!p)throw missing();await tx`delete from bricklab.public_builds where project_id=${id} and author_id in (select public_id from bricklab.public_profiles where user_id=${uid})`})},
    async listComments(id,offset=0){
      const [b]=await sql`select 1 from bricklab.public_builds where public_id=${id}`;if(!b)throw missing()
      return sql`select c.id,c.parent_id as "parentId",c.author_id as "authorId",p.display_name as author,p.avatar_image is not null as "authorHasAvatar",bricklab.public_active_theme(p.public_id) as "authorTheme",c.body,c.created_at as "createdAt",parent_author.display_name as "parentAuthor"
        from bricklab.community_comments c join bricklab.public_profiles p on p.public_id=c.author_id left join bricklab.community_comments parent on parent.id=c.parent_id left join bricklab.public_profiles parent_author on parent_author.public_id=parent.author_id
        where c.build_id=${id} order by c.created_at desc,c.id limit 31 offset ${offset}`
    },
    async addComment(uid,id,input){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        const [p]=await tx`select public_id as id from bricklab.public_profiles where user_id=${uid}`
        if(!p)throw new ProjectError(409,'public_profile_required')
        const [b]=await tx`select allow_comments from bricklab.public_builds where public_id=${id}`;if(!b)throw missing();if(!b.allow_comments)throw new ProjectError(403,'comments_disabled')
        if(input.parentId){
          const [parent]=await tx`select parent_id,body from bricklab.community_comments where id=${input.parentId} and build_id=${id}`
          if(!parent||parent.parent_id||parent.body===null)throw new ProjectError(400,'invalid_reply')
        }
        const [n]=await tx`select count(*)::int as total,(count(*) filter(where created_at>now()-interval '1 day'))::int as daily from bricklab.community_comments where author_id=${p.id}`
        if(n.total>=1000||n.daily>=30)throw new ProjectError(429,'comment_limit')
        await tx`insert into bricklab.community_comments(build_id,author_id,parent_id,body) values(${id},${p.id},${input.parentId},${input.body})`
      })
    },
    async removeComment(uid,id){
      return scope(uid,async tx=>{
        const rows=await tx`update bricklab.community_comments set body=null where id=${id} and author_id in(select public_id from bricklab.public_profiles where user_id=${uid}) returning id`
        if(!rows.length)throw missing()
      })
    },
    async reportComment(uid,id,reason){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        const [c]=await tx`select p.user_id as owner from bricklab.community_comments c join bricklab.public_profiles p on p.public_id=c.author_id where c.id=${id} and c.body is not null`
        if(!c)throw missing();if(c.owner===uid)throw new ProjectError(403,'self_reaction')
        const [old]=await tx`select 1 from bricklab.community_comment_reports where reporter_id=${uid} and comment_id=${id}`
        if(old)return
        const [n]=await tx`select count(*)::int as n from bricklab.community_comment_reports where reporter_id=${uid}`
        if(n.n>=1000)throw new ProjectError(429,'report_limit')
        await tx`insert into bricklab.community_comment_reports(reporter_id,comment_id,reason) values(${uid},${id},${reason}) on conflict do nothing`
      })
    },
    async reputation(id){
      const [r]=await sql`select builds,likes,downloads,followers,score from bricklab.community_reputation where author_id=${id}`
      return r
    },
    async leaderboard(offset=0){
      return sql`select p.public_id as id,p.display_name as "displayName",p.bio,p.updated_at as "updatedAt",p.avatar_image is not null as "hasAvatar",bricklab.public_active_theme(p.public_id) as "backgroundTheme",r.builds,r.likes,r.downloads,r.followers,r.score
        from bricklab.community_reputation r join bricklab.public_profiles p on p.public_id=r.author_id
        where r.builds>0 order by r.score desc,r.likes desc,p.public_id limit 31 offset ${offset}`
    },
    async socialState(uid){
      return scope(uid,async tx=>{
        const [own]=await tx`select public_id as id from bricklab.public_profiles where user_id=${uid}`
        const likes=await tx`select build_id as id from bricklab.community_likes where user_id=${uid}`
        const follows=await tx`select author_id as id from bricklab.community_follows where user_id=${uid}`
        const bookmarks=await tx`select build_id as id from bricklab.community_bookmarks where user_id=${uid}`
        return {signedIn:true,ownId:own?.id??null,likes:likes.map(r=>r.id),follows:follows.map(r=>r.id),bookmarks:bookmarks.map(r=>r.id)}
      })
    },
    async setSocial(uid,kind,id,add){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        if(kind==='bookmark'){
          const [target]=await tx`select 1 from bricklab.public_builds where public_id=${id}`;if(!target)throw missing()
          if(add){const [n]=await tx`select count(*)::int as n from bricklab.community_bookmarks where user_id=${uid}`
            if(n.n>=1000){const [old]=await tx`select 1 from bricklab.community_bookmarks where user_id=${uid} and build_id=${id}`;if(!old)throw new ProjectError(409,'social_limit')}
            await tx`insert into bricklab.community_bookmarks(user_id,build_id) values(${uid},${id}) on conflict do nothing`
          }else await tx`delete from bricklab.community_bookmarks where user_id=${uid} and build_id=${id}`
          return {active:add,count:0}
        }
        if(kind==='like'){
          const [target]=await tx`select p.user_id as owner from bricklab.public_builds b join bricklab.public_profiles p on p.public_id=b.author_id where b.public_id=${id}`
          if(!target)throw missing()
          if(target.owner===uid)throw new ProjectError(403,'self_reaction')
          if(add){
            const [n]=await tx`select count(*)::int as n from bricklab.community_likes where user_id=${uid}`
            if(n.n>=1000){const [old]=await tx`select 1 from bricklab.community_likes where user_id=${uid} and build_id=${id}`;if(!old)throw new ProjectError(409,'social_limit')}
            await tx`insert into bricklab.community_likes(user_id,build_id) values(${uid},${id}) on conflict do nothing`
          }else await tx`delete from bricklab.community_likes where user_id=${uid} and build_id=${id}`
          const [r]=await tx`select likes as count from bricklab.community_like_counts where build_id=${id}`;return {active:add,count:r?.count??0}
        }
        const [target]=await tx`select user_id as owner from bricklab.public_profiles where public_id=${id}`
        if(!target)throw missing()
        if(target.owner===uid)throw new ProjectError(403,'self_reaction')
        if(add){
          const [n]=await tx`select count(*)::int as n from bricklab.community_follows where user_id=${uid}`
          if(n.n>=1000){const [old]=await tx`select 1 from bricklab.community_follows where user_id=${uid} and author_id=${id}`;if(!old)throw new ProjectError(409,'social_limit')}
          await tx`insert into bricklab.community_follows(user_id,author_id) values(${uid},${id}) on conflict do nothing`
        }else await tx`delete from bricklab.community_follows where user_id=${uid} and author_id=${id}`
        const [r]=await tx`select followers as count from bricklab.community_follow_counts where author_id=${id}`;return {active:add,count:r?.count??0}
      })
    },
    async reportBuild(uid,id,reason){
      return scope(uid,async tx=>{
        await lock(tx,uid)
        const [target]=await tx`select p.user_id as owner from bricklab.public_builds b join bricklab.public_profiles p on p.public_id=b.author_id where b.public_id=${id}`
        if(!target)throw missing();if(target.owner===uid)throw new ProjectError(403,'self_reaction')
        const [existing]=await tx`select 1 from bricklab.community_build_reports where reporter_id=${uid} and build_id=${id}`;if(existing)return
        const [n]=await tx`select count(*)::int as n from bricklab.community_build_reports where reporter_id=${uid}`;if(n.n>=1000)throw new ProjectError(429,'report_limit')
        await tx`insert into bricklab.community_build_reports(reporter_id,build_id,reason) values(${uid},${id},${reason}) on conflict do nothing`
      })
    },
    async getBuildImage(id,index){
      const [p]=await sql`select images[${index+1}] as image from bricklab.public_builds where public_id=${id}`;return p?.image
    },
    async recordPublicEvent(uid,id,kind){
      return scope(uid,async tx=>{
        await tx`insert into bricklab.community_events(user_id,build_id,kind) select ${uid},b.public_id,${kind} from bricklab.public_builds b join bricklab.public_profiles p on p.public_id=b.author_id where b.public_id=${id} and p.user_id<>${uid} on conflict do nothing`
        const [r]=await tx`select views,downloads from bricklab.community_event_counts where build_id=${id}`
        return {views:r?.views??0,downloads:r?.downloads??0}
      })
    },
    async listPublicBuilds(author=null,options={}){
      const {q='',category='',sort='recent',offset=0,limit=30,followingUid=null,bookmarkUid=null,week=false}=options
      const query=tx=>tx`select b.public_id as id,b.author_id as "authorId",c.display_name as author,c.avatar_image is not null as "authorHasAvatar",bricklab.public_active_theme(c.public_id) as "authorTheme",b.title,b.description,b.revision,b.category,b.allow_download as "allowDownload",b.allow_comments as "allowComments",b.allow_remix as "allowRemix",b.difficulty,b.tags,b.work_type as "workType",b.attribution,b.origin_id as "originId",cardinality(b.images) as "imageCount",b.part_count as "partCount",b.published_at as "publishedAt",coalesce(l.likes,0) as likes,coalesce(e.views,0) as views,coalesce(e.downloads,0) as downloads
        from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id left join bricklab.community_like_counts l on l.build_id=b.public_id left join bricklab.community_event_counts e on e.build_id=b.public_id
        where (${author}::uuid is null or b.author_id=${author}::uuid)
        and (${followingUid}::uuid is null or exists(select 1 from bricklab.community_follows f where f.user_id=${followingUid}::uuid and f.author_id=b.author_id))
        and (${bookmarkUid}::uuid is null or exists(select 1 from bricklab.community_bookmarks f where f.user_id=${bookmarkUid}::uuid and f.build_id=b.public_id))
        and (not ${week}::boolean or b.published_at>=now()-interval '7 days')
        and (${category}='' or b.category=${category})
        and (${q}='' or strpos(lower(b.title||' '||b.description||' '||c.display_name||' '||array_to_string(b.tags,' ')),lower(${q}))>0)
        order by case when ${sort}='popular' then coalesce(l.likes,0) end desc nulls last,case when ${sort}='popular' then coalesce(e.views,0) end desc nulls last,case when ${sort}='parts' then b.part_count end desc nulls last,
          case when ${sort}='name' then lower(b.title) end asc nulls last,
          case when ${sort}='oldest' then b.published_at end asc nulls last,
          b.published_at desc,b.public_id limit ${limit} offset ${offset}`
      return followingUid||bookmarkUid?scope(followingUid??bookmarkUid,query):query(sql)
    },
    async getPublicBuild(id,download=false){
      if(download){const [p]=await sql`select document,allow_download as "allowDownload" from bricklab.public_builds where public_id=${id}`;return p}
      const [p]=await sql`select b.public_id as id,b.author_id as "authorId",c.display_name as author,c.avatar_image is not null as "authorHasAvatar",bricklab.public_active_theme(c.public_id) as "authorTheme",b.title,b.description,b.revision,b.category,b.allow_download as "allowDownload",b.allow_comments as "allowComments",b.allow_remix as "allowRemix",b.difficulty,b.tags,b.work_type as "workType",b.attribution,b.origin_id as "originId",cardinality(b.images) as "imageCount",b.part_count as "partCount",b.published_at as "publishedAt",coalesce(l.likes,0) as likes,coalesce(e.views,0) as views,coalesce(e.downloads,0) as downloads from bricklab.public_builds b join bricklab.public_profiles c on c.public_id=b.author_id left join bricklab.community_like_counts l on l.build_id=b.public_id left join bricklab.community_event_counts e on e.build_id=b.public_id where b.public_id=${id}`;return p
    },
    async cleanup() { await sql`delete from bricklab.sessions where expires_at <= now()`;await sql`delete from bricklab.account_tokens where expires_at <= now()` },
    async close() { await sql.end({ timeout: 5 }) },
  }
}
