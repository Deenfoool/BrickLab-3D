import { Quaternion, Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=inline-engine'
import { connectAligned, connectPlaced, createAssembly } from './model.js?v=inline-engine'

const identity = [0, 0, 0, 1]
const reverseYoke = new Quaternion().setFromAxisAngle(new Vector3(1, -1, 0).normalize(), Math.PI).toArray()
const turnCoil = [0, 1, 0, 0]

const compositeShocks = {
  76320: ['32181c05', '32183c02', '22020', 0, 84, 180, 120],
  41475: ['2909', '2910', '41355', 50, 40, 170, 130],
  74741: ['2909', '2910', 'u9409', 50, 40, 170, 130],
  75348: ['2909', '2910', 'u9410', 50, 40, 170, 130],
  95292: ['2909', '2910', 'u9411', 50, 40, 170, 130],
}

function components(design) {
  if (design === '61903') return [['62520', 0, identity], ['62520', 0, reverseYoke], ['62519', 0, identity]]
  const state = design.match(/^(.+)-(f[12])$/)
  const shock = state && compositeShocks[state[1]]
  if (!shock) return null
  const [cylinder, rod, coil, yCylinder, yCoil, extended, compressed] = shock
  return [[cylinder, yCylinder, identity], [rod, state[2] === 'f1' ? extended : compressed, identity],
    [`${coil}-${state[2]}`, yCoil, yCylinder ? turnCoil : identity]]
}

export function componentBundle(part, available, allocate) {
  const entries = components(String(part.design))
  if (!entries || entries.some(([design]) => !available[design])) return null
  const rotation = new Quaternion().fromArray(part.rotation)
  const origin = new Vector3().fromArray(part.position)
  const instances = entries.map(([design, y, local], index) => ({
    ...part, id: index ? allocate(part.id, index) : part.id, design,
    position: new Vector3(0, y, 0).applyQuaternion(rotation).add(origin).toArray(),
    rotation: rotation.clone().multiply(new Quaternion().fromArray(local)).toArray(),
  }))
  const assembly = createAssembly(instances, [])
  const links = instances.flatMap((entry, index) => connectAligned(assembly, [entry], instances.slice(0, index)))
  if (links.length !== instances.length - 1) return null
  const [anchor, ...items] = instances
  return { anchor, items, links, snap: true }
}

const finiteArray = (array, size) => Array.isArray(array) && array.length === size && array.every(Number.isFinite)

export function expandComponents(document, available) {
  const ids = new Set()
  const duplicates = new Set()
  for (const part of document.parts) {
    if (!part?.id) continue
    if (ids.has(part.id)) duplicates.add(part.id)
    ids.add(part.id)
  }
  const allocate = (id, index) => {
    let next = `${id}:component:${index}`
    while (ids.has(next)) next += '-'
    ids.add(next)
    return next
  }
  let { parts, connections } = document
  for (const part of document.parts) {
    if (typeof part?.id !== 'string' || duplicates.has(part.id) || !finiteArray(part.position, 3) || !finiteArray(part.rotation, 4) || !part.rotation.some(Boolean)) continue
    const entry = { ...part, rotation: new Quaternion().fromArray(part.rotation).normalize().toArray() }
    const bundle = componentBundle(entry, available, allocate)
    if (!bundle) continue
    const instances = [bundle.anchor, ...bundle.items]
    const nextParts = parts.flatMap(current => current.id === entry.id ? instances : [current])
    const byId = new Map(nextParts.map(current => [current.id, current]))
    const attached = link => link?.shaft?.part === entry.id || link?.socket?.part === entry.id
    const retained = [...connections.filter(link => !attached(link)), ...bundle.links]
    const assembly = createAssembly(nextParts, retained)
    const endpoints = (endpoint, gender) => {
      if (endpoint.part !== entry.id) return [endpoint]
      const role = portsFor(entry.design).find(port => port.id === endpoint.port)?.role
      return instances.flatMap(instance => portsFor(instance.design).filter(port => port.gender === gender && port.role === role)
        .map(port => ({ part: instance.id, port: port.id })))
    }
    const remap = link => {
      for (const shaft of endpoints(link.shaft, 'M')) {
        for (const socket of endpoints(link.socket, 'F')) {
          const a = byId.get(shaft.part)
          const b = byId.get(socket.part)
          if (!a || !b) continue
          const fit = connectPlaced(assembly, a, b, { shaft, socket, placement: link.placement })
          if (fit.ok) {
            retained.push({ shaft, socket, placement: fit.placement })
            return true
          }
        }
      }
      return false
    }
    if (!connections.filter(attached).every(remap)) continue
    parts = nextParts
    connections = retained
  }
  return parts === document.parts ? document : { ...document, parts, connections }
}
