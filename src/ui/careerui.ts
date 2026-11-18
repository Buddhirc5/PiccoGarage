import { ui as sfx } from '../core/audio';
import { EVENTS, TYPE_INFO, chapterStarsNeeded } from '../game/career';
import { CITIES } from '../game/data';
import { chapterStars, chapterUnlocked, eventUnlocked, nextEvent, progress, totalStars } from '../game/progress';
import { h, toast } from './dom';
import { stars } from './home';
import { icon } from './icons';
import { nav, shell } from './nav';

/** Career: chapter cards across the top, the chapter's event route below. */
let chapter = -1;

export function showCareer(arg?: string): void {
  if (arg !== undefined) chapter = +arg;
  if (chapter < 0) chapter = nextEvent().chapter;
  const total = totalStars();
  const chips = h('div.chapters', {}, ...CITIES.map((c, ch) => {
    const open = chapterUnlocked(ch), got = chapterStars(ch);
    return h('button', { class: `chap${ch === chapter ? ' on' : ''}${open ? '' : ' locked'}`, style: `--img:url(${c.image})`, onclick: () => { sfx.select(); chapter = ch; showCareer(); } },
      h('span.cn', {}, `Chapter ${ch + 1}`), h('b', {}, c.name),
      open ? h('span.cs', {}, icon('star', 12), `${got} / 21`) : h('span.cs', {}, icon('lock', 12), `${chapterStarsNeeded(ch)} stars`));
  }));
  const evs = EVENTS.filter((e) => e.chapter === chapter);
  const open = chapterUnlocked(chapter);
  const list = h('div.croute', {}, ...evs.map((e, i) => {
    const un = eventUnlocked(e), st = progress.stars[e.id] ?? 0, ti = TYPE_INFO[e.type];
    return h('button', { class: `node${un ? '' : ' locked'}${e.boss ? ' boss' : ''}${st ? ' done' : ''}`, style: `--i:${i}`, onclick: () => {
      if (!un) { sfx.deny(); toast(open ? 'Earn a star in the previous event first.' : `Collect ${chapterStarsNeeded(chapter)} stars to open this chapter.`); return; }
      sfx.select(); nav.prerace(e.id);
    } },
      h('i.nic', {}, icon(un ? ti.icon : 'lock', 20)),
      h('div.ntx', {}, h('span', {}, `${ti.name}${e.kind !== 'any' ? ` · ${e.kind === 'bus' ? 'Bus' : 'Three-wheeler'}` : ''}${e.weather === 'rain' ? ' · Rain' : ''}${e.time === 'night' ? ' · Night' : e.time === 'dusk' ? ' · Dusk' : ''}`), h('b', {}, e.boss ? `Boss: ${e.boss}` : e.title.replace(/^\S+ /, '')),
        h('small', {}, icon('coin', 12), e.reward.coins.toLocaleString(), e.reward.gems ? h('em', {}, icon('gem', 12), String(e.reward.gems)) : null, h('em', {}, `PR ${e.minPR}`))),
      stars(st));
  }));
  shell('career', h('div.career', {},
    h('div.ch-head', {}, h('h1', {}, 'Career'), h('span.tag', {}, icon('star', 14), `${total} / ${EVENTS.length * 3}`)),
    chips, list));
  document.querySelector('.chap.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
