# Connector metadata notices

## LDCad Shadow Library

BrickLab Connector System V4 can read snapping metadata from the **LDCad Shadow Library**, created and maintained by Roland Melkert with contributions from the LDraw/LDCad community.

Upstream repository: https://github.com/RolandMelkert/LDCadShadowLibrary

Connector System V4 currently pins the following upstream snapshot for deterministic behaviour:

```text
f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec
```

The LDCad Shadow Library is licensed under **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**. Its upstream license text is available at:

https://github.com/RolandMelkert/LDCadShadowLibrary/blob/f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec/LICENSE.md

BrickLab does not claim authorship of LDCad Shadow metadata. When Shadow metadata is fetched, parsed, transformed, indexed, cached or otherwise represented by Connector System V4, provenance is retained in the V4 connector records (`source` / `provenance`) so the origin of the data remains identifiable.

The BrickLab source code implementing the parser, resolver, matcher, diagnostics, occupancy model and physics integration is separate from the upstream Shadow Library data. This notice does not change the license of upstream material.

## LDraw

The geometry source remains the LDraw Parts Library. See the LDraw attribution and licensing section in the repository README and `docs/LDRAW.md`.

## Inheritance discovery audit and fixtures

`connectors-v4/inheritance-index-v4.js` is a generated routing index derived from
LDraw file references and the pinned Shadow snapshot. Treat this derived index
as CC BY-SA 4.0. It contains paths, not geometry or invented connector profiles.

`tests/fixtures/connector-inheritance-v4.json` keeps verbatim source files with
their author/license headers. Its `official` section comes from
https://github.com/pybricks/ldraw/tree/c43ed06a128a10ed65675166bf42eb6fd608b9b0
and is used under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
Its `shadow` section comes from the pinned LDCad Shadow repository above and is
CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Individual authors
remain identified in the original file headers. Source text is unmodified;
JSON encoding and selection for regression testing are BrickLab packaging.
