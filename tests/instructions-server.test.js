import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createInstructionsHandler, officialBooks } from '../server/instructions.js'
import { canonicalInstructionUrl, instructionPdfUrl } from '../src/sets/instruction-url.js'

const pdf = 'https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6621079.pdf'
const route = `/api/instructions/pdf?url=${encodeURIComponent(pdf)}`
async function fixture(t, fetcher, options = {}) {
  const handler = createInstructionsHandler({ fetcher, ...options })
  const server = createServer(async (req, res) => {
    if (!await handler(req, res, req.url.split('?')[0])) { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  return `http://127.0.0.1:${server.address().port}`
}
test('instruction URL allowlist rejects arbitrary hosts, paths, credentials, ports and query strings', () => {
  assert.equal(canonicalInstructionUrl(pdf + '#page=12'), pdf)
  assert.equal(instructionPdfUrl(pdf), route)
  for (const value of ['http://127.0.0.1/a.pdf', 'https://www.lego.com.evil.test/1.pdf', 'https://www.lego.com/other.pdf', pdf+'?url=http://localhost', pdf.replace('https://','https://user:pass@'), pdf.replace('.com/', '.com:444/'), 'https://bdpinstructions.download.bricklink.info/other.pdf']) assert.equal(canonicalInstructionUrl(value), null, value)
})
test('PDF delivery streams bytes, strips upstream embedding/cookie headers and forwards no credentials', async t => {
  const base = await fixture(t, async (url, options) => {
    assert.equal(url, pdf); assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.cookie, undefined); assert.equal(options.headers.authorization, undefined)
    return new Response('%PDF-1.7\nfixture', { headers: { 'Content-Type':'application/pdf', 'Accept-Ranges':'bytes', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"frame-ancestors 'none'", 'Set-Cookie':'secret=1' } })
  })
  const r = await fetch(base+route, { headers: { Cookie:'private=1', Authorization:'private' } })
  assert.equal(r.status,200); assert.equal(await r.text(),'%PDF-1.7\nfixture')
  for (const name of ['set-cookie','x-frame-options','content-security-policy']) assert.equal(r.headers.get(name),null)
  assert.equal(r.headers.get('content-type'),'application/pdf')
  assert.equal(r.headers.get('accept-ranges'),'bytes')
})
test('PDF range, HEAD and invalid ranges are handled without full-book buffering', async t => {
  const base = await fixture(t, async (url, options) => {
    if (options.method==='HEAD') return new Response(null,{headers:{'Content-Type':'application/pdf','Content-Length':'1000'}})
    assert.equal(options.headers.range,'bytes=20-24')
    return new Response('slice',{status:206,headers:{'Content-Type':'application/pdf','Content-Length':'5','Content-Range':'bytes 20-24/1000'}})
  })
  const range = await fetch(base+route,{headers:{Range:'bytes=20-24'}})
  assert.equal(range.status,206); assert.equal(await range.text(),'slice')
  assert.equal(range.headers.get('content-range'),'bytes 20-24/1000')
  const head = await fetch(base+route,{method:'HEAD'})
  assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'1000');assert.equal(await head.text(),'')
  assert.equal((await fetch(base+route,{headers:{Range:'bytes=0-10,20-30'}})).status,416)
})
test('redirects cannot escape the instruction allowlist; failed responses are retryable', async t => {
  let requests=0
  const base=await fixture(t,async()=>{
    requests++
    return requests===1 ? new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}})
      : new Response('%PDF-1.7',{headers:{'Content-Type':'application/pdf'}})
  })
  assert.equal((await fetch(base+route)).status,502)
  const retry=await fetch(base+route);assert.equal(retry.status,200);await retry.text()
  assert.equal(requests,2)
  assert.equal((await fetch(base+'/api/instructions/pdf?url='+encodeURIComponent('http://localhost/private'))).status,400)
  assert.equal(requests,2)
})
test('missing, oversized and disguised HTML documents are not delivered as PDFs', async t => {
  for (const [upstream,expected] of [
    [()=>new Response(null,{status:404}),404],
    [()=>new Response('bad',{headers:{'Content-Type':'application/pdf','Content-Length':'99999'}}),413],
    [()=>new Response('<html>not a pdf</html>',{headers:{'Content-Type':'application/pdf'}}),502],
    [()=>new Response('<html>',{headers:{'Content-Type':'text/html'}}),502],
  ]) {
    const base=await fixture(t,upstream,{maxBytes:1024})
    const response=await fetch(base+route);assert.equal(response.status,expected);await response.text()
  }
})
test('official discovery preserves all books in order and ignores supplementary leaflets', async t => {
  const second=pdf.replace('6621079','6621080')
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{data:{buildingInstructions:[
    {sequence:{element:'2',total:'2'},pdf:{pdfUrl:second}},
    {sequence:{element:'1',total:'2'},pdf:{pdfUrl:pdf}},
    {isAdditionalInfoBooklet:true,pdf:{pdfUrl:pdf.replace('6621079','9999999')}},
  ]}}})+'</script>'
  assert.deepEqual(officialBooks(html).map(b=>[b.title,b.url]),[['1/2',pdf],['2/2',second]])
  let requests=0
  const base=await fixture(t,async url=>{requests++;assert.equal(url,'https://www.lego.com/en-us/service/building-instructions/42224');return new Response(html)})
  for(let i=0;i<2;i++)assert.equal((await (await fetch(base+'/api/instructions/books?set=42224-1')).json()).books.length,2)
  assert.equal(requests,1)
  assert.equal((await fetch(base+'/api/instructions/books?set=../../private')).status,400)
})
