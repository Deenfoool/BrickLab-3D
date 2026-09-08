const button=document.getElementById('run'),status=document.getElementById('status')
button.onclick=async()=>{
  button.disabled=true
  const saved=localStorage.getItem('bricklab.physics.v2.settings'),scale=window.__bricklabRequestedTimeScale
  try {
    status.textContent='Загрузка production physics…'
    await import('../runtime-extensions.js')
    const {PhysicsSession}=await import('../physics.js')
    const {runAxleCase}=await import('./axle-fixtures.js')
    localStorage.setItem('bricklab.physics.v2.settings',JSON.stringify({quality:'balanced',selfCollision:'mechanical'}))
    window.__bricklabRequestedTimeScale=1
    const seed=await PhysicsSession.create([],[]),RAPIER=seed.RAPIER
    seed.dispose()
    const cases=[{variant:'joint',legacyAxis:true,height:10}]
    for(const variant of ['brick','axle','joint','no-joints','no-contacts','supports','frame','frame-no-axle'])cases.push({variant})
    for(const length of [3,5,7,9,12])for(const brickId of ['technic-brick-1x4','technic-brick-1x6'])cases.push({length,brickId,variant:'joint',rotation:.73,reverse:true})
    const reports=[]
    let passed=true
    for(const options of cases){
      await new Promise(resolve=>setTimeout(resolve,0))
      const r=runAxleCase(RAPIER,options)
      reports.push(r)
      const norm=v=>Math.hypot(v.x,v.y,v.z)
      const e0=r.before.reduce((s,b)=>s+b.energy,0),e1=r.frames[0].bodies.reduce((s,b)=>s+b.energy,0)
      const maxW=Math.max(...r.frames.flatMap(f=>f.bodies.map(b=>norm(b.angularVelocity))))
      const axis=Math.max(0,...r.joints.map(j=>j.axisMismatchRadians))
      if(options.legacyAxis)passed &&= maxW>30 && e1/e0>1.3
      else passed &&= r.failedJointCount===0 && maxW<.001 && axis<1e-6 && r.frames.every(f=>f.bodies.reduce((s,b)=>s+b.energy,0)<=e0*1.0001 && f.bodies.every(b=>Math.abs(b.linearVelocity.y+9.81*f.step/120)<1e-4))
      const tr=document.createElement('tr')
      for(const value of [`${options.legacyAxis?'PHYSICS-8 контроль: ':''}${options.length??12}L / ${options.brickId??'technic-brick-1x6'} / ${options.variant}`,`${r.bodyCount} / ${r.jointCount}`,`${(axis*180/Math.PI).toFixed(4)}°`,`${maxW.toFixed(6)} рад/с`,(e1/e0).toFixed(6)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}
      if(reports.length===1)document.getElementById('results').replaceChildren()
      document.getElementById('results').append(tr)
    }
    document.getElementById('diagnostics').textContent=JSON.stringify(reports,null,2)
    status.className=passed?'pass':'fail'
    status.textContent=passed?'PASS — старый дефект воспроизведён; исправленные оси и рама стабильны во всех 18 сценах.':'FAIL — смотрите измерения'
  }catch(error){status.className='fail';status.textContent=`FAIL — ${error.message}`;console.error(error)}
  finally{button.disabled=false;if(saved===null)localStorage.removeItem('bricklab.physics.v2.settings');else localStorage.setItem('bricklab.physics.v2.settings',saved);window.__bricklabRequestedTimeScale=scale}
}
