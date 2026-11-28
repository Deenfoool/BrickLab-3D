// Cheap vector-text preflight: scan inventory candidates before expensive OCR.
export function inventoryEvidence(words,labels){
 const elements=new Set(words.filter(w=>/^\d{6,8}$/.test(w.text)&&Object.hasOwn(labels,w.text)).map(w=>w.text))
 const quantities=words.filter(w=>/^[1-9]\d{0,2}[x×]$/i.test(w.text)).length
 return {known:elements.size,quantities,score:elements.size*4+Math.min(elements.size,quantities)}
}
export function inventoryPageOrder(entries){
 // An inventory can contain very few items on its final page; keep those pages too.
 const likely=entries.filter(e=>e.known>0).sort((a,b)=>b.score-a.score||b.page-a.page)
 const fallback=entries.filter(e=>!e.known).sort((a,b)=>b.page-a.page)
 return [...likely,...fallback]
}
export function candidateWindow(caption,inventory){
 const h=Math.max(2,caption.box[3]-caption.box[1])
 return {left:Math.max(5,h*.75),center:Math.max(4,h*.65),above:inventory?Math.max(20,h*3):Math.max(10,h*1.6),overlap:Math.max(3,h*.45)}
}
