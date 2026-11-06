-- Migration 042: Supabase Storage bucket til produktbilleder (manuelle uploads)
-- Køres i Supabase SQL Editor

-- Opret public bucket til produktbilleder
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Tillad authenticated (service role) at uploade og slette
CREATE POLICY IF NOT EXISTS "Service role kan uploade produktbilleder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY IF NOT EXISTS "Service role kan slette produktbilleder"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- Tillad offentlig læsning
CREATE POLICY IF NOT EXISTS "Offentlig læsning af produktbilleder"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');
