-- Migration 051: shop_users + saved_carts
-- Kunder (ikke admin-brugere). Minimum: e-mail + marketing opt-in.

CREATE TABLE IF NOT EXISTS shop_users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text UNIQUE NOT NULL,
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  marketing_opt_in_at timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_users_email ON shop_users(email);

-- Gemte kurve med et unikt token til delt link
CREATE TABLE IF NOT EXISTS saved_carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
  token      text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'),
  cart_data  jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_saved_carts_token   ON saved_carts(token);
CREATE INDEX IF NOT EXISTS idx_saved_carts_user_id ON saved_carts(user_id);
