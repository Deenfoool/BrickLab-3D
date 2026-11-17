import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { beltLayout, beltPath, grooveOf } from '../mechanics/belts.js?v=belt-drive'

function meshGeometry(layout, path) {
  const positions = []
  const triangles = []
  for (const { point, outward } of path) {
    for (const [radial, axial] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...point.clone().addScaledVector(outward, radial * layout.halfDepth)
        .addScaledVector(layout.normal, axial * layout.halfWidth).toArray())
    }
  }
  for (let i = 0; i < path.length; i++) {
    const next = (i + 1) % path.length
    for (let j = 0; j < 4; j++) {
      const end = (j + 1) % 4
      triangles.push(i * 4 + j, next * 4 + j, i * 4 + end, i * 4 + end, next * 4 + j, next * 4 + end)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(triangles)
  geometry.computeVertexNormals()
  return geometry
}

function beltObject(color, material, markerGeometry, markerMaterial) {
  const mesh = new Mesh(new BufferGeometry(), material.clone())
  mesh.material.color.set(/^#[0-9a-f]{6}$/i.test(color ?? '') ? color : '#252b33')
  const marker = new Mesh(markerGeometry, markerMaterial)
  marker.visible = false
  const group = new Group()
  group.add(mesh, marker)
  let previous
  let path = []
  let distances = []
  let travel = 0

  function showTravel(value) {
    travel = value
    marker.visible = Boolean(value && previous)
    if (!marker.visible) return
    const length = distances.at(-1)
    const at = ((travel % length) + length) % length
    const i = distances.findIndex(distance => distance > at) - 1
    const next = (i + 1) % path.length
    const alpha = (at - distances[i]) / (distances[i + 1] - distances[i])
    marker.position.copy(path[i].point).lerp(path[next].point, alpha)
    marker.position.addScaledVector(path[i].outward.clone().lerp(path[next].outward, alpha), previous.halfDepth)
  }

  return { group, showTravel,
    update(layout) {
      group.visible = Boolean(layout?.ok)
      if (!group.visible) {
        previous = null
        return
      }
      if (previous && layout.centerA.distanceToSquared(previous.centerA) < 1e-8 &&
          layout.centerB.distanceToSquared(previous.centerB) < 1e-8 && layout.normal.dot(previous.normal) > .99999999) return
      previous = layout
      path = beltPath(layout)
      distances = [0]
      for (let i = 0; i < path.length; i++) {
        distances.push(distances.at(-1) + path[i].point.distanceTo(path[(i + 1) % path.length].point))
      }
      mesh.geometry.dispose()
      mesh.geometry = meshGeometry(layout, path)
      showTravel(travel)
    },
    dispose() {
      group.removeFromParent()
      mesh.geometry.dispose()
      mesh.material.dispose()
    },
  }
}

export function createBeltScene(host, poseOf, invalidate) {
  const material = new MeshStandardMaterial({ roughness: .84, side: DoubleSide })
  const markerGeometry = new SphereGeometry(1, 8, 6)
  const markerMaterial = new MeshStandardMaterial({ color: '#9f9b8e', roughness: .85 })
  const objects = new Map()
  const preview = beltObject('#ffb01b', material, markerGeometry, markerMaterial)
  preview.update(null)
  host.add(preview.group)

  function update() {
    for (const { record, object } of objects.values()) {
      const a = grooveOf(poseOf(record.a.part), record.a.groove)
      const b = grooveOf(poseOf(record.b.part), record.b.groove)
      object.update(beltLayout(a, b))
    }
  }

  return { update,
    set(records) {
      const keep = new Set(records.map(record => record.id))
      for (const [id, entry] of objects) {
        if (keep.has(id)) continue
        entry.object.dispose()
        objects.delete(id)
      }
      for (const record of records) {
        if (objects.has(record.id)) continue
        const object = beltObject(record.color, material, markerGeometry, markerMaterial)
        objects.set(record.id, { record, object })
        host.add(object.group)
      }
      update()
      invalidate()
    },
    preview(layout) {
      preview.update(layout)
      invalidate()
    },
    travel(distances) {
      for (const [id, { object }] of objects) object.showTravel(distances.get(id) ?? 0)
      invalidate()
    },
    dispose() {
      for (const { object } of objects.values()) object.dispose()
      preview.dispose()
      material.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
    },
  }
}
