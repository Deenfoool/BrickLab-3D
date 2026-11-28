// Explicit, set-specific official sources verified against LEGO's instruction page.
// Do not guess page counts: PDF.js records the actual count when the file opens.
const ducati=Object.freeze({title:'1',url:'https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6661842.pdf',pages:null})
export function verifiedInstructionBooks(setNumber){
 return setNumber==='42238-1'?[{...ducati}]:null
}
