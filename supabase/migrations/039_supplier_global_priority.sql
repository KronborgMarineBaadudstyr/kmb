-- Migration 039: global_priority på suppliers
-- Sætter en global foretrukken rækkefølge på leverandører.
-- Lavere tal = højere prioritet. NULL = ingen preference sat.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS global_priority int;

-- Sæt default prioriteter baseret på kendte leverandører
UPDATE suppliers SET global_priority = 1 WHERE name = 'Palby';
UPDATE suppliers SET global_priority = 2 WHERE name = 'Columbus Marine';
UPDATE suppliers SET global_priority = 3 WHERE name = 'Engholm';
UPDATE suppliers SET global_priority = 4 WHERE name = 'Scanmarine';
UPDATE suppliers SET global_priority = 5 WHERE name = 'Kap-Horn';
UPDATE suppliers SET global_priority = 6 WHERE name = 'HF Industri Marine';

CREATE INDEX IF NOT EXISTS suppliers_global_priority_idx ON suppliers (global_priority NULLS LAST);
