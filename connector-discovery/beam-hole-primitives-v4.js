export const BEAM_HOLE_PRIMITIVES_VERSION_V4='beam-hole-primitives-v4.1.0'

const IDENTITY_3=Object.freeze([1,0,0,0,1,0,0,0,1])
const ORTHO_EPS=2e-4
const SCALE_EPS=2e-3
const DEFAULT_MAX_DEPTH=8
const DEFAULT_MAX_NODES=192

// Verified against the pinned LDCad Shadow Library snapshot.
// beamhole.dat: R8x2 + R6x16 + R8x2
// beamhol2.dat: R8x2 + R6x6 + R8x2
const PROFILES=Object.freeze({
  'beamhole.dat':Object.freeze([
    Object.freeze({shape:'R',radiusLdu:8,lengthLdu:2,elastic:false}),
    Object.freeze({shape:'R',radiusLdu:6,lengthLdu:16,elastic:false}),
    Object.freeze({shape:'R',radiusLdu:8,lengthLdu:2,elastic:false}),
  ]),
  'beamhol2.dat':Object.freeze([
    Object.freeze({shape:'R',radiusLdu:8,lengthLdu:2,elastic:false}),
    Object.freeze({shape:'R',radiusLdu:6,lengthLdu:6,elastic:false}),
    Object.freeze({shape:'R',radiusLdu:8,lengthLdu:2,elastic:false}),
  ]),
})

const normalizePath=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/^parts\//i,'').replace(/\/+/g,'/').trim()
const basename=value=>normalizePath(value).split('/').pop()?.toLowerCase()||''
const mul3=(a,b)=>[
  a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
  a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
  a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
]
const mul3v=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]
const add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]]
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const scale3=(a,s)=>[a[0]*s,a[1]*s,a[2]*s]
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const len3=a=>Math.hypot(a[0],a[1],a[2])
const norm3=a=>{const n=len3(a);return n>1e-12?scale3(a,1/n):[0,0,0]}
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const det3=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6])
const col3=(m,i)=>[m[i],m[3+i],m[6+i]]
const fromCols=(x,y,z)=>[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]]
const approx=(a,b,eps=SCALE_EPS)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=eps

function type1References(text){
  const result=[]
  for(const raw of String(text||'').split(/\r?\n/)){
    const t=raw.trim().split(/\s+/)
    if(t[0]!=='1'||t.length<15)continue
    const n=t.slice(2,14).map(Number)
    if(!n.every(Number.isFinite))continue
    const[x,y,z,a,b,c,d,e,f,g,h,i]=n
    result.push({ref:normalizePath(t.slice(14).join(' ')),transform:{linear:[a,b,c,d,e,f,g,h,i],translation:[x,y,z]},raw})
  }
  return result
}

function composeTransform(parent,child){return{linear:mul3(parent.linear,child.linear),translation:add3(mul3v(parent.linear,child.translation),parent.translation)}}
function transformHealth(linear){
  const x=col3(linear,0),y=col3(linear,1),z=col3(linear,2)
  const sx=len3(x),sy=len3(y),sz=len3(z)
  const nx=norm3(x),ny=norm3(y),nz=norm3(z)
  const shear=Math.max(Math.abs(dot3(nx,ny)),Math.abs(dot3(nx,nz)),Math.abs(dot3(ny,nz)))
  return{sx,sy,sz,nx,ny,nz,shear,mirrored:det3(linear)<0}
}
function rightHandedBasis(health){
  let x=health.nx,y=health.ny
  if(health.mirrored)x=scale3(x,-1)
  x=norm3(sub3(x,scale3(y,dot3(x,y))))
  const z=norm3(cross3(x,y))
  if(len3(x)<.99||len3(y)<.99||len3(z)<.99)return null
  return fromCols(x,y,z)
}
function unitTransform(health){
  return health.shear<=ORTHO_EPS&&approx(health.sx,1)&&approx(health.sy,1)&&approx(health.sz,1)
}
function isSubpart(ref){return /^s\//i.test(normalizePath(ref))}

function connectorFor(reference,absolute,currentFile,depth){
  const name=basename(reference.ref)
  const profile=PROFILES[name]
  if(!profile)return null
  const health=transformHealth(absolute.linear)
  if(!unitTransform(health))return false
  const orientation=rightHandedBasis(health)
  if(!orientation)return false
  return{
    schemaVersion:4,
    family:'cylinder',
    gender:'female',
    group:null,
    frame:{positionLdu:[...absolute.translation],orientation},
    geometry:{sections:profile.map(section=>({...section})),caps:'none',centered:true},
    snap:{slide:true},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'ldraw-beam-hole-discovery',file:currentFile,primitive:normalizePath(reference.ref),meta:'TYPE1_VERIFIED_TECHNIC_HOLE',raw:reference.raw},
    provenance:[{type:'beam-hole-primitive-discovery',primitive:normalizePath(reference.ref),depth}],
    discovery:{version:BEAM_HOLE_PRIMITIVES_VERSION_V4,role:'technic-pin-hole',confidence:'official-shadow-profile-verified'},
  }
}

export async function discoverBeamHolePrimitivesV4(file,text,fetchText,{maxDepth=DEFAULT_MAX_DEPTH,maxNodes=DEFAULT_MAX_NODES}={}){
  if(typeof fetchText!=='function')throw new Error('discoverBeamHolePrimitivesV4 requires fetchText')
  const root=normalizePath(file)
  const connectors=[]
  const stats={nodes:0,primitiveRefs:0,rejectedTransforms:0,cycles:0,maxDepthHits:0,loadErrors:0,profiles:{}}

  async function scan(currentFile,currentText,parentTransform,depth,stack){
    if(depth>maxDepth){stats.maxDepthHits+=1;return}
    stats.nodes+=1
    if(stats.nodes>maxNodes)return
    for(const reference of type1References(currentText)){
      const absolute=composeTransform(parentTransform,reference.transform)
      const name=basename(reference.ref)
      if(PROFILES[name]){
        stats.primitiveRefs+=1
        const connector=connectorFor(reference,absolute,currentFile,depth)
        if(connector){
          connectors.push(connector)
          stats.profiles[name]=(stats.profiles[name]||0)+1
        }else stats.rejectedTransforms+=1
        continue
      }
      if(!isSubpart(reference.ref)||depth>=maxDepth)continue
      const child=normalizePath(reference.ref)
      if(stack.has(child)){stats.cycles+=1;continue}
      if(stats.nodes>=maxNodes)continue
      try{
        const childText=await fetchText(child)
        if(childText==null)continue
        const next=new Set(stack);next.add(child)
        await scan(child,childText,absolute,depth+1,next)
      }catch{stats.loadErrors+=1}
    }
  }

  await scan(root,text,{linear:[...IDENTITY_3],translation:[0,0,0]},0,new Set([root]))
  return{version:BEAM_HOLE_PRIMITIVES_VERSION_V4,file:root,connectors,stats:{...stats,connectors:connectors.length}}
}
