-- 0021: align circular attachment deletes with the circular row policy.
--
-- 0019 restricted circulars_update/circulars_delete to the creator or a
-- school-wide circular.publish holder. The attachment table and its storage
-- objects kept the older "any circular.create holder" rule, so a
-- department-scoped user could still delete another user's attachment (via the
-- app or directly through the Storage API). Use the same predicate here, and
-- require the parent circular to still exist.

drop policy if exists circular_attachments_delete on public.circular_attachments;
create policy circular_attachments_delete on public.circular_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.circulars c
      where c.id = circular_id
        and (
          c.created_by = auth.uid()
          or public.has_school_wide_permission('circular.publish')
        )
    )
  );

drop policy if exists "circular attachments deleted by circular managers" on storage.objects;
create policy "circular attachments deleted by circular managers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'circular-attachments'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and exists (
      select 1 from public.circulars c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (
          c.created_by = auth.uid()
          or public.has_school_wide_permission('circular.publish')
        )
    )
  );
