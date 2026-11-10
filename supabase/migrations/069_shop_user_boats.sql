-- Migration 069: Kundens båd (Min båd) gemt på profilen
-- Indtil nu lå bådprofilen kun i browseren (localStorage). Vælger en besøgende Sejlbåd/Motorbåd og
-- angiver navn/længde + e-mail, bekræftes e-mailen via login-linket, og båden gemmes her.
-- Én båd pr. kunde for nu (unik shop_user_id).

CREATE TABLE IF NOT EXISTS shop_user_boats (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_user_id  uuid        NOT NULL UNIQUE REFERENCES shop_users(id) ON DELETE CASCADE,
  name          text        CHECK (char_length(name) <= 60),
  boat_type     text        CHECK (boat_type IN ('sejlbåd', 'motorbåd')),
  length_ft     numeric(5,1) CHECK (length_ft BETWEEN 5 AND 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_user_boats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_user_boats FROM anon, authenticated;
GRANT ALL ON shop_user_boats TO service_role;
