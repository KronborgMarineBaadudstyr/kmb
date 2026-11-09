-- Migration 065: Fælles variant-egenskaber (Indstillinger → Sortiment → Variant-egenskaber)
-- Én liste for hele butikken over hvad der adskiller varianter: Størrelse, Farve, Længde, Godstykkelse …
--   unit:   enhed for tal-egenskaber (mm, m, l, W …) — tom for liste-/tekst-egenskaber
--   values: tilladte værdier i den rækkefølge de skal vises, med synonymer der oversættes til værdien
--           [{"value":"Marineblå","synonyms":["navy","marine","mørkeblå"]}, …]
-- Bruges af Saml ens varer (forslag + oversættelse af synonymer), varetyper og søgefiltre.

CREATE TABLE IF NOT EXISTS variant_attributes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  unit        text,
  values      jsonb       NOT NULL DEFAULT '[]',
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS variant_attributes_updated_at ON variant_attributes;
CREATE TRIGGER variant_attributes_updated_at
  BEFORE UPDATE ON variant_attributes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- "Farve" og "farve" er samme egenskab
CREATE UNIQUE INDEX IF NOT EXISTS variant_attributes_name_lower ON variant_attributes (lower(name));

ALTER TABLE variant_attributes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON variant_attributes FROM anon, authenticated;
GRANT ALL ON variant_attributes TO service_role;

-- Startværdier
INSERT INTO variant_attributes (name, unit, values, sort_order) VALUES
('Størrelse', NULL, '[
  {"value":"XXS","synonyms":["2xs"]},
  {"value":"XS","synonyms":["x-small","extra small"]},
  {"value":"S","synonyms":["small"]},
  {"value":"M","synonyms":["medium"]},
  {"value":"L","synonyms":["large"]},
  {"value":"XL","synonyms":["x-large","extra large"]},
  {"value":"XXL","synonyms":["2xl","xx-large"]},
  {"value":"XXXL","synonyms":["3xl","xxx-large"]}
]'::jsonb, 1),
('Farve', NULL, '[
  {"value":"Hvid","synonyms":["white","hvide","hvidt"]},
  {"value":"Sort","synonyms":["black","sorte"]},
  {"value":"Grå","synonyms":["grey","gray"]},
  {"value":"Sølv","synonyms":["silver"]},
  {"value":"Blå","synonyms":["blue","blåt"]},
  {"value":"Marineblå","synonyms":["navy","marine","mørkeblå"]},
  {"value":"Lyseblå","synonyms":["light blue","lightblue"]},
  {"value":"Turkis","synonyms":["turquoise"]},
  {"value":"Grøn","synonyms":["green","grønt"]},
  {"value":"Gul","synonyms":["yellow","gule"]},
  {"value":"Orange","synonyms":[]},
  {"value":"Rød","synonyms":["red","røde","rødt"]},
  {"value":"Pink","synonyms":["rosa"]},
  {"value":"Lilla","synonyms":["purple"]},
  {"value":"Brun","synonyms":["brown"]},
  {"value":"Beige","synonyms":["sand"]},
  {"value":"Guld","synonyms":["gold"]},
  {"value":"Transparent","synonyms":["klar","clear"]}
]'::jsonb, 2)
ON CONFLICT DO NOTHING;

-- Egenskaber varetyperne allerede bruger (navn + enhed)
INSERT INTO variant_attributes (name, unit, sort_order)
SELECT DISTINCT ON (lower(a->>'name')) a->>'name', NULLIF(a->>'unit', ''), 10
FROM product_types, jsonb_array_elements(product_types.variant_attributes) a
WHERE coalesce(a->>'name', '') <> ''
ORDER BY lower(a->>'name')
ON CONFLICT DO NOTHING;
