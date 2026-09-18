import test from 'node:test'
import assert from 'node:assert/strict'
import { drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'

test('verified 62821 ↔ 6589 revolute seat reaches drivetrain without becoming a rigid axle link',()=>{
  const records=[{
    id:'seat-1',
    a:{instanceId:'carrier',endpointId:'seat'},
    b:{instanceId:'inner-gear',endpointId:'pivot'},
    activation:{family:'round-revolute-interface'},
    provenance:{a:{file:'62821.dat'},b:{file:'6589.dat'}},
  }]
  const links=drivetrainSemanticLinksV4(records)
  assert.equal(links.length,1)
  assert.equal(links[0].kind,'differential-seat')
  assert.equal(links[0].a.instanceId,'carrier')
  assert.equal(links[0].b.instanceId,'inner-gear')
})
