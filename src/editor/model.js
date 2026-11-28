import { sprockets, trackDrives, trackLine, trackPoses } from '../mechanics/treads.js?v=track-builder'
import { Quaternion, Vector3 } from 'three'
import { connectionMode } from '../mechanics/axial.js?v=linear-actuator-1'
import { Assembly, measureInsertion } from '../mechanics/assembly.js?v=linear-actuator-1'
import { rotationalDrive } from '../mechanics/rotation.js?v=belt-drive'
import { assembleBelts } from '../mechanics/belts.js?v=belt-drive'
import { engineDrive } from '../mechanics/engine.js?v=belt-drive'
import { cardanCoupling } from '../mechanics/cardan.js'
import { movePose, turnPose, articulationDrive, jointBodies, linkageDrive, mechanismPoses, motionRange, suspensionDrive } from '../mechanics/linkage.js'
import { gearAt, gearRacks, portsFor, rotationPort, technic } from '../mechanics/catalog.js?v=linear-actuator-1'
import { baseRotation, joinedPose, retainedPlacement, worldPort } from './placement.js?v=linear-actuator-1'
import { clutchTravel, selectorLinkages } from './selector-linkage.js?v=selector-drag'
import { motorSupply } from '../mechanics/motors.js'
import { linearActuatorMotion, actuatorPreview } from './actuator-motion.js'
import { linearActuators } from '../mechanics/actuators.js'

const valid = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite)
export const snapGrid = 10

export function loadParts(document, models) {
  const records = []
  const seen = new Set()
  const reserved = new Set(document.parts.map(entry => entry?.id).filter(id => typeof id === 'string' && id.trim()))
  for (const [index, entry] of document.parts.entries()) {
    const design = String(entry?.design ?? '')
    if (!models.has(design)) continue
    let id = entry.id
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) {
      id = `imported-part-${index + 1}`
      while (reserved.has(id) || seen.has(id)) id += '-'
    }
    seen.add(id)
    const old = !valid(entry.position, 3)
    const q = valid(entry.rotation, 4) && entry.rotation.some(Boolean) ? new Quaternion().fromArray(entry.rotation).normalize().toArray() : baseRotation
    const defaultY = models.get(design).bounds.max.y
    records.push({ ...entry, id, design, position: old ? [index * 45, defaultY, 0] : entry.position, rotation: q })
  }
  const exampleIds = ['drive', 'driven', 'bearing', 'bush', 'gear8', 'gear24']
  if (exampleIds.every(id => seen.has(id) && !valid(document.parts.find(entry => entry?.id === id)?.position, 3))) {
    const byId = new Map(records.map(part => [part.id, part]))
    if (byId.get('drive').design === '3737' && byId.get('driven').design === '3705') {
      byId.get('drive').position = [40, 34, -20]
      byId.get('driven').position = [0, 34, 20]
      for (const link of document.connections) {
        if (!link) continue
        const { shaft, socket, placement } = link
        const a = byId.get(shaft?.part)
        const b = byId.get(socket?.part)
        const male = technic[a?.design]?.find(port => port.id === shaft?.port)
        const female = technic[b?.design]?.find(port => port.id === socket?.port)
        if (!exampleIds.includes(a?.id) || !exampleIds.includes(b?.id) || !male || !female || !Number.isFinite(placement?.offset)) continue
        const roll = placement.roll ?? 0
        Object.assign(b, joinedPose(b, female, a, male, { direction: 1, ...placement, roll, keyStep: female.role === 'bearing' ? null : Math.PI / 2 }))
      }
    }
  }
  return records
}

export function createAssembly(parts, links, { belts } = {}) {
  const catalog = Object.create(null)
  const assembly = new Assembly(catalog)
  const byId = new Map(parts.map(part => [part.id, part]))
  for (const part of parts) {
    const ports = portsFor(part.design)
    if (!ports.length) continue
    catalog[part.design] = ports
    assembly.addPart(part.id, part.design)
  }
  for (const link of links) {
    const a = byId.get(link?.shaft?.part)
    const b = byId.get(link?.socket?.part)
    if (a && b && link.placement) connectPlaced(assembly, a, b, link, true)
  }
  assembly.belts = assembleBelts(byId, belts)
  return assembly
}

export function connectPlaced(assembly, a, b, { shaft, socket, placement }, checkSaved = false) {
  const male = assembly.port(a.id, shaft.port)
  const female = assembly.port(b.id, socket.port)
  if (!male || !female) return { ok: false, reason: 'invalid-endpoint' }
  const measured = retainedPlacement(a, male, b, female, placement)
  if (!measured) return { ok: false, reason: 'non-coaxial-ports' }
  const options = { world: measured.world, seated: true }
  if (checkSaved && (!Number.isFinite(placement.offset) ||
      Math.abs(placement.offset - measured.placement.offset) > .01 ||
      (placement.direction ?? 1) !== measured.placement.direction)) {
    return { ok: false, reason: 'placement-pose-mismatch' }
  }
  const sides = [...new Set([placement?.side, ...female.openings])].filter(Boolean)
  let failure
  for (const side of sides) {
    const entry = { ...measured.placement, side }
    const fit = assembly.previewInsertion(shaft, socket, entry, options)
    if (!fit.ok) {
      failure ??= fit
      continue
    }
    if ((fit.placement.keyStep || fit.motion.detents.length) &&
        Math.abs(Math.sin((fit.placement.roll - measured.placement.roll) / 2)) > .001) {
      return { ok: false, reason: 'invalid-rotation' }
    }
    return assembly.connect(shaft, socket, fit.placement, options)
  }
  return failure ?? { ok: false, reason: 'closed-entry' }
}

export function connectAligned(assembly, changed, fixed) {
  const added = []
  for (const a of changed) {
    for (const b of fixed) {
      for (const portA of portsFor(a.design)) {
        for (const portB of portsFor(b.design)) {
          if (portA.legacy || portB.legacy) continue
          const movingShaft = portA.gender === 'M'
          const male = movingShaft ? portA : portB
          const female = movingShaft ? portB : portA
          if (!connectionMode(male, female)) continue
          const shaftPart = movingShaft ? a : b
          const socketPart = movingShaft ? b : a
          const shaft = { part: shaftPart.id, port: male.id }
          const socket = { part: socketPart.id, port: female.id }
          const fit = connectPlaced(assembly, shaftPart, socketPart, { shaft, socket })
          if (fit.ok) added.push({ shaft, socket, placement: fit.placement })
        }
      }
    }
  }
  return added
}

export function linkedSelector(selected, parts, assembly) {
  if (!selected || !parts.some(part => part.design === '6641')) return null
  return selectorLinkages(parts, assemblyJoints(parts, assembly), assembly).find(linkage => linkage.contains(selected)) ?? null
}

export function recoverSelectorLinks(parts, assembly) {
  if (!parts.some(part => part.design === '6641')) return { parts, assembly }
  const missing = selectorLinkages(parts, assemblyJoints(parts, assembly), assembly, true).filter(linkage => linkage.missing)
  for (const linkage of missing) {
    const transforms = linkage.recover()
    if (!transforms) continue
    const updated = parts.map(part => transforms.has(part.id) ? movePose(part, transforms.get(part.id)) : part)
    const byId = new Map(updated.map(part => [part.id, part]))
    const checked = createAssembly(updated, [], { belts: assembly.belts.map(({ record }) => record) })
    const fits = [...assembly.connections, linkage.missing].every(link =>
      connectPlaced(checked, byId.get(link.shaft.part), byId.get(link.socket.part), link).ok)
    if (!fits || checked.belts.length !== assembly.belts.length) continue
    parts = updated
    assembly = checked
  }
  return { parts, assembly }
}

// Shift the ring along its installed guide and rock the selector about its control axle.
export function shiftSelector(selected, direction, parts, assembly, linkage = linkedSelector(selected, parts, assembly)) {
  const links = assembly.connections
  const catchLink = links.find(l => l.socket.port === 'shift-groove' &&
    (l.shaft.part === selected || l.socket.part === selected))
  const ringId = linkage?.ring.id ?? catchLink?.socket.part ?? selected
  const guide = links.find(l => l.socket.part === ringId && l.socket.port === 'selector-guide')
  if (!guide) return
  const byId = new Map(parts.map(p => [p.id, p]))
  const ring = byId.get(ringId)
  const center = new Vector3().fromArray(byId.get(guide.shaft.part).position)
  const axis = worldPort(ring, assembly.port(ringId, 'selector-guide')).axis
  const travel = clutchTravel(ring, axis, center, direction, parts)
  if (linkage) {
    const transforms = linkage.shift(travel)
    if (!transforms) return
    return new Map(mechanismPoses(parts, transforms).map(part => [part.id, part]))
  }
  const edits = new Map([[ringId, { ...ring, position: center.addScaledVector(axis, travel).toArray() }]])
  if (catchLink) {
    const lever = byId.get(catchLink.shaft.part)
    const tip = assembly.port(lever.id, catchLink.shaft.port)
    const sign = worldPort(lever, tip).axis.dot(axis) > 0 ? 1 : -1
    const next = portsFor(lever.design).find(p => Math.abs(p.shift - travel * sign) < .01)
    if (!next) return
    const pivot = worldPort(lever, portsFor(lever.design).find(p => p.role === 'key'))
    const turn = turnPose(pivot.start, pivot.axis, Math.asin(next.shift / 22) - Math.asin(tip.shift / 22))
    const body = jointBodies(byId.keys(), assemblyJoints(parts, assembly)).byPart.get(lever.id)
    for (const id of body.ids) edits.set(id, movePose(byId.get(id), turn))
  }
  return edits
}

export function partRotationPort(part) {
  return rotationPort(portsFor(part.design))
}

export function gearPoses(parts) {
  return parts.flatMap(part => {
    const ports = portsFor(part.design)
    const gear = ports.find(port => port.role === 'gear')
    if (!gear) return []
    const { start, axis } = worldPort(part, gear)
    const center = start.addScaledVector(axis, gear.sections[0].length / 2).toArray()
    return [gearAt(part.id, part.design, center, worldPort(part, partRotationPort(part)).axis.toArray())]
  })
}

const spinRoles = new Set([
  'axle', 'axle-pin', 'friction-axle-pin', 'duplo-axle', 'gear', 'rim-seat', 'tyre-seat', 'selector-spline',
  'torque-clutch-inner', 'torque-clutch-outer',
])

function portLine(part, port) {
  const { start, axis } = worldPort(part, port)
  return { start: start.toArray(), axis: axis.toArray() }
}

export function assemblyJoints(parts, assembly) {
  const byId = new Map(parts.map(part => [part.id, part]))
  return assembly.connections.map(({ shaft, socket, fit }) => {
    const male = assembly.port(shaft.part, shaft.port)
    const female = assembly.port(socket.part, socket.port)
    return {
      a: shaft.part, b: socket.part, motion: fit.motion.rotation, group: male.group, restLength: male.restLength,
      socketPort: socket.port, shaftPort: shaft.port,
      ...(fit.motion.torqueLimit && { torqueLimit: fit.motion.torqueLimit }),
      detents: fit.motion.detents, roll: fit.placement.roll,
      shaftLine: portLine(byId.get(shaft.part), male),
      socketLine: portLine(byId.get(socket.part), female),
      ...(female.stroke && { stroke: female.stroke,
        springSeat: worldPort(byId.get(shaft.part), { start: male.springSeat, axis: male.axis }).start.toArray() }),
    }
  })
}

export function rotationMotion(selected, parts, assembly, linkage = linkedSelector(selected, parts, assembly)) {
  const motor = parts.find(part => part.id === selected && ['u9479c01', '10089c01'].includes(part.design))
  if (motor) {
    const output = assembly.connections.find(link => link.shaft.part === selected && link.shaft.port === 'control-plus-output')
    if (!output) return null
    const motion = rotationMotion(output.socket.part, parts, assembly)
    const supply = motorSupply(motor, parts)
    return motion && { ...motion, kind: 'motor', motor: selected, supply,
      playback: supply.speed * 180 / Math.PI, periodic: !motion.actuators, range: motion.actuators ? motion.range : [0, 360] }
  }
  const selector = linkage?.motion(selected)
  if (selector) return { ...selector, ok: true, range: motionRange(selector), meshes: [] }
  const byId = new Map(parts.map(part => [part.id, part]))
  const driver = byId.get(selected)
  const joints = assemblyJoints(parts, assembly)
  const graph = jointBodies(byId.keys(), joints)
  const gears = gearPoses(parts)
  if (linearActuators[driver?.design]) return linearActuatorMotion(selected, parts, joints)
  const engine = engineDrive(selected, byId, graph, gears, joints, assembly.belts)
  if (engine || !driver) return engine
  const ports = portsFor(driver.design)
  const rotor = ports.some(port => spinRoles.has(port.role)) ? rotationPort(ports) : ports.find(port => port.rotor)
  const preferred = sprockets[driver.design] ? trackLine(driver) : rotor && portLine(driver, rotor)
  const crosses = new Map()
  for (const joint of joints) {
    if (joint.group !== 'uniJnt') continue
    if (!crosses.has(joint.a)) crosses.set(joint.a, [])
    crosses.get(joint.a).push(joint)
  }
  const couplings = []
  const replaced = new Set()
  for (const [cross, pivots] of crosses) {
    if (pivots.length !== 2) continue
    const ends = pivots.map(pivot => {
      const part = byId.get(pivot.b)
      const bore = portsFor(part.design).find(port => port.role === 'blind-key' || port.role === 'key')
      return bore && { part: part.id, shaftLine: portLine(part, bore), pinLine: pivot.socketLine }
    })
    if (ends.some(end => !end)) continue
    const coupling = cardanCoupling(cross, ...ends)
    if (!coupling) continue
    couplings.push(coupling)
    pivots.forEach(pivot => replaced.add(pivot))
  }
  const spinJoints = joints.filter(joint => !replaced.has(joint))
  const tracks = trackDrives(parts, assembly.connections)
  const trackEdges = tracks.flatMap(({ drives: [source, ...others] }) => others.map(({ wheel, sign }) => ({
    a: source.wheel.id, b: wheel.id, lineA: trackLine(source.wheel), lineB: trackLine(wheel),
    ratio: source.sign * sign * sprockets[source.wheel.design].teeth / sprockets[wheel.design].teeth,
  })))
  const rotation = rotationalDrive(selected, byId.keys(), spinJoints, gears, preferred, couplings, [...assembly.belts, ...trackEdges])
  if (rotation?.ok && tracks.length) {
    rotation.tracks = tracks.filter(track => {
      const wheel = track.drives[0].wheel, spin = rotation.spins.get(wheel.id)
      return spin && measureInsertion(spin, trackLine(wheel))
    })
    rotation.belts = rotation.belts.filter(belt => belt.record)
  }
  const actuator = linearActuatorMotion(selected, parts, joints, rotation)
  if (actuator) return actuator
  const rotateGear = id => {
    const gear = gears.find(item => item.part === id)
    return rotationalDrive(id, byId.keys(), spinJoints, gears, { start: gear.center, axis: gear.axis }, couplings, assembly.belts)
  }
  const racks = parts.flatMap(part => {
    const profile = gearRacks[part.design]
    if (!profile) return []
    return [{ ...profile, ...worldPort(part, profile), part: part.id,
      normal: new Vector3().fromArray(profile.normal).applyQuaternion(new Quaternion().fromArray(part.rotation)) }]
  })
  const spherical = ports.some(port => ['ball', 'ball-socket'].includes(port.role)) ? articulationDrive(selected, graph, true) : null
  const mechanism = linkageDrive(selected, graph, racks, gears, rotation, rotateGear) ?? suspensionDrive(selected, graph) ?? spherical ??
    (!couplings.some(coupling => coupling.cross === selected) && !preferred && (!rotation || rotation.reason === 'multiple-joint-axes') ? articulationDrive(selected, graph) : null)
  return mechanism ? { ...mechanism, ok: true, range: motionRange(mechanism), meshes: mechanism.rotation?.meshes ?? [] } : rotation
}

export function rotationPoses(parts, motion, angle, axis) {
  if (motion.solve) {
    const transforms = motion.solve(angle, axis)
    if (!transforms) return null
    const base = motion.rotation ? rotationPoses(parts, motion.rotation, motion.rotationAngle(angle, transforms)) : []
    const driven = mechanismPoses(parts, transforms)
    const moved = new Set(driven.map(part => part.id))
    return [...base.filter(part => !moved.has(part.id)), ...driven]
  }
  const treads = (motion.tracks ?? []).flatMap(track =>
    trackPoses(track, motion.spins.get(track.drives[0].wheel.id), angle))
  const poses = treads.concat(parts.flatMap(part => {
    const spin = motion.spins.get(part.id)
    const cross = motion.cardans?.get(part.id)
    if (!spin && !cross) return []
    const { center: start, rotation: turn } = cross ? cross(angle) : {
      center: new Vector3().fromArray(spin.start),
      rotation: new Quaternion().setFromAxisAngle(new Vector3().fromArray(spin.axis),
        spin.angleAt ? spin.angleAt(angle) : angle * spin.ratio),
    }
    return [{
      ...part,
      position: new Vector3().fromArray(part.position).sub(start).applyQuaternion(turn).add(start).toArray(),
      rotation: new Quaternion().fromArray(part.rotation).premultiply(turn).toArray(),
    }]
  }))
  return motion.actuators ? actuatorPreview(parts, motion, poses, angle) : poses
}

export function hingeMotion(selected, parts, links, chosen) {
  const joint = chosen ?? links.find(({ shaft, socket, fit }) =>
    fit.motion.detents.length && (shaft.part === selected || socket.part === selected))
  if (!joint) return undefined
  const movingShaft = joint.shaft.part === selected
  const other = movingShaft ? joint.socket.part : joint.shaft.part
  const neighbors = new Map()
  for (const link of links) {
    if (link === joint) continue
    for (const [a, b] of [[link.shaft.part, link.socket.part], [link.socket.part, link.shaft.part]]) {
      if (!neighbors.has(a)) neighbors.set(a, [])
      neighbors.get(a).push(b)
    }
  }
  const moving = new Set([selected])
  const pending = [selected]
  for (let index = 0; index < pending.length; index++) {
    for (const id of neighbors.get(pending[index]) ?? []) {
      if (moving.has(id)) continue
      moving.add(id)
      pending.push(id)
    }
  }
  if (moving.has(other)) return { ok: false }
  const socket = parts.find(part => part.id === joint.socket.part)
  const port = portsFor(socket.design).find(port => port.id === joint.socket.port)
  const { start, axis } = worldPort(socket, port)
  return { ok: true, moving, axis, start, sign: movingShaft ? 1 : -1, roll: joint.fit.placement.roll,
    detents: [...joint.fit.motion.detents].sort((a, b) => a - b) }
}

export function hingePoses(parts, hinge, angle) {
  const spin = new Quaternion().setFromAxisAngle(hinge.axis, hinge.sign * (angle - hinge.roll))
  return parts.map(part => hinge.moving.has(part.id) ? {
    ...part,
    position: new Vector3().fromArray(part.position).sub(hinge.start).applyQuaternion(spin).add(hinge.start).toArray(),
    rotation: new Quaternion().fromArray(part.rotation).premultiply(spin).toArray(),
  } : part)
}

export function raisedPose(part, model, point) {
  const matrix = new Quaternion().fromArray(part.rotation)
  const bounds = model.bounds
  let min = Infinity
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        min = Math.min(min, new Vector3(part.mirrored ? -x : x, y, z).applyQuaternion(matrix).y)
      }
    }
  }
  const grid = v => Math.round(v / snapGrid) * snapGrid
  return { ...part, position: [grid(point.x), -min, grid(point.z)] }
}
