import { CatmullRomCurve3, CubicBezierCurve3, Group, Mesh, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=gear-selector'
import { joinedPose } from './placement.js'
import { loadPartModel, parts as catalog, partMesh } from './parts.js?v=catalog-page'
import { compatibleSupply, controlPlusBodies, motorSettings } from '../mechanics/motors.js'

export function createMotorCables(parent, poseOf, invalidate = () => {}) {
  const group = new Group()
  const material = new MeshStandardMaterial({ color: '#202125', roughness: .85 })
  const cables = new Map()
  const plugs = new Map()
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
      const port = hub && portsFor(hub.design).filter(port => port.role === 'receptacle' && port.group === (motor.design === '10089c01' ? 'pfc' : 'pwrFnc2Plg'))[settings.port]
      if (!port || !motorPose || !hubPose) continue
      retained.add(motor.id)
      const pf = motor.design === '10089c01'
      const start = world(motorPose, [0, 0, pf ? 130 : 140])
      const end = world(hubPose, port.start)
      const previous = cables.get(motor.id)
      const motorAxis = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(motorPose.rotation))
      const hubAxis = new Vector3().fromArray(port.axis).applyQuaternion(new Quaternion().fromArray(hubPose.rotation))
      const reach = Math.max(24, Math.min(100, start.distanceTo(end) * .3))
      const controlA = start.clone().addScaledVector(motorAxis, reach)
      const controlB = end.clone().addScaledVector(hubAxis, reach)
      const bend = motor.electric?.bend
      const key = [hub.design, settings.port, ...(Array.isArray(bend) ? bend : []), ...hubPose.rotation, ...start, ...end, ...controlA, ...controlB].join(',')
      if (previous?.key === key) continue
      if (previous) remove(motor.id)
      const guide = new CubicBezierCurve3(start, controlA, controlB, end)
      const offset = Array.isArray(bend) && bend.length === 3 && bend.every(Number.isFinite) ? new Vector3(...bend) : new Vector3()
      const curve = offset.lengthSq() ? new CatmullRomCurve3([start, guide.getPoint(.15),
        guide.getPoint(.5).add(offset.applyQuaternion(new Quaternion().fromArray(motorPose.rotation))), guide.getPoint(.85), end]) : guide
      // Ribbon spacing follows the four-conductor u9190 LDraw cable profile.
      const frames = curve.computeFrenetFrames(32, false)
      const count = pf ? 4 : 6
      let mesh
      for (let strand = 0; strand < count; strand++) {
        const lane = (strand - (count - 1) / 2) * (pf ? 2.475 : 1.7)
        const points = frames.normals.map((normal, i) => curve.getPointAt(i / 32).addScaledVector(normal, lane))
        const wire = new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 32, pf ? 1.75 : 1.2, 8, false), material)
        wire.userData.strand = true
        if (mesh) mesh.add(wire)
        else mesh = wire
      }
      const design = pf ? '58124c01' : '23816a'
      if (!plugs.has(design)) plugs.set(design, loadPartModel(catalog[design]).catch(() => { plugs.delete(design); return null }))
      const plugPose = joinedPose({ position: [0,0,0], rotation: [0,0,0,1] },
        portsFor(design).find(port => port.role === 'plug'), hubPose, port,
        { offset: 0, direction: 1, roll: 0, keyStep: 2 * Math.PI })
      plugs.get(design).then(model => {
        if (!model || cables.get(motor.id)?.mesh !== mesh) return
        const plug = partMesh(model, pf ? '#61625f' : '#bbc0bf')
        plug.position.fromArray(plugPose.position)
        plug.quaternion.fromArray(plugPose.rotation)
        mesh.add(plug)
        invalidate()
      })
      group.add(mesh)
      cables.set(motor.id, { mesh, key })
    }
    for (const id of cables.keys()) if (!retained.has(id)) remove(id)
  }
  return {
    visible(value) { group.visible = value },
    set(next) { parts = next; update() },
    update,
    dispose() {
      for (const id of cables.keys()) remove(id)
      material.dispose()
      parent.remove(group)
    },
  }
}
