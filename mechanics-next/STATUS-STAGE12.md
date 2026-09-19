# Mechanics Next — Stage 12 completion

Status: **COMPLETE**  
Date: **2026-09-19**  
Branch: **feature/mechanics-next-engine**

Stage 12 removes the remaining legacy runtime owners and leaves Mechanics Next as the sole production owner for BUILD connectivity, snapping, KINEMATICS, persistence of mechanical state and SIMULATE physics planning.

## Final verification

- Release gate: **686 passed, 0 failed**.
- Production build: **passed**.
- Import map: **283 canonical module URLs, 97 compatibility redirects, 0 dangling local targets**.
- Browser package fixture: **18 objects, 12 native stored constraints, migration gate 14/14, 14 joints, 5 couplers, 1 motor, 0 fallbacks**.
- Browser mode cycle: **BUILD → KINEMATICS → SIMULATE → BUILD** under Mechanics Next ownership.
- Blank-project browser smoke: SIMULATE entered with 0 bodies/0 joints and returned to `BUILD MODE · 0 parts · 0 connections · Mechanics Next`; an empty graph keeps KINEMATICS fail-closed at its migration gate.

Historical Connector V4 project records remain readable through a one-way import boundary. New saves omit `connectionsV4` and serialize canonical `mechanicsNext` state.
