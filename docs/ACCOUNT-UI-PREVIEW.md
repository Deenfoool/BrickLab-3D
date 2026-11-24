# Account and cloud-build UI preview

Branch feature/mechanics-core: static interface prototype only. Entry: account button in the main top bar, or cloud icon on a local build card.

- Login and registration screens use a fixed example.invalid identity, read-only email/password fields and explicit demo buttons. No actual passwords or real user authentication.
- Account page with cloud builds and profile tabs, local build selection, explicit snapshot, access settings and revision history.
- Owner/editor/viewer role simulation affects save and visibility controls. It is not a security boundary. Private/unlisted/public selections do not publish anything.
- Temporary snapshots are held only in page memory; at most 30 builds, 20 revisions per build, and 16 MB serialized data. Sign-out/reload clears them. Existing localStorage projects are unchanged.
- Downloading or opening a revision uses the existing .bricklab export and creates a new local project rather than replacing an original.
- Next: review layout on desktop/mobile, then port to feature/cloud-migration and replace preview state with authenticated API calls, database authorization, revision conflict checks and persistent storage. Keep demo mode explicitly separate from production identity.

## BrickLab Workshop

The signed-in preview has 14 sections: workshop, builds, engineering passport, achievements, challenges, rankings, public profile, diary, bureau, favorites, notifications, storage, account settings, security. The main editor remains available without an account.

- Editable demo display name, username, bio, initials avatar, cover style, unlocked title, profile visibility, notification preference and up to three showcase builds. No persistent identity; all preview settings reset on exit/reload.
- XP and REP are separate. Preview XP is 30 per distinct completed local Academy lesson; no points for repeat saves. REP is zero until server-verified community data exists. Rank thresholds 0/100/300/700/1200/3000/6000/15000. Specialization chart reflects local lesson evidence only.
- Fourteen achievement cards with rarity and locked state. Only the Academy achievement can currently unlock from local evidence. Founders, beta, contest, year-of-membership, World and other achievements require authoritative events.
- Model passport checks document references, IDs and optional coordinate/rotation arrays; counts parts, connections, gears, belts and revisions. Kinematics and physics remain unverified. No certificate is issued.
- Three challenge previews: 150-part gearbox, off-road track, 30-part mechanism. Preliminary structural conditions can be checked, but functional verification and XP awards require trusted tests.
- Build filtering, demo sync status, role-dependent visibility and simulated member invitations, snapshot trash and restoration. All operations affect temporary snapshots only.
- Public portfolio preview, local favorites, local activity/notifications, demo bureau and storage usage work in memory. Rankings support period/category filters and intentionally have no invented entries. Following, real notifications, lineage, email/password/sessions/2FA are explicit server-dependent states. Profile link points only to the local page; no public sharing or QR identity is issued.
- Production design contract: server-owned XP/REP ledger with unique event keys, abuse limits, verified tests, no donation-funded XP/REP; public profile excludes private models unless explicitly published, authoritative ACLs, opt-out/privacy, moderation, authenticated team memberships, revision history, provenance, seasonal rankings, genuine notifications and durable storage. Real certification, collaboration, QR profile links and BrickLab World identity integration remain future work.

Tests in tests/workshop.test.js cover deterministic rank boundaries, structural validation, preliminary challenge checks, demo trash and permissions, and bilingual label completeness. Browser review is still required.
