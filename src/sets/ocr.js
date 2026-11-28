const root = new URL('../../vendor/tesseract/', import.meta.url)
let library

function loadLibrary() {
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = new URL('tesseract.min.js', root).href
    script.onload = () => globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(Error('OCR unavailable'))
    script.onerror = () => { script.remove(); reject(Error('OCR unavailable')) }
    document.head.append(script)
  }).catch(error => { library = undefined; throw error })
  return library
}

export async function createOcrWorker(signal) {
  signal.throwIfAborted()
  const api = await loadLibrary()
  signal.throwIfAborted()
  const simd = WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]))
  const worker = await api.createWorker('eng', 1, {
    workerPath: new URL('worker.min.js', root).href,
    workerBlobURL: false,
    corePath: new URL(`tesseract-core-${simd ? 'simd-' : ''}lstm.js`, root).href,
    langPath: new URL('lang/', root).href,
    errorHandler: () => {},
  })
  if (signal.aborted) { await worker.terminate(); signal.throwIfAborted() }
  try{
    await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' })
    signal.throwIfAborted()
    return worker
  }catch(error){await worker.terminate().catch(()=>{});throw error}
}
