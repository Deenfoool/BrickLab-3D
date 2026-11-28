import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createBrickLabServer} from '../server/http.js'
import {siteOrigin,previewImage,publicSeoPaths,seoResponse} from '../server/seo.js'

test('sitemap lists canonical, public, crawlable URLs only',()=>{
  const sitemap=seoResponse('/sitemap.xml')
  assert.match(sitemap.type,/application\/xml/)
  const urls=[...sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1])
  assert.deepEqual(urls,publicSeoPaths.map(p=>siteOrigin+p))
  assert.ok(urls.every(u=>!u.includes('#')&&!u.includes('/api/')))
  const robots=seoResponse('/robots.txt').body
  assert.ok(robots.includes('Sitemap: '+siteOrigin+'/sitemap.xml'))
  assert.match(robots,/Disallow: \/api\//)
  assert.ok(!robots.includes('Disallow: /\n'))
})

test('feature pages have unique metadata, real content and working editor links without JavaScript',()=>{
  const titles=new Set()
  for(const path of publicSeoPaths.slice(1)){
    const page=seoResponse(path)
    assert.match(page.type,/text\/html/)
    assert.ok(page.body.includes('rel="canonical" href="'+siteOrigin+path+'"'))
    assert.ok(page.body.includes('property="og:image" content="'+previewImage+'"'))
    assert.match(page.body,/<h1>[^<]+<\/h1>/)
    assert.match(page.body,/href="\/#(?:projects|sets|library|examples)"/)
    titles.add(page.body.match(/<title>(.*?)<\/title>/)[1])
    for(const linked of publicSeoPaths.slice(1))assert.ok(page.body.includes('href="'+linked+'"'))
  }
  assert.equal(titles.size,publicSeoPaths.length-1)
  assert.equal(seoResponse('/api/private'),null)
  assert.equal(seoResponse('/unknown'),null)
})

test('production HTTP serves SEO routes, preview image and stylesheet; unknown routes remain 404',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url))
  const server=createBrickLabServer({root})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  t.after(()=>new Promise(resolve=>server.close(resolve)))
  const base='http://127.0.0.1:'+server.address().port
  for(const path of ['/robots.txt','/sitemap.xml',...publicSeoPaths,'/assets/seo.css','/assets/bricklab.svg',new URL(previewImage).pathname]){
    const response=await fetch(base+path)
    assert.equal(response.status,200,path)
    await response.arrayBuffer()
  }
  const main=await (await fetch(base+'/')).text()
  assert.match(main,/<meta name="description" content="[^"]+"/)
  assert.ok(main.includes('rel="canonical" href="'+siteOrigin+'/"'))
  assert.ok(main.includes('property="og:image" content="'+previewImage+'"'))
  assert.ok(main.includes('href="/editor"'))
  assert.equal((await fetch(base+'/nonexistent-seo-route')).status,404)
  const head=await fetch(base+'/sitemap.xml',{method:'HEAD'})
  assert.equal(head.status,200)
  assert.equal(await head.text(),'')
  const post=await fetch(base+'/robots.txt',{method:'POST'})
  assert.equal(post.status,405)
})
