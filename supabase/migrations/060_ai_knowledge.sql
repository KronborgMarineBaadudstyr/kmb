-- Migration 060: Butikkens egen viden til AI-assistenten (redigeres i admin → AI-viden)
-- Kør efter 059.

CREATE TABLE IF NOT EXISTS ai_knowledge (
  id         text PRIMARY KEY,               -- 'shop' = butikkens egen viden
  content    text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_knowledge FROM anon, authenticated;
GRANT ALL ON ai_knowledge TO service_role;
