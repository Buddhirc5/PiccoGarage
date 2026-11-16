import './admin.css';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../auth/supabase';

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
const NAMES: Record<string, string> = { pbus: 'Private Coach', sltb: 'Red Route Bus', tuk: 'Three-Wheeler', pink: 'Pink Queen', free: 'Free ride', race: 'Race',
  colombo: 'Colombo', galle: 'Galle', anuradhapura: 'Anuradhapura', kottawa: 'Kottawa', pannipitiya: 'Pannipitiya',
  phone: 'Phone', desktop: 'Desktop', tablet: 'Tablet', direct: 'Direct', drive_start: 'Drive start', drive_end: 'Drive end', visit: 'Visit', upgrade: 'Upgrade', vehicle: 'Vehicle', city: 'City', garage: 'Garage', music: 'Music', camera: 'Camera' };
const label = (k: string | null) => (k ? NAMES[k] ?? k.replace(/_/g, ' ') : 'unknown');

let days = 30, timer = 0;

async function showDashboard(session: Session) {
  const content = h('main', {}, h('div.skel'), h('div.skel'));
  const live = h('span.live', {}, h('i'), h('span', {}, '—'));
  const seg = h('div.seg', {}, ...[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, t]) =>
    h('button', { class: d === days ? 'on' : '', onclick: (e: Event) => { days = d as number; seg.querySelectorAll('button').forEach((b) => b.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); void load(); } }, String(t))));
  root.replaceChildren(
    h('header.top', {}, brand(), h('div.spacer'), live, seg, h('span.who', {}, session.user.email ?? ''),
      h('button.btn.ghost.sm', { onclick: async () => { await supabase.auth.signOut(); showLogin(); } }, 'Sign out')),
    content, h('div.tip', { id: 'tip' }));

  const load = async () => {
    const { data, error } = await supabase.rpc('picco_admin_stats', { p_days: days });
    if (error) {
      const missing = /function|does not exist|schema cache/i.test(error.message);
      content.replaceChildren(h('div.setup', {}, missing
        ? 'Analytics is not switched on in the database yet. Approve the "picco_analytics" migration in the chat and this dashboard fills in automatically.'
        : error.message === 'not authorised' ? 'This account is signed in but is not on the admin list.' : `Could not load stats: ${error.message}`));
      return;
    }
    const s = data as Stats;
    (live.lastChild as HTMLElement).textContent = `${s.live} online now`;
    render(content, s);
  };
  await load();
  clearInterval(timer);
  timer = window.setInterval(load, 60_000);
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
  const ago = (t: string) => { const s = (Date.now() - new Date(t).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
  const detail = (r: Stats['recent'][number]) => {
    const p = r.props;
    if (r.type === 'drive_start') return `${label(p.vehicle as string)} · ${label(p.city as string)} · ${label(p.mode as string)}`;
    if (r.type === 'drive_end') return `${label(p.city as string)} · ${p.km} km · ${p.time}s · ${p.overtakes ?? 0} overtakes`;
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
