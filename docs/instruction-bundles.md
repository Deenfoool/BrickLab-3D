# Instruction Build Pack — admin sandbox only

Proposed product: three named, audited paid sets, permanent access, 15% discount on their individual price. This is an alternative to fungible credits, which would create an unused-balance liability and more complicated refund rules. The user chooses all three sets before paying. No expiry, no random selection, no auto-renewal. Do not stack with Plus or consume a Welcome Pack credit.

The sandbox quote in src/menu/instruction-bundle-pricing.js recalculates each line from trusted server catalog counts and allocates the discounted total deterministically in integer kopecks. Migration 108, admin-only quote/checkout endpoints, catalog UI, order reservations and atomic three-grant fulfillment are implemented for test orders. Existing verified full-refund processing revokes all grants for that order. No live pack order can be created. This implementation has not yet been tested.

Live release requirements (remain outstanding):
- Server obtains audited products and account entitlements, checks exact set IDs, reserves all three set targets under the existing account lock, and persists immutable lines and amount. Never trust browser prices or ownership.
- Pending bundle reservation blocks individual purchase or welcome claim for the same sets until resolved. Expiry requires verified provider terminal state, not a local timer alone.
- Payment idempotency, webhook verification, all-or-nothing grants and persisted line allocations. Test environment remains separate; sandbox never creates production entitlement.
- Decide whether to offer only full-order refunds or support partial refunds with separately recorded allocation, grants and receipt correction. Do not implement partial refunds by decrementing an unrelated credit counter.
- Show exact names, total, line allocations and refund terms before payment. Verify fiscal receipt itemization against the actual payment provider and fiscal worker.
- Add race, replay, refund, price-change, chargeback and migration integration tests before enabling the SKU.

Existing individual order fulfillment is preserved by a wrapper; fiscal worker and live catalog remain unchanged. Full refunds only in the sandbox. The 15% discount is a proposal to evaluate against conversion and margins, not a proven optimum.
