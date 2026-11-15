import { CITIES, VEHICLES } from '../game/data';
import { h, mount } from './dom';
import { icon } from './icons';

export function wordmark(): HTMLElement {
  return h('div.wordmark', {}, h('i'), 'Picco Garage');
}

/** Full-width call to action: label on the left, arrow circle on the right. */
export function cta(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h<HTMLButtonElement>('button', { class: `cta ${cls}`.trim(), type: 'button', onclick: onClick }, h('span', {}, label), h('i', {}, icon('right', 20)));
}

export function showLanding(onPlay: () => void): void {
  const welcome = h('section.welcome', {},
    h('div.giant', { 'aria-hidden': 'true' }, 'PICCO'),
    h('div.glow'),
    h('img.heroimg', { src: '/assets/img/hero_cut.webp', alt: 'A decorated Sri Lankan private bus', fetchpriority: 'high' }),
    h('div.bar', {}, wordmark(), h('div.spacer')),
    h('div.body', {},
      h('h1.title.a', { style: '--i:0', html: 'Own the<br><em>Island</em> Roads' }),
      h('p.sub.a', { style: '--i:1' }, 'Drive real Sri Lankan buses and three-wheelers through five cities, right in your browser.'),
      h('div.a', { style: '--i:2' }, cta('Start your ride', onPlay)),
      h('a.more', { href: '#inside' }, 'See what is inside', icon('chevD', 14)),
    ),
  );

  const feature = (ic: string, title: string, body: string, i: number) =>
    h('div.rowf.rv', { style: `--i:${i}` }, h('div.ic', {}, icon(ic, 20)), h('div', {}, h('b', {}, title), h('span', {}, body)));
  const inside = h('section.sec.first', { id: 'inside' },
    h('div.kicker.rv', {}, 'The game'),
    h('h2.h2.rv', { html: 'Everything a road needs. <em>Nothing to install.</em>' }),
    h('div.rows', {},
      feature('wheel', 'Real driving feel', 'Pedals, steering wheel or buttons. Reverse, handbrake, horn and three cameras.', 0),
      feature('wrench', 'Your garage', 'Repaint, add underglow and upgrade engine, brakes and tyres with coins you earn.', 1),
      feature('flag', 'Free ride or race', 'Cruise and earn for clean overtakes, or race three rivals for a lap.', 2),
      feature('music', 'Your soundtrack', 'Play your YouTube playlist while you drive. Load your own horn sound.', 3),
    ),
  );

  const fleet = h('section.sec', {},
    h('div.kicker.rv', {}, 'The fleet'),
    h('h2.h2.rv', { html: 'Three ways to <em>rule the road.</em>' }),
    h('div.rail', {}, ...VEHICLES.map((v, i) => h('button.vcard', { type: 'button', onclick: onPlay },
      h('div.n', {}, `0${i + 1}`),
      h('div.giant', { 'aria-hidden': 'true' }, v.big),
      h('img', { src: v.cutout, alt: v.name, loading: 'lazy' }),
      h('div.tx', {}, h('b', {}, v.name),
        h('div.stats', {}, h('div', {}, h('span', {}, 'Top speed'), h('b', {}, `${v.topSpeed} km/h`)), h('div', {}, h('span', {}, 'Length'), h('b', {}, `${v.length} m`)))),
    ))),
  );

  const cities = h('section.sec', {},
    h('div.kicker.rv', {}, 'The map'),
    h('h2.h2.rv', { html: 'Five cities. <em>One island.</em>' }),
    h('div.rail', {}, ...CITIES.map((c) => h('button.ccard', { type: 'button', style: `background-image:url(${c.image})`, onclick: onPlay },
      h('span.tag', {}, icon('road', 14), `${c.km} km`),
      h('div.tx', {}, h('span', {}, c.region), h('b', {}, c.name)),
    ))),
  );

  const band = h('section.band.rv', {},
    h('h3', {}, 'The road is waiting.'),
    h('p', {}, 'Free to play. No download. Your progress stays on this device; sign-in and leaderboards are coming.'),
    cta('Play now', onPlay, 'dark'),
  );

  const foot = h('footer.foot', {}, wordmark(), h('div.spacer'),
    h('a', { href: '/privacy.html', target: '_blank' }, 'Privacy'), h('a', { href: '/terms.html', target: '_blank' }, 'Terms'), h('a', { href: '/credits.html', target: '_blank' }, 'Credits'));

  const page = h('div.screen.landing', {}, welcome, inside, fleet, cities, band, foot);
  mount(page);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root: page, threshold: 0.15 });
  page.querySelectorAll('.rv').forEach((el) => io.observe(el));
  // hero parallax
  const img = welcome.querySelector<HTMLElement>('.heroimg')!, giant = welcome.querySelector<HTMLElement>('.giant')!;
  page.addEventListener('scroll', () => {
    const y = page.scrollTop;
    if (y > page.clientHeight) return;
    img.style.translate = `-50% ${y * 0.35}px`;
    giant.style.translate = `-50% ${y * 0.6}px`;
  }, { passive: true });
}
