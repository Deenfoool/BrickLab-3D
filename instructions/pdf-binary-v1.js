const encoder = new TextEncoder()
const ascii = value => encoder.encode(String(value))

function concat(chunks) {
  const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),out=new Uint8Array(length)
  let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length}return out
}

export function buildJpegPdf(pages,{widthPt=595.28,heightPt=841.89}={}) {
  if (!Array.isArray(pages) || !pages.length) throw new Error('PDF requires at least one JPEG page')
  const chunks=[ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],offsets=[0]
  let cursor=chunks[0].length
  const count=2+pages.length*3
  const pushObject=(id,parts)=>{offsets[id]=cursor;const chunk=concat([ascii(`${id} 0 obj\n`),...parts,ascii('\nendobj\n')]);chunks.push(chunk);cursor+=chunk.length}
  const pageIds=pages.map((_,index)=>3+index*3)
  pushObject(1,[ascii('<< /Type /Catalog /Pages 2 0 R >>')])
  pushObject(2,[ascii(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`)])
  pages.forEach((page,index)=>{
    const pageId=3+index*3,imageId=pageId+1,contentId=pageId+2
    const bytes=page.jpegBytes instanceof Uint8Array?page.jpegBytes:new Uint8Array(page.jpegBytes)
    const width=Math.max(1,Math.round(Number(page.width)||1)),height=Math.max(1,Math.round(Number(page.height)||1))
    pushObject(pageId,[ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)])
    pushObject(imageId,[ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`),bytes,ascii('\nendstream')])
    const stream=ascii(`q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`)
    pushObject(contentId,[ascii(`<< /Length ${stream.length} >>\nstream\n`),stream,ascii('endstream')])
  })
  const xref=cursor
  const xrefLines=[`xref\n0 ${count+1}\n`,`0000000000 65535 f \n`]
  for(let id=1;id<=count;id++)xrefLines.push(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`)
  const tail=ascii(`${xrefLines.join('')}trailer\n<< /Size ${count+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  chunks.push(tail)
  return concat(chunks)
}
