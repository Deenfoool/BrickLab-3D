# Commerce release checklist

This branch is a sandbox release, not authorization to charge customers.

## Test checkout
- Keep BRICKLAB_YOOKASSA_TEST_ENABLED=false until a YooKassa test shop is configured.
- Use test shop ID and test_ secret in the VPS .env (permissions 0600), never commit or log either.
- Configure payment.succeeded notifications at https://bricklab-3d.ru/api/payments/yookassa/test-result.
- Test checkout is administrator-only; all test grants are excluded from real entitlements.
- Verify provider GET, matching amount, order metadata, payment ID and mode before fulfillment.
- Check duplicate notifications, pending/canceled payment recovery and a subscription renewal.
- Do not enable live checkout using test credentials. Live quote/order/fulfillment code is present, but the runtime explicitly disables the live adapter. Do not remove this gate before refund and NPD receipt reconciliation tests.

## Paid instruction readiness
- Hosted precomputed region JSON is only served through an access-checked API.
- Audited canonical books use private precomputed server-side regions; the browser still contains free recognition for other documents. This is not complete DRM or server-side OCR.
- No set is audited yet. Keep release mode disabled. Before enabling it, populate /var/lib/bricklab-instructions-private with the validated private audit manifest, audit supported books and actual step maps, ensure alternate canonical URLs cannot bypass policy, and test guest/owner/Plus/expired/refunded access.
- Never restrict the original PDF or manual library search.
- Previously published Git history or other static hosting may expose old datasets; do not treat them as secret.

## Legal approval and payment release
The /offer, /privacy and /refund pages are visibly marked drafts. The operator must approve a completed version and verify facts, including:
- Seller's legal name, tax status and contact information on /requisites.
- Actual personal-data processors (hosting, email, analytics, error reports, Telegram integrations, payment provider), locations, legal grounds, retention/deletion schedule, applicable notifications to Roskomnadzor and consent flows; assess localization and cross-border transfer separately.
- Exact product scope, price, duration, quota/expiry terms, delivery, support, refunds and durable offer-version acceptance before payment.
- Register NPD income and issue the receipt to the customer; reconcile canceled/refunded transactions and receipt corrections. Verify the actual YooKassa/My Tax arrangement.
- Review rights to third-party instruction images/PDFs and metadata.
- Test live authorization and refund behavior only after approval and separate explicit configuration. No automatic recurring debit is authorized.
- Do not publish unverified legal claims or remove draft banners until reviewed.

References:
- https://yookassa.ru/developers/using-api/webhooks
- https://yookassa.ru/developers/using-api/interaction-format
- https://yookassa.ru/developers/payment-acceptance/receipts/basics
- https://www.consultant.ru/document/cons_doc_LAW_61801/
- https://www.consultant.ru/document/cons_doc_LAW_305/758e2cfdf136a621c8f66dcb3372b772c7b5e6e8/

Live order preparation persists the exact accepted legal digest and marks the NPD receipt pending on settlement. This is not receipt issuance. The approval manifest must be created by the operator after reviewing the actual documents, and is stored outside the public web root.

## Live rollout safety (supersedes the original test-only runtime description)
The live adapter exists. A valid live configuration no longer opens checkout by itself. Use BRICKLAB_LIVE_CHECKOUT_SCOPE=closed (default), pilot (admin only), public (everyone). This controls creation/quotes, not incoming notifications, settlement, admin refunds or reconciliation. Do not set public until the contract, verified live provider credentials, approved offer, NPD issuance, email delivery and full refund/correction are verified. Keep provider credentials and the NPD worker active when closing sales if any real orders remain. Do not enable instruction release until a separate audit. Run isolated VPS tests before merge. The live refund polling regression is fixed; its test uses mocked provider responses, not real money.

### Operator launch sequence
1. Keep live sales closed. Run the isolated VPS release checks.
2. After contract and provider approval, configure live shop credentials using scripts/configure-commerce-live.py. It performs a read-only API check and stages closed scope.
3. Configure live webhook at /api/payments/yookassa/live-result for payment.succeeded, payment.canceled and refund.succeeded. Confirm reachability and provider configuration. Enable NPD worker only after confirming fiscal arrangements and no other issuer; verify timer and email.
4. Stage administrator-only checkout with scripts/set-commerce-scope.py pilot; recreate bricklab service, verify public status remains disabled and ordinary accounts cannot buy.
5. Pay for a genuine product from an admin account, verify fulfillment, actual NPD receipt and email inbox, then full refund and receipt cancellation. Verify provider dashboard, entitlement revocation, ledger and notifications. Use approved lawful fiscal arrangement, no fake tax records.
6. Only after these checks, stage public scope with scripts/set-commerce-scope.py public. The script requires a completed fiscalized and refunded live order with sent receipt and no unresolved live operations. Operator must still confirm actual inbox delivery and provider results. Recreate bricklab and verify a regular account. To pause new orders, stage closed, recreate bricklab; do not disable reconciliation or the fiscal worker.
The script intentionally requires the automatic NPD path for public opening. If the provider supplies another approved fiscal solution, review the integration and gate explicitly before launch.

## Recovery and fiscal operations
Verified provider callbacks recover an unattached payment with matching ID, amount, order metadata and environment. Full refund received before payment settlement is applied in the same DB transaction as fulfillment and revocation. A pending refund without an ID is checked with GET of the original payment; no automatic POST. A partial refund is rejected for manual review. If no provider payment ID or callback is ever recovered and the idempotency window expires, the order requires operator/provider reconciliation, not a new payment. Finance shows full queue counters, and admin refunds remain available even while checkout is closed. Refunded orders with a pending initial receipt are flagged for manual verification: register only an actual FNS receipt and confirm an actual correction, never fabricate a fiscal record. Uncertain fiscal writes remain blocked for read-only reconciliation. No claims about legal sufficiency of this exception workflow; confirm the correct procedure with the tax/payment provider before public launch.

Checkout confirmation IDs are durable per buyer and environment. Live checkout requires a UUID, and retries with the same ID return the original order even after settlement. Multiple attempts can point to the same pending order. The redirect destination is persisted for consistent provider idempotency. This is not a permanent ban on intentional repeat purchases: a newly confirmed attempt after a completed order can purchase additional Plus or storage. Existing unattached orders created before this migration may require provider/manual reconciliation if their original redirect cannot be reconstructed.
