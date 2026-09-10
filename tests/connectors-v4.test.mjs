import test from 'node:test'
import assert from 'node:assert/strict'

import { expandGridV4, parseGridV4, parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { createShadowResolverV4, connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'

function oneConnector(line, file = 'fixture.dat') {
  const parsed = parseShadowTextV4(`0 test\n${line}\n`, { file })
  assert.equal(parsed.warnings.length, 0, JSON.stringify(parsed.warnings))
  const op = parsed.operations.find(item => item.type === 'connector')
  assert.ok(op, `expected connector operation for ${line}`)
  return op.connector
}

test('V4 parser preserves a segmented cylinder profile and centered grid exactly', () => {
  const parsed = parseShadowTextV4(
    '0 !LDCAD SNAP_CYL [ID=connhole] [gender=F] [caps=none] [secs=R 8 2   R 6 16   R 8 2] [center=true] [slide=true] [grid=C 5 1 20 0]',
    { file: 'p/connhole.dat' },
  )

  assert.equal(parsed.warnings.length, 0)
  assert.equal(parsed.operations.length, 1)
  const { connector, grid } = parsed.operations[0]
  assert.equal(connector.family, 'cylinder')
  assert.equal(connector.gender, 'female')
  assert.deepEqual(connector.geometry.sections.map(({ shape, radiusLdu, lengthLdu }) => ({ shape, radiusLdu, lengthLdu })), [
    { shape: 'R', radiusLdu: 8, lengthLdu: 2 },
    { shape: 'R', radiusLdu: 6, lengthLdu: 16 },
    { shape: 'R', radiusLdu: 8, lengthLdu: 2 },
  ])
  assert.equal(connector.geometry.centered, true)
  assert.equal(connector.snap.slide, true)
  assert.deepEqual(grid, { xCount: 5, zCount: 1, centerX: true, centerZ: false, stepX: 20, stepZ: 0 })
  assert.deepEqual(expandGridV4(grid).map(point => point[0]), [-40, -20, 0, 20, 40])
})

test('V4 parser rejects malformed connector metadata instead of inventing geometry', () => {
  const parsed = parseShadowTextV4(
    '0 !LDCAD SNAP_CYL [gender=M] [secs=R nope 20 R 6]',
    { file: 'parts/broken.dat' },
  )
  assert.equal(parsed.operations.length, 0)
  assert.equal(parsed.warnings.length, 1)
  assert.equal(parsed.warnings[0].code, 'invalid-snap-meta')
})

test('V4 matcher distinguishes free round bores from keyed axle holes conservatively', () => {
  const axle = oneConnector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true]', 'parts/3705.dat')
  const roundHole = oneConnector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]', 'p/connhole.dat')
  const axleHole = oneConnector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]', 'p/axlehole.dat')
  const roundShaft = oneConnector('0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 6 20] [center=true] [slide=true]', 'parts/round.dat')

  const free = matchConnectorV4(axle, roundHole)
  assert.equal(free.compatible, true)
  assert.equal(free.keyed, false)
  assert.equal(free.kinematicHint, 'cylindrical')
  assert.equal(free.editorMotion.axialSlide, true)
  assert.equal(free.editorMotion.freeTwist, true)
  assert.equal(free.physicsReady, false)

  const keyed = matchConnectorV4(axle, axleHole)
  assert.equal(keyed.compatible, true)
  assert.equal(keyed.keyed, true)
  assert.equal(keyed.kinematicHint, 'prismatic')
  assert.equal(keyed.rotationalSymmetry, 4)
  assert.equal(keyed.physicsReady, false)

  const forbiddenReverseInference = matchConnectorV4(roundShaft, axleHole)
  assert.equal(forbiddenReverseInference.compatible, false)
})

test('V4 matcher gates generic ball joints by group, gender and requested size', () => {
  const male = oneConnector('0 !LDCAD SNAP_GEN [group=techBallJnt] [gender=M] [bounding=sph 12.7] [match=size] [placement=free]')
  const female = oneConnector('0 !LDCAD SNAP_GEN [group=techBallJnt] [gender=F] [bounding=sph 12.7] [match=size] [placement=free]')
  const wrongGroup = oneConnector('0 !LDCAD SNAP_GEN [group=otherBall] [gender=F] [bounding=sph 12.7] [match=size] [placement=free]')
  const wrongSize = oneConnector('0 !LDCAD SNAP_GEN [group=techBallJnt] [gender=F] [bounding=sph 10] [match=size] [placement=free]')

  const match = matchConnectorV4(male, female)
  assert.equal(match.compatible, true)
  assert.equal(match.kinematicHint, 'spherical')
  assert.equal(match.physicsReady, false)
  assert.equal(matchConnectorV4(male, wrongGroup).compatible, false)
  assert.equal(matchConnectorV4(male, wrongSize).compatible, false)
})

test('V4 finger matcher accepts complementary fingers and rejects overlapping equal genders', () => {
  const femaleFirst = oneConnector('0 !LDCAD SNAP_FGR [genderOfs=F] [seq=4 4 4 4 4] [radius=4] [center=true]')
  const maleFirst = oneConnector('0 !LDCAD SNAP_FGR [genderOfs=M] [seq=4 4 4 4 4] [radius=4] [center=true]')
  const alsoFemaleFirst = oneConnector('0 !LDCAD SNAP_FGR [genderOfs=F] [seq=4 4 4 4 4] [radius=4] [center=true]')

  assert.equal(matchConnectorV4(femaleFirst, maleFirst).compatible, true)
  assert.equal(matchConnectorV4(femaleFirst, maleFirst).kinematicHint, 'revolute')
  assert.equal(matchConnectorV4(femaleFirst, alsoFemaleFirst).compatible, false)
})

test('V4 resolver composes subparts, SNAP_CLEAR, SNAP_INCL grids and YOnly scaling', async () => {
  const official = new Map([
    ['parts/root.dat', [
      '0 root',
      '1 16 20 0 0 1 0 0 0 1 0 0 0 s/base.dat',
      '1 16 0 0 0 1 0 0 0 2 0 0 0 1 axlehole.dat',
    ].join('\n')],
    ['parts/s/base.dat', [
      '0 base',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 stud.dat',
    ].join('\n')],
    ['p/stud.dat', '0 stud'],
    ['p/axlehole.dat', '0 axle hole'],
  ])
  const shadow = new Map([
    ['p/stud.dat', '0 !LDCAD SNAP_CYL [ID=studC] [gender=M] [caps=one] [secs=R 6 4]'],
    ['p/axlehole.dat', '0 !LDCAD SNAP_CYL [ID=axleHole] [gender=F] [caps=none] [secs=A 6 1] [slide=true] [scale=YOnly] [pos=0 1 0]'],
    ['p/connhole.dat', '0 !LDCAD SNAP_CYL [ID=connhole] [gender=F] [caps=none] [secs=R 6 20] [center=true] [slide=true]'],
    ['parts/s/base.dat', [
      '0 !LDCAD SNAP_CLEAR [ID=studC]',
      '0 !LDCAD SNAP_CYL [ID=aStud] [gender=F] [caps=one] [secs=R 6 20] [pos=0 24 0] [grid=C 2 1 20 0]',
    ].join('\n')],
    ['parts/root.dat', '0 !LDCAD SNAP_INCL [ref=connhole.dat] [pos=0 10 0] [grid=C 2 1 20 0]'],
  ])

  const resolver = createShadowResolverV4({
    fetchOfficialText: async path => official.get(path) ?? null,
    fetchShadowText: async path => shadow.get(path) ?? null,
  })
  const resolved = await resolver.resolve('root.dat')

  assert.equal(resolved.warnings.length, 0, JSON.stringify(resolved.warnings))
  assert.equal(resolved.connectors.length, 5)
  assert.equal(resolved.connectors.some(connector => connector.id === 'studC'), false, 'SNAP_CLEAR must remove inherited primitive connector')

  const anti = resolved.connectors.filter(connector => connector.id === 'aStud')
  assert.equal(anti.length, 2)
  assert.deepEqual(anti.map(connector => connector.frame.positionLdu[0]).sort((a,b) => a-b), [10, 30])

  const axleHole = resolved.connectors.find(connector => connector.id === 'axleHole')
  assert.ok(axleHole)
  assert.equal(axleHole.geometry.sections[0].lengthLdu, 2, 'YOnly must scale axial length')
  assert.equal(axleHole.geometry.sections[0].radiusLdu, 6, 'YOnly must not scale radius')

  const included = resolved.connectors.filter(connector => connector.id === 'connhole')
  assert.equal(included.length, 2)
  assert.deepEqual(included.map(connector => connector.frame.positionLdu[0]).sort((a,b) => a-b), [-10, 10])

  const converted = connectorToBrickLabV4(anti[0], [1, 0.5, -2])
  assert.equal(converted.unit, 'stud')
  assert.deepEqual(converted.frame.positionStud, [anti[0].frame.positionLdu[0] / 20 + 1, -anti[0].frame.positionLdu[1] / 20 + 0.5, -anti[0].frame.positionLdu[2] / 20 - 2])
})

test('V4 resolver reports transient source errors instead of treating them as missing metadata', async () => {
  const resolver = createShadowResolverV4({
    fetchOfficialText: async path => path === 'parts/network.dat' ? '0 network' : null,
    fetchShadowText: async path => {
      if (path === 'parts/network.dat') throw new Error('synthetic network failure')
      return null
    },
  })
  await assert.rejects(() => resolver.resolve('network.dat'), /synthetic network failure/)
})

test('V4 resolver terminates cyclic subpart graphs deterministically', async () => {
  const official = new Map([
    ['parts/a.dat', '0 a\n1 16 0 0 0 1 0 0 0 1 0 0 0 s/b.dat'],
    ['parts/s/b.dat', '0 b\n1 16 0 0 0 1 0 0 0 1 0 0 0 s/b.dat'],
  ])
  const resolver = createShadowResolverV4({
    fetchOfficialText: async path => official.get(path) ?? null,
    fetchShadowText: async () => null,
  })
  const result = await resolver.resolve('a.dat')
  assert.equal(result.connectors.length, 0)
  assert.ok(result.warnings.some(warning => warning.code === 'cycle'))
})
