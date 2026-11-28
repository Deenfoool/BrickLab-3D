// Conservative normalization: do not infer missing digits in LEGO element IDs.
const quantity=/^[1-9]\d{0,2}x$/
const element=/^\d{6,8}$/
export const normalizeCaption=value=>String(value??'').trim().toLowerCase().replace(/×/g,'x').replace(/\s+/g,'')
export const isQuantity=value=>quantity.test(normalizeCaption(value))
export const isElement=value=>element.test(normalizeCaption(value))
const area=b=>Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1])
const union=(a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]
export function overlapFraction(a,b){
 return Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]))/Math.max(1e-9,Math.min(area(a),area(b)))
}
export function normalizedCaptions(words){
 const tokens=words.slice(0,3000).flatMap(w=>{
  const text=normalizeCaption(w.text),box=w.box
  return /^(?:\d{1,8}x?|x)$/.test(text)&&Array.isArray(box)&&box.length===4&&box.every(Number.isFinite)&&area(box)>0?[{text,box}]:[]
 }).sort((a,b)=>a.box[0]-b.box[0]||a.box[1]-b.box[1])
 const result=[]
 function add(word){if(!result.some(w=>w.text===word.text&&overlapFraction(w.box,word.box)>.7))result.push(word)}
 for(const token of tokens){
  if(isQuantity(token.text)||isElement(token.text))add(token)
  if(!/^[1-9]\d{0,2}$/.test(token.text))continue
  const b=token.box,h=b[3]-b[1]
  const suffix=tokens.filter(w=>w.text==='x'&&w.box[0]>=b[2]-.5&&w.box[0]-b[2]<=Math.max(1,h*.65)&&Math.abs(w.box[3]-b[3])<=Math.max(1,h*.35)).sort((a,c)=>a.box[0]-c.box[0])[0]
  if(suffix)add({text:token.text+'x',box:union(b,suffix.box)})
 }
 // Suppress a suffix fragment when a full longer count covers the same area.
 return result.filter(w=>!isQuantity(w.text)||!result.some(other=>other!==w&&isQuantity(other.text)&&other.text.length>w.text.length&&other.text.endsWith(w.text)&&overlapFraction(w.box,other.box)>.85))
}
export function mergeCaptions(vector,ocr){
 const first=normalizedCaptions(vector)
 return [...first,...normalizedCaptions(ocr).filter(w=>!first.some(v=>overlapFraction(v.box,w.box)>.6))]
}
