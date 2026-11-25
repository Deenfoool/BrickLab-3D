# BrickLab Store: test-only release
This version deliberately cannot create live payments. Real sales are blocked in code, regardless of environment flags. Only authenticated administrators can start test purchases. Test orders and test entitlements live in separate tables and never grant paid cosmetics in the actual profile inventory.

## Robokassa settings
MerchantLogin: bricklab3d; hash SHA-256 in test settings. Use separate test passwords, never commit or log them. ResultURL: https://bricklab-3d.ru/api/payments/robokassa/result (POST). SuccessURL: https://bricklab-3d.ru/payment/success (GET); FailURL: https://bricklab-3d.ru/payment/fail (GET). Both browser redirects go back to the store, neither changes a payment. Confirm ResultURL delivery using a publicly accessible test instance, or the production instance with the test-only admin gate after separate approval. Private staging via SSH tunnel cannot receive external callbacks.

Keep BRICKLAB_PAYMENTS_ENABLED=false by default. Enable only after applying migration 017 and passing DB and HTTP tests, with BRICKLAB_ROBOKASSA_TEST=true, BRICKLAB_ROBOKASSA_HASH=sha256, login and both test passwords populated. Restart the app container to apply environment changes. Never change to live settings to run this release.

## Test
1. Sign in as administrator and open #store. Confirm real sales disabled.
2. Enable test mode for the selected instance. Check the test warning and consent, choose a product.
3. Complete Robokassa's simulated payment; return and refresh the store. Order is confirmed only by signed POST notification. A repeated POST must not create another entitlement.
4. Verify the real profile inventory remains unchanged. Check that another account cannot create test checkout or view finance.
5. Disable payments after the test.

## Live-mode blockers
Approved offer, privacy notice and seller disclosures; review data handling and storage location; payment-provider approval and verified automatic NPD receipts; separate real order/payment and fulfillment migration with refunds/reconciliation, live-vs-test separation, receipt and refund lifecycle, actual customer consent and purchase history; deployment and security review. No live money, no actual receipt generation, no real entitlement in this release.

## Deployment safety
Save the release script to a local file, run it with Bash rather than piping it to bash -s. Commands use noninteractive migration and stdin isolation. Run unit and isolated PostgreSQL tests before staging or production. Do not enable live settings.
