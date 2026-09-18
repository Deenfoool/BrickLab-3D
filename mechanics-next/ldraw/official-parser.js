export const LDRAW_OFFICIAL_PARSER_VERSION='mechanics-ldraw-official-parser-0.1.0'

const TYPE1=/^\s*1\s+\S+\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/i

export function normalizeLDrawPath(value){
  return String(value||'').replace(/\\/g,'/').replace(/^\.\//,'').replace(/\/+/g,'/').trim().toLowerCase()
}

export function parseLDrawOrgType(text){
  for(const raw of String(text||'').split(/\r?\n/)){
    const line=raw.trim()
    let match=line.match(/^0\s+!LDRAW_ORG\s+([^\s]+)/i)
    if(match){
      const token=match[1].toLowerCase()
      if(token.includes('shortcut'))return 'shortcut'
      if(token.includes('subpart'))return 'subpart'
      if(token.includes('primitive'))return 'primitive'
      if(token.includes('part'))return 'part'
    }
    match=line.match(/^0\s+unofficial\s+([^\s]+)/i)
    if(match){
      const token=match[1].toLowerCase()
      if(token.includes('shortcut'))return 'shortcut'
      if(token.includes('subpart'))return 'subpart'
      if(token.includes('primitive'))return 'primitive'
      if(token.includes('part'))return 'part'
    }
  }
  return 'unknown'
}

export function parseLDrawHeader(text){
  const lines=String(text||'').split(/\r?\n/)
  const description=String(lines.find(line=>/^\s*0\s+\S/.test(line))||'').replace(/^\s*0\s+/,'').trim()||null
  const orgLine=lines.find(line=>/^\s*0\s+!LDRAW_ORG\b/i.test(line))||''
  return Object.freeze({
    description,
    type:parseLDrawOrgType(text),
    alias:/\balias\b/i.test(orgLine),
    flexibleSection:/\bflexible_section\b/i.test(orgLine),
    movedTo:/^\s*0\s+~Moved to\b/im.test(text),
  })
}

export function parseType1References(text){
  const result=[]
  for(const raw of String(text||'').split(/\r?\n/)){
    const match=raw.match(TYPE1)
    if(!match)continue
    const nums=match.slice(1,13).map(Number)
    if(!nums.every(Number.isFinite))continue
    const [x,y,z,a,b,c,d,e,f,g,h,i]=nums
    result.push(Object.freeze({
      ref:normalizeLDrawPath(match[13]),
      transform:Object.freeze({
        linear:Object.freeze([a,b,c,d,e,f,g,h,i]),
        translation:Object.freeze([x,y,z]),
      }),
      raw,
    }))
  }
  return Object.freeze(result)
}

export function resolveReferenceCandidates(ref,parentPath=''){
  const value=normalizeLDrawPath(ref)
  const parent=normalizeLDrawPath(parentPath)
  const directory=parent.includes('/')?parent.slice(0,parent.lastIndexOf('/')+1):''
  if(/^(?:parts|p)\//.test(value))return Object.freeze([value])
  if(/^s\//.test(value))return Object.freeze([`parts/${value}`,normalizeLDrawPath(directory+value)])
  if(/^(?:48|8)\//.test(value))return Object.freeze([`p/${value}`,normalizeLDrawPath(directory+value)])
  return Object.freeze([...new Set([
    normalizeLDrawPath(directory+value),
    `parts/${value}`,
    `p/${value}`,
  ])])
}

export function inheritancePolicyForChild(header,path){
  const normalized=normalizeLDrawPath(path)
  if(header?.movedTo)return Object.freeze({inherit:true,reason:'moved-to-alias'})
  if(header?.alias)return Object.freeze({inherit:true,reason:'alias'})
  if(header?.type==='subpart')return Object.freeze({inherit:true,reason:'subpart'})
  if(header?.type==='primitive')return Object.freeze({inherit:true,reason:'primitive'})
  if(/(?:^|\/)s\//.test(normalized))return Object.freeze({inherit:true,reason:'subpart-path'})
  if(/^p\//.test(normalized))return Object.freeze({inherit:true,reason:'primitive-path'})
  if(header?.type==='shortcut')return Object.freeze({inherit:false,compound:true,reason:'shortcut-boundary'})
  if(header?.type==='part')return Object.freeze({inherit:false,compound:true,reason:'physical-part-boundary'})
  return Object.freeze({inherit:false,compound:false,reason:'unknown-file-role'})
}
