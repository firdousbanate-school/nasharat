-- 0020: shared fixed-window rate limit buckets.
--
-- The application-level auth limiter used to count in process memory, so each
-- serverless instance kept its own window and the effective limit scaled with
-- the number of instances. Store the counters in Postgres instead: one atomic
-- upsert per key gives every instance the same window.
--
-- The table is server-only. RLS is on with no policies, and both the table and
-- the RPC are revoked from the anon/authenticated roles; the service role is
-- the only caller. `consume_rate_limit_token` is deliberately tolerant of bad
-- input (it allows the request) so a bug in a caller cannot lock users out.

create table if not exists public.rate_limit_buckets (
  key text primary key,
  hits integer not null default 0 check (hits >= 0),
  reset_at timestamptz not null
);

create index if not exists rate_limit_buckets_reset_at_idx
  on public.rate_limit_buckets (reset_at);

alter table public.rate_limit_buckets enable row level security;

revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit_token(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_hits integer;
begin
  if p_key is null or p_key = ''
     or p_limit is null
     or p_window_ms is null or p_window_ms <= 0 then
    return true;
  end if;

  -- Opportunistic cleanup keeps the table bounded without a scheduled job.
  -- Only about one call in a hundred pays for the delete, and only rows whose
  -- window has already expired are removed.
  if random() < 0.01 then
    delete from public.rate_limit_buckets where reset_at < v_now;
  end if;

  -- A single statement both starts a fresh window and counts a hit inside the
  -- current one. The upsert takes a row lock, so concurrent callers serialize
  -- on the key and no hit is lost.
  with upsert as (
    insert into public.rate_limit_buckets as b (key, hits, reset_at)
    values (p_key, 1, v_now + make_interval(secs => p_window_ms::double precision / 1000.0))
    on conflict (key) do update
      set hits = case
                   when b.reset_at <= v_now then 1
                   else b.hits + 1
                 end,
          reset_at = case
                       when b.reset_at <= v_now then excluded.reset_at
                       else b.reset_at
                     end
    returning hits
  )
  select hits into v_hits from upsert;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.consume_rate_limit_token(text, integer, integer) from public;
revoke execute on function public.consume_rate_limit_token(text, integer, integer) from anon, authenticated;
grant execute on function public.consume_rate_limit_token(text, integer, integer) to service_role;
