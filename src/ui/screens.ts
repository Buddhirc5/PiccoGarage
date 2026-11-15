import { createProfile, deleteGameData, signOut, updateProfile } from '../auth/auth';
import { applyPixelRatio } from '../core/renderer';
import { setSfxVolume, ui as sfx } from '../core/audio';
import { saveSettings, settings } from '../core/settings';
import { cacheProfile, isSignedIn, store } from '../core/store';
import { lang, setLang, t } from '../i18n';
import { langSwitch } from '../landing/landing';
import { btn, h, mount, toast } from './dom';

export interface Nav {
  home(): void;
  landing(): void;
  signIn(): void;
}

// ── first-login name setup ──────────────────────────────────────────────────
export function showNameSetup(suggested: string, done: () => void): void {
  const input = h<'input'>('input.input', { maxlength: 20, autocomplete: 'nickname', 'data-i18n-placeholder': 'name.placeholder' });
  input.value = suggested.slice(0, 20);
  const err = h('div.err');
  const save = btn('btn-primary', 'name.save', async () => {
    const name = input.value.trim();
    if (name.length < 2 || name.length > 20) { err.textContent = t('name.error'); sfx.error(); return; }
    save.disabled = true;
    try {
      store.profile = await createProfile(name);
      cacheProfile(store.profile);
      sfx.levelUp();
      done();
    } catch (e) {
      console.error(e);
      err.textContent = t('common.error');
      save.disabled = false;
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  mount(h('div.screen.modal-wrap', {},
    h('div.card.modal', {},
      h('h2', { i18n: 'name.title' }),
      h('p.muted', { i18n: 'name.body' }),
      input,
      err,
      save,
    ),
  ));
  setTimeout(() => input.focus(), 50);
}

// ── home menu ───────────────────────────────────────────────────────────────
export function showHome(nav: Nav): void {
  const p = store.profile;
  const name = p?.display_name ?? t('home.guest');
  const avatar = h('div.avatar', {}, p?.avatar_url ? h('img', { src: p.avatar_url, alt: '', referrerpolicy: 'no-referrer' }) : name.slice(0, 1).toUpperCase());

  const soon = (titleKey: string, icon: string) => () => showSoon(titleKey, icon, nav);
  const menu = h('nav.menu', {},
    btn('btn-primary play', 'home.play', soon('home.play', '🚌'), '▶'),
    btn('btn-ghost', 'home.garage', soon('home.garage', '🔧'), '🔧'),
    btn('btn-ghost', 'home.race', soon('home.race', '🏁'), '🏁'),
    btn('btn-ghost', 'home.shop', soon('home.shop', '🛒'), '🛒'),
    btn('btn-ghost', 'home.leaderboard', soon('home.leaderboard', '🏆'), '🏆'),
    btn('btn-ghost', 'home.settings', () => showSettings(nav), '⚙'),
    btn('btn-ghost', 'home.share', shareGame, '📤'),
  );

  const top = h('div.topbar', {},
    avatar,
    h('div.who', {}, h('b', {}, t('home.welcome', { name }))),
    h('div.spacer'),
    p ? h('div.coins', { title: t('home.coins') }, h('i.coin'), String(p.coins)) : btn('btn-primary btn-sm', 'home.signin', nav.signIn),
  );
  mount(h('div.screen.home', {},
    top,
    h('div.home-main', {}, menu),
    h('div.home-title', {}, h('h1.title-logo', {}, 'Picco Garage', h('small', {}, 'පිකෝ ගරාජ්'))),
  ));
}

// ── settings ────────────────────────────────────────────────────────────────
export function showSettings(nav: Nav): void {
  const body = h('div.settings-grid');
  const slider = (key: 'sound' | 'music') => {
    const r = h<'input'>('input', { type: 'range', min: 0, max: 1, step: 0.05 });
    r.value = String(settings[key]);
    r.addEventListener('input', () => {
      saveSettings({ [key]: Number(r.value) });
      if (key === 'sound') setSfxVolume(Number(r.value));
    });
    r.addEventListener('change', () => sfx.click());
    return r;
  };
  const quality = h('div.seg', {},
    ...(['low', 'medium', 'high'] as const).map((q) =>
      h('button', {
        class: settings.quality === q ? 'on' : '',
        onclick: (e: Event) => {
          saveSettings({ quality: q });
          applyPixelRatio();
          (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          (e.currentTarget as HTMLElement).classList.add('on');
          sfx.click();
        },
        i18n: `settings.quality.${q}`,
      }),
    ),
  );
  const langSeg = langSwitch();
  langSeg.addEventListener('click', () => {
    if (isSignedIn()) updateProfile(store.profile!.display_name, lang()).then((p) => { store.profile = p; cacheProfile(p); }).catch(() => {});
  });

  body.append(
    h('div.card.setting', {}, h('label', { i18n: 'settings.language' }), langSeg),
    h('div.card.setting', {}, h('label', { i18n: 'settings.sound' }), slider('sound')),
    h('div.card.setting', {}, h('label', { i18n: 'settings.music' }), slider('music')),
    h('div.card.setting', {}, h('label', { i18n: 'settings.quality' }), quality),
  );

  if (isSignedIn()) {
    const nameIn = h<'input'>('input.input', { maxlength: 20 });
    nameIn.value = store.profile!.display_name;
    const saveName = btn('btn-primary btn-sm', 'common.save', async () => {
      try {
        store.profile = await updateProfile(nameIn.value, lang());
        cacheProfile(store.profile);
        toast(t('common.saved'));
      } catch { toast(t('name.error')); sfx.error(); }
    });
    body.append(
      h('div.card', {}, h('label', { i18n: 'settings.name' }), h('div.row', { style: 'margin-top:8px' }, nameIn, saveName)),
      h('div.card', {},
        h('label', { i18n: 'settings.account' }),
        h('p.muted', {}, t('settings.signed_in_as', { email: store.session?.user.email ?? '' })),
        h('div.row', {},
          btn('btn-ghost btn-sm', 'settings.logout', async () => { await signOut(); nav.landing(); }),
          btn('btn-red btn-sm', 'settings.delete', async () => {
            if (!confirm(t('settings.delete_confirm'))) return;
            try {
              await deleteGameData();
              cacheProfile(null);
              toast(t('settings.deleted'));
              nav.landing();
            } catch { toast(t('common.error')); }
          }),
        ),
      ),
    );
  } else {
    body.append(h('div.card', {}, btn('btn-primary', 'home.signin', nav.signIn)));
  }
  body.append(h('div.row', {},
    h('a', { href: '/privacy.html', target: '_blank', i18n: 'settings.privacy' }),
    h('a', { href: '/terms.html', target: '_blank', i18n: 'settings.terms' }),
    h('a', { href: '/credits.html', target: '_blank', i18n: 'settings.credits' }),
  ));
  mount(page('settings.title', body, nav));
}

function page(titleKey: string, body: HTMLElement, nav: Nav): HTMLElement {
  return h('div.screen.page', {},
    h('div.page-head', {}, btn('btn-ghost btn-sm', 'common.back', () => { sfx.back(); nav.home(); }, '←'), h('h1', { i18n: titleKey })),
    h('div.page-body', {}, body),
  );
}

export function showSoon(titleKey: string, icon: string, nav: Nav): void {
  mount(page(titleKey, h('div.card.soon', {}, h('div.big', {}, icon), h('p', { i18n: 'common.soon' })), nav));
}

export async function shareGame(): Promise<void> {
  const url = window.location.origin;
  const data = { title: t('share.title'), text: t('share.text'), url };
  sfx.share();
  try {
    if (navigator.share) { await navigator.share(data); return; }
  } catch { /* cancelled */ return; }
  try {
    await navigator.clipboard.writeText(`${data.text} ${url}`);
    toast(t('share.copied'));
  } catch { toast(url); }
}

export { setLang };
