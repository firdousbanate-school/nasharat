-- 0019: audit actor spoofing and broad circular write policies.
--
-- 1. The audit trigger used to trust `app.actor_label` / `x-actor-label` even
--    when the request carried an authenticated JWT. A signed-in user could
--    therefore write arbitrary actor labels into audit_logs. Derive the actor
--    from the database identity whenever `auth.uid()` is present; only
--    service-role/tooling writes (no JWT) may supply an explicit actor.
--
-- 2. `set_audit_actor` was executable by every authenticated user and writes
--    session-level settings, which can leak across pooled connections. No
--    application code calls it; keep it for the service role only.
--
-- 3. `circulars_update` / `circulars_delete` let anyone with circular.create
--    (including department-scoped users) edit or delete every circular. Limit
--    creators to their own rows; school-wide publishers may manage all rows.

-- --------------------------------------------------------------- audit trigger
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entity uuid;
  v_meta jsonb;
  v_actor_id uuid;
  v_actor_label text;
  v_action text;
  v_headers jsonb;
begin
  -- Cascade deletes on security-critical tables are always logged; deep
  -- cascades on other tables are skipped to avoid log bloat.
  if pg_trigger_depth() > 1 then
    if tg_table_name not in ('user_role_assignments', 'role_permissions', 'roles', 'profiles') then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  end if;

  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  if auth.uid() is not null then
    -- A real signed-in user: the JWT is the only trusted identity. Ignore
    -- session settings and headers, which the caller controls.
    v_actor_id := auth.uid();
    v_actor_label := (
      select case
        when p.email is not null and p.full_name is not null then p.full_name || ' (' || p.email || ')'
        when p.full_name is not null then p.full_name
        when p.email is not null then p.email
      end
      from public.profiles p
      where p.id = v_actor_id
    );
  else
    -- Service-role or direct tooling has no JWT; allow an explicit actor.
    v_actor_id := coalesce(
      nullif(current_setting('app.actor_id', true), '')::uuid,
      nullif(v_headers ->> 'x-actor-id', '')::uuid
    );
    v_actor_label := coalesce(
      nullif(current_setting('app.actor_label', true), ''),
      nullif(v_headers ->> 'x-actor-label', ''),
      (
        select case
          when p.email is not null and p.full_name is not null then p.full_name || ' (' || p.email || ')'
          when p.full_name is not null then p.full_name
          when p.email is not null then p.email
        end
        from public.profiles p
        where p.id = v_actor_id
      ),
      case when v_actor_id is null then 'system' end
    );
  end if;

  -- Keep personal data out of the log for profiles.
  if tg_table_name = 'profiles' then
    v_old := case when v_old is null then null else jsonb_build_object(
      'id', v_old -> 'id',
      'is_active', v_old -> 'is_active',
      'department_id', v_old -> 'department_id'
    ) end;
    v_new := case when v_new is null then null else jsonb_build_object(
      'id', v_new -> 'id',
      'is_active', v_new -> 'is_active',
      'department_id', v_new -> 'department_id'
    ) end;
  end if;

  -- Keep long policy text out of the log for school_settings.
  if tg_table_name = 'school_settings' then
    v_old := case when v_old is null then null else jsonb_build_object(
      'academic_year', v_old -> 'academic_year',
      'working_days', v_old -> 'working_days',
      'locale', v_old -> 'locale',
      'date_format', v_old -> 'date_format'
    ) end;
    v_new := case when v_new is null then null else jsonb_build_object(
      'academic_year', v_new -> 'academic_year',
      'working_days', v_new -> 'working_days',
      'locale', v_new -> 'locale',
      'date_format', v_new -> 'date_format'
    ) end;
  end if;

  if tg_table_name = 'role_permissions' then
    -- role_permissions has a composite key: log against the role.
    v_entity := coalesce(v_new ->> 'role_id', v_old ->> 'role_id')::uuid;
  elsif tg_table_name = 'school_settings' then
    v_entity := null;
  else
    v_entity := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  end if;

  v_meta := jsonb_build_object('before', v_old, 'after', v_new);

  if tg_table_name = 'schools' then
    v_meta := v_meta || jsonb_build_object(
      'school_name_ar', coalesce(v_new ->> 'name_ar', v_old ->> 'name_ar'),
      'school_name_en', coalesce(v_new ->> 'name_en', v_old ->> 'name_en')
    );
  elsif tg_table_name = 'role_permissions' then
    v_meta := v_meta || jsonb_build_object(
      'permission_key', coalesce(v_new ->> 'permission_key', v_old ->> 'permission_key')
    );
  end if;

  v_action := case
    when pg_trigger_depth() > 1 and tg_op = 'DELETE' then tg_table_name || '.cascade_delete'
    else tg_table_name || '.' || lower(tg_op)
  end;

  insert into public.audit_logs (actor_id, actor_label, action, entity_type, entity_id, metadata)
  values (v_actor_id, v_actor_label, v_action, tg_table_name, v_entity, v_meta);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- The RPC is server-side only; a user-scoped caller could otherwise seed
-- session settings that a later service-role connection might trust.
revoke execute on function public.set_audit_actor(uuid, text) from authenticated;
revoke execute on function public.set_audit_actor(uuid, text) from anon;

-- --------------------------------------------------------------- circular RLS
drop policy if exists circulars_update on public.circulars;
create policy circulars_update on public.circulars
  for update to authenticated
  using (
    created_by = auth.uid()
    or public.has_school_wide_permission('circular.publish')
  )
  with check (
    created_by = auth.uid()
    or public.has_school_wide_permission('circular.publish')
  );

drop policy if exists circulars_delete on public.circulars;
create policy circulars_delete on public.circulars
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.has_school_wide_permission('circular.publish')
  );
