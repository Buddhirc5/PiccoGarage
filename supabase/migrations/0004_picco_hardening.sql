-- Picco Garage security hardening (production/security/security-audit-2026-11-24-full.md)
-- SEC-002: events are written only through picco_track (validated, server time, rate limited)
-- SEC-003: snapshots and props are type-checked so admin casts never fail; bad rows cleaned
-- SEC-011: live config accepts known keys with sane values only
-- Safe to run more than once.

-- 1) no more direct inserts from the public key
drop policy if exists "picco_events insert" on public.picco_events;

-- 2) validated ingest
create or replace function public.picco_track(p_events jsonb)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare e jsonb; n int := 0; v text; recent int; props jsonb; k text;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then return 0; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    v := e->>'visitor';
    if v is null or char_length(v) not between 8 and 64 or char_length(coalesce(e->>'session', '')) not between 8 and 64 then continue; end if;
    if (e->>'type') not in ('visit','heartbeat','garage','vehicle','upgrade','city','drive_start','drive_end','music','camera','share') then continue; end if;
    -- rate limit: at most 120 events per device per minute
    select count(*) into recent from public.picco_events where visitor = v and created_at > now() - interval '1 minute';
    if recent >= 120 then exit; end if;
    props := case when jsonb_typeof(e->'props') = 'object' then e->'props' else '{}'::jsonb end;
    if pg_column_size(props) >= 2048 then props := '{}'::jsonb; end if;
    -- numbers the dashboards add up must be numbers
    foreach k in array array['km','time','stars','caught','escaped','passengers','position','top','drift','nm','overtakes','level','w','h'] loop
      if props ? k and jsonb_typeof(props->k) <> 'number' then props := props - k; end if;
    end loop;
    insert into public.picco_events (visitor, session, type, props, device, os, lang, tz, referrer)
    values (v, e->>'session', e->>'type', props, left(e->>'device', 16), left(e->>'os', 16), left(e->>'lang', 16), left(e->>'tz', 64), left(e->>'referrer', 200));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.picco_track(jsonb) from public;
grant execute on function public.picco_track(jsonb) to anon, authenticated;

-- 3) player snapshots: keep only well-typed fields
create or replace function public.picco_sync(p_visitor text, p_snap jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare g jsonb; s jsonb := '{}'::jsonb; k text;
begin
  if char_length(p_visitor) not between 8 and 64 or jsonb_typeof(p_snap) <> 'object' or pg_column_size(p_snap) >= 4096 then return '[]'::jsonb; end if;
  foreach k in array array['level','xp','coins','gems','stars','drives','km','wins','passengers','escapes'] loop
    if jsonb_typeof(p_snap->k) = 'number' then s := s || jsonb_build_object(k, p_snap->k); end if;
  end loop;
  if jsonb_typeof(p_snap->'vehicle') = 'string' then s := s || jsonb_build_object('vehicle', left(p_snap->>'vehicle', 20)); end if;
  if jsonb_typeof(p_snap->'controls') = 'string' then s := s || jsonb_build_object('controls', left(p_snap->>'controls', 10)); end if;
  if jsonb_typeof(p_snap->'owned') = 'array' then
    s := s || jsonb_build_object('owned', (select coalesce(jsonb_agg(left(x, 20)), '[]'::jsonb) from jsonb_array_elements_text(p_snap->'owned') as t(x)));
  end if;
  insert into public.picco_players (visitor, snap) values (p_visitor, s)
    on conflict (visitor) do update set snap = excluded.snap, last_seen = now();
  with c as (update public.picco_grants set claimed_at = now() where visitor = p_visitor and claimed_at is null returning coins, gems, note)
  select coalesce(jsonb_agg(jsonb_build_object('coins', coins, 'gems', gems, 'note', note)), '[]'::jsonb) into g from c;
  return g;
end $$;
revoke all on function public.picco_sync(text, jsonb) from public;
grant execute on function public.picco_sync(text, jsonb) to anon, authenticated;

-- 4) live config: known keys and shapes only
create or replace function public.picco_admin_set_config(p_key text, p_value jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.picco_is_admin() then raise exception 'not authorised'; end if;
  if p_key = 'coinMultiplier' then
    if jsonb_typeof(p_value) <> 'number' or (p_value::text)::numeric not between 1 and 3 then raise exception 'coinMultiplier must be 1-3'; end if;
  elsif p_key in ('weeklyEvent', 'message') then
    if jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') > 140 then raise exception '% must be a short string', p_key; end if;
  elsif p_key = 'stations' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 or pg_column_size(p_value) > 8000 then raise exception 'stations must be a short list'; end if;
  else
    raise exception 'unknown config key %', p_key;
  end if;
  insert into public.picco_config (key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;
revoke all on function public.picco_admin_set_config(text, jsonb) from public, anon;
grant execute on function public.picco_admin_set_config(text, jsonb) to authenticated;

-- 5) clean anything malformed or future-dated that got in before this migration
delete from public.picco_events where created_at > now() + interval '5 minutes';
delete from public.picco_events e where exists (
  select 1 from unnest(array['km','time','stars','caught','escaped','passengers']) k
  where e.props ? k and jsonb_typeof(e.props->k) <> 'number');
update public.picco_players set snap = snap - 'level' where snap ? 'level' and jsonb_typeof(snap->'level') <> 'number';
update public.picco_players set snap = snap - 'owned' where snap ? 'owned' and jsonb_typeof(snap->'owned') <> 'array';
