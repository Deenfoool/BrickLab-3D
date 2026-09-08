import { Window } from 'happy-dom'
import RAPIER from '@dimforge/rapier3d-compat'
const dom=new Window()
for(const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS'])globalThis[key]=key==='window'?dom:dom[key]
globalThis.requestAnimationFrame=()=>0;globalThis.setInterval=()=>0
await import('../runtime-extensions.js')
const {runAxleCase}=await import('./axle-fixtures.js')
await RAPIER.init()
const cases=[]
for(const legacyAxis of [true,false]) for(const variant of ['brick','axle','joint','no-joints','no-contacts','supports','frame','frame-no-axle']) {
 const r=runAxleCase(RAPIER,{length:12,brickId:'technic-brick-1x6',variant,height:10,legacyAxis})
 cases.push(r)
}
console.log(JSON.stringify({rapier:'0.20.0',units:{length:'metres',mass:'kg',energy:'J',angularVelocity:'rad/s'},cases},null,2))
await dom.happyDOM.close()
