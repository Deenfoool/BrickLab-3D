import { setTimeout as delay } from 'node:timers/promises'
const upstream = 'https://rebrickable.com'
const prefix = '/api/rebrickable/'
const pathPattern = /^lego\/sets\/(?:[A-Za-z0-9-]{1,40}\/(?:parts\/)?)?$/
const numbers = new Set(['page','page_size','min_year','max_year','min_parts','max_parts','theme_id','inc_part_details'])
const orders = new Set(['year','-year','num_parts','-num_parts','name','-name','set_num','-set_num'])
function target(path, params) {
  if (!pathPattern.test(path)) return null
  const url = new URL('/api/v3/' + path, upstream)
  for (const [k,v] of params) {
    if (url.searchParams.has(k)) return null
    if (numbers.has(k)) {
      if (!/^\d{1,8}$/.test(v) || (k==='page_size' && (+v<1||+v>1000)) || (k==='page' && (+v<1||+v>10000))) return null
    } else if (k==='search') {
      if (v.length>100 || /[\x00-\x1f\x7f]/.test(v)) return null
    } else if (k==='ordering') {
      if (!v.split(',').every(x=>orders.has(x)) || v.split(',').length>2) return null
    } else return null
    url.searchParams.set(k,v)
  }
  url.searchParams.sort()
  return url
}
function nextPage(value, current) {
  if (!value) return null
  const u = new URL(value,current)
  if(u.origin!==upstream || u.pathname!==current.pathname) throw Error('invalid-pagination')
  u.searchParams.delete('key')
  const safe=target(u.pathname.slice('/api/v3/'.length),u.searchParams)
  if(!safe) throw Error('invalid-pagination')
  return prefix+safe.pathname.slice('/api/v3/'.length)+safe.search
}
function reply(res,status,body) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),...(status===429?{'Retry-After':'3'}:{})})
  res.end(body)
}
async function limitedJson(response) {
  const max=4*1024*1024
  const reader=response.body.getReader()
  let bytes=0
  const chunks=[]
  try {
    while(true){
      const {done,value}=await reader.read()
      if(done)break
      bytes+=value.length
      if(bytes>max)throw Error('response-too-large')
      chunks.push(Buffer.from(value))
    }
  }finally{await reader.cancel().catch(()=>{})}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export function createRebrickableHandler({apiKey='',fetcher=globalThis.fetch,spacing=1200}={}) {
  const key=apiKey.trim()
  const cache=new Map(), inflight=new Map()
  let cacheBytes=0, tail=Promise.resolve(), nextStart=0, backoff=0
  function put(id,body){
    const bytes=Buffer.byteLength(body)
    if(bytes>4*1024*1024)return
    while(cache.size>=128||cacheBytes+bytes>16*1024*1024){
      const first=cache.keys().next().value
      if(first===undefined)break
      cacheBytes-=cache.get(first).bytes
      cache.delete(first)
    }
    cache.set(id,{body,bytes,expires:Date.now()+5*60_000})
    cacheBytes+=bytes
  }
  const fail=(status,error)=>({status,body:JSON.stringify({error})})
  async function query(url) {
    if(Date.now()<backoff)return fail(429,'catalog_rate_limited')
    await delay(Math.max(0,nextStart-Date.now()))
    if(Date.now()<backoff)return fail(429,'catalog_rate_limited')
    nextStart=Date.now()+spacing
    try{
      const r=await fetcher(url,{headers:{Authorization:'key '+key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12_000)})
      if(!r.ok){
        await r.body?.cancel().catch(()=>{})
        if(r.status===429){backoff=Date.now()+Math.max(30_000,Math.min(300_000,(Number(r.headers.get('retry-after'))||30)*1000));return fail(429,'catalog_rate_limited')}
        return fail(r.status===404?404:502,'catalog_unavailable')
      }
      const data=await limitedJson(r)
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid-response')
      if(Object.hasOwn(data,'next'))data.next=nextPage(data.next,url)
      if(Object.hasOwn(data,'previous'))delete data.previous
      const body=JSON.stringify(data)
      put(url.href,body)
      return {status:200,body}
    }catch{return fail(502,'catalog_unavailable')}
  }
  return async(req,res,path)=>{
    if(!path.startsWith(prefix))return false
    if(req.method!=='GET'){res.setHeader('Allow','GET');reply(res,405,'{"error":"method_not_allowed"}');return true}
    if(path===prefix+'config'){reply(res,200,JSON.stringify({enabled:Boolean(key)}));return true}
    if(!key){reply(res,503,'{"error":"catalog_disabled"}');return true}
    const raw=new URL(req.url,'http://localhost')
    const url=target(path.slice(prefix.length),raw.searchParams)
    if(!url||raw.search.length>2048){reply(res,400,'{"error":"invalid_catalog_request"}');return true}
    const id=url.href
    const hit=cache.get(id)
    if(hit&&hit.expires>Date.now()){
      cache.delete(id);cache.set(id,hit);reply(res,200,hit.body);return true
    }
    if(hit){cache.delete(id);cacheBytes-=hit.bytes}
    let pending=inflight.get(id)
    if(!pending){
      if(inflight.size>=6){reply(res,429,'{"error":"catalog_rate_limited"}');return true}
      pending=tail.then(()=>query(url))
      tail=pending.catch(()=>{})
      inflight.set(id,pending)
      pending.finally(()=>inflight.delete(id)).catch(()=>{})
    }
    const result=await pending
    if(!res.destroyed)reply(res,result.status,result.body)
    return true
  }
}
