import './admin.css';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../auth/supabase';
import { live } from '../core/live';
import { EVENTS, eventById } from '../game/career';

/**
 * /admin: analytics dashboard. Sign-in is Supabase auth (password or Google).
 * The email check here is only for the UI; the real gate is the
 * picco_admin_stats() database function, which refuses anyone not listed in
 * picco_admins.
 */
const ADMIN_EMAIL = 'buddhirc5@gmail.com';
const root = document.getElementById('admin')!;

function h<T extends HTMLElement = HTMLElement>(tag: string, attrs: Record<string, unknown> = {}, ...kids: (Node | string | null | false | undefined)[]): T {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div') as T;
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c != null && c !== false) el.append(c);
  return el;
}
const brand = () => h('div.brand', {}, h('i'), 'Picco Garage', h('span', {}, 'Admin'));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const here = () => `${location.origin}/admin`;

// ── sign in ─────────────────────────────────────────────────────────────────
function showLogin(note = '', recovery = false) {
  const email = h<HTMLInputElement>('input.in', { type: 'email', autocomplete: 'username', value: ADMIN_EMAIL });
  const pass = h<HTMLInputElement>('input.in', { type: 'password', autocomplete: recovery ? 'new-password' : 'current-password', placeholder: recovery ? 'New password (8+ characters)' : 'Password' });
  const msg = h('div.msg', {}, note);
  const say = (t: string, err = false) => { msg.textContent = t; msg.className = `msg${err ? ' err' : ''}`; };

  if (recovery) {
    const save = h<HTMLButtonElement>('button.btn.primary', { type: 'submit' }, 'Save password');
    const form = h<HTMLFormElement>('form.card', {}, brand(), h('h1', {}, 'Set your password'), h('p', {}, 'Choose the password you will use to open this dashboard.'), h('label', {}, 'New password', pass), save, msg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pass.value.length < 8) return say('Use at least 8 characters.', true);
      save.disabled = true;
      const { error } = await supabase.auth.updateUser({ password: pass.value });
      save.disabled = false;
      if (error) return say(error.message, true);
      history.replaceState(null, '', '/admin');
      void boot();
    });
    root.replaceChildren(h('div.login', {}, form));
    return;
  }

  const go = h<HTMLButtonElement>('button.btn.primary', { type: 'submit' }, 'Sign in');
  const google = h<HTMLButtonElement>('button.btn.ghost', { type: 'button', onclick: async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here(), queryParams: { login_hint: ADMIN_EMAIL, prompt: 'select_account' } } });
  } }, 'Continue with Google');
  const reset = h<HTMLButtonElement>('button.link', { type: 'button', onclick: async () => {
    const em = email.value.trim().toLowerCase();
    if (em !== ADMIN_EMAIL) return say('Only the admin email can be used here.', true);
    reset.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: here() });
    reset.disabled = false;
    say(error ? error.message : `A link to set your password was sent to ${em}.`, !!error);
  } }, 'Set or reset password by email');
  const form = h<HTMLFormElement>('form.card', {}, brand(), h('h1', {}, 'Sign in'), h('p', {}, 'Picco Garage analytics. Admin access only.'),
    h('label', {}, 'Email', email), h('label', {}, 'Password', pass), go, msg, h('div.or', {}, 'or'), google, reset);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = email.value.trim().toLowerCase();
    if (em !== ADMIN_EMAIL) return say('This account does not have admin access.', true);
    go.disabled = true; say('Signing in…');
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: pass.value });
    go.disabled = false;
    if (error) return say(error.message === 'Invalid login credentials' ? 'Wrong password. If you have not set one yet, use "Set or reset password by email".' : error.message, true);
    void boot();
  });
  root.replaceChildren(h('div.login', {}, form));
}

// ── dashboard ───────────────────────────────────────────────────────────────
type KV = { k: string | null; n: number };
interface Stats {
  visitors: number; players: number; sessions: number; drives: number; finished: number; km: number; drive_minutes: number; avg_session_min: number;
  live: number; all_time_visitors: number; all_time_players: number;
  daily: { day: string; visitors: number; players: number; drives: number }[];
  funnel: number[]; cities: KV[]; vehicles: KV[]; modes: KV[]; devices: KV[]; os: KV[]; timezones: KV[]; referrers: KV[]; hours: number[];
  recent: { created_at: string; type: string; visitor: string; device: string | null; os: string | null; props: Record<string, unknown> }[];
}
const NAMES: Record<string, string> = { pbus: 'Private Coach', sltb: 'Red Route Bus', tuk: 'Three-Wheeler', pink: 'Pink Queen', leyland: 'Blue Thunder', ashok: 'Sun Blazer', tukking: 'Street King', tukneon: 'Neon Rider', free: 'Free roam', race: 'Race', sprint: 'Sprint', circuit: 'Circuit', knockout: 'Knockout', drift: 'Drift', route: 'Bus route', checkpoint: 'Checkpoint', nearmiss: 'Near miss', kandy: 'Kandy', share: 'Share',
  colombo: 'Colombo', galle: 'Galle', anuradhapura: 'Anuradhapura', kottawa: 'Kottawa', pannipitiya: 'Pannipitiya',
  phone: 'Phone', desktop: 'Desktop', tablet: 'Tablet', direct: 'Direct', drive_start: 'Drive start', drive_end: 'Drive end', visit: 'Visit', upgrade: 'Upgrade', vehicle: 'Vehicle', city: 'City', garage: 'Garage', music: 'Music', camera: 'Camera' };
const label = (k: string | null) => (k ? NAMES[k] ?? k.replace(/_/g, ' ') : 'unknown');

let days = 30, timer = 0;

type View = 'overview' | 'players' | 'game' | 'config';
let view: View = 'overview';

async function showDashboard(session: Session) {
  const content = h('main', {}, h('div.skel'), h('div.skel'));
  const live = h('span.live', {}, h('i'), h('span', {}, '—'));
  const seg = h('div.seg', {}, ...[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, t]) =>
    h('button', { class: d === days ? 'on' : '', onclick: (e: Event) => { days = d as number; seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); void load(); } }, String(t))));
  const tabs = h('nav.vtabs', {}, ...([['overview', 'Overview'], ['players', 'Players'], ['game', 'Gameplay & retention'], ['config', 'Live config']] as [View, string][]).map(([v, t]) =>
    h('button', { class: v === view ? 'on' : '', onclick: (e: Event) => { view = v; tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); void load(); } }, t)));
  root.replaceChildren(
    h('header.top', {}, brand(), h('div.spacer'), live, seg, h('span.who', {}, session.user.email ?? ''),
      h('button.btn.ghost.sm', { onclick: async () => { await supabase.auth.signOut(); showLogin(); } }, 'Sign out')),
    tabs, content, h('div.tip', { id: 'tip' }));

  const fail = (msg: string) => {
    const missing = /function|does not exist|schema cache|relation/i.test(msg);
    content.replaceChildren(h('div.setup', {}, missing
      ? 'This part of the dashboard is not switched on in the database yet. Approve the "picco_live" migration in the chat and it fills in automatically.'
      : msg === 'not authorised' ? 'This account is signed in but is not on the admin list.' : `Could not load: ${msg}`));
  };
  const load = async () => {
    if (view === 'overview') {
      const { data, error } = await supabase.rpc('picco_admin_stats', { p_days: days });
      if (error) return fail(error.message);
      const s = data as Stats;
      (live.lastChild as HTMLElement).textContent = `${s.live} online now`;
      render(content, s);
    } else if (view === 'players') await players(content, fail);
    else if (view === 'game') {
      const { data, error } = await supabase.rpc('picco_admin_game', { p_days: days });
      if (error) return fail(error.message);
      game(content, data as Game);
    } else {
      const { data, error } = await supabase.rpc('picco_admin_game', { p_days: 1 });
      if (error) return fail(error.message);
      config(content, (data as Game).config);
    }
  };
  await load();
  clearInterval(timer);
  timer = window.setInterval(() => { if (view === 'overview') void load(); }, 60_000);
}

// ── players ─────────────────────────────────────────────────────────────────
interface Snap { level?: number; xp?: number; coins?: number; gems?: number; stars?: number; drives?: number; km?: number; wins?: number; vehicle?: string; owned?: string[]; passengers?: number; escapes?: number; controls?: string }
interface PlayerRow { visitor: string; first_seen: string; last_seen: string; snap: Snap; drives: number; device: string | null }
const ago = (t: string) => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

async function players(main: HTMLElement, fail: (m: string) => void, search = '') {
  const { data, error } = await supabase.rpc('picco_admin_players', { p_search: search, p_limit: 200 });
  if (error) return fail(error.message);
  const rows = data as PlayerRow[];
  const q = h<HTMLInputElement>('input.in', { placeholder: 'Search by player id', value: search });
  q.addEventListener('change', () => void players(main, fail, q.value.trim()));
  const detail = h('div');
  main.replaceChildren(
    h('div.h', {}, h('h1', {}, 'Players'), h('p', {}, `${rows.length} players${search ? ` matching "${search}"` : ''}. Each row is one device; sign-in comes later.`)),
    h('div.toolbar', {}, q),
    detail,
    h('div.panel', {}, rows.length ? h('div.scroll', {}, h('table', {}, h('thead', {}, h('tr', {}, ...['Player', 'Level', 'Stars', 'Coins', 'Gems', 'Drives', 'Km', 'Vehicle', 'Device', 'Last seen'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr.click', { onclick: () => void player(detail, r.visitor) },
        h('td.num', {}, r.visitor.slice(0, 8)), h('td.num', {}, String(r.snap.level ?? '—')), h('td.num', {}, String(r.snap.stars ?? 0)), h('td.num', {}, fmt(r.snap.coins ?? 0)), h('td.num', {}, fmt(r.snap.gems ?? 0)),
        h('td.num', {}, fmt(r.drives)), h('td.num', {}, String(r.snap.km ?? 0)), h('td', {}, label(r.snap.vehicle ?? null)), h('td', {}, r.device ?? ''), h('td', {}, ago(r.last_seen)))))))
      : h('div.empty', {}, 'No players have synced yet. Players appear after they open the updated game.')));
}

async function player(box: HTMLElement, id: string) {
  box.replaceChildren(h('div.skel'));
  const { data, error } = await supabase.rpc('picco_admin_player', { p_visitor: id });
  if (error) { box.replaceChildren(h('div.setup', {}, error.message)); return; }
  const d = data as { player: PlayerRow | null; events: Stats['recent']; grants: { coins: number; gems: number; note: string; created_at: string; claimed_at: string | null }[] };
  const sn = d.player?.snap ?? {};
  const coins = h<HTMLInputElement>('input.in', { type: 'number', min: '0', value: '1000' });
  const gems = h<HTMLInputElement>('input.in', { type: 'number', min: '0', value: '0' });
  const note = h<HTMLInputElement>('input.in', { placeholder: 'Message shown to the player (optional)', maxlength: '120' });
  const msg = h('div.msg');
  const send = h<HTMLButtonElement>('button.btn.primary', { onclick: async () => {
    send.disabled = true;
    const { error: e } = await supabase.rpc('picco_admin_grant', { p_visitor: id, p_coins: +coins.value || 0, p_gems: +gems.value || 0, p_note: note.value });
    send.disabled = false;
    if (e) { msg.textContent = e.message; msg.className = 'msg err'; return; }
    void player(box, id);
  } }, 'Send gift');
  const kv = (k: string, v: string) => h('div', {}, h('span', {}, k), h('b.num', {}, v));
  box.replaceChildren(h('div.panel.pdetail', {},
    h('h3', {}, `Player ${id.slice(0, 8)}`, h('button.btn.ghost.sm', { onclick: () => box.replaceChildren() }, 'Close')),
    h('div.kv', {}, kv('Level', String(sn.level ?? '—')), kv('Stars', String(sn.stars ?? 0)), kv('Coins', fmt(sn.coins ?? 0)), kv('Gems', fmt(sn.gems ?? 0)),
      kv('Races won', fmt(sn.wins ?? 0)), kv('Km', String(sn.km ?? 0)), kv('Passengers', fmt(sn.passengers ?? 0)), kv('Police escapes', fmt(sn.escapes ?? 0)),
      kv('Vehicles', (sn.owned ?? []).map((v) => label(v)).join(', ') || '—'), kv('Controls', sn.controls ?? '—'),
      kv('First seen', d.player ? new Date(d.player.first_seen).toLocaleDateString() : '—'), kv('Last seen', d.player ? ago(d.player.last_seen) : '—')),
    h('div.grant', {}, h('label', {}, 'Coins', coins), h('label', {}, 'Gems', gems), h('label.wide', {}, 'Note', note), send, msg),
    d.grants.length ? h('div.small', {}, 'Gifts: ', ...d.grants.map((g) => h('span.pill', {}, `${fmt(g.coins)} coins · ${g.gems} gems · ${g.claimed_at ? 'collected' : 'waiting'}`))) : null,
    recent(d.events)));
  box.scrollIntoView({ behavior: 'smooth' });
}

// ── gameplay & retention ─────────────────────────────────────────────────────
type Row = { k: string | null; n: number; stars?: number; pass?: number };
interface Game {
  cohorts: { day: string; n: number; d1: number; d7: number; d30: number }[];
  events: Row[]; types: Row[]; police: { caught: number; escaped: number }; passengers: number; stations: Row[]; levels: Row[];
  config: Record<string, unknown>;
}
function game(main: HTMLElement, g: Game) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const tot = g.cohorts.reduce((a, c) => ({ n: a.n + c.n, d1: a.d1 + c.d1, d7: a.d7 + c.d7, d30: a.d30 + c.d30 }), { n: 0, d1: 0, d7: 0, d30: 0 });
  const kpi = (t: string, v: string, sub: string, hi = false) => h(`div.kpi${hi ? '.hi' : ''}`, {}, h('span', {}, t), h('b.num', {}, v), h('small', {}, sub));
  const evName = (k: string | null) => { const e = k ? eventById(k) : undefined; return e ? `${e.title} · ${label(e.city)}` : label(k); };
  main.replaceChildren(
    h('div.h', {}, h('h1', {}, 'Gameplay & retention'), h('p', {}, `New devices in the last ${days} days and what they came back to do.`)),
    h('div.kpis', {}, kpi('Day 1 return', pct(tot.d1, tot.n), `${fmt(tot.d1)} of ${fmt(tot.n)} new devices`, true), kpi('Day 2–7 return', pct(tot.d7, tot.n), 'came back in the first week'),
      kpi('Day 8–30 return', pct(tot.d30, tot.n), 'still playing after a week'), kpi('Police', `${fmt(g.police.escaped)} / ${fmt(g.police.caught)}`, `escaped / caught · ${fmt(g.passengers)} passengers carried`)),
    h('div.panel', {}, h('h3', {}, 'Retention by first day', h('em', {}, 'share of that day’s new devices')),
      g.cohorts.length ? h('div.scroll', {}, h('table.coh', {}, h('thead', {}, h('tr', {}, ...['First day', 'New', 'Day 1', 'Days 2–7', 'Days 8–30'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...g.cohorts.map((c) => h('tr', {}, h('td', {}, c.day), h('td.num', {}, fmt(c.n)),
          ...[c.d1, c.d7, c.d30].map((v) => h('td.num', { style: `background:rgba(229,56,59,${c.n ? (v / c.n) * 0.8 : 0})` }, pct(v, c.n)))))))) : h('div.empty', {}, 'No data yet')),
    h('div.grid', {},
      h('div.panel', {}, h('h3', {}, 'Career events', h('em', {}, 'finished · avg stars · pass rate')),
        g.events.length ? h('div.scroll', {}, h('table', {}, h('tbody', {}, ...g.events.map((e) => h('tr', {}, h('td', {}, evName(e.k)), h('td.num', {}, fmt(e.n)), h('td.num', {}, `${e.stars ?? 0}★`), h('td.num', {}, `${e.pass ?? 0}%`)))))) : h('div.empty', {}, 'No data yet')),
      h('div', { style: 'display:grid;gap:16px' },
        h('div.panel', {}, h('h3', {}, 'Event types', h('em', {}, 'finished')), bars(g.types)),
        h('div.panel', {}, h('h3', {}, 'Music stations', h('em', {}, 'picked')), bars(g.stations)))),
    h('div.panel', {}, h('h3', {}, 'Player levels', h('em', {}, 'synced devices')), bars(g.levels.map((l) => ({ k: `Level ${l.k}`, n: l.n })))),
  );
}

// ── live config ─────────────────────────────────────────────────────────────
interface StationCfg { id: string; name: string; desc: string; url: string }
function config(main: HTMLElement, cfg: Record<string, unknown>) {
  const stations: StationCfg[] = (Array.isArray(cfg.stations) ? cfg.stations : live.stations).map((s: StationCfg) => ({ ...s }));
  for (const d of live.stations) if (!stations.find((s) => s.id === d.id)) stations.push({ ...d });
  const weekly = h<HTMLSelectElement>('select.in', {}, ...EVENTS.map((e) => h('option', { value: e.id, ...(e.id === (cfg.weeklyEvent ?? live.weeklyEvent) ? { selected: 'selected' } : {}) }, `${label(e.city)} · ${e.title}`)));
  const mult = h<HTMLSelectElement>('select.in', {}, ...[1, 1.5, 2, 3].map((m) => h('option', { value: String(m), ...(m === (cfg.coinMultiplier ?? 1) ? { selected: 'selected' } : {}) }, `×${m}`)));
  const message = h<HTMLInputElement>('input.in', { value: String(cfg.message ?? ''), maxlength: '140', placeholder: 'e.g. Double coins this weekend!' });
  const msg = h('div.msg');
  const list = h('div.stlist');
  const draw = () => list.replaceChildren(...stations.map((s, i) => {
    const name = h<HTMLInputElement>('input.in', { value: s.name, placeholder: 'Name' });
    const desc = h<HTMLInputElement>('input.in', { value: s.desc, placeholder: 'Short description' });
    const url = h<HTMLInputElement>('input.in', { value: s.url, placeholder: 'YouTube playlist or video link' });
    name.oninput = () => (s.name = name.value); desc.oninput = () => (s.desc = desc.value); url.oninput = () => (s.url = url.value.trim());
    return h('div.strow', {}, name, desc, url, i >= live.stations.length ? h('button.btn.ghost.sm', { onclick: () => { stations.splice(i, 1); draw(); } }, 'Remove') : h('span'));
  }));
  draw();
  const save = h<HTMLButtonElement>('button.btn.primary', { onclick: async () => {
    save.disabled = true; msg.textContent = 'Saving…'; msg.className = 'msg';
    const vals: [string, unknown][] = [['stations', stations.filter((s) => s.name.trim())], ['weeklyEvent', weekly.value], ['coinMultiplier', +mult.value], ['message', message.value.trim()]];
    for (const [k, v] of vals) {
      const { error } = await supabase.rpc('picco_admin_set_config', { p_key: k, p_value: v });
      if (error) { save.disabled = false; msg.textContent = error.message; msg.className = 'msg err'; return; }
    }
    save.disabled = false; msg.textContent = 'Saved. Players get the changes next time they open the game.';
  } }, 'Save and publish');
  main.replaceChildren(
    h('div.h', {}, h('h1', {}, 'Live config'), h('p', {}, 'Changes reach every player without a new release.')),
    h('div.panel.form', {}, h('h3', {}, 'This week'),
      h('label', {}, 'Featured event (double rewards)', weekly), h('label', {}, 'Coin multiplier for all drives', mult), h('label', {}, 'Home screen message', message)),
    h('div.panel.form', {}, h('h3', {}, 'Music stations', h('em', {}, 'YouTube playlists shown in the in-game music sheet')), list,
      h('button.btn.ghost.sm', { onclick: () => { stations.push({ id: `s${Date.now().toString(36)}`, name: '', desc: '', url: '' }); draw(); } }, 'Add a station')),
    h('div.savebar', {}, save, msg));
}

function render(main: HTMLElement, s: Stats) {
  const conv = s.visitors ? Math.round((s.players / s.visitors) * 100) : 0;
  const kpi = (t: string, v: string, sub: string, hi = false) => h(`div.kpi${hi ? '.hi' : ''}`, {}, h('span', {}, t), h('b.num', {}, v), h('small', {}, sub));
  const range = days === 1 ? 'today' : `last ${days} days`;
  main.replaceChildren(
    h('div.h', {}, h('h1', {}, 'Overview'), h('p', {}, `Unique devices, ${range}. Updated ${new Date().toLocaleTimeString()}`)),
    h('div.kpis', {},
      kpi('Visitors', fmt(s.visitors), `${fmt(s.all_time_visitors)} all time`, true),
      kpi('Players', fmt(s.players), `${conv}% of visitors drove · ${fmt(s.all_time_players)} all time`),
      kpi('Drives', fmt(s.drives), `${fmt(s.finished)} finished · ${fmt(s.drive_minutes)} min driven`),
      kpi('Avg. session', `${s.avg_session_min} min`, `${fmt(s.sessions)} sessions · ${fmt(s.km)} km driven`)),
    h('div.grid', {},
      h('div.panel', {}, h('h3', {}, 'Daily activity', h('span.legend', {}, h('span', {}, h('i', { style: 'background:#5b8cff' }), 'Visitors'), h('span', {}, h('i', { style: 'background:#e5383b' }), 'Players'))), lineChart(s.daily)),
      h('div.panel', {}, h('h3', {}, 'Player journey', h('em', {}, 'unique devices')), funnel(s.funnel))),
    h('div.grid3', {},
      h('div.panel', {}, h('h3', {}, 'Cities driven', h('em', {}, 'drives')), bars(s.cities)),
      h('div.panel', {}, h('h3', {}, 'Vehicles', h('em', {}, 'drives')), bars(s.vehicles)),
      h('div.panel', {}, h('h3', {}, 'Modes', h('em', {}, 'drives')), bars(s.modes))),
    h('div.grid3', {},
      h('div.panel', {}, h('h3', {}, 'Devices'), bars(s.devices)),
      h('div.panel', {}, h('h3', {}, 'Operating system'), bars(s.os)),
      h('div.panel', {}, h('h3', {}, 'Time zones', h('em', {}, 'approx. location')), bars(s.timezones))),
    h('div.grid', {},
      h('div.panel', {}, h('h3', {}, 'Busiest hours', h('em', {}, 'Sri Lanka time')), heat(s.hours)),
      h('div.panel', {}, h('h3', {}, 'Where visitors come from'), bars(s.referrers))),
    h('div.panel', {}, h('h3', {}, 'Recent activity', h('em', {}, 'latest 40 events')), recent(s.recent)),
  );
}

function bars(rows: KV[]) {
  if (!rows.length) return h('div.empty', {}, 'No data yet');
  const max = Math.max(...rows.map((r) => r.n));
  const el = h('div.bars', {}, ...rows.slice(0, 8).map((r) => h('div.bar', {}, h('span', {}, label(r.k)), h('div.t', {}, h('i', { style: 'width:0' })), h('b.num', {}, fmt(r.n)))));
  requestAnimationFrame(() => el.querySelectorAll<HTMLElement>('.t i').forEach((i, k) => (i.style.width = `${(rows[k].n / max) * 100}%`)));
  return el;
}

function funnel(f: number[]) {
  const steps = ['Opened site', 'Opened garage', 'Picked a city', 'Started a drive', 'Finished a drive'];
  const top = Math.max(1, f[0]);
  const el = h('div.funnel', {}, ...steps.map((t, i) => h('div.fstep', {}, h('span', {}, t), h('div.t', {}, h('i', { style: 'width:0' })),
    h('b.num', {}, fmt(f[i] ?? 0), h('small', {}, `${Math.round(((f[i] ?? 0) / top) * 100)}%`)))));
  requestAnimationFrame(() => el.querySelectorAll<HTMLElement>('.t i').forEach((i, k) => (i.style.width = `${((f[k] ?? 0) / top) * 100}%`)));
  return el;
}

function heat(hours: number[]) {
  const max = Math.max(1, ...hours);
  return h('div', {}, h('div.heat', {}, ...hours.map((n, i) => h('i', { title: `${i}:00 · ${n}`, style: `opacity:${0.08 + (n / max) * 0.92}` }))),
    h('div.heatx', {}, h('span', {}, '00'), h('span', {}, '06'), h('span', {}, '12'), h('span', {}, '18'), h('span', {}, '23')));
}

function lineChart(daily: Stats['daily']) {
  const W = 640, H = 220, P = { l: 30, r: 10, t: 10, b: 24 };
  const n = daily.length, max = Math.max(4, ...daily.map((d) => d.visitors));
  const x = (i: number) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i / (n - 1)) * (W - P.l - P.r));
  const y = (v: number) => H - P.b - (v / max) * (H - P.t - P.b);
  const path = (key: 'visitors' | 'players') => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join('');
  const area = (key: 'visitors' | 'players') => `${path(key)}L${x(n - 1)} ${H - P.b}L${x(0)} ${H - P.b}Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const every = Math.max(1, Math.ceil(n / 6));
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity=".3"/><stop offset="1" stop-color="#5b8cff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5383b" stop-opacity=".35"/><stop offset="1" stop-color="#e5383b" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.07)"/><text x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    <path d="${area('visitors')}" fill="url(#gv)"/><path d="${path('visitors')}" fill="none" stroke="#5b8cff" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <path d="${area('players')}" fill="url(#gp)"/><path d="${path('players')}" fill="none" stroke="#e5383b" stroke-width="2" vector-effect="non-scaling-stroke"/>
    ${daily.map((d, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${d.day.slice(5)}</text>` : '')).join('')}
    ${daily.map((_, i) => `<rect data-i="${i}" x="${x(i) - (W - P.l - P.r) / Math.max(1, n) / 2}" y="0" width="${(W - P.l - P.r) / Math.max(1, n)}" height="${H}" fill="transparent"/>`).join('')}
  </svg>`;
  const el = h('div', { html: svg });
  el.addEventListener('pointermove', (e) => {
    const r = (e.target as Element).closest('rect'), tip = document.getElementById('tip')!;
    if (!r) { tip.style.display = 'none'; return; }
    const d = daily[+r.getAttribute('data-i')!];
    tip.innerHTML = `<b>${d.day}</b>${d.visitors} visitors · ${d.players} players · ${d.drives} drives`;
    tip.style.display = 'block'; tip.style.left = `${(e as PointerEvent).clientX + 12}px`; tip.style.top = `${(e as PointerEvent).clientY + 12}px`;
  });
  el.addEventListener('pointerleave', () => { document.getElementById('tip')!.style.display = 'none'; });
  return el;
}

function recent(rows: Stats['recent']) {
  if (!rows.length) return h('div.empty', {}, 'No activity yet');
  const detail = (r: Stats['recent'][number]) => {
    const p = r.props;
    if (r.type === 'drive_start') return `${label(p.vehicle as string)} · ${label(p.city as string)} · ${label(p.mode as string)}`;
    if (r.type === 'drive_end') return `${label(p.mode as string)} · ${label(p.city as string)} · ${p.km} km · ${p.time}s${p.stars != null ? ` · ${p.stars}★` : ''}${p.position ? ` · P${p.position}` : ''}`;
    if (r.type === 'music') return String(p.station ?? '');
    if (r.type === 'upgrade') return `${label(p.vehicle as string)} ${p.part} → level ${p.level}`;
    if (r.type === 'vehicle') return label(p.vehicle as string);
    if (r.type === 'city') return label(p.city as string);
    if (r.type === 'visit') return `${p.path ?? '/'} · ${p.w}×${p.h}`;
    return '';
  };
  return h('div.scroll', {}, h('table', {}, h('thead', {}, h('tr', {}, ...['When', 'Event', 'Details', 'Device', 'Visitor'].map((t) => h('th', {}, t)))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', {}, ago(r.created_at)), h('td', {}, h('span', { class: `pill ${r.type}` }, label(r.type))), h('td', {}, detail(r)),
      h('td', {}, `${r.device ?? ''} · ${r.os ?? ''}`), h('td.num', {}, r.visitor.slice(0, 6)))))));
}

// ── boot ────────────────────────────────────────────────────────────────────
let recovering = /type=recovery/.test(location.hash);
supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { recovering = true; showLogin('', true); } });

async function boot() {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (recovering && s) return showLogin('', true);
  if (!s) return showLogin();
  if ((s.user.email ?? '').toLowerCase() !== ADMIN_EMAIL) {
    await supabase.auth.signOut();
    return showLogin(`${s.user.email} does not have admin access.`);
  }
  void showDashboard(s);
}
void boot();
