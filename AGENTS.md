# BrickLab development rules

## Release history (mandatory)

For every substantial user-visible update, include a real bilingual (RU/EN) release-history entry in the **same change** before the PR is merged or a release is deployed. This applies to editor tools, physics/kinematics, catalog, instructions, UI, account, community, store and significant fixes or performance improvements. Small internal refactors, tests, documentation-only edits and routine maintenance need not be announced.

Read [docs/release-history.md](docs/release-history.md) for the format, source links, cache refresh and checks. The history is rendered on the home page and the latest entry becomes “What's new”. Do not invent version numbers, deployment dates, payment availability or unverified capabilities. Mark experimental work and limits accurately.

Run `node scripts/check-release-history.mjs` and `node --test tests/release-history.test.js` before submitting changes. For a large change also run `node scripts/check-release-history.mjs BASE HEAD` against the actual comparison refs. Do not remove historical entries merely to satisfy the check.
