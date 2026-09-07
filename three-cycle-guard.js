import * as THREE from 'three'

const marker = Symbol.for('bricklab.threeCycleGuard.v1')

if (!THREE.Object3D.prototype[marker]) {
  const originalCopy = THREE.Object3D.prototype.copy
  const originalToJSON = THREE.Object3D.prototype.toJSON

  function withoutInstanceRoot(root, callback) {
    const saved = []
    const stack = [root]

    while (stack.length) {
      const object = stack.pop()
      if (!object) continue

      if (object.userData && Object.prototype.hasOwnProperty.call(object.userData, 'instanceRoot')) {
        saved.push([object, object.userData.instanceRoot])
        delete object.userData.instanceRoot
      }

      if (object.children?.length) {
        for (const child of object.children) stack.push(child)
      }
    }

    try {
      return callback()
    } finally {
      for (const [object, instanceRoot] of saved) {
        object.userData.instanceRoot = instanceRoot
      }
    }
  }

  THREE.Object3D.prototype.copy = function bricklabSafeCopy(source, recursive = true) {
    return withoutInstanceRoot(source, () => originalCopy.call(this, source, recursive))
  }

  THREE.Object3D.prototype.toJSON = function bricklabSafeToJSON(meta) {
    return withoutInstanceRoot(this, () => originalToJSON.call(this, meta))
  }

  Object.defineProperty(THREE.Object3D.prototype, marker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })

  console.info('[BrickLab] Three.js cyclic userData guard enabled')
}
