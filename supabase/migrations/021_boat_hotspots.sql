-- 021_boat_hotspots.sql
-- Visuel båd-kategori-navigation til lovesaling.dk
-- Admin konfigurerer hotspot-positioner på sejlbåd/motorbåd tegning.
-- Frontend renderer prikker + pile + kategorikort.

CREATE TABLE IF NOT EXISTS boat_hotspots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  boat_type     text        NOT NULL CHECK (boat_type IN ('sailboat', 'motorboat')),
  label         text        NOT NULL,          -- Visningstekst, f.eks. "Anker & Fortøjning"
  category_slug text        NOT NULL,          -- URL-slug til webshop, f.eks. "anker-fortojning"
  description   text,                          -- Valgfri undertekst i label-kortet
  x_pct         numeric(5,2) NOT NULL,         -- Vandret position 0–100 (% af bredde)
  y_pct         numeric(5,2) NOT NULL,         -- Lodret position 0–100 (% af højde)
  label_side    text        NOT NULL DEFAULT 'right'
                            CHECK (label_side IN ('left', 'right', 'top', 'bottom')),
  color         text        NOT NULL DEFAULT '#1d4ed8',  -- Hex farve på hotspot
  sort_order    integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boat_hotspots_boat_type_idx ON boat_hotspots (boat_type);
CREATE INDEX IF NOT EXISTS boat_hotspots_active_idx    ON boat_hotspots (boat_type, is_active, sort_order);

-- ── Seed data: Sejlbåd ────────────────────────────────────────────────────────
INSERT INTO boat_hotspots (boat_type, label, category_slug, description, x_pct, y_pct, label_side, color, sort_order) VALUES
  ('sailboat', 'Sejl & Rig',          'sejl-og-rig',          'Master, bom, stag og sejl',            50, 28,  'right',  '#1d4ed8', 10),
  ('sailboat', 'Anker & Fortøjning',  'anker-fortojning',     'Ankre, kæder, bøjer og fendere',       18, 68,  'left',   '#0891b2', 20),
  ('sailboat', 'Navigation',          'navigation',           'GPS, kortplotter, kompass og VHF',     72, 52,  'right',  '#7c3aed', 30),
  ('sailboat', 'Belysning',           'belysning',            'Navigationslys, kabys og deklys',      82, 38,  'right',  '#b45309', 40),
  ('sailboat', 'Motor & Drivlinje',   'motor-drivlinje',      'Påhængsmotor, skrue og brændstof',     62, 82,  'right',  '#b91c1c', 50),
  ('sailboat', 'Sikkerhed',           'sikkerhed',            'Redningsveste, flåder og pyroteknik',  26, 44,  'left',   '#dc2626', 60),
  ('sailboat', 'Kabys & Komfort',     'kabys-komfort',        'Komfur, køling, soveudstyr',           38, 72,  'left',   '#059669', 70),
  ('sailboat', 'Dæksudstyr',          'daeksudstyr',          'Blokke, klamper, vinsjer og løbetøj',  55, 55,  'right',  '#0284c7', 80);

-- ── Seed data: Motorbåd ───────────────────────────────────────────────────────
INSERT INTO boat_hotspots (boat_type, label, category_slug, description, x_pct, y_pct, label_side, color, sort_order) VALUES
  ('motorboat', 'Motor & Fremdrift',    'motor-fremdrift',      'Motorer, drev, skrue og styring',      75, 72,  'right',  '#b91c1c', 10),
  ('motorboat', 'Navigation & Elektronik', 'navigation',        'Ekkolod, GPS, kortplotter og radar',   55, 38,  'right',  '#7c3aed', 20),
  ('motorboat', 'Anker & Fortøjning',  'anker-fortojning',     'Ankre, ankerspil og fortøjningsudstyr', 20, 65,  'left',   '#0891b2', 30),
  ('motorboat', 'Belysning',           'belysning',            'Navigationslys, søgelys og dæklys',    78, 48,  'right',  '#b45309', 40),
  ('motorboat', 'Sikkerhed',           'sikkerhed',            'Redningsveste, brandslukker, EPIRBer',  30, 42,  'left',   '#dc2626', 50),
  ('motorboat', 'Kabys & Komfort',     'kabys-komfort',        'Kombinus, køleboks, toilet og varme',   42, 60,  'left',   '#059669', 60),
  ('motorboat', 'Brændstof & Tanke',   'braendstof',           'Tanke, slanger, filtre og målere',     65, 82,  'right',  '#92400e', 70),
  ('motorboat', 'Dæksudstyr',          'daeksudstyr',          'Fortøjningsklamper, badebro, bimini',   35, 28,  'left',   '#0284c7', 80);
