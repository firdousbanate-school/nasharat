-- 0018: achievement images in the public-assets bucket.
--
-- Achievements store their image in the same public bucket as calendar events.
-- The original policies only accepted the `calendar/` prefix, so every
-- achievement image upload was rejected by Storage RLS. Achievements are
-- inserted under `calendar.manage` (see school_achievements_insert in 0014),
-- so the storage policy uses the same permission.

drop policy if exists "achievement images uploaded by calendar managers" on storage.objects;
create policy "achievement images uploaded by calendar managers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'public-assets'
    and public.is_active_user()
    and (storage.foldername(name))[1] = 'achievements'
    and public.has_permission('calendar.manage')
  );

drop policy if exists "achievement images updated by calendar managers" on storage.objects;
create policy "achievement images updated by calendar managers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'achievements'
    and public.has_permission('calendar.manage')
  )
  with check (
    bucket_id = 'public-assets'
    and (storage.foldername(name))[1] = 'achievements'
    and public.has_permission('calendar.manage')
  );
