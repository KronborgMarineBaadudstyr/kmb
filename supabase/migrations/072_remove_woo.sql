-- Fjerner WooCommerce fra databasen. Webshoppen er LoveSailing.dk (egen), og Woo bruges ikke længere.
--
-- Bevares:
--   * De gamle webshop-ordrer (salgshistorik, kundekobling, levetid, analyse) — source 'woo' → 'old_webshop'
--   * Bestillingsnr. på produkter (bruges i søgning) — woo_bestillingsnummer → bestillingsnummer
-- Slettes:
--   * products.woo_product_id, woo_sync_status, last_synced_woo_at
--   * product_variants.woo_variation_id
--   * orders.woo_order_id, woo_created_at (ordered_at er allerede udfyldt fra woo_created_at i migration 054)
--   * sync_log-rækker til Woo
-- Kører i én transaktion: afhænger noget (fx et view oprettet i Supabase) af en kolonne, rulles alt tilbage.

BEGIN;

-- Bestillingsnr. bevares under neutralt navn
ALTER TABLE products RENAME COLUMN woo_bestillingsnummer TO bestillingsnummer;
UPDATE products SET original_number_source = 'bestillingsnummer' WHERE original_number_source = 'woo_bestillingsnummer';

-- Sikkerhed: ordredato skal være sat, før woo_created_at forsvinder
UPDATE orders SET ordered_at = COALESCE(woo_created_at, created_at) WHERE ordered_at IS NULL;

ALTER TABLE products
  DROP COLUMN IF EXISTS woo_product_id,
  DROP COLUMN IF EXISTS woo_sync_status,
  DROP COLUMN IF EXISTS last_synced_woo_at;

ALTER TABLE product_variants DROP COLUMN IF EXISTS woo_variation_id;

ALTER TABLE orders
  DROP COLUMN IF EXISTS woo_order_id,
  DROP COLUMN IF EXISTS woo_created_at;

-- Værdier der nævner Woo
UPDATE orders           SET source = 'old_webshop'   WHERE source = 'woo';
UPDATE product_images   SET source = 'manual'        WHERE source = 'woo';
UPDATE product_files    SET source = 'manual'        WHERE source = 'woo';
UPDATE inventory_events SET source = 'webshop_order' WHERE source = 'woo_order';
DELETE FROM sync_log WHERE target = 'woo';

COMMIT;
