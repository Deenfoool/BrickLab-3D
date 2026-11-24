import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validatePublication,publicBuild,communityPage} from '../server/community.js'
test('publication requires exact revision and explicit consent',()=>{
 assert.deepEqual(validatePublication({revision:2,description:' test ',consent:true,document:{}}),{revision:2,description:'test'})
 for(const x of [{revision:1,description:''},{revision:0,description:'',consent:true},{revision:1,description:'x'.repeat(1001),consent:true}])assert.throws(()=>validatePublication(x),{message:'invalid_publication'})
})
test('public build metadata does not expose private IDs or document',()=>{
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 const build=publicBuild({id,authorId:id,author:'Builder',title:'<script>',description:'<img>',revision:1,projectId:'secret',document:{private:true}})
 assert.equal(Object.hasOwn(build,'document'),false)
 assert.equal(Object.hasOwn(build,'projectId'),false)
 const html=communityPage([],false,[build])
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('/community/build/'+id+'/download'))
})
