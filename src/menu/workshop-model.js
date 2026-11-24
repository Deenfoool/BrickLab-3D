// Shared, deterministic presentation rules. Production awards must be server-issued.
export const ranks = [
  ['novice',0],['builder',100],['mechanic',300],['technician',700],
  ['engineer',1200],['chief',3000],['architect',6000],['legend',15000],
]
export const skills = ['mechanics','transport','physics','architecture','construction','community']
export const challenges = [
  {id:'gearbox',xp:250,max:150,category:'mechanics',gears:2},
  {id:'offroad',xp:400,category:'transport',drive:true},
  {id:'minimal',xp:150,max:30,category:'construction',connections:1},
]
export const badges = [
  {id:'academy',rarity:'common',icon:'book',xp:30},
  {id:'firstPublication',rarity:'uncommon',icon:'icon-cloud'},
  {id:'gears',rarity:'rare',icon:'settings'},
  {id:'firstDrive',rarity:'rare',icon:'play'},
  {id:'mega',rarity:'epic',icon:'layers'},
  {id:'bugs',rarity:'epic',icon:'icon-bug'},
  {id:'bureau',rarity:'rare',icon:'icon-account'},
  {id:'instruction',rarity:'uncommon',icon:'book'},
  {id:'recognition',rarity:'legendary',icon:'icon-trophy'},
  {id:'beta',rarity:'unique',icon:'icon-flask'},
  {id:'founder',rarity:'unique',icon:'icon-trophy'},
  {id:'firstEngineer',rarity:'unique',icon:'icon-trophy'},
  {id:'veteran',rarity:'unique',icon:'icon-account'},
  {id:'worldPioneer',rarity:'unique',icon:'icon-flask'},
]
export function rankFor(xp) {
  const value = Math.max(0, Number.isFinite(xp) ? xp : 0)
  const index = ranks.findLastIndex(([,min])=>value>=min)
  const [id,min] = ranks[index], next = ranks[index+1]
  return {id,min,next:next?.[0]??null,target:next?.[1]??min,
    progress:next?Math.max(0,Math.min(1,(value-min)/(next[1]-min))):1}
}
export function modelPassport(doc) {
  const parts=Array.isArray(doc?.parts)?doc.parts:[], links=Array.isArray(doc?.connections)?doc.connections:[]
  const ids=new Set(), duplicates=new Set()
  let malformed=0
  for(const p of parts){
    if(typeof p?.id!=='string'||!p.id||typeof p.design!=='string'||!p.design) {malformed++;continue}
    if(ids.has(p.id))duplicates.add(p.id)
    ids.add(p.id)
    if(p.position!==undefined&&(!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)))malformed++
    if(p.rotation!==undefined&&(!Array.isArray(p.rotation)||p.rotation.length!==4||!p.rotation.every(Number.isFinite)))malformed++
  }
  let broken=0
  for(const c of links)if(!ids.has(c?.shaft?.part)||!ids.has(c?.socket?.part)||c.shaft.part===c.socket.part||
    typeof c.shaft.port!=='string'||typeof c.socket.port!=='string')broken++
  const gears=Array.isArray(doc?.gears)?doc.gears.length:0,belts=Array.isArray(doc?.belts)?doc.belts.length:0
  return {parts:parts.length,connections:links.length,gears,belts,broken,malformed,duplicates:duplicates.size,
    structure:!broken&&!malformed&&!duplicates.size,driveConfigured:Boolean(doc?.testDrive),guided:Boolean(doc?.buildingSet),
    physics:'unverified',kinematics:'unverified'}
}
export function challengeReadiness(challenge,doc) {
  if(!doc)return {ready:false,reasons:['chooseBuild']}
  const p=modelPassport(doc), reasons=[]
  if(!p.parts||!p.structure)reasons.push('invalidStructure')
  if(challenge.max&&p.parts>challenge.max)reasons.push('partLimit')
  if(challenge.gears&&p.gears<challenge.gears)reasons.push('gearLimit')
  if(challenge.connections&&p.connections<challenge.connections)reasons.push('connectionLimit')
  if(challenge.drive&&!p.driveConfigured)reasons.push('driveMissing')
  return {ready:!reasons.length,reasons,verified:false}
}
export function workshopProgress(completed) {
  const lessons=[...new Set(completed)].filter(x=>['quick','first','mechanics'].includes(x))
  // Local tutorial completion is preview evidence only, never a trusted server award.
  return {xp:lessons.length*30,rep:0,lessons:lessons.length,
    skills:{mechanics:lessons.includes('mechanics')?1:0,transport:0,physics:0,architecture:0,construction:lessons.filter(x=>x!=='mechanics').length,community:0},
    unlocked:lessons.length?['academy']:[]}
}
