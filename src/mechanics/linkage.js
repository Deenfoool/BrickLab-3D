import { Quaternion, Vector3 } from 'three'

const vector = value => new Vector3().fromArray(value)

export function jointBodies(ids, joints) {
  const byPart = new Map(Array.from(ids, id => [id, { ids: [id], edges: [] }]))
  for (const joint of joints) {
    if (!['fixed', 'locked'].includes(joint.motion)) continue
    const a = byPart.get(joint.a)
    const b = byPart.get(joint.b)
    if (a === b) continue
    for (const id of b.ids) {
      byPart.set(id, a)
      a.ids.push(id)
    }
  }
  const edges = []
  for (const joint of joints) {
    const a = byPart.get(joint.a)
    const b = byPart.get(joint.b)
    if (a === b) continue
    const line = joint.socketLine
    const start = vector(line.start)
    const axis = vector(line.axis)
    const same = a.edges.find(edge => edge.other(a) === b && edge.joint.motion === joint.motion &&
      Math.abs(edge.axis.dot(axis)) > .99999 && start.clone().sub(edge.start).cross(axis).length() < .02)
    if (same && joint.motion === 'continuous') continue
    const edge = { a, b, joint, start, axis, other: body => body === a ? b : a }
    a.edges.push(edge)
    b.edges.push(edge)
    edges.push(edge)
  }
  return { byPart, edges }
}

export function turnPose(start, axis, angle, destination = start) {
  const rotation = new Quaternion().setFromAxisAngle(axis, angle)
  return { rotation, translation: destination.clone().sub(start.clone().applyQuaternion(rotation)) }
}

export function movePose(part, transform) {
  return {
    ...part,
    position: vector(part.position).applyQuaternion(transform.rotation).add(transform.translation).toArray(),
    rotation: new Quaternion().fromArray(part.rotation).premultiply(transform.rotation).toArray(),
    ...(transform.scale && { previewScale: transform.scale }),
  }
}

export function mechanismPoses(parts, transforms) {
  return parts.flatMap(part => {
    const transform = transforms?.get(part.id)
    return transform ? [movePose(part, transform)] : []
  })
}

export function assignPose(transforms, body, transform) {
  for (const id of body.ids) transforms.set(id, transform)
}

const signedAngle = (a, b, axis) => Math.atan2(a.clone().cross(b).dot(axis), a.dot(b))
const planar = (point, axis) => point.clone().addScaledVector(axis, -point.dot(axis))

function planarLoop(base, crank, coupler, rocker, pinA, pinB, pinC, pinD) {
  const axis = pinA.axis
  const project = edge => planar(edge.start, axis)
  const a = project(pinA)
  const b = project(pinB)
  const c = project(pinC)
  const d = project(pinD)
  const input = b.clone().sub(a)
  const link = c.clone().sub(b)
  const output = c.clone().sub(d)
  const length = link.length()
  const radius = output.length()
  if (Math.min(input.length(), length, radius, a.distanceTo(d)) < .01) return null
  const initial = d.clone().sub(b)
  const branch = Math.sign(initial.clone().cross(link).dot(axis))
  if (!branch) return null

  return { base, crank, coupler, rocker, axis, edges: [pinA, pinB, pinC, pinD],
    solve(angle) {
      const nextB = input.clone().applyAxisAngle(axis, angle).add(a)
      const line = d.clone().sub(nextB)
      const distance = line.length()
      if (distance < .01 || distance > length + radius + 1e-6 || distance < Math.abs(length - radius) - 1e-6) return null
      const along = (length ** 2 - radius ** 2 + distance ** 2) / (2 * distance)
      const height = branch * Math.sqrt(Math.max(0, length ** 2 - along ** 2))
      line.divideScalar(distance)
      const nextC = nextB.clone().addScaledVector(line, along).addScaledVector(axis.clone().cross(line), height)
      const transforms = new Map()
      const pivotA = pinA.start
      const pivotB = pinB.start
      const pivotD = pinD.start
      assignPose(transforms, crank, turnPose(pivotA, axis, angle))
      assignPose(transforms, coupler, turnPose(pivotB, axis, signedAngle(link, nextC.clone().sub(nextB), axis),
        pivotB.clone().add(nextB.clone().sub(b))))
      assignPose(transforms, rocker, turnPose(pivotD, axis, signedAngle(output, nextC.clone().sub(d), axis)))
      return transforms
    },
  }
}

export function fourBars(graph) {
  const bodies = [...new Set(graph.byPart.values())]
  const order = new Map(bodies.map((body, i) => [body, i]))
  const seen = new Set()
  const result = []
  for (const base of bodies) {
    for (const first of base.edges) {
      if (first.joint.motion !== 'continuous') continue
      const crank = first.other(base)
      const parallel = edge => edge.joint.motion === 'continuous' && Math.abs(edge.axis.dot(first.axis)) > .99999
      const linkJoint = edge => edge.joint.motion === 'ball' || parallel(edge)
      for (const second of crank.edges) {
        if (second === first || !linkJoint(second)) continue
        const coupler = second.other(crank)
        if (coupler === base) continue
        for (const third of coupler.edges) {
          if (third === second || !linkJoint(third)) continue
          const rocker = third.other(coupler)
          if (rocker === crank || rocker === base) continue
          const fourth = rocker.edges.find(edge => parallel(edge) && edge.other(rocker) === base)
          if (!fourth) continue
          const key = [base, crank, coupler, rocker].map(body => order.get(body)).sort((a, b) => a - b).join(',')
          // A rigid, larger frame is the natural stationary reference when previewing a loop.
          if (seen.has(key) || [crank, coupler, rocker].some(body => body.ids.length > base.ids.length)) continue
          const loop = planarLoop(base, crank, coupler, rocker, first, second, third, fourth)
          if (loop) {
            result.push(loop)
            seen.add(key)
          }
        }
      }
    }
  }
  return result
}

function extendMoves(graph, transforms, anchors) {
  const queue = [...new Set([...transforms.keys()].map(id => graph.byPart.get(id)))]
  for (const body of queue) {
    const transform = transforms.get(body.ids[0])
    for (const edge of body.edges) {
      const next = edge.other(body)
      if (anchors.has(next) || transforms.has(next.ids[0]) || !['continuous', 'ball'].includes(edge.joint.motion)) continue
      assignPose(transforms, next, transform)
      queue.push(next)
    }
  }
  return transforms
}

const maxAngle = Math.PI

function solveAt(loop, sampler, target) {
  if (!target) return loop.solve(0)
  for (const sign of [1, -1]) {
    let previous = 0
    let previousSample = 0
    for (let index = 1; index <= 48; index++) {
      const angle = index * maxAngle / 48 * sign
      const pose = loop.solve(angle)
      if (!pose) break
      const sample = sampler(pose)
      if (!Number.isFinite(sample) || sample * target <= 0 || Math.abs(sample) < Math.abs(previousSample)) break
      if (Math.abs(sample) >= Math.abs(target)) {
        let low = previous
        let high = angle
        for (let step = 0; step < 20; step++) {
          const mid = (low + high) / 2
          const next = sampler(loop.solve(mid))
          if (Math.abs(next) < Math.abs(target)) low = mid
          else high = mid
        }
        return loop.solve((low + high) / 2)
      }
      previous = angle
      previousSample = sample
    }
  }
  return null
}

function rackMesh(rack, gears) {
  for (const gear of gears) {
    const axis = vector(gear.axis)
    if (Math.abs(axis.dot(rack.axis)) > 1e-4 || Math.abs(axis.dot(rack.normal)) > 1e-4 ||
        Math.abs(2 * Math.PI * gear.radius / gear.teeth - rack.pitch) > .22) continue
    const delta = vector(gear.center).sub(rack.start)
    if (Math.abs(delta.dot(axis)) >= (rack.width + gear.width) / 2 ||
        Math.abs(delta.dot(rack.axis)) >= rack.length / 2 ||
        Math.abs(delta.dot(rack.normal) - gear.radius) > .6) continue
    return { gear, along: delta.dot(rack.axis), direction: Math.sign(axis.cross(rack.normal).negate().dot(rack.axis)) }
  }
  return null
}

export function linkageDrive(selected, graph, racks, gears, rotation, rotateGear) {
  const body = graph.byPart.get(selected)
  for (const loop of fourBars(graph)) {
    const rack = racks.find(entry => graph.byPart.get(entry.part) === loop.coupler)
    const mesh = rack && rackMesh(rack, gears)
    const spin = mesh && rotation?.ok && rotation.spins.get(mesh.gear.part)
    const drivesLoop = [loop.crank, loop.rocker, loop.coupler].includes(body)
    if (!spin && !drivesLoop) continue
    const rackInput = !spin && rack && body === loop.coupler
    const reverse = mesh && !spin && rotateGear?.(mesh.gear.part)
    const drive = spin ? rotation : reverse?.ok ? reverse : null
    const rackTravel = rack && (transforms => transformedPoint(rack.start, transforms.get(rack.part)).sub(rack.start).dot(rack.axis))
    const travelPerRadian = (line, ratio) =>
      vector(line.axis).dot(vector(mesh.gear.axis)) * ratio * mesh.direction * mesh.gear.radius
    let sample
    let input = angle => angle
    if (spin || rackInput) {
      sample = rackTravel
      if (spin) input = angle => travelPerRadian(spin, spin.angleAt ? spin.angleAt(angle) : spin.ratio * angle)
    } else if (body === loop.rocker) {
      const reference = new Vector3(1, 0, 0)
      if (Math.abs(reference.dot(loop.axis)) > .9) reference.set(0, 1, 0)
      reference.copy(planar(reference, loop.axis))
      sample = transforms => signedAngle(reference, reference.clone().applyQuaternion(transforms.get(selected).rotation), loop.axis)
    }
    const span = rackInput ? rack.length / 2 : 180
    const rotationAngle = spin ? angle => angle : drive && ((angle, transforms) => {
      const driver = drive.spins.get(mesh.gear.part)
      return rackTravel(transforms) / travelPerRadian(driver, driver.ratio)
    })
    return { kind: 'linkage', rotation: drive, rotationAngle, unit: rackInput ? 'linear' : undefined, range: [-span, span],
      solve(angle) {
        const target = input(angle)
        const transforms = sample ? solveAt(loop, sample, target) : loop.solve(target)
        if (!transforms || (mesh && Math.abs(mesh.along - rackTravel(transforms)) >= rack.length / 2)) return null
        extendMoves(graph, transforms, new Set([loop.base, ...(drive ? [...drive.spins.keys()].map(id => graph.byPart.get(id)) : [])]))
        return preservesJoints(graph, transforms) ? transforms : null
      },
    }
  }
  return null
}

const identity = () => ({ rotation: new Quaternion(), translation: new Vector3() })
const transformedPoint = (point, transform) => transform
  ? point.clone().applyQuaternion(transform.rotation).add(transform.translation) : point.clone()

function damperTransforms(edge, coil, transforms) {
  const { joint } = edge
  const initialRod = vector(joint.shaftLine.start)
  const initialCylinder = vector(joint.socketLine.start)
  const rod = transformedPoint(initialRod, transforms.get(edge.a.ids[0]))
  const cylinder = transformedPoint(initialCylinder, transforms.get(edge.b.ids[0]))
  const before = initialRod.clone().sub(initialCylinder)
  const after = rod.clone().sub(cylinder)
  const separation = after.length()
  const [min, max] = joint.stroke
  if (separation < min - 1e-6 || separation > max + 1e-6) return false
  const rotation = new Quaternion().setFromUnitVectors(before.normalize(), after.normalize())
  const poseFrom = (start, end) => ({ rotation, translation: end.clone().sub(start.clone().applyQuaternion(rotation)) })
  assignPose(transforms, edge.a, poseFrom(initialRod, rod))
  assignPose(transforms, edge.b, poseFrom(initialCylinder, cylinder))
  if (coil) {
    const start = coil.start
    const initialLength = vector(joint.springSeat).sub(start).dot(before)
    const length = initialLength + separation - initialRod.distanceTo(initialCylinder)
    const meshLength = coil.joint.restLength ?? initialLength
    if (meshLength < .01 || length < .01) return false
    const next = transformedPoint(start, transforms.get(edge.b.ids[0]))
    assignPose(transforms, coil.other(edge.b), { ...poseFrom(start, next), scale: [1, length / meshLength, 1] })
  }
  return true
}

function preservesJoints(graph, transforms) {
  for (const edge of graph.edges) {
    const a = transforms.get(edge.a.ids[0])
    const b = transforms.get(edge.b.ids[0])
    if (a === b) continue
    const pointA = transformedPoint(edge.start, a)
    const pointB = transformedPoint(edge.start, b)
    const movedAxis = transform => transform ? edge.axis.clone().applyQuaternion(transform.rotation) : edge.axis
    if (edge.joint.motion === 'slider') {
      const male = transformedPoint(vector(edge.joint.shaftLine.start), a)
      const offset = male.sub(pointB)
      const axis = movedAxis(b)
      const amount = offset.dot(axis)
      if (offset.cross(axis).length() > .02 || amount < edge.joint.stroke[0] - .02 || amount > edge.joint.stroke[1] + .02 ||
          movedAxis(a).dot(axis) < .99999) return false
    } else if (edge.joint.motion === 'spring') {
      if (pointA.distanceTo(pointB) > .02) return false
    } else if (edge.joint.motion === 'ball') {
      if (pointA.distanceTo(pointB) > .02) return false
    } else if (edge.joint.motion === 'continuous') {
      const axis = movedAxis(a)
      if (Math.abs(axis.dot(movedAxis(b))) < .99999 || pointA.clone().sub(pointB).length() > .02) return false
    } else {
      return false
    }
  }
  return true
}

const angularJoint = edge => ['continuous', 'ball'].includes(edge.joint.motion)

function damperMount(body, damper) {
  const edge = body.edges.find(angularJoint)
  if (!edge) return null
  const pin = edge.other(body)
  const support = pin.edges.find(next => next !== edge && angularJoint(next) &&
    Math.abs(next.axis.dot(edge.axis)) > .99999 && next.start.clone().sub(edge.start).cross(edge.axis).length() < .02)
  return { body: support ? support.other(pin) : pin, pin: support ? pin : null, damper }
}

export function suspensionDrive(selected, graph) {
  const driver = graph.byPart.get(selected)
  const dampers = graph.edges.filter(edge => edge.joint.motion === 'slider')
  let best
  for (const damper of dampers) {
    const coil = damper.b.edges.find(edge => edge.joint.motion === 'spring')
    const rod = damperMount(damper.a, damper)
    const cylinder = damperMount(damper.b, damper)
    const internal = [damper.a, damper.b, coil?.other(damper.b)]
    const inside = internal.includes(driver)
    if (!rod && !cylinder && inside) {
      const { joint } = damper
      const original = damper.start.distanceTo(vector(joint.shaftLine.start))
      return { kind: 'suspension', unit: 'linear', exactRange: true, range: [joint.stroke[0] - original, joint.stroke[1] - original],
        solve(distance) {
          const transforms = new Map()
          assignPose(transforms, damper.a, { ...identity(), translation: damper.axis.clone().multiplyScalar(distance) })
          return damperTransforms(damper, coil, transforms) ? transforms : null
        },
      }
    }
    if (!rod || !cylinder || rod.body === cylinder.body) continue
    const sides = [cylinder, rod]
    for (let index = 0; index < sides.length; index++) {
      const movingMount = sides[index]
      const fixedMount = sides[1 - index]
      if (!inside && driver !== movingMount.body) continue
      for (const pivot of movingMount.body.edges) {
        if (pivot.joint.motion !== 'continuous') continue
        const base = pivot.other(movingMount.body)
        const mountBody = movingMount === rod ? damper.a : damper.b
        const mountPoint = vector(movingMount === rod ? damper.joint.shaftLine.start : damper.joint.socketLine.start)
        if (internal.includes(base) || base === movingMount.pin || mountPoint.clone().sub(pivot.start).cross(pivot.axis).length() < 1) continue
        const mountedAxis = mountBody.edges.find(angularJoint).axis
        if (Math.abs(mountedAxis.dot(pivot.axis)) < .99999) continue
        const stationary = new Set([base, fixedMount.body, fixedMount.pin, ...internal])
        const solve = angle => {
          const transforms = new Map()
          const swing = turnPose(pivot.start, pivot.axis, angle)
          assignPose(transforms, movingMount.body, swing)
          if (movingMount.pin) assignPose(transforms, movingMount.pin, swing)
          extendMoves(graph, transforms, stationary)
          const before = transformedPoint(mountPoint, transforms.get(movingMount.body.ids[0]))
          const move = { ...identity(), translation: before.sub(mountPoint) }
          assignPose(transforms, mountBody, move)
          for (const other of dampers) {
            if (other === damper) continue
            const otherCoil = other.b.edges.find(edge => edge.joint.motion === 'spring')
            for (const body of [other.a, other.b]) {
              const mount = damperMount(body, other)
              const support = mount && transforms.get(mount.body.ids[0])
              if (support) assignPose(transforms, body, support)
            }
            if ((transforms.has(other.a.ids[0]) || transforms.has(other.b.ids[0])) &&
                !damperTransforms(other, otherCoil, transforms)) return null
          }
          return damperTransforms(damper, coil, transforms) && preservesJoints(graph, transforms) ? transforms : null
        }
        const sample = solve(.025) ?? solve(-.025)
        if (!sample || (best && best.size <= sample.size)) continue
        best = { kind: 'suspension', range: [-90, 90], solve, size: sample.size }
      }
    }
  }
  return best ?? null
}

export function articulationDrive(selected, graph, sphericalOnly = false) {
  const driver = graph.byPart.get(selected)
  for (const edge of driver.edges) {
    if (!angularJoint(edge) || (sphericalOnly && edge.joint.motion !== 'ball')) continue
    const fixed = edge.other(driver)
    const rotating = new Set([driver])
    const bodies = [driver]
    for (const body of bodies) {
      for (const link of body.edges) {
        const next = link.other(body)
        if (link === edge || rotating.has(next)) continue
        rotating.add(next)
        bodies.push(next)
      }
    }
    if (rotating.has(fixed)) continue
    const spherical = edge.joint.motion === 'ball'
    const axes = spherical ? [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)] : [edge.axis]
    return { kind: 'articulation', range: [-180, 180], exactRange: true, spherical,
      solve(angle, selectedAxis = 1) {
        const axis = axes[spherical ? selectedAxis : 0]
        const transforms = new Map()
        const transform = turnPose(edge.start, axis, angle)
        for (const body of bodies) assignPose(transforms, body, transform)
        return transforms
      },
    }
  }
  return null
}

// Limit preview to the connected interval around the assembled pose.
export function motionRange(motion) {
  if (motion.exactRange || !motion.solve) return motion.range
  const units = motion.unit === 'linear' ? 1 : Math.PI / 180
  return motion.range.map(limit => {
    let valid = 0
    let blocked
    for (let step = 1; step <= 16; step++) {
      const candidate = limit * step / 16
      if (!motion.solve(candidate * units)) {
        blocked = candidate
        break
      }
      valid = candidate
    }
    if (blocked === undefined) return limit
    for (let step = 0; step < 12; step++) {
      const mid = (valid + blocked) / 2
      if (motion.solve(mid * units)) valid = mid
      else blocked = mid
    }
    return Math.trunc(valid * 10) / 10
  })
}
