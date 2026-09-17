export const LDRAW_PART_ALIASES_VERSION='ldraw-part-aliases-v1.0.0'

const ALIASES=Object.freeze({
  // BrickLink revision suffix. LDraw's current official canonical part is 62821.dat.
  '62821b':'62821',
})

function clean(value){
  return String(value??'').trim().replace(/\\/g,'/').replace(/^parts\//i,'').replace(/\.dat$/i,'').toLowerCase()
}

export function canonicalLDrawCode(value){
  const code=clean(value)
  return ALIASES[code]||code
}

export function canonicalLDrawFile(value){
  const raw=String(value??'').trim().replace(/\\/g,'/')
  const prefix=/^parts\//i.test(raw)?'parts/':''
  const code=canonicalLDrawCode(raw)
  return code?`${prefix}${code}.dat`:raw
}

export function ldrawAliasInfo(value){
  const requested=clean(value)
  const canonical=canonicalLDrawCode(requested)
  return Object.freeze({requested,canonical,isAlias:Boolean(requested&&requested!==canonical)})
}

export const LDRAW_PART_ALIASES=Object.freeze({...ALIASES})
