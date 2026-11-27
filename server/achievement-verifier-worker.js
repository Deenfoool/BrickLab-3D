// The browser's shared deterministic engine runs in a bounded Node worker.
import {parentPort,workerData} from 'node:worker_threads'
import {registerHooks} from 'node:module'
import {readFile} from 'node:fs/promises'
registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return next(new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,context)
 if(specifier.startsWith('three/addons/'))return next(new URL(specifier.replace('three/addons/','../vendor/three/examples/jsm/'),import.meta.url).href,context)
 return next(specifier,context)
}})
const {verifyDocument}=await import('./achievement-verification-engine.js')
const {document,request}=workerData
// Only trusted LDraw assets from the bundled catalog may be loaded, never client URLs.
const root=new URL('../assets/ldraw/',import.meta.url)
globalThis.fetch=async input=>{
 const url=new URL(input)
 if(url.protocol!=='file:'||!url.href.startsWith(root.href))throw Error('asset_outside_catalog')
 url.search='';url.hash=''
 return new Response(await readFile(url))
}
try{parentPort.postMessage(await verifyDocument(document,request))}
catch(error){parentPort.postMessage({metrics:[],reason:'unsupported_model'})}
