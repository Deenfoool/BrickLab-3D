import {
  CONNECTOR_DISCOVERY_VERSION_V4 as LEGACY_DISCOVERY_VERSION_V4,
  discoverPrimitiveConnectorsV4 as discoverLegacyPrimitiveConnectorsV4,
  discoveryConnectorRoleV4 as legacyConnectorRoleV4,
  pairPegholeEndsV4,
} from '../connectors-v4/discovery-v4.js'
import {
  CONNECTOR_SEMANTIC_SITES_VERSION_V4,
  discoverSemanticSitesV4,
  mergeSemanticSitesV4,
  semanticConnectorRoleV4,
} from './semantic-sites-v4.js?v=connector-sites-20260914-v2'

export const CONNECTOR_DISCOVERY_VERSION_V4='connector-discovery-v4.4.0'
export { pairPegholeEndsV4 }

const normalize=value=>String(value||'').replace(/\\/g,'/').split('/').pop()?.toLowerCase()||''
const isLegacyAxleHint=connector=>connector?.source?.kind==='ldraw-primitive-discovery'&&normalize(connector.source?.primitive)==='axlehol0.dat'

export function discoveryConnectorRoleV4(connector){
  return semanticConnectorRoleV4(connector)||legacyConnectorRoleV4(connector)
}

export function mergeDiscoveredConnectorsV4(existing,discovered){
  return mergeSemanticSitesV4(existing,discovered,{roleOf:discoveryConnectorRoleV4})
}

export async function discoverPrimitiveConnectorsV4(file,text,fetchText,options={}){
  const [legacy,semantic]=await Promise.all([
    discoverLegacyPrimitiveConnectorsV4(file,text,fetchText,options),
    discoverSemanticSitesV4(file,text,fetchText,options),
  ])

  // v4.2 placed axlehol0 at the primitive origin even though LDraw documents the
  // hint as a direct substitute for axle.dat, whose native span is Y=0..1. Remove
  // only that legacy candidate before identity assignment; the semantic pass emits
  // the corrected midpoint connector with the full scaled span.
  const legacyConnectors=(legacy.connectors??[]).filter(connector=>!isLegacyAxleHint(connector))
  const correctedAxleHints=(legacy.connectors?.length||0)-legacyConnectors.length
  const combined=[...legacyConnectors,...(semantic.connectors??[])]
  const merged=mergeDiscoveredConnectorsV4([],combined)

  return{
    version:CONNECTOR_DISCOVERY_VERSION_V4,
    file:legacy.file||semantic.file||file,
    connectors:merged.added,
    stats:{
      ...(legacy.stats||{}),
      connectors:merged.added.length,
      combinedCandidates:combined.length,
      combinedSuppressed:merged.suppressed,
      correctedAxleHints,
      legacyVersion:LEGACY_DISCOVERY_VERSION_V4,
      semanticVersion:CONNECTOR_SEMANTIC_SITES_VERSION_V4,
      semanticSites:semantic.stats||null,
    },
  }
}
