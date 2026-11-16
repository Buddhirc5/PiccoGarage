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
  type        text not null check (type in ('visit','heartbeat','garage','vehicle','upgrade','city','drive_start','drive_end','music','camera','share')),
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
