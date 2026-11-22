// CPU rasterizer for environments without a WebGL context. Requires sharp.
import { registerHooks, createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
const sharp = createRequire(import.meta.url)('sharp')
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, context)
  if (specifier.startsWith('three/addons/')) return next(new URL(specifier.replace('three/addons/', '../vendor/three/examples/jsm/'), import.meta.url).href, context)
  return next(specifier, context)
} })
globalThis.fetch = async url => new Response(await readFile(url))
const { sections, loadPartModel } = await import('../src/editor/parts.js')
const { Vector3, Color } = await import('three')
const { values } = parseArgs({ options: {
  section: { type: 'string', default: 'system' },
  start: { type: 'string', default: '0' }, end: { type: 'string' },
} })
const section = sections.find(s => s.id === values.section)
if (!section) throw Error('Unknown section: ' + values.section)
const width = 288, height = 184
const toward = new Vector3(1, .82, 1.36).normalize()
const right = new Vector3(0, 1, 0).cross(toward).normalize()
const up = toward.clone().cross(right)
const light = new Vector3(2, 4, 3).normalize()
const color = new Color()
function render(model, finish) {
  const pixels = Buffer.alloc(width * height * 4)
  const depth = new Float64Array(width * height).fill(-Infinity)
  const projected = model.meshes.map(g => {
    const p = g.attributes.position
    const points = []
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3(p.getX(i), -p.getY(i), -p.getZ(i))
      points.push([v.dot(right), v.dot(up), v.dot(toward), v.x, v.y, v.z])
    }
    return points
  })
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity
  for (const points of projected) for (const p of points) {
    minX=Math.min(minX,p[0]); maxX=Math.max(maxX,p[0]); minY=Math.min(minY,p[1]); maxY=Math.max(maxY,p[1])
  }
  const scale=Math.min(width / Math.max(maxX-minX,1),height / Math.max(maxY-minY,1))*.86
  for (let mi=0;mi<model.meshes.length;mi++) {
    const g=model.meshes[mi], points=projected[mi]
    for(const p of points){p[0]=(p[0]-(minX+maxX)/2)*scale+width/2;p[1]=height/2-(p[1]-(minY+maxY)/2)*scale}
    const ids=g.index?.array ?? Uint32Array.from({length:points.length},(_,i)=>i)
    const groups=g.groups.length ? g.groups : [{start:0,count:ids.length,materialIndex:0}]
    for(const group of groups){
      const mat=g.userData.finishes?.[group.materialIndex]
      color.copy(mat?.color ?? new Color(finish)).convertLinearToSRGB()
      const rgb=[color.r,color.g,color.b].map(v=>Math.round(v*255))
      for(let i=group.start;i<Math.min(group.start+group.count,ids.length);i+=3){
        const a=points[ids[i]],b=points[ids[i+1]],c=points[ids[i+2]]
        const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        if(Math.abs(area)<.001)continue
        if(area>0 && mat?.side!==2)continue
        const ux=b[3]-a[3],uy=b[4]-a[4],uz=b[5]-a[5],vx=c[3]-a[3],vy=c[4]-a[4],vz=c[5]-a[5]
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx
        const len=Math.hypot(nx,ny,nz)||1
        const shade=.52+.48*Math.max(0,(nx*light.x+ny*light.y+nz*light.z)/len)
        const r=rgb[0]*shade,gg=rgb[1]*shade,bb=rgb[2]*shade
        const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))), x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])))
        const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))), y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])))
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
          const px=x+.5,py=y+.5
          const w1=((px-a[0])*(c[1]-a[1])-(py-a[1])*(c[0]-a[0]))/area
          const w2=((b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]))/area
          if(w1<0||w2<0||w1+w2>1)continue
          const z=a[2]+w1*(b[2]-a[2])+w2*(c[2]-a[2]),offset=y*width+x
          if(z<depth[offset])continue
          depth[offset]=z;const o=offset*4;pixels[o]=r;pixels[o+1]=gg;pixels[o+2]=bb;pixels[o+3]=255
        }
      }
    }
  }
  return sharp(pixels,{raw:{width,height,channels:4}}).resize(144,92).png().toBuffer()
}
const output = new URL(`../assets/ldraw/${section.parts[0].assetPath}/previews/`,import.meta.url)
await mkdir(output,{recursive:true})
const pages=Math.ceil(section.parts.length/36)
for(let page=Number(values.start);page<Math.min(pages,Number(values.end??pages));page++){
  const tiles=[]
  for(const part of section.parts.filter(p=>Math.floor(p.preview/36)===page)){
    const model=await loadPartModel(part, { smoothNormals: false })
    const input=await render(model,part.color)
    const tile=part.preview%36
    tiles.push({input,left:tile%6*144,top:Math.floor(tile/6)*92})
    for(const mesh of model.meshes)mesh.dispose()
  }
  await sharp({create:{width:864,height:552,channels:4,background:'#00000000'}}).composite(tiles).webp({quality:86}).toFile(new URL(`${page}.webp`,output).pathname)
  console.log(`${section.id}: preview atlas ${page+1}/${pages}`)
}
