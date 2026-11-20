import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, RingGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const palette = {
  orange: '#e78721', stripe: '#fbecbf', black: '#1d252d', tire: '#23252a',
  hub: '#9ba8b4', glass: '#324c61', lamp: '#fff3d0', red: '#b63325',
}

export function createStartupPickup() {
  const pickup = new Group()
  const parts = new Map()
  const materials = new Map()
  const pivot = new Map()
  function add(section, color, geometry) {
    if (!parts.has(section)) parts.set(section, new Map())
    const finishes = parts.get(section)
    if (!finishes.has(color)) finishes.set(color, [])
    finishes.get(color).push(geometry)
  }
  function brick(section, color, x, y, z, w, h, d, columns = 0, rows = 0) {
    add(section, color, new BoxGeometry(w, h, d).translate(x, y, z))
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const cx = x + w * ((column + .5) / columns - .5)
        const cz = z + d * ((row + .5) / rows - .5)
        add(section, color, new CylinderGeometry(.071, .077, .053, 10).translate(cx, y + h / 2 + .026, cz))
      }
    }
  }
  function windshield(side, z, angle) {
    const glass = new BoxGeometry(1.32, .55, .067)
    glass.rotateX(angle).translate(0, 1.36, z)
    add(side, 'glass', glass)
    for (const x of [-.73, .73]) {
      add(side, 'orange', new BoxGeometry(.13, .62, .14).rotateX(angle).translate(x, 1.34, z))
    }
  }

  brick('chassis', 'black', 0, .55, 0, 1.63, .28, 4.28, 7, 16)
  brick('chassis', 'black', 0, .39, 0, .96, .16, 3.37)
  brick('bumper', 'hub', 0, .58, 2.18, 1.88, .17, .25, 7, 1)
  brick('rear-axle', 'hub', 0, .57, -2.18, 1.88, .17, .25)
  brick('bonnet', 'black', 0, .91, 1.69, 1.22, .27, 1.08)
  brick('bonnet', 'orange', 0, 1.10, 1.43, 1.65, .17, 1.27, 6, 5)
  brick('bonnet', 'stripe', 0, 1.19, 1.43, .39, .06, 1.19, 1, 5)
  brick('rear-body', 'black', 0, .81, -1.45, 1.61, .21, 1.43, 6, 6)
  brick('rear-body', 'orange', 0, .94, -2.04, 1.71, .28, .23, 7, 1)
  brick('seats', 'black', 0, 1.03, .06, 1.36, .24, 1.27, 5, 5)
  windshield('window-front', .72, -.38)
  windshield('window-rear', -.63, .25)
  brick('roof', 'orange', 0, 1.64, .03, 1.56, .17, 1.22, 6, 5)
  brick('roof', 'stripe', 0, 1.74, .03, .49, .074, 1.08, 2, 4)
  brick('roof', 'black', 0, 1.80, .47, .98, .10, .18)
  for (const x of [-.35, -.12, .12, .35]) brick('roof', 'lamp', x, 1.82, .571, .17, .11, .066)

  for (const sign of [-1, 1]) {
    const side = sign > 0 ? 'left' : 'right'
    const door = 'door-' + side
    const flank = 'side-' + side
    brick(door, 'orange', sign * .83, .92, -.02, .19, .46, 1.0, 1, 4)
    brick(door, 'stripe', sign * .934, 1.0, 0, .035, .12, .94)
    brick(door, 'black', sign * .946, 1.11, -.29, .075, .069, .19)
    brick(flank, 'orange', sign * .84, 1.0, -1.4, .20, .29, 1.38, 1, 6)
    brick(flank, 'black', sign * .89, 1.052, 1.43, .30, .16, 1.10, 1, 4)
    brick(flank, 'black', sign * .91, 1.15, -1.39, .29, .10, 1.39, 1, 5)
    brick('bonnet', 'lamp', sign * .64, .94, 2.07, .29, .18, .12)
    brick('rear-body', 'red', sign * .70, .91, -2.18, .18, .14, .10)
    for (const [end, z] of [['front', 1.42], ['rear', -1.46]]) {
      const wheel = 'wheel-' + end + '-' + side
      const rim = wheel + '-rim'
      const x = sign * .97
      const y = .52
      pivot.set(wheel, [x, y, z])
      pivot.set(rim, [x, y, z])
      brick('suspension-' + end + '-' + side, 'hub', sign * .52, .56, z, .84, .17, .18)
      add(wheel, 'tire', new CylinderGeometry(.498, .498, .34, 32, 1, true).rotateZ(Math.PI / 2).translate(x, y, z))
      for (const edge of [-1, 1]) {
        add(wheel, 'tire', new RingGeometry(.25, .498, 32).rotateY(edge * Math.PI / 2)
          .translate(x + edge * .169, y, z))
      }
      for (let step = 0; step < 20; step++) {
        const angle = step * Math.PI / 10
        add(wheel, 'tire', new BoxGeometry(.30, .084, .092).rotateX(angle)
          .translate(x, y + .495 * Math.cos(angle), z + .495 * Math.sin(angle)))
      }
      add(rim, 'hub', new CylinderGeometry(.29, .29, .21, 22).rotateZ(Math.PI / 2)
        .translate(x + sign * .087, y, z))
      add(rim, 'black', new CylinderGeometry(.118, .118, .055, 14).rotateZ(Math.PI / 2)
        .translate(x + sign * .208, y, z))
    }
  }
  for (const [section, batches] of parts) {
    const group = new Group()
    group.name = section
    group.userData.animationGroup = section
    if (pivot.has(section)) group.position.set(...pivot.get(section))
    for (const [color, geometries] of batches) {
      if (!materials.has(color)) materials.set(color,
        new MeshStandardMaterial({ color: palette[color], roughness: color === 'tire' ? .85 : .39, metalness: .07 }))
      const geometry = mergeGeometries(geometries)
      geometry.translate(-group.position.x, -group.position.y, -group.position.z)
      for (const source of geometries) source.dispose()
      group.add(new Mesh(geometry, materials.get(color)))
    }
    pickup.add(group)
  }
  return pickup
}
