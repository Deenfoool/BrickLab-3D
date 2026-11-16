const designs = { drive: '3737', driven: '3705', bearing: '3700', bush: '3713', gear8: '10928', gear24: '3648' }
const port = (part, id) => ({ part, port: id })

export const drivetrain = {
  parts: Object.entries(designs).map(([id, design]) => ({ id, design })),
  connections: [
    { shaft: port('drive', 'shaft'), socket: port('bearing', 'bore'), placement: { offset: -80, side: 'end' } },
    { shaft: port('drive', 'shaft'), socket: port('gear8', 'bore'), placement: { offset: -50, side: 'end' } },
    { shaft: port('drive', 'shaft'), socket: port('bush', 'bore'), placement: { offset: -100 } },
    { shaft: port('driven', 'shaft'), socket: port('gear24', 'bore'), placement: { offset: -30 } },
  ],
  gears: [
    { part: 'gear8', center: [0, 0, 0], axis: [1, 0, 0] },
    { part: 'gear24', center: [0, 40, 0], axis: [1, 0, 0] },
  ],
}
