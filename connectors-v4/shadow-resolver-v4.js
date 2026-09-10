import { cloneConnectorV4, SHADOW_SOURCE_V4 } from './schema-v4.js'
import { expandGridV4, parseShadowTextV4 } from './ldcad-parser-v4.js'

export const SHADOW_RESOLVER_VERSION_V4 = 'shadow-resolver-v4.0.2'

const SCALE_EPS = 1e-5
const ORTHO_EPS = 2e-4
const DEFAULT_MAX_DEPTH = 10
const DEFAULT_MAX_NODES = 256

const normalizePath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').trim()
const lowerPath = value => normalizePath(value).toLowerCase()

function mul3(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ]
}
function mul3v(m, v) { return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]] }
function add3(a,b){return[a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
function scale3v(a,s){return[a[0]*s,a[1]*s,a[2]*s]}
function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function len3(a){return Math.hypot(a[0],a[1],a[2])}
function norm3(a){const n=len3(a);return n>1e-12?scale3v(a,1/n):[0,0,0]}
function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function det3(m){return m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6])}
function col3(m,i){return[m[i],m[3+i],m[6+i]]}
function fromCols(x,y,z){return[x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]]}
function approx(a,b=1,eps=SCALE_EPS){return Math.abs(a-b)<=eps}
function transformPoint(transform,point){return add3(mul3v(transform.linear,point),transform.translation)}

function orientationScale(orientation, linear) {
  const raw=mul3(linear,orientation)
  const x=col3(raw,0),y=col3(raw,1),z=col3(raw,2)
  const sx=len3(x),sy=len3(y),sz=len3(z)
  const nx=norm3(x),ny=norm3(y),nz=norm3(z)
  const shear=Math.max(Math.abs(dot3(nx,ny)),Math.abs(dot3(nx,nz)),Math.abs(dot3(ny,nz)))
  return{raw,sx,sy,sz,nx,ny,nz,shear,mirrored:det3(raw)<0}
}

function inheritanceScaleAllowed(policy,m) {
  const kind=String(policy||'none').toLowerCase()
  if(m.shear>ORTHO_EPS)return false
  const yOnly=approx(m.sx)&&approx(m.sz)
  const rOnly=approx(m.sy)&&approx(m.sx,m.sz)
  if(kind==='none')return yOnly&&approx(m.sy)
  if(kind==='yonly')return yOnly
  if(kind==='ronly')return rOnly
  // LDCad documents YandR as inheritance when the YOnly or ROnly rule applies.
  // Do not silently accept simultaneous independent radial+axial scaling here.
  if(kind==='yandr')return yOnly||rOnly
  return false
}

function geometryScaleAllowed(connector,m) {
  if(m.shear>ORTHO_EPS)return false
  if(['cylinder','clip','fingers'].includes(connector.family))return approx(m.sx,m.sz,ORTHO_EPS)
  if(connector.family==='sphere')return approx(m.sx,m.sy,ORTHO_EPS)&&approx(m.sy,m.sz,ORTHO_EPS)
  if(connector.family==='generic'){
    const kind=connector.geometry?.bounding?.kind
    if(kind==='sphere'||kind==='cube')return approx(m.sx,m.sy,ORTHO_EPS)&&approx(m.sy,m.sz,ORTHO_EPS)
    if(kind==='cylinder')return approx(m.sx,m.sz,ORTHO_EPS)
  }
  return true
}

function scaleGeometry(connector,m) {
  const geometry=cloneConnectorV4(connector).geometry
  const radial=(m.sx+m.sz)/2
  const axial=m.sy
  if(connector.family==='cylinder')geometry.sections=geometry.sections.map(s=>({...s,radiusLdu:s.radiusLdu*radial,lengthLdu:s.lengthLdu*axial}))
  else if(connector.family==='clip'){geometry.radiusLdu*=radial;geometry.lengthLdu*=axial}
  else if(connector.family==='fingers'){geometry.radiusLdu*=radial;geometry.sequenceLdu=geometry.sequenceLdu.map(v=>v*axial)}
  else if(connector.family==='sphere')geometry.radiusLdu*=radial
  else if(connector.family==='generic'&&geometry.bounding){
    const b=geometry.bounding
    if(b.kind==='sphere')b.radiusLdu*=radial
    else if(b.kind==='cylinder'){b.radiusLdu*=radial;b.lengthLdu*=axial}
    else if(b.kind==='cube')b.halfSizeLdu*=radial
    else if(b.kind==='box')b.halfExtentsLdu=[b.halfExtentsLdu[0]*m.sx,b.halfExtentsLdu[1]*m.sy,b.halfExtentsLdu[2]*m.sz]
  }
  return geometry
}

function transformConnector(connector,transform,warnings,context,{enforceInheritance=true}={}) {
  const m=orientationScale(connector.frame.orientation,transform.linear)
  if(!geometryScaleAllowed(connector,m)){
    warnings.push({code:'geometry-scale-rejected',file:context,connector:connector.source?.raw||'',detail:`sx=${m.sx.toFixed(5)} sy=${m.sy.toFixed(5)} sz=${m.sz.toFixed(5)} shear=${m.shear.toExponential(2)}`})
    return null
  }
  if(enforceInheritance&&!inheritanceScaleAllowed(connector.inheritance?.scale,m)){
    warnings.push({code:'inheritance-scale-rejected',file:context,connector:connector.source?.raw||'',detail:`scale=${connector.inheritance?.scale||'none'} sx=${m.sx.toFixed(5)} sy=${m.sy.toFixed(5)} sz=${m.sz.toFixed(5)}`})
    return null
  }
  if(enforceInheritance&&m.mirrored&&String(connector.inheritance?.mirror||'none').toLowerCase()!=='cor'){
    warnings.push({code:'inheritance-mirror-rejected',file:context,connector:connector.source?.raw||''})
    return null
  }

  let x=m.nx,y=norm3(m.ny),z=m.nz
  // Snap frames remain right-handed. For inherited mirrored references this is
  // LDCad's mirror=cor correction; for explicit SNAP_INCL transforms the author
  // has deliberately supplied the transform and we normalize only the frame.
  if(m.mirrored)x=scale3v(x,-1)
  x=norm3(add3(x,scale3v(y,-dot3(x,y))))
  z=norm3(cross3(x,y))
  if(dot3(z,m.nz)<0){x=scale3v(x,-1);z=scale3v(z,-1)}

  const result=cloneConnectorV4(connector)
  result.frame.positionLdu=transformPoint(transform,connector.frame.positionLdu)
  result.frame.orientation=fromCols(x,y,z)
  result.geometry=scaleGeometry(connector,m)
  result.provenance=[...(result.provenance||[]),{type:enforceInheritance?'inherit':'include-transform',context}]
  return result
}

function connectorWithGrid(connector,grid,file) {
  return expandGridV4(grid).map((offset,index)=>{
    const copy=cloneConnectorV4(connector)
    copy.frame.positionLdu=add3(copy.frame.positionLdu,mul3v(copy.frame.orientation,offset))
    copy.key=`${file}:${copy.source?.line||0}:${index}`
    copy.clearIds=[...new Set([...(copy.clearIds||[]),copy.id].filter(Boolean))]
    copy.provenance=[...(copy.provenance||[]),{type:'grid',index,offsetLdu:offset}]
    return copy
  })
}
function clearConnectors(connectors,id){return id?connectors.filter(c=>!(c.clearIds||[]).includes(id)):[]}

function includeTransform(operation,offset) {
  const linear=[...operation.frame.orientation]
  linear[0]*=operation.scale[0];linear[3]*=operation.scale[0];linear[6]*=operation.scale[0]
  linear[1]*=operation.scale[1];linear[4]*=operation.scale[1];linear[7]*=operation.scale[1]
  linear[2]*=operation.scale[2];linear[5]*=operation.scale[2];linear[8]*=operation.scale[2]
  return{linear,translation:add3(operation.frame.positionLdu,mul3v(operation.frame.orientation,offset))}
}

export function parseType1ReferencesV4(text) {
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

function rootPath(file){
  const v=normalizePath(file)
  if(/^(?:parts|p)\//i.test(v))return lowerPath(v)
  if(/^s\//i.test(v))return lowerPath(`parts/${v}`)
  if(/^(?:48|8)\//i.test(v))return lowerPath(`p/${v}`)
  return lowerPath(`parts/${v}`)
}
function referenceCandidates(ref,parentPath){
  const v=lowerPath(ref)
  if(/^(?:parts|p)\//.test(v))return[v]
  if(/^s\//.test(v))return[`parts/${v}`]
  if(/^(?:48|8)\//.test(v))return[`p/${v}`]
  return parentPath.startsWith('p/')?[`p/${v}`,`parts/${v}`]:[`parts/${v}`,`p/${v}`]
}
function shouldRecurseOfficial(ref){const v=lowerPath(ref);return v.startsWith('s/')||v.startsWith('parts/s/')}

export function createShadowResolverV4({fetchOfficialText,fetchShadowText,maxDepth=DEFAULT_MAX_DEPTH,maxNodes=DEFAULT_MAX_NODES}={}) {
  if(typeof fetchOfficialText!=='function'||typeof fetchShadowText!=='function')throw new Error('createShadowResolverV4 requires fetchOfficialText and fetchShadowText')
  const officialCache=new Map(),shadowCache=new Map(),flatShadowCache=new Map(),directShadowCache=new Map(),resolvedCache=new Map()

  const getOfficial=path=>{
    const key=lowerPath(path)
    if(!officialCache.has(key))officialCache.set(key,Promise.resolve().then(()=>fetchOfficialText(key)))
    return officialCache.get(key)
  }
  const getShadow=path=>{
    const key=lowerPath(path)
    if(!shadowCache.has(key))shadowCache.set(key,Promise.resolve().then(()=>fetchShadowText(key)))
    return shadowCache.get(key)
  }
  async function findExisting(candidates,getter){for(const path of candidates){const text=await getter(path);if(text!=null)return{path,text}}return null}

  async function resolveFlatShadow(path,text=null){
    const key=lowerPath(path)
    if(text==null&&flatShadowCache.has(key))return flatShadowCache.get(key)
    const promise=(async()=>{
      const warnings=[]
      const source=text==null?await getShadow(key):text
      if(source==null)return{connectors:[],warnings,found:false}
      const parsed=parseShadowTextV4(source,{file:key})
      warnings.push(...parsed.warnings.map(w=>({...w,file:key})))
      let connectors=[]
      for(const op of parsed.operations){
        if(op.type==='clear')connectors=clearConnectors(connectors,op.id)
        else if(op.type==='connector')connectors.push(...connectorWithGrid(op.connector,op.grid,key))
        else if(op.type==='include')warnings.push({code:'nested-include-not-followed',file:key,line:op.source?.line,detail:op.ref})
      }
      return{connectors,warnings,found:true}
    })()
    if(text==null)flatShadowCache.set(key,promise)
    try{return await promise}catch(error){if(text==null)flatShadowCache.delete(key);throw error}
  }

  async function applyShadow(base,path,text,warnings,{allowIncludes=true}={}){
    if(text==null)return base
    const parsed=parseShadowTextV4(text,{file:path})
    warnings.push(...parsed.warnings.map(w=>({...w,file:path})))
    let connectors=[...base]
    for(const op of parsed.operations){
      if(op.type==='clear'){connectors=clearConnectors(connectors,op.id);continue}
      if(op.type==='connector'){connectors.push(...connectorWithGrid(op.connector,op.grid,path));continue}
      if(op.type!=='include')continue
      if(!allowIncludes){warnings.push({code:'nested-include-not-followed',file:path,line:op.source?.line,detail:op.ref});continue}
      const found=await findExisting(referenceCandidates(op.ref,path),getShadow)
      if(!found){warnings.push({code:'include-not-found',file:path,line:op.source?.line,detail:op.ref});continue}
      const included=await resolveFlatShadow(found.path,found.text)
      warnings.push(...included.warnings.map(w=>({...w,includedFrom:path})))
      for(const offset of expandGridV4(op.grid)){
        const transform=includeTransform(op,offset)
        for(const sourceConnector of included.connectors){
          const transformed=transformConnector(sourceConnector,transform,warnings,`${path} -> SNAP_INCL ${found.path}`,{enforceInheritance:false})
          if(!transformed)continue
          if(op.id)transformed.clearIds=[...new Set([...(transformed.clearIds||[]),op.id])]
          transformed.provenance=[...(transformed.provenance||[]),{type:'include',from:path,ref:found.path}]
          connectors.push(transformed)
        }
      }
    }
    return connectors
  }

  async function resolveDirectShadow(path,text=null){
    const key=lowerPath(path)
    if(text==null&&directShadowCache.has(key))return directShadowCache.get(key)
    const promise=(async()=>{
      const warnings=[]
      const source=text==null?await getShadow(key):text
      if(source==null)return{connectors:[],warnings,found:false}
      const connectors=await applyShadow([],key,source,warnings,{allowIncludes:true})
      return{connectors,warnings,found:true}
    })()
    if(text==null)directShadowCache.set(key,promise)
    try{return await promise}catch(error){if(text==null)directShadowCache.delete(key);throw error}
  }

  async function resolveOfficialLocal(path,depth=0,stack=[],traversal={nodes:0}){
    const key=lowerPath(path)
    if(depth>maxDepth)return{connectors:[],warnings:[{code:'max-depth',file:key,detail:String(maxDepth)}],found:false}
    if(stack.includes(key))return{connectors:[],warnings:[{code:'cycle',file:key,detail:[...stack,key].join(' -> ')}],found:false}
    if(resolvedCache.has(key))return resolvedCache.get(key)
    traversal.nodes+=1
    if(traversal.nodes>maxNodes)return{connectors:[],warnings:[{code:'node-budget',file:key,detail:String(maxNodes)}],found:false}

    const promise=(async()=>{
      const warnings=[]
      const official=await getOfficial(key)
      let connectors=[]
      if(official!=null){
        const nextStack=[...stack,key]
        for(const reference of parseType1ReferencesV4(official)){
          const candidates=referenceCandidates(reference.ref,key)
          if(shouldRecurseOfficial(reference.ref)){
            const childPath=candidates[0]
            const child=await resolveOfficialLocal(childPath,depth+1,nextStack,traversal)
            warnings.push(...child.warnings)
            for(const sourceConnector of child.connectors){
              const transformed=transformConnector(sourceConnector,reference.transform,warnings,`${key} -> ${childPath}`,{enforceInheritance:true})
              if(transformed)connectors.push(transformed)
            }
          }else{
            const shadow=await findExisting(candidates,getShadow)
            if(!shadow)continue
            const direct=await resolveDirectShadow(shadow.path,shadow.text)
            warnings.push(...direct.warnings)
            for(const sourceConnector of direct.connectors){
              const transformed=transformConnector(sourceConnector,reference.transform,warnings,`${key} -> ${shadow.path}`,{enforceInheritance:true})
              if(transformed)connectors.push(transformed)
            }
          }
        }
      }
      const shadow=await getShadow(key)
      connectors=await applyShadow(connectors,key,shadow,warnings,{allowIncludes:true})
      return{connectors,warnings,found:official!=null||shadow!=null}
    })()
    resolvedCache.set(key,promise)
    try{return await promise}catch(error){resolvedCache.delete(key);throw error}
  }

  return{
    async resolve(file){
      const traversal={nodes:0}
      const path=rootPath(file)
      const result=await resolveOfficialLocal(path,0,[],traversal)
      return{
        schemaVersion:4,resolverVersion:SHADOW_RESOLVER_VERSION_V4,source:SHADOW_SOURCE_V4,file:path,
        connectors:result.connectors,warnings:result.warnings,
        stats:{connectors:result.connectors.length,warnings:result.warnings.length,resolvedOfficialNodes:traversal.nodes,maxDepth,maxNodes},
      }
    },
    clearCache(){officialCache.clear();shadowCache.clear();flatShadowCache.clear();directShadowCache.clear();resolvedCache.clear()},
  }
}

export function connectorToBrickLabV4(connector,visualOffsetStud=[0,0,0]){
  const copy=cloneConnectorV4(connector)
  const[x,y,z]=connector.frame.positionLdu
  const o=connector.frame.orientation
  const bo=[o[0],o[1],o[2],-o[3],-o[4],-o[5],-o[6],-o[7],-o[8]]
  const axis=norm3(mul3v(bo,[0,-1,0]))
  copy.unit='stud'
  copy.frame={...copy.frame,positionStud:[x/20+(visualOffsetStud[0]||0),-y/20+(visualOffsetStud[1]||0),-z/20+(visualOffsetStud[2]||0)],orientationBrickLab:bo,axis}
  const g=cloneConnectorV4(connector).geometry
  if(connector.family==='cylinder')g.sections=g.sections.map(s=>({...s,radius:s.radiusLdu/20,length:s.lengthLdu/20}))
  if(connector.family==='clip'){g.radius=g.radiusLdu/20;g.length=g.lengthLdu/20}
  if(connector.family==='fingers'){g.radius=g.radiusLdu/20;g.sequence=g.sequenceLdu.map(v=>v/20)}
  if(connector.family==='sphere')g.radius=g.radiusLdu/20
  copy.geometryStud=g
  return copy
}
