import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { historyPath, parseHistory, validateHistory, isMajorChange, checkChange } from '../scripts/check-release-history.mjs'
const source = readFileSync(new URL('../'+historyPath,import.meta.url),'utf8')
const history = parseHistory(source)
const entry = ['2026-11-27','pull/999','Новый инструмент','Добавлен новый инструмент для работы с деталями.','New tool','A new tool for building with parts is available.']
const major = [{path:'src/editor/new-tool.js',lines:80,added:true}]
const small = [{path:'src/editor/editor.js',lines:12,added:false}]

test('all existing release entries are valid and bilingual',()=>assert.equal(validateHistory(history),history))
test('major application changes require a new release entry',()=>{
  assert.throws(()=>checkChange(history,history,major),/Major application update/)
  assert.equal(checkChange(history,[entry,...history],major),1)
  assert.throws(()=>checkChange(history,[entry,...history.slice(0,-1)],major),/Major application update/)
})
test('small fixes and documentation-only changes do not force a release entry',()=>{
  assert.equal(checkChange(history,history,small),0)
  assert.equal(isMajorChange([{path:'docs/manual.md',lines:800,added:true}]),false)
})
test('large changes and database migrations require history',()=>{
  assert.equal(isMajorChange([{path:'src/editor/editor.js',lines:200,added:false}]),true)
  assert.equal(isMajorChange([{path:'server/db/migrations/999.sql',lines:2,added:true}]),true)
  assert.equal(isMajorChange(Array.from({length:5},(_,i)=>({path:'src/file'+i+'.js',lines:1,added:false}))),true)
})
test('invalid dates, duplicate titles, missing translations and bad sources are rejected',()=>{
  for (const [index,value] of [[0,'2026-02-31'],[1,'https://example.com'],[3,''],[5,'short']]) {
    const bad=entry.slice();bad[index]=value
    assert.throws(()=>validateHistory([bad,...history]))
  }
  assert.throws(()=>validateHistory([history[0],...history]),/Duplicate/)
  assert.throws(()=>validateHistory([...history,entry]),/newest first/)
})
