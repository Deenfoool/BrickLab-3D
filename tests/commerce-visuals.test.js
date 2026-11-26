import {test} from 'node:test'
import assert from 'node:assert/strict'
import {commerceProducts,productById} from '../src/menu/commerce-catalog.js'
import {insigniaSpec,commerceBadge,productArtwork,productFacts,planSaving,loyaltyBadge} from '../src/menu/commerce-visuals.js'
import {renderUnifiedHero} from '../src/menu/unified-profile.js'
function node(tag){
 const n={tag,className:'',textContent:'',children:[],attrs:{},dataset:{},style:{},namespaceURI:'http://www.w3.org/2000/svg',
  append(...children){this.children.push(...children)},prepend(...children){this.children.unshift(...children)},
  replaceChildren(...children){this.children=children},setAttribute(k,v){this.attrs[k]=String(v)}}
 n.classList={add(...v){n.className=[n.className,...v].filter(Boolean).join(' ')}}
 return n
}
const all=n=>[n,...n.children.flatMap(all)]
function dom(fn){
 const previous=globalThis.document
 globalThis.document={createElement:node,createElementNS:(_,tag)=>node(tag)}
 try{return fn()}finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
}
test('six supporter badges have distinctive art and accessible visible labels; Plus has its own mark',()=>dom(()=>{
 const badges=commerceProducts.filter(p=>p.kind==='badge')
 assert.equal(badges.length,6)
 assert.equal(new Set(badges.map(p=>insigniaSpec(p.id).shape)).size,6)
 for(const p of badges){
  const badge=commerceBadge(p.id)
  assert.equal(badge.children[1].textContent,p.title)
  assert.equal(badge.children[0].attrs['aria-hidden'],'true')
  assert.ok(productArtwork(p))
 }
 const plus=commerceBadge('plus')
 assert.equal(plus.children[1].textContent,'BrickLab Plus')
 assert.ok(plus.className.includes('support-plus'))
 assert.ok(!plus.className.includes('support-gold-builder'))
 assert.equal(commerceBadge('invalid'),null)
 const a=commerceBadge('plus'),b=commerceBadge('plus')
 assert.notEqual(all(a).find(n=>n.tag==='linearGradient').attrs.id,all(b).find(n=>n.tag==='linearGradient').attrs.id)
}))
test('Plus comparison uses actual catalog prices and actual product quantities',()=>dom(()=>{
 assert.equal(planSaving(productById('plus-1')),0)
 assert.equal(planSaving(productById('plus-3')),13)
 assert.equal(planSaving(productById('plus-12')),16)
 for(const p of commerceProducts.filter(p=>['storage','subscription'].includes(p.kind))){
  assert.ok(productArtwork(p))
  const facts=productFacts(p)
  assert.ok(facts.length>=2)
  if(p.kind==='storage')assert.equal(facts[0][0],'+'+p.slots)
 }
 assert.ok(productArtwork({kind:'instruction'}))
 assert.ok(!loyaltyBadge(3,false).className.includes('is-earned'))
 assert.ok(loyaltyBadge(3,true).className.includes('is-earned'))
}))
test('profile hero only displays Plus and support insignia for server-projected identity',()=>dom(()=>{
 const base={lang:'ru',identity:{displayName:'Builder'}}
 const plain=all(renderUnifiedHero(base))
 assert.ok(!plain.some(n=>n.className.includes('commerce-emblem')))
 const active=all(renderUnifiedHero({...base,identity:{...base.identity,plus:true,supportBadge:'diamond-patron'}}))
 assert.ok(active.some(n=>n.className.includes('commerce-emblem support-plus')))
 assert.ok(active.some(n=>n.className.includes('commerce-emblem support-diamond-patron')))
 const unknown=all(renderUnifiedHero({...base,identity:{...base.identity,plus:false,supportBadge:'unknown'}}))
 assert.ok(!unknown.some(n=>n.className.includes('commerce-emblem')))
}))
