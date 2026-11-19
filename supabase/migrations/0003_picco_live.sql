-- Picco Garage analytics. Anonymous events from the game; only admins can read them.

create table if not exists public.picco_admins (
  email text primary key
);
alter table public.picco_admins enable row level security;
-- no policies: only security definer functions read it
insert into public.picco_admins (email) values ('buddhirc5@gmail.com') on conflict do nothing;

create table if not exists public.picco_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  visitor     text not null check (char_length(visitor) between 8 and 64),
  session     text not null check (char_length(session) between 8 and 64),
  type        text not null check (char_length(type) <= 24),
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2048),
  device      text check (char_length(device) <= 16),
  os          text check (char_length(os) <= 16),
  lang        text check (char_length(lang) <= 16),
  tz          text check (char_length(tz) <= 64),
  referrer    text check (char_length(referrer) <= 200)
);
create index if not exists picco_events_time on public.picco_events (created_at desc);
create index if not exists picco_events_type_time on public.picco_events (type, created_at desc);
create index if not exists picco_events_visitor on public.picco_events (visitor);
alter table public.picco_events enable row level security;
drop policy if exists "picco_events insert" on public.picco_events;
create policy "picco_events insert" on public.picco_events for insert to anon, authenticated with check (created_at > now() - interval '1 minute');
-- no select policy: nobody reads events directly

create or replace function public.picco_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.picco_admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- One call returns everything the dashboard needs for the last p_days days.
create or replace function public.picco_admin_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
  out jsonb;
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  with e as (select * from public.picco_events where created_at >= since),
  days as (select generate_series(date_trunc('day', since), date_trunc('day', now()), interval '1 day') d),
  sess as (select session, min(created_at) s, max(created_at) t from e group by session)
  select jsonb_build_object(
    'visitors', (select count(distinct visitor) from e),
    'players', (select count(distinct visitor) from e where type = 'drive_start'),
    'sessions', (select count(*) from sess),
    'drives', (select count(*) from e where type = 'drive_start'),
    'finished', (select count(*) from e where type = 'drive_end'),
    'km', (select coalesce(round(sum((props->>'km')::numeric), 1), 0) from e where type = 'drive_end'),
    'drive_minutes', (select coalesce(round(sum((props->>'time')::numeric) / 60), 0) from e where type = 'drive_end'),
    'avg_session_min', (select coalesce(round(avg(extract(epoch from t - s)) / 60, 1), 0) from sess),
    'live', (select count(distinct visitor) from public.picco_events where created_at > now() - interval '5 minutes'),
    'all_time_visitors', (select count(distinct visitor) from public.picco_events),
    'all_time_players', (select count(distinct visitor) from public.picco_events where type = 'drive_start'),
    'daily', (select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
                'visitors', (select count(distinct visitor) from e where date_trunc('day', created_at) = d),
                'players', (select count(distinct visitor) from e where type = 'drive_start' and date_trunc('day', created_at) = d),
                'drives', (select count(*) from e where type = 'drive_start' and date_trunc('day', created_at) = d)) order by d) from days),
    'funnel', jsonb_build_array(
                (select count(distinct visitor) from e where type = 'visit'),
                (select count(distinct visitor) from e where type = 'garage'),
                (select count(distinct visitor) from e where type = 'city'),
                (select count(distinct visitor) from e where type = 'drive_start'),
                (select count(distinct visitor) from e where type = 'drive_end')),
    'cities', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select props->>'city' k, count(*) n from e where type = 'drive_start' group by 1) x),
    'vehicles', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select props->>'vehicle' k, count(*) n from e where type = 'drive_start' group by 1) x),
    'modes', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select props->>'mode' k, count(*) n from e where type = 'drive_start' group by 1) x),
    'devices', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select coalesce(device, 'unknown') k, count(distinct visitor) n from e group by 1) x),
    'os', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select coalesce(os, 'unknown') k, count(distinct visitor) n from e group by 1) x),
    'timezones', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select coalesce(tz, 'unknown') k, count(distinct visitor) n from e group by 1 order by 2 desc limit 8) x),
    'referrers', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (select coalesce(nullif(referrer, ''), 'direct') k, count(distinct visitor) n from e where type = 'visit' group by 1 order by 2 desc limit 8) x),
    'hours', (select jsonb_agg((select count(*) from e where extract(hour from created_at at time zone 'Asia/Colombo') = h and type in ('visit', 'drive_start'))) from generate_series(0, 23) h),
    'recent', (select coalesce(jsonb_agg(r), '[]') from (select created_at, type, visitor, device, os, props from e where type <> 'heartbeat' order by created_at desc limit 40) r)
  ) into out;
  return out;
end $$;

revoke all on function public.picco_admin_stats(int) from public, anon;
grant execute on function public.picco_admin_stats(int) to authenticated;
revoke all on function public.picco_is_admin() from public, anon;
grant execute on function public.picco_is_admin() to authenticated;

-- ═════════════ 0003: players, live config, grants, extended admin ═════════════
-- if 0002 ran earlier with the strict type list, relax it
do $$ begin
  alter table public.picco_events drop constraint if exists picco_events_type_check;
  alter table public.picco_events add constraint picco_events_type_check check (char_length(type) <= 24);
exception when others then null; end $$;

-- live config: anyone can read; only admins write (via RPC)
create table if not exists public.picco_config (
  key text primary key check (char_length(key) <= 40),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.picco_config enable row level security;
drop policy if exists "picco_config read" on public.picco_config;
create policy "picco_config read" on public.picco_config for select to anon, authenticated using (true);

-- player snapshots, keyed by the anonymous device id
create table if not exists public.picco_players (
  visitor text primary key check (char_length(visitor) between 8 and 64),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  snap jsonb not null default '{}'::jsonb check (pg_column_size(snap) < 4096)
);
create index if not exists picco_players_seen on public.picco_players (last_seen desc);
alter table public.picco_players enable row level security;  -- no policies: RPC only

-- gifts from the admin, claimed by the game on next sync
create table if not exists public.picco_grants (
  id bigint generated always as identity primary key,
  visitor text not null,
  coins int not null default 0 check (coins between 0 and 1000000),
  gems int not null default 0 check (gems between 0 and 10000),
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists picco_grants_open on public.picco_grants (visitor) where claimed_at is null;
alter table public.picco_grants enable row level security;  -- no policies: RPC only

-- Game: store a snapshot of this device's progress and collect any gifts.
create or replace function public.picco_sync(p_visitor text, p_snap jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare g jsonb;
begin
  if char_length(p_visitor) not between 8 and 64 or pg_column_size(p_snap) >= 4096 then return '[]'::jsonb; end if;
  insert into public.picco_players (visitor, snap) values (p_visitor, p_snap)
    on conflict (visitor) do update set snap = excluded.snap, last_seen = now();
  with c as (update public.picco_grants set claimed_at = now() where visitor = p_visitor and claimed_at is null returning coins, gems, note)
  select coalesce(jsonb_agg(jsonb_build_object('coins', coins, 'gems', gems, 'note', note)), '[]'::jsonb) into g from c;
  return g;
end $$;
revoke all on function public.picco_sync(text, jsonb) from public;
grant execute on function public.picco_sync(text, jsonb) to anon, authenticated;

-- Admin: write a live config key.
create or replace function public.picco_admin_set_config(p_key text, p_value jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  insert into public.picco_config (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- Admin: list players (search by id prefix), newest activity first.
create or replace function public.picco_admin_players(p_search text default '', p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  return (select coalesce(jsonb_agg(p order by p.last_seen desc), '[]'::jsonb) from (
    select pl.visitor, pl.first_seen, pl.last_seen, pl.snap,
      (select count(*) from public.picco_events e where e.visitor = pl.visitor and e.type = 'drive_start') drives,
      (select max(device) || ' · ' || max(os) from public.picco_events e where e.visitor = pl.visitor) device
    from public.picco_players pl
    where p_search = '' or pl.visitor ilike p_search || '%'
    order by pl.last_seen desc limit greatest(1, least(p_limit, 500))) p);
end $$;

-- Admin: one player's details, recent events and gifts.
create or replace function public.picco_admin_player(p_visitor text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  return jsonb_build_object(
    'player', (select to_jsonb(pl) from public.picco_players pl where pl.visitor = p_visitor),
    'events', (select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) from (select created_at, type, props, device, os, tz, visitor from public.picco_events where visitor = p_visitor and type <> 'heartbeat' order by created_at desc limit 60) r),
    'grants', (select coalesce(jsonb_agg(g order by g.created_at desc), '[]'::jsonb) from public.picco_grants g where g.visitor = p_visitor));
end $$;

-- Admin: give coins/gems to a player (delivered next time they open the game).
create or replace function public.picco_admin_grant(p_visitor text, p_coins int, p_gems int, p_note text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  insert into public.picco_grants (visitor, coins, gems, note) values (p_visitor, greatest(0, p_coins), greatest(0, p_gems), left(p_note, 120));
end $$;

-- Admin: retention cohorts and gameplay breakdown.
create or replace function public.picco_admin_game(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 365)));
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  return (with first as (select visitor, date_trunc('day', min(created_at)) d0 from public.picco_events group by visitor),
    act as (select distinct visitor, date_trunc('day', created_at) d from public.picco_events),
    coh as (select f.d0, count(*) n,
        count(*) filter (where exists (select 1 from act a where a.visitor = f.visitor and a.d = f.d0 + interval '1 day')) d1,
        count(*) filter (where exists (select 1 from act a where a.visitor = f.visitor and a.d between f.d0 + interval '2 day' and f.d0 + interval '7 day')) d7,
        count(*) filter (where exists (select 1 from act a where a.visitor = f.visitor and a.d between f.d0 + interval '8 day' and f.d0 + interval '30 day')) d30
      from first f where f.d0 >= since group by f.d0),
    de as (select * from public.picco_events where type = 'drive_end' and created_at >= since)
  select jsonb_build_object(
    'cohorts', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d0, 'YYYY-MM-DD'), 'n', n, 'd1', d1, 'd7', d7, 'd30', d30) order by d0 desc), '[]'::jsonb) from coh),
    'events', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select props->>'event' k, count(*) n,
        round(avg((props->>'stars')::numeric), 2) stars, round(100.0 * count(*) filter (where (props->>'stars')::int > 0) / count(*)) pass
        from de where props ? 'event' group by 1 order by 2 desc limit 50) x),
    'types', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select props->>'mode' k, count(*) n from de group by 1) x),
    'police', jsonb_build_object('caught', (select coalesce(sum((props->>'caught')::int), 0) from de), 'escaped', (select coalesce(sum((props->>'escaped')::int), 0) from de)),
    'passengers', (select coalesce(sum((props->>'passengers')::int), 0) from de),
    'stations', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select props->>'station' k, count(*) n from public.picco_events where type = 'music' and created_at >= since group by 1) x),
    'levels', (select coalesce(jsonb_agg(x order by x.k), '[]'::jsonb) from (select (snap->>'level')::int k, count(*) n from public.picco_players where snap ? 'level' group by 1) x),
    'config', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.picco_config)));
end $$;

do $$ declare f text; begin
  foreach f in array array['picco_admin_set_config(text, jsonb)', 'picco_admin_players(text, int)', 'picco_admin_player(text)', 'picco_admin_grant(text, int, int, text)', 'picco_admin_game(int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
