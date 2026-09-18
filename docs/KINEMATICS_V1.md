# Kinematics production ownership

The production button is a UI shell in `kinematics/activation-v1.js`. It loads only
`mechanics-next/production/kinematics-owner.js`; a rejected native migration gate
keeps BUILD active. There is no V1 runtime fallback.

Native mechanics:
- screen drag and mechanical axes: `mechanics-next/interaction/`
- coupled rotations and rack travel: `mechanics-next/transmission/`
- deterministic / underdetermined / conflict solutions: `mechanics-next/solver/`
- baseline restore and ownership: `mechanics-next/production/kinematics-owner.js`

`BrickLabKinematics` remains a compatibility UI alias for the native owner, not a
second engine. Legacy V1 runtime, solver, drag, rack runtime/follower and lifecycle
guard were removed in Stage 12. `kinematics/engine-cam-v1.js` remains an unloaded
pure geometry utility pending native engine-cam coverage; it cannot activate a mode.
