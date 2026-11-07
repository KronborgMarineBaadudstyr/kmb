-- Migration 056: Admin-konti med e-mail + magic link (erstatter fælles DASHBOARD_PASSWORD)
-- Adskilt fra shoppens kunder (shop_users). Kun SHA-256 af tokens gemmes.

CREATE TABLE IF NOT EXISTS admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  name          text,
  -- owner: kan oprette, ændre og deaktivere admins · admin: almindelig adgang
  role          text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  disabled_at   timestamptz,
  created_by    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS admin_login_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_login_tokens_user ON admin_login_tokens(admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_login_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions     ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_users, admin_login_tokens, admin_sessions FROM anon, authenticated;
GRANT  ALL ON admin_users, admin_login_tokens, admin_sessions TO service_role;

-- Første ejer. Ret e-mailen her, før migrationen køres, hvis det skal være en anden.
INSERT INTO admin_users (email, role) VALUES ('core@dejliglama.dk', 'owner')
ON CONFLICT (email) DO UPDATE SET role = 'owner', disabled_at = NULL;
