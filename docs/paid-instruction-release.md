# Paid interactive instruction release

The product is BrickLab's interactive hint layer, not a sale of the original LEGO PDF. Normal PDF viewing, user-provided PDFs and manual search remain free. A private region API is access controlled, but this is not DRM; browser recognition, user files and historical Git copies are not secret. Confirm licensing and commercial rights before charging.

## Existing candidate inventory (2026-11-28)
These figures count the checked-in maps, not verified recognition accuracy or actual building steps. All 23 maps were inspected for positive boxes within normalized page bounds. There is no approved set at the time of this report. Empty pages may be legitimate; the map count is not a recognition-accuracy metric.

| Set | Indexed volumes | Pages with regions | Regions |
|---|---:|---:|---:|
| 10300-1 | 1 | 206 | 565 |
| 10307-1 | 3 | 345 | 883 |
| 10316-1 | 3 | 413 | 876 |
| 42143-1 | 2 | 547 | 1310 |
| 42154-1 | 1 | 204 | 768 |
| 42171-1 | 1 | 235 | 556 |
| 42206-1 | 1 | 243 | 610 |
| 42210-1 | 1 | 226 | 494 |
| 42215-1 | 2 | 381 | 1460 |
| 42222-1 | 1 | 127 | 291 |
| 42223-1 | 1 | 150 | 544 |
| 75313-1 | 4 | 332 | 588 |
| 76419-1 | 2 | 362 | 855 |
| Total | 23 | 3771 | 9800 |

42215-1 is not in the sequence catalog: confirm the actual volume order and page counts. Other sequence entries are candidate metadata, not proof.

## Prepare a draft (operator, VPS or private workstation)
1. Use only confirmed official PDF files, stored outside Git and public web root. Name them by official PDF ID, e.g. 6456541.pdf. Obtain the actual volume list and part counts independently. Confirm rights to use the PDF and commercial derived annotations. Do not equate public download with permission to resell.
2. Run `python3 scripts/prepare-instruction-audit.py` for current candidate statistics. Install/use PyMuPDF in the existing OCR environment for draft generation.
3. Create a private plan JSON with one or more sets, e.g. `{"42154-1":{"title":"Ford GT","partCount":1468,"volumes":["6456541"]}}`. This is an example, not reviewed evidence.
4. Run `python3 scripts/prepare-instruction-audit.py --plan /private/plan.json --pdf-dir /private/pdfs --output /private/audit-draft.json`. This opens actual PDFs, hashes them, checks map page bounds, populates every page, and supplies numeric text candidates as review aids. It does not choose step numbers or approve anything.
5. Review every volume and page against the actual PDF: all required parts, correct design/color, clickable boundaries, no false positives, correct global building step (same step can span pages; never restart numbering in later volumes). Set step 0 only for non-building matter with no paid regions; use `review:"verified"` for pages with checked regions and `review:"no-parts"` only after confirming the page has no part callouts. For unrecognized callouts, fix the map, do not mark no-parts. Check that designs resolve in BrickLab library. Confirm actual final assembly milestone and full volume list. Set `reviewed:true` only after completion. Exclude an incomplete set entirely from the approved manifest. Remove stepCandidates if desired.
6. Save the finished schema-2 JSON as `/var/lib/bricklab-instructions-private/audit.json`; operator must create a separate `audit.json.approval.json` after real review:
```json
{"schema":1,"approved":true,"auditSha256":"ACTUAL_SHA256_OF_AUDIT_BYTES","offerVersion":"ACTUAL_APPROVED_OFFER_DIGEST","rightsReviewed":true,"reviewer":"ACTUAL_REVIEWER","reviewedAt":"ACTUAL_ISO_TIMESTAMP"}
```
   Example placeholders are intentionally invalid. Use `sha256sum` for the file. The offer must actually describe the product, price, lifetime/Plus access, trial and refunds. Set ownership/permissions so the container's node user (1000) can read but not modify; directory and files must not be publicly accessible. Store a secure backup.
7. Deploy the validated release with checkout closed. Use `BRICKLAB_PRIVATE_INSTRUCTION_AUDIT=/app/private-instructions/audit.json` and `BRICKLAB_INSTRUCTIONS_RELEASE=true` only after approval. Keep the approved file and release flag when pausing checkout, otherwise purchased rights are no longer represented correctly. The validator rejects pending review and digest mismatches. An offer change disables new instruction checkout until updated approval; existing access stays available.
8. With YooKassa and tax readiness, verify a real admin-only pilot purchase, receipt, refund and access revocation, then public rollout. Check guest, trial, other account, welcome, owner, expired Plus, active Plus, refunded, two URL aliases, wrong set ID, unknown book, ordinary PDF, local PDF and network interruption. Test actual PDF pages across all offered sets before public launch.

The recorded PDF hash is review evidence, not a live check of every remote PDF response. If the official document changes, re-review the new version before selling it. The validation cannot determine legal rights or whether a human review was truthful. No actual PDFs, approved manifest or rights approval were available to this code-only session; the candidate inventory must not be advertised as fully audited.
