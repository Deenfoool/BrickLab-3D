import test from 'node:test'
import assert from 'node:assert/strict'
import { createConnectionGraphV4, CONNECTION_GRAPH_VERSION_V4 } from '../connectors-v4/connections-v4.js'
import { restoreRecordsIntoGraphV4 } from '../connectors-v4/persistence-v4.js'

function record(graphVersion) {
  return {
    schemaVersion:4,
    graphVersion,
    id:`v4conn:${graphVersion}`,
    status:'connected',
    physicsReady:false,
    a:{instanceId:'axle-1',partId:'ldraw-3706',endpointId:'axle'},
    b:{instanceId:'gear-1',partId:'ldraw-32270',endpointId:'axle-hole'},
    occupancy:null,
    occupancyReady:true,
    exclusiveEndpointKeys:['gear-1::axle-hole'],
    constraint:{kindHint:'prismatic',physicsReady:false,status:'geometry-hint'},
  }
}

test('Connector V4 persistence restores records from the current graph schema', () => {
  assert.equal(CONNECTION_GRAPH_VERSION_V4, 'connection-graph-v4.0.2')
  const graph=createConnectionGraphV4()
  const result=restoreRecordsIntoGraphV4(graph,[record(CONNECTION_GRAPH_VERSION_V4)])
  assert.deepEqual(result,{restored:1,rejected:0,errors:[]})
  assert.equal(graph.list().length,1)
})

test('Connector V4 persistence remains backward compatible with v4.0.1 records', () => {
  const graph=createConnectionGraphV4()
  const result=restoreRecordsIntoGraphV4(graph,[record('connection-graph-v4.0.1')])
  assert.equal(result.restored,1)
  assert.equal(result.rejected,0)
})

test('Connector V4 persistence rejects unknown graph generations', () => {
  const graph=createConnectionGraphV4()
  const result=restoreRecordsIntoGraphV4(graph,[record('connection-graph-v4.9.9')])
  assert.equal(result.restored,0)
  assert.equal(result.rejected,1)
  assert.equal(graph.list().length,0)
})
