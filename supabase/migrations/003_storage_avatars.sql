-- 003_storage_avatars.sql
-- Profile photo storage.
--
-- The bucket itself is created through the dashboard or the Storage API, not
-- SQL. Settings that matter:
--   id/name          avatars
--   public           true      (so <Image src> works without a signed URL)
--   file_size_limit  2097152   (2 MB; the app compresses to ~30-60 KB first)
--   allowed_mime     image/jpeg, image/png, image/webp
--
-- Files live at {auth.uid()}/avatar.jpg — the folder name IS the user id,
-- which is what every policy below checks. That makes ownership structural
-- rather than something the client has to be trusted about.

-- ⚠️ The SELECT policy is REQUIRED for uploads, not just for reading.
-- The app uploads with upsert, which compiles to INSERT ... ON CONFLICT, and
-- Postgres must read whether a conflicting row exists before it can write.
-- Dropping this makes every upload fail with "new row violates row-level
-- security policy" — even against an empty bucket.
--
-- Scoped to the user's own folder rather than the whole bucket, so nobody can
-- enumerate the file list and harvest staff auth ids.
drop policy if exists avatar_select_own on storage.objects;
create policy avatar_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatar_insert_own on storage.objects;
create policy avatar_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Both USING and WITH CHECK: USING decides which rows may be updated,
-- WITH CHECK validates the row being written. An upsert needs both.
drop policy if exists avatar_update_own on storage.objects;
create policy avatar_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatar_delete_own on storage.objects;
create policy avatar_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
