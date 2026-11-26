import {Box3,Matrix4,Quaternion,Vector3,Triangle} from 'three'
import {gearPoses} from './model.js?v=volvo-spur-gears'
import {evaluateSpurMesh} from '../mechanics/gears.js'
// A conservative surface-crossing detector. Not solid containment, swept-volume
// collision, contact response or a claim that an unflagged model is collision-free.
const EPS=.015 // LDraw units; ignore exact touching and near-coplanar contacts.
const MAX_TRIANGLES=60000, MAX_BUILD_TRIANGLES=240000, MAX_PARTS=5000, MAX_PAIRS=2500, MAX_NODES=1000000
const trees=new WeakMap()
const pairKey=(a,b)=>JSON.stringify(a<b?[a,b]:[b,a])
const point=(attr,i)=>new Vector3().fromBufferAttribute(attr,i)
function buildTree(items){
 const box=new Box3()
 for(const t of items)box.union(t.box)
 if(items.length<=8)return {box,items}
 const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z'
 items.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]))
 const mid=items.length>>1
 return {box,left:buildTree(items.slice(0,mid)),right:buildTree(items.slice(mid))}
}
function geometryTree(model,budget){
 if(trees.has(model))return trees.get(model)
 let count=0
 for(const g of model.meshes){const p=g.getAttribute('position');count+=Math.floor((g.index?.count??p?.count??0)/3)}
 if(count>MAX_TRIANGLES||!count){trees.set(model,null);return null}
 if(budget.built+count>MAX_BUILD_TRIANGLES||performance.now()>budget.deadline){budget.buildLimited=true;return null}
 budget.built+=count
 const items=[]
 for(const g of model.meshes){
  const p=g.getAttribute('position'),idx=g.index
  if(!p)continue
  for(let i=0;i+2<(idx?.count??p.count);i+=3){
   const v=[0,1,2].map(k=>point(p,idx?idx.getX(i+k):i+k))
   if(!v.every(x=>[x.x,x.y,x.z].every(Number.isFinite)))continue
   const n=new Vector3().subVectors(v[1],v[0]).cross(new Vector3().subVectors(v[2],v[0]))
   if(n.lengthSq()<1e-12)continue
   items.push({v,box:new Box3().setFromPoints(v)})
  }
 }
 const tree=items.length?buildTree(items):null
 trees.set(model,tree);return tree
}
function strictOverlap(a,b){
 return ['x','y','z'].every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>EPS)
}
function matrix(p){return new Matrix4().compose(new Vector3().fromArray(p.position),new Quaternion().fromArray(p.rotation).normalize(),new Vector3().fromArray(p.previewScale??[1,1,1]).multiply(new Vector3(p.mirrored?-1:1,1,1)))}
function worldBox(node,m,cache){
 if(!cache.has(node))cache.set(node,node.box.clone().applyMatrix4(m))
 return cache.get(node)
}
// Segment crosses the interior of a noncoplanar triangle. Ignore endpoint-only
// and edge-only contact: LEGO parts frequently share exact mating surfaces.
function edgeCross(a,b,t){
 const n=new Vector3().subVectors(t[1],t[0]).cross(new Vector3().subVectors(t[2],t[0])).normalize()
 const da=n.dot(new Vector3().subVectors(a,t[0])),db=n.dot(new Vector3().subVectors(b,t[0]))
 if(Math.abs(da)<=EPS||Math.abs(db)<=EPS||da*db>=0)return null
 const p=a.clone().lerp(b,da/(da-db)),bary=Triangle.getBarycoord(p,...t,new Vector3())
 return bary&&bary.x>1e-5&&bary.y>1e-5&&bary.z>1e-5?p:null
}
function crossing(a,b){
 for(const [s,t] of [[a,b],[b,a]])for(let i=0;i<3;i++){
  const p=edgeCross(s[i],s[(i+1)%3],t)
  if(p)return p
 }
 return null
}
function intersectTrees(a,b,budget){
 const ca=new WeakMap(),cb=new WeakMap(),stack=[[a.tree,b.tree]]
 while(stack.length){
  if(++budget.nodes>MAX_NODES||performance.now()>budget.deadline)return {limited:true}
  const [x,y]=stack.pop()
  // Triangle boxes may be flat: use inclusive AABB for the narrow traversal.
  if(!worldBox(x,a.matrix,ca).intersectsBox(worldBox(y,b.matrix,cb)))continue
  if(x.items&&y.items){
   for(const i of x.items)for(const j of y.items){
    if(++budget.nodes>MAX_NODES||performance.now()>budget.deadline)return {limited:true}
    if(!worldBox(i,a.matrix,ca).intersectsBox(worldBox(j,b.matrix,cb)))continue
    const p=crossing(i.v.map(v=>v.clone().applyMatrix4(a.matrix)),j.v.map(v=>v.clone().applyMatrix4(b.matrix)))
    if(p)return {point:p.toArray()}
   }
  }else if(!x.items&&(y.items||x.box.getSize(new Vector3()).lengthSq()>=y.box.getSize(new Vector3()).lengthSq())){
   stack.push([x.left,y],[x.right,y])
  }else stack.push([x,y.left],[x,y.right])
 }
 return {}
}
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0))
export async function inspectCollisions({parts,models,connections=[],movingIds=null,signal,deadline=Infinity}){
 const result={pairs:[],checked:0,excluded:0,unavailable:0,limited:false}
 if(parts.length>MAX_PARTS){result.limited=true;return result}
 const exempt=new Set(connections.map(l=>pairKey(l.shaft?.part,l.socket?.part)))
 const gears=new Map(gearPoses(parts).map(g=>[g.part,g]))
 const entries=[],budget={nodes:0,built:0,buildLimited:false,deadline:Math.min(deadline,performance.now()+3000)}
 for(const p of parts){
  signal?.throwIfAborted()
  if(!models.get(p.design)?.bounds||!Array.isArray(p.position)||!Array.isArray(p.rotation)){result.unavailable++;continue}
  const m=matrix(p)
  entries.push({p,matrix:m,box:models.get(p.design).bounds.clone().applyMatrix4(m)})
 }
 entries.sort((a,b)=>a.box.min.x-b.box.min.x)
 let candidates=0,lastYield=performance.now()
 for(let i=0;i<entries.length;i++){
  const a=entries[i]
  for(let j=i+1;j<entries.length;j++){
   const b=entries[j]
   if(b.box.min.x>=a.box.max.x-EPS)break
   if(++budget.nodes>MAX_NODES||performance.now()>budget.deadline){result.limited=true;return result}
   if(movingIds&&!movingIds.has(a.p.id)&&!movingIds.has(b.p.id))continue
   if(!strictOverlap(a.box,b.box))continue
   if(exempt.has(pairKey(a.p.id,b.p.id))||(gears.has(a.p.id)&&gears.has(b.p.id)&&evaluateSpurMesh(gears.get(a.p.id),gears.get(b.p.id)).ok)){result.excluded++;continue}
   if(++candidates>MAX_PAIRS){result.limited=true;return result}
   signal?.throwIfAborted()
   if(performance.now()-lastYield>12){await yieldUI();signal?.throwIfAborted();lastYield=performance.now()}
   a.tree??=geometryTree(models.get(a.p.design),budget);b.tree??=geometryTree(models.get(b.p.design),budget)
   if(budget.buildLimited){result.limited=true;return result}
   if(!a.tree||!b.tree){result.unavailable++;continue}
   const hit=intersectTrees(a,b,budget)
   if(hit.limited){result.limited=true;return result}
   result.checked++
   if(hit.point){result.pairs.push({a:a.p.id,b:b.p.id,point:hit.point});if(result.pairs.length>=100){result.limited=true;return result}}
  }
  if(performance.now()-lastYield>12){await yieldUI();signal?.throwIfAborted();lastYield=performance.now()}
 }
 return result
}
