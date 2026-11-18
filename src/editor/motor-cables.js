import { CubicBezierCurve3, Group, Mesh, MeshStandardMaterial, Quaternion, TubeGeometry, Vector3 } from 'three'
import { portsFor } from '../mechanics/catalog.js?v=gear-selector'
import { controlPlusBodies, controlPlusHubs, motorSettings } from '../mechanics/motors.js'

export function createMotorCables(parent, poseOf) {
  const group = new Group()
  const material = new MeshStandardMaterial({ color: '#202125', roughness: .85 })
  const cables = new Map()
  let parts = []
  parent.add(group)
  const world = (pose, point) => new Vector3().fromArray(point)
    .applyQuaternion(new Quaternion().fromArray(pose.rotation)).add(new Vector3().fromArray(pose.position))
  function remove(id) {
    const cable = cables.get(id)
    group.remove(cable.mesh)
    cable.mesh.geometry.dispose()
    cables.delete(id)
  }
  function update() {
    const retained = new Set()
    for (const motor of parts.filter(part => controlPlusBodies.has(part.design))) {
      const settings = motorSettings(motor)
      const hub = parts.find(part => part.id === settings.hubId && controlPlusHubs.has(part.design))
      const motorPose = poseOf(motor.id)
      const hubPose = hub && poseOf(hub.id)
      const port = hub && portsFor(hub.design).filter(port => port.role === 'receptacle' && port.group === 'pwrFnc2Plg')[settings.port]
      if (!port || !motorPose || !hubPose) continue
      retained.add(motor.id)
      const start = world(motorPose, [0, 0, 140])
      const end = world(hubPose, port.start)
      const previous = cables.get(motor.id)
      const motorAxis = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().fromArray(motorPose.rotation))
      const hubAxis = new Vector3().fromArray(port.axis).applyQuaternion(new Quaternion().fromArray(hubPose.rotation))
      const reach = Math.max(24, Math.min(100, start.distanceTo(end) * .3))
      const controlA = start.clone().addScaledVector(motorAxis, reach)
      const controlB = end.clone().addScaledVector(hubAxis, reach)
      const key = [...start, ...end, ...controlA, ...controlB].join(',')
      if (previous?.key === key) continue
      if (previous) remove(motor.id)
      const curve = new CubicBezierCurve3(start, controlA, controlB, end)
      const mesh = new Mesh(new TubeGeometry(curve, 32, 1.4, 6, false), material)
      group.add(mesh)
      cables.set(motor.id, { mesh, key })
    }
    for (const id of cables.keys()) if (!retained.has(id)) remove(id)
  }
  return {
    set(next) { parts = next; update() },
    update,
    dispose() {
      for (const id of cables.keys()) remove(id)
      material.dispose()
      parent.remove(group)
    },
  }
}
