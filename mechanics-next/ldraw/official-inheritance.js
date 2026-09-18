import {
  inheritancePolicyForChild,
  normalizeLDrawPath,
  parseLDrawHeader,
  parseType1References,
  resolveReferenceCandidates,
} from './official-parser.js'
import { transformNativeConnector } from './shadow-resolver.js'

export const OFFICIAL_INHERITANCE_VERSION='mechanics-official-inheritance-0.1.0'
const DEFAULT_MAX_DEPTH=12
const DEFAULT_MAX_NODES=512

export function createNativeLDrawInheritanceResolver({
  fetchOfficialText,
  shadowResolver,
  maxDepth=DEFAULT_MAX_DEPTH,
  maxNodes=DEFAULT_MAX_NODES,
}={}){
  if(typeof fetchOfficialText!=='function')throw new TypeError('Official inheritance requires fetchOfficialText')
  if(!shadowResolver?.apply)throw new TypeError('Official inheritance requires native Shadow resolver with apply()')

  const officialCache=new Map()
  const resolvedCache=new Map()

  const getOfficial=path=>{
    const key=normalizeLDrawPath(path)
    if(!officialCache.has(key)){
      officialCache.set(key,Promise.resolve().then(()=>fetchOfficialText(key)).catch(error=>{
        officialCache.delete(key)
        throw error
      }))
    }
    return officialCache.get(key)
  }

  async function findOfficial(ref,parentPath){
    for(const candidate of resolveReferenceCandidates(ref,parentPath)){
      const text=await getOfficial(candidate)
      if(text!=null)return{path:candidate,text}
    }
    return null
  }

  async function resolveInternal(path,{
    depth=0,
    stack=[],
    traversal={nodes:0},
  }={}){
    const key=normalizeLDrawPath(path)
    if(depth>maxDepth)return{
      file:key,connectors:[],warnings:[{code:'max-depth',detail:key}],compoundReferences:[],found:false,
    }
    if(stack.includes(key))return{
      file:key,connectors:[],warnings:[{code:'official-cycle',detail:[...stack,key].join(' -> ')}],compoundReferences:[],found:false,
    }
    if(resolvedCache.has(key))return structuredClone(await resolvedCache.get(key))

    const promise=(async()=>{
      traversal.nodes+=1
      if(traversal.nodes>maxNodes)return{
        file:key,connectors:[],warnings:[{code:'node-budget',detail:String(maxNodes)}],compoundReferences:[],found:false,
      }

      const official=await getOfficial(key)
      if(official==null){
        const direct=await shadowResolver.resolve(key)
        return{
          file:key,
          header:null,
          connectors:[...direct.connectors],
          warnings:[...direct.warnings],
          compoundReferences:[],
          found:direct.found,
        }
      }

      const header=parseLDrawHeader(official)
      const warnings=[]
      const compoundReferences=[]
      let connectors=[]
      const nextStack=[...stack,key]

      for(const reference of parseType1References(official)){
        const child=await findOfficial(reference.ref,key)
        if(!child){
          warnings.push({code:'official-reference-not-found',file:key,detail:reference.ref})
          continue
        }
        const childHeader=parseLDrawHeader(child.text)
        const policy=inheritancePolicyForChild(childHeader,child.path)
        if(policy.compound){
          compoundReferences.push(Object.freeze({
            from:key,
            path:child.path,
            ref:reference.ref,
            transform:reference.transform,
            type:childHeader.type,
            description:childHeader.description??null,
            header:childHeader,
            reason:policy.reason,
          }))
          continue
        }
        if(!policy.inherit)continue

        const childResult=await resolveInternal(child.path,{
          depth:depth+1,
          stack:nextStack,
          traversal,
        })
        warnings.push(...childResult.warnings.map(warning=>({...warning,inheritedFrom:key})))
        compoundReferences.push(...childResult.compoundReferences)

        for(const connector of childResult.connectors){
          const transformed=transformNativeConnector(
            connector,
            reference.transform,
            warnings,
            `${key} -> ${child.path}`,
          )
          if(!transformed)continue
          transformed.provenance=[
            ...(transformed.provenance||[]),
            {type:'official-inheritance',from:key,ref:child.path,role:policy.reason},
          ]
          connectors.push(transformed)
        }
      }

      // Direct shadow metadata is applied *after* inherited geometry so SNAP_CLEAR can
      // intentionally remove inherited connectors.
      const applied=await shadowResolver.apply(key,connectors)
      warnings.push(...applied.warnings)
      connectors=[...applied.connectors]

      return{
        file:key,
        header,
        connectors,
        warnings,
        compoundReferences,
        found:true,
      }
    })()

    resolvedCache.set(key,promise)
    try{return structuredClone(await promise)}
    catch(error){
      resolvedCache.delete(key)
      throw error
    }
  }

  return Object.freeze({
    version:OFFICIAL_INHERITANCE_VERSION,
    capabilities:Object.freeze({
      subparts:true,
      primitives:true,
      aliases:true,
      shortcutFlattening:false,
      compoundBoundaryDiscovery:true,
      shadowClearOverInheritance:true,
    }),
    async resolve(path){
      const traversal={nodes:0}
      const result=await resolveInternal(path,{traversal})
      return Object.freeze({
        version:OFFICIAL_INHERITANCE_VERSION,
        file:result.file,
        header:result.header?Object.freeze(result.header):null,
        connectors:Object.freeze(result.connectors),
        warnings:Object.freeze(result.warnings),
        compoundReferences:Object.freeze(result.compoundReferences),
        found:result.found,
        stats:Object.freeze({
          connectors:result.connectors.length,
          warnings:result.warnings.length,
          compoundReferences:result.compoundReferences.length,
          nodes:traversal.nodes,
          maxDepth,
          maxNodes,
        }),
      })
    },
    clearCache(){
      officialCache.clear()
      resolvedCache.clear()
      shadowResolver.clearCache?.()
    },
  })
}
