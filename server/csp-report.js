// Privacy-preserving, bounded CSP diagnostics. Never log URLs or report bodies.
export function createCspReportHandler({logger=console}={}) {
  let windowStart=0,count=0
  const allowed=new Set(['script-src','script-src-elem','script-src-attr','style-src','style-src-elem','style-src-attr','img-src','connect-src','font-src','worker-src','frame-src','object-src','media-src','default-src','base-uri','form-action','frame-ancestors'])
  return async(req,res,path)=>{
    if(path!=='/api/csp-report')return false
    const finish=status=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end();return true}
    if(req.method!=='POST'){res.setHeader('Allow','POST');return finish(405)}
    const now=Date.now()
    if(now-windowStart>=60_000){windowStart=now;count=0}
    if(++count>30){req.resume();return finish(429)}
    if(Number(req.headers['content-length'])>8192){req.resume();return finish(413)}
    const chunks=[];let bytes=0
    for await(const chunk of req.iterator({destroyOnReturn:false})){
      bytes+=chunk.length
      if(bytes>8192){req.resume();return finish(413)}
      chunks.push(chunk)
    }
    try{
      const report=JSON.parse(Buffer.concat(chunks))['csp-report']
      const directive=report?.['effective-directive']||report?.['violated-directive']
      if(allowed.has(directive))logger.warn('CSP violation:',directive)
    }catch{}
    return finish(204)
  }
}
