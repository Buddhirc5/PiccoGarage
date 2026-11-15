import { CITIES, VEHICLES } from '../game/data';
import { btn, h, mount } from './dom';
import { icon } from './icons';

export function wordmark(): HTMLElement {
  return h('div.wordmark', {}, h('i'), 'Picco Garage');
}

const STUDIO: Record<string, string> = { pbus: '/assets/img/studio_pbus.webp', sltb: '/assets/img/studio_sltb.webp', tuk: '/assets/img/studio_tuk.webp' };

export function showLanding(onPlay: () => void): void {
  const play = (kind: string) => btn(kind, 'Play now', onPlay, 'right', true);
  const nav = h('header.nav', {},
    wordmark(),
    h('nav.links', {}, h('a', { href: '#features' }, 'Features'), h('a', { href: '#fleet' }, 'Fleet'), h('a', { href: '#cities' }, 'Cities'), h('a', { href: '#music' }, 'Music')),
    h('div.spacer'),
    btn('white sm', 'Play', onPlay),
  );
  const bg = h('div.hero-bg');
  const hero = h('section.hero', {}, bg,
    h('div.hero-in', {},
      h('div.eyebrow', {}, 'Sri Lankan driving, in your browser'),
      h('h1', { html: 'Own the <em>island roads.</em>' }),
      h('p', {}, 'Take the wheel of a private coach, a red route bus or a three-wheeler. Tune it in your garage, pick a city and drive: overtake, race, sound the horn.'),
      h('div.cta', {}, play('primary lg'), h('a.btn.ghost.lg', { href: '#features' }, 'See what is inside')),
      h('div.meta', {},
        h('div', {}, h('b', {}, String(VEHICLES.length)), h('span', {}, 'Vehicles to drive')),
        h('div', {}, h('b', {}, String(CITIES.length)), h('span', {}, 'Sri Lankan cities')),
        h('div', {}, h('b', {}, 'Free'), h('span', {}, 'No download, play as guest')),
      ),
    ),
  );

  const feature = (ic: string, title: string, body: string, d: number) =>
    h('div.card.reveal', { style: `--d:${d}s` }, h('div.ic', {}, icon(ic, 22)), h('h3', {}, title), h('p', {}, body));
  const features = h('section.sec', { id: 'features' },
    h('div.sec-head.reveal', {}, h('div.eyebrow', {}, 'The game'), h('h2', {}, 'Everything a road needs.'), h('p', {}, 'A full driving game built for phones. Open the link, tap play, drive.')),
    h('div.feat', {},
      feature('wheel', 'Real driving feel', 'Accelerate, brake, reverse and steer with on-screen pedals and wheel, or a keyboard. Three camera views.', 0),
      feature('wrench', 'Garage upgrades', 'Repaint your ride, add underglow, and upgrade engine, brakes and tyres with coins you earn.', 0.06),
      feature('flag', 'Free ride or race', 'Cruise with no timer and earn for clean overtakes, or line up against three rivals for a lap.', 0.12),
      feature('horn', 'Your horn, your music', 'Pick a horn or load your own sound. Play your YouTube playlist while you drive.', 0.18),
    ),
  );

  const fleet = h('section.sec', { id: 'fleet' },
    h('div.sec-head.reveal', {}, h('div.eyebrow', {}, 'The fleet'), h('h2', {}, 'Three ways to rule the road.')),
    h('div.fleet', {}, ...VEHICLES.map((v, i) => h('article.v.reveal', { style: `--d:${i * 0.08}s` },
      h('div.ph', {}, h('img', { src: STUDIO[v.id], alt: v.name, loading: 'lazy' })),
      h('div.tx', {}, h('h3', {}, v.name), h('p', {}, v.tagline),
        h('div.specs', {}, h('div', {}, h('b', {}, `${v.topSpeed}`), 'km/h top'), h('div', {}, h('b', {}, `${v.length} m`), 'length'), h('div', {}, h('b', {}, v.tintable ? 'Yes' : 'Fixed'), 'repaint'))),
    ))),
  );

  const cityCard = (c: (typeof CITIES)[number]) => h('button.city', { style: `background-image:url(${c.image})`, onclick: onPlay },
    h('span.chip.km', {}, `${c.km} km loop`),
    h('div.tx', {}, h('span', {}, c.region), h('b', {}, c.name), h('p', {}, c.blurb)));
  const cities = h('section.sec', { id: 'cities' },
    h('div.sec-head.reveal', {}, h('div.eyebrow', {}, 'The map'), h('h2', {}, 'Five cities. One island.'), h('p', {}, 'From Colombo traffic to the Galle coast and the sacred city of Anuradhapura. More towns are on the way.')),
    h('div.rail.reveal', {}, ...CITIES.map(cityCard)),
  );

  const music = h('section.sec', { id: 'music' },
    h('div.split', {},
      h('div.big.reveal', {}, h('div.eyebrow', { style: 'color:#ffb9a8' }, 'Sound'), h('h3', {}, 'Drive to your own soundtrack.'),
        h('p', {}, 'Paste a YouTube playlist and it plays in a small player while you drive. The engine note rises with your speed, and the horn is yours to choose.')),
      h('div.col', {},
        h('div.mini.reveal', { style: '--d:.08s' }, h('h3', {}, icon('upload', 20), 'Bring your own horn'), h('p', {}, 'Load any short sound from your phone in the garage and use it as your horn.')),
        h('div.mini.reveal', { style: '--d:.16s' }, h('h3', {}, icon('trophy', 20), 'Progress that stays'), h('p', {}, 'Coins, upgrades, distance and best lap times are saved on your device. Sign-in and leaderboards are coming.')),
      ),
    ),
  );

  const final = h('section.final.reveal', {}, h('h2', {}, 'The road is waiting.'), play('primary lg'));
  const foot = h('footer.foot', {}, wordmark(), h('div.spacer'),
    h('a', { href: '/privacy.html', target: '_blank' }, 'Privacy'), h('a', { href: '/terms.html', target: '_blank' }, 'Terms'), h('a', { href: '/credits.html', target: '_blank' }, 'Credits'),
    h('span', {}, 'All vehicles and places are generic or fictional depictions.'));

  const page = h('div.screen.landing', {}, nav, hero, features, fleet, cities, music, final, foot);
  page.addEventListener('scroll', () => {
    nav.classList.toggle('solid', page.scrollTop > 40);
    if (page.scrollTop < window.innerHeight) bg.style.translate = `0 ${page.scrollTop * 0.25}px`;
  }, { passive: true });
  mount(page);
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root: page, threshold: 0.12 });
  page.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
