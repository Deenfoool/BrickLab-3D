import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountState } from '../src/menu/account-state.js'
const record = { id:'local-1',document:{format:'bricklab-3d',version:1,name:'Test',parts:[],connections:[]} }
test('demo snapshots require a demo profile, are independent and preserve history',()=>{
  const state=createAccountState()
  assert.equal(state.save(record),'signed_out')
  state.signIn()
  assert.equal(state.save(record),'saved')
  assert.equal(state.save(record),'unchanged')
  assert.equal(state.get(record.id).visibility,'private')
  const edited=structuredClone(record);edited.document.name='Edited'
  assert.equal(state.save(edited),'saved')
  assert.equal(state.document(record.id,1).name,'Test')
  const copy=state.document(record.id,2);copy.name='Changed'
  assert.equal(state.document(record.id,2).name,'Edited')
  state.signOut()
  assert.equal(state.list().length,0)
  assert.equal(record.document.name,'Test')
})
test('simulated owner, editor and viewer restrictions',()=>{
  const state=createAccountState();state.signIn();state.save(record)
  assert.equal(state.setVisibility(record.id,'public'),true)
  state.simulateRole(record.id,'viewer')
  assert.equal(state.save(record),'forbidden')
  assert.equal(state.setVisibility(record.id,'private'),false)
  state.simulateRole(record.id,'editor')
  const changed=structuredClone(record);changed.document.name='Edited'
  assert.equal(state.save(changed),'saved')
  assert.equal(state.setVisibility(record.id,'private'),false)
  state.simulateRole(record.id,'owner')
  assert.equal(state.setVisibility(record.id,'private'),true)
})
