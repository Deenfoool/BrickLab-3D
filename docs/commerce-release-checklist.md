# Commerce release checklist

This branch is a sandbox release, not authorization to charge customers.

## Test checkout
- Keep BRICKLAB_YOOKASSA_TEST_ENABLED=false until a YooKassa test shop is configured.
- Use test shop ID and test_ secret in the VPS .env (permissions 0600), never commit or log either.
- Configure payment.succeeded notifications at https://bricklab-3d.ru/api/payments/yookassa/test-result.
- Test checkout is administrator-only; all test grants are excluded from real entitlements.
- Verify provider GET, matching amount, order metadata, payment ID and mode before fulfillment.
- Check duplicate notifications, pending/canceled payment recovery and a subscription renewal.
- Do not enable live checkout using test credentials. This version does not implement live checkout, live refunds or NPD receipt issuance.

## Paid instruction readiness
- Hosted precomputed region JSON is only served through an access-checked API.
- The browser still contains a recognition engine; this is not complete DRM or server-side OCR.
- No set is audited yet. Keep release mode disabled. Before enabling it, move premium recognition/data into a non-public server store, audit supported books and actual step maps, ensure alternate canonical URLs cannot bypass policy, and test guest/owner/Plus/expired/refunded access.
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
