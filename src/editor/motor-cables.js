import { CatmullRomCurve3, CubicBezierCurve3, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=gear-selector'
import { joinedPose } from './placement.js'
import { loadPartModel, parts as catalog, partMesh } from './parts.js?v=system-family'
import { isPfSupply, compatibleSupply, controlPlusBodies, motorSettings } from '../mechanics/motors.js'

export function createMotorCables(parent, poseOf, invalidate = () => {}) {
  const group = new Group()
  const material = new MeshStandardMaterial({ color: '#202125', roughness: .85 })
  const highlight = new MeshStandardMaterial({ color: 0xffad34 })
  const markerGeometry = new SphereGeometry(3, 12, 8)
  const markerMaterial = new MeshStandardMaterial({ color: 0x52dafa })
  const cables = new Map()
  const plugs = new Map()
  let selected
  let draft
  let parts = []
  parent.add(group)
  const world = (pose, point) => new Vector3().fromArray(point)
    .applyQuaternion(new Quaternion().fromArray(pose.rotation)).add(new Vector3().fromArray(pose.position))
  function remove(id) {
    const cable = cables.get(id)
    group.remove(cable.mesh)
    cable.mesh.traverse(child => {
      if (child.userData.strand) child.geometry.dispose()
      child.userData.finish?.dispose()
    })
    cables.delete(id)
  }
  function update() {
    const retained = new Set()
    for (const motor of parts.filter(part => controlPlusBodies.has(part.design))) {
      const settings = motorSettings(motor)
      const hub = parts.find(part => part.id === settings.hubId && compatibleSupply(motor.design, part.design))
      const motorPose = poseOf(motor.id)
      const hubPose = hub && poseOf(hub.id)
      const port = hub && portsFor(hub.design).filter(port => port.role === 'receptacle' && port.group === (isPfSupply(hub.design) ? 'pfc' : 'pwrFnc2Plg'))[settings.port]
      if (!port || !motorPose || !hubPose) continue
      retained.add(motor.id)
      const pf = motor.design === '10089c01'
      const start = world(motorPose, [0, 0, pf ? 130 : 140])
      const design = isPfSupply(hub.design) ? '58124c01' : '23816a'
      const plugPose = joinedPose({ position: [0,0,0], rotation: [0,0,0,1] },
        portsFor(design).find(port => port.role === 'plug'), hubPose, port,
        { offset: 0, direction: 1, roll: 0, keyStep: 2 * Math.PI })
      const pfPlug = isPfSupply(hub.design)
      const end = world(plugPose, pfPlug ? [30, 7, 0] : [0, 0, -20])
      const previous = cables.get(motor.id)
      const motorAxis = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(motorPose.rotation))
      const plugAxis = new Vector3(...(pfPlug ? [1, 0, 0] : [0, 0, -1])).applyQuaternion(new Quaternion().fromArray(plugPose.rotation))
      const reach = Math.min(24, start.distanceTo(end) * .22)
      const controlA = start.clone().addScaledVector(motorAxis, reach)
      const controlB = end.clone().addScaledVector(plugAxis, reach)
      const guide = new CubicBezierCurve3(start, controlA, controlB, end)
      const local = point => point.clone().sub(new Vector3(...motorPose.position))
        .applyQuaternion(new Quaternion(...motorPose.rotation).invert()).toArray()
      const valid = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)
      const legacy = motor.electric?.bend
      const stored = draft?.id === motor.id ? draft.points : motor.electric?.route
      const points = Array.isArray(stored) ? stored.filter(valid) : valid(legacy) && legacy.some(Boolean)
        ? [local(guide.getPoint(.5)).map((v, i) => v + legacy[i])] : []
      const key = JSON.stringify([selected === motor.id, hub.design, settings.port, points, plugPose, motorPose])
      if (previous?.key === key) continue
      if (previous) remove(motor.id)
      const curve = new CatmullRomCurve3([start, controlA, ...points.map(p => world(motorPose, p)), controlB, end])
      // Ribbon spacing follows the four-conductor u9190 LDraw cable profile.
      const frames = curve.computeFrenetFrames(32, false)
      const count = pf ? 4 : 6
      let mesh
      for (let strand = 0; strand < count; strand++) {
        const lane = (strand - (count - 1) / 2) * (pf ? 2.475 : 1.7)
        const points = frames.normals.map((normal, i) => curve.getPointAt(i / 32).addScaledVector(normal, lane))
        const wire = new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 32, pf ? 1.75 : 1.2, 8, false), selected === motor.id ? highlight : material)
        wire.userData.strand = true
        if (mesh) mesh.add(wire)
        else mesh = wire
      }
      if (!plugs.has(design)) plugs.set(design, loadPartModel(catalog[design]).catch(() => { plugs.delete(design); return null }))
      plugs.get(design).then(model => {
        if (!model || cables.get(motor.id)?.mesh !== mesh) return
        const plug = partMesh(model, isPfSupply(hub.design) ? '#61625f' : '#bbc0bf')
        plug.position.fromArray(plugPose.position)
        plug.quaternion.fromArray(plugPose.rotation)
        mesh.add(plug)
        invalidate()
      })
      if (selected === motor.id) for (const p of points) {
        const marker = new Mesh(markerGeometry, markerMaterial)
        marker.position.copy(world(motorPose, p))
        mesh.add(marker)
      }
      group.add(mesh)
      cables.set(motor.id, { mesh, key, curve, points, local, motorPose })
    }
    for (const id of cables.keys()) if (!retained.has(id)) remove(id)
  }
  return {
    ids() { return [...cables.keys()] },
    get(id) { return cables.get(id) },
    select(id) { selected = id; draft = undefined; update(); invalidate() },
    preview(id, points) { draft = { id, points }; update(); invalidate() },
    visible(value) { group.visible = value },
    set(next) { parts = next; update() },
    update,
    dispose() {
      for (const id of cables.keys()) remove(id)
      markerGeometry.dispose()
      markerMaterial.dispose()
      highlight.dispose()
      material.dispose()
      parent.remove(group)
    },
  }
}
