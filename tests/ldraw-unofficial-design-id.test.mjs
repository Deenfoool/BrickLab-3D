import test from 'node:test'
import assert from 'node:assert/strict'
import {
  recoverLDrawDesignId,
  normalizeLDrawDesignIdQuery,
} from '../ldraw/direct-id-recovery-v1.js'
import {
  createLDrawTextTransport,
  LDRAW_MIRRORS,
  LDRAW_UNOFFICIAL_MIRROR,
} from '../ldraw/text-transport-v1.js'

test('normalizes an exact LDraw design id without accepting free text',()=>{
  assert.equal(normalizeLDrawDesignIdQuery('4368'),'4368')
  assert.equal(normalizeLDrawDesignIdQuery('ldraw-4368.dat'),'4368')
  assert.equal(normalizeLDrawDesignIdQuery('Technic 4368'),null)
})

test('4368 can be recovered even when it is absent from the official index',async()=>{
  const calls=[]
  const item=await recoverLDrawDesignId('4368',{
    currentIndex:[],
    getIndex:async()=>[],
    getMetadata:async file=>{
      calls.push(file)
      return{
        file:'4368.dat',
        code:'4368',
        description:'Technic Engine Crank Disk',
        category:'',
        type:'Unofficial_Part',
      }
    },
  })
  assert.deepEqual(calls,['4368.dat'])
  assert.equal(item.code,'4368')
  assert.equal(item.file,'4368.dat')
  assert.equal(item.category,'Technic')
  assert.equal(item.unofficial,true)
  assert.equal(item.recoveredBy,'direct-design-id')
})

test('unofficial mirror is last so official geometry always wins first',()=>{
  assert.equal(LDRAW_MIRRORS.at(-1),LDRAW_UNOFFICIAL_MIRROR)
  assert.ok(LDRAW_MIRRORS.length>=3)
})

test('text transport falls back to unofficial 4368 and its subpart after official 404s',async()=>{
  const requested=[]
  const unofficial={
    'parts/4368.dat':'0 Technic Engine Crank Disk\n0 Name: 4368.dat\n0 !LDRAW_ORG Unofficial_Part\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\4368s01.dat',
    'parts/s/4368s01.dat':'0 ~Technic Engine Crank Disk Half\n0 Name: s\\4368s01.dat\n0 !LDRAW_ORG Unofficial_Subpart',
  }
  const fetcher=async url=>{
    requested.push(url)
    const path=Object.keys(unofficial).find(candidate=>url===`${LDRAW_UNOFFICIAL_MIRROR}${candidate}`)
    if(path)return{ok:true,status:200,text:async()=>unofficial[path]}
    return{ok:false,status:404,text:async()=>''}
  }
  const transport=createLDrawTextTransport({fetcher,timeoutMs:1000})
  const part=await transport.read('parts/4368.dat')
  const subpart=await transport.subpart('s/4368s01.dat')
  assert.match(part,/Technic Engine Crank Disk/)
  assert.match(subpart,/Crank Disk Half/)
  assert.ok(requested.includes(`${LDRAW_UNOFFICIAL_MIRROR}parts/4368.dat`))
  assert.ok(requested.includes(`${LDRAW_UNOFFICIAL_MIRROR}parts/s/4368s01.dat`))
})
