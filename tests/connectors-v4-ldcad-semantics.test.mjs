import test from 'node:test'
import assert from 'node:assert/strict'

import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'

function connector(line) {
  const parsed=parseShadowTextV4(`0 test\n${line}\n`,{file:'semantic.dat'})
  assert.equal(parsed.warnings.length,0,JSON.stringify(parsed.warnings))
  const operation=parsed.operations.find(item=>item.type==='connector')
  assert.ok(operation)
  return operation.connector
}

test('LDCad slide=true on either side enables axial slide for a compatible cylinder pair',()=>{
  const male=connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 4 40] [center=true] [slide=false]')
  const female=connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 4 20] [center=true] [slide=true]')
  const match=matchConnectorV4(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.editorMotion.axialSlide,true)
  assert.equal(match.kinematicHint,'cylindrical')

  const reverse=matchConnectorV4(
    connector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 4 40] [center=true] [slide=true]'),
    connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 4 20] [center=true] [slide=false]'),
  )
  assert.equal(reverse.editorMotion.axialSlide,true)
})

test('LDCad cylinder group limits matching to the same group while unnamed pairs remain compatible',()=>{
  const male=connector('0 !LDCAD SNAP_CYL [group=clickA] [gender=M] [secs=R 6 4]')
  const same=connector('0 !LDCAD SNAP_CYL [group=clickA] [gender=F] [secs=R 6 4]')
  const other=connector('0 !LDCAD SNAP_CYL [group=clickB] [gender=F] [secs=R 6 4]')
  const unnamed=connector('0 !LDCAD SNAP_CYL [gender=F] [secs=R 6 4]')
  assert.equal(matchConnectorV4(male,same).compatible,true)
  assert.equal(matchConnectorV4(male,other).compatible,false)
  assert.equal(matchConnectorV4(male,unnamed).compatible,false)
  assert.equal(matchConnectorV4(
    connector('0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 4]'),
    unnamed,
  ).compatible,true)
})
