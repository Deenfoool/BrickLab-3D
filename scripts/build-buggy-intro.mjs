// Build the grouped startup asset from the editable LDraw example and bundled part packs.
import { readFile, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { gzipSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('vendor/three/build/three.module.min.js', root).href, context)
  if (specifier.startsWith('three/addons/')) return next(new URL('vendor/three/examples/jsm/' + specifier.slice(13), root).href, context)
  return next(specifier, context)
} })
globalThis.ProgressEvent ??= class extends Event {
  constructor(type, options) { super(type); Object.assign(this, options) }
}
const originalFetch = globalThis.fetch
globalThis.fetch = async (request, options) => {
  const url = new URL(request.url ?? request, root)
  if (url.protocol !== 'file:') return originalFetch(request, options)
  url.search = ''
  const data = await readFile(url)
  return new Response(data, { headers: { 'Content-Length': String(data.length) } })
}

const { Box3, Float32BufferAttribute, Vector3 } = await import('three')
const { mergeGeometries, mergeVertices } = await import('three/addons/utils/BufferGeometryUtils.js')
const { loadPartModel, partMesh, parts } = await import('../src/editor/parts.js')
const { parts: records } = JSON.parse(await readFile(new URL('examples/dune-buggy.json', root), 'utf8'))
const models = new Map()
for (const design of new Set(records.map(part => part.design))) models.set(design, await loadPartModel(parts[design]))
const groups = new Map()
const bounds = new Box3()
const pivot = new Map()

function groupFor({ design, position: [x, y, z] }) {
  const side = x > 0 ? 'left' : 'right'
  const end = z > 0 ? 'front' : 'rear'
  const wheel = 'wheel-' + end + '-' + side
  if (design === '3634') return wheel
  if (design === '3482') return wheel + '-rim'
  if (y > 200) return 'cage-' + end
  if (y > 100) return z > 70 ? 'bonnet' : z < -77 ? 'rear-body' : 'seats'
  if (Math.abs(x) > 66) return 'suspension-' + end + '-' + side
  if (z > 105) return 'bumper'
  if (z < -100) return 'rear-axle'
  return 'chassis'
}

for (const part of records) {
  const name = groupFor(part)
  if (!groups.has(name)) groups.set(name, [])
  if (part.design === '3634' || part.design === '3482') pivot.set(name, new Vector3().fromArray(part.position))
  const mesh = partMesh(models.get(part.design), part.color)
  mesh.position.fromArray(part.position)
  mesh.quaternion.fromArray(part.rotation)
  mesh.updateMatrixWorld(true)
  bounds.expandByObject(mesh)
  mesh.traverse(node => {
    if (!node.isMesh) return
    const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone()
    source.applyMatrix4(node.matrixWorld)
    const count = source.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (const { start, count: length, rgb } of Array.isArray(node.material)
      ? source.groups.map(({ start, count, materialIndex }) => ({ start, count, rgb: node.material[materialIndex].color }))
      : [{ start: 0, count, rgb: node.material.color }]) {
      for (let index = start; index < Math.min(start + length, count); index++) rgb.toArray(colors, index * 3)
    }
    for (const name of Object.keys(source.attributes)) if (name !== 'position' && name !== 'normal') source.deleteAttribute(name)
    source.setAttribute('color', new Float32BufferAttribute(colors, 3))
    groups.get(name).push(source)
  })
}
const center = bounds.getCenter(new Vector3())
center.y = bounds.min.y
const scale = 4.4 / (bounds.max.z - bounds.min.z)
const gltf = {
  asset: { version: '2.0', generator: 'BrickLab 3D' }, scene: 0, scenes: [{ nodes: [] }],
  nodes: [], meshes: [], bufferViews: [], accessors: [], buffers: [],
  materials: [{ pbrMetallicRoughness: { metallicFactor: .04, roughnessFactor: .46 } }],
}
const chunks = []
let byteLength = 0
function writeAttribute(array, componentType, type, count, metadata = {}) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length })
  gltf.accessors.push({ bufferView: gltf.bufferViews.length - 1, componentType, count, type, ...metadata })
  const padding = Buffer.alloc((4 - bytes.length % 4) % 4)
  chunks.push(bytes, padding)
  byteLength += bytes.length + padding.length
  return gltf.accessors.length - 1
}
for (const [name, batches] of groups) {
  const origin = pivot.get(name) ?? center
  const geometry = mergeGeometries(batches)
  geometry.translate(-origin.x, -origin.y, -origin.z).scale(scale, scale, scale)
  // Quantize mesh attributes before welding so gzip can reuse neighboring values.
  for (const [name, step] of [['position', 4096], ['normal', 256], ['color', 255]]) {
    const attribute = geometry.attributes[name]
    for (let index = 0; index < attribute.array.length; index++)
      attribute.array[index] = Math.round(attribute.array[index] * step) / step
  }
  const welded = mergeVertices(geometry, .00005)
  welded.computeBoundingBox()
  welded.normalizeNormals()
  const { position, normal, color } = welded.attributes
  const positions = writeAttribute(position.array, 5126, 'VEC3', position.count, {
    min: welded.boundingBox.min.toArray(), max: welded.boundingBox.max.toArray(),
  })
  const normals = writeAttribute(normal.array, 5126, 'VEC3', normal.count)
  const rgba = new Uint8Array(color.count * 4)
  for (let i = 0; i < color.count; i++) {
    rgba[i * 4] = Math.round(color.getX(i) * 255)
    rgba[i * 4 + 1] = Math.round(color.getY(i) * 255)
    rgba[i * 4 + 2] = Math.round(color.getZ(i) * 255)
    rgba[i * 4 + 3] = 255
  }
  const colors = writeAttribute(rgba, 5121, 'VEC4', color.count, { normalized: true })
  const index = welded.index.array
  const indices = writeAttribute(index, index instanceof Uint32Array ? 5125 : 5123, 'SCALAR', index.length)
  gltf.scenes[0].nodes.push(gltf.nodes.length)
  gltf.nodes.push({ name, mesh: gltf.meshes.length,
    translation: origin.clone().sub(center).multiplyScalar(scale).toArray(), extras: { animationGroup: name } })
  gltf.meshes.push({ primitives: [{ attributes: { POSITION: positions, NORMAL: normals, COLOR_0: colors }, indices, material: 0 }] })
}
gltf.buffers.push({ byteLength })
const json = Buffer.from(JSON.stringify(gltf))
const metadata = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
const header = Buffer.alloc(20)
header.write('glTF')
header.writeUInt32LE(2, 4)
header.writeUInt32LE(header.length + metadata.length + 8 + byteLength, 8)
header.writeUInt32LE(metadata.length, 12)
header.write('JSON', 16)
const bin = Buffer.alloc(8)
bin.writeUInt32LE(byteLength)
bin.write('BIN\0', 4)
const output = gzipSync(Buffer.concat([header, metadata, bin, ...chunks]), { level: 9 })
await writeFile(new URL('assets/startup/dune-buggy.glb.gz', root), output)
console.log(`${records.length} parts into ${groups.size} groups · ${output.length} bytes`)
