import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_TEST_PROFILES, TESTLAB_MAX_RUNS, normalizeTestProfile, saveTestProfile, deleteTestProfile,
  readCustomProfiles, recordTestRun, readTestRuns, compareTestRuns, defaultCustomProfile,
} from '../testlab/core-v2.js'

function storage(){const data=new Map();return{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}

test('keeps four trusted built-in TEST presets',()=>{
  assert.deepEqual(Object.keys(BUILTIN_TEST_PROFILES),['hill-climb','torque-pull','obstacle-course','dyno-bench'])
  assert.equal(BUILTIN_TEST_PROFILES['hill-climb'].metric,'time')
  assert.equal(BUILTIN_TEST_PROFILES['torque-pull'].metric,'force')
  assert.equal(BUILTIN_TEST_PROFILES['dyno-bench'].metric,'power')
})

test('normalizes composable modules and clamps unsafe values',()=>{
  const p=normalizeTestProfile({id:'X Test',metric:'bogus',surface:'lava',modules:[{type:'incline',angleDeg:80,lengthStud:0,widthStud:99,startZStud:3},{type:'surface-zone',surface:'ice',startZStud:2,endZStud:9},{type:'unknown'}]})
  assert.equal(p.id,'x-test');assert.equal(p.metric,'time');assert.equal(p.surface,'concrete');assert.equal(p.modules.length,2)
  assert.equal(p.modules[0].angleDeg,35);assert.equal(p.modules[0].lengthStud,2);assert.equal(p.modules[0].widthStud,16)
  assert.equal(p.modules[1].surface,'ice')
})

test('saves, updates and deletes custom profiles without touching built-ins',()=>{
  const s=storage(),draft=defaultCustomProfile(),saved=saveTestProfile(s,{...draft,id:'',name:'Trail rig'},{now:100})
  assert.match(saved.id,/^custom-trail-rig-100$/);assert.equal(readCustomProfiles(s).length,1)
  saveTestProfile(s,{...saved,name:'Trail rig v2'},{now:200});assert.equal(readCustomProfiles(s)[0].name,'Trail rig v2')
  assert.equal(deleteTestProfile(s,'hill-climb'),false);assert.equal(deleteTestProfile(s,saved.id),true);assert.equal(readCustomProfiles(s).length,0)
})

test('run history is bounded and preserves compact physics-time traces',()=>{
  const s=storage()
  for(let i=0;i<TESTLAB_MAX_RUNS+5;i++)recordTestRun(s,{id:`r${i}`,profileId:'hill-climb',profileName:'Hill',metric:'time',primary:10+i,elapsedSeconds:10+i,trace:[{t:i,speed:2,rpm:100,power:3,slip:4,wheelLoad:5}]})
  const runs=readTestRuns(s);assert.equal(runs.length,TESTLAB_MAX_RUNS);assert.equal(runs[0].id,`r${TESTLAB_MAX_RUNS+4}`);assert.equal(runs[0].trace[0].t,TESTLAB_MAX_RUNS+4)
})

test('compares repeat runs with signed percentage deltas',()=>{
  const delta=compareTestRuns({profileId:'p',elapsedSeconds:8,peakForceN:12,peakPowerW:15,topSpeedMps:3,maxRpm:300,avgSlipPct:10,peakWheelLoadN:20,primary:8},{profileId:'p',elapsedSeconds:10,peakForceN:10,peakPowerW:10,topSpeedMps:2,maxRpm:200,avgSlipPct:20,peakWheelLoadN:20,primary:10})
  assert.equal(delta.sameProfile,true);assert.equal(delta.elapsedPct,-20);assert.equal(delta.peakPowerPct,50);assert.equal(delta.avgSlipPct,-50)
})
