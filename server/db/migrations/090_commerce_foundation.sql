-- Real commerce is isolated from historical Robokassa test tables.
-- Additive schema only. The web role cannot create payments or entitlements yet.
CREATE TABLE bricklab.commerce_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES bricklab.users(id) ON DELETE RESTRICT,
 sku text NOT NULL CHECK (length(sku) BETWEEN 1 AND 120),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
 amount_kopecks integer NOT NULL CHECK (amount_kopecks BETWEEN 1 AND 10000000),
 currency text NOT NULL DEFAULT 'RUB' CHECK (currency='RUB'),
 provider text NOT NULL CHECK (provider='yookassa'),
 environment text NOT NULL CHECK (environment IN ('test','live')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','canceled','refunded')),
 payment_id text CHECK (length(payment_id) BETWEEN 1 AND 128),
 idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 refunded_at timestamptz,
 UNIQUE(provider,environment,payment_id),
 UNIQUE(id,user_id),
 CHECK (status NOT IN ('succeeded','refunded') OR (payment_id IS NOT NULL AND paid_at IS NOT NULL)),
 CHECK ((status='refunded')=(refunded_at IS NOT NULL)),
 CHECK (refunded_at IS NULL OR refunded_at>=paid_at)
);
CREATE INDEX commerce_orders_owner_idx ON bricklab.commerce_orders(user_id,created_at DESC,id);
CREATE TABLE bricklab.commerce_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL,
 user_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('storage','badge','themeBundle','theme','subscription','instruction')),
 sku text NOT NULL CHECK (length(sku) BETWEEN 1 AND 120),
 target text NOT NULL DEFAULT '',
 granted_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 revoked_at timestamptz,
 FOREIGN KEY (order_id,user_id) REFERENCES bricklab.commerce_orders(id,user_id) ON DELETE RESTRICT,
 UNIQUE(order_id,kind,sku,target),
 CHECK (expires_at IS NULL OR expires_at>granted_at),
 CHECK (revoked_at IS NULL OR revoked_at>=granted_at),
 CHECK ((kind='subscription')=(expires_at IS NOT NULL)),
 CHECK (
  (kind='storage' AND sku IN ('slots-20','slots-30','slots-100') AND target='') OR
  (kind='badge' AND sku IN ('supporter','bronze-builder','silver-builder','gold-builder','diamond-patron','founders-club') AND target='') OR
  (kind='themeBundle' AND sku='theme-collection' AND target='') OR
  (kind='subscription' AND sku IN ('plus-1','plus-3','plus-12') AND target='') OR
  (kind='theme' AND sku=target AND target IN ('carbon','neon','blueprint','titanium','ember','aurora')) OR
  (kind='instruction' AND target ~ '^[0-9]{1,12}-[0-9]{1,4}$' AND sku='instruction-'||target)
 )
);
CREATE INDEX commerce_grants_owner_idx ON bricklab.commerce_grants(user_id,order_id);
ALTER TABLE bricklab.commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bricklab.commerce_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_orders_owner ON bricklab.commerce_orders FOR SELECT TO bricklab_app
 USING (user_id::text=nullif(current_setting('bricklab.user_id',true),''));
CREATE POLICY commerce_grants_owner ON bricklab.commerce_grants FOR SELECT TO bricklab_app
 USING (user_id::text=nullif(current_setting('bricklab.user_id',true),''));
REVOKE ALL ON bricklab.commerce_orders,bricklab.commerce_grants FROM PUBLIC,bricklab_app;
GRANT SELECT ON bricklab.commerce_orders,bricklab.commerce_grants TO bricklab_app;
