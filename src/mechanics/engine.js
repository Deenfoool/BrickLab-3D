import { Quaternion, Vector3 } from 'three'
import { portsFor } from './catalog.js?v=inline-engine'
import { assignPose, turnPose } from './linkage.js'
import { rotationalDrive } from './rotation.js?v=inline-engine'
import { worldPort } from '../editor/placement.js?v=inline-engine'

const vector = value => new Vector3().fromArray(value)
const center = part => vector(part.position)
const apply = (point, pose) => point.clone().applyQuaternion(pose.rotation).add(pose.translation)
const project = (point, start, axis) => start.clone().addScaledVector(axis, point.clone().sub(start).dot(axis))
const parallel = (a, b) => Math.abs(a.dot(b)) > .99999
const onLine = (point, start, axis) => point.distanceTo(project(point, start, axis)) < .02
const continuous = edge => edge.joint.motion === 'continuous'
const translation = offset => ({ rotation: new Quaternion(), translation: offset })

function worldPorts(part, role) {
  return portsFor(part.design).filter(port => port.role === role && !port.legacy)
    .map(port => ({ ...port, ...worldPort(part, port) }))
}

function spans(port) {
  let start = port.start
  return port.sections.map(({ radius, length }) => {
    const end = start.clone().addScaledVector(port.axis, length)
    const result = { start, end, radius }
    start = end
    return result
  })
}

function journals(body, base) {
  const edges = body.edges.filter(edge => continuous(edge) && edge.other(body) === base)
  const line = edges[0]
  return line && edges.every(edge => parallel(line.axis, edge.axis) && onLine(edge.start, line.start, line.axis)) ? line : null
}

// For the square 3652 piston, the cylinder can be built out of ordinary bricks and plates.
function hasCylinder(piston, up, base, parts) {
  const p = center(piston)
  const across = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().fromArray(piston.rotation))
  const side = across.clone().cross(up)
  const studs = base.ids.flatMap(id => worldPorts(parts.get(id), 'stud'))
    .filter(port => parallel(port.axis, up))
    .map(port => port.start.clone().sub(p)).filter(delta => Math.abs(delta.dot(up)) < 48)
  return [[across, side], [side, across]].some(([direction, along]) =>
    [-1, 1].every(sign => studs.some(delta => {
      const wall = sign * delta.dot(direction)
      return wall >= 24 && wall <= 42 && Math.abs(delta.dot(along)) <= 19
    })))
}

function sliderCranks(graph, parts) {
  const engines = new Map()
  for (const piston of parts.values()) {
    if (piston.design !== '3652') continue
    const head = graph.byPart.get(piston.id)
    if (head.edges.length !== 1) continue
    const [wrist] = head.edges
    if (!continuous(wrist)) continue
    const rod = wrist.other(head)
    if (rod.edges.length !== 2) continue
    const pin = rod.edges.find(edge => edge !== wrist && continuous(edge) && parallel(edge.axis, wrist.axis))
    if (!pin) continue
    const crank = pin.other(rod)
    const up = worldPort(piston, { start: [0, 0, 0], axis: [0, -1, 0] }).axis
    if (Math.abs(up.dot(pin.axis)) > .001) continue
    const bases = crank.edges.filter(edge => continuous(edge) && parallel(edge.axis, pin.axis) &&
      !onLine(pin.start, edge.start, edge.axis)).map(edge => edge.other(crank)).filter(body => body !== rod)
      .sort((a, b) => b.ids.length - a.ids.length)
    const base = bases.find(body => hasCylinder(piston, up, body, parts))
    if (!base) continue
    const main = journals(crank, base)
    if (!main || !parallel(main.axis, pin.axis)) continue
    const top = project(center(piston), wrist.start, wrist.axis)
    const bottom = project(top, pin.start, pin.axis)
    const axisPoint = project(bottom, main.start, main.axis)
    const link = top.clone().sub(bottom)
    const branch = Math.sign(link.dot(up))
    const lateral = axisPoint.clone().sub(top).cross(up).length()
    if (!branch || lateral + bottom.distanceTo(axisPoint) >= link.length()) continue
    const engine = engines.get(crank) ?? { crank, base, main, cylinders: [] }
    if (engine.base !== base) continue
    engine.cylinders.push({ head, rod, top, bottom, up, link, branch, pin })
    engines.set(crank, engine)
  }
  return engines.values()
}

function solvePiston(cylinder, crankPose, axis, poses) {
  const { head, rod, top, bottom, up, link, branch } = cylinder
  const crankPin = apply(bottom, crankPose)
  const delta = crankPin.clone().sub(top)
  const advance = delta.dot(up) + branch * Math.sqrt(Math.max(0, link.lengthSq() - delta.cross(up).lengthSq()))
  const shift = up.clone().multiplyScalar(advance)
  const nextLink = top.clone().add(shift).sub(crankPin)
  const angle = Math.atan2(link.clone().cross(nextLink).dot(axis), link.dot(nextLink))
  assignPose(poses, head, translation(shift))
  assignPose(poses, rod, turnPose(bottom, axis, angle, crankPin))
}

function carriedPins(body, pivot, parts) {
  return body.edges.flatMap(edge => {
    const member = edge.other(body)
    const part = parts.get(member.ids[0])
    if (!continuous(edge) || !parallel(edge.axis, pivot.axis) || onLine(edge.start, pivot.start, pivot.axis) ||
        member.ids.length !== 1 || member.edges.length !== 1 || part.design !== '3673') return []
    return [{ edge, member, sections: worldPorts(part, 'pin').flatMap(spans) }]
  })
}

function bushSpan(part, up) {
  return worldPorts(part, 'bush').filter(port => parallel(port.axis, up)).flatMap(spans)
    .map(({ start, end }) => [start.dot(up), end.dot(up)].sort((a, b) => a - b))[0]
}

function pushRods(graph, base, parts, up) {
  const result = []
  for (const body of new Set(graph.byPart.values())) {
    if (body === base || body.ids.length !== 3 || !body.edges.length) continue
    const members = body.ids.map(id => parts.get(id))
    const shaft = members.find(part => worldPorts(part, 'axle').some(port => parallel(port.axis, up)))
    const collars = members.filter(part => part.design === '3713').map(part => bushSpan(part, up)).filter(Boolean)
      .sort((a, b) => a[0] - b[0])
    if (!shaft || collars.length !== 2 || body.edges.some(edge =>
      !continuous(edge) || edge.other(body) !== base || !parallel(edge.axis, up))) continue
    const guideSections = body.edges.flatMap(edge => worldPorts(parts.get(edge.joint.b), 'bearing')
      .filter(port => port.start.distanceTo(edge.start) < .02 && parallel(port.axis, up)).flatMap(spans))
    if (!guideSections.length) continue
    const heights = guideSections.flatMap(section => [section.start.dot(up), section.end.dot(up)])
    const [foot] = collars[0]
    const [seat, cap] = collars[1]
    const maxTravel = Math.min(...heights) - collars[0][1]
    const floor = Math.max(...heights) - seat
    if (maxTravel <= 0 || floor > .02) continue
    const p = center(shaft)
    result.push({ body, floor, maxTravel, foot: p.clone().addScaledVector(up, foot - p.dot(up)),
      cap: p.clone().addScaledVector(up, cap - p.dot(up)) })
  }
  return result
}

// Model the rounded edge of the follower where the pin enters from the side.
function liftFrom(section, pose, foot, axis, up, floor) {
  const start = apply(section.start, pose).sub(foot)
  const end = apply(section.end, pose).sub(foot)
  const a = start.dot(axis)
  const b = end.dot(axis)
  const axialGap = a * b <= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b))
  const collarRadius = 9
  if (axialGap >= collarRadius) return floor
  const reach = Math.sqrt(collarRadius ** 2 - axialGap ** 2)
  const across = Math.max(0, Math.abs(start.dot(axis.clone().cross(up))) - reach)
  if (across >= section.radius) return floor
  const rise = start.dot(up) + Math.sqrt(section.radius ** 2 - across ** 2)
  const t = Math.min(1, (section.radius - across) / 4)
  return floor + Math.max(0, rise - floor) * t ** 2 * (3 - 2 * t)
}

function rockerContact(rocker, edge, rod, parts, up) {
  if (rocker.edges.length !== 1 || !continuous(edge)) return null
  const side = edge.axis.clone().cross(up)
  for (const id of rocker.ids) {
    const part = parts.get(id)
    if (part.design !== '3623') continue
    const face = worldPorts(part, 'anti-stud')
    if (face.length !== 3) continue
    const normalAtRest = face[0].axis
    const middle = face.reduce((sum, port) => sum.add(port.start), new Vector3()).divideScalar(face.length)
    const offset = rod.cap.clone().sub(middle)
    if (Math.abs(offset.dot(edge.axis)) > 10 || Math.abs(offset.dot(side)) > 30 ||
        Math.abs(offset.dot(up)) > 16 || normalAtRest.dot(up) < .8) continue
    const outward = Math.sign(rod.cap.clone().sub(edge.start).dot(side))
    const rim = rod.cap.clone().addScaledVector(side, outward * 9)
    const planeOffset = middle.clone().sub(edge.start).dot(normalAtRest)
    const rimOffset = rim.sub(edge.start)
    const height = angle => {
      const normal = normalAtRest.clone().applyAxisAngle(edge.axis, angle)
      return (planeOffset - rimOffset.dot(normal)) / up.dot(normal)
    }
    const neutral = height(0)
    const limit = Math.PI / 5
    const direction = Math.sign(height(limit) - height(-limit))
    return { rocker, solve(travel, poses) {
      if (!travel) {
        assignPose(poses, rocker, translation(new Vector3()))
        return
      }
      let low = -limit
      let high = limit
      for (let i = 0; i < 30; i++) {
        const mid = (low + high) / 2
        if ((height(mid) - neutral - travel) * direction < 0) low = mid
        else high = mid
      }
      assignPose(poses, rocker, turnPose(edge.start, edge.axis, (low + high) / 2))
    } }
  }
  return null
}

function findRocker(base, rod, parts, up, axis) {
  for (const bearing of base.edges) {
    if (!continuous(bearing) || !parallel(bearing.axis, axis)) continue
    const shaft = bearing.other(base)
    const delta = rod.cap.clone().sub(bearing.start)
    if (Math.abs(delta.dot(up)) > 16 || Math.abs(delta.dot(axis.clone().cross(up))) > 44) continue
    for (const edge of shaft.edges) {
      const other = edge.other(shaft)
      if (other === base || !parallel(edge.axis, axis) || !onLine(edge.start, bearing.start, axis)) continue
      const rocker = rockerContact(other, edge, rod, parts, up)
      if (rocker) return rocker
    }
  }
  return null
}

function valveTrain(cams, graph, base, parts, up, axis) {
  return pushRods(graph, base, parts, up).flatMap(rod => {
    const rocker = findRocker(base, rod, parts, up, axis)
    if (!rocker) return []
    for (const cam of cams) {
      const core = cam.body.ids.flatMap(id => worldPorts(parts.get(id), 'axle'))
        .filter(port => parallel(port.axis, axis) && onLine(port.start, cam.line.start, axis)).flatMap(spans)
      const on = [...core, ...cam.pins.flatMap(pin => pin.sections)]
      const initial = rodLift(rod, on, translation(new Vector3()), axis, up)
      if (Math.abs(initial) > 1 || !cam.pins.some(pin => pin.sections.some(section => {
        const offset = rod.foot.clone().sub(cam.line.start)
        const along = rod.foot.dot(axis)
        return (along - section.start.dot(axis)) * (along - section.end.dot(axis)) <= 81 &&
          offset.dot(up) > 0 && offset.dot(up) < 36 && Math.abs(offset.dot(axis.clone().cross(up))) < 24
      }))) continue
      return [{ rod, rocker, cam, on, initial }]
    }
    return []
  })
}

function rodLift(rod, sections, pose, axis, up) {
  return Math.min(rod.maxTravel, Math.max(rod.floor, ...sections.map(section => liftFrom(section, pose, rod.foot, axis, up, rod.floor))))
}

export function engineDrive(selected, parts, graph, gears, joints) {
  for (const engine of sliderCranks(graph, parts)) {
    const { crank, base, main, cylinders } = engine
    const axis = main.axis
    const up = cylinders[0].up
    const mainGears = gears.filter(gear => graph.byPart.get(gear.part) === crank)
      .sort((a, b) => b.teeth - a.teeth)
    const driver = mainGears[0]?.part ?? crank.ids[0]
    const cams = [...new Set(gears.map(gear => graph.byPart.get(gear.part)))].flatMap(body => {
      if (body === crank || body === base) return []
      const line = journals(body, base)
      const pins = line && parallel(line.axis, axis) && carriedPins(body, line, parts)
      return pins?.length ? [{ body, line, pins }] : []
    })
    const handle = carriedPins(crank, main, parts)
    const solved = [...cylinders.map(cylinder => cylinder.pin), ...handle.map(pin => pin.edge),
      ...cams.flatMap(cam => cam.pins.map(pin => pin.edge))]
    const original = new Set(solved.map(edge => edge.joint))
    const drive = rotationalDrive(driver, parts.keys(), joints.filter(joint => !original.has(joint)), gears,
      { start: main.start.toArray(), axis: axis.toArray() })
    if (!drive?.ok) continue
    const engagedCams = cams.filter(cam => drive.spins.has(cam.body.ids[0]))
    const valves = valveTrain(engagedCams, graph, base, parts, up, axis)
    const bodies = [...cylinders.flatMap(({ head, rod }) => [head, rod]), ...handle.map(pin => pin.member),
      ...engagedCams.flatMap(cam => cam.pins.map(pin => pin.member)), ...valves.flatMap(valve => [valve.rod.body, valve.rocker.rocker])]
    if (selected && !drive.spins.has(selected) && !bodies.includes(graph.byPart.get(selected))) continue
    const periodic = [...drive.spins.values()].every(spin => Number.isInteger(spin.ratio))
    return { ok: true, kind: 'engine', driver, periodic, exactRange: true, playback: 90, range: periodic ? [-360, 360] : [-1080, 1080],
      meshes: drive.meshes, solve(angle) {
        if (!Number.isFinite(angle)) return null
        const poses = new Map()
        const turns = new Map()
        for (const [id, spin] of drive.spins) {
          if (!turns.has(spin)) {
            const radians = spin.angleAt ? spin.angleAt(angle) : spin.ratio * angle
            turns.set(spin, turnPose(vector(spin.start), vector(spin.axis), radians))
          }
          poses.set(id, turns.get(spin))
        }
        const crankPose = poses.get(driver)
        for (const cylinder of cylinders) solvePiston(cylinder, crankPose, axis, poses)
        for (const pin of handle) assignPose(poses, pin.member, crankPose)
        for (const { body, pins } of engagedCams) {
          const camPose = poses.get(body.ids[0])
          for (const pin of pins) assignPose(poses, pin.member, camPose)
        }
        for (const { rod, rocker, cam, on, initial } of valves) {
          const rise = rodLift(rod, on, poses.get(cam.body.ids[0]), axis, up) - initial
          const travel = Math.max(rod.floor, Math.min(rod.maxTravel, rise))
          assignPose(poses, rod.body, translation(up.clone().multiplyScalar(travel)))
          rocker.solve(travel, poses)
        }
        return poses
      },
    }
  }
  return null
}
