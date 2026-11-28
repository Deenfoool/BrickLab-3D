import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('footer consolidates all legal links while project links move to the header',()=>{
 const html=read('index.html'),footer=html.match(/<footer class="shell-footer">[\s\S]*?<\/footer>/)[0],brand=html.match(/<details class="shell-disclosure brand-disclosure"[\s\S]*?<\/details>/)[0]
 assert.match(footer,/id="legal-navigation"/)
 for(const path of ['requisites','offer','privacy','refund'])assert.match(footer,new RegExp('href="/'+path+'"'))
 assert.match(brand,/github\.com\/Deenfoool\/BrickLab-3D/)
 assert.match(brand,/deenfoool\.github\.io\/portfolio/)
 assert.match(brand,/data-open-history/)
 assert.doesNotMatch(footer,/github\.com|portfolio\/|tips\.tips/)
 assert.doesNotMatch(html,/tips\.tips/)
 assert.doesNotMatch(read('src/menu/home-hub.js'),/tips\.tips/)
 assert.match(html,/href="#store"/)
})
