import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeSetBooks,validateSet} from '../src/sets/data.js'
import {discoverBooks,indexedBooks,instructionPagePreview} from '../src/sets/instruction-sources.js'
import {canonicalInstructionUrl} from '../src/sets/instruction-url.js'
const set='42238-1',url='https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6661842.pdf'
test('Ducati uses its verified official PDF even when an old catalog supplied another book',async()=>{
 const signal=new AbortController().signal
 const books=[{title:'1',url,pages:null}]
 assert.deepEqual(normalizeSetBooks(set,[{url:url.replace('6661842','9999999'),pages:80}]),books)
 assert.deepEqual(normalizeSetBooks(set,[]),books)
 assert.deepEqual(validateSet({number:set,name:'Ducati',inventory:[],books:[]}).books,books)
 assert.deepEqual(await discoverBooks(set,signal),books)
 assert.deepEqual(await indexedBooks(set,signal),books)
 assert.equal(instructionPagePreview(set,url,1),null)
 assert.equal(canonicalInstructionUrl(url),url)
 assert.equal(normalizeSetBooks(set,[{url,pages:140}])[0].pages,140)
 assert.equal(normalizeSetBooks('42215-1',[{url,pages:140}])[0].pages,140)
})
