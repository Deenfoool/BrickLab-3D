import test from 'node:test'
import assert from 'node:assert/strict'
import { drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'
import { discoverDifferentialFixturesV4 } from '../connector-discovery/differential-fixtures-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'

test('real 62821 ↔ 6589 activation reaches drivetrain as a differential seat',()=>{
  const seat=discoverDifferentialFixturesV4('62821.dat').connectors[0]
  const gear=discoverDifferentialFixturesV4('6589.dat').connectors[0]
  const match=matchConnectorV4(gear,seat)
  assert.equal(match.compatible,true)

  const activation=activationForMatchV4(gear,seat,match)
  assert.equal(activation.active,true)
  assert.equal(activation.family,'round-revolute-interface')
  assert.equal(activation.constraintKind,'revolute')

  const records=[{
    id:'seat-1',
    a:{instanceId:'inner-gear',endpointId:'pivot'},
    b:{instanceId:'carrier',endpointId:'seat'},
    activation,
    provenance:{a:{file:'6589.dat'},b:{file:'62821.dat'}},
  }]
  const links=drivetrainSemanticLinksV4(records)
  assert.equal(links.length,1)
  assert.equal(links[0].kind,'differential-seat')
  assert.equal(new Set([links[0].a.instanceId,links[0].b.instanceId]).size,2)
})
