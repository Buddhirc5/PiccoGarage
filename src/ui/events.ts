import { ui as sfx, fx } from '../core/audio';
import { live } from '../core/live';
import { TYPE_INFO, eventById } from '../game/career';
import { CITIES, type TimeOfDay, type Weather } from '../game/data';
import { DAILY, challengeLabel, challenges, claimDaily, dailyState, progress, save } from '../game/progress';
import { fmtNum, h, toast } from './dom';
import { icon } from './icons';
import { nav, shell } from './nav';

/** Events: daily reward, daily challenges, weekly event and free roam setup. */
export let freeTime: TimeOfDay = 'day';
export let freeWeather: Weather = 'clear';

export function showEvents(): void {
  const d = dailyState();
  const days = h('div.days', {}, ...DAILY.map((r, i) => {
    const got = i < d.streak % 7 || (!d.canClaim && i === (d.streak - 1) % 7);
    const today = d.canClaim && i === d.streak % 7;
    return h('div', { class: `day${got ? ' got' : ''}${today ? ' today' : ''}` }, h('span', {}, `Day ${i + 1}`), icon(r.gems ? 'gem' : 'coin', 18), h('b', {}, r.gems ? `${r.gems}` : fmtNum(r.coins)), got ? h('i.ck', {}, icon('check', 12)) : null);
  }));
  const claim = h<HTMLButtonElement>('button', { class: `cta${d.canClaim ? '' : ' off'}`, disabled: d.canClaim ? undefined : true, onclick: () => {
    const r = claimDaily();
    if (!r) return;
    fx.levelUp(); toast(`Claimed ${fmtNum(r.coins)} coins${r.gems ? ` and ${r.gems} gems` : ''}`);
    showEvents();
  } }, h('span', {}, d.canClaim ? 'Claim today’s reward' : 'Come back tomorrow'), h('i', {}, icon(d.canClaim ? 'gift' : 'check', 20)));

  const ch = challenges();
  const chList = h('div.chal', {}, ...ch.map((c) => h('div', { class: `cl${c.done ? ' done' : ''}` },
    h('div.cl-t', {}, h('b', {}, challengeLabel(c)), h('span', {}, c.done ? 'Done' : `${fmtNum(c.have)} / ${fmtNum(c.goal)}`)),
    h('div.bar2', {}, h('i', { style: `width:${Math.min(100, (c.have / c.goal) * 100)}%` })),
    h('span.cl-r', {}, icon('coin', 13), fmtNum(c.reward)))));

  const weekly = eventById(live.weeklyEvent);
  const cityChips = h('div.chips2', {});
  const drawCities = () => cityChips.replaceChildren(...CITIES.map((c) => h('button', { class: `cchip${progress.freeCity === c.id ? ' on' : ''}`, style: `--img:url(${c.image})`, onclick: () => { progress.freeCity = c.id; save(); sfx.tap(); drawCities(); } }, h('b', {}, c.name))));
  drawCities();
  const pick = <T extends string>(opts: [T, string, string][], get: () => T, set: (v: T) => void) => {
    const s = h('div.segm.wide');
    const draw = () => s.replaceChildren(...opts.map(([v, l, ic]) => h('button', { class: get() === v ? 'on' : '', onclick: () => { set(v); sfx.tap(); draw(); } }, icon(ic, 15), l)));
    draw(); return s;
  };

  shell('events', h('div.events', {},
    h('h1.pg', {}, 'Events'),
    h('section.card2', {}, h('div.c2h', {}, icon('gift', 18), h('b', {}, 'Daily reward'), h('span', {}, `Streak ${d.streak} day${d.streak === 1 ? '' : 's'}`)), days, claim),
    h('section.card2', {}, h('div.c2h', {}, icon('target', 18), h('b', {}, 'Daily challenges'), h('span', {}, 'Resets at midnight')), chList),
    weekly ? h('button.evcard', { style: `--img:url(${CITIES.find((c) => c.id === weekly.city)!.image})`, onclick: () => nav.prerace(weekly.id) },
      h('div.evtop', {}, h('span.tag', {}, icon('trophy', 14), 'Weekly event'), h('span.tag.boss', {}, '2× rewards')),
      h('div.evbot', {}, h('span.kick', {}, TYPE_INFO[weekly.type].name), h('b', {}, weekly.title), h('div.evgo', {}, h('span', {}, icon('coin', 14), fmtNum(weekly.reward.coins * 2)), h('i', {}, icon('play', 18))))) : null,
    h('section.card2', {}, h('div.c2h', {}, icon('road', 18), h('b', {}, 'Free roam'), h('span', {}, 'No timer')), cityChips,
      pick([['day', 'Day', 'sun'], ['dusk', 'Dusk', 'sunset'], ['night', 'Night', 'moon']], () => freeTime, (v) => { freeTime = v; }),
      pick([['clear', 'Clear', 'cloud'], ['rain', 'Rain', 'rain']], () => freeWeather, (v) => { freeWeather = v; }),
      h('button.cta', { onclick: () => nav.free(progress.freeCity) }, h('span', {}, 'Start free roam'), h('i', {}, icon('right', 20)))),
  ));
}
