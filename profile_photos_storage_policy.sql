-- Storage Policies for profile-photos bucket
-- Run these in Supabase SQL Editor after creating the bucket

-- ============================================
-- STORAGE POLICIES FOR PROFILE PHOTOS
-- ============================================

-- 1. Allow public read access to all profile photos
CREATE POLICY "Public profile photos are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

-- 2. Allow authenticated users to upload their own profile photos
-- Files are stored as: profile-photos/{userId}-{timestamp}.{ext}
CREATE POLICY "Users can upload their own profile photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = 'profile-photos' AND
  -- Extract userId from filename (before the first dash)
  split_part((storage.filename(name)), '-', 1) = auth.uid()::text
);

-- 3. Allow users to update their own profile photos
CREATE POLICY "Users can update their own profile photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  split_part((storage.filename(name)), '-', 1) = auth.uid()::text
);

-- 4. Allow users to delete their own profile photos
CREATE POLICY "Users can delete their own profile photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  split_part((storage.filename(name)), '-', 1) = auth.uid()::text
);

-- ============================================
-- INSTRUCTIONS
-- ============================================
-- 1. Create bucket named 'profile-photos' in Supabase Storage
-- 2. Set bucket to PUBLIC
-- 3. Run this SQL in Supabase SQL Editor
-- 4. Test by uploading a profile photo from the app
