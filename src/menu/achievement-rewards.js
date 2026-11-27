export const achievementRewards=Object.freeze([
 {id:'forge',award:'gears',ru:'Кузница механизмов',en:'Mechanism forge'},
 {id:'masterwork',award:'mega',ru:'Монумент',en:'Monument'},
 {id:'pioneer',award:'founder',ru:'Первопроходец',en:'Pioneer'},
 {id:'starlight',award:'recognition',ru:'Звёздный конструктор',en:'Starlight'},
 {id:'marathon',award:'days90',ru:'Инженерный марафон',en:'Engineering marathon'},
 {id:'academy',award:'academy',ru:'Академия',en:'Academy'}
])
export const rewardById=id=>achievementRewards.find(r=>r.id===id)
export function rewardInventory(awards){const ids=new Set((awards??[]).map(a=>a.award));return achievementRewards.map(r=>({...r,owned:ids.has(r.award)}))}
export function applyAchievementAppearance(node,id){if(rewardById(id))node.classList.add('earned-style','earned-style-'+id)}
