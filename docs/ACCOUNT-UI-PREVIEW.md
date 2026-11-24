# Account and cloud-build UI preview

Branch feature/mechanics-core: static interface prototype only. Entry: account button in the main top bar, or cloud icon on a local build card.

- Login and registration screens use a fixed example.invalid identity, read-only email/password fields and explicit demo buttons. No actual passwords or real user authentication.
- Account page with cloud builds and profile tabs, local build selection, explicit snapshot, access settings and revision history.
- Owner/editor/viewer role simulation affects save and visibility controls. It is not a security boundary. Private/unlisted/public selections do not publish anything.
- Temporary snapshots are held only in page memory; at most 30 builds, 20 revisions per build, and 16 MB serialized data. Sign-out/reload clears them. Existing localStorage projects are unchanged.
- Downloading or opening a revision uses the existing .bricklab export and creates a new local project rather than replacing an original.
- Next: review layout on desktop/mobile, then port to feature/cloud-migration and replace preview state with authenticated API calls, database authorization, revision conflict checks and persistent storage. Keep demo mode explicitly separate from production identity.
