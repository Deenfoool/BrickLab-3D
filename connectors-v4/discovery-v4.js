import { axialSpanV4, CONNECTOR_SCHEMA_VERSION_V4 } from './schema-v4.js'
import { classifyTechnicPinInterfaceV4 } from './pin-semantics-v4.js?v=connector-pin-gender-20260912-v1'

export const CONNECTOR_DISCOVERY_VERSION_V4 = 'connector-discovery-v4.1.0'

const IDENTITY_3 = Object.freeze([1,0,0,0,1,0,0,0,1])
const ORTHO_EPS = 2e-4
const UNIT_SCALE_EPS = 2e-3
const AXIS_DOT_MIN = 0.997
const CENTERLINE_EPS_LDU = 0.65
const OVERLAP_RATIO_MIN = 0.65
const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_NODES = 192

const normalizePath = value => String(value || '').replace(/\\/g,'/').replace(/^\.\//,'').replace(/^parts\//i,'').replace(/\/+/g,'/').trim()
const basename = value => normalizePath(value).split('/').pop()?.toLowerCase() || ''
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
const approx=(a,b,eps=UNIT_SCALE_EPS)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=eps

function type1References(text) {
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

function composeTransform(parent,child){
  return{
    linear:mul3(parent.linear,child.linear),
    translation:add3(mul3v(parent.linear,child.translation),parent.translation),
  }
}

function transformHealth(linear){
  const x=col3(linear,0),y=col3(linear,1),z=col3(linear,2)
  const sx=len3(x),sy=len3(y),sz=len3(z)
  const nx=norm3(x),ny=norm3(y),nz=norm3(z)
  const shear=Math.max(Math.abs(dot3(nx,ny)),Math.abs(dot3(nx,nz)),Math.abs(dot3(ny,nz)))
  return{sx,sy,sz,nx,ny,nz,shear,mirrored:det3(linear)<0}
}

function primitiveDescriptor(ref){
  const name=basename(ref)
  if(name==='connect.dat'||name==='confric.dat')return{role:'technic-pin',policy:'unit',connector:cylinder('male',[['R',8,2],['R',6,16],['_L',6.25,2]],{caps:'one',centered:false,slide:false})}
  if(name==='connhole.dat')return{role:'technic-pin-hole',policy:'unit',connector:cylinder('female',[['R',8,2],['R',6,16],['R',8,2]],{caps:'none',centered:true,slide:true})}
  if(name==='axlehol0.dat')return{role:'technic-axle-hole',policy:'axial-scale',connector:cylinder('female',[['A',6,20]],{caps:'none',centered:true,slide:true})}
  if(name==='stud.dat')return{role:'stud',policy:'unit',connector:cylinder('male',[['R',6,4]],{caps:'one',centered:false,slide:false})}
  return null
}

function cylinder(gender,sections,{caps='none',centered=false,slide=false}={}){
  return{
    schemaVersion:CONNECTOR_SCHEMA_VERSION_V4,
    family:'cylinder',gender,group:null,
    frame:{positionLdu:[0,0,0],orientation:[...IDENTITY_3]},
    geometry:{sections:sections.map(([shape,radiusLdu,lengthLdu])=>({shape,radiusLdu,lengthLdu,elastic:shape==='_L'||shape==='L_'})),caps,centered},
    snap:{slide},
    inheritance:{scale:'none',mirror:'cor'},
  }
}

function allowedTransform(policy,health){
  if(health.shear>ORTHO_EPS||health.sx<=1e-8||health.sy<=1e-8||health.sz<=1e-8)return false
  if(policy==='unit')return approx(health.sx,1)&&approx(health.sy,1)&&approx(health.sz,1)
  if(policy==='axial-scale')return approx(health.sx,1)&&approx(health.sz,1)&&health.sy>=0.05&&health.sy<=64
  return false
}

function transformConnector(descriptor,transform,{file,primitive,raw,depth}){
  const health=transformHealth(transform.linear)
  if(!allowedTransform(descriptor.policy,health))return null
  let x=health.nx,y=health.ny
  if(health.mirrored)x=scale3(x,-1)
  x=norm3(sub3(x,scale3(y,dot3(x,y))))
  let z=norm3(cross3(x,y))
  if(len3(x)<0.99||len3(y)<0.99||len3(z)<0.99)return null
  const copy=structuredClone(descriptor.connector)
  const radial=(health.sx+health.sz)/2
  copy.frame.positionLdu=[...transform.translation]
  copy.frame.orientation=fromCols(x,y,z)
  copy.geometry.sections=copy.geometry.sections.map(section=>({...section,radiusLdu:section.radiusLdu*radial,lengthLdu:section.lengthLdu*health.sy}))
  copy.source={kind:'ldraw-primitive-discovery',file,primitive,meta:'TYPE1_PRIMITIVE',raw}
  copy.provenance=[{type:'primitive-discovery',primitive,depth}]
  copy.discovery={version:CONNECTOR_DISCOVERY_VERSION_V4,role:descriptor.role,confidence:'primitive-verified'}
  return copy
}

function isSubpart(ref){return /^s\//i.test(normalizePath(ref))}

export async function discoverPrimitiveConnectorsV4(file,text,fetchText,{maxDepth=DEFAULT_MAX_DEPTH,maxNodes=DEFAULT_MAX_NODES}={}){
  if(typeof fetchText!=='function')throw new Error('discoverPrimitiveConnectorsV4 requires fetchText')
  const root=normalizePath(file)
  const connectors=[]
  const stats={nodes:0,primitiveRefs:0,rejectedTransforms:0,cycles:0,maxDepthHits:0,loadErrors:0}

  async function scan(currentFile,currentText,parentTransform,depth,stack){
    if(depth>maxDepth){stats.maxDepthHits+=1;return}
    stats.nodes+=1
    if(stats.nodes>maxNodes)return
    for(const reference of type1References(currentText)){
      const absolute=composeTransform(parentTransform,reference.transform)
      const descriptor=primitiveDescriptor(reference.ref)
      if(descriptor){
        stats.primitiveRefs+=1
        const connector=transformConnector(descriptor,absolute,{file:currentFile,primitive:normalizePath(reference.ref),raw:reference.raw,depth})
        if(connector)connectors.push(connector)
        else stats.rejectedTransforms+=1
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
  return{version:CONNECTOR_DISCOVERY_VERSION_V4,file:root,connectors,stats:{...stats,connectors:connectors.length}}
}

function axisOf(connector){
  const o=connector?.frame?.orientation
  return Array.isArray(o)&&o.length===9?norm3([-o[1],-o[4],-o[7]]):null
}

function rigidShape(section){return section?.shape==='_L'||section?.shape==='L_'?'R':section?.shape}
function sectionsOf(connector){return Array.isArray(connector?.geometry?.sections)?connector.geometry.sections:[]}

export function discoveryConnectorRoleV4(connector){
  if(connector?.discovery?.role)return connector.discovery.role
  const pin=classifyTechnicPinInterfaceV4(connector)
  if(pin?.role)return pin.role
  if(connector?.family!=='cylinder')return null
  const sections=sectionsOf(connector)
  const allA6=sections.length>0&&sections.every(section=>rigidShape(section)==='A'&&Math.abs(Number(section.radiusLdu)-6)<=0.2)
  if(connector.gender==='female'&&connector.snap?.slide===true&&allA6)return'technic-axle-hole'
  if(connector.gender==='male'&&sections.length===1&&rigidShape(sections[0])==='R'&&Math.abs(Number(sections[0].radiusLdu)-6)<=0.2&&Math.abs(Number(sections[0].lengthLdu)-4)<=0.3&&connector.snap?.slide!==true)return'stud'
  if(connector.gender==='female'&&connector.snap?.slide===true&&sections.some(section=>rigidShape(section)==='R'&&Math.abs(Number(section.radiusLdu)-6)<=0.25))return'technic-round-hole'
  return null
}

function coverageClass(role){
  if(role==='technic-pin-hole'||role==='technic-round-hole')return'pin-receiver'
  return role
}

function intervalOn(connector,origin,axis){
  const localAxis=axisOf(connector)
  if(!localAxis)return null
  const p=connector?.frame?.positionLdu
  if(!Array.isArray(p)||p.length!==3)return null
  const span=axialSpanV4(connector)
  const a=add3(p,scale3(localAxis,span[0]))
  const b=add3(p,scale3(localAxis,span[1]))
  const pa=dot3(sub3(a,origin),axis),pb=dot3(sub3(b,origin),axis)
  return[Math.min(pa,pb),Math.max(pa,pb)]
}

function coveredBy(existing,discovered){
  const existingRole=coverageClass(discoveryConnectorRoleV4(existing))
  const discoveredRole=coverageClass(discoveryConnectorRoleV4(discovered))
  if(!existingRole||!discoveredRole||existingRole!==discoveredRole)return false
  const axis=axisOf(existing),otherAxis=axisOf(discovered)
  const ep=existing?.frame?.positionLdu,dp=discovered?.frame?.positionLdu
  if(!axis||!otherAxis||!Array.isArray(ep)||!Array.isArray(dp))return false
  if(Math.abs(dot3(axis,otherAxis))<AXIS_DOT_MIN)return false
  const delta=sub3(dp,ep)
  const lateral=sub3(delta,scale3(axis,dot3(delta,axis)))
  if(len3(lateral)>CENTERLINE_EPS_LDU)return false
  const a=intervalOn(existing,ep,axis),b=intervalOn(discovered,ep,axis)
  if(!a||!b)return false
  const overlap=Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]))
  const shorter=Math.max(1e-6,Math.min(a[1]-a[0],b[1]-b[0]))
  return overlap/shorter>=OVERLAP_RATIO_MIN
}

export function mergeDiscoveredConnectorsV4(existing,discovered){
  const authoritative=[...(existing??[])]
  const added=[]
  let suppressed=0
  for(const connector of discovered??[]){
    if([...authoritative,...added].some(other=>coveredBy(other,connector))){suppressed+=1;continue}
    added.push(connector)
  }
  return{added,suppressed,candidates:(discovered??[]).length}
}
