-- Migration 053: Lås databasen for den offentlige anon-nøgle
--
-- Ingen tabeller havde Row Level Security. Med Supabases standard-rettigheder kan alle med
-- anon-nøglen (NEXT_PUBLIC_SUPABASE_ANON_KEY — ikke hemmelig) læse og skrive alle tabeller
-- via REST-API'et, inkl. ordrer og kunders e-mails.
--
-- Appen bruger udelukkende service role (createServiceClient), som ignorerer RLS og ikke
-- berøres af REVOKE nedenfor. Storage-policies for produktbilleder (042) berøres ikke.

-- 1. RLS på alle eksisterende tabeller — uden policies = ingen adgang for anon/authenticated
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- 2. Fjern direkte rettigheder (dækker også views, som ellers omgår RLS)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3. Samme for fremtidige objekter oprettet fra SQL Editor
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
