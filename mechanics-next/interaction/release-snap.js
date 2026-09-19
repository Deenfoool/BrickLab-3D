export const RELEASE_SNAP_POLICY_VERSION='mechanics-release-snap-0.1.0'

// A connector candidate is calculated continuously while TransformControls moves
// the part. Applying the grid first can move that part outside the connector
// capture radius, so connector placement must win at release time.
export function releaseSnapPlan({
  candidate=null,
  connectorSnapEnabled=true,
  gridSnapEnabled=true,
  retainedConnection=false,
}={}){
  const connectorCandidate=connectorSnapEnabled?candidate:null
  return Object.freeze({
    candidate:connectorCandidate,
    applyGrid:Boolean(gridSnapEnabled&&!connectorCandidate&&!retainedConnection),
    retainedConnection:Boolean(retainedConnection),
  })
}
