import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankFor, workshopProgress, modelPassport, challengeReadiness, challenges, ranks, badges, skills } from '../src/menu/workshop-model.js'
import { workshopCopy } from '../src/menu/workshop-copy.js'
import { createAccountState } from '../src/menu/account-state.js'
const document={format:'bricklab-3d',version:1,name:'Test model',parts:[{id:'a',design:'3702'},{id:'b',design:'2780'}],connections:[{shaft:{part:'b',port:'shaft'},socket:{part:'a',port:'hole'}}],gears:[]}
test('rank boundaries, maximum rank and tutorial deduplication',()=>{
  for(const [id,xp] of ranks)assert.equal(rankFor(xp).id,id)
  assert.equal(rankFor(15000).progress,1)
  assert.equal(rankFor(-5).id,'novice')
  const p=workshopProgress(['quick','quick','mechanics','invalid'])
  assert.equal(p.xp,60);assert.equal(p.rep,0);assert.deepEqual(p.unlocked,['academy'])
})
test('passport detects broken references, duplicate IDs and non-finite coordinates',()=>{
  const p=modelPassport(document)
  assert.equal(p.structure,true);assert.equal(p.connections,1)
  assert.equal(p.kinematics,'unverified');assert.equal(p.physics,'unverified')
  const invalid=structuredClone(document);invalid.parts.push({id:'a',design:'3702',position:[NaN,0,0]});invalid.connections.push({shaft:{part:'missing'},socket:{part:'a'}})
  const bad=modelPassport(invalid);assert.equal(bad.structure,false);assert.equal(bad.duplicates,1);assert.equal(bad.broken,1);assert.equal(bad.malformed,1)
})
test('challenge readiness is not a verified completion or XP award',()=>{
  const minimal=challenges.find(c=>c.id==='minimal')
  assert.deepEqual(challengeReadiness(minimal,document),{ready:true,reasons:[],verified:false})
  assert.equal(challengeReadiness(challenges[0],document).ready,false)
  assert.equal(challengeReadiness(minimal,null).ready,false)
})
test('demo trash, participant permissions and snapshot preservation',()=>{
  const s=createAccountState();s.signIn();const r={id:'id',document}
  assert.equal(s.save(r),'saved');assert.equal(s.member('id','Demo collaborator','viewer'),true)
  s.simulateRole('id','editor');assert.equal(s.member('id','Other','editor'),false);assert.equal(s.moveToTrash('id'),false)
  s.simulateRole('id','owner');assert.equal(s.moveToTrash('id'),true);assert.equal(s.list().length,0);assert.equal(s.trash().length,1)
  assert.equal(s.save(r),'forbidden');assert.equal(s.restore('id'),true);assert.equal(s.document('id',1).name,document.name)
  assert.equal(s.usage().revisions,1);assert.equal(s.usage().projects,1);s.signOut();assert.equal(s.usage().bytes,0)
})
test('all achievement, rank and skill labels exist in Russian and English',()=>{
  for(const lang of ['ru','en']){
    const t=workshopCopy[lang];for(const [id] of ranks)assert.ok(t[id])
    for(const s of skills)assert.ok(t[s])
    for(const b of badges){assert.ok(t[b.id==='bureau'?'bureauBadge':b.id]);assert.ok(t[b.id+'Desc']);assert.ok(t[b.rarity])}
    for(const c of challenges){assert.ok(t[c.id]);assert.ok(t[c.id+'Desc'])}
  }
})


test('preview keeps experiments but removes the builder diary',async()=>{
 const {workshopSections}=await import('../src/menu/workshop.js')
 assert.ok(workshopSections.some(([key])=>key==='passport'))
 assert.ok(workshopSections.some(([key])=>key==='challenges'))
 assert.ok(!workshopSections.some(([key])=>key==='diary'))
})
