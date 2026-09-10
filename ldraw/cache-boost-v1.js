import * as THREE from 'three'

export const LDRAW_CACHE_BOOST_VERSION = 'ldraw-cache-boost-v1.0.0'

// LDraw parts heavily reuse the same primitives and subparts. FileLoader-backed
// Three.js loaders consult THREE.Cache, so enabling it lets different LDraw models
// reuse already fetched resources inside the current tab instead of re-entering the
// network layer for identical URLs. The predictive loader separately limits how many
// full prototypes are warmed, so this does not imply eager loading of the catalog.
THREE.Cache.enabled = true

export const BrickLabLDrawCacheBoost = Object.freeze({
  version: LDRAW_CACHE_BOOST_VERSION,
  enabled: () => THREE.Cache.enabled === true,
  clear: () => THREE.Cache.clear(),
})

globalThis.BrickLabLDrawCacheBoost = BrickLabLDrawCacheBoost
