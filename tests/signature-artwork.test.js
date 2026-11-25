import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {themeIds} from '../src/menu/store-themes.js'
import {mountThemeCover} from '../src/menu/profile-signature.js'
function node(tag='div'){
 const classes=new Set()
 return {tag,children:[],classList:{add(...values){values.forEach(v=>classes.add(v))},contains(v){return classes.has(v)}},append(...items){this.children.push(...items)},prepend(...items){this.children.unshift(...items)},setAttribute(){},textContent:''}
}
test('all six signature covers use real local artwork; uploaded covers are preserved',async()=>{
 const prior=globalThis.document;globalThis.document={createElement:node}
 try{
  const css=await readFile(new URL('../src/menu/signature-artwork.css',import.meta.url),'utf8')
  for(const id of themeIds){
   const asset=await readFile(new URL('../assets/themes/'+id+'.svg',import.meta.url),'utf8')
   assert.match(asset,/^<svg[^>]*viewBox="0 0 960 300"/)
   assert.ok(!/<script|<foreignObject|\bonload\s*=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i.test(asset))
   assert.ok(css.includes('assets/themes/'+id+'.svg'))
   const cover=node();assert.equal(mountThemeCover(cover,id),true);assert.equal(cover.children.length,2);assert.equal(cover.children[0].className,'signature-art')
   const custom=node(),photo=node('img');custom.append(photo)
   assert.equal(mountThemeCover(custom,id,{custom:true}),true);assert.deepEqual(custom.children,[photo]);assert.ok(custom.classList.contains('signature-custom-cover'))
  }
  const invalid=node();assert.equal(mountThemeCover(invalid,'fake'),false);assert.equal(invalid.children.length,0)
 }finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior}
})
