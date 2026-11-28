import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createSiteMotion,motionBudget,motionDelay,motionAllowed} from '../src/menu/site-motion.js'
function fixture({reduced=false}={}){
 const calls=[],observers=[],mutations=[],frames=new Map();let seq=0,change
 const media={matches:reduced,addEventListener(_,fn){change=fn},removeEventListener(){change=null}}
 const make=(key='',excluded=false)=>({isConnected:true,excluded,closest(sel){return sel.includes('.is-editing')&&this.excluded?this:null},getAttribute(name){return name==='data-widget'?key:null},matches(){return false},animate(keyframes,options){const a={cancel(){this.cancelled=true;this.oncancel?.()}};calls.push({node:this,keyframes,options,a});return a}})
 const nodes=[make('awards'),make('featured'),make('hidden',true),...Array.from({length:40},()=>make())]
 const root={hidden:false,querySelector(){return this},querySelectorAll(){return nodes}}
 class Intersection{constructor(cb){this.cb=cb;this.nodes=new Set();observers.push(this)}observe(n){this.nodes.add(n)}unobserve(n){this.nodes.delete(n)}disconnect(){this.nodes.clear();this.disconnected=true}}
 class Mutation{constructor(cb){this.cb=cb;mutations.push(this)}observe(){}disconnect(){this.disconnected=true}}
 const director=createSiteMotion(root,{media,Intersection,Mutation,raf:fn=>{frames.set(++seq,fn);return seq},caf:id=>frames.delete(id)})
 function flush(){for(const [id,fn] of [...frames]){frames.delete(id);fn()}}
 function intersect(){const obs=observers.at(-1);obs.cb([...obs.nodes].map(target=>({target,isIntersecting:true})));flush()}
 return {director,root,media,nodes,calls,observers,mutations,frames,flush,intersect,setReduced(v){media.matches=v;change?.()}}
}
test('motion stays bounded, runs only for viewport entrants, excludes editing and cancels when entering CAD',()=>{
 const f=fixture();f.director.setRoute('account');f.flush();assert.equal(f.calls.length,0);assert.equal(f.observers[0].nodes.size,motionBudget)
 f.intersect();assert.equal(f.calls.length,motionBudget);assert.ok(f.calls.every(c=>!c.node.excluded&&c.options.delay<=140));assert.equal(f.observers[0].disconnected,true);assert.equal(f.mutations[0].disconnected,true)
 f.director.setRoute(null);assert.ok(f.calls.every(c=>c.a.cancelled));assert.equal(f.frames.size,0);f.director.dispose()
 assert.equal(motionDelay(99),140);assert.equal(motionDelay(-1),0)
})
test('system reduced motion suppresses or cancels animation; hidden shell remains static',()=>{
 const f=fixture({reduced:true});f.director.setRoute('home');f.flush();assert.equal(f.observers.length,0);assert.equal(f.calls.length,0)
 f.setReduced(false);f.flush();f.intersect();assert.ok(f.calls.length>0)
 f.setReduced(true);assert.ok(f.calls.every(c=>c.a.cancelled));f.director.setRoute('community');f.flush();assert.equal(f.observers.length,1);assert.equal(motionAllowed({hidden:true},{matches:false}),false);f.director.dispose()
})
