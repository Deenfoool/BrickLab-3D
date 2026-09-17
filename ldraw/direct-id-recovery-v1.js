export const LDRAW_DIRECT_ID_RECOVERY_VERSION='ldraw-direct-id-recovery-v1.0.0'

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
  const code=normalizeLDrawDesignIdQuery(query)
  if(!code)return null
  if((currentIndex??[]).some(item=>String(item?.code||'').toLowerCase()===code.toLowerCase()))return null
  if(typeof getMetadata!=='function')throw Error('recoverLDrawDesignId requires getMetadata')

  let indexed=null
  if(typeof getIndex==='function'){
    try{
      const known=await getIndex()
      indexed=(known??[]).find(item=>String(item?.code||'').toLowerCase()===code.toLowerCase())||null
    }catch{
      // The direct metadata probe below intentionally survives an unavailable index.
    }
  }

  const file=indexed?.file||`${code}.dat`
  const metadata=await getMetadata(file)
  if(!LOADABLE_PART_TYPE.test(String(metadata?.type||'')))return null

  return{
    ...(indexed||{}),
    ...metadata,
    file:metadata?.file||file,
    code,
    category:inferredCategory(metadata,indexed),
    description:metadata?.description||indexed?.description||`LDraw ${code}`,
    unofficial:/^Unofficial_/i.test(String(metadata?.type||'')),
    recoveredBy:'direct-design-id',
  }
}
