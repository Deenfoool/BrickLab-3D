import { pathToFileURL } from 'node:url'
import { Assembly } from '../src/mechanics/assembly.js'
import { gearAt, technic } from '../src/mechanics/catalog.js'

export function buildDrivetrain() {
  const assembly = new Assembly(technic)
  const parts = { drive: '3737', driven: '3705', bearing: '3700', bush: '3713', gear8: '10928', gear24: '3648' }
  for (const [id, design] of Object.entries(parts)) assembly.addPart(id, design)
  const port = (part, id) => ({ part, port: id })
  const drive = port('drive', 'shaft')
  const bearing = port('bearing', 'bore')
  const fits = [
    assembly.connect(drive, bearing, { offset: -80, side: 'end' }),
    assembly.connect(drive, port('gear8', 'bore'), { offset: -50, side: 'end' }),
    assembly.connect(drive, port('bush', 'bore'), { offset: -100 }),
    assembly.connect(port('driven', 'shaft'), port('gear24', 'bore'), { offset: -30 }),
  ]
  if (fits.some(fit => !fit.ok)) throw new Error(JSON.stringify(fits))
  return {
    occupancy: fits.map(fit => fit.occupancy.shaft),
    bearingMotion: fits[0].motion.rotation,
    bearingTravel: assembly.axialTravel(drive, bearing),
    transmission: assembly.rotationFrom('drive', [
      gearAt('gear8', parts.gear8, [0, 0, 0], [1, 0, 0]),
      gearAt('gear24', parts.gear24, [0, 40, 0], [1, 0, 0]),
    ]),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(buildDrivetrain(), null, 2))
}
