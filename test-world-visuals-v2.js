import * as THREE from 'three'
import { PhysicsSession } from './physics.js'

function addBox(root, size, position, color, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .03 }))
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh
}

function finishGate(root, z, width = 7, y = 0) {
  const color = 0x74e6a6
  addBox(root, [.11, 2.6, .11], [-width / 2, y + 1.3, z], color)
  addBox(root, [.11, 2.6, .11], [width / 2, y + 1.3, z], color)
  addBox(root, [width + .1, .11, .11], [0, y + 2.55, z], color)
}

const oldBuild = PhysicsSession.prototype.build
PhysicsSession.prototype.build = function buildWithTestVisuals(...args) {
  const result = oldBuild.apply(this, args)
  const root = this.scenarioVisualRoot
  if (!root || root.userData.physicsV2Decorated) return result
  root.userData.physicsV2Decorated = true
  if (this.scenario === 'hill-climb') {
    const angle = THREE.MathUtils.degToRad(22), length = 18, finishZ = this.scenarioData?.finishZStud ?? 18
    const finishY = Math.sin(angle) * length * .9 + .5
    finishGate(root, finishZ, 7.4, finishY)
    for (let z = 4; z < finishZ; z += 2) addBox(root, [6.4, .025, .045], [0, .025 + Math.tan(angle) * (z - 3), z], 0x667078, [-angle, 0, 0])
  } else if (this.scenario === 'obstacle-course') {
    for (const x of [-3.4, 3.4]) addBox(root, [.05, .025, 18], [x, .015, 11], 0x74e6a6)
    finishGate(root, 20, 6.8, 0)
  } else if (this.scenario === 'torque-pull') {
    addBox(root, [2.2, 1.2, 1.8], [0, .6, -5], 0x555e67)
    addBox(root, [.08, .08, 4.2], [0, .65, -2.5], 0xffb65c)
    for (let z = 2; z <= 14; z += 2) addBox(root, [4.5, .025, .08], [0, .015, z], 0xffb65c)
  } else if (this.scenario === 'dyno-bench') {
    const steel = 0x59636c, accent = 0x69a9ff
    addBox(root, [5.8, .18, 4.8], [0, .09, 1.5], steel)
    for (const x of [-1.6, 1.6]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, 2.0, 28), new THREE.MeshStandardMaterial({ color: 0x2f353a, roughness: .55, metalness: .32 }))
      roller.rotation.z = Math.PI / 2; roller.position.set(x, .48, 1.4); roller.castShadow = roller.receiveShadow = true; root.add(roller)
    }
    addBox(root, [4.8, .08, .08], [0, 2.5, 4], accent)
    addBox(root, [.08, 2.5, .08], [-2.35, 1.25, 4], accent)
    addBox(root, [.08, 2.5, .08], [2.35, 1.25, 4], accent)
  }
  return result
}
