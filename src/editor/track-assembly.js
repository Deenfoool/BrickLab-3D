import { Quaternion, Vector3 } from 'three'
import { layoutTrack } from '../mechanics/track-layout.js?v=level-treads'
import { isTread, sprockets, trackDrives, trackLine } from '../mechanics/treads.js?v=track-builder'
import { connectPlaced, createAssembly } from './model.js?v=track-builder'

const vec = values => new Vector3().fromArray(values)
const isHinge = link => link.shaft.port === 'tread-pivot' && link.socket.port === 'tread-clip'
const record = ({ shaft, socket, fit }) => ({ shaft, socket, placement: fit.placement })

export function treadChains(parts, links) {
  const byId = new Map(parts.filter(part => isTread(part.design)).map(part => [part.id, part]))
  const to = new Map(), from = new Map()
  for (const link of links) {
    if (!isHinge(link) || !byId.has(link.shaft.part) || !byId.has(link.socket.part)) continue
    to.set(link.socket.part, link.shaft.part)
    from.set(link.shaft.part, link.socket.part)
  }
  const visited = new Set(), chains = []
  for (const first of [...[...byId.keys()].filter(id => !from.has(id)), ...byId.keys()]) {
    if (visited.has(first)) continue
    const chain = []
    for (let id = first; byId.has(id) && !visited.has(id); id = to.get(id)) {
      visited.add(id)
      chain.push(byId.get(id))
    }
    chains.push(chain)
  }
  return chains
}

export function oppositeSprockets(parts, [front, rear]) {
  if (!front || !rear) return []
  const axis = vec(trackLine(front).axis)
  const choices = parts.filter(part => sprockets[part.design] && part.id !== front.id && part.id !== rear.id &&
    Math.abs(vec(trackLine(part).axis).dot(axis)) > .99999)
  const matches = (part, origin) => {
    const offset = vec(part.position).sub(vec(origin.position))
    const across = offset.dot(axis)
    return Math.abs(across) > 30 && offset.addScaledVector(axis, -across).length() < .05 ? across : null
  }
  const pairs = choices.flatMap(first => {
    const a = matches(first, front)
    if (a === null) return []
    return choices.filter(second => first !== second && Math.abs((matches(second, rear) ?? Infinity) - a) < 12)
      .map(second => [first.id, second.id])
  })
  return pairs.length === 1 ? pairs[0] : []
}

function rebuild(parts, links, belts) {
  const assembly = createAssembly(parts, [], { belts })
  if (assembly.belts.length !== belts.length) return null
  const byId = new Map(parts.map(part => [part.id, part]))
  for (const link of links) {
    const fit = connectPlaced(assembly, byId.get(link.shaft.part), byId.get(link.socket.part), link)
    if (!fit.ok) return null
  }
  return assembly
}

export function planTrackAssembly(state, { wheelIds, reuse, design, count, adjust, color, hidden = new Set() },
  allocate = () => crypto.randomUUID()) {
  const [a, b] = wheelIds.map(id => state.parts.find(part => part.id === id && !hidden.has(id)))
  if (!a || !b) return { reason: 'pair' }
  const existing = !reuse ? [] : treadChains(state.parts, state.links).find(chain => chain.some(part => part.id === reuse))
  if (!existing || existing.some(part => hidden.has(part.id))) return { reason: 'chain' }
  const used = new Set(existing.map(p => p.id))
  if (state.links.some(link => [link.shaft.part, link.socket.part].some(id => used.has(id)) && !isHinge(link)) ||
    state.belts.some(belt => used.has(belt.a.part) || used.has(belt.b.part))) return { reason: 'attachments' }
  const links = state.links.filter(link => !used.has(link.shaft.part) && !used.has(link.socket.part))
  const kept = state.parts.filter(part => !used.has(part.id))
  let plan = layoutTrack([a, b], kept, { design, count })
  let aligned = b, shift = 0
  if (plan.reason === 'plane' && adjust) {
    shift = plan.offset
    if (Math.abs(shift) > 10) return plan
    aligned = { ...b, position: vec(b.position).addScaledVector(vec(plan.normal), -shift).toArray() }
    plan = layoutTrack([a, aligned], kept, { design, count })
  }
  if (plan.reason && plan.reason !== 'closure') return plan
  const byPose = wheel => kept.map(part => part === b ? wheel : part)
  let wheel = aligned
  let phase = false
  if (adjust) {
    // A quarter turn changes the tooth phase by half a tooth on a 10T sprocket
    // while remaining a legal keyed axle orientation.
    const rephased = { ...aligned, rotation: new Quaternion().setFromAxisAngle(vec(trackLine(aligned).axis), Math.PI / 2)
      .multiply(new Quaternion().fromArray(aligned.rotation)).toArray() }
    const alternative = layoutTrack([a, rephased], kept, { design, count })
    const flatter = alternative.groundFlat === true && plan.groundFlat === false
    const sameShape = alternative.groundFlat === plan.groundFlat
    if (!alternative.reason && (plan.reason || flatter || (sameShape && alternative.poses.length < plan.poses.length)) &&
        rebuild(byPose(rephased), links, state.belts)) {
      plan = alternative
      wheel = rephased
      phase = true
    }
  }
  if (plan.reason) return plan
  // Do not silently stack a second chain over already placed treads.
  const treadPivots = kept.filter(part => isTread(part.design))
  if (treadPivots.some(part => plan.poses.some(pose => vec(part.position).distanceToSquared(vec(pose.position)) < 12 ** 2))) {
    return { reason: 'occupied' }
  }
  const treads = plan.poses.map((pose, i) => ({
    ...(existing[i] ?? { id: allocate(), design, color }), ...pose,
  }))
  const scene = [...byPose(wheel), ...treads]
  const assembly = rebuild(scene, links, state.belts)
  if (!assembly) return { reason: 'mount' }
  for (const [i, tread] of treads.entries()) {
    const next = treads[(i + 1) % treads.length]
    const shaft = { part: next.id, port: 'tread-pivot' }
    const socket = { part: tread.id, port: 'tread-clip' }
    if (!connectPlaced(assembly, next, tread, { shaft, socket }).ok) return { reason: 'closure' }
  }
  const recognized = trackDrives(scene, assembly.connections).find(track =>
    track.closed && track.links.some(p => p.id === treads[0].id))
  if (!recognized || !recognized.drives.some(drive => drive.wheel.id === a.id) ||
      !recognized.drives.some(drive => drive.wheel.id === b.id)) return { reason: 'closure' }

  const removed = new Set(existing.slice(treads.length).map(part => part.id))
  const layers = !removed.size ? state.layers : {
    groups: state.layers.groups.map(group => ({ ...group, partIds: group.partIds.filter(id => !removed.has(id)) }))
      .filter(group => group.partIds.length),
    hiddenPartIds: state.layers.hiddenPartIds.filter(id => !removed.has(id)),
  }
  const preview = wheel === b ? treads : [wheel, ...treads]
  return {
    scene, links: assembly.connections.map(record), layers, treads, preview, wheelIds,
    covered: new Set([...used, ...(wheel === b ? [] : [b.id])]),
    shift: Math.abs(shift), phase, guides: plan.guides, groundFlat: plan.groundFlat,
    added: Math.max(0, treads.length - existing.length), removed: removed.size,
  }
}
