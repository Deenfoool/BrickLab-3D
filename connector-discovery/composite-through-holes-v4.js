export const COMPOSITE_THROUGH_HOLES_VERSION_V4='composite-through-holes-v4.1.0'

const IDENTITY=Object.freeze([1,0,0,0,1,0,0,0,1])
const BUSH_AXLE_ORIENTATION=Object.freeze([1,0,0,0,0,-1,0,1,0])
const ORTHO_EPS=2e-4
const SCALE_EPS=2e-3
const DEFAULT_MAX_DEPTH=8
const DEFAULT_MAX_NODES=128

const normalizePath=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/^parts\//i,'').replace(/\/+/g,'/').trim()
const basename=value=>normalizePath(value).split('/').pop()?.toLowerCase()||''
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s]
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const len=a=>Math.hypot(a[0],a[1],a[2])
const norm=a=>{const n=len(a);return n>1e-12?scale(a,1/n):[0,0,0]}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const col=(m,i)=>[m[i],m[3+i],m[6+i]]
const det=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6])
const fromCols=(x,y,z)=>[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]]
const mul=(a,b)=>[
  a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
  a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
  a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
]
const mulv=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]
const compose=(a,b)=>({linear:mul(a.linear,b.linear),translation:add(mulv(a.linear,b.translation),a.translation)})

function parseRefs(text){
  const refs=[]
  for(const raw of String(text||'').split(/\r?\n/)){
    const t=raw.trim().split(/\s+/)
    if(t[0]!=='1'||t.length<15)continue
    const n=t.slice(2,14).map(Number)
    if(!n.every(Number.isFinite))continue
    const[x,y,z,a,b,c,d,e,f,g,h,i]=n
    refs.push({ref:normalizePath(t.slice(14).join(' ')),transform:{linear:[a,b,c,d,e,f,g,h,i],translation:[x,y,z]},raw})
  }
  return refs
}

function rigidBasis(linear){
  let x=col(linear,0),y=col(linear,1),z=col(linear,2)
  const sx=len(x),sy=len(y),sz=len(z)
  if(Math.abs(sx-1)>SCALE_EPS||Math.abs(sy-1)>SCALE_EPS||Math.abs(sz-1)>SCALE_EPS)return null
  x=norm(x);y=norm(y);z=norm(z)
  if(Math.max(Math.abs(dot(x,y)),Math.abs(dot(x,z)),Math.abs(dot(y,z)))>ORTHO_EPS)return null
  if(det(linear)<0)x=scale(x,-1)
  x=norm(add(x,scale(y,-dot(x,y))))
  z=norm(cross(x,y))
  if(len(x)<.99||len(y)<.99||len(z)<.99)return null
  return fromCols(x,y,z)
}

function bushAxleHole(transform,{file,primitive,raw,depth}){
  const basis=rigidBasis(transform.linear)
  if(!basis)return null
  return{
    schemaVersion:4,family:'cylinder',gender:'female',group:null,
    frame:{positionLdu:[...transform.translation],orientation:mul(basis,BUSH_AXLE_ORIENTATION)},
    geometry:{sections:[{shape:'A',radiusLdu:6,lengthLdu:20,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'ldraw-composite-through-hole-discovery',file,primitive,meta:'VERIFIED_BUSH_AXLE_HOLE',raw},
    provenance:[{type:'composite-through-hole-discovery',primitive,depth}],
    discovery:{version:COMPOSITE_THROUGH_HOLES_VERSION_V4,role:'technic-axle-hole',confidence:'official-composite-verified'},
  }
}

const isBushPrimitive=ref=>['bush.dat','bush0.dat'].includes(basename(ref))
const isSubpart=ref=>/^s\//i.test(normalizePath(ref))

export async function discoverCompositeThroughHolesV4(file,text,fetchText,{maxDepth=DEFAULT_MAX_DEPTH,maxNodes=DEFAULT_MAX_NODES}={}){
  if(typeof fetchText!=='function')throw new Error('discoverCompositeThroughHolesV4 requires fetchText')
  const root=normalizePath(file)
  const connectors=[]
  const stats={nodes:0,bushRefs:0,rejectedTransforms:0,cycles:0,loadErrors:0}

  async function scan(currentFile,currentText,parent,depth,stack){
    if(depth>maxDepth||stats.nodes>=maxNodes)return
    stats.nodes+=1
    for(const ref of parseRefs(currentText)){
      const absolute=compose(parent,ref.transform)
      if(isBushPrimitive(ref.ref)){
        stats.bushRefs+=1
        const connector=bushAxleHole(absolute,{file:currentFile,primitive:normalizePath(ref.ref),raw:ref.raw,depth})
        if(connector)connectors.push(connector);else stats.rejectedTransforms+=1
        continue
      }
      if(!isSubpart(ref.ref)||depth>=maxDepth)continue
      const child=normalizePath(ref.ref)
      if(stack.has(child)){stats.cycles+=1;continue}
      try{
        const childText=await fetchText(child)
        if(childText==null)continue
        const next=new Set(stack);next.add(child)
        await scan(child,childText,absolute,depth+1,next)
      }catch{stats.loadErrors+=1}
    }
  }

  await scan(root,text,{linear:[...IDENTITY],translation:[0,0,0]},0,new Set([root]))
  return{version:COMPOSITE_THROUGH_HOLES_VERSION_V4,file:root,connectors,stats:{...stats,connectors:connectors.length}}
}
