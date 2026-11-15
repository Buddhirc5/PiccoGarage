-- Picco Garage core schema.
-- Lives in the shared KiwiPath project, so every object is prefixed picco_
-- and nothing here touches KiwiPath tables, triggers or policies.
-- Clients may only READ their own rows. Every write that affects coins,
-- purchases, profiles or results goes through SECURITY DEFINER functions.

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.picco_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 20),
  avatar_url    text,
  lang          text not null default 'en' check (lang in ('en', 'si')),
  coins         integer not null default 500 check (coins >= 0),
  xp            integer not null default 0 check (xp >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.picco_profiles enable row level security;
drop policy if exists "picco_profiles read own" on public.picco_profiles;
create policy "picco_profiles read own" on public.picco_profiles
  for select to authenticated using (id = (select auth.uid()));

-- ── Coin ledger (audit trail of every coin change) ─────────────────────────
create table if not exists public.picco_coin_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.picco_profiles (id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  ref         text,
  created_at  timestamptz not null default now()
);
create index if not exists picco_coin_ledger_user on public.picco_coin_ledger (user_id, created_at desc);
alter table public.picco_coin_ledger enable row level security;
drop policy if exists "picco_ledger read own" on public.picco_coin_ledger;
create policy "picco_ledger read own" on public.picco_coin_ledger
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Garages (saved vehicle designs) ────────────────────────────────────────
create table if not exists public.picco_garages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.picco_profiles (id) on delete cascade,
  vehicle_class  text not null check (vehicle_class in ('tuktuk', 'private_bus', 'public_bus')),
  slot           smallint not null default 0 check (slot between 0 and 9),
  name           text not null default 'My ride' check (char_length(name) <= 40),
  design         jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  unique (user_id, vehicle_class, slot)
);
alter table public.picco_garages enable row level security;
drop policy if exists "picco_garages own select" on public.picco_garages;
drop policy if exists "picco_garages own insert" on public.picco_garages;
drop policy if exists "picco_garages own update" on public.picco_garages;
drop policy if exists "picco_garages own delete" on public.picco_garages;
create policy "picco_garages own select" on public.picco_garages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "picco_garages own insert" on public.picco_garages
  for insert to authenticated with check (user_id = (select auth.uid()) and pg_column_size(design) < 32768);
create policy "picco_garages own update" on public.picco_garages
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and pg_column_size(design) < 32768);
create policy "picco_garages own delete" on public.picco_garages
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── Shop catalogue + purchases ─────────────────────────────────────────────
create table if not exists public.picco_items (
  id           text primary key,
  category     text not null,
  price_coins  integer not null check (price_coins >= 0),
  active       boolean not null default true
);
alter table public.picco_items enable row level security;
drop policy if exists "picco_items read all" on public.picco_items;
create policy "picco_items read all" on public.picco_items for select using (true);

create table if not exists public.picco_purchases (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.picco_profiles (id) on delete cascade,
  item_id     text not null references public.picco_items (id),
  price_paid  integer not null,
  method      text not null default 'coins' check (method in ('coins', 'card_stub', 'grant')),
  created_at  timestamptz not null default now(),
  unique (user_id, item_id)
);
alter table public.picco_purchases enable row level security;
drop policy if exists "picco_purchases read own" on public.picco_purchases;
create policy "picco_purchases read own" on public.picco_purchases
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Race results + leaderboard ─────────────────────────────────────────────
create table if not exists public.picco_race_results (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.picco_profiles (id) on delete cascade,
  mode          text not null,
  map_id        text not null,
  vehicle_class text not null,
  weather       text not null,
  position      smallint,
  time_ms       integer not null check (time_ms > 0),
  score         integer not null check (score >= 0),
  coins_earned  integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists picco_results_board on public.picco_race_results (mode, map_id, created_at desc, score desc);
create index if not exists picco_results_user on public.picco_race_results (user_id, created_at desc);
alter table public.picco_race_results enable row level security;
drop policy if exists "picco_results read all" on public.picco_race_results;
-- Leaderboards are public within the game (display names only, via the view below).
create policy "picco_results read all" on public.picco_race_results
  for select to authenticated using (true);

-- ── Weekly race series progress ────────────────────────────────────────────
create table if not exists public.picco_series_progress (
  user_id      uuid not null references public.picco_profiles (id) on delete cascade,
  week_start   date not null,
  race_index   smallint not null check (race_index between 0 and 2),
  best_score   integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, week_start, race_index)
);
alter table public.picco_series_progress enable row level security;
drop policy if exists "picco_series read own" on public.picco_series_progress;
create policy "picco_series read own" on public.picco_series_progress
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Functions ──────────────────────────────────────────────────────────────

-- Create (or fetch) the caller's game profile. Called by the client after login.
create or replace function public.picco_ensure_profile(p_display_name text default null)
returns public.picco_profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  meta jsonb;
  prof public.picco_profiles;
  clean text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select * into prof from public.picco_profiles where id = uid;
  if found then return prof; end if;
  select raw_user_meta_data into meta from auth.users where id = uid;
  clean := left(btrim(coalesce(nullif(p_display_name, ''), meta ->> 'name', meta ->> 'full_name', 'Driver')), 20);
  if char_length(clean) < 2 then clean := 'Driver'; end if;
  insert into public.picco_profiles (id, display_name, avatar_url)
  values (uid, clean, meta ->> 'avatar_url')
  returning * into prof;
  insert into public.picco_coin_ledger (user_id, delta, reason) values (uid, 500, 'welcome_bonus');
  return prof;
end $$;

create or replace function public.picco_update_profile(p_display_name text, p_lang text)
returns public.picco_profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.picco_profiles;
  clean text := left(btrim(coalesce(p_display_name, '')), 20);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if char_length(clean) < 2 then raise exception 'name too short'; end if;
  update public.picco_profiles
     set display_name = clean,
         lang = case when p_lang in ('en', 'si') then p_lang else lang end,
         updated_at = now()
   where id = uid
   returning * into prof;
  return prof;
end $$;

-- Wipe the caller's Picco Garage data only. The shared auth account stays.
create or replace function public.picco_delete_my_data()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.picco_profiles where id = auth.uid();
end $$;

revoke all on function public.picco_ensure_profile(text) from public, anon;
revoke all on function public.picco_update_profile(text, text) from public, anon;
revoke all on function public.picco_delete_my_data() from public, anon;
grant execute on function public.picco_ensure_profile(text) to authenticated;
grant execute on function public.picco_update_profile(text, text) to authenticated;
grant execute on function public.picco_delete_my_data() to authenticated;
