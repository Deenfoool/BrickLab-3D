import { pathToFileURL } from 'node:url'
import { Assembly } from '../src/mechanics/assembly.js'
import { gearAt, technic } from '../src/mechanics/catalog.js'
import { drivetrain } from '../src/projects/drivetrain.js'

export function buildDrivetrain() {
  const assembly = new Assembly(technic)
  const designs = new Map(drivetrain.parts.map(({ id, design }) => [id, design]))
  for (const [id, design] of designs) assembly.addPart(id, design)
  const fits = drivetrain.connections.map(({ shaft, socket, placement }) =>
    assembly.connect(shaft, socket, placement))
  const { shaft: drive, socket: bearing } = drivetrain.connections[0]
  if (fits.some(fit => !fit.ok)) throw new Error(JSON.stringify(fits))
  return {
    occupancy: fits.map(fit => fit.occupancy.shaft),
    bearingMotion: fits[0].motion.rotation,
    bearingTravel: assembly.axialTravel(drive, bearing),
    transmission: assembly.rotationFrom('drive', drivetrain.gears.map(({ part, center, axis }) =>
      gearAt(part, designs.get(part), center, axis))),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(buildDrivetrain(), null, 2))
}
