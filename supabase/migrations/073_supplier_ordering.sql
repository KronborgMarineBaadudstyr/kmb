-- Bestillingsoplysninger pr. leverandør — vises og redigeres på Indkøb (/admin/purchasing), så alt hvad der skal til
-- for at bestille står ét sted. Felter (alle valgfri):
--   portal_url       link til leverandørens B2B-portal
--   customer_number  vores kundenummer hos leverandøren
--   order_email      e-mail til bestillinger (ellers contact_email)
--   order_phone      telefon til bestillinger (ellers contact_phone)
--   cutoff           tidsfrist, fx "kl. 14 — afsendes samme dag"
--   delivery         leveringstid, fx "1-2 hverdage"
--   min_order        minimumsordre i kr ekskl. moms
--   free_freight     fragtfri fra kr ekskl. moms
--   notes            fri tekst (login-hint, særlige regler …) — skriv aldrig adgangskoder her

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ordering jsonb NOT NULL DEFAULT '{}';
