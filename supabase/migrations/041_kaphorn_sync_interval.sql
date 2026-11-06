-- Migration 041: Ret Kap-Horn sync_interval_hours til 24 (dagligt)
-- Cron-jobbet kører dagligt; 8760 var sat som "sæsonmæssig" men er misvisende.
UPDATE suppliers
SET sync_interval_hours = 24
WHERE name = 'Kap-Horn';
