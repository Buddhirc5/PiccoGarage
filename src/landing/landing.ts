import { lang, setLang, t, type Lang } from '../i18n';
import { GOOGLE_ICON, btn, h, mount } from '../ui/dom';

export function langSwitch(): HTMLElement {
  const seg = h('div.seg', { role: 'group', 'aria-label': 'Language' });
  const render = () => {
    seg.replaceChildren(
      ...(['en', 'si'] as Lang[]).map((l) =>
        h('button', { class: lang() === l ? 'on' : '', onclick: () => { setLang(l); render(); } }, t(`lang.${l}`)),
      ),
    );
  };
  render();
  return seg;
}

export interface LandingOpts {
  screenshots: string[];
  onGoogle(): void;
  onGuest(): void;
  busy?: boolean;
}

/** Landing page shown before sign-in. The live 3D trailer plays behind it. */
export function showLanding(o: LandingOpts): void {
  const google = btn('btn-google', 'landing.play_google', o.onGoogle);
  google.insertAdjacentHTML('afterbegin', GOOGLE_ICON);
  google.id = 'google-btn';
  if (o.busy) google.disabled = true;

  const shots = h('div.shots', {},
    ...o.screenshots.map((src, i) => h('figure', {}, h('img', { src, alt: `Picco Garage screenshot ${i + 1}`, loading: 'lazy' }))),
  );

  const screen = h('div.screen.scroll.landing', {},
    h('div.landing-top', {},
      h('div.spacer'),
      langSwitch(),
    ),
    h('section.landing-hero', {},
      h('h1.title-logo', {}, 'Picco Garage', h('small', {}, 'පිකෝ ගරාජ්')),
      h('p.tagline', { i18n: 'app.tagline' }),
      h('div.cta', {},
        google,
        btn('btn-ghost btn-sm', 'landing.play_guest', o.onGuest),
        h('div.note', { i18n: 'landing.guest_note' }),
      ),
      h('div.consent', {},
        h('span', { i18n: 'landing.privacy.agree' }), ' ',
        h('a', { href: '/privacy.html', target: '_blank', i18n: 'landing.privacy_link' }), ' ',
        h('span', { i18n: 'landing.and' }), ' ',
        h('a', { href: '/terms.html', target: '_blank', i18n: 'landing.terms_link' }), '.',
      ),
      h('div.scroll-hint', {}, '▾ ', h('span', { i18n: 'landing.mobile_hint' })),
    ),
    h('section.landing-section', {},
      h('div.features', {},
        feature('🛺', 'landing.feature1'),
        feature('🌴', 'landing.feature2'),
        feature('🏁', 'landing.feature3'),
      ),
    ),
    h('section.landing-section', {}, h('h2', { i18n: 'landing.screens' }), shots),
    h('section.landing-section.privacy', { id: 'privacy-notice' },
      h('div.card', {},
        h('h2', { i18n: 'landing.privacy.title' }),
        h('p', { i18n: 'landing.privacy.body' }),
      ),
    ),
    h('footer.footer', {},
      h('a', { href: '/privacy.html', target: '_blank', i18n: 'landing.privacy_link' }),
      h('a', { href: '/terms.html', target: '_blank', i18n: 'landing.terms_link' }),
      h('a', { href: '/credits.html', target: '_blank', i18n: 'settings.credits' }),
      h('span', {}, '© Picco Garage'),
    ),
  );
  mount(screen);
}

function feature(icon: string, key: string): HTMLElement {
  return h('div.card.feature', {},
    h('div.ico', { 'aria-hidden': 'true' }, icon),
    h('h3', { i18n: `${key}.title` }),
    h('p', { i18n: `${key}.body` }),
  );
}
