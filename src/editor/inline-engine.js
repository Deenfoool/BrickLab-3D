import { Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=belt-drive'
import { portLength } from '../mechanics/axial.js?v=linkages'
import { connectAligned, connectPlaced, createAssembly } from './model.js?v=belt-drive'
import { worldPort } from './placement.js?v=belt-drive'

const axlePin = part => portsFor(part.design).find(port => port.role === 'axle-pin')
const key = part => portsFor(part.design).find(port => port.id === 'axle-hole')
const hasPose = part => part && [part.position, part.rotation].every((value, i) =>
  Array.isArray(value) && value.length === i + 3 && value.every(Number.isFinite))

export function longerFanAxle(pin) {
  const replacement = { ...pin, design: '65249' }
  // Keep the original point of entry into the mount. Only the cross end grows.
  const start = worldPort(pin, axlePin(pin)).start
  const offset = start.sub(worldPort(replacement, axlePin(replacement)).start)
  return { ...replacement, position: new Vector3().fromArray(pin.position).add(offset).toArray() }
}

export function upgradeInlineEngineFan(document) {
  const records = document.parts.filter(Boolean)
  const parts = new Map(records.map(part => [part.id, part]))
  if (parts.size !== records.length) return document
  const pin = parts.get('858-111')
  const inner = parts.get('858-118')
  const outer = parts.get('858-113')
  if (pin?.design !== '3749' || inner?.design !== '4032a' || outer?.design !== '4032a' ||
      ![pin, inner, outer].every(hasPose) || parts.get('858-112')?.design !== '3713') return document

  const shaft = axlePin(pin)
  const line = worldPort(pin, shaft)
  const tip = line.start.clone().addScaledVector(line.axis, portLength(shaft))
  if (tip.distanceTo(worldPort(inner, key(inner)).start) > .01) return document

  // Only change the known old mount. Keep deliberate changes to the user's model.
  const attached = link => link?.shaft?.part === pin.id || link?.socket?.part === pin.id
  const original = document.connections.filter(attached)
  if (original.length !== 2 || !original.every(link => link.shaft?.part === pin.id && link.shaft.port === shaft.id) ||
      !['858-100', '858-112'].every(id => original.some(link => link.socket?.part === id))) return document

  const replacement = longerFanAxle(pin)
  const nextParts = document.parts.map(part => part === pin ? replacement : part)
  const retained = document.connections.filter(link => !attached(link))
  const assembly = createAssembly(nextParts.filter(hasPose), retained)
  const pinPort = axlePin(replacement).id
  const updated = []
  for (const link of original) {
    const seat = { ...link, shaft: { part: pin.id, port: pinPort } }
    const socket = parts.get(link.socket.part)
    if (!hasPose(socket)) return document
    const fit = connectPlaced(assembly, replacement, socket, seat, true)
    if (!fit.ok) return document
    updated.push({ ...seat, placement: fit.placement })
  }

  const fanLinks = connectAligned(assembly, [replacement], [inner, outer])
  if (fanLinks.length !== 2) return document
  return { ...document, parts: nextParts, connections: [...retained, ...updated, ...fanLinks] }
}
