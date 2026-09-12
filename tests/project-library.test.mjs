import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PROJECT_LIBRARY_VERSION,
  PROJECT_TEMPLATES,
  createProjectThumbnailSvg,
  projectMetadataFromSnapshot,
} from '../projects/library-v1.js'

const snapshot={
  version:2,name:'Fixture',
  parts:[
    {instanceId:'a',partId:'beam-5',color:0xd7263d,position:[-2,0,0],rotation:[0,0,0]},
    {instanceId:'b',partId:'gear-24',color:0xd9d9d9,position:[3,0,4],rotation:[0,0,0]},
  ],
  connections:[{id:'legacy'}],
  connectionsV4:[{id:'v4-a'},{id:'v4-b'}],
}

test('Project Library metadata is lightweight and counts project content without scene loading',()=>{
  const meta=projectMetadataFromSnapshot(snapshot,{id:'fixture-id'})
  assert.match(PROJECT_LIBRARY_VERSION,/^project-library-v1\./)
  assert.equal(meta.id,'fixture-id')
  assert.equal(meta.name,'Fixture')
  assert.equal(meta.partCount,2)
  assert.equal(meta.linkCount,3)
  assert.match(meta.thumbnailSvg,/^<svg/)
  assert.doesNotMatch(JSON.stringify(meta),/connectionsV4|instanceId/)
})

test('thumbnail generation stays deterministic for the same project geometry',()=>{
  assert.equal(createProjectThumbnailSvg(snapshot),createProjectThumbnailSvg(snapshot))
  assert.match(createProjectThumbnailSvg({parts:[]}),/Empty project/)
})

test('roadmap starter templates are normal v2 BrickLab snapshots',()=>{
  assert.deepEqual(PROJECT_TEMPLATES.map(item=>item.id),['empty','vehicle-chassis','drivetrain-bench','suspension-rig'])
  for(const template of PROJECT_TEMPLATES){
    assert.equal(template.snapshot.version,2)
    assert.ok(Array.isArray(template.snapshot.parts))
    assert.ok(Array.isArray(template.snapshot.connectionsV4))
    assert.equal(template.snapshot.connectionsV4.length,0)
  }
})

test('production mounts Project Library after the editor project contract and cache-busts bootstrap',async()=>{
  const bootstrap=await readFile(new URL('../bootstrap.js',import.meta.url),'utf8')
  const index=await readFile(new URL('../index.html',import.meta.url),'utf8')
  const ui=await readFile(new URL('../projects/library-ui-v1.js',import.meta.url),'utf8')
  const core=await readFile(new URL('../projects/library-v1.js',import.meta.url),'utf8')
  const adapter=bootstrap.indexOf("./architecture/editor-adapter-v1.js?v=architecture-20260911-v1")
  const library=bootstrap.indexOf("./projects/library-ui-v1.js?v=project-library-20260912-v1")
  assert.ok(adapter>=0&&library>adapter)
  assert.equal((index.match(/bootstrap\.js\?v=project-library-20260912-v1/g)||[]).length,2)
  assert.match(core,/indexedDB\.open\(PROJECT_DB_NAME,PROJECT_DB_VERSION\)/)
  assert.match(core,/META_STORE='projects'/)
  assert.match(core,/SNAPSHOT_STORE='snapshots'/)
  assert.match(core,/new DataTransfer\(\)/)
  assert.match(core,/bricklab\.projects\.active\.v1/)
  assert.match(ui,/data-action="open"/)
  assert.match(ui,/data-action="duplicate"/)
  assert.match(ui,/data-action="delete"/)
  assert.match(ui,/data-action="export"/)
})
