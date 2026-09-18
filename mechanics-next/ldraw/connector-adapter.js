import { createEndpointDescriptor, deterministicId, evidence } from '../core/model.js'

function sourceKey(connector, index = 0) {
  return [
    connector?.source?.file || '',
    connector?.source?.line || 0,
    connector?.id || '',
    index,
  ].join(':')
}

export function ldcadConnectorToEndpoint(connector, {
  bodyId,
  partId = null,
  index = 0,
} = {}) {
  if (!connector?.family || !bodyId) throw new TypeError('LDCad endpoint conversion requires connector and bodyId')
  const key = sourceKey(connector, index)
  return createEndpointDescriptor({
    id:deterministicId('endpoint', bodyId, key),
    bodyId,
    family:connector.family,
    gender:connector.gender === 'mixed' ? null : connector.gender ?? null,
    frame:connector.frame ?? null,
    profile:connector.geometry ?? null,
    capabilities:[
      connector?.snap?.slide === true ? 'slide' : null,
      connector?.snap?.match ? `match:${connector.snap.match}` : null,
      connector?.snap?.placement ? `placement:${connector.snap.placement}` : null,
    ].filter(Boolean),
    metadata:{
      sourceEndpointId:connector.id || key,
      group:connector.group ?? null,
      snap:connector.snap ?? null,
      inheritance:connector.inheritance ?? null,
      source:connector.source ?? null,
      parser:'mechanics-next',
    },
    evidence:evidence({
      source:'ldcad-shadow-library',
      confidence:'strong',
      reason:'parsed by Mechanics Next native LDCad parser',
    }),
  })
}
