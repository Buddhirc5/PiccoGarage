import { ui as sfx } from '../core/audio';
import { live } from '../core/live';
import { setStage } from '../core/renderer';
import { TYPE_INFO, eventById } from '../game/career';
import { city, vehicle } from '../game/data';
import { challenges, dailyState, nextEvent, progress } from '../game/progress';
import { h } from './dom';
import { icon } from './icons';
import { nav, shell, vehicleBadge } from './nav';
import { showroom } from './showroom';

const stars = (n: number, of = 3) => h('span.stars', { 'aria-label': `${n} of ${of} stars` }, ...Array.from({ length: of }, (_, i) => h('i', { class: i < n ? 'on' : '' }, icon('star', 13))));
export { stars };

export function showHome(): void {
  const v = vehicle(progress.vehicle);
  const next = nextEvent();
  const ti = TYPE_INFO[next.type];
  const d = dailyState();
  const ch = challenges();
  const doneCh = ch.filter((c) => c.done).length;
  const weekly = eventById(live.weeklyEvent);

  const backdrop = h('div.gbg', {}, h('div.giant', { 'aria-hidden': 'true', style: `font-size:${Math.min(40, 92 / (v.big.length * 0.46))}cqw` }, v.big), h('div.halo'));
  const content = h('div.home', {},
    live.message ? h('div.banner', {}, icon('info', 16), live.message) : null,
    h('div.stagearea', { onclick: () => nav.tab('garage') }),
    h('div.vrow', {}, h('div', {}, h('h2', {}, v.name), vehicleBadge()), h('button.pbtn.sm', { onclick: () => { sfx.tap(); nav.tab('garage'); } }, icon('wrench', 15), 'Garage')),
    h('button.evcard.big', { style: `--img:url(${city(next.city).image})`, onclick: () => { sfx.select(); nav.prerace(next.id); } },
      h('div.evtop', {}, h('span.tag', {}, icon(ti.icon, 14), ti.name), next.boss ? h('span.tag.boss', {}, 'BOSS') : null, h('div.spacer'), stars(progress.stars[next.id] ?? 0)),
      h('div.evbot', {}, h('span.kick', {}, 'Continue career'), h('b', {}, next.title), h('div.evgo', {}, h('span', {}, icon('coin', 14), `${next.reward.coins.toLocaleString()}`), h('i', {}, icon('play', 18))))),
    h('div.tiles2', {},
      h('button.tile2', { style: `--img:url(${city(progress.freeCity).image})`, onclick: () => { sfx.select(); nav.free(progress.freeCity); } }, h('span.tag', {}, icon('road', 14), 'Free Roam'), h('b', {}, city(progress.freeCity).name), h('small', {}, 'Drive, drift, roam')),
      h('button.tile2.plain', { onclick: () => nav.tab('events') }, d.canClaim ? h('span.dot') : null, icon('gift', 26), h('b', {}, d.canClaim ? 'Daily reward' : 'Challenges'), h('small', {}, d.canClaim ? 'Ready to claim' : `${doneCh} of ${ch.length} done today`)),
    ),
    weekly ? h('button.weekly', { onclick: () => nav.prerace(weekly.id) }, icon('trophy', 20), h('div', {}, h('b', {}, 'Weekly event · double rewards'), h('span', {}, weekly.title)), icon('chevR', 18)) : null,
  );
  shell('home', content, { stage: true, backdrop });
  const room = showroom();
  setStage(room);
  room.show(progress.vehicle);
}
