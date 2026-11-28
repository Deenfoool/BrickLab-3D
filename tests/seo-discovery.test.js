import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createDiscovery,loadDiscoveryCatalog,readReleaseNotes} from '../server/seo-discovery.js'
import {seoConfig,decorateSeo} from '../server/seo-config.js'
import {createBrickLabServer} from '../server/http.js'

const root=fileURLToPath(new URL('../',import.meta.url))
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const hidden='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const row={id,title:'Public <script>alert(1)</script>',description:'A detailed description of a public construction.',author:'Builder',authorId:'owner',partCount:123}
const catalog={parts:new Map([['2780',{id:'2780',ru:'Штифт с трением',en:'Friction pin',family:'Technic',group:'Штифты'}]]),sets:new Map([['42215-1',{id:'42215-1',name:'Volvo EC500 Hybrid Excavator',volumes:2,pages:524}]])}

test('discovery catalog contains real locally supported set sources and library entries',()=>{
 const actual=loadDiscoveryCatalog(root)
 assert.ok(actual.sets.has('42215-1'))
 assert.ok(actual.sets.has('42238-1'))
 assert.ok(actual.parts.has('2780'))
 assert.ok(actual.parts.size>100)
 assert.ok(readReleaseNotes(root).length>=30)
})
test('dynamic sitemap lists public set and part pages and excludes disabled community',async()=>{
 const discover=createDiscovery({root,catalog})
 const sitemap=await discover('/sitemap.xml')
 assert.match(sitemap.body,/\/sets\/42215-1<\/loc>/)
 assert.match(sitemap.body,/\/parts\/2780<\/loc>/)
 assert.ok(!sitemap.body.includes('/builds</loc>'))
 assert.equal(await discover('/sets/99999-1'),null)
 assert.equal(await discover('/parts/unknown'),null)
 assert.match((await discover('/sets/42215-1')).body,/Volvo EC500 Hybrid Excavator/)
 assert.match((await discover('/parts/2780')).body,/\?part=2780#library/)
 assert.match((await discover('/updates')).body,/github\.com/)
 assert.match((await discover('/en')).body,/<html lang="en">/)
 assert.match((await discover('/builds')).body,/noindex,follow/)
})
test('build metadata is escaped, private or hidden publications cannot be indexed',async()=>{
 const store={listPublicBuilds:async()=>[row],getPublicBuild:async value=>value===id?row:value===hidden?{...row,id:hidden,authorId:'hidden'}:null,getPublicCard:async author=>author==='owner'?{id:author}:null}
 const disabled=createDiscovery({root,catalog,store})
 assert.equal(await disabled('/builds/'+id),null)
 const discover=createDiscovery({root,catalog,store,publicBuilds:true})
 const sitemap=await discover('/sitemap.xml')
 assert.ok(sitemap.body.includes('/builds/'+id))
 const page=await discover('/builds/'+id)
 assert.ok(page.body.includes('&lt;script&gt;'))
 assert.ok(!page.body.includes('<script>alert(1)</script>'))
 assert.equal(await discover('/builds/'+hidden),null)
 assert.equal(await discover('/builds/invalid'),null)
})
test('configuration accepts only valid verification tokens and enables analytics explicitly',()=>{
 assert.deepEqual(seoConfig({BRICKLAB_YANDEX_VERIFICATION:'"><script>',BRICKLAB_METRIKA_ID:'123'}),{yandex:'',google:'',counter:''})
 const cfg=seoConfig({BRICKLAB_YANDEX_VERIFICATION:'abcdef1234',BRICKLAB_GOOGLE_VERIFICATION:'ABC-def_123',BRICKLAB_METRIKA_ID:'12345',BRICKLAB_METRIKA_ENABLED:'true'})
 const base='<html><head><meta property="og:image" content="https://bricklab-3d.ru/assets/examples/5-plus-r-gearbox.webp"></head><body></body></html>'
 const home=decorateSeo(base,'/',cfg,true)
 assert.match(home,/name="yandex-verification" content="abcdef1234"/)
 assert.match(home,/name="google-site-verification" content="ABC-def_123"/)
 assert.match(home,/\/assets\/seo\/og.jpg/)
 assert.ok(!home.includes('bricklab-metrika'))
 assert.match(decorateSeo(base,'/sets/42215-1',cfg),/name="bricklab-metrika" content="12345"/)
 assert.ok(!decorateSeo(base,'/builds/'+id,cfg).includes('bricklab-metrika'))
 assert.ok(!decorateSeo(base,'/payment/success',cfg).includes('bricklab-metrika'))
})
test('HTTP integration serves discovery and verification only on eligible public routes',async t=>{
 const server=createBrickLabServer({root,discovery:createDiscovery({root,catalog}),searchConfig:{yandex:'abcdef1234',google:'ABC-def_123',counter:''}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 t.after(()=>new Promise(resolve=>server.close(resolve)))
 const base='http://127.0.0.1:'+server.address().port
 assert.match(await (await fetch(base+'/')).text(),/name="yandex-verification" content="abcdef1234"/)
 assert.equal((await fetch(base+'/sets/42215-1')).status,200)
 assert.equal((await fetch(base+'/parts/2780')).status,200)
 assert.equal((await fetch(base+'/sets/99999-1')).status,404)
 assert.equal((await fetch(base+'/builds/'+id)).status,404)
 assert.equal((await fetch(base+'/server/seo-config.js')).status,404)
 assert.equal((await fetch(base+'/sets/42215-1',{method:'POST'})).status,405)
})
