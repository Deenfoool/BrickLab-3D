import * as THREE from 'three'
import { PhysicsSession } from './physics.js'

function quaternion(value) {
  return { x: value.x, y: value.y, z: value.z, w: value.w }
}

function sceneFor(session) {
  return session.objects[0]?.parent?.parent ?? null
}

function addBox(session, root, spec) {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(spec.rx ?? 0, spec.ry ?? 0, spec.rz ?? 0))
  const collider = session.RAPIER.ColliderDesc.cuboid(spec.w / 2, spec.h / 2, spec.d / 2)
    .setTranslation(spec.x ?? 0, spec.y, spec.z)
    .setRotation(quaternion(rotation))
    .setFriction(spec.friction ?? 1.25)
    .setRestitution(0)
  session.world.createCollider(collider)

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(spec.w, spec.h, spec.d),
    new THREE.MeshStandardMaterial({ color: spec.color ?? 0x555e67, roughness: 0.92 }),
  )
  mesh.position.set(spec.x ?? 0, spec.y, spec.z)
  mesh.quaternion.copy(rotation)
  mesh.receiveShadow = true
  mesh.castShadow = true
  root.add(mesh)
}

const previousBuildScenario = PhysicsSession.prototype.buildScenario
PhysicsSession.prototype.buildScenario = function buildObstacleScenario() {
  if (this.scenario !== 'obstacle-course') return previousBuildScenario.call(this)

  const finishZ = 20
  this.scenarioData = {
    name: 'Obstacle Course',
    startZ: 0,
    finishZ,
    length: finishZ,
  }

  const scene = sceneFor(this)
  if (!scene?.add) return
  const root = new THREE.Group()
  root.name = 'BrickLab Obstacle Course'

  // Entry threshold.
  addBox(this, root, { w: 6.5, h: 0.34, d: 0.8, y: 0.17, z: 4.2, color: 0x59636c })

  // Staggered wheel articulation blocks.
  addBox(this, root, { w: 2.3, h: 0.65, d: 2.1, x: -1.8, y: 0.325, z: 7.3, color: 0x4c555d })
  addBox(this, root, { w: 2.3, h: 0.65, d: 2.1, x: 1.8, y: 0.325, z: 9.5, color: 0x4c555d })

  // Cross-axle bump to test approach angle and suspension travel.
  addBox(this, root, { w: 6.8, h: 0.72, d: 0.72, y: 0.36, z: 12.3, color: 0x646e77 })

  // Short bridge made from two shallow ramps.
  const rampAngle = THREE.MathUtils.degToRad(12)
  addBox(this, root, { w: 6.2, h: 0.28, d: 2.8, y: 0.42, z: 15.1, rx: -rampAngle, color: 0x515b64 })
  addBox(this, root, { w: 6.2, h: 0.28, d: 2.8, y: 0.42, z: 17.3, rx: rampAngle, color: 0x515b64 })

  // Lane guides and finish gate.
  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0x74e6a6, roughness: 0.65 })
  for (const x of [-3.4, 3.4]) {
    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 18), lineMaterial)
    guide.position.set(x, 0.015, 11)
    root.add(guide)

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), lineMaterial)
    post.position.set(x, 1.2, finishZ)
    root.add(post)
  }
  const finishBar = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.12, 0.12), lineMaterial)
  finishBar.position.set(0, 2.35, finishZ)
  root.add(finishBar)

  scene.add(root)
  this.scenarioVisualRoot = root
}
