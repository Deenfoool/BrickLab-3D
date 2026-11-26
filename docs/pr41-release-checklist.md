# PR 41 — release gate (not executed)

This branch is an unreleased development candidate. Do not deploy it, merge it into production, or enable live payment/receipt flags until the checks below pass. Existing production data and receipt configuration must remain intact.

## Gate 1 — isolated verification
- [ ] Record exact candidate SHA and run scripts/check-commerce.sh against that SHA; all Node, SQL, PostgreSQL integration and NPD checks must pass.
- [ ] Confirm migrations 106–107 on fresh database and a restored copy of existing schema; verify owner/admin access and rollback plan.
- [ ] Inspect browser console and network for new modules, asset versioning and failed imports.
- [ ] Test registered/unregistered, existing/new verified account and admin. Test free <=600, welcome, earned second grant, duplicate/race, Plus expiration, refund and pending payments; do not use real money in sandbox.
- [ ] Confirm only audited supported paid sets are chargeable; PDF remains free; OBT does not consume credits; trial boundary works for multi-volume instructions.
- [ ] Confirm First Builder cannot be earned twice and document the current milestone/part-count heuristic (not geometry verification).

## Gate 2 — catalog and workshop
- [ ] Desktop/mobile catalog search, sorting, advanced filters, pagination, local fallback, set selection, payment return, free demo and recommendations.
- [ ] Private instruction collection, public badge visibility, admin analytics permissions and revenue excluded for sandbox/refunds.
- [ ] Photo Studio local/cloud 720p/1080p PNG, transparent background and cleanup after cancellation.
- [ ] Benchmark PDF recognition against previously failing layered/raster inventories; record precision and coverage for each sample, not just hotspot count.

## Gate 3 — mechanics
- [ ] Regression: 8845 Dune Buggy (steering/suspension), 858 Inline Engine (belts/fan), tracked excavator (tracks), gearbox/selector, cardan, motor/hub, wheel/axle, rigid and detented joints.
- [ ] Confirm saved models retain geometry and appearance after diagnostics, map changes, cancellation, reload and export.
- [ ] Collision fixtures: separate parts, touching parts, actual noncoplanar crossings, intentional mating, mirrored geometry, moved linkage, incomplete model, scan cancellation and time/memory limits.
- [ ] Confirm 9/17/25 sample coverage indicators, pose restoration, red outline/marker, and publication capture without diagnostic helpers.
- [ ] Check signed speed/ratio and single-output stall estimate, multiple resistance assumptions, disabled motor, reversal, no-load/overload, unsupported nonlinear/linear outputs, invalid inputs and stale report invalidation.
- [ ] Verify report includes limitations, selected drive, current estimates, collision coverage and historical import issues.

## Gate 4 — release
- [ ] Review branch diff, confirm no unintended changes, create verified backup, rehearse migration and rollback.
- [ ] Merge after all required checks; deploy exact reviewed commit; confirm container and /api/health, browser smoke checks.
- [ ] Keep live checkout, paid instruction release and fiscal processing disabled until receipt/payment workflow and legal configuration are independently validated.

## Remaining work (not represented as completed)
- Continuous swept collision detection, closed-solid containment and interference within mated pairs; actual dynamic force distribution, validated material/strength models, thermal limits, friction and motor calibration.
- Geometry-verified first-build completion and broader per-set instruction audits.
- Full paid credit bundle design, purchase/refund/entitlement accounting; no new SKU enabled yet.
- Real browser profiling, accessibility and language review, measured recognition accuracy, end-to-end tests and production release.

## Added engineering / studio review
- [ ] Motor bench: Rapier availability, detached simulation, motor output, fixed housing, stop/cancel, no changes to saved model, telemetry/export, 400-part cap and unsupported joint reporting. Existing approximate scale/mass and excluded gear/belt dynamics explicitly disclosed.
- [ ] Advanced collision mode: exact coincident duplicates, default mated-pair skip, opt-in mated-pair false positives, result classification and reset.
- [ ] Photo Studio: all aspect ratios, six angles, framing, shadow switch, four-view sheet, title caption, complete model geometry, output dimension and cancellation.
- [ ] Migrations 106–107: dollar-quoted function delimiters repaired; still require actual SQL execution.
- [ ] Bundle pricing prototype and invariants documented; no payment SKU, API or UI enabled. See docs/instruction-bundles.md.

## Release candidate scope freeze
- [ ] Migration 108: sandbox pack lines, three distinct sets, idempotent creation, reservation conflict with individual orders, verified test payment, three atomic grants, repeat notification and full revocation; no live creation path.
- [ ] Access offers: no paid restriction if live legal/checkout configuration is unavailable; never spend welcome activation during open beta.
- [ ] Verify all previously listed release gates before merging. Full dynamic gear/belt contact physics, validated materials/strength, continuous swept collisions and live bundle fiscal support are research or later-release scope, not completed features.
