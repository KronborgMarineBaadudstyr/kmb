-- Migration 042: Supabase Storage bucket til produktbilleder (manuelle uploads)
-- Køres i Supabase SQL Editor

-- Opret public bucket til produktbilleder
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Tillad authenticated (service role) at uploade og slette
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role kan uploade produktbilleder' AND tablename = 'objects') THEN
    CREATE POLICY "Service role kan uploade produktbilleder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'product-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role kan slette produktbilleder' AND tablename = 'objects') THEN
    CREATE POLICY "Service role kan slette produktbilleder"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'product-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Offentlig læsning af produktbilleder' AND tablename = 'objects') THEN
    CREATE POLICY "Offentlig læsning af produktbilleder"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'product-images');
  END IF;
END $$;
