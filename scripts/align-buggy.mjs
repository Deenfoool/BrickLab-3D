import { Quaternion, Vector3 } from 'three'
import { portsFor } from '../src/mechanics/catalog.js'
import { worldPort } from '../src/editor/placement.js'

const point = part => new Vector3().fromArray(part.position)
const line = (part, role) => worldPort(part, portsFor(part.design).find(port => port.role === role))

// The source MPD eyeballs the cardan and rear shocks. Seat their parts against the actual bores.
export function alignBuggy(parts) {
  function get(index, design) {
    const part = parts[index - 1]
    if (part?.design !== design) throw new Error(`Unexpected 8845 source part ${index}`)
    return part
  }

  const input = get(93, '3705')
  const output = get(96, '3705')
  const a = line(input, 'axle')
  const b = line(output, 'axle')
  const delta = b.start.clone().sub(a.start)
  const dot = a.axis.dot(b.axis)
  const center = a.start.clone().addScaledVector(a.axis, (a.axis.dot(delta) - dot * b.axis.dot(delta)) / (1 - dot * dot))
  for (const part of [get(97, '62520'), get(98, '62520'), get(99, '62519')]) {
    part.position = center.toArray()
  }
  const depth = 19.9
  const boreIn = line(get(98, '62520'), 'blind-key')
  const boreOut = line(get(97, '62520'), 'blind-key')
  input.position = point(input).addScaledVector(a.axis, -a.start.clone().sub(boreIn.start).dot(a.axis) - depth).toArray()
  output.position = point(output).addScaledVector(b.axis,
    depth - b.start.clone().addScaledVector(b.axis, 80).sub(boreOut.start).dot(b.axis)).toArray()

  function projectTo(pin, part, role) {
    const axis = line(pin, role)
    return axis.start.clone().addScaledVector(axis.axis, point(part).sub(axis.start).dot(axis.axis))
  }

  for (const [beamIndex, lowerPin, upperPin, cylinderIndex, rodIndex, springIndex] of [
    [65, 3, 68, 104, 105, 106], [66, 4, 70, 107, 108, 109],
  ]) {
    const beam = get(beamIndex, '3702')
    const pin = get(upperPin, '3673')
    const nearest = portsFor(beam.design).filter(port => port.role === 'bearing')
      .map(port => worldPort(beam, port)).sort((first, second) =>
        first.start.distanceToSquared(point(pin)) - second.start.distanceToSquared(point(pin)))[0]
    pin.position = nearest.start.clone().addScaledVector(nearest.axis, point(pin).sub(nearest.start).dot(nearest.axis)).toArray()

    const cylinder = get(cylinderIndex, '4255')
    const rod = get(rodIndex, '4254')
    const spring = get(springIndex, '8845-spring')
    const lower = projectTo(get(lowerPin, '3673'), cylinder, 'pin')
    const upper = projectTo(pin, rod, 'pin')
    const axis = upper.clone().sub(lower).normalize()
    const orientation = new Quaternion().fromArray(cylinder.rotation)
    const originalAxis = new Vector3(0, 1, 0).applyQuaternion(orientation)
    orientation.premultiply(new Quaternion().setFromUnitVectors(originalAxis, axis))
    cylinder.position = lower.toArray()
    rod.position = upper.toArray()
    spring.position = lower.clone().addScaledVector(axis, 56).toArray()
    for (const part of [cylinder, rod, spring]) part.rotation = orientation.toArray()
  }
}
