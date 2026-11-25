// Only public instruction documents, shared by the browser and server.
export function canonicalInstructionUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search) return null
    const lego = url.hostname === 'www.lego.com' && /^\/(?:biassets\/bi|cdn\/product-assets\/product\.bi\.core\.pdf)\/\d+\.pdf$/.test(url.pathname)
    const bricklink = url.hostname === 'bdpinstructions.download.bricklink.info' && /^\/910\d{3}\.pdf$/.test(url.pathname)
    if (!lego && !bricklink) return null
    url.hash = ''
    return url.href
  } catch { return null }
}

export function instructionPdfUrl(source) {
  const url = typeof source === 'string' && canonicalInstructionUrl(source)
  return url ? `/api/instructions/pdf?url=${encodeURIComponent(url)}` : source
}
