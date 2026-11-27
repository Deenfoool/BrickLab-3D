import {validateMetricLayout,readMetricLayout} from '../src/menu/workshop-metrics-model.js'
import {createAchievementVerifier} from './achievement-verifier.js'
import {rewardById} from '../src/menu/achievement-rewards.js'
import {achievementProgress,achievementById} from '../src/menu/achievement-catalog.js'
import { createHash } from 'node:crypto'
import { ProjectError } from './projects.js'
import { backgrounds,mediaLimits,normalizeImage } from './profile-media.js'
import {productById,themePrices} from '../src/menu/commerce-catalog.js'
export function validateProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.bio!=='string'||value.bio.length>500||
  /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.bio)||/[\ud800-\udfff]/u.test(value.bio)||
  !['blueprint','graphite','amber'].includes(value.cover))throw new ProjectError(400,'invalid_profile')
 if(value.background!==undefined&&!backgrounds.some(b=>b.id===value.background))throw new ProjectError(400,'invalid_profile')
 if(value.displayName!==undefined&&(typeof value.displayName!=='string'||!value.displayName.trim()||value.displayName.length>80||/[\u0000-\u001f\u007f]/.test(value.displayName)||/[\ud800-\udfff]/u.test(value.displayName)))throw new ProjectError(400,'invalid_profile')
 if(value.plusTheme!==undefined&&(typeof value.plusTheme!=='string'||!Object.hasOwn(themePrices,value.plusTheme)))throw new ProjectError(400,'invalid_profile')
 if(value.supportBadge!==undefined&&value.supportBadge!==null&&productById(value.supportBadge)?.kind!=='badge')throw new ProjectError(400,'invalid_profile')
 if(value.showcase!==undefined&&(!Array.isArray(value.showcase)||value.showcase.length>6||new Set(value.showcase).size!==value.showcase.length||value.showcase.some(id=>typeof id!=='string'||(!achievementById(id)&&!/^custom-[a-z0-9-]{1,39}$/.test(id)))))throw new ProjectError(400,'invalid_showcase')
 if(value.achievementStyle!==undefined&&value.achievementStyle!==null&&!rewardById(value.achievementStyle))throw new ProjectError(400,'invalid_profile')
 let metricLayout;if(value.metricLayout!==undefined){try{metricLayout=validateMetricLayout(value.metricLayout)}catch{throw new ProjectError(400,'invalid_metric_layout')}}
 return {...(metricLayout===undefined?{}:{metricLayout}),...(value.achievementStyle===undefined?{}:{achievementStyle:value.achievementStyle}),...(value.showcase===undefined?{}:{showcase:value.showcase}),bio:value.bio.trim(),cover:value.cover,...(value.plusTheme===undefined?{}:{plusTheme:value.plusTheme}),...(value.supportBadge===undefined?{}:{supportBadge:value.supportBadge}),...(value.displayName===undefined?{}:{displayName:value.displayName.trim()}),...(value.background===undefined?{}:{background:value.background})}
}
export function awardProgress(awards,metrics,showcase,rarity,definitions){return achievementProgress(awards,metrics,showcase,rarity,definitions)}
export function createProfileHandler({store,origin,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0,mediaActive=0
 const verify=createAchievementVerifier({store})
 async function readBytes(req,limit){const chunks=[];let size=0;if(Number(req.headers['content-length'])>limit)throw new ProjectError(413,'body_too_large');for await(const c of req.iterator({destroyOnReturn:false})){size+=c.length;if(size>limit){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(c)}return Buffer.concat(chunks)}
 function reply(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 return async(req,res,path)=>{
  const verification=path==='/api/profile/verify',ranking=path==='/api/profile/rankings'
  const kind=path==='/api/profile/avatar'?'avatar':path==='/api/profile/cover'?'cover':null
  if(path!=='/api/profile'&&!kind&&!ranking&&!verification)return false
  try{
   if(!(verification?['POST']:ranking?['GET']:kind?['GET','PUT','DELETE']:['GET','PUT']).includes(req.method)){res.setHeader('Allow',kind?'GET, PUT, DELETE':'GET, PUT');throw new ProjectError(405,'method_not_allowed')}
   if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
   const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
   if(!user)throw new ProjectError(401,'unauthenticated')
   if(verification){if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required');let input;try{input=JSON.parse((await readBytes(req,4096)).toString('utf8'))}catch(e){if(e instanceof ProjectError)throw e;throw new ProjectError(400,'invalid_json')}reply(res,200,await verify(user.id,input));return true}
   if(ranking){const raw=new URL(req.url,'http://localhost').searchParams.get('offset')??'0';if(!/^\d{1,5}$/.test(raw)||Number(raw)>10000)throw new ProjectError(400,'invalid_offset');const items=await store.getAchievementRankings(Number(raw));reply(res,200,{items:items.slice(0,50),nextOffset:items.length>50&&Number(raw)+50<=10000?Number(raw)+50:null});return true}
   if(kind){
    if(req.method==='GET'){
      const image=await store.getMedia(user.id,kind)
      if(!image)throw new ProjectError(404,'not_found')
      const bytes=Buffer.isBuffer(image)?image:Buffer.from(image)
      res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'private, no-store','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});res.end(bytes);return true
    }
    if(req.method==='DELETE')await store.deleteMedia(user.id,kind)
    else {
      if(mediaActive>=2)throw new ProjectError(429,'too_many_attempts')
      mediaActive++
      try{
       const mime=req.headers['content-type']?.split(';')[0].trim()
       if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new ProjectError(415,'invalid_image')
       const image=await normalizeImage(await readBytes(req,mediaLimits[kind]),mime,kind)
       await store.saveMedia(user.id,kind,image)
      }finally{mediaActive--}
    }
   }else if(req.method==='PUT'){
    if(active>=4)throw new ProjectError(429,'too_many_attempts')
    active++
    try{
     if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
     const chunks=[];let size=0
     for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>4096){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
     let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
     await store.saveProfile(user.id,validateProfile(data))
    }finally{active--}
   }
   const p=await store.getProfile(user.id)
   reply(res,200,{profile:{bio:p.bio,cover:p.cover,background:p.background,metricLayout:readMetricLayout(p.metricLayout),achievementStyle:p.achievementStyle??null,displayName:p.displayName??null,avatarUrl:p.avatarUrl,coverUrl:p.coverUrl},inventory:p.inventory,plus:p.plus===true,plusUntil:p.plusUntil??0,plusTheme:p.plusTheme??{chosen:null,nextChangeAt:0},loyalty:p.loyalty??{days:0,milestones:[]},supportBadges:p.supportBadges??[],supportBadge:p.supportBadge??null,achievementRewards:p.achievementRewards??[],progress:awardProgress(p.awards,p.achievementMetrics,p.showcase,p.achievementRarity,p.achievementDefinitions)})
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Profile operation failed:',e.code||e.name);reply(res,503,{error:'profile_unavailable'})}}
  return true
 }
}
