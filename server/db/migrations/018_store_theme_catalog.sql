-- Expand the catalog and real inventory allowlists. No live grants are enabled.
ALTER TABLE bricklab.store_products DROP CONSTRAINT store_products_sku_check;
ALTER TABLE bricklab.store_products ADD CONSTRAINT store_products_sku_check CHECK(sku IN ('carbon','neon','blueprint','titanium','ember','aurora'));
ALTER TABLE bricklab.profiles DROP CONSTRAINT profiles_background_check;
ALTER TABLE bricklab.profiles ADD CONSTRAINT profiles_background_check CHECK(background IN ('default','first-build','carbon','neon','blueprint','titanium','ember','aurora'));
ALTER TABLE bricklab.public_profiles DROP CONSTRAINT public_profiles_background_theme_check;
ALTER TABLE bricklab.public_profiles ADD CONSTRAINT public_profiles_background_theme_check CHECK(background_theme IN ('default','first-build','carbon','neon','blueprint','titanium','ember','aurora'));
ALTER TABLE bricklab.cosmetic_entitlements DROP CONSTRAINT cosmetic_entitlements_item_check;
ALTER TABLE bricklab.cosmetic_entitlements ADD CONSTRAINT cosmetic_entitlements_item_check CHECK(item IN ('carbon','neon','blueprint','titanium','ember','aurora'));
UPDATE bricklab.store_products SET title='Фон мастерской Carbon GT' WHERE sku='carbon';
UPDATE bricklab.store_products SET title='Фон мастерской Neon Circuit' WHERE sku='neon';
INSERT INTO bricklab.store_products(sku,title,amount_kopecks) VALUES
 ('blueprint','Фон мастерской Blueprint Studio',12900),
 ('titanium','Фон мастерской Titanium Factory',17900),
 ('ember','Фон мастерской Ember Forge',19900),
 ('aurora','Фон мастерской Aurora Lab',19900);
