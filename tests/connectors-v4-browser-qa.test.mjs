import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root=new URL('../',import.meta.url)

async function text(path){return readFile(new URL(path,root),'utf8')}

function canonicalTag(index){
  const match=index.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(match,'production index has an import map')
  const map=JSON.parse(match[1])
  const target=map.imports?.['./app.js']
  const tag=typeof target==='string'?target.match(/\?v=(.+)$/)?.[1]:null
  assert.ok(tag,'production app mapping has a canonical tag')
  return tag
}

test('browser QA pages delegate import-map ownership to production index',async()=>{
  const [index,loader,timeScale,axle,audio,generator]=await Promise.all([
    text('index.html'),
    text('tests/production-importmap-loader.js'),
    text('tests/time-scale-browser.html'),
    text('tests/axle-browser.html'),
    text('audio-qa.html'),
    text('scripts/version-runtime.mjs'),
  ])
  const tag=canonicalTag(index)
  assert.match(tag,/connector-v4-physics-/)

  for(const [name,html,moduleName] of [
    ['time-scale',timeScale,'./tests/time-scale-browser.js'],
    ['axle',axle,'./tests/axle-browser.js'],
    ['audio',audio,'./audio/qa.js'],
  ]) {
    assert.doesNotMatch(html,/<script\s+type="importmap"/i,`${name} QA must not embed a stale import map`)
    assert.match(html,/production-importmap-loader\.js\?v=1/,`${name} QA loads the production-map bridge`)
    assert.ok(html.includes(`data-module="${moduleName}"`),`${name} QA declares its module to the bridge`)
    assert.doesNotMatch(html,/parts-6-20260910-audio-v1/,`${name} QA contains no historical audio-v1 runtime`)
  }

  assert.match(loader,/new URL\('\.\/index\.html', document\.baseURI\)/,'QA loader reads production index.html')
  assert.match(loader,/querySelector\('script\[type="importmap"\]'\)/,'QA loader extracts the production import map')
  assert.match(loader,/data\?\.imports\?\.\['\.\/app\.js'\]/,'QA loader derives the canonical tag from production app mapping')
  assert.match(loader,/map\.type = 'importmap'/,'QA loader installs import map before boot')
  assert.match(loader,/script\.type = 'module'/,'QA loader starts the requested module after map installation')

  assert.match(generator,/production-importmap-loader\.js/,'runtime generator preserves the shared QA loader')
  assert.equal(generator.includes('testHtml.replace(/(<script type="importmap">)'),false,'runtime generator no longer writes duplicate QA import maps')
  assert.equal(generator.includes('axleHtml.replace(/(<script type="importmap">)'),false,'runtime generator no longer writes duplicate axle QA import maps')
})
