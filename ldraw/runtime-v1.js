// Compatibility entry point. Existing BrickLab modules import runtime-v1.js;
// v2 adds recursive subpart connector inference without changing that public API.
export * from './runtime-v2.js?v=ldraw-20260910-v2'
