import { canonicalLDrawCode, ldrawAliasInfo } from './part-aliases-v1.js?v=ldraw-aliases-20260917-v1'

export const LDRAW_DIRECT_ID_RECOVERY_VERSION='ldraw-direct-id-recovery-v1.1.0'

const DESIGN_ID=/^[0-9][a-z0-9_-]*$/i
const LOADABLE_PART_TYPE=/^(?:Part|Unofficial_Part)$/i

export function normalizeLDrawDesignIdQuery(query){
  const code=String(query??'').trim().replace(/^ldraw-/i,'').replace(/\.dat$/i,'')
  return DESIGN_ID.test(code)?code:null
}

function inferredCategory(metadata,item){
  if(metadata?.category)return metadata.category
  if(item?.category)return item.category
  const description=String(metadata?.description||item?.description||'')
  if(/^technic\b/i.test(description))return 'Technic'
  if(/^duplo\b/i.test(description))return 'Duplo'
  if(/\b(?:train|rail)\b/i.test(description))return 'Train'
  return ''
}

export async function recoverLDrawDesignId(query,{currentIndex=[],getIndex,getMetadata}={}){
  const requestedCode=normalizeLDrawDesignIdQuery(query)
  if(!requestedCode)return null
  if((currentIndex??[]).some(item=>String(item?.code||'').toLowerCase()===requestedCode.toLowerCase()))return null
  if(typeof getMetadata!=='function')throw Error('recoverLDrawDesignId requires getMetadata')

  const alias=ldrawAliasInfo(requestedCode)
  const canonicalCode=canonicalLDrawCode(requestedCode)
  let indexed=null
  if(typeof getIndex==='function'){
    try{
      const known=await getIndex()
      indexed=(known??[]).find(item=>String(item?.code||'').toLowerCase()===canonicalCode.toLowerCase())||null
    }catch{
      // The direct metadata probe below intentionally survives an unavailable index.
    }
  }

  const file=indexed?.file||`${canonicalCode}.dat`
  const metadata=await getMetadata(file)
  if(!LOADABLE_PART_TYPE.test(String(metadata?.type||'')))return null

  return{
    ...(indexed||{}),
    ...metadata,
    file:metadata?.file||file,
    code:requestedCode,
    canonicalCode,
    aliasOf:alias.isAlias?canonicalCode:null,
    category:inferredCategory(metadata,indexed),
    description:metadata?.description||indexed?.description||`LDraw ${requestedCode}`,
    unofficial:/^Unofficial_/i.test(String(metadata?.type||'')),
    recoveredBy:alias.isAlias?'design-id-alias':'direct-design-id',
  }
}
